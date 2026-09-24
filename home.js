import {formatDuration,waitForSession} from './firebase-core.js';
import {getUserStats} from './analytics.js';

async function start(){
  const session=await waitForSession();
  document.getElementById('homeGreeting').textContent='你好，'+session.profile.name;
  const isAdmin=session.profile.role==='admin';document.getElementById('homeRole').textContent=isAdmin?'管理員':'學習者';
  document.getElementById('manageLink').hidden=!isAdmin;
  if(session.preview){document.getElementById('homeSummary').textContent='最常讀英文 · 測驗平均 86%';document.getElementById('homeMetric').textContent='1 小時 18 分';return;}
  try{
    const stats=await getUserStats(session.user.uid,7);
    document.getElementById('homeSummary').textContent=stats.topSubject?'最常讀'+stats.topSubject.label+(stats.avgScore===null?'':' · 測驗平均 '+stats.avgScore+'%'):'完成第一篇筆記後，這裡會開始整理你的進度';
    document.getElementById('homeMetric').textContent=formatDuration(stats.totalSeconds);
  }catch(error){console.error(error);document.getElementById('homeSummary').textContent='學習資料暫時無法同步';document.getElementById('homeMetric').textContent='—';}
}
start();
