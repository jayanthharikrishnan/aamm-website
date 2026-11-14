'use strict';

// Optional customer UI contract checks with explicit direct-UPI API fixtures.
// No bank, payment network, real credentials, orders or database are exercised.
// Requires Playwright + Chromium: node test/direct-upi-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { console.error('Install Playwright in the development environment to run these optional direct UPI UI checks.');process.exit(1); }
const root = path.resolve(__dirname, '..');
const publicFiles = new Set(['/dashboard.html','/track-order.html','/script.js','/style.css','/images/logo.jpeg']);
const server = http.createServer(async (request,response) => {
  const pathname = new URL(request.url,'http://localhost').pathname;
  if (!publicFiles.has(pathname)) {response.writeHead(404);response.end();return;}
  try {
    const body = await fs.readFile(path.join(root,pathname));
    response.setHeader('Content-Type',pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.jpeg')?'image/jpeg':'text/html');
    response.end(body);
  } catch { response.writeHead(404);response.end(); }
});
const reference = 'AA-MOCKED-UPI-UI';
const token = 'a'.repeat(64);
const upiId = 'mocked.merchant@okbank';
const payee = 'Mocked Merchant UI';
const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}&am=1280.75&cu=INR&tr=${reference}`;
const qrData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xQAAAAASUVORK5CYII=';

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || (await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined));
  const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    await context.addInitScript(({reference,token}) => {
      if (!localStorage.getItem('aamm_order_refs')) localStorage.setItem('aamm_order_refs',JSON.stringify([{reference,tracking_token:token}]));
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedUpi=value;}}});
    },{reference,token});
    const page = await context.newPage();page.setDefaultTimeout(10000);
    const errors = [],calls = [],external = [],unexpected = [];
    page.on('pageerror',error=>errors.push(error.message));
    let authenticated = false,configured = true,detailsFailure = false,submitFailure = false,tamperedDetails = false;
    const order = {id:17,reference,ordered_at:'2026-11-14 08:00:00',status:'Order Confirmed',payment_status:'not_requested',total:1234.5,delivery:'bus',delivery_charges:46.25,manual_payment:null};
    const user = {id:11,phone:null,contact_phone:'9990000003',name:'Mocked Google Customer',email:'mocked@example.test',address:'Fixture address',delivery_pref:'bus',auth_provider:'google',phone_verified:false,email_verified:true};
    const claim = () => order.manual_payment;
    const tracking = () => ({...order,history:[{status:order.status,created_at:order.ordered_at}],bills:[{id:41,kind:'invoice',number:'AA-INV-2026-000041',total:1280.75,print_url:'/bills/41/print'}]});
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),endpoint=url.pathname;
      if(url.origin!==base) {external.push(request.url());await route.abort();return;}
      if(publicFiles.has(endpoint)) {await route.continue();return;}
      const body=request.postDataJSON();calls.push({endpoint,method:request.method(),body,url:request.url()});
      let status=200,data;
      if(endpoint==='/products')data=[];
      else if(endpoint==='/api/config')data={features:{direct_upi:configured,payments:false,otp:false},direct_upi:{configured,payee_name:payee,contact_phone:'9990000001'},business:{name:'Alagar Automobiles'}};
      else if(endpoint==='/auth/me') {if(authenticated)data={user,isAdmin:false};else{status=401;data={error:'Sign in required'};}}
      else if(endpoint==='/my/orders')data=[{...order}];
      else if(endpoint==='/my/requests')data={enquiries:[],exchanges:[]};
      else if(endpoint==='/my/bills')data=tracking().bills;
      else if(endpoint==='/notifications')data=[];
      else if(endpoint==='/tracking-guest') {assert.deepEqual(body,{reference,token});data=tracking();}
      else if(endpoint==='/tracking') {assert.deepEqual(body,{reference});data=tracking();}
      else if(endpoint==='/payments/upi/details') {
        assert.deepEqual(body,authenticated?{reference}:{reference,token});
        if(detailsFailure) {status=409;data={error:'The shop must review current stock before accepting this payment.'};}
        else data={reference,amount:128075,currency:'INR',payee_name:payee,upi_id:upiId,upi_uri:tamperedDetails?'javascript:alert("mocked unsafe destination")':upiUri,qr_data_url:qrData,payment_status:order.payment_status,claim:claim()};
      } else if(endpoint==='/payments/upi/submit') {
        assert.deepEqual(body,authenticated?{reference,transaction_reference:'123456789012'}:{reference,token,transaction_reference:'123456789012'});
        if(submitFailure) {status=409;data={error:'This order changed. Refresh it before submitting payment details.'};}
        else {
          order.payment_status='manual_submitted';
          order.manual_payment={id:8,status:'submitted',transaction_reference:body.transaction_reference,amount:128075,submitted_at:'2026-11-14 08:03:00'};
          data={ok:true,status:'manual_submitted',payment_status:'manual_submitted',claim:claim()};
        }
      } else {unexpected.push({endpoint,method:request.method(),body});status=404;data={error:'Unexpected mocked endpoint: '+endpoint};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    async function guestOrder() {
      await page.goto(base+'/track-order.html');
      await page.locator('[data-ref-index="0"]').click();
      await page.locator('#trackResult .tracking-panel').waitFor();
    }
    async function closeDialog() {if(await page.locator('#upiDialog').isVisible())await page.keyboard.press('Escape');}
    async function noOverflow() {assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'The page must fit the viewport');}

    await guestOrder();
    assert.equal(calls.filter(call=>call.endpoint==='/payments/upi/details').length,0,'Viewing an order must not open a payment app or request checkout automatically');
    assert.equal(await page.locator('[data-pay]').count(),0,'Direct UPI works with Razorpay disabled');
    await page.locator('[data-upi-pay]').click();
    await page.locator('#upiPaymentForm').waitFor();
    assert.equal(await page.locator('#upiDialog').evaluate(node=>node.open),true);
    assert.match(await page.locator('#upiDialog').innerText(),/1,280\.75/,'The displayed amount comes from the server, including reviewed delivery charges');
    assert.ok((await page.locator('#upiDialog').innerText()).includes(upiId));
    assert.ok((await page.locator('#upiDialog').innerText()).includes(payee));
    assert.equal(await page.locator('#upiOpenApp').getAttribute('href'),upiUri);
    assert.equal(await page.locator('#upiDialog img').getAttribute('src'),qrData,'The QR is returned locally by the server, not requested from an external QR service');
    await page.locator('#upiCopyId').click();assert.equal(await page.evaluate(()=>window.__copiedUpi),upiId);
    assert.equal(await page.locator('#upiPaymentError').getAttribute('role'),'alert');
    const beforeInvalid=calls.filter(call=>call.endpoint==='/payments/upi/submit').length;
    await page.locator('#upiPaymentForm [name="transaction_reference"]').fill('123');
    await page.locator('#upiPaymentForm button[type="submit"]').click();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(calls.filter(call=>call.endpoint==='/payments/upi/submit').length,beforeInvalid,'A short UPI transaction reference is not submitted');
    await page.locator('#upiPaymentForm [name="transaction_reference"]').fill('123456789012');
    await page.locator('#upiPaymentForm button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#upiPaymentStatus')?.textContent.toLowerCase().match(/await|pending|confirm/));
    assert.equal(order.payment_status,'manual_submitted');
    assert.equal(await page.locator('#upiPaymentForm').count(),0,'Claim submission leaves an awaiting-confirmation state');
    assert.equal(await page.locator('#upiOpenApp').count(),0,'A pending claim does not prompt another payment');
    assert.doesNotMatch(await page.locator('#upiDialog').innerText(),/payment successful|payment received|payment verified|captured/i,'The browser cannot turn a submitted claim into a paid receipt');
    await closeDialog();await guestOrder();
    assert.equal(await page.locator('[data-upi-pay]').count(),0,'A submitted claim waits for the owner instead of offering another payment');
    assert.match(await page.locator('#trackResult').innerText(),/awaiting|pending|confirmation/i);
    assert.equal(calls.every(call=>!call.url.includes(token)),true,'The guest secret never appears in a request URL');
    console.log('PASS mocked direct UPI guest UI: private token in POST bodies, explicit checkout, server amount/payee/URI/local QR, copy, UTR validation and pending-only claim submission.');

    order.status='Enquiry submitted';order.payment_status='not_requested';order.manual_payment=null;
    await guestOrder();assert.equal(await page.locator('[data-upi-pay]').count(),0,'Unconfirmed enquiries cannot accept payment');
    order.status='Order Confirmed';order.payment_status='manual_verified';order.manual_payment={status:'verified',transaction_reference:'123456789012'};
    await guestOrder();assert.equal(await page.locator('[data-upi-pay]').count(),0,'A verified order cannot be paid twice');
    order.payment_status='manual_verified_review_required';order.manual_payment.status='verified_review_required';
    await guestOrder();assert.equal(await page.locator('[data-upi-pay]').count(),0,'An inventory-review payment must not invite a second payment');
    order.payment_status='manual_pending';order.manual_payment={status:'rejected',rejection_reason:'No matching bank credit',transaction_reference:'111111111111'};
    await guestOrder();await page.locator('[data-upi-pay]').click();await page.locator('#upiPaymentForm').waitFor();
    await closeDialog();
    console.log('PASS mocked direct UPI eligibility: unconfirmed and already-paid orders cannot pay; a rejected claim can be corrected.');

    detailsFailure=true;
    await page.locator('[data-upi-pay]').click();
    await page.waitForFunction(()=>document.querySelector('#upiPaymentError')?.textContent.includes('review current stock')||document.querySelector('#toast')?.textContent.includes('review current stock'));
    assert.equal(await page.locator('#upiOpenApp').count(),0,'A rejected details request does not expose a payment link');
    await closeDialog();detailsFailure=false;
    tamperedDetails=true;await page.locator('[data-upi-pay]').click();
    await page.waitForFunction(()=>document.querySelector('#upiPaymentError')?.textContent.includes('could not be verified'));
    assert.equal(await page.locator('#upiOpenApp').count(),0,'An invalid payment URI must never become a clickable destination');
    await closeDialog();tamperedDetails=false;
    await page.locator('[data-upi-pay]').click();await page.locator('#upiPaymentForm').waitFor();
    submitFailure=true;await page.locator('#upiPaymentForm [name="transaction_reference"]').fill('123456789012');await page.locator('#upiPaymentForm button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#upiPaymentError')?.textContent.includes('order changed'));
    assert.equal(await page.locator('#upiPaymentForm button[type="submit"]').isDisabled(),false,'A rejected claim submission can be retried');
    assert.equal(order.manual_payment.status,'rejected');await closeDialog();submitFailure=false;
    console.log('PASS mocked direct UPI failures: server eligibility and submission errors remain unpaid and retryable.');

    authenticated=true;order.payment_status='not_requested';order.manual_payment=null;
    await page.goto(base+'/dashboard.html');await page.locator('#profileForm').waitFor();
    await page.locator('[data-upi-pay]').click();await page.locator('#upiPaymentForm').waitFor();
    const accountDetails=calls.filter(call=>call.endpoint==='/payments/upi/details').at(-1);assert.deepEqual(accountDetails.body,{reference},'A signed-in owner uses the authenticated session without a guest token');
    await closeDialog();
    await page.setViewportSize({width:320,height:844});
    await page.locator('#languageToggle').click();
    await page.locator('#profileForm').waitFor();
    await page.locator('[data-upi-pay]').click();await page.locator('#upiPaymentForm').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'ta');
    assert.match(await page.locator('#upiDialog').innerText(),/[\u0B80-\u0BFF]/,'The direct UPI instructions are available in Tamil');
    await page.locator('.upi-qr-option summary').click();await page.locator('#upiDialog img').waitFor({state:'visible'});
    await noOverflow();
    assert.equal(await page.locator('#upiDialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'The Tamil payment dialog fits at 320px');
    await page.locator('#upiPaymentForm [name="transaction_reference"]').fill('123456789012');
    const detailsBeforeLanguage=calls.filter(call=>call.endpoint==='/payments/upi/details').length;
    await page.locator('#upiLanguageToggle').click();
    assert.match(await page.locator('#upiTitle').innerText(),/Pay by UPI/);
    assert.equal(await page.locator('#upiPaymentForm [name="transaction_reference"]').inputValue(),'123456789012','Changing payment language preserves the entered reference');
    await page.locator('#upiLanguageToggle').click();
    assert.equal(await page.locator('html').getAttribute('lang'),'ta');
    assert.equal(calls.filter(call=>call.endpoint==='/payments/upi/details').length,detailsBeforeLanguage,'Changing language does not start another checkout');
    await closeDialog();await page.locator('#themeToggle').click();
    await page.locator('[data-upi-pay]').click();await page.locator('#upiPaymentForm').waitFor();await noOverflow();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await closeDialog();
    configured=false;await page.reload();await page.locator('#profileForm').waitFor();assert.equal(await page.locator('[data-upi-pay]').count(),0,'Unconfigured direct UPI never invents a destination');
    assert.equal(calls.some(call=>call.endpoint==='/payments/create'||call.endpoint==='/payments/verify'),false,'This flow never invokes Razorpay or fakes provider verification');
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    assert.equal(external.some(url=>/razorpay|qrserver|quickchart|chart.googleapis/i.test(url)),false,'Direct UPI does not load a provider SDK or remote QR service');
    console.log('PASS mocked direct UPI account/UI: session ownership, disabled-provider state, Tamil 320px light/dark, no JavaScript errors or external payment requests.');
    console.log('These are mocked API/UI contract checks only. No bank credit, real UPI transfer, order or database change occurred.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>new Promise(resolve=>server.close(resolve)));
