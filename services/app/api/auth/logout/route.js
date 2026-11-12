import { NextResponse } from 'next/server';
import { createAuthClient, isSupabaseConfigured } from '@/lib/supabase';
import { clearSessionCookies, getAccessToken } from '@/lib/auth';

export async function POST() {
  // Thu hồi phiên phía Supabase (best-effort) bằng chính access token của user, sau đó xóa cookie
  const accessToken = await getAccessToken();
  if (accessToken && isSupabaseConfigured) {
    const { error } = await createAuthClient().auth.admin.signOut(accessToken, 'local');
    if (error) console.error('Lỗi khi thu hồi phiên Supabase:', error.message);
  }

  await clearSessionCookies();
  return NextResponse.json({ success: true });
}
