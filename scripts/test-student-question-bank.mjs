import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../course-access.js', import.meta.url), 'utf8');
const start = source.indexOf('async function fetchAllQuestionPages(');
const end = source.indexOf('async function configureDashboard(', start);
assert(start >= 0 && end > start, 'Pagination helper not found');
const load = new Function('console', source.slice(start, end) + ';return fetchAllQuestionPages;')({warn() {}});
function clientFor(size, {cap = 500, missingV2 = false, errorAt = null, code = 'NETWORK', repeat = false} = {}) {
  const rows = Array.from({length: size}, (_,i) => ({id: String(i).padStart(6,'0'), content_items: [{id:'topic-'+i%7}]}));
  const calls = [];
  return {calls, rpc(name, args) {
    assert.deepEqual(args, {p_course_id: 1, p_preparation_id: 'sap'});
    return {order(column, options) {
      assert.equal(column, 'id');
      assert.equal(options.ascending, true);
      return {async range(from, to) {
        calls.push({name, from, to});
        if (missingV2 && name.endsWith('_v2')) return {error:{code:'PGRST202'}};
        if (errorAt !== null && from >= errorAt) return {error:{code}};
        const offset = repeat ? 0 : from;
        return {data: rows.slice(offset, offset + Math.min(cap, to-from+1)), error:null};
      }};
    }};
  }};
}
let checks = 0;
for (const cap of [500, 37]) {
  const client = clientFor(1939, {cap});
  const bank = await load(client, 1, 'sap');
  assert.equal(bank.length, 1939);
  assert.equal(new Set(bank.map(row=>row.id)).size, 1939);
  assert(bank.every(row=>row.contentItems.length===1), 'Syllabus links must survive pagination');
  checks++;
}
for (const size of [0, 500]) {
  const bank = await load(clientFor(size), 1, 'sap');
  assert.equal(bank.length, size);
  checks++;
}
assert.equal((await load(clientFor(777,{missingV2:true,cap:200}),1,'sap')).length,777);
checks++;
for (const code of ['42501','NETWORK']) {
  const client=clientFor(1000,{errorAt:500,code});
  await assert.rejects(()=>load(client,1,'sap'),error=>error.code===code);
  assert(!client.calls.some(call=>call.name==='load_student_question_bank'), 'Do not hide access/network errors with fallback');
  checks++;
}
await assert.rejects(()=>load(clientFor(5,{repeat:true}),1,'sap'),/Paginação inconsistente/);
checks++;
console.log('OK: '+checks+' pagination regression scenarios; full bank and syllabus links preserved.');
