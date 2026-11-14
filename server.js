'use strict';

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const providers = require('./lib/integrations');
const googleAuth = require('./lib/google-auth');
const businessConfiguration = require('./config/business.json');
const sms = require('./lib/sms');
const { renderBill } = require('./lib/billing');
const createBillingStore = require('./lib/billing-store');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'database.db'));
if (DB_PATH.startsWith(path.join(__dirname,'images') + path.sep)) throw new Error('DB_PATH must be outside the public images directory.');
if (process.env.NODE_ENV === 'production' && (!process.env.DB_PATH || !path.isAbsolute(process.env.DB_PATH))) console.warn('Alagar Automobiles persistence is not verified: configure an absolute DB_PATH on an attached persistent disk.');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
// A new persistent volume receives the existing catalogue once. Never replace an existing DB.
if (!fs.existsSync(DB_PATH) && DB_PATH !== path.join(__dirname, 'database.db') && fs.existsSync(path.join(__dirname, 'database.db'))) {
  fs.copyFileSync(path.join(__dirname, 'database.db'), DB_PATH, fs.constants.COPYFILE_EXCL);
}
const db = new sqlite3.Database(DB_PATH);
const { AsyncLocalStorage } = require('node:async_hooks');
const dbContext = new AsyncLocalStorage();
let dbQueue = Promise.resolve();
function schedule(operation) {
  if (dbContext.getStore()) return operation();
  const result = dbQueue.then(operation);
  dbQueue = result.catch(() => {});
  return result;
}
const runRaw = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, function (err) { err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes }); }));
const getRaw = (sql, args = []) => new Promise((resolve, reject) => db.get(sql, args, (err, row) => err ? reject(err) : resolve(row)));
const allRaw = (sql, args = []) => new Promise((resolve, reject) => db.all(sql, args, (err, rows) => err ? reject(err) : resolve(rows)));
const run = (sql, args = []) => schedule(() => runRaw(sql, args));
const get = (sql, args = []) => schedule(() => getRaw(sql, args));
const all = (sql, args = []) => schedule(() => allRaw(sql, args));
function transaction(operation) {
  return schedule(() => dbContext.run(true, async () => {
    await runRaw('BEGIN IMMEDIATE');
    try { const result = await operation(); await runRaw('COMMIT'); return result; }
    catch (error) { await runRaw('ROLLBACK'); throw error; }
  }));
}
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const clean = (value, max = 1000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const phoneNumber = value => clean(String(value || ''), 20).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
const validPhone = value => /^[6-9]\d{9}$/.test(value);
const business = {
  name: 'Alagar Automobiles',
  whatsapp: process.env.WHATSAPP_NUMBER || '919344898473',
  maps_url: process.env.GOOGLE_MAPS_URL || 'https://maps.app.goo.gl/2G5aei6qZseprHf38'
};

async function initialize() {
  await run('PRAGMA foreign_keys = ON');
  await run('PRAGMA busy_timeout = 5000');
  const integrity = await get('PRAGMA integrity_check');
  if (Object.values(integrity)[0] !== 'ok') throw new Error('Database integrity check failed; original data retained.');
  const oldVersion = (await get('PRAGMA user_version')).user_version;
  if (oldVersion < 4) {
    const backupDir = path.join(path.dirname(DB_PATH), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `alagar-before-v4-${Date.now()}.db`);
    await run('VACUUM INTO ?', [backupPath]);
    // VACUUM INTO produces a consistent snapshot before any migration.
  }
  await run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, display_name TEXT, category TEXT, subcategory TEXT, vehicle TEXT, price INTEGER, description TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT UNIQUE,name TEXT,address TEXT,delivery_pref TEXT,email TEXT,profile_photo TEXT,password TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT,items TEXT,total INTEGER,delivery TEXT,address TEXT,ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER,qty INTEGER DEFAULT 1,sold_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  const columns = async (table, additions) => {
    const names = new Set((await all(`PRAGMA table_info(${table})`)).map(row => row.name));
    for (const [name, type] of Object.entries(additions)) if (!names.has(name)) await run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  };
  await columns('users',{phone_verified:'INTEGER NOT NULL DEFAULT 0',google_sub:'TEXT',google_email:'TEXT',contact_phone:'TEXT'});
  await run("CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL");
  await columns('products', { sku: 'TEXT', brand: 'TEXT', stock_quantity: 'INTEGER', archived: 'INTEGER NOT NULL DEFAULT 0', compatibility_verified: 'INTEGER NOT NULL DEFAULT 0', updated_at: 'TEXT' });
  await columns('orders', { reference: 'TEXT', name: 'TEXT', status: "TEXT NOT NULL DEFAULT 'Legacy order — verification required'", payment_status: "TEXT NOT NULL DEFAULT 'unverified'", idempotency_key: 'TEXT', courier: 'TEXT', tracking_number: 'TEXT', estimated_delivery: 'TEXT', payment_order_id: 'TEXT', tracking_token_hash: 'TEXT', delivery_charges: 'REAL' });
  await run(`CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,phone TEXT NOT NULL,role TEXT NOT NULL,expires_at INTEGER NOT NULL)`);
  await run(`CREATE TABLE IF NOT EXISTS enquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE,name TEXT NOT NULL,phone TEXT NOT NULL,part_name TEXT NOT NULL,vehicle TEXT,message TEXT,status TEXT NOT NULL DEFAULT 'New',notes TEXT,quotation_amount REAL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS exchange_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE,name TEXT NOT NULL,phone TEXT NOT NULL,part_name TEXT NOT NULL,vehicle TEXT,condition TEXT,message TEXT,status TEXT NOT NULL DEFAULT 'New',notes TEXT,valuation REAL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,entity TEXT,entity_id TEXT,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS order_status_history (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,previous_status TEXT,status TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,phone TEXT NOT NULL,title TEXT NOT NULL,message TEXT,reference TEXT,is_read INTEGER NOT NULL DEFAULT 0,delivery_status TEXT NOT NULL DEFAULT 'in_app',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,provider_order_id TEXT UNIQUE,provider_payment_id TEXT UNIQUE,amount INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'created',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL,previous_quantity INTEGER,new_quantity INTEGER,reason TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await run(`CREATE TABLE IF NOT EXISTS notification_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT,notification_id INTEGER NOT NULL,channel TEXT NOT NULL DEFAULT 'sms',provider_sid TEXT,status TEXT NOT NULL DEFAULT 'pending',error_code TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,UNIQUE(notification_id,channel))`);
  await run("UPDATE notification_deliveries SET status='delivery_unknown',error_code='interrupted_send',updated_at=CURRENT_TIMESTAMP WHERE status='sending' AND provider_sid IS NULL");
  await columns('sessions',{user_id:'INTEGER',auth_provider:"TEXT NOT NULL DEFAULT 'phone'"});
  for(const table of ['orders','enquiries','exchange_requests','notifications']) {
    await columns(table,{customer_user_id:'INTEGER'});
    await run(`CREATE INDEX IF NOT EXISTS ${table}_customer_owner ON ${table}(customer_user_id)`);
  }
  await run('CREATE TABLE IF NOT EXISTS google_login_challenges (token_hash TEXT PRIMARY KEY,nonce TEXT NOT NULL,expires_at INTEGER NOT NULL)');
  await run('DELETE FROM google_login_challenges WHERE expires_at<?',[Date.now()]);
  await billing.initialize();
  await run('CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL');
  await run('CREATE UNIQUE INDEX IF NOT EXISTS orders_reference ON orders(reference) WHERE reference IS NOT NULL');
  await run('CREATE INDEX IF NOT EXISTS products_category ON products(category,subcategory)');
  await run('CREATE INDEX IF NOT EXISTS orders_phone ON orders(phone)');
  await run('CREATE INDEX IF NOT EXISTS enquiries_status ON enquiries(status)');
  await run('CREATE INDEX IF NOT EXISTS exchanges_status ON exchange_requests(status)');
  await run('CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)');
  await run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
  await run('PRAGMA user_version = 4');
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://api.razorpay.com https://accounts.google.com/gsi/; frame-src https://api.razorpay.com https://www.google.com https://accounts.google.com/gsi/; object-src 'none'; base-uri 'self'; form-action 'self'");
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/admin/') || req.path.startsWith('/auth/') || req.path.startsWith('/users/') || req.path.startsWith('/orders') || req.path.startsWith('/tracking') || req.path.startsWith('/notifications') || req.path === '/me' || req.path.startsWith('/my/') || req.path.startsWith('/bills/') || req.path.startsWith('/billing/')) res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('origin');
    const allowedOrigin = process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
    if ((origin && origin !== allowedOrigin) || req.get('sec-fetch-site') === 'cross-site') return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
  }
  next();
});
app.use(express.json({ limit: '64kb', verify: (req, res, buffer) => { req.rawBody = buffer; } }));
app.use((req,res,next) => { if (!req.body) req.body = {}; next(); });

const limits = new Map();
function rateLimit(scope, count, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${scope}:${req.ip}`;
    let item = limits.get(key);
    if (!item || item.expires < now) item = { count: 0, expires: now + windowMs };
    item.count += 1; limits.set(key, item);
    if (limits.size > 10000) for (const [k, v] of limits) if (v.expires < now) limits.delete(k);
    if (item.count > count) { res.setHeader('Retry-After', Math.ceil((item.expires - now) / 1000)); return res.status(429).json({ error: 'Too many requests. Please try again later.' }); }
    next();
  };
}
app.use('/auth', rateLimit('auth', 30, 15 * 60 * 1000));
const submissionLimit = rateLimit('submission', 40, 15 * 60 * 1000);
const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
app.use(async (req, res, next) => {
  try {
    const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('aamm_session='));
    if (cookie) {
      const token = cookie.slice('aamm_session='.length);
      if (/^[a-f0-9]{64}$/.test(token)) req.session = await get('SELECT phone,role,user_id,auth_provider FROM sessions WHERE token_hash=? AND expires_at>?', [hashToken(token), Date.now()]);
      if(req.session?.role==='customer') {
        req.customer=req.session.user_id?await get('SELECT * FROM users WHERE id=?',[req.session.user_id]):await get('SELECT * FROM users WHERE phone=? AND google_sub IS NULL',[req.session.phone]);
        if(!req.customer) req.session=null;
        else req.session.user_id=req.customer.id;
      }
    }
    next();
  } catch (err) { next(err); }
});
const admin = (req, res, next) => req.session?.role === 'admin' ? next() : res.status(401).json({ error: 'Administrator sign-in required.' });
const customer = (req, res, next) => req.session ? next() : res.status(401).json({ error: 'Sign in to access your account.' });
async function createSession(req,res,phone,role,user=null) {
  if(role==='customer'&&!user)user=await get('SELECT * FROM users WHERE phone=? AND google_sub IS NULL',[phone]);
  if(role==='customer'&&!user)throw fail(401,'Sign in to access your account.');
  const provider=role==='admin'?'admin':user.google_sub?'google':'phone';
  const principal=provider==='google'?`google:${user.id}`:phone;
  const token=crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions(token_hash,phone,role,expires_at,user_id,auth_provider) VALUES (?,?,?,?,?,?)',[hashToken(token),principal,role,Date.now()+8*60*60*1000,user?.id||null,provider]);
  res.cookie('aamm_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000,path:'/'});
}
const publicUser=u=>u&&({id:u.id,phone:u.phone||null,contact_phone:u.contact_phone||u.phone||'',name:u.name||'',address:u.address||'',delivery_pref:u.delivery_pref||'',email:u.google_email||u.email||'',auth_provider:u.google_sub?'google':'phone',email_verified:Boolean(u.google_sub&&u.google_email),phone_verified:u.phone_verified===1,contact_phone_verified:Boolean(u.phone_verified===1&&u.phone&&(!u.contact_phone||u.contact_phone===u.phone))});
function verifiedPhoneSession(req){return Boolean(req.session?.role==='customer'&&req.session.auth_provider!=='google'&&req.customer?.phone_verified===1&&req.customer.phone===req.session.phone);}
function ownerClause(req,alias='') {
  const prefix=alias?alias+'.':'';
  if(req.session?.role==='admin')return {sql:`(${prefix}customer_user_id IS NULL AND ${prefix}phone=?)`,args:[req.session.phone]};
  if(!req.customer)return {sql:'0=1',args:[]};
  return verifiedPhoneSession(req)?{sql:`(${prefix}customer_user_id=? OR (${prefix}customer_user_id IS NULL AND ${prefix}phone=?))`,args:[req.customer.id,req.customer.phone]}:{sql:`${prefix}customer_user_id=?`,args:[req.customer.id]};
}
function ownsOrder(req,order){if(!order)return false;if(req.session?.role==='admin')return true;if(order.customer_user_id!=null)return Number(order.customer_user_id)===req.customer?.id;return verifiedPhoneSession(req)&&order.phone===req.customer.phone;}
async function currentProfile(req){if(req.session.role==='admin')return adminUser();if(!req.customer)throw fail(401,'Sign in to access your account.');return publicUser(req.customer);}
async function updateProfile(req,res) {
  if(!req.customer)throw fail(403,'Use the owner dashboard for administrator settings.');
  const phone=phoneNumber(req.body.contact_phone??req.customer.contact_phone??'');
  if(phone&&!validPhone(phone))throw fail(400,'Enter a valid Indian delivery contact number.');
  const delivery=clean(req.body.delivery_pref??req.customer.delivery_pref,50);
  if(!['','pickup','bus','lorry'].includes(delivery))throw fail(400,'Choose a valid delivery preference.');
  await run('UPDATE users SET name=?,address=?,delivery_pref=?,email=?,contact_phone=? WHERE id=?',[clean(req.body.name??req.customer.name,100),clean(req.body.address??req.customer.address,1000),delivery,req.customer.google_sub?req.customer.email:clean(req.body.email??req.customer.email,200),phone||null,req.customer.id]);
  res.json({ok:true});
}
const audit = (req, action, entity, id, details = {}) => run('INSERT INTO audit_logs(actor,action,entity,entity_id,details) VALUES (?,?,?,?,?)', [req.session?.phone || 'system', action, entity, String(id ?? ''), JSON.stringify(details)]);
async function notify(phone, title, message, reference, options={}) {
  let owner=options.customer_user_id??null;
  if(owner===null&&reference){const order=await findOrderReference(reference);if(order)owner=order.customer_user_id??null;else{const enquiry=await get('SELECT customer_user_id FROM enquiries WHERE reference=?',[reference])||await get('SELECT customer_user_id FROM exchange_requests WHERE reference=?',[reference]);owner=enquiry?.customer_user_id??null;}}
  const result=await run('INSERT INTO notifications(phone,title,message,reference,customer_user_id) VALUES (?,?,?,?,?)',[phone,title,message,reference,owner]);
  const recipient=sms.smsConfigured()&&options.sms!==false&&validPhone(phoneNumber(phone))?await get('SELECT id,phone_verified FROM users WHERE phone=?',[phoneNumber(phone)]):null;
  if(recipient?.phone_verified===1&&(owner===null||owner===recipient.id)) await run("INSERT INTO notification_deliveries(notification_id,channel,status) VALUES (?,'sms','pending')",[result.lastID]);
  return result;
}
const billing=createBillingStore({run,get,all,fail,notify,business});
const adminId=()=>clean(process.env.ADMIN_ID ?? businessConfiguration.administrator?.id,100);
const adminPhone=()=>{const configured=phoneNumber(process.env.ADMIN_PHONE ?? businessConfiguration.administrator?.phone);return validPhone(configured)?configured:'';};
const adminPasswordConfigured=()=>Boolean((adminId()||adminPhone())&&process.env.ADMIN_PASSWORD&&process.env.ADMIN_PASSWORD.length>=12);
const adminOtpConfigured=()=>Boolean(adminPhone()&&providers.otpConfigured());
const adminPrincipal=()=>adminPhone()||`admin:${adminId()}`;
const adminUser=()=>({id:adminId()||adminPhone(),phone:adminPhone()||null,name:'Administrator'});
const identifierMatches=value=>{const input=clean(String(value||''),100);return Boolean((adminId()&&input.toLowerCase()===adminId().toLowerCase())||(adminPhone()&&/^[+\d\s()-]+$/.test(input)&&phoneNumber(input)===adminPhone()));};
const submittedIdentifier=body=>body.identifier??body.id??body.phone;
const displayReference=value=>String(value||'').replace(/^AAMM-/,'AA-');
const visibleBusinessText=value=>String(value||'').replace(/\bAAMM-/g,'AA-').replace(/\bAAMM\b/g,'Alagar Automobiles');
const notificationRow=row=>({...row,title:visibleBusinessText(row.title),message:visibleBusinessText(row.message),reference:displayReference(row.reference)});
async function findOrderReference(reference) {
  const value=clean(reference,100); let order=await get('SELECT * FROM orders WHERE reference=?',[value]);
  if(!order&&value.startsWith('AA-')) order=await get('SELECT * FROM orders WHERE reference=?',[value.replace(/^AA-/,'AAMM-')]);
  return order;
}
let smsDispatching=false;
async function dispatchSmsOutbox() {
  if(smsDispatching||!sms.smsConfigured()) return;
  smsDispatching=true;
  try {
    for(let count=0;count<10;count++) {
      const item=await transaction(async()=>{const next=await get("SELECT d.*,n.phone,n.title,n.message,n.reference,n.customer_user_id FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.status='pending' ORDER BY d.id LIMIT 1");if(next) await run("UPDATE notification_deliveries SET status='sending',updated_at=CURRENT_TIMESTAMP WHERE id=?",[next.id]);return next;});
      if(!item) break;
      const recipient=await get('SELECT id,phone_verified FROM users WHERE phone=?',[phoneNumber(item.phone)]);if(recipient?.phone_verified!==1||(item.customer_user_id!=null&&item.customer_user_id!==recipient.id)){await run("UPDATE notification_deliveries SET status='not_sent_unverified',updated_at=CURRENT_TIMESTAMP WHERE id=?",[item.id]);continue;}
      try { const result=await sms.sendSms(item.phone,`Alagar Automobiles: ${item.title}. ${item.message||''}${item.reference?' Reference: '+displayReference(item.reference):''}`.slice(0,1000)); await transaction(async()=>{await run('UPDATE notification_deliveries SET provider_sid=?,status=?,error_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[result.sid,result.status,result.error_code,item.id]);await run('UPDATE notifications SET delivery_status=? WHERE id=?',[`sms_${result.status}`,item.notification_id]);}); }
      catch(error) { await run("UPDATE notification_deliveries SET status='failed',error_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",[error.code||'provider_error',item.id]); }
    }
  } finally { smsDispatching=false; }
}

const productRow = row => ({ ...row, image: null, availability: row.stock_quantity == null ? 'Confirm availability' : row.stock_quantity > 0 ? 'In stock' : 'Out of stock', compatibility_status: row.compatibility_verified ? 'verified' : 'unverified' });

function normalizeSearch(value) {
  return clean(value, 200).toLowerCase().replace(/\b(starter|self)\b/g, 'self motor').replace(/\bdynamo\b/g, 'alternator').replace(/\bmaruthi\b/g, 'maruti').replace(/\b(bendix|bendex)\b/g, 'ben dex').replace(/\bregulator\b/g, 'cut out').replace(/\bdiode\b/g, 'dyad').replace(/\s+/g, ' ').trim();
}
// At most one insertion, removal or substitution. Numeric SKUs and short
// words retain their existing exact/substring behavior and never use fuzziness.
function oneEditApart(left, right) {
  if (Math.abs(left.length-right.length)>1) return false;
  let a=0,b=0,edits=0;
  while(a<left.length && b<right.length) {
    if(left[a]===right[b]) { a++; b++; continue; }
    if(++edits>1) return false;
    if(left.length>=right.length) a++;
    if(right.length>=left.length) b++;
  }
  return edits + (a<left.length || b<right.length ? 1 : 0) <= 1;
}
async function searchProducts(query = {}) {
  let sql = 'SELECT * FROM products WHERE archived=0'; const params = [];
  for (const key of ['category', 'subcategory', 'vehicle', 'brand']) if (clean(query[key])) { sql += ` AND ${key}=?`; params.push(clean(query[key], 200)); }
  if (query.min_price !== undefined && Number.isFinite(Number(query.min_price))) { sql += ' AND price>=?'; params.push(Number(query.min_price)); }
  if (query.max_price !== undefined && Number.isFinite(Number(query.max_price))) { sql += ' AND price<=?'; params.push(Number(query.max_price)); }
  if (query.availability === 'in_stock') sql += ' AND stock_quantity>0';
  if (query.availability === 'out_of_stock') sql += ' AND stock_quantity=0';
  if (query.availability === 'unknown') sql += ' AND stock_quantity IS NULL';
  let rows = await all(sql + ' ORDER BY id', params);
  const search = normalizeSearch(query.search || query.q || '');
  if (search) {
    const words = [...new Set(search.split(' ').filter(Boolean))];
    rows = rows.filter(row => {
      const text = normalizeSearch([row.display_name, row.name, row.category, row.subcategory, row.vehicle, row.sku, row.brand, row.description].filter(Boolean).join(' '));
      const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
      return words.every(word => text.includes(word) || (word.length>=4 && /^[a-z]+$/.test(word) && tokens.some(token => /^[a-z]+$/.test(token) && oneEditApart(word,token))));
    });
  }
  if (query.sort === 'price_asc') rows.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (query.sort === 'price_desc') rows.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  if (query.sort === 'name') rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return rows.map(productRow);
}

app.get('/health', async (req, res) => { await get('SELECT 1'); res.json({ status: 'ok', database: 'ready', persistence_configuration: process.env.DB_PATH && path.isAbsolute(process.env.DB_PATH) ? 'explicit_path_configured' : 'not_verified' }); });
app.get('/api/config', (req, res) => res.json({ business, google:{configured:googleAuth.configured(),client_id:googleAuth.configured()?googleAuth.clientId():null}, admin:{password_configured:adminPasswordConfigured(),otp_configured:adminOtpConfigured()}, features: { google:googleAuth.configured(), otp: providers.otpConfigured(), payments: providers.paymentsConfigured(), ai: providers.aiConfigured(), image_uploads: false, billing:true, sms:sms.smsConfigured() }, integration_status: { google:googleAuth.configured()?'configured':'not_configured', otp: providers.otpConfigured() ? 'configured' : 'not_configured', payments: providers.paymentsConfigured() ? 'configured' : 'not_configured', ai: providers.aiConfigured() ? 'configured' : 'not_configured', image_uploads: 'not_configured', courier: 'internal_status_updates', notifications: sms.smsConfigured()?'in_app_and_sms_configured':'in_app_only' } }));
app.get('/products', async (req, res) => res.json(await searchProducts(req.query)));
app.get('/products/categories', async (req, res) => res.json((await all('SELECT DISTINCT category FROM products WHERE archived=0 AND category IS NOT NULL ORDER BY category')).map(r => r.category)));
app.get('/products/subcategories', async (req, res) => res.json((await all('SELECT DISTINCT subcategory FROM products WHERE archived=0' + (req.query.category ? ' AND category=?' : '') + ' ORDER BY subcategory', req.query.category ? [clean(req.query.category, 200)] : [])).map(r => r.subcategory)));
app.get('/products/vehicles', async (req, res) => { let sql = 'SELECT DISTINCT vehicle FROM products WHERE archived=0 AND vehicle IS NOT NULL AND vehicle NOT IN (\'\',\'Various\')'; const args = []; for (const field of ['category', 'subcategory']) if (req.query[field]) { sql += ` AND ${field}=?`; args.push(clean(req.query[field], 200)); } res.json((await all(sql + ' ORDER BY vehicle', args)).map(r => r.vehicle)); });
app.get('/products/brands', async (req, res) => res.json((await all("SELECT DISTINCT brand FROM products WHERE archived=0 AND brand IS NOT NULL AND brand!='' ORDER BY brand")).map(r => r.brand)));
app.get('/products/top-selling', async (req, res) => {
  // Historical sales cannot be treated as verified payments; show curated catalogue picks.
  res.json((await all('SELECT * FROM products WHERE archived=0 ORDER BY id LIMIT 8')).map(r => ({ ...productRow(r), featured: true })));
});
app.get('/products/:id', async (req, res) => { const row = await get('SELECT * FROM products WHERE id=? AND archived=0', [req.params.id]); if (!row) throw fail(404, 'Product not found.'); res.json(productRow(row)); });

app.post('/auth/admin-login', async (req, res) => {
  if(!adminPasswordConfigured()) throw fail(503,'Administrator ID and password have not been configured.');
  const password=typeof req.body.password==='string'?req.body.password:'';
  const actual=crypto.scryptSync(password.slice(0,512),'aamm-admin-credential',32);
  const expected=crypto.scryptSync(process.env.ADMIN_PASSWORD,'aamm-admin-credential',32);
  if(!crypto.timingSafeEqual(actual,expected)||!identifierMatches(submittedIdentifier(req.body))) throw fail(401,'Invalid administrator ID or password.');
  const principal=adminPrincipal();await createSession(req,res,principal,'admin');await audit({session:{phone:principal}},'login','administrator',principal);res.json({user:adminUser(),isAdmin:true});
});
const otpRequests = new Map();
async function sendLimitedOtp(phone,res) {
  const last = otpRequests.get(phone) || 0;
  if (Date.now() - last < 60000) { res.setHeader('Retry-After', Math.ceil((60000 - Date.now() + last) / 1000)); throw fail(429, 'Please wait 60 seconds before requesting another code.'); }
  otpRequests.set(phone, Date.now());
  if (otpRequests.size > 10000) for (const [key,time] of otpRequests) if (Date.now()-time > 60000) otpRequests.delete(key);
  try { await providers.sendOtp(phone); } catch(error) { otpRequests.delete(phone); throw error; }
}
async function requestOtp(req, res) {
  const phone = phoneNumber(req.body.phone); if (!validPhone(phone)) throw fail(400, 'Enter a valid Indian mobile number.');
  if (!providers.otpConfigured()) throw fail(503, 'Phone sign-in is unavailable until the SMS verification service is configured.', 'otp_not_configured');
  await sendLimitedOtp(phone,res);
  res.json({ status: 'pending', resend_after: 60 });
}
app.post('/auth/admin-otp/request', async(req,res)=>{
  if(!adminOtpConfigured()) throw fail(503,'Administrator SMS verification has not been configured.');
  if(!identifierMatches(submittedIdentifier(req.body))) throw fail(401,'Invalid administrator account.');
  await sendLimitedOtp(adminPhone(),res);res.json({status:'pending',resend_after:60});
});
app.post('/auth/admin-otp/verify', async(req,res)=>{
  if(!adminOtpConfigured()) throw fail(503,'Administrator SMS verification has not been configured.');
  if(!identifierMatches(submittedIdentifier(req.body))) throw fail(401,'Invalid administrator account.');
  const code=clean(req.body.code,10);if(!/^\d{4,8}$/.test(code)) throw fail(400,'Enter a valid verification code.');
  if(!await providers.verifyOtp(adminPhone(),code)) throw fail(401,'The code is invalid or has expired.');
  const principal=adminPrincipal();await createSession(req,res,principal,'admin');await audit({session:{phone:principal}},'otp_login','administrator',principal);res.json({user:adminUser(),isAdmin:true});
});
const googleChallengeCookie='aa_google_challenge';
const googleCookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/auth/google'};
const googleChallengeToken=req=>(req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(googleChallengeCookie+'='))?.slice(googleChallengeCookie.length+1)||'';
app.post('/auth/google/challenge',async(req,res)=>{
  if(!googleAuth.configured())throw fail(503,'Google sign-in is not available yet. Please continue as a guest.');
  const token=crypto.randomBytes(32).toString('hex'),nonce=crypto.randomBytes(32).toString('hex'),previous=googleChallengeToken(req);
  await transaction(async()=>{await run('DELETE FROM google_login_challenges WHERE expires_at<?',[Date.now()]);if(/^[a-f0-9]{64}$/.test(previous))await run('DELETE FROM google_login_challenges WHERE token_hash=?',[hashToken(previous)]);await run('INSERT INTO google_login_challenges(token_hash,nonce,expires_at) VALUES (?,?,?)',[hashToken(token),nonce,Date.now()+300000]);});
  res.cookie(googleChallengeCookie,token,{...googleCookieOptions,maxAge:300000});res.json({nonce,expires_in:300});
});
app.post('/auth/google',async(req,res)=>{
  if(!googleAuth.configured())throw fail(503,'Google sign-in is not available yet. Please continue as a guest.');
  const token=googleChallengeToken(req);res.clearCookie(googleChallengeCookie,googleCookieOptions);
  if(!/^[a-f0-9]{64}$/.test(token))throw fail(401,'Start Google sign-in again to continue.');
  const challenge=await transaction(async()=>{const value=await get('SELECT * FROM google_login_challenges WHERE token_hash=?',[hashToken(token)]);if(value)await run('DELETE FROM google_login_challenges WHERE token_hash=?',[hashToken(token)]);return value;});
  if(!challenge||challenge.expires_at<Date.now())throw fail(401,'Google sign-in expired. Please try again.');
  const identity=await googleAuth.verifyCredential(req.body.credential,challenge.nonce);
  const user=await transaction(async()=>{let account=await get('SELECT * FROM users WHERE google_sub=?',[identity.sub]);if(!account){const inserted=await run('INSERT INTO users(phone,name,email,google_sub,google_email,phone_verified) VALUES (NULL,?,?,?,?,0)',[identity.name,identity.email,identity.sub,identity.email]);account=await get('SELECT * FROM users WHERE id=?',[inserted.lastID]);}else{await run('UPDATE users SET google_email=? WHERE id=?',[identity.email,account.id]);account.google_email=identity.email;}return account;});
  await createSession(req,res,null,'customer',user);res.json({user:publicUser(user),isAdmin:false});
});
app.post('/auth/login', requestOtp);
app.post('/auth/otp/request', requestOtp);
app.post('/auth/otp/verify', async (req, res) => {
  const phone = phoneNumber(req.body.phone); const code = clean(req.body.code, 10);
  if (!validPhone(phone) || !/^\d{4,8}$/.test(code)) throw fail(400, 'Enter a valid phone number and verification code.');
  if (!providers.otpConfigured()) throw fail(503, 'Phone verification is not configured.');
  if (!await providers.verifyOtp(phone, code)) throw fail(401, 'The code is invalid or has expired.');
  await run('INSERT INTO users(phone,phone_verified) VALUES (?,1) ON CONFLICT(phone) DO UPDATE SET phone_verified=1', [phone]);
  await createSession(req, res, phone, 'customer');
  res.json({ user: publicUser(await get('SELECT * FROM users WHERE phone=?', [phone])), isAdmin: false });
});
app.get('/auth/me',customer,async(req,res)=>res.json({user:await currentProfile(req),isAdmin:req.session.role==='admin'}));
app.get('/me',customer,async(req,res)=>res.json(await currentProfile(req)));
app.put('/me',customer,updateProfile);
app.post('/auth/logout',async(req,res)=>{const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('aamm_session='));if(cookie)await run('DELETE FROM sessions WHERE token_hash=?',[hashToken(cookie.slice(13))]);res.clearCookie('aamm_session',{path:'/'});res.json({ok:true});});
app.get('/users/:phone',customer,async(req,res)=>{const phone=phoneNumber(req.params.phone);if(req.session.role!=='admin'&&(!verifiedPhoneSession(req)||phone!==req.customer.phone))throw fail(403,'You can access only your verified phone profile.');const user=await get('SELECT * FROM users WHERE phone=? AND google_sub IS NULL',[phone]);if(!user)throw fail(404,'Profile not found.');res.json(publicUser(user));});
app.put('/users/:phone',customer,async(req,res)=>{const phone=phoneNumber(req.params.phone);if(req.session.role==='admin'){await run('UPDATE users SET name=?,address=?,delivery_pref=?,email=? WHERE phone=? AND google_sub IS NULL',[clean(req.body.name,100),clean(req.body.address,1000),clean(req.body.delivery_pref,50),clean(req.body.email,200),phone]);return res.json({ok:true});}if(!verifiedPhoneSession(req)||phone!==req.customer.phone)throw fail(403,'You can edit only your verified phone profile.');return updateProfile(req,res);});

async function validateCart(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw fail(400, 'Add at least one product, up to 100 products.');
  const quantities = new Map();
  for (const item of items) {
    const id = Number(item.id); const qty = Number(item.qty ?? item.quantity ?? 1);
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(qty) || qty < 1 || qty > 100) throw fail(400, 'Product quantities must be whole numbers between 1 and 100.');
    quantities.set(id, (quantities.get(id) || 0) + qty);
    if (quantities.get(id) > 100) throw fail(400, 'A maximum of 100 units per product is allowed.');
  }
  const verified = []; let totalPaise = 0;
  for (const [id, qty] of quantities) {
    const p = await get('SELECT * FROM products WHERE id=? AND archived=0', [id]);
    if (!p) throw fail(400, 'A product is no longer available in the catalogue.');
    if (!Number.isFinite(p.price) || p.price < 0 || Math.abs(p.price*100-Math.round(p.price*100))>0.000001) throw fail(400, `Please request a quotation for ${p.display_name}.`);
    if (p.stock_quantity !== null && p.stock_quantity < qty) throw fail(409, `Insufficient stock for ${p.display_name}.`);
    verified.push({ id, qty, display_name: p.display_name, name: p.display_name, sku: p.sku, brand: p.brand, price: p.price }); totalPaise += Math.round(p.price * 100) * qty;
  }
  if (!Number.isSafeInteger(totalPaise)) throw fail(400, 'Order total exceeds the supported amount.');
  return { items: verified, total:totalPaise/100 };
}
function orderResponse(order) {
  const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : order.items;
  const message = [`Alagar Automobiles order enquiry ${displayReference(order.reference)}`, `Name: ${order.name}`, `Phone: ${order.phone}`, `Delivery: ${order.delivery}`, `Address: ${order.address || 'Store pickup'}`, '', ...items.map(i => `${i.display_name} | Part: ${i.sku || 'Not listed'} | Brand: ${i.brand || 'Confirm with Alagar Automobiles'} | ${i.qty} × ₹${i.price} = ₹${i.qty * i.price}`), '', `Subtotal: ₹${order.total}`, 'Delivery charges: to be confirmed', `Catalogue subtotal: ₹${order.total}`, 'Please confirm availability, delivery charges and final total. This is an enquiry, not a confirmed order.'].join('\n');
  return { id: order.id, reference: displayReference(order.reference), status: order.status, payment_status: order.payment_status, total: order.total, subtotal: order.total, delivery_charges: null, items, whatsapp_url: `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(message)}` };
}
app.post('/orders', submissionLimit, async (req, res) => { const response = await transaction(async () => {
  const phone = phoneNumber(req.body.phone); const name = clean(req.body.name, 100); const address = clean(req.body.address, 1000); const delivery = clean(req.body.delivery, 100) || 'Store pickup';
  if (!validPhone(phone) || !name) throw fail(400, 'A name and valid Indian mobile number are required.');
  if (!/pickup|collect/i.test(delivery) && !address) throw fail(400, 'Enter your delivery address.');
  const key = clean(req.body.idempotency_key, 100);
  if (key && !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw fail(400, 'Invalid order request identifier.');
  if (key) { const previous = await get('SELECT * FROM orders WHERE idempotency_key=?', [key]); if (previous) { if (previous.phone !== phone || (previous.customer_user_id!=null&&!ownsOrder(req,previous))) throw fail(409, 'This request identifier is already in use.'); return { status: 200, data: orderResponse(previous) }; } }
  const cart = await validateCart(req.body.items); const reference = `AA-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const trackingToken = crypto.randomBytes(32).toString('hex');
  const result = await run('INSERT INTO orders(phone,name,items,total,delivery,address,reference,status,payment_status,idempotency_key,tracking_token_hash,delivery_charges,customer_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [phone, name, JSON.stringify(cart.items), cart.total, delivery, address, reference, 'Enquiry submitted', 'not_requested', key || null, hashToken(trackingToken), /pickup|collect/i.test(delivery)?0:null,req.customer?.id||null]);
  await run('INSERT INTO order_status_history(order_id,status,actor) VALUES (?,?,?)', [result.lastID, 'Enquiry submitted', 'customer enquiry']);
  await notify(phone, 'Order enquiry received', 'Alagar Automobiles will confirm availability and the final total.', reference,{sms:Boolean(req.session&&(req.session.role==='admin'||verifiedPhoneSession(req)&&req.customer.phone===phone)),customer_user_id:req.customer?.id||null});
  return { status: 201, data: { ...orderResponse(await get('SELECT * FROM orders WHERE id=?', [result.lastID])), tracking_token: trackingToken } };
}); res.status(response.status).json(response.data); });
function safeOrder(order){const {tracking_token_hash,customer_user_id,...safe}=order;return {...safe,reference:displayReference(order.reference),items:JSON.parse(order.items||'[]')};}
app.get('/my/orders',customer,async(req,res)=>{const owner=ownerClause(req);res.json((await all(`SELECT * FROM orders WHERE ${owner.sql} ORDER BY id DESC LIMIT 1000`,owner.args)).map(safeOrder));});
app.get('/orders/:phone',customer,async(req,res)=>{const phone=phoneNumber(req.params.phone);if(req.session.role!=='admin'&&(!verifiedPhoneSession(req)||phone!==req.customer.phone))throw fail(403,'Sign in with a verified phone account to access these orders.');const owner=req.session.role==='admin'?{sql:'1=1',args:[]}:ownerClause(req);res.json((await all(`SELECT * FROM orders WHERE phone=? AND ${owner.sql} ORDER BY id DESC LIMIT 1000`,[phone,...owner.args])).map(safeOrder));});
// A guest needs both the reference and the unguessable receipt secret. The
// secret is issued once, stored only as a hash, and never placed in a URL.
async function authorizedGuestOrder(referenceValue,tokenValue) {
  const reference=clean(referenceValue,100);const token=clean(tokenValue,100);
  if(!reference||!/^[a-f0-9]{64}$/.test(token)) throw fail(400,'Enter your order reference and tracking token from your receipt.');
  const order=await findOrderReference(reference);
  const expected=order?.tracking_token_hash&&/^[a-f0-9]{64}$/.test(order.tracking_token_hash)?Buffer.from(order.tracking_token_hash,'hex'):Buffer.alloc(32);
  const actual=Buffer.from(hashToken(token),'hex');
  if(!crypto.timingSafeEqual(actual,expected)||!order?.tracking_token_hash) throw fail(404,'No order matches that reference and tracking token.');
  return order;
}
app.post('/tracking-guest',rateLimit('guest-tracking',30,15*60*1000),async(req,res)=>{
  const order=await authorizedGuestOrder(req.body.reference,req.body.token);
  const items=JSON.parse(order.items||'[]').map(item=>({id:item.id,display_name:item.display_name||item.name,qty:item.qty,price:item.price,sku:item.sku||null,brand:item.brand||null}));
  res.json({id:order.id,reference:displayReference(order.reference),status:order.status,payment_status:order.payment_status,total:order.total,items,ordered_at:order.ordered_at,courier:order.courier,tracking_number:order.tracking_number,estimated_delivery:order.estimated_delivery,tracking_type:'internal',history:await all('SELECT status,created_at FROM order_status_history WHERE order_id=? ORDER BY id',[order.id]),bills:await billing.listForOrder(order.id)});
});
app.post('/billing/guest',rateLimit('guest-billing',30,15*60*1000),async(req,res)=>{
  const order=await authorizedGuestOrder(req.body.reference,req.body.token);
  const kind=req.body.type;if(!['invoice','receipt'].includes(kind)) throw fail(400,'Choose an invoice or payment receipt.');
  const meta=(await billing.listForOrder(order.id)).find(bill=>bill.kind===kind);if(!meta) throw fail(404,kind==='receipt'?'No verified payment receipt has been issued.':'No commercial invoice has been issued yet.');
  const document=await billing.document(meta.id);res.type('html').send(renderBill(document));
});
app.post('/tracking', customer, async (req, res) => { const order = await findOrderReference(req.body.reference); if (!order || !ownsOrder(req,order)) throw fail(404, 'Order not found in your account.'); res.json({ ...orderResponse(order), courier: order.courier, tracking_number: order.tracking_number, estimated_delivery: order.estimated_delivery, tracking_type: 'internal', history: await all('SELECT status,created_at FROM order_status_history WHERE order_id=? ORDER BY id', [order.id]) }); });

async function submitRequest(req, res, table, prefix) {
  const name = clean(req.body.name, 100); const phone = phoneNumber(req.body.phone); const part = clean(req.body.part_name || req.body.part || req.body.partName, 200);
  if (!name || !validPhone(phone) || !part) throw fail(400, 'Your name, valid phone number and spare-part name are required.');
  const reference = `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const columns = ['reference','name','phone','part_name','vehicle','message','customer_user_id']; const values = [reference,name,phone,part,clean(req.body.vehicle, 200),clean(req.body.message || req.body.description, 2000),req.customer?.id||null];
  if (table === 'exchange_requests') { columns.push('condition'); values.push(clean(req.body.condition, 500)); }
  const result = await run(`INSERT INTO ${table}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
  await notify(phone, prefix === 'ENQ' ? 'Spare-part request received' : 'Exchange request received', 'Alagar Automobiles will review your request and contact you.', reference,{sms:Boolean(req.session&&(req.session.role==='admin'||verifiedPhoneSession(req)&&req.customer.phone===phone)),customer_user_id:req.customer?.id||null});
  res.status(201).json({ id: result.lastID, reference, status: 'New' });
}
app.post('/enquiries', submissionLimit, (req, res) => submitRequest(req, res, 'enquiries', 'ENQ'));
app.post('/exchange-requests', submissionLimit, (req, res) => submitRequest(req, res, 'exchange_requests', 'EXC'));
app.get('/my/requests',customer,async(req,res)=>{const owner=ownerClause(req);res.json({enquiries:await all(`SELECT id,reference,part_name,vehicle,status,quotation_amount,created_at,updated_at FROM enquiries WHERE ${owner.sql} ORDER BY id DESC LIMIT 100`,owner.args),exchanges:await all(`SELECT id,reference,part_name,vehicle,condition,status,valuation,created_at,updated_at FROM exchange_requests WHERE ${owner.sql} ORDER BY id DESC LIMIT 100`,owner.args)});});
app.get('/notifications',customer,async(req,res)=>{const owner=ownerClause(req);res.json((await all(`SELECT * FROM notifications WHERE ${owner.sql} ORDER BY id DESC LIMIT 100`,owner.args)).map(notificationRow));});
app.patch('/notifications/:id',customer,async(req,res)=>{const owner=ownerClause(req);await run(`UPDATE notifications SET is_read=1 WHERE id=? AND ${owner.sql}`,[req.params.id,...owner.args]);res.json({ok:true});});

app.post('/assistant', rateLimit('assistant', 30, 15 * 60 * 1000), async (req, res) => {
  const question = clean(req.body.message || req.body.question, 1000); if (!question) throw fail(400, 'Enter a question about spare parts.');
  let products = await searchProducts({ search: question });
  if (!products.length) { const words = normalizeSearch(question).split(' ').filter(w => w.length > 2); const catalogue = await searchProducts(); products = catalogue.map(p => ({ p, score: words.filter(w => normalizeSearch([p.display_name,p.subcategory,p.vehicle,p.category].join(' ')).includes(w)).length })).filter(r => r.score > 0).sort((a,b) => b.score-a.score).slice(0,5).map(r => r.p); }
  products = products.slice(0, 6);
  if (!providers.aiConfigured()) return res.json({ mode: 'catalogue_search', message: products.length ? 'These are matches from the Alagar Automobiles catalogue. Please contact Alagar Automobiles to confirm compatibility and availability.' : 'No matching part was found in the current catalogue. Send a spare-part request and Alagar Automobiles can help. AI responses are not configured.', products });
  res.json({ mode: 'ai', message: await providers.answerCatalogue(question, products, Array.isArray(req.body.history) ? req.body.history.slice(-6) : []), products });
});

// Razorpay checkout is available only for authenticated customers and business-confirmed
// orders with recorded inventory. Browser callbacks alone never confirm a payment.
app.post('/payments/create', customer, async (req, res) => { const payload=await transaction(async () => {
  if (!providers.paymentsConfigured()) throw fail(503, 'Online payments are not configured. Please contact Alagar Automobiles.');
  const order = await findOrderReference(req.body.reference);
  if (!order || !ownsOrder(req,order)) throw fail(404, 'Order not found in your account.');
  if (order.status !== 'Order Confirmed') throw fail(409, 'Alagar Automobiles must confirm the order and final price before payment.');
  if (!/pickup|collect/i.test(order.delivery)) throw fail(409, 'Online payment currently supports store pickup; delivery charges require Alagar Automobiles confirmation.');
  const existing = await get("SELECT * FROM payments WHERE order_id=? AND status IN ('created','captured','captured_review_required') ORDER BY id DESC LIMIT 1", [order.id]);
  if (existing) {
    if (existing.status !== 'created') throw fail(409, 'A payment has already been recorded for this order.');
    return { key_id: process.env.RAZORPAY_KEY_ID, order_id: existing.provider_order_id, amount: existing.amount, currency: 'INR', reference: displayReference(order.reference) };
  }
  const items = JSON.parse(order.items || '[]');
  const cart = await validateCart(items);
  if (cart.total !== order.total || !cart.total) throw fail(409, 'The catalogue price changed. Ask Alagar Automobiles to confirm an updated order.');
  for (const item of items) { const product = await get('SELECT stock_quantity FROM products WHERE id=?', [item.id]); if (product?.stock_quantity == null) throw fail(409, 'Alagar Automobiles must verify inventory before accepting online payment.'); }
  if(order.delivery_charges==null){order.delivery_charges=0;await run('UPDATE orders SET delivery_charges=0 WHERE id=?',[order.id]);}
  await billing.issueInvoice(order);
  const providerOrder = await providers.razorpayCreateOrder({ amount: Math.round(cart.total * 100), receipt: displayReference(order.reference) });
  await run('INSERT INTO payments(order_id,provider_order_id,amount,status) VALUES (?,?,?,?)', [order.id,providerOrder.id,providerOrder.amount,'created']);
  await run("UPDATE orders SET payment_status='pending',payment_order_id=? WHERE id=?", [providerOrder.id,order.id]);
  return { key_id: process.env.RAZORPAY_KEY_ID, order_id: providerOrder.id, amount: providerOrder.amount, currency: providerOrder.currency, reference: displayReference(order.reference) };
}); res.json(payload); });
async function recordCapturedPayment(payment, providerPayment) {
  return transaction(async () => {
    const current = await get('SELECT * FROM payments WHERE id=?', [payment.id]);
    if (['captured','captured_review_required','refund_pending','refunded'].includes(current.status)) return { verified: true, status: current.status };
    if (current.status !== 'created') throw fail(409, 'This payment cannot be captured in its current state.');
    const order = await get('SELECT * FROM orders WHERE id=?', [current.order_id]);
    if (providerPayment.order_id !== current.provider_order_id || providerPayment.amount !== current.amount || providerPayment.currency !== 'INR' || providerPayment.status !== 'captured' || providerPayment.captured !== true) throw fail(409, 'Payment has not been captured for the expected amount.');
    const items = JSON.parse(order.items || '[]');
    let inventoryAvailable = true;
    for (const item of items) { const product = await get('SELECT stock_quantity,archived FROM products WHERE id=?', [item.id]); if (!product || product.archived || product.stock_quantity == null || product.stock_quantity < item.qty) inventoryAvailable = false; }
    await run('UPDATE payments SET provider_payment_id=?,status=? WHERE id=?', [providerPayment.id,inventoryAvailable ? 'captured' : 'captured_review_required',current.id]);
    if(order.delivery_charges==null&&/pickup|collect/i.test(order.delivery)){order.delivery_charges=0;await run('UPDATE orders SET delivery_charges=0 WHERE id=?',[order.id]);}
    await billing.issueReceipt(order,current,providerPayment);
    if (!inventoryAvailable) {
      await run("UPDATE orders SET payment_status='captured_review_required' WHERE id=?", [order.id]);
      await notify(order.phone,'Payment requires review','Your payment was captured, but inventory changed. Alagar Automobiles must resolve fulfillment or arrange a verified refund.',order.reference);
      return { verified: true, status: 'captured_review_required', message: 'Payment captured; Alagar Automobiles must review inventory before confirming fulfillment.' };
    }
    for (const item of items) {
      const product = await get('SELECT stock_quantity FROM products WHERE id=?', [item.id]);
      await run('UPDATE products SET stock_quantity=stock_quantity-? WHERE id=? AND stock_quantity>=?', [item.qty,item.id,item.qty]);
      await run('INSERT INTO stock_movements(product_id,previous_quantity,new_quantity,reason,actor) VALUES (?,?,?,?,?)', [item.id,product.stock_quantity,product.stock_quantity-item.qty,'Verified Razorpay payment','payment provider']);
      await run('INSERT INTO sales(product_id,qty) VALUES (?,?)', [item.id,item.qty]);
    }
    await run("UPDATE orders SET payment_status='captured' WHERE id=?", [order.id]);
    await notify(order.phone,'Payment verified','Razorpay has confirmed that your payment was captured.',order.reference);
    return { verified: true, status: 'captured' };
  });
}
app.post('/payments/verify', customer, async (req,res) => {
  if (!providers.paymentsConfigured()) throw fail(503, 'Online payments are not configured.');
  const providerOrderId = clean(req.body.razorpay_order_id || req.body.order_id,100);
  const providerPaymentId = clean(req.body.razorpay_payment_id || req.body.payment_id,100);
  const payment = await get('SELECT p.*,o.phone,o.customer_user_id FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.provider_order_id=?',[providerOrderId]);
  if (!payment || !ownsOrder(req,payment)) throw fail(404,'Payment not found in your account.');
  if (!providers.verifyPaymentSignature({order_id:providerOrderId,payment_id:providerPaymentId,signature:req.body.razorpay_signature||req.body.signature})) throw fail(400,'Payment signature verification failed.');
  const actual = await providers.razorpayGetPayment(providerPaymentId);
  res.json(await recordCapturedPayment(payment,actual));
});
app.post('/payments/webhook', async (req,res) => {
  if (!providers.paymentsConfigured() || !process.env.RAZORPAY_WEBHOOK_SECRET) throw fail(503,'Payment webhooks are not configured.');
  if (!providers.verifyWebhook(req.rawBody,req.get('x-razorpay-signature'))) throw fail(400,'Webhook signature verification failed.');
  const entity=req.body.payload?.payment?.entity;
  if (req.body.event !== 'payment.captured' || !entity) return res.json({ok:true,ignored:true});
  const payment=await get('SELECT * FROM payments WHERE provider_order_id=?',[entity.order_id]);
  if (!payment) throw fail(404,'Payment order not found.');
  const actual=await providers.razorpayGetPayment(entity.id);
  await recordCapturedPayment(payment,actual); res.json({ok:true});
});

app.get('/my/bills',customer,async(req,res)=>{const owner=ownerClause(req,'o');res.json((await all(`SELECT b.* FROM billing_documents b JOIN orders o ON o.id=b.order_id WHERE ${owner.sql} ORDER BY b.id DESC LIMIT 1000`,owner.args)).map(billing.metadata));});
app.get('/bills/:id/print',customer,async(req,res)=>{const document=await billing.document(req.params.id);const order=await get('SELECT * FROM orders WHERE id=?',[document.order_id]);if(!ownsOrder(req,order))throw fail(404,'Bill not found in your account.');res.type('html').send(renderBill(document));});
app.use('/admin', admin);
app.get('/admin/setup',async(req,res)=>{
  const missing=names=>names.filter(name=>!process.env[name]?.trim());
  const smsMissing=missing(['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN']);if(!process.env.TWILIO_FROM_NUMBER&&!process.env.TWILIO_MESSAGING_SERVICE_SID) smsMissing.push('TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
  res.json({admin:{id_configured:Boolean(adminId()),phone_configured:Boolean(adminPhone()),password_configured:adminPasswordConfigured(),otp_configured:adminOtpConfigured()},services:{google:{configured:googleAuth.configured(),missing:googleAuth.configured()?[]:['GOOGLE_CLIENT_ID']},otp:{configured:providers.otpConfigured(),missing:missing(['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID'])},sms:{configured:sms.smsConfigured(),missing:smsMissing},payments:{configured:providers.paymentsConfigured(),missing:missing(['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET'])},ai:{configured:providers.aiConfigured(),missing:missing(['OPENAI_API_KEY'])}},billing:{enabled:true,invoice_type:'commercial_invoice',tax_invoice:false},storage:{explicit_path_configured:Boolean(process.env.DB_PATH&&path.isAbsolute(process.env.DB_PATH)),production:process.env.NODE_ENV==='production',persistence_verified:false}});
});
app.get('/admin/bills',async(req,res)=>res.json(await billing.list()));
app.post('/admin/orders/:id/invoice',async(req,res)=>{const document=await transaction(async()=>{const order=await get('SELECT * FROM orders WHERE id=?',[req.params.id]);if(!order) throw fail(404,'Order not found.');const bill=await billing.issueInvoice(order);if(bill.created)await audit(req,'invoice_issued','order',order.id,{number:bill.number});return bill;});res.status(document.created?201:200).json(document);});
app.get('/admin/sms',async(req,res)=>res.json(await all('SELECT d.*,n.title,n.reference FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id ORDER BY d.id DESC LIMIT 500')));
app.post('/admin/sms/:id/refresh',async(req,res)=>{const row=await get('SELECT * FROM notification_deliveries WHERE id=?',[req.params.id]);if(!row?.provider_sid) throw fail(409,'This message has no provider reference to refresh.');const result=await sms.getSmsStatus(row.provider_sid);await transaction(async()=>{await run('UPDATE notification_deliveries SET status=?,error_code=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[result.status,result.error_code,row.id]);await run('UPDATE notifications SET delivery_status=? WHERE id=?',[`sms_${result.status}`,row.notification_id]);});res.json({id:row.id,...result});});
app.post('/admin/payments/:id/refund', async (req,res) => {
  if (!providers.paymentsConfigured()) throw fail(503,'Online payments are not configured.');
  const payment=await get('SELECT * FROM payments WHERE id=?',[req.params.id]);
  if (!payment || !['captured','captured_review_required'].includes(payment.status)) throw fail(409,'Only captured payments can be refunded.');
  const refund=await providers.razorpayRefund(payment.provider_payment_id,{amount:payment.amount,receipt:`refund_${payment.id}`});
  await transaction(async()=>{ await run('UPDATE payments SET status=? WHERE id=?',[refund.status==='processed'?'refunded':'refund_pending',payment.id]); await run('UPDATE orders SET payment_status=? WHERE id=?',[refund.status==='processed'?'refunded':'refund_pending',payment.order_id]); await audit(req,'refund_requested','payment',payment.id,{provider_refund_id:refund.id,status:refund.status}); });
  res.json({id:refund.id,status:refund.status});
});
app.get('/admin/overview', async (req, res) => {
  const count = async (table, where = '') => (await get(`SELECT COUNT(*) AS count FROM ${table} ${where}`)).count;
  res.json({ products: await count('products', 'WHERE archived=0'), customers: await count('users'), orders: await count('orders'), verified_revenue: (await get("SELECT COALESCE(SUM(amount),0)/100.0 AS revenue FROM payments WHERE status='captured'")).revenue, pending_orders: await count('orders', "WHERE status NOT IN ('Delivered','Cancelled','Refunded','Returned')"), completed_orders: await count('orders', "WHERE status='Delivered'"), low_stock_products: await count('products', 'WHERE archived=0 AND stock_quantity BETWEEN 1 AND 5'), out_of_stock_products: await count('products', 'WHERE archived=0 AND stock_quantity=0'), pending_enquiries: await count('enquiries', "WHERE status!='Closed'"), pending_exchanges: await count('exchange_requests', "WHERE status NOT IN ('Exchange Completed','Rejected')"), inventory_configured: (await count('products','WHERE stock_quantity IS NOT NULL')) > 0 });
});
app.get('/admin/products', async (req, res) => res.json(await searchProducts()));
app.get('/admin/orders', async (req, res) => res.json((await all('SELECT * FROM orders ORDER BY id DESC LIMIT 1000')).map(r => { const { tracking_token_hash,...safe }=r; return { ...safe, reference:displayReference(safe.reference),items: JSON.parse(r.items || '[]') }; })));
app.get('/admin/enquiries', async (req, res) => res.json(await all('SELECT * FROM enquiries ORDER BY id DESC LIMIT 1000')));
app.get('/admin/exchanges', async (req, res) => res.json(await all('SELECT * FROM exchange_requests ORDER BY id DESC LIMIT 1000')));
app.get('/admin/customers', async (req, res) => res.json((await all('SELECT id,phone,name,email,address,delivery_pref FROM users ORDER BY id DESC LIMIT 1000'))));
app.get('/admin/audit', async (req, res) => res.json(await all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500')));
app.get('/admin/inventory', async (req, res) => res.json({ products: await searchProducts(), movements: await all('SELECT * FROM stock_movements ORDER BY id DESC LIMIT 500') }));
app.get('/admin/notifications', async (req, res) => res.json((await all('SELECT * FROM notifications ORDER BY id DESC LIMIT 500')).map(notificationRow)));
const orderStatuses = ['Enquiry submitted','Order Placed','Order Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered','Payment Pending','Payment Failed','Cancelled','Return Requested','Returned','Refund Initiated','Refunded'];
app.patch('/admin/orders/:id',async(req,res)=>{let invoice=null;await transaction(async()=>{
  const order=await get('SELECT * FROM orders WHERE id=?',[req.params.id]);if(!order) throw fail(404,'Order not found.');
  const status=clean(req.body.status,100);if(!orderStatuses.includes(status)) throw fail(400,'Choose a valid order status.');
  if(/^Refund/.test(status)) throw fail(409,'Refunds must be verified through the payment provider before a refund status can be recorded.');
  let deliveryCharges=order.delivery_charges;
  if(req.body.delivery_charges!==undefined){deliveryCharges=billing.paise(req.body.delivery_charges)/100;const issued=await get("SELECT id FROM billing_documents WHERE order_id=? AND kind='invoice'",[order.id]);if(issued&&deliveryCharges!==order.delivery_charges) throw fail(409,'Delivery charges cannot change after the immutable invoice is issued.');}
  if(deliveryCharges==null&&/pickup|collect/i.test(order.delivery)) deliveryCharges=0;
  let total=order.total;
  if(status==='Order Confirmed'){
    if(deliveryCharges==null) throw fail(409,'Enter the confirmed delivery charges before confirming this order.');
    let items;try{items=JSON.parse(order.items||'[]');}catch{throw fail(409,'Review the stored order items before confirmation.');}
    if(!Array.isArray(items)||!items.length) throw fail(409,'Review the stored order items before confirmation.');
    total=(items.reduce((sum,item)=>{const qty=Number(item.qty??item.quantity);if(!Number.isSafeInteger(qty)||qty<1) throw fail(409,'Review the order quantities.');return sum+billing.paise(item.price)*qty;},0)+billing.paise(deliveryCharges))/100;
  }
  await run('UPDATE orders SET status=?,courier=?,tracking_number=?,estimated_delivery=?,delivery_charges=?,total=? WHERE id=?',[status,req.body.courier===undefined?order.courier:clean(req.body.courier,100),req.body.tracking_number===undefined?order.tracking_number:clean(req.body.tracking_number,200),req.body.estimated_delivery===undefined?order.estimated_delivery:clean(req.body.estimated_delivery,100),deliveryCharges,total,order.id]);
  await run('INSERT INTO order_status_history(order_id,previous_status,status,actor) VALUES (?,?,?,?)',[order.id,order.status,status,req.session.phone]);
  await audit(req,'status_update','order',order.id,{previous_status:order.status,status});await notify(order.phone,'Order status updated',status,order.reference);
  if(status==='Order Confirmed'){invoice=await billing.issueInvoice({...order,status,total,delivery_charges:deliveryCharges});if(invoice.created)await audit(req,'invoice_issued','order',order.id,{number:invoice.number});}
});res.json({ok:true,...(invoice?{invoice}:{})});});
async function updateRequest(req, res, table, statuses, amountKey) {
  await transaction(async () => { const item = await get(`SELECT * FROM ${table} WHERE id=?`, [req.params.id]); if (!item) throw fail(404, 'Request not found.');
  const status = clean(req.body.status, 100); if (!statuses.includes(status)) throw fail(400, 'Choose a valid request status.');
  const amount = req.body[amountKey] ?? req.body.quotation ?? null;
  if (amount !== null && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) throw fail(400, 'Enter a valid amount.');
  await run(`UPDATE ${table} SET status=?,notes=?,${amountKey}=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`, [status,clean(req.body.notes, 2000),amount === null ? item[amountKey] : Number(amount),item.id]);
  await audit(req,'status_update',table,item.id,{ previous_status:item.status,status }); await notify(item.phone,'Request updated',status,item.reference); }); res.json({ ok: true });
}
app.patch('/admin/enquiries/:id', (req,res) => updateRequest(req,res,'enquiries',['New','Reviewed','Quotation Sent','Closed'],'quotation_amount'));
app.patch('/admin/exchanges/:id', (req,res) => updateRequest(req,res,'exchange_requests',['New','Under Review','Inspection Required','Offer Provided','Approved','Exchange Completed','Rejected'],'valuation'));

function productInput(body, existing = {}) {
  const display_name = clean(body.display_name ?? existing.display_name, 200); const category = clean(body.category ?? existing.category, 200);
  if (!display_name || !category) throw fail(400, 'Product name and category are required.');
  const price = body.price === '' || body.price === null ? null : body.price === undefined ? existing.price ?? null : Number(body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0 || (!Number.isSafeInteger(Math.round(price*100)) || Math.abs(price*100-Math.round(price*100))>0.000001))) throw fail(400, 'Enter a valid product price.');
  const stock = body.stock_quantity === '' || body.stock_quantity === null ? null : body.stock_quantity === undefined ? existing.stock_quantity ?? null : Number(body.stock_quantity);
  if (stock !== null && (!Number.isSafeInteger(stock) || stock < 0)) throw fail(400, 'Stock must be a non-negative whole number.');
  return { display_name,name:display_name.toLowerCase(),category,subcategory:clean(body.subcategory ?? existing.subcategory, 200),vehicle:clean(body.vehicle ?? existing.vehicle, 200),price,description:clean(body.description ?? existing.description, 3000),sku:clean(body.sku ?? existing.sku,100)||null,brand:clean(body.brand ?? existing.brand,100)||null,stock_quantity:stock,compatibility_verified:body.compatibility_verified === true || body.compatibility_verified === 1 ? 1 : body.compatibility_verified === undefined ? existing.compatibility_verified || 0 : 0 };
}
app.post('/products', admin, async (req,res) => { const response=await transaction(async () => { const p=productInput(req.body); const keys=Object.keys(p); const result=await run(`INSERT INTO products(${keys.join(',')},updated_at) VALUES (${keys.map(()=>'?').join(',')},CURRENT_TIMESTAMP)`,Object.values(p)); if(p.stock_quantity!==null) await run('INSERT INTO stock_movements(product_id,new_quantity,reason,actor) VALUES (?,?,?,?)',[result.lastID,p.stock_quantity,'Initial product stock',req.session.phone]); await audit(req,'create','product',result.lastID); return {id:result.lastID}; }); res.status(201).json(response); });
app.put('/products/:id', admin, async (req,res) => { await transaction(async () => { const old=await get('SELECT * FROM products WHERE id=? AND archived=0',[req.params.id]); if(!old) throw fail(404,'Product not found.'); const p=productInput(req.body,old); await run(`UPDATE products SET ${Object.keys(p).map(k=>`${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`,[...Object.values(p),old.id]); if(p.stock_quantity!==old.stock_quantity) await run('INSERT INTO stock_movements(product_id,previous_quantity,new_quantity,reason,actor) VALUES (?,?,?,?,?)',[old.id,old.stock_quantity,p.stock_quantity,clean(req.body.stock_reason,500)||'Administrator stock adjustment',req.session.phone]); await audit(req,'update','product',old.id); }); res.json({ok:true}); });
app.delete('/products/:id', admin, async (req,res) => { const result=await run('UPDATE products SET archived=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND archived=0',[req.params.id]); if(!result.changes) throw fail(404,'Product not found.'); await audit(req,'archive','product',req.params.id); res.json({ok:true}); });
app.post('/sales', admin, (req,res) => res.status(409).json({error:'Sales are recorded only from verified captured payments.'}));

// Only explicitly public assets can be downloaded. Never serve the repository root.
const publicFiles = new Set(['about.html','brands.html','contact.html','exchange.html','policies.html','request-part.html','track-order.html','vehicle-finder.html','wishlist.html','index.html','products.html','product.html','cart.html','login.html','dashboard.html','admin.html','style.css','script.js','admin.js','robots.txt','sitemap.xml','favicon.svg','part-location.js','part-location.css']);
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'index.html')));
app.use('/images', express.static(path.join(__dirname,'images'),{dotfiles:'deny',index:false}));
app.get('/:file', (req,res,next) => { if(!publicFiles.has(req.params.file)) return next(); res.sendFile(path.join(__dirname,req.params.file)); });
app.use((req,res) => res.status(404).json({error:'Page or API route not found.'}));
app.use((err,req,res,next) => { const status=Number.isInteger(err.status)&&err.status>=400&&err.status<600?err.status:500; if(status>=500&&status!==503) console.error('Alagar Automobiles request failed:',err.code||err.name); res.status(status).json({error:status===500?'The request could not be completed. Please try again.':err.message,...(err.code&&typeof err.code==='string'&&!err.code.startsWith('SQLITE')?{code:err.code}:{})}); });

initialize().then(() => { const port=Number(process.env.PORT)||3000; app.listen(port,'0.0.0.0',()=>console.log(`Alagar Automobiles server ready on port ${port}`));const timer=setInterval(()=>dispatchSmsOutbox().catch(error=>console.error('SMS outbox failed:',error.code||error.name)),2000);timer.unref(); }).catch(err=>{console.error('Alagar Automobiles startup failed:',err.message);db.close();process.exitCode=1;});
