import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  browserLocalPersistence,browserSessionPersistence,createUserWithEmailAndPassword,deleteUser,indexedDBLocalPersistence,
  initializeAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,updatePassword
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  Timestamp,collection,doc,getDoc,getDocs,getFirestore,increment,limit,orderBy,query,
  serverTimestamp,setDoc,updateDoc,where,writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const firebaseConfig={
  apiKey:'AIzaSyCsfkEwHZfHT-2j5Za1cuw4DkUtKvPmIxo',
  authDomain:'class-f62e3.firebaseapp.com',
  projectId:'class-f62e3',
  storageBucket:'class-f62e3.firebasestorage.app',
  messagingSenderId:'149603283334',
  appId:'1:149603283334:web:9c635a0030e87b1cb73c07',
  measurementId:'G-2Q91FX8GNV'
};

export const app=initializeApp(firebaseConfig);
export const auth=initializeAuth(app,{
  persistence:[indexedDBLocalPersistence,browserLocalPersistence,browserSessionPersistence]
});
export const authStateReady=auth.authStateReady();
export const db=getFirestore(app);

export {
  Timestamp,collection,createUserWithEmailAndPassword,deleteUser,doc,getDoc,getDocs,increment,limit,
  onAuthStateChanged,orderBy,query,serverTimestamp,setDoc,signInWithEmailAndPassword,signOut,
  updateDoc,updatePassword,where,writeBatch
};

export function normalizeName(value){
  return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('zh-Hant');
}

export async function nameToEmail(value){
  const key=normalizeName(value);
  if(!key) throw new Error('name-required');
  const bytes=new TextEncoder().encode(key);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const token=Array.from(new Uint8Array(digest)).slice(0,16).map(function(n){return n.toString(16).padStart(2,'0');}).join('');
  return token+'@notes.local';
}

export async function loadProfile(uid){
  const snap=await getDoc(doc(db,'users',uid));
  return snap.exists()?snap.data():null;
}

export function waitForSession(){
  if(window.NX_SESSION) return Promise.resolve(window.NX_SESSION);
  return new Promise(function(resolve){window.addEventListener('nx:auth-ready',function(){resolve(window.NX_SESSION);},{once:true});});
}

const AUTH_TRANSITION_KEY='nx:auth-transition';

export function markAuthTransition(){
  try{sessionStorage.setItem(AUTH_TRANSITION_KEY,String(Date.now()));}catch(error){}
}

export function clearAuthTransition(){
  try{sessionStorage.removeItem(AUTH_TRANSITION_KEY);}catch(error){}
}

export function consumeAuthTransition(){
  try{
    const value=Number(sessionStorage.getItem(AUTH_TRANSITION_KEY));
    sessionStorage.removeItem(AUTH_TRANSITION_KEY);
    return Number.isFinite(value)&&Date.now()-value<120000;
  }catch(error){return false;}
}

export function isLocalPreview(){
  return /^(localhost|127\.0\.0\.1)$/.test(location.hostname)&&new URLSearchParams(location.search).get('preview')==='1';
}

export function currentDay(offsetDays){
  const d=new Date();d.setDate(d.getDate()+(offsetDays||0));
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+day;
}

export function pageIdFromPath(pathname){
  const name=(pathname||location.pathname).split('/').pop()||'index.html';
  return name.replace(/\.html$/i,'')||'index';
}

export function subjectFromPage(pageId){
  const id=pageId||pageIdFromPath();
  if(/^ch-|^s-chinese$/.test(id)) return 'chinese';
  if(/^en-|^s-english$/.test(id)) return 'english';
  if(/^math|^s-math$/.test(id)) return 'math';
  if(/^bio|^s-bio$/.test(id)) return 'biology';
  if(/^chem|^s-chem$/.test(id)) return 'chemistry';
  if(/^civ|^s-civics$/.test(id)) return 'civics';
  if(/^s-physics$/.test(id)) return 'physics';
  if(/^s-geo$/.test(id)) return 'geography';
  return 'other';
}

export const SUBJECT_LABELS={chinese:'國文',english:'英文',math:'數學',biology:'生物',chemistry:'化學',
  physics:'物理',geography:'地理',civics:'公民',other:'其他'};

export function formatDuration(seconds){
  const total=Math.max(0,Math.round(Number(seconds)||0));
  if(total<60) return total+' 秒';
  const minutes=Math.round(total/60);
  if(minutes<60) return minutes+' 分鐘';
  const hours=Math.floor(minutes/60),rest=minutes%60;
  return hours+' 小時'+(rest?' '+rest+' 分':'');
}

export function timestampToDate(value){
  if(!value) return null;
  if(typeof value.toDate==='function') return value.toDate();
  if(value.seconds) return new Date(value.seconds*1000);
  const d=new Date(value);return Number.isNaN(d.getTime())?null:d;
}
