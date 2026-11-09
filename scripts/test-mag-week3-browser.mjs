import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {firebaseFixture} from './study-browser-fixture.mjs';
import {SECOND_VOCAB as words} from '../en-mag-week3-data.js';
import {judgeAnswer,normalizeEnglish} from '../study-quiz-core.js';

// Independent checklist transcribed from Vocabulary, 參考字彙 and Language Spotlight.
const sourceInventory={
 U8:{main:['disorder','distinguish','collector','antique','possession','therapy'],reference:['hoard','hoarder','stationery','packet','clutter'],phrase:['let go','pile up']},
 U9:{main:['beverage','fatigue','ingredient','inevitable','disrupt','cautious'],reference:['bubbly','caffeine','irritable','long-term'],phrase:['wear off','end up']},
 U10:{main:['marathon','workout','hooked','exhausted','sustain','consistent','rewarding'],reference:['upcoming','hydrate','sprint','endurance'],phrase:[]},
 U11:{main:['evolution','astonishing','remarkable','trait','consume','despite','plunge','species','incredible','estimate','invention','telescope','severe','fragile'],reference:['adaptation','streamline','undisputed','lifespan','surpass','venomous'],phrase:['stand out','hold the record for','relative to']}
};
for(const [unit,kinds] of Object.entries(sourceInventory))for(const [kind,terms] of Object.entries(kinds)){
 assert.deepEqual(words.filter(w=>w.unit===unit&&w.kind===kind).map(w=>w.word),terms,unit+' '+kind+' source inventory');
}
for(const item of words){
 assert.equal(item.distractors.length,3,item.word+' distractor count');
 assert.equal(new Set([item.word,...item.distractors].map(normalizeEnglish)).size,4,item.word+' unique answer choices');
}
for(const [word,meaning] of [['hydrate','補充水分'],['evolution','演化'],['adaptation','適應'],['lifespan','壽命'],['venomous','有毒的！'],['sprint','衝刺']]){
 assert.ok(judgeAnswer(words.find(w=>w.word===word),meaning,'en-cn'),word+' everyday Chinese answer');
}
assert.equal(judgeAnswer(words.find(w=>w.word==='venomous'),'無毒的','en-cn'),false);

const modules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const {chromium}=modules?await import(pathToFileURL(path.join(modules,'playwright/index.mjs'))):await import('playwright');
const root=path.resolve(import.meta.dirname,'..');
let base=process.env.TEST_BASE_URL,server;
if(!base){
  server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
}
const shots=process.env.TEST_SCREENSHOTS||'/tmp/notes-study-v2-tests';fs.mkdirSync(shots,{recursive:true});
const executablePath=process.env.TEST_CHROMIUM_PATH;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-gpu']});
const core=fs.readFileSync(path.join(root,'firebase-core.js'),'utf8');
const mockedCore=firebaseFixture+'\n'+core.slice(core.indexOf('export function normalizeName'));
// Optional CJK font fixture for test hosts without Chinese system fonts. It is not shipped to the site.
const fontRoot=process.env.TEST_CJK_FONT_ROOT;
const fontCSS=fontRoot?[400,700].map(weight=>fs.readFileSync(path.join(fontRoot,weight+'.css'),'utf8').replaceAll('./files/','/__qa-font/')).join('\n')+'\nbody,body.v2,dialog.vocab-access-dialog{font-family:"Noto Sans TC",sans-serif!important}':'';
let assertions=0;const contexts=[];
const check=(condition,message)=>{assert.ok(condition,message);assertions++;};
async function create(role='admin',viewport={width:390,height:844},colorScheme='light',system={},uid){
  const context=await browser.newContext({viewport,colorScheme,reducedMotion:'reduce'});contexts.push(context);
  await context.addInitScript(({role,system,uid})=>{window.__TEST_ROLE=role;window.__TEST_SYSTEM=system;window.__TEST_UID=uid;localStorage.setItem('nx:score-era','firebase-v1');},{role,system,uid});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==new URL(base).origin){await route.abort();return;}
    if(fontRoot&&url.pathname.startsWith('/__qa-font/'))await route.fulfill({contentType:'font/woff2',body:fs.readFileSync(path.join(fontRoot,'files',path.basename(url.pathname)))});
    else if(fontRoot&&url.pathname.endsWith('/app-shell.css'))await route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(root,'app-shell.css'),'utf8')+'\n'+fontCSS});
    else if(url.pathname.endsWith('/firebase-core.js'))await route.fulfill({contentType:'application/javascript',body:mockedCore});
    else await route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  return {context,page,errors};
}
async function loaded(page,file='en-mag-week3.html'){
  await page.goto(base+'/'+file);await page.waitForFunction(()=>!document.documentElement.classList.contains('nx-auth-pending'));
  if(file.startsWith('en-mag-week3'))await page.locator('#studyContent').waitFor({state:'visible'});
  await page.evaluate(()=>document.fonts.ready);
}
async function noOverflow(page){check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+page.url());}
async function selectorsFit(page){
  return page.locator('.v2-controls select').evaluateAll(selects=>selects.every(select=>{
    const style=getComputedStyle(select),canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    context.font=style.font;
    const available=select.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    return context.measureText(select.selectedOptions[0].textContent).width<=available&&style.appearance==='none';
  }));
}
async function draft(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('nx:midterm2:test-admin:draft')));}
async function currentWord(page){const d=await draft(page);return words.find(w=>w.id===d.ids[d.index]);}

try{
 const {page,errors}=await create();await loaded(page,'index.html');
 check(await page.locator('#week3Workspace').isVisible(),'admin Week 3 card');
 await page.evaluate(()=>localStorage.setItem('nx:midterm2:test-admin:draft','{"sentinel":true}'));
 await loaded(page);
 check(await page.locator('.word-card').count()===33,'default 33 main words');
 check(await page.locator('[data-id="w3-u11-main-6"] .pos-tag small').textContent()==='介系詞','despite part of speech');
 for(const [kind,count] of [['reference',19],['phrase',7],['required',40],['all',59],['main',33]]){
   await page.locator('#wordKind').selectOption(kind);check(await page.locator('.word-card').count()===count,'kind '+kind);
 }
 await page.locator('#wordList [data-action="star"]').first().click();
 await page.waitForFunction(()=>window.__WRITES.some(w=>Object.keys(w.patch||{}).some(k=>k.startsWith('magWeek3.starred.'))));
 check(!await page.evaluate(()=>window.__WRITES.some(w=>Object.keys(w.patch||{}).some(k=>k.startsWith('studyV2.')))),'4500 cloud flags untouched');
 await page.locator('#quizTab').click();check(await page.locator('#poolCount').textContent()==='33','default main quiz');
 await page.locator('#quizKind').selectOption('phrase');check(await page.locator('#poolCount').textContent()==='7','phrase-only quiz');
 await page.locator('[data-mode="type-en"]').click();await page.locator('#quizCount').selectOption('all');await page.locator('#startQuiz').click();
 const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('nx:mag-week3:test-admin:draft')));
 const item=words.find(w=>w.id===draft.ids[0]);
 await page.locator('#typedAnswer').fill(item.word.toUpperCase().replaceAll(' ','   '));await page.locator('#typedAnswer').press('Enter');
 check(await page.locator('#answerFeedback.vok').isVisible(),'phrase case/spaces accepted');
 check((await page.locator('#questionProgress').textContent()).startsWith('1 /'),'manual next');
 await page.locator('#typedAnswer').press('Enter');check((await page.locator('#questionProgress').textContent()).startsWith('2 /'),'Enter advances');
 await page.locator('#pauseQuiz').click();await page.reload();await page.locator('#studyContent').waitFor();await page.locator('#quizTab').click();
 check(await page.locator('#resumeBanner').isVisible(),'magazine draft persists');
 check(await page.evaluate(()=>JSON.parse(localStorage.getItem('nx:midterm2:test-admin:draft')).sentinel===true),'4500 draft untouched');
 await page.locator('[data-open-vocab-access]').click();await page.locator('#vocabAccessUsers input').first().waitFor();await page.locator('input[data-uid="classmate-1"]').check();await page.locator('#saveVocabAccess').click();
 await page.waitForFunction(()=>window.__SYSTEM.magWeek3AllowedUids?.includes('classmate-1'));
 check(await page.evaluate(()=>Object.keys(window.__WRITES.find(w=>w.ref==='settings/system').patch).sort().join(','))==='magWeek3AllowedUids,updatedAt','independent magazine grant');
 await page.locator('#closeVocabAccess').click();
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});await loaded(page);await noOverflow(page);check(await page.locator('.v2-tabs').evaluate(el=>getComputedStyle(el).position)==='static','no sticky tabs');}
 await page.setViewportSize({width:390,height:844});await loaded(page);await page.locator('#wordKind').selectOption('reference');await page.screenshot({path:path.join(shots,'week3-reference-mobile.png'),fullPage:true});
 await loaded(page);await page.locator('#wordList [data-action="star"]').first().click();await page.locator('#quizTab').click();await page.locator('#quizScope').selectOption('starred');
 await page.locator('#startQuiz').click();await page.locator('#confirmDiscard').click();
 const one=await page.evaluate(()=>JSON.parse(localStorage.getItem('nx:mag-week3:test-admin:draft')));
 await page.locator('[data-choice="'+words.find(w=>w.id===one.ids[0]).word+'"]').click();await page.locator('#nextQuestion').click();
 await page.waitForFunction(()=>window.__WRITES.some(w=>w.kind==='transaction'&&w.data.pageId==='en-mag-week3'));
 check(await page.evaluate(()=>window.__WRITES.find(w=>w.kind==='transaction'&&w.data.pageId==='en-mag-week3').data.totalQuestions)===1,'completed magazine attempt recorded separately');
 check(errors.length===0,errors.join('\n'));
 const regular=await create('user'),requests=[];regular.page.on('request',r=>requests.push(r.url()));await loaded(regular.page,'index.html');check(!await regular.page.locator('#week3Workspace').isVisible(),'no inherited grant');await regular.page.goto(base+'/en-mag-week3.html');await regular.page.waitForURL('**/index.html');check(!requests.some(x=>x.endsWith('/en-mag-week3-data.js')),'no unauthorized bank fetch');
 const allowed=await create('user',{width:390,height:844},'dark',{magWeek3AllowedUids:['classmate-1']},'classmate-1');await loaded(allowed.page,'index.html');check(await allowed.page.locator('#week3Workspace').isVisible(),'granted home card');check(!await allowed.page.locator('#adminWorkspace').isVisible(),'no inherited 4500');check(!await allowed.page.locator('#preparingPanel').isVisible(),'ready home');await loaded(allowed.page);check(await allowed.page.locator('.word-card').count()===33,'granted main bank');check(await allowed.page.locator('#vocabAccessDialog').count()===0,'no student permission controls');await allowed.page.screenshot({path:path.join(shots,'week3-dark.png')});await noOverflow(allowed.page);
 await allowed.page.locator('#quizTab').click();await allowed.page.locator('#quizKind').selectOption('reference');await allowed.page.locator('#quizLetter').selectOption('V');
 await allowed.page.locator('[data-mode="type-cn"]').click();await allowed.page.locator('#startQuiz').click();
 check(await allowed.page.locator('#questionPrompt').textContent()==='venomous','new reference word included in quiz');
 check(!await allowed.page.locator('#questionOptions').isVisible(),'typing mode hides choices');
 await allowed.page.locator('#typedAnswer').fill('有毒的！');await allowed.page.locator('#typedAnswer').press('Enter');
 check(await allowed.page.locator('#answerFeedback.vok').isVisible(),'Chinese meaning and punctuation accepted');
 await allowed.page.locator('#typedAnswer').press('Enter');check(await allowed.page.locator('#quizResult').isVisible(),'Chinese answer completes with Enter');
 check(allowed.errors.length===0,allowed.errors.join('\n'));
 console.log('PASS: '+assertions+' Week 3 browser assertions.');
}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
