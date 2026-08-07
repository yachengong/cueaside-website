-- Internal Console data is server-only. These tables intentionally live in
-- public because the website uses Supabase's REST endpoint, but RLS is enabled
-- and every browser-facing role is denied all privileges. Only the server-side
-- service role can create, read, or revoke sessions and write audit events.

create table if not exists public.internal_admin_sessions (
  token_hash text primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint internal_admin_sessions_token_hash_format
    check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint internal_admin_sessions_expiry_order
    check (expires_at > created_at)
);

create index if not exists internal_admin_sessions_user_expiry_idx
  on public.internal_admin_sessions (admin_user_id, expires_at desc);

create index if not exists internal_admin_sessions_active_expiry_idx
  on public.internal_admin_sessions (expires_at)
  where revoked_at is null;

create table if not exists public.internal_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  page_number integer,
  occurred_at timestamptz not null default now(),
  constraint internal_audit_log_action_format
    check (action ~ '^[a-z0-9_]{3,64}$'),
  constraint internal_audit_log_page_range
    check (page_number is null or page_number between 1 and 1000000)
);

create index if not exists internal_audit_log_occurred_at_idx
  on public.internal_audit_log (occurred_at desc);

create index if not exists internal_audit_log_admin_occurred_idx
  on public.internal_audit_log (admin_user_id, occurred_at desc);

alter table public.internal_admin_sessions enable row level security;
alter table public.internal_audit_log enable row level security;

revoke all on table public.internal_admin_sessions
  from public, anon, authenticated;
revoke all on table public.internal_audit_log
  from public, anon, authenticated;
revoke all on sequence public.internal_audit_log_id_seq
  from public, anon, authenticated;

grant select, insert, update, delete on table public.internal_admin_sessions
  to service_role;
grant select, insert on table public.internal_audit_log
  to service_role;
grant usage, select on sequence public.internal_audit_log_id_seq
  to service_role;
