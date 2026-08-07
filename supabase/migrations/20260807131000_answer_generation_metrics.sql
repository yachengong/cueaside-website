-- Content-free answer performance telemetry for the private Console. This
-- table intentionally has no user, account, session, prompt, transcript,
-- question, answer, context, or provider-response column.

create table if not exists public.answer_generation_metrics (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null default now(),
  deployment text not null,
  model text not null,
  depth text not null,
  reasoning_effort text not null,
  service_tier text not null,
  status text not null,
  http_status smallint not null,
  first_readable_ms integer,
  duration_ms integer not null,
  input_tokens integer not null,
  cached_input_tokens integer not null,
  output_tokens integer not null,
  reasoning_tokens integer not null,
  estimated_cost_micro_usd bigint not null,
  pricing_version text not null,
  constraint answer_generation_metrics_deployment_check
    check (deployment in ('production', 'preview', 'development')),
  constraint answer_generation_metrics_model_check
    check (model in ('gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol')),
  constraint answer_generation_metrics_depth_check
    check (depth in ('instinct', 'balanced', 'precise', 'thinking')),
  constraint answer_generation_metrics_effort_check
    check (reasoning_effort in ('none', 'low', 'medium')),
  constraint answer_generation_metrics_tier_check
    check (service_tier in ('standard', 'fast')),
  constraint answer_generation_metrics_status_check
    check (status in (
      'completed',
      'incomplete',
      'failed',
      'cancelled',
      'stream_error',
      'ended'
    )),
  constraint answer_generation_metrics_http_status_check
    check (http_status between 0 and 599),
  constraint answer_generation_metrics_first_readable_check
    check (first_readable_ms is null or first_readable_ms between 0 and 300000),
  constraint answer_generation_metrics_duration_check
    check (duration_ms between 0 and 300000),
  constraint answer_generation_metrics_latency_order_check
    check (first_readable_ms is null or first_readable_ms <= duration_ms),
  constraint answer_generation_metrics_token_bounds_check
    check (
      input_tokens between 0 and 100000000
      and cached_input_tokens between 0 and input_tokens
      and output_tokens between 0 and 100000000
      and reasoning_tokens between 0 and output_tokens
    ),
  constraint answer_generation_metrics_cost_check
    check (estimated_cost_micro_usd between 0 and 1000000000000),
  constraint answer_generation_metrics_pricing_version_check
    check (pricing_version ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$')
);

create index if not exists answer_generation_metrics_recorded_at_idx
  on public.answer_generation_metrics (recorded_at desc);

alter table public.answer_generation_metrics enable row level security;

revoke all on table public.answer_generation_metrics
  from public, anon, authenticated;
revoke all on sequence public.answer_generation_metrics_id_seq
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.answer_generation_metrics
  to service_role;
grant usage, select on sequence public.answer_generation_metrics_id_seq
  to service_role;

-- Retention runs inside Postgres after a trusted server insert. Keeping this
-- ordinary invoker function in a non-exposed schema avoids adding a
-- privileged RPC to the public Data API surface.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.prune_answer_generation_metrics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.answer_generation_metrics
  where recorded_at < now() - interval '30 days';
  return null;
end;
$$;

revoke all on function private.prune_answer_generation_metrics()
  from public, anon, authenticated;
grant execute on function private.prune_answer_generation_metrics()
  to service_role;

drop trigger if exists answer_generation_metrics_prune
  on public.answer_generation_metrics;
create trigger answer_generation_metrics_prune
after insert on public.answer_generation_metrics
for each statement
execute function private.prune_answer_generation_metrics();
