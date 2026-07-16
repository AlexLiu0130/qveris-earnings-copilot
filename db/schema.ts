import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const qverisFetchCache = sqliteTable(
  "qveris_fetch_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    toolId: text("tool_id").notNull(),
    parametersJson: text("parameters_json").notNull(),
    responseJson: text("response_json").notNull(),
    responseHash: text("response_hash").notNull(),
    executionId: text("execution_id"),
    fetchedAt: text("fetched_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    schemaVersion: integer("schema_version").notNull(),
  },
  (table) => [
    index("qveris_fetch_cache_expires_idx").on(table.expiresAt),
    index("qveris_fetch_cache_tool_expires_idx").on(table.toolId, table.expiresAt),
    index("qveris_fetch_cache_execution_idx").on(table.executionId),
    index("qveris_fetch_cache_response_hash_idx").on(table.responseHash),
  ],
);

export const earningsEvents = sqliteTable(
  "earnings_events",
  {
    eventId: text("event_id").primaryKey(),
    canonicalKey: text("canonical_key").notNull(),
    ticker: text("ticker").notNull(),
    fiscalYear: integer("fiscal_year"),
    fiscalPeriod: text("fiscal_period"),
    reportDate: text("report_date").notNull(),
    timing: text("timing").notNull(),
    status: text("status").notNull(),
    eventVersion: integer("event_version").notNull(),
    dataAsOf: text("data_as_of").notNull(),
    firstSeenAt: text("first_seen_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
  },
  (table) => [
    uniqueIndex("earnings_events_canonical_version_uq").on(table.canonicalKey, table.eventVersion),
    index("earnings_events_canonical_key_idx").on(table.canonicalKey),
    index("earnings_events_ticker_report_date_idx").on(table.ticker, table.reportDate),
    index("earnings_events_status_report_date_idx").on(table.status, table.reportDate),
  ],
);

export const sourceRefs = sqliteTable(
  "source_refs",
  {
    sourceRefId: text("source_ref_id").primaryKey(),
    provider: text("provider").notNull(),
    capability: text("capability"),
    executionId: text("execution_id"),
    rawFetchId: text("raw_fetch_id").references(() => qverisFetchCache.cacheKey, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url"),
    publishedAt: text("published_at"),
    retrievedAt: text("retrieved_at").notNull(),
    sourceHash: text("source_hash").notNull(),
  },
  (table) => [
    uniqueIndex("source_refs_provider_hash_uq").on(table.provider, table.sourceHash),
    index("source_refs_execution_idx").on(table.executionId),
    index("source_refs_raw_fetch_idx").on(table.rawFetchId),
    index("source_refs_url_idx").on(table.url),
  ],
);

export const eventFacts = sqliteTable(
  "event_facts",
  {
    factId: text("fact_id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => earningsEvents.eventId),
    factType: text("fact_type").notNull(),
    metric: text("metric").notNull(),
    periodKey: text("period_key").notNull(),
    valueNumber: real("value_number"),
    valueText: text("value_text"),
    unit: text("unit"),
    currency: text("currency"),
    sourceRefId: text("source_ref_id").references(() => sourceRefs.sourceRefId, { onDelete: "set null" }),
    rawFetchId: text("raw_fetch_id").references(() => qverisFetchCache.cacheKey, { onDelete: "set null" }),
    factVersion: integer("fact_version").notNull(),
    asOf: text("as_of").notNull(),
  },
  (table) => [
    uniqueIndex("event_facts_identity_uq").on(
      table.eventId,
      table.factType,
      table.metric,
      table.periodKey,
      table.factVersion,
    ),
    index("event_facts_event_idx").on(table.eventId),
    index("event_facts_metric_idx").on(table.metric, table.periodKey),
    index("event_facts_source_ref_idx").on(table.sourceRefId),
    index("event_facts_raw_fetch_idx").on(table.rawFetchId),
  ],
);

export const researchSnapshots = sqliteTable(
  "research_snapshots",
  {
    analysisId: text("analysis_id").primaryKey(),
    requestKey: text("request_key").notNull(),
    ticker: text("ticker").notNull(),
    eventId: text("event_id").references(() => earningsEvents.eventId, { onDelete: "set null" }),
    mode: text("mode").notNull(),
    language: text("language").notNull(),
    snapshotVersion: integer("snapshot_version").notNull(),
    analysisJson: text("analysis_json").notNull(),
    generatedAt: text("generated_at").notNull(),
    cacheExpiresAt: text("cache_expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("research_snapshots_request_cache_expires_idx").on(table.requestKey, table.cacheExpiresAt),
    index("research_snapshots_ticker_generated_idx").on(table.ticker, table.generatedAt),
    index("research_snapshots_event_idx").on(table.eventId),
  ],
);
