import {auth,formatDuration,signOut,SUBJECT_LABELS,timestampToDate,waitForSession} from './firebase-core.js';
import {getUserStats} from './analytics.js';

function esc(value){const span=document.createElement('span');span.textContent=String(value??'');return span.innerHTML;}
function dayLabel(day){const d=new Date(day+'T00:00:00');return ['日','一','二','三','四','五','六'][d.getDay()];}
function attemptDate(attempt){
  const date=timestampToDate(attempt.at)||(attempt.completedAtMs?new Date(attempt.completedAtMs):null);
  return date?new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric'}).format(date):'日期未記錄';
}
function questionLabel(attempt){return attempt.totalQuestions?attempt.totalQuestions+' 題':'題數未記錄';}

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
  const root=document.getElementById('attempts'),link=document.getElementById('attemptHistoryLink');link.hidden=!attempts.length;
  if(!attempts.length){root.innerHTML='<div class="empty">完成測驗後，成績會顯示在這裡。</div>';return;}
  root.innerHTML=attempts.slice(0,3).map(function(a){return '<div class="row"><div class="row__main"><div class="row__title">'+esc(a.pageTitle||a.pageId)+'</div><div class="row__sub">'+esc(attemptDate(a))+' · '+esc(SUBJECT_LABELS[a.subject]||'測驗')+' · '+esc(questionLabel(a))+'</div></div><div class="row__value">'+Math.round(Number(a.score)||0)+'%</div></div>';}).join('');
}

function lessonSummary(lessons){return(lessons||[]).slice(0,2).map(function(item){return item.lesson+' '+item.count+' 次';}).join(' · ');}

function renderWrongWords(words){
  const root=document.getElementById('wrongWords'),link=document.getElementById('wordHistoryLink');link.hidden=!words.length;
  if(!words.length){root.innerHTML='<div class="empty">英文測驗出現錯題後，這裡會整理最常錯的單字。</div>';return;}
  const shown=words.slice(0,5);
  root.innerHTML=shown.map(function(item,index){return '<button type="button" class="row row--button" data-word="'+index+'"><div class="row__main"><div class="row__title">'+esc(item.term)+'</div><div class="row__sub">'+esc(item.meaning||lessonSummary(item.lessons)||'點擊查看詳細資料')+'</div></div><div class="row__value">'+item.count+' 次 <span class="row__chevron">›</span></div></button>';}).join('');
  root.querySelectorAll('[data-word]').forEach(function(button){button.addEventListener('click',function(){openWord(shown[Number(button.dataset.word)]);});});
}

function renderWrongQuestions(items){
  const root=document.getElementById('wrongQuestions'),link=document.getElementById('questionHistoryLink');link.hidden=items.length<=3;
  if(!items.length){root.innerHTML='<div class="empty">其他科目出現錯題後，會整理在這裡。</div>';return;}
  const shown=items.slice(0,3);
  root.innerHTML=shown.map(function(item,index){return '<button type="button" class="row row--button" data-question="'+index+'"><div class="row__main"><div class="row__title">'+esc(item.question||item.text)+'</div><div class="row__sub">'+esc(SUBJECT_LABELS[item.subject]||'其他科目')+' · '+esc(lessonSummary(item.lessons)||item.lesson||'課程未記錄')+'</div></div><div class="row__value">'+item.count+' 次 <span class="row__chevron">›</span></div></button>';}).join('');
  root.querySelectorAll('[data-question]').forEach(function(button){button.addEventListener('click',function(){openQuestion(shown[Number(button.dataset.question)]);});});
}

const detailDialog=document.getElementById('detailDialog'),detailBody=document.getElementById('detailBody');
function detailPair(label,value){
  const root=document.createElement('div');root.className='detail-pair';const small=document.createElement('small');small.textContent=label;
  const p=document.createElement('p');p.textContent=value||'舊記錄未保存這項資料';if(!value)p.className='detail-muted';root.append(small,p);return root;
}
function openDetail(title,pairs){
  document.getElementById('detailTitle').textContent=title;detailBody.replaceChildren(...pairs.map(function(pair){return detailPair(pair[0],pair[1]);}));
  if(typeof detailDialog.showModal==='function')detailDialog.showModal();else detailDialog.setAttribute('open','');
}
function openWord(item){openDetail(item.term,[['中文解釋',item.meaning],['出錯次數',item.count+' 次'],['課程分類',lessonSummary(item.lessons)]]);}
function openQuestion(item){openDetail(SUBJECT_LABELS[item.subject]||'錯題詳細資料',[['題目',item.question||item.text],['正確答案',item.correctAnswer],['當時作答',item.userAnswer],['課程分類',lessonSummary(item.lessons)||item.lesson]]);}

async function start(){
  const session=await waitForSession();document.getElementById('profileTitle').textContent=session.profile.name;
  const pill=document.getElementById('rolePill');pill.textContent=session.profile.role==='admin'?'管理員':'學習者';if(session.profile.role==='admin')pill.classList.add('pill--admin');
  if(session.preview){renderPreview();return;}
  try{
    const stats=await getUserStats(session.user.uid,30),today=stats.series.at(-1)||{};
    document.getElementById('stats').innerHTML='<div class="stat-card"><b>'+formatDuration(today.activeSeconds)+'</b><span>今天閱讀</span></div><div class="stat-card"><b>'+formatDuration(stats.totalSeconds)+'</b><span>30 天閱讀</span></div><div class="stat-card"><b>'+(stats.avgScore===null?'—':stats.avgScore+'%')+'</b><span>測驗平均</span></div><div class="stat-card"><b>'+esc(stats.topSubject?stats.topSubject.label:'—')+'</b><span>最常讀科目</span></div>';
    renderTrend(stats.series);renderSubjects(stats);renderAttempts(stats.attempts);renderWrongWords(stats.topWrongWords);renderWrongQuestions(stats.wrongQuestions);
  }catch(error){
    console.error(error);document.getElementById('trend').innerHTML='<div class="empty">暫時無法載入學習資料。</div>';document.getElementById('subjects').innerHTML='<div class="empty">資料載入失敗。</div>';document.getElementById('attempts').innerHTML='<div class="empty">資料載入失敗。</div>';document.getElementById('wrongWords').innerHTML='<div class="empty">資料載入失敗。</div>';document.getElementById('wrongQuestions').innerHTML='<div class="empty">資料載入失敗。</div>';
  }
}

function renderPreview(){
  const series=[3,8,4,16,11,22,14].map(function(minutes,index){const d=new Date();d.setDate(d.getDate()-6+index);return{day:d.toISOString().slice(0,10),activeSeconds:minutes*60};});
  const attempts=[
    {pageTitle:'字彙 Chapter 10',pageId:'en-4500-10',subject:'english',score:88,totalQuestions:25,durationSeconds:462,completedAtMs:Date.now(),wrongItems:[]},
    {pageTitle:'化學 第 2 章 氣體',pageId:'chem-2',subject:'chemistry',score:80,totalQuestions:20,durationSeconds:611,completedAtMs:Date.now()-86400000,wrongItems:[]},
    {pageTitle:'國文字形 第一～三回',pageId:'ch-glyph',subject:'chinese',score:92,totalQuestions:25,durationSeconds:395,completedAtMs:Date.now()-172800000,wrongItems:[]},
    {pageTitle:'數學 · 第 1 章',pageId:'math-1',subject:'math',score:76,totalQuestions:20,durationSeconds:803,completedAtMs:Date.now()-259200000,wrongItems:[]}
  ];
  const words=[{term:'hypothesis',meaning:'n. 假設；假說',count:3,lessons:[{lesson:'字彙 Chapter 10',count:3}]},{term:'consequence',meaning:'n. 結果；後果',count:2,lessons:[{lesson:'課本 L2',count:2}]}];
  const questions=[{question:'理想氣體的適用條件',correctAnswer:'高溫、低壓',userAnswer:'低溫、高壓',subject:'chemistry',count:2,lessons:[{lesson:'化學 第 2 章 氣體',count:2}]},{question:'燭之武說服秦伯的理由',correctAnswer:'指出亡鄭對秦無益，並承諾鄭可作為東道主',userAnswer:'',subject:'chinese',count:1,lessons:[{lesson:'國文閱讀',count:1}]}];
  document.getElementById('stats').innerHTML='<div class="stat-card"><b>14 分鐘</b><span>今天閱讀</span></div><div class="stat-card"><b>1 小時 18 分</b><span>30 天閱讀</span></div><div class="stat-card"><b>86%</b><span>測驗平均</span></div><div class="stat-card"><b>英文</b><span>最常讀科目</span></div>';
  renderTrend(series);renderSubjects({subjectSeconds:{english:2940,chemistry:1260,chinese:720}});renderAttempts(attempts);renderWrongWords(words);renderWrongQuestions(questions);
}

document.getElementById('detailClose').addEventListener('click',function(){detailDialog.close();});
detailDialog.addEventListener('click',function(event){if(event.target===detailDialog)detailDialog.close();});
document.getElementById('logoutButton').addEventListener('click',async function(){await signOut(auth);location.replace('login.html');});
start();
