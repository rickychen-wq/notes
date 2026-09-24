import {SUBJECT_LABELS,Timestamp,collection,currentDay,db,getDocs,limit,orderBy,query,timestampToDate,where} from './firebase-core.js';
import {summarizeWrongItems} from './wrong-items.js';

function emptyDays(count){
  const list=[];for(let i=count-1;i>=0;i--) list.push({day:currentDay(-i),activeSeconds:0,pageViews:0,quizAttempts:0,subjectSeconds:{}});
  return list;
}

export async function getUserStats(uid,days){
  const span=days||30,start=currentDay(-(span-1));
  const startAt=Timestamp.fromDate(new Date(start+'T00:00:00'));
  const dailyQuery=query(collection(db,'users',uid,'daily'),where('day','>=',start),orderBy('day','asc'));
  const attemptsQuery=query(collection(db,'users',uid,'attempts'),where('at','>=',startAt),orderBy('at','desc'),limit(120));
  const [dailySnap,attemptSnap]=await Promise.all([getDocs(dailyQuery),getDocs(attemptsQuery)]);
  const byDay=new Map(dailySnap.docs.map(function(s){return [s.id,s.data()];}));
  const series=emptyDays(span).map(function(base){return Object.assign(base,byDay.get(base.day)||{});});
  const attempts=attemptSnap.docs.map(function(s){return Object.assign({id:s.id},s.data());});
  const subjectSeconds={};let totalSeconds=0,pageViews=0;
  series.forEach(function(day){
    totalSeconds+=Number(day.activeSeconds)||0;pageViews+=Number(day.pageViews)||0;
    Object.entries(day.subjectSeconds||{}).forEach(function(entry){subjectSeconds[entry[0]]=(subjectSeconds[entry[0]]||0)+(Number(entry[1])||0);});
  });
  const scored=attempts.filter(function(a){return Number.isFinite(Number(a.score));});
  const avgScore=scored.length?Math.round(scored.reduce(function(sum,a){return sum+Number(a.score);},0)/scored.length):null;
  const {topWrongWords,wrongQuestions}=summarizeWrongItems(attempts);
  const topWrong=topWrongWords[0]||null;
  const topSubject=Object.entries(subjectSeconds).sort(function(a,b){return b[1]-a[1];})[0]||null;
  return {
    series,attempts,subjectSeconds,totalSeconds,pageViews,avgScore,attemptCount:attempts.length,
    topWrong,topWrongWords,wrongQuestions,
    topSubject:topSubject?{id:topSubject[0],label:SUBJECT_LABELS[topSubject[0]]||topSubject[0],seconds:topSubject[1]}:null,
    lastActiveAt:attempts.map(function(a){return timestampToDate(a.at);}).filter(Boolean)[0]||null
  };
}

export async function getUserHistory(uid){
  const historyQuery=query(collection(db,'users',uid,'attempts'),orderBy('at','desc'));
  const attemptSnap=await getDocs(historyQuery);
  const attempts=attemptSnap.docs.map(function(s){return Object.assign({id:s.id},s.data());});
  const {topWrongWords,wrongQuestions}=summarizeWrongItems(attempts);
  return{attempts,topWrongWords,wrongQuestions};
}
