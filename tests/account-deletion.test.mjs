import assert from "node:assert/strict";
import test from "node:test";

import { deleteCueAsideAccount } from "../lib/server/account-deletion.ts";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_LOGOUT_PATH,
  accountDataDeletionPaths,
  bearerTokenFromAuthorization,
  stripeCustomerDeletionPath,
} from "../lib/server/account-deletion-policy.ts";

const request = {
  userId: "user-1",
  email: "person@example.com",
  accessToken: "access-token",
};

function dependencies({
  subscription = "sub_123",
  customer = "cus_123",
  failAt = null,
} = {}) {
  const events = [];
  const argumentsByStep = new Map();
  const step = async (name, value) => {
    events.push(name);
    if (failAt === name) throw new Error(`${name} failed`);
    return value;
  };

  return {
    events,
    argumentsByStep,
    value: {
      billingAccountFor: () =>
        step(
          "lookup",
          subscription || customer
            ? {
                stripe_subscription_id: subscription,
                stripe_customer_id: customer,
              }
            : null,
        ),
      cancelStripeSubscriptionImmediately: () => step("cancel"),
      deleteStripeCustomer: () => step("customer"),
      deleteUserData: (...args) => {
        argumentsByStep.set("data", args);
        return step("data");
      },
      revokeUserSessions: (...args) => {
        argumentsByStep.set("sessions", args);
        return step("sessions");
      },
      deleteAuthUser: () => step("auth"),
    },
  };
}

test("paid-account deletion removes external billing before product data, sessions, and identity", async () => {
  const fixture = dependencies();
  await deleteCueAsideAccount(request, fixture.value);
  assert.deepEqual(fixture.events, [
    "lookup",
    "cancel",
    "customer",
    "data",
    "sessions",
    "auth",
  ]);
  assert.deepEqual(fixture.argumentsByStep.get("data"), [
    request.userId,
    request.email,
  ]);
  assert.deepEqual(fixture.argumentsByStep.get("sessions"), [
    request.accessToken,
  ]);
});

test("account without Stripe data preserves product, session, and identity order", async () => {
  const fixture = dependencies({ subscription: null, customer: null });
  await deleteCueAsideAccount(request, fixture.value);
  assert.deepEqual(fixture.events, ["lookup", "data", "sessions", "auth"]);
});

test("customer-only account still removes stored payment data", async () => {
  const fixture = dependencies({ subscription: null });
  await deleteCueAsideAccount(request, fixture.value);
  assert.deepEqual(fixture.events, [
    "lookup",
    "customer",
    "data",
    "sessions",
    "auth",
  ]);
});

test("a cancellation failure leaves product data and identity intact", async () => {
  const fixture = dependencies({ failAt: "cancel" });
  await assert.rejects(
    deleteCueAsideAccount(request, fixture.value),
    /cancel failed/,
  );
  assert.deepEqual(fixture.events, ["lookup", "cancel"]);
});

test("a customer-deletion failure leaves product data and identity intact", async () => {
  const fixture = dependencies({ failAt: "customer" });
  await assert.rejects(
    deleteCueAsideAccount(request, fixture.value),
    /customer failed/,
  );
  assert.deepEqual(fixture.events, ["lookup", "cancel", "customer"]);
});

test("a product-data failure does not delete the auth identity", async () => {
  const fixture = dependencies({ failAt: "data" });
  await assert.rejects(
    deleteCueAsideAccount(request, fixture.value),
    /data failed/,
  );
  assert.deepEqual(fixture.events, [
    "lookup",
    "cancel",
    "customer",
    "data",
  ]);
});

test("a session-revocation failure preserves the auth identity for retry", async () => {
  const fixture = dependencies({ failAt: "sessions" });
  await assert.rejects(
    deleteCueAsideAccount(request, fixture.value),
    /sessions failed/,
  );
  assert.deepEqual(fixture.events, [
    "lookup",
    "cancel",
    "customer",
    "data",
    "sessions",
  ]);
});

test("destructive request policy is explicit and safely encoded", () => {
  assert.equal(ACCOUNT_DELETION_CONFIRMATION, "DELETE");
  assert.equal(ACCOUNT_DELETION_LOGOUT_PATH, "/auth/v1/logout?scope=global");
  assert.equal(bearerTokenFromAuthorization(null), null);
  assert.equal(bearerTokenFromAuthorization("Basic unsafe"), null);
  assert.equal(
    bearerTokenFromAuthorization("Bearer token-123"),
    "token-123",
  );
  assert.equal(
    stripeCustomerDeletionPath("cus/with unsafe chars"),
    "/customers/cus%2Fwith%20unsafe%20chars",
  );
});

test("user-data policy removes normalized waitlist email before billing", () => {
  assert.deepEqual(
    accountDataDeletionPaths(
      "user/with unsafe chars",
      "  Person+Test@Example.com ",
    ),
    [
      "usage_monthly?user_id=eq.user%2Fwith%20unsafe%20chars",
      "usage_daily?user_id=eq.user%2Fwith%20unsafe%20chars",
      "waitlist_signups?email=eq.person%2Btest%40example.com",
      "billing_accounts?user_id=eq.user%2Fwith%20unsafe%20chars",
    ],
  );
  assert.deepEqual(accountDataDeletionPaths("user-1", null), [
    "usage_monthly?user_id=eq.user-1",
    "usage_daily?user_id=eq.user-1",
    "billing_accounts?user_id=eq.user-1",
  ]);
});
