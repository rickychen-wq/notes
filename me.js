import {auth,formatDuration,signOut,SUBJECT_LABELS,updatePassword,waitForSession} from './firebase-core.js';
import {getUserStats} from './analytics.js';

function esc(value){const span=document.createElement('span');span.textContent=String(value??'');return span.innerHTML;}
function dayLabel(day){const d=new Date(day+'T00:00:00');return ['日','一','二','三','四','五','六'][d.getDay()];}

function renderTrend(series){
  const seven=series.slice(-7),max=Math.max(60,...seven.map(function(d){return Number(d.activeSeconds)||0;}));
  document.getElementById('trend').innerHTML=seven.map(function(day){const pct=Math.max(2,Math.round((Number(day.activeSeconds)||0)/max*100));return '<div class="trend__item" title="'+formatDuration(day.activeSeconds)+'"><div class="trend__track"><i class="trend__bar" style="height:'+pct+'%"></i></div><small>週'+dayLabel(day.day)+'</small></div>';}).join('');
}

function renderSubjects(stats){
  const list=Object.entries(stats.subjectSeconds).filter(function(x){return x[1]>0;}).sort(function(a,b){return b[1]-a[1];});
  const root=document.getElementById('subjects');if(!list.length){root.innerHTML='<div class="empty">開始閱讀筆記後，這裡會顯示科目分布。</div>';return;}
  const max=list[0][1];root.innerHTML=list.map(function(item){return '<div class="row"><div class="row__main" style="flex:1"><div class="row__title">'+esc(SUBJECT_LABELS[item[0]]||item[0])+'</div><div class="meter"><i style="width:'+Math.round(item[1]/max*100)+'%"></i></div></div><div class="row__value">'+formatDuration(item[1])+'</div></div>';}).join('');
}

function renderAttempts(attempts){
  const root=document.getElementById('attempts');if(!attempts.length){root.innerHTML='<div class="empty">完成測驗後，成績會顯示在這裡。</div>';return;}
  root.innerHTML=attempts.slice(0,8).map(function(a){return '<div class="row"><div class="row__main"><div class="row__title">'+esc(a.pageTitle||a.pageId)+'</div><div class="row__sub">'+esc(SUBJECT_LABELS[a.subject]||'測驗')+(a.wrongItems&&a.wrongItems.length?' · 錯題 '+a.wrongItems.length:'')+'</div></div><div class="row__value">'+Math.round(Number(a.score)||0)+'%</div></div>';}).join('');
}

function renderWrongWords(words){
  const root=document.getElementById('wrongWords');if(!words.length){root.innerHTML='<div class="empty">英文測驗出現錯題後，這裡會整理最常錯的單字。</div>';return;}
  root.innerHTML=words.map(function(item,index){return '<div class="row"><div class="row__main"><div class="row__title">'+esc(item.term)+'</div><div class="row__sub">第 '+(index+1)+' 常錯</div></div><div class="row__value">'+item.count+' 次</div></div>';}).join('');
}

function renderWrongQuestions(items){
  const root=document.getElementById('wrongQuestions');if(!items.length){root.innerHTML='<div class="empty">其他科目出現錯題後，會整理在這裡。</div>';return;}
  root.innerHTML=items.map(function(item){return '<div class="row"><div class="row__main"><div class="row__title">'+esc(item.text)+'</div><div class="row__sub">'+esc(SUBJECT_LABELS[item.subject]||'其他科目')+'</div></div><div class="row__value">'+item.count+' 次</div></div>';}).join('');
}

async function start(){
  const session=await waitForSession();document.getElementById('profileTitle').textContent=session.profile.name;
  const pill=document.getElementById('rolePill');pill.textContent=session.profile.role==='admin'?'管理員':'學習者';if(session.profile.role==='admin')pill.classList.add('pill--admin');
  if(session.preview){renderPreview();return;}
  try{
    const stats=await getUserStats(session.user.uid,30),today=stats.series.at(-1)||{};
    document.getElementById('stats').innerHTML='<div class="stat-card"><b>'+formatDuration(today.activeSeconds)+'</b><span>今天閱讀</span></div><div class="stat-card"><b>'+formatDuration(stats.totalSeconds)+'</b><span>30 天閱讀</span></div><div class="stat-card"><b>'+(stats.avgScore===null?'—':stats.avgScore+'%')+'</b><span>測驗平均</span></div><div class="stat-card"><b>'+esc(stats.topSubject?stats.topSubject.label:'—')+'</b><span>最常讀科目</span></div>';
    renderTrend(stats.series);renderSubjects(stats);renderAttempts(stats.attempts);renderWrongWords(stats.topWrongWords);renderWrongQuestions(stats.wrongQuestions);
  }catch(error){console.error(error);document.getElementById('trend').innerHTML='<div class="empty">暫時無法載入學習資料。</div>';document.getElementById('subjects').innerHTML='<div class="empty">資料載入失敗。</div>';document.getElementById('attempts').innerHTML='<div class="empty">資料載入失敗。</div>';document.getElementById('wrongWords').innerHTML='<div class="empty">資料載入失敗。</div>';document.getElementById('wrongQuestions').innerHTML='<div class="empty">資料載入失敗。</div>';}
}

function renderPreview(){
  const series=[3,8,4,16,11,22,14].map(function(minutes,index){const d=new Date();d.setDate(d.getDate()-6+index);return{day:d.toISOString().slice(0,10),activeSeconds:minutes*60};});
  document.getElementById('stats').innerHTML='<div class="stat-card"><b>14 分鐘</b><span>今天閱讀</span></div><div class="stat-card"><b>1 小時 18 分</b><span>30 天閱讀</span></div><div class="stat-card"><b>86%</b><span>測驗平均</span></div><div class="stat-card"><b>英文</b><span>最常讀科目</span></div>';
  renderTrend(series);renderSubjects({subjectSeconds:{english:2940,chemistry:1260,chinese:720}});renderAttempts([{pageTitle:'字彙 Chapter 10',pageId:'en-4500-10',subject:'english',score:88,wrongItems:['hypothesis']},{pageTitle:'化學 第 2 章 氣體',pageId:'chem-2',subject:'chemistry',score:80,wrongItems:['理想氣體的適用條件']}]);renderWrongWords([{term:'hypothesis',count:3},{term:'consequence',count:2}]);renderWrongQuestions([{text:'理想氣體的適用條件',subject:'chemistry',count:2},{text:'燭之武說服秦伯的理由',subject:'chinese',count:1}]);
}

document.getElementById('passwordForm').addEventListener('submit',async function(event){
  event.preventDefault();const first=document.getElementById('newPassword').value,second=document.getElementById('confirmPassword').value;
  const notice=document.getElementById('passwordNotice');notice.hidden=false;
  if(first.length<6){notice.className='notice notice--error';notice.textContent='密碼至少需要 6 個字元。';return;}
  if(first!==second){notice.className='notice notice--error';notice.textContent='兩次輸入的密碼不一致。';return;}
  const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
  try{await updatePassword(auth.currentUser,first);notice.className='notice notice--success';notice.textContent='密碼已更新。';event.currentTarget.reset();}
  catch(error){notice.className='notice notice--error';notice.textContent=error.code&&error.code.includes('requires-recent-login')?'為了安全，請登出後重新登入，再更新密碼。':'密碼更新失敗，請稍後再試。';}
  finally{button.disabled=false;}
});
document.getElementById('logoutButton').addEventListener('click',async function(){await signOut(auth);location.replace('login.html');});
start();
