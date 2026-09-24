import {formatDuration,SUBJECT_LABELS,timestampToDate,waitForSession} from './firebase-core.js';
import {getUserHistory} from './analytics.js';

function esc(value){const span=document.createElement('span');span.textContent=String(value??'');return span.innerHTML;}
function dateLabel(attempt){
  const date=timestampToDate(attempt.at)||(attempt.completedAtMs?new Date(attempt.completedAtMs):null);
  return date?new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date):'日期未記錄';
}
function lessonSummary(lessons){return(lessons||[]).map(function(item){return item.lesson+' '+item.count+' 次';}).join(' · ');}

function renderAttempts(attempts){
  const root=document.getElementById('historyAttempts');if(!attempts.length){root.innerHTML='<div class="empty">目前沒有測驗紀錄。</div>';return;}
  root.innerHTML=attempts.map(function(item){
    const duration=item.durationSeconds?formatDuration(item.durationSeconds):'用時未記錄';
    const questions=item.totalQuestions?(item.correctCount!==null&&item.correctCount!==undefined?item.correctCount+' / '+item.totalQuestions+' 題':item.totalQuestions+' 題'):'題數未記錄';
    return '<div class="row"><div class="row__main"><div class="row__title">'+esc(item.pageTitle||item.pageId)+'</div><div class="row__sub">'+esc(dateLabel(item))+' · '+esc(SUBJECT_LABELS[item.subject]||'測驗')+' · '+esc(duration)+' · '+esc(questions)+'</div></div><div class="row__value">'+Math.round(Number(item.score)||0)+'%</div></div>';
  }).join('');
}

function renderWords(words){
  const root=document.getElementById('historyWords');if(!words.length){root.innerHTML='<div class="empty">目前沒有常錯英文。</div>';return;}
  root.innerHTML=words.map(function(item,index){return '<button type="button" class="row row--button" data-word="'+index+'"><div class="row__main"><div class="row__title">'+esc(item.term)+'</div><div class="row__sub">'+esc(item.meaning||'中文解釋尚未記錄')+' · '+esc(lessonSummary(item.lessons)||'課程未記錄')+'</div></div><div class="row__value">'+item.count+' 次 <span class="row__chevron">›</span></div></button>';}).join('');
  root.querySelectorAll('[data-word]').forEach(function(button){button.addEventListener('click',function(){const item=words[Number(button.dataset.word)];openDetail(item.term,[['中文解釋',item.meaning],['出錯次數',item.count+' 次'],['各課統計',lessonSummary(item.lessons)]]);});});
}

function renderQuestions(items){
  const root=document.getElementById('historyQuestions');if(!items.length){root.innerHTML='<div class="card empty">目前沒有其他錯題。</div>';return;}
  const groups={};items.forEach(function(item){(groups[item.subject]||(groups[item.subject]=[])).push(item);});root.innerHTML='';
  Object.entries(groups).sort(function(a,b){return(SUBJECT_LABELS[a[0]]||a[0]).localeCompare(SUBJECT_LABELS[b[0]]||b[0]);}).forEach(function(entry){
    const section=document.createElement('section');section.className='subject-group';const title=document.createElement('h2');title.textContent=SUBJECT_LABELS[entry[0]]||'其他科目';
    const card=document.createElement('div');card.className='card rows';card.innerHTML=entry[1].map(function(item,index){return '<button type="button" class="row row--button" data-question="'+index+'"><div class="row__main"><div class="row__title">'+esc(item.question||item.text)+'</div><div class="row__sub">'+esc(lessonSummary(item.lessons)||item.lesson||'課程未記錄')+'</div></div><div class="row__value">'+item.count+' 次 <span class="row__chevron">›</span></div></button>';}).join('');
    card.querySelectorAll('[data-question]').forEach(function(button){button.addEventListener('click',function(){const item=entry[1][Number(button.dataset.question)];openDetail(SUBJECT_LABELS[item.subject]||'錯題詳細資料',[['題目',item.question||item.text],['正確答案',item.correctAnswer],['當時作答',item.userAnswer],['課程分類',lessonSummary(item.lessons)||item.lesson]]);});});
    section.append(title,card);root.append(section);
  });
}

const detailDialog=document.getElementById('detailDialog'),detailBody=document.getElementById('detailBody');
function detailPair(label,value){const root=document.createElement('div');root.className='detail-pair';const small=document.createElement('small');small.textContent=label;const p=document.createElement('p');p.textContent=value||'舊記錄未保存這項資料';if(!value)p.className='detail-muted';root.append(small,p);return root;}
function openDetail(title,pairs){document.getElementById('detailTitle').textContent=title;detailBody.replaceChildren(...pairs.map(function(pair){return detailPair(pair[0],pair[1]);}));if(typeof detailDialog.showModal==='function')detailDialog.showModal();else detailDialog.setAttribute('open','');}

function setView(view){
  const valid=['attempts','words','questions'].includes(view)?view:'attempts';
  document.querySelectorAll('[data-view]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.view===valid));});
  document.querySelectorAll('[data-panel]').forEach(function(panel){panel.hidden=panel.dataset.panel!==valid;});
  const url=new URL(location.href);url.searchParams.set('view',valid);history.replaceState(null,'',url);
}

async function start(){
  const session=await waitForSession();document.getElementById('historyTitle').textContent=session.profile.name+' 的完整紀錄';
  if(session.preview){const now=Date.now();renderAttempts([{pageTitle:'字彙 Chapter 10',subject:'english',score:88,totalQuestions:25,correctCount:22,durationSeconds:462,completedAtMs:now},{pageTitle:'化學 第 2 章 氣體',subject:'chemistry',score:80,totalQuestions:20,correctCount:16,durationSeconds:611,completedAtMs:now-86400000}]);renderWords([{term:'hypothesis',meaning:'n. 假設；假說',count:3,lessons:[{lesson:'字彙 Chapter 10',count:3}]}]);renderQuestions([{question:'理想氣體的適用條件',correctAnswer:'高溫、低壓',userAnswer:'低溫、高壓',subject:'chemistry',count:2,lessons:[{lesson:'化學 第 2 章 氣體',count:2}]}]);return;}
  try{const data=await getUserHistory(session.user.uid);renderAttempts(data.attempts);renderWords(data.topWrongWords);renderQuestions(data.wrongQuestions);}catch(error){console.error(error);document.getElementById('historyAttempts').innerHTML='<div class="empty">歷史資料載入失敗。</div>';document.getElementById('historyWords').innerHTML='<div class="empty">歷史資料載入失敗。</div>';document.getElementById('historyQuestions').innerHTML='<div class="card empty">歷史資料載入失敗。</div>';}
}

document.querySelectorAll('[data-view]').forEach(function(button){button.addEventListener('click',function(){setView(button.dataset.view);});});
document.getElementById('detailClose').addEventListener('click',function(){detailDialog.close();});detailDialog.addEventListener('click',function(event){if(event.target===detailDialog)detailDialog.close();});
setView(new URLSearchParams(location.search).get('view')||'attempts');start();
