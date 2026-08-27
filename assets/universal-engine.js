import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

const normalizeSpace = s => String(s ?? "").replace(/\s+/g," ").trim();
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));

function median(values){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}

function detectType(value){
  const s=normalizeSpace(value);
  if(!s)return "blank";
  if(/^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?$/.test(s) || /^-?\d+(?:[.,]\d+)?$/.test(s)) return "number";
  if(/^-?\d+(?:[.,]\d+)?\s*%$/.test(s)) return "percentage";
  if(/^(?:Rp|IDR|\$|USD|EUR|€)\s*[\d.,]+$/i.test(s)) return "currency";
  if(/^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}$/.test(s)) return "date";
  return "text";
}

function comparableHeader(a,b){
  const na=normalizeSpace(a).toLowerCase(), nb=normalizeSpace(b).toLowerCase();
  return na===nb || (na && nb && (na.includes(nb)||nb.includes(na)));
}

function clusterRows(items, tolerance){
  const rows=[];
  for(const item of items.slice().sort((a,b)=>a.y-b.y || a.x-b.x)){
    let row=rows.find(r=>Math.abs(r.y-item.y)<=tolerance);
    if(!row){row={y:item.y,items:[]};rows.push(row);}
    row.items.push(item);
    row.y=row.items.reduce((s,x)=>s+x.y,0)/row.items.length;
  }
  return rows.sort((a,b)=>a.y-b.y);
}

function inferColumns(rows){
  const xs=[];
  for(const row of rows) for(const item of row.items) xs.push(item.x);
  xs.sort((a,b)=>a-b);
  const gaps=[];
  for(let i=1;i<xs.length;i++){const g=xs[i]-xs[i-1];if(g>8)gaps.push(g);}
  const gapThreshold=Math.max(14,median(gaps)*1.8);
  const centers=[];
  for(const x of xs){
    const c=centers.at(-1);
    if(!c || x-c.mean>gapThreshold) centers.push({mean:x,n:1});
    else {c.mean=(c.mean*c.n+x)/(c.n+1);c.n++;}
  }
  return centers.map(c=>c.mean);
}

function mapRowToColumns(row, centers){
  const out=Array(centers.length).fill("");
  for(const item of row.items){
    let best=0,bestD=Infinity;
    centers.forEach((x,i)=>{const d=Math.abs(item.x-x);if(d<bestD){best=i;bestD=d;}});
    out[best]=out[best]?`${out[best]} ${item.text}`:item.text;
  }
  return out.map(normalizeSpace);
}

function scoreTable(matrix){
  if(matrix.length<2)return 0;
  const widths=matrix.map(r=>r.filter(x=>x!=="").length);
  const nonEmpty=widths.filter(Boolean);
  if(!nonEmpty.length)return 0;
  const avg=nonEmpty.reduce((a,b)=>a+b,0)/nonEmpty.length;
  const consistency=nonEmpty.filter(n=>Math.abs(n-avg)<=1).length/nonEmpty.length;
  return clamp(consistency*0.75 + Math.min(1,avg/4)*0.25,0,1);
}

export class UniversalPdfEngine{
  constructor({onProgress}={}){
    this.onProgress=onProgress||(()=>{});
    this.ready=false;
  }

  progress(message,percent){
    this.onProgress({message,percent});
  }

  async load(){
    if(this.ready)return;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    this.ready=true;
  }

  async analyze(file,{mode="auto"}={}){
    await this.load();
    const buffer=await file.arrayBuffer();
    this.progress("Membuka PDF",5);
    const pdf=await pdfjsLib.getDocument({data:buffer}).promise;
    const pages=[], allTables=[], rawPages=[];
    let totalItems=0,totalRows=0,confidenceSum=0;

    for(let pno=1;pno<=pdf.numPages;pno++){
      this.progress(`Membaca halaman ${pno} dari ${pdf.numPages}`,Math.round(5+(pno/pdf.numPages)*75));
      const page=await pdf.getPage(pno);
      const viewport=page.getViewport({scale:1});
      const content=await page.getTextContent({normalizeWhitespace:true});
      const items=content.items
        .filter(x=>normalizeSpace(x.str))
        .map(x=>({
          text:normalizeSpace(x.str),
          x:x.transform[4],
          y:viewport.height-x.transform[5],
          width:x.width||0,
          height:Math.abs(x.height||10)
        }));

      totalItems+=items.length;
      const rows=clusterRows(items,Math.max(3,median(items.map(i=>i.height))*0.55));
      const centers=inferColumns(rows);
      const matrix=rows.map(r=>mapRowToColumns(r,centers));
      const score=scoreTable(matrix);

      pages.push({page:pno,width:viewport.width,height:viewport.height,itemCount:items.length,rowCount:rows.length,confidence:score});
      rawPages.push({page:pno,items,matrix,confidence:score});

      if(mode!=="raw" && score>=0.42 && matrix.length>=2){
        const table=this.buildTable(matrix,score,pno);
        if(table.rows.length) allTables.push(table);
        totalRows+=table.rows.length;
        confidenceSum+=score;
      }
    }

    const tables=mode==="raw" ? [] : this.mergeContinuationTables(allTables);
    totalRows=tables.reduce((s,t)=>s+t.rows.length,0);
    const confidence=tables.length ? tables.reduce((s,t)=>s+t.confidence,0)/tables.length : 0;

    this.progress("Validasi hasil",90);

    return {
      fileName:file.name,
      pages,
      rawPages,
      tables,
      metrics:{
        textItems:totalItems,
        rows:totalRows,
        confidence,
        scannedPages:pages.filter(p=>p.itemCount===0).length
      }
    };
  }

  buildTable(matrix,confidence,page){
    const width=Math.max(...matrix.map(r=>r.length),0);
    const normalized=matrix.map(r=>Array.from({length:width},(_,i)=>normalizeSpace(r[i]||"")));
    const headerIndex=this.detectHeader(normalized);
    let headers=normalized[headerIndex]||[];
    headers=this.uniqueHeaders(headers);
    let rows=normalized.slice(headerIndex+1).filter(r=>r.some(Boolean));
    rows=this.removeRepeatedHeaders(rows,headers);
    return {pageStart:page,pageEnd:page,headers,rows,columnCount:headers.length,confidence};
  }

  detectHeader(matrix){
    if(!matrix.length)return 0;
    const candidates=matrix.slice(0,Math.min(8,matrix.length));
    let best=0,bestScore=-Infinity;
    candidates.forEach((row,i)=>{
      const textCount=row.filter(x=>detectType(x)==="text").length;
      const filled=row.filter(Boolean).length;
      const next=matrix[i+1]||[];
      const nextNumeric=next.filter(x=>["number","currency","percentage","date"].includes(detectType(x))).length;
      const score=filled*0.7+textCount*0.5+nextNumeric*0.8-i*0.25;
      if(score>bestScore){bestScore=score;best=i;}
    });
    return best;
  }

  uniqueHeaders(headers){
    const used=new Map();
    return headers.map((h,i)=>{
      let base=normalizeSpace(h)||`Column ${i+1}`;
      const key=base.toLowerCase();
      const n=(used.get(key)||0)+1; used.set(key,n);
      return n===1?base:`${base} ${n}`;
    });
  }

  removeRepeatedHeaders(rows,headers){
    return rows.filter(row=>!row.every((v,i)=>!v || comparableHeader(v,headers[i]||"")));
  }

  mergeContinuationTables(tables){
    const out=[];
    for(const t of tables){
      const prev=out.at(-1);
      if(prev && prev.pageEnd+1===t.pageStart &&
         prev.headers.length===t.headers.length &&
         prev.headers.every((h,i)=>comparableHeader(h,t.headers[i]))){
        prev.rows.push(...t.rows);
        prev.pageEnd=t.pageEnd;
        prev.confidence=(prev.confidence+t.confidence)/2;
      }else out.push({...t,rows:[...t.rows]});
    }
    return out;
  }

  exportXlsx(result,fileName){
    if(!window.XLSX) throw new Error("Library Excel belum tersedia.");
    const wb=XLSX.utils.book_new();

    if(result.tables.length){
      result.tables.forEach((t,i)=>{
        const data=[t.headers,...t.rows];
        const ws=XLSX.utils.aoa_to_sheet(data);
        ws["!autofilter"]={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,data.length-1),c:Math.max(0,t.headers.length-1)}})};
        ws["!freeze"]={xSplit:0,ySplit:1};
        ws["!cols"]=t.headers.map((h,c)=>{
          const max=Math.max(h.length,...t.rows.slice(0,300).map(r=>String(r[c]??"").length));
          return {wch:Math.min(45,Math.max(10,max+2))};
        });
        XLSX.utils.book_append_sheet(wb,ws,this.sheetName(i+1));
      });
    }else{
      const data=[["Page","Text"]];
      result.rawPages.forEach(p=>{
        const text=p.items.map(x=>x.text).join(" ");
        data.push([p.page,text]);
      });
      const ws=XLSX.utils.aoa_to_sheet(data);
      ws["!cols"]=[{wch:10},{wch:100}];
      XLSX.utils.book_append_sheet(wb,ws,"Raw Text");
    }

    XLSX.writeFile(wb,fileName);
  }

  sheetName(n){return `Table ${n}`.slice(0,31);}
}
