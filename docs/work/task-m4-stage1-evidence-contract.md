# M4 stage 1 — evidence 계약과 false-positive corpus (설계 게이트, 코드 없음)

- 상태: 완료 — Q1·Q3 결론 즉시 보고(지시대로) 후 commander 승인. Q2(두 축 분리, `confirmed` 제거,
  `single`/`multiple`/edge 없는 `unresolved`)·Q4(false-positive corpus 4건)·Q5(kill switch 검증
  방법) 마저 정리. `il-lim-001`/`il-lim-002` 스토리 문서에 원문 보존 + 정정 blockquote 반영.
- branch: `docs/m4-stage1-evidence-contract`
- 마일스톤: [M4 동적 호출·DI·테스트 의미 보완](../development-management/milestones/m4-semantic-augmentation.md)
- 스토리: IL-LIM-001(동적·런타임 호출), IL-LIM-002(framework DI·라우팅), IL-LIM-010(테스트 탐지)
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m4-stage1-evidence-contract.md`(commander scratchpad)
- **이 lane은 설계 게이트다. adapter·fixture를 구현하지 않는다.**

## 목적과 사용자 가치

M2는 "못 본 것을 못 봤다고 말하는" 문제였고 M4는 "못 본 것을 추론해서 보여주는" 문제다 — 방향이
반대라 실패도 반대다. M2는 빈 결과가 증명된 0으로 읽히는 걸 막았고, M4는 **추측한 edge가 확정된
edge로 읽히는 걸** 막아야 한다. 이 lane이 끝나면 confirmed/candidate/(runtime-only 또는 동등)를
어디에 어떻게 표현할지, M2의 신호와 어떻게 공존할지, 그리고 오탐을 잡을 corpus가 정해진다 — adapter는
그 위에서만 만든다.

## 선례 3개 — 실제로 읽고 인용

1. **`limitations`(v1 string array) vs `limitationDetails`(구조화된 진실)** — `cli/src/coverage.ts`:
   `V1_WITHHELD_REASON_CODES`(주석: "Adding them changes the value of two fields that are already
   deployed, which the additive decision for schemaVersion 1 does not cover on its own")가
   `no_incoming_callers`/`index_state_unknown`/`provider_null_incoming_calls`/
   `compile_database_missing`/`_stale`/`_ambiguous` 6개 코드를 `limitations`에서 걸러낸다.
   `projectCompletion()`이 `limitationDetails`를 먼저 만들고, `reasons = limitationDetails.map(code)
   .filter(withheld 아님)`으로 `limitations`를 **파생**시킨다 — 두 배열이 "우연히 일치하는 둘"이
   아니라 "하나에서 나온 둘"이다(코드 주석 그대로: "the same array, not two arrays that happen to
   agree"). **핵심 교훈**: additive는 "새 필드를 추가했다"만으로 충분하지 않다 — **기존 배열에
   값을 더 넣는 것조차, 그 배열을 전수로 읽는 소비자에게는 의미를 바꾸는 것**이라 새 정보는 아예
   못 보게 걸러내거나 완전히 새 필드로 분리해야 한다.
2. **`advertised` vs `observed`**(`cli/src/types.ts:204-212`) — `advertised: {callHierarchy, diagnostics}`는
   provider가 `initialize` 응답에서 **주장한** capability, `observed: {prepareCallHierarchy,
   incomingCalls, diagnostics}`는 이 세션이 **실제로 확인한** capability다. 옛 필드
   (`callHierarchy`/`diagnostics`, 최상위)는 그대로 있고, 새 소비자만 `advertised`/`observed`를
   따로 읽어 "말했다"와 "확인됐다"를 구분한다.
3. **`languageMatch: boolean | 'unknown'`**(`types.ts:201`) — `.h` 같은 언어 모호 파일에서 `true`/
   `false`로 억지로 답하지 않고 세 번째 값을 신설했다. 기존 두 값의 의미는 안 바뀌었고, 새 값만
   추가됐다(옛 소비자가 `if (languageMatch)`만 본다면 `'unknown'`은 그냥 falsy로 읽히므로 안전).

**추가로 발견한, 이 문제에 직접 쓰이는 선례(commander가 지목한 셋 외)**: `types.ts`의
`SemanticScope`(`'provider-static' | 'static-plus-inference' | 'static-plus-observation' | 'none'`)와
`Coverage.semantic.evidenceSources`, 그리고 `coverage.ts`의 `REQUIRED_EVIDENCE_PREFIX`
(`static-plus-inference`→`'inferred-'`, `static-plus-observation`→`'observed-'` 접두어 강제)와
`semanticScopeDetails()`(이미 `inferred_edges_included`/`observed_edges_included`
`limitationDetail`을 만드는 코드가 존재)가 **M1 때 이미 만들어졌고 지금까지 아무 producer도 쓴 적이
없다** — `grep -rn "static-plus-inference\|static-plus-observation" cli/src`로 producer 0건 확인.
이건 M4를 위해 미리 깔아 둔 배관이다. 아래 결정 1에서 이 배관을 그대로 쓴다.

## 물려받은 M2 corpus — 재조사 없이 인용, 지금 코드와 대조만

| gap | 관측 | 근거(재확인) |
| --- | --- | --- |
| FastAPI `Depends()`/route handler | `incomingCalls` = `null` | `nullIncomingCallsObserved`(`types.ts:342`), `pythonFastapiIntegration.test.ts` — 문구 그대로 확인 |
| C function pointer | 할당 지점만, 간접 호출자 없음 | `catalog.ts` clangd `docs.limitations` — 그대로 확인 |
| C++ virtual dispatch | **clangd 버전에 따라 다름**(17=derived 없음, 22/23/23.1=있음) | `catalog.ts` clangd `docs.limitations`, `clangdIntegration.test.ts` — 그대로 확인, 이 세션이 M2 gate-gaps lane에서 직접 만든 문구라 재확인 용이 |
| Go reflection | `docs.limitations`에 기록 | `catalog.ts` gopls `docs.limitations` — "Calls made only through reflection are not part of the Call Hierarchy result." 그대로 확인 |

인용값 전부 지금 `cli/src/providers/catalog.ts`/`cli/src/types.ts`와 일치함을 직접 grep으로
재확인했다(재조사가 아니라 대조).

## Q1 — 추론 edge를 어디에 두는가 (결정, 즉시 보고 대상)

### 결론

**기존 `data.edges`/`data.nodes`/`limitations`/`limitationDetails`는 M4로 인해 단 하나의 필드도,
단 하나의 값도 바뀌지 않는다.** 새 top-level 필드 `data.augmentedEdges`(가칭, 이름은 stage 2에서
확정)를 신설하고, M4가 만든 edge는 전부 거기에만 들어간다. 항상 존재하되(빈 배열 허용) `edges`와
절대 섞지 않는다.

### 왜 "필드 추가"가 아니라 "배열에 항목 추가"가 위험한지 — 선례 1로 직접 검증

선례 1(`limitations`/`limitationDetails`)이 정확히 이 질문을 이미 풀었다: **오늘 `data.edges`를
읽는 소비자(Extension tree, Plugin 요약, 외부 agent)는 그 배열의 모든 항목을 "provider가 답한
정적 호출 관계"로 취급한다.** M4가 추론 edge를 같은 배열에 `evidence`라는 optional 필드만 붙여
섞어 넣으면, **그 optional 필드를 모르는 소비자에게는 새 항목이 그냥 조용히 늘어난 `edges`일
뿐이다** — `V1_WITHHELD_REASON_CODES`의 주석이 정확히 경고한 "기존 데이터의 의미를 바꾸는 것"이
여기서도 그대로 일어난다. `schemaVersion` 자체는 안 바뀌어도 **행동이 바뀐다**: agent가
"caller가 N개다"라고 세는 로직, VS Code tree가 caller를 렌더링하는 로직이 전부 추론 결과를 확정
결과와 구분 없이 반영한다. **틀리면 사용자에게 보이는 것**: 프레임워크 DI 추측 하나가 틀렸을 때,
사용자는 그게 실제 caller 목록에 있었다는 이유만으로 그 함수를 안전하게 바꿔도 된다고(또는 안
된다고) 잘못 결론짓는다 — M4가 존재하는 이유(오탐이 신뢰를 깬다)를 스스로 어기는 결과다.

### IL-LIM-001 자신의 초안과의 충돌 — 발견하고 재검토를 제안

`il-lim-001-dynamic-runtime-calls.md`의 "권장 대응"은 **"CLI schema는 기존 `source`/`target`을
유지하면서 optional `evidence[]`를 추가"**하고 **"기존 LSP edge를 `language-server/confirmed`
evidence로 변환"**하자고 적어 뒀다 — 즉 **기존 `edges` 배열에 그대로 추가**하는 안이다. 이 문서는
`limitationDetails`/`advertised`-`observed` 선례가 이미 자리잡은 뒤에도 이 결론을 재검토한 흔적이
없다(문서 자체가 "미해결 질문"에 이 선택을 다시 묻지 않는다). **이 stage 1에서 그 초안을
뒤집는다** — 위 이유로, 신뢰할 수 없다고 판단한다. IL-LIM-001의 `EdgeEvidence` 필드 모양
(`source`, `adapterId`, `adapterVersion`, `evidenceRanges`, `reasonCode`)은 그대로 살리되, **그
객체가 붙는 곳을 `edges`의 각 항목이 아니라 `augmentedEdges`의 각 항목으로 옮긴다.**

### M1이 이미 깔아 둔 배관을 그대로 쓴다

`augmentedEdges`가 비어 있지 않을 때, `AnalysisObservations.semantic`을 `{scope:
'static-plus-inference' | 'static-plus-observation', evidenceSources: [...]}`로 채우면:
- `coverage.semantic.status`가 옛 소비자에게 `'augmented'`로 보인다(이미 있는 `V1_SEMANTIC_STATUS`
  매핑, 코드 변경 없음).
- `limitationDetailsFor()`의 `semanticScopeDetails()`가 이미 `inferred_edges_included`/
  `observed_edges_included` warning을 만든다(코드 변경 없음, 지금 그냥 producer가 없어서 죽어
  있는 경로일 뿐).
- `evidenceSources`는 `inferred-`/`observed-` 접두어를 강제하는 기존 검증을 그대로 통과시키면 된다.

**새로 필요한 것은 `data.augmentedEdges` 배열 하나와, `AnalysisObservations.semantic`을 채우는
연결 코드뿐이다** — `coverage`/`completion` 쪽 신규 로직은 필요 없다. 이건 stage 2 adapter의
설계를 크게 줄여 준다.

### `schemaVersion` — 결정: 승격 불필요 (commander 승인, 2026-09-03)

M1이 `data.required`를 2개에서 8개로 늘리는 동안(`task-m1-state-truth-table.md` 4.3) `schemaVersion`은
계속 1이었다 — **새 top-level 필드를 추가하는 것 자체는 이미 이 저장소의 확립된 v1 관행**이고,
`augmentedEdges`도 그 관행 그대로다(기존 필드 제거·재정의 없음). **결정: v2 승격 불필요.** 이 lane이
처음 보고했을 때는 판단으로만 적었으나, commander가 같은 근거로 승인해 지금부터는 stage 2가 다시
묻지 않도록 결정으로 기록한다.

## Q3 — M2 신호와 어떻게 만나는가 (결정, 즉시 보고 대상)

### 결론

**`provider_null_incoming_calls`와 `compile_database_missing`/`_stale`/`_ambiguous`는 M4가 무엇을
찾아내든 완전히 그대로 남는다.** commander의 판단이 맞다고 확인했다 — **추측이 아니라 코드 경로를
직접 추적해서 구조적으로 확인했다.**

### 근거 — 코드 경로 추적

`coverage.ts`의 `limitationDetailsFor()`가 이 두 코드를 만드는 자리를 직접 읽었다:
- `provider_null_incoming_calls`는 `AnalysisObservations.nullIncomingCallsObserved`(불리언, LSP
  응답이 문자 그대로 `null`이었는지 `lspProvider.ts`가 기록한 wire-level 사실)에서 나온다.
- `compile_database_*`는 `AnalysisObservations.compileDatabase`(provider 세션을 시작하기 **전에**
  `providers/compileDatabase.ts`가 파일시스템만 읽어 만드는 read-only 관측)에서 나온다.

**이 둘은 M4가 새로 채울 `AnalysisObservations.semantic`/미래의 augmented-edge 필드와 같은 객체의
다른 필드일 뿐, 서로를 읽거나 억제하는 코드가 전혀 없다.** `limitationDetailsFor()`를 전체를 다시
읽어도 한쪽이 있으면 다른 쪽을 지우거나 severity를 낮추는 분기가 없다 — 순서상으로도 각 상태별
`switch`/`if`가 독립적으로 자기 조건만 보고 자기 코드만 추가한다(배열에 append하는 구조라 서로
간섭할 여지 자체가 없다).

### 무엇이 동시에 나타나야 하는지 — 구체적 응답 모양

FastAPI `Depends(get_db)`를 M4가 찾아냈다고 하면, 같은 응답이 **동시에** 담아야 하는 것:
- `limitationDetails`에 `provider_null_incoming_calls`(변경 없음, LSP가 여전히 `null`을 줬다는 사실).
- `data.augmentedEdges`에 `get_db` caller 후보 1건(`confidence` 값은 Q2에서 확정, 아마 "single
  candidate"라 높은 확신 — 이어서 보고).
- `limitationDetails`에 `inferred_edges_included`(M1이 이미 만들어 둔 코드, 위 배관 재사용).

**셋이 공존한다.** 어느 하나가 다른 것을 지우지 않는다 — "provider는 여전히 못 봤고, 우리가
추론했을 뿐이며, 그 추론 자체도 확정이 아니라 보조 증거"라는 세 가지 서로 다른 사실이 동시에
참이기 때문이다.

### 틀리면 사용자에게 무엇이 잘못 보이는가

만약 M4가 `augmentedEdges`를 채웠다는 이유로 `provider_null_incoming_calls`를 억제했다면, 사용자는
"경고가 사라졌으니 확정됐구나"로 읽는다(commander가 정확히 지적한 그 실패). 실제로는 LSP 수준의
불확실성은 조금도 줄지 않았다 — 완전히 다른 층위에서 약한 신뢰도의 신호 하나가 추가됐을 뿐이다.
같은 논리가 `compile_database_missing`에도 그대로 적용된다: compile database가 없다는 사실은 M4가
찾아낸 것과 무관하게 여전히 참이다.

## Q2 — confirmed/candidate/runtime-only의 경계 (결정)

### 진단 — IL-LIM-002는 자기 자신과 모순된다

`il-lim-002-framework-di-routing.md`를 전체를 다시 읽었다. **한 문서 안에 두 개의 다른 어휘 체계가
있다**, 서로를 참조하지 않은 채:

- **수용 기준(:39)**: "단일 후보, 복수 후보와 runtime-only binding이 **확정·후보·미지원** 관계로
  구분된다" — 이건 세 **입력 상황**(단일 후보/복수 후보/runtime-only binding)을 세 **출력
  라벨**(확정/후보/**미지원**)에 순서대로 매핑한다. "runtime-only"는 여기서 라벨이 아니라 세 번째
  상황의 이름이고, 그 라벨은 "미지원"이다.
- **Spring adapter "권장 대응"(:102-105)**: `confirmed`/`candidate`/`runtime-only`를 **셋 다 라벨로**
  나란히 쓴다 — `confirmed`: "type·qualifier·primary·조건으로 단일 bean이 결정됨", `candidate`:
  "복수 implementation 또는 정적으로 확정하지 못한 조건", `runtime-only`: "profile, conditional,
  **programmatic registration**, **proxy/AOP** 등 실행 전 확정 불가". 테스트 계획(:172)도 "Spring
  spike: 단일·복수·조건부 bean: confirmed/candidate/runtime-only가 근거와 함께 분리됨"으로 같은
  세 라벨을 쓰고, 종료 조건(:153)은 또 다른 표기("exact/candidate/runtime-only")를 쓴다.

**어느 줄을 "따를지" 고를 수 있는 문제가 아니다** — 같은 문서, 같은 스토리 안에서 벌써 갈려 있다.
Spring 절(:102-105)이 더 구체적이고 실제 판정 기준(단일/복수/조건 판단 로직)까지 적어 뒀으므로, 그
**정의**를 신뢰하고 **세 번째 라벨의 이름**만 :39와 다르게 부른다.

### 결정 1 — 두 축으로 분리한다

`IL-LIM-001`의 `EdgeEvidence` 초안(`source`/`adapterId`/`adapterVersion`/`evidenceRanges`/
`reasonCode`)에서 `confidence: confirmed|inferred|observed` 필드 하나가 사실 **서로 다른 두 질문**을
억지로 합쳐 놓은 것이었다 — "이 edge가 어디서 왔는가"(provenance)와 "target이 얼마나 확실한가"
(certainty)는 독립이다. FastAPI `Depends(get_db)`가 정확히 그 증거다: **정적 추론에서 나왔지만
target은 완전히 유일**하다. 하나의 필드로는 이 조합을 표현할 자리가 없다. 두 축으로 쪼갠다:

- **`source`**: `'static-inference' | 'runtime-observation'`. `'language-server'`는 필요 없다 —
  그건 `edges`에 남고 M4는 그 배열을 건드리지 않는다(Q1).
- **`resolution`**(commander 제안 채택, 이름 근거는 아래): `'single' | 'multiple'`.

### 결정 2 — 확실성 축에 `confirmed`를 쓰지 않는다. 이름은 `resolution`, 값은 `single`/`multiple`

commander의 반론을 그대로 받아들인다: `augmentedEdges[].certainty = 'confirmed'`를 쓰면 Q1에서
막은 문제를 한 층 아래에서 재생산한다. 그 배열은 **정의상 provider가 확정하지 않은 것들**인데,
안에서 "confirmed"라는 단어를 쓰면 "확정 edge"로 오독된다 — `edges`가 이미 암묵적으로 갖고 있는
그 의미를 빌려 쓰는 것이 문제다. `single`/`multiple`(IL-LIM-002 :39의 "단일 후보"/"복수 후보"
그대로)로 이름 붙여 그 단어 자체를 피한다.

**`unresolved`(:39의 "runtime-only binding"/"미지원")는 `resolution`의 세 번째 값이 아니라, 아예
`augmentedEdges` entry 자체가 생기지 않는 경우다** — 아래 결정 3에서 이유를 설명한다. 그래서
`AugmentedEdge.resolution`의 실제 타입은 **`'single' | 'multiple'` 두 값뿐이다**(commander가 제안한
세 값 중 두 개만 필드값으로 살아남고, 세 번째는 필드가 아니라 "그 edge가 없다"는 사실 + 별도
limitation으로 표현된다 — commander의 제안을 정밀화한 것이지 다른 방향은 아니다).

### 결정 3 — `unresolved`는 edge를 만들지 않는다, limitation만 낸다

**결론**: Spring adapter 정의(:105)의 `runtime-only` 사례들 — profile, conditional(정적으로
안 풀리는 것), **programmatic registration**, **proxy/AOP** — 은 공통적으로 **후보 target을 정적으로
단 하나도 나열할 수 없는** 경우다. `multiple`은 "후보가 여럿이지만 전부 구체적인 symbol로
나열 가능"인 반면, `unresolved`는 "무엇을 후보로 나열해야 할지 자체를 모른다"(programmatic
registration은 등록 코드를 실행해야 무엇이 등록됐는지 알 수 있고, proxy/AOP는 호출 지점의 실제
객체가 합성된 wrapper라 정적으로는 symbol이 아니다). **edge는 최소 하나의 구체적 target symbol이
있어야 의미가 있는데, 그 자체가 없다** — 그러니 edge를 만들 재료가 없다.

**근거**:
- 마일스톤 종료 gate: "path convention만으로 가짜 call edge나 test passed 상태를 만들지 않는다" —
  target이 없는데 자리만 채우는 placeholder edge를 만들면 정확히 이 gate가 금지하는 "가짜 edge"다.
- IL-LIM-002 수용 기준 #38: "모호한 관계는 확정 edge로 생성되지 **않고** limitation으로 보고된다."
  `multiple`은 이 기준을 "확정으로 생성하지 않음"(= `resolution: 'multiple'`로 여러 개를 그대로
  노출하고, 동시에 모호함을 알리는 limitation을 **함께** 낸다 — 대체가 아니라 병행) 쪽으로,
  `unresolved`는 "limitation**만**"으로 처리하는 게 자연스럽다 — 애초에 노출할 target이 없기
  때문이다.
- 마일스톤 제외 범위: "실제 runtime trace 없이 runtime-only target을 확정하는 동작"이 명시적으로
  빠져 있다. `unresolved`에 억지로 target을 채우면 이 제외 범위를 코드로 위반하는 셈이다.

**새 limitationDetail 코드 후보**(stage 2에서 정확한 이름 확정, 여기서는 존재 필요성만 결정):
`augmented_binding_unresolved`(scope: `semantic`, severity: `warning`) — "이 위치에 DI/dynamic
binding 메커니즘이 감지됐지만 정적으로 target을 특정할 수 없다"는 사실만 전달, target 없음.

**틀리면 사용자에게 무엇이 잘못 보이는가**: `unresolved`에 억지 placeholder edge를 만들면, 사용자는
"CLI가 이 caller를 찾았다"로 읽는다 — 실제로는 CLI가 "여기 뭔가 있다는 것만 알고 누구인지는
전혀 모른다"는 뜻이다. `multiple`을 오히려 `unresolved`처럼 limitation-only로 숨기면, 사용자는
실제로 존재하는 구체적 후보 목록(예: DevService/ProdService)을 못 보고 스스로 처음부터 다시
찾아야 한다 — M4가 존재하는 이유(추론해서 보여주기)를 스스로 포기하는 것이다.

### 최종 vocabulary

| 축 | 필드 | 값 | 의미 |
| --- | --- | --- | --- |
| 출처(provenance) | `source` | `static-inference` \| `runtime-observation` | 이 edge가 어떤 메커니즘으로 만들어졌는가. `language-server`는 없음(그건 `edges`) |
| 확실성(target certainty) | `resolution` | `single` \| `multiple` | target이 정적으로 몇 개나 좁혀지는가. `unresolved`는 필드값이 아니라 **edge 부재 + limitation**으로 표현 |

`edges`(기존, LSP) 자체에는 어떤 M4 어휘도 붙지 않는다 — clangd 23이 derived override에 준 edge는
"confirmed"도 "candidate"도 아니고, M4 이전과 똑같이 그냥 `edges`의 한 항목일 뿐이다(commander의
원래 질문에 대한 답 — provider가 말했다는 사실과 그것이 M4의 확실성 등급을 받는다는 것은 별개다).

## Q4 — false-positive corpus

Q1~Q3에서 정한 모양(`data.augmentedEdges`, `source`/`resolution` 두 축, `unresolved`는 edge 없이
limitation만) 위에서 최소 4가지 케이스를 정한다. 각각 "무엇이 틀릴 수 있는가"와 "올바른 동작"을
적는다 — 이게 stage 2 adapter의 통과 기준이 된다.

### 1. 이름은 같은데 관계가 없는 경우

**상황**: 서로 다른 모듈에 이름이 같은 함수가 둘 있고(`utils.get_db`, `legacy.get_db`), DI는
import로 특정된 하나만 참조한다.

**틀릴 수 있는 것**: adapter가 이름만으로 매칭하면 엉뚱한 `get_db`에 edge를 만든다.

**올바른 동작**: **이름 매칭을 금지한다** — `IL-LIM-002`의 권장 대응이 이미 "import alias를
추적하고 provider definition 결과로 실제 target symbol을 확인한다"고 정해 뒀다(뒤집지 않음, 이
결정은 유효하다). corpus fixture는 동명이인 함수 둘을 만들고, 하나만 실제로 import·참조되는
상태에서 **정확히 그 하나에만** `resolution: 'single'` edge가 생기고 다른 하나에는 **edge가
전혀 생기지 않아야** 통과다. 이름 매칭으로 잘못 연결되면 실패.

### 2. 조건부로만 연결되는 경우

**상황**: `if env == "prod": Service = ProdService else: Service = DevService`처럼 설정·환경에
따라 다른 구현이 주입된다. 후보(`ProdService`, `DevService`)는 정적으로 둘 다 나열 가능하지만,
어느 쪽이 실제로 쓰이는지는 실행해 봐야 안다.

**틀릴 수 있는 것**: 최근 커밋이나 기본값을 보고 하나로 임의 승격하거나, 반대로 후보를 아예
안 보여준다(정보 손실).

**올바른 동작**: **`resolution: 'multiple'`로 둘 다 노출한다** — 하나로 승격하지 않는다(마일스톤
종료 gate: "모호한 DI/dynamic target은 하나의 확정 caller로 임의 승격되지 않는다"). 동시에
ambiguity를 설명하는 limitationDetail을 **함께** 낸다(대체가 아니라 병행). corpus fixture 통과
기준: `augmentedEdges`에 정확히 2개 entry(둘 다 `resolution: 'multiple'`), 그리고 해당 symbol을
가리키는 ambiguity limitationDetail 1개.

### 3. 연결이 아예 없는 경우 — 등록만 되고 실제로 마운트되지 않은 handler

**상황**: `orphan_router = APIRouter(); @orphan_router.get("/x") def handler(): ...`처럼 decorator
패턴은 route처럼 보이지만, 이 `orphan_router`가 실제 앱에 `include_router()`로 연결된 적이 없다.

**틀릴 수 있는 것**: decorator 패턴(`@x.get(...)`)만 보고 route로 인식하면, 실제로는 절대 호출될
수 없는 handler에 "이건 route다"라는 존재하지 않는 신뢰를 부여한다 — 정확히 마일스톤 gate가
금지하는 "path convention만으로 가짜 call edge나 test passed 상태를 만드는" 것.

**올바른 동작**: **탐지하지 않는다** — 등록(decorator)뿐 아니라 실제 mount 체인
(`include_router`/앱 등록)까지 확인된 경우에만 augmented edge를 만든다. corpus fixture는
mount되지 않은 router와 mount된 router를 나란히 두고, mount 안 된 쪽에는 **edge도 limitation도
생기지 않아야**(진짜 아무 관계가 없으므로 보고할 것도 없다) 통과다.

### 4. provider가 이미 본 것을 중복으로 추론하는 경우

**상황**: M4 adapter가 찾은 (source, target) 쌍이 이미 `edges`(LSP가 직접 반환한 결과)에도
존재한다 — 예를 들어 provider 버전이 올라가며 그 관계를 이제 직접 찾아내는 경우(clangd
17→22/23의 virtual dispatch 변화와 같은 종류).

**틀릴 수 있는 것**: 같은 관계가 `edges`에도, `augmentedEdges`에도 나타나면 소비자는 caller
수를 두 번 세거나, 왜 같은 관계가 다른 신뢰도로 두 번 나오는지 혼란스러워한다.

**올바른 동작**: **`augmentedEdges`에서 제외한다(dedupe)** — adapter는 edge를 만들기 전에 이미
`edges`에 같은 (source, target) 쌍이 있는지 확인하고, 있으면 만들지 않는다. `IL-LIM-001`의
rollout 절이 이미 "로컬 debug output에 후보·채택·거부 수만 남긴다"고 정해 뒀으므로, 이 dedupe는
"거부(reject)"로 그 카운트에만 잡히고 응답에는 나타나지 않는다. corpus fixture 통과 기준:
provider가 이미 답하는 관계에 대해 `augmentedEdges`에 중복 entry가 **생기지 않아야** 한다.

## Q5 — kill switch: "안전하게"를 검증 가능한 문장으로

### "안전하게"의 정의

**augmentation을 끄면(kill switch 기본값 off, 또는 명시적 off), 응답에서 `data.augmentedEdges`를
제외한 모든 필드가 M4 merge 직전 커밋이 만들었을 응답과 필드 단위로 완전히 같아야 한다** — 단,
`analyzedAt`과 `timings.totalMs`처럼 **M4 이전에도 실행마다 달랐던 필드**는 원래부터 비교 대상이
아니다(이 저장소가 `IndexingReadinessEvidence`에 timestamp를 안 넣은 것과 같은 원칙 —
`types.ts:97`, "Wall-clock values... would defeat the byte-for-byte response comparison" — 애초에
결정적이지 않은 값을 결정적 비교 대상으로 삼지 않는다). "같을 것이다"가 아니라 **이 필드
집합에서 byte-for-byte 같다**로 정의를 좁힌다.

### 확인 방법 — golden snapshot 비교, stage 3의 실제 산출물

1. M4 merge 직전 커밋에서, M2가 이미 쓰는 fixture(FastAPI, Go, C/C++ 등) 전부에 대해 실제 응답을
   캡처해 golden snapshot으로 저장한다.
2. M4 merge 후, 같은 fixture를 augmentation off로 실행해 캡처한다.
3. 위 필드 집합(`analyzedAt`/`timings.totalMs` 제외 전체)에 대해 deep-equality 자동 테스트를
   stage 3에 둔다 — 이게 마일스톤 종료 gate의 "rollback fixture" 항목의 실제 구현이다.
4. 이 테스트가 실패하면 augmentation 코드가 off 상태에서도 기존 경로에 부작용을 낸다는 뜻이고,
   그 자체가 이 마일스톤이 막으려는 정확히 그 상황이다.

**틀리면 사용자에게 무엇이 잘못 보이는가**: kill switch를 껐는데도 결과가 미묘하게 달라지면(예:
`edges` 순서가 바뀌거나 `limitationDetails`에 없던 항목이 섞이면), 사용자는 "껐는데도 안전하지
않다"는 걸 모른 채 augmentation을 신뢰할 이유가 없는 상태에서도 계속 쓰게 된다 — kill switch가
있다는 사실 자체가 거짓 안전감을 준다.
