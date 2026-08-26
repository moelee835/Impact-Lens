# IL-LIM-003 Language Server 분석 범위 투명성

- 상태: In progress
- 우선순위: P0
- 완료 마일스톤: [M0 — Provider 실행 신뢰성](../milestones/m0-provider-runtime-trust.md)
- 영향도: 매우 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

Impact Lens는 Language Server가 반환한 Call Hierarchy에 의존하지만 사용자는 누락이 코드상 부재인지,
provider의 미지원·indexing·설정 문제인지 구분하기 어렵다. 현재 `complete`도 provider가 제공한 범위의
탐색 완료만 의미하므로 결과를 전체 런타임 관계의 완전성으로 오해할 수 있다. 대상이 Python인데
provider가 생략됐을 때 기본 TypeScript 서버를 실행하는 것처럼 선택 자체가 잘못된 경우도 현재는 일반
`provider_unavailable`로만 보이며, 사용자는 언어 불일치와 server crash를 구분할 수 없다.

## 사용자 스토리

분석 결과를 의사결정에 사용하는 개발자로서 어떤 provider와 capability가 결과를 만들었고
어떤 범위가 보장되지 않는지 즉시 확인하고 싶다.

## 범위

- provider 이름·버전·capability·indexing 상태와 결과 출처를 공통 metadata로 정리한다.
- 요청 언어, 선택된 provider, 선택 방식과 language match 여부를 기록한다.
- provider 미지원, 탐색 제한, 동적 관계 미추론을 서로 다른 limitation으로 유지한다.
- executable 탐색, process launch, initialize, indexing, capability와 query 실패 단계를 구분한다.
- Extension과 CLI에서 동일한 의미의 completeness 요약을 제공한다.

## 제외 범위

- Language Server 자체의 분석 정확도 수정
- 지원하지 않는 관계를 근거 없이 생성

## 수용 기준

- [x] 모든 분석 결과에 provider identity와 Call Hierarchy capability가 포함된다.
- [x] provider 누락과 실제 caller 없음이 사용자 메시지와 JSON에서 구분된다.
- [x] Extension과 CLI의 completeness 용어 및 limitation code가 문서화된다.
- [x] 대표 provider별 기준 fixture와 기대 coverage가 기록된다.
- [x] 대상 언어와 맞지 않는 기본 provider는 실행되지 않고 해결 가능한 오류로 종료된다.
- [x] provider process 종료 시 exit code, 단계와 redacted stderr가 가능한 범위에서 보존된다.

## 검증

- capability 없음, provider 실패, 빈 결과와 정상 완료 contract 테스트
- Extension/CLI 결과 의미 비교 테스트 또는 공통 fixture
- 문서 용어와 JSON schema 일치 검사

## 의존성 및 위험

- 다른 분석 정확도 스토리의 공통 기반이다.
- 일부 서버는 표준화된 indexing 완료 신호를 제공하지 않으므로 `unknown` 상태가 필요할 수 있다.

## 현재 기준선

- CLI `ProviderCapabilities`는 `name`, optional `version`, `callHierarchy`, `diagnostics`를 가지며
  initialize 응답의 `serverInfo`와 capability를 사용한다.
- CLI `complete`는 depth/node 제한이 없다는 뜻이고 `limitations`는 문자열 배열이다.
- Extension `ImpactResult`에는 provider identity나 languageId가 없고 `analysisState`와 traversal limit만 있다.
- Extension은 VS Code command를 통해 active provider를 간접 호출하므로 CLI처럼 initialize 응답을 직접 보지 않는다.
- CLI는 provider 미지정 요청을 파일 확장자보다 먼저 TypeScript 기본 provider에 연결한다. `.py` 요청에서도
  TypeScript 서버가 실행될 수 있고, exit code 1과 빈 stderr가 `provider_unavailable`에 포함된 실제 사례가 있다.
- `JsonRpcClient`는 child `exit` 이벤트에서 즉시 오류를 만들므로 stdio stream의 `close` 전에 도착한 stderr가
  오류 메시지에서 누락될 가능성이 있다.

## 조사 결과

- [LSP initialize](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialize)는
  server capabilities와 optional `serverInfo`를 제공하므로 CLI는 선언 capability와 server identity를 기록할 수 있다.
- Call Hierarchy capability는 정적 등록뿐 아니라 dynamic registration이 가능하므로 initialize 시점의
  boolean만으로 전체 session availability를 단정하면 안 된다.
- [VS Code API](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider)는 여러 extension의
  provider를 editor가 중개하지만 실행된 provider의 extension ID나 버전을 command 호출자에게 반환하지 않는다.
- LSP에는 indexing 완료를 모든 서버에 공통으로 요구하는 신호가 없다. work-done progress는 작업 상태 전달
  수단이지 전체 workspace의 의미적 index 완전성을 보장하는 지표가 아니다.
- provider 지원 여부는 세 축으로 나눠야 한다: 실행 가능성(availability), protocol/capability 호환성,
  해당 프로젝트에서의 의미적 coverage. 하나의 `provider_unavailable` 또는 `complete`로 합치면 복구 방법이 사라진다.

## 대안 검토와 결정

1. **현재 문자열 limitation만 확장**: 하위 호환은 쉽지만 machine-readable 원인·범위 표현이 부족하다.
2. **`complete`를 제거하고 새 boolean으로 교체**: 의미는 명확하지만 schema v1 소비자를 즉시 깨뜨린다.
3. **기존 필드를 유지하고 구조화된 `coverage`를 추가**: 점진적 migration이 가능해 권장한다.
4. **Extension provider를 설치 extension 목록으로 추측**: 잘못된 attribution 가능성이 있어 하지 않는다.

## 권장 대응

- `provider`와 `coverage`를 분리한다.
  - `provider`: host(`vscode`/`lsp`), name/version 또는 `unknown`, requested/detected languageId,
    `selectedBy`(`bundled | auto | preset | project | custom | vscode`)와 advertised/observed capability
  - `provider.lifecycle`: `discovery | launch | initialize | indexing | capability | query` 단계와 마지막 상태
  - `coverage.traversal`: `complete | depth-limited | node-limited | timeout | failed`
  - `coverage.semantic`: `static-only | augmented`, 포함된 evidence source 목록
  - `coverage.indexing`: `ready | working | unknown`, 단 provider가 명시적 신호를 줄 때만 `ready`
- 기존 `complete`와 string `limitations`는 schema v1 동안 유지하고 새 구조의 projection으로 생성한다.
- Extension은 provider 이름을 꾸며내지 않고 `host: vscode`, `name: unknown`, document languageId와
  `identity_unavailable_through_vscode_api` limitation을 제공한다.
- CLI는 initialize `serverInfo`, static capability와 session에서 실제 성공한 request를 구분해 기록한다.
- CLI는 알려진 언어에서 호환 provider를 찾지 못하면 다른 언어 bundled provider로 fallback하지 않는다.
- process 오류는 command 전체나 secret을 노출하지 않으면서 executable basename, version, exit/signal,
  실패 단계와 drain된 stderr tail을 구조화한다.
- 사용자 메시지는 “caller 없음”과 “provider 준비/지원 실패”를 절대로 같은 empty graph로 표현하지 않는다.

## 단계별 계획

### 1단계 — 용어와 schema

1. traversal, provider capability, indexing과 semantic coverage 용어를 ADR 수준으로 정의한다.
2. `coverage` JSON 구조와 Extension 내부 type을 작성한다.
3. 기존 `complete`, `truncated`, `analysisState`, `limitations` mapping 표를 만든다.
4. schema v1 additive 변경과 향후 v2 제거 후보를 문서화한다.

종료 조건: 가능한 상태 조합과 금지된 모순 상태가 표와 tests로 정의된다.

### 2단계 — CLI provider 관측

1. initialize serverInfo와 capabilities 원문 중 필요한 필드만 정규화한다.
2. dynamic registration을 받을 수 있도록 JSON-RPC server-request/registration 처리 기반을
   `IL-LIM-005`와 조율한다.
3. prepare/incoming/diagnostics의 실제 성공 여부를 observed capability로 누적한다.
4. provider discovery, language mismatch, launch, initialize, capability, indexing과 query error를 별도 code로 유지한다.
5. child stdio close까지 bounded하게 기다리고 redacted stderr tail을 보존한다.

종료 조건: mock server 상태별 provider/coverage snapshot이 기대값과 일치한다.

### 3단계 — Extension 표현

1. document languageId, VS Code version과 command 성공/실패를 provider metadata에 기록한다.
2. provider identity가 공개 API에서 불명임을 명시하고 추측하지 않는다.
3. Graph header, Explorer empty state와 status tooltip에 traversal/semantic 상태를 분리한다.

종료 조건: 정상 empty, provider unavailable과 partial graph가 서로 다른 UI 상태를 가진다.

### 4단계 — 문서와 Plugin 계약

1. CLI schema, skill의 limitation 해석 규칙과 README 용어를 통일한다.
2. Agent가 `complete: true`만 보고 “영향 없음”으로 결론 내리지 않는 예시를 추가한다.
3. provider/version별 fixture 결과를 개발 문서에 기록한다.

종료 조건: Extension, CLI와 두 Plugin이 동일한 coverage 의미를 사용한다.

## 예상 변경 영역

- `src/types.ts`, `src/impactAnalyzer.ts`, `src/controller.ts`: Extension provider/coverage 상태
- `src/graphPanel.ts`, `src/impactTreeProvider.ts`: 상태 표현
- `cli/src/types.ts`, `cli/src/lspProvider.ts`, `cli/src/impact.ts`: provider 관측과 coverage 생성
- `cli/src/jsonRpc.ts`: dynamic registration/server request 기반
- `cli/schemas/response.schema.json`: additive `coverage` 계약
- Plugin skill/CLI contract, README와 INSTALL의 용어

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| schema | complete/partial/failed 상태 matrix | 모순 상태가 거부되고 기존 필드는 일관되게 projection됨 |
| mock LSP | serverInfo 유무와 capability 조합 | unknown을 허위 값 없이 보존함 |
| mock LSP | dynamic registration 전후 | observed availability가 session 상태를 반영함 |
| process | initialize 전 stderr 출력 후 exit | 단계·exit와 stderr tail이 보존되고 secret은 redaction됨 |
| language | provider 없는 `.py` 요청 | TypeScript server를 실행하지 않고 provider 필요 상태를 반환함 |
| Extension | empty·partial·provider failure | 서로 다른 안내와 해결 조치를 표시함 |
| Plugin | `complete: true` + static limitation | Agent 응답이 런타임 완전성을 주장하지 않음 |
| 회귀 | 기존 schema v1 fixture | additive 변경 뒤에도 기존 필수 필드가 동일함 |

## rollout과 관측

- 첫 release는 additive field와 UI 문구만 추가하고 기존 필드를 제거하지 않는다.
- debug log에는 provider name/version, capability와 요청별 시간만 기록하며 source 내용은 기록하지 않는다.
- schema 소비자가 새 field를 채택할 시간을 확보한 뒤 v2 제안에서 `complete` 이름 변경을 검토한다.
- Extension provider identity가 공식 API로 제공되기 전에는 `unknown`을 정상 상태로 취급한다.
- 새 세부 error code를 Plugin이 채택하기 전에도 기존 exit code 5와 envelope는 유지한다.
- rollback은 새 coverage UI를 숨겨도 기존 limitation/complete 출력이 남도록 구성한다.

## 미해결 질문

- structured limitation을 `coverage.reasons[]`로 둘지 기존 top-level limitation object로 확장할지 결정해야 한다.
- dynamic registration까지 CLI v1에서 지원할지 `IL-LIM-005`와 같은 release로 묶을지 조율이 필요하다.
- indexing `unknown`을 UI warning으로 표시하면 과도한 경고가 되는지 사용자 검증이 필요하다.

## 구현 결과

- 구현 계획과 검증 근거: [`docs/work/task-provider-coverage-transparency.md`](../../work/task-provider-coverage-transparency.md)
- 공통 계약: [`docs/development-management/provider-coverage-contract.md`](../provider-coverage-contract.md)
- CLI는 schema v1 기존 field를 유지하면서 provider/coverage를 추가했고, bundled TypeScript provider의
  언어 불일치 실행을 차단한다.
- Extension은 VS Code가 provider identity를 공개하지 않는 사실을 `unknown`과 limitation으로 보존하고
  Graph/Explorer/status에 static coverage를 표시한다.
- bundled TypeScript, fake traversal, VS Code broker, Python discovery 실패, process exit와 capability 없음
  fixture가 자동 테스트에 포함됐다.
- dynamic registration, provider별 indexing readiness와 외부 언어 정상 E2E는 제외 범위대로 후속
  `IL-LIM-004/005/006/014/015/016`에 남는다.
- 수용 기준은 구현과 자동 검증 기준으로 충족했지만 관리 규칙상 구현 PR이 아직 없으므로 상태는
  `In progress`로 유지한다. PR 생성·병합 시 검증 결과와 링크를 연결하고 `Done`으로 전환한다.
