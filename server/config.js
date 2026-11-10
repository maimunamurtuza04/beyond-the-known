import 'dotenv/config';

/**
 * ─────────────────────────────────────────────────────────────
 *  CONFIG · one place for ports and data connections
 * ─────────────────────────────────────────────────────────────
 *
 * DATABASE_URL is optional. The app runs on illustrative mock
 * data out of the box, so you can design before your pipeline
 * is ready.
 *
 * When your cleaned CSV / Parquet data is in Postgres, set:
 *
 *   DATABASE_URL=postgres://user:password@host:5432/firerecord
 *
 * and follow server/data/postgres.example.js
 * plus server/sql/schema.sql.
 */
export const config = {
  port: Number(process.env.PORT || 8787),
  databaseUrl: process.env.DATABASE_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  // The mock record is explicitly labelled in the UI.
  allowMock: process.env.ALLOW_MOCK !== 'false',
};
