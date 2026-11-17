import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createGoogleOAuthClient, GOOGLE_SCOPES } from '@/lib/google-auth';

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const client = createGoogleOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
    });
    return NextResponse.json({ success: true, url });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
