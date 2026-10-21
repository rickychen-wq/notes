import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {SECOND_VOCAB as words,VOCAB_UNITS as units} from '../en-second-vocab-data.js';
import {acceptedChinese,canUseSecondMidterm,choicesFor,filterWords,judgeAnswer,normalizeChinese,normalizeEnglish,posLabel,summarizeAnswers} from '../study-quiz-core.js';

assert.deepEqual(units.map(u=>[u.id,u.count]),[['11-3',46],['11-4',48],['11-5',46],['11-6',46],['12-1',50]]);
assert.equal(words.length,236);
assert.equal(new Set(words.map(w=>w.id)).size,236);
assert.equal(new Set(words.map(w=>w.word)).size,236);
for(const item of words){
  assert.match(item.word,/^[a-z]+$/);
  assert.ok(item.note.length>12,item.word+' needs an explanation');
  assert.ok(item.senses.length>0);
  for(const sense of item.senses){assert.ok(sense.meaning&&sense.pos);assert.ok(posLabel(sense.pos));}
  assert.equal(item.distractors.length,3,item.word);
  assert.equal(new Set(choicesFor(item)).size,4,item.word);
  assert.ok(item.page>=216&&item.page<=252,item.word);
  assert.ok(judgeAnswer(item,item.word.toUpperCase()+'  ','cn-en'),item.word);
  assert.ok(judgeAnswer(item,item.word.split('').join(' '),'cn-en'),item.word);
  assert.ok(!judgeAnswer(item,item.word+'x','cn-en'),item.word);
  for(const wrong of item.distractors)assert.ok(!judgeAnswer(item,wrong,'cn-en'),item.word+': '+wrong);
  assert.ok(acceptedChinese(item).length>0);
  for(const meaning of acceptedChinese(item))assert.ok(judgeAnswer(item,'「 '+meaning+' 」','en-cn'),item.word+': '+meaning);
  assert.ok(!judgeAnswer(item,'完全沒有這個意思','en-cn'));
  assert.ok(!judgeAnswer(item,'','en-cn'));
}
assert.equal(normalizeEnglish(' FA MILIAR '),'familiar');
assert.equal(normalizeChinese(' 重要的。 '),'重要');
assert.ok(!judgeAnswer(words.find(w=>w.word==='significant'),'不重要','en-cn'));
assert.ok(judgeAnswer(words.find(w=>w.word==='marvelous'),'marvellous','cn-en'));
assert.ok(judgeAnswer(words.find(w=>w.word==='humidity'),'湿气','en-cn'));
assert.ok(!canUseSecondMidterm({profile:{role:'user',name:'Chen'}}));
assert.ok(!canUseSecondMidterm(null));
assert.ok(canUseSecondMidterm({profile:{role:'admin'}}));
assert.ok(canUseSecondMidterm({profile:{role:'user'},contentAccess:{secondVocab:true}}));
assert.ok(!canUseSecondMidterm({profile:{role:'user'},contentAccess:{secondVocab:false}}));
assert.ok(!canUseSecondMidterm({profile:{role:'user',secondVocabAllowedUids:['user']}}));
assert.equal(filterWords(words,{units:[]}).length,0);
assert.equal(filterWords(words,{units:['11-3']}).length,46);
assert.equal(filterWords(words,{units:units.map(u=>u.id),scope:'starred'}).length,0);
assert.deepEqual(filterWords(words,{units:['11-3'],scope:'starred',starred:{'11-3-1':true}}).map(w=>w.word),['fake']);
assert.deepEqual(filterWords(words,{units:['11-3'],scope:'wrong',wrong:{'11-3-1':true}}).map(w=>w.word),['fake']);
assert.equal(filterWords(words,{units:['11-3'],letter:'F'}).length,14);
assert.deepEqual(summarizeAnswers([{correct:true},{correct:false},{correct:true}]),{total:3,correct:2,score:67});

// The store runs against an in-memory Firestore fixture: never a live account.
const storage=new Map(),documents=new Map(),statuses=[];let offline=false,transactions=0,updates=[];
const context=vm.createContext({console:{warn(){}},Intl,Date,window:{addEventListener(){}},
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  setTimeout:()=>1,clearTimeout(){}});
const mock={db:{},doc:(_, ...parts)=>parts.join('/'),serverTimestamp:()=>({serverTime:true}),increment:by=>({increment:by}),Timestamp:{fromMillis:millis=>({millis})},
  updateDoc:async(ref,patch)=>{if(offline)throw Object.assign(new Error('Offline'),{code:'unavailable'});updates.push({ref,patch});},
  runTransaction:async(_,work)=>{
    if(offline)throw Object.assign(new Error('Offline'),{code:'unavailable'});
    transactions++;const writes=[];
    await work({get:async ref=>({exists:()=>documents.has(ref)}),set:(ref,data)=>writes.push({ref,data})});
    for(const {ref,data} of writes){const next={...(documents.get(ref)||{})};for(const [key,value] of Object.entries(data))next[key]=value?.increment?(next[key]||0)+value.increment:value;documents.set(ref,next);}
  }};
const dependency=new vm.SyntheticModule(Object.keys(mock),function(){for(const [key,value] of Object.entries(mock))this.setExport(key,value);},{context});
const storeModule=new vm.SourceTextModule(fs.readFileSync(new URL('../study-store.js',import.meta.url),'utf8'),{context});
await storeModule.link(()=>dependency);await storeModule.evaluate();const {StudyStore}=storeModule.namespace;
const session={user:{uid:'admin-a'},profile:{role:'admin',studyV2:{starred:{'11-3-1':true}}}};
let store=new StudyStore(session,(...status)=>statuses.push(status));
assert.equal(store.state.starred['11-3-1'],true);
offline=true;store.set('wrong','11-3-2',true);await store.flush();
assert.equal(store.pending['studyV2.wrong.11-3-2'],true);
assert.equal(statuses.at(-1)[1],'error');
const attempt={id:'m2-test-1',completedAtMs:Date.parse('2026-10-19T17:00:00Z'),score:50,totalQuestions:2,correctCount:1};
await store.enqueueAttempt(attempt);assert.equal(store.attempts.length,1);
store=new StudyStore(session,(...status)=>statuses.push(status));
assert.equal(store.attempts.length,1);assert.equal(store.state.wrong['11-3-2'],true);
offline=false;await store.flush();
assert.equal(store.attempts.length,0);assert.equal(Object.keys(store.pending).length,0);
assert.equal(documents.get('users/admin-a/daily/2026-10-20').quizAttempts,1);
assert.ok(documents.has('users/admin-a/attempts/m2-test-1'));
await store.enqueueAttempt(attempt);assert.equal(documents.get('users/admin-a/daily/2026-10-20').quizAttempts,1,'retry must not double-count');
assert.equal(updates[0].ref,'users/admin-a');
assert.ok(Object.keys(updates[0].patch).every(key=>key.startsWith('studyV2.')),'identity/role must remain untouched');
store.saveDraft({ids:['11-3-1'],index:0});assert.equal(store.getDraft().index,0);
const other=new StudyStore({user:{uid:'different-user'},profile:{}},()=>{});
assert.equal(other.getDraft(),null);assert.equal(Object.keys(other.state.wrong).length,0);
store.clearDraft();assert.equal(store.getDraft(),null);
const preview=new StudyStore({...session,preview:true},()=>{});const before=transactions;await preview.enqueueAttempt({...attempt,id:'m2-preview'});assert.equal(transactions,before);
storage.set('nx:midterm2:broken:outbox','{}');storage.set('nx:midterm2:broken:state','null');storage.set('nx:midterm2:broken:pending','{"role":"admin"}');
const broken=new StudyStore({user:{uid:'broken'},profile:{},preview:true},()=>{});assert.equal(broken.attempts.length,0);assert.equal(Object.keys(broken.pending).length,0);

const vocabHTML=fs.readFileSync(new URL('../en-second-vocab.html',import.meta.url),'utf8');
assert.match(vocabHTML,/data-access-key="secondVocabAllowedUids"/);assert.doesNotMatch(vocabHTML,/data-admin-strict/);assert.match(vocabHTML,/src="auth-gate.js"/);
const manageHTML=fs.readFileSync(new URL('../manage.html',import.meta.url),'utf8');assert.match(manageHTML,/data-admin-strict="true"/);assert.match(manageHTML,/src="auth-gate.js"/);
const home=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.match(home,/id="adminWorkspace"[^>]*hidden/);
assert.doesNotMatch(home,/PRIVATE PREVIEW|僅管理員|新一輪開始/);
assert.ok(home.includes('第二次段考準備中'));
for(const css of ['study-v2.css','manage-v2.css']){
  const text=fs.readFileSync(new URL('../'+css,import.meta.url),'utf8');assert.equal((text.match(/{/g)||[]).length,(text.match(/}/g)||[]).length);
}
console.log('PASS: 236 headwords, five ranges, grading, filters, strict roles, UID isolation, drafts, offline retry, transaction deduplication, Taiwan dates, CSS.');
