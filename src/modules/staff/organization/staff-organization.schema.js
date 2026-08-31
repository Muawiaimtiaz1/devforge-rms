const { z } = require('zod');

const optionalId = z.union([z.coerce.number().int().positive(), z.null(), z.literal('')]).optional()
  .transform((value) => value === '' ? null : value);
const effectiveDate = z.iso.date();

const catalogSchema = z.object({
  kind: z.enum(['departments', 'designations', 'locations', 'classifications']),
  name: z.string().trim().min(1).max(120),
  code: z.union([z.string().trim().min(1).max(40), z.literal(''), z.null()]).optional(),
  department_id: optionalId,
  address: z.union([z.string().trim().max(500), z.literal(''), z.null()]).optional(),
  is_primary: z.boolean().optional().default(false),
}).strict();
const catalogUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.union([z.string().trim().min(1).max(40), z.null()]).optional(),
  department_id: optionalId,
  address: z.union([z.string().trim().max(500), z.null()]).optional(),
  is_primary: z.boolean().optional(),
  is_active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one change is required.');

const assignmentSchema = z.object({
  department_id: optionalId,
  designation_id: optionalId,
  manager_staff_id: optionalId,
  primary_location_id: optionalId,
  classification_id: optionalId,
  effective_date: effectiveDate,
  reason: z.string().trim().min(1).max(1000),
}).strict();

const transferSchema = z.object({
  target_shop_id: z.coerce.number().int().positive(),
  effective_date: effectiveDate,
  reason: z.string().trim().min(1).max(1000),
}).strict();

module.exports = { catalogSchema, catalogUpdateSchema, assignmentSchema, transferSchema };
