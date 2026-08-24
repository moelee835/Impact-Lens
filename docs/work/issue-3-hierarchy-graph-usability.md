# Issue #3 수정 계획: 프로젝트 호출 계층과 Graph UI 개선

- Issue: [#3 Hierarchy 표출 문제점 (Fast API 프로젝트), Graph UI 사용성 문제점, UI 문제점](https://github.com/moelee835/Impact-Lens/issues/3)
- 상태: Open
- 작성일: 2026-08-24

## 배경과 해결할 문제

FastAPI 프로젝트에서 영향 분석 결과가 프로젝트 전체가 아니라 한 소스 파일 안의 호출 관계만 보여주고, 설정한 깊이보다 얕은 단계까지만 나타난다는 보고가 있다. Graph에서는 노드를 한 번 클릭하는 즉시 코드 에디터가 열려 탐색이 불편하고, 확대와 축소 기능도 제공하지 않는다.

이 작업은 다음 요구사항을 해결한다.

1. 가능한 호출 관계를 프로젝트 범위에서 탐색하고 분석 결과가 제한된 이유를 구분해 보여준다.
2. 최소 depth 5 이상을 실제 분석에 지정할 수 있게 한다.
3. 노드 한 번 클릭은 선택 및 강조만 수행하고, 더블클릭은 코드 위치를 연다.
4. Graph에서 확대, 축소 및 화면 맞춤을 제공한다.

## 범위

### 포함

- VS Code Call Hierarchy가 제공한 프로젝트 내 cross-file incoming call 수집 검증 및 누락 수정
- 동일하거나 유사한 심볼을 안정적으로 구분할 수 있는 노드 식별자 보강
- 분석 깊이와 화면 표시 깊이의 의미 및 UI 분리
- depth 상한 확대와 depth 변경 시 재분석
- 선택 노드 및 연결 edge 강조
- 더블클릭과 키보드로 코드 위치 열기
- Graph zoom in, zoom out, reset/fit 및 확대 상태에서의 이동
- 분석 제한 사유와 결과가 실제로 도달한 깊이 표시
- 관련 단위 테스트, 통합 확인, README 및 설정 설명 갱신

### 제외

- 런타임 호출 추적
- reflection, 문자열 기반 동적 import 등 일반 정적 분석으로 확정할 수 없는 관계
- 모든 Python 프레임워크를 대상으로 하는 범용 의존성 분석
- 테스트 실행 결과 수집 및 실패 확률 추정

FastAPI의 `Depends()`와 decorator 기반 route 등록은 VS Code 언어 서버가 호출 관계를 제공하는지 먼저 확인한다. 제공하지 않는 관계를 지원하려면 일반 Call Hierarchy 수정과 섞지 않고 FastAPI 보조 분석 단계로 분리하며, 정적 추론 관계임을 UI에서 명시한다.

## 현재 구현 조사 결과

- `src/impactAnalyzer.ts`는 `vscode.prepareCallHierarchy`와 `vscode.provideIncomingCalls`를 사용한다. 특정 파일로 URI를 제한하는 코드는 없으므로, same-file 결과만 나오는 원인이 언어 서버인지 내부 중복 제거인지 재현이 필요하다.
- `src/callGraph.ts`는 incoming call을 breadth-first로 탐색하고 `maxDepth`에 도달하면 중단한다.
- `impactLens.maxDepth`는 기본값 2, 최소 1, 최대 5이다. 따라서 5는 가능하지만 5보다 큰 값은 불가능하다.
- Graph의 Depth 버튼은 이미 분석된 `graph.nodes`를 필터링할 뿐 분석 깊이를 변경하지 않는다. 실제 결과가 depth 3까지만 있으면 4와 5 버튼도 만들어지지 않는다.
- `symbolKey()`는 URI, symbol kind, name, detail, 시작 character를 조합하지만 시작 line을 포함하지 않아 같은 파일의 동명 심볼이 충돌할 여지가 있다.
- `src/graphPanel.ts`는 노드의 `click`에서 즉시 `open` 메시지를 전송한다.
- Graph는 고정 좌표 SVG와 scroll container를 사용하며 zoom transform 또는 viewport 상태를 관리하지 않는다.
- Webview 스크립트가 HTML 문자열 안에 포함되어 있어 UI 상호작용 자동 테스트를 추가하려면 순수 상태/geometry 로직을 별도 모듈로 추출하는 편이 유리하다.

## 단계별 구현 계획

### 1. 재현 fixture와 진단 기준 수립

- 최소 FastAPI workspace fixture를 준비한다.
  - 같은 파일의 직접 호출
  - 다른 모듈의 직접 import 호출
  - route → service → repository 호출
  - `Depends()` 의존성
  - decorator 기반 route 등록
  - 같은 이름의 함수와 순환 호출
- 각 심볼에서 VS Code가 반환하는 원본 incoming call과 Impact Lens 결과를 비교한다.
- 아래 기준으로 원인을 분류한다.
  - 원본에는 있고 결과에 없으면 Impact Lens 탐색 또는 식별자 결함
  - 원본에도 없으면 언어 서버/프레임워크 정적 분석 한계
  - `maxDepth` 또는 `maxNodes`에 걸리면 설정에 의한 제한
- 재현 환경에서 사용한 Python 확장과 언어 서버 설정을 작업 로그에 기록한다.

### 2. 프로젝트 범위 호출 탐색 보강

- `symbolKey()`에 selection range의 line과 character, 필요한 경우 workspace folder 정보를 포함해 충돌을 방지한다.
- cross-file URI가 BFS의 `seen` 처리, edge 저장, node 변환 과정에서 유지되는지 테스트한다.
- 순환 호출과 여러 경로에서 다시 만난 노드의 edge는 보존하되 노드는 한 번만 확장한다.
- `maxDepth`와 `maxNodes` 중 어느 제한 때문에 분석이 중단됐는지 결과 모델에 구분해 저장한다.
- 언어 서버가 직접 호출을 제공하는 프로젝트 범위 관계부터 정상화한다.
- FastAPI의 `Depends()`/route 관계가 원본 Call Hierarchy에 없다면 별도 보조 분석 설계를 적용한다.
  - Python 문서/워크스페이스 심볼과 정적 reference를 사용한다.
  - 보조 관계에는 `call-hierarchy`와 다른 출처를 부여한다.
  - 불확실한 문자열/런타임 관계는 생성하지 않는다.

### 3. 분석 depth와 표시 depth 분리

- `impactLens.maxDepth` 상한을 10 이상으로 확장한다. 최종 상한과 기본값은 fixture 성능 측정 후 확정한다.
- Graph에 다음 상태를 분리한다.
  - Analysis depth: extension이 incoming call을 요청할 최대 깊이
  - Visible depth: 이미 받은 노드 중 화면에 표시할 깊이
- Analysis depth를 변경하면 Webview가 extension에 메시지를 보내 설정을 갱신하고 강제 재분석한다.
- Visible depth 변경은 네트워크/언어 서버 요청 없이 즉시 다시 그린다.
- 실제 도달 깊이, 요청한 분석 깊이, 노드 제한 여부를 summary에 표시한다.
- 사용자가 depth 5를 요청했지만 관계가 3단계에서 끝난 경우 정상 종료인지 제공자 한계인지 오해하지 않도록 안내 문구를 제공한다.

### 4. 노드 선택과 코드 이동 분리

- Webview 상태에 `selectedNodeId`를 추가한다.
- 한 번 클릭하면 해당 노드와 직접 연결된 edge만 강조하고 메시지를 보내 코드 에디터를 열지 않는다.
- 더블클릭하면 기존 `open` 메시지를 보내 코드 위치를 연다.
- 빈 공간을 클릭하면 선택을 해제한다.
- 키보드는 Space를 선택, Enter를 코드 열기로 매핑하고 기존 Tab 탐색을 유지한다.
- 선택, changed, added, diagnostic, reviewed 스타일이 동시에 적용될 때 우선순위를 정의하고 VS Code 고대비 테마에서도 식별되도록 한다.
- context menu의 reviewed toggle과 클릭/더블클릭이 충돌하지 않도록 이벤트 전파를 제어한다.

### 5. Zoom과 viewport 이동 구현

- Graph header에 zoom in, zoom out, fit/reset 버튼과 현재 배율을 추가한다.
- 확대 배율은 예를 들어 50%~250% 범위에서 일정 step으로 제한한다.
- `Ctrl/Cmd + wheel`을 지원하고 일반 wheel scroll은 기존 동작을 유지한다.
- SVG 내부에 viewport group을 두고 노드와 edge 전체에 동일한 transform을 적용한다.
- 확대 상태에서 scroll 또는 drag pan으로 그래프를 이동할 수 있게 한다.
- fit/reset은 현재 visible depth의 bounding box를 기준으로 전체 그래프를 viewport에 맞춘다.
- depth 필터 변경 및 live-analysis 갱신 시 선택·배율·위치를 가능한 범위에서 보존하고, 선택 노드가 사라지면 선택만 해제한다.

### 6. 구조 정리와 문서 갱신

- 테스트 가능한 선택, zoom, depth 상태 계산을 Webview 문자열에서 순수 TypeScript/JavaScript 모듈로 분리한다.
- CSP와 로컬 Webview resource URI를 유지해 외부 스크립트 의존성을 추가하지 않는다.
- README의 설정, Graph 조작법, 프로젝트 범위 분석 및 FastAPI 한계를 갱신한다.
- 사용자에게 보이는 상태와 설정 설명을 실제 동작과 일치시킨다.

## 테스트 계획

### 자동 테스트

- cross-file caller가 depth별로 수집되고 edge 방향이 caller → callee인지 확인
- 같은 파일 및 다른 파일의 동명 심볼이 충돌하지 않는지 확인
- depth 1, 3, 5 및 5 초과 탐색 확인
- 순환 호출에서 무한 루프 없이 모든 유효 edge가 유지되는지 확인
- `maxDepth` 제한과 `maxNodes` 제한이 구분되는지 확인
- single click은 선택만 하고 `open` 메시지를 만들지 않는지 확인
- double click과 Enter가 정확히 한 번 `open`을 요청하는지 확인
- zoom 최소/최대 clamp, step, reset/fit 계산 확인
- depth 변경 후 선택과 viewport 상태 보존 규칙 확인

### 수동 검증

- FastAPI fixture에서 같은 파일과 다른 파일의 직접 호출을 비교한다.
- `Depends()` 및 route 관계가 표시되는지, 표시된다면 관계 출처가 정확한지 확인한다.
- analysis depth 1, 3, 5, 10에서 노드 수와 실제 도달 깊이를 비교한다.
- 한 번 클릭, 더블클릭, Space, Enter 및 우클릭 동작을 확인한다.
- 작은 그래프와 큰 그래프에서 zoom, wheel, pan, fit/reset을 확인한다.
- light, dark, high contrast 테마에서 선택 및 edge 강조를 확인한다.
- live analysis 갱신과 depth 변경 후 Graph 상태를 확인한다.
- `npm run compile`, `npm test`, VSIX packaging을 실행한다.

## 완료 기준

- 일반적인 cross-file 직접 호출이 언어 서버 원본 범위 내에서 누락 없이 표시된다.
- FastAPI 고유 관계의 지원 여부와 한계가 재현 결과 및 사용자 문서에 명확히 기록된다.
- 사용자가 depth 5 이상을 분석 값으로 지정할 수 있고, 요청 깊이와 표시 깊이를 구분할 수 있다.
- 분석이 조기에 끝난 이유 또는 실제 도달 깊이를 UI에서 확인할 수 있다.
- 노드 한 번 클릭은 highlight만 수행하며 더블클릭과 Enter만 코드를 연다.
- zoom in, zoom out, fit/reset 및 확대 상태에서의 이동이 동작한다.
- 새 자동 테스트와 기존 테스트가 모두 통과하고 compile 및 package 검증이 성공한다.
- README와 이 작업 문서의 작업 로그가 실제 구현과 일치한다.

## 작업 로그

### 2026-08-24 — 계획 수립

- `gh issue list --state all`로 저장소 이슈를 조회했으며 실제 Issue는 #3 한 건임을 확인했다. PR #1과 #2는 이슈 목록에 포함되지 않는다.
- `gh issue view 3`으로 본문과 댓글을 확인했다. 댓글, 라벨, 담당자는 없다.
- `src/impactAnalyzer.ts`, `src/callGraph.ts`, `src/graphPanel.ts`, `src/controller.ts`, `src/types.ts`, `package.json`, 기존 테스트와 README를 조사했다.
- 현재 구현이 파일 범위를 명시적으로 제한하지 않는 점을 확인했으므로, FastAPI/언어 서버 한계와 내부 탐색 결함을 재현 단계에서 분리하기로 결정했다.
- 구현은 아직 시작하지 않았다. 이 문서는 Issue #3 구현 시 계획과 작업 로그의 기준 문서로 사용한다.
