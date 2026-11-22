// KINO AI server. Keeps your API key off the phone.
// Run: ANTHROPIC_API_KEY=sk-... node server.js   (Node 18+, no dependencies)
const http = require('http');
// Pick ONE provider with env vars:
//  Gemini (free tier):   GEMINI_API_KEY=...            (optional GEMINI_MODEL, default gemini-flash-latest)
//  Any OpenAI-style API: LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=...   (Groq, OpenRouter, etc.)
//  Anthropic (paid):     ANTHROPIC_API_KEY=...         (optional KINO_MODEL)
const E = process.env;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };

const SYSTEM = `You are the planner for KINO, a mobile video editor. Return ONLY JSON:
{"summary":"one sentence","events":[{"track":"video|fx|text|audio","type":"...","label":"...","t":seconds,"d":seconds,"amt":0-100,"anim":"pop|fade|rise|type|bounce|glitch|spin|slide","tstyle":"serif|bold|mono|neon"}]}
Rules: video events are consecutive clips (type "clip") covering 0..duration with no gaps. fx events must use a type from fxTypes. Text events use type "text" and label = the title. Audio events (type "beat") mark beats. Put cuts on the supplied beats when possible. Keep t+d <= duration. If "current" and "instruction" are given, return the full revised event list.`;

async function ask(user) {
  if (E.GEMINI_API_KEY) {
    const m = E.GEMINI_MODEL || 'gemini-flash-latest';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': E.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000 } })
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'Gemini error ' + r.status);
    const t = (((j.candidates || [])[0] || {}).content || {}).parts;
    if (!t) throw new Error('Gemini returned no text (blocked or empty)');
    return t.map(p => p.text || '').join('');
  }
  if (E.LLM_BASE_URL && E.LLM_API_KEY) {
    const r = await fetch(E.LLM_BASE_URL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + E.LLM_API_KEY },
      body: JSON.stringify({ model: E.LLM_MODEL, max_tokens: 8000, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] })
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'LLM error ' + r.status);
    return j.choices[0].message.content;
  }
  if (E.ANTHROPIC_API_KEY) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': E.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: E.KINO_MODEL || 'claude-sonnet-4-6', max_tokens: 8000, system: SYSTEM, messages: [{ role: 'user', content: user }] })
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || 'API error');
    return j.content.map(c => c.text || '').join('');
  }
  throw new Error('No key set. Set GEMINI_API_KEY (free), or LLM_BASE_URL+LLM_API_KEY+LLM_MODEL, or ANTHROPIC_API_KEY');
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(200, { ...CORS, 'Content-Type': 'text/plain' }); return res.end('KINO server is running. Provider key set: ' + !!(E.GEMINI_API_KEY || E.LLM_API_KEY || E.ANTHROPIC_API_KEY)); }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on('end', async () => {
    try {
      const q = JSON.parse(body);
      const txt = await ask(JSON.stringify(q));
      const plan = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(plan));
    } catch (e) {
      res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
}).listen(process.env.PORT || 8787, () => console.log('KINO server on :' + (process.env.PORT || 8787)));
