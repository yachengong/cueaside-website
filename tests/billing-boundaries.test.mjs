import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

import { PLAN_USAGE_LIMITS } from "../lib/server/usage-policy.ts";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL && process.env.REQUIRE_DATABASE_TESTS === "1") {
  throw new Error("REQUIRE_DATABASE_TESTS=1 but TEST_DATABASE_URL is missing");
}

const { Pool } = pg;

function userId(index) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

async function consumeMany(pool, id, kind, limit, attempts) {
  const results = await Promise.all(
    Array.from({ length: attempts }, () =>
      pool.query(
        "select public.consume_monthly_usage($1::uuid, $2::text, $3::integer) as allowed",
        [id, kind, limit],
      ),
    ),
  );
  return results.map((result) => result.rows[0].allowed);
}

test(
  "monthly usage RPC enforces Free and Pro limits atomically under concurrency",
  { skip: !databaseURL, timeout: 60_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseURL, max: 40 });
    try {
      await pool.query(`
        drop table if exists public.usage_monthly cascade;
        drop function if exists public.consume_monthly_usage(uuid, text, integer);
        drop table if exists auth.users cascade;
        do $roles$
        begin
          if not exists (select 1 from pg_roles where rolname = 'anon') then
            create role anon nologin;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin;
          end if;
          if not exists (select 1 from pg_roles where rolname = 'service_role') then
            create role service_role nologin bypassrls;
          else
            alter role service_role bypassrls;
          end if;
        end
        $roles$;
        create schema if not exists auth;
        create table auth.users (id uuid primary key);
      `);
      const commercialMigration = await readFile(
        new URL(
          "../supabase/migrations/202607290001_cueaside_commercial.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const migration = await readFile(
        new URL(
          "../supabase/migrations/202608010001_free_pro_plans.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await pool.query(commercialMigration);
      await pool.query(migration);

      const cases = [
        ["free answer", "answer_requests", PLAN_USAGE_LIMITS.free.answerRequests],
        [
          "free transcription",
          "transcription_requests",
          PLAN_USAGE_LIMITS.free.transcriptionRequests,
        ],
        ["free realtime", "realtime_tokens", PLAN_USAGE_LIMITS.free.realtimeTokens],
        ["pro answer", "answer_requests", PLAN_USAGE_LIMITS.pro.answerRequests],
        [
          "pro transcription",
          "transcription_requests",
          PLAN_USAGE_LIMITS.pro.transcriptionRequests,
        ],
        ["pro realtime", "realtime_tokens", PLAN_USAGE_LIMITS.pro.realtimeTokens],
      ];

      for (const [index, [label, kind, limit]] of cases.entries()) {
        const id = userId(index + 1);
        await pool.query("insert into auth.users (id) values ($1::uuid)", [id]);
        const decisions = await consumeMany(pool, id, kind, limit, limit + 8);
        assert.equal(
          decisions.filter(Boolean).length,
          limit,
          `${label} allowed the wrong number of concurrent requests`,
        );
        assert.equal(
          decisions.filter((value) => !value).length,
          8,
          `${label} failed to reject every request above the limit`,
        );
      }

      const privilege = await pool.query(`
        select
          has_function_privilege(
            'anon',
            'public.consume_monthly_usage(uuid,text,integer)',
            'EXECUTE'
          ) as anon_execute,
          has_function_privilege(
            'authenticated',
            'public.consume_monthly_usage(uuid,text,integer)',
            'EXECUTE'
          ) as authenticated_execute,
          has_function_privilege(
            'service_role',
            'public.consume_monthly_usage(uuid,text,integer)',
            'EXECUTE'
          ) as service_execute,
          (
            select relrowsecurity
            from pg_class
            where oid = 'public.usage_monthly'::regclass
          ) as rls_enabled
      `);
      assert.deepEqual(privilege.rows[0], {
        anon_execute: false,
        authenticated_execute: false,
        service_execute: true,
        rls_enabled: true,
      });

      await assert.rejects(
        pool.query(
          "select public.consume_monthly_usage($1::uuid, 'not_a_kind', 1)",
          [userId(1)],
        ),
        /invalid usage request/,
      );

      const consoleFoundation = await readFile(
        new URL(
          "../supabase/migrations/20260807072221_internal_console_foundation.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const consoleTargetIndex = await readFile(
        new URL(
          "../supabase/migrations/20260807072310_internal_console_target_index.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const answerMetricsMigration = await readFile(
        new URL(
          "../supabase/migrations/20260807131000_answer_generation_metrics.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const consoleRetentionMigration = await readFile(
        new URL(
          "../supabase/migrations/20260807143000_internal_console_retention.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const transcriptionDiagnosticsMigration = await readFile(
        new URL(
          "../supabase/migrations/20260807150000_transcription_diagnostic_metrics.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const userCallMonitoringMigration = await readFile(
        new URL(
          "../supabase/migrations/20260808143202_internal_console_user_call_monitoring.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await pool.query(consoleFoundation);
      await pool.query(consoleTargetIndex);
      await pool.query(answerMetricsMigration);
      await pool.query(consoleRetentionMigration);
      await pool.query(transcriptionDiagnosticsMigration);
      await pool.query(userCallMonitoringMigration);

      const consolePrivileges = await pool.query(`
        select
          (
            select relrowsecurity
            from pg_class
            where oid = 'public.internal_admin_sessions'::regclass
          ) as sessions_rls,
          (
            select relrowsecurity
            from pg_class
            where oid = 'public.internal_audit_log'::regclass
          ) as audit_rls,
          has_table_privilege(
            'anon',
            'public.internal_admin_sessions',
            'SELECT'
          ) as anon_sessions_select,
          has_table_privilege(
            'authenticated',
            'public.internal_admin_sessions',
            'SELECT'
          ) as authenticated_sessions_select,
          has_table_privilege(
            'anon',
            'public.internal_audit_log',
            'SELECT'
          ) as anon_audit_select,
          has_table_privilege(
            'authenticated',
            'public.internal_audit_log',
            'SELECT'
          ) as authenticated_audit_select,
          has_table_privilege(
            'service_role',
            'public.internal_admin_sessions',
            'SELECT'
          ) as service_sessions_select,
          has_table_privilege(
            'service_role',
            'public.internal_admin_sessions',
            'INSERT'
          ) as service_sessions_insert,
          has_table_privilege(
            'service_role',
            'public.internal_admin_sessions',
            'UPDATE'
          ) as service_sessions_update,
          has_table_privilege(
            'service_role',
            'public.internal_admin_sessions',
            'DELETE'
          ) as service_sessions_delete,
          has_table_privilege(
            'service_role',
            'public.internal_audit_log',
            'SELECT'
          ) as service_audit_select,
          has_table_privilege(
            'service_role',
            'public.internal_audit_log',
            'INSERT'
          ) as service_audit_insert,
          has_table_privilege(
            'service_role',
            'public.internal_audit_log',
            'DELETE'
          ) as service_audit_delete,
          has_sequence_privilege(
            'service_role',
            'public.internal_audit_log_id_seq',
            'USAGE'
          ) as service_audit_sequence_usage,
          (
            select relrowsecurity
            from pg_class
            where oid = 'public.answer_generation_metrics'::regclass
          ) as metrics_rls,
          has_table_privilege(
            'anon',
            'public.answer_generation_metrics',
            'SELECT'
          ) as anon_metrics_select,
          has_table_privilege(
            'authenticated',
            'public.answer_generation_metrics',
            'SELECT'
          ) as authenticated_metrics_select,
          has_table_privilege(
            'anon',
            'public.answer_generation_metrics',
            'INSERT'
          ) as anon_metrics_insert,
          has_table_privilege(
            'authenticated',
            'public.answer_generation_metrics',
            'INSERT'
          ) as authenticated_metrics_insert,
          has_table_privilege(
            'anon',
            'public.answer_generation_metrics',
            'DELETE'
          ) as anon_metrics_delete,
          has_table_privilege(
            'authenticated',
            'public.answer_generation_metrics',
            'DELETE'
          ) as authenticated_metrics_delete,
          has_table_privilege(
            'service_role',
            'public.answer_generation_metrics',
            'SELECT'
          ) as service_metrics_select,
          has_table_privilege(
            'service_role',
            'public.answer_generation_metrics',
            'INSERT'
          ) as service_metrics_insert,
          has_table_privilege(
            'service_role',
            'public.answer_generation_metrics',
            'DELETE'
          ) as service_metrics_delete,
          has_sequence_privilege(
            'service_role',
            'public.answer_generation_metrics_id_seq',
            'USAGE'
          ) as service_metrics_sequence_usage,
          has_function_privilege(
            'anon',
            'private.prune_answer_generation_metrics()',
            'EXECUTE'
          ) as anon_metrics_execute,
          has_function_privilege(
            'authenticated',
            'private.prune_answer_generation_metrics()',
            'EXECUTE'
          ) as authenticated_metrics_execute,
          has_function_privilege(
            'service_role',
            'private.prune_answer_generation_metrics()',
            'EXECUTE'
          ) as service_metrics_execute,
          has_function_privilege(
            'anon',
            'private.prune_internal_console_records()',
            'EXECUTE'
          ) as anon_console_retention_execute,
          has_function_privilege(
            'authenticated',
            'private.prune_internal_console_records()',
            'EXECUTE'
          ) as authenticated_console_retention_execute,
          has_function_privilege(
            'service_role',
            'private.prune_internal_console_records()',
            'EXECUTE'
          ) as service_console_retention_execute
      `);
      assert.deepEqual(consolePrivileges.rows[0], {
        sessions_rls: true,
        audit_rls: true,
        anon_sessions_select: false,
        authenticated_sessions_select: false,
        anon_audit_select: false,
        authenticated_audit_select: false,
        service_sessions_select: true,
        service_sessions_insert: true,
        service_sessions_update: true,
        service_sessions_delete: true,
        service_audit_select: true,
        service_audit_insert: true,
        service_audit_delete: true,
        service_audit_sequence_usage: true,
        metrics_rls: true,
        anon_metrics_select: false,
        authenticated_metrics_select: false,
        anon_metrics_insert: false,
        authenticated_metrics_insert: false,
        anon_metrics_delete: false,
        authenticated_metrics_delete: false,
        service_metrics_select: true,
        service_metrics_insert: true,
        service_metrics_delete: true,
        service_metrics_sequence_usage: true,
        anon_metrics_execute: false,
        authenticated_metrics_execute: false,
        service_metrics_execute: true,
        anon_console_retention_execute: false,
        authenticated_console_retention_execute: false,
        service_console_retention_execute: true,
      });

      const summaryPrivileges = await pool.query(`
        select
          has_function_privilege(
            'anon',
            'public.internal_console_usage_summary(date)',
            'EXECUTE'
          ) as anon_usage_summary,
          has_function_privilege(
            'authenticated',
            'public.internal_console_usage_summary(date)',
            'EXECUTE'
          ) as authenticated_usage_summary,
          has_function_privilege(
            'service_role',
            'public.internal_console_usage_summary(date)',
            'EXECUTE'
          ) as service_usage_summary,
          has_function_privilege(
            'anon',
            'public.internal_console_answer_summary(timestamptz,text,text,text,text,text)',
            'EXECUTE'
          ) as anon_answer_summary,
          has_function_privilege(
            'authenticated',
            'public.internal_console_answer_summary(timestamptz,text,text,text,text,text)',
            'EXECUTE'
          ) as authenticated_answer_summary,
          has_function_privilege(
            'service_role',
            'public.internal_console_answer_summary(timestamptz,text,text,text,text,text)',
            'EXECUTE'
          ) as service_answer_summary,
          has_table_privilege(
            'anon',
            'public.usage_monthly',
            'SELECT'
          ) as anon_usage_select,
          has_table_privilege(
            'authenticated',
            'public.billing_accounts',
            'SELECT'
          ) as authenticated_billing_select
      `);
      assert.deepEqual(summaryPrivileges.rows[0], {
        anon_usage_summary: false,
        authenticated_usage_summary: false,
        service_usage_summary: true,
        anon_answer_summary: false,
        authenticated_answer_summary: false,
        service_answer_summary: true,
        anon_usage_select: false,
        authenticated_billing_select: false,
      });

      const transcriptionPrivileges = await pool.query(`
        select
          (
            select relrowsecurity
            from pg_class
            where oid = 'public.transcription_diagnostic_metrics'::regclass
          ) as metrics_rls,
          has_table_privilege(
            'anon',
            'public.transcription_diagnostic_metrics',
            'SELECT, INSERT, DELETE'
          ) as anon_access,
          has_table_privilege(
            'authenticated',
            'public.transcription_diagnostic_metrics',
            'SELECT, INSERT, DELETE'
          ) as authenticated_access,
          has_table_privilege(
            'service_role',
            'public.transcription_diagnostic_metrics',
            'SELECT, INSERT, DELETE'
          ) as service_access,
          has_sequence_privilege(
            'service_role',
            'public.transcription_diagnostic_metrics_id_seq',
            'USAGE'
          ) as service_sequence_usage,
          has_function_privilege(
            'anon',
            'private.prune_transcription_diagnostic_metrics()',
            'EXECUTE'
          ) as anon_retention_execute,
          has_function_privilege(
            'authenticated',
            'private.prune_transcription_diagnostic_metrics()',
            'EXECUTE'
          ) as authenticated_retention_execute,
          has_function_privilege(
            'service_role',
            'private.prune_transcription_diagnostic_metrics()',
            'EXECUTE'
          ) as service_retention_execute
      `);
      assert.deepEqual(transcriptionPrivileges.rows[0], {
        metrics_rls: true,
        anon_access: false,
        authenticated_access: false,
        service_access: true,
        service_sequence_usage: true,
        anon_retention_execute: false,
        authenticated_retention_execute: false,
        service_retention_execute: true,
      });

      const consolePolicies = await pool.query(`
        select count(*)::integer as count
        from pg_policies
        where schemaname = 'public'
          and tablename in (
            'internal_admin_sessions',
            'internal_audit_log',
            'answer_generation_metrics',
            'transcription_diagnostic_metrics'
          )
      `);
      assert.equal(consolePolicies.rows[0].count, 0);

      const contentColumns = await pool.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in (
            'internal_admin_sessions',
            'internal_audit_log',
            'answer_generation_metrics',
            'transcription_diagnostic_metrics'
          )
          and column_name ~* '(audio|transcript|question|answer|prompt|content|context|resume|note|message)'
      `);
      assert.deepEqual(contentColumns.rows, []);

      const consoleIndexes = await pool.query(`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname in (
            'internal_audit_log_target_occurred_idx',
            'answer_generation_metrics_account_recorded_idx',
            'answer_generation_metrics_operation_recorded_idx',
            'answer_generation_metrics_recorded_id_idx',
            'transcription_diagnostic_metrics_recorded_id_idx'
          )
        order by indexname
      `);
      assert.deepEqual(consoleIndexes.rows, [
        { indexname: "answer_generation_metrics_account_recorded_idx" },
        { indexname: "answer_generation_metrics_operation_recorded_idx" },
        { indexname: "answer_generation_metrics_recorded_id_idx" },
        { indexname: "internal_audit_log_target_occurred_idx" },
        { indexname: "transcription_diagnostic_metrics_recorded_id_idx" },
      ]);

      await pool.query(`
        insert into public.transcription_diagnostic_metrics (
          deployment,
          kind,
          stream_role,
          capture_source,
          delivery,
          model,
          language,
          disposition,
          duration_ms,
          voiced_ms,
          peak_rms_ppm,
          silence_threshold_ppm,
          recorded_at
        ) values (
          'production',
          'capture',
          'spoken_reply',
          'input',
          'realtime',
          'deepgram-nova-3',
          'en',
          'submitted',
          4200,
          2600,
          31000,
          10000,
          now() - interval '31 days'
        )
      `);
      await pool.query("begin");
      try {
        await pool.query("set local role service_role");
        await pool.query(`
          insert into public.transcription_diagnostic_metrics (
            deployment,
            kind,
            stream_role,
            capture_source,
            delivery,
            model,
            language,
            disposition
          ) values (
            'production',
            'result',
            'spoken_reply',
            'unknown',
            'realtime',
            'deepgram-nova-3',
            'en',
            'completed'
          )
        `);
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
      const storedTranscriptionDiagnostics = await pool.query(`
        select kind, stream_role, model, disposition, duration_ms
        from public.transcription_diagnostic_metrics
        order by recorded_at desc
      `);
      assert.deepEqual(storedTranscriptionDiagnostics.rows, [{
        kind: "result",
        stream_role: "spoken_reply",
        model: "deepgram-nova-3",
        disposition: "completed",
        duration_ms: null,
      }]);
      await assert.rejects(
        pool.query(`
          insert into public.transcription_diagnostic_metrics (
            deployment,
            kind,
            stream_role,
            capture_source,
            delivery,
            model,
            language,
            disposition,
            duration_ms
          ) values (
            'production',
            'result',
            'question',
            'unknown',
            'file',
            'gpt-4o-transcribe',
            'en',
            'completed',
            100
          )
        `),
        /transcription_diagnostic_metrics_shape_check/,
      );

      await pool.query(
        `insert into public.answer_generation_metrics (
          deployment,
          model,
          depth,
          reasoning_effort,
          service_tier,
          status,
          http_status,
          first_readable_ms,
          duration_ms,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          reasoning_tokens,
          estimated_cost_micro_usd,
          pricing_version,
          recorded_at
        ) values (
          'production',
          'gpt-5.6-terra',
          'balanced',
          'none',
          'standard',
          'completed',
          200,
          500,
          900,
          1000,
          200,
          100,
          0,
          3000,
          '2026-07-30',
          now()
        )`,
      );
      await pool.query(`
        update public.answer_generation_metrics
        set recorded_at = now() - interval '31 days'
        where model = 'gpt-5.6-terra'
      `);
      // The retention trigger should run with the same service role used by
      // the server-side REST client, not with the test's postgres owner.
      await pool.query("begin");
      try {
        await pool.query("set local role service_role");
        await pool.query(
          `insert into public.answer_generation_metrics (
          deployment,
          operation,
          account_key,
          model,
          depth,
          reasoning_effort,
          service_tier,
          status,
          http_status,
          first_readable_ms,
          duration_ms,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          reasoning_tokens,
          estimated_cost_micro_usd,
          pricing_version
        ) values (
          'production',
          'state_update',
          '${"a".repeat(64)}',
          'gpt-5.6-sol',
          'thinking',
          'medium',
          'fast',
          'completed',
          200,
          9000,
          12000,
          6000,
          0,
          700,
          500,
          52000,
          '2026-07-30'
        )`,
        );
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
      const storedMetrics = await pool.query(`
        select
          deployment,
          operation,
          account_key,
          model,
          depth,
          service_tier,
          first_readable_ms,
          duration_ms,
          input_tokens,
          output_tokens,
          estimated_cost_micro_usd
        from public.answer_generation_metrics
        order by recorded_at desc
      `);
      assert.deepEqual(storedMetrics.rows, [{
        deployment: "production",
        operation: "state_update",
        account_key: "a".repeat(64),
        model: "gpt-5.6-sol",
        depth: "thinking",
        service_tier: "fast",
        first_readable_ms: 9_000,
        duration_ms: 12_000,
        input_tokens: 6_000,
        output_tokens: 700,
        estimated_cost_micro_usd: "52000",
      }]);
      await pool.query("begin");
      try {
        await pool.query("set local role service_role");
        const summary = await pool.query(
          `select * from public.internal_console_answer_summary(
            now() - interval '1 hour',
            $1,
            'state_update',
            'gpt-5.6-sol',
            'thinking',
            'completed'
          )`,
          ["a".repeat(64)],
        );
        assert.deepEqual(summary.rows, [{
          total_calls: "1",
          completed_calls: "1",
          failed_calls: "0",
          first_readable_p95_ms: 9_000,
          duration_p95_ms: 12_000,
          input_tokens: "6000",
          cached_input_tokens: "0",
          output_tokens: "700",
          reasoning_tokens: "500",
          estimated_cost_micro_usd: "52000",
        }]);
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
      await assert.rejects(
        pool.query(
          `insert into public.answer_generation_metrics (
            deployment,
            operation,
            account_key,
            model,
            depth,
            reasoning_effort,
            service_tier,
            status,
            http_status,
            duration_ms,
            pricing_version
          ) values (
            'production',
            'untrusted-operation',
            'not-a-hash',
            'gpt-5.6-terra',
            'balanced',
            'none',
            'standard',
            'failed',
            500,
            100,
            '2026-07-30'
          )`,
        ),
        /answer_generation_metrics_(operation|account_key)_check/,
      );
      await assert.rejects(
        pool.query(
          `insert into public.answer_generation_metrics (
            deployment,
            model,
            depth,
            reasoning_effort,
            service_tier,
            status,
            http_status,
            first_readable_ms,
            duration_ms,
            input_tokens,
            cached_input_tokens,
            output_tokens,
            reasoning_tokens,
            estimated_cost_micro_usd,
            pricing_version
          ) values (
            'production',
            'invented-model',
            'balanced',
            'none',
            'standard',
            'completed',
            200,
            100,
            200,
            10,
            0,
            10,
            0,
            1,
            '2026-07-30'
          )`,
        ),
        /answer_generation_metrics_model_check/,
      );

      const adminId = userId(1);
      await pool.query(
        `insert into public.internal_admin_sessions
          (token_hash, admin_user_id, created_at, expires_at)
         values (
           $1,
           $2::uuid,
           now() - interval '10 days',
           now() - interval '9 days'
         )`,
        ["c".repeat(64), adminId],
      );
      await pool.query(
        `insert into public.internal_audit_log
          (admin_user_id, action, page_number, occurred_at)
         values (
           $1::uuid,
           'console_viewed',
           1,
           now() - interval '91 days'
         )`,
        [adminId],
      );
      await pool.query("begin");
      try {
        await pool.query("set local role service_role");
        await pool.query(
          `insert into public.internal_audit_log
            (admin_user_id, action, page_number)
           values ($1::uuid, 'answer_metrics_viewed', 1)`,
          [adminId],
        );
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }
      const retainedConsoleRecords = await pool.query(`
        select
          (select count(*)::integer
             from public.internal_admin_sessions
            where token_hash = '${"c".repeat(64)}') as old_sessions,
          (select count(*)::integer
             from public.internal_audit_log
            where occurred_at < now() - interval '90 days') as old_audit
      `);
      assert.deepEqual(retainedConsoleRecords.rows[0], {
        old_sessions: 0,
        old_audit: 0,
      });
      await pool.query(
        `insert into public.internal_admin_sessions
          (token_hash, admin_user_id, expires_at)
         values ($1, $2::uuid, now() + interval '8 hours')`,
        ["a".repeat(64), adminId],
      );
      await pool.query(
        `insert into public.internal_audit_log
          (admin_user_id, action, page_number)
         values ($1::uuid, 'login_succeeded', 1)`,
        [adminId],
      );

      await assert.rejects(
        pool.query(
          `insert into public.internal_admin_sessions
            (token_hash, admin_user_id, expires_at)
           values ('not-a-hash', $1::uuid, now() + interval '8 hours')`,
          [adminId],
        ),
        /internal_admin_sessions_token_hash_format/,
      );
      await assert.rejects(
        pool.query(
          `insert into public.internal_admin_sessions
            (token_hash, admin_user_id, expires_at)
           values ($1, $2::uuid, now() - interval '1 hour')`,
          ["b".repeat(64), adminId],
        ),
        /internal_admin_sessions_expiry_order/,
      );
      await assert.rejects(
        pool.query(
          `insert into public.internal_audit_log
            (admin_user_id, action, page_number)
           values ($1::uuid, 'INVALID ACTION', 1)`,
          [adminId],
        ),
        /internal_audit_log_action_format/,
      );
      await assert.rejects(
        pool.query(
          `insert into public.internal_audit_log
            (admin_user_id, action, page_number)
           values ($1::uuid, 'console_viewed', 0)`,
          [adminId],
        ),
        /internal_audit_log_page_range/,
      );
    } finally {
      await pool.end();
    }
  },
);
