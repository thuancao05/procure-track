import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireUser } from '@/lib/auth';
import { createUserClient } from '@/lib/supabase';
import { getGoogleOAuth2Client } from '@/lib/google-auth';

const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MONTH_TITLE_PATTERN = /^Tháng \d{1,2}\/\d{4}$/;
const ORDER_FOLDER_PATTERN = /^(\d{4}-\d{2}-\d{2})\.(.*)$/;

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const orderKey = (date, orderCode, shippingCode) => [date, orderCode, shippingCode].map(normalize).join('\u001f');
const orderOnlyKey = (date, orderCode) => [date, orderCode].map(normalize).join('\u001f');

function folderInfo(folder) {
  const match = String(folder.name ?? '').match(ORDER_FOLDER_PATTERN);
  if (!match) return null;
  const parts = match[2].split('.');
  return {
    id: folder.id,
    name: folder.name,
    date: match[1],
    orderCode: parts[0] ?? '',
    shippingCode: parts[1] ?? '',
    shop: parts.slice(2).join('.') || '',
    webViewLink: folder.webViewLink ?? '',
  };
}

function folderIdFromLink(value) {
  return String(value ?? '').match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? '';
}

async function getDriveFolders(drive) {
  const folders = [];
  let pageToken;
  do {
    const response = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'nextPageToken, files(id,name,parents,mimeType,webViewLink)',
      pageSize: 1000,
      pageToken,
    });
    folders.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return folders;
}

async function deleteDriveTree(drive, folderId) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,mimeType)',
    pageSize: 1000,
  });
  for (const file of response.data.files ?? []) {
    if (file.mimeType === 'application/vnd.google-apps.folder') await deleteDriveTree(drive, file.id);
    else await drive.files.delete({ fileId: file.id });
  }
  await drive.files.delete({ fileId: folderId });
}

async function getDrivePreference(user, accessToken, key) {
  if (!accessToken) return '';
  const { data } = await createUserClient(accessToken)
    .from('user_drive_preferences')
    .select('default_folder_id, default_spreadsheet_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return key === 'folder' ? data?.default_folder_id ?? '' : data?.default_spreadsheet_id ?? '';
}

export async function GET(request) {
  const { user, accessToken, errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const requestedSpreadsheetId = searchParams.get('spreadsheetId') || '';
  const requestedRootFolderId = searchParams.get('folderId') || '';
  const requestedPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const limit = 5;

  try {
    const preferredSpreadsheetId = await getDrivePreference(user, accessToken, 'spreadsheet');
    const preferredRootFolderId = await getDrivePreference(user, accessToken, 'folder');
    const spreadsheetId = requestedSpreadsheetId || preferredSpreadsheetId || process.env.GOOGLE_SPREADSHEET_ID;
    const rootFolderId = requestedRootFolderId || preferredRootFolderId || process.env.GOOGLE_PARENT_FOLDER_ID;
    if (!spreadsheetId || !DRIVE_ID_PATTERN.test(spreadsheetId)) {
      return NextResponse.json({ success: false, error: 'Chưa cấu hình Spreadsheet nhật ký.' }, { status: 400 });
    }
    if (!rootFolderId || !DRIVE_ID_PATTERN.test(rootFolderId)) {
      return NextResponse.json({ success: false, error: 'Chưa cấu hình thư mục Drive chứng từ.' }, { status: 400 });
    }

    const auth = await getGoogleOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    const [spreadsheet, folders] = await Promise.all([
      sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(title)' }),
      getDriveFolders(drive),
    ]);

    const monthTitles = (spreadsheet.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title) => MONTH_TITLE_PATTERN.test(title ?? ''));
    const sheetValues = await Promise.all(monthTitles.map(async (sheetTitle) => {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetTitle.replaceAll("'", "''")}'!A:L`,
      });
      return { sheetTitle, values: response.data.values ?? [] };
    }));

    const orderFolders = folders
      .filter((folder) => folder.parents?.includes(rootFolderId))
      .filter((monthFolder) => MONTH_TITLE_PATTERN.test(monthFolder.name ?? ''))
      .flatMap((monthFolder) => folders
        .filter((folder) => folder.parents?.includes(monthFolder.id))
        .map(folderInfo)
        .filter(Boolean));
    const folderIds = new Set(folders.map((folder) => folder.id));
    const journalRecords = sheetValues.flatMap(({ sheetTitle, values }) => values.slice(1).map((row, index) => ({
      date: String(row[0] ?? '').trim(),
      orderCode: String(row[2] ?? '').trim(),
      shop: String(row[3] ?? '').trim(),
      shippingCode: String(row[10] ?? '').trim(),
      folderLink: String(row[11] ?? '').trim(),
      sheetTitle,
      rowNumber: index + 2,
    })));

    const attention = [];
    const journalKeys = new Set();
    const journalOrderKeys = new Set();
    const journalFolderIds = new Set();
    for (const record of journalRecords) {
      if (!record.date && !record.orderCode && !record.shippingCode && !record.shop && !record.folderLink) continue;
      const key = orderKey(record.date, record.orderCode, record.shippingCode);
      if (record.date || record.orderCode || record.shippingCode) journalKeys.add(key);
      const folderId = folderIdFromLink(record.folderLink);
      if (record.date && record.orderCode) journalOrderKeys.add(orderOnlyKey(record.date, record.orderCode));
      if (folderId) journalFolderIds.add(folderId);
      const hasFolder = Boolean(folderId && folderIds.has(folderId));
      if (!hasFolder) {
        attention.push({
          type: 'missing-folder',
          date: record.date,
          orderCode: record.orderCode,
          shippingCode: record.shippingCode,
          shop: record.shop,
          sheetTitle: record.sheetTitle,
          rowNumber: record.rowNumber,
          message: 'Thiếu folder chứng từ',
        });
      }
    }

    for (const folder of orderFolders) {
      const hasJournal = journalFolderIds.has(folder.id)
        || journalKeys.has(orderKey(folder.date, folder.orderCode, folder.shippingCode))
        || (folder.orderCode && journalOrderKeys.has(orderOnlyKey(folder.date, folder.orderCode)));
      if (!hasJournal) {
        attention.push({
          type: 'missing-journal',
          date: folder.date,
          orderCode: folder.orderCode,
          shippingCode: folder.shippingCode,
          shop: folder.shop,
          folderId: folder.id,
          folderName: folder.name,
          folderLink: folder.webViewLink,
          message: 'Thiếu nhật ký ghi hàng',
        });
      }
    }

    attention.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.orderCode).localeCompare(String(a.orderCode)));
    const total = attention.length;
    const offset = (page - 1) * limit;
    return NextResponse.json({
      success: true,
      items: attention.slice(offset, offset + limit),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error('Lỗi đối chiếu đơn hàng cần lưu ý:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const action = body?.action;
    const spreadsheetId = String(body?.spreadsheetId ?? '');
    const rootFolderId = String(body?.folderId ?? '');
    const auth = await getGoogleOAuth2Client();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    if (action === 'delete-journal') {
      const sheetTitle = String(body?.sheetTitle ?? '');
      const rowNumber = Number(body?.rowNumber);
      if (!DRIVE_ID_PATTERN.test(spreadsheetId) || !MONTH_TITLE_PATTERN.test(sheetTitle) || !Number.isInteger(rowNumber) || rowNumber < 2) {
        return NextResponse.json({ success: false, error: 'Thông tin dòng nhật ký không hợp lệ.' }, { status: 400 });
      }
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
      const sheetId = (spreadsheet.data.sheets ?? []).find((sheet) => sheet.properties?.title === sheetTitle)?.properties?.sheetId;
      if (sheetId == null) return NextResponse.json({ success: false, error: 'Không tìm thấy sheet nhật ký.' }, { status: 404 });
      const row = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle.replaceAll("'", "''")}'!L${rowNumber}` });
      if (folderIdFromLink(row.data.values?.[0]?.[0])) return NextResponse.json({ success: false, error: 'Dòng nhật ký này đã có folder chứng từ, không thể xóa từ danh sách cảnh báo.' }, { status: 409 });
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }] },
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete-folder') {
      const folderId = String(body?.targetFolderId ?? '');
      if (!DRIVE_ID_PATTERN.test(rootFolderId) || !DRIVE_ID_PATTERN.test(folderId)) {
        return NextResponse.json({ success: false, error: 'Folder ID không hợp lệ.' }, { status: 400 });
      }
      const folders = await getDriveFolders(drive);
      const monthIds = new Set(folders.filter((folder) => folder.parents?.includes(rootFolderId) && MONTH_TITLE_PATTERN.test(folder.name ?? '')).map((folder) => folder.id));
      const target = folders.find((folder) => folder.id === folderId && folder.parents?.some((parentId) => monthIds.has(parentId)));
      if (!target || !folderInfo(target)) return NextResponse.json({ success: false, error: 'Folder không thuộc thư mục chứng từ đã chọn.' }, { status: 403 });
      await deleteDriveTree(drive, folderId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Thao tác xóa không hợp lệ.' }, { status: 400 });
  } catch (error) {
    console.error('Lỗi xóa dữ liệu đơn hàng cần lưu ý:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
