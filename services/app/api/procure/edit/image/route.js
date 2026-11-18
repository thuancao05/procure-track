import { requireUser } from '@/lib/auth';
import { getGoogleOAuth2Client } from '@/lib/google-auth';

const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function GET(request) {
  const { errorResponse } = await requireUser();
  if (errorResponse) return errorResponse;

  const fileId = new URL(request.url).searchParams.get('fileId') ?? '';
  if (!DRIVE_ID_PATTERN.test(fileId)) return new Response('File ID không hợp lệ.', { status: 400 });

  try {
    const auth = await getGoogleOAuth2Client();
    const accessTokenResult = await auth.getAccessToken();
    const accessToken = typeof accessTokenResult === 'string' ? accessTokenResult : accessTokenResult?.token;
    if (!accessToken) return new Response('Không lấy được Google access token.', { status: 502 });

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return new Response('Không thể tải ảnh chứng từ từ Google Drive.', { status: response.status });

    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Lỗi tải ảnh chứng từ:', error);
    return new Response('Lỗi tải ảnh chứng từ.', { status: 500 });
  }
}
