const service=require('./notification-preferences.service')
async function get(req,res){res.json(await service.get(req.session.user))}
async function save(req,res){res.json(await service.save(req.session.user,req.body))}
module.exports={get,save}
