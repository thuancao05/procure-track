-- System-level Google OAuth connection managed by administrators.
-- The refresh token is encrypted before it is stored by the backend.
create table if not exists public.google_oauth_connections (
  id smallint primary key default 1 check (id = 1),
  refresh_token_ciphertext text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  disabled boolean not null default false
);

alter table public.google_oauth_connections enable row level security;

-- No client-side policy: only the backend service-role client may access this table.
