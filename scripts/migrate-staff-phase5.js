require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');
const { ensureAttendanceSchema } = require('../src/modules/attendance/attendance.migration');
async function main() {
  await ensureAttendanceSchema(query);
  const result = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'attendance_%' ORDER BY table_name`);
  console.log(JSON.stringify({ migrated: true, tables: result.rows.map((row) => row.table_name) }));
}
main().catch((error) => { console.error(`Attendance migration failed: ${error.message}`); process.exitCode = 1; }).finally(close);
