'use strict';

// All billing values come from an immutable server-created snapshot. This
// module only renders that snapshot; it never invents taxes or paid states.
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function money(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError('Billing amounts must be finite non-negative numbers.');
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
}

function renderBill(document) {
  if (!document || !['invoice', 'receipt'].includes(document.kind) || !document.number || !document.snapshot) {
    throw new TypeError('A valid immutable billing document is required.');
  }
  const visibleReference=value=>String(value??'').replace(/^AAMM-/,'AA-');
  const data = document.snapshot;
  const business = data.business || {};
  const order = data.order || {};
  const payment = data.payment || null;
  if (document.kind === 'receipt' && payment?.status !== 'captured') {
    throw new TypeError('A payment receipt requires a verified captured payment.');
  }
  if (data.currency && data.currency !== 'INR') throw new TypeError('This billing template supports INR only.');
  if (!Array.isArray(data.items) || !data.items.length) throw new TypeError('Billing items are required.');
  const titleKey = document.kind === 'receipt' ? 'receiptTitle' : 'invoiceTitle';
  const title = document.kind === 'receipt' ? 'Payment receipt' : 'Commercial invoice';
  const label = (key,text) => `<span data-i18n="${escapeHtml(key)}">${escapeHtml(text)}</span>`;
  const issuedValue = typeof document.created_at === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(document.created_at)
    ? document.created_at.replace(' ', 'T') + 'Z'
    : document.created_at;
  const issued = issuedValue ? new Date(issuedValue) : null;
  const issuedText = issued && Number.isFinite(issued.getTime())
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(issued)
    : String(document.created_at || '');
  const infoLine = (key,text,value) => value === null || value === undefined || value === '' ? '' : `<div class="detail"><dt>${label(key,text)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const rows = data.items.map((item, index) => {
    if (!Number.isSafeInteger(item.qty) || item.qty < 1) throw new TypeError('Billing quantities must be positive whole numbers.');
    const lineTotal = item.line_total === undefined ? item.price * item.qty : item.line_total;
    return `<tr><td class="index">${index + 1}</td><td><strong>${escapeHtml(item.display_name || item.name)}</strong>${item.sku ? `<div class="muted">${label('partNumber','Part no.')} ${escapeHtml(item.sku)}</div>` : ''}${item.brand ? `<div class="muted">${escapeHtml(item.brand)}</div>` : ''}</td><td class="numeric">${escapeHtml(item.qty)}</td><td class="numeric">${escapeHtml(money(item.price))}</td><td class="numeric">${escapeHtml(money(lineTotal))}</td></tr>`;
  }).join('');
  const subtotal = money(data.subtotal);
  const deliveryCharges = money(data.delivery_charges ?? 0);
  const total = money(data.total);
  const paymentState = document.kind === 'receipt' ? 'Payment captured and verified' : 'Invoice issued. Payment status is recorded separately.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} ${escapeHtml(document.number)} — Alagar Automobiles</title>
<style>
:root{color-scheme:light;font-family:Arial,Helvetica,sans-serif;color:#171717;background:#ececec}*{box-sizing:border-box}body{margin:0;padding:32px 18px;font-size:14px;line-height:1.5}.toolbar{flex-wrap:wrap;max-width:900px;margin:0 auto 18px;display:flex;justify-content:space-between;gap:18px;align-items:center}.toolbar p{margin:0;color:#555}.toolbar-controls,.language-controls{display:flex;align-items:center;gap:8px}.toolbar-controls{flex-wrap:wrap;justify-content:flex-end;max-width:100%}.toolbar button{min-width:44px;min-height:44px;border:1px solid #171717;border-radius:6px;padding:10px 18px;background:#171717;color:#fff;font:inherit;cursor:pointer}.language-controls button{background:#fff;color:#171717}.language-controls button[aria-pressed="true"]{background:#171717;color:#fff}.brand-logo{width:72px;height:72px;object-fit:contain;filter:invert(1);display:block;margin-bottom:8px}.toolbar button:focus-visible{outline:3px solid #777;outline-offset:3px}.sheet{max-width:900px;margin:auto;padding:48px;background:#fff;border:1px solid #d0d0d0;box-shadow:0 8px 26px #0000000a}header{display:flex;justify-content:space-between;gap:30px;padding-bottom:28px;border-bottom:2px solid #171717}.brand{font-size:24px;font-weight:700;letter-spacing:-.6px;margin:0 0 10px}.muted{color:#666;font-size:12px;line-height:1.5}.document-heading{text-align:right}h1{margin:0 0 8px;font-size:25px;line-height:1.2;font-weight:700}.number{font-weight:700;font-size:15px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:35px;padding:28px 0}.label{margin:0 0 10px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#666}.customer-name{font-size:16px;font-weight:700;margin:0 0 4px}.address{white-space:pre-line}.details{margin:0}.detail{display:grid;grid-template-columns:110px 1fr;gap:12px;margin-bottom:5px}.detail dt{color:#666}.detail dd{margin:0;overflow-wrap:anywhere}.bill-items{overflow-x:auto}table{width:100%;border-collapse:collapse;margin:10px 0 0}thead{border-top:1px solid #171717;border-bottom:1px solid #171717}th,td{text-align:left;padding:12px 10px;vertical-align:top}th{font-size:11px;text-transform:uppercase;letter-spacing:.6px}td{border-bottom:1px solid #dedede}td strong{font-size:13px;font-weight:600}.numeric{text-align:right;white-space:nowrap}.index{width:28px;color:#666}.summary{width:min(100%,360px);margin:22px 0 26px auto}.summary div{display:flex;justify-content:space-between;gap:18px;padding:7px 10px}.summary .grand-total{border-top:2px solid #171717;margin-top:8px;padding-top:12px;font-size:18px;font-weight:700}.status{border:1px solid #d2d2d2;background:#fafafa;padding:15px 18px;margin:25px 0}.status strong{display:block;margin-bottom:4px}.notes{margin-top:28px;border-top:1px solid #dedede;padding-top:18px;color:#555;font-size:12px}.notes p{margin:4px 0}footer{margin-top:34px;font-size:11px;color:#777;text-align:center}@media(max-width:620px){body{padding:18px 8px}.sheet{padding:24px 16px}header{flex-direction:column;gap:20px}.document-heading{text-align:left}.parties{grid-template-columns:1fr;gap:22px}.toolbar p{font-size:12px}th,td{padding:10px 5px;font-size:12px}td strong{font-size:12px}.numeric{font-size:11px}.brand{font-size:22px}}@media print{@page{size:A4;margin:16mm}body{padding:0;background:#fff}.toolbar{display:none}.bill-items{overflow:visible}.sheet{padding:0;border:0;box-shadow:none;max-width:none}header,.parties,.summary,.status,.notes{break-inside:avoid}tr{break-inside:avoid}thead{display:table-header-group}a{color:inherit;text-decoration:none}}
</style>
</head>
<body>
<div class="toolbar"><p data-i18n="privateNote">Private billing document · Save or print for your records.</p><div class="toolbar-controls"><div class="language-controls" role="group" aria-label="Document language" data-i18n-aria-label="languageLabel"><button type="button" data-language="en" lang="en" aria-pressed="true">English</button><button type="button" data-language="ta" lang="ta" aria-pressed="false">தமிழ்</button></div><button type="button" onclick="window.print()" data-i18n="print">Print / Save PDF</button></div></div>
<main class="sheet">
<header><div><img class="brand-logo" src="/images/logo.jpeg" alt="Alagar Automobiles" width="72" height="72"><p class="brand">Alagar Automobiles</p>${business.address ? `<div class="address muted">${escapeHtml(business.address)}</div>` : ''}${business.phone ? `<div class="muted">${label('phone','Phone:')} ${escapeHtml(business.phone)}</div>` : ''}${business.gstin ? `<div class="muted">GSTIN: ${escapeHtml(business.gstin)}</div>` : ''}</div><div class="document-heading"><h1 data-i18n="${titleKey}">${escapeHtml(title)}</h1><div class="number">${escapeHtml(document.number)}</div><div class="muted">${label('issued','Issued')} ${escapeHtml(issuedText)}</div></div></header>
<section class="parties" aria-label="Billing and order information" data-i18n-aria-label="billingInfo"><div><p class="label" data-i18n="billTo">Bill to</p>${order.name ? `<p class="customer-name">${escapeHtml(order.name)}</p>` : ''}${order.phone ? `<div>${escapeHtml(order.phone)}</div>` : ''}${order.address ? `<div class="address">${escapeHtml(order.address)}</div>` : ''}</div><div><p class="label" data-i18n="orderDetails">Order details</p><dl class="details">${infoLine('orderReference','Order reference',visibleReference(order.reference || order.id))}${infoLine('deliveryOption','Delivery option',order.delivery)}${document.kind === 'receipt' ? infoLine('paymentReference','Payment reference',payment.provider_payment_id) : ''}</dl></div></section>
<div class="bill-items" tabindex="0" role="region" aria-label="Itemized bill" data-i18n-aria-label="itemizedBill"><table aria-label="Itemized bill" data-i18n-aria-label="itemizedBill"><thead><tr><th scope="col">#</th><th scope="col" data-i18n="description">Description</th><th scope="col" class="numeric" data-i18n="quantity">Qty</th><th scope="col" class="numeric" data-i18n="unitPrice">Unit price</th><th scope="col" class="numeric" data-i18n="amount">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="summary"><div><span data-i18n="subtotal">Subtotal</span><span>${escapeHtml(subtotal)}</span></div><div><span data-i18n="deliveryCharges">Delivery charges</span><span>${escapeHtml(deliveryCharges)}</span></div><div class="grand-total"><span data-i18n="${document.kind === 'receipt' ? 'amountReceived' : 'invoiceTotal'}">${document.kind === 'receipt' ? 'Amount received' : 'Invoice total'}</span><span>${escapeHtml(total)}</span></div></div>
<section class="status" aria-label="Payment statement" data-i18n-aria-label="paymentStatement"><strong data-i18n="${document.kind === 'receipt' ? 'capturedState' : 'invoiceState'}">${escapeHtml(paymentState)}</strong>${document.kind === 'receipt' ? '<span data-i18n="receiptStatement">This receipt records the captured payment verified by the payment provider.</span>' : '<span data-i18n="invoiceStatement">This commercial invoice does not itself confirm receipt of payment.</span>'}</section>
<section class="notes" aria-label="Document notes" data-i18n-aria-label="documentNotes"><p><strong data-i18n="notGstInvoice">Not a GST tax invoice.</strong> <span data-i18n="gstStatement">No GST amount or tax credit is represented by this document.</span></p><p data-i18n="snapshotStatement">This document preserves the order details and amounts recorded when it was issued.</p>${document.kind === 'receipt' ? '<p data-i18n="refundStatement">A later refund or adjustment is recorded separately and does not change this original receipt.</p>' : ''}</section>
<footer>Alagar Automobiles · ${label(titleKey,title)} ${escapeHtml(document.number)}</footer>
</main>
<script>
(function () {
  'use strict';
  const dictionary = {
    en: {
      privateNote:'Private billing document · Save or print for your records.',print:'Print / Save PDF',languageLabel:'Document language',
      invoiceTitle:'Commercial invoice',receiptTitle:'Payment receipt',phone:'Phone:',issued:'Issued',billingInfo:'Billing and order information',
      billTo:'Bill to',orderDetails:'Order details',orderReference:'Order reference',deliveryOption:'Delivery option',paymentReference:'Payment reference',
      partNumber:'Part no.',itemizedBill:'Itemized bill',description:'Description',quantity:'Qty',unitPrice:'Unit price',amount:'Amount',
      subtotal:'Subtotal',deliveryCharges:'Delivery charges',amountReceived:'Amount received',invoiceTotal:'Invoice total',paymentStatement:'Payment statement',
      capturedState:'Payment captured and verified',invoiceState:'Invoice issued. Payment status is recorded separately.',
      receiptStatement:'This receipt records the captured payment verified by the payment provider.',invoiceStatement:'This commercial invoice does not itself confirm receipt of payment.',
      documentNotes:'Document notes',notGstInvoice:'Not a GST tax invoice.',gstStatement:'No GST amount or tax credit is represented by this document.',
      snapshotStatement:'This document preserves the order details and amounts recorded when it was issued.',refundStatement:'A later refund or adjustment is recorded separately and does not change this original receipt.'
    },
    ta: {
      privateNote:'தனிப்பட்ட பில் ஆவணம் · உங்கள் பதிவுகளுக்காகச் சேமிக்கவும் அல்லது அச்சிடவும்.',print:'அச்சிடு / PDF சேமி',languageLabel:'ஆவண மொழி',
      invoiceTitle:'வணிக பில்',receiptTitle:'பணம் பெற்ற ரசீது',phone:'தொலைபேசி:',issued:'வழங்கிய தேதி',billingInfo:'பில் மற்றும் ஆர்டர் விவரங்கள்',
      billTo:'பில் பெறுபவர்',orderDetails:'ஆர்டர் விவரங்கள்',orderReference:'ஆர்டர் குறிப்பு',deliveryOption:'விநியோக முறை',paymentReference:'கட்டணக் குறிப்பு',
      partNumber:'பாக எண்:',itemizedBill:'பொருள் வாரியான பில்',description:'விவரம்',quantity:'எண்ணிக்கை',unitPrice:'ஒன்றின் விலை',amount:'தொகை',
      subtotal:'உபமொத்தம்',deliveryCharges:'விநியோகக் கட்டணம்',amountReceived:'பெற்ற தொகை',invoiceTotal:'பில் மொத்தம்',paymentStatement:'கட்டண விவரம்',
      capturedState:'பணம் பெறப்பட்டு சரிபார்க்கப்பட்டது',invoiceState:'பில் வழங்கப்பட்டது. கட்டண நிலை தனியாகப் பதிவு செய்யப்படுகிறது.',
      receiptStatement:'கட்டணச் சேவை உறுதிப்படுத்திய பெறப்பட்ட பணத்தை இந்த ரசீது பதிவு செய்கிறது.',invoiceStatement:'இந்த வணிக பில் மட்டும் பணம் பெறப்பட்டதை உறுதிப்படுத்தாது.',
      documentNotes:'ஆவணக் குறிப்புகள்',notGstInvoice:'இது ஜிஎஸ்டி வரி பில் அல்ல.',gstStatement:'இந்த ஆவணத்தில் ஜிஎஸ்டி தொகையோ உள்ளீட்டு வரிச் சலுகையோ குறிப்பிடப்படவில்லை.',
      snapshotStatement:'வழங்கப்பட்டபோது பதிவு செய்யப்பட்ட ஆர்டர் விவரங்களையும் தொகைகளையும் இந்த ஆவணம் பாதுகாக்கிறது.',refundStatement:'பின்னர் செய்யப்படும் பணத்திருப்பமோ மாற்றமோ தனியாகப் பதிவு செய்யப்படும்; இந்த அசல் ரசீது மாற்றப்படாது.'
    }
  };
  function applyLanguage(value) {
    const language = value === 'ta' ? 'ta' : 'en';
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      const translation = dictionary[language][node.dataset.i18n];
      if (translation) node.textContent = translation;
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
      const translation = dictionary[language][node.dataset.i18nAriaLabel];
      if (translation) node.setAttribute('aria-label',translation);
    });
    document.querySelectorAll('[data-language]').forEach(function (button) {
      button.setAttribute('aria-pressed',String(button.dataset.language === language));
    });
    const heading = document.querySelector('h1');
    const number = document.querySelector('.number');
    if (heading && number) document.title = heading.textContent + ' ' + number.textContent + ' — Alagar Automobiles';
  }
  document.querySelectorAll('[data-language]').forEach(function (button) {
    button.addEventListener('click',function () {
      const language = button.dataset.language === 'ta' ? 'ta' : 'en';
      applyLanguage(language);
      try { localStorage.setItem('aamm_language',language); } catch (_) {}
    });
  });
  let language = 'en';
  try { language = localStorage.getItem('aamm_language') || 'en'; } catch (_) {}
  applyLanguage(language);
})();
</script>
</body>
</html>`;
}

module.exports = { renderBill };
