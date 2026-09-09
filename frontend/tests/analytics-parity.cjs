
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
fs.writeFileSync(path.join(root,'tmp/analytics-legacy.tailwind.cjs'),"module.exports={content:['./public/js/analytics/*.js','./public/dashboard.html'],safelist:['lg:grid-cols-7','lg:grid-cols-6'],darkMode:'class',theme:{extend:{colors:{white:'#f8fafc',black:'#0f172a'}}}}");
fs.writeFileSync(path.join(root,'tmp/analytics-legacy.source.css'),'@tailwind base;\n@tailwind components;\n@tailwind utilities;');
require('node:child_process').execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli'),'--config','tmp/analytics-legacy.tailwind.cjs','--input','tmp/analytics-legacy.source.css','--output','tmp/analytics-legacy.css','--minify'],{cwd:root,stdio:'pipe',windowsHide:true});
const date=new Date(),end=date.toISOString().slice(0,10);date.setDate(date.getDate()-6);const start=date.toISOString().slice(0,10);
const fixture={bounds:{start:start+' 00:00:00',end:end+' 23:59:59'},kpi:{totalSales:1500,totalOrders:3,avgOrderValue:500,activeCustomers:3,walkInCustomers:2,totalCustomers:5,totalInvoices:3},growth:{sales:20,orders:10,customers:5,invoices:10},summary:{totalDiscounts:50,totalReturns:1,totalRefunds:100,grossProfit:900,shopProfit:850,shopProfitMargin:56.7,profitMargin:60,stockValue:12000},trendSeries:[{label:start,sales:600,orders:1},{label:end,sales:900,orders:2}],paymentBreakdown:[{label:'cash',sales:900,orders:2},{label:'card',sales:600,orders:1}],channelBreakdown:[{label:'dine_in',sales:1500,orders:3}],categoryBreakdown:[{label:'Burgers',sales:1500,orders:3}],bestSellingHours:[{label:'02',sales:900,orders:2}],topProducts:[{id:1,name:'Burger',stock:2,quantity_sold:3,sales:1500}],heatmapRaw:[{dt:end,block_idx:0,sales:900,orders:2},{dt:end,block_idx:1,sales:600,orders:1}],recentSales:[],staffPerformance:[{name:'Alex',orders:3,received_sales:1500}],brands:[{id:1,name:'Partner A',partner_type:'share_based'}],selectedBrandId:null,partnerProfitShares:[],brandPerformance:[],totalTipsCollected:50,tipsBreakdown:{cash_tips:50},totalCOGS:600,damageTotal:50,totalPartnerProfit:850};
const user={id:1,shop_id:1,name:'Alex',username:'alex',shop_name:'Test Restaurant',role:'admin',permissions:['analytics.view','dashboard.view']};
const modules=[{id:'analytics',label:'Analytics & Reports',frontend:'react',target:'/app/analytics'},{id:'dashboard',label:'Dashboard',frontend:'react',target:'/app/dashboard'}];
const ai={summary:{verdict:'Steady performance',aiConfidence:'High'},rawMetrics:{margin:'60%',growth:'20%'},insights:[{title:'Sales',message:'Steady sales',type:'success'}],recommendations:[]};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push(m.text())});
 const requests=[];
 await page.route('**/api/**',route=>{
 const url=new URL(route.request().url());if(!url.pathname.startsWith('/api/'))return route.continue();requests.push(url.pathname+url.search);
 const body=url.pathname==='/api/auth/me'?{user}:url.pathname==='/api/lobby'?{user,modules,register:{active:false}}:url.pathname==='/api/ai/insights'?ai:{...fixture,selectedBrandId:url.searchParams.get('brand_id')?1:null};
 return route.fulfill({json:body});
 });
 await page.route('**/service-worker.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>{Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({})}})});
 await page.goto('http://127.0.0.1:5173/app/analytics');
 await page.locator('#chart-sales-overview svg').waitFor();
 await page.screenshot({path:path.join(root,'tmp/analytics-react-desktop.png'),fullPage:true});
 const legacy=await browser.newPage({viewport:{width:1440,height:1000}});
 const html=fs.readFileSync(path.join(root,'public/dashboard.html'),'utf8');
 const inlineStyles=[...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match=>match[1]).join('\n');
 await legacy.setContent('<html><head></head><body><main class="pt-20"><div class="container mx-auto px-6 pb-20"><header class="flex items-center justify-between mb-8"><h2 class="text-3xl font-black">Analytics & Reports</h2><div class="h-px flex-1 mx-8"></div></header><div id="page-content"></div></div></main></body></html>');
 await legacy.addStyleTag({content:fs.readFileSync(path.join(root,'tmp/analytics-legacy.css'),'utf8')+'\n'+inlineStyles});
 await legacy.addStyleTag({url:'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'});
 await legacy.evaluate(({fixture,ai})=>{window.api=async url=>url.includes('/ai/')?ai:fixture;window.toast=()=>{}},{fixture,ai});
 for(const file of ['core','overview','charts','tabs'])await legacy.addScriptTag({content:fs.readFileSync(path.join(root,'public/js/analytics/analytics-'+file+'.js'),'utf8')});
 await legacy.evaluate(()=>renderAnalytics());
 await legacy.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>document.fonts.ready);
 await legacy.screenshot({path:path.join(root,'tmp/analytics-legacy-desktop.png'),fullPage:true});
 const normalized=s=>s.replace(/\s+/g,' ').trim();
 const tabs=['overview','sales','products','customers','inventory','profit','staff','channels','reports','ai','custom_reports'];
 for(let i=0;i<tabs.length;i++){
 await page.locator('#analytics-period-select').selectOption('7days');
 const drawer=page.locator('#analytics-sidebar-drawer');
 await page.locator('button').filter({has:page.locator('svg path[d="M4 6h16M4 12h16M4 18h7"]')}).click();
 await drawer.locator('nav button').nth(i).click();
 await page.waitForTimeout(80);
 assert.equal(await drawer.getAttribute('inert'),'');
 assert.ok((await page.locator('#analytics-viewport').innerText()).length>10,tabs[i]+' empty');
 await legacy.evaluate(tab=>switchAnalyticsTab(tab),tabs[i]);
 await legacy.waitForTimeout(80);
 assert.equal(normalized(await page.locator('#analytics-viewport').innerText()),normalized(await legacy.locator('#analytics-viewport').innerText()),tabs[i]+' text parity');
 const current=await page.locator('#analytics-viewport').boundingBox(),original=await legacy.locator('#analytics-viewport').boundingBox();
 assert.ok(Math.abs(current.height-original.height)<1,tabs[i]+' layout height parity');
 }

 // Compare responsive layout and text in both themes against the legacy renderer.
 for (const width of [768,390]) {
   await page.setViewportSize({width,height:900});
   await legacy.setViewportSize({width,height:900});
   for (const dark of [false,true]) {
     await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
     await legacy.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
     for (let i=0;i<tabs.length;i++) {
       await page.locator('button').filter({has:page.locator('svg path[d="M4 6h16M4 12h16M4 18h7"]')}).click();
       await page.locator('#analytics-sidebar-drawer nav button').nth(i).click();
       await legacy.evaluate(tab=>switchAnalyticsTab(tab),tabs[i]);
       await page.waitForTimeout(80);
       assert.equal(normalized(await page.locator('#analytics-viewport').innerText()),normalized(await legacy.locator('#analytics-viewport').innerText()),width+' '+dark+' '+tabs[i]+' text');
       const current=await page.locator('#analytics-viewport').boundingBox(),original=await legacy.locator('#analytics-viewport').boundingBox();
       assert.ok(Math.abs(current.height-original.height)<1,width+' '+dark+' '+tabs[i]+' height '+current.height+' / '+original.height);
     }
   }
 }
 await page.evaluate(()=>document.documentElement.classList.remove('dark'));
 await page.locator('#analytics-period-select').selectOption('custom');
 await page.locator('#custom-from').fill(start);
 await page.locator('#custom-to').fill(end);
 await page.waitForTimeout(100);
 assert.ok(requests.some(url=>url.includes('period=custom')&&url.includes('from=')));
 await page.locator('#analytics-brand-select').selectOption('1');
 await page.waitForTimeout(100);
 assert.ok(requests.some(url=>url.includes('brand_id=1')));
 await page.locator('#profile-trigger').click();
 await page.locator('#profile-theme-label').click();
 assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),true);
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(root,'tmp/analytics-react-mobile-dark.png'),fullPage:true});

 const analyticsPattern='**/api/analytics/dashboard-data?*';
 await page.route(analyticsPattern,route=>route.fulfill({status:500,json:{error:'Test unavailable'}}));
 await page.reload();
 await page.getByText('Test unavailable').waitFor();
 await page.unroute(analyticsPattern);
 await page.getByRole('button',{name:'Retry Query'}).click();
 await page.locator('#chart-sales-overview svg').waitFor();
 let printed=false;
 await page.exposeFunction('testPrinted',()=>{printed=true});
 await page.evaluate(()=>{window.print=()=>window.testPrinted()});
 await page.getByRole('button',{name:'Export Report'}).click();
 assert.equal(printed,true);
 const empty={...fixture,kpi:Object.fromEntries(Object.keys(fixture.kpi).map(key=>[key,0])),summary:Object.fromEntries(Object.keys(fixture.summary).map(key=>[key,0])),trendSeries:[],paymentBreakdown:[],channelBreakdown:[],categoryBreakdown:[],topProducts:[],heatmapRaw:[]};
 await page.route(analyticsPattern,route=>route.fulfill({json:empty}));
 await page.reload();
 await page.getByText('No products sold in this period.').waitFor();
 await page.route('**/api/auth/me',route=>route.fulfill({json:{user:{...user,role:'cashier',permissions:[]}}}));
 await page.reload();
 await page.getByText('You do not have permission to view Analytics.').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: 11 tabs, filters, partner selection, profile/theme, and mobile render without runtime errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

