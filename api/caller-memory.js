// Ava caller-memory endpoint — backs Retell's lookup_caller / remember_caller /
// forget_caller custom functions, and doubles as the internal API for seeding.
//
// POST /api/caller-memory?key=CALLER_MEMORY_SECRET
// Body (Retell custom-function webhook):
//   { "function": "lookup_caller", "call": { "from_number": "+1303..." } }
//   { "function": "remember_caller", "call": {...}, "args": { "caller_name", "callback_number", "topic" } }
//   { "function": "forget_caller", "call": {...} }
// The caller number is read from the call object, never trusted from the LLM.

const { configured, normalizePhone, lookupCaller, rememberCaller, forgetCaller } = require("./_supabase");

// Tiny per-IP throttle (pilot-grade, same pattern as api/chat.js).
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 60;
}

function pickFnName(body) {
  const cands = [
    body && body.function,
    body && body.action,
    body && body.function_call && body.function_call.name,
    body && body.name,
  ];
  for (const c of cands) {
    if (typeof c === "string" && c) return c.toLowerCase();
  }
  return "";
}

function pickFromNumber(body) {
  const cands = [
    body && body.call && body.call.from_number,
    body && body.from_number,
    body && body.args && (body.args.phone_number || body.args.caller_number || body.args.from_number),
    body && body.phone,
  ];
  for (const c of cands) {
    const n = normalizePhone(c);
    if (n) return n;
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  if (throttled(ip)) {
    res.status(429).json({ error: "rate limited" });
    return;
  }

  const secret = process.env.CALLER_MEMORY_SECRET;
  const key = req.query.key || (req.headers.authorization || "").replace(/^Bearer /i, "");
  if (!secret || key !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  if (!configured()) {
    res.status(500).json({ error: "caller memory not configured" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const fn = pickFnName(body);
  const fromNumber = pickFromNumber(body);

  try {
    if (fn.includes("lookup")) {
      if (!fromNumber) return res.status(200).json({ remembered: false, reason: "no caller id" });
      const r = await lookupCaller(fromNumber);
      if (!r.remembered) return res.status(200).json({ remembered: false });
      return res.status(200).json({
        remembered: true,
        name: r.name,
        last_topic: r.last_topic || null,
        notes: r.notes || null,
        call_count: r.call_count || 1,
      });
    }
    if (fn.includes("remember")) {
      const args = body.args || {};
      const name = args.caller_name || args.name || body.name;
      const topic = args.topic || body.topic || null;
      const callback = args.callback_number || args.phone_number || null;
      if (!fromNumber) return res.status(200).json({ remembered: false, reason: "no caller id" });
      if (!name) return res.status(200).json({ remembered: false, reason: "no name provided" });
      const r = await rememberCaller({ phone: fromNumber, name, callback_number: callback, topic });
      return res.status(200).json({ remembered: true, name: r.name || name });
    }
    if (fn.includes("forget")) {
      if (!fromNumber) return res.status(200).json({ forgotten: false, reason: "no caller id" });
      await forgetCaller(fromNumber);
      return res.status(200).json({ forgotten: true });
    }
    res.status(400).json({ error: `unknown function '${fn}'` });
  } catch (e) {
    console.error("[caller-memory]", e.message);
    res.status(500).json({ error: "memory lookup failed" });
  }
};
