# 넘버 몬스터 어드벤처 (Number Monster Adventure) — 가제

아이와 함께 만드는 3D 어드벤처 + 숫자 놀이 게임입니다.

## 아이가 적어준 원래 아이디어 (2026-09-10)

1. 넘버블럭스랑 포켓몬이 오면 잡아서, 그 잡은 포켓몬이랑 넘버블럭스로 게임을 할 수 있다.
2. 일부 구멍도 뚫려있고, 괴물도 있고, 동굴을 지나서 얼음으로 만들어진 공간이 있게 해주세요.
3. 포켓몬은 저작권 때문에 나중에 3D 이미지 파일을 별도로 올려서 대체할 예정. 지금은 draft 캐릭터로 OK.

## 지금 바로 플레이 (챕터 1 프로토타입)

- 브라우저에서 열기: **https://merrypapa.github.io/number-pokemon/**
- 조작: 방향키/WASD 이동, 스페이스 점프, E 액션. 태블릿에서는 화면 버튼이 나옵니다.
- 할 수 있는 것: 초원 탐험(마을·흙길·연못·산), 하얀 블록 줍기(주운 블록이 숫자블록이 되어 따라옴), 몬스터 3마리(꼬물이·폴짝이·뽀글이) 숫자 맞춰 잡기, 둘이·셋이 구출, 서북쪽 아레나의 거대 보스 쿵쿵이(10) 잡기, 큰 구멍에 빠져보기.

로컬에서 실행하려면 저장소 폴더에서 정적 서버를 하나 띄우면 됩니다(빌드 없음).

```
python3 -m http.server 8000
# 그 다음 브라우저에서 http://localhost:8000 열기
```

코드 구조:

| 경로 | 내용 |
|------|------|
| `index.html`, `style.css` | 화면(HUD, 잡기 창, 터치 버튼) |
| `src/main.js` | 게임 루프, 상태, 튜토리얼 |
| `src/world.js` | 초원 지형(언덕·구멍·나무·꽃) |
| `src/player.js` | 주인공 이동/점프/구멍 낙하 |
| `src/creatures.js` | `data/creatures.json`의 draftShape로 드래프트 몬스터 생성, 다가오기 AI |
| `src/palette.js` | 숫자별 색 (number-mario 와 동일 팔레트) |
| `src/numberblocks.js` | 숫자블록 친구(숫자별 색·배치·얼굴·팔다리), 파트너 줄지어 따라오기 |
| `src/catch.js` | 잡기 모드(블록 쌓기, 3번 틀리면 원이가 같이 세기) |
| `vendor/three/` | Three.js 0.170 (MIT) 로컬 복사본 |
| `.github/workflows/pages.yml` | main에 푸시하면 GitHub Pages로 자동 배포 |

## 문서 목차

| 문서 | 내용 |
|------|------|
| [docs/01_game_overview.md](docs/01_game_overview.md) | 게임 구성: 장르, 핵심 루프, 조작, 화면 흐름 |
| [docs/02_storyline.md](docs/02_storyline.md) | 스토리라인: 세계관, 챕터별 이야기, 엔딩 |
| [docs/03_world_and_levels.md](docs/03_world_and_levels.md) | 컨텐츠: 4개 지역(구멍 들판, 괴물 동굴, 얼음 궁전 등)과 레벨 구성 |
| [docs/04_characters.md](docs/04_characters.md) | 캐릭터: 주인공, 숫자블록 친구들, 드래프트 몬스터, 괴물(적) |
| [docs/05_minigames.md](docs/05_minigames.md) | 잡은 몬스터 + 숫자블록으로 하는 미니게임 모음 |
| [docs/06_dev_plan_and_assets.md](docs/06_dev_plan_and_assets.md) | 개발 계획, 기술 스택 제안, 3D 파일 교체 방법 |

## 데이터 파일

| 파일 | 내용 |
|------|------|
| [data/creatures.json](data/creatures.json) | 드래프트 몬스터 목록 (3D 모델 파일명, 출현 지역, 좋아하는 숫자) |
| [data/numberblocks.json](data/numberblocks.json) | 숫자블록 친구 1~10 정보 |
| [data/zones.json](data/zones.json) | 지역/레벨 정보 |
| [assets/models/README.md](assets/models/README.md) | 나중에 3D 파일(.glb) 넣는 방법 |

## 저작권 메모

- **포켓몬**: 게임 안의 몬스터는 전부 이 프로젝트에서 새로 만든 드래프트 캐릭터입니다. 나중에 개인용 3D 파일로 교체할 때는 `assets/models/`에 넣고 `data/creatures.json`의 `model` 값만 바꾸면 됩니다.
- **넘버블럭스(Numberblocks)**: BBC/Alphablocks Ltd 의 상표·캐릭터입니다. 이 프로젝트의 "숫자블록" 친구들은 number-mario 프로젝트와 같은 자체 팔레트(`src/palette.js`)와 코드로 그린 자체 디자인이며, 원작의 이미지·모델 파일은 쓰지 않습니다. 집에서 아이와 즐기는 개인 프로젝트로는 문제 없지만, 공개 배포 시에는 이름과 디자인이 원작과 겹치지 않게 유지해 주세요.
