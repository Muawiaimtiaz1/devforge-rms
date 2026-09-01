const { z } = require('zod')
const { ALERT_KEYS } = require('./notification-preferences.constants')
const preferenceSchema = z.object({
  alerts: z.array(z.object({
    key: z.string().refine((key) => ALERT_KEYS.has(key), 'Unknown notification alert type'),
    recipient_ids: z.array(z.coerce.number().int().positive()).max(500),
  }).strict()).max(ALERT_KEYS.size),
}).strict().superRefine((value, context) => {
  const keys = value.alerts.map((alert) => alert.key)
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Each alert type may only appear once.' })
})
module.exports = { preferenceSchema }
