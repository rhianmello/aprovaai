/* Nós Passa — preenchimento Transpetro via QAPI.
 * Usa a sessão admin atual para chamar qapi-bulk-import. Não publica questões.
 */
(function(){
  'use strict';

  const MAX_PAGE_CAP = 200;
  const WORKFLOW_VERSION = 'transpetro-qapi-fill-v1';
  const QUEUE_TERMINAL = new Set(['completed','skipped']);
  const RUN_TERMINAL = new Set(['completed','cancelled']);

  let running = false;
  let pauseRequested = false;
  let activeRunId = null;
  let renderHost = null;
  let activeButton = null;

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const nowIso = () => new Date().toISOString();
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function sb(){
    const client = window.__NP_ADMIN_SB;
    if(!client) throw new Error('Cliente Supabase do admin não disponível.');
    return client;
  }

  function setHeader(){
    document.querySelectorAll('#nav button[data-section]').forEach(b => b.classList.toggle('active', b === activeButton));
    const eyebrow = $('sectionEyebrow');
    const title = $('sectionTitle');
    const description = $('sectionDescription');
    if(eyebrow) eyebrow.textContent = 'TRANSPETRO QAPI';
    if(title) title.textContent = 'Preencher questões Transpetro';
    if(description) description.textContent = 'Fila persistente para importar QAPI por matéria usando a sessão admin atual. Importar não publica questões.';
  }

  function setStatus(message, cls='muted'){
    const el = $('tfStatus');
    if(el) el.innerHTML = `<span class="${cls}">${esc(message)}</span>`;
  }

  function setButtons(){
    const start = $('tfStart');
    const pause = $('tfPause');
    const resume = $('tfResume');
    if(start) start.disabled = running;
    if(pause) pause.disabled = !running;
    if(resume) resume.disabled = running;
  }

  function matterOrder(matter){
    const order = ['Matemática','Língua Inglesa','Inglês Técnico Marítimo','Gestão de Projetos','Business Intelligence','Mineração de Dados','Modelagem de Sistemas de Informação','ERP - Sistema de Gestão Integrada (SAP-ERP)','Língua Portuguesa','Conhecimentos Específicos compartilhados','Conhecimentos Específicos exclusivos'];
    const idx = order.indexOf(matter);
    return idx === -1 ? 99 : idx + 1;
  }

  function classifyInvokeError(error, data){
    const message = data?.error || error?.message || String(error || 'Erro desconhecido');
    const lower = message.toLowerCase();
    const structural = lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('jwt') || lower.includes('sessão') || lower.includes('qapi_key');
    return {message, structural};
  }

  async function requireAdminSession(){
    const client = sb();
    const sessionResult = await client.auth.getSession();
    const session = sessionResult.data?.session;
    if(!session?.access_token) throw new Error('Sessão administrativa expirada. Faça login novamente.');
    const adminResult = await client.rpc('is_admin');
    if(adminResult.error) throw adminResult.error;
    if(adminResult.data !== true) throw new Error('A conta atual não possui perfil administrativo ativo.');
    return session;
  }

  async function invokeQapi(body){
    const session = await requireAdminSession();
    const result = await sb().functions.invoke('qapi-bulk-import', {
      headers: { Authorization: 'Bearer ' + session.access_token },
      body
    });
    if(result.error || result.data?.ok === false){
      const detail = classifyInvokeError(result.error, result.data);
      const err = new Error(detail.message);
      err.structural = detail.structural;
      throw err;
    }
    return result.data;
  }

  async function fetchBacklog(){
    const result = await sb().from('transpetro_question_fill_backlog')
      .select('*')
      .order('matter_order', {ascending:true})
      .order('zero_content_items', {ascending:false})
      .order('published_links', {ascending:true})
      .order('topic', {ascending:true});
    if(result.error) throw result.error;
    return result.data || [];
  }

  function groupBacklog(rows){
    const groups = new Map();
    for(const row of rows){
      const key = row.matter;
      if(!groups.has(key)){
        groups.set(key, {
          matter: row.matter,
          qapi_materia: row.qapi_materia,
          order: Number(row.matter_order || matterOrder(row.matter)),
          topics: [],
          zero: 0,
          published: 0
        });
      }
      const group = groups.get(key);
      group.topics.push({
        topic: row.topic,
        preparations_with_topic: row.preparations_with_topic,
        zero_content_items: row.zero_content_items,
        published_links: row.published_links
      });
      group.zero += Number(row.zero_content_items || 0);
      group.published += Number(row.published_links || 0);
    }
    return [...groups.values()].sort((a,b) => a.order - b.order || a.published - b.published || a.matter.localeCompare(b.matter, 'pt-BR'));
  }

  async function latestRun(){
    const result = await sb().from('transpetro_question_fill_runs')
      .select('*')
      .order('created_at', {ascending:false})
      .limit(1)
      .maybeSingle();
    if(result.error) throw result.error;
    return result.data;
  }

  async function loadTasks(runId){
    const result = await sb().from('transpetro_question_fill_queue')
      .select('*')
      .eq('run_id', runId)
      .order('position', {ascending:true});
    if(result.error) throw result.error;
    return result.data || [];
  }

  function countersFrom(data, mode){
    const summary = data?.summary || {};
    const duplicates = Number(summary.duplicates ?? 0);
    const rejected = Number(summary.rejected ?? summary.invalid ?? 0);
    return {
      found: Number(data?.received_size ?? data?.found ?? 0),
      imported: mode === 'import' ? Number(summary.imported ?? 0) : 0,
      reused: Number(summary.reused ?? 0),
      duplicates,
      rejected,
      errors: Number(summary.errors ?? 0),
      importable: Number(summary.importable ?? 0),
      skipped: Number(summary.skipped ?? (duplicates + rejected))
    };
  }

  function mergeCounters(base, inc){
    return {
      found: Number(base.found || 0) + Number(inc.found || 0),
      imported: Number(base.imported || 0) + Number(inc.imported || 0),
      reused: Number(base.reused || 0) + Number(inc.reused || 0),
      duplicates: Number(base.duplicates || 0) + Number(inc.duplicates || 0),
      rejected: Number(base.rejected || 0) + Number(inc.rejected || 0),
      errors: Number(base.errors || 0) + Number(inc.errors || 0)
    };
  }

  async function fetchNewQuestions(batchId){
    if(!batchId) return [];
    const result = await sb().from('question_import_items')
      .select('question_id,external_id,discipline,subject,status,source_page,imported_at')
      .eq('batch_id', batchId)
      .eq('status', 'imported')
      .order('item_index', {ascending:true});
    if(result.error) return [];
    return (result.data || []).map(item => ({
      question_id: item.question_id,
      external_id: item.external_id,
      materia: item.discipline,
      assunto: item.subject,
      page: item.source_page,
      imported_at: item.imported_at
    }));
  }

  async function createRun(){
    const session = await requireAdminSession();
    const backlog = groupBacklog(await fetchBacklog());
    if(!backlog.length) throw new Error('Nenhum item de backlog Transpetro foi encontrado.');

    const operationKey = 'transpetro_qapi_fill_' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const runInsert = await sb().from('transpetro_question_fill_runs')
      .insert({
        operation_key: operationKey,
        status: 'queued',
        requested_by: session.user.id,
        config: {
          workflow_version: WORKFLOW_VERSION,
          edge_function: 'qapi-bulk-import',
          imports_publish_questions: false,
          size_per_call: 10,
          max_page_cap: MAX_PAGE_CAP,
          portuguese_base_closed: true
        }
      })
      .select('*')
      .single();
    if(runInsert.error) throw runInsert.error;

    const queueRows = backlog.map((group, index) => {
      const zeroTopics = group.topics.filter(t => Number(t.zero_content_items || 0) > 0);
      const topicLabel = (zeroTopics.length ? zeroTopics : group.topics)
        .slice(0, 4)
        .map(t => t.topic)
        .join('; ');
      return {
        run_id: runInsert.data.id,
        position: index + 1,
        matter: group.matter,
        topic: topicLabel || 'Todos os tópicos da matéria',
        qapi_materia: group.qapi_materia,
        topic_snapshot: group.topics,
        status: 'pending',
        page_next: 1,
        page_end: null
      };
    });

    const queueInsert = await sb().from('transpetro_question_fill_queue').insert(queueRows);
    if(queueInsert.error) throw queueInsert.error;
    activeRunId = runInsert.data.id;
    return runInsert.data;
  }

  async function ensureRun(){
    const existing = await latestRun();
    if(existing && !RUN_TERMINAL.has(existing.status)){
      activeRunId = existing.id;
      return existing;
    }
    return createRun();
  }

  async function updateRun(id, patch){
    const result = await sb().from('transpetro_question_fill_runs')
      .update({...patch, updated_at: nowIso()})
      .eq('id', id)
      .select('*')
      .single();
    if(result.error) throw result.error;
    return result.data;
  }

  async function updateTask(id, patch){
    const result = await sb().from('transpetro_question_fill_queue')
      .update({...patch, updated_at: nowIso()})
      .eq('id', id)
      .select('*')
      .single();
    if(result.error) throw result.error;
    return result.data;
  }

  async function incrementRun(runId, counters){
    const run = await latestRun();
    if(!run || run.id !== runId) return;
    await updateRun(runId, {
      pages_processed: Number(run.pages_processed || 0) + 1,
      found: Number(run.found || 0) + Number(counters.found || 0),
      imported: Number(run.imported || 0) + Number(counters.imported || 0),
      reused: Number(run.reused || 0) + Number(counters.reused || 0),
      duplicates: Number(run.duplicates || 0) + Number(counters.duplicates || 0),
      rejected: Number(run.rejected || 0) + Number(counters.rejected || 0),
      errors: Number(run.errors || 0) + Number(counters.errors || 0)
    });
  }

  async function processTask(runId, task){
    let current = task;
    await updateRun(runId, {current_task_id: task.id});

    if(current.status === 'pending' || current.phase === 'idle'){
      current = await updateTask(current.id, {
        status: 'dry_run_running',
        phase: 'dry_run',
        started_at: current.started_at || nowIso(),
        last_error: null
      });

      setStatus(`Dry-run inicial: ${current.matter}, página ${current.page_next}.`, 'warn');
      const dryRunData = await invokeQapi({
        mode: 'dry_run',
        size: 10,
        page: current.page_next,
        materia: current.qapi_materia
      });
      const dryCounters = countersFrom(dryRunData, 'dry_run');
      const apiPages = Number(dryRunData?.qapi_pages || dryRunData?.resume_cursor?.pages || 0);
      const pageEnd = apiPages > 0 ? Math.min(apiPages, MAX_PAGE_CAP) : null;
      current = await updateTask(current.id, {
        status: 'dry_run_passed',
        phase: 'import',
        page_end: pageEnd,
        dry_run_summary: {
          summary: dryRunData.summary || {},
          qapi_total: dryRunData.qapi_total || 0,
          qapi_pages: apiPages || null,
          first_page: current.page_next,
          size: 10
        },
        last_result: {dry_run: dryRunData.summary || {}, resume_cursor: dryRunData.resume_cursor || null},
        found: Number(current.found || 0) + dryCounters.found,
        duplicates: Number(current.duplicates || 0) + dryCounters.duplicates,
        rejected: Number(current.rejected || 0) + dryCounters.rejected,
        errors: Number(current.errors || 0) + dryCounters.errors
      });

      if(dryCounters.found === 0){
        await updateTask(current.id, {status: 'skipped', finished_at: nowIso(), last_error: 'QAPI não retornou itens para a matéria no dry-run inicial.'});
        return;
      }
    }

    while(!pauseRequested){
      const page = Number(current.page_next || 1);
      const pageEnd = current.page_end ? Number(current.page_end) : null;
      if(pageEnd && page > pageEnd){
        await updateTask(current.id, {status: 'completed', finished_at: nowIso()});
        return;
      }
      if(page > MAX_PAGE_CAP){
        await updateTask(current.id, {status: 'completed', finished_at: nowIso(), last_error: 'Limite de segurança de páginas atingido.'});
        return;
      }

      current = await updateTask(current.id, {status: 'importing', phase: 'import', last_error: null});
      setStatus(`Importando ${current.matter}, página ${page}.`, 'warn');
      const importData = await invokeQapi({mode: 'import', size: 10, page, materia: current.qapi_materia});
      const counters = countersFrom(importData, 'import');
      const newQuestions = await fetchNewQuestions(importData.batch_id);
      const merged = mergeCounters(current, counters);
      const existingNewQuestions = Array.isArray(current.new_questions) ? current.new_questions : [];
      const resumeNext = Number(importData?.resume_cursor?.next_page || 0);
      const nextPage = resumeNext > page ? resumeNext : page + 1;
      const received = Number(importData?.received_size || 0);
      const reachedEnd = received < 10 || importData?.resume_cursor?.next_page == null || (pageEnd && page >= pageEnd);

      current = await updateTask(current.id, {
        ...merged,
        pages_processed: Number(current.pages_processed || 0) + 1,
        page_next: nextPage,
        last_result: {
          page,
          batch_id: importData.batch_id || null,
          summary: importData.summary || {},
          resume_cursor: importData.resume_cursor || null
        },
        new_questions: existingNewQuestions.concat(newQuestions).slice(-250)
      });
      await incrementRun(runId, counters);
      await refresh();

      if(reachedEnd){
        await updateTask(current.id, {status: 'completed', finished_at: nowIso()});
        return;
      }
      await sleep(350);
    }
    await updateTask(current.id, {status: 'paused'});
  }

  async function worker(run){
    running = true;
    pauseRequested = false;
    setButtons();
    let runState = await updateRun(run.id, {status: 'running', started_at: run.started_at || nowIso(), last_error: null});
    activeRunId = runState.id;
    await refresh();

    try{
      while(!pauseRequested){
        const tasks = await loadTasks(runState.id);
        const next = tasks.find(task => !QUEUE_TERMINAL.has(task.status));
        if(!next){
          await updateRun(runState.id, {status: 'completed', finished_at: nowIso(), current_task_id: null});
          setStatus('Fila concluída. As novas questões importadas aguardam revisão editorial.', 'ok');
          break;
        }
        await processTask(runState.id, next);
        runState = await latestRun();
        await refresh();
      }
      if(pauseRequested){
        await updateRun(runState.id, {status: 'paused'});
        setStatus('Execução pausada. O progresso ficou salvo no banco.', 'warn');
      }
    }catch(error){
      const structural = Boolean(error.structural);
      await updateRun(activeRunId, {status: 'failed', last_error: error.message || String(error), errors: Number((await latestRun())?.errors || 0) + 1});
      setStatus(structural ? `Erro estrutural: ${error.message}` : `Erro registrado: ${error.message}`, 'bad');
    }finally{
      running = false;
      setButtons();
      await refresh();
    }
  }

  async function start(){
    try{
      const run = await ensureRun();
      await worker(run);
    }catch(error){
      setStatus(error.message || String(error), 'bad');
    }
  }

  async function pause(){
    pauseRequested = true;
    if(activeRunId) await updateRun(activeRunId, {status: 'paused'});
    setStatus('Pausa solicitada. A página atual termina antes de parar.', 'warn');
    setButtons();
  }

  async function resume(){
    try{
      const run = await latestRun();
      if(!run || RUN_TERMINAL.has(run.status)) throw new Error('Não há execução pendente para continuar.');
      activeRunId = run.id;
      await worker(run);
    }catch(error){
      setStatus(error.message || String(error), 'bad');
    }
  }

  function progressText(task){
    if(!task) return '0%';
    const end = Number(task.page_end || 0);
    if(end > 0) return `${Math.min(100, Math.round((Number(task.page_next || 1) - 1) / end * 100))}%`;
    if(task.status === 'completed' || task.status === 'skipped') return '100%';
    if(task.pages_processed > 0) return `${task.pages_processed} pág.`;
    return '0%';
  }

  function statusBadge(status){
    if(status === 'completed') return '<span class="badge">Concluída</span>';
    if(status === 'skipped') return '<span class="badge warn">Sem retorno</span>';
    if(status === 'failed') return '<span class="badge off">Erro</span>';
    if(status === 'importing' || status === 'dry_run_running') return '<span class="badge warn">Rodando</span>';
    if(status === 'paused') return '<span class="badge warn">Pausada</span>';
    if(status === 'dry_run_passed') return '<span class="badge warn">Dry-run OK</span>';
    return '<span class="badge off">Pendente</span>';
  }

  function renderRows(tasks){
    if(!tasks.length) return '<div class="empty">Nenhuma fila criada ainda.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>Matéria</th><th>Progresso</th><th>Página</th><th>Novas</th><th>Duplicadas</th><th>Erros</th><th>Status</th></tr></thead><tbody>${tasks.map(task => {
      const page = `${Number(task.page_next || 1)}${task.page_end ? ' / ' + task.page_end : ''}`;
      const topicHint = task.topic ? `<br><span class="mini">${esc(task.topic)}</span>` : '';
      return `<tr><td><strong>${esc(task.matter)}</strong>${topicHint}</td><td>${esc(progressText(task))}</td><td>${esc(page)}</td><td>${Number(task.imported || 0)}</td><td>${Number(task.duplicates || 0)}</td><td>${Number(task.errors || 0)}</td><td>${statusBadge(task.status)}${task.last_error ? `<br><span class="mini">${esc(task.last_error)}</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderNewQuestions(tasks){
    const items = [];
    for(const task of tasks){
      const list = Array.isArray(task.new_questions) ? task.new_questions : [];
      for(const item of list) items.push({...item, matter: task.matter});
    }
    if(!items.length) return '<div class="empty">Nenhuma questão nova registrada nesta fila ainda.</div>';
    return `<div class="table-wrap"><table><thead><tr><th>Matéria</th><th>Assunto QAPI</th><th>Questão</th><th>Fonte</th><th>Página</th></tr></thead><tbody>${items.slice(-80).reverse().map(item => `<tr><td>${esc(item.matter || item.materia || '—')}</td><td>${esc(item.assunto || '—')}</td><td class="mini">${esc(item.question_id || '—')}</td><td>${esc(item.external_id || '—')}</td><td>${esc(item.page || '—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function refresh(){
    if(!renderHost) return;
    const run = await latestRun();
    activeRunId = run?.id || null;
    const tasks = run ? await loadTasks(run.id) : [];
    const runBox = $('tfRunSummary');
    const tableBox = $('tfTable');
    const newBox = $('tfNewQuestions');
    if(runBox){
      runBox.innerHTML = run ? `<div class="metric-grid"><div class="metric"><span>Status</span><strong>${esc(run.status)}</strong></div><div class="metric"><span>Páginas</span><strong>${Number(run.pages_processed || 0)}</strong></div><div class="metric"><span>Novas</span><strong>${Number(run.imported || 0)}</strong></div><div class="metric"><span>Duplicadas</span><strong>${Number(run.duplicates || 0)}</strong></div></div>${run.last_error ? `<div class="error">${esc(run.last_error)}</div>` : ''}` : '<div class="empty">Nenhuma execução criada.</div>';
    }
    if(tableBox) tableBox.innerHTML = renderRows(tasks);
    if(newBox) newBox.innerHTML = renderNewQuestions(tasks);
    setButtons();
  }

  async function render(button){
    activeButton = button;
    setHeader();
    const mount = $('sectionMount');
    renderHost = mount;
    mount.innerHTML = `<section class="section-card">
      <div class="section-toolbar">
        <div><h2>Preencher questões Transpetro</h2><p>Uma ação usa a sessão admin atual para fazer dry-run e importar QAPI por lotes de 10. Importação não publica questões.</p></div>
        <div class="toolbar-actions">
          <button class="btn" id="tfStart">Iniciar preenchimento</button>
          <button class="btn secondary" id="tfPause" disabled>Pausar</button>
          <button class="btn secondary" id="tfResume">Continuar</button>
        </div>
      </div>
      <div class="notice">Português-base fica fora da fila. Questões importadas aguardam revisão editorial antes de receber reviews, applicability e vínculo de conteúdo.</div>
      <div id="tfStatus" class="muted">Carregando fila...</div>
      <div id="tfRunSummary" style="margin-top:14px"></div>
      <div style="margin-top:16px"><h3 style="margin:0 0 10px">Fila</h3><div id="tfTable"></div></div>
      <div style="margin-top:16px"><h3 style="margin:0 0 10px">Questões novas desta execução</h3><div id="tfNewQuestions"></div></div>
    </section>`;
    $('tfStart').onclick = start;
    $('tfPause').onclick = pause;
    $('tfResume').onclick = resume;
    try{
      await requireAdminSession();
      setStatus('Pronto. O botão iniciar cria ou retoma uma fila persistente.', 'ok');
      await refresh();
    }catch(error){
      setStatus(error.message || String(error), 'bad');
    }
  }

  window.NPTranspetroFill = {render};
})();
