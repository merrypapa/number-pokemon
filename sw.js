// 서비스 워커 (PWA). 홈 화면에 추가한 뒤 오프라인에서도 열리고, 큰 모델 파일은 한 번 받으면 기기에 남아 다음부터 바로 뜬다.
//  - 앱 껍데기(index.html·style.css·src/*.js·data/*.json·vendor) : 설치 때 미리 받아 두는 캐시 'np-shell-<VERSION>' — 코드를 고칠 때마다 VERSION 을 올린다(그래야 새 버전이 깔린다)
//  - 모델·그림 등 나머지 같은 출처 파일 : 'np-assets-<ASSET_VERSION>' 에 처음 받을 때 넣고 다음부터는 캐시에서 (모델 파일을 바꿔 올렸으면 ASSET_VERSION 을 올린다)
//  - www.gstatic.com 의 Firebase SDK : 'np-vendor' 에 처음 받을 때 넣고 다음부터는 캐시에서 (주소에 버전이 있어 안전)
//  - 그 밖의 다른 출처(Firebase 인증·데이터 서버) : 건드리지 않는다 (네트워크 그대로)
// 새 버전이 설치되면 게임이 "새 버전이 있어요 · 다시 열기" 안내를 띄우고, 누르면 이 워커에게 SKIP_WAITING 을 보내 바로 바꾼다.
const VERSION = 'v2026-09-21-8';
const ASSET_VERSION = '2';
const SHELL = `np-shell-${VERSION}`, ASSETS = `np-assets-${ASSET_VERSION}`, VENDOR = 'np-vendor'; // VENDOR: gstatic 의 Firebase SDK (주소에 버전이 있어 오래 둬도 된다)
const SHELL_FILES = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './data/creatures.json', './data/numberblocks.json', './data/zones.json',
  './vendor/three/three.module.js', './vendor/three/loaders/GLTFLoader.js', './vendor/three/utils/BufferGeometryUtils.js', './vendor/three/utils/SkeletonUtils.js',
  './src/arena.js', './src/balls.js', './src/battle.js', './src/boat.js', './src/car.js', './src/cave.js', './src/cloud-config.js', './src/cloud.js', './src/creatures.js', './src/deepsea.js', './src/dex.js', './src/duel.js', './src/effects.js', './src/hive.js', './src/input.js', './src/intro.js', './src/lab.js', './src/main.js', './src/mega.js', './src/models.js', './src/npc.js', './src/numberblocks.js', './src/palette.js', './src/party.js', './src/planetquiz.js', './src/planets.js', './src/player.js', './src/portrait.js', './src/presence.js', './src/quiz.js', './src/rank.js', './src/save.js', './src/sea.js', './src/space.js', './src/types.js', './src/ufo.js', './src/util.js', './src/view3d.js', './src/volcano.js', './src/world.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // 하나가 실패해도 나머지는 넣는다 (파일 목록이 조금 어긋나도 설치가 막히지 않게)
    await Promise.all(SHELL_FILES.map((f) => c.add(f).catch((err) => console.warn('[sw] 미리 받기 실패', f, err))));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== ASSETS && k !== VENDOR) await caches.delete(k); // 옛 버전 캐시 정리
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) { // Firebase SDK: 한 번 받으면 캐시에서 (시작이 빨라지고 오프라인에서도 로그인 화면까지 뜬다)
    e.respondWith(caches.open(VENDOR).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== location.origin) return; // Firebase 서버(인증·데이터)는 그대로
  const isShell = url.pathname.endsWith('/') || /\.(html|css|js|json|webmanifest)$/.test(url.pathname);
  e.respondWith((async () => {
    const cacheName = isShell ? SHELL : ASSETS;
    const cache = await caches.open(cacheName);
    const hit = await cache.match(req, { ignoreSearch: isShell }); // index.html?debug 같은 쿼리도 같은 껍데기
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (isShell && url.pathname.endsWith('/')) return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
