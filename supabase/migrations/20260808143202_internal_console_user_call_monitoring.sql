-- Expand the private Console from aggregate answer timing into account-linked,
-- operation-aware model-call monitoring. `account_key` is a server-generated
-- HMAC and cannot be reversed into a Supabase user id without the server
-- secret. No prompt, answer, transcript, Context, State, or provider body is
-- stored.

alter table public.answer_generation_metrics
  add column if not exists operation text not null default 'answer',
  add column if not exists account_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'answer_generation_metrics_operation_check'
      and conrelid = 'public.answer_generation_metrics'::regclass
  ) then
    alter table public.answer_generation_metrics
      add constraint answer_generation_metrics_operation_check
      check (operation in (
        'answer',
        'prep_answer',
        'vision',
        'context_prepare',
        'state_seed',
        'state_update',
        'role_guidance',
        'reply_check'
      ));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'answer_generation_metrics_account_key_check'
      and conrelid = 'public.answer_generation_metrics'::regclass
  ) then
    alter table public.answer_generation_metrics
      add constraint answer_generation_metrics_account_key_check
      check (account_key is null or account_key ~ '^[a-f0-9]{64}$');
  end if;
end $$;

create index if not exists answer_generation_metrics_account_recorded_idx
  on public.answer_generation_metrics (account_key, recorded_at desc, id desc)
  where account_key is not null;

create index if not exists answer_generation_metrics_operation_recorded_idx
  on public.answer_generation_metrics (operation, recorded_at desc, id desc);

-- These are server-only source tables. State the grants explicitly instead of
-- relying on project defaults so SECURITY INVOKER summary functions retain the
-- same least-privilege boundary in every Supabase project.
revoke all on table public.billing_accounts, public.usage_monthly
  from public, anon, authenticated;
grant select on table public.billing_accounts, public.usage_monthly
  to service_role;

create or replace function public.internal_console_usage_summary(
  p_period_start date
) returns table (
  active_subscriptions bigint,
  trialing_subscriptions bigint,
  canceling_subscriptions bigint,
  monthly_active_accounts bigint,
  answer_requests bigint,
  transcription_requests bigint,
  realtime_tokens bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with billing as (
    select
      count(*) filter (
        where subscription_status in ('active', 'trialing')
      )::bigint as active_subscriptions,
      count(*) filter (
        where subscription_status = 'trialing'
      )::bigint as trialing_subscriptions,
      count(*) filter (
        where subscription_status in ('active', 'trialing')
          and cancel_at_period_end
      )::bigint as canceling_subscriptions
    from public.billing_accounts
  ), usage as (
    select
      count(*) filter (
        where answer_requests > 0
          or transcription_requests > 0
          or realtime_tokens > 0
      )::bigint as monthly_active_accounts,
      coalesce(sum(answer_requests), 0)::bigint as answer_requests,
      coalesce(sum(transcription_requests), 0)::bigint
        as transcription_requests,
      coalesce(sum(realtime_tokens), 0)::bigint as realtime_tokens
    from public.usage_monthly
    where period_start = p_period_start
  )
  select
    billing.active_subscriptions,
    billing.trialing_subscriptions,
    billing.canceling_subscriptions,
    usage.monthly_active_accounts,
    usage.answer_requests,
    usage.transcription_requests,
    usage.realtime_tokens
  from billing cross join usage;
$$;

revoke all on function public.internal_console_usage_summary(date)
  from public, anon, authenticated;
grant execute on function public.internal_console_usage_summary(date)
  to service_role;

create or replace function public.internal_console_answer_summary(
  p_since timestamptz,
  p_account_key text,
  p_operation text,
  p_model text,
  p_depth text,
  p_status text
) returns table (
  total_calls bigint,
  completed_calls bigint,
  failed_calls bigint,
  first_readable_p95_ms integer,
  duration_p95_ms integer,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  estimated_cost_micro_usd bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*)::bigint as total_calls,
    count(*) filter (where status = 'completed')::bigint as completed_calls,
    count(*) filter (
      where status in ('failed', 'stream_error')
    )::bigint as failed_calls,
    round(percentile_cont(0.95) within group (
      order by first_readable_ms
    ) filter (
      where status = 'completed' and first_readable_ms is not null
    ))::integer as first_readable_p95_ms,
    round(percentile_cont(0.95) within group (
      order by duration_ms
    ) filter (where status = 'completed'))::integer as duration_p95_ms,
    coalesce(sum(input_tokens), 0)::bigint as input_tokens,
    coalesce(sum(cached_input_tokens), 0)::bigint as cached_input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(reasoning_tokens), 0)::bigint as reasoning_tokens,
    coalesce(sum(estimated_cost_micro_usd), 0)::bigint
      as estimated_cost_micro_usd
  from public.answer_generation_metrics
  where recorded_at >= p_since
    and (p_account_key is null or account_key = p_account_key)
    and (p_operation is null or operation = p_operation)
    and (p_model is null or model = p_model)
    and (p_depth is null or depth = p_depth)
    and (p_status is null or status = p_status);
$$;

revoke all on function public.internal_console_answer_summary(
  timestamptz, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.internal_console_answer_summary(
  timestamptz, text, text, text, text, text
) to service_role;
