import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  return_key TEXT UNIQUE NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  person_id INTEGER NOT NULL REFERENCES people(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS good_words (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  giver_name TEXT NOT NULL,
  giver_id INTEGER REFERENCES people(id),
  recipient_name TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  badges TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  note_status TEXT NOT NULL DEFAULT 'ok',
  note_flag TEXT NOT NULL DEFAULT '',
  recipient_id INTEGER REFERENCES people(id),
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS good_words_recipient ON good_words(recipient_id);
CREATE INDEX IF NOT EXISTS good_words_giver ON good_words(giver_id);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
