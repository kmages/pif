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

-- Greeting demo (/demo). Kept apart from good words and people.
CREATE TABLE IF NOT EXISTS demo_orders (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  occasion TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  pronounce TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  script TEXT NOT NULL,
  flag TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  delivery_token TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  submitted_at INTEGER,
  reviewed_at INTEGER,
  expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS demo_nominations (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  nominator_name TEXT NOT NULL,
  nominator_role TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  shop TEXT NOT NULL,
  what TEXT NOT NULL,
  worker_answer TEXT NOT NULL DEFAULT '',
  public_answer TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}
