'use strict';

const QRCode = require('qrcode');

// A phone number is not a payment address. Only an explicitly configured VPA
// enables checkout; the receiving bank remains responsible for resolving it.
function payeeId() {
  const value = String(process.env.UPI_ID || '').trim();
  return /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(value) ? value : '';
}
function payeeName() { return String(process.env.UPI_PAYEE_NAME || 'Alagar Automobiles').trim().slice(0,100) || 'Alagar Automobiles'; }
function configured() { return Boolean(payeeId()); }
function configuration() { return { configured:configured(),payee_name:payeeName(),contact_phone:'9344898473',confirmation:'owner_bank_check' }; }
async function intent({ amount,reference,upiId=payeeId(),name=payeeName() }) {
  if (!upiId || !Number.isSafeInteger(amount) || amount <= 0) throw new TypeError('A configured UPI address and positive paise amount are required.');
  const values = {pa:upiId,pn:name,am:(amount/100).toFixed(2),cu:'INR',tr:reference,tn:`Alagar Automobiles ${reference}`};
  const upi_uri = 'upi://pay?' + Object.entries(values).map(([key,value])=>`${key}=${encodeURIComponent(value)}`).join('&');
  return { upi_id:upiId,payee_name:name,upi_uri,qr_data_url:await QRCode.toDataURL(upi_uri,{errorCorrectionLevel:'M',margin:2,width:280}) };
}
module.exports = { configured,configuration,payeeId,payeeName,intent };
