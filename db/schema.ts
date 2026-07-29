import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const billingAccounts = sqliteTable("billing_accounts", {
  userId: text("user_id").primaryKey(),
  email: text("email"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  subscriptionStatus: text("subscription_status").notNull().default("inactive"),
  priceId: text("price_id"),
  currentPeriodEnd: integer("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" })
    .notNull()
    .default(false),
  latestStripeEventCreated: integer("latest_stripe_event_created")
    .notNull()
    .default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const stripeEvents = sqliteTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  eventCreated: integer("event_created").notNull(),
  processedAt: integer("processed_at").notNull(),
});

export const usageDaily = sqliteTable(
  "usage_daily",
  {
    userId: text("user_id").notNull(),
    usageDate: text("usage_date").notNull(),
    answerRequests: integer("answer_requests").notNull().default(0),
    transcriptionRequests: integer("transcription_requests").notNull().default(0),
    realtimeTokens: integer("realtime_tokens").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.usageDate] })],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: integer("window_started_at").notNull(),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});
