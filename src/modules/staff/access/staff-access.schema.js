const { z } = require('zod');

const createAccountSchema = z.object({
  existing_user_id: z.coerce.number().int().positive().optional(),
  username: z.string().trim().min(3).max(80).optional(),
  role_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'blocked']).default('active'),
  can_manage_register: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  const linking = Boolean(value.existing_user_id);
  const creating = Boolean(value.username || value.role_id);
  if (linking === creating) {
    context.addIssue({ code: 'custom', message: 'Choose an existing account or provide a username and role.' });
  }
  if (creating && (!value.username || !value.role_id)) {
    context.addIssue({ code: 'custom', message: 'Username and role are required for a new account.' });
  }
});

const updateAccessSchema = z.object({
  role_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'blocked']).optional(),
  can_manage_register: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'No access changes were provided.' });

module.exports = { createAccountSchema, updateAccessSchema };
