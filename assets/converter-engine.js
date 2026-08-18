/* Indonesia Utility Tools — Smart Document Conversion Engine v2.2
 * Generic anchor-based table reconstruction.
 * - Detects a real table header from PDF geometry
 * - Builds column bands from header anchors
 * - Reuses the first reliable schema across pages
 * - Preserves page headers/footers and all source text
 * - Keeps long company/supplier text inside the correct column
 * - OCR fallback using Tesseract.js
 */
(function(global){
  'use strict';

  const ALIASES = {
    no: ['no','no.','number'],
    ticket: ['no.ticket','no ticket','ticket','ticket no','ticket number'],
    truck: ['no.truck','no truck','truck','vehicle','vehicle no'],
    in: ['in','masuk','start'],
    out: ['out','keluar','finish'],
    gross: ['gross','gross ton','gross(ton)','gross(tonnes)'],
    tare: ['tarra','tara','tare','tarra ton','tara ton','tare ton','tarra(ton)','tara(ton)','tare(ton)'],
    net: ['netto','net','netto ton','net(ton)','netto(ton)'],
    subleader: ['sub leader','subleader'],
    leader: ['leader'],
    date: ['date','tanggal'],
    time: ['time','waktu']
  };

  function clean(s){
    return String(s ?? '')
      .replace(/[\u0000-\u001F]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function norm(s){ return clean(s).toLowerCase().replace(/[^a-z0-9]+/g,''); }
  function textOf(item){ return clean(item?.str ?? item?.text ?? ''); }
  function xOf(item){ return Number(item?.x ?? item?.transform?.[4] ?? 0); }
  function yOf(item){ return Number(item?.y ?? item?.transform?.[5] ?? 0); }
  function wOf(item){ return Math.abs(Number(item?.w ?? item?.width ?? 0)); }
  function hOf(item){ return Math.abs(Number(item?.h ?? item?.height ?? item?.transform?.[3] ?? 10)) || 10; }

  function groupLines(items, tolerance){
    const usable = (items || []).filter(i => textOf(i));
    const sorted = usable.map(i => ({
      text:textOf(i), x:xOf(i), y:yOf(i), w:wOf(i), h:hOf(i)
    })).sort((a,b) => (b.y-a.y) || (a.x-b.x));

    const lines=[];
    for(const item of sorted){
      let best=null, bestDiff=Infinity;
      for(const line of lines){
        const d=Math.abs(line.y-item.y);
        const lim=Math.max(tolerance || 3.2, Math.min(item.h,line.h)*0.45);
        if(d<=lim && d<bestDiff){ best=line; bestDiff=d; }
      }
      if(!best) lines.push({y:item.y,h:item.h,items:[item]});
      else { best.items.push(item); best.h=Math.max(best.h,item.h); best.y=(best.y+item.y)/2; }
    }
    lines.sort((a,b)=>b.y-a.y);
    for(const line of lines) line.items.sort((a,b)=>a.x-b.x);
    return lines;
  }

  function aliasHit(token){
    const n=norm(token);
    for(const group of Object.values(ALIASES)){
      if(group.some(a => n===norm(a))) return true;
    }
    return false;
  }

  function headerScore(line){
    const tokens=line.items.map(i=>norm(i.text)).filter(Boolean);
    let hits=0;
    for(const t of tokens) if(aliasHit(t)) hits++;
    const joined=norm(line.items.map(i=>i.text).join(' '));
    const compoundHits=['noticket','notruck','subleader','grosston','tarraton','nettoton']
      .filter(x=>joined.includes(x)).length;
    return hits*4 + compoundHits*5 + Math.min(line.items.length,14)*0.25;
  }

  function findHeader(lines){
    let best=null;
    const limit=Math.min(lines.length, Math.max(12, Math.floor(lines.length*0.30)));
    for(let i=0;i<limit;i++){
      const score=headerScore(lines[i]);
      if(!best || score>best.score) best={index:i,line:lines[i],score};
    }
    return best && best.score>=14 ? best : null;
  }

  function makeColumns(headerLine){
    const a=headerLine.items.slice().sort((u,v)=>u.x-v.x);
    const cols=[];
    for(let i=0;i<a.length;i++){
      const cur=a[i], next=a[i+1];
      const curN=norm(cur.text), nextN=next?norm(next.text):'';
      if(curN==='sub' && nextN==='leader'){
        cols.push({label:'Sub Leader',center:(cur.x+cur.w/2 + next.x+next.w/2)/2,x:cur.x,w:(next.x+next.w)-cur.x});
        i++;
      } else {
        cols.push({label:clean(cur.text),center:cur.x+cur.w/2,x:cur.x,w:cur.w});
      }
    }
    return cols;
  }

  function boundaries(columns){
    const b=[];
    for(let i=0;i<columns.length-1;i++) b.push((columns[i].center+columns[i+1].center)/2);
    return b;
  }

  function assignLine(line, columns, bounds){
    const cells=Array.from({length:columns.length},()=>[]);
    for(const item of line.items){
      const xc=item.x+item.w/2;
      let idx=0;
      while(idx<bounds.length && xc>=bounds[idx]) idx++;
      if(idx<cells.length) cells[idx].push(item.text);
    }
    return cells.map(clean);
  }

  function isFooter(text){
    // Legacy helper retained for compatibility. It NEVER controls row removal.
    const t=norm(text);
    return !!t && (t.includes('page') || t.includes('total') || t.includes('weighbridge') ||
      t.includes('dailyreport') || t.includes('date'));
  }

  function pageBands(lines){
    if(!lines.length) return {headerLines:[], footerLines:[], bodyLines:[]};
    const ys=lines.map(l=>l.y), top=Math.max(...ys), bottom=Math.min(...ys);
    const span=Math.max(1,top-bottom);
    const headerCut=top-span*0.16;
    const footerCut=bottom+span*0.14;
    const headerLines=[], footerLines=[], bodyLines=[];
    for(const line of lines){
      if(line.y>=headerCut) headerLines.push(line);
      else if(line.y<=footerCut) footerLines.push(line);
      else bodyLines.push(line);
    }
    return {headerLines,footerLines,bodyLines};
  }

  function rowScore(cells){
    const first=clean(cells[0]), ticket=clean(cells[1]||''), truck=clean(cells[2]||'');
    let score=0;
    if(/^\d{1,5}$/.test(first)) score+=4;
    if(/^[A-Z0-9]{5,}$/i.test(ticket)) score+=2;
    if(/^[A-Z0-9 -]{4,}$/i.test(truck)) score+=1;
    if(/^\d{1,2}:\d{2}$/.test(cells[3]||'')) score+=1;
    if(/^\d{1,2}:\d{2}$/.test(cells[4]||'')) score+=1;
    if(/\d/.test(cells[5]||'')) score+=1;
    if(/\d/.test(cells[6]||'')) score+=1;
    if(/\d/.test(cells[7]||'')) score+=1;
    if(cells.filter(Boolean).length>=6) score+=2;
    return score;
  }

  function looksLikeDataRow(cells){
    return rowScore(cells)>=7;
  }

  function rowKey(cells){ return cells.map(clean).join('\u001F'); }

  function reconstructPage(items, schema){
    const lines=groupLines(items,3.2);
    const found=findHeader(lines);
    let columns=schema?.columns || null;
    let headerIndex=found ? found.index : -1;
    if(found){
      const detected=makeColumns(found.line);
      if(detected.length>=5) {
        if(!columns || detected.length>=columns.length-1) columns=detected;
        if(!schema) schema={columns};
      }
    }
    if(!columns || columns.length<5){
      const bands=pageBands(lines);
    return {headers:[],rows:[],rawLines:lines.map(l=>clean(l.items.map(i=>i.text).join(' '))),schema:null,quality:0,
      pageHeaderLines:bands.headerLines.map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean),
      pageFooterLines:bands.footerLines.map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean),
      layoutLines:lines.map(l=>({y:l.y,items:l.items.map(i=>({text:i.text,x:i.x,y:i.y,w:i.w,h:i.h}))}))};
    }

    const bounds=boundaries(columns), rows=[], rawLines=[];
    const bands=pageBands(lines);
    for(let i=0;i<lines.length;i++){
      const text=clean(lines[i].items.map(x=>x.text).join(' '));
      if(text) rawLines.push(text);
      // IMPORTANT: never drop a line merely because it is close to the PDF footer.
      // Data rows are accepted by structure/score, not by vertical position.
      if(i===headerIndex) continue;
      const cells=assignLine(lines[i],columns,bounds);
      if(looksLikeDataRow(cells)) rows.push(cells);
    }

    const quality=Math.min(100, Math.round(
      (columns.length>=8?35:20) +
      Math.min(35, rows.length) +
      (rows.length ? 20 : 0)
    ));
    return {
      headers:columns.map(c=>c.label),
      rows,
      rawLines,
      schema:{columns},
      quality,
      pageHeaderLines:bands.headerLines.map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean),
      pageFooterLines:bands.footerLines.map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean),
      layoutLines:lines.map(l=>({y:l.y,items:l.items.map(i=>({text:i.text,x:i.x,y:i.y,w:i.w,h:i.h}))}))
    };
  }

  async function ocrPage(pdf,pageNo,opts){
    if(!global.Tesseract) throw new Error('Tesseract.js belum termuat.');
    const viewport=pdf.getPage ? (await pdf.getPage(pageNo)).getViewport({scale:2.2}) : null;
    const page=await pdf.getPage(pageNo);
    const vp=page.getViewport({scale:Math.min(2.4,Math.max(1.7,1600/page.getViewport({scale:1}).width))});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(vp.width); canvas.height=Math.ceil(vp.height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:ctx,viewport:vp}).promise;
    const result=await global.Tesseract.recognize(canvas,opts.ocrLang||'eng',{
      logger:opts.onOcrProgress || undefined
    });
    const words=(result.data.words||[]).filter(w=>clean(w.text));
    return words.map(w=>({
      text:clean(w.text),
      x:w.bbox.x0,
      y:vp.height-w.bbox.y1,
      w:w.bbox.x1-w.bbox.x0,
      h:w.bbox.y1-w.bbox.y0
    }));
  }

  async function extractPdf(pdfjs,file,opts={}){
    if(!pdfjs) throw new Error('PDF.js belum termuat.');
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const pages=[];
    let schema=null;
    let totalTextRows=0;

    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const content=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});
      const result=reconstructPage(content.items,schema);
      if(result.schema && result.quality>=40 && !schema) schema=result.schema;
      pages.push({page:p,...result,mode:'text'});
      totalTextRows += result.rows.length;
    }

    const expectedLast = pages.flatMap(p=>p.rows).map(r=>Number(r[0])).filter(Number.isFinite).sort((a,b)=>b-a)[0] || 0;
    const needOcr=!!opts.ocr || (!!opts.autoOcr && (totalTextRows<2 || !schema));

    if(needOcr && global.Tesseract){
      for(const p of pages){
        const words=await ocrPage(pdf,p.page,opts);
        const result=reconstructPage(words,schema);
        p.ocrRawLines=result.rawLines;
        if(result.rows.length>p.rows.length || (p.rows.length<2 && result.rows.length)){
          p.headers=result.headers; p.rows=result.rows; p.schema=result.schema; p.quality=result.quality; p.mode='ocr';
          if(!schema && result.schema) schema=result.schema;
        }
      }
    }

    return {pdf,pages,schema,usedOcr:pages.some(p=>p.mode==='ocr'),expectedLast,
      pageHeaders:pages.map(p=>({page:p.page,lines:p.pageHeaderLines||[]})),
      pageFooters:pages.map(p=>({page:p.page,lines:p.pageFooterLines||[]}))};
  }

  function flattenTable(extracted){
    const headers=extracted.schema?.columns?.map(c=>c.label) ||
      extracted.pages.find(p=>p.headers?.length)?.headers || [];
    const rows=[], seen=new Set();
    for(const p of extracted.pages){
      for(const raw of (p.rows||[])){
        const r=raw.concat(Array(Math.max(0,headers.length-raw.length)).fill('')).slice(0,headers.length);
        const key=rowKey(r);
        if(!seen.has(key) && r.some(Boolean)){ seen.add(key); rows.push(r); }
      }
    }
    rows.sort((a,b)=>{
      const na=Number(a[0]), nb=Number(b[0]);
      return Number.isFinite(na)&&Number.isFinite(nb) ? na-nb : 0;
    });
    return {headers,rows};
  }

  global.IUConvert={
    groupLines,findHeader,makeColumns,assignLine,reconstructPage,pageBands,
    extractPdf,flattenTable,clean
  };
})(window);
