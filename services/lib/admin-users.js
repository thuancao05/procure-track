import { getRole, ROLES } from './auth';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MIN_PASSWORD_LENGTH = 8;
export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);
export const getUsername = (user) => user?.user_metadata?.username || user?.email?.split('@')[0] || '';
export const toApiUser = (user) => ({ id: user.id, username: getUsername(user), role: getRole(user), createdAt: user.created_at, lastSignInAt: user.last_sign_in_at ?? null });
export function validateUsername(username) {
  const value = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!USERNAME_RE.test(value)) return { error: 'Username phải có 3-32 ký tự (chỉ gồm chữ, số, ., _ hoặc -).' };
  return { value };
}
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return { error: `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.` };
  return { value: password };
}
export function validateRole(role) {
  if (!ROLES.includes(role)) return { error: 'Vai trò không hợp lệ.' };
  return { value: role };
}
export function authErrorMessage(error) {
  if (error?.code === 'email_exists' || /already been registered/i.test(error?.message ?? '')) return 'Username này đã có tài khoản.';
  if (error?.code === 'weak_password') return 'Mật khẩu quá yếu.';
  return error?.message ?? 'Lỗi không xác định.';
}
