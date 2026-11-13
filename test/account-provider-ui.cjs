'use strict';

// Optional UI contract checks with mocked OTP and Razorpay providers.
// These checks do not contact SMS/payment services or modify a database.
// Requires Playwright and Chromium: node test/account-provider-ui.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Install Playwright in the development environment to run this optional browser suite.');process.exit(1); }
const root = path.resolve(__dirname, '..');
const publicFiles = new Set(['/dashboard.html','/script.js','/style.css','/images/logo.jpeg']);
const server = http.createServer(async (request,response) => {
  const pathname = new URL(request.url,'http://localhost').pathname;
  if (!publicFiles.has(pathname)) {response.writeHead(404);response.end();return;}
  try { const body=await fs.readFile(path.join(root,pathname));response.setHeader('Content-Type',pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.jpeg')?'image/jpeg':'text/html');response.end(body); }
  catch { response.writeHead(404);response.end(); }
});

(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const executablePath=process.env.CHROMIUM_PATH || (await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined));
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    let authenticated=false,notificationRead=false,verifyMode='rejected';
    const calls=[];
    const user={id:1,phone:'9990000002',name:'UI Test Customer',email:'',address:'Test delivery address',delivery_pref:'pickup'};
    const order={id:1,reference:'AAMM-MOCKED-UI-ORDER',ordered_at:'2026-11-13 08:00:00',status:'Order Confirmed',payment_status:'not_requested',total:700};
    await page.addInitScript(() => {
      // A local checkout double exposes the callbacks used by the real page.
      window.Razorpay=class {
        constructor(options){this.options=options;this.events={};window.__mockCheckout=this;}
        on(name,callback){this.events[name]=callback;}
        open(){this.opened=true;}
      };
    });
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),endpoint=url.pathname;
      if(url.origin!==base){await route.abort();return;}
      if(publicFiles.has(endpoint)){await route.continue();return;}
      const body=request.postDataJSON();calls.push({endpoint,method:request.method(),body});
      let status=200,data;
      if(endpoint==='/products')data=[];
      else if(endpoint==='/api/config')data={features:{otp:true,payments:true,ai:false,image_uploads:false},business:{name:'AAMM'}};
      else if(endpoint==='/auth/me'){if(authenticated)data={user,isAdmin:false};else{status=401;data={error:'Sign in required'};}}
      else if(endpoint==='/auth/otp/request'){assert.deepEqual(body,{phone:user.phone});data={status:'pending',resend_after:1};}
      else if(endpoint==='/auth/otp/verify'){assert.equal(body.phone,user.phone);if(body.code!=='654321'){status=401;data={error:'The code is invalid or has expired.'};}else{authenticated=true;data={user,isAdmin:false};}}
      else if(endpoint==='/auth/logout'){authenticated=false;data={ok:true};}
      else if(endpoint==='/orders/'+user.phone)data=[order];
      else if(endpoint==='/notifications')data=[{id:3,title:'Order confirmed',message:'AAMM has reviewed your enquiry.',reference:order.reference,created_at:'2026-11-13 08:00:00',delivery_status:'in_app',is_read:notificationRead?1:0}];
      else if(endpoint==='/notifications/3'){assert.equal(request.method(),'PATCH');notificationRead=true;data={ok:true};}
      else if(endpoint==='/my/requests')data={enquiries:[{id:4,reference:'ENQ-MOCKED-UI',part_name:'Test stator',status:'Quotation Sent',quotation_amount:700,updated_at:'2026-11-13 08:00:00'}],exchanges:[]};
      else if(endpoint==='/users/'+user.phone){assert.equal(request.method(),'PUT');Object.assign(user,body);data={ok:true};}
      else if(endpoint==='/tracking'){assert.equal(body.reference,order.reference);data={...order,tracking_type:'internal',history:[{status:'Order Placed',created_at:'2026-11-13 07:00:00'},{status:'Order Confirmed',created_at:'2026-11-13 08:00:00'}]};}
      else if(endpoint==='/payments/create'){assert.equal(body.reference,order.reference);data={key_id:'rzp_test_ui_double',amount:70000,currency:'INR',order_id:'order_mocked_ui',reference:order.reference};}
      else if(endpoint==='/payments/verify'){assert.equal(body.razorpay_order_id,'order_mocked_ui');if(verifyMode==='rejected'){status=400;data={error:'Payment verification failed.'};}else{order.payment_status='captured';data={status:'captured'};}}
      else{status=404;data={error:'Unexpected mocked API endpoint: '+endpoint};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(base+'/dashboard.html');
    await page.locator('#signInForm [name="phone"]').fill(user.phone);
    await page.locator('#signInForm button').click();
    await page.locator('#verifyForm').waitFor();
    assert.equal(await page.locator('#signInForm button').isDisabled(),true,'Resend must respect provider cooldown');
    await page.waitForFunction(()=>!document.querySelector('#signInForm button').disabled);
    await page.locator('#signInForm button').click();await page.locator('#verifyForm').waitFor();
    assert.equal(calls.filter(call=>call.endpoint==='/auth/otp/request').length,2);
    await page.locator('#verifyForm [name="code"]').fill('000000');await page.locator('#verifyForm button').click();
    await page.waitForFunction(()=>document.querySelector('#verifyError')?.textContent.includes('invalid'));
    assert.equal(await page.locator('#profileForm').count(),0,'Rejected OTP must not open the account');
    await page.locator('#verifyForm [name="code"]').fill('654321');await page.locator('#verifyForm button').click();
    await page.locator('#profileForm').waitFor();
    assert.ok((await page.locator('#app').innerText()).includes('ENQ-MOCKED-UI'));
    assert.ok((await page.locator('#app').innerText()).includes('Quotation Sent'));
    await page.locator('#profileForm [name="name"]').fill('Updated UI Test Customer');
    await page.locator('#profileForm button').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('details are saved'));
    assert.equal(user.name,'Updated UI Test Customer');
    await page.locator('[data-notice-read="3"]').click();await page.locator('[data-notice-read="3"]').waitFor({state:'detached'});assert.equal(notificationRead,true);
    await page.locator('[data-order-track]').click();await page.locator('#accountOrderDetail .timeline').waitFor();assert.ok((await page.locator('#accountOrderDetail').innerText()).includes('Order Confirmed'));
    console.log('PASS mocked-provider UI: OTP request/resend cooldown, rejected and approved verification, account records, profile save, notifications and order timeline.');

    const pay=page.locator('[data-pay]');
    await pay.click();await page.waitForFunction(()=>window.__mockCheckout?.opened);
    assert.equal(await page.evaluate(()=>window.__mockCheckout.options.amount),70000);
    await page.evaluate(()=>window.__mockCheckout.options.handler({razorpay_order_id:'order_mocked_ui',razorpay_payment_id:'pay_mocked_ui',razorpay_signature:'invalid_signature'}));
    assert.match(await page.locator('#toast').innerText(),/verification failed/);assert.equal(await pay.isDisabled(),false);assert.equal(order.payment_status,'not_requested');
    const verificationCount=calls.filter(call=>call.endpoint==='/payments/verify').length;
    await pay.click();await page.evaluate(()=>window.__mockCheckout.events['payment.failed']({error:{description:'Mocked decline'}}));
    assert.match(await page.locator('#toast').innerText(),/not completed/);assert.equal(await pay.isDisabled(),false);assert.equal(calls.filter(call=>call.endpoint==='/payments/verify').length,verificationCount);
    await pay.click();await page.evaluate(()=>window.__mockCheckout.options.modal.ondismiss());assert.match(await page.locator('#toast').innerText(),/No payment is marked as successful/);assert.equal(await pay.isDisabled(),false);
    verifyMode='captured';await pay.click();await page.evaluate(()=>window.__mockCheckout.options.handler({razorpay_order_id:'order_mocked_ui',razorpay_payment_id:'pay_mocked_ui',razorpay_signature:'mocked_verified_response'}));
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Payment verified'));
    await page.locator('#profileForm').waitFor();assert.equal(await page.locator('[data-pay]').count(),0);assert.ok((await page.locator('#app').innerText()).includes('captured'));
    assert.equal(calls.filter(call=>call.endpoint==='/payments/verify').length,verificationCount+1);
    await page.locator('#customerLogout').click();await page.locator('#signInForm').waitFor();assert.equal(authenticated,false);
    assert.deepEqual(pageErrors,[]);
    console.log('PASS mocked-provider UI: Razorpay checkout inputs, rejected verification, failed/dismissed checkout without success, captured response display and sign-out.');
    console.log('These are mocked provider/UI contract checks; no live SMS or payment service was exercised.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>new Promise(resolve=>server.close(resolve)));
