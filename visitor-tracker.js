// Navigation fallback for the Brazil map is intentionally kept in the tracker so the page markup remains untouched.
(function () {
  const names = {AC:1,AL:1,AP:1,AM:1,BA:1,CE:1,DF:1,ES:1,GO:1,MA:1,MT:1,MS:1,MG:1,PA:1,PB:1,PR:1,PE:1,PI:1,RJ:1,RN:1,RS:1,RO:1,RR:1,SC:1,SP:1,SE:1,TO:1};
  function go(uf) {
    uf = String(uf || '').toUpperCase().trim();
    if (!names[uf]) return;
    window.location.href = uf === 'RJ'
      ? 'transpetro-landing.html?uf=RJ&marica=1'
      : 'transpetro-landing.html?uf=' + encodeURIComponent(uf);
  }
  function bind() {
    const map = document.getElementById('brazilMap');
    if (!map) return;
    map.addEventListener('onStateSelected', function (e) { go(e.detail); }, true);
    const root = map.shadowRoot;
    if (root) {
      root.addEventListener('click', function (e) {
        const path = e.composedPath().find(function (el) {
          return el && el.tagName && el.tagName.toLowerCase() === 'path';
        });
        if (!path) return;
        const raw = path.id || path.getAttribute('data-id') || path.getAttribute('data-state') || '';
        const match = String(raw).toUpperCase().match(/(?:BR[-_])?([A-Z]{2})$/);
        if (match) go(match[1]);
      }, true);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
  if (window.customElements && customElements.whenDefined) {
    customElements.whenDefined('brazil-component').then(bind);
  }
})();
