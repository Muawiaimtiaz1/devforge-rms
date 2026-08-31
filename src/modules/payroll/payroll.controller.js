const service=require('./payroll.service');
async function setup(req,res){res.json(await service.listSetup(req.session.user));} async function salary(req,res){res.status(201).json(await service.salary(req.session.user,req.body));}
async function recurring(req,res){res.status(201).json(await service.recurring(req.session.user,req.body));} async function advance(req,res){res.status(201).json(await service.createAdvance(req.session.user,req.body));}
async function adjustment(req,res){res.status(201).json(await service.createAdjustment(req.session.user,req.body));}
async function period(req,res){res.status(201).json(await service.createPeriod(req.session.user,req.body));} async function runs(req,res){res.json(await service.listRuns(req.session.user));}
async function run(req,res){res.status(201).json(await service.generate(req.session.user,req.body));} async function detail(req,res){res.json(await service.detail(req.session.user,req.params.id));}
async function transition(req,res){res.json(await service.transition(req.session.user,req.params.id,req.body));} async function reverse(req,res){res.json(await service.reverse(req.session.user,req.params.id,req.body));}
async function payslip(req,res){const row=await service.payslip(req.session.user,req.params.id,req.params.payslipId);res.set({'Content-Disposition':`attachment; filename="${row.payslip_number}.json"`,'Cache-Control':'no-store, private'}).json(row.snapshot_json);}
module.exports={setup,salary,recurring,advance,adjustment,period,runs,run,detail,transition,reverse,payslip};
