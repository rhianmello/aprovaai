/* Nós Passa — legacy ADM visual layer intentionally disabled.
 * admin-v3.html now owns its sidebar, contextual navigation and section lifecycle.
 * Keeping this file as a no-op prevents old code from reinjecting Banco de Questões
 * or toggling legacy .section elements after the ADM refactor.
 */
(function(){
  'use strict';
  if(!/admin-v3\.html$/i.test(location.pathname)) return;
  window.NP_LEGACY_ADMIN_LAYER_DISABLED = true;
})();
