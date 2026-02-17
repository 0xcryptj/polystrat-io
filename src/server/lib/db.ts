import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export function createDb(sqlitePath: string): Db {
  const dir = path.dirname(sqlitePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    create table if not exists exposure (
      marketId text not null,
      outcome text not null,
      status text not null, -- open|closed
      openedAtMs integer not null,
      closedAtMs integer,
      metaJson text,
      primary key (marketId, outcome)
    );

    create table if not exists opportunities (
      id integer primary key autoincrement,
      tsMs integer not null,
      marketId text,
      yesPrice real,
      noPrice real,
      sumPrice real,
      edgeUsd real,
      note text
    );
  `);

  return db;
}
