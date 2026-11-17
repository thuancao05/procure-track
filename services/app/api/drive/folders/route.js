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

const folderMimeType = 'application/vnd.google-apps.folder';
const mockRootFolderId = 'mock-chung-tu-2026';
const mockFolders = [
  { id: mockRootFolderId, name: 'Chứng từ 2026', mimeType: folderMimeType },
  { id: 'mock-month-01', name: 'Tháng 1/2026', parents: [mockRootFolderId], mimeType: folderMimeType },
  { id: 'mock-month-02', name: 'Tháng 2/2026', parents: [mockRootFolderId], mimeType: folderMimeType },
  { id: 'mock-month-10', name: 'Tháng 10/2026', parents: [mockRootFolderId], mimeType: folderMimeType },
  { id: 'mock-order-jan-01', name: '2026-01-03.ORD-001.SPX001', parents: ['mock-month-01'], mimeType: folderMimeType },
  { id: 'mock-order-jan-02', name: '2026-01-12.ORD-002.SPX002', parents: ['mock-month-01'], mimeType: folderMimeType },
  { id: 'mock-order-feb-01', name: '2026-02-05.ORD-003.SPX003', parents: ['mock-month-02'], mimeType: folderMimeType },
];

export async function GET() {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  if (process.env.NODE_ENV !== 'production' && process.env.DRIVE_FOLDERS_MOCK === 'true') {
    return NextResponse.json({
      success: true,
      folders: mockFolders,
      defaultFolderId: mockRootFolderId,
      defaultSpreadsheetId: '',
    });
  }

  try {
    const folders = [];
    let pageToken;

    do {
      const response = await drive.files.list({
        q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'nextPageToken, files(id, name, parents, mimeType)',
        pageSize: 1000,
        pageToken,
      });
      folders.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return NextResponse.json({
      success: true,
      folders,
      defaultFolderId: process.env.GOOGLE_PARENT_FOLDER_ID ?? '',
      defaultSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? '',
    });
  } catch (error) {
    console.error("Lỗi Google Drive:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
