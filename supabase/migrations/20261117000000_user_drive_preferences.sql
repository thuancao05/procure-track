-- Store each authenticated user's default Drive folder and spreadsheet.
create table if not exists public.user_drive_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_folder_id text,
  default_spreadsheet_id text,
  updated_at timestamptz not null default now()
);

alter table public.user_drive_preferences enable row level security;

drop policy if exists "Users can read their own Drive preferences" on public.user_drive_preferences;
create policy "Users can read their own Drive preferences"
  on public.user_drive_preferences for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own Drive preferences" on public.user_drive_preferences;
create policy "Users can insert their own Drive preferences"
  on public.user_drive_preferences for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Drive preferences" on public.user_drive_preferences;
create policy "Users can update their own Drive preferences"
  on public.user_drive_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
