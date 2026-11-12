import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase';
import { errorJson } from '@/lib/admin-lookups';
import {
  authErrorMessage,
  toApiUser,
  validateEmail,
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

  users.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
  return NextResponse.json({ success: true, users: users.map(toApiUser) });
}

// POST /api/admin/users — tạo tài khoản (đã xác nhận email, đăng nhập được ngay)
export async function POST(request) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const body = await request.json().catch(() => ({}));
  const email = validateEmail(body?.email);
  if (email.error) return errorJson(400, email.error);
  const password = validatePassword(body?.password);
  if (password.error) return errorJson(400, password.error);
  const role = validateRole(body?.role ?? 'staff');
  if (role.error) return errorJson(400, role.error);

  const { data, error } = await createAdminClient().auth.admin.createUser({
    email: email.value,
    password: password.value,
    email_confirm: true,
    app_metadata: { role: role.value },
  });
  if (error) return errorJson(error.status === 422 ? 409 : 400, authErrorMessage(error));

  return NextResponse.json({ success: true, user: toApiUser(data.user) }, { status: 201 });
}
