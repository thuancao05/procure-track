import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createAuthClient, isSupabaseConfigured } from './supabase';

const ACCESS_COOKIE = 'pt-access-token';
const REFRESH_COOKIE = 'pt-refresh-token';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 ngày

const cookieOptions = {
  httpOnly: true,
  // Production chạy FE/BE khác domain thì cần sameSite: 'none' + secure: true
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/** Lưu phiên Supabase vào cookie httpOnly (FE không đọc được token). */
export async function setSessionCookies(session) {
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in ?? 3600,
  });
  cookieStore.set(REFRESH_COOKIE, session.refresh_token, {
    ...cookieOptions,
    maxAge: REFRESH_MAX_AGE,
  });
}

export async function clearSessionCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

export async function getAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}

const json = (status, error) => NextResponse.json({ success: false, error }, { status });

/**
 * Xác thực request từ cookie phiên.
 * - Access token còn hạn  -> kiểm tra với Supabase Auth.
 * - Hết hạn / không hợp lệ -> dùng refresh token để lấy phiên mới và ghi lại cookie.
 * Trả về `{ user, accessToken }`, hoặc `{ errorResponse }` để route trả về ngay.
 */
export async function requireUser() {
  if (!isSupabaseConfigured) {
    return { errorResponse: json(500, 'Server chưa cấu hình SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.') };
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const supabase = createAuthClient();

  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user) {
      return { user: data.user, accessToken };
    }
  }

  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data?.session) {
      await setSessionCookies(data.session);
      return { user: data.session.user, accessToken: data.session.access_token };
    }
  }

  await clearSessionCookies();
  return { errorResponse: json(401, 'Chưa đăng nhập hoặc phiên đã hết hạn.') };
}

/** Thông tin user an toàn để trả về FE. */
export const publicUser = (user) => ({ id: user.id, email: user.email });
