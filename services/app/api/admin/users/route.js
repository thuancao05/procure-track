import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase';
import { errorJson } from '@/lib/admin-lookups';
import {
  authErrorMessage,
  toApiUser,
  validateUsername,
  validatePassword,
  validateRole,
} from '@/lib/admin-users';

const PER_PAGE = 1000;

// GET /api/admin/users — danh sách tài khoản
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const supabase = createAdminClient();
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return errorJson(500, authErrorMessage(error));
    users.push(...data.users);
    if (data.users.length < PER_PAGE) break;
  }

  users.sort((a, b) => (a.user_metadata?.username || a.email || '').localeCompare(b.user_metadata?.username || b.email || ''));
  return NextResponse.json({ success: true, users: users.map(toApiUser) });
}

// POST /api/admin/users — tạo tài khoản (đã xác nhận email, đăng nhập được ngay)
export async function POST(request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const username = validateUsername(body?.username);
  if (username.error) return errorJson(400, username.error);
  const password = validatePassword(body?.password);
  if (password.error) return errorJson(400, password.error);
  const role = validateRole(body?.role ?? 'staff');
  if (role.error) return errorJson(400, role.error);

  const admin = createAdminClient();
  const { data: existingData, error: existingError } = await admin.auth.admin.listUsers({ page: 1, perPage: PER_PAGE });
  if (existingError) return errorJson(500, authErrorMessage(existingError));
  const usernameExists = existingData.users.some((user) =>
    (user.user_metadata?.username || user.email?.split('@')[0] || '').toLowerCase() === username.value
  );
  if (usernameExists) return errorJson(409, 'Username này đã có tài khoản.');

  const { data, error } = await admin.auth.admin.createUser({
    email: `${username.value}@users.procure-track.local`,
    password: password.value,
    email_confirm: true,
    user_metadata: { username: username.value },
    app_metadata: { role: role.value },
  });
  if (error) return errorJson(error.status === 422 ? 409 : 400, authErrorMessage(error));

  return NextResponse.json({ success: true, user: toApiUser(data.user) }, { status: 201 });
}
