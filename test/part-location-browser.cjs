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
  await page.evaluate(()=>{window.loopingGuideAnimation=document.querySelector('[data-moving]').getAnimations()[0];});
  assert.equal(await page.evaluate(()=>window.loopingGuideAnimation.effect.getTiming().iterations),Infinity,'The animation repeats continuously');
  await page.waitForFunction(()=>window.loopingGuideAnimation.currentTime>window.loopingGuideAnimation.effect.getTiming().duration+100,null,{timeout:10000});
  assert.equal(await page.evaluate(()=>window.loopingGuideAnimation.playState),'running','The second cycle starts without Replay input');
  assert.equal(await page.locator('button').evaluateAll(nodes=>nodes.some(node=>/Replay|மீண்டும் இயக்கு/.test(node.textContent))),false,'No Replay button is exposed');
  await page.locator('[data-play]').click();
  assert.equal(await page.locator('[data-play]').textContent(),'Continue');
  assert.equal(await page.evaluate(()=>window.loopingGuideAnimation.playState),'paused');
  // Returning to a user-paused diagram must not override that choice.
  await page.evaluate(()=>{document.getElementById('guide').style.marginTop='1500px';window.scrollTo(0,0);});
  await page.locator('.pl-stage').scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.loopingGuideAnimation.playState),'paused','Scrolling back does not undo an explicit pause');
  await page.locator('summary').focus();await page.keyboard.press('Enter');
  await page.locator('summary').focus();await page.keyboard.press('Enter');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.loopingGuideAnimation.playState),'paused','Reopening does not undo an explicit pause');
  await page.locator('[data-play]').click();
  assert.equal(await page.locator('[data-play]').textContent(),'Pause');
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='running');

  // Automatic visibility pauses resume on return, unlike an explicit pause.
  await page.locator('summary').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='paused');
  await page.locator('summary').focus();await page.keyboard.press('Enter');
  await page.locator('.pl-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='running');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='paused');
  await page.locator('.pl-stage').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='running');
  // Dispatch real visibility events with the document visibility value supplied
  // by this isolated browser fixture, without relying on headless tab focus.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.guideDocumentHidden});window.guideDocumentHidden=true;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='paused');
  await page.evaluate(()=>{window.guideDocumentHidden=false;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>window.loopingGuideAnimation.playState==='running');
  await page.evaluate(()=>{delete document.hidden;});

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
  assert.equal(await page.locator('[data-play]').isVisible(),false,'Static reduced-motion position needs no animation control');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:320,height:844});
  await page.evaluate(()=>PartLocation.mount(document.getElementById('guide'),{category:'Self Motor',subcategory:'Armature'},{language:'ta'}));
  await page.waitForFunction(()=>document.querySelector('[data-moving]').getAnimations().some(animation=>animation.playState==='running'));
  assert.equal(await page.locator('[data-play]').textContent(),'இடைநிறுத்து');
  assert.equal(await page.locator('button').evaluateAll(nodes=>nodes.some(node=>/Replay|மீண்டும் இயக்கு/.test(node.textContent))),false);
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
  console.log('PASS part-location: default-open infinite looping into a second cycle without input or Replay, user pause/resume, automatic viewport/background/collapse pause and return, below-fold start, cleanup, static reduced-motion mode without controls, Tamil/mobile, unknown location and escaped content; no browser errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
