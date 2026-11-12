import { NextResponse } from 'next/server';
import { createAuthClient, isSupabaseConfigured } from '@/lib/supabase';
import { publicUser, setSessionCookies } from '@/lib/auth';

export async function POST(request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { success: false, error: 'Server chưa cấu hình SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'Vui lòng nhập email và mật khẩu.' }, { status: 400 });
  }

  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.session) {
    const invalid = error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials';
    return NextResponse.json(
      { success: false, error: invalid ? 'Email hoặc mật khẩu không đúng.' : (error?.message ?? 'Đăng nhập thất bại.') },
      { status: invalid ? 401 : 400 }
    );
  }

  await setSessionCookies(data.session);
  return NextResponse.json({ success: true, user: publicUser(data.user) });
}
