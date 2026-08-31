require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');

async function main() {
  const tableResult = await query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'staff_profiles'
    ) AS exists
  `);

  if (!tableResult.rows[0].exists) {
    console.log(JSON.stringify({ staffProfilesTableExists: false, columns: [] }));
    return;
  }

  const columnResult = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_profiles'
    ORDER BY ordinal_position
  `);
  const securityColumns = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name IN ('must_change_password', 'password_changed_at')
    ORDER BY column_name
  `);
  const auditTable = await query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'staff_access_audit'
    ) AS exists
  `);
  const profileCounts = await query(`
    SELECT COUNT(*)::integer AS total,
           COUNT(user_id)::integer AS linked_accounts
    FROM staff_profiles
  `);
  const auditCount = auditTable.rows[0].exists
    ? await query('SELECT COUNT(*)::integer AS count FROM staff_access_audit')
    : { rows: [{ count: 0 }] };
  const phase3Tables = await query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('session_devices', 'security_events')
    ORDER BY table_name
  `);
  const sessionDeviceColumns = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'session_devices'
    ORDER BY ordinal_position
  `);
  const securityEventCount = phase3Tables.rows.some((row) => row.table_name === 'security_events')
    ? await query('SELECT COUNT(*)::integer AS count FROM security_events')
    : { rows: [{ count: 0 }] };
  const phase4Tables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN
      ('staff_departments','staff_designations','staff_locations','staff_classifications','staff_assignment_history')
    ORDER BY table_name
  `);
  const organizationColumns = await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_profiles'
      AND column_name IN ('department_id','designation_id','manager_staff_id','primary_location_id','classification_id')
    ORDER BY column_name
  `);
  const organizationCounts = await query(`
    SELECT
      (SELECT COUNT(*)::integer FROM staff_departments) AS departments,
      (SELECT COUNT(*)::integer FROM staff_designations) AS designations,
      (SELECT COUNT(*)::integer FROM staff_locations) AS locations,
      (SELECT COUNT(*)::integer FROM staff_classifications) AS classifications,
      (SELECT COUNT(*)::integer FROM staff_assignment_history) AS assignment_history
  `);
  const attendanceTables = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'attendance_%'
    ORDER BY table_name
  `);
  const attendancePermissions = await query(`
    SELECT r.name, COUNT(*)::integer AS permission_count
    FROM roles r JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.key LIKE 'attendance.%'
    GROUP BY r.name ORDER BY r.name
  `);
  const immutableTrigger = await query(`
    SELECT EXISTS (SELECT 1 FROM information_schema.triggers
      WHERE event_object_schema = 'public' AND event_object_table = 'attendance_clock_events'
        AND trigger_name = 'trg_attendance_clock_events_immutable') AS exists
  `);
  const dailyMarkTrigger = await query(`SELECT EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='attendance_daily_marks' AND trigger_name='trg_attendance_daily_marks_immutable') AS exists`);
  const leaveTables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'leave_%' ORDER BY table_name`);
  const leaveChecks = await query(`
    SELECT
      (SELECT COUNT(*)::integer FROM leave_types) AS leave_types,
      (SELECT COUNT(*)::integer FROM leave_requests) AS leave_requests,
      EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='leave_balance_ledger' AND trigger_name='trg_leave_balance_ledger_immutable') AS immutable_ledger
  `);
  const leavePermissions = await query(`
    SELECT r.name, COUNT(*)::integer AS permission_count FROM roles r
    JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
    WHERE p.key LIKE 'leave.%' GROUP BY r.name ORDER BY r.name
  `);
  const payrollTables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'payroll_%' ORDER BY table_name`);
  const payrollChecks = await query(`SELECT
    EXISTS(SELECT 1 FROM information_schema.triggers WHERE event_object_table='payroll_payslips' AND trigger_name='trg_payroll_payslips_immutable') AS immutable_payslips,
    EXISTS(SELECT 1 FROM information_schema.triggers WHERE event_object_table='payroll_advance_ledger' AND trigger_name='trg_payroll_advance_ledger_immutable') AS immutable_advance_ledger,
    (SELECT COUNT(*)::integer FROM permissions WHERE key LIKE 'payroll.%') AS permissions`);
  const documentTables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'staff_document%' ORDER BY table_name`);
  const documentChecks = await query(`SELECT (SELECT COUNT(*)::integer FROM staff_document_categories) AS categories,(SELECT COUNT(*)::integer FROM permissions WHERE key LIKE 'documents.%') AS permissions`);
  const activityTables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'staff_activity%' ORDER BY table_name`);
  const activityChecks = await query(`SELECT (SELECT COUNT(*)::integer FROM permissions WHERE key LIKE 'staff_activity.%') AS permissions,EXISTS(SELECT 1 FROM information_schema.triggers WHERE event_object_table='staff_activity_record_history' AND trigger_name='trg_staff_activity_history_immutable') AS immutable_history`);
  console.log(JSON.stringify({
    staffProfilesTableExists: true,
    columns: columnResult.rows.map((row) => row.column_name),
    userSecurityColumns: securityColumns.rows.map((row) => row.column_name),
    staffAccessAuditTableExists: auditTable.rows[0].exists,
    staffProfiles: profileCounts.rows[0].total,
    linkedAccounts: profileCounts.rows[0].linked_accounts,
    accessAuditEvents: auditCount.rows[0].count,
    sessionSecurityTables: phase3Tables.rows.map((row) => row.table_name),
    sessionDeviceColumns: sessionDeviceColumns.rows.map((row) => row.column_name),
    securityEvents: securityEventCount.rows[0].count,
    staffOrganizationTables: phase4Tables.rows.map((row) => row.table_name),
    staffOrganizationColumns: organizationColumns.rows.map((row) => row.column_name),
    staffOrganizationCounts: organizationCounts.rows[0],
    attendanceTables: attendanceTables.rows.map((row) => row.table_name),
    attendanceRolePermissions: attendancePermissions.rows,
    immutableClockEvents: immutableTrigger.rows[0].exists,
    immutableDailyMarks: dailyMarkTrigger.rows[0].exists,
    leaveTables: leaveTables.rows.map((row) => row.table_name),
    leaveChecks: leaveChecks.rows[0],
    leaveRolePermissions: leavePermissions.rows,
    payrollTables: payrollTables.rows.map((row) => row.table_name),
    payrollChecks: payrollChecks.rows[0],
    documentTables: documentTables.rows.map((row) => row.table_name),
    documentChecks: documentChecks.rows[0],
    activityTables: activityTables.rows.map((row) => row.table_name),
    activityChecks: activityChecks.rows[0],
  }));
}

main()
  .catch((error) => {
    console.error(`Staff schema check failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(close);
