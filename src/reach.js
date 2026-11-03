import { terrainHeight, inHole, isBlocked, insideObstacle, ledgeStep, worldSize } from './world.js';

// 갈 수 있는 땅 찾기: 시작 자리에서 1m 칸으로 걸어서 닿는 곳을 모두 칠한다 (벽·물·기둥·바위 같은 장애물, 뛰어야 오르는 턱은 못 지난다).
// 동굴처럼 기둥·벽이 많은 지역에서 야생 포켓몬 자리가 기둥 뒤 막힌 틈이나 벽 너머에 놓여 주인공이 닿지 못하던 버그를 고친다:
// 닿지 못하는 자리는 가장 가까운 닿는 자리로 옮긴다. 지형 함수는 지금 켜진 지형(setActiveTerrain)을 쓴다.
const CELL = 1.0;

/** 닿는 칸 지도. { seen, hgt, N, S } */
export function reachMap(start) {
  const S = worldSize() / 2, N = Math.ceil((2 * S) / CELL), seen = new Uint8Array(N * N), hgt = new Float32Array(N * N), ledge = ledgeStep();
  const at = (v) => Math.floor((v + S) / CELL), mid = (i) => -S + (i + 0.5) * CELL;
  const si = at(start.x), sj = at(start.z);
  if (si < 0 || sj < 0 || si >= N || sj >= N) return null;
  const stack = [si * N + sj]; seen[si * N + sj] = 1; hgt[si * N + sj] = terrainHeight(start.x, start.z, 0);
  while (stack.length) {
    const k = stack.pop(), i = (k / N) | 0, j = k % N, y = hgt[k];
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const n = a * N + b; if (seen[n]) continue;
      const x = mid(a), z = mid(b), ny = terrainHeight(x, z, y);
      if (ny - y > ledge || isBlocked(x, z, ny) || inHole(x, z) || insideObstacle(x, z, 0.45)) continue;
      seen[n] = 1; hgt[n] = ny; stack.push(n);
    }
  }
  return { seen, hgt, N, S, at, mid };
}
/** 이 자리 둘레(1칸)에 닿는 칸이 있나 */
export function reachable(R, x, z) {
  const i = R.at(x), j = R.at(z);
  for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) if (a >= 0 && b >= 0 && a < R.N && b < R.N && R.seen[a * R.N + b]) return true;
  return false;
}
/** 가장 가까운 닿는 칸의 가운데 (없으면 null). 장애물에서 조금 떨어진 칸(이웃도 닿는 칸)을 고른다 */
export function nearestReachable(R, x, z, maxR = 30) {
  const i0 = R.at(x), j0 = R.at(z), ok = (a, b) => a > 0 && b > 0 && a < R.N - 1 && b < R.N - 1 && R.seen[a * R.N + b] && R.seen[(a + 1) * R.N + b] && R.seen[(a - 1) * R.N + b] && R.seen[a * R.N + b + 1] && R.seen[a * R.N + b - 1];
  for (let r = 1; r <= maxR; r++) {
    let best = null, bd = Infinity;
    for (let a = i0 - r; a <= i0 + r; a++) for (let b = j0 - r; b <= j0 + r; b++) {
      if (Math.max(Math.abs(a - i0), Math.abs(b - j0)) !== r || !ok(a, b)) continue;
      const d = Math.hypot(a - i0, b - j0); if (d < bd) { bd = d; best = [R.mid(a), R.mid(b)]; }
    }
    if (best) return best;
  }
  return null;
}
/** 자리 목록([[x,z]...])에서 닿지 못하는 자리를 가장 가까운 닿는 자리로 옮긴다. 옮긴 개수 */
export function fixSpots(R, list) {
  let n = 0;
  for (const p of list || []) { if (reachable(R, p[0], p[1])) continue; const q = nearestReachable(R, p[0], p[1]); if (q) { p[0] = q[0]; p[1] = q[1]; n++; } }
  return n;
}
