-- Development-only snapshots for diagnosing CueAside's bounded conversation
-- memory and Project State transitions. These records can contain interview
-- text, so Production never accepts them, browser roles have no privileges,
-- and every row expires after seven days.

create table if not exists public.internal_session_diagnostic_snapshots (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  deployment text not null,
  session_key text not null,
  active_project_id text not null,
  state_updated_at timestamptz,
  estimated_input_tokens integer,
  seed_facts jsonb not null default '[]'::jsonb,
  canonical_facts jsonb not null default '[]'::jsonb,
  scenario_state jsonb,
  temporary_claims jsonb not null default '[]'::jsonb,
  foreign_project_mentions jsonb not null default '[]'::jsonb,
  recent_turns jsonb not null default '[]'::jsonb,
  rejected_claims jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint internal_session_diagnostics_deployment_check
    check (deployment in ('preview', 'development')),
  constraint internal_session_diagnostics_session_key_check
    check (session_key ~ '^[a-f0-9]{64}$'),
  constraint internal_session_diagnostics_project_check
    check (
      char_length(active_project_id) between 1 and 96
      and active_project_id ~ '^[a-z0-9._-]+$'
    ),
  constraint internal_session_diagnostics_token_check
    check (
      estimated_input_tokens is null
      or estimated_input_tokens between 0 and 1000000
    ),
  constraint internal_session_diagnostics_json_shapes_check
    check (
      jsonb_typeof(seed_facts) = 'array'
      and jsonb_typeof(canonical_facts) = 'array'
      and (scenario_state is null or jsonb_typeof(scenario_state) = 'object')
      and jsonb_typeof(temporary_claims) = 'array'
      and jsonb_typeof(foreign_project_mentions) = 'array'
      and jsonb_typeof(recent_turns) = 'array'
      and jsonb_typeof(rejected_claims) = 'object'
    ),
  constraint internal_session_diagnostics_payload_size_check
    check (
      octet_length(seed_facts::text)
      + octet_length(canonical_facts::text)
      + coalesce(octet_length(scenario_state::text), 0)
      + octet_length(temporary_claims::text)
      + octet_length(foreign_project_mentions::text)
      + octet_length(recent_turns::text)
      + octet_length(rejected_claims::text)
      <= 200000
    ),
  constraint internal_session_diagnostics_expiry_check
    check (expires_at > recorded_at and expires_at <= recorded_at + interval '8 days')
);

create index if not exists internal_session_diagnostics_recorded_id_idx
  on public.internal_session_diagnostic_snapshots (recorded_at desc, id desc);

create index if not exists internal_session_diagnostics_session_recorded_idx
  on public.internal_session_diagnostic_snapshots
    (session_key, recorded_at desc, id desc);

alter table public.internal_session_diagnostic_snapshots
  enable row level security;

revoke all on table public.internal_session_diagnostic_snapshots
  from public, anon, authenticated;
revoke all on sequence public.internal_session_diagnostic_snapshots_id_seq
  from public, anon, authenticated;

grant select, insert, delete
  on table public.internal_session_diagnostic_snapshots
  to service_role;
grant usage, select
  on sequence public.internal_session_diagnostic_snapshots_id_seq
  to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.prune_internal_session_diagnostics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.internal_session_diagnostic_snapshots
  where expires_at < now();
  return null;
end;
$$;

revoke all on function private.prune_internal_session_diagnostics()
  from public, anon, authenticated;
grant execute on function private.prune_internal_session_diagnostics()
  to service_role;

drop trigger if exists internal_session_diagnostics_prune
  on public.internal_session_diagnostic_snapshots;
create trigger internal_session_diagnostics_prune
after insert on public.internal_session_diagnostic_snapshots
for each statement
execute function private.prune_internal_session_diagnostics();
