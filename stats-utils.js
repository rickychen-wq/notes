function text(value){return String(value??'').trim();}

function normalizeWrongItem(raw,attempt){
  const lesson=text(attempt.pageTitle||attempt.pageId||'未分類課程');
  if(raw&&typeof raw==='object'){
    const term=text(raw.term);
    const question=text(raw.question||raw.prompt||raw.text||term);
    return{
      term,
      meaning:text(raw.meaning),
      question,
      correctAnswer:text(raw.correctAnswer||raw.answer||(term?term:'')),
      userAnswer:text(raw.userAnswer),
      lesson:text(raw.lesson)||lesson,
      subject:text(raw.subject)||text(attempt.subject)||'other'
    };
  }
  const value=text(raw);
  return{term:'',meaning:'',question:value,correctAnswer:'',userAnswer:'',lesson,subject:text(attempt.subject)||'other'};
}

export function summarizeWrongItems(attempts){
  const wrongWordCounts={},wrongQuestionCounts={};
  (attempts||[]).forEach(function(attempt){
    (attempt.wrongItems||[]).forEach(function(raw){
      const item=normalizeWrongItem(raw,attempt);
      const candidate=item.term||item.question;if(!candidate)return;
      const isEnglishWord=item.subject==='english'&&/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(candidate);
      if(isEnglishWord){
        const term=candidate.toLocaleLowerCase('en');
        if(!wrongWordCounts[term])wrongWordCounts[term]={term,count:0,meanings:{},lessons:{}};
        const entry=wrongWordCounts[term];entry.count++;
        if(item.meaning)entry.meanings[item.meaning]=(entry.meanings[item.meaning]||0)+1;
        entry.lessons[item.lesson]=(entry.lessons[item.lesson]||0)+1;
        return;
      }
      const question=item.question||candidate;
      const key=item.subject+'\u0000'+question+'\u0000'+item.correctAnswer;
      if(!wrongQuestionCounts[key])wrongQuestionCounts[key]={
        text:question,question,correctAnswer:item.correctAnswer,userAnswer:item.userAnswer,
        subject:item.subject,count:0,lessons:{},lesson:item.lesson
      };
      const entry=wrongQuestionCounts[key];entry.count++;
      entry.lessons[item.lesson]=(entry.lessons[item.lesson]||0)+1;
      if(item.userAnswer)entry.userAnswer=item.userAnswer;
    });
  });
  const topWrongWords=Object.values(wrongWordCounts).map(function(item){
    const meanings=Object.entries(item.meanings).sort(function(a,b){return b[1]-a[1];}).map(function(x){return x[0];});
    const lessons=Object.entries(item.lessons).sort(function(a,b){return b[1]-a[1];}).map(function(x){return{lesson:x[0],count:x[1]};});
    return{term:item.term,count:item.count,meaning:meanings[0]||'',meanings,lessons};
  }).sort(function(a,b){return b.count-a.count||a.term.localeCompare(b.term);});
  const wrongQuestions=Object.values(wrongQuestionCounts).map(function(item){
    return Object.assign(item,{lessons:Object.entries(item.lessons).sort(function(a,b){return b[1]-a[1];}).map(function(x){return{lesson:x[0],count:x[1]};})});
  }).sort(function(a,b){return b.count-a.count||a.question.localeCompare(b.question);});
  return{topWrongWords,wrongQuestions};
}

export function attemptIdFromScoreId(rawId){
  if(rawId==='chem-2-2'||rawId==='chem-2-3')return null;
  return rawId==='chem-2-1'?'chem-2':rawId;
}

export function discardLegacyScores(storage,era){
  if(storage.getItem('nx:score-era')===era)return false;
  const keys=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);
    if(key&&(key.startsWith('nx:score:')||key.startsWith('nx:time:')||key.startsWith('nx:synced:')))keys.push(key);
  }
  keys.forEach(function(key){storage.removeItem(key);});storage.setItem('nx:score-era',era);
  return keys.length>0;
}
