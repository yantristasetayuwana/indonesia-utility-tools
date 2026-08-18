/* Indonesia Utility Tools — Smart Conversion Engine v2.4
 * PDF -> Excel table engine focused on coordinate-aware extraction.
 * Guarantees: no row deduplication, page-to-page schema reuse, footer preservation,
 * stable column anchors, and browser-safe Blob download.
 */
(function(global){
  'use strict';
  const ALIASES={
    no:['no','no.','number'], ticket:['no.ticket','no ticket','ticket','ticket no','ticket number'],
    truck:['no.truck','no truck','truck','vehicle','vehicle no'], in:['in','masuk','start'], out:['out','keluar','finish'],
    gross:['gross','gross ton','gross(ton)','gross(tonnes)'], tare:['tarra','tara','tare','tarra ton','tara ton','tare ton','tarra(ton)','tara(ton)','tare(ton)'],
    net:['netto','net','netto ton','net(ton)','netto(ton)'], subleader:['sub leader','subleader'], leader:['leader']
  };
  const clean=s=>String(s??'').replace(/[\u0000-\u001F]+/g,' ').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const textOf=i=>clean(i?.str??i?.text??'');
  const xOf=i=>Number(i?.x??i?.transform?.[4]??0);
  const yOf=i=>Number(i?.y??i?.transform?.[5]??0);
  const wOf=i=>Math.abs(Number(i?.w??i?.width??0));
  const hOf=i=>Math.abs(Number(i?.h??i?.height??i?.transform?.[3]??10))||10;

  function groupLines(items,tolerance=3.6){
    const sorted=(items||[]).filter(i=>textOf(i)).map(i=>({text:textOf(i),x:xOf(i),y:yOf(i),w:wOf(i),h:hOf(i)}))
      .sort((a,b)=>(b.y-a.y)||(a.x-b.x));
    const lines=[];
    for(const item of sorted){
      let best=null,bestDiff=Infinity;
      for(const line of lines){
        const d=Math.abs(line.y-item.y);
        const lim=Math.max(tolerance,Math.min(item.h,line.h)*0.55);
        if(d<=lim&&d<bestDiff){best=line;bestDiff=d;}
      }
      if(!best) lines.push({y:item.y,h:item.h,items:[item]});
      else {best.items.push(item);best.h=Math.max(best.h,item.h);best.y=(best.y+item.y)/2;}
    }
    lines.sort((a,b)=>b.y-a.y); lines.forEach(l=>l.items.sort((a,b)=>a.x-b.x)); return lines;
  }
  function aliasHit(token){const n=norm(token);return Object.values(ALIASES).some(g=>g.some(a=>n===norm(a)));}
  function headerScore(line){
    const joined=norm(line.items.map(i=>i.text).join(' '));
    let hits=line.items.reduce((n,i)=>n+(aliasHit(i.text)?1:0),0);
    hits += ['noticket','notruck','subleader','grosston','tarraton','nettoton'].filter(x=>joined.includes(x)).length*2;
    return hits*4+Math.min(line.items.length,16)*0.2;
  }
  function findHeader(lines){
    let best=null; const limit=Math.min(lines.length,Math.max(25,Math.floor(lines.length*0.45)));
    for(let i=0;i<limit;i++){const score=headerScore(lines[i]);if(!best||score>best.score)best={index:i,line:lines[i],score};}
    return best&&best.score>=14?best:null;
  }
  function makeColumns(headerLine){
    const a=headerLine.items.slice().sort((u,v)=>u.x-v.x),cols=[];
    for(let i=0;i<a.length;i++){
      const cur=a[i],next=a[i+1];
      if(next&&norm(cur.text)==='sub'&&norm(next.text)==='leader'){
        cols.push({label:'Sub Leader',center:((cur.x+cur.w/2)+(next.x+next.w/2))/2,x:cur.x,w:(next.x+next.w)-cur.x});i++;
      }else cols.push({label:clean(cur.text),center:cur.x+cur.w/2,x:cur.x,w:cur.w});
    }
    return cols;
  }
  function boundaries(cols){return cols.slice(0,-1).map((c,i)=>(c.center+cols[i+1].center)/2);}

  function assignLine(line,cols,bounds){
    const cells=Array.from({length:cols.length},()=>[]);
    for(const item of line.items){
      const xc=item.x+item.w/2; let idx=0; while(idx<bounds.length&&xc>=bounds[idx])idx++;
      cells[idx].push(item.text);
    }
    return cells.map(c=>clean(c.join(' ')));
  }
  function looksLikeRow(line,cols,bounds){
    if(!line?.items?.length)return false;
    const first=line.items[0];
    const n=clean(first.text).replace(/[.]$/,'');
    if(/^\d{1,6}$/.test(n) && first.x < cols[0].center+18) return true;
    const cells=assignLine(line,cols,bounds);
    return /^\d{1,6}$/.test(cells[0]) && !!cells[1];
  }
  function rowFromLine(line,cols,bounds){
    const cells=assignLine(line,cols,bounds);
    // Defensive repair: if the first cell contains a leading row number plus ticket,
    // split only at the first numeric token; never shift later columns.
    const m=cells[0].match(/^(\d{1,6})\s+(.+)$/);
    if(m){
      cells[0]=m[1];
      if(!cells[1])cells[1]=m[2];
    }
    return cells;
  }
  function reconstructPage(items,schema){
    const lines=groupLines(items,3.6), found=findHeader(lines);
    let cols=schema?.columns||null, headerIndex=found?found.index:-1;
    if(found){const detected=makeColumns(found.line);if(detected.length>=8){if(!cols)cols=detected;else if(detected.length===cols.length) cols=cols.map((c,i)=>({...c,label:detected[i].label}));}}
    const rawLines=lines.map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean);
    if(!cols||cols.length<8)return {headers:[],rows:[],rawLines,headerLines:[],footerLines:rawLines,schema:null,quality:0};
    const bounds=boundaries(cols),rows=[],layout=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i], raw=clean(line.items.map(x=>x.text).join(' '));
      if(!raw)continue;
      if(i===headerIndex){layout.push({type:'HEADER',text:raw});continue;}
      if(looksLikeRow(line,cols,bounds)){
        const cells=rowFromLine(line,cols,bounds);rows.push(cells);layout.push({type:'DATA',text:raw,cells});
      }else layout.push({type:'OTHER',text:raw});
    }
    const headerLines=layout.filter(x=>x.type==='HEADER').map(x=>x.text);
    const footerLines=layout.filter(x=>x.type==='OTHER').map(x=>x.text);
    return {headers:cols.map(c=>c.label),rows,rawLines,headerLines,footerLines,schema:{columns:cols},layout,quality:rows.length?100:10};
  }

  async function ocrPage(pdf,pageNo,opts){
    if(!global.Tesseract)throw new Error('Tesseract.js belum termuat.');
    const pg=await pdf.getPage(pageNo),base=pg.getViewport({scale:1}),scale=Math.min(2.8,Math.max(2,1600/base.width)),vp=pg.getViewport({scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await pg.render({canvasContext:ctx,viewport:vp}).promise;
    const result=await global.Tesseract.recognize(canvas,opts.ocrLang||'eng',{logger:opts.onOcrProgress||undefined});
    return (result.data.words||[]).filter(w=>clean(w.text)).map(w=>({text:clean(w.text),x:w.bbox.x0,y:vp.height-w.bbox.y1,w:w.bbox.x1-w.bbox.x0,h:w.bbox.y1-w.bbox.y0}));
  }
  async function extractPdf(pdfjs,file,opts={}){
    if(!pdfjs)throw new Error('PDF.js belum termuat.');
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pages=[];let schema=null;
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p),content=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});
      const result=reconstructPage(content.items,schema);
      if(result.schema&&!schema)schema=result.schema;
      pages.push({page:p,...result,mode:'text'});
    }
    const weak=!schema||pages.some(p=>p.rows.length===0);
    if((opts.ocr||opts.autoOcr&&weak)&&global.Tesseract){
      for(const p of pages){if(p.rows.length&&!opts.ocr)continue;const words=await ocrPage(pdf,p.page,opts);const result=reconstructPage(words,schema);p.ocrRawLines=result.rawLines;if(result.rows.length>p.rows.length)Object.assign(p,result,{mode:'ocr'});}
    }
    return {pdf,pages,schema,usedOcr:pages.some(p=>p.mode==='ocr')};
  }
  function flattenTable(extracted){
    const headers=extracted.schema?.columns?.map(c=>c.label)||extracted.pages.find(p=>p.headers?.length)?.headers||[];
    const rows=[];for(const p of extracted.pages)for(const r of p.rows||[])rows.push(r.concat(Array(Math.max(0,headers.length-r.length)).fill('')).slice(0,headers.length));
    return {headers,rows};
  }
  global.IULocalConvert={groupLines,findHeader,makeColumns,assignLine,reconstructPage,extractPdf,flattenTable,clean};
})(window);
