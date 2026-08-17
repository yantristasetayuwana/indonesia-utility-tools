const fs=require('fs');
global.window=global;
eval(fs.readFileSync(__dirname+'/../assets/converter-engine.js','utf8'));
const lines=JSON.parse(fs.readFileSync('/mnt/data/test_lines.json','utf8'));
const header=lines.findIndex(x=>x.includes('No.Ticket')&&x.includes('No.Truck'));
const items=[];let y=100;
for(let i=header;i<lines.length;i++,y-=20){const s=lines[i];for(let j=0;j<s.length;j++){if(s[j]!==' '){let k=j;while(k<s.length&&s[k]!==' ')k++;const t=s.slice(j,k);items.push({text:t,x:j*5,y,w:t.length*5,h:10});j=k-1}}}
const r=IUConvert.reconstructPage(items,null);
const ex={schema:r.schema,pages:[r]};const v=IUConvert.validate(ex);
function assert(ok,msg){if(!ok)throw new Error(msg)}
assert(r.headers.length===10,'Expected 10 columns, got '+r.headers.length);
assert(r.rows.length===112,'Expected 112 rows, got '+r.rows.length);
assert(r.rows[0][0]==='1'&&r.rows[0][1]==='TLP260011529','First row mismatch');
assert(r.rows[0][2]==='BE8131ACU'&&r.rows[0][5]==='14.730'&&r.rows[0][7]==='10.530','First row numeric/plate mismatch');
const special=r.rows.find(x=>x[1]==='TO26006584');
assert(special&&special[2]==='BE8005 BT'&&special[5]==='49.530','Split plate row repair failed');
assert(r.rows[111][1]==='TO26006590'&&r.rows[111][9]==='PT Maju Bersama Anggiat Minuk','Last row mismatch');
assert(v.score>=95&&!v.needsAi,'Validation unexpectedly weak: '+JSON.stringify(v));
console.log('PASS smart-engine: 112 rows / 10 cols / split-plate / first-last / validation',v.score);
