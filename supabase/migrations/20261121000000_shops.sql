-- Danh sách shop dùng để gợi ý khi nhập đơn hàng.
create table if not exists public.shops (
  id              bigint generated always as identity primary key,
  name            text not null check (btrim(name) <> ''),
  normalized_name text generated always as (lower(btrim(name))) stored unique,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.shops enable row level security;

drop policy if exists "Authenticated users can read active shops" on public.shops;
create policy "Authenticated users can read active shops"
  on public.shops for select to authenticated
  using (is_active);
