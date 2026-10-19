import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {attemptIdFromScoreId,bestScore,discardLegacyScores,highestScores} from '../stats-utils.js';
import {summarizeWrongItems} from '../wrong-items.js';
import {correctAnswerFrom,userAnswerFrom} from '../attempt-utils.js';
import {ENGLISH_REVIEW_ITEMS,ENGLISH_REVIEW_SOURCES} from '../english-review-data.js';
import {MAG_CLOZE_SETS} from '../en-mag-cloze-60-data.js';
import {FINAL_REVIEW_BANK} from '../admin-final-review-data.js';
import {MORNING_QUIZ_BANK} from '../admin-morning-quiz-data.js';

const root=path.resolve(import.meta.dirname,'..');
const files=fs.readdirSync(root).filter((name)=>fs.statSync(path.join(root,name)).isFile());
const htmlFiles=files.filter((name)=>name.endsWith('.html')).sort();
const jsFiles=files.filter((name)=>name.endsWith('.js')).sort();
const errors=[];

try{execFileSync(process.execPath,[path.join(root,'scripts','build-answer-catalog.mjs'),'--check'],{stdio:'pipe'});}
catch(error){fail('answer-catalog.js',String(error.stderr||error.message).trim());}
try{execFileSync(process.execPath,[path.join(root,'scripts','build-english-review.mjs'),'--check'],{stdio:'pipe'});}
catch(error){fail('english-review-data.js',String(error.stderr||error.message).trim());}
try{execFileSync(process.execPath,['--experimental-vm-modules',path.join(root,'scripts','test-study-v2.mjs')],{stdio:'pipe'});}
catch(error){fail('second-midterm',String(error.stderr||error.message).trim());}

function fail(file,message){errors.push(`${file}: ${message}`);}
function localTarget(value){
  if(!value||/^(?:https?:|data:|mailto:|tel:|javascript:|#)/i.test(value))return null;
  return value.split(/[?#]/,1)[0];
}
function readInlineArray(file,name){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  const match=source.match(new RegExp(`^var ${name} = (.*);$`,'m'));
  if(!match)throw new Error(`${file}: missing ${name} array`);
  return vm.runInNewContext(`(${match[1]})`,Object.create(null),{timeout:1000});
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
  if(source.includes("list.className='word-list',numberByFamily="))fail(file,'contains an undeclared numberByFamily assignment that breaks module rendering');

  for(const match of source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(/\btype=["']module["']/i.test(match[1]))continue;
    try{new vm.Script(match[2],{filename:file});}
    catch(error){fail(file,`inline script syntax error: ${error.message}`);}
  }

  if(['en-book-l2.html','en-book-l3.html','en-mag-7-9.html','en-mag-10-14.html','en-4500-11-1.html','en-4500-11-2.html'].includes(file)){
    const match=source.match(/function norm\(s\)\{[\s\S]*?\}/);
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

const lesson3Words=readInlineArray('en-book-l3.html','WORDS');
const lesson3Phrases=readInlineArray('en-book-l3.html','PHRASES');
if(lesson3Words.length!==36||lesson3Phrases.length!==6)fail('en-book-l3.html','expected 36 word forms and 6 phrases');
const lesson3Source=fs.readFileSync(path.join(root,'en-book-l3.html'),'utf8');
if(!lesson3Source.includes("v.from==='l3'"))fail('en-book-l3.html','phrase section is not connected to the Lesson 3 bank');
const lesson3Headwords=new Set(lesson3Words.map((row)=>row[2]));
const lesson3Prompts=new Set();
for(const expected of ['humankind','universe','fur','enable','upright','generous','conflict','distribution','benefit','slaughter','underneath','freeze','victim','miserable','hollow','furious','theft','punish','banish','torture','civilization']){
  if(!lesson3Headwords.has(expected))fail('en-book-l3.html',`missing textbook headword: ${expected}`);
}
for(const row of lesson3Words){
  const promptKey=`${row[4]}|${row[5]}`;
  if(lesson3Prompts.has(promptKey))fail('en-book-l3.html',`duplicate quiz prompt: ${promptKey}`);
  lesson3Prompts.add(promptKey);
  const distractors=String(row[7]||'').split('|').filter(Boolean);
  if(distractors.length!==3||new Set(distractors.map((item)=>item.toLowerCase())).size!==3)fail('en-book-l3.html',`invalid distractors for ${row[2]}`);
  if(distractors.some((item)=>item.toLowerCase()===String(row[2]).toLowerCase()))fail('en-book-l3.html',`correct answer repeated among distractors for ${row[2]}`);
}
for(const row of lesson3Phrases){
  const distractors=String(row[4]||'').split('|').filter(Boolean);
  if(distractors.length!==3||new Set(distractors.map((item)=>item.toLowerCase())).size!==3)fail('en-book-l3.html',`invalid phrase distractors for ${row[1]}`);
  if(distractors.some((item)=>item.toLowerCase()===String(row[1]).toLowerCase()))fail('en-book-l3.html',`correct phrase repeated among distractors for ${row[1]}`);
}

const magazineClozeSource=fs.readFileSync(path.join(root,'en-mag-cloze-60.html'),'utf8');
for(const marker of ['id="quizSetup"','id="unitPicks"','data-unit="U2"','data-unit="U4"','data-unit="U8"','data-unit="U10"','let activeSets=[]','const total=activeSets.length*5','id="chooseAgain"']){
  if(!magazineClozeSource.includes(marker))fail('en-mag-cloze-60.html',`missing selectable-range marker: ${marker}`);
}
if(magazineClozeSource.includes('right/60*100'))fail('en-mag-cloze-60.html','score still uses a fixed 60-question denominator');

const bio21Source=fs.readFileSync(path.join(root,'bio-2-1.html'),'utf8');
const bio21Match=bio21Source.match(/var RAW = (\[[\s\S]*?\n\]);/);
if(!bio21Match)fail('bio-2-1.html','missing RAW quiz bank');
else{
  const bio21Raw=vm.runInNewContext(`(${bio21Match[1]})`,Object.create(null),{timeout:1000});
  if(bio21Raw.length!==40)fail('bio-2-1.html',`expected 40 quiz questions, found ${bio21Raw.length}`);
  const counts=new Map(),questions=new Set();
  for(const row of bio21Raw){
    const [kind,question,answer,distractors,explanation]=row;
    counts.set(kind,(counts.get(kind)||0)+1);
    if(questions.has(question))fail('bio-2-1.html',`duplicate quiz question: ${question}`);
    questions.add(question);
    if(!question||!answer||!explanation)fail('bio-2-1.html','quiz row has an empty required field');
    if(!Array.isArray(distractors)||distractors.length!==3||new Set(distractors).size!==3)fail('bio-2-1.html',`invalid distractors for: ${question}`);
    if(distractors.includes(answer))fail('bio-2-1.html',`correct answer repeated among distractors for: ${question}`);
  }
  for(const kind of ['cell','surface','vascular','system'])if(counts.get(kind)!==10)fail('bio-2-1.html',`expected 10 ${kind} questions, found ${counts.get(kind)||0}`);
}
for(const marker of ['id="startBtn"','id="qchoices"','id="nextBtn"',"nx:score:bio-2-1"]){
  if(!bio21Source.includes(marker))fail('bio-2-1.html',`missing quiz marker: ${marker}`);
}
const bioSubjectSource=fs.readFileSync(path.join(root,'s-bio.html'),'utf8');
if(!bioSubjectSource.includes('href="bio-2-1.html"')||!bioSubjectSource.includes('href="bio-2-2.html"')||!bioSubjectSource.includes('href="bio-3-1.html"')||!bioSubjectSource.includes('4 / 4 已整理')||!bioSubjectSource.includes("style.width='100%'"))fail('s-bio.html','Biology cards or progress are incomplete');
const homeSource=fs.readFileSync(path.join(root,'index.html'),'utf8');
const homePreparing=homeSource.includes('data-content-state="preparing"');
if(homePreparing){
  if(!homeSource.includes('第二次段考準備中')||!homeSource.includes('第一次段考內容已封存'))fail('index.html','preparing state copy is incomplete');
  if(/href="(?:s-|admin-final-review|final-quick-review|admin-morning-quiz|en-vocab-a-z|en-book-vocab-a-z|en-mag-cloze-60)/.test(homeSource)||/data-access-visible=/.test(homeSource)||/class="sub\b/.test(homeSource))fail('index.html','archived first-midterm content is still linked from the home page');
}else if(!homeSource.includes('25 / 29')||!homeSource.includes('data-done="4" data-total="4"')||!homeSource.includes('var d=25, t=29')||!homeSource.includes('六個科目的筆記與測驗'))fail('index.html','overall or Biology progress was not updated');
if(/s-(?:physics|geo)\.html/.test(homeSource)||/[>](?:物理|地理)[<]/.test(homeSource))fail('index.html','removed Physics or Geography card is still visible');
if(fs.existsSync(path.join(root,'s-physics.html'))||fs.existsSync(path.join(root,'s-geo.html')))fail('project','removed Physics or Geography subject page still exists');

const bio22Source=fs.readFileSync(path.join(root,'bio-2-2.html'),'utf8');
const bio22Match=bio22Source.match(/var RAW = (\[[\s\S]*?\n\]);/);
if(!bio22Match)fail('bio-2-2.html','missing RAW quiz bank');
else{
  const bio22Raw=vm.runInNewContext(`(${bio22Match[1]})`,Object.create(null),{timeout:1000});
  if(bio22Raw.length!==40)fail('bio-2-2.html',`expected 40 quiz questions, found ${bio22Raw.length}`);
  const counts=new Map(),questions=new Set();
  for(const row of bio22Raw){
    const [kind,question,answer,distractors,explanation]=row;
    counts.set(kind,(counts.get(kind)||0)+1);
    if(questions.has(question))fail('bio-2-2.html',`duplicate quiz question: ${question}`);
    questions.add(question);
    if(!question||!answer||!explanation)fail('bio-2-2.html','quiz row has an empty required field');
    if(!Array.isArray(distractors)||distractors.length!==3||new Set(distractors).size!==3)fail('bio-2-2.html',`invalid distractors for: ${question}`);
    if(distractors.includes(answer))fail('bio-2-2.html',`correct answer repeated among distractors for: ${question}`);
  }
  for(const kind of ['root','stem','wood','leaf'])if(counts.get(kind)!==10)fail('bio-2-2.html',`expected 10 ${kind} questions, found ${counts.get(kind)||0}`);
}
for(const marker of ['id="startBtn"','id="qchoices"','id="nextBtn"',"nx:score:bio-2-2"]){
  if(!bio22Source.includes(marker))fail('bio-2-2.html',`missing quiz marker: ${marker}`);
}

const bio31Source=fs.readFileSync(path.join(root,'bio-3-1.html'),'utf8');
const bio31Match=bio31Source.match(/var RAW = (\[[\s\S]*?\n\]);/);
if(!bio31Match)fail('bio-3-1.html','missing RAW quiz bank');
else{
  const bio31Raw=vm.runInNewContext(`(${bio31Match[1]})`,Object.create(null),{timeout:1000});
  if(bio31Raw.length!==40)fail('bio-3-1.html',`expected 40 quiz questions, found ${bio31Raw.length}`);
  const counts=new Map(),questions=new Set();
  for(const row of bio31Raw){
    const [kind,question,answer,distractors,explanation]=row;
    counts.set(kind,(counts.get(kind)||0)+1);
    if(questions.has(question))fail('bio-3-1.html',`duplicate quiz question: ${question}`);
    questions.add(question);
    if(!question||!answer||!explanation)fail('bio-3-1.html','quiz row has an empty required field');
    if(!Array.isArray(distractors)||distractors.length!==3||new Set(distractors).size!==3)fail('bio-3-1.html',`invalid distractors for: ${question}`);
    if(distractors.includes(answer))fail('bio-3-1.html',`correct answer repeated among distractors for: ${question}`);
  }
  for(const kind of ['uptake','radial','xylem','stomata'])if(counts.get(kind)!==10)fail('bio-3-1.html',`expected 10 ${kind} questions, found ${counts.get(kind)||0}`);
}
for(const marker of ['id="startBtn"','id="qchoices"','id="nextBtn"',"nx:score:bio-3-1"]){
  if(!bio31Source.includes(marker))fail('bio-3-1.html',`missing quiz marker: ${marker}`);
}

if(htmlFiles.length!==44)fail('project',`expected 44 HTML pages, found ${htmlFiles.length}`);
const protectedCount=htmlFiles.filter((file)=>file!=='login.html').length;
if(protectedCount!==43)fail('project',`expected 43 protected pages, found ${protectedCount}`);

const finalReviewSource=fs.readFileSync(path.join(root,'admin-final-review.html'),'utf8');
const expectedFinalCounts={chemistry:23,biology:27,english:15};
for(const [subject,expectedCount] of Object.entries(expectedFinalCounts)){
  const bank=FINAL_REVIEW_BANK[subject];
  if(!bank||bank.questions.length!==expectedCount)fail('admin-final-review-data.js',`${subject} expected ${expectedCount} questions, found ${bank?.questions?.length||0}`);
  const prompts=new Set();
  for(const item of bank?.questions||[]){
    if(!item.u||!item.q||!item.why||!item.trap)fail('admin-final-review-data.js',`${subject} has an empty required field`);
    if(prompts.has(item.q))fail('admin-final-review-data.js',`${subject} has a duplicate question: ${item.q}`);prompts.add(item.q);
    if(!Array.isArray(item.c)||item.c.length!==4||new Set(item.c).size!==4)fail('admin-final-review-data.js',`${subject} question must have four unique choices: ${item.q}`);
    if(!Number.isInteger(item.a)||item.a<0||item.a>3)fail('admin-final-review-data.js',`${subject} question has an invalid answer index: ${item.q}`);
  }
}
for(const unit of ['1-1','1-2','1-3','2-1','2-2','2-3'])if(FINAL_REVIEW_BANK.chemistry.questions.filter(function(item){return item.u.startsWith(unit);}).length<3)fail('admin-final-review-data.js',`Chemistry ${unit} needs at least three questions`);
for(const unit of ['2-1','2-2','3-1','3-2'])if(FINAL_REVIEW_BANK.biology.questions.filter(function(item){return item.u.startsWith(unit);}).length<6)fail('admin-final-review-data.js',`Biology ${unit} needs at least six questions`);
if(FINAL_REVIEW_BANK.biology.questions.some(function(item){return item.u.startsWith('3-3');}))fail('admin-final-review-data.js','Biology final review must exclude 3-3');
for(const category of ['課本','雜誌','4500'])if(!FINAL_REVIEW_BANK.english.questions.some(function(item){return item.u.includes(category);}))fail('admin-final-review-data.js',`English final review is missing ${category}`);
for(const marker of ['data-admin-only="true"','data-access-key="finalReviewAllowedUids"','data-admin-fallback="index.html"','id="startBtn"','id="nextBtn"','id="rScore"','id="rLine"','id="rWrong"','id="permissionLink"','access-admin.html?target=final','session.profile.role!==\'admin\'','chem-final-review','bio-final-review','en-final-review','item.why','item.trap']){
  if(!finalReviewSource.includes(marker))fail('admin-final-review.html',`missing final review marker: ${marker}`);
}
const finalReviewModule=finalReviewSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!finalReviewModule)fail('admin-final-review.html','missing inline final review module');
else{
  try{new vm.Script(finalReviewModule[1].replace(/^import .*;$/gm,'').replace('const session=await waitForSession();',"const session={profile:{role:'admin'}};"),{filename:'admin-final-review.html'});}
  catch(error){fail('admin-final-review.html',`final review module syntax error: ${error.message}`);}
}
if(!homePreparing&&(!homeSource.includes('href="admin-final-review.html"')||!homeSource.includes('data-access-visible="finalReviewAllowedUids"')||!homeSource.includes('化學 23・生物 27・英文 15')))fail('index.html','admin final review card is missing or visible to regular users');
const quickReviewSource=fs.readFileSync(path.join(root,'final-quick-review.html'),'utf8');
for(const marker of ['data-admin-only="true"','data-access-key="quickReviewAllowedUids"','id="permissionBtn"','id="permissionSheet"','id="permissionUsers"','id="permissionCount"','id="selectAllUsers"','id="clearUsers"','id="savePermission"','class="hero-stats"','class="user-avatar"','data-section="chem"','data-section="bio"','data-section="english"','quickReviewAllowedUids','getDocs(collection(db,\'users\'))','session.profile.role!==\'admin\'']){
  if(!quickReviewSource.includes(marker))fail('final-quick-review.html',`missing quick review marker: ${marker}`);
}
for(const section of ['chem','bio','english']){
  const match=quickReviewSource.match(new RegExp(`<section class="section" data-section="${section}"[^>]*>([\\s\\S]*?)<\\/section>`));
  const text=(match?.[1]||'').replace(/<[^>]+>/g,'').replace(/\s+/g,'');
  if(text.length<1300)fail('final-quick-review.html',`${section} quick review is too short: ${text.length} characters`);
}
const quickReviewModule=quickReviewSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!quickReviewModule)fail('final-quick-review.html','missing inline quick review module');
else{
  try{new vm.Script(quickReviewModule[1].replace(/^import .*;$/gm,'').replace('session=await waitForSession();',"session={profile:{role:'admin'},preview:true};"),{filename:'final-quick-review.html'});}
  catch(error){fail('final-quick-review.html',`quick review module syntax error: ${error.message}`);}
}
if(!homePreparing&&(!homeSource.includes('href="final-quick-review.html"')||!homeSource.includes('data-access-visible="quickReviewAllowedUids"')||!homeSource.includes('考前最終速讀')))fail('index.html','quick review access card is missing');
if(!homePreparing&&!/<div class="grid" style="margin-top:14px">[\s\S]*?data-access-visible="finalReviewAllowedUids"[\s\S]*?data-access-visible="quickReviewAllowedUids"[\s\S]*?<\/div>\s*<div class="grid" style="margin-top:14px">/.test(homeSource))fail('index.html','admin review cards are not paired in one grid');

const morningQuizSource=fs.readFileSync(path.join(root,'admin-morning-quiz.html'),'utf8');
for(const [subject,expectedCount] of Object.entries({chemistry:5,biology:5,english:5})){
  const bank=MORNING_QUIZ_BANK[subject];
  if(!bank||bank.questions.length!==expectedCount)fail('admin-morning-quiz-data.js',`${subject} expected ${expectedCount} questions, found ${bank?.questions?.length||0}`);
  const prompts=new Set();
  for(const item of bank?.questions||[]){
    if(!item.u||!item.q||!item.why||!item.trap)fail('admin-morning-quiz-data.js',`${subject} has an empty required field`);
    if(prompts.has(item.q))fail('admin-morning-quiz-data.js',`${subject} has a duplicate question: ${item.q}`);prompts.add(item.q);
    if(!Array.isArray(item.c)||item.c.length!==4||new Set(item.c).size!==4)fail('admin-morning-quiz-data.js',`${subject} question must have four unique choices: ${item.q}`);
    if(!Number.isInteger(item.a)||item.a<0||item.a>3)fail('admin-morning-quiz-data.js',`${subject} question has an invalid answer index: ${item.q}`);
  }
}
for(const marker of ['data-admin-only="true"','data-access-key="morningQuizAllowedUids"','data-admin-fallback="index.html"','id="startBtn"','id="nextBtn"','id="rScore"','id="rWrong"','id="permissionLink"','access-admin.html?target=morning','MORNING_QUIZ_BANK','document.addEventListener','session.profile.role!==\'admin\'']){
  if(!morningQuizSource.includes(marker))fail('admin-morning-quiz.html',`missing morning quiz marker: ${marker}`);
}
const morningQuizModule=morningQuizSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!morningQuizModule)fail('admin-morning-quiz.html','missing inline morning quiz module');
else{
  try{new vm.Script(morningQuizModule[1].replace(/^import .*;$/gm,'').replace('const session=await waitForSession();',"const session={profile:{role:'admin'}};"),{filename:'admin-morning-quiz.html'});}
  catch(error){fail('admin-morning-quiz.html',`morning quiz module syntax error: ${error.message}`);}
}
if(!homePreparing&&(!homeSource.includes('href="admin-morning-quiz.html"')||!homeSource.includes('data-access-visible="morningQuizAllowedUids"')||!homeSource.includes('化學 5・生物 5・英文 5')))fail('index.html','morning quiz access card is missing');

const accessAdminSource=fs.readFileSync(path.join(root,'access-admin.html'),'utf8');
for(const marker of ['data-admin-only="true"','id="targetTabs"','finalReviewAllowedUids','quickReviewAllowedUids','morningQuizAllowedUids','vocabAzAllowedUids','bookVocabAllowedUids','magClozeAllowedUids','getDocs(collection(db,\'users\'))','id="permissionUsers"','id="permissionCount"','id="savePermission"','TARGETS']){
  if(!accessAdminSource.includes(marker))fail('access-admin.html',`missing access manager marker: ${marker}`);
}
const accessAdminModule=accessAdminSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!accessAdminModule)fail('access-admin.html','missing inline access manager module');
else{
  try{new vm.Script(accessAdminModule[1].replace(/^import .*;$/gm,'').replace("session=await waitForSession();const requested", "session={profile:{role:'admin'},preview:true};const requested"),{filename:'access-admin.html'});}
  catch(error){fail('access-admin.html',`access manager module syntax error: ${error.message}`);}
}

const englishReviewSource=fs.readFileSync(path.join(root,'en-review.html'),'utf8');
const englishSubjectSource=fs.readFileSync(path.join(root,'s-english.html'),'utf8');
if(!englishSubjectSource.includes('href="en-review.html"')||!englishSubjectSource.includes('data-id="en-review"'))fail('s-english.html','English review card is missing');
for(const marker of ['data-source="book"','data-source="mag"','data-source="vocab"','data-source="all"','id="startBtn"','id="qinput"','id="againWrong"',"item.k==='word'",'strictWord(value)===strictWord(item.en)',"item.k!=='phrase'"]){
  if(!englishReviewSource.includes(marker))fail('en-review.html',`missing review marker: ${marker}`);
}
const reviewModule=englishReviewSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!reviewModule)fail('en-review.html','missing inline review module');
else{
  try{new vm.Script(reviewModule[1].replace(/^import .*;$/m,''),{filename:'en-review.html'});}
  catch(error){fail('en-review.html',`review module syntax error: ${error.message}`);}
}
if(ENGLISH_REVIEW_SOURCES.length!==12||new Set(ENGLISH_REVIEW_SOURCES).size!==12)fail('english-review-data.js','expected 12 unique source pages');
if(ENGLISH_REVIEW_ITEMS.length<650)fail('english-review-data.js',`review bank is unexpectedly small: ${ENGLISH_REVIEW_ITEMS.length}`);
for(const group of ['book','mag','vocab']){
  const groupItems=ENGLISH_REVIEW_ITEMS.filter(function(item){return item.source===group;});
  if(!groupItems.some(function(item){return item.k==='word';})||!groupItems.some(function(item){return item.k==='phrase';}))fail('english-review-data.js',`${group} is missing words or phrases`);
}
for(const item of ENGLISH_REVIEW_ITEMS){
  if(!['word','phrase'].includes(item.k)||!item.en||!item.zh||!item.lesson||!item.pageId)fail('english-review-data.js','review item has an empty or invalid required field');
}

const adminVocabSource=fs.readFileSync(path.join(root,'en-vocab-a-z.html'),'utf8');
const vocabPageIds=new Set(['en-4500-9-1','en-4500-9-2','en-4500-10','en-4500-11-1','en-4500-11-2']);
const adminVocabItems=ENGLISH_REVIEW_ITEMS.filter(function(item){return item.k==='word'&&vocabPageIds.has(item.pageId);});
if(adminVocabItems.length!==228||new Set(adminVocabItems.map(function(item){return item.en.toLowerCase();})).size!==228)fail('en-vocab-a-z.html','expected 228 unique vocabulary words');
for(const marker of ['data-admin-only="true"','data-access-key="vocabAzAllowedUids"','data-admin-fallback="s-english.html"','id="permissionLink"','access-admin.html?target=vocab','id="showAll"','id="hideAll"','id="letterNav"','id="wordRoot"','waitForSession()',"session.profile.role!=='admin'"]){
  if(!adminVocabSource.includes(marker))fail('en-vocab-a-z.html',`missing admin vocabulary marker: ${marker}`);
}
const redWordsMatch=adminVocabSource.match(/const RED_WORDS=new Set\(\[([\s\S]*?)\]\);/);
if(!redWordsMatch)fail('en-vocab-a-z.html','missing red review word set');
else{
  const redWords=vm.runInNewContext(`[${redWordsMatch[1]}]`,Object.create(null),{timeout:1000});
  if(redWords.length!==42||new Set(redWords).size!==42)fail('en-vocab-a-z.html',`expected 42 unique red review words, found ${redWords.length}`);
  const vocabulary=new Set(adminVocabItems.map(function(item){return item.en.toLowerCase();}));
  for(const word of redWords)if(!vocabulary.has(word))fail('en-vocab-a-z.html',`red review word is missing from vocabulary: ${word}`);
}
for(const marker of ['.word-row.needs-review .word','RED_WORDS.has(item.en.toLowerCase())',"button.classList.add('needs-review')"]){
  if(!adminVocabSource.includes(marker))fail('en-vocab-a-z.html',`missing red review marker: ${marker}`);
}
for(const marker of ['id="quizSetup"','id="letterPicker"','data-mode="mc"','data-mode="type"','data-direction="zh-en"','data-direction="en-zh"','data-scope="red"','data-scope="all"','id="startQuiz"','id="quizChoices"','id="quizInput"','id="quizNext"','id="quizDone"','function currentQuizPool()','function lenientChinese(value,answer)',"strictEnglish(value)===strictEnglish(item.en)","document.addEventListener('keydown'","Math.max(old,score)"]){
  if(!adminVocabSource.includes(marker))fail('en-vocab-a-z.html',`missing admin vocabulary quiz marker: ${marker}`);
}
const adminVocabModule=adminVocabSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!adminVocabModule)fail('en-vocab-a-z.html','missing inline vocabulary module');
else{
  try{new vm.Script(adminVocabModule[1].replace(/^import .*;$/gm,'').replace('const session=await waitForSession();',"const session={profile:{role:'admin'}};"),{filename:'en-vocab-a-z.html'});}
  catch(error){fail('en-vocab-a-z.html',`vocabulary module syntax error: ${error.message}`);}
}
if(!englishSubjectSource.includes('href="en-vocab-a-z.html"')||!englishSubjectSource.includes('data-access-visible="vocabAzAllowedUids"'))fail('s-english.html','4500 A–Z access card is missing');

const adminBookVocabSource=fs.readFileSync(path.join(root,'en-book-vocab-a-z.html'),'utf8');
const bookPageIds=new Set(['en-book-l1','en-book-l2','en-book-l3']);
const adminBookVocabItems=ENGLISH_REVIEW_ITEMS.filter(function(item){return item.k==='word'&&bookPageIds.has(item.pageId);});
if(adminBookVocabItems.length!==105||new Set(adminBookVocabItems.map(function(item){return item.en.toLowerCase();})).size!==98)fail('en-book-vocab-a-z.html','expected 105 source rows and 98 merged textbook words');
for(const marker of ['data-admin-only="true"','data-access-key="bookVocabAllowedUids"','data-admin-fallback="s-english.html"','id="permissionLink"','access-admin.html?target=book','課本 L1–L3 單字 A–Z','data-book="all"','data-book="en-book-l1"','data-book="en-book-l2"','data-book="en-book-l3"','id="letterPicker"','id="startQuiz"','id="quizChoices"','id="quizInput"','function currentQuizPool()','function lenientChinese(value,answer)',"item.pageIds.includes(Q.book)","strictEnglish(value)===strictEnglish(item.en)","document.addEventListener('keydown'","nx:score:en-book-vocab-a-z","session.profile.role!=='admin'"]){
  if(!adminBookVocabSource.includes(marker))fail('en-book-vocab-a-z.html',`missing textbook vocabulary marker: ${marker}`);
}
const adminBookVocabModule=adminBookVocabSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!adminBookVocabModule)fail('en-book-vocab-a-z.html','missing inline textbook vocabulary module');
else{
  try{new vm.Script(adminBookVocabModule[1].replace(/^import .*;$/gm,'').replace('const session=await waitForSession();',"const session={profile:{role:'admin'}};"),{filename:'en-book-vocab-a-z.html'});}
  catch(error){fail('en-book-vocab-a-z.html',`textbook vocabulary module syntax error: ${error.message}`);}
}
if(!englishSubjectSource.includes('href="en-book-vocab-a-z.html"')||!englishSubjectSource.includes('data-access-visible="bookVocabAllowedUids"'))fail('s-english.html','textbook A–Z access card is missing');

const magClozeSource=fs.readFileSync(path.join(root,'en-mag-cloze-60.html'),'utf8');
const magClozeQuestions=MAG_CLOZE_SETS.flatMap(function(set){return set.questions.map(function(question){return{set,question};});});
if(MAG_CLOZE_SETS.length!==12||magClozeQuestions.length!==60)fail('en-mag-cloze-60-data.js',`expected 12 passages and 60 questions, found ${MAG_CLOZE_SETS.length} passages and ${magClozeQuestions.length} questions`);
const expectedMagAnswers='BBACCCBCDBABCCBABABCCBCCBBCACBABCBCABCACBACBCBABCCBBCCBACACB';
const actualMagAnswers=magClozeQuestions.map(function(item,index){
  const q=item.question;if(q[0]!==index+1)fail('en-mag-cloze-60-data.js',`question number ${q[0]} is out of sequence at position ${index+1}`);
  if(!Array.isArray(q[1])||q[1].length!==4||new Set(q[1]).size!==4)fail('en-mag-cloze-60-data.js',`question ${q[0]} must have four unique options`);
  if(!Number.isInteger(q[2])||q[2]<0||q[2]>3||q[3]!==q[1][q[2]]||!q[4])fail('en-mag-cloze-60-data.js',`question ${q[0]} has an invalid answer or explanation`);
  return'ABCD'[q[2]];
}).join('');
if(actualMagAnswers!==expectedMagAnswers)fail('en-mag-cloze-60-data.js','the 60-answer key does not match the PDF answer key');
for(const unit of ['U2','U4','U8','U10'])if(magClozeQuestions.filter(function(item){return item.set.unit===unit;}).length!==15)fail('en-mag-cloze-60-data.js',`${unit} must contain exactly 15 questions`);
for(const marker of ['data-admin-only="true"','data-user-allow="78歲純情老少女"','data-access-key="magClozeAllowedUids"','data-admin-fallback="s-english.html"','id="permissionLink"','access-admin.html?target=cloze','id="submitGroup"','id="nextGroup"','id="questionRoot"','每 5 題送出一次','function submitGroup()','function nextGroup()','question[4]',"nx:score:en-mag-cloze-60","session.profile.role!=='admin'"]){
  if(!magClozeSource.includes(marker))fail('en-mag-cloze-60.html',`missing magazine cloze marker: ${marker}`);
}
const magClozeModule=magClozeSource.match(/<script type="module">([\s\S]*?)<\/script>/i);
if(!magClozeModule)fail('en-mag-cloze-60.html','missing inline magazine cloze module');
else{
  try{new vm.Script(magClozeModule[1].replace(/^import .*;$/gm,'').replace('const session=await waitForSession();',"const session={profile:{role:'admin'}};"),{filename:'en-mag-cloze-60.html'});}
  catch(error){fail('en-mag-cloze-60.html',`magazine cloze module syntax error: ${error.message}`);}
}
if(!englishSubjectSource.includes('href="en-mag-cloze-60.html"')||!englishSubjectSource.includes('data-access-visible="magClozeAllowedUids"')||!englishSubjectSource.includes('data-access-group="vocabAzAllowedUids,bookVocabAllowedUids,magClozeAllowedUids"'))fail('s-english.html','magazine cloze access card or limited-tools group is missing');

const wrongSummary=summarizeWrongItems([
  {subject:'english',wrongItems:['Hypothesis','hypothesis','give in','理想氣體']},
  {subject:'chemistry',wrongItems:['oxygen','理想氣體']},
  {subject:'chinese',wrongItems:['燭之武說服秦伯的理由']}
]);
if(wrongSummary.topWrongWords.length!==1||wrongSummary.topWrongWords[0].term!=='hypothesis'||wrongSummary.topWrongWords[0].count!==2)fail('stats-utils.js','common English words include a phrase or another subject');
if(wrongSummary.wrongQuestions.length!==5)fail('stats-utils.js','non-word mistakes were not preserved in the other-question list');
const detailedSummary=summarizeWrongItems([{subject:'english',pageTitle:'字彙 Chapter 10',wrongItems:[{term:'Hypothesis',meaning:'n. 假設',correctAnswer:'Hypothesis',userAnswer:'hypotesis'}]},{subject:'chemistry',pageTitle:'化學 第 2 章',wrongItems:[{question:'理想氣體的適用條件',correctAnswer:'高溫、低壓',userAnswer:'低溫、高壓'}]}]);
if(detailedSummary.topWrongWords[0]?.meaning!=='n. 假設'||detailedSummary.topWrongWords[0]?.lessons[0]?.lesson!=='字彙 Chapter 10')fail('stats-utils.js','English word details or lesson grouping were lost');
if(detailedSummary.wrongQuestions[0]?.correctAnswer!=='高溫、低壓'||detailedSummary.wrongQuestions[0]?.userAnswer!=='低溫、高壓')fail('stats-utils.js','wrong-question answer details were lost');
const legacySummary=summarizeWrongItems([
  {pageId:'en-book-l1',pageTitle:'英文課本 Lesson 1',subject:'english',wrongItems:['employ']},
  {pageId:'chem-2',pageTitle:'化學 第 2 章',subject:'chemistry',wrongItems:['理想氣體方程式為何？']},
  {pageId:'math-1',pageTitle:'數學 第 1 章',subject:'math',wrongItems:['sin 18° 的值是多少？']}
]);
if(!legacySummary.topWrongWords[0]?.meaning)fail('answer-catalog.js','legacy English meanings are not restored');
if(legacySummary.wrongQuestions.some(function(item){return!item.correctAnswer;}))fail('answer-catalog.js','legacy correct answers are not restored');
if(userAnswerFrom('解析（你選了：低溫、高壓）')!=='低溫、高壓'||userAnswerFrom('你寫的／選的：hypotesis')!=='hypotesis')fail('attempt-utils.js','selected wrong answers are not parsed');
if(correctAnswerFrom('正解：高溫、低壓　·　解析')!=='高溫、低壓')fail('attempt-utils.js','correct answer is not parsed');
if(attemptIdFromScoreId('chem-2-1')!=='chem-2'||attemptIdFromScoreId('chem-2-2')!==null||attemptIdFromScoreId('chem-2-3')!==null)fail('stats-utils.js','Chemistry chapter 2 attempts are not canonicalized');
if(bestScore(100,64)!==100||bestScore(76,92)!==92||bestScore(null,88)!==88)fail('stats-utils.js','best score selection can lose a higher result');
const scoreSummary=highestScores([{pageId:'en-book-l2',score:72},{pageId:'en-book-l1',score:80},{pageId:'en-book-l2',score:100},{pageId:'en-book-l1',score:63}]);
if(scoreSummary.get('en-book-l2')!==100||scoreSummary.get('en-book-l1')!==80)fail('stats-utils.js','attempt history does not preserve per-page highest scores');
const oldStore=new Map([['nx:score:en-book-l1','88'],['nx:time:en-book-l1','123'],['nx:synced:old','1'],['nx:theme','dark']]);
const storageMock={get length(){return oldStore.size;},key(index){return[...oldStore.keys()][index]??null;},getItem(key){return oldStore.get(key)??null;},setItem(key,value){oldStore.set(key,String(value));},removeItem(key){oldStore.delete(key);}};
if(!discardLegacyScores(storageMock,'firebase-v1')||oldStore.has('nx:score:en-book-l1')||oldStore.has('nx:time:en-book-l1')||oldStore.has('nx:synced:old')||oldStore.get('nx:theme')!=='dark'||oldStore.get('nx:score-era')!=='firebase-v1')fail('stats-utils.js','legacy scores were not discarded safely');
if(discardLegacyScores(storageMock,'firebase-v1'))fail('stats-utils.js','current score era was cleared more than once');

const manageSource=fs.readFileSync(path.join(root,'manage.html'),'utf8');
if(/id=["'](?:openAt|closeAt)["']/.test(manageSource))fail('manage.html','scheduled registration inputs are still present');
const meSource=fs.readFileSync(path.join(root,'me.html'),'utf8');
if(/id=["']passwordForm["']/.test(meSource))fail('me.html','regular users can still change passwords');
if(!fs.existsSync(path.join(root,'history.html'))||!fs.existsSync(path.join(root,'history.js')))fail('history','full learning history page is missing');
const loginSource=fs.readFileSync(path.join(root,'login.html'),'utf8');
if(!/class=["']login-page["']/.test(loginSource)||!loginSource.includes('login-backdrop')||!loginSource.includes('viewport-fit=cover'))fail('login.html','mobile glass login layout is incomplete');
if(!loginSource.includes('Safari 或 Chrome 外部瀏覽器')||!loginSource.includes('Instagram 內建瀏覽器可能卡住'))fail('login.html','external-browser registration guidance is missing');
if(!loginSource.includes('account-pages.css?v='))fail('login.html','login stylesheet cache busting is missing');
if(loginSource.includes('glass-shard--two'))fail('login.html','removed top-right glass block is still present');
const accountCssSource=fs.readFileSync(path.join(root,'account-pages.css'),'utf8');
if(!accountCssSource.includes('min-height:100dvh'))fail('account-pages.css','mobile login layout does not fill the dynamic viewport height');
if(accountCssSource.includes('.login-card{border-right:0;border-left:0;border-radius:0'))fail('account-pages.css','mobile login card lost its original inset rounded layout');
if(accountCssSource.includes('.glass-shard--two'))fail('account-pages.css','removed top-right glass block styles are still present');
const firebaseSource=fs.readFileSync(path.join(root,'firebase-core.js'),'utf8');
if(!firebaseSource.includes('initializeAuth(app')||!firebaseSource.includes('indexedDBLocalPersistence')||!firebaseSource.includes('browserLocalPersistence')||!firebaseSource.includes('browserSessionPersistence'))fail('firebase-core.js','cross-browser authentication persistence fallback is incomplete');
if(/setPersistence\([^;]+\.catch/.test(firebaseSource))fail('firebase-core.js','authentication persistence still runs without being awaited');
const loginJsSource=fs.readFileSync(path.join(root,'login.js'),'utf8');
const authGateSource=fs.readFileSync(path.join(root,'auth-gate.js'),'utf8');
if(!loginJsSource.includes('await authStateReady')||!loginJsSource.includes('markAuthTransition()'))fail('login.js','login can redirect before authentication storage is ready');
if(!authGateSource.includes('await authStateReady')||!authGateSource.includes("error=session-lost"))fail('auth-gate.js','protected pages can check authentication before storage is ready');
if(!authGateSource.includes('syncEnglishHighScores')||!authGateSource.includes("pageId!=='s-english'")||!authGateSource.includes('bestScore(current,incoming)'))fail('auth-gate.js','highest-score synchronization is incomplete');
if(!authGateSource.includes('async function allowPage(session)')||!authGateSource.includes("dataset.adminOnly==='true'")||!authGateSource.includes("session.profile.role!=='admin'")||!authGateSource.includes("querySelectorAll('[data-admin-visible]')"))fail('auth-gate.js','admin-only page or role visibility enforcement is incomplete');
for(const marker of ['async function grantedAccess(session,key)','async function accessState(session,key)','data-access-visible','data-access-group','dataset.userAccessKey','document.documentElement.dataset.accessKey','list.includes(session.user.uid)'])if(!authGateSource.includes(marker))fail('auth-gate.js',`dynamic access marker is missing: ${marker}`);
const readingSource=fs.readFileSync(path.join(root,'ch-reading.html'),'utf8');
if(!/你選了：['"]?\s*\+\s*w\.mine/.test(readingSource))fail('ch-reading.html','selected wrong answer is not rendered for persistence');
const mathSource=fs.readFileSync(path.join(root,'math-1.html'),'utf8');
if(!mathSource.includes('wrong.push({q:q, mine:picked})')||!mathSource.includes('item.mine'))fail('math-1.html','selected wrong answer is not retained');

if(errors.length){
  console.error(`Validation failed with ${errors.length} issue(s):`);
  errors.forEach((error)=>console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Validation passed: ${htmlFiles.length} HTML pages, ${jsFiles.length} JavaScript files, internal links, unique IDs, auth coverage and syntax.`);
