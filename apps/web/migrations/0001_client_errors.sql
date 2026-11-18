-- ブラウザで起きたエラー（/api/errors で受け取る）
CREATE TABLE client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- error（window.onerror）・rejection（Promise）・render（画面の描画中）
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  -- エラーが起きたページのパス（クエリ・ハッシュは含めない）
  path TEXT,
  -- どのビルドか（コミットの先頭 7 文字）
  build TEXT,
  user_agent TEXT
);
CREATE INDEX client_errors_at ON client_errors (at);
