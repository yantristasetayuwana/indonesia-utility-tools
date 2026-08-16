/* Indonesia Utility Tools — Smart Document Conversion Engine v1.3
 * Generic PDF text/table reconstruction. It does not depend on a specific report template.
 */
(function(global){
  'use strict';
  const HEADER_WORDS = new Set([
    'no','no.','number','id','date','tanggal','time','waktu','ticket','no.ticket','no.truck',
    'truck','vehicle','item','description','desc','qty','quantity','unit','price','amount',
    'total','subtotal','gross','netto','net','tara','in','out','leader','sub','name','supplier',
    'customer','status','code','kode','part','product','po','grn','transfer','requester'
  ]);
  function clean(s){ return String(s ?? '').replace(/\s+/g,' ').trim(); }
  function groupLines(items, yTol){
    const usable=(items||[]).filter(x=>clean(x.str));
    const lines=[];
    for(const it of usable){
      const x=Number(it.transform?.[4]||0), y=Number(it.transform?.[5]||0);
      const h=Math.abs(Number(it.transform?.[3]||10))||10;
      const w=Number(it.width||0);
      let line=null;
      for(const l of lines){ if(Math.abs(l.y-y)<=Math.max(yTol||2,h*.28)){line=l;break;} }
      if(!line){line={y,items:[]};lines.push(line);}
      line.items.push({x,y,w,h,text:clean(it.str)});
    }
    lines.sort((a,b)=>b.y-a.y);
    for(const l of lines) l.items.sort((a,b)=>a.x-b.x);
    return lines;
  }
  function lineText(line){ return clean(line.items.map(x=>x.text).join(' ')); }
  function headerScore(line){
    const txt=lineText(line).toLowerCase();
    const hits=[...HEADER_WORDS].filter(k=>txt.includes(k)).length;
    const tokenCount=line.items.length;
    return hits*4 + Math.min(tokenCount,12)*0.4;
  }
  function findHeader(lines){
    let best=null,bestScore=0;
    // Header normally occurs in the first 35% of a page; still allow the whole page for headerless layouts.
    const limit=Math.max(1,Math.floor(lines.length*.35));
    for(let i=0;i<Math.min(lines.length,limit);i++){
      const s=headerScore(lines[i]);
      if(s>bestScore){bestScore=s;best={index:i,line:lines[i],score:s};}
    }
    return best && best.score>=4 ? best : null;
  }
  function makeCenters(headerLine){
    // Only merge adjacent fragments when they form a known compound header.
    // Blind gap-based merging is unsafe because many PDF tables place every header very close together.
    const a=headerLine.items.slice().sort((x,y)=>x.x-y.x);
    const compounds=new Set(['sub leader','no ticket','no truck','invoice no','item code','unit price','grand total','net amount','gross weight','tare weight','no. po','no. grn','no. transfer','part number','qty terima','date time','start date','end date','unit cost','unit price','total amount','phone number']);
    const merged=[];
    for(const item of a){
      const last=merged[merged.length-1];
      const candidate=last?clean((last.text+' '+item.text)).toLowerCase():'';
      if(last && compounds.has(candidate)){ last.text=clean(last.text+' '+item.text); last.w=(item.x+item.w)-last.x; }
      else merged.push({...item});
    }
    return merged.map(x=>({label:x.text, center:x.x+x.w/2, x:x.x, w:x.w}));
  }
  function boundaries(centers){
    const b=[];
    for(let i=0;i<centers.length-1;i++) b.push((centers[i].center+centers[i+1].center)/2);
    return b;
  }
  function assignLine(line, centers, bounds){
    const cells=Array.from({length:centers.length},()=>[]);
    for(const item of line.items){
      const xc=item.x+item.w/2;
      let idx=0;
      while(idx<bounds.length && xc>=bounds[idx]) idx++;
      cells[idx].push(item.text);
    }
    return cells.map(clean);
  }
  function looksLikeDataRow(cells){
    const first=clean(cells[0]);
    if(/^\d+$/.test(first)) return true;
    // Generic tables often use dates, IDs or codes in the first column.
    if(/^[A-Z]{1,8}[-_/]?\d{2,}/i.test(first)) return true;
    return false;
  }
  function reconstructPage(items, schema){
    const lines=groupLines(items,2.2);
    const found=findHeader(lines);
    let centers=schema?.centers||null, headers=schema?.headers||null, headerIndex=found?.index ?? -1;
    if(found){ centers=makeCenters(found.line); headers=centers.map(x=>x.label); headerIndex=found.index; }
    if(!centers || centers.length<2) return {headers:[],rows:[],rawLines:lines.map(lineText),schema:null};
    const bounds=boundaries(centers), rows=[];
    for(let i=headerIndex+1;i<lines.length;i++){
      const cells=assignLine(lines[i],centers,bounds);
      if(looksLikeDataRow(cells)) rows.push(cells);
    }
    return {headers,rows,rawLines:lines.map(lineText),schema:{headers,centers}};
  }
  async function extractPdf(pdfjs,file){
    if(!pdfjs) throw new Error('PDF.js belum termuat.');
    const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const pages=[]; let schema=null;
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p); const content=await page.getTextContent();
      const result=reconstructPage(content.items,schema);
      if(result.schema){schema=result.schema;}
      pages.push({page:p,...result});
    }
    return {pdf,pages,schema};
  }
  function flattenTable(extracted){
    const headers=extracted.schema?.headers||[];
    const rows=[];
    for(const p of extracted.pages){
      for(const r of p.rows) rows.push(r.concat(Array(Math.max(0,headers.length-r.length)).fill('')).slice(0,headers.length));
    }
    return {headers,rows};
  }
  global.IUConvert={groupLines,findHeader,makeCenters,assignLine,reconstructPage,extractPdf,flattenTable,clean};
})(window);
