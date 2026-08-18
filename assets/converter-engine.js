/* Indonesia Utility Tools — Smart Document Conversion Engine v2.3
 * Stable table extraction for digital PDFs.
 * Principle: never discard a row just because it is close to a footer.
 */
(function(global){
  'use strict';

  const ALIASES = {
    no: ['no','no.','number'], ticket:['no.ticket','no ticket','ticket','ticket no','ticket number'],
    truck:['no.truck','no truck','truck','vehicle','vehicle no'], in:['in','masuk','start'], out:['out','keluar','finish'],
    gross:['gross','gross ton','gross(ton)','gross(tonnes)'], tare:['tarra','tara','tare','tarra ton','tara ton','tare ton','tarra(ton)','tara(ton)','tare(ton)'],
    net:['netto','net','netto ton','net(ton)','netto(ton)'], subleader:['sub leader','subleader'], leader:['leader']
  };

  const clean = s => String(s ?? '').replace(/[\u0000-\u001F]+/g,' ').replace(/\s+/g,' ').trim();
  const norm = s => clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'');
  const textOf = i => clean(i?.str ?? i?.text ?? '');
  const xOf = i => Number(i?.x ?? i?.transform?.[4] ?? 0);
  const yOf = i => Number(i?.y ?? i?.transform?.[5] ?? 0);
  const wOf = i => Math.abs(Number(i?.w ?? i?.width ?? 0));
  const hOf = i => Math.abs(Number(i?.h ?? i?.height ?? i?.transform?.[3] ?? 10)) || 10;

  function groupLines(items, tolerance=4.5){
    const sorted=(items||[]).filter(i=>textOf(i)).map(i=>({text:textOf(i),x:xOf(i),y:yOf(i),w:wOf(i),h:hOf(i)}))
      .sort((a,b)=>(b.y-a.y)||(a.x-b.x));
    const lines=[];
    for(const item of sorted){
      let best=null, bestDiff=Infinity;
      for(const line of lines){
        const d=Math.abs(line.y-item.y);
        const lim=Math.max(tolerance,Math.min(item.h,line.h)*0.65);
        if(d<=lim && d<bestDiff){best=line;bestDiff=d;}
      }
      if(!best) lines.push({y:item.y,h:item.h,items:[item]});
      else {best.items.push(item);best.h=Math.max(best.h,item.h);best.y=(best.y+item.y)/2;}
    }
    lines.sort((a,b)=>b.y-a.y);
    lines.forEach(l=>l.items.sort((a,b)=>a.x-b.x));
    return lines;
  }

  function aliasHit(token){
    const n=norm(token);
    return Object.values(ALIASES).some(group=>group.some(a=>n===norm(a)));
  }

  function headerScore(line){
    const joined=norm(line.items.map(i=>i.text).join(' '));
    let hits=line.items.reduce((n,i)=>n+(aliasHit(i.text)?1:0),0);
    hits += ['noticket','notruck','subleader','grosston','tarraton','nettoton'].filter(x=>joined.includes(x)).length*2;
    return hits*4 + Math.min(line.items.length,14)*0.25;
  }

  function findHeader(lines){
    let best=null;
    const limit=Math.min(lines.length,Math.max(20,Math.floor(lines.length*0.5)));
    for(let i=0;i<limit;i++){
      const score=headerScore(lines[i]);
      if(!best||score>best.score)best={index:i,line:lines[i],score};
    }
    return best&&best.score>=14?best:null;
  }

  function makeColumns(headerLine){
    const a=headerLine.items.slice().sort((u,v)=>u.x-v.x), cols=[];
    for(let i=0;i<a.length;i++){
      const cur=a[i], next=a[i+1];
      if(next && norm(cur.text)==='sub' && norm(next.text)==='leader'){
        cols.push({label:'Sub Leader',center:((cur.x+cur.w/2)+(next.x+next.w/2))/2,x:cur.x,w:(next.x+next.w)-cur.x}); i++;
      } else cols.push({label:clean(cur.text),center:cur.x+cur.w/2,x:cur.x,w:cur.w});
    }
    return cols;
  }

  const boundaries=columns=>columns.slice(0,-1).map((c,i)=>(c.center+columns[i+1].center)/2);

  function assignLine(line,columns,bounds){
    const cells=Array.from({length:columns.length},()=>[]);
    for(const item of line.items){
      const xc=item.x+item.w/2; let idx=0;
      while(idx<bounds.length && xc>=bounds[idx])idx++;
      cells[idx].push(item.text);
    }
    return cells.map(cell=>clean(cell.join(' ')));
  }

  function rowScore(cells){
    const first=clean(cells[0]), ticket=clean(cells[1]||''), truck=clean(cells[2]||''); let score=0;
    if(/^\d{1,5}$/.test(first))score+=6;
    if(/^[A-Z0-9]{5,}$/i.test(ticket))score+=2;
    if(/^[A-Z0-9 -]{4,}$/i.test(truck))score+=1;
    if(/^\d{1,2}:\d{2}$/.test(cells[3]||''))score+=1;
    if(/^\d{1,2}:\d{2}$/.test(cells[4]||''))score+=1;
    if(/\d/.test(cells[5]||''))score++;
    if(/\d/.test(cells[6]||''))score++;
    if(/\d/.test(cells[7]||''))score++;
    if(cells.filter(Boolean).length>=5)score+=2;
    return score;
  }

  function isDataRow(cells){
    const first=clean(cells[0]);
    // Strong anchor: this report's first column is a sequential numeric row number.
    // Generic fallback keeps non-numbered tables working.
    if(/^\d{1,6}$/.test(first) && cells.filter(Boolean).length>=2)return true;
    return rowScore(cells)>=7;
  }

  function rowKey(cells){return cells.map(clean).join('\u001F');}

  function reconstructPage(items,schema){
    const lines=groupLines(items,4.5);
    const found=findHeader(lines);
    let columns=schema?.columns||null, headerIndex=found?found.index:-1;
    if(found){
      const detected=makeColumns(found.line);
      if(detected.length>=5){
        if(!columns || detected.length>=columns.length) columns=detected;
        if(!schema) schema={columns};
      }
    }
    const rawLines=lines.map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean);
    if(!columns||columns.length<5)return {headers:[],rows:[],rawLines,headerLines:found?[rawLines[headerIndex]]:[],footerLines:[],schema:null,quality:0};

    const bounds=boundaries(columns), rows=[];
    for(let i=0;i<lines.length;i++){
      if(i===headerIndex)continue;
      const cells=assignLine(lines[i],columns,bounds);
      if(isDataRow(cells)) rows.push(cells);
    }

    // Preserve page material instead of deleting it. Only classify it for export diagnostics.
    const headerLines=found?lines.slice(Math.max(0,headerIndex-3),headerIndex+1).map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean):[];
    const footerLines=lines.filter((l,i)=>i!==headerIndex && !isDataRow(assignLine(l,columns,bounds)))
      .map(l=>clean(l.items.map(i=>i.text).join(' '))).filter(Boolean).slice(0,12);
    return {headers:columns.map(c=>c.label),rows,rawLines,headerLines,footerLines,schema:{columns},quality:rows.length?100:20};
  }

  async function ocrPage(pdf,pageNo,opts){
    if(!global.Tesseract)throw new Error('Tesseract.js belum termuat.');
    const page=await pdf.getPage(pageNo);
    const base=page.getViewport({scale:1});
    const scale=Math.min(2.6,Math.max(1.8,1600/base.width));
    const vp=page.getViewport({scale});
    const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:ctx,viewport:vp}).promise;
    const result=await global.Tesseract.recognize(canvas,opts.ocrLang||'eng',{logger:opts.onOcrProgress||undefined});
    return (result.data.words||[]).filter(w=>clean(w.text)).map(w=>({text:clean(w.text),x:w.bbox.x0,y:vp.height-w.bbox.y1,w:w.bbox.x1-w.bbox.x0,h:w.bbox.y1-w.bbox.y0}));
  }

  async function extractPdf(pdfjs,file,opts={}){
    if(!pdfjs)throw new Error('PDF.js belum termuat. Refresh halaman dan coba lagi.');
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    const pages=[];let schema=null;
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);
      const content=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});
      let result=reconstructPage(content.items,schema);
      if(result.schema && !schema)schema=result.schema;
      pages.push({page:p,...result,mode:'text'});
    }
    const needOcr=!!opts.ocr || (!!opts.autoOcr && (!schema || pages.some(p=>p.rows.length===0)));
    if(needOcr && global.Tesseract){
      for(const p of pages){
        if(p.rows.length && !opts.ocr)continue;
        const words=await ocrPage(pdf,p.page,opts);
        const result=reconstructPage(words,schema);
        p.ocrRawLines=result.rawLines;
        if(result.rows.length>p.rows.length){Object.assign(p,result,{mode:'ocr'});if(!schema&&result.schema)schema=result.schema;}
      }
    }
    return {pdf,pages,schema,usedOcr:pages.some(p=>p.mode==='ocr')};
  }

  function flattenTable(extracted){
    const headers=extracted.schema?.columns?.map(c=>c.label)||extracted.pages.find(p=>p.headers?.length)?.headers||[];
    const rows=[],seen=new Set();
    for(const p of extracted.pages){
      for(const raw of p.rows||[]){
        const r=raw.concat(Array(Math.max(0,headers.length-raw.length)).fill('')).slice(0,headers.length);
        const key=rowKey(r);if(!seen.has(key)&&r.some(Boolean)){seen.add(key);rows.push(r);}
      }
    }
    const numeric=rows.filter(r=>/^\d+$/.test(clean(r[0])));
    if(numeric.length===rows.length)rows.sort((a,b)=>Number(a[0])-Number(b[0]));
    return {headers,rows};
  }

  global.IUConvert={groupLines,findHeader,makeColumns,assignLine,reconstructPage,extractPdf,flattenTable,clean};
})(window);
