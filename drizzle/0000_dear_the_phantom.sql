CREATE TABLE `billing_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`subscription_status` text DEFAULT 'inactive' NOT NULL,
	`price_id` text,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`latest_stripe_event_created` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_stripe_customer_id_unique` ON `billing_accounts` (`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_accounts_stripe_subscription_id_unique` ON `billing_accounts` (`stripe_subscription_id`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`event_created` integer NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usage_daily` (
	`user_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`answer_requests` integer DEFAULT 0 NOT NULL,
	`transcription_requests` integer DEFAULT 0 NOT NULL,
	`realtime_tokens` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `usage_date`)
);
