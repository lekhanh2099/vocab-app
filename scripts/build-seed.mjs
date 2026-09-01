import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rawPath = path.join(here, 'raw-occurrences.json');
const outPath = path.join(here, '..', 'src', 'data', 'seed.json');
const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
const BOOKS = {
  htm2: ['Hán thương mại 2', 'Hán thương mại 2', 'Bài'],
  htm3: ['Hán thương mại 3', 'Hán thương mại 3', 'Bài'],
  bridge: ['Nhịp cầu Hán ngữ', '桥梁——实用汉语中级教程 (上)', 'Bài'],
  reading: ['Đọc hiểu', 'Đọc hiểu', 'Unit']
};
const id = (prefix, ...parts) => `${prefix}_${crypto.createHash('sha1').update(parts.map(String).map(s=>s.trim()).join('|')).digest('hex').slice(0,12)}`;
const pinyinKey = (s) => s.trim().toLowerCase().replace(/[\s\-·'’]+/g,'');
const preserveUmlaut = (s) => s.replace(/[üǖǘǚǜ]/g,'v');
const strip = (s) => preserveUmlaut(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const books = Object.entries(BOOKS).map(([bookId,[nameVi,titleZh,lessonLabel]])=>({id:bookId,nameVi,titleZh,lessonLabel}));
const lessonMap = new Map();
for (const e of raw) {
  const key = `${e.source}|${e.lessonType}|${e.lesson}`;
  if (!lessonMap.has(key)) lessonMap.set(key,{id:id('lesson',e.source,e.lessonType,e.lesson),bookId:e.source,index:Number(e.lesson),label:e.lessonType,title:e.lessonTitle??''});
}
const lessons=[...lessonMap.values()].sort((a,b)=>Object.keys(BOOKS).indexOf(a.bookId)-Object.keys(BOOKS).indexOf(b.bookId)||a.index-b.index);
const lexemes=new Map(), readings=new Map(), senses=new Map(), occurrences=[];
for (const [index,e] of raw.entries()) {
  const hanzi=String(e.hanzi??'').trim(), pinyin=String(e.pinyin??'').trim(), pk=pinyinKey(pinyin), meaningVi=String(e.meaningVi??'').trim(), hanViet=String(e.hanViet??'').trim(), pos=String(e.pos??'').trim(), kind=e.kind??'normal';
  if (!hanzi || !pinyin || !meaningVi) throw new Error(`Missing core data at raw row ${index}`);
  const lexemeId=id('lexeme',hanzi); if(!lexemes.has(lexemeId))lexemes.set(lexemeId,{id:lexemeId,hanzi,searchKey:''});
  const readingId=id('reading',lexemeId,pk); if(!readings.has(readingId))readings.set(readingId,{id:readingId,lexemeId,pinyin,pinyinKey:pk,variants:[]});
  const reading=readings.get(readingId); if(!reading.variants.includes(pinyin))reading.variants.push(pinyin);
  const senseId=id('sense',lexemeId,readingId,meaningVi,hanViet,pos,kind); if(!senses.has(senseId))senses.set(senseId,{id:senseId,lexemeId,readingId,meaningVi,hanViet,pos,kind});
  const lessonId=lessonMap.get(`${e.source}|${e.lessonType}|${e.lesson}`).id;
  occurrences.push({id:id('occ',index,e.source,e.lesson,hanzi,pinyin,meaningVi),lexemeId,readingId,senseId,bookId:e.source,lessonId,rawHanzi:hanzi,rawPinyin:pinyin,rawMeaningVi:meaningVi,rawHanViet:hanViet,rawPos:pos,kind,needsReview:Boolean(e.needsReview)});
}
const readingByLexeme=new Map(), senseByLexeme=new Map();
for(const r of readings.values()){const list=readingByLexeme.get(r.lexemeId)??[];list.push(r);readingByLexeme.set(r.lexemeId,list);}
for(const s of senses.values()){const list=senseByLexeme.get(s.lexemeId)??[];list.push(s);senseByLexeme.set(s.lexemeId,list);}
for(const lexeme of lexemes.values()){
  const parts=[lexeme.hanzi];
  for(const r of readingByLexeme.get(lexeme.id)??[])parts.push(...r.variants,strip(r.pinyinKey));
  for(const s of senseByLexeme.get(lexeme.id)??[])parts.push(s.meaningVi,s.hanViet,s.pos);
  lexeme.searchKey=[...new Set(parts.filter(Boolean).map(strip))].join(' ');
}
// The four source documents are vocabulary tables. Lesson titles are provenance,
// not usage sentences. Do not promote titles into Context Clash / usage-card data.
// Verified sentence contexts can be imported separately through Settings.
const contexts=[];
const seed={version:'2026.09.01.5',generatedAt:new Date().toISOString(),books,lessons,lexemes:[...lexemes.values()],readings:[...readings.values()],senses:[...senses.values()],occurrences,contexts};
await fs.writeFile(outPath,JSON.stringify(seed));
console.log(`seed: ${seed.lexemes.length} lexemes / ${seed.occurrences.length} occurrences / ${seed.senses.length} senses`);
