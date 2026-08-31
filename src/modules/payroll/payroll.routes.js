const express=require('express'); const {requirePermission}=require('../../../authorization/middleware'); const controller=require('./payroll.controller'); const router=express.Router();
router.get('/setup',requirePermission('payroll.view'),controller.setup); router.post('/salary-configs',requirePermission('payroll.configure'),controller.salary);
router.post('/recurring-items',requirePermission('payroll.configure'),controller.recurring); router.post('/advances',requirePermission('payroll.configure'),controller.advance);
router.post('/adjustments',requirePermission('payroll.configure'),controller.adjustment);
router.post('/periods',requirePermission('payroll.run'),controller.period); router.get('/runs',requirePermission('payroll.view'),controller.runs);
router.post('/runs',requirePermission('payroll.run'),controller.run); router.get('/runs/:id',requirePermission('payroll.view'),controller.detail);
router.get('/runs/:id/payslips/:payslipId',requirePermission('payroll.view'),controller.payslip);
router.patch('/runs/:id/transition',(req,res,next)=>{const permission={review:'payroll.review',approve:'payroll.approve',finalize:'payroll.finalize'}[req.body?.action];if(!permission)return res.status(400).json({error:'Invalid payroll transition.'});return requirePermission(permission)(req,res,next);},controller.transition); router.post('/runs/:id/reverse',requirePermission('payroll.finalize'),controller.reverse);
module.exports=router;
