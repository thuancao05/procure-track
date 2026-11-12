import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase';
import { errorJson } from '@/lib/admin-lookups';
import { authErrorMessage, isUuid, toApiUser, validatePassword, validateRole } from '@/lib/admin-users';

// PATCH /api/admin/users/:id — đổi vai trò và/hoặc đặt lại mật khẩu
export async function PATCH(request, { params }) {
  const { user: currentUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  if (!isUuid(id)) return errorJson(400, 'ID không hợp lệ.');

  const body = await request.json().catch(() => ({}));
  const update = {};

  if (body?.role !== undefined) {
    const role = validateRole(body.role);
    if (role.error) return errorJson(400, role.error);
    if (id === currentUser.id && role.value !== 'admin') {
      return errorJson(400, 'Bạn không thể tự hạ quyền admin của chính mình.');
    }
    update.app_metadata = { role: role.value };
  }

  if (body?.password !== undefined && body.password !== '') {
    const password = validatePassword(body.password);
    if (password.error) return errorJson(400, password.error);
    update.password = password.value;
  }

  if (Object.keys(update).length === 0) return errorJson(400, 'Không có dữ liệu để cập nhật.');

  const { data, error } = await createAdminClient().auth.admin.updateUserById(id, update);
  if (error) return errorJson(error.status === 404 ? 404 : 400, authErrorMessage(error));

  return NextResponse.json({ success: true, user: toApiUser(data.user) });
}

// DELETE /api/admin/users/:id — xóa tài khoản
export async function DELETE(_request, { params }) {
  const { user: currentUser, errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { id } = await params;
  if (!isUuid(id)) return errorJson(400, 'ID không hợp lệ.');
  if (id === currentUser.id) return errorJson(400, 'Bạn không thể xóa tài khoản của chính mình.');

  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) return errorJson(error.status === 404 ? 404 : 400, authErrorMessage(error));

  return NextResponse.json({ success: true });
}
