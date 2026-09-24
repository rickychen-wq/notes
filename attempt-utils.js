export function clean(value){return String(value||'').replace(/\s+/g,' ').trim();}

export function userAnswerFrom(value){
  const match=clean(value).match(/你(?:寫的／選的|寫的|選了)[：:\s]*([^（）·\n]+)/);
  return match?clean(match[1]):'';
}

export function correctAnswerFrom(value){
  const match=clean(value).match(/(?:正解|正確答案)[：:\s]*([^·（\n]+)/);
  return match?clean(match[1]):'';
}
