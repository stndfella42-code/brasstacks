// Shared Supabase helpers for Ava's caller memory ("remember me" feature).
// Server-side only. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
// Uses plain fetch against the Supabase REST API (no SDK dependency).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// Normalize a phone number to E.164-ish form. US-centric: 10 digits -> +1.
function normalizePhone(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (d.length > 11) return "+" + d;
  return null;
}

function headers() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: "Bearer " + SUPABASE_KEY,
    "Content-Type": "application/json",
  };
}

async function lookupCaller(phone) {
  if (!configured()) return { configured: false };
  const p = normalizePhone(phone);
  if (!p) return { configured: true, remembered: false };
  const url = `${SUPABASE_URL}/rest/v1/remembered_callers?phone_number=eq.${encodeURIComponent(p)}&select=phone_number,name,callback_number,last_topic,notes,call_count`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`supabase lookup ${r.status}`);
  const rows = await r.json();
  if (!rows.length) return { configured: true, remembered: false, phone: p };
  const row = rows[0];
  return { configured: true, remembered: true, ...row };
}

async function rememberCaller({ phone, name, callback_number, topic, notes }) {
  if (!configured()) return { configured: false };
  const p = normalizePhone(phone);
  if (!p || !name) throw new Error("rememberCaller needs phone + name");
  const body = {
    phone_number: p,
    name: String(name).slice(0, 80),
    opted_in: true,
    updated_at: new Date().toISOString(),
  };
  const cb = normalizePhone(callback_number);
  if (cb && cb !== p) body.callback_number = cb;
  if (topic) body.last_topic = String(topic).slice(0, 200);
  if (notes) body.notes = String(notes).slice(0, 500);
  const url = `${SUPABASE_URL}/rest/v1/remembered_callers`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`supabase remember ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { configured: true, remembered: true, phone: p };
}

async function forgetCaller(phone) {
  if (!configured()) return { configured: false };
  const p = normalizePhone(phone);
  if (!p) return { configured: true, forgotten: false };
  const url = `${SUPABASE_URL}/rest/v1/remembered_callers?phone_number=eq.${encodeURIComponent(p)}`;
  const r = await fetch(url, { method: "DELETE", headers: headers() });
  if (!r.ok) throw new Error(`supabase forget ${r.status}`);
  return { configured: true, forgotten: true, phone: p };
}

module.exports = { configured, normalizePhone, lookupCaller, rememberCaller, forgetCaller };
