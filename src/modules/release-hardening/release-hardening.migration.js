const RELEASE_HARDENING_SQL=`
  CREATE INDEX IF NOT EXISTS idx_sales_staff_creator_date ON sales(shop_id,user_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sales_staff_waiter_date ON sales(shop_id,waiter_id,created_at DESC) WHERE waiter_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_staff_rider_date ON sales(shop_id,rider_id,created_at DESC) WHERE rider_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_staff_kitchen_date ON sales(shop_id,kitchen_id,created_at DESC) WHERE kitchen_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_payment_receiver_date ON sales(shop_id,payment_receiver_id,payment_received_at DESC) WHERE payment_receiver_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_shifts_staff_date ON shifts(shop_id,user_id,start_time DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_shop_created ON activity_logs(shop_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
  CREATE INDEX IF NOT EXISTS idx_security_events_shop_created ON security_events(shop_id,created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_staff_profiles_shop_name ON staff_profiles(shop_id,full_name,id);
  CREATE INDEX IF NOT EXISTS idx_staff_profiles_shop_user ON staff_profiles(shop_id,user_id) WHERE user_id IS NOT NULL;
`;
async function ensureReleaseHardeningSchema(executeQuery){await executeQuery(RELEASE_HARDENING_SQL)}module.exports={RELEASE_HARDENING_SQL,ensureReleaseHardeningSchema};
