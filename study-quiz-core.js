// Pure helpers: shared by the second-midterm UI and regression tests.
export function normalizeEnglish(value){
  return String(value??'').normalize('NFKC').toLowerCase().trim()
    .replace(/[’‘`´]/g,"'").replace(/\s+/gu,'');
}
const EN_VARIANTS={marvelous:['marvellous'],apologize:['apologise'],criticize:['criticise']};
const TRADITIONAL={'湿':'濕','气':'氣','无':'無','发':'發','现':'現','实':'實','纯':'純','净':'淨','热':'熱','独':'獨','变':'變','长':'長','宽':'寬','迟':'遲','虑':'慮','贫':'貧','穷':'窮','丰':'豐','强':'強','轻':'輕','软':'軟','紧':'緊','义':'義','开':'開','闭':'閉','乱':'亂','难':'難','认':'認','识':'識','对':'對','传':'傳','达':'達','员':'員','会':'會','关':'關','联':'聯','谅':'諒','帮':'幫','观':'觀','众':'眾','听':'聽','说':'說','争':'爭','论':'論','获':'獲','减':'減','选':'選','举':'舉','确':'確','证':'證','离':'離','险':'險','辞':'辭','顾':'顧','艰':'艱','华':'華','丽':'麗','浅':'淺','够':'夠','约':'約','锈':'鏽','肤':'膚','组':'組','拥':'擁','赞':'贊','许':'許','诺':'諾','迈':'邁','运':'運','输':'輸','启':'啟','动':'動','终':'終','继':'繼','续':'續'};
export function normalizeChinese(value){
  return String(value??'').normalize('NFKC').trim().replace(/^\s*(意思是|意思為|表示|就是)/u,'')
    .replace(/[\p{P}\p{Z}\p{S}\s]/gu,'').replace(/[\s\S]/gu,c=>TRADITIONAL[c]||c)
    .replace(/(.+)[的地]$/u,'$1');
}
export function acceptedChinese(item){
  return [...new Set([...item.senses.flatMap(s=>s.meaning.split(/[；，、]/u)),...item.aliases].map(normalizeChinese).filter(Boolean))];
}
export function judgeAnswer(item,input,direction){
  if(direction==='en-cn'){
    const parts=String(input??'').split(/[；;，,、/／\n]+/u).map(normalizeChinese).filter(Boolean);
    const allowed=new Set(acceptedChinese(item));
    // No substring/one-character fuzzy match: "不重要" must not match "重要".
    return parts.length>0&&parts.every(part=>allowed.has(part));
  }
  const normalized=normalizeEnglish(input);
  return [item.word,...(EN_VARIANTS[item.word]||[])].some(word=>normalizeEnglish(word)===normalized);
}
export function shuffle(items,random=Math.random){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function choicesFor(item,random=Math.random){return shuffle([item.word,...item.distractors],random);}
export function filterWords(words,{units,letter='',scope='all',search='',starred={},wrong={}}){
  const selected=new Set(units),term=String(search).trim().toLowerCase();
  return words.filter(item=>selected.has(item.unit)&&(!letter||item.word[0].toUpperCase()===letter)
    &&(scope!=='starred'||starred[item.id]===true)&&(scope!=='wrong'||wrong[item.id]===true)
    &&(!term||(item.word+' '+item.meaning+' '+item.note).toLowerCase().includes(term)));
}
export function summarizeAnswers(answers){
  const total=answers.length,correct=answers.filter(answer=>answer.correct).length;
  return {total,correct,score:total?Math.round(correct/total*100):0};
}
export function posLabel(pos){
  const base=pos.startsWith('adj.')?'形容詞':pos.startsWith('adv.')?'副詞':pos.startsWith('vt. vi.')?'及物／不及物動詞':pos.startsWith('vt.')?'及物動詞':pos.startsWith('vi.')?'不及物動詞':'名詞';
  const count=pos.includes('[CU]')?'可數／不可數':pos.includes('[C]')?'可數':pos.includes('[U]')?'不可數':pos.includes('[S]')?'常用單數':pos.includes('[SU]')?'單數／不可數':pos.includes('[pl.]')?'複數':'';
  return base+(count?'・'+count:'');
}
export function canUseSecondMidterm(session){return session?.profile?.role==='admin';}
