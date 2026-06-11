CREATE VIRTUAL TABLE transcript_fts USING fts5(
  session_id UNINDEXED,
  ts UNINDEXED,
  role,
  text
);
CREATE TABLE fts_index_state (
  session_id TEXT PRIMARY KEY,
  indexed_offset INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);
