'use strict';

// Real-browser Buy now checks against a server with a disposable database copy.
// No live SMS, Google or payment provider is used. The tracked DB is hash-checked.
// Optional: node test/buy-now-browser.cjs (requires Playwright and Chromium).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Install Playwright in the development environment to run this optional Buy now browser suite.');process.exit(1); }
const root = path.resolve(__dirname, '..');
const trackedDatabase = path.join(root, 'database.db');
let originalHash,server,browser,base;
const adminPassword = 'Buy-Now-Browser-Only-Password-93!';
const digest = async () => createHash('sha256').update(await fs.readFile(trackedDatabase)).digest('hex');
async function availablePort() {const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const value=listener.address().port;await new Promise(resolve=>listener.close(resolve));return value;}
async function launchServer() {
  originalHash=await digest();
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'alagar-buy-now-'));
  const database=path.join(temporary,'database.db');await fs.copyFile(trackedDatabase,database);
  const port=await availablePort();base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DB_PATH:database,APP_ORIGIN:base,ADMIN_ID:'buy-now-ui-owner',ADMIN_PHONE:'',ADMIN_PASSWORD:adminPassword,TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:'',SMS_API_KEY:'',SMS_PROVIDER:'',GOOGLE_CLIENT_ID:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:'',OPENAI_API_KEY:'',AI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let output='';server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
  for(let attempt=0;attempt<150;attempt++){if(server.exitCode!==null)throw new Error(`Disposable server exited: ${output}`);try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
  throw new Error(`Disposable server did not become ready: ${output}`);
}
async function main() {
  await launchServer();
  const adminLogin=await fetch(base+'/auth/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'buy-now-ui-owner',password:adminPassword})});
  assert.equal(adminLogin.status,200,'Test administrator login');
  const cookie=adminLogin.headers.get('set-cookie').split(';')[0];
  async function adminWrite(endpoint,body,method='POST') {
    const response=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    const data=await response.json();assert.ok(response.ok,`${endpoint}: ${data.error||response.status}`);return data;
  }
  const category='Buy now browser fixtures';
  async function create(display_name,price,stock_quantity) {const result=await adminWrite('/products',{display_name,category,subcategory:'Stator',vehicle:'Browser Test Vehicle',price,stock_quantity,description:'Disposable automated browser fixture'});return {id:result.id,display_name,category,price,stock_quantity};}
  const target=await create('Buy Now Browser Priced Part',1234.5,7);
  const other=await create('Buy Now Browser Saved Cart Part',500,12);
  const quotation=await create('Buy Now Browser Quotation Part',null,5);
  const unavailable=await create('Buy Now Browser Out Of Stock Part',400,0);
  const executablePath=process.env.CHROMIUM_PATH || await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined);
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1365,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const errors=[],failedResponses=[];page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.url().startsWith(base)&&response.status()>=400)failedResponses.push({url:response.url(),status:response.status()});});
  async function goto(file) {const response=await page.goto(base+'/'+file,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200,file);await page.waitForFunction(()=>!document.querySelector('#app .loading'));await page.locator('#themeToggle').waitFor();}
  const originalCart=JSON.stringify([{id:other.id,qty:2}]);
  async function assertCartPreserved() {assert.equal(await page.evaluate(()=>localStorage.getItem('aamm_cart')),originalCart);assert.equal(await page.locator('#cartCount').innerText(),'2');}
  async function assertDirect(id,quantity) {assert.equal(await page.locator('.cart-item').count(),1);assert.equal(await page.locator('.cart-item h3 a').getAttribute('href'),`product.html?id=${id}`);assert.equal(await page.locator('.cart-item .quantity span').innerText(),String(quantity));assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aamm_buy_now'))),{id,qty:quantity});await assertCartPreserved();}

  await goto('products.html?category='+encodeURIComponent(category));
  await page.evaluate(value=>localStorage.setItem('aamm_cart',value),originalCart);await page.reload();
  await page.locator(`[data-buy="${target.id}"]`).waitFor();
  await assertCartPreserved();
  // The checkout page must fetch the latest catalogue rather than a stale card price.
  target.price=1399.75;await adminWrite('/products/'+target.id,{price:target.price},'PUT');
  await Promise.all([page.waitForURL(`**/cart.html?buy=${target.id}&qty=1`),page.locator(`[data-buy="${target.id}"]`).click()]);
  await page.locator('#checkoutForm').waitFor();await assertDirect(target.id,1);
  assert.ok((await page.locator('.cart-item-price').innerText()).includes('1,399.75'),'Checkout uses the latest server catalogue price');
  await page.locator('[data-qty][data-delta="1"]').click();await assertDirect(target.id,2);assert.equal(new URL(page.url()).searchParams.get('qty'),'2');
  await page.locator('[data-qty][data-delta="-1"]').click();await assertDirect(target.id,1);
  await Promise.all([page.waitForURL(base+'/cart.html'),page.locator('[data-remove]').click()]);
  await page.locator('.cart-item').waitFor();assert.equal(await page.locator('.cart-item h3 a').getAttribute('href'),`product.html?id=${other.id}`);assert.equal(await page.evaluate(()=>sessionStorage.getItem('aamm_buy_now')),null);await assertCartPreserved();
  console.log('PASS Buy now: catalogue action selects one part with latest pricing; quantity/session/URL edits and removal preserve the saved cart and badge.');

  await goto(`product.html?id=${target.id}`);await page.locator('#detailPlus').click();await page.locator('#detailPlus').click();assert.equal(await page.locator('#detailQuantity').innerText(),'3');
  await Promise.all([page.waitForURL(`**/cart.html?buy=${target.id}&qty=3`),page.locator('#detailBuy').click()]);
  await page.locator('#checkoutForm').waitFor();await assertDirect(target.id,3);
  await page.locator('#checkoutForm [name="name"]').fill('Buy Now Browser Customer');await page.locator('#checkoutForm [name="phone"]').fill('9990000004');await page.locator('#checkoutForm [name="address"]').fill('Disposable browser test delivery address');await page.locator('#checkoutForm [name="delivery"]').selectOption('pickup');
  const responsePromise=page.waitForResponse(response=>response.url()===base+'/orders'&&response.request().method()==='POST');await page.locator('#checkoutForm button[type="submit"]').click();const response=await responsePromise;assert.equal(response.status(),201);const order=await response.json();
  assert.deepEqual(response.request().postDataJSON().items,[{id:target.id,qty:3}]);assert.equal(response.request().postDataJSON().total,undefined);assert.equal(response.request().postDataJSON().price,undefined);
  assert.equal(order.items.length,1);assert.equal(order.items[0].id,target.id);assert.equal(order.items[0].qty,3);assert.equal(order.items[0].price,target.price);assert.equal(order.total,target.price*3);assert.equal(order.payment_status,'not_requested');assert.equal(order.status,'Enquiry submitted');
  await page.locator('#checkoutResult .success-box').waitFor();assert.match(await page.locator('#checkoutResult').innerText(),/not a confirmed order/i);assert.ok(await page.locator('#checkoutResult a[href^="https://wa.me/"]').count());await assertCartPreserved();
  console.log('PASS Buy now: detail quantity reaches isolated checkout; the real backend validates one selected part, current price and total, with an honest unpaid enquiry result.');

  await goto(`cart.html?buy=${target.id}&qty=999&price=1&total=1`);await page.locator('#checkoutForm').waitFor();await assertDirect(target.id,7);assert.ok((await page.locator('.summary-row.total').innerText()).includes('9,798.25'),'Query-string prices cannot alter catalogue totals');
  await page.locator('[data-qty][data-delta="1"]').click();await assertDirect(target.id,7);
  await goto(`cart.html?buy=${target.id}&qty=-5`);await page.locator('#checkoutForm').waitFor();await assertDirect(target.id,1);
  await goto(`cart.html?buy=${target.id}&qty=2.5`);await page.locator('#checkoutForm').waitFor();await assertDirect(target.id,1);
  await goto('cart.html?buy=invalid&qty=999');assert.equal(await page.locator('#checkoutForm').count(),0);await assertCartPreserved();
  console.log('PASS Buy now: tampered quantities are bounded by stock, invalid selections have no checkout form, and URL price/total values are ignored.');

  await goto('products.html?category='+encodeURIComponent(category));await page.locator(`#shopGrid .product-card [data-add="${quotation.id}"]`).waitFor();
  const unknownCard=page.locator('.product-card').filter({has:page.locator(`a[href="product.html?id=${quotation.id}"]`)});
  assert.equal(await unknownCard.locator('[data-buy]').count(),0);assert.equal(await unknownCard.locator('[data-add]').isDisabled(),true);
  const quoteLink=unknownCard.locator('a.card-buy');const quoteUrl=new URL(await quoteLink.getAttribute('href'),base);assert.equal(quoteUrl.pathname,'/request-part.html');assert.equal(quoteUrl.searchParams.get('part'),quotation.display_name);assert.equal(quoteUrl.searchParams.get('vehicle'),'Browser Test Vehicle');
  assert.equal(await page.locator(`[data-buy="${unavailable.id}"]`).isDisabled(),true);assert.equal(await page.locator(`[data-add="${unavailable.id}"]`).isDisabled(),true);
  await Promise.all([page.waitForURL('**/request-part.html?*'),quoteLink.click()]);await page.locator('#enquiryForm').waitFor();assert.equal(await page.locator('#enquiryForm [name="part_name"]').inputValue(),quotation.display_name);assert.equal(await page.locator('#enquiryForm [name="vehicle"]').inputValue(),'Browser Test Vehicle');
  await goto(`product.html?id=${quotation.id}`);assert.equal(await page.locator('#detailBuy').count(),0);assert.equal(await page.locator('.product-primary-actions a[href^="request-part.html"]').count(),1);
  await goto(`product.html?id=${unavailable.id}`);assert.equal(await page.locator('#detailBuy').isDisabled(),true);assert.equal(await page.locator('#detailAdd').isDisabled(),true);
  for(const product of [quotation,unavailable]){await goto(`cart.html?buy=${product.id}&qty=1`);assert.equal(await page.locator('#checkoutForm').count(),0);await assertCartPreserved();}
  console.log('PASS Buy now: quotation-only parts lead to a prefilled price request, out-of-stock actions are disabled, and direct URLs cannot bypass these states.');

  await page.setViewportSize({width:320,height:844});
  for(const language of ['en','ta']){
    await page.evaluate(value=>localStorage.setItem('aamm_language',JSON.stringify(value)),language);
    await goto('products.html?category='+encodeURIComponent(category));await page.locator('#shopGrid .product-card').first().waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),language);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Catalogue overflows at320px in${language}`);
    const clipped=await page.locator('.product-card-actions').evaluateAll(nodes=>nodes.some(node=>{const card=node.closest('.product-card').getBoundingClientRect();return [...node.children].some(child=>{const rect=child.getBoundingClientRect();return rect.left<card.left-1||rect.right>card.right+1;});}));
    assert.equal(clipped,false,`Buy/add actions must fit each card in${language}`);
    await goto(`cart.html?buy=${target.id}&qty=3`);await page.locator('#checkoutForm').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Checkout overflows at320px in${language}`);await assertDirect(target.id,3);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failedResponses,[]);assert.equal(await digest(),originalHash,'The tracked database bytes must remain unchanged');
  console.log('PASS Buy now: English/Tamil card actions and isolated checkout fit320px, no browser JavaScript errors or failed local responses, and the tracked database is unchanged.');
  await context.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');const force=setTimeout(()=>server.kill('SIGKILL'),3000);await exited;clearTimeout(force);}if(originalHash&&await digest()!==originalHash){console.error('FAIL tracked database changed');process.exitCode=1;}});
