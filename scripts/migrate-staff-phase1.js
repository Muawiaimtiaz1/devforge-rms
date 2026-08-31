require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');
const { ensureStaffProfileSchema } = require('../src/modules/staff/staff.migration');

async function main() {
  await ensureStaffProfileSchema(query);
  const result = await query('SELECT COUNT(*)::integer AS count FROM staff_profiles');
  console.log(JSON.stringify({ migrated: true, staffProfiles: result.rows[0].count }));
}

main()
  .catch((error) => {
    console.error(`Staff migration failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(close);
