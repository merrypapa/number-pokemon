// 숫자별 색 단일 출처. number-mario 프로젝트의 src/render/palette.ts 와 같은 값을 쓴다.
export const NUMBER_COLORS = {
  1: { name: '원이', base: '#e8453c', light: '#ff7d70', dark: '#a52a24' },
  2: { name: '둘이', base: '#f2872f', light: '#ffb26a', dark: '#ad5a15' },
  3: { name: '셋이', base: '#f7cf3e', light: '#ffe98a', dark: '#b8930f' },
  4: { name: '넷이', base: '#57b947', light: '#8fe07f', dark: '#2f7d25' },
  5: { name: '다섯이', base: '#3fb8e8', light: '#87dcff', dark: '#1d7ba6' },
  6: { name: '여섯이', base: '#3557c9', light: '#7288f0', dark: '#1e3383' },
  7: { name: '일곱이', base: '#8c4fd0', light: '#bd8bf5', dark: '#5b2b91' },
  8: { name: '여덟이', base: '#ee5fa7', light: '#ff9ac9', dark: '#a83370' },
  9: { name: '아홉이', base: '#1fb8a4', light: '#66e6d3', dark: '#0f7b6d' },
  10: { name: '열이', base: '#e8453c', light: '#ff7d70', dark: '#a52a24', alt: '#f4f4f8' },
};

export const OUTLINE = '#20232e';

/** 일곱이의 블록은 아래부터 무지개 순서 */
export const RAINBOW = ['#e8453c', '#f2872f', '#f7cf3e', '#57b947', '#3fb8e8', '#3557c9', '#8c4fd0'];

/** 블록 n개를 쌓았을 때의 색 (잡기 화면, HUD 등에서 사용). 10 넘으면 10 색. */
export function colorForCount(n) {
  if (n <= 0) return '#ffffff';
  return (NUMBER_COLORS[Math.min(n, 10)] || NUMBER_COLORS[10]).base;
}
