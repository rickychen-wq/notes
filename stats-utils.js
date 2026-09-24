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
