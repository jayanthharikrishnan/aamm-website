'use strict';

// Mocked owner UI contract checks only. No bank, UPI, database or provider writes.
// Optional: node test/direct-upi-admin.cjs (requires Playwright and Chromium).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Install Playwright in the development environment to run this optional direct UPI admin suite.');process.exit(1); }
const root=path.resolve(__dirname,'..');
const assets=new Set(['/admin.html','/admin.js','/script.js','/style.css','/images/logo.jpeg']);
const server=http.createServer(async(request,response)=>{
  const file=new URL(request.url,'http://localhost').pathname;
  if(!assets.has(file)){response.writeHead(404);response.end();return;}
  try{const data=await fs.readFile(path.join(root,file));response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpeg')?'image/jpeg':'text/html');response.end(data);}catch{response.writeHead(404);response.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const executablePath=process.env.CHROMIUM_PATH||await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined);
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage();page.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    let configured=true,confirmFails=true,confirmReview=false;
    const calls=[];
    const order={id:7,reference:'AA-UPI-MOCKED-OWNER',name:'Mocked UPI Customer',phone:'9990000002',address:'Test address',delivery:'pickup',delivery_charges:0,total:123.45,status:'Order Confirmed',payment_status:'manual_submitted',ordered_at:'2026-11-14 09:00:00',items:[{id:1,display_name:'Mocked stator',qty:1,price:123.45}],manual_payment:{id:3,order_id:7,amount:12345,payee_upi_id:'mock-owner@examplebank',payee_name:'Alagar Automobiles',status:'submitted',transaction_reference:'123456789012',submitted_at:'2026-11-14 09:15:00'}};
    const invoice={id:10,kind:'invoice',number:'AA-INV-MOCKED-000010',order_id:7,order_reference:order.reference,total:123.45,total_paise:12345,print_url:'/bills/10/print'};
    const receipt={id:11,kind:'receipt',number:'AA-RCPT-MOCKED-000011',order_id:7,order_reference:order.reference,total:123.45,total_paise:12345,print_url:'/bills/11/print'};
    let bills=[invoice];
    const count=endpoint=>calls.filter(call=>call.endpoint===endpoint).length;
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),endpoint=url.pathname;
      if(url.origin!==base){await route.abort();return;}
      if(assets.has(endpoint)){await route.continue();return;}
      const body=request.postDataJSON();calls.push({endpoint,method:request.method(),body});
      let data,status=200;
      if(endpoint==='/api/config')data={business:{name:'Alagar Automobiles'},features:{direct_upi:configured,payments:false,otp:false,ai:false},direct_upi:{configured,payee_name:'Alagar Automobiles',contact_phone:'9344898473',confirmation:'owner_bank_check'},admin:{password_configured:true,otp_configured:false}};
      else if(endpoint==='/auth/me')data={user:{id:1,name:'Mocked Owner',role:'admin',phone:'9990000001'},isAdmin:true};
      else if(endpoint==='/admin/products')data=[];
      else if(endpoint==='/admin/orders')data=[order];
      else if(endpoint==='/admin/bills')data=bills;
      else if(endpoint==='/admin/setup')data={admin:{id_configured:true,password_configured:true,otp_configured:false},services:{direct_upi:{configured,payee_name:'Alagar Automobiles',confirmation:'owner_bank_check',missing:configured?[]:['UPI_ID']},payments:{configured:false,missing:['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET']},otp:{configured:false},sms:{configured:false},ai:{configured:false}},billing:{enabled:true},storage:{persistence_verified:false}};
      else if(endpoint==='/admin/orders/7/upi/confirm'){
        assert.equal(request.method(),'POST');assert.deepEqual(body,{transaction_reference:'123456789012',amount:12345,received:true});
        if(confirmFails){status=409;data={error:'This bank transaction reference has already been recorded against another order.'};}
        else{order.payment_status=confirmReview?'manual_verified_review_required':'manual_verified';Object.assign(order.manual_payment,{status:confirmReview?'verified_review_required':'verified',verified_by:'Mocked Owner',verified_at:'2026-11-14T09:30:00Z'});bills=[invoice,receipt];data={ok:true,payment_status:order.payment_status,claim:order.manual_payment,receipt};}
      }
      else if(endpoint==='/admin/orders/7/upi/reject'){
        assert.equal(request.method(),'POST');assert.deepEqual(body,{reason:'The reference does not match the bank statement.'});order.payment_status='manual_rejected';Object.assign(order.manual_payment,{status:'rejected',rejection_reason:body.reason});bills=[invoice];data={ok:true,payment_status:'manual_rejected',claim:order.manual_payment};
      }
      else{status=404;data={error:'Unexpected mocked endpoint: '+endpoint};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    async function openOrder(){await page.locator('[data-tab="orders"]').click();await page.locator('[data-record="7"]').waitFor();await page.locator('[data-record="7"]').click();await page.locator('#manualUpiPanel').waitFor();assert.equal(await page.locator('dialog[open]').count(),1);}
    async function closeOrder(){await page.locator('#adminDialog .admin-close').click();await page.waitForFunction(()=>!document.getElementById('adminDialog').open);}
    const nextFrame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.goto(base+'/admin.html');await page.locator('#addProduct').waitFor();await openOrder();
    const form=page.locator('#manualUpiConfirmForm');
    assert.equal(await form.locator('[name="transaction_reference"]').inputValue(),'','Owner bank reference must start blank');
    assert.equal(await form.locator('[name="amount_inr"]').inputValue(),'','Actual received amount must start blank');
    assert.equal(await form.locator('[name="received"]').isChecked(),false,'Bank receipt must not be pre-attested');
    assert.equal(await form.locator('[name="received"]').evaluate(node=>node.required),true);
    assert.match(await page.locator('#manualUpiPanel').innerText(),/unverified|not.*confirm|not.*verified|check.*bank/i,'A customer submission is not bank verification');
    assert.equal(await page.locator('#orderDocuments a[href="/bills/11/print"]').count(),0);
    await form.locator('[name="transaction_reference"]').fill('123456789012');await form.locator('[name="amount_inr"]').fill('123.45');
    await form.locator('button[type="submit"]').click();await nextFrame();assert.equal(count('/admin/orders/7/upi/confirm'),0,'Unchecked bank attestation must prevent confirmation');
    await form.locator('[name="received"]').check();await form.locator('[name="transaction_reference"]').fill('123');await form.locator('button[type="submit"]').click();await nextFrame();assert.equal(count('/admin/orders/7/upi/confirm'),0,'An invalid UTR must not be posted');
    await form.locator('[name="transaction_reference"]').fill('123456789012');await form.locator('[name="amount_inr"]').fill('123.44');await form.locator('button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#manualUpiError')?.textContent.trim());assert.equal(count('/admin/orders/7/upi/confirm'),0,'An amount different from the invoice must not be posted');
    await form.locator('[name="amount_inr"]').fill('123.45');
    const failureResponse=page.waitForResponse(response=>response.url()===base+'/admin/orders/7/upi/confirm');await form.locator('button[type="submit"]').click();assert.equal((await failureResponse).status(),409);
    await page.waitForFunction(()=>document.querySelector('#manualUpiError')?.textContent.includes('another order'));
    assert.equal(await page.locator('#adminDialog').evaluate(node=>node.open),true);assert.equal(order.payment_status,'manual_submitted');assert.equal(await page.locator('#orderDocuments a[href="/bills/11/print"]').count(),0);
    assert.doesNotMatch(await page.locator('#adminDialog').innerText(),/Payment verified by Razorpay|payment successful/i);
    console.log('PASS mocked direct UPI owner UI: blank bank evidence, unchecked required attestation, invalid UTR/amount blocked, exact paise payload and server409 retain an unpaid open review without a receipt.');

    confirmFails=false;const orderReads=count('/admin/orders'),billReads=count('/admin/bills');
    const successResponse=page.waitForResponse(response=>response.url()===base+'/admin/orders/7/upi/confirm');await form.locator('button[type="submit"]').click();assert.equal((await successResponse).status(),200);
    await page.waitForFunction(()=>!document.getElementById('adminDialog').open);await page.locator('[data-record="7"]').waitFor();
    assert.ok(count('/admin/orders')>orderReads);assert.ok(count('/admin/bills')>billReads);assert.equal(await page.locator('dialog[open]').count(),0);
    await openOrder();await page.locator('#orderDocuments a[href="/bills/11/print"]').waitFor();assert.equal(await page.locator('#manualUpiConfirmForm').count(),0);assert.equal(order.payment_status,'manual_verified');await closeOrder();
    console.log('PASS mocked direct UPI owner UI: successful bank confirmation closes one modal, refreshes orders and documents, and exposes a receipt only after server approval.');

    order.payment_status='manual_submitted';Object.assign(order.manual_payment,{status:'submitted',verified_by:null,verified_at:null});bills=[invoice];await openOrder();
    await page.locator('#manualUpiRejectDetails summary').click();const reject=page.locator('#manualUpiRejectForm');
    await reject.locator('button[type="submit"]').click();await nextFrame();assert.equal(count('/admin/orders/7/upi/reject'),0,'Rejection requires a reason');
    await reject.locator('[name="reason"]').fill('The reference does not match the bank statement.');const rejectResponse=page.waitForResponse(response=>response.url()===base+'/admin/orders/7/upi/reject');await reject.locator('button[type="submit"]').click();assert.equal((await rejectResponse).status(),200);
    await page.waitForFunction(()=>!document.getElementById('adminDialog').open);await page.locator('[data-record="7"]').waitFor();await openOrder();
    assert.equal(order.payment_status,'manual_rejected');assert.equal(await page.locator('#orderDocuments a[href="/bills/11/print"]').count(),0);assert.match(await page.locator('#manualUpiPanel').innerText(),/reject|not.*confirm/i);await closeOrder();
    order.payment_status='manual_submitted';Object.assign(order.manual_payment,{status:'submitted',verified_by:null,verified_at:null});bills=[invoice];confirmReview=true;await openOrder();
    const reviewForm=page.locator('#manualUpiConfirmForm');await reviewForm.locator('[name="transaction_reference"]').fill('123456789012');await reviewForm.locator('[name="amount_inr"]').fill('123.45');await reviewForm.locator('[name="received"]').check();
    const reviewResponse=page.waitForResponse(response=>response.url()===base+'/admin/orders/7/upi/confirm');await reviewForm.locator('button[type="submit"]').click();const reviewResult=await(await reviewResponse).json();assert.equal(reviewResult.status,undefined);assert.equal(reviewResult.claim.status,'verified_review_required');
    await page.waitForFunction(()=>!document.getElementById('adminDialog').open);await page.waitForFunction(()=>[...document.querySelectorAll('#toast,#adminNotice')].some(node=>/Review the order/.test(node.textContent)));assert.equal(order.payment_status,'manual_verified_review_required');await openOrder();
    assert.match(await page.locator('#manualUpiPanel').innerText(),/review|inventory|fulfillment/i);assert.doesNotMatch(await page.locator('#manualUpiPanel').innerText(),/Razorpay|provider.*captur|automatically verified/i);assert.equal(await page.locator('#manualUpiConfirmForm').count(),0);await closeOrder();
    order.payment_status='manual_pending';Object.assign(order.manual_payment,{status:'pending',transaction_reference:null,verified_by:null,verified_at:null});bills=[invoice];await openOrder();assert.equal(await page.locator('#manualUpiConfirmForm').count(),0);assert.match(await page.locator('#manualUpiPanel').innerText(),/awaiting|no payment.*confirm/i);await closeOrder();order.manual_payment.transaction_reference='123456789012';
    console.log('PASS mocked direct UPI owner UI: rejection requires a reason, pending stays unconfirmed, and actual review-required response fields trigger a review toast and explicit review state.');

    for(const state of [true,false]){configured=state;await page.locator('[data-tab="settings"]').click();await page.locator('#adminContent .admin-config-row').first().waitFor();const row=page.locator('#adminContent .admin-config-row').filter({hasText:'Direct UPI — manual confirmation'});assert.equal(await row.count(),1);assert.match(await row.innerText(),state?/Configured/:/Needs setup/);const guide=page.locator('#adminContent details').filter({has:page.locator('summary').filter({hasText:'Direct UPI — manual confirmation'})});await guide.locator('summary').click();assert.ok((await guide.innerText()).includes('UPI_ID'));assert.doesNotMatch(await guide.innerText(),/9344898473@|@(?:ybl|paytm|okhdfcbank)/i);}
    console.log('PASS mocked direct UPI owner UI: Settings distinguishes configured and missing UPI_ID, supplies variable names and never invents a VPA suffix.');

    await page.setViewportSize({width:320,height:844});
    for(const language of ['en','ta']){await page.evaluate(value=>localStorage.setItem('aamm_language',JSON.stringify(value)),language);await page.reload();await page.locator('#addProduct').waitFor();order.payment_status='manual_submitted';Object.assign(order.manual_payment,{status:'submitted',verified_by:null,verified_at:null});bills=[invoice];await openOrder();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Admin page overflows320px in${language}`);assert.ok(await page.locator('#adminDialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1),`Payment review overflows320px in${language}`);for(const name of ['transaction_reference','amount_inr','received'])assert.ok(await page.locator(`#manualUpiConfirmForm [name="${name}"]`).isVisible());await closeOrder();}
    assert.deepEqual(errors,[]);
    console.log('PASS mocked direct UPI owner UI: English/Tamil320px controls fit and no JavaScript errors occur. Mocked UI only; no bank transfers or database writes.');
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>new Promise(resolve=>server.close(resolve)));
