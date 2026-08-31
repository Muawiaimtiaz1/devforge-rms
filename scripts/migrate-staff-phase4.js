require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');
const { ensureStaffOrganizationSchema } = require('../src/modules/staff/organization/staff-organization.migration');

async function main() {
  await ensureStaffOrganizationSchema(query);
  const result = await query(`SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('staff_departments','staff_designations','staff_locations','staff_classifications','staff_assignment_history')
    ORDER BY table_name`);
  console.log(JSON.stringify({ migrated: true, tables: result.rows.map((row) => row.table_name) }));
}

main().catch((error) => { console.error(`Staff organization migration failed: ${error.message}`); process.exitCode = 1; }).finally(close);
