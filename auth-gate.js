import {
  auth,currentDay,db,doc,increment,isLocalPreview,loadProfile,onAuthStateChanged,pageIdFromPath,
  serverTimestamp,setDoc,signOut,subjectFromPage,writeBatch
} from './firebase-core.js';
import {attemptIdFromScoreId,discardLegacyScores} from './stats-utils.js';
import {clean,correctAnswerFrom,userAnswerFrom} from './attempt-utils.js';

const SPECIAL_PAGES=new Set(['index','me','manage','history','login']);
const pageId=pageIdFromPath();
const subject=subjectFromPage(pageId);
let currentSession=null;
let activity=null;
let scoreQueue=Promise.resolve();
let quizStartedAt=null;
const recordedScores=new Set();
const SCORE_ERA='firebase-v1';

function reveal(){
  if(window.NX_AUTH_TIMEOUT) clearTimeout(window.NX_AUTH_TIMEOUT);
  document.documentElement.classList.remove('nx-auth-pending');
}

function setSession(session){
  currentSession=session;window.NX_SESSION=session;
  window.dispatchEvent(new CustomEvent('nx:auth-ready',{detail:session}));
}

function nextLoginUrl(){
  const next=location.pathname.split('/').pop()+(location.search||'')+(location.hash||'');
  return 'login.html?next='+encodeURIComponent(next||'index.html');
}

function initial(value){return Array.from(String(value||'？').trim())[0]||'？';}

function injectAccount(session){
  document.body.classList.add('nx-has-account');
  const root=document.createElement('div');root.className='nx-account';
  const button=document.createElement('button');button.type='button';button.className='nx-account__button';
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','開啟帳戶選單');
  const avatar=document.createElement('span');avatar.className='nx-account__avatar';avatar.textContent=initial(session.profile.name);
  const copy=document.createElement('span');copy.className='nx-account__copy';
  const name=document.createElement('span');name.className='nx-account__name';name.textContent=session.profile.name;
  const role=document.createElement('span');role.className='nx-account__role';role.textContent=session.profile.role==='admin'?'管理員':'學習者';
  copy.append(name,role);button.append(avatar,copy);
  const menu=document.createElement('div');menu.className='nx-account__menu';menu.hidden=true;
  const me=document.createElement('a');me.href='me.html';me.textContent='我的學習狀況';menu.append(me);
  if(session.profile.role==='admin'){
    const manage=document.createElement('a');manage.href='manage.html';manage.textContent='管理中心';menu.append(manage);
  }
  const logout=document.createElement('button');logout.type='button';logout.className='nx-danger';logout.textContent='登出';menu.append(logout);
  button.addEventListener('click',function(event){
    event.stopPropagation();menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',String(!menu.hidden));
  });
  document.addEventListener('click',function(event){if(!root.contains(event.target)){menu.hidden=true;button.setAttribute('aria-expanded','false');}});
  logout.addEventListener('click',async function(){logout.disabled=true;await flushActivity();await signOut(auth);location.replace('login.html');});
  root.append(button,menu);document.body.append(root);
}

function isStudyPage(){return !SPECIAL_PAGES.has(pageId)&&!pageId.startsWith('s-');}

async function beginActivity(session){
  if(!isStudyPage()||isLocalPreview()) return;
  const id=crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2);
  const day=currentDay();
  const eventRef=doc(db,'users',session.user.uid,'events',id);
  const dailyRef=doc(db,'users',session.user.uid,'daily',day);
  activity={eventRef,dailyRef,lastTick:performance.now(),pendingSeconds:0,flushing:false};
  const batch=writeBatch(db);
  batch.set(eventRef,{uid:session.user.uid,pageId,pageTitle:document.title,subject,path:location.pathname,
    startedAt:serverTimestamp(),lastSeenAt:serverTimestamp(),activeSeconds:0});
  batch.set(dailyRef,{uid:session.user.uid,day,pageViews:increment(1),activeSeconds:increment(0),
    subjectSeconds:{[subject]:increment(0)},lastActiveAt:serverTimestamp()},{merge:true});
  try{await batch.commit();}catch(error){console.warn('Activity start was not recorded',error);}
  setInterval(function(){tickActivity();flushActivity();},15000);
  document.addEventListener('visibilitychange',function(){tickActivity();if(document.hidden) flushActivity();else activity.lastTick=performance.now();});
  window.addEventListener('pagehide',function(){tickActivity();flushActivity();});
}

function tickActivity(){
  if(!activity) return;
  const now=performance.now();
  if(!document.hidden) activity.pendingSeconds+=Math.max(0,Math.min(30,(now-activity.lastTick)/1000));
  activity.lastTick=now;
}

async function flushActivity(){
  if(!activity||activity.flushing||activity.pendingSeconds<1) return;
  const seconds=Math.round(activity.pendingSeconds);activity.pendingSeconds=0;activity.flushing=true;
  const batch=writeBatch(db);
  batch.set(activity.eventRef,{uid:currentSession.user.uid,activeSeconds:increment(seconds),lastSeenAt:serverTimestamp()},{merge:true});
  batch.set(activity.dailyRef,{uid:currentSession.user.uid,day:currentDay(),activeSeconds:increment(seconds),
    subjectSeconds:{[subject]:increment(seconds)},lastActiveAt:serverTimestamp()},{merge:true});
  try{await batch.commit();}catch(error){activity.pendingSeconds+=seconds;console.warn('Activity update was not recorded',error);}
  finally{activity.flushing=false;}
}

function textWithout(element,selectors){
  const clone=element.cloneNode(true);selectors.forEach(function(selector){clone.querySelectorAll(selector).forEach(function(el){el.remove();});});
  return clean(clone.textContent);
}

function collectWrongItems(){
  const values=[],seen=new Set(),lesson=document.title;
  function add(item){
    const key=[item.term,item.question,item.correctAnswer,item.userAnswer].join('\u0000');
    if((item.term||item.question)&&!seen.has(key)){seen.add(key);values.push(item);}
  }
  document.querySelectorAll('#rWrong .wrongrow').forEach(function(row){
    const bold=row.querySelector('b');if(!bold)return;
    const primary=clean(bold.textContent),note=clean(row.querySelector('span')?.textContent);
    let remainder=textWithout(row,['b','span']),question=primary,correct=correctAnswerFrom(remainder+' '+note);
    if(subject==='english'){
      add({term:primary,meaning:remainder,question:remainder||primary,correctAnswer:primary,
        userAnswer:userAnswerFrom(note),lesson,subject});return;
    }
    if(remainder.includes('→')){
      const parts=remainder.split('→');question=clean(primary+' '+parts.shift());correct=clean(parts.join('→'))||correct;
    }else if(pageId==='ch-glyph'&&remainder){question=remainder;correct=primary;}
    add({question,correctAnswer:correct,userAnswer:userAnswerFrom(note),lesson,subject});
  });
  document.querySelectorAll('#rWrong .wi').forEach(function(row){
    add({question:clean(row.querySelector('.qq')?.textContent),correctAnswer:clean(row.querySelector('.aa')?.textContent),
      userAnswer:userAnswerFrom(row.querySelector('.mine')?.textContent),lesson,subject});
  });
  document.querySelectorAll('.q.wrong').forEach(function(row){
    const correct=clean(row.querySelector('.answer b')?.textContent);if(!correct)return;
    add({term:subject==='english'?correct:'',question:clean(row.querySelector('.prompt,.qtext')?.textContent)||correct,
      correctAnswer:correct,userAnswer:'',lesson,subject});
  });
  return values.slice(0,30);
}

function collectAttemptMeta(score,stamp){
  const sources=['rLine','rDetail'].map(function(id){return document.getElementById(id)?.textContent||'';});
  document.querySelectorAll('.result').forEach(function(el){sources.push(el.textContent||'');});
  let correctCount=null,totalQuestions=null;
  for(const source of sources){const match=source.match(/(\d+)\s*\/\s*(\d+)/);if(match){correctCount=Number(match[1]);totalQuestions=Number(match[2]);break;}}
  if(pageId==='ch-dictation'){correctCount=Number(score)===100?1:0;totalQuestions=1;}
  const durationSeconds=quizStartedAt?Math.max(1,Math.round((stamp-quizStartedAt)/1000)):null;
  return{correctCount,totalQuestions,durationSeconds};
}

async function recordAttempt(id,score,at){
  if(!currentSession||isLocalPreview()) return;
  const stamp=Number(at)||Date.now();
  const dedupe=location.pathname+'|'+stamp;
  if(recordedScores.has(dedupe)) return;recordedScores.add(dedupe);
  const attemptId=id+'-'+stamp+'-'+Math.random().toString(36).slice(2,8);
  const attemptRef=doc(db,'users',currentSession.user.uid,'attempts',attemptId);
  const meta=collectAttemptMeta(score,stamp);
  const batch=writeBatch(db);
  batch.set(attemptRef,{uid:currentSession.user.uid,pageId:id,pageTitle:document.title,subject:subjectFromPage(id),
    score:Number(score),wrongItems:collectWrongItems(),correctCount:meta.correctCount,totalQuestions:meta.totalQuestions,
    durationSeconds:meta.durationSeconds,completedAtMs:stamp,at:serverTimestamp(),path:location.pathname});
  batch.set(doc(db,'users',currentSession.user.uid,'daily',currentDay()),{uid:currentSession.user.uid,day:currentDay(),
    quizAttempts:increment(1),lastActiveAt:serverTimestamp()},{merge:true});
  try{await batch.commit();quizStartedAt=null;}
  catch(error){recordedScores.delete(dedupe);console.warn('Quiz attempt was not recorded',error);}
}

function patchScoreStorage(){
  const original=Storage.prototype.setItem;
  if(original.__nxPatched) return;
  ['startBtn','btnStart','againWrong','btnRetryWrong'].forEach(function(id){document.getElementById(id)?.addEventListener('click',function(){quizStartedAt=Date.now();});});
  const writtenAnswer=document.getElementById('answer');
  if(writtenAnswer)writtenAnswer.addEventListener('input',function(){if(!quizStartedAt)quizStartedAt=Date.now();});
  function patched(key,value){
    original.call(this,key,value);
    if(this===localStorage&&String(key).startsWith('nx:score:')){
      const rawId=String(key).slice('nx:score:'.length);
      const id=attemptIdFromScoreId(rawId);if(!id)return;
      setTimeout(function(){
        const at=Number(localStorage.getItem('nx:time:'+rawId))||Date.now();
        scoreQueue=scoreQueue.then(function(){return recordAttempt(id,Number(value),at);});
      },0);
    }
  }
  patched.__nxPatched=true;Storage.prototype.setItem=patched;
}

function clearOldLocalScores(){
  try{
    return discardLegacyScores(localStorage,SCORE_ERA);
  }catch(error){console.warn('Legacy scores could not be cleared',error);return false;}
}

async function start(){
  try{localStorage.removeItem('nx:hide');}catch(error){}
  if(isLocalPreview()){
    const role=new URLSearchParams(location.search).get('role')==='admin'?'admin':'user';
    const session={user:{uid:'preview-user'},profile:{uid:'preview-user',name:role==='admin'?'Chen 管理員':'測試同學',role},preview:true};
    setSession(session);reveal();injectAccount(session);return;
  }
  onAuthStateChanged(auth,async function(user){
    try{
      if(!user){location.replace(nextLoginUrl());return;}
      const profile=await loadProfile(user.uid);
      if(!profile){await signOut(auth);location.replace('login.html?error=profile');return;}
      if(clearOldLocalScores()){location.reload();return;}
      const session={user,profile};setSession(session);reveal();injectAccount(session);patchScoreStorage();
      updateProfileLogin(session).catch(function(error){console.warn('Login timestamp was not updated',error);});
      beginActivity(session);
    }catch(error){console.error(error);showConnectionError();}
  },function(error){console.error(error);showConnectionError();});
}

async function updateProfileLogin(session){
  await setDoc(doc(db,'users',session.user.uid),{uid:session.user.uid,lastLoginAt:serverTimestamp()},{merge:true});
}

function showConnectionError(){
  reveal();document.body.innerHTML='<div class="nx-connection-error"><div class="nx-connection-error__card"><h1>無法連上登入服務</h1><p>目前無法確認帳戶狀態，為了保護資料，頁面沒有繼續載入。</p><button type="button" id="nxRetry">重新整理</button></div></div>';
  document.getElementById('nxRetry').addEventListener('click',function(){location.reload();});
}

start();
