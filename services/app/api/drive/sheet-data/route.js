import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireUser } from '@/lib/auth';
import { getGoogleOAuth2Client } from '@/lib/google-auth';

const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHEET_TITLE_PATTERN = /^Tháng \d{1,2}\/\d{4}$/;

export async function GET(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const spreadsheetId = searchParams.get('spreadsheetId') || process.env.GOOGLE_SPREADSHEET_ID;
  const sheetTitle = searchParams.get('sheetTitle');
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.min(5, Math.max(1, Number.parseInt(searchParams.get('limit') || '5', 10) || 5));

  if (!spreadsheetId || !DRIVE_ID_PATTERN.test(spreadsheetId)) {
    return NextResponse.json({ success: false, error: 'Spreadsheet ID không hợp lệ.' }, { status: 400 });
  }
  if (!sheetTitle || !SHEET_TITLE_PATTERN.test(sheetTitle)) {
    return NextResponse.json({ success: false, error: 'Tên tab tháng không hợp lệ.' }, { status: 400 });
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: await getGoogleOAuth2Client() });
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,title)',
    });
    const sheetExists = (spreadsheet.data.sheets ?? []).some(
      (sheet) => sheet.properties?.title === sheetTitle,
    );

    if (!sheetExists) {
      return NextResponse.json({
        success: true,
        sheetExists: false,
        sheetTitle,
        message: `Chưa có sheet ${sheetTitle}.`,
        headers: [],
        rows: [],
        offset,
        limit,
        totalRows: 0,
        hasMore: false,
      });
    }

    const escapedTitle = sheetTitle.replaceAll("'", "''");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${escapedTitle}'!A:L`,
      majorDimension: 'ROWS',
    });
    const values = response.data.values ?? [];
    const rows = values.slice(1)
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const dateResult = String(b.row[0] ?? '').localeCompare(String(a.row[0] ?? ''));
        return dateResult || b.index - a.index;
      })
      .map(({ row }) => row);
    const pagedRows = rows.slice(offset, offset + limit);
    return NextResponse.json({
      success: true,
      sheetExists: true,
      sheetTitle,
      headers: values[0] ?? [],
      rows: pagedRows,
      offset,
      limit,
      totalRows: rows.length,
      hasMore: offset + pagedRows.length < rows.length,
    });
  } catch (error) {
    const status = error?.code === 404 ? 404 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
