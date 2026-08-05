-- Supabase creates this event-trigger helper to enable RLS on new public
-- tables. It should only run as an event trigger, never through the public
-- RPC surface.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
