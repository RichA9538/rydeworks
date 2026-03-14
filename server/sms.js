// ── TWILIO SMS HELPER ─────────────────────────────────────
const twilio = require('twilio');

function getSmsClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

async function sendSms(to, message) {
  try {
    const client = getSmsClient();
    if (!client) {
      console.warn('[SMS] Twilio not configured — skipping SMS to', to);
      return false;
    }
    const from = process.env.TWILIO_PHONE_NUMBER;
    await client.messages.create({ body: message, from, to });
    console.log(`[SMS] Sent to ${to}`);
    return true;
  } catch (err) {
    console.error('[SMS] Failed:', err.message);
    return false;
  }
}

module.exports = { sendSms };
