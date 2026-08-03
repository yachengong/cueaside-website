create table if not exists public.usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  answer_requests integer not null default 0,
  transcription_requests integer not null default 0,
  realtime_tokens integer not null default 0,
  updated_at bigint not null,
  primary key (user_id, period_start)
);

alter table public.usage_monthly enable row level security;

create or replace function public.consume_monthly_usage(
  p_user_id uuid,
  p_kind text,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_now bigint := floor(extract(epoch from now()));
  v_period_start date := date_trunc('month', current_date)::date;
begin
  if p_kind not in (
    'answer_requests',
    'transcription_requests',
    'realtime_tokens'
  ) or p_limit < 1 then
    raise exception 'invalid usage request';
  end if;

  insert into public.usage_monthly (
    user_id,
    period_start,
    answer_requests,
    transcription_requests,
    realtime_tokens,
    updated_at
  ) values (
    p_user_id,
    v_period_start,
    case when p_kind = 'answer_requests' then 1 else 0 end,
    case when p_kind = 'transcription_requests' then 1 else 0 end,
    case when p_kind = 'realtime_tokens' then 1 else 0 end,
    v_now
  )
  on conflict (user_id, period_start) do update set
    answer_requests = public.usage_monthly.answer_requests
      + case when p_kind = 'answer_requests' then 1 else 0 end,
    transcription_requests = public.usage_monthly.transcription_requests
      + case when p_kind = 'transcription_requests' then 1 else 0 end,
    realtime_tokens = public.usage_monthly.realtime_tokens
      + case when p_kind = 'realtime_tokens' then 1 else 0 end,
    updated_at = v_now
  returning case p_kind
    when 'answer_requests' then answer_requests
    when 'transcription_requests' then transcription_requests
    when 'realtime_tokens' then realtime_tokens
  end into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on table public.usage_monthly from anon, authenticated;
revoke all on function public.consume_monthly_usage(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_monthly_usage(uuid, text, integer)
  to service_role;
