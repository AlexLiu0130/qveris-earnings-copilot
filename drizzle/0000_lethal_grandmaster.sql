CREATE TABLE `earnings_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`canonical_key` text NOT NULL,
	`ticker` text NOT NULL,
	`fiscal_year` integer,
	`fiscal_period` text,
	`report_date` text NOT NULL,
	`timing` text NOT NULL,
	`status` text NOT NULL,
	`event_version` integer NOT NULL,
	`data_as_of` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `earnings_events_canonical_version_uq` ON `earnings_events` (`canonical_key`,`event_version`);--> statement-breakpoint
CREATE INDEX `earnings_events_canonical_key_idx` ON `earnings_events` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `earnings_events_ticker_report_date_idx` ON `earnings_events` (`ticker`,`report_date`);--> statement-breakpoint
CREATE INDEX `earnings_events_status_report_date_idx` ON `earnings_events` (`status`,`report_date`);--> statement-breakpoint
CREATE TABLE `event_facts` (
	`fact_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`fact_type` text NOT NULL,
	`metric` text NOT NULL,
	`period_key` text NOT NULL,
	`value_number` real,
	`value_text` text,
	`unit` text,
	`currency` text,
	`source_ref_id` text,
	`raw_fetch_id` text,
	`fact_version` integer NOT NULL,
	`as_of` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `earnings_events`(`event_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_ref_id`) REFERENCES `source_refs`(`source_ref_id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`raw_fetch_id`) REFERENCES `qveris_fetch_cache`(`cache_key`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_facts_identity_uq` ON `event_facts` (`event_id`,`fact_type`,`metric`,`period_key`,`fact_version`);--> statement-breakpoint
CREATE INDEX `event_facts_event_idx` ON `event_facts` (`event_id`);--> statement-breakpoint
CREATE INDEX `event_facts_metric_idx` ON `event_facts` (`metric`,`period_key`);--> statement-breakpoint
CREATE INDEX `event_facts_source_ref_idx` ON `event_facts` (`source_ref_id`);--> statement-breakpoint
CREATE INDEX `event_facts_raw_fetch_idx` ON `event_facts` (`raw_fetch_id`);--> statement-breakpoint
CREATE TABLE `qveris_fetch_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`tool_id` text NOT NULL,
	`parameters_json` text NOT NULL,
	`response_json` text NOT NULL,
	`response_hash` text NOT NULL,
	`execution_id` text,
	`fetched_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`schema_version` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `qveris_fetch_cache_expires_idx` ON `qveris_fetch_cache` (`expires_at`);--> statement-breakpoint
CREATE INDEX `qveris_fetch_cache_tool_expires_idx` ON `qveris_fetch_cache` (`tool_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `qveris_fetch_cache_execution_idx` ON `qveris_fetch_cache` (`execution_id`);--> statement-breakpoint
CREATE INDEX `qveris_fetch_cache_response_hash_idx` ON `qveris_fetch_cache` (`response_hash`);--> statement-breakpoint
CREATE TABLE `research_snapshots` (
	`analysis_id` text PRIMARY KEY NOT NULL,
	`request_key` text NOT NULL,
	`ticker` text NOT NULL,
	`event_id` text,
	`mode` text NOT NULL,
	`language` text NOT NULL,
	`snapshot_version` integer NOT NULL,
	`analysis_json` text NOT NULL,
	`generated_at` text NOT NULL,
	`cache_expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `earnings_events`(`event_id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `research_snapshots_request_cache_expires_idx` ON `research_snapshots` (`request_key`,`cache_expires_at`);--> statement-breakpoint
CREATE INDEX `research_snapshots_ticker_generated_idx` ON `research_snapshots` (`ticker`,`generated_at`);--> statement-breakpoint
CREATE INDEX `research_snapshots_event_idx` ON `research_snapshots` (`event_id`);--> statement-breakpoint
CREATE TABLE `source_refs` (
	`source_ref_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`capability` text,
	`execution_id` text,
	`raw_fetch_id` text,
	`title` text NOT NULL,
	`url` text,
	`published_at` text,
	`retrieved_at` text NOT NULL,
	`source_hash` text NOT NULL,
	FOREIGN KEY (`raw_fetch_id`) REFERENCES `qveris_fetch_cache`(`cache_key`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_refs_provider_hash_uq` ON `source_refs` (`provider`,`source_hash`);--> statement-breakpoint
CREATE INDEX `source_refs_execution_idx` ON `source_refs` (`execution_id`);--> statement-breakpoint
CREATE INDEX `source_refs_raw_fetch_idx` ON `source_refs` (`raw_fetch_id`);--> statement-breakpoint
CREATE INDEX `source_refs_url_idx` ON `source_refs` (`url`);
