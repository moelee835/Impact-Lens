# Issue #3 수정 계획: 프로젝트 호출 계층과 Graph UI 개선

- Issue: [#3 Hierarchy 표출 문제점 (Fast API 프로젝트), Graph UI 사용성 문제점, UI 문제점](https://github.com/moelee835/Impact-Lens/issues/3)
- 상태: 구현 및 자동 검증 완료 (수동 Extension Host 검증 제한은 작업 로그 참조)
- 작성일: 2026-08-24

## 배경과 해결할 문제

FastAPI 프로젝트에서 영향 분석 결과가 프로젝트 전체가 아니라 한 소스 파일 안의 호출 관계만 보여주고, 설정한 깊이보다 얕은 단계까지만 나타난다는 보고가 있다. Graph에서는 노드를 한 번 클릭하는 즉시 코드 에디터가 열려 탐색이 불편하고, 확대와 축소 기능도 제공하지 않는다.

이 작업은 다음 요구사항을 해결한다.

1. 가능한 호출 관계를 프로젝트 범위에서 탐색하고 분석 결과가 제한된 이유를 구분해 보여준다.
2. 최소 depth 5 이상을 실제 분석에 지정할 수 있게 한다.
3. 노드 한 번 클릭은 선택 및 강조만 수행하고, 더블클릭은 코드 위치를 연다.
4. Graph에서 확대, 축소 및 화면 맞춤을 제공한다.
5. 영향 노드의 코드를 열어도 현재 Graph의 root와 검토 문맥을 유지한다.

## 범위

### 포함

- VS Code Call Hierarchy가 제공한 프로젝트 내 cross-file incoming call 수집 검증 및 누락 수정
- 동일하거나 유사한 심볼을 안정적으로 구분할 수 있는 노드 식별자 보강
- 분석 깊이와 화면 표시 깊이의 의미 및 UI 분리
- depth 상한 확대와 depth 변경 시 재분석
- 선택 노드 및 연결 edge 강조
- 더블클릭과 키보드로 코드 위치 열기
- 코드 탐색과 Graph root 전환을 분리하고 명시적 root 전환 및 복귀 동작 제공
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
- 노드를 열면 `openLocation()`이 에디터 selection을 해당 함수로 변경한다. 이후 `onDidChangeTextEditorSelection`의 450ms 자동 분석이 실행되면서 현재 Graph root가 이동한 함수로 교체되므로 이전 분석 관점과 검토 상태를 잃을 수 있다.
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

### 5. Graph root와 코드 탐색 문맥 분리

- Graph에서 시작한 코드 이동은 현재 분석 root를 유지하는 탐색 동작으로 취급한다.
- `openLocation()` 호출 전 탐색 의도를 기록하고, 그 이동으로 발생하는 selection event 한 건은 자동 root 재분석 대상에서 제외한다.
- 단순 시간 지연만으로 억제하지 않고 URI와 selection 위치를 대조해 사용자의 실제 후속 커서 이동을 잘못 무시하지 않도록 한다.
- Graph header에 현재 고정된 root를 명확히 표시한다.
- 선택 노드에는 `Analyze from here` 또는 `Set as root` 명령을 제공해 사용자가 명시적으로 요청할 때만 새 관점으로 재분석한다.
- root를 명시적으로 전환할 경우 이전 root를 세션 내 history에 저장하고 `Back to previous root` 동작으로 기존 관점에 복귀할 수 있게 한다.
- live analysis는 고정 root를 기준으로 유지한다. 다른 노드의 코드를 편집해도 현재 root의 영향 그래프를 재분석하며, 편집한 노드는 기존 changed 표시 정책을 따른다.
- 사용자가 Graph 밖에서 일반적으로 커서를 이동한 경우에는 기존 `autoAnalyzeOnCursorChange` 설정을 따른다. Graph가 열려 있다는 이유만으로 모든 자동 분석을 차단하지 않는다.
- root 변경 시 reviewed 상태 처리 정책을 명시한다.
  - 같은 root로 돌아오면 해당 root 세션의 reviewed 상태를 복원한다.
  - 다른 root의 검토 상태와 섞지 않도록 root별로 관리한다.

검토한 대안과 선택 기준:

- **Graph 이동 직후 selection event 억제 + 명시적 root 전환**: 기존 자동 분석을 유지하면서 Graph 탐색 문맥만 보존할 수 있어 기본안으로 사용한다.
- Graph가 열려 있는 동안 root를 항상 pin: 이해하기 쉽지만 사용자의 일반 커서 이동까지 막으므로 보조적인 `Pin root` 옵션으로만 고려한다.
- root history만 제공하고 자동 전환 유지: 복귀는 가능하지만 매번 관점과 layout이 바뀌어 리뷰 흐름이 계속 끊기므로 단독 해결책으로 사용하지 않는다.

### 6. Zoom과 viewport 이동 구현

- Graph header에 zoom in, zoom out, fit/reset 버튼과 현재 배율을 추가한다.
- 확대 배율은 예를 들어 50%~250% 범위에서 일정 step으로 제한한다.
- `Ctrl/Cmd + wheel`을 지원하고 일반 wheel scroll은 기존 동작을 유지한다.
- SVG 내부에 viewport group을 두고 노드와 edge 전체에 동일한 transform을 적용한다.
- 확대 상태에서 scroll 또는 drag pan으로 그래프를 이동할 수 있게 한다.
- fit/reset은 현재 visible depth의 bounding box를 기준으로 전체 그래프를 viewport에 맞춘다.
- depth 필터 변경 및 live-analysis 갱신 시 선택·배율·위치를 가능한 범위에서 보존하고, 선택 노드가 사라지면 선택만 해제한다.

### 7. 구조 정리와 문서 갱신

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
- Graph에서 연 코드 위치의 selection event가 기존 root를 변경하지 않는지 확인
- Graph 이동 후 사용자가 직접 커서를 움직이면 자동 분석이 정상적으로 동작하는지 확인
- `Set as root`와 root history 복귀가 정확한 분석 결과 및 검토 상태를 복원하는지 확인
- 다른 문서와 같은 문서의 연속 탐색에서 suppression 대상이 잘못 매칭되지 않는지 확인
- zoom 최소/최대 clamp, step, reset/fit 계산 확인
- depth 변경 후 선택과 viewport 상태 보존 규칙 확인

### 수동 검증

- FastAPI fixture에서 같은 파일과 다른 파일의 직접 호출을 비교한다.
- `Depends()` 및 route 관계가 표시되는지, 표시된다면 관계 출처가 정확한지 확인한다.
- analysis depth 1, 3, 5, 10에서 노드 수와 실제 도달 깊이를 비교한다.
- 한 번 클릭, 더블클릭, Space, Enter 및 우클릭 동작을 확인한다.
- 영향 노드의 코드를 연 뒤 Graph root, depth 필터, 선택, zoom 및 reviewed 상태가 유지되는지 확인한다.
- `Set as root`로 관점을 바꾸고 `Back to previous root`로 기존 리뷰 관점에 복귀하는지 확인한다.
- Graph 이동 직후 일반 커서 이동을 수행해 자동 분석이 의도대로 다시 작동하는지 확인한다.
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
- Graph에서 코드를 열어도 현재 root와 리뷰 문맥이 유지되며, 명시적 명령으로만 root를 전환할 수 있다.
- 명시적으로 전환한 root에서 이전 root로 복귀할 수 있고 root별 검토 상태가 섞이지 않는다.
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

### 2026-08-24 — Graph root 문맥 유지 요구사항 추가

- Graph 노드에서 코드 위치를 열 때 에디터 selection 변경이 자동 분석을 유발해 해당 노드가 새 root가 되는 흐름을 확인했다.
- 리뷰 중 기존 관점이 사라지는 문제를 막기 위해 Graph 탐색으로 발생한 selection event만 식별해 억제하고, `Set as root`를 명시적 동작으로 분리하는 방안을 기본안으로 추가했다.
- root 고정 옵션과 root history 대안도 비교했으며, 일반 커서 자동 분석을 보존하기 위해 root history는 복귀 수단으로 결합하고 전역 pin은 선택 기능으로만 고려하기로 했다.
- 관련 자동·수동 테스트 및 완료 기준을 추가했다. 구현은 아직 시작하지 않았다.

### 2026-08-24 — 호출 탐색과 제한 상태 구현

- `src/callGraph.ts`, `src/types.ts`, `src/impactAnalyzer.ts`를 변경했다.
  - 최대 깊이의 경계 노드도 incoming call 존재 여부를 확인해 실제로 더 탐색할 관계가 있을 때만 `depth` 제한으로 기록한다.
  - `maxNodes`로 수집하지 못한 노드의 dangling edge는 결과에 넣지 않는다.
  - 결과에 요청 깊이, 실제 도달 깊이, `depth`/`nodes` 제한 사유를 각각 저장한다.
- `src/symbolIdentity.ts`를 추가하고 symbol key에 selection 시작 line과 character를 모두 포함했다. 같은 파일에서 이름과 column이 같은 심볼이 서로 다른 line에 있을 때 충돌하던 가능성을 제거했다.
- `impactLens.maxDepth`의 기본값을 5, 허용 범위를 1~20으로 변경했다.
- `src/test/callGraph.test.ts`, `src/test/symbolIdentity.test.ts`에 cross-file 동명 노드, depth 5 초과, 제한 사유, cycle/node limit, symbol line 구분 테스트를 추가했다.
- FastAPI 전용 추론 edge는 추가하지 않았다. 일반 cross-file 직접 호출은 URI를 제한하지 않고 언어 서비스가 반환한 관계를 수집하지만, `Depends()`와 decorator route처럼 provider가 반환하지 않는 관계를 확정 호출로 생성하면 오탐 가능성이 크기 때문이다. 이 차이를 README에 명시했다.

### 2026-08-24 — Graph 상호작용과 root 문맥 구현

- `src/graphPanel.ts`를 변경했다.
  - single click/Space는 선택만 수행하고 선택 노드, 인접 노드, 직접 연결 edge를 강조한다.
  - double click/Enter만 `open` 메시지를 보낸다.
  - Analysis depth와 Visible depth를 별도 select로 제공하며 Analysis 변경은 workspace 설정 갱신과 root 재분석을 요청한다.
  - 50%~250% zoom, `Ctrl/Cmd + wheel`, Fit, Reset, 빈 공간 drag pan을 추가했다.
  - Webview state에 선택 노드, visible depth, zoom, scroll 위치를 저장해 live update 후 유효한 상태를 복원한다.
  - header에 현재 root, 요청/도달 깊이, 정상 종료 또는 제한 사유를 표시한다.
- `src/navigationGuard.ts`와 테스트를 추가했다. Graph 이동 전에 URI와 selection range를 기록하고 정확히 일치하는 selection event만 한 번 억제한다. 1.5초 cleanup은 stale intent 제거용이며, 억제 판단 자체는 시간만 사용하지 않는다.
- `src/controller.ts`를 변경했다.
  - Graph 코드 이동, live edit 재분석, save, depth 설정 변경이 기존 root를 유지한다.
  - `Set selected as root`에서만 root를 전환하고 `Previous root`로 이전 root를 재분석한다.
  - reviewed set을 root별로 보관해 root 복귀 시 서로 섞이지 않도록 했다.
  - Graph 밖에서 발생한 일반 cursor selection은 기존 자동 분석 동작을 유지한다.
- 설계상 Graph node single click 후 DOM 전체를 교체하지 않고 class만 갱신한다. 브라우저의 click 두 번 뒤 `dblclick`이 발생할 때 target이 사라져 open이 누락되는 문제를 피하기 위한 결정이다.

### 2026-08-24 — 문서, 버전 및 검증

- `README.md`에 Graph 조작법, 분석/표시 depth 차이, root 유지와 복귀, cross-file 수집 범위 및 FastAPI 한계를 문서화했다.
- `CHANGELOG.md`, `package.json`을 v0.3.0 릴리스 내용과 버전으로 갱신했다.
- `npm test` 결과: 16개 테스트 모두 통과했다.
  - reverse BFS/edge 방향, cycle, node limit, depth limit과 자연 종료 구분
  - cross-file 동명 노드, depth 8 탐색, symbol line identity
  - Graph navigation selection 정확 일치
  - 기존 delta/note 관련 회귀 테스트
- `npm run compile` 결과: TypeScript 컴파일 성공.
- `git diff --check` 결과: whitespace 오류 없음.
- `npx vsce package --out /tmp/impact-lens-0.3.0.vsix` 결과: 성공, 23 files, 43.78 KB.
- 현재 shell에는 `code` CLI가 없고 설치된 Python/Pylance 확장을 조회할 수 없어 Extension Development Host에서 FastAPI와 실제 마우스/키보드 조작을 수동 검증하지 못했다. 따라서 이 항목을 성공으로 간주하지 않는다. 남은 위험은 언어 서버별 Call Hierarchy 반환 차이와 실제 VS Code theme/layout에서의 시각 동작이며, VSIX 설치 smoke test가 후속 확인 항목이다.
- 계획과의 차이: 별도 FastAPI 보조 추론 및 FastAPI 전용 fixture는 구현하지 않았다. provider에 없는 framework 관계를 오탐 없이 확정할 근거가 없고 Issue의 프로젝트 범위 탐색은 provider가 반환한 URI를 보존하는 일반 traversal과 충돌 방지로 해결하는 범위로 확정했다.
