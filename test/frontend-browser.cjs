'use strict';

// Optional browser suite: requires Playwright and a Chromium executable.
// Run: node test/frontend-browser.cjs
// Starts the app with a disposable database; never writes the tracked database.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
let chromium;
try { ({chromium} = require('playwright')); }
catch { console.error('Browser checks require Playwright. Install it in your development environment and run this optional suite again.');process.exit(1); }

const root = path.resolve(__dirname,'..');
const pages = ['index.html','products.html','cart.html','wishlist.html','vehicle-finder.html','request-part.html','exchange.html','contact.html','about.html','brands.html','dashboard.html','login.html','track-order.html','policies.html','admin.html'];
const failures = [], passed = [], errors = [], internalLinks = new Set();
let server, browser, base, artifacts, originalHash;
const hash = async () => createHash('sha256').update(await fs.readFile(path.join(root,'database.db'))).digest('hex');
async function check(name, operation) { try { await operation();passed.push(name);console.log(`PASS ${name}`); }catch(error){failures.push({name,error:error.message});console.error(`FAIL ${name}: ${error.message}`);} }
async function port() { const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const value=listener.address().port;await new Promise(resolve=>listener.close(resolve));return value; }
async function start() {
  originalHash=await hash();
  artifacts=process.env.AAMM_ARTIFACT_DIR||await fs.mkdtemp(path.join(os.tmpdir(),'aamm-browser-'));
  await fs.mkdir(artifacts,{recursive:true});
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'aamm-browser-db-'));
  const db=path.join(temporary,'database.db');await fs.copyFile(path.join(root,'database.db'),db);
  const appPort=await port();base=`http://127.0.0.1:${appPort}`;
  server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(appPort),DB_PATH:db,ADMIN_PHONE:'9990000001',ADMIN_PASSWORD:'Browser-Test-Password-Only-42!',APP_ORIGIN:base,SMS_PROVIDER:'',SMS_API_KEY:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',AI_API_KEY:'',OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let output='';server.stdout.on('data',value=>output+=value);server.stderr.on('data',value=>output+=value);
  for(let i=0;i<150;i++){if(server.exitCode!==null)throw new Error(`Test server exited: ${output}`);try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error(`Test server failed to start: ${output}`);
}
async function goto(page,file) {
  const response=await page.goto(base+'/'+file,{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200,`${file} must be served as a page`);
  assert.ok(response.headers()['content-type'].includes('text/html'),`${file} returned non-HTML`);
  if(!file.startsWith('admin.html'))await page.locator('#app').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.loading'));
  if(!file.startsWith('admin.html'))await page.waitForFunction(()=>document.querySelector('#app')?.textContent.trim()&&!document.querySelector('#app .loading'));
  await page.locator('#themeToggle').waitFor();
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')));
  for(const href of links){if(!href||href.startsWith('#')||/^[a-z][a-z0-9+.-]*:/i.test(href))continue;internalLinks.add(href.split('#')[0]);}
}
async function main(){
  await start();
  const launch={headless:true};
  if(process.env.CHROMIUM_PATH)launch.executablePath=process.env.CHROMIUM_PATH;
  else {try{await fs.access('/usr/bin/chromium');launch.executablePath='/usr/bin/chromium';}catch{}}
  launch.args=['--no-sandbox'];browser=await chromium.launch(launch);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}));
  const catalogue=await (await fetch(base+'/products')).json();assert.ok(catalogue.length>12,'Expected the preserved catalogue');
  const sample=catalogue.find(p=>p.price!==null&&p.stock_quantity!==0&&p.vehicle&&p.subcategory);
  pages.push(`product.html?id=${sample.id}`);
  await check('dark/light toggle persists through reload and navigation',async()=>{
    await goto(page,'index.html');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await page.getByRole('button',{name:'Switch to light mode',exact:true}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('aamm_theme')),'light');await page.reload();await page.locator('#themeToggle').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await goto(page,'products.html');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.getByRole('button',{name:'Switch to dark mode',exact:true}).click();await page.reload();await page.locator('#themeToggle').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  });
  await check('every page renders in both themes at desktop and mobile widths',async()=>{
    for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});for(const theme of ['dark','light']){await page.evaluate(theme=>localStorage.setItem('aamm_theme',theme),theme);for(const file of pages){await goto(page,file);assert.equal(await page.locator('html').getAttribute('data-theme'),theme,`${file} theme`);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${file} overflows at ${width}px (${theme})`);if(!file.startsWith('admin'))assert.equal(await page.locator('#app h1').count(),1,`${file} needs one main heading`);if(file==='index.html')await page.screenshot({path:path.join(artifacts,`home-${width}-${theme}.png`),fullPage:true});}}}
    await page.setViewportSize({width:1440,height:1000});
  });
  await check('catalogue search combines category, type, vehicle and price filters',async()=>{
    await goto(page,'products.html');await page.locator('#filterCategory').selectOption(sample.category);await page.locator('#filterSubcategory').selectOption(sample.subcategory);await page.locator('#filterVehicle').selectOption(sample.vehicle);await page.locator('#filterMaxPrice').fill(String(sample.price));await page.locator('#filterMaxPrice').dispatchEvent('change');await page.locator('#shopSearch').fill(sample.display_name);await page.locator('#catalogueSearch').evaluate(form=>form.requestSubmit());
    const expected=catalogue.filter(p=>p.category===sample.category&&p.subcategory===sample.subcategory&&p.vehicle===sample.vehicle&&p.price!==null&&p.price<=sample.price&&sample.display_name.toLowerCase().split(/\s+/).every(word=>[p.display_name,p.name,p.category,p.subcategory,p.vehicle,p.sku,p.brand].join(' ').toLowerCase().includes(word)));
    await page.waitForFunction(count=>document.querySelectorAll('#shopGrid .product-card').length===count,expected.length);assert.equal(await page.locator('#shopGrid .product-card').count(),expected.length);assert.ok((await page.locator('#resultCount').innerText()).startsWith(String(expected.length)+' '));
    await page.locator('#clearFilters').click();await page.waitForFunction(()=>document.querySelectorAll('#shopGrid .product-card').length===12);assert.equal(await page.locator('#shopGrid .product-card').count(),12);const first=await page.locator('#shopGrid [data-add]').first().getAttribute('data-add');await page.locator('#nextPage').click();await page.waitForFunction(id=>document.querySelector('#shopGrid [data-add]')?.dataset.add!==id,first);assert.notEqual(await page.locator('#shopGrid [data-add]').first().getAttribute('data-add'),first);await page.locator('#prevPage').click();await page.waitForFunction(id=>document.querySelector('#shopGrid [data-add]')?.dataset.add===id,first);assert.equal(await page.locator('#shopGrid [data-add]').first().getAttribute('data-add'),first);
    await page.locator('#shopSearch').fill('no-such-part-xyz-9084');await page.locator('#catalogueSearch').evaluate(form=>form.requestSubmit());await page.locator('#shopGrid .empty').waitFor();assert.equal(await page.locator('#shopGrid .product-card').count(),0);assert.ok(await page.locator('#shopGrid a[href="request-part.html"]').count());
  });
  await check('product deep link, quantities, wishlist and recent views persist',async()=>{
    await page.evaluate(()=>{localStorage.removeItem('aamm_cart');localStorage.removeItem('aamm_wishlist');});await goto(page,`product.html?id=${sample.id}`);assert.equal(await page.locator('#app h1').innerText(),sample.display_name);assert.ok((await page.locator('#app').innerText()).includes('Compatibility not verified'));
    await page.locator('#detailPlus').click();await page.locator('#detailAdd').click();assert.equal(await page.locator('#cartCount').innerText(),'2');await page.locator('.wish-button-static').click();await goto(page,'wishlist.html');assert.equal(await page.locator('#app .product-card').count(),1);await page.reload();await page.locator('#app .product-card').waitFor();assert.equal(await page.locator('#app .product-card h3').innerText(),sample.display_name);
    await goto(page,'index.html');assert.ok((await page.locator('#app').innerText()).includes(sample.display_name));
  });
  let order;
  await check('cart quantity, server enquiry, WhatsApp payload and duplicate prevention',async()=>{
    await goto(page,'cart.html');await page.locator('[data-qty][data-delta="1"]').click();assert.equal(await page.locator('#cartCount').innerText(),'3');await page.locator('[data-qty][data-delta="-1"]').click();assert.equal(await page.locator('#cartCount').innerText(),'2');
    await page.locator('#checkoutForm [name="name"]').fill('Browser Test Customer');await page.locator('#checkoutForm [name="phone"]').fill('9990000002');await page.locator('#checkoutForm [name="address"]').fill('Disposable test delivery address');await page.locator('#checkoutForm [name="delivery"]').selectOption('bus');
    const responsePromise=page.waitForResponse(response=>response.url()===base+'/orders'&&response.request().method()==='POST');await page.locator('#checkoutForm button[type="submit"]').click();const response=await responsePromise;assert.equal(response.status(),201);order=await response.json();assert.ok(order.reference.startsWith('AAMM-'));assert.equal(order.payment_status,'not_requested');assert.ok(order.tracking_token,'Guest tracking requires a private token');
    const sent=response.request().postDataJSON();assert.equal(sent.items[0].qty,2);assert.equal(sent.total,undefined,'The client must not submit an authoritative total');
    await page.locator('#checkoutResult a[href^="https://wa.me/"]').waitFor();const whatsapp=new URL(await page.locator('#checkoutResult a[href^="https://wa.me/"]').getAttribute('href'));assert.equal(whatsapp.hostname,'wa.me');assert.ok(whatsapp.searchParams.get('text').includes(order.reference));assert.ok(whatsapp.searchParams.get('text').includes(sample.display_name));
    const duplicatePromise=page.waitForResponse(response=>response.url()===base+'/orders'&&response.request().method()==='POST');await page.locator('#checkoutForm button[type="submit"]').click();const duplicate=await(await duplicatePromise).json();assert.equal(duplicate.reference,order.reference);const storedToken=await page.evaluate(reference=>JSON.parse(localStorage.getItem('aamm_order_refs')).find(item=>item.reference===reference)?.tracking_token,order.reference);assert.equal(storedToken,order.tracking_token,'Retrying must preserve the private receipt token');
    await page.locator('[data-remove]').click();assert.equal(await page.locator('.cart-item').count(),0);assert.equal(await page.locator('#cartCount').innerText(),'0');
  });
  await check('private guest tracking shows real internal order status',async()=>{
    assert.ok(order?.tracking_token,'A cart enquiry must create a tracking token first');await goto(page,`track-order.html?reference=${encodeURIComponent(order.reference)}`);await page.locator('#trackForm [name="token"]').fill(order.tracking_token);await page.locator('#trackForm').evaluate(form=>form.requestSubmit());await page.locator('#trackResult .panel').waitFor();assert.ok((await page.locator('#trackResult').innerText()).includes(order.reference));assert.ok((await page.locator('#trackResult').innerText()).includes('Enquiry submitted'));
  });
  await check('spare-part and exchange forms persist real requests',async()=>{
    for(const [file,endpoint,prefix] of [['request-part.html','/enquiries','ENQ-'],['exchange.html','/exchange-requests','EXC-'],['contact.html','/enquiries','ENQ-']]){await goto(page,file);await page.locator('#enquiryForm [name="name"]').fill('Browser Test Customer');await page.locator('#enquiryForm [name="phone"]').fill('9990000002');await page.locator('#enquiryForm [name="part_name"]').fill('Browser test spare part');await page.locator('#enquiryForm [name="vehicle"]').fill(sample.vehicle);await page.locator('#enquiryForm [name="message"]').fill('Disposable database automated browser check');const responsePromise=page.waitForResponse(response=>response.url()===base+endpoint&&response.request().method()==='POST');await page.locator('#enquiryForm button[type="submit"]').click();const response=await responsePromise;assert.equal(response.status(),201);const data=await response.json();assert.ok(data.reference.startsWith(prefix));await page.locator('#enquiryPanel .success-box').waitFor();assert.ok((await page.locator('#enquiryPanel').innerText()).includes(data.reference));}
  });
  await check('vehicle finder saves a catalogue reference without claiming compatibility',async()=>{
    await goto(page,'vehicle-finder.html');assert.ok((await page.locator('#app').innerText()).includes('Compatibility not verified'));await page.locator('#finderVehicle').selectOption(sample.vehicle);await page.locator('#saveVehicle').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('aamm_saved_vehicle'))),sample.vehicle);await Promise.all([page.waitForURL('**/products.html?*'),page.locator('#finderForm').evaluate(form=>form.requestSubmit())]);await page.locator('#shopGrid .product-card').first().waitFor();assert.equal(new URL(page.url()).searchParams.get('vehicle'),sample.vehicle);assert.ok(await page.locator('#shopGrid .product-card').count());
  });
  await check('Tamil preference persists and mobile navigation remains usable',async()=>{
    await goto(page,'index.html');await page.locator('#languageToggle').click();await page.waitForFunction(()=>document.documentElement.lang==='ta');assert.match(await page.locator('#app h1').innerText(),/[\u0B80-\u0BFF]/);await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='ta');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.locator('#menuToggle').click();assert.equal(await page.locator('#menuToggle').getAttribute('aria-expanded'),'true');await page.locator('#siteNav a[href="products.html"]').click();await page.locator('#shopGrid .product-card').first().waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'ta');await page.locator('#languageToggle').click();await page.waitForFunction(()=>document.documentElement.lang==='en');await page.setViewportSize({width:1440,height:1000});
  });
  await check('unconfigured phone authentication reports the actual service state',async()=>{
    await goto(page,'dashboard.html');assert.equal(await page.locator('#signInForm button[type="submit"]').isDisabled(),true);assert.match(await page.locator('#app').innerText(),/configur|unavailable|SMS/i);const response=await page.request.post(base+'/auth/otp/request',{data:{phone:'9990000002'}});assert.equal(response.status(),503);const current=await page.request.get(base+'/auth/me');assert.equal(current.status(),401);
  });
  await check('catalogue support searches genuine records',async()=>{
    await goto(page,'index.html');await page.locator('#helpToggle').click();await page.locator('#helpQuery').fill(sample.display_name);await page.locator('#helpForm').evaluate(form=>form.requestSubmit());await page.locator('#helpResults a').first().waitFor();assert.ok((await page.locator('#helpResults').innerText()).includes(sample.display_name));
  });
  await check('internal navigation destinations return real HTML pages',async()=>{
    for(const href of internalLinks){const response=await page.request.get(base+'/'+href);assert.equal(response.status(),200,href);assert.ok(response.headers()['content-type'].includes('text/html'),href);}
  });
  await check('all controls have names and no page throws JavaScript errors',async()=>{
    await goto(page,'products.html');const unnamed=await page.locator('button,input,select,textarea').evaluateAll(nodes=>nodes.filter(node=>!node.getAttribute('aria-label')&&!node.getAttribute('title')&&!node.textContent.trim()&&!node.closest('label')&&!node.labels?.length&&node.type!=='hidden').map(node=>node.outerHTML));assert.deepEqual(unnamed,[]);assert.deepEqual(errors,[]);
  });
  assert.equal(await hash(),originalHash,'Tracked database bytes must remain unchanged');
  await fs.writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed,failures,pageErrors:errors,originalDatabaseUnchanged:true},null,2));
  console.log(`Browser results: ${passed.length} passed, ${failures.length} failed. Artifacts: ${artifacts}`);
  if(failures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');const timeout=setTimeout(()=>server.kill('SIGKILL'),3000);await exited;clearTimeout(timeout);}});
