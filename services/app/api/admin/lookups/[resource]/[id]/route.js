import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase';
import {
  dbErrorResponse,
  errorJson,
  getResource,
  parseBody,
  parseId,
  selectColumns,
  toApi,
} from '@/lib/admin-lookups';

async function resolve(params) {
  const { resource: name, id: rawId } = await params;
  const resource = getResource(name);
  if (!resource) return { error: errorJson(404, 'Danh mục không tồn tại.') };
  const id = parseId(rawId);
  if (!id) return { error: errorJson(400, 'ID không hợp lệ.') };
  return { resource, id };
}

// PATCH /api/admin/lookups/:resource/:id — cập nhật
export async function PATCH(request, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { resource, id, error: paramError } = await resolve(params);
  if (paramError) return paramError;

  const body = await request.json().catch(() => null);
  const { values, error: validationError } = parseBody(resource, body, { partial: true });
  if (validationError) return errorJson(400, validationError);

  const { data, error } = await createAdminClient()
    .from(resource.table)
    .update(values)
    .eq('id', id)
    .select(selectColumns(resource))
    .maybeSingle();
  if (error) return dbErrorResponse(resource, error);
  if (!data) return errorJson(404, 'Không tìm thấy bản ghi.');

  return NextResponse.json({ success: true, item: toApi(resource, data) });
}

// DELETE /api/admin/lookups/:resource/:id — xóa hẳn (đơn hàng cũ trên Sheets không bị ảnh hưởng)
export async function DELETE(_request, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const { resource, id, error: paramError } = await resolve(params);
  if (paramError) return paramError;

  const { data, error } = await createAdminClient()
    .from(resource.table)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return dbErrorResponse(resource, error);
  if (!data) return errorJson(404, 'Không tìm thấy bản ghi.');

  return NextResponse.json({ success: true });
}
