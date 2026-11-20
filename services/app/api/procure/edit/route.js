import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireUser } from '@/lib/auth';
import { getGoogleOAuth2Client } from '@/lib/google-auth';
import { buildOrderFolderName } from '@/lib/order-folder';
import { parseMultipartFormData } from '@/lib/multipart';

const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHEET_TITLE_PATTERN = /^Tháng \d{1,2}\/\d{4}$/;
const HEADERS = [
  'Ngày', 'Kênh mua', 'Mã đơn hàng', 'Tên Shop', 'SKU', 'Hàng hóa',
  'Số lượng', 'Giá gốc', 'Giá thực trả', 'Thanh toán', 'Vận đơn', 'Chứng từ',
];

function jsonError(status, error) {
  return NextResponse.json({ success: false, error }, { status });
}

function monthTitle(isoDate) {
  const [year, month] = isoDate.split('-').map(Number);
  return `Tháng ${month}/${year}`;
}

function toIsoDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value ?? '').trim();
  if (DATE_PATTERN.test(text)) return text;
  const localDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localDate) return `${localDate[3]}-${localDate[2].padStart(2, '0')}-${localDate[1].padStart(2, '0')}`;
  return '';
}

function isValidIsoDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getFolderIdFromLink(value) {
  const match = String(value ?? '').match(/\/folders\/([A-Za-z0-9_-]+)/);
  return match?.[1] ?? '';
}

function asSheetText(value) {
  const text = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function sheetRowToForm(row) {
  return {
    ngay: toIsoDate(row[0]),
    kenhMua: String(row[1] ?? ''),
    maDonHang: String(row[2] ?? ''),
    tenShop: String(row[3] ?? ''),
    sku: String(row[4] ?? ''),
    tenHangHoa: String(row[5] ?? ''),
    soLuong: String(row[6] ?? ''),
    giaGoc: String(row[7] ?? '').replace(/\D/g, ''),
    giaThucTra: String(row[8] ?? '').replace(/\D/g, ''),
    phuongThucThanhToan: String(row[9] ?? ''),
    maVanDon: String(row[10] ?? ''),
  };
}

async function getDriveFiles(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const result = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,webViewLink)',
      pageSize: 1000,
      pageToken,
    });
    files.push(...(result.data.files ?? []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function deleteDriveFolderTree(drive, folderId) {
  const children = await getDriveFiles(drive, folderId);
  for (const child of children) {
    if (child.mimeType === 'application/vnd.google-apps.folder') {
      await deleteDriveFolderTree(drive, child.id);
    } else {
      await drive.files.delete({ fileId: child.id });
    }
  }
  await drive.files.delete({ fileId: folderId });
}

async function uploadFileToDrive(accessToken, imageFile, parentFolderId) {
  const multipart = new FormData();
  multipart.append('metadata', new Blob([JSON.stringify({
    name: imageFile.name || 'chung-tu',
    parents: [parentFolderId],
  })], { type: 'application/json' }));
  multipart.append('file', new Blob([await imageFile.arrayBuffer()], {
    type: imageFile.type || 'application/octet-stream',
  }), imageFile.name || 'chung-tu');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: multipart,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Google Drive upload thất bại (${response.status}).`);
  return payload;
}

async function ensureMonthSheet(sheets, spreadsheetId, sheetTitle) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });
  const existing = (spreadsheet.data.sheets ?? []).find((sheet) => sheet.properties?.title === sheetTitle);
  if (existing) return existing.properties.sheetId;

  const created = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${sheetTitle.replaceAll("'", "''")}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });
  return created.data.replies?.[0]?.addSheet?.properties?.sheetId;
}

async function findOrCreateMonthFolder(drive, parentId, name) {
  const found = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name.replaceAll("'", "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 10,
  });
  if (found.data.files?.[0]?.id) return found.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return created.data.id;
}

export async function GET(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const params = new URL(request.url).searchParams;
  const spreadsheetId = params.get('spreadsheetId') ?? '';
  const sheetTitle = params.get('sheetTitle') ?? '';
  const rowNumber = Number(params.get('rowNumber'));
  if (!DRIVE_ID_PATTERN.test(spreadsheetId) || !SHEET_TITLE_PATTERN.test(sheetTitle) || !Number.isInteger(rowNumber) || rowNumber < 2) {
    return jsonError(400, 'Thông tin dòng nhật ký không hợp lệ.');
  }

  try {
    const auth = await getGoogleOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    const escapedTitle = sheetTitle.replaceAll("'", "''");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escapedTitle}'!A${rowNumber}:L${rowNumber}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const row = response.data.values?.[0];
    if (!row) return jsonError(404, 'Không tìm thấy dòng nhật ký cần chỉnh sửa.');

    const folderId = getFolderIdFromLink(row[11]);
    if (!folderId) return jsonError(409, 'Dòng này chưa có link thư mục chứng từ trên Google Drive.');
    const folderResponse = await drive.files.get({ fileId: folderId, fields: 'id,name,parents,webViewLink,mimeType' });
    const files = await getDriveFiles(drive, folderId);
    return NextResponse.json({
      success: true,
      row: sheetRowToForm(row),
      folder: folderResponse.data,
      images: files.filter((file) => file.mimeType?.startsWith('image/')),
    });
  } catch (error) {
    console.error('Lỗi tải đơn hàng để chỉnh sửa:', error);
    return jsonError(500, error.message);
  }
}

export async function PATCH(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const parsedBody = await parseMultipartFormData(request);
  if (parsedBody.error) return jsonError(400, parsedBody.error);

  try {
    const { formData } = parsedBody;
    const spreadsheetId = String(formData.get('spreadsheetId') ?? '');
    const sheetTitle = String(formData.get('sheetTitle') ?? '');
    const rowNumber = Number(formData.get('rowNumber'));
    const ngay = String(formData.get('ngay') ?? '');
    const fields = {
      kenhMua: String(formData.get('kenhMua') ?? '').trim(),
      maDonHang: String(formData.get('maDonHang') ?? '').trim(),
      tenShop: String(formData.get('tenShop') ?? '').trim(),
      sku: String(formData.get('sku') ?? '').trim(),
      tenHangHoa: String(formData.get('tenHangHoa') ?? '').trim(),
      soLuong: String(formData.get('soLuong') ?? '').trim(),
      giaGoc: String(formData.get('giaGoc') ?? '').trim(),
      giaThucTra: String(formData.get('giaThucTra') ?? '').trim(),
      phuongThucThanhToan: String(formData.get('phuongThucThanhToan') ?? '').trim(),
      maVanDon: String(formData.get('maVanDon') ?? '').trim(),
    };
    let keepImageIds;
    try {
      keepImageIds = JSON.parse(String(formData.get('keepImageIds') ?? '[]'));
    } catch {
      return jsonError(400, 'Danh sách ảnh cần giữ không hợp lệ.');
    }
    const newImages = formData.getAll('images').filter((file) => file && Number(file.size) > 0 && typeof file.arrayBuffer === 'function');

    if (!DRIVE_ID_PATTERN.test(spreadsheetId) || !SHEET_TITLE_PATTERN.test(sheetTitle) || !Number.isInteger(rowNumber) || rowNumber < 2) {
      return jsonError(400, 'Thông tin dòng nhật ký không hợp lệ.');
    }
    if (!isValidIsoDate(ngay)) return jsonError(400, 'Ngày nhập không hợp lệ.');
    const required = [
      ['kenhMua', 'kênh mua'], ['tenShop', 'tên shop'], ['sku', 'mã SKU'],
      ['soLuong', 'số lượng'], ['giaGoc', 'giá gốc'], ['giaThucTra', 'giá thực trả'],
      ['phuongThucThanhToan', 'phương thức thanh toán'],
    ];
    const missing = required.find(([key]) => !fields[key]);
    if (missing) return jsonError(400, `Vui lòng nhập ${missing[1]}.`);
    for (const key of ['soLuong', 'giaGoc', 'giaThucTra']) {
      if (!Number.isFinite(Number(fields[key])) || Number(fields[key]) <= 0) return jsonError(400, `${key === 'soLuong' ? 'Số lượng' : key === 'giaGoc' ? 'Giá gốc' : 'Giá thực trả'} phải lớn hơn 0.`);
    }
    if (!Array.isArray(keepImageIds)) return jsonError(400, 'Danh sách ảnh cần giữ không hợp lệ.');

    const auth = await getGoogleOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    const escapedSourceTitle = sheetTitle.replaceAll("'", "''");
    const sourceResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escapedSourceTitle}'!A${rowNumber}:L${rowNumber}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    const oldRow = sourceResponse.data.values?.[0];
    if (!oldRow) return jsonError(404, 'Không tìm thấy dòng nhật ký cần chỉnh sửa.');

    const folderId = getFolderIdFromLink(oldRow[11]);
    if (!folderId) return jsonError(409, 'Dòng này chưa có link thư mục chứng từ trên Google Drive.');
    const [folderResponse, existingFiles] = await Promise.all([
      drive.files.get({ fileId: folderId, fields: 'id,name,parents,webViewLink,mimeType' }),
      getDriveFiles(drive, folderId),
    ]);
    const existingImages = existingFiles.filter((file) => file.mimeType?.startsWith('image/'));
    const existingImageIds = new Set(existingImages.map((file) => file.id));
    if (keepImageIds.some((id) => typeof id !== 'string' || !existingImageIds.has(id))) {
      return jsonError(400, 'Danh sách ảnh cần giữ không hợp lệ. Tải lại đơn hàng rồi thử lại.');
    }
    if (keepImageIds.length + newImages.length === 0) return jsonError(400, 'Đơn hàng phải có ít nhất một ảnh chứng từ.');

    const accessTokenResult = await auth.getAccessToken();
    const accessToken = typeof accessTokenResult === 'string' ? accessTokenResult : accessTokenResult?.token;
    if (!accessToken) throw new Error('Không lấy được Google access token.');
    for (const image of newImages) await uploadFileToDrive(accessToken, image, folderId);

    const orderFolderName = buildOrderFolderName(ngay, fields.maDonHang, fields.maVanDon, fields.tenShop);
    const oldParentId = folderResponse.data.parents?.[0];
    const oldParent = oldParentId
      ? await drive.files.get({ fileId: oldParentId, fields: 'id,parents,name' })
      : null;
    const targetTitle = monthTitle(ngay);
    let movedToDifferentMonth = targetTitle !== sheetTitle;
    if (movedToDifferentMonth) {
      const rootParentId = oldParent?.data.parents?.[0];
      if (!rootParentId) return jsonError(409, 'Không xác định được thư mục gốc để chuyển chứng từ sang tháng mới.');
      const targetMonthFolderId = await findOrCreateMonthFolder(drive, rootParentId, targetTitle);
      await drive.files.update({
        fileId: folderId,
        addParents: targetMonthFolderId,
        removeParents: oldParentId,
        requestBody: { name: orderFolderName },
        fields: 'id,name,parents,webViewLink',
      });
    } else {
      await drive.files.update({ fileId: folderId, requestBody: { name: orderFolderName }, fields: 'id,name,parents,webViewLink' });
    }

    const newRow = [
      ngay,
      asSheetText(fields.kenhMua),
      asSheetText(fields.maDonHang),
      asSheetText(fields.tenShop),
      asSheetText(fields.sku),
      asSheetText(fields.tenHangHoa),
      Number(fields.soLuong),
      Number(fields.giaGoc),
      Number(fields.giaThucTra),
      asSheetText(fields.phuongThucThanhToan),
      asSheetText(fields.maVanDon),
      folderResponse.data.webViewLink || oldRow[11],
    ];
    if (movedToDifferentMonth) {
      const targetSheetId = await ensureMonthSheet(sheets, spreadsheetId, targetTitle);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${targetTitle.replaceAll("'", "''")}'!A:L`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });
      const sourceSpreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
      const sourceSheetId = (sourceSpreadsheet.data.sheets ?? []).find((sheet) => sheet.properties?.title === sheetTitle)?.properties?.sheetId;
      if (sourceSheetId == null || targetSheetId == null) throw new Error('Không xác định được tab nguồn hoặc tab đích trong Spreadsheet.');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId: sourceSheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${escapedSourceTitle}'!A${rowNumber}:L${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [newRow] },
      });
    }

    const removedImages = existingImages.filter((file) => !keepImageIds.includes(file.id));
    for (const file of removedImages) await drive.files.delete({ fileId: file.id });

    return NextResponse.json({ success: true, message: 'Đã cập nhật đơn hàng, thư mục và chứng từ.', sheetTitle: targetTitle });
  } catch (error) {
    console.error('Lỗi cập nhật đơn hàng:', error);
    return jsonError(500, error.message);
  }
}

export async function DELETE(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  try {
    const { spreadsheetId = '', sheetTitle = '', rowNumber: rawRowNumber } = await request.json();
    const rowNumber = Number(rawRowNumber);
    if (!DRIVE_ID_PATTERN.test(spreadsheetId) || !SHEET_TITLE_PATTERN.test(sheetTitle) || !Number.isInteger(rowNumber) || rowNumber < 2) {
      return jsonError(400, 'Thông tin đơn hàng không hợp lệ.');
    }

    const auth = await getGoogleOAuth2Client();
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });
    const escapedTitle = sheetTitle.replaceAll("'", "''");
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escapedTitle}'!L${rowNumber}`,
    });
    const folderId = getFolderIdFromLink(result.data.values?.[0]?.[0]);
    if (!folderId) return jsonError(409, 'Không tìm thấy thư mục chứng từ của đơn hàng.');

    await deleteDriveFolderTree(drive, folderId);
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
    const sourceSheetId = (spreadsheet.data.sheets ?? []).find((sheet) => sheet.properties?.title === sheetTitle)?.properties?.sheetId;
    if (sourceSheetId == null) return jsonError(404, 'Không tìm thấy sheet của đơn hàng.');
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteDimension: { range: { sheetId: sourceSheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }] },
    });
    return NextResponse.json({ success: true, message: 'Đã xóa đơn hàng và chứng từ.' });
  } catch (error) {
    console.error('Lỗi xóa đơn hàng:', error);
    return jsonError(500, error.message);
  }
}
