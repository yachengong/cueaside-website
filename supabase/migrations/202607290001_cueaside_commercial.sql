create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text not null default 'inactive',
  price_id text,
  current_period_end bigint,
  cancel_at_period_end boolean not null default false,
  latest_stripe_event_created bigint not null default 0,
  updated_at bigint not null
);

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null,
  processed_at bigint not null
);

create table if not exists public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  answer_requests integer not null default 0,
  transcription_requests integer not null default 0,
  realtime_tokens integer not null default 0,
  updated_at bigint not null,
  primary key (user_id, usage_date)
);

create table if not exists public.rate_limits (
  key text primary key,
  window_started_at bigint not null,
  request_count integer not null default 0,
  updated_at bigint not null
);

alter table public.billing_accounts enable row level security;
alter table public.stripe_events enable row level security;
alter table public.usage_daily enable row level security;
alter table public.rate_limits enable row level security;

create or replace function public.consume_daily_usage(
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
begin
  if p_kind not in (
    'answer_requests',
    'transcription_requests',
    'realtime_tokens'
  ) or p_limit < 1 then
    raise exception 'invalid usage request';
  end if;

  insert into public.usage_daily (
    user_id,
    usage_date,
    answer_requests,
    transcription_requests,
    realtime_tokens,
    updated_at
  ) values (
    p_user_id,
    current_date,
    case when p_kind = 'answer_requests' then 1 else 0 end,
    case when p_kind = 'transcription_requests' then 1 else 0 end,
    case when p_kind = 'realtime_tokens' then 1 else 0 end,
    v_now
  )
  on conflict (user_id, usage_date) do update set
    answer_requests = public.usage_daily.answer_requests
      + case when p_kind = 'answer_requests' then 1 else 0 end,
    transcription_requests = public.usage_daily.transcription_requests
      + case when p_kind = 'transcription_requests' then 1 else 0 end,
    realtime_tokens = public.usage_daily.realtime_tokens
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

create or replace function public.consume_rate_limit(
  p_key text,
  p_maximum integer,
  p_window_seconds integer,
  p_now bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_maximum < 1 or p_window_seconds < 1 or length(p_key) > 300 then
    raise exception 'invalid rate limit request';
  end if;

  insert into public.rate_limits (
    key,
    window_started_at,
    request_count,
    updated_at
  ) values (p_key, p_now, 1, p_now)
  on conflict (key) do update set
    window_started_at = case
      when p_now - public.rate_limits.window_started_at >= p_window_seconds
        then p_now
      else public.rate_limits.window_started_at
    end,
    request_count = case
      when p_now - public.rate_limits.window_started_at >= p_window_seconds
        then 1
      else public.rate_limits.request_count + 1
    end,
    updated_at = p_now
  returning request_count into v_count;

  return v_count <= p_maximum;
end;
$$;

create or replace function public.apply_subscription_update(
  p_user_id uuid,
  p_email text,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_price_id text,
  p_current_period_end bigint,
  p_cancel_at_period_end boolean,
  p_event_created bigint,
  p_updated_at bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.billing_accounts (
    user_id,
    email,
    stripe_customer_id,
    stripe_subscription_id,
    subscription_status,
    price_id,
    current_period_end,
    cancel_at_period_end,
    latest_stripe_event_created,
    updated_at
  ) values (
    p_user_id,
    p_email,
    p_customer_id,
    p_subscription_id,
    p_status,
    p_price_id,
    p_current_period_end,
    coalesce(p_cancel_at_period_end, false),
    p_event_created,
    p_updated_at
  )
  on conflict (user_id) do update set
    email = coalesce(excluded.email, public.billing_accounts.email),
    stripe_customer_id = coalesce(
      excluded.stripe_customer_id,
      public.billing_accounts.stripe_customer_id
    ),
    stripe_subscription_id = coalesce(
      excluded.stripe_subscription_id,
      public.billing_accounts.stripe_subscription_id
    ),
    subscription_status = excluded.subscription_status,
    price_id = coalesce(excluded.price_id, public.billing_accounts.price_id),
    current_period_end = coalesce(
      excluded.current_period_end,
      public.billing_accounts.current_period_end
    ),
    cancel_at_period_end = excluded.cancel_at_period_end,
    latest_stripe_event_created = excluded.latest_stripe_event_created,
    updated_at = excluded.updated_at
  where excluded.latest_stripe_event_created
    >= public.billing_accounts.latest_stripe_event_created;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.consume_daily_usage(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer, integer, bigint)
  from public, anon, authenticated;
revoke all on function public.apply_subscription_update(
  uuid,
  text,
  text,
  text,
  text,
  text,
  bigint,
  boolean,
  bigint,
  bigint
) from public, anon, authenticated;
grant execute on function public.consume_daily_usage(uuid, text, integer)
  to service_role;
grant execute on function public.consume_rate_limit(text, integer, integer, bigint)
  to service_role;
grant execute on function public.apply_subscription_update(
  uuid,
  text,
  text,
  text,
  text,
  text,
  bigint,
  boolean,
  bigint,
  bigint
) to service_role;
