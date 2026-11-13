'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const integrations = require('../lib/integrations');

async function withEnvironment(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  try { return await fn(); }
  finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const missing = {
  TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '', TWILIO_VERIFY_SERVICE_SID: '',
  RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', OPENAI_API_KEY: ''
};

test('provider helpers fail closed when external services are not configured', async () => {
  await withEnvironment(missing, async () => {
    assert.equal(integrations.otpConfigured(), false);
    assert.equal(integrations.paymentsConfigured(), false);
    assert.equal(integrations.aiConfigured(), false);
    for (const operation of [
      () => integrations.sendOtp('9990000002'),
      () => integrations.verifyOtp('9990000002', '123456'),
      () => integrations.razorpayCreateOrder({ amount: 100, receipt: 'test-order' }),
      () => integrations.answerCatalogue('Find a stator', [])
    ]) {
      await assert.rejects(operation, error => error.status === 503 && error.code === 'provider_unavailable');
    }
    assert.equal(integrations.verifyPaymentSignature({ order_id: 'order_123', payment_id: 'pay_123', signature: '0'.repeat(64) }), false);
  });
});

test('Indian phone normalization rejects invalid recipients before sending', () => {
  assert.equal(integrations.normalizePhone('9990000002'), '+919990000002');
  assert.equal(integrations.normalizePhone('+91 99900 00002'), '+919990000002');
  for (const number of ['', '1234', '1990000002', '+449990000002', '<script>']) {
    assert.throws(() => integrations.normalizePhone(number), error => error.status === 400);
  }
});

test('payment signatures bind payment IDs to the exact server-created order', async () => {
  await withEnvironment({ RAZORPAY_KEY_ID: 'test-key', RAZORPAY_KEY_SECRET: 'local-test-signing-key' }, async () => {
    const details = { order_id: 'order_Test123', payment_id: 'pay_Test456' };
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${details.order_id}|${details.payment_id}`).digest('hex');
    assert.equal(integrations.verifyPaymentSignature({ ...details, signature }), true);
    assert.equal(integrations.verifyPaymentSignature({ ...details, order_id: 'order_Other', signature }), false);
    assert.equal(integrations.verifyPaymentSignature({ ...details, payment_id: 'pay_Other', signature }), false);
    assert.equal(integrations.verifyPaymentSignature({ ...details, signature: '0'.repeat(64) }), false);
    assert.equal(integrations.verifyPaymentSignature({ ...details, signature: 'malformed' }), false);
  });
});

test('webhook verification rejects body modifications and absent secrets', async () => {
  const raw = Buffer.from('{"event":"payment.captured","id":"event_test"}');
  await withEnvironment({ RAZORPAY_WEBHOOK_SECRET: 'local-webhook-test-key' }, async () => {
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    assert.equal(integrations.verifyWebhook(raw, signature), true);
    assert.equal(integrations.verifyWebhook(Buffer.from(raw.toString().replace('captured', 'failed')), signature), false);
    assert.equal(integrations.verifyWebhook(raw, 'x'.repeat(64)), false);
  });
  await withEnvironment({ RAZORPAY_WEBHOOK_SECRET: '' }, async () => {
    assert.equal(integrations.verifyWebhook(raw, '0'.repeat(64)), false);
  });
});

test('OTP verification only accepts an approved and valid provider response', async () => {
  await withEnvironment({ TWILIO_ACCOUNT_SID: 'test-account', TWILIO_AUTH_TOKEN: 'test-auth', TWILIO_VERIFY_SERVICE_SID: 'test-service' }, async () => {
    const originalFetch = global.fetch;
    try {
      for (const [providerResponse, expected] of [
        [{ status: 'approved', valid: true }, true],
        [{ status: 'approved', valid: false }, false],
        [{ status: 'pending', valid: true }, false],
        [{ status: 'canceled', valid: false }, false]
      ]) {
        global.fetch = async () => ({ ok: true, json: async () => providerResponse });
        assert.equal(await integrations.verifyOtp('9990000002', '123456'), expected);
      }
      global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ secret: 'provider-diagnostic-private' }) });
      await assert.rejects(() => integrations.sendOtp('9990000002'), error => {
        assert.equal(error.message.includes('provider-diagnostic-private'), false);
        return error.status === 502;
      });
    } finally { global.fetch = originalFetch; }
  });
});

test('payment lookup rejects provider responses for a different payment', async () => {
  await withEnvironment({ RAZORPAY_KEY_ID: 'test-key', RAZORPAY_KEY_SECRET: 'local-test-key' }, async () => {
    const originalFetch = global.fetch;
    const details = { id: 'pay_Test123', order_id: 'order_Test123', amount: 25000, currency: 'INR', status: 'authorized', captured: false };
    try {
      global.fetch = async () => ({ ok: true, json: async () => details });
      const returned = await integrations.razorpayGetPayment(details.id);
      assert.equal(returned.captured, false, 'Authorization must not be promoted to captured');
      for (const invalid of [{ ...details, id: 'pay_Other' }, { ...details, amount: 12.5 }, { ...details, captured: 'true' }]) {
        global.fetch = async () => ({ ok: true, json: async () => invalid });
        await assert.rejects(() => integrations.razorpayGetPayment(details.id), error => error.code === 'invalid_payment_details');
      }
    } finally { global.fetch = originalFetch; }
  });
});

test('refund responses must match the requested payment and amount', async () => {
  await withEnvironment({ RAZORPAY_KEY_ID: 'test-key', RAZORPAY_KEY_SECRET: 'local-test-key' }, async () => {
    const originalFetch = global.fetch;
    const details = { id: 'rfnd_Test123', payment_id: 'pay_Test123', amount: 25000, status: 'pending' };
    try {
      global.fetch = async () => ({ ok: true, json: async () => details });
      const returned = await integrations.razorpayRefund(details.payment_id, { amount: details.amount, receipt: 'test-refund-1' });
      assert.equal(returned.status, 'pending', 'A pending refund must remain pending');
      for (const invalid of [{ ...details, payment_id: 'pay_Other' }, { ...details, amount: 24000 }]) {
        global.fetch = async () => ({ ok: true, json: async () => invalid });
        await assert.rejects(() => integrations.razorpayRefund(details.payment_id, { amount: details.amount, receipt: 'test-refund-1' }), error => error.code === 'invalid_refund_details');
      }
    } finally { global.fetch = originalFetch; }
  });
});
