import {
  auth,createUserWithEmailAndPassword,db,deleteUser,doc,getDoc,nameToEmail,normalizeName,onAuthStateChanged,
  serverTimestamp,setDoc,signInWithEmailAndPassword,signOut,writeBatch
} from './firebase-core.js';

const tabs=document.getElementById('authTabs');
const loginForm=document.getElementById('loginForm');
const registerForm=document.getElementById('registerForm');
const formNotice=document.getElementById('formNotice');
const systemNotice=document.getElementById('systemNotice');
let systemExists=false,registrationAllowed=false;

const loginStage=document.querySelector('.login-stage');
if(loginStage&&matchMedia('(pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
  document.addEventListener('pointermove',function(event){
    const x=event.clientX/innerWidth-.5,y=event.clientY/innerHeight-.5;
    loginStage.style.setProperty('--tilt-x',(-y*2.2).toFixed(2)+'deg');
    loginStage.style.setProperty('--tilt-y',(x*2.8).toFixed(2)+'deg');
    loginStage.style.setProperty('--glow-x',(event.clientX/innerWidth*100).toFixed(1)+'%');
    loginStage.style.setProperty('--glow-y',(event.clientY/innerHeight*100).toFixed(1)+'%');
  },{passive:true});
}

function safeNext(){
  const raw=new URLSearchParams(location.search).get('next')||'index.html';
  return /^[a-zA-Z0-9_.-]+\.html(?:[?#].*)?$/.test(raw)?raw:'index.html';
}

function showMessage(message,type){
  formNotice.textContent=message;formNotice.hidden=!message;
  formNotice.className='notice '+(type==='success'?'notice--success':'notice--error');
}

function authMessage(error){
  const code=error&&error.code||'';
  if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found')) return '姓名或密碼不正確。';
  if(code.includes('email-already-in-use')) return '這個姓名已經註冊過了。';
  if(code.includes('weak-password')) return '密碼至少需要 6 個字元。';
  if(code.includes('too-many-requests')) return '嘗試次數太多，請稍後再試。';
  if(code.includes('network-request-failed')) return '網路連線失敗，請檢查網路後再試。';
  if(code.includes('operation-not-allowed')) return 'Firebase 的 Email／Password 登入尚未啟用。';
  if(code.includes('permission-denied')) return '雲端權限拒絕了這次操作，請檢查 Firestore 規則。';
  return '操作沒有完成，請稍後再試。';
}

function setMode(mode){
  tabs.querySelectorAll('button').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.mode===mode));});
  loginForm.hidden=mode!=='login';registerForm.hidden=mode!=='register';showMessage('');
}

tabs.addEventListener('click',function(event){const button=event.target.closest('button[data-mode]');if(!button)return;setMode(button.dataset.mode);});

async function loadSystem(){
  try{
    const snap=await getDoc(doc(db,'settings','system'));systemExists=snap.exists();
    if(!systemExists){registrationAllowed=true;systemNotice.hidden=false;systemNotice.textContent='目前尚未建立管理員。第一個成功註冊的帳號會成為管理員，完成後註冊會自動關閉。';return;}
    const data=snap.data();registrationAllowed=data.registrationOpen===true;
    const registerTab=tabs.querySelector('[data-mode="register"]');registerTab.hidden=!registrationAllowed;
    if(!registrationAllowed&&new URLSearchParams(location.search).get('mode')==='register')setMode('login');
  }catch(error){systemNotice.hidden=false;systemNotice.className='notice notice--error';systemNotice.textContent='無法讀取註冊狀態，請稍後重新整理。';}
}

loginForm.addEventListener('submit',async function(event){
  event.preventDefault();showMessage('');const button=loginForm.querySelector('button[type="submit"]');button.disabled=true;
  try{
    const email=await nameToEmail(document.getElementById('loginName').value);
    await signInWithEmailAndPassword(auth,email,document.getElementById('loginPassword').value);
    location.replace(safeNext());
  }catch(error){showMessage(authMessage(error));button.disabled=false;}
});

registerForm.addEventListener('submit',async function(event){
  event.preventDefault();showMessage('');
  const name=document.getElementById('registerName').value.trim(),nameKey=normalizeName(name);
  const password=document.getElementById('registerPassword').value,confirm=document.getElementById('registerConfirm').value;
  if(name.length<1){showMessage('請輸入姓名。');return;}if(password!==confirm){showMessage('兩次輸入的密碼不一致。');return;}
  if(password.length<6){showMessage('密碼至少需要 6 個字元。');return;}
  const button=document.getElementById('registerSubmit');button.disabled=true;let credential=null;
  try{
    await loadSystem();if(systemExists&&!registrationAllowed)throw Object.assign(new Error('registration-closed'),{code:'registration-closed'});
    const email=await nameToEmail(name);credential=await createUserWithEmailAndPassword(auth,email,password);
    const uid=credential.user.uid;
    if(!systemExists){
      const batch=writeBatch(db);
      batch.set(doc(db,'settings','system'),{adminUid:uid,registrationOpen:false,openAt:null,closeAt:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      batch.set(doc(db,'admins',uid),{uid,createdAt:serverTimestamp()});
      batch.set(doc(db,'users',uid),{uid,name,nameKey,role:'admin',createdAt:serverTimestamp(),lastLoginAt:serverTimestamp()});
      await batch.commit();
    }else{
      await setDoc(doc(db,'users',uid),{uid,name,nameKey,role:'user',createdAt:serverTimestamp(),lastLoginAt:serverTimestamp()});
    }
    location.replace('index.html');
  }catch(error){
    if(credential&&credential.user){try{await deleteUser(credential.user);}catch(cleanupError){console.warn(cleanupError);}try{await signOut(auth);}catch(signoutError){}}
    showMessage(error.code==='registration-closed'?'目前沒有開放註冊。':authMessage(error));button.disabled=false;
  }
});

onAuthStateChanged(auth,async function(user){
  if(!user)return;const profile=await getDoc(doc(db,'users',user.uid));if(profile.exists())location.replace(safeNext());
});

loadSystem().then(function(){if(new URLSearchParams(location.search).get('mode')==='register'&&registrationAllowed)setMode('register');});
