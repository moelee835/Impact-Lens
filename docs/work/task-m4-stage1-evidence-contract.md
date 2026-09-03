# M4 stage 1 — evidence 계약과 false-positive corpus (설계 게이트, 코드 없음)

- 상태: 진행 중 — Q1·Q3 결론 도출, commander에게 즉시 보고(지시대로). Q2·Q4·Q5는 이어서 진행.
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

### `schemaVersion` — 판단은 "승격 불필요", 결정은 별도 승인(지시대로 보고만)

M1이 `data.required`를 2개에서 8개로 늘리는 동안(`task-m1-state-truth-table.md` 4.3) `schemaVersion`은
계속 1이었다 — **새 top-level 필드를 추가하는 것 자체는 이미 이 저장소의 확립된 v1 관행**이고,
`augmentedEdges`도 그 관행 그대로다(기존 필드 제거·재정의 없음). **내 판단은 "v2 승격이 필요 없다"는
것이다** — 하지만 이 판단 자체가 stage 1 전체의 전제가 되므로 결정하지 않고 근거와 함께 보고한다.

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
