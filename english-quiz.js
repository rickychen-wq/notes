(function(){
  var key='nx:hide-cn';
  try{ if(localStorage.getItem(key)==='1') document.body.classList.add('hide-cn'); }catch(e){}
  var cn=document.getElementById('cnbtn');
  function sync(){if(!cn)return;var off=document.body.classList.contains('hide-cn');cn.classList.toggle('off',off);cn.textContent=off?'顯示中文':'隱藏中文';}
  if(cn)cn.addEventListener('click',function(){document.body.classList.toggle('hide-cn');try{localStorage.setItem(key,document.body.classList.contains('hide-cn')?'1':'0');}catch(e){}sync();});
  sync();
})();
document.querySelectorAll('nav button[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
  const id=btn.dataset.tab;
  document.querySelectorAll('nav button[data-tab]').forEach(b=>b.classList.toggle('on',b===btn));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id===id));
  window.scrollTo({top:0,behavior:'smooth'});
}));
document.querySelectorAll('[data-grade]').forEach(btn=>btn.addEventListener('click',()=>{
  const quiz=btn.closest('.quiz');let correct=0,total=0;
  quiz.querySelectorAll('.q[data-answer]').forEach(q=>{
    total++;const pick=q.querySelector('input:checked');const ok=pick&&pick.value===q.dataset.answer;
    q.classList.remove('right','wrong');q.classList.add(ok?'right':'wrong');if(ok)correct++;
  });
  const pct=Math.round(correct/total*100);quiz.querySelector('.result').textContent=`${correct} / ${total}（${pct}%）`;
  const id=document.body.dataset.pageId;if(id){try{localStorage.setItem('nx:score:'+id,String(pct));localStorage.setItem('nx:time:'+id,String(Date.now()));}catch(e){}}
}));
