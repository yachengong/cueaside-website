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
            create role service_role nologin;
          end if;
        end
        $roles$;
        create schema if not exists auth;
        create table auth.users (id uuid primary key);
      `);
      const migration = await readFile(
        new URL(
          "../supabase/migrations/202608010001_free_pro_plans.sql",
          import.meta.url,
        ),
        "utf8",
      );
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
      await pool.query(consoleFoundation);
      await pool.query(consoleTargetIndex);

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
          has_sequence_privilege(
            'service_role',
            'public.internal_audit_log_id_seq',
            'USAGE'
          ) as service_audit_sequence_usage
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
        service_audit_sequence_usage: true,
      });

      const consolePolicies = await pool.query(`
        select count(*)::integer as count
        from pg_policies
        where schemaname = 'public'
          and tablename in ('internal_admin_sessions', 'internal_audit_log')
      `);
      assert.equal(consolePolicies.rows[0].count, 0);

      const contentColumns = await pool.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('internal_admin_sessions', 'internal_audit_log')
          and column_name ~* '(audio|transcript|question|answer|prompt|content|context|resume|note|message)'
      `);
      assert.deepEqual(contentColumns.rows, []);

      const targetIndex = await pool.query(`
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname = 'internal_audit_log_target_occurred_idx'
      `);
      assert.equal(targetIndex.rowCount, 1);

      const adminId = userId(1);
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
