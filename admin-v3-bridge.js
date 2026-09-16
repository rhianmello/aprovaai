/* Nós Passa — complementos seguros do painel admin-v3.
 * Mantém o layout do admin-v3 e repõe controles que existiam no painel legado.
 */
(function(){
  'use strict';
  if(!/admin-v3\.html$/i.test(location.pathname)) return;

  const ready = (fn) => {
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const dt = (v) => v ? new Date(v).toLocaleString('pt-BR') : '—';

  function installStyles(){
    if(document.getElementById('np-admin-v3-bridge-style')) return;
    const style = document.createElement('style');
    style.id = 'np-admin-v3-bridge-style';
    style.textContent = `
      #nav .np-admin-link{width:100%;display:flex;align-items:center;gap:10px;text-align:left;text-decoration:none;background:transparent;border:0;color:#aab5bf;border-radius:9px;padding:11px;font-weight:750;font-size:12px;cursor:pointer}
      #nav .np-admin-link:hover{background:#131b24;color:#fff}
      #nav .np-admin-link .nav-icon{width:18px;text-align:center}
      @media(max-width:1000px){#nav .np-admin-link{justify-content:center}#nav .np-admin-link span:not(.nav-icon){display:none}}
      @media(max-width:620px){#nav .np-admin-link{padding:9px 4px}}
    `;
    document.head.appendChild(style);
  }

  function addExternalLink(nav, id, href, icon, label){
    if(document.getElementById(id)) return;
    const a = document.createElement('a');
    a.id = id;
    a.className = 'np-admin-link';
    a.href = href;
    a.innerHTML = `<span class="nav-icon">${icon}</span><span>${esc(label)}</span>`;
    nav.appendChild(a);
  }

  async function renderDevices(button){
    document.querySelectorAll('#nav button[data-section]').forEach(b => b.classList.toggle('active', b === button));
    const eyebrow = document.getElementById('sectionEyebrow');
    const title = document.getElementById('sectionTitle');
    const description = document.getElementById('sectionDescription');
    const mount = document.getElementById('sectionMount');
    if(eyebrow) eyebrow.textContent = 'DISPOSITIVOS';
    if(title) title.textContent = 'Dispositivos';
    if(description) description.textContent = 'Sessões e dispositivos registrados dos alunos.';
    if(!mount) return;
    mount.innerHTML = '<section class="section-card"><div class="section-toolbar"><div><h2>Dispositivos / sessões</h2><p>Carregando registros...</p></div></div><div class="empty">Carregando...</div></section>';

    try{
      const sb = window.__NP_ADMIN_SB;
      if(!sb) throw new Error('Cliente administrativo do Supabase não disponível.');
      const [sessionsResult, profilesResult] = await Promise.all([
        sb.from('user_sessions').select('id,user_id,device_id,device_name,ip_address,last_seen,created_at,active').order('last_seen',{ascending:false}),
        sb.from('profiles').select('id,nome,email').eq('role','student')
      ]);
      if(sessionsResult.error) throw sessionsResult.error;
      if(profilesResult.error) throw profilesResult.error;
      const sessions = sessionsResult.data || [];
      const profiles = profilesResult.data || [];
      const activeCount = sessions.filter(s => s.active).length;
      mount.innerHTML = `<section class="section-card">
        <div class="section-toolbar"><div><h2>Dispositivos / sessões</h2><p>${sessions.length} registro(s) • ${activeCount} ativo(s).</p></div></div>
        ${sessions.length ? `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Dispositivo</th><th>IP</th><th>Última atividade</th><th>Status</th></tr></thead><tbody>${sessions.map(s => {
          const u = profiles.find(p => p.id === s.user_id);
          return `<tr><td><strong>${esc(u?.nome || u?.email || s.user_id)}</strong>${u?.email && u?.nome ? `<br><span class="mini">${esc(u.email)}</span>` : ''}</td><td>${esc(s.device_name || s.device_id || '—')}</td><td>${esc(s.ip_address || '—')}</td><td>${esc(dt(s.last_seen || s.created_at))}</td><td>${s.active ? '<span class="badge">Ativo</span>' : '<span class="badge off">Revogado</span>'}</td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="empty">Nenhum dispositivo registrado.</div>'}
      </section>`;
    }catch(error){
      mount.innerHTML = `<section class="section-card"><div class="error">Não foi possível carregar dispositivos: ${esc(error?.message || error)}</div></section>`;
    }
  }

  function install(){
    installStyles();
    const nav = document.getElementById('nav');
    if(!nav || document.getElementById('np-admin-devices')) return;

    const devices = document.createElement('button');
    devices.id = 'np-admin-devices';
    devices.type = 'button';
    devices.dataset.section = 'devices';
    devices.innerHTML = '<span class="nav-icon">▣</span><span>Dispositivos</span>';

    const questions = nav.querySelector('button[data-section="questions"]');
    if(questions) nav.insertBefore(devices, questions);
    else nav.appendChild(devices);
    devices.addEventListener('click', () => renderDevices(devices));

    addExternalLink(nav, 'np-admin-editorial', 'admin-revisao-transpetro.html', '✓', 'Revisão Editorial Transpetro');
    addExternalLink(nav, 'np-admin-visitors', 'visitantes.html', '◉', 'Ver visitantes');
  }

  ready(install);
})();
