'use strict';

// Transactional SMS is distinct from Twilio Verify OTP. A configured Verify
// service alone does not authorize or enable ordinary outgoing messages.
const { ProviderError, normalizePhone } = require('./integrations');
const statuses = new Set(['accepted', 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed']);
const value = name => String(process.env[name] || '').trim();

function smsConfigured() {
  return Boolean(value('TWILIO_ACCOUNT_SID') && value('TWILIO_AUTH_TOKEN') &&
    (value('TWILIO_MESSAGING_SERVICE_SID') || value('TWILIO_FROM_NUMBER')));
}

function configured() {
  if (!smsConfigured()) throw new ProviderError('SMS notifications are not configured. Please contact Alagar Automobiles.', 'sms_not_configured', 503);
}

function messageId(sid) {
  if (typeof sid !== 'string' || !/^SM[a-fA-F0-9]{32}$/.test(sid)) {
    throw new ProviderError('The SMS message reference is invalid.', 'invalid_sms_reference', 400);
  }
  return sid;
}

function responseStatus(result, expectedSid) {
  if (!result || typeof result !== 'object' || typeof result.sid !== 'string' || !/^SM[a-fA-F0-9]{32}$/.test(result.sid) ||
      (expectedSid && result.sid !== expectedSid) || !statuses.has(result.status)) {
    throw new ProviderError('The SMS provider returned an invalid message status. Please try again.', 'invalid_sms_response', 502);
  }
  // Provider bodies can include recipients, message contents and diagnostics.
  // Return only identifiers/status, never arbitrary provider response fields.
  return { sid: result.sid, status: result.status,
    error_code: Number.isInteger(result.error_code) ? result.error_code : null };
}

async function twilioRequest(suffix, options) {
  configured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  timer.unref?.();
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(value('TWILIO_ACCOUNT_SID'))}/Messages${suffix}.json`, {
      ...options,
      headers: {
        Authorization: `Basic ${Buffer.from(`${value('TWILIO_ACCOUNT_SID')}:${value('TWILIO_AUTH_TOKEN')}`).toString('base64')}`,
        ...(options.headers || {})
      },
      signal: controller.signal,
      redirect: 'error'
    });
    if (!response.ok) {
      throw new ProviderError(response.status === 429 ? 'SMS service is temporarily busy. Please try again later.' : 'The SMS provider could not complete the request. Please try again.', response.status === 429 ? 'sms_rate_limited' : 'sms_provider_error', response.status === 429 ? 429 : 502);
    }
    let result;
    try { result = await response.json(); }
    catch { throw new ProviderError('The SMS provider returned an invalid response.', 'invalid_sms_response', 502); }
    return result;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError') throw new ProviderError('The SMS service timed out. Please try again.', 'sms_timeout', 504);
    throw new ProviderError('The SMS service is temporarily unavailable. Please try again.', 'sms_connection_error', 502);
  } finally { clearTimeout(timer); }
}

async function sendSms(phone, message) {
  configured();
  const to = normalizePhone(phone);
  if (typeof message !== 'string' || !message.trim() || message.length > 1000) {
    throw new ProviderError('SMS text must contain between 1 and 1000 characters.', 'invalid_sms_message', 400);
  }
  const service = value('TWILIO_MESSAGING_SERVICE_SID');
  const sender = value('TWILIO_FROM_NUMBER');
  if (!service && !/^\+[1-9]\d{7,14}$/.test(sender)) throw new ProviderError('The configured SMS sender is invalid.', 'invalid_sms_sender', 503);
  const parameters = new URLSearchParams({ To: to, Body: message.trim(), ...(service ? { MessagingServiceSid: service } : { From: sender }) });
  const result = await twilioRequest('', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: parameters.toString() });
  return responseStatus(result);
}

async function getSmsStatus(sid) {
  configured();
  const id = messageId(sid);
  return responseStatus(await twilioRequest(`/${encodeURIComponent(id)}`, { method: 'GET' }), id);
}

module.exports = { smsConfigured, sendSms, getSmsStatus };
