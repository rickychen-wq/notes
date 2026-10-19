// Test-only Firebase replacement, served exclusively by the Playwright route.
// Real auth gate, role checks, UI, store and analytics modules still execute.
export const firebaseFixture=`
export const db={};
const role=window.__TEST_ROLE||'admin';
const profile={uid:'test-'+role,name:role==='admin'?'Chen':'測試同學',nameKey:'test-'+role,role};
export const auth={currentUser:{uid:profile.uid}},authStateReady=Promise.resolve();
window.__WRITES=[];window.__DOCS=new Map();
export const Timestamp={fromMillis:n=>({seconds:n/1000,toDate:()=>new Date(n)}),fromDate:d=>({seconds:d.getTime()/1000,toDate:()=>d})};
export const doc=(_, ...p)=>p.join('/'),collection=doc,increment=n=>({increment:n}),serverTimestamp=()=>({seconds:Date.now()/1000});
export const limit=(...a)=>a,orderBy=(...a)=>a,where=(...a)=>a,query=(ref,...constraints)=>({ref,constraints});
export async function getDoc(ref){const data=ref==='settings/system'?{registrationOpen:false,bookVocabAllowedUids:['test-user'],vocabAzAllowedUids:['test-user']}:window.__DOCS.get(ref)||profile;return {exists:()=>true,data:()=>data};}
export async function getDocs(ref){
  if(ref==='users')return {docs:[profile,{uid:'classmate-1',name:'同學 A',role:'user'},{uid:'classmate-2',name:'同學 B',role:'user'}].map(p=>({id:p.uid,data:()=>p}))};
  return {docs:[]};
}
export const updateDoc=async(ref,patch)=>{if(window.__OFFLINE)throw Object.assign(new Error('Offline'),{code:'unavailable'});window.__WRITES.push({kind:'update',ref,patch});};
export const setDoc=async(ref,data)=>{window.__WRITES.push({kind:'set',ref,data});};
export const writeBatch=()=>({set(){},async commit(){}});
export const runTransaction=async(_,fn)=>{if(window.__OFFLINE)throw Object.assign(new Error('Offline'),{code:'unavailable'});const writes=[];await fn({get:async ref=>({exists:()=>window.__DOCS.has(ref)}),set:(ref,data)=>writes.push({ref,data})});for(const w of writes){window.__DOCS.set(w.ref,w.data);window.__WRITES.push({kind:'transaction',...w});}};
export const onAuthStateChanged=(_,fn)=>{queueMicrotask(()=>fn(window.__TEST_LOGGED_OUT?null:auth.currentUser));return ()=>{};};
export const signOut=async()=>{},updatePassword=async(_,password)=>{window.__WRITES.push({kind:'password',password});};
export const createUserWithEmailAndPassword=async()=>{},deleteUser=async()=>{},signInWithEmailAndPassword=async()=>{};
`;
