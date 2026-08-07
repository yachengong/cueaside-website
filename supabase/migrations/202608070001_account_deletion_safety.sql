-- Stripe cancellation and customer deletion emit webhooks asynchronously.
-- Once the corresponding Auth user has been deleted, a late event must not
-- recreate billing data or fail forever on the auth.users foreign key.
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
  if not exists (select 1 from auth.users where id = p_user_id) then
    return false;
  end if;

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
