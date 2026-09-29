const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('React POS remains isolated behind a direct route while vanilla stays intact',()=>{const app=fs.readFileSync(path.join(__dirname,'../frontend/src/App.jsx'),'utf8'),page=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosPage.jsx'),'utf8'),lobby=fs.readFileSync(path.join(__dirname,'../services/LobbyService.js'),'utf8'),vanilla=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8');assert.match(app,/\/app\/pos/);assert.match(page,/client_request_id/);assert.match(page,/orders\.create/);assert.match(page,/\/api\/sales/);assert.doesNotMatch(lobby,/module\.id === 'pos' \? '\/app\/pos'/);assert.match(vanilla,/async function renderPOS\(\)/);assert.match(vanilla,/async function checkout\(status = 'completed'\)/)});
test('React POS follows the vanilla restaurant action and table-assignment rules',()=>{
  const page=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosPage.jsx'),'utf8');
  const tables=fs.readFileSync(path.join(__dirname,'../frontend/src/modules/pos/PosTableSelection.jsx'),'utf8');
  assert.match(page,/submit\(retail\?'payment_pending':'pending'\)/);
  assert.doesNotMatch(page,/submit\(retail\?'payment_pending':'completed'\)/);
  assert.match(page,/table\.assigned_waiter_id \|\| ''/);
  assert.match(page,/print_jobs_queued/);
  assert.match(page,/setStage\('orders'\)/);
  assert.match(tables,/groupByWaiter/);
  assert.match(tables,/Waiter #/);
  assert.match(tables,/view === 'cards' && !groupByWaiter/);
});