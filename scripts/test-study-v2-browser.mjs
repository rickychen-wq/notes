import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {firebaseFixture} from './study-browser-fixture.mjs';
import {SECOND_VOCAB as words} from '../en-second-vocab-data.js';

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
const fontCSS=fontRoot?[400,700].map(weight=>fs.readFileSync(path.join(fontRoot,weight+'.css'),'utf8').replaceAll('./files/','/__qa-font/')).join('\n')+'\nbody,body.v2{font-family:"Noto Sans TC",sans-serif!important}':'';
let assertions=0;const contexts=[];
const check=(condition,message)=>{assert.ok(condition,message);assertions++;};
async function create(role='admin',viewport={width:390,height:844},colorScheme='light'){
  const context=await browser.newContext({viewport,colorScheme,reducedMotion:'reduce'});contexts.push(context);
  await context.addInitScript(({role})=>{window.__TEST_ROLE=role;localStorage.setItem('nx:score-era','firebase-v1');},{role});
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
async function loaded(page,file='en-second-vocab.html'){
  await page.goto(base+'/'+file);await page.waitForFunction(()=>!document.documentElement.classList.contains('nx-auth-pending'));
  if(file.startsWith('en-second-vocab'))await page.locator('#studyContent').waitFor({state:'visible'});
  await page.evaluate(()=>document.fonts.ready);
}
async function noOverflow(page){check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+page.url());}
async function draft(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('nx:midterm2:test-admin:draft')));}
async function currentWord(page){const d=await draft(page);return words.find(w=>w.id===d.ids[d.index]);}

try{
  const {context,page,errors}=await create();
  await loaded(page,'index.html');
  check(await page.locator('#adminWorkspace').isVisible(),'admin workspace');
  check(!await page.locator('#preparingPanel').isVisible(),'admin preparing hidden');
  await page.locator('#previewStudent').click();check(await page.locator('#preparingPanel').isVisible(),'student preview');
  await page.locator('#exitStudentPreview').click();check(await page.locator('#adminWorkspace').isVisible(),'return to admin');
  await page.screenshot({path:path.join(shots,'home-admin-mobile.png'),fullPage:true});await noOverflow(page);
  await loaded(page);
  check(await page.locator('.v2-bar .nx-account').count()===1,'account menu in header, not over quiz controls');
  await page.locator('.nx-account__button').click();check(await page.locator('.nx-account__menu').isVisible(),'account menu open');await page.keyboard.press('Escape');check(!await page.locator('.nx-account__menu').isVisible(),'Escape dismisses menu');
  check(await page.locator('.word-card').count()===236,'all 236 cards');
  await page.screenshot({path:path.join(shots,'vocab-mobile.png')});await noOverflow(page);
  await page.locator('[data-mode="tap"]').click();
  check(await page.locator('#wordList .sense').count()===0,'Chinese concealed');
  await page.locator('.reveal-word').first().click();check(await page.locator('#wordList .sense').count()>0,'one card revealed');
  await page.locator('.word-hide').click();check(await page.locator('#wordList .sense').count()===0,'Chinese concealed again');
  await page.locator('.word-card').first().locator('[data-action="star"]').click();
  await page.locator('#wordScope').selectOption('starred');check(await page.locator('.word-card').count()===1,'star filter');
  await page.locator('#wordScope').selectOption('all');await page.locator('#wordSearch').fill('familiar');
  check(await page.locator('.word-card').count()===1,'search');await page.locator('#wordSearch').fill('');
  await page.locator('#allWordUnits').click();check(await page.locator('.word-card').count()===0,'empty units');
  await page.locator('#allWordUnits').click();
  await page.locator('#alphabet [data-letter="F"]').click();
  check((await page.locator('.word-title').allTextContents()).every(w=>w.startsWith('f')),'letter filter');
  await page.locator('#alphabet [data-letter=""]').click();await page.locator('#wordOrder').selectOption('az');
  const ordered=await page.locator('.word-title').allTextContents();check(ordered.join('|')===[...ordered].sort((a,b)=>a.localeCompare(b,'en')).join('|'),'A–Z order');
  await page.locator('#quizTab').click();await page.locator('#quizScope').selectOption('starred');
  await page.locator('#startQuiz').click();
  check(await page.locator('#questionOptions').isVisible()&&!await page.locator('#answerForm').isVisible(),'choice visibility');
  check(await page.locator('#questionPos .pos-tag').count()>0,'visible POS');
  const choiceItem=await currentWord(page);await page.locator('[data-choice="'+choiceItem.word+'"]').click();
  check(await page.locator('#answerFeedback.vok').isVisible(),'correct choice feedback');
  check(await page.locator('#quizRun').isVisible(),'manual next required');
  await page.screenshot({path:path.join(shots,'quiz-feedback-mobile.png'),fullPage:true});
  await page.keyboard.press('Enter');await page.locator('#quizResult').waitFor({state:'visible'});
  check((await page.locator('#resultScore').textContent()).includes('100'),'100 score');
  await page.waitForFunction(()=>window.__WRITES.some(w=>w.kind==='transaction'));
  check(await page.evaluate(()=>window.__WRITES.filter(w=>w.kind==='transaction'&&w.ref.includes('/attempts/')).length)===1,'one attempt persisted');
  await page.locator('#newQuiz').click();await page.locator('[data-mode="type-en"]').click();await page.locator('#startQuiz').click();
  check(!await page.locator('#questionOptions').isVisible()&&await page.locator('#answerForm').isVisible(),'type visibility');
  await page.locator('#typedAnswer').fill(choiceItem.word.toUpperCase().split('').join(' '));await page.locator('#typedAnswer').press('Enter');
  check(await page.locator('#answerFeedback.vok').isVisible(),'case and spaces accepted');
  await page.locator('#typedAnswer').press('Enter');await page.locator('#quizResult').waitFor({state:'visible'});
  await page.locator('#newQuiz').click();await page.locator('[data-mode="type-cn"]').click();await page.locator('#startQuiz').click();
  await page.locator('#typedAnswer').fill('我的合理說法');
  await page.locator('#typedAnswer').dispatchEvent('compositionstart');await page.locator('#typedAnswer').press('Enter');
  check(!await page.locator('#answerFeedback').isVisible(),'IME Enter not submitted');
  await page.locator('#typedAnswer').dispatchEvent('compositionend');
  await page.waitForTimeout(90);await page.locator('#typedAnswer').press('Enter');
  check(await page.locator('#answerFeedback.vno').isVisible(),'Chinese unknown marked with explanation');
  await page.locator('#acceptMeaning').click();check(await page.locator('#answerFeedback.vok').isVisible(),'manual semantic override');
  await page.locator('#nextQuestion').click();check(await page.locator('#resultAnswers').textContent().then(t=>t.includes('自行改判')),'manual flag');
  await page.locator('#newQuiz').click();await page.locator('#quizScope').selectOption('all');await page.locator('[data-mode="type-en"]').click();await page.locator('#quizCount').selectOption('10');await page.locator('#startQuiz').click();
  await page.locator('#typedAnswer').fill('unfinished');const savedId=(await draft(page)).ids[0];
  await page.locator('#pauseQuiz').click();await page.reload();await page.locator('#studyContent').waitFor({state:'visible'});await page.locator('#quizTab').click();
  await page.locator('#resumeQuiz').click();check(await page.locator('#typedAnswer').inputValue()==='unfinished','unfinished input resumed');check((await draft(page)).ids[0]===savedId,'question order resumed');
  await page.locator('#typedAnswer').fill('wrongspelling');await page.locator('#typedAnswer').press('Enter');check(await page.locator('#answerFeedback.vno').isVisible(),'typo rejected');
  await page.locator('#typedAnswer').press('Enter');check((await page.locator('#questionProgress').textContent()).startsWith('2 /'),'Enter next');
  for(let i=1;i<10;i++){await page.locator('#skipQuestion').click();await page.locator('#nextQuestion').click();}
  check(await page.locator('#resultAnswers .answer-row').count()===10,'all results');await page.locator('#retryWrong').click();check((await draft(page)).ids.length===10,'retry all wrong');
  await page.locator('#pauseQuiz').click();await page.locator('#discardDraft').click();await page.locator('#cancelDiscard').click();check(await page.locator('#resumeBanner').isVisible(),'cancel preserves draft');
  await page.locator('#discardDraft').click();await page.locator('#confirmDiscard').click();check(!await page.locator('#resumeBanner').isVisible(),'confirmed discard');
  await page.locator('#quizLetter').selectOption('Z');check(await page.locator('#startQuiz').isDisabled(),'empty pool disabled');
  await page.locator('#quizLetter').selectOption('');await noOverflow(page);check(errors.length===0,errors.join('\n'));

  await loaded(page,'manage.html');await page.locator('.admin-user').first().waitFor();
  check(await page.locator('.admin-user').count()===3,'admin user list');await page.locator('#userSearch').fill('同學 A');check(await page.locator('.admin-user').count()===1,'admin search');
  await page.locator('.admin-user').click();check(await page.locator('#userDetail').isVisible(),'user detail');await page.locator('#closeDetail').click();await page.locator('#userSearch').fill('');
  await page.locator('#contentTab').click();check((await page.locator('#archivedPermissions').textContent()).includes('原有指定名單 1 人'),'old permission summary');
  check(await page.locator('#contentPanel a[href*="access-admin"]').count()===0,'no old content link');
  await page.locator('#settingsTab').click();await page.locator('#registrationToggle').click();await page.locator('#saveSettings').click();await page.locator('#cancelRegistration').click();
  check(await page.evaluate(()=>window.__WRITES.filter(w=>w.ref==='settings/system').length)===0,'cancel has no writes');
  await page.locator('#saveSettings').click();await page.locator('#confirmRegistration').click();await page.waitForFunction(()=>window.__WRITES.some(w=>w.ref==='settings/system'));
  check(await page.evaluate(()=>Object.keys(window.__WRITES.find(w=>w.ref==='settings/system').patch).sort().join(','))==='registrationOpen,updatedAt','registration change only');
  await page.locator('#adminNewPassword').fill('long-test-password');await page.locator('#adminConfirmPassword').fill('mismatched');await page.locator('#adminPasswordForm button[type="submit"]').click();
  check((await page.locator('#adminPasswordNotice').textContent()).includes('不一致'),'password confirmation');
  check(await page.evaluate(()=>window.__WRITES.filter(w=>w.kind==='password').length)===0,'no accidental password write');
  await page.locator('#overviewTab').click();await page.screenshot({path:path.join(shots,'manage-mobile.png'),fullPage:true});await noOverflow(page);check(errors.length===0,errors.join('\n'));

  const regular=await create('user'),requests=[];regular.page.on('request',r=>requests.push(r.url()));
  await loaded(regular.page,'index.html');check(await regular.page.locator('#preparingPanel').isVisible(),'ordinary home unchanged');check(!await regular.page.locator('#adminWorkspace').isVisible(),'no admin cards');
  await regular.page.goto(base+'/en-second-vocab.html');await regular.page.waitForURL('**/index.html');
  check(!requests.some(url=>url.endsWith('/en-second-vocab-data.js')),'ordinary role cannot fetch data through app');
  await regular.page.goto(base+'/manage.html');await regular.page.waitForURL('**/index.html');check(!await regular.page.locator('#manageLink').isVisible(),'no management');
  await regular.page.screenshot({path:path.join(shots,'home-user-mobile.png'),fullPage:true});check(regular.errors.length===0,regular.errors.join('\n'));

  const dark=await create('admin',{width:360,height:800},'dark');await loaded(dark.page);await noOverflow(dark.page);
  check(await dark.page.locator('#wordSearch').evaluate(el=>getComputedStyle(el).color)==='rgb(238, 243, 251)','dark input legible');
  await dark.page.locator('#quizTab').click();await dark.page.screenshot({path:path.join(shots,'quiz-dark-mobile.png'),fullPage:true});await noOverflow(dark.page);
  const desktop=await create('admin',{width:1280,height:900});await loaded(desktop.page);await desktop.page.screenshot({path:path.join(shots,'vocab-desktop.png')});await noOverflow(desktop.page);
  check(await desktop.page.locator('.v2-hero').evaluate(el=>getComputedStyle(el).animationName)==='none','reduced motion honored');
  console.log('PASS: '+assertions+' browser assertions; screenshots: '+shots);
}finally{await Promise.all(contexts.map(c=>c.close()));await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
