export function summarizeWrongItems(attempts){
  const wrongWordCounts={},wrongQuestionCounts={};
  (attempts||[]).forEach(function(attempt){
    (attempt.wrongItems||[]).forEach(function(item){
      const text=String(item||'').trim();if(!text)return;
      const isEnglishWord=attempt.subject==='english'&&/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(text);
      if(isEnglishWord){const term=text.toLocaleLowerCase('en');wrongWordCounts[term]=(wrongWordCounts[term]||0)+1;return;}
      const key=(attempt.subject||'other')+'\u0000'+text;
      if(!wrongQuestionCounts[key])wrongQuestionCounts[key]={text,subject:attempt.subject||'other',count:0};
      wrongQuestionCounts[key].count++;
    });
  });
  return{
    topWrongWords:Object.entries(wrongWordCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,8).map(function(item){return{term:item[0],count:item[1]};}),
    wrongQuestions:Object.values(wrongQuestionCounts).sort(function(a,b){return b.count-a.count;}).slice(0,12)
  };
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
