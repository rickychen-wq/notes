import {collection,db,doc,getDoc,getDocs,serverTimestamp,updateDoc,waitForSession} from './firebase-core.js';
const SECOND_VOCAB_ACCESS_KEY='magWeek1AllowedUids';

const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const accountIds=config=>[...new Set((Array.isArray(config?.[SECOND_VOCAB_ACCESS_KEY])?config[SECOND_VOCAB_ACCESS_KEY]:[]).filter(id=>typeof id==='string'))];
const statusText=ids=>ids.length?'已開放給 '+ids.length+' 位同學':'尚未開放給同學';

async function init(){
  const session=await waitForSession();
  if(session.profile.role!=='admin')return;
  const triggers=[...document.querySelectorAll('[data-open-vocab-access]')];
  if(!triggers.length)return;
  let users=[],selected=new Set(),original=[],saving=false,ready=false,version=0;
  const dialog=document.createElement('dialog');
  // The home page scopes the design tokens to .v2, so the dialog carries them too.
  dialog.className='v2 vocab-access-dialog';dialog.id='vocabAccessDialog';
  dialog.setAttribute('aria-labelledby','vocabAccessTitle');
  dialog.innerHTML=`<div class="vocab-access-head"><div><h2 id="vocabAccessTitle">開放對象</h2><p>雜誌 Week 1 · U1～U4</p></div><button type="button" class="v2-btn" id="closeVocabAccess" aria-label="關閉開放對象">✕</button></div>
    <label class="v2-field"><span>搜尋同學</span><input id="vocabAccessSearch" type="search" placeholder="輸入姓名或帳號名稱" autocomplete="off"></label>
    <div class="v2-toolbar"><span class="v2-caption" id="vocabAccessCount" role="status"></span><div class="v2-actions"><button type="button" class="v2-link" id="selectVocabUsers">全選</button><button type="button" class="v2-link" id="clearVocabUsers">清空</button></div></div>
    <div class="vocab-access-users" id="vocabAccessUsers"></div>
    <p class="v2-caption" id="vocabAccessNotice" role="status">管理員始終可以使用。</p>
    <div class="v2-actions vocab-access-actions"><button type="button" class="v2-btn" id="cancelVocabAccess">取消</button><button type="button" class="v2-btn v2-btn--primary" id="saveVocabAccess" disabled>儲存權限</button></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  function updateStatus(ids){document.querySelectorAll('[data-vocab-access-status]').forEach(el=>el.textContent=statusText(ids));}
  function isDirty(){return [...selected].sort().join('\n')!==[...original].sort().join('\n');}
  function updateCount(){
    $('vocabAccessCount').textContent='已選 '+selected.size+' 位同學';
    $('saveVocabAccess').disabled=saving||!ready||!isDirty();
  }
  function render(){
    const term=$('vocabAccessSearch').value.trim().toLocaleLowerCase('zh-Hant');
    const filtered=users.filter(u=>u.name.toLocaleLowerCase('zh-Hant').includes(term));
    $('vocabAccessUsers').innerHTML=filtered.length?filtered.map(u=>`<label class="vocab-access-user"><span class="vocab-access-avatar" aria-hidden="true">${escapeHTML(Array.from(u.name)[0])}</span><span class="vocab-access-name">${escapeHTML(u.name)}</span><input type="checkbox" data-uid="${escapeHTML(u.uid)}" ${selected.has(u.uid)?'checked':''}><span class="vocab-access-check" aria-hidden="true">✓</span></label>`).join(''):'<div class="v2-empty">'+(term?'找不到符合的帳號。':'目前沒有其他已註冊的帳號。')+'</div>';
    updateCount();
  }
  async function open(){
    if(dialog.open)return;
    const request=++version;ready=false;users=[];
    $('vocabAccessSearch').value='';$('vocabAccessNotice').textContent='管理員始終可以使用。';
    $('vocabAccessUsers').innerHTML='<div class="v2-empty">正在載入帳號…</div>';
    $('vocabAccessCount').textContent='';$('saveVocabAccess').disabled=true;$('vocabAccessSearch').disabled=true;
    $('selectVocabUsers').disabled=$('clearVocabUsers').disabled=true;
    dialog.showModal();
    try{
      let config;
      if(session.preview){
        config={};users=[{uid:'preview-student',name:'測試同學 A'},{uid:'preview-friend',name:'測試同學 B'}];
      }else{
        const [accounts,system]=await Promise.all([getDocs(collection(db,'users')),getDoc(doc(db,'settings','system'))]);
        if(request!==version||!dialog.open)return;
        if(!system.exists())throw new Error('Missing system settings');
        config=system.data();users=accounts.docs.map(s=>({...s.data(),uid:s.id})).filter(u=>u.role!=='admin').map(u=>({uid:u.uid,name:String(u.name||'未命名帳號')}));
      }
      if(request!==version||!dialog.open)return;
      users.sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));
      original=accountIds(config);selected=new Set(original);ready=true;updateStatus(original);render();$('vocabAccessSearch').disabled=false;
      $('selectVocabUsers').disabled=$('clearVocabUsers').disabled=false;
    }catch(error){
      console.warn('Access list could not be loaded',error);
      $('vocabAccessUsers').innerHTML='<div class="v2-empty">帳號暫時無法載入，請關閉後重試。</div>';
      $('vocabAccessNotice').textContent='尚未變更任何權限。';
    }
  }
  function close(){if(!saving)dialog.close();}
  triggers.forEach(button=>button.addEventListener('click',open));
  $('closeVocabAccess').onclick=$('cancelVocabAccess').onclick=close;
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{version++;});
  $('vocabAccessSearch').oninput=render;
  $('vocabAccessUsers').onchange=event=>{
    const input=event.target.closest('input[data-uid]');if(!input||saving)return;
    if(input.checked)selected.add(input.dataset.uid);else selected.delete(input.dataset.uid);
    updateCount();
  };
  $('selectVocabUsers').onclick=()=>{users.forEach(u=>selected.add(u.uid));render();};
  $('clearVocabUsers').onclick=()=>{selected.clear();render();};
  $('saveVocabAccess').onclick=async()=>{
    if(saving||!ready||!isDirty())return;
    saving=true;const ids=[...selected].sort();
    dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    $('vocabAccessNotice').textContent='正在儲存…';
    try{
      if(!session.preview)await updateDoc(doc(db,'settings','system'),{[SECOND_VOCAB_ACCESS_KEY]:ids,updatedAt:serverTimestamp()});
      original=ids;updateStatus(ids);
      $('vocabAccessNotice').textContent=session.preview?'預覽完成，未變更實際權限。':'已儲存。同學重新整理首頁後即可使用。';
      window.dispatchEvent(new CustomEvent('nx:vocab-access-changed',{detail:{ids}}));
    }catch(error){
      console.warn('Access list could not be saved',error);
      $('vocabAccessNotice').textContent='儲存失敗，請確認連線後再試。';
    }finally{
      saving=false;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);updateCount();
    }
  };
  try{
    const config=session.preview?{}:await getDoc(doc(db,'settings','system')).then(s=>s.exists()?s.data():{});
    updateStatus(accountIds(config));
  }catch(error){document.querySelectorAll('[data-vocab-access-status]').forEach(el=>el.textContent='點選開放對象查看權限');}
}
init();
