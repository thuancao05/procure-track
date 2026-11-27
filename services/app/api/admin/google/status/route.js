import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { requireAdmin } from '@/lib/auth';
import {
  getGoogleOAuth2Client,
  getStoredGoogleConnection,
  isGoogleReauthError,
  GOOGLE_REAUTH_MESSAGE,
} from '@/lib/google-auth';

function maskEmail(email) {
  if (typeof email !== 'string') return email;
  const at = email.indexOf('@');
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const visibleCount = local.length >= 5 ? 2 : 1;
  return `${local.slice(0, visibleCount)}***${local.slice(-visibleCount)}${email.slice(at)}`;
}

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
        googleAccount = about.data.user ? {
          ...about.data.user,
          emailAddress: maskEmail(about.data.user.emailAddress),
        } : null;
        driveAccess = true;
      } catch (error) {
        connectionError = isGoogleReauthError(error) ? GOOGLE_REAUTH_MESSAGE : error.message;
      }
      if (process.env.GOOGLE_SPREADSHEET_ID) {
        try {
          await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID });
          sheetsAccess = true;
        } catch (error) {
          connectionError = connectionError ?? (isGoogleReauthError(error) ? GOOGLE_REAUTH_MESSAGE : error.message);
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
      needsReconnect: Boolean(connectionError),
      defaultFolderId: process.env.GOOGLE_PARENT_FOLDER_ID ?? '',
      defaultSpreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? '',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
