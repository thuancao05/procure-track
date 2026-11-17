import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireAdmin } from '@/lib/auth';
import { getGoogleOAuth2Client, getStoredGoogleConnection } from '@/lib/google-auth';

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const connection = await getStoredGoogleConnection();
    const hasStoredConnection = Boolean(connection?.refresh_token_ciphertext) && !connection.disabled;
    const hasEnvFallback = Boolean(process.env.GOOGLE_REFRESH_TOKEN) && !connection?.disabled;
    let googleAccount = null;
    let driveAccess = false;
    let sheetsAccess = false;

    let connectionError = null;
    if (hasStoredConnection || hasEnvFallback) {
      const auth = await getGoogleOAuth2Client();
      const drive = google.drive({ version: 'v3', auth });
      const sheets = google.sheets({ version: 'v4', auth });
      try {
        const about = await drive.about.get({ fields: 'user(emailAddress,displayName)' });
        googleAccount = about.data.user ?? null;
        driveAccess = true;
      } catch (error) {
        connectionError = error.message;
      }
      if (process.env.GOOGLE_SPREADSHEET_ID) {
        try {
          await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID });
          sheetsAccess = true;
        } catch (error) {
          connectionError = connectionError ?? error.message;
        }
      }
    }

    return NextResponse.json({
      success: true,
      connected: hasStoredConnection || hasEnvFallback,
      source: hasStoredConnection ? 'oauth' : hasEnvFallback ? 'env' : null,
      connectedAt: connection?.connected_at ?? null,
      googleAccount,
      driveAccess,
      sheetsAccess,
      connectionError,
      defaultFolderId: process.env.GOOGLE_PARENT_FOLDER_ID ?? '',
      defaultSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? '',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
