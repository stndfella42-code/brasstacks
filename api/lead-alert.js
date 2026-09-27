// api/lead-alert.js — Retell call_analyzed webhook -> SMS lead alert via Twilio.
// Env vars (Vercel dashboard > Settings > Environment Variables):
//   ALERT_SECRET        shared secret, must match ?key= or ?secret= in the Retell webhook URL
//   TWILIO_ACCOUNT_SID  from twilio.com/console
//   TWILIO_AUTH_TOKEN   from twilio.com/console
//   TWILIO_FROM_NUMBER  a Twilio number on the account, E.164 (e.g. +17205550134)
//   ALERT_TO_NUMBER     where the lead text goes, E.164 (e.g. +13038183433)
//   CLIENT_BUSINESS_NAME name shown in the alert header (e.g. "Brass Tacks")
const https = require('https');
const querystring = require('querystring');

const trunc = (s, n) => {
  s = (s || '').toString().trim().replace(/\s+/g, ' ');
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

// E.164-ish input -> (303) 818-3433. Passes through anything unrecognized.
const fmtPhone = (p) => {
  const digits = (p || '').toString().replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1')
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return (p || '').toString().trim() || 'no number captured';
};

// ms -> "2m42s" / "45s"
const fmtDur = (ms) => {
  const secs = Math.round((ms || 0) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
};

// epoch ms / ISO -> "10:03 PM" America/Denver
const fmtTimeMT = (ts) => {
  const d = ts ? new Date(Number(ts)) : new Date();
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
    hour: 'numeric',
    minute: '2-digit',
  });
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
    const q = req.query || {};
    if (!secret || (q.key !== secret && q.secret !== secret))
      return res.status(401).send('unauthorized');

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

    const clientName = (process.env.CLIENT_BUSINESS_NAME || 'Brass Tacks').trim() || 'Brass Tacks';
    const name = trunc(f.caller_name || 'Unknown caller', 40);
    const bizName = (f.business_name || '').toString().trim();
    const bizType = (f.business_type || '').toString().trim();

    // B2B: "👤 Name · Business (type)". Consumer (no business): "👤 Name".
    const callerLine = bizName
      ? `👤 ${name} · ${trunc(bizName, 40)}${bizType ? ` (${trunc(bizType, 24)})` : ''}`
      : `👤 ${name}`;

    const need = trunc(
      f.project_description || analysis.call_summary || 'no details captured',
      220
    );
    const timeline = (f.timeline || '').toString().trim();
    const diff = (f.differentiator || '').toString().trim();
    const sentiment = analysis.user_sentiment || 'Unknown';
    const timeStr = fmtTimeMT(call.start_timestamp || call.start_time);

    const lines = [
      `🔥 NEW LEAD — ${clientName}`,
      callerLine,
      `📞 ${fmtPhone(f.callback_phone)}`,
      `💬 ${need}`,
    ];
    if (timeline) lines.push(`🗓️ Timeline: ${trunc(timeline, 80)}`);
    if (diff) lines.push(`💡 ${trunc(diff, 140)}`);
    lines.push(`⭐ ${sentiment} · ${fmtDur(call.duration_ms)}${timeStr ? ` · ${timeStr}` : ''}`);

    const text = lines.join('\n');

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_TO_NUMBER } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !ALERT_TO_NUMBER) {
      console.error('lead-alert: missing twilio env vars');
      return res.status(500).send('server not configured');
    }

    try {
      await sendSms({
        sid: TWILIO_ACCOUNT_SID,
        token: TWILIO_AUTH_TOKEN,
        from: TWILIO_FROM_NUMBER,
        to: ALERT_TO_NUMBER,
        body: text,
      });
      return res.status(200).send('sent');
    } catch (err) {
      // Twilio rejected the send (e.g. 20003: messaging compliance profile not
      // approved). That is a provider/account issue, not a server error: log it
      // clearly and return 200 so Retell does not retry the webhook.
      console.error('lead-alert: twilio rejected send:', err.message);
      return res.status(200).send('twilio-rejected');
    }
  } catch (err) {
    console.error('lead-alert error:', err.message);
    return res.status(500).send('error');
  }
};
