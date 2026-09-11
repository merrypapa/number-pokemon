# 넘버 몬스터 어드벤처 (Number Monster Adventure) — 가제

아이와 함께 만드는 3D 어드벤처 + 숫자 놀이 게임입니다.

## 아이가 적어준 원래 아이디어 (2026-09-10)

1. 넘버블럭스랑 포켓몬이 오면 잡아서, 그 잡은 포켓몬이랑 넘버블럭스로 게임을 할 수 있다.
2. 일부 구멍도 뚫려있고, 괴물도 있고, 동굴을 지나서 얼음으로 만들어진 공간이 있게 해주세요.
3. 포켓몬은 저작권 때문에 나중에 3D 이미지 파일을 별도로 올려서 대체할 예정. 지금은 draft 캐릭터로 OK.

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
- **넘버블럭스(Numberblocks)**: BBC/Alphablocks Ltd 의 상표·캐릭터입니다. 이 프로젝트에서는 "숫자블록"이라는 이름의 자체 캐릭터(정육면체 블록을 쌓은 숫자 친구들)로 만들고, 색과 얼굴 디자인도 원작과 다르게 잡았습니다. 집에서 아이와 즐기는 개인 프로젝트로는 문제 없지만, 공개 배포 시에는 이름과 디자인이 원작과 겹치지 않게 유지해 주세요.
