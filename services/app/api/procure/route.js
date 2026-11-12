import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { google } from 'googleapis';
import { Readable } from 'stream';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

// ID của Google Drive / Sheets chỉ gồm chữ, số, '-' và '_'.
// Chặn mọi ký tự khác (đặc biệt là dấu ') để không thể chèn thêm điều kiện vào câu truy vấn q.
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Ngày từ <input type="date"> luôn có dạng YYYY-MM-DD.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Chống chèn công thức (formula injection) vào Google Sheets.
// Với valueInputOption "USER_ENTERED", chuỗi bắt đầu bằng = + - @ sẽ bị hiểu là công thức.
// Thêm dấu ' ở đầu để Sheets coi đó là chữ thường (dấu ' không hiển thị trong ô).
function asSheetText(value) {
  const text = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export async function POST(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  try {
    const formData = await request.formData();
    
    const userSelectedFolderId = formData.get('parentFolderId');
    const rootFolderId = userSelectedFolderId || process.env.GOOGLE_PARENT_FOLDER_ID;
    
    // Lấy đúng ID file Spreadsheet do Frontend truyền lên
    const spreadsheetId = formData.get('spreadsheetId');

    // Lấy thông tin từ form
    const ngay = formData.get('ngay');
    const kenhMua = formData.get('kenhMua');
    const maDonHang = formData.get('maDonHang');
    const tenShop = formData.get('tenShop');
    const sku = formData.get('sku');
    const tenHangHoa = formData.get('tenHangHoa');
    const soLuong = formData.get('soLuong');
    const giaGoc = formData.get('giaGoc');
    const giaThucTra = formData.get('giaThucTra');
    const phuongThucThanhToan = formData.get('phuongThucThanhToan');
    const maVanDon = formData.get('maVanDon');
    const images = formData.getAll('images');

    if (!ngay) {
      return NextResponse.json({ success: false, error: "Vui lòng chọn ngày nhập hàng!" }, { status: 400 });
    }

    if (!spreadsheetId) {
      return NextResponse.json({ success: false, error: "Thiếu Spreadsheet ID để ghi nhật ký!" }, { status: 400 });
    }

    if (!DATE_PATTERN.test(ngay)) {
      return NextResponse.json({ success: false, error: "Ngày nhập hàng không đúng định dạng YYYY-MM-DD!" }, { status: 400 });
    }

    if (!DRIVE_ID_PATTERN.test(spreadsheetId) || !DRIVE_ID_PATTERN.test(rootFolderId || '')) {
      return NextResponse.json({ success: false, error: "ID thư mục hoặc Spreadsheet không hợp lệ!" }, { status: 400 });
    }

    // --- PHẦN 1: XỬ LÝ GOOGLE DRIVE (Tạo thư mục Tháng & Đơn hàng) ---
    const dateObj = new Date(ngay);
    const month = dateObj.getMonth() + 1; // 1 -> 12
    const year = dateObj.getFullYear();
    const monthFolderName = `Tháng ${month}/${year}`; // Ví dụ: Tháng 1/2026

    // Kiểm tra / Tạo thư mục Tháng bên trong thư mục gốc trên Drive
    let monthFolderId = null;
    const searchRes = await drive.files.list({
      q: `'${rootFolderId}' in parents and name = '${monthFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });

    if (searchRes.data.files.length > 0) {
      monthFolderId = searchRes.data.files[0].id;
    } else {
      const createMonthRes = await drive.files.create({
        resource: {
          name: monthFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
        },
        fields: 'id',
      });
      monthFolderId = createMonthRes.data.id;
    }

    // Tạo thư mục con của đơn hàng [Ngày].[MãĐơn].[MãVậnĐơn]
    const orderFolderName = `${ngay}.${maDonHang}.${maVanDon}`;
    const orderFolderRes = await drive.files.create({
      resource: {
        name: orderFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [monthFolderId],
      },
      fields: 'id, webViewLink',
    });

    const subFolderId = orderFolderRes.data.id;
    const subFolderLink = orderFolderRes.data.webViewLink;

    // Upload toàn bộ ảnh chứng từ vào thư mục đơn hàng
    for (const imageFile of images) {
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      await drive.files.create({
        requestBody: {
          name: imageFile.name,
          parents: [subFolderId],
        },
        media: {
          mimeType: imageFile.type,
          body: stream,
        },
      });
    }

    // --- PHẦN 2: XỬ LÝ GOOGLE SHEETS (Ghi nhật ký vào Tab tương ứng với Tháng) ---
    const sheetTitle = `Tháng ${month}/${year}`; // Tên Tab trong file Google Sheet

    // Kiểm tra xem Tab (Sheet) của tháng đó đã tồn tại trong file Spreadsheet chưa
    const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetExists = spreadsheetInfo.data.sheets.some(
      (s) => s.properties.title === sheetTitle
    );

    if (!sheetExists) {
      // Nếu chưa có Tab tháng này, tự động tạo mới Tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: sheetTitle },
              },
            },
          ],
        },
      });

      // Thêm dòng tiêu đề (Header) cho Tab mới
      const headers = [
        "Ngày", "Kênh mua", "Mã đơn hàng", "Tên Shop", 
        "SKU", "Hàng hóa", "Số lượng", "Giá gốc", 
        "Giá thực trả", "Thanh toán", "Vận đơn", "Chứng từ"
      ];
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetTitle}!A1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      });
    }

    // Chuẩn bị dòng dữ liệu chèn vào bảng của tháng tương ứng
    // Các cột chữ đi qua asSheetText() để không bị Sheets hiểu nhầm thành công thức
    const rowData = [
      ngay,
      asSheetText(kenhMua),
      asSheetText(maDonHang),
      asSheetText(tenShop),
      asSheetText(sku),
      asSheetText(tenHangHoa),
      Number(soLuong),
      Number(giaGoc),
      Number(giaThucTra),
      asSheetText(phuongThucThanhToan),
      asSheetText(maVanDon),
      subFolderLink, // Link chứng từ trỏ đến thư mục Google Drive của đơn hàng
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetTitle}!A:L`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [rowData] },
    });

    return NextResponse.json({
      success: true,
      message: `Đã tạo thư mục [${monthFolderName}], ghi dữ liệu vào Tab [${sheetTitle}] trên Sheet và tải ảnh thành công!`,
      linkChungTu: subFolderLink,
    });

  } catch (error) {
    console.error("Lỗi xử lý hệ thống:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
