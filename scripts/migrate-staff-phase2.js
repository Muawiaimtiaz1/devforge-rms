require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');
const { ensureStaffAccessSchema } = require('../src/modules/staff/access/staff-access.migration');

async function main() {
  await ensureStaffAccessSchema(query);
  const auditTable = await query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'staff_access_audit'
    ) AS exists
  `);
  console.log(JSON.stringify({ migrated: true, staffAccessAudit: auditTable.rows[0].exists }));
}

main()
  .catch((error) => {
    console.error(`Staff access migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(close);
