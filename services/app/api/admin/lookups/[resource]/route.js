import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase';
import {
  dbErrorResponse,
  errorJson,
  getResource,
  parseBody,
  selectColumns,
  toApi,
} from '@/lib/admin-lookups';

// GET /api/admin/lookups/:resource — toàn bộ danh mục (kể cả đã ngưng dùng)
export async function GET(_request, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const resource = getResource((await params).resource);
  if (!resource) return errorJson(404, 'Danh mục không tồn tại.');

  let query = createAdminClient().from(resource.table).select(selectColumns(resource));
  for (const [column, ascending] of resource.order) query = query.order(column, { ascending });

  const { data, error } = await query;
  if (error) return dbErrorResponse(resource, error);

  return NextResponse.json({ success: true, items: data.map((row) => toApi(resource, row)) });
}

// POST /api/admin/lookups/:resource — thêm mới
export async function POST(request, { params }) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const resource = getResource((await params).resource);
  if (!resource) return errorJson(404, 'Danh mục không tồn tại.');

  const body = await request.json().catch(() => null);
  const { values, error: validationError } = parseBody(resource, body, { partial: false });
  if (validationError) return errorJson(400, validationError);

  const { data, error } = await createAdminClient()
    .from(resource.table)
    .insert(values)
    .select(selectColumns(resource))
    .single();
  if (error) return dbErrorResponse(resource, error);

  return NextResponse.json({ success: true, item: toApi(resource, data) }, { status: 201 });
}
