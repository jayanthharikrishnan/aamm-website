'use strict';

// Every server in this suite receives a disposable copy. The tracked database
// is opened read-only for the baseline and its bytes are checked after testing.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const sqlite3 = require('sqlite3').verbose();

const root = path.resolve(__dirname, '..');
const original = path.join(root, 'database.db');
const adminPhone = '9990000001';
const adminPassword = 'Temporary-test-Password-92!';

async function digest(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function databaseRows(file, sql, params = []) {
  const db = await new Promise((resolve, reject) => {
    const opened = new sqlite3.Database(file, sqlite3.OPEN_READONLY, error => error ? reject(error) : resolve(opened));
  });
  try {
    return await new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
  } finally {
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
  }
}

async function availablePort() {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function launch(databasePath) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DB_PATH: databasePath,
      ADMIN_PHONE: adminPhone,
      ADMIN_PASSWORD: adminPassword,
      SMS_PROVIDER: '',
      SMS_API_KEY: '',
      TWILIO_ACCOUNT_SID: '',
      TWILIO_AUTH_TOKEN: '',
      RAZORPAY_KEY_ID: '',
      RAZORPAY_KEY_SECRET: '',
      AI_API_KEY: '',
      OPENAI_API_KEY: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  for (let attempts = 0; attempts < 150; attempts++) {
    if (child.exitCode !== null) throw new Error(`Server exited (${child.exitCode}): ${output}`);
    try {
      const health = await fetch(`${base}/health`);
      if (health.ok) return { child, base };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  child.kill('SIGTERM');
  throw new Error(`Server did not become ready: ${output}`);
}

async function stop(server) {
  if (!server || server.child.exitCode !== null) return;
  const exited = once(server.child, 'exit');
  server.child.kill('SIGTERM');
  const timeout = setTimeout(() => server.child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timeout);
}

function client(server, cookie = '') {
  return async (url, { method = 'GET', body, ...options } = {}) => {
    const headers = { ...options.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(server.base + url, {
      ...options, method, headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    return { response, data };
  };
}

test('AAMM backend preserves the catalogue and enforces server-side access', { timeout: 45000 }, async t => {
  const originalHash = await digest(original);
  const baselineProducts = await databaseRows(original, 'SELECT id,display_name,price FROM products ORDER BY id');
  const baselineCounts = await databaseRows(original, `SELECT
    (SELECT COUNT(*) FROM users) AS users,
    (SELECT COUNT(*) FROM orders) AS orders,
    (SELECT COUNT(*) FROM sales) AS sales`);
  assert.ok(baselineProducts.length > 0, 'The source catalogue must be present');
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'aamm-api-test-'));
  const copy = path.join(scratch, 'test.sqlite');
  await fs.copyFile(original, copy);
  let server;
  t.after(async () => {
    await stop(server);
    assert.equal(await digest(original), originalHash, 'Tests and startup must leave original database bytes unchanged');
    await fs.rm(scratch, { recursive: true, force: true });
  });
  server = await launch(copy);
  let request = client(server);
  let product;
  let adminCookie;
  let orderEnquiry;

  await t.test('startup retains every product ID, name, price, and existing business record', async () => {
    const { response, data } = await request('/products');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(data));
    assert.deepEqual(data.map(p => ({ id: p.id, display_name: p.display_name, price: p.price })).sort((a, b) => a.id - b.id), baselineProducts);
    const counts = await databaseRows(copy, `SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM orders) AS orders,
      (SELECT COUNT(*) FROM sales) AS sales`);
    assert.deepEqual(counts, baselineCounts);
    product = data.find(p => p.price > 0);
    assert.ok(product);
  });

  await t.test('detail, search aliases, and simultaneous filters use actual catalogue records', async () => {
    const detail = await request(`/products/${product.id}`);
    assert.equal(detail.response.status, 200);
    assert.equal(detail.data.display_name, product.display_name);
    const params = new URLSearchParams({ category: product.category, vehicle: product.vehicle, search: product.subcategory });
    const result = await request('/products?' + params);
    assert.equal(result.response.status, 200);
    assert.ok(result.data.some(p => p.id === product.id));
    assert.ok(result.data.every(p => p.category === product.category && p.vehicle === product.vehicle));
    const starter = await request('/products?search=starter');
    assert.ok(starter.data.length > 0);
    assert.ok(starter.data.every(p => p.category === 'Self Motor'));
    const injection = await request('/products?' + new URLSearchParams({ category: "' OR 1=1 --" }));
    assert.deepEqual(injection.data, []);
  });

  await t.test('one-character catalogue typos match without changing numeric part numbers or stock meaning', async () => {
    const typo=await request('/products?search='+encodeURIComponent('statr'));
    assert.equal(typo.response.status,200);
    assert.ok(typo.data.length>0);
    assert.ok(typo.data.every(row=>row.subcategory==='Stator'));
    const number=await request('/products?search=6218');
    assert.equal(number.data.some(row=>row.display_name.includes('6219')),false,'Numeric part numbers must not be fuzzy-matched');
    const unknown=await request('/products?availability=unknown');
    assert.equal(unknown.response.status,200);
    assert.equal(unknown.data.length,baselineProducts.length);
    assert.ok(unknown.data.every(row=>row.stock_quantity===null));
    const out=await request('/products?availability=out_of_stock');
    assert.equal(out.response.status,200);
    assert.deepEqual(out.data,[],'Unknown inventory must not be represented as out of stock');
  });

  await t.test('checkout source, database, secrets and repository files cannot be downloaded', async () => {
    for (const file of ['/database.db', '/server.js', '/package.json', '/.env', '/.git/config']) {
      const { response } = await request(file);
      assert.ok([403, 404].includes(response.status), `${file} must not be exposed (received ${response.status})`);
    }
  });

  await t.test('phone possession alone does not expose a customer or historical orders', async () => {
    const users = await databaseRows(copy, 'SELECT phone FROM users LIMIT 1');
    const phone = users[0]?.phone || '9990000002';
    for (const url of [`/users/${phone}`, `/orders/${phone}`]) {
      const { response } = await request(url);
      assert.equal(response.status, 401, `${url} requires verified authentication`);
    }
    const login = await request('/auth/login', { method: 'POST', body: { phone: '9990000002' } });
    assert.equal(login.response.status, 503, 'Unconfigured OTP must not create a customer session');
    const write = await request('/products', { method: 'POST', body: { display_name: 'Unauthorized product', price: 1 } });
    assert.equal(write.response.status, 401);
    assert.equal((await request('/admin/enquiries')).response.status, 401);
    assert.equal((await request('/admin/exchanges')).response.status, 401);
  });

  await t.test('admin login rejects bad credentials and issues a protected session for valid credentials', async () => {
    const bad = await request('/auth/admin-login', { method: 'POST', body: { phone: adminPhone, password: 'incorrect-password' } });
    assert.equal(bad.response.status, 401);
    const good = await request('/auth/admin-login', { method: 'POST', body: { phone: adminPhone, password: adminPassword } });
    assert.equal(good.response.status, 200);
    const cookie = good.response.headers.get('set-cookie');
    assert.ok(cookie?.includes('HttpOnly'));
    assert.ok(/SameSite=(Lax|Strict)/i.test(cookie));
    adminCookie = cookie.split(';', 1)[0];
    const me = await client(server, adminCookie)('/auth/me');
    assert.equal(me.response.status, 200);
    assert.equal(JSON.stringify(me.data).includes(adminPassword), false);
  });

  await t.test('spare-part and exchange requests validate, persist and remain admin-only', async () => {
    const invalid = await request('/enquiries', { method: 'POST', body: { name: 'Test' } });
    assert.equal(invalid.response.status, 400);
    const enquiry = await request('/enquiries', { method: 'POST', body: {
      name: 'API test customer', phone: '9990000002', part_name: 'Test stator request', vehicle: 'Test vehicle', message: 'Please confirm availability.'
    } });
    assert.equal(enquiry.response.status, 201);
    assert.ok(enquiry.data.id);
    assert.ok(enquiry.data.reference);
    const exchange = await request('/exchange-requests', { method: 'POST', body: {
      name: 'API test customer', phone: '9990000002', part_name: 'Test old stator', vehicle: 'Test vehicle', condition: 'Used', message: 'Inspection requested.'
    } });
    assert.equal(exchange.response.status, 201);
    assert.ok(exchange.data.reference);
    const admin = client(server, adminCookie);
    const enquiries = await admin('/admin/enquiries');
    const exchanges = await admin('/admin/exchanges');
    assert.equal(enquiries.response.status, 200);
    assert.equal(exchanges.response.status, 200);
    assert.ok(enquiries.data.some(row => row.id === enquiry.data.id));
    assert.ok(exchanges.data.some(row => row.id === exchange.data.id));
  });

  await t.test('cross-site writes are rejected even with a valid administrator session', async () => {
    const result = await client(server, adminCookie)('/products', {
      method: 'POST', headers: { Origin: 'https://untrusted.example' },
      body: { display_name: 'Cross-site product', price: 1 }
    });
    assert.equal(result.response.status, 403);
  });

  await t.test('session tokens are hashed at rest and logout revokes the server session', async () => {
    const sessions = await databaseRows(copy, 'SELECT token_hash FROM sessions');
    const rawToken = adminCookie.slice(adminCookie.indexOf('=') + 1);
    assert.ok(sessions.some(row => row.token_hash === createHash('sha256').update(rawToken).digest('hex')));
    assert.equal(sessions.some(row => row.token_hash === rawToken), false);
    const admin = client(server, adminCookie);
    const logout = await admin('/auth/logout', { method: 'POST', body: {} });
    assert.equal(logout.response.status, 200);
    assert.equal((await admin('/auth/me')).response.status, 401);
  });

  await t.test('unconfigured paid services and uploads report their actual state', async () => {
    const { response, data } = await request('/api/config');
    assert.equal(response.status, 200);
    for (const capability of ['otp', 'payments', 'ai', 'image_uploads']) {
      assert.equal(data.features[capability], false, `${capability} must not pretend to be configured`);
    }
  });

  await t.test('guest order enquiries recalculate totals, reject invalid items, and prevent duplicate orders', async () => {
    const salesBefore = await databaseRows(copy, 'SELECT COUNT(*) AS count FROM sales');
    const order = {
      phone: '9990000002', name: 'API test customer', address: 'Test delivery address', delivery: 'pickup',
      items: [{ id: product.id, qty: 2, price: 1 }], total: 1, idempotency_key: 'backend-test-order-0001'
    };
    const result = await request('/orders', { method: 'POST', body: order });
    assert.equal(result.response.status, 201);
    orderEnquiry = result.data;
    assert.equal(result.data.total, product.price * 2, 'Totals are computed from database prices');
    assert.equal(result.data.payment_status, 'not_requested');
    assert.equal(result.data.status, 'Enquiry submitted');
    assert.ok(result.data.reference);
    assert.ok(result.data.whatsapp_url);
    const repeated = await request('/orders', { method: 'POST', body: order });
    assert.equal(repeated.response.status, 200);
    assert.equal(repeated.data.id, result.data.id);
    assert.equal(Object.hasOwn(repeated.data,'tracking_token'),false,'Idempotent retries must not reveal or rotate the tracking secret');
    assert.deepEqual(await databaseRows(copy, 'SELECT COUNT(*) AS count FROM sales'), salesBefore, 'Unconfirmed WhatsApp enquiries are not recorded as sales');
    for (const items of [[], [{ id: -99999, qty: 1 }], [{ id: product.id, qty: -1 }], [{ id: product.id, qty: 0.5 }]]) {
      const invalid = await request('/orders', { method: 'POST', body: { ...order, items, idempotency_key: undefined } });
      assert.equal(invalid.response.status, 400);
    }
  });

  await t.test('guest tracking requires its receipt secret and returns no customer personal data', async () => {
    assert.match(orderEnquiry.tracking_token, /^[a-f0-9]{64}$/);
    const stored = await databaseRows(copy, 'SELECT tracking_token_hash FROM orders WHERE id=?', [orderEnquiry.id]);
    assert.equal(stored[0].tracking_token_hash, createHash('sha256').update(orderEnquiry.tracking_token).digest('hex'));
    assert.notEqual(stored[0].tracking_token_hash, orderEnquiry.tracking_token);
    const tracked = await request('/tracking-guest', { method:'POST', body:{reference:orderEnquiry.reference,token:orderEnquiry.tracking_token} });
    assert.equal(tracked.response.status,200);
    assert.equal(tracked.response.headers.get('cache-control'),'no-store');
    assert.equal(tracked.data.reference,orderEnquiry.reference);
    assert.equal(tracked.data.tracking_type,'internal');
    assert.ok(tracked.data.history.some(row=>row.status==='Enquiry submitted'));
    for(const field of ['phone','address','name','whatsapp_url','tracking_token','tracking_token_hash']) assert.equal(Object.hasOwn(tracked.data,field),false,field+' must not be exposed');
    const wrong = await request('/tracking-guest',{method:'POST',body:{reference:orderEnquiry.reference,token:'0'.repeat(64)}});
    const unknown = await request('/tracking-guest',{method:'POST',body:{reference:'AAMM-UNKNOWN',token:orderEnquiry.tracking_token}});
    assert.equal(wrong.response.status,404);
    assert.equal(unknown.response.status,404);
    assert.equal(wrong.data.error,unknown.data.error);
    assert.equal((await request('/tracking-guest',{method:'POST',body:{reference:orderEnquiry.reference}})).response.status,400);
    assert.equal((await request('/my/requests')).response.status,401);
    const login=await request('/auth/admin-login',{method:'POST',body:{phone:adminPhone,password:adminPassword}});
    const own=await client(server,login.response.headers.get('set-cookie').split(';',1)[0])('/my/requests');
    assert.equal(own.response.status,200);
    assert.deepEqual(own.data,{enquiries:[],exchanges:[]},'An administrator phone does not receive another customer request through the owner endpoint');
    assert.equal(own.response.headers.get('cache-control'),'no-store');
  });

  await t.test('payments cannot be initiated anonymously or marked paid while providers are unavailable', async () => {
    for (const url of ['/payments/create', '/payments/verify', '/admin/payments/1/refund']) {
      assert.equal((await request(url, { method: 'POST', body: {} })).response.status, 401);
    }
    const login = await request('/auth/admin-login', { method: 'POST', body: { phone: adminPhone, password: adminPassword } });
    assert.equal(login.response.status, 200);
    adminCookie = login.response.headers.get('set-cookie').split(';', 1)[0];
    const admin = client(server, adminCookie);
    for (const url of ['/payments/create', '/payments/verify', '/admin/payments/1/refund']) {
      const result = await admin(url, { method: 'POST', body: { reference: orderEnquiry.reference } });
      assert.equal(result.response.status, 503);
    }
    assert.equal((await request('/payments/webhook', { method: 'POST', body: { event: 'payment.captured' } })).response.status, 503);
    const order = await databaseRows(copy, 'SELECT payment_status FROM orders WHERE id=?', [orderEnquiry.id]);
    assert.equal(order[0].payment_status, 'not_requested');
    assert.deepEqual(await databaseRows(copy, 'SELECT COUNT(*) AS count FROM payments'), [{ count: 0 }]);
  });

  await t.test('admin product updates persist partial changes, record stock reasons and archive without deleting', async () => {
    const admin = client(server, adminCookie);
    const created = await admin('/products', { method: 'POST', body: {
      display_name: 'Automated test product', category: 'Test category', subcategory: 'Test subcategory',
      price: 125, stock_quantity: 10, description: 'Only created in a disposable test database.'
    } });
    assert.equal(created.response.status, 201);
    const id = created.data.id;
    assert.ok(id);
    const changed = await admin(`/products/${id}`, { method: 'PUT', body: { price: 200, stock_quantity: 3, stock_reason: 'Test counted adjustment' } });
    assert.equal(changed.response.status, 200);
    const detail = await request(`/products/${id}`);
    assert.equal(detail.data.display_name, 'Automated test product');
    assert.equal(detail.data.category, 'Test category');
    assert.equal(detail.data.price, 200);
    assert.equal(detail.data.stock_quantity, 3);
    const inventory = await admin('/admin/inventory');
    const movement = inventory.data.movements.find(row => row.product_id === id && row.reason === 'Test counted adjustment');
    assert.ok(movement);
    assert.equal(movement.previous_quantity, 10);
    assert.equal(movement.new_quantity, 3);
    assert.equal((await admin(`/products/${id}`, { method: 'PUT', body: { stock_quantity: -1 } })).response.status, 400);
    assert.equal((await request(`/products/${id}`)).data.stock_quantity, 3);
    const tooMany = await request('/orders', { method: 'POST', body: {
      phone: '9990000002', name: 'API test customer', delivery: 'pickup', items: [{ id, qty: 4 }]
    } });
    assert.equal(tooMany.response.status, 409);
    assert.equal((await admin(`/products/${id}`, { method: 'DELETE' })).response.status, 200);
    assert.equal((await request(`/products/${id}`)).response.status, 404);
    const stored = await databaseRows(copy, 'SELECT archived FROM products WHERE id=?', [id]);
    assert.deepEqual(stored, [{ archived: 1 }]);
  });

  await t.test('order status changes preserve an attributable history without fabricating payment or refunds', async () => {
    const admin = client(server, adminCookie);
    assert.equal((await admin(`/admin/orders/${orderEnquiry.id}`, { method: 'PATCH', body: { status: 'Processing' } })).response.status, 200);
    const history = await databaseRows(copy, 'SELECT previous_status,status,actor FROM order_status_history WHERE order_id=? ORDER BY id', [orderEnquiry.id]);
    assert.ok(history.some(row => row.previous_status === 'Enquiry submitted' && row.status === 'Processing' && row.actor === adminPhone));
    const tracking = await admin('/tracking', { method: 'POST', body: { reference: orderEnquiry.reference } });
    assert.equal(tracking.response.status, 200);
    assert.equal(tracking.data.tracking_type, 'internal');
    assert.equal(tracking.data.payment_status, 'not_requested');
    assert.equal((await admin(`/admin/orders/${orderEnquiry.id}`, { method: 'PATCH', body: { status: 'Refunded' } })).response.status, 409);
    const audit = await admin('/admin/audit');
    assert.ok(audit.data.some(row => row.entity === 'order' && String(row.entity_id) === String(orderEnquiry.id) && row.action === 'status_update'));
    const overview = await admin('/admin/overview');
    assert.equal(overview.data.verified_revenue, 0, 'Historical unverified sales cannot be counted as paid revenue');
  });

  await t.test('restart preserves existing IDs and newly submitted requests', async () => {
    const before = await databaseRows(copy, 'SELECT id,display_name,price FROM products ORDER BY id');
    const enquiryCount = await databaseRows(copy, 'SELECT COUNT(*) AS count FROM enquiries');
    await stop(server);
    server = await launch(copy);
    request = client(server);
    const after = await databaseRows(copy, 'SELECT id,display_name,price FROM products ORDER BY id');
    assert.deepEqual(after, before);
    assert.deepEqual(after.filter(row => baselineProducts.some(original => original.id === row.id)), baselineProducts);
    assert.deepEqual(await databaseRows(copy, 'SELECT COUNT(*) AS count FROM enquiries'), enquiryCount);
    const receipt = await request('/tracking-guest',{method:'POST',body:{reference:orderEnquiry.reference,token:orderEnquiry.tracking_token}});
    assert.equal(receipt.response.status,200);
    assert.equal(receipt.data.status,'Processing','The original receipt token and real status persist after restart');
  });
});
