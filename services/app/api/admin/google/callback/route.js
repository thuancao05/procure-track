import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createGoogleOAuthClient, saveGoogleRefreshToken } from '@/lib/google-auth';

function redirectToFrontend(params) {
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
  const url = new URL('/admin/google', origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function GET(request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const error = searchParams.get('error');
  const code = searchParams.get('code');
  if (error) return redirectToFrontend({ google: 'error', message: error });
  if (!code) return redirectToFrontend({ google: 'error', message: 'Thiếu authorization code.' });

  try {
    const client = createGoogleOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) throw new Error('Google không trả về refresh token. Hãy thử kết nối lại và chấp thuận quyền truy cập.');
    await saveGoogleRefreshToken(tokens.refresh_token);
    return redirectToFrontend({ google: 'connected' });
  } catch (callbackError) {
    return redirectToFrontend({ google: 'error', message: callbackError.message });
  }
}
