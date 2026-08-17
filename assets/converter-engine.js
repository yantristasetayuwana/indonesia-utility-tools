/* Indonesia Utility Tools — Smart Document Conversion Engine v2.1
 * Hybrid document reconstruction engine:
 * 1) PDF text extraction
 * 2) geometry + semantic parsing
 * 3) row repair / validation
 * 4) optional AI repair through Cloudflare Pages Function
 * 5) output adapters
 */
(function(global){
'use strict';
const H={no:'no',ticket:'ticket',truck:'truck',in:'in',out:'out',gross:'gross',tara:'tara',netto:'netto',subleader:'subleader',leader:'leader'};
const HEADER_WORDS=new Set(['no','no.','number','id','date','tanggal','time','waktu','ticket','no.ticket','no.truck','truck','vehicle','item','description','desc','qty','quantity','unit','price','amount','total','subtotal','gross','gross(ton)','netto','net','netto(ton)','tara','tara(ton)','in','out','leader','sub','name','supplier','customer','status','code','kode','part','product','po','grn','transfer','requester','location','warehouse','category','alamat','phone','email','terima','pcs']);
const COMPOUNDS=new Set(['sub leader','no ticket','no truck','invoice no','item code','unit price','grand total','net amount','gross weight','tare weight','no. po','no. grn','no. transfer','part number','qty terima','date time','start date','end date','unit cost','total amount','phone number']);
function clean(s){return String(s??'').replace(/[\u0000-\u001F]+/g,' ').replace(/\s+/g,' ').trim()}
function num(v,d=0){const n=Number(v);return Number.isFinite(n)?n:d}
function norm(s){return clean(s).toLowerCase().replace(/[,:;]+$/,'')}
function groupLines(items,yTol=2.6){
 const lines=[]; for(const raw of (items||[])){const text=clean(raw.str??raw.text);if(!text)continue;const x=num(raw.x??raw.transform?.[4]);const y=num(raw.y??raw.transform?.[5]);const h=Math.abs(num(raw.h??raw.height??raw.transform?.[3],10))||10;const w=Math.max(0,num(raw.w??raw.width));let l=lines.find(q=>Math.abs(q.y-y)<=Math.max(yTol,h*.32));if(!l){l={y,items:[]};lines.push(l)}l.items.push({x,y,w,h,text})}
 lines.sort((a,b)=>b.y-a.y);for(const l of lines)l.items.sort((a,b)=>a.x-b.x);return lines;
}
function lineText(line){return clean((line.items||[]).map(x=>x.text).join(' '))}
function headerScore(line){const ts=norm(lineText(line)).split(/\s+/).filter(Boolean);const hits=ts.filter(t=>HEADER_WORDS.has(t)).length;return hits*5+Math.min((line.items||[]).length,14)*.35-ts.filter(t=>/^\d+$/.test(t)).length*1.5}
function findHeader(lines){let best=null,bs=0;const lim=Math.max(1,Math.floor(lines.length*.6));for(let i=0;i<Math.min(lines.length,lim);i++){const s=headerScore(lines[i]);if(s>bs){bs=s;best={index:i,line:lines[i],score:s}}}return best&&best.score>=5?best:null}
function expandHeaderItems(items){const known=['No.Ticket','No.Truck','Gross(Ton)','Tarra(Ton)','Netto(Ton)','Sub Leader','No.','No','Out','In','Leader'];const out=[];for(const raw of (items||[])){const text=clean(raw.text);const low=text.toLowerCase();let matches=[];for(const k of known){let pos=0;const kl=k.toLowerCase();while((pos=low.indexOf(kl,pos))>=0){matches.push({k,pos});pos+=kl.length}}matches.sort((a,b)=>a.pos-b.pos||b.k.length-a.k.length);const used=[];for(const m of matches){if(used.some(u=>m.pos<u.end&&m.pos+m.k.length>u.start))continue;used.push({start:m.pos,end:m.pos+m.k.length,k:m.k});}if(used.length>1||(!known.some(k=>k.toLowerCase()===low)&&used.length===1&&used[0].k.toLowerCase()!==low)){for(const u of used){const ratio=u.start/Math.max(1,text.length);const ratio2=u.end/Math.max(1,text.length);out.push({...raw,text:u.k,x:raw.x+raw.w*ratio,w:Math.max(1,raw.w*(ratio2-ratio))})}}else out.push({...raw});}return out}
function makeCenters(headerLine){const a=expandHeaderItems(headerLine.items||[]).slice().sort((x,y)=>x.x-y.x);if(!a.length)return[];const gaps=[];for(let i=1;i<a.length;i++)gaps.push(Math.max(0,a[i].x-(a[i-1].x+a[i-1].w)));const med=gaps.length?gaps.slice().sort((x,y)=>x-y)[Math.floor(gaps.length/2)]:0;const merge=Math.max(12,med*.8),m=[];for(const it of a){const last=m[m.length-1],gap=last?Math.max(0,it.x-(last.x+last.w)):Infinity,c=last?norm(last.text+' '+it.text):'';if(last&&COMPOUNDS.has(c)&&gap<=merge){last.text=clean(last.text+' '+it.text);last.w=it.x+it.w-last.x}else m.push({...it})}return m.map(x=>({label:x.text,center:x.x+Math.max(1,x.w)/2,x:x.x,w:x.w}))}
function boundaries(c){const b=[];for(let i=0;i<c.length-1;i++)b.push((c[i].center+c[i+1].center)/2);return b}
function assignLine(line,c,b){const cells=Array.from({length:c.length},()=>[]);for(const it of line.items||[]){const xc=it.x+Math.max(0,it.w)/2;let i=0;while(i<b.length&&xc>=b[i])i++;cells[i].push(it.text)}return cells.map(clean)}
function looksLikeDataRow(c){const s=clean(c[0]);return /^\d{1,7}$/.test(s)||/^[A-Z]{1,12}[-_/]?[A-Z0-9]{2,}/i.test(s)||/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}$/.test(s)||/^\d{1,2}:\d{2}/.test(s)||c.filter(Boolean).length>=3}
function normalizeHeaderLabel(s){const x=norm(s).replace(/[()]/g,' ').replace(/\s+/g,' ');if(/^(no|number|nomor)$/.test(x))return H.no;if(x.includes('ticket'))return H.ticket;if(x.includes('truck')||x.includes('vehicle'))return H.truck;if(x==='in'||x.includes('in time'))return H.in;if(x==='out'||x.includes('out time'))return H.out;if(x.includes('gross'))return H.gross;if(x.includes('tara')||x.includes('tarra')||x.includes('tare'))return H.tara;if(x.includes('netto')||x==='net'||x.includes('net weight'))return H.netto;if(x.includes('sub')&&x.includes('leader'))return H.subleader;if(x==='leader'||x.includes('leader'))return H.leader;return x}
function schemaRoles(headers){return headers.map(normalizeHeaderLabel)}
function tokenizeLine(s){return clean(s).split(/\s+/).filter(Boolean)}
function isTime(s){return /^([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(s)}
function isNumber(s){return /^-?(?:\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)$/.test(s)}
function isTicket(s){return /^[A-Z]{1,8}\d{5,}[A-Z0-9_-]*$/i.test(s)||/^(?:TLP|TO|TR|TK|INV|DO)[A-Z0-9_-]+$/i.test(s)}
function isPlate(s){return /^(?:[A-Z]{1,3}\d{1,5}[A-Z]{0,4}|\d{1,4}[A-Z]{1,3})$/i.test(s)}
function repairMolassesLike(tokens,roles){
 // Semantic fallback for common weighbridge rows. It is intentionally pattern-based,
 // not tied to company names or fixed ticket numbers.
 let i=0;if(!/^\d{1,7}$/.test(tokens[i]||''))return null;const out=Array(roles.length).fill('');out[roles.indexOf(H.no)] = tokens[i++];
 const ticketIdx=roles.indexOf(H.ticket),truckIdx=roles.indexOf(H.truck),inIdx=roles.indexOf(H.in),outIdx=roles.indexOf(H.out),grossIdx=roles.indexOf(H.gross),taraIdx=roles.indexOf(H.tara),netIdx=roles.indexOf(H.netto);
 if(ticketIdx>=0&&tokens[i]&&isTicket(tokens[i]))out[ticketIdx]=tokens[i++]; else return null;
 if(truckIdx>=0){let plate='';if(tokens[i]&&isPlate(tokens[i])){plate=tokens[i++];if(tokens[i]&&/^[A-Z]{1,3}$/.test(tokens[i])&&/^[A-Z]{1,3}\d{1,5}$/.test(plate))plate+=' '+tokens[i++];}else return null;out[truckIdx]=plate;}
 if(inIdx>=0&&isTime(tokens[i]||''))out[inIdx]=tokens[i++]; else return null;
 if(outIdx>=0&&isTime(tokens[i]||''))out[outIdx]=tokens[i++]; else return null;
 const nums=[];while(i<tokens.length&&nums.length<3&&isNumber(tokens[i]))nums.push(tokens[i++]);if(nums.length<3)return null;
 if(grossIdx>=0)out[grossIdx]=nums[0];if(taraIdx>=0)out[taraIdx]=nums[1];if(netIdx>=0)out[netIdx]=nums[2];
 // Remaining company text: split when two identical/related trailing names are present.
 const rest=tokens.slice(i).join(' ');const leaderRoles=[roles.indexOf(H.subleader),roles.indexOf(H.leader)].filter(x=>x>=0);
 if(leaderRoles.length){if(rest){const parts=splitCompanyPair(rest);if(roles.indexOf(H.subleader)>=0)out[roles.indexOf(H.subleader)]=parts[0];if(roles.indexOf(H.leader)>=0)out[roles.indexOf(H.leader)]=parts[1]||parts[0]}}
 return out;
}
function splitCompanyPair(s){const x=clean(s);if(!x)return['',''];const markers=[' PT. ',' CV. ',' UD. ',' PT ',' CV ',' UD '];for(const m of markers){const p=x.indexOf(m,1);if(p>0)return[clean(x.slice(0,p)),clean(x.slice(p+1))]}const words=x.split(/\s+/);if(words.length>=4){for(let k=2;k<=words.length-2;k++){const a=words.slice(0,k).join(' '),b=words.slice(k).join(' ');if(a===b)return[a,b]}}return[x,'']}
function refineCenters(lines,headerIndex,centers){if(!centers||centers.length<2)return centers;const seed=boundaries(centers),samples=[];for(let i=Math.max(0,headerIndex+1);i<lines.length&&samples.length<300;i++){const c=assignLine(lines[i],centers,seed);if(looksLikeDataRow(c)){for(let k=0;k<centers.length;k++){const xs=(lines[i].items||[]).filter(it=>{const xc=it.x+Math.max(0,it.w)/2;let j=0;while(j<seed.length&&xc>=seed[j])j++;return j===k}).map(it=>it.x+Math.max(0,it.w)/2);if(xs.length)samples.push({k,x:xs[Math.floor(xs.length/2)]})}}}return centers.map((c,k)=>{const v=samples.filter(s=>s.k===k).map(s=>s.x).sort((a,b)=>a-b);return v.length>=3?{...c,center:c.center*.25+v[Math.floor(v.length/2)]*.75}:c}).sort((a,b)=>a.center-b.center)}
function reconstructPage(items,schema){
 const lines=groupLines(items),found=findHeader(lines);let centers=schema?.centers||null,headers=schema?.headers||null,hi=found?.index??-1;
 if(found){centers=makeCenters(found.line);headers=centers.map(x=>x.label);hi=found.index;centers=refineCenters(lines,hi,centers)}
 if(!centers||centers.length<2)return{headers:headers||[],rows:[],rawLines:lines.map(lineText),schema:schema||null,quality:0,headerIndex:hi};
 const roles=schemaRoles(headers),b=boundaries(centers),rows=[];let semantic=0,geometry=0;
 for(let i=Math.max(0,hi+1);i<lines.length;i++){
  const text=lineText(lines[i]);if(!text||/^page\s*:/i.test(text)||/^total\b/i.test(text))continue;
  const sem=repairMolassesLike(tokenizeLine(text),roles);
  if(sem){rows.push(sem);semantic++;continue}
  const cells=assignLine(lines[i],centers,b);const row0=clean(cells[0]);const ticketCell=roles.indexOf(H.ticket)>=0?clean(cells[roles.indexOf(H.ticket)]):'';const rowOk=roles.includes(H.no)?/^\d{1,7}$/.test(row0):ticketCell?isTicket(ticketCell):looksLikeDataRow(cells);if(rowOk){rows.push(cells);geometry++}
 }
 const nonEmpty=rows.filter(r=>r.filter(Boolean).length>=2).length;const quality=Math.min(100,(headers.length>=3?30:10)+Math.min(40,nonEmpty*1.5)+Math.min(25,semantic*1.5)+(geometry?10:0));
 return{headers,roles,rows,rawLines:lines.map(lineText),schema:{headers,roles,centers},quality,headerIndex:hi,stats:{semanticRows:semantic,geometryRows:geometry}};
}
async function extractPdf(pdfjs,file,opts={}){
 if(!pdfjs?.getDocument)throw new Error('PDF.js belum termuat.');if(!file)throw new Error('File PDF belum dipilih.');
 const pdf=await pdfjs.getDocument({data:await file.arrayBuffer(),useWorkerFetch:true,isEvalSupported:true}).promise;const pages=[];let schema=null,textQuality=0,textErrors=0;
 for(let p=1;p<=pdf.numPages;p++){try{const page=await pdf.getPage(p);const c=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});const r=reconstructPage(c.items,schema);if(r.schema&&r.quality>=35){schema=r.schema;textQuality+=r.quality}pages.push({page:p,...r,mode:'text',error:null})}catch(e){textErrors++;pages.push({page:p,headers:schema?.headers||[],rows:[],rawLines:[],schema,quality:0,mode:'text',error:String(e?.message||e)})}}
 if(opts.ocr===true){if(!global.Tesseract?.recognize)throw new Error('OCR engine belum termuat. Pastikan koneksi internet aktif lalu refresh halaman.');for(const p of pages){try{const page=await pdf.getPage(p.page),base=page.getViewport({scale:1}),scale=Math.min(2.6,Math.max(1.7,1700/Math.max(1,base.width))),vp=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport:vp}).promise;const r=await global.Tesseract.recognize(canvas,opts.ocrLang||'eng',{logger:opts.onOcrProgress});const words=(r.data.words||[]).filter(w=>clean(w.text));const items=words.map(w=>({text:clean(w.text),x:w.bbox.x0,y:vp.height-w.bbox.y1,w:w.bbox.x1-w.bbox.x0,h:w.bbox.y1-w.bbox.y0}));const o=reconstructPage(items,p.schema||schema);p.ocrRawLines=o.rawLines;p.ocrConfidence=Number(r.data.confidence||0);if(o.rows.length>p.rows.length||(!p.rows.length&&o.rawLines.length)){Object.assign(p,o,{mode:'ocr'})}canvas.width=1;canvas.height=1}catch(e){p.ocrError=String(e?.message||e)}}}
 return{pdf,pages,schema,usedOcr:pages.some(p=>p.mode==='ocr'),textQuality,textErrors,ocrRequested:opts.ocr===true};
}
function flattenTable(extracted){const headers=extracted?.schema?.headers||extracted?.pages?.find(p=>p.headers?.length)?.headers||[];const rows=[];for(const p of extracted?.pages||[])for(const r of p.rows||[])rows.push(r.concat(Array(Math.max(0,headers.length-r.length)).fill('')).slice(0,headers.length));return{headers,rows}}
function rawText(extracted){const out=[];for(const p of extracted?.pages||[])for(const line of(p.ocrRawLines||p.rawLines||[]))if(clean(line))out.push([p.page,p.mode,clean(line)]);return out}
function validate(extracted){const t=flattenTable(extracted),expected=t.headers.length,roles=extracted?.schema?.roles||[],issues=[];if(expected<2)issues.push('Header tabel belum terdeteksi.');if(!t.rows.length)issues.push('Belum ada baris data.');const bad=t.rows.filter(r=>r.filter(Boolean).length<Math.max(2,Math.ceil(expected*.4))).length;if(bad)issues.push(bad+' baris memiliki isi terlalu sedikit.');const rate=(role,fn)=>{const idx=roles.indexOf(role);if(idx<0||!t.rows.length)return 1;return t.rows.filter(r=>fn(clean(r[idx]||''))).length/t.rows.length};const checks=[['no',x=>/^\d{1,7}$/.test(x)],['ticket',isTicket],['truck',x=>isPlate(x)||/^[A-Z]{1,3}\d{1,5}\s+[A-Z]{1,3}$/i.test(x)],['in',isTime],['out',isTime],['gross',isNumber],['tara',isNumber],['netto',isNumber]];let semanticScore=0,semanticCount=0;for(const [role,fn] of checks){const idx=roles.indexOf(role);if(idx>=0){const r=rate(role,fn);semanticScore+=r;semanticCount++;if(r<.75)issues.push('Kolom '+role+' memiliki nilai yang tampak bergeser/tidak sesuai.')}}const completeness=t.rows.length?Math.max(0,1-bad/t.rows.length):0;const sem=semanticCount?semanticScore/semanticCount:1;const score=Math.max(0,Math.min(100,(expected>=2?25:5)+(t.rows.length?25:0)+completeness*20+sem*30));return{validHeader:expected>=2,rows:t.rows.length,columns:expected,issues,score:Math.round(score),semanticScore:Math.round(sem*100),needsAi:issues.length>0||score<88}}
async function aiRepair(extracted,endpoint='/api/ai-repair',opts={}){
 if(!endpoint)throw new Error('AI endpoint belum dikonfigurasi.');const t=flattenTable(extracted);const payload={headers:t.headers,roles:extracted?.schema?.roles||[],rows:t.rows.slice(0,250),rawText:rawText(extracted).slice(0,500),instruction:'Repair table rows conservatively. Preserve source values. Return JSON only: {rows:[[...]]}. Do not invent missing values. Keep exactly the same number and order of columns.'};const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:opts.signal});if(!r.ok)throw new Error('AI repair HTTP '+r.status);const j=await r.json();if(!Array.isArray(j.rows))throw new Error('AI repair response tidak valid.');const rows=j.rows.map(x=>Array.isArray(x)?x.map(clean):[]).filter(x=>x.length===t.headers.length);return{headers:t.headers,rows}}
async function smartExtractPdf(pdfjs,file,opts={}){const extracted=await extractPdf(pdfjs,file,opts);let validation=validate(extracted);if(opts.aiRepair&&validation.needsAi&&extracted.pages.length&&flattenTable(extracted).rows.length<=300){try{const ai=await aiRepair(extracted,opts.aiEndpoint||'/api/ai-repair',opts);if(ai.rows.length>=flattenTable(extracted).rows.length*.8){extracted.schema={...(extracted.schema||{}),headers:ai.headers,roles:schemaRoles(ai.headers)};let cursor=0;for(const p of extracted.pages){const n=(p.rows||[]).length;p.rows=ai.rows.slice(cursor,cursor+n);cursor+=n}validation=validate(extracted);extracted.aiRepaired=true}}catch(e){extracted.aiError=String(e?.message||e)}}return{extracted,validation}}
global.IUConvert={groupLines,findHeader,makeCenters,assignLine,reconstructPage,extractPdf,smartExtractPdf,flattenTable,rawText,validate,aiRepair,clean,isNumber};
})(window);
