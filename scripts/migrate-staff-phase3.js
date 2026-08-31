require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');
const { ensureSessionSecuritySchema } = require('../src/modules/session-security/session-security.migration');

async function main() {
  await ensureSessionSecuritySchema(query);
  const result = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('session_devices', 'security_events')
    ORDER BY table_name
  `);
  console.log(JSON.stringify({ migrated: true, tables: result.rows.map((row) => row.table_name) }));
}

main()
  .catch((error) => {
    console.error(`Session security migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(close);
