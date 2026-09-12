// 저장/불러오기. 브라우저 localStorage 에 유저 이름별로 남는다 (브라우저를 닫았다 열어도 유지, 같은 기기·같은 브라우저에서).
const KEY = 'number-pokemon-saves-v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (_) { return false; }
}

/** 저장된 유저 목록 (최근 저장 순) */
export function listSaves() {
  return Object.values(readAll()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
export function loadSave(name) { return readAll()[name] || null; }
export function saveGame(data) {
  const all = readAll();
  all[data.name] = data;
  return writeAll(all);
}
export function deleteSave(name) {
  const all = readAll();
  delete all[name];
  return writeAll(all);
}
export function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
