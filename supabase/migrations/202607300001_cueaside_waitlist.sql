create table if not exists public.waitlist_signups (
  email text primary key,
  source text not null default 'website',
  created_at bigint not null
);

alter table public.waitlist_signups enable row level security;
