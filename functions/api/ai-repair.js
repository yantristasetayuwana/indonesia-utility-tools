/* Cloudflare Pages Function — AI table repair endpoint.
 * Preferred: Workers AI binding (env.AI), no API key exposed to the browser.
 * Optional fallback: OpenAI Responses API using OPENAI_API_KEY secret.
 */
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const headers = Array.isArray(body.headers) ? body.headers : [];
    const roles = Array.isArray(body.roles) ? body.roles : [];
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const rawText = Array.isArray(body.rawText) ? body.rawText : [];
    if (headers.length < 2 || !rows.length) return json({ error: 'Payload tabel tidak lengkap.' }, 400);
    if (headers.length > 30 || rows.length > 300) return json({ error: 'Tabel terlalu besar untuk AI repair. Gunakan parser lokal atau pecah file.' }, 413);

    const prompt = [
      'You are a document table reconstruction engine.',
      'Repair ONLY row/column placement errors. Do not invent, summarize, translate, normalize, or delete source values.',
      'The output must contain exactly the same number of rows and exactly the same number of columns as the input.',
      'Preserve the original row order. Blank values are allowed when the source is blank.',
      'Use the headers, semantic roles, candidate rows, and raw source lines as evidence.',
      'If a value appears in the wrong column, move it to the most plausible column based on the header semantics and source order.',
      'Return JSON only in the form {"rows":[[...],[...]]}.',
      '',
      'HEADERS:', JSON.stringify(headers),
      'ROLES:', JSON.stringify(roles),
      'CANDIDATE ROWS:', JSON.stringify(rows),
      'RAW SOURCE LINES:', JSON.stringify(rawText)
    ].join('\n');

    let resultText = '';
    if (env.AI && typeof env.AI.run === 'function') {
      const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: 'You repair structured document tables. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      });
      resultText = result?.response || result?.output_text || '';
    } else if (env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL || 'gpt-5.6-luna',
          store: false,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: 'You repair structured document tables. Return JSON only.' }] },
            { role: 'user', content: [{ type: 'input_text', text: prompt }] }
          ],
          text: { format: { type: 'json_object' } }
        })
      });
      if (!response.ok) return json({ error: `OpenAI HTTP ${response.status}` }, 502);
      const data = await response.json();
      resultText = data?.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text || '';
    } else {
      return json({ error: 'AI belum dikonfigurasi. Aktifkan Workers AI binding atau tambahkan OPENAI_API_KEY sebagai secret.' }, 503);
    }

    const parsed = extractJson(resultText);
    const repaired = Array.isArray(parsed?.rows) ? parsed.rows : null;
    if (!repaired) return json({ error: 'AI tidak mengembalikan struktur rows yang valid.' }, 502);
    const cleanRows = repaired.map(row => Array.isArray(row) ? row.slice(0, headers.length).concat(Array(Math.max(0, headers.length - row.length)).fill('')) : null).filter(Boolean);
    if (cleanRows.length !== rows.length || cleanRows.some(r => r.length !== headers.length)) {
      return json({ error: 'AI mengubah jumlah baris/kolom; hasil ditolak demi keamanan data.' }, 422);
    }
    return json({ rows: cleanRows, engine: env.AI ? 'cloudflare-workers-ai' : 'openai-responses' });
  } catch (error) {
    return json({ error: error?.message || String(error) }, 500);
  }
}

function extractJson(text) {
  const s = String(text || '').trim();
  try { return JSON.parse(s); } catch (_) {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch (_) {}
  }
  return null;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
