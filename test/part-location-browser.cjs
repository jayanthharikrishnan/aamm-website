'use strict';
// Optional browser checks for the educational diagram, with no live requests.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<html lang="en"><head><style>:root{--bg:#f5f5f2;--surface:#fff;--surface-2:#ededeb;--text:#181a1d;--muted:#62666d;--line:#d9dcd9;--accent:#bd3528;font-family:Arial}body{margin:20px}*{box-sizing:border-box}</style></head><body><main id="guide"></main></body></html>');
  await page.addStyleTag({path:path.join(root,'part-location.css')});
  await page.addScriptTag({path:path.join(root,'part-location.js')});
  await page.evaluate(()=>PartLocation.mount(document.getElementById('guide'),{category:'Alternator (Dynamo)',subcategory:'Stator',display_name:'Indica Stator'},{language:'en'}));
  assert.equal(await page.locator('details').evaluate(node=>node.open),true,'Guide is visible without opening its disclosure');
  await page.waitForFunction(()=>document.querySelector('[data-play]').textContent==='Pause');
  assert.equal(await page.locator('[data-moving]').evaluate(node=>node.getAnimations().some(animation=>animation.playState==='running')),true,'Animation starts without any input');
  await page.locator('[data-play]').click();
  assert.equal(await page.locator('[data-play]').textContent(),'Continue');
  await page.locator('[data-play]').click();
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('typical position'));
  await page.locator('[data-play]').click();
  assert.equal(await page.locator('[data-play]').textContent(),'Pause');
  await page.locator('summary').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[data-play]').textContent==='Continue');

  // A guide below the initial fold must not finish before the customer sees it.
  await page.evaluate(()=>{
    window.scrollTo(0,0);
    document.getElementById('guide').style.marginTop='1500px';
    PartLocation.mount(document.getElementById('guide'),{category:'Alternator (Dynamo)',subcategory:'Rotor'},{language:'en'});
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.locator('details').evaluate(node=>node.open),true);
  assert.equal(await page.locator('[data-moving]').evaluate(node=>node.getAnimations().some(animation=>animation.playState==='running')),false,'Below-fold motion waits until it can be seen');
  await page.locator('.pl-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-moving]').getAnimations().some(animation=>animation.playState==='running'));
  await page.evaluate(()=>{window.previousGuideAnimation=document.querySelector('[data-moving]').getAnimations()[0];});

  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{
    document.getElementById('guide').style.marginTop='0';
    window.scrollTo(0,0);
    PartLocation.mount(document.getElementById('guide'),{category:'Self Motor',subcategory:'Armature'},{language:'ta'});
  });
  assert.equal(await page.evaluate(()=>window.previousGuideAnimation.playState),'idle','Remount cancels the old animation');
  assert.equal(await page.locator('details').evaluate(node=>node.open),true);
  assert.match(await page.locator('summary').innerText(),/[\u0B80-\u0BFF]/);
  await page.waitForFunction(()=>document.querySelector('[data-status]').textContent.includes('அசைவு இல்லாமல்'));
  assert.match(await page.locator('[data-status]').textContent(),/அசைவு இல்லாமல்/);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-moving]').getAnimations().length),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>PartLocation.mount(document.getElementById('guide'),{category:'Self Motor',subcategory:'Wiper Brush Rocker',display_name:'Tata Ace Wiper Brush'},{language:'en'}));
  assert.equal(await page.locator('details').evaluate(node=>node.open),true);
  assert.equal(await page.locator('[data-play]').count(),0);
  assert.equal(await page.locator('svg[role=img]').count(),0);
  assert.ok((await page.locator('.pl-description').innerText()).includes('will not guess'));
  assert.equal(await page.locator('.pl-contact').getAttribute('href').then(v=>v.startsWith('https://wa.me/919344898473')),true);
  await page.evaluate(()=>PartLocation.mount(document.getElementById('guide'),{category:'Self Motor',subcategory:'<img src=x onerror=alert(1)>',display_name:'<script>bad()</script>'},{language:'en'}));
  assert.equal(await page.locator('#guide img, #guide script').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS part-location: default-open autoplay without input, below-fold visibility start, pause/resume/replay, keyboard close-pause, cleanup, automatic reduced-motion position, Tamil, narrow layout, unknown location and escaped content; no browser errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
