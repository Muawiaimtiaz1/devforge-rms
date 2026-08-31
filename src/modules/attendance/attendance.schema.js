const { z } = require('zod');
const id = z.coerce.number().int().positive();
const date = z.iso.date();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const templateSchema = z.object({
  name: z.string().trim().min(1).max(120), start_time: time, end_time: time,
  is_overnight: z.boolean().default(false), unpaid_break_minutes: z.coerce.number().int().min(0).max(720).default(0),
  grace_minutes: z.union([z.coerce.number().int().min(0).max(180), z.null(), z.literal('')]).optional().transform((v) => v === '' ? null : v),
}).strict();
const scheduleSchema = z.object({
  staff_profile_id: id, effective_from: date,
  days: z.array(z.object({ weekday: z.coerce.number().int().min(0).max(6), shift_template_id: z.union([id, z.null(), z.literal('')]).transform((v) => v === '' ? null : v), is_day_off: z.boolean() }).strict()).length(7),
}).strict();
const holidaySchema = z.object({ holiday_date: date, name: z.string().trim().min(1).max(160), is_paid: z.boolean().default(true) }).strict();
const clockSchema = z.object({
  staff_profile_id: id.optional(), event_type: z.enum(['clock_in', 'break_start', 'break_end', 'clock_out']),
  source_type: z.enum(['web', 'device', 'register']).default('web'), device_id: z.string().trim().max(160).optional(),
  register_shift_id: id.optional(), idempotency_key: z.string().trim().min(8).max(160),
}).strict();
const correctionSchema = z.object({
  staff_profile_id: id, business_date: date, correction_type: z.enum(['add_event', 'replace_event', 'classify_absence']),
  raw_event_id: id.optional(), proposed_event_type: z.enum(['clock_in', 'break_start', 'break_end', 'clock_out']).optional(),
  proposed_occurred_at: z.iso.datetime({ offset: true }).optional(), proposed_absence_type: z.enum(['authorized', 'unauthorized', 'sick', 'other']).optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict();
const reviewSchema = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().min(2).max(1000) }).strict();
const rangeSchema = z.object({
  from: date,
  to: date,
  staff_profile_id: id.optional(),
  shift_template_id: id.optional(),
  search: z.string().trim().max(120).optional(),
}).strict();
const snapshotSchema = z.object({ period_start: date, period_end: date, idempotency_key: z.string().trim().min(8).max(160) }).strict();
const shiftRegisterQuerySchema = z.object({ shift_template_id: id.optional() }).strict();
const shiftRegisterSchema = z.object({
  shift_template_id: id,
  reason: z.string().trim().min(3).max(500),
  idempotency_key: z.string().trim().min(8).max(160),
  marks: z.array(z.object({
    staff_profile_id: id,
    attendance_status: z.enum(['present', 'absent', 'paid_leave', 'unpaid_leave']),
  }).strict()).min(1).max(500),
}).strict();
const shiftClockOutSchema = z.object({ idempotency_key: z.string().trim().min(8).max(160) }).strict();
const personShiftMarkSchema = z.object({
  shift_template_id: id,
  attendance_status: z.literal('present'),
  reason: z.string().trim().min(3).max(500),
  idempotency_key: z.string().trim().min(8).max(160),
}).strict();

module.exports = { templateSchema, scheduleSchema, holidaySchema, clockSchema, correctionSchema, reviewSchema, rangeSchema, snapshotSchema, shiftRegisterQuerySchema, shiftRegisterSchema, shiftClockOutSchema, personShiftMarkSchema };
