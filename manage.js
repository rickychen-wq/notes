import {auth,collection,db,doc,formatDuration,getDocs,getDoc,serverTimestamp,updateDoc,updatePassword,waitForSession} from './firebase-core.js';
import {getUserStats} from './analytics.js';

const toggle=document.getElementById('registrationToggle');let systemData=null;
function esc(value){const span=document.createElement('span');span.textContent=String(value??'');return span.innerHTML;}
function setRegistrationState(open){
  toggle.setAttribute('aria-pressed',String(open));
  const state=document.getElementById('registrationState');state.textContent=open?'已開放':'已關閉';state.classList.toggle('switch__state--open',open);
}

async function loadSystem(){
  const snap=await getDoc(doc(db,'settings','system'));if(!snap.exists())throw new Error('system-missing');systemData=snap.data();
  setRegistrationState(systemData.registrationOpen===true);
}

async function loadUsers(){
  const userSnap=await getDocs(collection(db,'users'));
  const rows=await Promise.all(userSnap.docs.map(async function(s){
    const profile=s.data();let stats=null;try{stats=await getUserStats(profile.uid,7);}catch(error){console.warn(error);}
    return{profile,stats};
  }));
  rows.sort(function(a,b){return(a.profile.role==='admin'?-1:1)-(b.profile.role==='admin'?-1:1);});
  const active=rows.filter(function(r){return r.stats&&r.stats.totalSeconds>0;}).length;
  const totalSeconds=rows.reduce(function(sum,r){return sum+(r.stats?r.stats.totalSeconds:0);},0);
  const scores=rows.flatMap(function(r){return r.stats&&r.stats.avgScore!==null?[r.stats.avgScore]:[];});
  const avg=scores.length?Math.round(scores.reduce(function(a,b){return a+b;},0)/scores.length):null;
  document.getElementById('adminStats').innerHTML='<div class="stat-card"><b>'+rows.length+'</b><span>使用者</span></div><div class="stat-card"><b>'+active+'</b><span>7 天活躍</span></div><div class="stat-card"><b>'+formatDuration(totalSeconds)+'</b><span>閱讀時間</span></div><div class="stat-card"><b>'+(avg===null?'—':avg+'%')+'</b><span>測驗平均</span></div>';
  const root=document.getElementById('userRows');if(!rows.length){root.innerHTML='<div class="empty">目前沒有使用者。</div>';return;}
  root.innerHTML=rows.map(function(row){const p=row.profile,s=row.stats,wrong=s&&s.topWrong?' · 常錯英文 '+esc(s.topWrong.term):'';return '<div class="row"><div class="row__main"><div class="row__title">'+esc(p.name)+(p.role==='admin'?' <span class="pill pill--admin" style="padding:2px 7px">管理員</span>':'')+'</div><div class="row__sub">7 天閱讀 '+formatDuration(s?s.totalSeconds:0)+' · 測驗 '+(s?s.attemptCount:0)+' 次'+wrong+'</div></div><div class="row__value">'+(s&&s.avgScore!==null?s.avgScore+'%':'—')+'</div></div>';}).join('');
}

function preview(){
  systemData={registrationOpen:false};setRegistrationState(false);document.getElementById('adminStats').innerHTML='<div class="stat-card"><b>6</b><span>使用者</span></div><div class="stat-card"><b>4</b><span>7 天活躍</span></div><div class="stat-card"><b>8 小時 24 分</b><span>閱讀時間</span></div><div class="stat-card"><b>84%</b><span>測驗平均</span></div>';
  document.getElementById('userRows').innerHTML='<div class="row"><div class="row__main"><div class="row__title">Chen <span class="pill pill--admin" style="padding:2px 7px">管理員</span></div><div class="row__sub">7 天閱讀 2 小時 18 分 · 測驗 12 次</div></div><div class="row__value">91%</div></div><div class="row"><div class="row__main"><div class="row__title">測試同學</div><div class="row__sub">7 天閱讀 48 分鐘 · 測驗 4 次</div></div><div class="row__value">78%</div></div>';
}

toggle.addEventListener('click',function(){setRegistrationState(toggle.getAttribute('aria-pressed')!=='true');});
document.getElementById('saveSettings').addEventListener('click',async function(){
  const button=this,notice=document.getElementById('settingsNotice');notice.hidden=false;
  button.disabled=true;
  try{await updateDoc(doc(db,'settings','system'),{registrationOpen:toggle.getAttribute('aria-pressed')==='true',openAt:null,closeAt:null,updatedAt:serverTimestamp()});notice.className='notice notice--success';notice.textContent='註冊設定已儲存。';}
  catch(error){console.error(error);notice.className='notice notice--error';notice.textContent='設定沒有儲存成功，請稍後再試。';}
  finally{button.disabled=false;}
});

document.getElementById('adminPasswordForm').addEventListener('submit',async function(event){
  event.preventDefault();const first=document.getElementById('adminNewPassword').value,second=document.getElementById('adminConfirmPassword').value;
  const notice=document.getElementById('adminPasswordNotice');notice.hidden=false;
  if(first.length<6){notice.className='notice notice--error';notice.textContent='密碼至少需要 6 個字元。';return;}
  if(first!==second){notice.className='notice notice--error';notice.textContent='兩次輸入的密碼不一致。';return;}
  const button=event.currentTarget.querySelector('button[type="submit"]');button.disabled=true;
  try{await updatePassword(auth.currentUser,first);notice.className='notice notice--success';notice.textContent='管理員密碼已更新。';event.currentTarget.reset();}
  catch(error){notice.className='notice notice--error';notice.textContent=error.code&&error.code.includes('requires-recent-login')?'請重新登入管理員帳號後再更新密碼。':'密碼更新失敗，請稍後再試。';}
  finally{button.disabled=false;}
});

async function start(){
  const session=await waitForSession();if(session.profile.role!=='admin'){location.replace('me.html');return;}
  if(session.preview){preview();return;}
  try{await Promise.all([loadSystem(),loadUsers()]);}catch(error){console.error(error);document.getElementById('userRows').innerHTML='<div class="empty">管理資料載入失敗。</div>';}
}
start();
