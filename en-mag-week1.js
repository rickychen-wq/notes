import {waitForSession} from './firebase-core.js';
import {choicesFor,filterWords,judgeAnswer,posLabel as basePosLabel,shuffle,summarizeAnswers} from './study-quiz-core.js';
import {StudyStore} from './mag-week1-store.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let bank=[],units=[],byId=new Map(),store,session,activeTab='words',meaningMode='show',wordLetter='',quizMode='choice';
let wordUnits=new Set(),quizUnits=new Set(),revealed=new Set(),run=null,composing=false,imeFinishedAt=0,toastTimer,confirmAction=null;
const BANK_VERSION='mag-week1-20261027';
const posLabel=pos=>pos==='phr.'?'片語':pos==='v.'?'動詞':basePosLabel(pos);
const canUseSecondMidterm=s=>s?.profile?.role==='admin'||s?.contentAccess?.magWeek1===true;
function kindMatch(item,kind){return kind==='all'||(kind==='required'?item.kind!=='reference':item.kind===kind);}
function weekFilter(items,config){return filterWords(items,config).filter(item=>kindMatch(item,config.kind));}
function grade(item,input,direction){if(direction==='cn-en'&&item.kind==='phrase'){const norm=s=>s.toLowerCase().replace(/[^a-z ]/g,' ').replace(/\b(sb|sth|somebody|someone|something|a|an|the)\b/g,' ').replace(/\s+/g,' ').trim();const forms={"look upon":["look on"],"be suspicious of":["remain suspicious of","be suspicious about","remain suspicious about"]};return [item.word,...(forms[item.word]||[])].some(s=>norm(s)===norm(input));}return judgeAnswer(item,input,direction);}
const modeNames={choice:'選擇題', 'type-en':'中文 → 英文','type-cn':'英文 → 中文'};
const modeRules={choice:'四個形近或易混淆選項；選完不自動跳題。','type-en':'忽略大小寫與多餘空白，字母要拼對。題目提供字首及長度，區分同義字。','type-cn':'寫出一個正確意思即可，接受常見同義說法及標點差異；未涵蓋的合理答案可自行改判。'};

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600);}
function posHTML(item){return item.senses.map(s=>`<span class="pos-tag">${esc(s.pos)} <small>${esc(posLabel(s.pos))}</small></span>`).join(' ');}
function sensesHTML(item){return item.senses.map(s=>`<div class="sense"><span class="pos-tag">${esc(s.pos)} <small>${esc(posLabel(s.pos))}</small></span><p>${esc(s.meaning)}</p></div>`).join('');}
function renderUnits(root,selected){const kind=$(root==='wordUnits'?'wordKind':'quizKind').value;$(root).innerHTML=units.map(u=>`<button type="button" class="v2-chip" data-unit="${u.id}" aria-pressed="${selected.has(u.id)}">${u.id} <small>${bank.filter(item=>item.unit===u.id&&kindMatch(item,kind)).length} 項</small></button>`).join('');}
function selectAll(selected){if(selected.size===units.length)selected.clear();else units.forEach(u=>selected.add(u.id));}
function filterConfig(forQuiz=false){return {units:[...(forQuiz?quizUnits:wordUnits)],letter:forQuiz?$('quizLetter').value:wordLetter,scope:$(forQuiz?'quizScope':'wordScope').value,kind:$(forQuiz?'quizKind':'wordKind').value,search:forQuiz?'':$('wordSearch').value,...store.state};}
function renderAlphabet(){
  const available=new Set(bank.filter(item=>wordUnits.has(item.unit)&&kindMatch(item,$('wordKind').value)).map(item=>item.word[0].toUpperCase()));
  $('alphabet').innerHTML='<button type="button" data-letter="" aria-pressed="'+(!wordLetter)+'">全部</button>'+Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',letter=>`<button type="button" data-letter="${letter}" aria-pressed="${wordLetter===letter}" ${available.has(letter)?'':'disabled'}>${letter}</button>`).join('');
}
function renderWords(){
  let filtered=weekFilter(bank,filterConfig());
  if($('wordOrder').value==='az')filtered.sort((a,b)=>a.word.localeCompare(b.word,'en'));
  $('wordCount').textContent=`顯示 ${filtered.length} / ${bank.length} 字`;
  $('wordList').innerHTML=filtered.length?filtered.map(item=>{
    const visible=meaningMode==='show'||revealed.has(item.id),star=store.state.starred[item.id]===true;
    return `<article class="word-card${star?' is-starred':''}" data-kind="${item.kind}" data-id="${item.id}"><div class="word-top"><div><span class="word-source">${item.unit} · ${{main:"主單字",reference:"參考字詞",phrase:"片語"}[item.kind]} ${item.number} / p.${item.page}</span><h2 class="word-title">${esc(item.word)}</h2></div><div class="word-tools"><button type="button" class="word-tool" data-action="speak" aria-label="朗讀 ${esc(item.word)}" title="朗讀">♪</button><button type="button" class="word-tool" data-action="star" aria-label="${star?'取消收藏':'收藏難字'} ${esc(item.word)}" aria-pressed="${star}">${star?'★':'☆'}</button></div></div>${store.state.wrong[item.id]?'<span class="word-weak">待複習錯字</span>':''}${visible?sensesHTML(item):`<div>${posHTML(item)}</div><button type="button" class="reveal-word" data-action="reveal">點一下看中文</button>`}${visible?`<details><summary>用法與易錯處</summary><p>${esc(item.note)}</p></details>${meaningMode==='tap'?'<button type="button" class="word-hide" data-action="conceal">收起中文</button>':''}`:''}</article>`;
  }).join(''):'<div class="v2-empty">這個範圍沒有單字。試試調整回次、字首或搜尋條件。</div>';
}
function speak(item){
  if(!('speechSynthesis' in window)){toast('這個瀏覽器暫不支援朗讀。');return;}
  speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(item.word);utterance.lang='en-US';utterance.rate=.82;
  const voice=speechSynthesis.getVoices().find(v=>v.lang==='en-US');if(voice)utterance.voice=voice;
  utterance.onerror=()=>toast('朗讀暫時不可用，可稍後再試。');speechSynthesis.speak(utterance);
}
function renderPool(){
  const pool=weekFilter(bank,filterConfig(true)),requested=$('quizCount').value;
  const count=requested==='all'?pool.length:Math.min(Number(requested),pool.length);
  $('poolCount').textContent=pool.length;$('actualCount').textContent=count?`本次隨機出 ${count} 題`:'請選擇有單字的範圍';
  $('startQuiz').disabled=count===0;$('quizRule').textContent=modeRules[quizMode];
}
function setTab(tab){
  if(activeTab==='quiz'&&tab==='words'&&run&&!$('quizRun').hidden)pauseRun();
  activeTab=tab;
  for(const value of ['words','quiz']){$(value+'Tab').setAttribute('aria-selected',String(tab===value));$(value+'Tab').tabIndex=tab===value?0:-1;$(value+'Panel').hidden=tab!==value;}
  if(tab==='words')renderWords();else{renderPool();renderResume();}
  if(window.scrollY>240)document.querySelector('[role="tablist"]').scrollIntoView({block:'start'});
}
function elapsedMs(){return run?run.elapsedMs+(run.activeAt?Date.now()-run.activeAt:0):0;}
function saveDraft(){
  if(!run)return;
  store.saveDraft({version:BANK_VERSION,ids:run.ids,index:run.index,answers:run.answers,config:run.config,
    mode:run.mode,elapsedMs:elapsedMs(),startedAtMs:run.startedAtMs,typed:$('typedAnswer').value,options:run.options});
}
function validDraft(d){
  return d&&d.version===BANK_VERSION&&Array.isArray(d.ids)&&d.ids.length>0&&d.ids.every(id=>byId.has(id))
    &&new Set(d.ids).size===d.ids.length&&Number.isInteger(d.index)&&d.index>=0&&d.index<d.ids.length
    &&Array.isArray(d.answers)&&[d.index,d.index+1].includes(d.answers.length)&&d.answers.every((a,i)=>a.id===d.ids[i]&&typeof a.correct==='boolean')
    &&Object.hasOwn(modeNames,d.mode)&&d.config&&Number.isFinite(d.elapsedMs);
}
function renderResume(){const draft=store.getDraft();$('resumeBanner').hidden=!validDraft(draft)||!$('quizRun').hidden||!$('quizResult').hidden;if(validDraft(draft))$('resumeCopy').textContent=`${modeNames[draft.mode]} · 已答 ${draft.answers.length} / ${draft.ids.length} 題`;}
function askDiscard(action){confirmAction=action;$('discardDialog').showModal();}
function startRun(items,mode,config){
  run={ids:shuffle(items).map(item=>item.id),index:0,answers:[],mode,config,elapsedMs:0,activeAt:Date.now(),startedAtMs:Date.now(),options:[]};
  $('quizSetup').hidden=true;$('quizResult').hidden=true;$('quizRun').hidden=false;$('resumeBanner').hidden=true;
  renderQuestion();saveDraft();
}
function startFromSetup(){
  const pool=weekFilter(bank,filterConfig(true));if(!pool.length)return;
  const count=$('quizCount').value==='all'?pool.length:Math.min(Number($('quizCount').value),pool.length);
  const config={units:[...quizUnits],letter:$('quizLetter').value,scope:$('quizScope').value,kind:$('quizKind').value,count};
  const action=()=>startRun(shuffle(pool).slice(0,count),quizMode,config);
  if(validDraft(store.getDraft()))askDiscard(action);else action();
}
function resumeRun(){
  const draft=store.getDraft();if(!validDraft(draft)){toast('暫存版本已變更，請重新選擇範圍。');renderResume();return;}
  run={...draft,activeAt:Date.now()};$('quizSetup').hidden=true;$('quizResult').hidden=true;$('quizRun').hidden=false;$('resumeBanner').hidden=true;
  renderQuestion(draft.typed||'',draft.options);
}
function pauseRun(){
  if(!run)return;saveDraft();run.elapsedMs=elapsedMs();run.activeAt=null;
  $('quizRun').hidden=true;$('quizSetup').hidden=false;renderResume();renderPool();toast('已暫存，可稍後繼續。');
}
function renderQuestion(typed='',savedOptions){
  const item=byId.get(run.ids[run.index]),answered=run.answers.length>run.index,isChoice=run.mode==='choice',englishPrompt=run.mode==='type-cn';
  $('questionProgress').textContent=`${run.index+1} / ${run.ids.length} 題 · ${modeNames[run.mode]}`;
  const percent=Math.round(run.index/run.ids.length*100);$('progressFill').style.width=percent+'%';$('progressBar').setAttribute('aria-valuenow',String(percent));
  $('questionLabel').textContent=`雜誌 Week 1 · ${item.unit} · ${{main:"主單字",reference:"參考字詞",phrase:"片語"}[item.kind]} ${item.number}`;
  $('questionPos').innerHTML=posHTML(item);
  $('questionPrompt').textContent=englishPrompt?item.word:item.meaning;$('questionPrompt').classList.toggle('is-chinese',!englishPrompt);
  $('questionHint').textContent=englishPrompt?'寫出一個正確中文意思即可。':`字首 ${item.word[0]} · ${item.word.length} 個字母`;
  $('questionOptions').hidden=!isChoice;$('answerForm').hidden=isChoice;
  run.options=isChoice&&Array.isArray(savedOptions)&&savedOptions.length===4&&savedOptions.includes(item.word)?savedOptions:choicesFor(item);
  $('questionOptions').innerHTML=run.options.map((word,index)=>`<button type="button" class="q-option" data-choice="${esc(word)}"><span>${index+1}</span>${esc(word)}</button>`).join('');
  $('typedAnswer').value=typed;$('typedAnswer').readOnly=false;$('typedAnswer').placeholder=englishPrompt?'中文意思':'英文拼字';$('typedAnswer').setAttribute('lang',englishPrompt?'zh-Hant':'en');
  $('typedAnswer').enterKeyHint='send';$('submitAnswer').disabled=false;
  $('answerFeedback').hidden=true;$('skipQuestion').hidden=false;$('nextQuestion').hidden=true;
  if(answered){renderFeedback();$('nextQuestion').focus({preventScroll:true});}
  else if(!isChoice)$('typedAnswer').focus({preventScroll:true});else $('questionPrompt').focus({preventScroll:true});
  $('quizRun').scrollIntoView({block:'start'});
}
function submit(input,skipped=false){
  if(!run||run.answers.length>run.index)return;
  if(!skipped&&!String(input).trim()){toast('先輸入答案，或按「還不會」。');return;}
  const item=byId.get(run.ids[run.index]);
  const correct=!skipped&&(run.mode==='choice'?input===item.word:grade(item,input,run.mode==='type-cn'?'en-cn':'cn-en'));
  run.answers.push({id:item.id,input:skipped?'（還不會）':String(input).trim(),correct,skipped,manual:false});
  store.set('wrong',item.id,!correct);renderFeedback();saveDraft();
  $('answerFeedback').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function renderFeedback(){
  const item=byId.get(run.ids[run.index]),answer=run.answers[run.index];if(!answer)return;
  $('typedAnswer').readOnly=true;$('typedAnswer').enterKeyHint='next';$('submitAnswer').disabled=true;
  $('questionOptions').querySelectorAll('button').forEach(button=>{button.disabled=true;button.classList.toggle('correct',button.dataset.choice===item.word);button.classList.toggle('incorrect',!answer.correct&&button.dataset.choice===answer.input);});
  const feedback=$('answerFeedback');feedback.className='feedback '+(answer.correct?'vok':'vno');feedback.hidden=false;
  feedback.innerHTML=`<h3>${answer.correct?(answer.manual?'已依你的判讀改為答對':'答對了'):'這個再記一下'}</h3><div class="correct-word">${esc(item.word)}</div>${sensesHTML(item)}<p class="explanation">${esc(item.note)}</p>${!answer.correct&&!answer.skipped?`<p class="v2-caption">你的答案：${esc(answer.input)}</p>`:''}${!answer.correct&&run.mode==='type-cn'&&!answer.skipped?'<p class="v2-caption">系統比對的是整理好的同義說法；如果你的寫法意思相同，可以自行改判。</p><button type="button" class="v2-btn v2-btn--soft" id="acceptMeaning">意思正確，改判答對</button>':''}${answer.manual?'<p class="v2-caption">這題會保留「自行改判」標記。</p>':''}`;
  $('skipQuestion').hidden=true;$('nextQuestion').hidden=false;$('nextQuestion').textContent=run.index===run.ids.length-1?'查看結果 →':'下一題 →';
}
function acceptMeaning(){
  const answer=run?.answers[run.index];if(!answer||answer.correct||run.mode!=='type-cn')return;
  answer.correct=true;answer.manual=true;store.set('wrong',answer.id,false);renderFeedback();saveDraft();
}
function nextQuestion(){
  if(!run||run.answers.length<=run.index)return;
  if(run.index+1===run.ids.length){finishRun();return;}
  run.index++;renderQuestion();saveDraft();
}
function finishRun(){
  const completed=run,summary=summarizeAnswers(completed.answers),durationSeconds=Math.max(1,Math.round(elapsedMs()/1000));
  completed.elapsedMs=elapsedMs();completed.activeAt=null;
  $('quizRun').hidden=true;$('quizResult').hidden=false;$('quizSetup').hidden=true;$('resumeBanner').hidden=true;
  $('progressFill').style.width='100%';$('progressBar').setAttribute('aria-valuenow','100');
  $('resultScore').innerHTML=`${summary.score}<small>%</small>`;
  $('resultTitle').textContent=summary.correct===summary.total?'這一輪全部答對':'這一輪完成了';
  $('resultScope').textContent=`${completed.config.units.join('、')} · ${modeNames[completed.mode]}${completed.config.scope==='retry'?' · 錯題重測':''}`;
  const minutes=Math.floor(durationSeconds/60),seconds=durationSeconds%60;
  $('resultStats').innerHTML=`<div><b>${summary.correct} / ${summary.total}</b><span>本次答對</span></div><div><b>${summary.total-summary.correct}</b><span>待加強</span></div><div><b>${minutes}:${String(seconds).padStart(2,'0')}</b><span>作答時間</span></div>`;
  $('retryWrong').hidden=summary.correct===summary.total;
  $('resultAnswers').innerHTML=completed.answers.map((answer,index)=>{const item=byId.get(answer.id);return `<details class="answer-row ${answer.correct?'is-right':'is-wrong'}" ${answer.correct?'':'open'}><summary>${index+1}. ${esc(item.word)} · ${answer.correct?'答對':'待複習'}${answer.manual?'（自行改判）':''}</summary><small>${item.unit} · 第 ${item.number} 字　你的答案：${esc(answer.input)}</small>${sensesHTML(item)}<p>${esc(item.note)}</p></details>`;}).join('');
  const completedAtMs=Date.now(),id='m2-'+(crypto.randomUUID?crypto.randomUUID():completedAtMs+'-'+Math.random().toString(36).slice(2));
  const record={id,pageId:'en-mag-week1',pageTitle:document.title,subject:'english',period:'115-1-2',score:summary.score,
    correctCount:summary.correct,totalQuestions:summary.total,durationSeconds,completedAtMs,path:location.pathname,
    quizConfig:{...completed.config,mode:completed.mode},manualCorrections:completed.answers.filter(a=>a.manual).length,
    answers:completed.answers.map(a=>({...a,term:byId.get(a.id).word})),
    wrongItems:completed.answers.filter(a=>!a.correct).map(a=>{const item=byId.get(a.id);return {term:item.word,meaning:item.meaning,question:completed.mode==='type-cn'?item.word:item.meaning,correctAnswer:completed.mode==='type-cn'?item.meaning:item.word,userAnswer:a.input,lesson:'雜誌 Week 1 '+item.unit,subject:'english'};})};
  // Persist the outbox first; an interrupted network upload can then be retried safely.
  store.enqueueAttempt(record);store.clearDraft();renderWords();$('resultTitle').tabIndex=-1;$('resultTitle').focus({preventScroll:true});
}
function bind(){
  $('wordsTab').onclick=()=>setTab('words');$('quizTab').onclick=()=>setTab('quiz');
  document.querySelector('[role="tablist"]').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tab=event.key==='Home'?'words':event.key==='End'?'quiz':activeTab==='words'?'quiz':'words';setTab(tab);$(tab+'Tab').focus();});
  for(const [root,selected,render] of [['wordUnits',wordUnits,()=>{renderAlphabet();renderWords();}],['quizUnits',quizUnits,renderPool]]){
    $(root).addEventListener('click',event=>{const button=event.target.closest('[data-unit]');if(!button)return;selected.has(button.dataset.unit)?selected.delete(button.dataset.unit):selected.add(button.dataset.unit);renderUnits(root,selected);render();});
  }
  $('allWordUnits').onclick=()=>{selectAll(wordUnits);renderUnits('wordUnits',wordUnits);renderAlphabet();renderWords();};
  $('allQuizUnits').onclick=()=>{selectAll(quizUnits);renderUnits('quizUnits',quizUnits);renderPool();};
  $('wordKind').onchange=()=>{renderUnits('wordUnits',wordUnits);renderAlphabet();renderWords();};$('quizKind').onchange=()=>{renderUnits('quizUnits',quizUnits);renderPool();};
  $('wordSearch').oninput=renderWords;$('wordScope').onchange=renderWords;$('wordOrder').onchange=renderWords;
  $('alphabet').onclick=event=>{const button=event.target.closest('[data-letter]');if(!button||button.disabled)return;wordLetter=button.dataset.letter;renderAlphabet();renderWords();};
  $('meaningMode').onclick=event=>{const button=event.target.closest('[data-mode]');if(!button)return;meaningMode=button.dataset.mode;revealed.clear();$('meaningMode').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderWords();};
  $('wordList').onclick=event=>{
    const button=event.target.closest('[data-action]'),card=button?.closest('[data-id]');if(!button||!card)return;const item=byId.get(card.dataset.id);
    if(button.dataset.action==='speak'){speak(item);return;}
    if(button.dataset.action==='star')store.set('starred',item.id,!store.state.starred[item.id]);
    else if(button.dataset.action==='reveal')revealed.add(item.id);else if(button.dataset.action==='conceal')revealed.delete(item.id);
    const action=button.dataset.action;renderWords();renderPool();
    const replacement=$('wordList').querySelector(`[data-id="${item.id}"] [data-action="${action==='reveal'?'conceal':action==='conceal'?'reveal':action}"]`);replacement?.focus({preventScroll:true});
  };
  $('quizMethods').onclick=event=>{const button=event.target.closest('[data-mode]');if(!button)return;quizMode=button.dataset.mode;$('quizMethods').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderPool();};
  for(const id of ['quizLetter','quizScope','quizCount'])$(id).onchange=renderPool;
  $('startQuiz').onclick=startFromSetup;$('resumeQuiz').onclick=resumeRun;$('pauseQuiz').onclick=pauseRun;
  $('discardDraft').onclick=()=>askDiscard(()=>{store.clearDraft();run=null;renderResume();});
  $('cancelDiscard').onclick=()=>$('discardDialog').close();$('confirmDiscard').onclick=()=>{$('discardDialog').close();store.clearDraft();const action=confirmAction;confirmAction=null;action?.();};
  $('questionOptions').onclick=event=>{const button=event.target.closest('[data-choice]');if(button&&!button.disabled)submit(button.dataset.choice);};
  $('answerForm').onsubmit=event=>{event.preventDefault();if(composing||Date.now()-imeFinishedAt<80)return;submit($('typedAnswer').value);};
  $('typedAnswer').addEventListener('compositionstart',()=>composing=true);$('typedAnswer').addEventListener('compositionend',()=>{composing=false;imeFinishedAt=Date.now();saveDraft();});
  $('typedAnswer').addEventListener('input',()=>{if(!composing)saveDraft();});
  $('skipQuestion').onclick=()=>submit('',true);$('nextQuestion').onclick=nextQuestion;
  $('answerFeedback').onclick=event=>{if(event.target.closest('#acceptMeaning'))acceptMeaning();};
  $('retryWrong').onclick=()=>{const items=run.answers.filter(a=>!a.correct).map(a=>byId.get(a.id));if(items.length)startRun(items,run.mode,{...run.config,scope:'retry',count:items.length});};
  $('newQuiz').onclick=()=>{run=null;$('quizResult').hidden=true;$('quizSetup').hidden=false;renderPool();renderResume();};
  $('retrySync').onclick=()=>store.flush();
  document.addEventListener('keydown',event=>{
    if(activeTab!=='quiz'||$('quizRun').hidden||!run||event.defaultPrevented||event.repeat||event.isComposing||composing||event.keyCode===229||Date.now()-imeFinishedAt<80||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.target.closest('dialog,select,textarea'))return;
    const answered=run.answers.length>run.index;
    if(event.key==='Enter'){
      // Explicit buttons keep their own meaning (pause, override, reveal, etc.).
      const button=event.target.closest('button');
      if(button&&!['submitAnswer','nextQuestion'].includes(button.id)&&!button.classList.contains('q-option'))return;
      if(answered){event.preventDefault();nextQuestion();}
      else if(run.mode!=='choice'){event.preventDefault();submit($('typedAnswer').value);}
    }else if(run.mode==='choice'&&!answered&&/^[1-4]$/.test(event.key)&&!event.target.matches('input')){
      event.preventDefault();submit(run.options[Number(event.key)-1]);
    }
  });
  function stopTimer(){if(run&&!$('quizRun').hidden){run.elapsedMs=elapsedMs();run.activeAt=null;saveDraft();}}
  window.addEventListener('pagehide',stopTimer);
  window.addEventListener('pageshow',()=>{if(run&&!$('quizRun').hidden&&!document.hidden)run.activeAt=Date.now();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)stopTimer();else if(run&&!$('quizRun').hidden)run.activeAt=Date.now();
  });
}

async function init(){
  try{
    session=await waitForSession();if(!canUseSecondMidterm(session)){location.replace('index.html');return;}
    // Only load the bank after the admin or explicit account grant is confirmed.
    const data=await import('./en-mag-week1-data.js');bank=data.SECOND_VOCAB;units=data.VOCAB_UNITS;byId=new Map(bank.map(item=>[item.id,item]));
    if(bank.length!==73||units.length!==4)throw new Error('Unexpected word-bank size');
    store=new StudyStore(session,(message,state)=>{$('syncStatus').textContent=message;$('syncLine').dataset.state=state;$('retrySync').hidden=state!=='error';});
    const params=new URLSearchParams(location.search),requested=params.get('unit'),defaults=units.some(u=>u.id===requested)?[requested]:units.map(u=>u.id);
    wordUnits=new Set(defaults);quizUnits=new Set(defaults);
    renderUnits('wordUnits',wordUnits);renderUnits('quizUnits',quizUnits);
    $('quizLetter').insertAdjacentHTML('beforeend',Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ',letter=>`<option value="${letter}">${letter}</option>`).join(''));
    bind();renderAlphabet();renderWords();renderPool();renderResume();
    $('pageLoading').hidden=true;$('studyContent').hidden=false;setTab(params.get('tab')==='quiz'?'quiz':'words');store.flush();
  }catch(error){console.error('Vocabulary load failed',error);$('pageLoading').hidden=true;$('studyContent').hidden=true;$('pageLoadError').hidden=false;}
}
$('retryPage').onclick=()=>location.reload();
init();
