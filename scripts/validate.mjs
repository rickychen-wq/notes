import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {attemptIdFromScoreId,discardLegacyScores,summarizeWrongItems} from '../stats-utils.js';

const root=path.resolve(import.meta.dirname,'..');
const files=fs.readdirSync(root).filter((name)=>fs.statSync(path.join(root,name)).isFile());
const htmlFiles=files.filter((name)=>name.endsWith('.html')).sort();
const jsFiles=files.filter((name)=>name.endsWith('.js')).sort();
const errors=[];

function fail(file,message){errors.push(`${file}: ${message}`);}
function localTarget(value){
  if(!value||/^(?:https?:|data:|mailto:|tel:|javascript:|#)/i.test(value))return null;
  return value.split(/[?#]/,1)[0];
}

for(const file of htmlFiles){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  if(!/<meta\s+name=["']viewport["']/i.test(source))fail(file,'missing viewport meta tag');
  if(!/<title>[\s\S]*?<\/title>/i.test(source))fail(file,'missing title');
  const protectedPage=file!=='login.html';
  if(protectedPage&&!/src=["']auth-gate\.js["']/.test(source))fail(file,'missing authentication gate');
  if(!protectedPage&&/src=["']auth-gate\.js["']/.test(source))fail(file,'login page must remain public');

  const ids=[...source.matchAll(/\bid=["']([^"']+)["']/gi)].map((match)=>match[1]);
  const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
  if(duplicateIds.length)fail(file,`duplicate ids: ${duplicateIds.join(', ')}`);

  for(const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)){
    const target=localTarget(match[1]);
    if(target&&!fs.existsSync(path.resolve(root,target)))fail(file,`missing local asset: ${target}`);
  }

  if(source.includes('\b'))fail(file,'contains an ASCII backspace control character');
  if(/\.replace\(\/s\+\/g|\(\)\[\]\]/.test(source))fail(file,'contains a broken English normalization expression');
  if(source.includes('分數只存在你自己的瀏覽器'))fail(file,'contains obsolete local-only score copy');
  if(/隱藏測驗分數|清除測驗紀錄|function\s+nxHide\s*\(/.test(source))fail(file,'contains removed score-hiding/history controls');

  for(const match of source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(/\btype=["']module["']/i.test(match[1]))continue;
    try{new vm.Script(match[2],{filename:file});}
    catch(error){fail(file,`inline script syntax error: ${error.message}`);}
  }

  if(['en-book-l2.html','en-mag-7-9.html','en-mag-10-14.html'].includes(file)){
    const match=source.match(/function norm\(s\)\{[^\r\n]+\}/);
    if(!match)fail(file,'missing answer normalization function');
    else{
      const context={};vm.runInNewContext(match[0],context);
      if(context.norm(" Someone's [spaces] / test ")!=='spaces test')fail(file,'answer normalization behavior is incorrect');
    }
  }
}

for(const file of jsFiles){
  try{execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});}
  catch(error){fail(file,`JavaScript syntax error: ${String(error.stderr||error.message).trim()}`);}
}

if(htmlFiles.length!==30)fail('project',`expected 30 HTML pages, found ${htmlFiles.length}`);
const protectedCount=htmlFiles.filter((file)=>file!=='login.html').length;
if(protectedCount!==29)fail('project',`expected 29 protected pages, found ${protectedCount}`);

const wrongSummary=summarizeWrongItems([
  {subject:'english',wrongItems:['Hypothesis','hypothesis','give in','理想氣體']},
  {subject:'chemistry',wrongItems:['oxygen','理想氣體']},
  {subject:'chinese',wrongItems:['燭之武說服秦伯的理由']}
]);
if(wrongSummary.topWrongWords.length!==1||wrongSummary.topWrongWords[0].term!=='hypothesis'||wrongSummary.topWrongWords[0].count!==2)fail('stats-utils.js','common English words include a phrase or another subject');
if(wrongSummary.wrongQuestions.length!==5)fail('stats-utils.js','non-word mistakes were not preserved in the other-question list');
if(attemptIdFromScoreId('chem-2-1')!=='chem-2'||attemptIdFromScoreId('chem-2-2')!==null||attemptIdFromScoreId('chem-2-3')!==null)fail('stats-utils.js','Chemistry chapter 2 attempts are not canonicalized');
const oldStore=new Map([['nx:score:en-book-l1','88'],['nx:time:en-book-l1','123'],['nx:synced:old','1'],['nx:theme','dark']]);
const storageMock={get length(){return oldStore.size;},key(index){return[...oldStore.keys()][index]??null;},getItem(key){return oldStore.get(key)??null;},setItem(key,value){oldStore.set(key,String(value));},removeItem(key){oldStore.delete(key);}};
if(!discardLegacyScores(storageMock,'firebase-v1')||oldStore.has('nx:score:en-book-l1')||oldStore.has('nx:time:en-book-l1')||oldStore.has('nx:synced:old')||oldStore.get('nx:theme')!=='dark'||oldStore.get('nx:score-era')!=='firebase-v1')fail('stats-utils.js','legacy scores were not discarded safely');
if(discardLegacyScores(storageMock,'firebase-v1'))fail('stats-utils.js','current score era was cleared more than once');

if(errors.length){
  console.error(`Validation failed with ${errors.length} issue(s):`);
  errors.forEach((error)=>console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validation passed: ${htmlFiles.length} HTML pages, ${jsFiles.length} JavaScript files, internal links, unique IDs, auth coverage and syntax.`);
