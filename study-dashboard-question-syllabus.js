/* Nós Passa — mostra todo o edital na aba Questões, incluindo tópicos sem questões. */
(function(){
'use strict';
const C = window.STUDY_CONFIG || {};
const items = Array.isArray(C.contentItems) ? C.contentItems : [];
if (!items.length) return;

const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[m]));
const norm = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();
const topicKey = (subject, topic) => `${norm(subject)}\u241f${norm(topic)}`;

let bank = [];
let bankLoaded = false;
let loadingBank = null;
let scheduled = false;
let patching = false;

function uniqueItems() {
  const seen = new Set();
  return items
    .map((item, index) => ({
      id: item.id || `${item.subject || ''}:${item.title || ''}:${index}`,
      subject: item.subject || 'Conhecimentos Específicos',
      title: item.title || 'Conteúdo do edital',
      order: Number.isFinite(item.order) ? item.order : index
    }))
    .filter(item => {
      const key = topicKey(item.subject, item.title);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.subject.localeCompare(b.subject, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'));
}

function loadBank() {
  if (bankLoaded) return Promise.resolve(bank);
  if (loadingBank) return loadingBank;
  if (typeof C.bankLoader !== 'function') {
    bankLoaded = true;
    bank = [];
    return Promise.resolve(bank);
  }
  loadingBank = Promise.resolve(C.bankLoader())
    .then(data => {
      bank = Array.isArray(data) ? data : [];
      bankLoaded = true;
      return bank;
    })
    .catch(error => {
      console.warn('[Questões] não foi possível contar o banco por edital', error);
      bank = [];
      bankLoaded = true;
      return bank;
    });
  return loadingBank;
}

function buildCounts() {
  const bySubject = new Map();
  const byTopic = new Map();
  for (const q of bank) {
    const subject = q.disciplina || 'Conhecimentos Específicos';
    const topic = q.assunto || 'Sem assunto';
    bySubject.set(subject, (bySubject.get(subject) || 0) + 1);
    byTopic.set(topicKey(subject, topic), (byTopic.get(topicKey(subject, topic)) || 0) + 1);
  }
  return { bySubject, byTopic };
}

function ensureStyle() {
  if (document.getElementById('np-question-syllabus-style')) return;
  const style = document.createElement('style');
  style.id = 'np-question-syllabus-style';
  style.textContent = '.list-row.syllabus-zero b{color:#98a5b2}.list-row.syllabus-zero .btn[disabled]{opacity:.55;cursor:not-allowed}.list-row .topic-subject{display:block;color:#98a5b2;font-size:12px;margin-top:3px}.select option.zero-count{color:#98a5b2}';
  document.head.appendChild(style);
}

function render() {
  if (patching) return;
  const section = document.getElementById('questions');
  const select = document.getElementById('disc');
  const list = document.getElementById('topicList');
  if (!section || !section.classList.contains('active') || !select || !list) return;

  const syllabus = uniqueItems();
  const { bySubject, byTopic } = buildCounts();
  const subjectOrder = [];
  const subjectSet = new Set();
  for (const item of syllabus) {
    if (!subjectSet.has(item.subject)) {
      subjectSet.add(item.subject);
      subjectOrder.push(item.subject);
    }
  }
  for (const q of bank) {
    const subject = q.disciplina || 'Conhecimentos Específicos';
    if (!subjectSet.has(subject)) {
      subjectSet.add(subject);
      subjectOrder.push(subject);
    }
  }

  const previous = select.value || '';
  const selectSignature = subjectOrder.map(subject => `${subject}:${bySubject.get(subject) || 0}`).join('|');
  patching = true;
  if (select.dataset.syllabusSignature !== selectSignature) {
    select.innerHTML = '<option value="">Todas as disciplinas</option>' + subjectOrder.map(subject => {
      const count = bySubject.get(subject) || 0;
      const zeroClass = count ? '' : ' class="zero-count"';
      return `<option value="${esc(subject)}"${zeroClass}>${esc(subject)} (${count})</option>`;
    }).join('');
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    select.dataset.syllabusSignature = selectSignature;
    if (!select.dataset.syllabusListener) {
      select.addEventListener('change', schedule);
      select.dataset.syllabusListener = '1';
    }
  }

  const selected = select.value || '';
  const visible = syllabus.filter(item => !selected || item.subject === selected);
  const listSignature = `${selected}|${visible.map(item => `${item.subject}:${item.title}:${byTopic.get(topicKey(item.subject, item.title)) || 0}`).join('|')}`;
  if (list.dataset.syllabusSignature !== listSignature) {
    list.innerHTML = visible.map(item => {
      const count = byTopic.get(topicKey(item.subject, item.title)) || 0;
      const label = count === 1 ? '1 questão' : `${count} questões`;
      const disabled = count ? '' : ' disabled title="Ainda sem questões publicadas"';
      const subjectHint = selected ? '' : `<span class="topic-subject">${esc(item.subject)}</span>`;
      return `<div class="list-row ${count ? '' : 'syllabus-zero'}"><b>${esc(item.title)}${subjectHint}</b><span class="muted">${label}</span><button class="btn secondary np-topic-train" data-topic="${esc(item.title)}"${disabled}>${count ? 'Treinar' : 'Sem questões'}</button></div>`;
    }).join('') || '<div class="empty">Nenhum item de edital cadastrado.</div>';
    list.dataset.syllabusSignature = listSignature;
    list.querySelectorAll('.np-topic-train:not([disabled])').forEach(button => {
      button.addEventListener('click', () => {
        if (typeof window.studyTopic === 'function') window.studyTopic(button.dataset.topic || '');
      });
    });
  }
  patching = false;
}

function schedule() {
  if (scheduled || patching) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    loadBank().then(render);
  }, 80);
}

ensureStyle();
loadBank().then(render);
document.addEventListener('click', event => {
  const target = event.target && event.target.closest ? event.target.closest('[data-s="questions"]') : null;
  if (target) schedule();
});
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
