(function(){
  document.documentElement.classList.add('nx-auth-pending');
  window.NX_AUTH_TIMEOUT=setTimeout(function(){
    if(!document.documentElement.classList.contains('nx-auth-pending')) return;
    document.documentElement.classList.remove('nx-auth-pending');
    if(!document.body) return;
    document.body.innerHTML='<div class="nx-connection-error"><div class="nx-connection-error__card"><h1>連線逾時</h1><p>登入服務暫時沒有回應，請確認網路後再試一次。</p><button type="button" onclick="location.reload()">重新整理</button></div></div>';
  },12000);
})();
