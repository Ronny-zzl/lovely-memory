-- X の Webhook で届いたイベント（/api/x-webhook）。動作の確認用に 30 日だけ残す
CREATE TABLE x_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  event_type TEXT,
  post_id TEXT,
  -- ポストの本文（先頭 2000 文字）
  text TEXT,
  -- ワークフローを起動したか（ok / skip / no-token / error <status>）
  dispatched TEXT NOT NULL,
  -- 届いた JSON（先頭 8000 文字）
  raw TEXT
);
CREATE INDEX x_events_at ON x_events (at);
