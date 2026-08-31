require('dotenv').config({ quiet: true });
const { query, close } = require('../db/postgres');

async function scalar(sql) { return (await query(sql)).rows[0]; }

async function main() {
  if (process.env.DB_CLIENT !== 'postgres') throw new Error('Release verification requires DB_CLIENT=postgres.');
  const requiredTables = ['staff_profiles','session_devices','security_events','staff_departments','attendance_clock_events','attendance_daily_marks','leave_requests','payroll_runs','payroll_adjustments','staff_documents','staff_activity_records'];
  const requiredIndexes = ['idx_sales_staff_creator_date','idx_sales_staff_waiter_date','idx_sales_staff_rider_date','idx_sales_staff_kitchen_date','idx_sales_payment_receiver_date','idx_shifts_staff_date','idx_activity_logs_shop_created','idx_sessions_expires','idx_security_events_shop_created','idx_staff_profiles_shop_name','idx_staff_profiles_shop_user'];
  const requiredTriggers = ['trg_attendance_clock_events_immutable','trg_attendance_daily_marks_immutable','trg_leave_balance_ledger_immutable','trg_payroll_payslips_immutable','trg_payroll_adjustments_protected','trg_staff_activity_history_immutable'];
  const existing = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name`, [requiredTables]);
  const indexes = await query(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[]) ORDER BY indexname`, [requiredIndexes]);
  const triggers = await query(`SELECT DISTINCT trigger_name FROM information_schema.triggers WHERE event_object_schema='public' AND trigger_name=ANY($1::text[]) ORDER BY trigger_name`, [requiredTriggers]);
  const permissionCounts = await query(`SELECT module,COUNT(*)::integer count FROM permissions WHERE module=ANY($1::text[]) GROUP BY module ORDER BY module`, [['attendance','leave','payroll','documents','staff_activity']]);
  const reconciliation = await scalar(`SELECT
    (SELECT COUNT(*)::integer FROM attendance_corrections c WHERE c.status='approved' AND NOT EXISTS(SELECT 1 FROM attendance_adjustments a WHERE a.correction_id=c.id)) approved_corrections_without_adjustment,
    (SELECT COUNT(*)::integer FROM leave_requests r WHERE NOT EXISTS(SELECT 1 FROM leave_approval_history h WHERE h.leave_request_id=r.id)) leave_requests_without_history,
    (SELECT COUNT(*)::integer FROM payroll_entries e JOIN payroll_runs r ON r.id=e.payroll_run_id WHERE r.status IN('finalized','reversed') AND NOT EXISTS(SELECT 1 FROM payroll_payslips p WHERE p.payroll_entry_id=e.id)) finalized_entries_without_payslip,
    (SELECT COUNT(*)::integer FROM payroll_adjustments a WHERE a.status='applied' AND NOT EXISTS(SELECT 1 FROM payroll_line_items l WHERE l.source_type='adjustment' AND l.source_id=a.id)) applied_adjustments_without_line,
    (SELECT COUNT(*)::integer FROM staff_documents d WHERE NOT EXISTS(SELECT 1 FROM staff_document_access_log l WHERE l.document_id=d.id AND l.action='upload')) documents_without_upload_audit,
    (SELECT COUNT(*)::integer FROM staff_activity_records r WHERE NOT EXISTS(SELECT 1 FROM staff_activity_record_history h WHERE h.record_id=r.id)) activity_records_without_history,
    (SELECT COUNT(*)::integer FROM attendance_clock_events e JOIN staff_profiles s ON s.id=e.staff_profile_id WHERE e.shop_id<>s.shop_id) cross_shop_attendance_rows,
    (SELECT COUNT(*)::integer FROM payroll_entries e JOIN staff_profiles s ON s.id=e.staff_profile_id WHERE e.shop_id<>s.shop_id) cross_shop_payroll_rows,
    (SELECT COUNT(*)::integer FROM staff_documents d JOIN staff_profiles s ON s.id=d.staff_profile_id WHERE d.shop_id<>s.shop_id) cross_shop_document_rows,
    (SELECT COUNT(*)::integer FROM sessions WHERE expires<=NOW()) expired_sessions_pending_cleanup`);
  const staffPlan = await query(`EXPLAIN (FORMAT JSON) SELECT id,full_name FROM staff_profiles WHERE shop_id=(SELECT id FROM shops ORDER BY id LIMIT 1) AND employment_status='active' ORDER BY full_name,id LIMIT 24`);
  const activityPlan = await query(`EXPLAIN (FORMAT JSON) SELECT id FROM sales WHERE shop_id=(SELECT id FROM shops ORDER BY id LIMIT 1) AND user_id=(SELECT id FROM users WHERE shop_id IS NOT NULL ORDER BY id LIMIT 1) AND created_at>=CURRENT_DATE-INTERVAL '30 days'`);
  const output = { postgres: true, tables: existing.rows.map(row => row.table_name), indexes: indexes.rows.map(row => row.indexname), triggers: triggers.rows.map(row => row.trigger_name), permissions: permissionCounts.rows, reconciliation, plans: { staff: staffPlan.rows[0]['QUERY PLAN'][0].Plan['Node Type'], activity: activityPlan.rows[0]['QUERY PLAN'][0].Plan['Node Type'] } };
  output.complete = output.tables.length === requiredTables.length && output.indexes.length === requiredIndexes.length && output.triggers.length === requiredTriggers.length && Object.values(reconciliation).every(value => Number(value) === 0);
  console.log(JSON.stringify(output));
  if (!output.complete) throw new Error('Release verification found missing schema or reconciliation failures.');
}

main().catch(error => { console.error('Staff release check failed:', error); process.exitCode = 1; }).finally(close);
