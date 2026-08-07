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
    } finally {
      await pool.end();
    }
  },
);

test(
  "late Stripe events cannot recreate billing data after Auth deletion",
  { skip: !databaseURL, timeout: 60_000 },
  async () => {
    const pool = new Pool({ connectionString: databaseURL });
    const id = userId(101);
    try {
      await pool.query(`
        drop table if exists public.usage_monthly cascade;
        drop table if exists public.usage_daily cascade;
        drop table if exists public.billing_accounts cascade;
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
      const commercialMigration = await readFile(
        new URL(
          "../supabase/migrations/202607290001_cueaside_commercial.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const deletionMigration = await readFile(
        new URL(
          "../supabase/migrations/202608070001_account_deletion_safety.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await pool.query(commercialMigration);
      await pool.query(deletionMigration);
      await pool.query("insert into auth.users (id) values ($1::uuid)", [id]);

      const initial = await pool.query(
        `select public.apply_subscription_update(
          $1::uuid, 'person@example.com', 'cus_123', 'sub_123', 'active',
          'price_123', 2000000000, false, 100, 100
        ) as applied`,
        [id],
      );
      assert.equal(initial.rows[0].applied, true);

      await pool.query("delete from auth.users where id = $1::uuid", [id]);
      const late = await pool.query(
        `select public.apply_subscription_update(
          $1::uuid, null, 'cus_123', 'sub_123', 'canceled',
          'price_123', 2000000000, false, 101, 101
        ) as applied`,
        [id],
      );
      assert.equal(late.rows[0].applied, false);

      const rows = await pool.query(
        "select count(*)::integer as count from public.billing_accounts where user_id = $1::uuid",
        [id],
      );
      assert.equal(rows.rows[0].count, 0);
    } finally {
      await pool.end();
    }
  },
);
