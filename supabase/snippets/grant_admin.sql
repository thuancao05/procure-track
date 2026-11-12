-- Cấp quyền admin cho tài khoản đầu tiên (chạy 1 lần trong Supabase Dashboard > SQL Editor).
-- Sau đó admin có thể tạo / phân quyền user khác ngay trong app (trang "Người dùng").
-- Thay email bên dưới bằng email tài khoản của bạn.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = 'you@example.com';

-- Kiểm tra:
select email, raw_app_meta_data ->> 'role' as role from auth.users order by email;
