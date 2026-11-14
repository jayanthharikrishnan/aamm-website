'use strict';

// Billing documents snapshot a reviewed order. They never read a later product
// price or reinterpret an old order as a verified payment.
module.exports = function createBillingStore({ run, get, all, fail, notify, business }) {
  const displayReference = value => String(value || '').replace(/^AAMM-/, 'AA-');
  const paise = value => {
    if(value===null||value===undefined||value==='') throw fail(409,'Confirm the amount before creating a bill.');
    const number = Number(value);
    const rounded = Math.round(number * 100);
    if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(rounded) || Math.abs(number * 100 - rounded) > 0.000001) throw fail(409, 'Review the order amounts before creating a bill.');
    return rounded;
  };
  async function initialize() {
    await run(`CREATE TABLE IF NOT EXISTS billing_counters (year INTEGER NOT NULL,kind TEXT NOT NULL,last_number INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(year,kind))`);
    await run(`CREATE TABLE IF NOT EXISTS billing_documents (id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('invoice','receipt')),order_id INTEGER NOT NULL,phone TEXT NOT NULL,order_reference TEXT,snapshot TEXT NOT NULL,total_paise INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'INR',payment_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(order_id,kind))`);
    await run(`CREATE TRIGGER IF NOT EXISTS billing_documents_no_update BEFORE UPDATE ON billing_documents BEGIN SELECT RAISE(ABORT,'Billing documents are immutable'); END`);
    await run(`CREATE TRIGGER IF NOT EXISTS billing_documents_no_delete BEFORE DELETE ON billing_documents BEGIN SELECT RAISE(ABORT,'Billing documents are immutable'); END`);
    await run('CREATE INDEX IF NOT EXISTS billing_documents_phone ON billing_documents(phone)');
  }
  function metadata(row) {
    return { id:row.id,number:row.number,kind:row.kind,order_id:row.order_id,order_reference:displayReference(row.order_reference),total:row.total_paise/100,currency:row.currency,created_at:row.created_at,print_url:`/bills/${row.id}/print` };
  }
  async function nextNumber(kind) {
    const year = Number(new Intl.DateTimeFormat('en-US',{year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date()));
    await run('INSERT OR IGNORE INTO billing_counters(year,kind,last_number) VALUES (?,?,0)',[year,kind]);
    await run('UPDATE billing_counters SET last_number=last_number+1 WHERE year=? AND kind=?',[year,kind]);
    const row=await get('SELECT last_number FROM billing_counters WHERE year=? AND kind=?',[year,kind]);
    return `AA-${kind==='invoice'?'INV':'RCPT'}-${year}-${String(row.last_number).padStart(6,'0')}`;
  }
  function orderSnapshot(order,payment) {
    let raw; try { raw=JSON.parse(order.items || '[]'); } catch { throw fail(409,'Review the stored order items before billing.'); }
    if(!Array.isArray(raw)||!raw.length) throw fail(409,'Review the stored order items before billing.');
    let subtotal=0;
    const items=raw.map(item=>{
      const qty=Number(item.qty ?? item.quantity); const price=paise(item.price);
      if(!Number.isSafeInteger(qty)||qty<1||!String(item.display_name||item.name||'').trim()) throw fail(409,'Review the stored product names and quantities before billing.');
      const line=price*qty; if(!Number.isSafeInteger(line)) throw fail(409,'The order amount is too large.'); subtotal+=line;
      return {display_name:String(item.display_name||item.name).slice(0,200),sku:item.sku||null,brand:item.brand||null,qty,price:price/100,line_total:line/100};
    });
    if(order.delivery_charges==null) throw fail(409,'Confirm delivery charges before issuing a commercial invoice.');
    const delivery=paise(order.delivery_charges); const total=subtotal+delivery;
    if(!Number.isSafeInteger(total)||paise(order.total)!==total) throw fail(409,'The order total does not match its reviewed items and delivery charges.');
    const seller={name:'Alagar Automobiles',phone:business.whatsapp};
    if(process.env.BILLING_BUSINESS_ADDRESS?.trim()) seller.address=process.env.BILLING_BUSINESS_ADDRESS.trim().slice(0,1000);
    return {business:seller,order:{id:order.id,reference:displayReference(order.reference||`Order ${order.id}`),name:order.name||'',phone:order.phone,address:order.address||'',delivery:order.delivery||''},items,subtotal:subtotal/100,delivery_charges:delivery/100,total:total/100,currency:'INR',payment:payment||null};
  }
  async function save(kind,order,snapshot,paymentId) {
    const number=await nextNumber(kind);
    const result=await run('INSERT INTO billing_documents(number,kind,order_id,phone,order_reference,snapshot,total_paise,payment_id) VALUES (?,?,?,?,?,?,?,?)',[number,kind,order.id,order.phone,order.reference,JSON.stringify(snapshot),paise(snapshot.total),paymentId||null]);
    const row=await get('SELECT * FROM billing_documents WHERE id=?',[result.lastID]);
    await notify(order.phone,kind==='invoice'?'Commercial invoice available':'Payment receipt available',`${number} is available in your signed-in account.`,order.reference);
    return {...metadata(row),created:true};
  }
  async function issueInvoice(order) {
    const existing=await get("SELECT * FROM billing_documents WHERE order_id=? AND kind='invoice'",[order.id]);
    if(existing) return {...metadata(existing),created:false};
    if(!['Order Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered'].includes(order.status)) throw fail(409,'Confirm and review the order before creating a commercial invoice.');
    return save('invoice',order,orderSnapshot(order,null));
  }
  async function issueReceipt(order,payment,providerPayment) {
    const existing=await get("SELECT * FROM billing_documents WHERE order_id=? AND kind='receipt'",[order.id]);
    if(existing) return {...metadata(existing),created:false};
    if(!providerPayment||providerPayment.status!=='captured'||providerPayment.captured!==true||providerPayment.order_id!==payment.provider_order_id||providerPayment.amount!==payment.amount||providerPayment.currency!=='INR') throw fail(409,'A receipt requires a provider-verified captured payment.');
    const invoice=await get("SELECT * FROM billing_documents WHERE order_id=? AND kind='invoice'",[order.id]);
    // Receipt generation reuses the immutable reviewed invoice snapshot.
    const snapshot=invoice?JSON.parse(invoice.snapshot):orderSnapshot(order,null);
    if(paise(snapshot.total)!==payment.amount) throw fail(409,'The verified payment does not match the invoice total.');
    snapshot.payment={status:'captured',provider_payment_id:providerPayment.id,verified_at:new Date().toISOString()};
    return save('receipt',order,snapshot,payment.id);
  }
  async function list(phone) { return (await all('SELECT * FROM billing_documents'+(phone?' WHERE phone=?':'')+' ORDER BY id DESC LIMIT 1000',phone?[phone]:[])).map(metadata); }
  async function listForOrder(orderId) { return (await all('SELECT * FROM billing_documents WHERE order_id=? ORDER BY id DESC',[orderId])).map(metadata); }
  async function document(id) { const row=await get('SELECT * FROM billing_documents WHERE id=?',[id]); if(!row) throw fail(404,'Bill not found.'); return {...metadata(row),phone:row.phone,snapshot:JSON.parse(row.snapshot)}; }
  return {initialize,issueInvoice,issueReceipt,list,listForOrder,document,paise,metadata};
};
