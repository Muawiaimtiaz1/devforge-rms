const db = require('../../../db/knex')
const repository = require('./notification-preferences.repository')
const { preferenceSchema } = require('./notification-preferences.schema')
const { ALERTS, ALERT_KEYS } = require('./notification-preferences.constants')
function shop(user) { const id=Number(user?.shop_id); if(!Number.isInteger(id)||id<=0){const error=new Error('No shop assigned');error.status=403;throw error} return id }
function eligibleIds(key,users,permissions){
  const permissionMap=new Map(users.map((item)=>[Number(item.id),new Set(permissions.filter((row)=>Number(row.user_id)===Number(item.id)).map((row)=>row.key))]))
  return users.filter((item)=>key==='register.cash_drop_requested'?permissionMap.get(Number(item.id))?.has('register.verify_cash'):permissionMap.get(Number(item.id))?.has('raw_stock.view')||permissionMap.get(Number(item.id))?.has('products.view')).map((item)=>Number(item.id))
}
async function get(user) {
  const shopId=shop(user),[users,settings,recipients,permissions]=await Promise.all([repository.activeUsers(shopId),repository.settings(shopId),repository.recipients(shopId),repository.userPermissions(shopId)])
  const configured=new Set(settings.map((row)=>row.alert_key))
  return { users, alerts: ALERTS.map((alert)=>{const eligible=eligibleIds(alert.key,users,permissions);return {...alert,configured:configured.has(alert.key),recipient_ids:recipients.filter((row)=>row.alert_key===alert.key&&row.in_app_enabled).map((row)=>Number(row.user_id)),default_recipient_ids:eligible,eligible_recipient_ids:eligible}}) }
}
async function save(user,payload) {
  const shopId=shop(user),data=preferenceSchema.parse(payload),[users,permissions]=await Promise.all([repository.activeUsers(shopId),repository.userPermissions(shopId)]),validUsers=new Set(users.map((row)=>Number(row.id)))
  for(const alert of data.alerts) if(alert.recipient_ids.some((id)=>!validUsers.has(Number(id)))){const error=new Error('One or more selected users are not active users in this shop.');error.status=400;throw error}
  for(const alert of data.alerts){const eligible=new Set(eligibleIds(alert.key,users,permissions));if(alert.recipient_ids.some((id)=>!eligible.has(Number(id)))){const error=new Error('A selected user does not have permission to receive this alert.');error.status=400;throw error}}
  await db.transaction(async(trx)=>{for(const alert of data.alerts){await trx('notification_alert_recipients').where({shop_id:shopId,alert_key:alert.key}).del();await trx('notification_alert_settings').insert({shop_id:shopId,alert_key:alert.key,updated_by_user_id:user.id,updated_at:trx.fn.now()}).onConflict(['shop_id','alert_key']).merge({updated_by_user_id:user.id,updated_at:trx.fn.now()});const rows=[...new Set(alert.recipient_ids.map(Number))].map((userId)=>({shop_id:shopId,alert_key:alert.key,user_id:userId,in_app_enabled:true,push_enabled:true}));if(rows.length)await trx('notification_alert_recipients').insert(rows)}})
  return get(user)
}
async function selection(shopId,key) {
  if(!ALERT_KEYS.has(key))throw new Error('Unknown notification alert type')
  const configured=await db('notification_alert_settings').where({shop_id:shopId,alert_key:key}).first('alert_key')
  if(!configured)return null
  return db('notification_alert_recipients as recipient').join('users as user','user.id','recipient.user_id').where({'recipient.shop_id':shopId,'recipient.alert_key':key,'recipient.in_app_enabled':true,'user.shop_id':shopId}).where((query)=>query.whereNull('user.status').orWhere('user.status','active')).pluck('recipient.user_id')
}
async function allows(shopId,userId,key){const selected=await selection(shopId,key);return selected===null?null:selected.map(Number).includes(Number(userId))}
module.exports = { get, save, selection, allows, ALERTS }
