'use strict';

// Optional Google sign-in UI contract suite. GIS and account APIs are mocked.
// No Google credentials, external provider requests or database writes occur.
// Requires Playwright + Chromium: node test/google-login-ui.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.error('Install Playwright in the development environment to run these optional Google UI checks.');process.exit(1); }
const root = path.resolve(__dirname, '..');
const clientId = '830576535686-vned7fedq971g4r742jk4voguifa7eed.apps.googleusercontent.com';
const staticFiles = new Set(['/dashboard.html','/login.html','/script.js','/style.css','/images/logo.jpeg']);
const server = http.createServer(async (request,response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!staticFiles.has(pathname)) {response.writeHead(404);response.end();return;}
  try {const data = await fs.readFile(path.join(root, pathname));response.setHeader('Content-Type', pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.jpeg') ? 'image/jpeg' : 'text/html');response.end(data);}
  catch {response.writeHead(404);response.end();}
});
const gisDouble = `
  window.__gis = { initializeCalls:[], renderCalls:[], promptCalls:0, disableCalls:0 };
  window.google = { accounts: { id: {
    initialize(options) { window.__gis.options=options;window.__gis.initializeCalls.push({client_id:options.client_id,nonce:options.nonce,auto_select:options.auto_select,ux_mode:options.ux_mode,callbackType:typeof options.callback}); },
    renderButton(host, options) { window.__gis.renderCalls.push({hostId:host.id,options});const button=document.createElement('button');button.type='button';button.dataset.mockedGoogleButton='true';button.textContent='Sign in with Google';button.style.maxWidth='100%';button.style.width=options.width?options.width+'px':'280px';button.style.minHeight='44px';button.onclick=()=>window.__gis.options.callback({credential:'mocked-google-id-token'});host.replaceChildren(button); },
    prompt() { window.__gis.promptCalls++; },
    disableAutoSelect() { window.__gis.disableCalls++; },
    cancel() {}
  } } };
`;

(async () => {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.CHROMIUM_PATH || await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>undefined);
  const browser = await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    const page = await context.newPage();page.setDefaultTimeout(10000);
    const errors = [];page.on('pageerror',error=>errors.push(error.message));
    let configured = true,authenticated = false,failFirstGoogle = true,challengeCount = 0,gisRequests = 0,failNextGisLoad = false;
    const calls = [];
    const user = {id:13,phone:null,contact_phone:null,email:'google-ui-customer@example.test',google_email:'google-ui-customer@example.test',name:'Google UI Test Customer',address:'',delivery_pref:'pickup',auth_provider:'google',phone_verified:false,email_verified:true};
    await context.route('**/*',async route => {
      const request = route.request(),url = new URL(request.url()),endpoint = url.pathname;
      if (url.origin === 'https://accounts.google.com' && endpoint === '/gsi/client') {gisRequests++;if(failNextGisLoad){failNextGisLoad=false;await route.abort('failed');return;}await route.fulfill({status:200,contentType:'application/javascript',body:gisDouble});return;}
      if (url.origin !== base) {await route.abort();return;}
      if (staticFiles.has(endpoint)) {await route.continue();return;}
      const body = request.postDataJSON();calls.push({endpoint,method:request.method(),body});
      let data,status=200;
      if (endpoint === '/products') data=[];
      else if (endpoint === '/api/config') data={business:{name:'Alagar Automobiles'},features:{otp:true,payments:false,ai:false,image_uploads:false},google:{configured,client_id:configured?clientId:null}};
      else if (endpoint === '/auth/me') {if(authenticated)data={user,isAdmin:false};else{status=401;data={error:'Sign in required'};}}
      else if (endpoint === '/auth/google/challenge') {challengeCount++;data={nonce:`mocked-google-nonce-${challengeCount}-${'a'.repeat(32)}`,expires_in:300};}
      else if (endpoint === '/auth/google') {assert.equal(request.method(),'POST');assert.deepEqual(body,{credential:'mocked-google-id-token'});if(failFirstGoogle){failFirstGoogle=false;status=401;data={error:'Google sign-in could not be verified. Please try again.'};}else{authenticated=true;data={user,isAdmin:false};}}
      else if (endpoint === '/my/orders') data=[];
      else if (endpoint === '/notifications') data=[];
      else if (endpoint === '/my/requests') data={enquiries:[],exchanges:[]};
      else if (endpoint === '/my/bills') data=[];
      else if (endpoint === '/me') {assert.equal(request.method(),'PUT');assert.equal(body.email,undefined,'Google profile updates must not submit an editable account email');Object.assign(user,body);data={ok:true,user};}
      else if (endpoint === '/auth/logout') {authenticated=false;data={ok:true};}
      else {status=404;data={error:'Unexpected mocked endpoint: '+endpoint};}
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    });
    await page.goto(base+'/dashboard.html');
    await page.locator('#googleButton [data-mocked-google-button]').waitFor();
    assert.equal(gisRequests,1,'Configured Google sign-in loads the official GIS URL once');
    const initial = await page.evaluate(()=>window.__gis.initializeCalls[0]);
    assert.equal(initial.client_id,clientId);assert.equal(initial.callbackType,'function');assert.equal(initial.auto_select,false);assert.equal(initial.ux_mode,'popup');assert.match(initial.nonce,/^mocked-google-nonce-1-/);
    assert.equal(await page.evaluate(()=>window.__gis.renderCalls[0].hostId),'googleButton');
    assert.equal(await page.evaluate(()=>window.__gis.promptCalls),0,'The page must not open One Tap');
    assert.equal(await page.locator('#phoneSignInDetails').count(),1);
    assert.equal(await page.locator('#phoneSignInDetails').evaluate(node=>node.open),false,'Optional phone sign-in starts collapsed');
    assert.equal(await page.locator('#continueAsGuest').getAttribute('href'),'products.html');
    assert.equal(await page.locator('#ownerSignIn').getAttribute('href'),'admin.html');
    assert.equal(await page.locator('#googleError').getAttribute('role'),'alert');
    assert.equal(await page.locator('#googleStatus').getAttribute('aria-live'),'polite');

    await page.locator('#googleButton [data-mocked-google-button]').click();
    await page.waitForFunction(()=>window.__gis.initializeCalls.length>=2);
    assert.equal(await page.locator('#profileForm').count(),0,'A rejected Google credential must not open an account');
    assert.equal(challengeCount,2,'Credential failure must acquire a fresh nonce before retry');
    const retryNonce = await page.evaluate(()=>window.__gis.initializeCalls.at(-1).nonce);
    assert.notEqual(retryNonce,initial.nonce);
    await page.locator('#googleButton [data-mocked-google-button]').click();
    await page.locator('#profileForm').waitFor();
    assert.equal(authenticated,true);
    const email = page.locator('#profileForm [name="email"]');
    assert.equal(await email.inputValue(),user.google_email);
    assert.equal(await email.evaluate(node=>node.readOnly),true,'Google email must be read-only');
    const contact = page.locator('#profileForm [name="contact_phone"]');
    assert.equal(await contact.isEditable(),true,'An optional delivery contact is editable');
    assert.equal(await contact.inputValue(),'');
    assert.match(await page.locator('#contactPhoneHelp').innerText(),/unverified|not verified/i);
    await page.locator('#profileForm [name="name"]').fill('Updated Google UI Customer');
    await contact.fill('9990000004');
    await page.locator('#profileForm [name="address"]').fill('Disposable UI delivery contact address');
    const saveResponse = page.waitForResponse(response=>response.url()===base+'/me'&&response.request().method()==='PUT');
    await page.locator('#profileForm button').click();assert.equal((await saveResponse).status(),200);
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('details are saved'));
    assert.equal(user.contact_phone,'9990000004');assert.equal(user.phone,null);assert.equal(user.phone_verified,false);
    assert.ok(calls.some(call=>call.endpoint==='/my/orders'));
    assert.ok(calls.some(call=>call.endpoint==='/me'&&call.method==='PUT'));
    assert.ok(!calls.some(call=>/^\/users\//.test(call.endpoint)||/^\/orders\/(?:null|undefined)$/.test(call.endpoint)),'Google account ownership must not depend on a phone URL');
    await page.locator('#customerLogout').click();
    await page.locator('#googleButton [data-mocked-google-button]').waitFor();
    assert.equal(authenticated,false);
    assert.equal(await page.evaluate(()=>window.__gis.promptCalls),0);
    console.log('PASS mocked Google UI: official GIS render/client ID/nonce, no One Tap, rejected credential fresh-challenge retry, Google account, read-only email, unverified delivery contact, identity-based profile/orders and sign-out.');

    failNextGisLoad=true;const challengesBeforeSdkFailure=challengeCount;await page.reload();
    await page.locator('#googleRetry').waitFor({state:'visible'});
    assert.match(await page.locator('#googleError').innerText(),/could not load|unavailable/i);
    assert.equal(await page.locator('#googleButton [data-mocked-google-button]').count(),0,'A failed SDK must not show a working-looking Google control');
    await page.locator('#googleRetry').click();await page.locator('#googleButton [data-mocked-google-button]').waitFor();
    assert.ok(challengeCount>=challengesBeforeSdkFailure+2,'SDK retry must create a fresh challenge');
    console.log('PASS mocked Google UI: failed official SDK load shows an accessible retry and recovers with a fresh challenge.');

    await page.evaluate(()=>{localStorage.setItem('aamm_language',JSON.stringify('ta'));localStorage.setItem('aamm_theme','light');});
    await page.setViewportSize({width:390,height:844});await page.reload();
    await page.locator('#googleButton [data-mocked-google-button]').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'ta');
    assert.match(await page.locator('#app h1').innerText(),/[\u0B80-\u0BFF]/);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Tamil Google login must fit a mobile viewport');
    assert.equal(await page.locator('#phoneSignInDetails').evaluate(node=>node.open),false);
    const requestsBeforeUnconfigured = gisRequests;
    configured = false;await page.reload();
    await page.waitForFunction(()=>!document.querySelector('#app .loading'));
    assert.equal(await page.locator('#googleButton [data-mocked-google-button]').count(),0);
    assert.equal(gisRequests,requestsBeforeUnconfigured,'An unconfigured Google client must not load GIS');
    assert.equal(await page.locator('#continueAsGuest').getAttribute('href'),'products.html');
    assert.equal(await page.locator('#ownerSignIn').getAttribute('href'),'admin.html');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert.deepEqual(errors,[]);
    console.log('PASS mocked Google UI: Tamil/mobile/light layout, collapsed optional OTP, distinct guest/owner links, unconfigured Google avoids GIS, no page errors.');
    console.log('These are mocked Google/UI contract checks only. No live Google authentication or database changes occurred.');
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>new Promise(resolve=>server.close(resolve)));
