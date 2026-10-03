/** TEMP DIAGNOSTIC - lists ElevenLabs voices (names + IDs only). DELETE AFTER USE. */
module.exports = async (req, res) => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(500).json({ ok: false });
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    const d = await r.json();
    const voices = (d.voices || []).map(v => ({ name: v.name, id: v.voice_id, category: v.category }));
    return res.status(200).json({ ok: true, voices });
  } catch (e) {
    return res.status(502).json({ ok: false });
  }
};
