import { getRole, ROLES } from './auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_PASSWORD_LENGTH = 8;

export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

/** User Supabase -> object API. */
export const toApiUser = (user) => ({
  id: user.id,
  email: user.email,
  role: getRole(user),
  createdAt: user.created_at,
  lastSignInAt: user.last_sign_in_at ?? null,
});

export function validateEmail(email) {
  const v = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(v)) return { error: 'Email không hợp lệ.' };
  return { value: v };
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` };
  }
  return { value: password };
}

export function validateRole(role) {
  if (!ROLES.includes(role)) return { error: 'Vai trò không hợp lệ.' };
  return { value: role };
}

/** Thông báo lỗi Supabase Auth thân thiện hơn. */
export function authErrorMessage(error) {
  if (error?.code === 'email_exists' || /already been registered/i.test(error?.message ?? '')) {
    return 'Email này đã có tài khoản.';
  }
  if (error?.code === 'weak_password') return 'Mật khẩu quá yếu.';
  return error?.message ?? 'Lỗi không xác định.';
}
