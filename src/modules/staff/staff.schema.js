const { z } = require('zod');

const EMPLOYMENT_STATUSES = ['active', 'inactive', 'suspended', 'terminated'];
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary'];

const nullableText = (max) => z.union([z.string().trim().max(max), z.null()]).optional();

const staffProfileSchema = z.object({
  employee_id: nullableText(40),
  full_name: z.string().trim().min(1).max(160),
  photo_url: nullableText(500),
  phone: nullableText(40),
  email: z.union([z.string().trim().email().max(254), z.literal(''), z.null()]).optional(),
  address: nullableText(1000),
  emergency_contact_name: nullableText(160),
  emergency_contact_phone: nullableText(40),
  designation: nullableText(120),
  department: nullableText(120),
  employment_type: z.enum(EMPLOYMENT_TYPES).default('full_time'),
  joining_date: z.union([z.iso.date(), z.literal(''), z.null()]).optional(),
  employment_status: z.enum(EMPLOYMENT_STATUSES).default('active'),
  notes: nullableText(2000),
}).strict();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(120).default(''),
  status: z.enum(['all', ...EMPLOYMENT_STATUSES]).default('all'),
  employment_type: z.enum(['all', ...EMPLOYMENT_TYPES]).default('all'),
  department: z.string().trim().max(120).default(''),
  designation: z.string().trim().max(120).default(''),
  sort: z.enum(['name', 'employee_id', 'joining_date', 'created_at']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
}).strict();

module.exports = { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, staffProfileSchema, listQuerySchema };
