CREATE TABLE IF NOT EXISTS media_assets (
  token TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  case_id TEXT NOT NULL,
  source_message_id TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_assets_expiry ON media_assets(expires_at);
CREATE INDEX IF NOT EXISTS idx_media_assets_case ON media_assets(case_id, created_at DESC);

ALTER TABLE campaign_batches ADD COLUMN fallback_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_batches ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_batches ADD COLUMN last_error TEXT;
