# IL-LIM-001 동적·런타임 호출 관계 보완

- 상태: Backlog
- 우선순위: P0
- 완료 마일스톤: [M4 — 동적 호출·DI·테스트 의미 보완](../milestones/m4-semantic-augmentation.md)
- 영향도: 매우 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

현재 분석은 정적 Call Hierarchy만 사용한다. reflection, 문자열 기반 import·호출, callback 등록,
event bus와 런타임 dispatch가 provider 결과에 없으면 실제 caller가 그래프에서 누락되어 영향 범위를
과소평가할 수 있다.

## 사용자 스토리

코드 변경을 검토하는 개발자로서 정적 분석 밖의 호출 가능성을 별도 근거와 함께 확인하여,
그래프에 보이지 않는 런타임 관계를 실제 부재로 오판하지 않고 싶다.

## 범위

- 확정된 Call Hierarchy edge와 추론·외부 제공 edge를 구분하는 provenance 모델을 설계한다.
- 우선 지원할 동적 관계 유형과 언어별 탐지 전략을 조사하고 오탐·미탐 기준을 정의한다.
- 보조 관계를 명시적으로 켜고 끌 수 있으며 UI와 JSON에서 출처와 신뢰도를 표시한다.

## 제외 범위

- 모든 언어의 런타임 실행을 완전히 재현하는 범용 분석기
- 근거가 없는 관계를 확정 호출로 표시하는 동작

## 수용 기준

- [ ] 정적, 추론, 외부 관측 관계가 모델과 출력에서 구별된다.
- [ ] 최소 2개 동적 호출 유형의 fixture에 대해 탐지 결과와 오탐 기준이 검증된다.
- [ ] 보조 분석 실패가 기존 정적 그래프를 실패시키지 않는다.
- [ ] 미지원 동적 관계가 limitation과 사용자 문서에 명시된다.
- [ ] 지원 후보 언어마다 대표 dynamic-dispatch gap과 확정할 수 없는 이유가 fixture로 기록된다.

## 검증

- 확정 edge와 추론 edge가 혼합된 graph/JSON contract 테스트
- 기능 비활성화 시 기존 결과가 보존되는 회귀 테스트
- 대표 fixture의 precision·recall 결과 기록

## 의존성 및 위험

- `IL-LIM-003`의 provider/provenance 표현을 선행하는 것이 좋다.
- 오탐은 잘못된 영향 범위를 만들 수 있으므로 추론 결과를 확정 관계와 시각적으로 분리해야 한다.

## 현재 기준선

- Extension의 `src/impactAnalyzer.ts`는 `vscode.prepareCallHierarchy`와
  `vscode.provideIncomingCalls` 결과만 `traverseIncoming`에 전달한다.
- CLI의 `cli/src/lspProvider.ts`도 `textDocument/prepareCallHierarchy`와
  `callHierarchy/incomingCalls`만 호출한다.
- `src/types.ts`와 `cli/src/impact.ts`의 edge에는 출처, 신뢰도 또는 근거 종류가 없다.
- CLI는 모든 정상 분석에 `dynamic_calls_not_inferred` limitation을 추가하지만 어떤 동적 패턴이
  누락될 수 있는지는 구분하지 않는다.

## 조사 결과

- [LSP 3.17 Call Hierarchy](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#callHierarchy)는
  호출자 item과 call-site range를 반환하지만 edge의 정적·추론·관측 출처나 신뢰도를 표현하지 않는다.
- [VS Code Call Hierarchy API](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyProvider)도
  같은 구조를 노출하므로 Extension에서 추가된 관계를 기존 응답인 것처럼 섞으면 출처를 복원할 수 없다.
- [gopls 공식 Call Hierarchy 설명](https://go.dev/gopls/features/navigation#call-hierarchy)은 결과를
  정적 호출 graph로 정의하고 동적 호출은 실용적으로 분석하기 어려워 포함하지 않는다고 명시한다.
  이는 특정 provider 교체만으로 본 한계가 사라지지 않음을 보여준다.
- 언어 AST는 호출 표현을 찾는 데는 유용하지만 이름 해석과 실제 실행 대상 확정은 별도 문제다.
  예를 들어 [Python AST](https://docs.python.org/3/library/ast.html#ast.Call)는 호출의 문법 구조만 제공한다.
- 언어별 대표 gap도 서로 다르다. C는 function pointer, C++은 virtual dispatch·function object, Swift는
  protocol existential·closure·Objective-C selector, Kotlin은 interface dispatch·lambda·reflection이 있다.
  compiler/LSP를 정상 연결해도 runtime receiver나 등록 상태가 없으면 하나의 확정 target으로 환원되지 않는다.

## 대안 검토와 결정

1. **Call Hierarchy 결과만 유지**: 오탐 위험은 가장 낮지만 현재 미탐을 줄이지 못한다.
2. **언어별 추론 edge를 확정 edge로 병합**: 구현은 단순하지만 사용자가 결과를 과신하므로 제외한다.
3. **provenance가 있는 보조 edge 계층 도입**: 모델 변경이 필요하지만 정적·추론·관측 관계를 안전하게
   함께 제공할 수 있다. 이 방식을 권장한다.
4. **프로그램을 자동 실행해 trace 수집**: 정확한 관측 근거가 될 수 있지만 임의 코드 실행과 coverage
   편향 위험이 있으므로 자동 실행은 제외하고, 향후 사용자가 제공한 trace의 import만 검토한다.

## 권장 대응

- 공통 `EdgeEvidence` 모델을 먼저 정의한다.
  - `source`: `language-server | static-inference | runtime-observation`
  - `adapterId`와 `adapterVersion`: 관계를 만든 구현과 버전
  - `confidence`: `confirmed | inferred | observed`
  - `evidenceRanges`: 등록·호출·trace 근거 위치
  - `reasonCode`: 예를 들어 `callback-registration`, `event-subscription`
- 동일 source/target edge에 여러 evidence를 보존하고, graph identity는 기존 symbol ID를 유지한다.
- 보조 분석은 기본 정적 결과를 감싸는 `AugmentedIncomingProvider` 형태로 구성하고 adapter 실패를
  부분 limitation으로 격리한다.
- 첫 구현 후보는 이름 해석이 가능한 명시적 callback 전달과 event subscription 두 종류로 제한한다.
  문자열 이름, reflection과 framework DI는 별도 adapter 또는 `IL-LIM-002`에서 다룬다.
- `IL-LIM-014`~`016`의 E2E fixture는 direct call baseline과 위 dynamic gap을 함께 저장한다. provider가
  conservative candidate를 반환해도 `language-server` evidence로 보존하되 runtime 확정으로 승격하지 않는다.
- UI는 확정 관계를 기본 표시하고 inferred/observed edge는 별도 선 스타일, badge와 filter로 표시한다.
- CLI schema는 기존 `source`/`target`을 유지하면서 optional `evidence[]`를 추가해 하위 호환을 우선한다.

## 단계별 계획

### 1단계 — provenance 계약

1. Extension·CLI edge의 공통 개념과 JSON schema 변경안을 설계한다.
2. 기존 LSP edge를 `language-server/confirmed` evidence로 변환한다.
3. 여러 evidence의 정렬, deduplication과 serialization 규칙을 정의한다.
4. 기존 소비자가 새 optional 필드를 무시해도 동작하는지 contract fixture로 확인한다.

종료 조건: 보조 adapter 없이 기존 graph가 동일하고 모든 edge의 출처를 설명할 수 있다.

### 2단계 — 정적 추론 adapter SPI

1. workspace, root symbol과 현재 graph를 입력받는 adapter interface를 만든다.
2. adapter별 timeout, 취소, 파일 수와 결과 수 budget을 둔다.
3. adapter 오류를 `inference_adapter_failed:<id>` limitation으로 변환한다.
4. feature flag와 언어·workspace별 enable 설정을 추가한다.

종료 조건: fake adapter의 결과·실패·timeout을 Extension과 CLI에서 동일하게 병합한다.

### 3단계 — 제한된 callback/event 추론

1. 지원 언어와 API pattern을 하나씩 선정하고 positive/negative fixture를 먼저 만든다.
2. definition/reference provider로 callback symbol을 해석하며 이름 일치만으로 연결하지 않는다.
3. 등록 지점을 caller evidence로 추가하고 `inferred`로 표시한다.
4. fixture별 precision·recall과 탐색 비용을 기록해 기본 활성화 여부를 결정한다.

종료 조건: 선정한 두 패턴에서 정해진 정확도 기준을 충족하고 일반 코드의 오탐 fixture가 통과한다.

### 4단계 — 관측 edge import 검토

1. trace import의 최소 JSON 계약과 workspace/symbol mapping 전략을 설계한다.
2. 사용자가 명시적으로 제공한 trace만 읽고 프로그램은 실행하지 않는다.
3. 관측되지 않은 관계를 부재로 해석하지 않도록 run metadata를 보존한다.

종료 조건: 보안 검토와 실제 수요가 확인된 경우에만 별도 구현 Issue로 승격한다.

## 예상 변경 영역

- `src/types.ts`, `src/impactAnalyzer.ts`, `src/callGraph.ts`: evidence 모델과 병합
- `src/graphPanel.ts`, `src/impactTreeProvider.ts`: inferred/observed 표시와 filter
- `cli/src/types.ts`, `cli/src/impact.ts`: adapter SPI와 JSON 출력
- `cli/schemas/response.schema.json`: optional edge evidence 계약
- `src/test/`, `cli/src/test/`: provenance, adapter 격리와 정확도 fixture
- `README.md`, `cli/README.md`: 지원 패턴과 오탐·미탐 경계

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| 단위 | 동일 edge의 LSP·추론 evidence 병합 | edge는 하나이고 evidence가 결정적 순서로 모두 보존됨 |
| 단위 | adapter timeout·예외 | 정적 graph는 유지되고 adapter limitation만 추가됨 |
| 통합 | 명시적 callback과 event subscription | 기대 caller와 근거 range가 inferred로 표시됨 |
| 언어 matrix | C pointer, C++ virtual, Swift protocol/closure, Kotlin interface/lambda | provider 원본·추론·미지원이 구분됨 |
| 부정 | 같은 이름, 다른 scope·문자열 callback | 확정 또는 inferred edge가 생성되지 않음 |
| 계약 | 기존 schema consumer | 새 optional 필드가 기존 필드를 변경하지 않음 |
| 성능 | 중간 규모 workspace | 설정한 파일·시간 budget 안에서 종료하고 취소 가능 |

## rollout과 관측

- 1차 release에서는 provenance 필드만 추가하고 추론 adapter는 기본 비활성화한다.
- 2차에서 실험 설정으로 adapter별 opt-in을 제공하고 graph header에 inferred edge 수를 표시한다.
- 사용자 코드나 symbol 이름을 전송하지 않고 로컬 debug output에 adapter 시간, 후보·채택·거부 수만 남긴다.
- 오탐 fixture 또는 성능 budget을 만족하지 못한 adapter는 기본 활성화하지 않는다.
- rollback은 adapter flag 비활성화로 가능하며 LSP-only 경로는 항상 유지한다.

## 미해결 질문

- 첫 언어와 callback API를 TypeScript/Node로 한정할지, Python callable까지 함께 다룰지 결정이 필요하다.
- `observed` edge가 `confirmed`보다 강한 근거인지 별도 축으로 표현할지 UX 검토가 필요하다.
- 추론 graph가 depth/node budget을 공유할지 별도 budget을 가질지 benchmark 후 결정해야 한다.
