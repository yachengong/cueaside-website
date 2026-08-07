import assert from "node:assert/strict";
import test from "node:test";

import { deleteCueAsideAccount } from "../lib/server/account-deletion.ts";

function dependencies({ subscription = "sub_123", failAt = null } = {}) {
  const events = [];
  const step = async (name, value) => {
    events.push(name);
    if (failAt === name) throw new Error(`${name} failed`);
    return value;
  };

  return {
    events,
    value: {
      billingAccountFor: () =>
        step("lookup", subscription ? { stripe_subscription_id: subscription } : null),
      cancelStripeSubscriptionImmediately: () => step("cancel"),
      deleteUserData: () => step("data"),
      deleteAuthUser: () => step("auth"),
    },
  };
}

test("paid-account deletion cancels billing before data and identity", async () => {
  const fixture = dependencies();
  await deleteCueAsideAccount("user-1", fixture.value);
  assert.deepEqual(fixture.events, ["lookup", "cancel", "data", "auth"]);
});

test("free-account deletion skips Stripe but preserves destructive order", async () => {
  const fixture = dependencies({ subscription: null });
  await deleteCueAsideAccount("user-2", fixture.value);
  assert.deepEqual(fixture.events, ["lookup", "data", "auth"]);
});

test("a cancellation failure leaves product data and identity intact", async () => {
  const fixture = dependencies({ failAt: "cancel" });
  await assert.rejects(
    deleteCueAsideAccount("user-3", fixture.value),
    /cancel failed/,
  );
  assert.deepEqual(fixture.events, ["lookup", "cancel"]);
});

test("a product-data failure does not delete the auth identity", async () => {
  const fixture = dependencies({ failAt: "data" });
  await assert.rejects(
    deleteCueAsideAccount("user-4", fixture.value),
    /data failed/,
  );
  assert.deepEqual(fixture.events, ["lookup", "cancel", "data"]);
});

