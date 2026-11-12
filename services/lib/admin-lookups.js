import { NextResponse } from 'next/server';

/**
 * Cấu hình các danh mục quản trị.
 * `key` = tên field trong API (camelCase), `column` = cột trong Supabase.
 */
const nameFields = [
  { key: 'name', column: 'name', type: 'text', required: true, label: 'Tên' },
  { key: 'sortOrder', column: 'sort_order', type: 'int', label: 'Thứ tự' },
  { key: 'isActive', column: 'is_active', type: 'bool', label: 'Đang dùng' },
];

export const LOOKUP_RESOURCES = {
  products: {
    table: 'products',
    label: 'Hàng hóa',
    uniqueLabel: 'Mã SKU',
    order: [['sku', true]],
    fields: [
      { key: 'sku', column: 'sku', type: 'text', required: true, label: 'Mã SKU' },
      { key: 'tenHangHoa', column: 'ten_hang_hoa', type: 'text', required: true, label: 'Tên hàng hóa' },
      { key: 'isActive', column: 'is_active', type: 'bool', label: 'Đang dùng' },
    ],
  },
  'purchase-channels': {
    table: 'purchase_channels',
    label: 'Kênh mua',
    uniqueLabel: 'Kênh mua',
    order: [['sort_order', true], ['name', true]],
    fields: nameFields,
  },
  'payment-methods': {
    table: 'payment_methods',
    label: 'Phương thức thanh toán',
    uniqueLabel: 'Phương thức thanh toán',
    order: [['sort_order', true], ['name', true]],
    fields: nameFields,
  },
};

export const errorJson = (status, error) => NextResponse.json({ success: false, error }, { status });

export function getResource(name) {
  return Object.hasOwn(LOOKUP_RESOURCES, name) ? LOOKUP_RESOURCES[name] : null;
}

export function selectColumns(resource) {
  return ['id', ...resource.fields.map((f) => f.column)].join(', ');
}

/** Hàng DB -> object API (camelCase). */
export function toApi(resource, row) {
  const out = { id: row.id };
  for (const f of resource.fields) out[f.key] = row[f.column];
  return out;
}

/**
 * Kiểm tra & chuyển body API -> hàng DB.
 * `partial` = true cho PATCH (chỉ các field được gửi lên).
 * Trả về { values } hoặc { error }.
 */
export function parseBody(resource, body, { partial }) {
  if (!body || typeof body !== 'object') return { error: 'Dữ liệu không hợp lệ.' };

  const values = {};
  for (const f of resource.fields) {
    const present = Object.hasOwn(body, f.key);
    if (!present) {
      if (f.required && !partial) return { error: `Thiếu ${f.label}.` };
      continue;
    }

    const raw = body[f.key];
    if (f.type === 'text') {
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (!v) return { error: `${f.label} không được để trống.` };
      if (v.length > 200) return { error: `${f.label} quá dài (tối đa 200 ký tự).` };
      values[f.column] = v;
    } else if (f.type === 'int') {
      const v = Number(raw);
      if (!Number.isInteger(v)) return { error: `${f.label} phải là số nguyên.` };
      values[f.column] = v;
    } else if (f.type === 'bool') {
      if (typeof raw !== 'boolean') return { error: `${f.label} không hợp lệ.` };
      values[f.column] = raw;
    }
  }

  if (partial && Object.keys(values).length === 0) return { error: 'Không có dữ liệu để cập nhật.' };
  return { values };
}

/** Lỗi Postgres -> response thân thiện. */
export function dbErrorResponse(resource, error) {
  if (error.code === '23505') {
    return errorJson(409, `${resource.uniqueLabel} đã tồn tại.`);
  }
  console.error(`Lỗi Supabase (${resource.table}):`, error);
  return errorJson(500, `Lỗi cơ sở dữ liệu: ${error.message}`);
}

export function parseId(raw) {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
