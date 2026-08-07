-- Content-free transcription diagnostics for the private Console. Each row is
-- either a signal measurement or a closed transcription outcome. There is no
-- account, session, filename, audio, transcript, question, answer, prompt, or
-- provider-response field.

create table if not exists public.transcription_diagnostic_metrics (
  id bigint generated always as identity primary key,
  recorded_at timestamptz not null default now(),
  deployment text not null,
  kind text not null,
  stream_role text not null,
  capture_source text not null,
  delivery text not null,
  model text not null,
  language text not null,
  disposition text not null,
  duration_ms integer,
  voiced_ms integer,
  peak_rms_ppm integer,
  silence_threshold_ppm integer,
  constraint transcription_diagnostic_metrics_deployment_check
    check (deployment in ('production', 'preview', 'development')),
  constraint transcription_diagnostic_metrics_kind_check
    check (kind in ('capture', 'result')),
  constraint transcription_diagnostic_metrics_role_check
    check (stream_role in ('question', 'spoken_reply')),
  constraint transcription_diagnostic_metrics_source_check
    check (capture_source in ('system', 'input', 'unknown')),
  constraint transcription_diagnostic_metrics_delivery_check
    check (delivery in ('realtime', 'file')),
  constraint transcription_diagnostic_metrics_model_check
    check (model in (
      'deepgram-nova-3',
      'gpt-4o-transcribe',
      'gpt-4o-mini-transcribe',
      'gpt-realtime-whisper'
    )),
  constraint transcription_diagnostic_metrics_language_check
    check (language in (
      'auto', 'en', 'zh', 'es', 'fr', 'de',
      'ja', 'ko', 'pt', 'it', 'hi', 'ar'
    )),
  constraint transcription_diagnostic_metrics_disposition_check
    check (disposition in (
      'submitted',
      'submitted_on_stop',
      'discarded_write_failure',
      'discarded_silence',
      'discarded_manual_too_short',
      'discarded_below_minimum_voice',
      'completed',
      'empty',
      'failed',
      'language_review',
      'cancelled'
    )),
  constraint transcription_diagnostic_metrics_numeric_bounds_check
    check (
      (duration_ms is null or duration_ms between 0 and 300000)
      and (voiced_ms is null or voiced_ms between 0 and 300000)
      and (peak_rms_ppm is null or peak_rms_ppm between 0 and 2000000)
      and (
        silence_threshold_ppm is null
        or silence_threshold_ppm between 0 and 200000
      )
      and (duration_ms is null or voiced_ms is null or voiced_ms <= duration_ms)
    ),
  constraint transcription_diagnostic_metrics_shape_check
    check (
      (
        kind = 'capture'
        and capture_source in ('system', 'input')
        and disposition in (
          'submitted',
          'submitted_on_stop',
          'discarded_write_failure',
          'discarded_silence',
          'discarded_manual_too_short',
          'discarded_below_minimum_voice'
        )
        and duration_ms is not null
        and voiced_ms is not null
        and peak_rms_ppm is not null
        and silence_threshold_ppm is not null
      )
      or (
        kind = 'result'
        and capture_source = 'unknown'
        and disposition in (
          'completed', 'empty', 'failed', 'language_review', 'cancelled'
        )
        and duration_ms is null
        and voiced_ms is null
        and peak_rms_ppm is null
        and silence_threshold_ppm is null
      )
    ),
  constraint transcription_diagnostic_metrics_delivery_model_check
    check (
      (
        delivery = 'realtime'
        and model in ('deepgram-nova-3', 'gpt-realtime-whisper')
      )
      or (
        delivery = 'file'
        and model in ('gpt-4o-transcribe', 'gpt-4o-mini-transcribe')
      )
    )
);

create index if not exists transcription_diagnostic_metrics_recorded_id_idx
  on public.transcription_diagnostic_metrics (recorded_at desc, id desc);

alter table public.transcription_diagnostic_metrics enable row level security;

revoke all on table public.transcription_diagnostic_metrics
  from public, anon, authenticated;
revoke all on sequence public.transcription_diagnostic_metrics_id_seq
  from public, anon, authenticated, service_role;
grant select, insert, delete on table public.transcription_diagnostic_metrics
  to service_role;
grant usage, select on sequence public.transcription_diagnostic_metrics_id_seq
  to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.prune_transcription_diagnostic_metrics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.transcription_diagnostic_metrics
  where recorded_at < now() - interval '30 days';
  return null;
end;
$$;

revoke all on function private.prune_transcription_diagnostic_metrics()
  from public, anon, authenticated;
grant execute on function private.prune_transcription_diagnostic_metrics()
  to service_role;

drop trigger if exists transcription_diagnostic_metrics_prune
  on public.transcription_diagnostic_metrics;
create trigger transcription_diagnostic_metrics_prune
after insert on public.transcription_diagnostic_metrics
for each statement
execute function private.prune_transcription_diagnostic_metrics();
