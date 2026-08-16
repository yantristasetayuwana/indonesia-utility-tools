/* Indonesia Utility Tools — Smart Document Conversion Engine v2.0
 * Browser-first, generic document reconstruction engine.
 * Pipeline: extraction -> parsing -> validation -> structure -> output adapter.
 * OCR is explicit: it never runs just because the parser found a weak table.
 */
(function(global){
  'use strict';
  const HEADER_WORDS = new Set([
    'no','no.','number','id','date','tanggal','time','waktu','ticket','no.ticket','no.truck',
    'truck','vehicle','item','description','desc','qty','quantity','unit','price','amount',
    'total','subtotal','gross','gross(ton)','netto','net','netto(ton)','tara','tara(ton)','in','out',
    'leader','sub','name','supplier','customer','status','code','kode','part','product','po','grn',
    'transfer','requester','location','warehouse','category','alamat','phone','email','terima','pcs'
  ]);
  const COMPOUNDS = new Set([
    'sub leader','no ticket','no truck','invoice no','item code','unit price','grand total',
    'net amount','gross weight','tare weight','no. po','no. grn','no. transfer','part number',
    'qty terima','date time','start date','end date','unit cost','total amount','phone number'
  ]);

  function clean(s){ return String(s ?? '').replace(/[\u0000-\u001F]+/g,' ').replace(/\s+/g,' ').trim(); }
  function num(v,d=0){ const n=Number(v); return Number.isFinite(n)?n:d; }
  function normKey(s){ return clean(s).toLowerCase().replace(/[,:;]+$/,''); }

  function groupLines(items,yTol=2.2){
    const usable=(items||[]).filter(x=>clean(x.str ?? x.text));
    const lines=[];
    for(const raw of usable){
      const text=clean(raw.str ?? raw.text);
      const x=num(raw.x ?? raw.transform?.[4]);
      const y=num(raw.y ?? raw.transform?.[5]);
      const h=Math.abs(num(raw.h ?? raw.height ?? raw.transform?.[3],10))||10;
      const w=Math.max(0,num(raw.w ?? raw.width));
      let line=null;
      for(const l of lines){ if(Math.abs(l.y-y)<=Math.max(yTol,h*.30)){line=l;break;} }
      if(!line){line={y,items:[]};lines.push(line);}
      line.items.push({x,y,w,h,text});
    }
    lines.sort((a,b)=>b.y-a.y);
    for(const l of lines) l.items.sort((a,b)=>a.x-b.x);
    return lines;
  }
  function lineText(line){ return clean((line.items||[]).map(x=>x.text).join(' ')); }
  function headerScore(line){
    const tokens=normKey(lineText(line)).split(/\s+/).filter(Boolean);
    const hits=tokens.filter(t=>HEADER_WORDS.has(t)).length;
    const numericLike=tokens.filter(t=>/^\d+$/.test(t)).length;
    return hits*5 + Math.min((line.items||[]).length,14)*.35 - numericLike*1.5;
  }
  function findHeader(lines){
    let best=null,bestScore=0;
    const limit=Math.max(1,Math.floor(lines.length*.55));
    for(let i=0;i<Math.min(lines.length,limit);i++){
      const s=headerScore(lines[i]);
      if(s>bestScore){bestScore=s;best={index:i,line:lines[i],score:s};}
    }
    return best && best.score>=5 ? best : null;
  }
  function makeCenters(headerLine){
    const a=(headerLine.items||[]).slice().sort((x,y)=>x.x-y.x);
    if(!a.length) return [];
    // Keep visual columns separate by default. Only merge adjacent header fragments
    // when their horizontal gap is clearly smaller than the normal header gap.
    const gaps=[];
    for(let i=1;i<a.length;i++) gaps.push(Math.max(0,a[i].x-(a[i-1].x+a[i-1].w)));
    const sorted=gaps.slice().sort((x,y)=>x-y);
    const median=sorted.length?sorted[Math.floor(sorted.length/2)]:0;
    const mergeThreshold=Math.max(2,median*0.42);
    const merged=[];
    for(const item of a){
      const last=merged[merged.length-1];
      const gap=last?Math.max(0,item.x-(last.x+last.w)):Infinity;
      const candidate=last?normKey(last.text+' '+item.text):'';
      if(last && COMPOUNDS.has(candidate) && gap<=mergeThreshold){
        last.text=clean(last.text+' '+item.text);
        last.w=(item.x+item.w)-last.x;
      }else merged.push({...item});
    }
    return merged.map(x=>({label:x.text,center:x.x+Math.max(1,x.w)/2,x:x.x,w:x.w}));
  }
  function boundaries(centers){ const b=[]; for(let i=0;i<centers.length-1;i++) b.push((centers[i].center+centers[i+1].center)/2); return b; }
  function assignLine(line,centers,bounds){
    const cells=Array.from({length:centers.length},()=>[]);
    for(const item of line.items||[]){
      const xc=item.x+Math.max(0,item.w)/2;
      let idx=0; while(idx<bounds.length && xc>=bounds[idx]) idx++;
      cells[idx].push(item.text);
    }
    return cells.map(clean);
  }
  function looksLikeDataRow(cells){
    const first=clean(cells[0]);
    if(/^\d{1,6}$/.test(first)) return true;
    if(/^[A-Z]{1,10}[-_/]?[A-Z0-9]{2,}/i.test(first)) return true;
    if(/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(first)) return true;
    if(/^\d{1,2}:\d{2}/.test(first)) return true;
    return cells.filter(Boolean).length>=3;
  }
  function refineCenters(lines,headerIndex,centers){
    if(!centers || centers.length<2) return centers;
    const k=centers.length,samples=[],seedBounds=boundaries(centers);
    for(let i=Math.max(0,headerIndex+1);i<lines.length && samples.length<180;i++){
      const cells=assignLine(lines[i],centers,seedBounds);
      if(looksLikeDataRow(cells)){
        for(let c=0;c<k;c++){
          const xs=(lines[i].items||[]).filter(it=>{
            const xc=it.x+Math.max(0,it.w)/2; let idx=0; while(idx<seedBounds.length && xc>=seedBounds[idx]) idx++; return idx===c;
          }).map(it=>it.x+Math.max(0,it.w)/2).sort((a,b)=>a-b);
          if(xs.length) samples.push({c,x:xs[Math.floor(xs.length/2)]});
        }
      }
    }
    const out=centers.map((c,i)=>{ const vals=samples.filter(s=>s.c===i).map(s=>s.x).sort((a,b)=>a-b); if(vals.length<3)return c; const med=vals[Math.floor(vals.length/2)]; return {...c,center:c.center*.35+med*.65}; });
    out.sort((a,b)=>a.center-b.center); return out;
  }
  function reconstructPage(items,schema){
    const lines=groupLines(items,2.2),found=findHeader(lines);
    let centers=schema?.centers||null,headers=schema?.headers||null,headerIndex=found?.index ?? -1;
    if(found){ centers=makeCenters(found.line); headers=centers.map(x=>x.label); headerIndex=found.index; centers=refineCenters(lines,headerIndex,centers); }
    if(!centers || centers.length<2) return {headers:headers||[],rows:[],rawLines:lines.map(lineText),schema:schema||null,quality:0,headerIndex};
    const bounds=boundaries(centers),rows=[];
    for(let i=Math.max(0,headerIndex+1);i<lines.length;i++){
      const cells=assignLine(lines[i],centers,bounds);
      if(looksLikeDataRow(cells)) rows.push(cells);
    }
    const nonEmpty=rows.filter(r=>r.filter(Boolean).length>=2).length;
    const quality=Math.min(100,(headers.length>=3?30:10)+Math.min(40,nonEmpty*2)+(rows.length?20:0));
    return {headers,rows,rawLines:lines.map(lineText),schema:{headers,centers},quality,headerIndex};
  }

  async function extractPdf(pdfjs,file,opts={}){
    if(!pdfjs || typeof pdfjs.getDocument!=='function') throw new Error('PDF.js belum termuat.');
    if(!file) throw new Error('File PDF belum dipilih.');
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer(),useWorkerFetch:true,isEvalSupported:true}).promise;
    const pages=[]; let schema=null,textQuality=0, textErrors=0;
    for(let p=1;p<=pdf.numPages;p++){
      try{
        const page=await pdf.getPage(p);
        const content=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});
        const result=reconstructPage(content.items,schema);
        if(result.schema && result.quality>=25){schema=result.schema;textQuality+=result.quality;}
        pages.push({page:p,...result,mode:'text',error:null});
      }catch(err){
        textErrors++;
        pages.push({page:p,headers:schema?.headers||[],rows:[],rawLines:[],schema,quality:0,mode:'text',error:String(err?.message||err)});
      }
    }
    // OCR is explicit. Never auto-start Tesseract because a parser result is weak.
    const useOcr=opts.ocr===true;
    if(useOcr){
      if(!global.Tesseract || typeof global.Tesseract.recognize!=='function') throw new Error('OCR engine belum termuat. Pastikan koneksi internet aktif lalu refresh halaman.');
      for(const p of pages){
        try{
          const page=await pdf.getPage(p.page);
          const base=page.getViewport({scale:1});
          const scale=Math.min(2.4,Math.max(1.5,1600/Math.max(1,base.width)));
          const viewport=page.getViewport({scale});
          const canvas=document.createElement('canvas'); canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          await page.render({canvasContext:ctx,viewport}).promise;
          const result=await global.Tesseract.recognize(canvas,opts.ocrLang||'eng',{logger:opts.onOcrProgress||undefined});
          const words=(result.data.words||[]).filter(w=>clean(w.text));
          const items=words.map(w=>({text:clean(w.text),x:w.bbox.x0,y:viewport.height-w.bbox.y1,w:w.bbox.x1-w.bbox.x0,h:w.bbox.y1-w.bbox.y0}));
          const ocrResult=reconstructPage(items,p.schema||schema);
          p.ocrRawLines=ocrResult.rawLines;
          p.ocrConfidence=Number(result.data.confidence||0);
          if(ocrResult.rows.length>p.rows.length || (!p.rows.length && ocrResult.rawLines.length)){
            p.headers=ocrResult.headers; p.rows=ocrResult.rows; p.schema=ocrResult.schema; p.quality=ocrResult.quality; p.mode='ocr';
            if(ocrResult.schema && (!schema || !schema.headers?.length)) schema=ocrResult.schema;
          }
          canvas.width=1;canvas.height=1;
        }catch(err){ p.ocrError=String(err?.message||err); }
      }
    }
    return {pdf,pages,schema,usedOcr:pages.some(p=>p.mode==='ocr'),textQuality,textErrors,ocrRequested:useOcr};
  }

  function flattenTable(extracted){
    const headers=extracted?.schema?.headers || extracted?.pages?.find(p=>p.headers?.length)?.headers || [];
    const rows=[];
    for(const p of extracted?.pages||[]){
      for(const r of p.rows||[]) rows.push(r.concat(Array(Math.max(0,headers.length-r.length)).fill('')).slice(0,headers.length));
    }
    return {headers,rows};
  }
  function rawText(extracted){
    const out=[]; for(const p of extracted?.pages||[]){ for(const line of (p.ocrRawLines||p.rawLines||[])) if(clean(line)) out.push([p.page,p.mode,clean(line)]); } return out;
  }
  function validate(extracted){
    const t=flattenTable(extracted), expected=t.headers.length;
    const validHeader=expected>=2, rows=t.rows.length;
    const inconsistent=t.rows.filter(r=>r.length!==expected).length;
    return {validHeader,rows,columns:expected,inconsistent,score:Math.max(0,Math.min(100,(validHeader?45:10)+(rows?35:0)+(inconsistent===0?20:5)))};
  }
  global.IUConvert={groupLines,findHeader,makeCenters,assignLine,reconstructPage,extractPdf,flattenTable,rawText,validate,clean};
})(window);
