/**
 * Cloudflare Pages Function — PDF -> Excel AI bridge
 * Uses Azure AI Document Intelligence v4 prebuilt-layout.
 * Secrets must be configured in Cloudflare Pages as:
 * AZURE_DI_ENDPOINT = https://<resource>.cognitiveservices.azure.com
 * AZURE_DI_KEY      = <secret>
 */
export async function onRequestPost({ request, env }) {
  const endpoint = String(env.AZURE_DI_ENDPOINT || '').replace(/\/$/, '');
  const key = env.AZURE_DI_KEY;
  if (!endpoint || !key) return json({ ok:false, configured:false, error:'Cloud AI belum dikonfigurasi di Cloudflare.' }, 503);

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ ok:false, error:'File PDF tidak ditemukan.' }, 400);
  if (file.size > 500 * 1024 * 1024) return json({ ok:false, error:'File terlalu besar (maksimum 500 MB pada tier berbayar Azure).'}, 413);

  const body = await file.arrayBuffer();
  const url = `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30`;
  const start = await fetch(url, { method:'POST', headers:{ 'Ocp-Apim-Subscription-Key':key, 'Content-Type':file.type || 'application/pdf' }, body });
  if (start.status !== 202) {
    const txt = await start.text();
    return json({ok:false,error:`Azure analyze gagal (${start.status}).`,detail:txt.slice(0,1200)}, start.status >= 500 ? 502 : 400);
  }
  const op = start.headers.get('operation-location');
  if (!op) return json({ok:false,error:'Azure tidak mengembalikan operation-location.'},502);

  const deadline = Date.now() + 180000;
  let result;
  while (Date.now() < deadline) {
    await new Promise(r=>setTimeout(r,1500));
    const poll = await fetch(op, { headers:{'Ocp-Apim-Subscription-Key':key} });
    result = await poll.json();
    if (result.status === 'succeeded') return json({ok:true,provider:'azure-document-intelligence-v4',result},200);
    if (result.status === 'failed') return json({ok:false,error:'Azure gagal menganalisis PDF.',detail:result.error || null},502);
  }
  return json({ok:false,error:'Waktu analisis habis. PDF belum selesai diproses.'},504);
}
function json(obj,status=200){ return new Response(JSON.stringify(obj), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }
