# Issue #9 수정 계획: Graph 범주 표시와 viewport 정렬

- Issue: [#9 Fix graph relation visibility and viewport fitting](https://github.com/moelee835/Impact-Lens/issues/9)
- 상태: 구현 및 자동 검증 완료 (수동 Extension Host 검증 제한은 작업 로그 참조)
- 작성일: 2026-08-24

## 배경과 해결할 문제

Impact Analysis Graph의 범례에는 `Direct`, `Transitive`, `Test`가 있지만 실제 노드에서는 범주를 약한 테두리 색으로만 표현한다. `changed`, `added`, `diagnostic` 상태가 같은 테두리를 덮을 수 있어 호출 관계 범주를 안정적으로 구분하기 어렵고, 테스트 파일 이름 판별 범위도 일부 언어의 관례를 놓친다.

또한 Graph의 폭을 실제 노드가 도달한 깊이가 아니라 사용자가 요청한 `Visible depth`로 계산한다. 예를 들어 실제 caller가 depth 1에서 끝나도 Visible depth가 5이면 사용하지 않는 네 개 열이 빈 공간으로 남는다. 최초 viewport는 이 빈 공간의 좌측을 보여주고, `Fit`도 빈 공간을 포함한 전체 폭을 축소하므로 실제 그래프가 작고 우측에 치우친다.

## 범위

### 포함

- Direct, Transitive, Test 노드의 지속적으로 보이는 범주 표식과 범주/호출 거리 텍스트
- 현재 표시 중인 Direct, Transitive, Test 노드 수를 범례에 표시
- 일반적인 테스트 디렉터리와 파일 이름 관례 판별 보강
- 실제 표시 노드의 최대 깊이와 최대 열 크기에 기반한 compact layout
- 실제 graph bounds 기반 Fit 배율 계산
- viewport보다 작은 그래프의 수평·수직 중앙 정렬
- 최초 표시와 명시적 root 변경 시 자동 Fit, 같은 root의 live update 시 viewport 복원
- 순수 계산 모듈 및 단위 테스트
- README, CHANGELOG, 버전과 작업 로그 갱신
- VSIX 패키징, PR, merge, Issue close 및 patch release

### 제외

- 언어 서버가 Call Hierarchy로 반환하지 않는 테스트 호출 관계 추론
- 테스트 실행 및 pass/fail 결과 수집
- graph layout algorithm의 계층형 edge crossing 최적화
- VS Code Webview 외부의 별도 시각화 라이브러리 도입

## 현재 구현 조사 결과

- `src/impactAnalyzer.ts`는 test directory 및 `.test`/`.spec` 파일은 인식하지만 `test_*.py`, `*_test.go`, `*Test.java`, `*Tests.cs` 같은 파일 이름을 놓친다.
- 관계 모델은 test 여부를 우선 적용해 test caller를 `test`로 분류한다. depth 값은 별도로 유지되지만 Graph가 이를 텍스트로 보여주지 않아 direct test와 transitive test를 구분하기 어렵다.
- `src/graphPanel.ts`의 범례는 정적인 세 항목이고 실제 노드 수를 보여주지 않는다.
- 노드 종류는 사각형 stroke에 의존하며 뒤에 선언된 changed/added/diagnostic stroke가 범주 색을 대체한다.
- node card의 사각형 높이는 32px인데 note, location, status는 그 아래에 그려져 카드 경계와 관계 표시가 분리된다.
- `baseWidth = max(720, (visibleDepth + 1) * 250 + 80)`이므로 실제 노드가 없는 depth도 layout 폭에 포함된다.
- 초기 zoom은 100%, scroll은 `(0, 0)`이고 새 root인지 판별하지 않아 graph가 우측에 있을 때 빈 좌측 영역부터 보인다.
- Fit은 `baseWidth/baseHeight` 전체를 대상으로 하고 scroll을 `(0, 0)`으로 돌릴 뿐 중앙 정렬하지 않는다.
- Webview 문자열 내부 계산에는 자동 테스트가 없다. 분류, layout, fit, viewport 복원 판단을 순수 TypeScript 모듈로 분리해야 한다.

## 단계별 구현 계획

### 1. 테스트 파일과 관계 표현 보강

- test path 판별을 순수 함수로 추출한다.
- `test`, `tests`, `spec`, `specs`, `__tests__` 디렉터리와 `.test`/`.spec`, `test_*`, `*_test`, `*Test`/`*Tests` 파일 이름을 인식한다.
- test node에도 depth를 이용해 `Test · direct` 또는 `Test · N hops`를 표시한다.
- 관계별 marker/accent를 card status border와 분리해 changed/diagnostic 상태와 동시에 보이게 한다.
- 범례를 현재 visible node 수로 갱신한다.

### 2. 실제 노드 기반 compact layout

- visible node의 실제 최대 depth만 열 수와 x 좌표 계산에 사용한다.
- 노드 card의 전체 텍스트가 테두리 안에 들어가도록 높이와 y 좌표를 정리한다.
- 최대 열 노드 수로 높이를 계산하되 고정 최소 720×430 빈 영역은 제거한다.
- layout 계산을 순수 함수로 만들고 sparse depth, shallow graph, multi-row graph를 테스트한다.

### 3. Fit과 viewport 정책 수정

- viewport 여백을 제외한 실제 layout 크기로 fit zoom을 계산하고 허용 zoom 범위로 제한한다.
- SVG surface가 viewport보다 작으면 graph group을 양 축 중앙에 배치한다.
- surface가 viewport보다 크면 scroll/pan을 유지한다.
- Webview state에 root id를 저장한다. 저장된 root와 현재 root가 다르거나 저장 상태가 없으면 최초 render 후 자동 Fit한다.
- 같은 root의 live analysis HTML 갱신은 기존 zoom과 scroll을 복원한다.
- 명시적 Fit은 zoom을 다시 계산하고 중앙 위치로 복귀한다.

### 4. 문서와 릴리스

- README에 범주 의미, test file 판별 범위, 초기 Fit/중앙 정렬 동작을 반영한다.
- CHANGELOG 및 package version을 patch release로 갱신한다.
- 자동 검증과 가능한 패키징 검증 결과를 기록한다.
- 커밋 후 PR을 만들고 merge하면 Issue #9를 닫고 새 tag/release와 VSIX를 게시한다.

## 테스트 및 완료 기준

- 각 테스트 파일 이름 관례의 양성 사례와 일반 source file 음성 사례가 통과한다.
- 실제 노드 깊이가 1이고 Visible depth가 5여도 layout은 두 열만 사용한다.
- 한 노드 및 여러 열/행 layout의 bounds가 node card를 포함한다.
- Fit 계산이 실제 layout만 사용하고 min/max zoom을 준수한다.
- 새 root에는 자동 Fit을 적용하고 같은 root에는 저장 viewport를 복원한다.
- Direct, Transitive, Test가 card 내부 텍스트와 독립 marker로 구분되며 범례 수가 갱신된다.
- 최초 표시와 Fit 후 graph가 viewport 중앙에 놓인다.
- 기존 선택, root history, zoom, pan, visible depth 기능이 회귀하지 않는다.
- `npm test`, `npm run compile`, `git diff --check`, VSIX packaging이 성공한다.
- VSIX를 실제 Extension Development Host에서 검증할 수 없으면 그 제한과 수동 확인 항목을 성공으로 간주하지 않고 기록한다.

## 작업 로그

### 2026-08-24 — 조사 및 계획 수립

- 열린 이슈가 없는 것을 확인하고 재현된 세 현상을 Issue #9로 등록했다.
- `src/graphPanel.ts`, `src/impactAnalyzer.ts`, `src/impactTreeProvider.ts`, `src/types.ts`, README와 기존 테스트를 조사했다.
- 빈 viewport와 작은 Fit의 공통 원인이 요청 depth를 기준으로 한 oversized layout임을 확인했다.
- 범주 표시는 status와 같은 stroke 속성을 공유해 시각적으로 사라질 수 있으며, test path 판별도 일부 언어 관례를 놓침을 확인했다.
- `fix/issue-9-graph-layout` 브랜치를 만들었다. 코드 구현은 이 계획 문서 작성 후 시작한다.

### 2026-08-24 — 관계 분류와 Graph 시각 표현 구현

- `src/testFile.ts`를 추가하고 test path 판별 및 관계 분류를 순수 함수로 분리했다.
  - test directory, `.test`/`.spec`, `test_*`/`spec_*`, `*_test`/`*_spec`, `*Test`/`*Tests` 관례를 지원한다.
  - root는 test file이어도 root로 유지하고, caller는 depth와 test path에 따라 direct/transitive/test로 분류한다.
- `src/impactAnalyzer.ts`가 새 관계 분류 함수를 사용하도록 변경했다. Call Hierarchy 수집과 edge 방향은 변경하지 않았다.
- `src/graphPanel.ts`의 node card 높이를 전체 note/location/status가 포함되도록 확장했다.
- card 안에 관계 색 marker와 `Direct caller`, `Transitive · N hops`, `Test · direct caller/N hops` 텍스트를 추가했다.
- marker와 관계 텍스트는 changed/added/diagnostic/selected가 사용하는 card stroke와 분리했다. 여러 상태가 겹쳐도 관계 범주가 사라지지 않는다.
- 범례에 현재 Visible depth에서 실제 표시 중인 Direct, Transitive, Test 노드 수를 표시한다.

### 2026-08-24 — Compact layout과 viewport 구현

- `src/graphLayout.ts`를 추가해 layout, fit zoom, viewport surface, restore 여부 계산을 순수 함수로 분리했다.
- 실제 visible node의 최대 depth만 layout 열 수에 사용한다. 요청 depth에 노드가 없으면 더 이상 빈 열과 폭을 만들지 않는다.
- 각 열의 card를 수직 중앙 정렬하고 node card 전체가 layout bounds 안에 들어가도록 크기를 계산한다.
- viewport보다 작은 graph는 SVG content group에 offset을 적용해 수평·수직 중앙에 놓는다. 큰 graph만 scroll surface를 확장한다.
- Fit은 실제 layout bounds와 24px viewport 여백으로 zoom을 계산한다.
- Webview state에 `rootId`를 저장한다. 저장 상태가 없거나 root가 바뀌면 첫 render 직후 자동 Fit하고, 같은 root의 live update만 기존 zoom/scroll/selection/Visible depth를 복원한다.
- zoom 중심점 계산도 centered surface offset을 반영하도록 수정했고 resize 시 surface를 다시 계산한다.
- Graph Webview에 순수 함수의 컴파일된 JavaScript source를 주입하므로 단위 테스트 대상과 실제 UI 계산이 동일하다.

### 2026-08-24 — 문서, 버전 및 검증

- `README.md`에 관계 marker/label/count, test path 범위, 실제 노드 기반 Fit, 초기/root 변경 자동 Fit과 same-root viewport 보존을 문서화했다.
- 언어 확장이 테스트 호출자를 Call Hierarchy에 반환하지 않으면 Impact Lens도 해당 관계를 추정하지 않는다는 한계를 명시했다.
- `CHANGELOG.md`, `package.json`, 개발 가이드의 릴리스 예시를 v0.3.3으로 갱신했다.
- 첫 `pnpm test`에서는 Fit 테스트가 24px 양쪽 여백을 제외하지 않은 기대값 때문에 31개 중 1개 실패했다. 명세식 `(viewportWidth - 48) / graphWidth`로 기대값을 수정한 뒤 재검증했다.
- `npx --yes pnpm@10 test`: 32개 테스트 모두 통과.
  - 기존 incoming-call BFS, cross-file chain, cycle 및 edge 방향 테스트 7개가 모두 통과해 호출 관계 수집 회귀가 없음을 확인했다.
  - 신규 test path/관계 분류 4개, layout/fit/centering/restore 5개가 통과했다.
- `npx --yes pnpm@10 run compile`: TypeScript 컴파일 성공.
- `git diff --check`: whitespace 오류 없음.
- 생성된 실제 Webview HTML에서 script를 추출해 Node `vm.Script`로 파싱했다. 순수 계산 함수의 `toString()` 주입을 포함한 JavaScript 문법이 유효함을 확인했다.
- `npx --yes pnpm@10 exec vsce package --out /tmp/impact-lens-0.3.3.vsix`: 성공, 25 files, 124.76 KB.
- `unzip -l`로 VSIX에 `graphLayout.js`, `testFile.js`와 runtime 파일이 포함되고 `AGENTS.md`, `docs/**`, `out/test/**`가 제외된 것을 확인했다.
- VSIX SHA-256: `ebeed11adf9a9df2cd9e35240870571fb2039dda4e6d9e24267a013f9fd1cf00`.
- 현재 shell에는 `code` CLI가 없어 Extension Development Host에서 실제 light/dark/high-contrast 렌더링, 초기 자동 Fit, 버튼 Fit 및 pointer pan을 수동 검증하지 못했다. 이 항목은 성공으로 간주하지 않으며, 릴리스 설치 후 확인할 잔여 위험으로 기록한다.
- 계획과 실제 구현의 차이: 별도 그래프 라이브러리는 도입하지 않았고 기존 local Webview/SVG 구조를 유지했다. 범주와 상태의 동시 표현은 복잡한 CSS 우선순위 대신 독립 marker/label로 해결했다.
