'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sms = require('../lib/sms');
const sid = 'SM' + '1'.repeat(32);

async function environment(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key,process.env[key]]));
  for(const [key,value] of Object.entries(values)) process.env[key] = value;
  try { return await fn(); }
  finally { for(const [key,value] of Object.entries(before)) if(value===undefined) delete process.env[key]; else process.env[key]=value; }
}
const credentials = { TWILIO_ACCOUNT_SID:'test-account',TWILIO_AUTH_TOKEN:'test-auth-token',TWILIO_FROM_NUMBER:'+15550000001',TWILIO_MESSAGING_SERVICE_SID:'' };

async function mockedFetch(mock,fn) {
  const before=global.fetch; global.fetch=mock;
  try { return await fn(); } finally { global.fetch=before; }
}

test('transactional SMS requires an actual sender as well as provider credentials', async()=>{
  await environment({...credentials,TWILIO_FROM_NUMBER:''},async()=>{
    assert.equal(sms.smsConfigured(),false);
    await assert.rejects(()=>sms.sendSms('9990000002','Order confirmation'),error=>error.status===503);
    await assert.rejects(()=>sms.getSmsStatus(sid),error=>error.status===503);
  });
});

test('SMS sends genuine requests and preserves queued status without claiming delivery', async()=>{
  await environment(credentials,async()=>mockedFetch(async(url,options)=>{
    assert.equal(url,'https://api.twilio.com/2010-04-01/Accounts/test-account/Messages.json');
    assert.equal(options.method,'POST');
    const body=new URLSearchParams(options.body);
    assert.equal(body.get('To'),'+919990000002');
    assert.equal(body.get('From'),'+15550000001');
    assert.equal(body.get('Body'),'Alagar Automobiles: Your invoice is available.');
    assert.equal(options.redirect,'error');
    assert.ok(options.signal);
    return {ok:true,json:async()=>({sid,status:'queued',error_code:null,to:body.get('To'),body:'Private message',diagnostic:'Private provider detail'})};
  },async()=>{
    assert.equal(sms.smsConfigured(),true);
    const result=await sms.sendSms('9990000002','Alagar Automobiles: Your invoice is available.');
    assert.deepEqual(result,{sid,status:'queued',error_code:null});
  }));
});

test('messaging service configuration takes precedence over a sender number', async()=>{
  await environment({...credentials,TWILIO_MESSAGING_SERVICE_SID:'MG'+'2'.repeat(32),TWILIO_FROM_NUMBER:''},async()=>mockedFetch(async(url,options)=>{
    const body=new URLSearchParams(options.body);
    assert.equal(body.get('MessagingServiceSid'),'MG'+'2'.repeat(32));
    assert.equal(body.has('From'),false);
    return {ok:true,json:async()=>({sid,status:'accepted'})};
  },async()=>assert.deepEqual(await sms.sendSms('+919990000002','Invoice ready'),{sid,status:'accepted',error_code:null})));
});

test('SMS status refresh uses exact message identity and returns only provider-reported state', async()=>{
  await environment(credentials,async()=>mockedFetch(async(url,options)=>{
    assert.ok(url.endsWith('/Messages/'+sid+'.json'));
    assert.equal(options.method,'GET');
    return {ok:true,json:async()=>({sid,status:'delivered',error_code:null,body:'private'})};
  },async()=>assert.deepEqual(await sms.getSmsStatus(sid),{sid,status:'delivered',error_code:null})));
  await environment(credentials,async()=>mockedFetch(async()=>({ok:true,json:async()=>({sid:'SM'+'3'.repeat(32),status:'sent'})}),async()=>{
    await assert.rejects(()=>sms.getSmsStatus(sid),error=>error.status===502&&error.code==='invalid_sms_response');
  }));
});

test('invalid recipient, content, reference and provider failures do not leak diagnostics', async()=>{
  await environment(credentials,async()=>{
    await assert.rejects(()=>sms.sendSms('1234','Invoice'),error=>error.status===400);
    await assert.rejects(()=>sms.sendSms('9990000002',' '.repeat(10)),error=>error.status===400);
    await assert.rejects(()=>sms.sendSms('9990000002','x'.repeat(1001)),error=>error.status===400);
    await assert.rejects(()=>sms.getSmsStatus('../Secrets'),error=>error.status===400);
    await mockedFetch(async()=>({ok:false,status:400,json:async()=>({message:'private provider secret'})}),async()=>{
      await assert.rejects(()=>sms.sendSms('9990000002','Invoice'),error=>error.status===502&&!error.message.includes('secret'));
    });
    await mockedFetch(async()=>{throw new Error('private provider secret');},async()=>{
      await assert.rejects(()=>sms.sendSms('9990000002','Invoice'),error=>error.status===502&&!error.message.includes('secret'));
    });
  });
});
