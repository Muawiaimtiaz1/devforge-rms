const { z } = require('zod');
const daysSchema = z.coerce.number().int().min(1).max(90).default(5);
const shopIdSchema = z.coerce.number().int().positive();
module.exports = { daysSchema, shopIdSchema };
