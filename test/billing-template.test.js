'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderBill } = require('../lib/billing');

function invoice() {
  return {
    number: 'AA-INV-000001', kind: 'invoice', created_at: '2026-11-13T10:30:00Z',
    snapshot: {
      business: { name: 'Alagar Automobiles' },
      order: { reference: 'AA-ORDER-TEST', name: '<script>alert(1)</script>', phone: '9990000001', address: 'Somewhere & Sons', delivery: 'Store pickup' },
      items: [{ display_name: 'Stator <b>test</b>', sku: 'SKU"123', brand: null, qty: 2, price: 100, line_total: 200 }],
      subtotal: 200, delivery_charges: 0, total: 200, currency: 'INR', payment: null
    }
  };
}

test('commercial invoice renders truthful print layout and escapes all supplied details', () => {
  const html = renderBill(invoice());
  assert.match(html, /Commercial invoice/);
  assert.match(html, /Not a GST tax invoice/);
  assert.match(html, /does not itself confirm receipt of payment/);
  assert.match(html, /@media print/);
  assert.match(html, /Print \/ Save PDF/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /Stator &lt;b&gt;test&lt;\/b&gt;/);
  assert.match(html, /SKU&quot;123/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>|AAMM|GSTIN:/);
});

test('receipt rejects unverified payment and renders only a captured provider record', () => {
  const doc = invoice();
  doc.kind = 'receipt';
  assert.throws(() => renderBill(doc), /verified captured payment/);
  doc.snapshot.payment = { status: 'pending', provider_payment_id: 'pay_example' };
  assert.throws(() => renderBill(doc), /verified captured payment/);
  doc.snapshot.payment.status = 'captured';
  const html = renderBill(doc);
  assert.match(html, /Payment receipt/);
  assert.match(html, /Payment captured and verified/);
  assert.match(html, /pay_example/);
  assert.match(html, /Amount received/);
});

test('renderer refuses invalid kinds, currencies, quantities and nonfinite money', () => {
  assert.throws(() => renderBill(null), /valid immutable/);
  const doc = invoice();
  doc.snapshot.items[0].qty = -1;
  assert.throws(() => renderBill(doc), /positive whole/);
  doc.snapshot.items[0].qty = 1;
  doc.snapshot.total = NaN;
  assert.throws(() => renderBill(doc), /finite non-negative/);
  doc.snapshot.total = 200;
  doc.snapshot.currency = 'USD';
  assert.throws(() => renderBill(doc), /INR only/);
});


test('invoice language controls use saved English/Tamil preference without changing immutable data', () => {
  const source=invoice();
  source.snapshot.order.reference='AAMM-12345';
  const before=JSON.stringify(source);
  const html=renderBill(source);
  assert.equal(JSON.stringify(source),before,'Rendering must not alter the saved snapshot');
  assert.match(html,/min-width:44px;min-height:44px/);
  assert.match(html,/role="group" aria-label="Document language"/);
  assert.match(html,/src="\/images\/logo\.jpeg" alt="Alagar Automobiles"/);
  assert.match(html,/@media print[^<]*\.toolbar\{display:none\}/);
  assert.match(html,/AA-12345/);
  assert.doesNotMatch(html,/AAMM-12345/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotMatch(script, /Somewhere|SKU&quot;123|alert\(1\)/, 'No customer data is interpolated into executable code');
  function element(dataset,textContent='') {
    return {dataset,textContent,attributes:{},listeners:{},setAttribute(name,value){this.attributes[name]=value;},addEventListener(name,callback){this.listeners[name]=callback;}};
  }
  const heading=element({i18n:'invoiceTitle'},'Commercial invoice');
  const print=element({i18n:'print'},'Print / Save PDF');
  const legal=element({i18n:'notGstInvoice'},'Not a GST tax invoice.');
  const number=element({},source.number);
  const customer=element({},source.snapshot.order.name);
  const product=element({},source.snapshot.items[0].display_name);
  const amount=element({},'₹200.00');
  const group=element({i18nAriaLabel:'languageLabel'});
  const en=element({language:'en'});
  const ta=element({language:'ta'});
  const document={documentElement:{lang:'en'},title:'',querySelectorAll(selector){
    if(selector==='[data-i18n]') return [heading,print,legal];
    if(selector==='[data-i18n-aria-label]') return [group];
    if(selector==='[data-language]') return [en,ta];
    throw Error('Unexpected selector '+selector);
  },querySelector(selector){return selector==='h1'?heading:selector==='.number'?number:null;}};
  const storage={aamm_language:'ta'};
  const localStorage={getItem(key){return storage[key];},setItem(key,value){storage[key]=value;}};
  vm.runInNewContext(script,{document,localStorage});
  assert.equal(document.documentElement.lang,'ta');
  assert.equal(heading.textContent,'வணிக பில்');
  assert.equal(legal.textContent,'இது ஜிஎஸ்டி வரி பில் அல்ல.');
  assert.equal(ta.attributes['aria-pressed'],'true');
  assert.match(document.title,/Alagar Automobiles$/);
  en.listeners.click();
  assert.equal(storage.aamm_language,'en');
  assert.equal(document.documentElement.lang,'en');
  assert.equal(heading.textContent,'Commercial invoice');
  assert.equal(en.attributes['aria-pressed'],'true');
  assert.equal(customer.textContent,source.snapshot.order.name);
  assert.equal(product.textContent,source.snapshot.items[0].display_name);
  assert.equal(amount.textContent,'₹200.00');
  const blockedStorage={getItem(){throw Error('Blocked');},setItem(){throw Error('Blocked');}};
  assert.doesNotThrow(()=>vm.runInNewContext(script,{document,localStorage:blockedStorage}));
  assert.doesNotThrow(()=>ta.listeners.click());
  assert.equal(document.documentElement.lang,'ta');
});
