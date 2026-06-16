/* Tiny utility helpers */
window.AidUtils = (function () {
  const wrap = () => document.getElementById('toastWrap');
  function toast(msg, type = 'info', duration = 3200) {
    const w = wrap(); if (!w) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const ico = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    el.innerHTML = `<div class="t-ico">${ico}</div><div>${msg}</div>`;
    w.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      el.style.transition = 'all .3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
  function $(s, p = document) { return p.querySelector(s); }
  function $$(s, p = document) { return Array.from(p.querySelectorAll(s)); }
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
  function smoothScroll(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  return { toast, $, $$, delay, smoothScroll };
})();
