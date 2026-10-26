import {db,doc,updateDoc,runTransaction,increment,serverTimestamp,Timestamp} from './firebase-core.js';

const asObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

// Everything is namespaced by the authenticated UID, never by a shared browser score key.
export class StudyStore{
  constructor(session,onStatus=()=>{}){
    this.session=session;this.onStatus=onStatus;
    this.prefix='nx:mag-week1:'+session.user.uid+':';
    this.pending=Object.fromEntries(Object.entries(asObject(this.read('pending',{}))).filter(([key,value])=>/^magWeek1\.(starred|wrong)\.w1-u[1-4]-(?:main|reference|phrase)-\d+$/.test(key)&&typeof value==='boolean'));
    const outbox=this.read('outbox',[]);this.attempts=Array.isArray(outbox)?outbox.filter(a=>a&&typeof a.id==='string'&&/^m2-[\w-]+$/.test(a.id)&&Number.isFinite(a.completedAtMs)):[];
    const cached=asObject(this.read('state',{})),cloud=asObject(session.profile.magWeek1);
    this.state={starred:{...asObject(cloud.starred)},wrong:{...asObject(cloud.wrong)}};
    if(session.preview)this.state={starred:asObject(cached.starred),wrong:asObject(cached.wrong)};
    for(const [key,value] of Object.entries(this.pending)){
      const [,kind,id]=key.split('.');if(this.state[kind]&&id)this.state[kind][id]=value;
    }
    this.timer=null;this.flushing=null;this.flushAgain=false;
    this.onlineHandler=()=>this.flush();window.addEventListener('online',this.onlineHandler);
  }
  read(key,fallback){try{return JSON.parse(localStorage.getItem(this.prefix+key))??fallback;}catch{return fallback;}}
  write(key,value){try{localStorage.setItem(this.prefix+key,JSON.stringify(value));return true;}catch{this.localSaveFailed=true;this.onStatus('這個瀏覽器無法保存暫存，請保持頁面開啟直到同步完成。','error');return false;}}
  set(kind,id,value){
    if(!['starred','wrong'].includes(kind)||!/^w1-u[1-4]-(?:main|reference|phrase)-\d+$/.test(id))return;
    this.state[kind][id]=value;this.pending[`magWeek1.${kind}.${id}`]=value;
    this.write('state',this.state);this.write('pending',this.pending);
    clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),700);
  }
  saveDraft(draft){return this.write('draft',draft);}
  getDraft(){return this.read('draft',null);}
  clearDraft(){try{localStorage.removeItem(this.prefix+'draft');}catch{}}
  async enqueueAttempt(record){
    if(!this.attempts.some(a=>a.id===record.id))this.attempts.push(record);
    this.write('outbox',this.attempts);return this.flush();
  }
  async flush(){
    if(this.flushing){this.flushAgain=true;return this.flushing;}
    if(this.session.preview){this.pending={};this.attempts=[];this.write('pending',{});this.write('outbox',[]);this.onStatus('本機預覽・不寫入 Firebase','preview');return;}
    if(!Object.keys(this.pending).length&&!this.attempts.length){this.onStatus('已同步','ok');return;}
    this.onStatus('同步中…','pending');
    this.flushing=this.flushWork();
    try{await this.flushing;}finally{
      this.flushing=null;
      if(this.flushAgain){this.flushAgain=false;clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),500);}
    }
  }
  async flushWork(){
    try{
      const pending={...this.pending};
      if(Object.keys(pending).length){
        await updateDoc(doc(db,'users',this.session.user.uid),{...pending,'magWeek1.updatedAt':serverTimestamp()});
        for(const [key,value] of Object.entries(pending))if(this.pending[key]===value)delete this.pending[key];
        this.write('pending',this.pending);
      }
      for(const record of [...this.attempts]){
        const uid=this.session.user.uid,ref=doc(db,'users',uid,'attempts',record.id);
        const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(record.completedAtMs));
        // A deterministic attempt ID + transaction makes retry safe and prevents double-counting.
        await runTransaction(db,async transaction=>{
          const existing=await transaction.get(ref);if(existing.exists())return;
          transaction.set(ref,{...record,uid,at:Timestamp.fromMillis(record.completedAtMs),uploadedAt:serverTimestamp()});
          transaction.set(doc(db,'users',uid,'daily',day),{uid,day,quizAttempts:increment(1),lastActiveAt:serverTimestamp()},{merge:true});
        });
        this.attempts=this.attempts.filter(a=>a.id!==record.id);this.write('outbox',this.attempts);
      }
      this.onStatus('已同步','ok');
    }catch(error){
      console.warn('Second-midterm data sync pending',error.code||error.message);
      this.onStatus(this.localSaveFailed?'同步與裝置暫存都未成功，紀錄仍在本頁；請勿關閉，連線恢復後按重試。':error.code==='permission-denied'?'同步權限不足，紀錄仍留在此裝置；請重試或檢查 Firebase 規則。':'尚未同步，紀錄已暫存；連線恢復後會重試。','error');
    }
  }
}
