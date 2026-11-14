'use strict';

const { OAuth2Client } = require('google-auth-library');
const verifier = new OAuth2Client({transporterOptions:{timeout:10000,retry:false}});
const issuers = new Set(['accounts.google.com', 'https://accounts.google.com']);
function clientId() { return String(process.env.GOOGLE_CLIENT_ID || '').trim(); }
function configured() { return /^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId()); }
const failure = (message, status=401) => Object.assign(new Error(message),{status});

async function verifyCredential(credential, nonce) {
  if (!configured()) throw failure('Google sign-in is not configured.',503);
  if (typeof credential !== 'string' || credential.length > 16000 || credential.split('.').length !== 3 || !/^[a-f0-9]{64}$/.test(nonce || '')) throw failure('Google sign-in could not be verified. Please try again.');
  let payload;
  try { const ticket=await verifier.verifyIdToken({idToken:credential,audience:clientId()});payload=ticket.getPayload(); }
  catch { throw failure('Google sign-in could not be verified. Please try again.'); }
  const now=Math.floor(Date.now()/1000);
  if (!payload || !issuers.has(payload.iss) || payload.aud !== clientId() || !Number.isFinite(payload.exp) || payload.exp <= now || !Number.isFinite(payload.iat) || payload.iat > now+60 || payload.exp-payload.iat>86400 || payload.nonce!==nonce || typeof payload.sub!=='string' || !/^[a-zA-Z0-9_-]{1,255}$/.test(payload.sub) || payload.email_verified!==true || typeof payload.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length>254) throw failure('Google sign-in could not be verified. Please try again.');
  return {sub:payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name.slice(0,100):''};
}
module.exports={clientId,configured,verifyCredential};
