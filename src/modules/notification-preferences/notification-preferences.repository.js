const db = require('../../../db/knex')
function settings(shopId, trx = db) { return trx('notification_alert_settings').where({ shop_id: shopId }).select('alert_key') }
function recipients(shopId, trx = db) { return trx('notification_alert_recipients').where({ shop_id: shopId }).select('alert_key','user_id','in_app_enabled','push_enabled') }
function activeUsers(shopId, trx = db) { return trx('users').where({ shop_id: shopId }).whereNot('role','superadmin').where((query) => query.whereNull('status').orWhere('status','active')).select('id','name','username','role').orderBy('name') }
function userPermissions(shopId, trx = db) { return trx('users as user').join('user_roles as ur','ur.user_id','user.id').join('roles as role','role.id','ur.role_id').join('role_permissions as rp','rp.role_id','role.id').join('permissions as permission','permission.id','rp.permission_id').where('user.shop_id',shopId).where('role.shop_id',shopId).where((query)=>query.whereNull('user.status').orWhere('user.status','active')).distinct('user.id as user_id','permission.key') }
module.exports = { settings, recipients, activeUsers, userPermissions }
