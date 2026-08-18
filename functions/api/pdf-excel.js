/**
 * Cloudflare Pages Function — PDF → Excel V3
 * Forwards the PDF to a private Python conversion service.
 * Secret required: PDF_EXCEL_API_URL
 * Optional: PDF_EXCEL_API_TOKEN
 */
export async function onRequestPost({ request, env }) {
  const api = String(env.PDF_EXCEL_API_URL || '').replace(/\/+$/, '');
  if (!api) return json({ok:false,error:'PDF_EXCEL_API_URL belum dikonfigurasi di Cloudflare.'},503);
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json({ok:false,error:'File PDF tidak ditemukan.'},400);
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return json({ok:false,error:'Hanya file PDF yang diperbolehkan.'},400);
  if (file.size > 50*1024*1024) return json({ok:false,error:'Ukuran PDF maksimum 50 MB.'},413);
  const upstream = new FormData();
  upstream.append('file', file, file.name);
  const headers = {};
  if (env.PDF_EXCEL_API_TOKEN) headers['Authorization'] = `Bearer ${env.PDF_EXCEL_API_TOKEN}`;
  let r;
  try { r = await fetch(`${api}/convert`, {method:'POST',headers,body:upstream}); }
  catch(e){ return json({ok:false,error:'Converter service tidak dapat dihubungi.',detail:String(e?.message||e)},502); }
  if (!r.ok) {
    const ct=r.headers.get('content-type')||'';
    if(ct.includes('application/json')) return new Response(await r.text(),{status:r.status,headers:{'content-type':'application/json; charset=utf-8'}});
    return json({ok:false,error:`Converter service gagal (${r.status}).`,detail:(await r.text()).slice(0,1000)},502);
  }
  const h=new Headers(r.headers);
  h.set('cache-control','no-store');
  return new Response(r.body,{status:200,headers:h});
}
function json(o,s=200){return new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
