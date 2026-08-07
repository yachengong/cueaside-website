create index if not exists internal_audit_log_target_occurred_idx
  on public.internal_audit_log (target_user_id, occurred_at desc)
  where target_user_id is not null;
