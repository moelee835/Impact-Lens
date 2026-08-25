# 상용 서비스형 README 개편 계획

## 상태

- 구현 및 검증 완료

## 배경과 해결할 문제

현재 README는 기능과 제약을 상세히 설명하지만 기능 목록이 먼저 길게 이어져 신규 방문자가 제품의 핵심 가치, 설치 방법, Extension·CLI·Codex plugin의 차이를 빠르게 파악하기 어렵다. Hermes Agent README처럼 제품 hero, 신뢰 정보, 가치 제안, 빠른 시작, 기능 표, 문서 허브가 명확한 상용 서비스형 정보 구조로 재구성한다.

기존 Impact Lens 아이콘은 Extension 패키지용 정사각형 아이콘으로는 적합하지만 GitHub README 첫 화면에서 제품 정체성을 전달하는 가로형 hero 역할은 하지 못한다. Impact Lens의 호출 그래프와 렌즈 개념을 결합한 독자적인 배너 로고를 새로 제작한다.

## 참고 자료 조사 결과

- Hermes Agent README는 100% 너비 banner, 중앙 링크·배지, 굵은 가치 제안, 핵심 기능 table, Quick Install, Getting Started, 문서 table 순으로 구성되어 있다.
- 장문의 세부 설명은 뒤로 보내고 첫 화면에서 제품 설명과 설치 진입점을 바로 제공한다.
- Impact Lens는 독립 웹 서비스가 아니므로 존재하지 않는 홈페이지, SaaS 상태, 사용자 수, CI 상태를 나타내는 배지는 만들지 않는다.

## 범위

- `media/impact-lens-readme-hero.png` 가로형 hero 로고를 새로 생성한다.
- README 상단을 중앙 정렬 hero, 제품명, tagline, 실제 링크와 badge로 재구성한다.
- 핵심 가치를 Extension UI, Agent CLI, Codex plugin의 세 가지 사용 경로로 명확히 나눈다.
- 빠른 설치, 5분 시작, 주요 기능 표, 사용 흐름, 노트 저장 범위, 정적 분석 경계, 문서 링크, 개발/기여 정보를 제품 문서형 순서로 정리한다.
- 기존 v0.4.0 기능·설정·명령·제약 중 현재 유효한 내용은 유지한다.

## 범위에서 제외할 항목

- Extension, CLI, Codex plugin 기능 변경
- 실제로 존재하지 않는 웹사이트·Marketplace listing·CI badge 추가
- 기존 Extension package icon(`media/impact-lens.png`, `media/impact-lens.svg`) 교체
- 릴리즈 버전 또는 배포 artifact 변경
- 참고 프로젝트의 로고, 문양, 문구를 복제하는 작업

## 로고/hero 디자인 기준

- Hermes banner의 고급스러운 어두운 배경과 금색 중심 대비, 상징 마크+워드마크 구성만 분위기 reference로 사용한다.
- 고유 심볼은 빛나는 렌즈 중심점, 연결된 코드 그래프 node/edge, 변화가 바깥으로 전파되는 동심 구조를 결합한다.
- 정확한 영문 제품명 `IMPACT LENS`만 사용하고 다른 문구나 watermark를 넣지 않는다.
- GitHub light/dark 화면에서 모두 읽히도록 어두운 배경과 높은 명도 대비를 사용한다.
- README용 가로 배너로 생성하고 최종 자산은 저장소 `media/`에 보관한다.

## 단계별 구현 계획

1. Hermes Agent README banner를 reference image로 확인한다.
2. image generation으로 Impact Lens 전용 가로 hero 로고를 생성하고 결과를 시각 검수한다.
3. 최종 이미지를 `media/impact-lens-readme-hero.png`로 저장한다.
4. README를 hero → 가치 제안 → Quick Start → 제품 기능 → 사용 흐름 → 데이터/제약 → 문서 → 개발 순서로 재작성한다.
5. 실제 release URL, 로컬 링크, Markdown/HTML 구조, 이미지 파일을 검증한다.
6. 문서 전용 변경에 맞는 테스트와 diff 검사를 실행하고 작업 로그를 갱신한다.
7. 독립 커밋으로 남긴다.

## 테스트 및 완료 기준

- 새 hero 이미지가 저장소에 존재하고 README에서 상대 경로로 표시된다.
- 이미지에 `IMPACT LENS` 외의 임의 문구나 watermark가 없다.
- README 첫 화면에서 제품 목적, VSIX 설치, Agent CLI/Codex plugin 진입점을 확인할 수 있다.
- 기존 기능, 노트 scope, Call Hierarchy 한계, 설정 및 개발 링크가 누락되지 않는다.
- 존재하지 않는 서비스나 검증되지 않은 지표를 주장하지 않는다.
- README의 모든 로컬 Markdown 링크와 이미지 경로가 유효하다.
- release/asset 링크가 유효하며 `git diff --check`가 통과한다.
- 변경 사항과 검증 결과가 작업 로그에 기록되고 커밋된다.

## 작업 로그

- 2026-08-25: Hermes Agent 저장소의 raw README를 확인해 hero banner, 중앙 badge, 가치 제안, 기능 table, Quick Install, 문서 허브 구조를 분석했다.
- 2026-08-25: 현재 Impact Lens README, INSTALL, CHANGELOG, media asset을 조사했다. 기존 이미지는 256x256 Extension icon 두 종류이며 README 전용 가로 hero는 없다.
- 2026-08-25: `imagegen` built-in mode로 새 hero를 생성했다. 첫 시안은 graph node·렌즈·impact ring 심볼과 금색 wordmark 방향을 확정했지만 세로가 높고 `E`가 기호처럼 보여 최종본으로 사용하지 않았다.
- 2026-08-25: 첫 시안을 edit reference로 사용해 3:1 구성과 표준 영문 대문자 가독성을 요청했다. 최종 prompt의 핵심은 기존 graph-lens 심볼과 검정·금색·cyan palette를 유지하고, 정확한 `IMPACT LENS`만 일반 Latin capital로 표시하며 세로 여백을 줄이는 것이었다.
- 2026-08-25: 최종 이미지를 `media/impact-lens-readme-hero.png`에 저장했다. 자산은 2172x724 RGB PNG, 1,004,048 bytes이며 SHA-256은 `974c37e8662e6220f63a1e5d3f35b630a1177fe22c9648941d1eab42d9a894b7`이다. 기존 Extension icon은 변경하지 않았다.
- 2026-08-25: README를 hero·badge·navigation, 세 인터페이스 가치 제안, 빠른 설치, 기능 table, Graph/라이브 분석, note scope, Agent/Codex, 분석 경계, 설정, 문서 허브, 개발 순서로 전면 재구성했다.
- 2026-08-25: 실제 존재하는 v0.4.0, VS Code/Node 요구 사항, MIT license만 badge로 사용했다. SaaS 상태, 사용자 수, CI 상태나 별도 웹사이트는 추가하지 않았다.
- 2026-08-25: MarkdownIt으로 README HTML 변환을 확인했고 hero가 렌더 결과에 포함되는지 검증했다. 로컬 문서·이미지 target 6개가 모두 존재했다.
- 2026-08-25: v0.4.0 release page, VSIX, CLI tarball URL이 모두 HTTP 200을 반환했다.
- 2026-08-25: `npm run test:all`을 실행해 Extension 테스트 32개와 CLI 테스트 16개가 모두 통과했다.
- 2026-08-25: `git diff --check`가 통과했다.

## 제한 사항과 후속 과제

- 실제 Graph UI screenshot은 현재 저장소에 없어 README에 넣지 않았다. 향후 여러 테마와 viewport에서 검증한 screenshot이 준비되면 hero 아래 product preview로 추가할 수 있다.
- hero는 README 전용 raster asset이다. Extension/Marketplace icon과 크기·용도가 달라 기존 `media/impact-lens.png`와 `media/impact-lens.svg`를 대체하지 않는다.
