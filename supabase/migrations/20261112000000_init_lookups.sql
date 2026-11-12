-- Procure-Track: danh mục dùng cho form nhập hàng
-- Chạy file này trong Supabase Dashboard > SQL Editor,
-- hoặc `supabase link --project-ref <ref>` rồi `supabase db push`.

-- ---------------------------------------------------------------
-- Hàng hóa (SKU + Tên hàng hóa)
-- ---------------------------------------------------------------
create table if not exists public.products (
  id           bigint generated always as identity primary key,
  sku          text not null unique,
  ten_hang_hoa text not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Kênh mua
-- ---------------------------------------------------------------
create table if not exists public.purchase_channels (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Phương thức thanh toán
-- ---------------------------------------------------------------
create table if not exists public.payment_methods (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Row Level Security: chỉ người dùng đã đăng nhập mới được đọc.
-- Thêm / sửa dữ liệu danh mục qua Dashboard (Table Editor) hoặc service role.
-- ---------------------------------------------------------------
alter table public.products          enable row level security;
alter table public.purchase_channels enable row level security;
alter table public.payment_methods   enable row level security;

drop policy if exists "Authenticated users can read active products" on public.products;
create policy "Authenticated users can read active products"
  on public.products for select to authenticated
  using (is_active);

drop policy if exists "Authenticated users can read active channels" on public.purchase_channels;
create policy "Authenticated users can read active channels"
  on public.purchase_channels for select to authenticated
  using (is_active);

drop policy if exists "Authenticated users can read active payment methods" on public.payment_methods;
create policy "Authenticated users can read active payment methods"
  on public.payment_methods for select to authenticated
  using (is_active);

-- ---------------------------------------------------------------
-- Dữ liệu mẫu ban đầu (giữ nguyên các giá trị form đang dùng)
-- ---------------------------------------------------------------
insert into public.purchase_channels (name, sort_order) values
  ('Shopee', 1), ('Lazada', 2), ('TikTok Shop', 3), ('Trực tiếp', 4)
on conflict (name) do nothing;

insert into public.payment_methods (name, sort_order) values
  ('Chuyển khoản', 1), ('Tiền mặt', 2), ('Thẻ tín dụng', 3)
on conflict (name) do nothing;

insert into public.products (sku, ten_hang_hoa) values
  ('SKU001', 'Pin 1')
on conflict (sku) do nothing;
