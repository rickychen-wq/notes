import {formatDuration,waitForSession} from './firebase-core.js';
import {getUserStats} from './analytics.js';
import {canUseSecondMidterm} from './study-quiz-core.js';

async function start(){
  const session=await waitForSession();
  document.getElementById('homeGreeting').textContent='你好，'+session.profile.name;
  const isAdmin=session.profile.role==='admin';document.getElementById('homeRole').textContent=isAdmin?'管理員':'學習者';
  document.getElementById('manageLink').hidden=!isAdmin;
  const workspace=document.getElementById('adminWorkspace'),preparing=document.getElementById('preparingPanel');
  const week=document.getElementById('week1Workspace'),canWeek=isAdmin||session.contentAccess?.magWeek1===true;
  const week3=document.getElementById('week3Workspace'),canWeek3=isAdmin||session.contentAccess?.magWeek3===true;
  const book=document.getElementById('bookL4Workspace'),canBook=isAdmin||session.contentAccess?.bookL4===true;
  if(book)book.hidden=!canBook;
  if(week)week.hidden=!canWeek;
  if(week3)week3.hidden=!canWeek3;
  if(workspace&&preparing){
    const canStudy=canUseSecondMidterm(session);
    workspace.hidden=!canStudy;preparing.hidden=canStudy||canWeek||canWeek3||canBook;
    if(isAdmin){
      document.getElementById('previewStudent').onclick=function(){
        workspace.hidden=true;preparing.hidden=false;document.getElementById('studentPreviewNotice').hidden=false;
        if(week)week.hidden=true;
        if(week3)week3.hidden=true;
        if(book)book.hidden=true;
        document.getElementById('manageLink').hidden=true;
      };
      document.getElementById('exitStudentPreview').onclick=function(){
        workspace.hidden=false;preparing.hidden=true;document.getElementById('studentPreviewNotice').hidden=true;
        if(week)week.hidden=!canWeek;
        if(week3)week3.hidden=!canWeek3;
        if(book)book.hidden=!canBook;
        document.getElementById('manageLink').hidden=false;
      };
    }
  }
  if(session.preview){document.getElementById('homeSummary').textContent='最常讀英文 · 測驗平均 86%';document.getElementById('homeMetric').textContent='1 小時 18 分';return;}
  try{
    const stats=await getUserStats(session.user.uid,7);
    document.getElementById('homeSummary').textContent=stats.topSubject?'最常讀'+stats.topSubject.label+(stats.avgScore===null?'':' · 測驗平均 '+stats.avgScore+'%'):'完成第一篇筆記後，這裡會開始整理你的進度';
    document.getElementById('homeMetric').textContent=formatDuration(stats.totalSeconds);
  }catch(error){console.error(error);document.getElementById('homeSummary').textContent='學習資料暫時無法同步';document.getElementById('homeMetric').textContent='—';}
}
start();
