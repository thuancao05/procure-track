import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Publishable key (sb_publishable_...) hoặc legacy anon key đều dùng được.
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

const serverOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/** Client không gắn user — dùng cho đăng nhập / làm mới phiên / kiểm tra token. */
export function createAuthClient() {
  return createClient(supabaseUrl, supabaseKey, serverOptions);
}

// Secret key (sb_secret_...) hoặc legacy service_role key — CHỈ dùng ở server, bỏ qua RLS.
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
export const isAdminConfigured = Boolean(supabaseUrl && supabaseSecretKey);

/**
 * Client quyền quản trị: quản lý user (auth.admin) và ghi danh mục.
 * Chỉ gọi sau khi đã kiểm tra requireAdmin().
 */
export function createAdminClient() {
  return createClient(supabaseUrl, supabaseSecretKey, serverOptions);
}

/**
 * Client chạy truy vấn với quyền của user đã đăng nhập,
 * để Row Level Security (role `authenticated`) được áp dụng.
 */
export function createUserClient(accessToken) {
  return createClient(supabaseUrl, supabaseKey, {
    ...serverOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
