const service = require('./attendance.service');
async function templates(req, res) { res.json(await service.listTemplates(req.session.user)); }
async function staffOptions(req, res) { res.json(await service.listStaffOptions(req.session.user)); }
async function createTemplate(req, res) { res.status(201).json(await service.createTemplate(req.session.user, req.body)); }
async function versionTemplate(req, res) { res.status(201).json(await service.versionTemplate(req.session.user, req.params.id, req.body)); }
async function schedule(req, res) { res.json(await service.saveSchedule(req.session.user, req.body)); }
async function holiday(req, res) { res.status(201).json(await service.addHoliday(req.session.user, req.body)); }
async function clock(req, res) { res.status(201).json(await service.clock(req.session.user, req.body)); }
async function clockState(req, res) { res.json(await service.clockState(req.session.user)); }
async function calendar(req, res) { res.json(await service.calendar(req.session.user, req.query)); }
async function corrections(req, res) { res.json(await service.listCorrections(req.session.user)); }
async function requestCorrection(req, res) { res.status(201).json(await service.requestCorrection(req.session.user, req.body)); }
async function reviewCorrection(req, res) { res.json(await service.reviewCorrection(req.session.user, req.params.id, req.body)); }
async function snapshots(req, res) { res.json(await service.listSnapshots(req.session.user)); }
async function createSnapshot(req, res) { res.status(201).json(await service.createSnapshot(req.session.user, req.body)); }
async function approveSnapshot(req, res) { res.json(await service.approveSnapshot(req.session.user, req.params.id)); }
async function shiftRegister(req,res){res.json(await service.shiftRegister(req.session.user,req.query));}
async function submitShiftRegister(req,res){res.status(201).json(await service.submitShiftRegister(req.session.user,req.body));}
async function markShiftStaff(req,res){res.status(201).json(await service.markShiftStaff(req.session.user,req.params.staffId,req.body));}
async function clockOutShiftRegister(req,res){res.status(201).json(await service.clockOutShiftRegister(req.session.user,req.params.registerId,req.params.staffId,req.body));}
module.exports = { templates, staffOptions, createTemplate, versionTemplate, schedule, holiday, clock, clockState, calendar, corrections, requestCorrection, reviewCorrection, snapshots, createSnapshot, approveSnapshot, shiftRegister, submitShiftRegister, markShiftStaff, clockOutShiftRegister };
