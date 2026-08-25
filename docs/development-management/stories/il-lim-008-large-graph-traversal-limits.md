# IL-LIM-008 대규모 호출 그래프 제한 개선

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간
- 적용 영역: VS Code Extension, Agent CLI

## 문제

분석은 기본 depth 5·node 120, 최대 depth 20·node 1,000으로 제한된다. 대규모 graph에서는 중요한
상위 caller가 잘릴 수 있고, 제한을 단순히 높이면 Language Server 부하와 UI 가독성이 악화될 수 있다.

## 사용자 스토리

대규모 프로젝트를 분석하는 개발자로서 전체 graph를 한 번에 요청하지 않고도 잘린 branch를 선택적으로
확장하고 중요한 caller를 놓치지 않으며 분석 비용을 통제하고 싶다.

## 범위

- branch 단위 추가 탐색 또는 pagination 모델을 설계한다.
- 제한에 걸린 frontier와 추가 탐색 비용을 UI·JSON에 표시한다.
- 취소, timeout, cache와 중복 요청 처리를 정의한다.

## 제외 범위

- 무제한 graph를 한 화면에 렌더링
- 모든 프로젝트 규모에 동일한 성능 SLA 보장

## 수용 기준

- [ ] 잘린 frontier에서 추가 탐색을 요청할 수 있다.
- [ ] 추가 결과가 기존 node/edge identity를 깨지 않고 병합된다.
- [ ] 취소와 timeout 후에도 기존 부분 결과가 보존된다.
- [ ] 대형 fixture에서 메모리·시간 측정값과 권장 제한이 기록된다.

## 검증

- depth/node frontier, cycle과 diamond graph 단위 테스트
- 반복 확장 시 중복·dangling edge 회귀 테스트
- cold/warm provider benchmark

## 의존성 및 위험

- `IL-LIM-003`과 `IL-LIM-009`의 부분 결과 의미를 재사용해야 한다.
- 장시간 request cancellation과 server lifecycle은 `IL-LIM-005`의 JSON-RPC 보강에 의존한다.
- provider 요청 수 증가가 editor responsiveness를 해치지 않도록 예산이 필요하다.

## 현재 기준선

- Extension과 CLI 모두 queue 기반 역방향 BFS를 한 번에 실행한다.
- depth 경계에서도 incoming request를 한 번 호출해 unseen caller가 있을 때만 `depth` limitation을 기록한다.
- node limit에 걸린 caller의 identity나 frontier는 결과에 보존되지 않으므로 특정 branch만 이어서 탐색할 수 없다.
- Extension은 하나의 provider session을 유지하지만 CLI는 analyze마다 Language Server process를 새로 시작한다.

## 조사 결과

- [LSP CallHierarchyItem](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#callHierarchyItem)의
  optional `data`는 server가 후속 request에 보존하도록 쓰는 opaque 값이다.
  새 process/session에서 직렬화된 item을 재사용할 수 있다고 가정하면 안 된다.
- Call Hierarchy request는 LSP의 partial-result와 work-done parameter 형태를 따를 수 있지만 provider가 실제로
  streaming partial result를 제공하는지는 서버별로 다르므로 application-level frontier가 여전히 필요하다.
- [LSP request cancellation](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#cancelRequest)은
  장시간 branch 확장에 필요하지만 현재 CLI JSON-RPC client는 timeout 후
  `$/cancelRequest`를 보내지 않는다. 이는 `IL-LIM-005` 선행 항목이다.
- 고정 제한을 크게 올리는 방식은 request 수, graph layout과 DOM node 비용을 동시에 증가시킨다.

## 대안 검토와 결정

1. **상한만 크게 증가**: 구현은 작지만 응답성과 가독성 문제를 악화시켜 제외한다.
2. **전체 graph background scan**: 사용자가 필요하지 않은 branch까지 탐색해 비용이 크다.
3. **frontier를 표시하고 선택 branch를 확장**: 비용을 사용자가 통제할 수 있어 Extension의 권장 방식이다.
4. **CLI item continuation token 재사용**: server process가 바뀌면 opaque data가 무효일 수 있어 그대로 채택하지 않는다.

## 권장 대응

- traversal 결과에 `frontiers[]`를 추가한다: target node ID, 잘린 이유, 발견된 unseen count 또는 `unknown`,
  재준비 가능한 uri/selectionRange와 requested budget.
- Extension은 현재 session의 `CallHierarchyItem`을 memory에 보존해 node별 “Load callers”를 제공한다.
- CLI는 continuation item을 신뢰하지 않고 frontier symbol의 file/position/expectedSymbol을 새 session에서
  다시 prepare한 뒤 제한된 subgraph를 분석한다. 응답에는 `continuationMode: reprepare`를 명시한다.
- subgraph merge는 stable symbol ID와 edge identity를 사용하고 기존 reviewed/change state를 유지한다.
- 전역 budget과 요청별 추가 budget을 분리하며 병렬 incoming request 수는 기본 1로 유지하고 benchmark 후 조정한다.

## 단계별 계획

### 1단계 — frontier 모델

1. depth/node 경계에서 버린 caller 또는 추가 가능성을 `TraversalFrontier`로 기록한다.
2. node limit에서는 모든 skipped caller를 저장하지 않고 count와 재요청 target만 보존한다.
3. frontier ID, 정렬과 중복 규칙을 정의한다.
4. 기존 `truncated`/limits와 새 frontier mapping을 테스트한다.

종료 조건: 부분 graph의 어느 node에서 왜 탐색이 멈췄는지 알 수 있다.

### 2단계 — Extension branch 확장

1. analyzer session cache에 root와 provider item map을 보존한다.
2. Graph/Explorer에 frontier action과 요청 budget UI를 추가한다.
3. cancellation token을 traversal adapter까지 전달한다.
4. 확장 결과를 현재 graph에 병합하고 viewport·selection·review state를 유지한다.

종료 조건: 하나의 잘린 branch만 추가 탐색하고 다른 branch는 요청하지 않는다.

### 3단계 — CLI reprepare continuation

1. response frontier에 canonical target descriptor를 추가한다.
2. 새 analyze mode가 descriptor를 다시 prepare하고 추가 depth/node budget으로 subgraph를 반환한다.
3. client가 안전하게 merge할 수 있도록 base root ID, frontier ID와 result generation을 포함한다.
4. symbol 이동·모호성·provider 변경을 stale continuation error로 처리한다.

종료 조건: process 재시작 뒤에도 지원 fixture의 frontier를 재현하고 확장할 수 있다.

### 4단계 — 성능과 adaptive guidance

1. chain, wide fan-in, diamond, cycle과 mixed test graph benchmark를 만든다.
2. provider time, queue time, node/edge 수와 render time을 분리 측정한다.
3. 자동 limit 증가는 하지 않고 측정값에 기반한 추가 budget 제안을 제공한다.

종료 조건: 권장 limit과 UI warning threshold가 benchmark 근거를 가진다.

## 예상 변경 영역

- `src/types.ts`, `src/callGraph.ts`, `cli/src/impact.ts`: frontier와 cancellation
- `src/impactAnalyzer.ts`, `src/controller.ts`: session item cache와 graph merge
- `src/graphPanel.ts`, `src/impactTreeProvider.ts`: Load callers UI
- `cli/src/index.ts`, request/response schema: reprepare continuation
- graph/traversal/contract/performance tests
- README와 CLI 문서: 부분 탐색 및 continuation 의미

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| traversal | depth/node 경계 | 정확한 target과 reason의 frontier 생성 |
| traversal | cycle·diamond 확장 | 중복 node 없이 모든 실제 edge 보존 |
| Extension | 단일 branch 확장 | 해당 provider request만 추가되고 state 유지 |
| CLI | process 재시작 후 reprepare | stable target이면 subgraph 재생성 |
| stale | symbol 이동·provider version 변경 | 잘못 병합하지 않고 actionable conflict 반환 |
| 성능 | wide/large fixture | cancellation 가능하고 설정 budget 내 종료 |

## rollout과 관측

- 첫 release는 frontier를 읽기 전용으로 표시하고 기존 제한 설정을 유지한다.
- 다음 단계에서 Extension branch 확장을 먼저 제공한 뒤 CLI continuation을 추가한다.
- UI와 JSON에 request count, provider time과 loaded/remaining-unknown 상태를 표시한다.
- session cache에는 source text를 복제하지 않고 provider item과 normalized graph만 제한된 수로 보존한다.
- merge 오류나 provider instability가 감지되면 full reanalysis로 fallback하고 기존 graph를 파괴하지 않는다.

## 미해결 질문

- frontier별 unseen caller count를 얻기 위한 boundary request 비용이 가치가 있는지 benchmark가 필요하다.
- Extension session cache의 최대 root/item 수와 invalidation 조건을 정해야 한다.
- CLI continuation을 별도 operation으로 둘지 analyze request variant로 둘지 schema 설계가 필요하다.
