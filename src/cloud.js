import { CLOUD_CONFIG } from './cloud-config.js';

// 클라우드 계정: 이름 + 4자리 비밀번호로 계정을 만들고, 진행을 클라우드에 저장해 어느 기기에서든 이어 한다. 친구를 이름으로 추가하면 친구의 도감·정복 상황이 보인다.
// 뒤에서는 Firebase(Authentication 이메일/비밀번호 + Firestore)를 쓴다. 이름은 `<이름>@np-kids.app` 이라는 가짜 이메일로 바뀐다(아이들은 이메일이 없으니까).
// 설정(src/cloud-config.js)이 비어 있으면 enabled=false 로, 게임은 이 기기 저장만 쓴다. 주소에 ?mockcloud 를 붙이면 브라우저 안에서만 도는 가짜 백엔드로 화면을 시험할 수 있다.
//
// Firestore 구조:
//   profiles/{uid}   { name, nameLower, caught, dexCount, conquered, blocks, leaderId, leaderName, zone, updatedAt }  ← 로그인한 누구나 읽음 (친구 찾기·친구 목록)
//   saves/{uid}      { name, savedAt, data(JSON 문자열) }                                                              ← 본인만
//   friends/{uid}/list/{friendUid} { addedAt }                                                                       ← 본인만
const FIREBASE_VER = '10.14.1';
const EMAIL_DOMAIN = 'np-kids.app';
const nameKey = (name) => name.trim().toLowerCase();
const toEmail = (name) => `${encodeURIComponent(nameKey(name)).replace(/%/g, 'x')}@${EMAIL_DOMAIN}`;
const toPassword = (pin) => `pin-${pin}-npk`;

export function validName(name) { const n = (name || '').trim(); return n.length >= 2 && n.length <= 8 && !/[\s@/\\]/.test(n); }
export function validPin(pin) { return /^\d{4}$/.test(pin || ''); }

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
    const [app, auth, fs] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
    this.A = auth; this.F = fs;
    this.app = app.initializeApp(this.cfg);
    this.auth = auth.getAuth(this.app);
    this.db = fs.getFirestore(this.app);
    auth.onAuthStateChanged(this.auth, async (u) => {
      if (!u) return onUser(null);
      const prof = await this.getDoc('profiles', u.uid);
      onUser({ uid: u.uid, name: prof?.name || u.displayName || '?' });
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
    try { const cred = await this.A.signInWithEmailAndPassword(this.auth, toEmail(name), toPassword(pin)); const prof = await this.getDoc('profiles', cred.user.uid); return { uid: cred.user.uid, name: prof?.name || name.trim() }; }
    catch (e) { throw new Error(koError(e)); }
  }
  async signOut() { await this.A.signOut(this.auth); }
  async saveGame(uid, data, summary) {
    try {
      await this.F.setDoc(this.F.doc(this.db, 'saves', uid), { name: data.name, savedAt: data.savedAt, data: JSON.stringify(data) });
      await this.F.setDoc(this.F.doc(this.db, 'profiles', uid), { ...summary, nameLower: nameKey(summary.name), updatedAt: Date.now() }, { merge: true });
    } catch (e) { throw new Error(koError(e)); }
  }
  async loadGame(uid) { const d = await this.getDoc('saves', uid); return d ? JSON.parse(d.data) : null; }
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
  async addFriend(uid, fid) { await this.F.setDoc(this.F.doc(this.db, 'friends', uid, 'list', fid), { addedAt: Date.now() }); }
  async removeFriend(uid, fid) { await this.F.deleteDoc(this.F.doc(this.db, 'friends', uid, 'list', fid)); }
}

/** ---------- 가짜 백엔드 (브라우저 localStorage, ?mockcloud 로 화면 시험용) ---------- */
class MockBackend {
  constructor() { this.key = 'np-cloud-mock'; }
  read() { try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (_) { return {}; } }
  write(db) { localStorage.setItem(this.key, JSON.stringify(db)); }
  async init(onUser) { this.onUser = onUser; const uid = sessionStorage.getItem('np-cloud-mock-uid'); const db = this.read(); onUser(uid && db.profiles?.[uid] ? { uid, name: db.profiles[uid].name } : null); }
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
    sessionStorage.setItem('np-cloud-mock-uid', u.uid); return { uid: u.uid, name: db.profiles[u.uid].name };
  }
  async signOut() { sessionStorage.removeItem('np-cloud-mock-uid'); this.onUser?.(null); }
  async saveGame(uid, data, summary) { const db = this.read(); db.saves ||= {}; db.saves[uid] = { name: data.name, savedAt: data.savedAt, data: JSON.stringify(data) }; db.profiles[uid] = { ...db.profiles[uid], ...summary, nameLower: nameKey(summary.name), updatedAt: Date.now() }; this.write(db); }
  async loadGame(uid) { const d = this.read().saves?.[uid]; return d ? JSON.parse(d.data) : null; }
  async findProfile(name) { const db = this.read(); const u = db.users?.[nameKey(name)]; return u ? { uid: u.uid, ...db.profiles[u.uid] } : null; }
  async listFriends(uid) { const db = this.read(); return (db.friends?.[uid] || []).map((fid) => ({ uid: fid, ...db.profiles[fid] })).filter((p) => p.name); }
  async addFriend(uid, fid) { const db = this.read(); db.friends ||= {}; db.friends[uid] ||= []; if (!db.friends[uid].includes(fid)) db.friends[uid].push(fid); this.write(db); }
  async removeFriend(uid, fid) { const db = this.read(); db.friends ||= {}; db.friends[uid] = (db.friends[uid] || []).filter((x) => x !== fid); this.write(db); }
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
  async signUp(name, pin) { const u = await this.backend.signUp(name, pin); this.user = u; this.onUser(u); return u; },
  async signIn(name, pin) { const u = await this.backend.signIn(name, pin); this.user = u; this.onUser(u); return u; },
  async signOut() { await this.backend.signOut(); this.user = null; this.onUser(null); },
  /** 내 계정 이름으로 된 진행만 클라우드에 올린다 */
  async saveGame(data, summary) { if (!this.user || nameKey(data.name) !== nameKey(this.user.name)) return false; await this.backend.saveGame(this.user.uid, data, summary); return true; },
  async loadGame() { return this.user ? this.backend.loadGame(this.user.uid) : null; },
  async listFriends() { return this.user ? this.backend.listFriends(this.user.uid) : []; },
  async addFriend(name) {
    if (!this.user) throw new Error('먼저 로그인해 주세요');
    const p = await this.backend.findProfile(name);
    if (!p) throw new Error('그 이름의 친구를 찾지 못했어요. 이름을 정확히 적어 주세요.');
    if (p.uid === this.user.uid) throw new Error('나 자신은 친구로 추가할 수 없어요.');
    await this.backend.addFriend(this.user.uid, p.uid);
    return p;
  },
  async removeFriend(fid) { if (this.user) await this.backend.removeFriend(this.user.uid, fid); },
};
