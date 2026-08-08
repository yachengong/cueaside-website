-- Bound the private Console's operational metadata. No conversation content is
-- stored here; this retention policy limits even admin access history and
-- expired opaque sessions.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

grant delete on table public.internal_audit_log to service_role;

-- A deterministic tie-breaker prevents duplicate or skipped rows when several
-- streams finish in the same timestamp and the operator changes pages.
create index if not exists answer_generation_metrics_recorded_id_idx
  on public.answer_generation_metrics (recorded_at desc, id desc);

create or replace function private.prune_internal_console_records()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.internal_admin_sessions
  where
    expires_at < now() - interval '7 days'
    or revoked_at < now() - interval '7 days';

  delete from public.internal_audit_log
  where occurred_at < now() - interval '90 days';

  return null;
end;
$$;

revoke all on function private.prune_internal_console_records()
  from public, anon, authenticated;
grant execute on function private.prune_internal_console_records()
  to service_role;

drop trigger if exists internal_console_records_prune
  on public.internal_audit_log;
create trigger internal_console_records_prune
after insert on public.internal_audit_log
for each statement
execute function private.prune_internal_console_records();
