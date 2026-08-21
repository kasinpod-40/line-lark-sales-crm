CREATE TABLE IF NOT EXISTS event_dedupe (
  event_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS case_routes (
  case_id TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  customer_record_id TEXT,
  tracking_record_id TEXT,
  root_message_id TEXT UNIQUE,
  thread_id TEXT,
  owner_open_id TEXT,
  owner_name TEXT,
  status TEXT NOT NULL,
  opened_at INTEGER NOT NULL,
  claimed_at INTEGER,
  first_response_at INTEGER,
  closed_at INTEGER,
  latest_line_message_id TEXT,
  latest_message_text TEXT,
  latest_intent TEXT,
  deal_record_id TEXT,
  card_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_routes_line_status ON case_routes(line_user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_routes_root ON case_routes(root_message_id);
CREATE INDEX IF NOT EXISTS idx_case_routes_owner ON case_routes(owner_open_id, status);

CREATE TABLE IF NOT EXISTS action_dedupe (
  action_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS interaction_drafts (
  draft_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  case_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  recipient_count INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_interaction_drafts_case ON interaction_drafts(case_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS qr_assets (
  token TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  deal_record_id TEXT,
  amount_satang INTEGER NOT NULL,
  promptpay_payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_assets_expiry ON qr_assets(expires_at);

CREATE TABLE IF NOT EXISTS campaign_batches (
  draft_id TEXT NOT NULL,
  batch_index INTEGER NOT NULL,
  retry_key TEXT NOT NULL,
  state TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(draft_id, batch_index)
);
