import { NextResponse } from 'next/server';
import { createAdminClient, createAuthClient, isAdminConfigured, isSupabaseConfigured } from '@/lib/supabase';
import { publicUser, setSessionCookies } from '@/lib/auth';

export async function POST(request) {
  if (!isSupabaseConfigured) return NextResponse.json({ success: false, error: 'Server chưa cấu hình Supabase.' }, { status: 500 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: 'Dữ liệu không hợp lệ.' }, { status: 400 }); }
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) return NextResponse.json({ success: false, error: 'Vui lòng nhập username và mật khẩu.' }, { status: 400 });
  if (!isAdminConfigured) return NextResponse.json({ success: false, error: 'Server chưa cấu hình SUPABASE_SECRET_KEY.' }, { status: 500 });

  const admin = createAdminClient();
  let authUser = null;
  for (let page = 1; !authUser; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ success: false, error: 'Không thể tra cứu username.' }, { status: 500 });
    authUser = data.users.find((user) => (user.user_metadata?.username || user.email?.split('@')[0] || '').toLowerCase() === username);
    if (data.users.length < 1000) break;
  }
  if (!authUser?.email) return NextResponse.json({ success: false, error: 'Username hoặc mật khẩu không đúng.' }, { status: 401 });

  const { data, error } = await createAuthClient().auth.signInWithPassword({ email: authUser.email, password });
  if (error || !data?.session) {
    const invalid = error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials';
    return NextResponse.json({ success: false, error: invalid ? 'Username hoặc mật khẩu không đúng.' : (error?.message ?? 'Đăng nhập thất bại.') }, { status: invalid ? 401 : 400 });
  }
  await setSessionCookies(data.session);
  return NextResponse.json({ success: true, user: publicUser(data.user) });
}
