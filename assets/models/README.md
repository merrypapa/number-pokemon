# assets/models

3D 모델(.glb) 파일을 넣는 폴더입니다. 여기 넣은 `.glb`는 git에 커밋되고 GitHub Pages로 함께 배포됩니다.

## 올리는 방법 (GitHub 웹에서)

1. GitHub 저장소 페이지에서 브랜치를 고른 뒤 이 폴더(`assets/models`)로 들어갑니다.
2. **Add file → Upload files** 로 `.glb` 파일을 끌어다 놓고 **Commit changes**.

## 파일 이름 규칙

| 대상 | 파일 이름 | 연결 방법 |
|------|-----------|-----------|
| 주인공 | `player.glb` | 파일만 넣으면 자동으로 바뀝니다 (`src/player.js`의 `PLAYER_MODEL`) |
| 몬스터 | `data/creatures.json`의 `id`로 시작. 예: `m03_bbogeul.glb` | 그 몬스터의 `"model": null` 을 `"model": "m03_bbogeul.glb"` 로 바꿉니다 |
| 숫자블록 | `nb05_daseot.glb` | (아직 코드 연결 전) |

파일이 없거나 불러오기에 실패하면 자동으로 드래프트 도형이 나오므로 게임이 멈추지 않습니다. 브라우저 콘솔(F12)에 `[models] ... 불러옴` 또는 실패 원인이 찍힙니다.

## 규격

- 높이 약 1m, 원점은 발바닥 중앙, 앞 방향 -Z (glTF 기본). 크기가 달라도 코드에서 높이 1m로 자동 보정하고, 몬스터별 `scale` 값이 그 위에 곱해집니다.
- 애니메이션(선택): 클립 이름을 `idle`, `walk`로 넣으면 서 있을 때/걸을 때 자동 재생됩니다. 이름이 다르면 첫 번째 클립을 계속 재생합니다.
- 폴리곤 1만 이하 권장(태블릿용). 텍스처는 .glb 안에 포함(embedded)해서 내보내세요.
- 자세한 내용은 `docs/06_dev_plan_and_assets.md` 참고.
