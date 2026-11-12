import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

export async function GET(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số folderId!" },
        { status: 400 }
      );
    }

    // Truy vấn Google Drive tìm các file Google Sheets nằm trong thư mục được chọn
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 50,
    });

    return NextResponse.json({
      success: true,
      spreadsheets: response.data.files,
    });
  } catch (error) {
    console.error("Lỗi khi tải danh sách Spreadsheet:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}