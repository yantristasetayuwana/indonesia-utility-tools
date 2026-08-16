/* Indonesia Utility Tools — Smart Document Conversion Engine v1.4
 * Generic document reconstruction engine.
 * - PDF text-layer extraction
 * - Geometry-aware table reconstruction
 * - OCR fallback for scanned/image PDFs
 * - No hard-coded report template
 */
(function(global){
  'use strict';
  const HEADER_WORDS = new Set([
    'no','no.','number','id','date','tanggal','time','waktu','ticket','no.ticket','no.truck',
    'truck','vehicle','item','description','desc','qty','quantity','unit','price','amount',
    'total','subtotal','gross','gross(ton)','netto','net','netto(ton)','tara','tara(ton)','in','out',
    'leader','sub','name','supplier','customer','status','code','kode','part','product','po','grn',
    'transfer','requester','location','warehouse','category','alamat','phone','email'
  ]);
  const COMPOUNDS = new Set([
    'sub leader','no ticket','no truck','invoice no','item code','unit price','grand total',
    'net amount','gross weight','tare weight','no. po','no. grn','no. transfer','part number',
    'qty terima','date time','start date','end date','unit cost','total amount','phone number'
  ]);

  function clean(s){ return String(s ?? '').replace(/[\u0000-\u001F]+/g,' ').replace(/\s+/g,' ').trim(); }
  function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
  function normKey(s){ return clean(s).toLowerCase().replace(/[,:;]+$/,''); }

  function groupLines(items, yTol){
    const usable=(items||[]).filter(x=>clean(x.str ?? x.text));
    const lines=[];
    for(const raw of usable){
      const text=clean(raw.str ?? raw.text);
      const x=num(raw.x ?? raw.transform?.[4]);
      const y=num(raw.y ?? raw.transform?.[5]);
      const h=Math.abs(num(raw.h ?? raw.height ?? raw.transform?.[3],10))||10;
      const w=num(raw.w ?? raw.width);
      let line=null;
      for(const l of lines){ if(Math.abs(l.y-y)<=Math.max(yTol||2,h*.30)){line=l;break;} }
      if(!line){line={y,items:[]};lines.push(line);}
      line.items.push({x,y,w,h,text});
    }
    lines.sort((a,b)=>b.y-a.y);
    for(const l of lines) l.items.sort((a,b)=>a.x-b.x);
    return lines;
  }
  function lineText(line){ return clean(line.items.map(x=>x.text).join(' ')); }
  function headerScore(line){
    const txt=normKey(lineText(line));
    const tokens=txt.split(/\s+/).filter(Boolean);
    const hits=tokens.filter(t=>HEADER_WORDS.has(t) || [...HEADER_WORDS].some(k=>t===k)).length;
    const numericLike=tokens.filter(t=>/^\d+$/.test(t)).length;
    return hits*5 + Math.min(line.items.length,14)*.35 - numericLike*1.5;
  }
  function findHeader(lines){
    let best=null,bestScore=0;
    const limit=Math.max(1,Math.floor(lines.length*.45));
    for(let i=0;i<Math.min(lines.length,limit);i++){
      const s=headerScore(lines[i]);
      if(s>bestScore){bestScore=s;best={index:i,line:lines[i],score:s};}
    }
    return best && best.score>=5 ? best : null;
  }
  function makeCenters(headerLine){
    const a=headerLine.items.slice().sort((x,y)=>x.x-y.x);
    const merged=[];
    for(const item of a){
      const last=merged[merged.length-1];
      const candidate=last?normKey(last.text+' '+item.text):'';
      if(last && COMPOUNDS.has(candidate)){
        last.text=clean(last.text+' '+item.text);
        last.w=(item.x+item.w)-last.x;
      }else merged.push({...item});
    }
    return merged.map(x=>({label:x.text,center:x.x+x.w/2,x:x.x,w:x.w}));
  }
  function boundaries(centers){
    const b=[]; for(let i=0;i<centers.length-1;i++) b.push((centers[i].center+centers[i+1].center)/2); return b;
  }
  function assignLine(line, centers, bounds){
    const cells=Array.from({length:centers.length},()=>[]);
    for(const item of line.items){
      const xc=item.x+item.w/2;
      let idx=0; while(idx<bounds.length && xc>=bounds[idx]) idx++;
      cells[idx].push(item.text);
    }
    return cells.map(clean);
  }
  function looksLikeDataRow(cells){
    const first=clean(cells[0]);
    if(/^\d{1,5}$/.test(first)) return true;
    if(/^[A-Z]{1,10}[-_/]?[A-Z0-9]{2,}/i.test(first)) return true;
    if(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(first)) return true;
    if(/^\d{1,2}:\d{2}/.test(first)) return true;
    return cells.filter(Boolean).length>=3;
  }

  // Refine column centers from repeated data rows. Header positions are the primary source;
  // repeated rows help when a PDF exporter slightly shifts or fragments the header.
  function refineCenters(lines, headerIndex, centers){
    if(!centers || centers.length<2) return centers;
    const k=centers.length, samples=[];
    const seedBounds=boundaries(centers);
    for(let i=headerIndex+1;i<lines.length && samples.length<120;i++){
      const cells=assignLine(lines[i],centers,seedBounds);
      if(looksLikeDataRow(cells)){
        for(let c=0;c<k;c++){
          const items=lines[i].items.filter(it=>{
            const xc=it.x+it.w/2; let idx=0; while(idx<seedBounds.length && xc>=seedBounds[idx]) idx++; return idx===c;
          });
          if(items.length){
            const xs=items.map(it=>it.x+it.w/2).sort((a,b)=>a-b);
            samples.push({c,x:xs[Math.floor(xs.length/2)]});
          }
        }
      }
    }
    const out=centers.map((c,i)=>{ const vals=samples.filter(s=>s.c===i).map(s=>s.x); if(vals.length<3)return c; vals.sort((a,b)=>a-b); const med=vals[Math.floor(vals.length/2)]; return {...c,center:c.center*.35+med*.65}; });
    out.sort((a,b)=>a.center-b.center);
    return out;
  }

  function reconstructPage(items, schema){
    const lines=groupLines(items,2.2);
    const found=findHeader(lines);
    let centers=schema?.centers||null, headers=schema?.headers||null, headerIndex=found?.index ?? -1;
    if(found){
      centers=makeCenters(found.line);
      headers=centers.map(x=>x.label);
      headerIndex=found.index;
      centers=refineCenters(lines,headerIndex,centers);
    }
    if(!centers || centers.length<2) return {headers:[],rows:[],rawLines:lines.map(lineText),schema:null,quality:0};
    const bounds=boundaries(centers), rows=[];
    for(let i=headerIndex+1;i<lines.length;i++){
      const cells=assignLine(lines[i],centers,bounds);
      if(looksLikeDataRow(cells)) rows.push(cells);
    }
    const nonEmpty=rows.filter(r=>r.filter(Boolean).length>=2).length;
    const quality=Math.min(100, (headers.length>=3?30:10) + Math.min(40,nonEmpty*2) + (rows.length?20:0));
    return {headers,rows,rawLines:lines.map(lineText),schema:{headers,centers},quality};
  }

  async function extractPdf(pdfjs,file,opts={}){
    if(!pdfjs) throw new Error('PDF.js belum termuat.');
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const pages=[]; let schema=null; let textQuality=0;
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p); const content=await page.getTextContent({normalizeWhitespace:false});
      const result=reconstructPage(content.items,schema);
      if(result.schema && result.quality>=25){schema=result.schema;textQuality+=result.quality;}
      pages.push({page:p,...result,mode:'text'});
    }
    const tableRows=pages.reduce((n,p)=>n+p.rows.length,0);
    const needOcr=!!opts.ocr || (!!opts.autoOcr && (tableRows<2 || !schema));
    if(needOcr && global.Tesseract){
      for(const p of pages){
        const page=await pdf.getPage(p.page);
        const viewport=page.getViewport({scale:Math.min(2.2,Math.max(1.6,1600/page.getViewport({scale:1}).width))});
        const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        await page.render({canvasContext:ctx,viewport}).promise;
        const result=await global.Tesseract.recognize(canvas,opts.ocrLang||'eng',{
          logger:opts.onOcrProgress||undefined
        });
        const words=(result.data.words||[]).filter(w=>clean(w.text));
        const items=words.map(w=>({text:clean(w.text),x:w.bbox.x0,y:viewport.height-w.bbox.y1,w:w.bbox.x1-w.bbox.x0,h:w.bbox.y1-w.bbox.y0}));
        const ocrResult=reconstructPage(items,null);
        p.ocrRawLines=ocrResult.rawLines;
        if(ocrResult.rows.length>p.rows.length || (p.rows.length<2 && ocrResult.rows.length)){
          p.headers=ocrResult.headers; p.rows=ocrResult.rows; p.schema=ocrResult.schema; p.quality=ocrResult.quality; p.mode='ocr';
          if(ocrResult.schema && !schema) schema=ocrResult.schema;
        }
      }
    }
    return {pdf,pages,schema,usedOcr:pages.some(p=>p.mode==='ocr'),textQuality};
  }

  function flattenTable(extracted){
    const headers=extracted.schema?.headers || extracted.pages.find(p=>p.headers?.length)?.headers || [];
    const rows=[];
    for(const p of extracted.pages){
      for(const r of p.rows||[]) rows.push(r.concat(Array(Math.max(0,headers.length-r.length)).fill('')).slice(0,headers.length));
    }
    return {headers,rows};
  }
  function rawText(extracted){
    const out=[]; for(const p of extracted.pages){ for(const line of (p.ocrRawLines||p.rawLines||[])) if(clean(line)) out.push([p.page,clean(line)]); } return out;
  }
  global.IUConvert={groupLines,findHeader,makeCenters,assignLine,reconstructPage,extractPdf,flattenTable,rawText,clean};
})(window);
