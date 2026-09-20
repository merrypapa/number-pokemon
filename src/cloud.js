import { CLOUD_CONFIG } from './cloud-config.js';

// 클라우드 계정: 이름 + 6자리 비밀번호로 계정을 만들고, 진행을 클라우드에 저장해 어느 기기에서든 이어 한다. 친구를 이름으로 추가하면 친구의 도감·정복 상황이 보인다.
// 뒤에서는 Firebase(Authentication 이메일/비밀번호 + Firestore)를 쓴다. 이름은 `<이름>@np-kids.app` 이라는 가짜 이메일로 바뀐다(아이들은 이메일이 없으니까).
// 설정(src/cloud-config.js)이 비어 있으면 enabled=false 로, 게임은 이 기기 저장만 쓴다. 주소에 ?mockcloud 를 붙이면 브라우저 안에서만 도는 가짜 백엔드로 화면을 시험할 수 있다.
//
// Firestore 구조:
//   profiles/{uid}   { name, nameLower, caught, dexCount, conquered, blocks, leaderId, leaderName, zone, week, wk, wkScore, updatedAt }  ← 로그인한 누구나 읽음 (친구 찾기·친구 목록·친구 순위)
//   leaderboard/{주}  { entries: { uid: { n(가린 이름), s(점수), q, c, b, l, t } } }  ← 누구나 읽음(처음 화면 순위), 각자 자기 항목만 씀
//   duels/{id}        { players:[a,b], a, b, names, mons:{a,b}, state, turn, log, winner, rewarded, createdAt, updatedAt }  ← 친구 대결(우편 대결), 두 사람만 읽고 씀 (src/duel.js)
//   Realtime Database presence/{uid} { name, zone, x, y, z, f(방향), l(대표 id), m(움직임), e/et(감정 표현), at }  ← 같이 놀기: 같은 지역의 친구 보이기 (database.rules.json)
//   saves/{uid}      { name, savedAt, data(JSON 문자열) }                                                              ← 본인만
//   friends/{uid}/list/{friendUid} { addedAt }                                                                       ← 본인만 (수락한 쪽이 상대 목록에도 넣는다: 규칙이 요청이 있을 때만 허용)
//   requests/{toUid}/list/{fromUid} { fromName, at }  친구 요청. 받은 사람이 수락하면 양쪽 friends 에 들어가고 요청은 지워진다
//   feedback/{id}       { uid, name, text, mime, data(base64, ≤600KB 원본), at, reply, repliedAt }  ← 아이가 개발자에게 보내는 요청(글·목소리·사진). 본인과 관리자만 읽고, 답장은 관리자만
//   profiles/{uid}.admin = true 는 Firebase 콘솔에서만 켠다(규칙이 막는다) → 그 계정은 관리자 모드(모든 지역·모든 포켓몬·관리자 탭)
const FIREBASE_VER = '10.14.1';
const EMAIL_DOMAIN = 'np-kids.app';
const nameKey = (name) => name.trim().toLowerCase();
const toEmail = (name) => `${encodeURIComponent(nameKey(name)).replace(/%/g, 'x')}@${EMAIL_DOMAIN}`;
const toPassword = (pin) => `pin-${pin}-npk`;

export function validName(name) { const n = (name || '').trim(); return n.length >= 2 && n.length <= 8 && !/[\s@/\\]/.test(n); }
export function validPin(pin) { return /^\d{6}$/.test(pin || ''); }

const KO = {
  'auth/email-already-in-use': '이미 있는 이름이에요. 다른 이름을 골라 주세요.',
  'auth/invalid-credential': '이름이나 비밀번호가 틀렸어요.',
  'auth/wrong-password': '비밀번호가 틀렸어요.',
  'auth/user-not-found': '그 이름의 계정이 없어요. 새 계정을 만들어 주세요.',
  'auth/too-many-requests': '너무 많이 시도했어요. 잠시 뒤에 다시 해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'permission-denied': '권한이 없어요 (firestore.rules 를 확인해 주세요).',
};
function koError(e) { return KO[e?.code] || e?.message || '알 수 없는 오류'; }

/** ---------- Firebase 백엔드 ---------- */
class FirebaseBackend {
  constructor(cfg) { this.cfg = cfg; }
  async init(onUser) {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VER}`;
    const [app, auth, fs, rt] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`), import(`${base}/firebase-database.js`).catch(() => null)]);
    this.A = auth; this.F = fs; this.D = rt;
    this.app = app.initializeApp(this.cfg);
    this.auth = auth.getAuth(this.app);
    this.db = fs.getFirestore(this.app);
    // 같이 놀기: Realtime Database (databaseURL 이 있을 때만). 못 열면 presence 없이 논다
    try { this.rtdb = rt && this.cfg.databaseURL ? rt.getDatabase(this.app) : null; } catch (e) { console.warn('[cloud] Realtime Database 없음', e); this.rtdb = null; }
    auth.onAuthStateChanged(this.auth, async (u) => {
      if (!u) return onUser(null);
      const prof = await this.getDoc('profiles', u.uid);
      onUser({ uid: u.uid, name: prof?.name || u.displayName || '?', admin: !!prof?.admin });
    });
  }
  async getDoc(col, id) { const s = await this.F.getDoc(this.F.doc(this.db, col, id)); return s.exists() ? s.data() : null; }
  async signUp(name, pin) {
    try {
      const cred = await this.A.createUserWithEmailAndPassword(this.auth, toEmail(name), toPassword(pin));
      await this.A.updateProfile(cred.user, { displayName: name.trim() });
      await this.F.setDoc(this.F.doc(this.db, 'profiles', cred.user.uid), { name: name.trim(), nameLower: nameKey(name), caught: 0, dexCount: 0, conquered: 0, blocks: 0, leaderId: null, leaderName: null, zone: 'forest', updatedAt: Date.now() });
      return { uid: cred.user.uid, name: name.trim() };
    } catch (e) { throw new Error(koError(e)); }
  }
  async signIn(name, pin) {
    try { const cred = await this.A.signInWithEmailAndPassword(this.auth, toEmail(name), toPassword(pin)); const prof = await this.getDoc('profiles', cred.user.uid); return { uid: cred.user.uid, name: prof?.name || name.trim(), admin: !!prof?.admin }; }
    catch (e) { throw new Error(koError(e)); }
  }
  async signOut() { await this.A.signOut(this.auth); }
  async saveGame(uid, data, summary) {
    try {
      await this.F.setDoc(this.F.doc(this.db, 'saves', uid), { name: data.name, savedAt: data.savedAt, data: JSON.stringify(data) });
      const { rank, ...prof } = summary;
      await this.F.setDoc(this.F.doc(this.db, 'profiles', uid), { ...prof, nameLower: nameKey(summary.name), updatedAt: Date.now() }, { merge: true });
      // 주간 순위: leaderboard/{주} 문서의 entries.{uid} 에 내 항목만 갱신 (규칙이 남의 항목은 못 건드리게 막는다)
      if (rank && summary.week) await this.F.setDoc(this.F.doc(this.db, 'leaderboard', summary.week), { entries: { [uid]: rank } }, { merge: true });
    } catch (e) { throw new Error(koError(e)); }
  }
  async loadGame(uid) { const d = await this.getDoc('saves', uid); return d ? JSON.parse(d.data) : null; }
  // ----- 같이 놀기: presence/{uid} -----
  get presenceOk() { return !!this.rtdb; }
  async setPresence(uid, data) {
    if (!this.rtdb) return;
    const r = this.D.ref(this.rtdb, `presence/${uid}`);
    if (!this.presenceArmed) { this.presenceArmed = true; try { await this.D.onDisconnect(r).remove(); } catch (_) {} } // 접속이 끊기면 서버가 지운다
    await this.D.set(r, { ...data, at: this.D.serverTimestamp() });
  }
  async clearPresence(uid) { if (this.rtdb) { try { await this.D.remove(this.D.ref(this.rtdb, `presence/${uid}`)); } catch (_) {} } }
  // ----- 친구 대결: duels/{id} (players 배열에 두 uid) -----
  async createDuel(doc) { const r = await this.F.addDoc(this.F.collection(this.db, 'duels'), doc); return r.id; }
  /** 내가 낀 대결 문서들을 구독한다 (목록 통째로). 돌려주는 함수로 끊는다 */
  watchDuels(uid, cb) {
    const q = this.F.query(this.F.collection(this.db, 'duels'), this.F.where('players', 'array-contains', uid));
    return this.F.onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn('[duel]', e); cb([]); });
  }
  /** 문서를 읽어 fn(doc) 이 돌려준 값으로 덮어쓴다 (트랜잭션: 둘이 동시에 눌러도 한 번만). fn 이 null 이면 아무것도 안 한다 */
  async duelTx(id, fn) {
    const ref = this.F.doc(this.db, 'duels', id);
    return this.F.runTransaction(this.db, async (tx) => { const s = await tx.get(ref); if (!s.exists()) return false; const patch = fn({ id, ...s.data() }); if (!patch) return false; tx.update(ref, patch); return true; });
  }
  async deleteDuel(id) { try { await this.F.deleteDoc(this.F.doc(this.db, 'duels', id)); } catch (_) {} }
  /** 친구 한 명의 presence 를 구독한다. 돌려주는 함수로 구독을 끊는다 */
  watchPresence(uid, cb) { if (!this.rtdb) return () => {}; return this.D.onValue(this.D.ref(this.rtdb, `presence/${uid}`), (s) => cb(s.val()), () => cb(null)); }
  /** 그 주의 순위표 항목들 (로그인 없이도 읽힌다) */
  async loadLeaderboard(week) { const d = await this.getDoc('leaderboard', week); return Object.entries(d?.entries || {}).map(([uid, e]) => ({ uid, ...e })); }
  async findProfile(name) {
    const q = this.F.query(this.F.collection(this.db, 'profiles'), this.F.where('nameLower', '==', nameKey(name)), this.F.limit(1));
    const s = await this.F.getDocs(q);
    return s.empty ? null : { uid: s.docs[0].id, ...s.docs[0].data() };
  }
  async listFriends(uid) {
    const s = await this.F.getDocs(this.F.collection(this.db, 'friends', uid, 'list'));
    const out = [];
    for (const d of s.docs) { const p = await this.getDoc('profiles', d.id); if (p) out.push({ uid: d.id, ...p }); }
    return out;
  }
  async isFriend(uid, fid) { const d = await this.F.getDoc(this.F.doc(this.db, 'friends', uid, 'list', fid)); return d.exists(); }
  async removeFriend(uid, fid) { await this.F.deleteDoc(this.F.doc(this.db, 'friends', uid, 'list', fid)); }
  async sendRequest(me, toUid) {
    try { await this.F.setDoc(this.F.doc(this.db, 'requests', toUid, 'list', me.uid), { fromName: me.name, at: Date.now() }); } catch (e) { throw new Error(koError(e)); }
  }
  async hasRequest(me, toUid) { const d = await this.F.getDoc(this.F.doc(this.db, 'requests', toUid, 'list', me.uid)); return d.exists(); }
  async listRequests(uid) { const s = await this.F.getDocs(this.F.collection(this.db, 'requests', uid, 'list')); return s.docs.map((d) => ({ uid: d.id, ...d.data() })); }
  async acceptRequest(uid, fromUid) {
    try {
      await this.F.setDoc(this.F.doc(this.db, 'friends', fromUid, 'list', uid), { addedAt: Date.now() }); // 요청이 남아 있는 동안만 규칙이 허용한다 → 먼저
      await this.F.setDoc(this.F.doc(this.db, 'friends', uid, 'list', fromUid), { addedAt: Date.now() });
      await this.F.deleteDoc(this.F.doc(this.db, 'requests', uid, 'list', fromUid));
    } catch (e) { throw new Error(koError(e)); }
  }
  async declineRequest(uid, fromUid) { await this.F.deleteDoc(this.F.doc(this.db, 'requests', uid, 'list', fromUid)); }
  async sendFeedback(item) { try { const r = await this.F.addDoc(this.F.collection(this.db, 'feedback'), item); return r.id; } catch (e) { throw new Error(koError(e)); } }
  async listMyFeedback(uid) { const s = await this.F.getDocs(this.F.query(this.F.collection(this.db, 'feedback'), this.F.where('uid', '==', uid))); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
  async listAllFeedback() { try { const s = await this.F.getDocs(this.F.query(this.F.collection(this.db, 'feedback'), this.F.orderBy('at', 'desc'), this.F.limit(100))); return s.docs.map((d) => ({ id: d.id, ...d.data() })); } catch (e) { throw new Error(koError(e)); } }
  async replyFeedback(id, reply) { try { await this.F.updateDoc(this.F.doc(this.db, 'feedback', id), { reply, repliedAt: Date.now() }); } catch (e) { throw new Error(koError(e)); } }
  async deleteFeedback(id) { try { await this.F.deleteDoc(this.F.doc(this.db, 'feedback', id)); } catch (e) { throw new Error(koError(e)); } }
}

/** ---------- 가짜 백엔드 (브라우저 localStorage, ?mockcloud 로 화면 시험용) ---------- */
class MockBackend {
  constructor() { this.key = 'np-cloud-mock'; }
  read() { try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (_) { return {}; } }
  write(db) { localStorage.setItem(this.key, JSON.stringify(db)); }
  async init(onUser) { this.onUser = onUser; const uid = sessionStorage.getItem('np-cloud-mock-uid'); const db = this.read(); onUser(uid && db.profiles?.[uid] ? { uid, name: db.profiles[uid].name, admin: !!db.profiles[uid].admin } : null); }
  async signUp(name, pin) {
    const db = this.read(); db.users ||= {}; db.profiles ||= {};
    const k = nameKey(name); if (db.users[k]) throw new Error(KO['auth/email-already-in-use']);
    const uid = 'u' + Math.random().toString(36).slice(2, 10);
    db.users[k] = { uid, pin }; db.profiles[uid] = { name: name.trim(), nameLower: k, caught: 0, dexCount: 0, conquered: 0, blocks: 0, leaderId: null, leaderName: null, zone: 'forest', updatedAt: Date.now() };
    this.write(db); sessionStorage.setItem('np-cloud-mock-uid', uid);
    return { uid, name: name.trim() };
  }
  async signIn(name, pin) {
    const db = this.read(); const u = db.users?.[nameKey(name)];
    if (!u) throw new Error(KO['auth/user-not-found']); if (u.pin !== pin) throw new Error(KO['auth/wrong-password']);
    sessionStorage.setItem('np-cloud-mock-uid', u.uid); return { uid: u.uid, name: db.profiles[u.uid].name, admin: !!db.profiles[u.uid].admin };
  }
  async signOut() { sessionStorage.removeItem('np-cloud-mock-uid'); this.onUser?.(null); }
  async saveGame(uid, data, summary) {
    const db = this.read(); db.saves ||= {}; db.saves[uid] = { name: data.name, savedAt: data.savedAt, data: JSON.stringify(data) };
    const { rank, ...prof } = summary;
    db.profiles[uid] = { ...db.profiles[uid], ...prof, nameLower: nameKey(summary.name), updatedAt: Date.now() };
    if (rank && summary.week) { db.leaderboard ||= {}; db.leaderboard[summary.week] ||= { entries: {} }; db.leaderboard[summary.week].entries[uid] = rank; }
    this.write(db);
  }
  async loadGame(uid) { const d = this.read().saves?.[uid]; return d ? JSON.parse(d.data) : null; }
  // presence: localStorage 의 다른 키에 (같은 브라우저의 다른 탭끼리 보인다)
  get presenceOk() { return true; }
  readPresence() { try { return JSON.parse(localStorage.getItem('np-cloud-mock-presence') || '{}'); } catch (_) { return {}; } }
  async setPresence(uid, data) { const all = this.readPresence(); all[uid] = { ...data, at: Date.now() }; localStorage.setItem('np-cloud-mock-presence', JSON.stringify(all)); }
  async clearPresence(uid) { const all = this.readPresence(); delete all[uid]; localStorage.setItem('np-cloud-mock-presence', JSON.stringify(all)); }
  watchPresence(uid, cb) { let last = ''; const tick = () => { const v = this.readPresence()[uid] || null; const j = JSON.stringify(v); if (j !== last) { last = j; cb(v); } }; tick(); const id = setInterval(tick, 250); return () => clearInterval(id); }
  async loadLeaderboard(week) { return Object.entries(this.read().leaderboard?.[week]?.entries || {}).map(([uid, e]) => ({ uid, ...e })); }
  async createDuel(doc) { const db = this.read(); db.duels ||= {}; const id = 'd' + Math.random().toString(36).slice(2, 10); db.duels[id] = doc; this.write(db); return id; }
  watchDuels(uid, cb) { let last = ''; const tick = () => { const all = this.read().duels || {}; const list = Object.entries(all).filter(([, d]) => (d.players || []).includes(uid)).map(([id, d]) => ({ id, ...d })); const j = JSON.stringify(list); if (j !== last) { last = j; cb(list); } }; tick(); const t = setInterval(tick, 500); return () => clearInterval(t); }
  async duelTx(id, fn) { const db = this.read(); const d = db.duels?.[id]; if (!d) return false; const patch = fn({ id, ...d }); if (!patch) return false; Object.assign(d, patch); this.write(db); return true; }
  async deleteDuel(id) { const db = this.read(); if (db.duels) delete db.duels[id]; this.write(db); }
  async findProfile(name) { const db = this.read(); const u = db.users?.[nameKey(name)]; return u ? { uid: u.uid, ...db.profiles[u.uid] } : null; }
  async listFriends(uid) { const db = this.read(); return (db.friends?.[uid] || []).map((fid) => ({ uid: fid, ...db.profiles[fid] })).filter((p) => p.name); }
  addPair(db, a, b) { db.friends ||= {}; db.friends[a] ||= []; if (!db.friends[a].includes(b)) db.friends[a].push(b); }
  async isFriend(uid, fid) { return (this.read().friends?.[uid] || []).includes(fid); }
  async removeFriend(uid, fid) { const db = this.read(); db.friends ||= {}; db.friends[uid] = (db.friends[uid] || []).filter((x) => x !== fid); this.write(db); }
  async sendRequest(me, toUid) { const db = this.read(); db.requests ||= {}; db.requests[toUid] ||= {}; db.requests[toUid][me.uid] = { fromName: me.name, at: Date.now() }; this.write(db); }
  async hasRequest(me, toUid) { return !!this.read().requests?.[toUid]?.[me.uid]; }
  async listRequests(uid) { const r = this.read().requests?.[uid] || {}; return Object.entries(r).map(([k, v]) => ({ uid: k, ...v })); }
  async acceptRequest(uid, fromUid) { const db = this.read(); this.addPair(db, uid, fromUid); this.addPair(db, fromUid, uid); if (db.requests?.[uid]) delete db.requests[uid][fromUid]; this.write(db); }
  async declineRequest(uid, fromUid) { const db = this.read(); if (db.requests?.[uid]) delete db.requests[uid][fromUid]; this.write(db); }
  async sendFeedback(item) { const db = this.read(); db.feedback ||= {}; const id = 'f' + Math.random().toString(36).slice(2, 10); db.feedback[id] = item; this.write(db); return id; }
  async listMyFeedback(uid) { return Object.entries(this.read().feedback || {}).filter(([, v]) => v.uid === uid).map(([id, v]) => ({ id, ...v })); }
  async listAllFeedback() { return Object.entries(this.read().feedback || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at); }
  async replyFeedback(id, reply) { const db = this.read(); if (db.feedback?.[id]) { db.feedback[id].reply = reply; db.feedback[id].repliedAt = Date.now(); this.write(db); } }
  async deleteFeedback(id) { const db = this.read(); if (db.feedback) delete db.feedback[id]; this.write(db); }
}

/** ---------- 게임이 쓰는 얼굴 ---------- */
export const cloud = {
  enabled: false, ready: false, user: null, backend: null, mock: false,
  onUser: () => {}, // (user|null) → main 이 화면을 고친다
  async init() {
    const mock = location.search.includes('mockcloud');
    if (mock) { this.backend = new MockBackend(); this.mock = true; }
    else if (CLOUD_CONFIG.firebase?.apiKey) this.backend = new FirebaseBackend(CLOUD_CONFIG.firebase);
    else return false;
    this.enabled = true;
    try { await this.backend.init((u) => { this.user = u; this.ready = true; this.onUser(u); }); }
    catch (e) { console.warn('[cloud] 초기화 실패', e); this.enabled = false; return false; }
    return true;
  },
  /** 로그인 상태가 복원될 때까지(처음 onAuthStateChanged) 기다린다. 처음 화면이 Firebase 보다 먼저 떠서, 시작하기를 바로 누르면 로그인돼 있어도 모를 수 있다 */
  waitReady(ms = 8000) {
    if (!this.enabled || this.ready) return Promise.resolve(this.ready);
    return new Promise((res) => { const t0 = Date.now(); const tick = () => { if (this.ready) res(true); else if (Date.now() - t0 > ms) res(false); else setTimeout(tick, 100); }; tick(); });
  },
  async signUp(name, pin) { const u = await this.backend.signUp(name, pin); this.user = u; this.onUser(u); return u; },
  async signIn(name, pin) { const u = await this.backend.signIn(name, pin); this.user = u; this.onUser(u); return u; },
  async signOut() { await this.backend.signOut(); this.user = null; this.onUser(null); },
  /** 내 계정 이름으로 된 진행만 클라우드에 올린다 */
  async saveGame(data, summary) { if (!this.user || nameKey(data.name) !== nameKey(this.user.name)) return false; await this.backend.saveGame(this.user.uid, data, summary); return true; },
  async loadGame() { return this.user ? this.backend.loadGame(this.user.uid) : null; },
  // ----- 같이 놀기 (presence) -----
  get presenceOn() { return !!(this.user && this.backend?.presenceOk); },
  async setPresence(data) { if (this.presenceOn) await this.backend.setPresence(this.user.uid, { name: this.user.name, ...data }); },
  async clearPresence() { if (this.user && this.backend?.presenceOk) await this.backend.clearPresence(this.user.uid); },
  watchPresence(uid, cb) { return this.backend?.presenceOk ? this.backend.watchPresence(uid, cb) : () => {}; },
  // ----- 친구 대결 -----
  /** 친구에게 대결 신청: 내 대표 포켓몬 모습(mon)을 넣어 문서를 만든다 */
  async createDuel(friend, mon) {
    if (!this.user) throw new Error('먼저 로그인해 주세요');
    const me = this.user;
    return this.backend.createDuel({ players: [me.uid, friend.uid], a: me.uid, b: friend.uid, names: { a: me.name, b: friend.name }, mons: { a: mon, b: null }, state: 'pending', turn: 'b', log: [], winner: null, rewarded: {}, createdAt: Date.now(), updatedAt: Date.now() });
  },
  watchDuels(cb) { return this.user ? this.backend.watchDuels(this.user.uid, cb) : () => {}; },
  async duelTx(id, fn) { return this.backend.duelTx(id, fn); },
  async deleteDuel(id) { return this.backend.deleteDuel(id); },
  /** 이번 주 전체 순위 항목들 (가린 이름). 로그인 전에도 된다 */
  async leaderboard(week) { return this.enabled ? this.backend.loadLeaderboard(week) : []; },
  async listFriends() { return this.user ? this.backend.listFriends(this.user.uid) : []; },
  /** 친구 요청: 상대가 수락해야 서로 친구가 된다 */
  async requestFriend(name) {
    if (!this.user) throw new Error('먼저 로그인해 주세요');
    const p = await this.backend.findProfile(name);
    if (!p) throw new Error('그 이름의 친구를 찾지 못했어요. 이름을 정확히 적어 주세요.');
    if (p.uid === this.user.uid) throw new Error('나 자신은 친구로 추가할 수 없어요.');
    if (await this.backend.isFriend(this.user.uid, p.uid)) throw new Error(`${p.name}은(는) 이미 친구예요.`);
    if (await this.backend.hasRequest(this.user, p.uid)) throw new Error(`${p.name}에게 이미 요청을 보냈어요. 수락을 기다려 주세요.`);
    await this.backend.sendRequest(this.user, p.uid);
    return p;
  },
  async listRequests() { return this.user ? this.backend.listRequests(this.user.uid) : []; },
  /** 개발자에게 요청 보내기: text 와 (선택) mime+data(base64). data 는 원본 600KB 까지 */
  async sendFeedback({ text = '', mime = null, data = null } = {}) {
    if (!this.user) throw new Error('먼저 로그인해 주세요');
    if (!text.trim() && !data) throw new Error('글을 적거나 목소리·사진을 붙여 주세요');
    if (data && data.length > 820000) throw new Error('파일이 너무 커요 (사진은 더 작게, 목소리는 30초 안으로)');
    return this.backend.sendFeedback({ uid: this.user.uid, name: this.user.name, text: text.trim().slice(0, 1000), mime, data, at: Date.now(), reply: null, repliedAt: null });
  },
  async listMyFeedback() { return this.user ? this.backend.listMyFeedback(this.user.uid) : []; },
  async listAllFeedback() { return this.backend.listAllFeedback(); },
  async replyFeedback(id, reply) { return this.backend.replyFeedback(id, reply); },
  async deleteFeedback(id) { return this.backend.deleteFeedback(id); },
  async acceptRequest(fromUid) { if (this.user) await this.backend.acceptRequest(this.user.uid, fromUid); },
  async declineRequest(fromUid) { if (this.user) await this.backend.declineRequest(this.user.uid, fromUid); },
  async removeFriend(fid) { if (this.user) await this.backend.removeFriend(this.user.uid, fid); },
};
