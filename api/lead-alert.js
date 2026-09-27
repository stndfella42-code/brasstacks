// api/lead-alert.js — Retell call_analyzed webhook -> SMS lead alert via Twilio.
// Env vars (Vercel dashboard > Settings > Environment Variables):
//   ALERT_SECRET        shared secret, must match ?key= in the Retell webhook URL
//   TWILIO_ACCOUNT_SID  from twilio.com/console
//   TWILIO_AUTH_TOKEN   from twilio.com/console
//   TWILIO_FROM_NUMBER  a Twilio number on the account, E.164 (e.g. +17205550134)
//   ALERT_TO_NUMBER     where the lead text goes, E.164 (e.g. +13038183433)
const https = require('https');
const querystring = require('querystring');

const trunc = (s, n) => {
  s = (s || '').toString().trim().replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

function sendSms({ sid, token, from, to, body }) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({ From: from, To: to, Body: body });
    const req = https.request(
      {
        hostname: 'api.twilio.com',
        path: `/2010-04-01/Accounts/${sid}/Messages.json`,
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(raw);
          else reject(new Error(`twilio ${res.statusCode}: ${raw.slice(0, 300)}`));
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('method not allowed');

    const secret = process.env.ALERT_SECRET;
    if (!secret || req.query.key !== secret) return res.status(401).send('unauthorized');

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).send('bad json');
      }
    }
    if (!body || body.event !== 'call_analyzed') return res.status(200).send('ignored');

    const call = body.data || body.call || {};
    const analysis = call.call_analysis || {};
    const f = analysis.custom_analysis_data || {};

    const name = f.caller_name || 'Unknown caller';
    const biz = f.business_name || 'Unknown business';
    const type = f.business_type ? ` (${f.business_type})` : '';
    const phone = f.callback_phone || 'no number captured';
    const need = trunc(f.project_description || analysis.call_summary || 'no details captured', 140);
    const secs = Math.round((call.duration_ms || 0) / 1000);
    const sentiment = analysis.user_sentiment || 'Unknown';

    const text =
      `🔥 NEW LEAD — Brass Tacks\n` +
      `👤 ${trunc(name, 40)} · ${trunc(biz, 40)}${trunc(type, 30)}\n` +
      `📞 ${phone}\n` +
      `💬 ${need}\n` +
      `⭐ ${sentiment} · ${secs}s call`;

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_TO_NUMBER } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !ALERT_TO_NUMBER) {
      console.error('lead-alert: missing twilio env vars');
      return res.status(500).send('server not configured');
    }

    await sendSms({
      sid: TWILIO_ACCOUNT_SID,
      token: TWILIO_AUTH_TOKEN,
      from: TWILIO_FROM_NUMBER,
      to: ALERT_TO_NUMBER,
      body: text,
    });
    return res.status(200).send('sent');
  } catch (err) {
    console.error('lead-alert error:', err.message);
    return res.status(500).send('error');
  }
};
