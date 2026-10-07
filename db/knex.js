const knex = require('knex');
require('dotenv').config();

const dbClient = process.env.DB_CLIENT || 'sqlite';

const config = {
  sqlite: {
    client: 'better-sqlite3',
    connection: {
      filename: "./db/pos.db",
    },
    useNullAsDefault: true,
  },
  postgres: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    },
    pool: {
      min: Math.max(0, Number(process.env.DB_POOL_MIN || 0)),
      max: Math.max(1, Number(process.env.DB_POOL_MAX || 5)),
      idleTimeoutMillis: Math.max(1000, Number(process.env.DB_POOL_IDLE_MS || 30000)),
      acquireTimeoutMillis: Math.max(1000, Number(process.env.DB_POOL_ACQUIRE_MS || 10000))
    }
  }
};

const db = knex(config[dbClient === 'postgres' ? 'postgres' : 'sqlite']);

module.exports = db;
