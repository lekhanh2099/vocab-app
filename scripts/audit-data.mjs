import fs from 'node:fs/promises';
const raw=JSON.parse(await fs.readFile(new URL('./raw-occurrences.json',import.meta.url),'utf8'));
const expected={htm2:171,htm3:233,bridge:831,reading:1240};
const counts={};for(const row of raw)counts[row.source]=(counts[row.source]??0)+1;
let failed=false;
for(const [source,n] of Object.entries(expected)){
  const actual=counts[source]??0;const ok=actual===n;console.log(`${ok?'✓':'✗'} ${source}: ${actual}/${n}`);if(!ok)failed=true;
}
const missing=raw.filter((x)=>!x.hanzi||!x.pinyin||!x.meaningVi);console.log(`${missing.length?'✗':'✓'} missing core fields: ${missing.length}`);if(missing.length)failed=true;
const byHanzi=new Map();for(const row of raw){const list=byHanzi.get(row.hanzi)??[];list.push(row);byHanzi.set(row.hanzi,list);}
const unique=byHanzi.size;const duplicates=[...byHanzi.values()].filter((rows)=>rows.length>1).length;
console.log(`✓ unique hanzi: ${unique}`);console.log(`✓ duplicated hanzi groups: ${duplicates}`);
const pkey=(s)=>s.trim().toLowerCase().replace(/[\s\-·'’]+/g,'');
const readingConflicts=[...byHanzi.entries()].map(([hanzi,rows])=>({hanzi,readings:[...new Set(rows.map(r=>pkey(r.pinyin)))]})).filter(x=>x.readings.length>1);
console.log(`! multi-reading / pinyin-conflict lexemes: ${readingConflicts.length}`);for(const x of readingConflicts)console.log(`  ${x.hanzi}: ${x.readings.join(' / ')}`);
if(failed)process.exit(1);
