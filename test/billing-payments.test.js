'use strict';
// End-to-end route tests with provider responses mocked inside the disposable
// child server. No external OTP/payment account or network is exercised.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sqlite3 = require('sqlite3').verbose();
const root = path.resolve(__dirname,'..');
const password = 'Temporary-billing-test-password-92!';
const adminPhone = '9344898473';
const customerPhone = '9990000002';
const providerOrder = 'order_TestBilling123';
const secret = 'local-test-billing-signing-secret';
const webhookSecret = 'local-test-billing-webhook-secret';
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const signature = paymentId => crypto.createHmac('sha256',secret).update(`${providerOrder}|${paymentId}`).digest('hex');

async function rows(file,sql,args=[]) {
  const db = await new Promise((resolve,reject)=>{ const db=new sqlite3.Database(file,sqlite3.OPEN_READONLY,error=>error?reject(error):resolve(db)); });
  try { return await new Promise((resolve,reject)=>db.all(sql,args,(error,result)=>error?reject(error):resolve(result))); }
  finally { await new Promise(resolve=>db.close(resolve)); }
}
async function freePort() {
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;
}

test('automatic receipts require a verified captured payment and preserve billing access boundaries',{timeout:30000},async t=>{
  const original=path.join(root,'database.db'); const originalHash=hash(await fs.readFile(original));
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'alagar-billing-payments-'));
  const database=path.join(scratch,'database.db'); await fs.copyFile(original,database);
  const preload=path.join(scratch,'provider-preload.cjs');
  await fs.writeFile(preload,`'use strict';
  global.fetch=async function(url,options={}) {
    const address=String(url);
    const json=value=>({ok:true,status:200,json:async()=>value});
    if(address.startsWith('https://verify.twilio.com/')) {
      const form=new URLSearchParams(options.body);
      if(address.endsWith('/Verifications')) return json({status:'pending'});
      if(address.endsWith('/VerificationCheck')) return json({status:form.get('Code')==='654321'?'approved':'pending',valid:form.get('Code')==='654321'});
    }
    if(address==='https://api.razorpay.com/v1/orders') {const body=JSON.parse(options.body);return json({id:'${providerOrder}',amount:body.amount,currency:'INR',status:'created'});}
    if(address.startsWith('https://api.razorpay.com/v1/payments/')) {
      const id=address.split('/').pop();
      return json({id,order_id:'${providerOrder}',amount:id==='pay_WrongAmount'?24900:25000,currency:'INR',status:id==='pay_Pending'?'authorized':'captured',captured:id!=='pay_Pending'});
    }
    throw new Error('Unexpected network request in isolated provider test');
  };`);
  const port=await freePort();
  const child=spawn(process.execPath,['--require',preload,'server.js'],{cwd:root,env:{...process.env,
    NODE_ENV:'test',PORT:String(port),DB_PATH:database,APP_ORIGIN:`http://127.0.0.1:${port}`,
    ADMIN_ID:adminPhone,ADMIN_PHONE:adminPhone,ADMIN_PASSWORD:password,
    TWILIO_ACCOUNT_SID:'test-account',TWILIO_AUTH_TOKEN:'test-auth',TWILIO_VERIFY_SERVICE_SID:'test-verify',TWILIO_FROM_NUMBER:'',TWILIO_MESSAGING_SERVICE_SID:'',
    RAZORPAY_KEY_ID:'rzp_test_local',RAZORPAY_KEY_SECRET:secret,RAZORPAY_WEBHOOK_SECRET:webhookSecret,OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>output+=value);
  t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}assert.equal(hash(await fs.readFile(original)),originalHash,'Original catalogue database must remain byte-identical');await fs.rm(scratch,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(output);try{if((await fetch(base+'/health')).ok)break;}catch{}if(i===99)throw Error('Server did not start: '+output);await new Promise(resolve=>setTimeout(resolve,50));}
  async function request(url,body,cookie='',method=body===undefined?'GET':'POST',extraHeaders={}) {
    const response=await fetch(base+url,{method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extraHeaders},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
    const data=response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text();
    return {response,data,cookie:response.headers.get('set-cookie')?.split(';',1)[0]};
  }
  const admin=await request('/auth/admin-login',{identifier:adminPhone,password});assert.equal(admin.response.status,200);assert.equal(admin.data.isAdmin,true);
  assert.equal((await request('/auth/otp/request',{phone:customerPhone})).response.status,200);
  const customer=await request('/auth/otp/verify',{phone:customerPhone,code:'654321'});assert.equal(customer.response.status,200);assert.equal(customer.data.isAdmin,false);
  const ordinaryAdminPhone=await request('/auth/otp/verify',{phone:adminPhone,code:'654321'});assert.equal(ordinaryAdminPhone.data.isAdmin,false,'Ordinary customer OTP must not grant administrator role');
  assert.equal((await request('/admin/overview',undefined,ordinaryAdminPhone.cookie)).response.status,401);
  assert.equal((await request('/auth/admin-otp/request',{identifier:customerPhone})).response.status,401);
  assert.equal((await request('/auth/admin-otp/verify',{identifier:customerPhone,code:'654321'})).response.status,401);
  assert.equal((await request('/auth/admin-otp/request',{identifier:adminPhone})).response.status,200);
  const adminOtp=await request('/auth/admin-otp/verify',{identifier:adminPhone,code:'654321'});assert.equal(adminOtp.response.status,200);assert.equal(adminOtp.data.isAdmin,true);

  const product=await request('/products',{display_name:'Provider test stator',category:'Test only',price:125,stock_quantity:5},admin.cookie);assert.equal(product.response.status,201);
  const order=await request('/orders',{phone:customerPhone,name:'Verified customer',delivery:'pickup',items:[{id:product.data.id,qty:2}],idempotency_key:'billing-provider-test-order'});assert.equal(order.response.status,201);
  assert.equal((await request('/admin/orders/'+order.data.id,{status:'Order Confirmed'},admin.cookie,'PATCH')).response.status,200);
  let bills=await request('/my/bills',undefined,customer.cookie);assert.equal(bills.response.status,200);assert.equal(bills.data.length,1);assert.equal(bills.data[0].kind,'invoice');
  const invoiceId=bills.data[0].id;
  const created=await request('/payments/create',{reference:order.data.reference},customer.cookie);assert.equal(created.response.status,200);assert.equal(created.data.order_id,providerOrder);assert.equal(created.data.amount,25000);
  const salesBefore=(await rows(database,'SELECT COUNT(*) AS count FROM sales'))[0].count;
  for(const id of ['pay_Pending','pay_WrongAmount']) {
    const invalid=await request('/payments/verify',{order_id:providerOrder,payment_id:id,signature:signature(id)},customer.cookie);assert.equal(invalid.response.status,409);
    assert.equal((await rows(database,"SELECT COUNT(*) AS count FROM billing_documents WHERE kind='receipt'"))[0].count,0);
    assert.equal((await request('/products/'+product.data.id)).data.stock_quantity,5);
  }
  const paymentId='pay_Captured';const verification={order_id:providerOrder,payment_id:paymentId,signature:signature(paymentId)};
  const captured=await request('/payments/verify',verification,customer.cookie);assert.equal(captured.response.status,200);assert.equal(captured.data.status,'captured');
  assert.equal((await request('/products/'+product.data.id)).data.stock_quantity,3);
  bills=await request('/my/bills',undefined,customer.cookie);assert.equal(bills.data.length,2);const receipt=bills.data.find(value=>value.kind==='receipt');assert.ok(receipt);assert.match(receipt.number,/^AA-RCPT-\d{4}-\d{6}$/);
  assert.equal((await request('/payments/verify',verification,customer.cookie)).response.status,200);
  const event=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:paymentId,order_id:providerOrder}}}});
  const eventSignature=crypto.createHmac('sha256',webhookSecret).update(event).digest('hex');
  assert.equal((await request('/payments/webhook',event,'','POST',{'X-Razorpay-Signature':eventSignature})).response.status,200);
  assert.equal((await request('/products/'+product.data.id)).data.stock_quantity,3);
  assert.equal((await rows(database,'SELECT COUNT(*) AS count FROM sales'))[0].count,salesBefore+1);
  assert.equal((await rows(database,"SELECT COUNT(*) AS count FROM billing_documents WHERE kind='receipt'"))[0].count,1);
  const printed=await request(receipt.print_url,undefined,customer.cookie);assert.equal(printed.response.status,200);assert.match(printed.data,/Payment receipt/);assert.match(printed.data,/pay_Captured/);
  assert.equal((await request(receipt.print_url)).response.status,401);
  const other=await request('/auth/otp/verify',{phone:'9990000003',code:'654321'});
  assert.equal((await request(receipt.print_url,undefined,other.cookie)).response.status,404);
  assert.equal((await request('/bills/'+invoiceId+'/print',undefined,other.cookie)).response.status,404);
  const guest=await request('/billing/guest',{reference:order.data.reference,token:order.data.tracking_token,type:'receipt'});assert.equal(guest.response.status,200);assert.match(guest.data,/Payment receipt/);
  assert.equal((await request('/billing/guest',{reference:order.data.reference,token:'0'.repeat(64),type:'receipt'})).response.status,404);
  assert.equal((await request('/my/bills',undefined,other.cookie)).data.length,0);
});
