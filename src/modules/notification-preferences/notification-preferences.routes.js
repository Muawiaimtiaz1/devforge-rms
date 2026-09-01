const express=require('express'),controller=require('./notification-preferences.controller'),{requirePermission}=require('../../../authorization/middleware'),router=express.Router()
router.get('/',requirePermission('settings.view'),controller.get)
router.put('/',requirePermission('settings.update'),controller.save)
module.exports=router
