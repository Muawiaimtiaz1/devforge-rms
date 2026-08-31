const { z } = require('zod');
const id = z.coerce.number().int().positive(); const date = z.iso.date();
const leaveTypeSchema = z.object({ name: z.string().trim().min(2).max(120), category: z.enum(['annual','sick','unpaid','emergency','other']), is_paid: z.boolean(), requires_balance: z.boolean(), allow_half_day: z.boolean(), annual_entitlement_days: z.coerce.number().min(0).max(366) }).strict();
const allocationSchema = z.object({ staff_profile_id: id, leave_type_id: id, period_start: date, period_end: date, days: z.coerce.number().positive().max(366), reason: z.string().trim().min(3).max(500) }).strict();
const requestSchema = z.object({ staff_profile_id: id.optional(), leave_type_id: id, start_date: date, end_date: date, day_part: z.enum(['full_day','first_half','second_half']).default('full_day'), reason: z.string().trim().min(3).max(1000) }).strict();
const decisionSchema = z.object({ decision: z.enum(['approved','rejected']), note: z.string().trim().min(2).max(1000) }).strict();
const listSchema = z.object({ status: z.enum(['all','pending','approved','rejected','cancelled']).default('all'), from: date.optional(), to: date.optional(), staff_profile_id: id.optional() }).strict();
module.exports = { leaveTypeSchema, allocationSchema, requestSchema, decisionSchema, listSchema };
