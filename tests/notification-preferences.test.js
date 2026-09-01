const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path')
const root=path.join(__dirname,'..')
test('notification preference schema accepts supported alert checkboxes and rejects unknown alerts',()=>{
  const {preferenceSchema}=require('../src/modules/notification-preferences/notification-preferences.schema')
  assert.equal(preferenceSchema.parse({alerts:[{key:'inventory.expiry_near',recipient_ids:[2,3]}]}).alerts.length,1)
  assert.throws(()=>preferenceSchema.parse({alerts:[{key:'orders.created',recipient_ids:[2]}]}))
  assert.throws(()=>preferenceSchema.parse({alerts:[{key:'inventory.expired',recipient_ids:[2]},{key:'inventory.expired',recipient_ids:[3]}]}))
})
test('preference migration is tenant scoped and recipient unique',()=>{
  const sql=require('../src/modules/notification-preferences/notification-preferences.migration').NOTIFICATION_PREFERENCES_MIGRATION_SQL
  assert.match(sql,/PRIMARY KEY\(shop_id,alert_key\)/)
  assert.match(sql,/PRIMARY KEY\(shop_id,alert_key,user_id\)/)
  assert.match(sql,/REFERENCES users\(id\) ON DELETE CASCADE/)
})
test('management preferences are isolated from order lifecycle producers',()=>{
  const sales=fs.readFileSync(path.join(root,'services','SalesService.js'),'utf8'),infrastructure=fs.readFileSync(path.join(root,'services','InfrastructureService.js'),'utf8')
  assert.doesNotMatch(sales,/notification-preferences/)
  assert.doesNotMatch(infrastructure,/notification-preferences/)
})
