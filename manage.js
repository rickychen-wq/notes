import {auth,collection,db,doc,formatDuration,getDocs,getDoc,serverTimestamp,updateDoc,updatePassword,waitForSession,timestampToDate,SUBJECT_LABELS} from './firebase-core.js';
import {getUserStats} from './analytics.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ARCHIVED=[
  ['finalReviewAllowedUids','段考前複習'],['quickReviewAllowedUids','考前最終速讀'],
  ['morningQuizAllowedUids','明早練習'],['vocabAzAllowedUids','4500 A–Z'],
  ['bookVocabAllowedUids','課本 A–Z'],['magClozeAllowedUids','雜誌 60 題']
];
let session,systemData=null,rows=[],days=7,loadVersion=0,activeTab='overview';
function notice(id,message,state='ok'){const el=$(id);el.hidden=false;el.textContent=message;el.dataset.state=state;}
function registrationDraft(){return $('registrationToggle').getAttribute('aria-checked')==='true';}
function updateRegistrationUI(open){
  $('registrationToggle').setAttribute('aria-checked',String(open));
  $('registrationState').textContent=open?'已開放':'已關閉';
  const dirty=systemData&&open!==(systemData.registrationOpen===true);
  $('settingsDirty').textContent=dirty?'尚未儲存':'';
  $('saveSettings').disabled=!dirty;
}
function showTab(tab){
  if(!['overview','content','settings'].includes(tab))tab='overview';activeTab=tab;
  for(const key of ['overview','content','settings']){$(key+'Panel').hidden=key!==tab;$(key+'Tab').setAttribute('aria-selected',String(key===tab));$(key+'Tab').tabIndex=key===tab?0:-1;}
  history.replaceState(null,'','#'+tab);
  if(window.scrollY>160)window.scrollTo({top:0});
}
function renderPermissions(){
  $('archivedPermissions').innerHTML=ARCHIVED.map(([key,title])=>{
    const list=systemData?.[key],configured=Array.isArray(list);
    return '<div><div><strong>'+esc(title)+'</strong><small>'+ (configured?'原有指定名單 '+new Set(list).size+' 人':'保留原設定')+'</small></div><span>已封存 · 無入口</span></div>';
  }).join('');
}
async function loadSystem(){
  try{
    if(session.preview)systemData={registrationOpen:false,finalReviewAllowedUids:['demo-1']};
    else {const snap=await getDoc(doc(db,'settings','system'));if(!snap.exists())throw new Error('Missing system settings');systemData=snap.data();}
    updateRegistrationUI(systemData.registrationOpen===true);$('registrationToggle').disabled=false;renderPermissions();
  }catch(error){
    console.warn('Settings read failed',error);$('registrationToggle').disabled=true;$('saveSettings').disabled=true;
    $('registrationState').textContent='讀取失敗';notice('settingsNotice','無法讀取設定，未做任何變更。重新整理頁面後再試。','error');
    $('archivedPermissions').textContent='權限摘要暫時無法載入，既有權限未變更。';
  }
}
function renderStats(){
  const valid=rows.filter(r=>r.stats),active=valid.filter(r=>r.stats.totalSeconds>0||r.stats.attemptCount>0).length;
  const total=valid.reduce((sum,r)=>sum+r.stats.totalSeconds,0);
  const scores=valid.flatMap(r=>r.stats.attempts||[]).filter(a=>typeof a.score==='number'&&Number.isFinite(a.score));
  const avg=scores.length?Math.round(scores.reduce((sum,a)=>sum+a.score,0)/scores.length)+'%':'—';
  $('adminStats').innerHTML=[[''+rows.length,'使用者'],[''+active,'近 '+days+' 天活躍'],[formatDuration(total),'近 '+days+' 天閱讀'],[avg,'近 '+days+' 天測驗平均']].map(([value,label])=>'<div><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>').join('');
}
function renderUsers(){
  const search=$('userSearch').value.trim().toLocaleLowerCase('zh-Hant'),sort=$('userSort').value;
  const filtered=rows.filter(r=>String(r.profile.name||'').toLocaleLowerCase('zh-Hant').includes(search));
  filtered.sort((a,b)=>sort==='name'?String(a.profile.name).localeCompare(String(b.profile.name),'zh-Hant'):sort==='attempts'?(b.stats?.attemptCount||0)-(a.stats?.attemptCount||0):(b.stats?.totalSeconds||0)-(a.stats?.totalSeconds||0));
  $('userRows').innerHTML=filtered.length?filtered.map(({profile:p,stats:s,failed})=>{
    const summary=s?'閱讀 '+formatDuration(s.totalSeconds)+' · 測驗 '+s.attemptCount+(s.attemptCount>=120?'+':'')+' 次':failed?'統計暫時讀取失敗，可重新整理':'正在整理統計…';
    return '<button type="button" class="admin-user" data-uid="'+esc(p.uid)+'"><span class="admin-user-main"><span class="admin-avatar" aria-hidden="true">'+esc(Array.from(p.name||'?')[0])+'</span><span><span class="admin-name">'+esc(p.name||'未命名')+(p.role==='admin'?' <span class="v2-badge">管理員</span>':'')+'</span><small>'+esc(summary)+'</small></span></span><span class="admin-user-score">'+(s&&s.avgScore!==null?s.avgScore+'%':'—')+'<small>查看詳情 →</small></span></button>';
  }).join(''):'<div class="v2-empty">沒有符合的帳號。</div>';
}
function previewRows(){
  return ['Chen 管理員','測試同學 A','測試同學 B'].map((name,index)=>{
    const uid=index?'demo-'+index:session.user.uid,score=[90,80,null][index],seconds=[4680,2880,0][index],attempts=index===2?[]:[{score,pageTitle:'二段 4500 單字',completedAtMs:Date.now(),correctCount:index?16:18,totalQuestions:20,wrongItems:[]}];
    return {profile:{uid,name,role:index?'user':'admin'},stats:{totalSeconds:seconds,attemptCount:attempts.length,avgScore:score,attempts,subjectSeconds:{english:seconds},topWrongWords:index===2?[]:[{term:'thorough',count:2}],topSubject:seconds?{label:'英文'}:null}};
  });
}
async function loadUsers(){
  const version=++loadVersion;$('reloadUsers').disabled=true;$('userLoadStatus').textContent='正在載入帳號…';
  try{
    if(session.preview){rows=previewRows();renderStats();renderUsers();$('userLoadStatus').textContent='本機預覽資料，不會寫入 Firebase。';return;}
    const snap=await getDocs(collection(db,'users'));if(version!==loadVersion)return;
    rows=snap.docs.map(s=>({profile:{...s.data(),uid:s.id},stats:null,failed:false}));
    renderUsers();renderStats();let index=0,finished=0;
    // Limit concurrent queries rather than launching two reads for every account at once.
    async function worker(){
      while(index<rows.length&&version===loadVersion){
        const row=rows[index++];
        try{const stats=await getUserStats(row.profile.uid,days);if(version!==loadVersion)return;row.stats=stats;}
        catch(error){if(version!==loadVersion)return;row.failed=true;console.warn('User stats unavailable',error.code||error.message);}
        finished++;$('userLoadStatus').textContent='已整理 '+finished+' / '+rows.length+' 個帳號';renderUsers();renderStats();
      }
    }
    await Promise.all(Array.from({length:Math.min(4,rows.length)},()=>worker()));
    if(version!==loadVersion)return;
    const failed=rows.filter(r=>r.failed).length,limited=rows.some(r=>r.stats?.attemptCount>=120);
    $('userLoadStatus').textContent='共 '+rows.length+' 個帳號 · 點帳號查看詳情'+(failed?' · '+failed+' 個統計未同步，請重試':'')+(limited?' · 測驗統計每人最多取最近 120 次':'');
  }catch(error){if(version!==loadVersion)return;console.error(error);$('userLoadStatus').textContent='載入失敗，請按重新整理。';}
  finally{if(version===loadVersion)$('reloadUsers').disabled=false;}
}
function showDetail(uid){
  const row=rows.find(r=>r.profile.uid===uid);if(!row)return;const {profile:p,stats:s}=row;
  $('detailName').textContent=p.name;
  const permissions='<div class="detail-section"><h3>目前可見內容</h3><p class="v2-caption">'+(p.role==='admin'?'二段單字與測驗、管理中心。':'準備中首頁與自己的學習紀錄；二段尚未開放。')+'</p></div>';
  if(!s){$('detailContent').innerHTML='<p class="v2-caption">此帳號的統計尚未載入，可重新整理後再看。</p>'+permissions;$('userDetail').showModal();return;}
  const total=s.totalSeconds||1,subjects=Object.entries(s.subjectSeconds||{}).sort((a,b)=>b[1]-a[1]).filter(([,seconds])=>seconds>0);
  const subjectsHTML=subjects.length?subjects.map(([id,seconds])=>'<div class="detail-line"><div style="flex:1">'+esc(SUBJECT_LABELS[id]||id)+'<div class="detail-subject-meter"><i style="width:'+Math.min(100,seconds/total*100)+'%"></i></div></div><b>'+esc(formatDuration(seconds))+'</b></div>').join(''):'<p class="v2-caption">這段期間尚無閱讀紀錄。</p>';
  const attempts=(s.attempts||[]).slice(0,12).map(a=>{
    const date=timestampToDate(a.at)||timestampToDate(a.completedAtMs);
    const time=date?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'時間待同步';
    return '<div class="detail-line"><div>'+esc(a.pageTitle||a.pageId)+'<small>'+esc(time)+' · '+(Number.isInteger(a.totalQuestions)?a.correctCount+' / '+a.totalQuestions+' 題':'題數未記錄')+(a.manualCorrections?' · 自行改判 '+a.manualCorrections+' 題':'')+'</small></div><b>'+Number(a.score)+'%</b></div>';
  }).join('')||'<p class="v2-caption">這段期間尚無測驗紀錄。</p>';
  const wrong=(s.topWrongWords||[]).slice(0,8).map(item=>'<span class="v2-badge">'+esc(item.term)+'</span>').join(' ');
  $('detailContent').innerHTML='<p class="v2-caption">最近 '+days+' 天 · 台灣時間</p><div class="admin-metrics"><div><b>'+esc(formatDuration(s.totalSeconds))+'</b><span>閱讀</span></div><div><b>'+s.attemptCount+'</b><span>測驗次數</span></div></div>'+permissions+'<div class="detail-section"><h3>各科閱讀時間</h3>'+subjectsHTML+'</div><div class="detail-section"><h3>常錯英文</h3>'+(wrong||'<p class="v2-caption">尚無錯字紀錄。</p>')+'</div><div class="detail-section"><h3>最近測驗（最多 12 次）</h3>'+attempts+'</div>';
  $('userDetail').showModal();
}
async function saveRegistration(){
  $('registrationConfirm').close();const button=$('saveSettings');button.disabled=true;$('registrationToggle').disabled=true;
  const open=registrationDraft();
  try{
    if(!session.preview)await updateDoc(doc(db,'settings','system'),{registrationOpen:open,updatedAt:serverTimestamp()});
    systemData={...systemData,registrationOpen:open};updateRegistrationUI(open);
    notice('settingsNotice',session.preview?'本機預覽，不會更改實際設定。':'註冊設定已儲存。');
  }catch(error){console.error(error);notice('settingsNotice','設定未儲存成功，原有設定保持不變。','error');button.disabled=false;}
  finally{$('registrationToggle').disabled=false;}
}
function bind(){
  for(const key of ['overview','content','settings'])$(key+'Tab').onclick=()=>showTab(key);
  document.querySelector('[role="tablist"]').onkeydown=event=>{
    const names=['overview','content','settings'];if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(names.indexOf(activeTab)+(event.key==='ArrowRight'?1:2))%3;showTab(names[next]);$(names[next]+'Tab').focus();
  };
  $('statsPeriod').onclick=event=>{const button=event.target.closest('[data-days]');if(!button||Number(button.dataset.days)===days)return;days=Number(button.dataset.days);$('statsPeriod').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));loadUsers();};
  $('reloadUsers').onclick=loadUsers;$('userSearch').oninput=renderUsers;$('userSort').onchange=renderUsers;
  $('userRows').onclick=event=>{const button=event.target.closest('[data-uid]');if(button)showDetail(button.dataset.uid);};
  $('closeDetail').onclick=()=>$('userDetail').close();
  $('registrationToggle').onclick=()=>updateRegistrationUI(!registrationDraft());
  $('saveSettings').onclick=()=>{
    if(!systemData)return;const open=registrationDraft();
    $('registrationConfirmTitle').textContent=open?'開放新帳號註冊？':'關閉新帳號註冊？';
    $('registrationConfirmCopy').textContent=open?'持有網站連結的人將能建立帳號；新帳號仍看不到管理員限定的二段內容。':'新使用者將無法註冊；現有帳號依然可以正常登入。';
    $('registrationConfirm').showModal();
  };
  $('cancelRegistration').onclick=()=>$('registrationConfirm').close();$('confirmRegistration').onclick=saveRegistration;
  $('showAdminPassword').onchange=()=>{for(const id of ['adminNewPassword','adminConfirmPassword'])$(id).type=$('showAdminPassword').checked?'text':'password';};
  $('adminPasswordForm').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),first=$('adminNewPassword').value,second=$('adminConfirmPassword').value;
    if(first.length<6){notice('adminPasswordNotice','密碼至少需要 6 個字元。','error');return;}
    if(first!==second){notice('adminPasswordNotice','兩次密碼不一致，請再確認。','error');return;}
    button.disabled=true;
    try{if(!session.preview)await updatePassword(auth.currentUser,first);form.reset();$('adminNewPassword').type='password';$('adminConfirmPassword').type='password';notice('adminPasswordNotice',session.preview?'本機預覽，不會變更密碼。':'密碼已更新。');}
    catch(error){notice('adminPasswordNotice',error.code?.includes('requires-recent-login')?'為了保護帳號，請重新登入後再修改密碼。':'密碼更新失敗，原密碼未變更。','error');}
    finally{button.disabled=false;}
  };
  window.addEventListener('beforeunload',event=>{if(systemData&&registrationDraft()!==(systemData.registrationOpen===true)){event.preventDefault();event.returnValue='';}});
}
async function start(){
  session=await waitForSession();if(session.profile.role!=='admin'){location.replace('index.html');return;}
  bind();showTab(location.hash.slice(1));await Promise.all([loadSystem(),loadUsers()]);
}
start();
