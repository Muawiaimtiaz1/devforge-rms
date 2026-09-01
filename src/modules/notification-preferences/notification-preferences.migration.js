const NOTIFICATION_PREFERENCES_MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS notification_alert_settings(
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    alert_key TEXT NOT NULL,
    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(shop_id,alert_key)
  );
  CREATE TABLE IF NOT EXISTS notification_alert_recipients(
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    alert_key TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(shop_id,alert_key,user_id),
    FOREIGN KEY(shop_id,alert_key) REFERENCES notification_alert_settings(shop_id,alert_key) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_notification_alert_recipients_user ON notification_alert_recipients(shop_id,user_id,alert_key);
`
async function ensureNotificationPreferencesSchema(executeQuery) { await executeQuery(NOTIFICATION_PREFERENCES_MIGRATION_SQL) }
module.exports = { NOTIFICATION_PREFERENCES_MIGRATION_SQL, ensureNotificationPreferencesSchema }
