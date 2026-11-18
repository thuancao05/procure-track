-- Chỉ cho phép một lựa chọn mặc định trong mỗi danh mục.
alter table public.purchase_channels
  add column if not exists is_default boolean not null default false;

alter table public.payment_methods
  add column if not exists is_default boolean not null default false;

create unique index if not exists purchase_channels_single_default_idx
  on public.purchase_channels (is_default)
  where is_default = true;

create unique index if not exists payment_methods_single_default_idx
  on public.payment_methods (is_default)
  where is_default = true;
