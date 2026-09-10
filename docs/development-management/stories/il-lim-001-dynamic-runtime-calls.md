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

> **2026-09-10 정정(M4 gate 1 대조, `docs/work/task-m4-gate1-story-contract-corrections.md`)**: 위
> 다섯 기준 중 **1번과 5번은 "통과/미통과" 한 글자로 잘리지 않는다** — 어느 쪽으로 잘라 적어도 사실과
> 어긋나서, 판정 근거를 여기 명시한다.
>
> **1번("정적, 추론, 외부 관측 관계가 모델과 출력에서 구별된다")의 "외부 관측"은 예약된 값이다.**
> `cli/src/types.ts`의 `AUGMENTED_EDGE_SOURCES`에 `runtime-observation`이 선언돼 있지만, 이 값을
> 만들어 내는 코드가 저장소 전체에 **없다**(선언 한 줄 외에 producer·consumer·test 0건, 직접 확인).
> 유일한 producer는 이 story의 **4단계(trace import)**이고, 4단계는 자기 종료 조건에 "보안 검토와 실제
> 수요가 확인된 경우에만 별도 구현 Issue로 승격"이라고 적어 **설계상 미뤄** 뒀다 — 즉 이건 M4가 못 한
> 일이 아니라 **하지 않기로 정해 둔 일**이다. 정적(`edges`)과 추론(`data.augmentedEdges`,
> `source: 'static-inference'`) 두 갈래는 실제로 구별된다.
>
> **값은 계약에서 빼지 않는다.** JSON enum에서 값을 제거하는 것이 나중에 값을 추가하는 것보다 소비자에게
> 더 큰 사건이고(그 값을 이미 옵션으로 다루던 코드는 값이 사라질 때 깨지지만, 새 값이 생기는 건 대부분의
> 소비자에게 무해하다), 이 저장소는 같은 모양의 문제를 이미 한 번 같은 방향으로 풀었다 —
> `resolution: 'multiple'`을 2026-09-04 정정이 "코드는 유지하되 gate 대상에서 뺀다"로 처리했다.
>
> **대신 "현재 어떤 경로도 이 값을 생산하지 않는다"는 사실 자체를 실행으로 지키는 장치를 둔다.**
> `stateReachability*.test.ts`가 이미 `AnalysisObservations`의 각 필드에 대해 정확히 같은 감사(producer가
> 있는가 없는가를 분류)를 하고 있으므로, **새 harness를 만들지 말고 그것을 `AugmentedEdgeSource`까지
> 확장한다** — 같은 패턴을 두 번 발명하지 않는 것이 이 저장소 자신의 관례다. 그러면 4단계가 언젠가
> producer를 만드는 순간 그 테스트가 먼저 깨져서, 이 문단이 조용히 낡는 일이 없다.
>
> **5번("지원 후보 언어마다 대표 dynamic-dispatch gap ... fixture로 기록된다")은 아래 테스트 계획 표의
> 같은 날짜 정정과 함께 읽어야 한다** — 이 기준이 실제로 구속하는 언어 집합이 그 표에 적힌 것과 다르고,
> 실제 공백도 "있다/없다"가 아니라 **근거의 층**이다.

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

> **2026-09-03 정정(M4 stage 1, `docs/work/task-m4-stage1-evidence-contract.md`)**: 아래 두 항목이
> **뒤집혔다** — 원문은 보존하고 이 정정으로 대체 방향을 남긴다.
>
> 1. *"CLI schema는 기존 `source`/`target`을 유지하면서 optional `evidence[]`를 추가해 하위 호환을
>    우선한다"* — **하위 호환이 아니라고 판단했다.** 이 저장소가 이미 같은 문제를 푼 선례
>    (`limitations` vs `limitationDetails`, `cli/src/coverage.ts`의 `V1_WITHHELD_REASON_CODES`)를
>    직접 읽으면, 오늘 `edges`를 전수로 읽는 소비자는 그 배열의 모든 항목을 확정 관계로 취급한다.
>    새 optional 필드 하나를 기존 항목에 얹는 것은 "필드 추가"가 아니라 **그 소비자에게 배열
>    전체의 의미를 조용히 바꾸는 것**이다. 대신 `data.augmentedEdges`라는 완전히 새 top-level
>    필드를 쓴다 — `edges`는 M4로 인해 단 하나의 값도 안 바뀐다.
> 2. *"기존 LSP edge를 `language-server/confirmed` evidence로 변환한다"* — **하지 않는다.** `edges`의
>    기존 항목을 M4의 어휘로 재분류(retag)하는 것 자체가 그 항목들의 기존 의미를 재정의하는
>    행위이고, 위 1번과 같은 이유로 위험하다. `edges`는 M4 이전과 이후가 완전히 동일하게 유지된다
>    — provider가 준 edge는 M4 도입 전과 똑같이 아무 confidence 라벨 없이 그대로 있다.
> 3. *"graph identity는 기존 symbol ID를 유지한다"*(아래 "동일 source/target edge에 여러
>    evidence를 보존하고" 문장) — **하지 않는다.** `ImpactEdge`/CLI edge는 둘 다 `source`/`target`이
>    `nodes[].id`를 가리키는 bare ID이고, `src/impactTreeProvider.ts`의 `getChildren()`은
>    `nodes` 전체를 provenance 구분 없이 순회·렌더링한다 — LSP가 한 번도 순회하지 못한 순수 추론
>    symbol을 "기존 symbol ID 체계"에 편입시키면(=`nodes`에 새 entry) 그 심볼이 옛 소비자의
>    tree에 아무 표시 없이 나타난다. 대신 `augmentedEdges`의 endpoint는 **self-contained**
>    (`name`/`kind`/`file`/`range`를 그 entry 자신이 직접 보유)로 표현하고, `data.nodes`에는
>    항목을 추가하지 않는다.
>
> `EdgeEvidence`의 나머지 필드 모양(`adapterId`/`adapterVersion`/`evidenceRanges`/`reasonCode`)은
> 유효하고 그대로 쓴다 — `confidence: confirmed|inferred|observed`만 `source`(출처)와
> `resolution`(확실성, `single`/`multiple` — `confirmed`는 쓰지 않는다) 두 축으로 분리해 대체한다.
> 자세한 근거는 work document 참고.

- 공통 `EdgeEvidence` 모델을 먼저 정의한다.
  - `source`: `language-server | static-inference | runtime-observation`
  - `adapterId`와 `adapterVersion`: 관계를 만든 구현과 버전
  - `confidence`: `confirmed | inferred | observed`
  - `evidenceRanges`: 등록·호출·trace 근거 위치
  - `reasonCode`: 예를 들어 `callback-registration`, `event-subscription`
- 동일 source/target edge에 여러 evidence를 보존하고, ~~graph identity는 기존 symbol ID를
  유지한다~~(정정됨, 위 참고 — 새 symbol은 `nodes`에 편입되지 않고 augmented edge 안에
  self-contained로 표현된다).
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

> **2026-09-03 정정(M4 stage 1)**: 2번은 위 "권장 대응" 정정과 같은 이유로 하지 않는다. `IL-LIM-001`이
> 정의하는 새 `EdgeEvidence` 계약은 `data.augmentedEdges`(새 top-level 필드)의 항목에만 붙고, 기존
> `edges`는 이 단계에서 손대지 않는다 — "기존 LSP edge를 변환"할 대상 자체가 없다.

1. Extension·CLI edge의 공통 개념과 JSON schema 변경안을 설계한다.
2. ~~기존 LSP edge를 `language-server/confirmed` evidence로 변환한다.~~ (정정됨, 위 참고)
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

> **2026-09-10 확인(M4 gate 1 대조)**: 위 "선정한 두 패턴"의 **현재 상태를 명시한다.** 이 정정을 쓰는
> lane이 처음에 "event subscription은 실측으로 불가능 판정됐다"고 적으려다 reviewer의 반박으로
> 바로잡은 부분이라, 같은 오독이 다시 생기지 않도록 남긴다.
>
> **event subscription 패턴은 구현돼 있다.** `dynamic-callback-static-v1`이 `addEventListener`(DOM)
> 경로를 `reasonCode: event-subscription`으로 실제로 만들고, 통과하는 통합 테스트가 존재한다
> (`cli/src/test/dynamicCallbackIntegration.test.ts`, `"button.addEventListener('click', handler):
> reasonCode event-subscription"`). 빠진 것은 **패턴이 아니라 그 패턴의 구현체 하나** — Node
> `EventEmitter`의 `emitter.on(...)`이다. `prepare()`가 `emitter` 변수 위에서 빈 배열을 돌려줘 재확인
> 축이 성립하지 않기 때문인데, **왜 그런지는 아직 원인 미확인이다** — 세 위치에서 실측했고 대조군까지
> 확인했지만 원인은 못 밝혔다(추정하지 않는다. 같은 테스트 파일이 이 사실을 그대로 테스트 이름에 적어
> 뒀다: `"capability absence - EventEmitter.on does not resolve via prepare() the way addEventListener
> does (unexplored why, not needed for v1)"`).
>
> 따라서 **수용 기준 2번("최소 2개 동적 호출 유형")은 충족된다** — `dynamic-callback-static-v1`의
> 허용목록이 지연·예약 호출, 이벤트 구독, 고차함수 순회 세 계열을 덮고 양성·부정 fixture가 둘 다 있다.
> 남는 `EventEmitter.on()` 하나는 이 기준의 미충족 사유가 아니라 **원인 미확인 상태로 기록된 구현체
> 공백**이다.

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

> **2026-09-10 정정(M4 gate 1 대조, `docs/work/task-m4-gate1-story-contract-corrections.md`)**: 위 표의
> **"언어 matrix" 행이 이 저장소의 실제 상태와 두 방향으로 어긋난다.** 원래 행은 위에 그대로 두고 여기서
> 다시 적는다. 수용 기준 5번을 판정하는 근거는 원래 행이 아니라 이 정정이다.
>
> **(1) 표가 이름 댄 네 언어 중 둘은 M4 안에서 원리적으로 불가능하다.** `cli/src/providers/catalog.ts`에
> 실재하는 preset은 TS/JS·Go·Python·C/C++ 넷뿐이고, **Swift와 Kotlin은 분석할 provider 자체가 없다.**
> 이건 노력으로 좁힐 수 있는 공백이 아니라 `IL-LIM-002` 5단계(Spring adapter가 Java/Kotlin 언어 지원을
> 기다리는 것)와 **같은 구조의 이월**이다. 두 언어의 gap fixture는 `IL-LIM-015`(Swift)/
> `IL-LIM-016`(Kotlin)이 닫힐 때 그 story의 gate로 이어받는다. **이 기준이 M4 안에서 구속하는 언어
> 집합은 preset이 실재하는 넷이다.**
>
> **(2) 표가 이름조차 대지 않은 두 언어가 M4 안에서 도달 가능하다 — Go와 Python.** 둘 다 preset이
> 실재하는데(gopls, pyright) 표에 없어서 **표만 보고 판정하면 이 둘의 상태가 보이지 않는다.**
> Swift/Kotlin만 이월로 적고 이 둘을 안 적으면 "이름 댄 넷 중 둘만 못 했다"로 읽히고, 실제로 할 수
> 있는 쪽이 조용히 빠진다.
>
> **(3) 그리고 실제 공백은 "있다/없다"가 아니라 근거의 층이다.** 다섯 언어 **전부** `catalog.ts`의
> `docs.limitations`에 dynamic-dispatch gap이 문장으로 적혀 있다. 갈라지는 건 그 문장 뒤에 무엇이
> 있느냐다(전부 직접 확인):
>
> | 언어 | gap 문서화 | 근거 인용 | 반복 검증 fixture |
> | --- | --- | --- | --- |
> | C — function pointer | 있음 | 직접 probe(Apple clangd 17.0.0), **1회성** | **없음** |
> | C++ — virtual dispatch | 있음 | 직접 probe, 버전 3종 교차 | **있음** — `clangdIntegration.test.ts`, 버전 분기까지 |
> | Go | 있음(reflection·runtime dispatch) | stage 2 직접 probe 인용 | **없음**(1회성 probe) |
> | Python | 있음(reflection·runtime dispatch) | **없음** — 같은 preset의 framework gap 줄은 실제 계측까지 했지만 이 줄은 근거 인용이 없다 | **없음** |
> | TS/JS | 있음(한 줄) | **없음** | **없음** |
>
> **위 두 행은 원래 "C" 한 행으로 뭉쳐 "fixture 있음"이라고 적혀 있었다 — 그것이 틀렸다는 것을
> reviewer가 잡았고 직접 재확인했다.** `clangdIntegration.test.ts`가 덮는 것은
> method/overload/virtual-dispatch뿐이고, **function pointer는 그 lane의 범위 밖이라고 그 파일 자신이
> 적어 뒀다.** 즉 C의 function pointer는 Go의 "직접 probe 1회, fixture 없음"과 **증거 강도가 완전히
> 같다.** 뭉쳐 적은 표는 같은 기준을 C에는 관대하게, Go에는 엄격하게 적용하고 있었다.
>
> **그 과정에서 새 사례가 하나 더 나왔다** `[층 2]`: `clangdIntegration.test.ts`의 주석은 function
> pointer가 "already fixture-backed differently, see the story doc"이라고 적지만, 실제로 `IL-LIM-014`가
> 대는 근거는 **fixture가 아니라 1회성 probe**다. 이 저장소가 이미 세 건 기록해 둔 **"주석이 주장하는
> 보장과 코드가 실제로 하는 일이 어긋난 사례"의 네 번째**다.
>
> **정확히 세면, 다섯 언어의 다섯 gap 줄 중 반복 검증되는 것은 C++ virtual dispatch 하나뿐이다.**
>
> **그리고 그 하나는, 반복 검증으로 바꾸는 순간 주장이 틀렸다는 게 드러난 바로 그 줄이다.** 원래 문구는
> derived override에 caller가 **"never"** 붙지 않는다고 단언했는데, 1회성 probe를 반복 fixture로 바꾸자
> 첫 3-OS CI 실행이 세 OS에서 동일하게 실패했다 — upstream clangd 22.1.7/23.1.0/23.1.1은 **붙인다.**
> Apple clangd 17.0.0을 잰 probe가 틀린 게 아니라, **버전을 안 밝힌 "never"가 과장이었다.**
>
> 이 사실이 나머지 네 줄에 대해 말하는 바는 분명하다: **반복 검증으로 바꿔 본 표본이 1건이고, 그 1건이
> 곧바로 뒤집혔다.** 검증되지 않은 네 줄이 지금 참이라고 믿을 근거는 없다.
>
> **가장 약한 칸이 TS/JS라는 것이 이 표의 가장 불편한 부분이다** — 이 마일스톤이 두 번째 adapter를 실제로
> 만든, 가장 많이 작업한 언어인데 그 언어의 gap 근거가 다섯 중 가장 얇다.
>
> **따라서 이 기준은 문서만 고쳐서 닫을 수 없다.** 이 정정의 초안은 "fixture 대량 생산이 아니라 약한 층을
> 올린다"고 적었는데, 위 재계산 뒤에는 그 표현이 헐겁다 — 다섯 중 넷이 fixture가 없는 상태에서 "층을
> 올린다"는 사실상 "fixture를 만든다"와 같은 말이다. 요구를 명시적으로 적는다: **각 언어의 대표 gap 줄
> 최소 하나를 `C++ virtual dispatch`가 이미 도달한 수준(직접 probe + 자동 재검증되는 fixture)까지
> 끌어올린다.** 어느 gap을 대표로 삼을지와 순서는 gate 1 판정 lane이 정하되, **문서 문구만 손보고 닫는
> 것은 이 기준을 충족하지 않는다.**

## rollout과 관측

- 1차 release에서는 provenance 필드만 추가하고 추론 adapter는 기본 비활성화한다.
- 2차에서 실험 설정으로 adapter별 opt-in을 제공하고 graph header에 inferred edge 수를 표시한다.
- 사용자 코드나 symbol 이름을 전송하지 않고 로컬 debug output에 adapter 시간, 후보·채택·거부 수만 남긴다.
- 오탐 fixture 또는 성능 budget을 만족하지 못한 adapter는 기본 활성화하지 않는다.
- rollback은 adapter flag 비활성화로 가능하며 LSP-only 경로는 항상 유지한다.

## 미해결 질문

- 첫 언어와 callback API를 TypeScript/Node로 한정할지, Python callable까지 함께 다룰지 결정이 필요하다.
- ~~`observed` edge가 `confirmed`보다 강한 근거인지 별도 축으로 표현할지 UX 검토가 필요하다.~~
  **2026-09-03 정정(M4 stage 1)**: `confirmed`가 이 스토리의 어휘에서 빠지면서(위 "권장 대응" 정정)
  이 질문의 원래 형태는 성립하지 않는다. 새 모델에서 `source`(어디서 왔는가:
  `static-inference`/`runtime-observation`)와 `resolution`(target이 몇 개로 좁혀지는가:
  `single`/`multiple`)은 독립 축이라, "어느 쪽이 더 강한 근거인가"라는 단일 서열 질문 자체가 이
  구조에서는 다시 묻지 않아도 된다 — `runtime-observation` source에도 `single`/`multiple`
  resolution이 둘 다 있을 수 있고, `static-inference`도 마찬가지다. `runtime-observation`은
  `IL-LIM-001` 4단계가 이미 별도 승인 필요 사항으로 미뤄 뒀으므로(승인 전에는 구현되지 않음)
  실제로 두 source가 공존하는 시점은 이 마일스톤 밖일 가능성이 높다.
- ~~추론 graph가 depth/node budget을 공유할지 별도 budget을 가질지 benchmark 후 결정해야
  한다.~~ **2026-09-03 정정(M4 stage 1)**: 이 lane이 해소했다 — **공유하지 않는다. 추론 탐색은
  완전히 별도의 budget을 쓴다.** 근거: static traversal의 `facts.limits`(`cli/src/coverage.ts`)
  하나가 `completion`/`complete`/`truncated`/`traversalLimits`/`coverage.traversal.status`
  다섯 곳을 동시에 결정한다 — 공유하면 정적 부분이 완전히 끝났어도 augmentation이 같은 budget을
  나눠 쓰다 소진되는 순간 이 다섯 필드가 augmentation 때문에 뒤집힌다(`complete: true→false` 등).
  `complete`/`truncated`는 `IL-LIM-009`가 존재하는 이유이자 M1·M2가 여러 라운드에 걸쳐 지킨
  의미라, 이게 augmentation 때문에 뒤집히는 건 benchmark로 정할 성능 트레이드오프가 아니라 구조적
  안전성 문제였다. augmentation이 자기 budget을 소진하면 augmentation만 degrade되고 별도
  limitationDetail로 보고한다 — static 결과에는 영향이 없다. 자세한 근거는
  `docs/work/task-m4-stage1-evidence-contract.md` 참고.
