'use strict';

// Route-level authentication tests using genuine RS256 verification from
// google-auth-library. A preload in the disposable child replaces only Google's
// remote certificate lookup with a temporary public key; production has no test
// verifier, provider URL, clock override or authentication bypass.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const sqlite3 = require('sqlite3');

const root = path.resolve(__dirname, '..');
const original = path.join(root, 'database.db');
const audience = '123456789000-fixture-only.apps.googleusercontent.com';
const administrator = '9344898473';
const password = 'Temporary-Google-Test-Password-92!';
const contactPhone = '9880000007';
const sharedEmail = 'shared-identity@example.invalid';
const paymentSecret = 'temporary-google-route-payment-secret';
const digest = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

async function database(file, operation) {
  const db = await new Promise((resolve, reject) => {
    const opened = new sqlite3.Database(file, error => error ? reject(error) : resolve(opened));
  });
  const query = (sql, values = []) => new Promise((resolve, reject) => db.all(sql, values, (error, rows) => error ? reject(error) : resolve(rows)));
  try { return await operation(query); }
  finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}
async function port() {
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const value = listener.address().port; await new Promise(resolve => listener.close(resolve)); return value;
}
function jwt(privateKey, claims, header = {}) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'RS256', kid: 'isolated-test-key', typ: 'JWT', ...header })}.${encode(claims)}`;
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}
function payload(nonce, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: 'https://accounts.google.com', aud: audience, sub: 'google-customer-alice', email: sharedEmail, email_verified: true, name: 'Google Test Customer', iat: now - 5, exp: now + 300, nonce, ...overrides };
}

async function launch(scratch, privateKey, publicKey) {
  const copy = path.join(scratch, 'database.db'); await fs.copyFile(original, copy);
  await database(copy, async query => {
    await query('INSERT INTO users(phone,name,email) VALUES (?,?,?)', [contactPhone, 'Existing phone customer fixture', sharedEmail]);
  });
  const preload = path.join(scratch, 'google-certificate-preload.cjs');
  await fs.writeFile(preload, `'use strict';
    if(process.env.NODE_ENV!=='test') throw new Error('Isolated test preload only');
    const {OAuth2Client}=require(${JSON.stringify(require.resolve('google-auth-library'))});
    OAuth2Client.prototype.getFederatedSignonCertsAsync=async()=>({certs:{'isolated-test-key':${JSON.stringify(publicKey)}},format:'PEM'});
    const orders=new Map();let sequence=0;
    global.fetch=async function(url,options={}) {
      const address=String(url);const json=value=>({ok:true,status:200,json:async()=>value});
      if(address==='https://api.razorpay.com/v1/orders'){
        const body=JSON.parse(options.body);const order={id:'order_GoogleFixture'+(++sequence),amount:body.amount,currency:'INR',status:'created'};orders.set(order.id,order);return json(order);
      }
      if(address.startsWith('https://api.razorpay.com/v1/payments/')){
        const paymentId=address.split('/').pop();const order=Array.from(orders.values()).at(-1);
        if(!order)throw new Error('No test payment order exists');
        return json({id:paymentId,order_id:order.id,amount:order.amount,currency:'INR',status:'captured',captured:true});
      }
      throw new Error('Unexpected external request in isolated Google authentication test');
    };
  `);
  const appPort = await port(), base = `http://127.0.0.1:${appPort}`;
  const child = spawn(process.execPath, ['--require', preload, 'server.js'], {
    cwd: root, env: { ...process.env, NODE_ENV: 'test', PORT: String(appPort), DB_PATH: copy, APP_ORIGIN: base,
      GOOGLE_CLIENT_ID: audience, ADMIN_ID: administrator, ADMIN_PHONE: administrator, ADMIN_PASSWORD: password,
      TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_VERIFY_SERVICE_SID: '', TWILIO_FROM_NUMBER: '', TWILIO_MESSAGING_SERVICE_SID: '',
      RAZORPAY_KEY_ID: 'rzp_test_isolated_google', RAZORPAY_KEY_SECRET: paymentSecret, RAZORPAY_WEBHOOK_SECRET: 'isolated-google-webhook-secret', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = ''; child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error(`Disposable server exited: ${output}`);
    try { if ((await fetch(base + '/health')).ok) return { child, base, copy, privateKey }; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill('SIGTERM'); throw new Error(`Disposable Google test server did not start: ${output}`);
}
let clientNumber = 0;
function client(server) {
  const cookies = new Map(), ip = `198.51.100.${++clientNumber}`;
  return {
    cookies,
    async request(url, body, { method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
      const response = await fetch(server.base + url, { method, headers: {
        Origin: server.base, 'X-Forwarded-For': ip,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}), ...headers
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const setCookies = response.headers.getSetCookie();
      for (const cookie of setCookies) {
        const [name, ...value] = cookie.split(';', 1)[0].split('=');
        if (!value.join('=') || /Max-Age=0\b/i.test(cookie)) cookies.delete(name); else cookies.set(name, value.join('='));
      }
      const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
      return { response, data, setCookies };
    }
  };
}
async function challenge(who) {
  const result = await who.request('/auth/google/challenge', {});
  assert.equal(result.response.status, 200);
  assert.match(result.data.nonce, /^[a-f0-9]{64}$/);
  assert.equal(result.data.expires_in, 300);
  assert.ok(who.cookies.has('aa_google_challenge'));
  return result;
}
async function signIn(server, who, overrides = {}) {
  const issued = await challenge(who);
  return who.request('/auth/google', { credential: jwt(server.privateKey, payload(issued.data.nonce, overrides)) });
}
function denied(result) {
  assert.ok([400, 401, 403, 404, 410].includes(result.response.status), `Expected refusal, received ${result.response.status}`);
}

test('Google sign-in verifies real signatures, one-time browser challenges and stable account ownership', { timeout: 90000 }, async t => {
  const originalHash = digest(await fs.readFile(original));
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'alagar-google-auth-'));
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const server = await launch(scratch, keys.privateKey, keys.publicKey);
  t.after(async () => {
    if (server.child.exitCode === null) { const done = once(server.child, 'exit'); server.child.kill('SIGTERM'); const timer = setTimeout(() => server.child.kill('SIGKILL'), 3000); await done; clearTimeout(timer); }
    assert.equal(digest(await fs.readFile(original)), originalHash, 'Original business database must remain byte-identical');
    await fs.rm(scratch, { recursive: true, force: true });
  });
  const anonymous = client(server);

  await t.test('challenge cookies are private, expiring, scoped and origin protected', async () => {
    const result = await challenge(anonymous);
    const cookie = result.setCookies.find(value => value.startsWith('aa_google_challenge='));
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); assert.match(cookie, /Path=\/auth\/google/i); assert.match(cookie, /Max-Age=300\b/i);
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    const crossOrigin = await client(server).request('/auth/google/challenge', {}, { headers: { Origin: 'https://foreign.example.invalid' } });
    assert.equal(crossOrigin.response.status, 403);
  });

  await t.test('missing, foreign and expired browser challenges cannot create a session', async () => {
    const first = client(server), second = client(server);
    const issued = await challenge(first); await challenge(second);
    const credential = jwt(keys.privateKey, payload(issued.data.nonce));
    denied(await client(server).request('/auth/google', { credential }));
    denied(await second.request('/auth/google', { credential }));
    assert.equal(second.cookies.has('aamm_session'), false);
    const expired = client(server), expiring = await challenge(expired);
    await database(server.copy, query => query('UPDATE google_login_challenges SET expires_at=? WHERE token_hash=?', [Date.now() - 1, digest(expired.cookies.get('aa_google_challenge'))]));
    denied(await expired.request('/auth/google', { credential: jwt(keys.privateKey, payload(expiring.data.nonce)) }));
    assert.equal(expired.cookies.has('aamm_session'), false);
  });

  await t.test('invalid signature, audience, issuer, times and identity claims are rejected', async () => {
    const now = Math.floor(Date.now() / 1000);
    const invalid = [
      { label: 'audience', claims: { aud: 'some-other-client.apps.googleusercontent.com' } },
      { label: 'issuer', claims: { iss: 'https://foreign.example.invalid' } },
      { label: 'expired token', claims: { iat: now - 1000, exp: now - 1 } },
      { label: 'future issue time', claims: { iat: now + 3600, exp: now + 7200 } },
      { label: 'unverified email', claims: { email_verified: false } },
      { label: 'string email verification', claims: { email_verified: 'true' } },
      { label: 'missing subject', claims: { sub: '' } },
      { label: 'wrong nonce', claims: { nonce: '0'.repeat(64) } },
      { label: 'missing nonce', claims: { nonce: undefined } },
      { label: 'unknown signing key', header: { kid: 'unknown-key' } },
      { label: 'bad signature', corrupt: true }
    ];
    for (const fixture of invalid) {
      const who = client(server), issued = await challenge(who);
      let credential = jwt(keys.privateKey, payload(issued.data.nonce, fixture.claims), fixture.header);
      if (fixture.corrupt) { const pieces = credential.split('.'); pieces[2] = Buffer.alloc(256, 0).toString('base64url'); credential = pieces.join('.'); }
      const rejected = await who.request('/auth/google', { credential }); denied(rejected);
      assert.equal(who.cookies.has('aamm_session'), false, fixture.label);
      assert.equal((await who.request('/auth/me')).response.status, 401, fixture.label);
      assert.equal(JSON.stringify(rejected.data).includes(credential), false, 'Provider credentials must not be returned in errors');
    }
  });

  await t.test('a failed or successful credential consumes its browser challenge exactly once', async () => {
    const failed = client(server), issued = await challenge(failed);
    const savedCookie = failed.cookies.get('aa_google_challenge');
    denied(await failed.request('/auth/google', { credential: jwt(keys.privateKey, payload(issued.data.nonce, { email_verified: false })) }));
    failed.cookies.set('aa_google_challenge', savedCookie);
    denied(await failed.request('/auth/google', { credential: jwt(keys.privateKey, payload(issued.data.nonce)) }));
    const concurrent = client(server), next = await challenge(concurrent);
    const credential = jwt(keys.privateKey, payload(next.data.nonce, { sub: 'google-concurrent-fixture' }));
    const cookie = `aa_google_challenge=${concurrent.cookies.get('aa_google_challenge')}`;
    const replies = await Promise.all([client(server), client(server)].map(who => who.request('/auth/google', { credential }, { headers: { Cookie: cookie } })));
    assert.equal(replies.filter(value => value.response.status === 200).length, 1);
    assert.equal(replies.filter(value => [400, 401, 403].includes(value.response.status)).length, 1);
  });

  const alice = client(server), bob = client(server); let aliceUser, bobUser;
  await t.test('Google subject creates a separate customer without linking existing email or phone', async () => {
    const existing = await database(server.copy, query => query('SELECT id FROM users WHERE phone=?', [contactPhone]));
    const login = await signIn(server, alice);
    assert.equal(login.response.status, 200); assert.equal(login.data.isAdmin, false);
    aliceUser = login.data.user; assert.ok(Number.isSafeInteger(aliceUser.id));
    assert.notEqual(aliceUser.id, existing[0].id); assert.equal(aliceUser.auth_provider, 'google');
    assert.equal(aliceUser.phone_verified, false); assert.equal(aliceUser.contact_phone_verified, false);
    const again = await signIn(server, client(server), { email: 'renamed-identity@example.invalid' }); assert.equal(again.data.user.id, aliceUser.id,'Changing Google email must not replace the durable subject account');
    const other = await signIn(server, bob, { sub: 'google-customer-bob', email: sharedEmail });
    assert.equal(other.response.status, 200); bobUser = other.data.user; assert.notEqual(bobUser.id, aliceUser.id);
  });

  await t.test('editing delivery contact cannot claim a phone identity or an administrator role', async () => {
    const edit = await alice.request('/me', { name: 'Customer Alice', address: 'Disposable fixture address', contact_phone: contactPhone, phone: administrator, phone_verified: true, contact_phone_verified: true }, { method: 'PUT' });
    assert.equal(edit.response.status, 200);
    const current = await alice.request('/auth/me'); assert.equal(current.response.status, 200);
    assert.equal(current.data.user.id, aliceUser.id); assert.equal(current.data.user.contact_phone, contactPhone);
    assert.equal(current.data.user.phone_verified, false); assert.equal(current.data.user.contact_phone_verified, false);
    const stored=await database(server.copy,query=>query('SELECT phone,phone_verified FROM users WHERE id=?',[aliceUser.id]));assert.equal(stored[0].phone,null);assert.equal(stored[0].phone_verified,0);
    denied(await alice.request(`/orders/${contactPhone}`));
    denied(await alice.request(`/users/${contactPhone}`));
    denied(await alice.request(`/users/${contactPhone}`, { name: 'Must not change another customer' }, { method: 'PUT' }));
    denied(await alice.request('/admin/overview'));
    const googleOwner = await signIn(server, client(server), { sub: 'google-owner-name-is-not-role', email: 'owner@example.invalid', name: 'Administrator', phone_number: administrator });
    assert.equal(googleOwner.response.status, 200); assert.equal(googleOwner.data.isAdmin, false);
  });

  let aliceOrder, bobOrder, invoice; const admin = client(server); let product;
  await t.test('new customer orders and requests belong to user IDs even when phones match', async () => {
    assert.ok(aliceUser && bobUser);
    assert.equal((await admin.request('/auth/admin-login', { identifier: administrator, password })).response.status, 200);
    const created = await admin.request('/products', { display_name: 'Google ownership test stator', category: 'Test only', price: 125, stock_quantity: 10 });
    assert.equal(created.response.status, 201); product = created.data;
    const orderBody = { name: 'Google customer', phone: contactPhone, delivery: 'pickup', items: [{ id: product.id, qty: 1 }] };
    const own = await alice.request('/orders', { ...orderBody, customer_user_id: bobUser.id, idempotency_key: 'google-account-alice-order' });
    assert.equal(own.response.status, 201); aliceOrder = own.data;
    const other = await bob.request('/orders', { ...orderBody, customer_user_id: aliceUser.id, idempotency_key: 'google-account-bob-order' });
    assert.equal(other.response.status, 201); bobOrder = other.data;
    const guest = await client(server).request('/orders', { ...orderBody, customer_user_id: aliceUser.id, idempotency_key: 'google-account-guest-order' });
    assert.equal(guest.response.status, 201);
    const mine = await alice.request('/my/orders'), theirs = await bob.request('/my/orders');
    assert.equal(mine.response.status, 200); assert.equal(theirs.response.status, 200);
    assert.deepEqual(mine.data.map(value => value.id), [aliceOrder.id]);
    assert.deepEqual(theirs.data.map(value => value.id), [bobOrder.id]);
    for (const [who, part] of [[alice, 'Alice private enquiry'], [bob, 'Bob private enquiry']]) {
      assert.equal((await who.request('/enquiries', { name: part, phone: contactPhone, part_name: part, customer_user_id: who === alice ? bobUser.id : aliceUser.id })).response.status, 201);
      assert.equal((await who.request('/exchange-requests', { name: part, phone: contactPhone, part_name: part, condition: 'Used' })).response.status, 201);
    }
    const requests = await alice.request('/my/requests'); assert.equal(requests.response.status, 200);
    assert.deepEqual(requests.data.enquiries.map(value => value.part_name), ['Alice private enquiry']);
    assert.deepEqual(requests.data.exchanges.map(value => value.part_name), ['Alice private enquiry']);
    const notifications = await alice.request('/notifications'); assert.equal(notifications.response.status, 200);
    assert.ok(notifications.data.length > 0); assert.ok(notifications.data.every(value => value.reference !== bobOrder.reference && value.reference !== guest.data.reference));
  });

  await t.test('tracking, invoices, notifications and payments enforce the stable owner', async () => {
    assert.ok(aliceOrder && bobOrder);
    assert.equal((await alice.request('/tracking', { reference: aliceOrder.reference })).response.status, 200);
    denied(await bob.request('/tracking', { reference: aliceOrder.reference }));
    const confirmed = await admin.request(`/admin/orders/${aliceOrder.id}`, { status: 'Order Confirmed', delivery_charges: 0 }, { method: 'PATCH' });
    assert.equal(confirmed.response.status, 200); invoice = confirmed.data.invoice; assert.ok(invoice?.id);
    const mine = await alice.request('/my/bills'), theirs = await bob.request('/my/bills');
    assert.equal(mine.response.status, 200); assert.ok(mine.data.some(value => value.id === invoice.id)); assert.deepEqual(theirs.data, []);
    assert.equal((await alice.request(invoice.print_url)).response.status, 200); denied(await bob.request(invoice.print_url));
    const notices = await alice.request('/notifications'); const privateNotice = notices.data.find(value => value.reference === aliceOrder.reference); assert.ok(privateNotice);
    const read = await bob.request(`/notifications/${privateNotice.id}`, {}, { method: 'PATCH' });
    assert.ok([200, 404].includes(read.response.status));
    const unchanged = (await alice.request('/notifications')).data.find(value => value.id === privateNotice.id); assert.equal(unchanged.is_read, 0);
    denied(await bob.request('/payments/create', { reference: aliceOrder.reference }));
    const payment = await alice.request('/payments/create', { reference: aliceOrder.reference }); assert.equal(payment.response.status, 200);
    const paymentId = 'pay_GoogleIsolationFixture';
    const signature = crypto.createHmac('sha256', paymentSecret).update(`${payment.data.order_id}|${paymentId}`).digest('hex');
    const proof = { order_id: payment.data.order_id, payment_id: paymentId, signature };
    denied(await bob.request('/payments/verify', proof));
    assert.equal((await alice.request('/payments/verify', proof)).response.status, 200);
    const receipts = (await alice.request('/my/bills')).data.filter(value => value.kind === 'receipt'); assert.equal(receipts.length, 1);
    denied(await bob.request(receipts[0].print_url));
  });

  await t.test('logout revokes the session without deleting the stable customer account', async () => {
    const oldSession = alice.cookies.get('aamm_session'); assert.ok(oldSession);
    assert.equal((await alice.request('/auth/logout', {})).response.status, 200);
    assert.equal((await alice.request('/auth/me')).response.status, 401);
    const replay = client(server); replay.cookies.set('aamm_session', oldSession);
    assert.equal((await replay.request('/auth/me')).response.status, 401);
    const restored = await signIn(server, client(server)); assert.equal(restored.response.status, 200); assert.equal(restored.data.user.id, aliceUser.id);
  });
});
