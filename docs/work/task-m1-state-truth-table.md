# M1 상태 truth table과 completeness 어휘 결정

- 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대응 스토리: `IL-LIM-009` 1단계, `IL-LIM-005` 3단계, `IL-LIM-004` 2단계
- 성격: 계약 설계 문서. 코드와 schema 파일은 이 문서 범위에서 변경하지 않는다.
- 승인 상태: [4. 용어 충돌 결정안](#4-용어-충돌-2건--결정안)의 4.1/4.2/4.3 묶음이 **2026-08-27 승인됐다.**
  [5. 계약 개정안](#5-provider-coverage-contractmd-개정안-적용-완료)은 `provider-coverage-contract.md`에
  적용됐다. 타입·schema 반영(W0-3)과 `data.completion` 생산 구현(W1-C)은 별도 lane이 담당한다.

## 배경과 해결할 문제

`complete: true`는 "요청한 정적 Call Hierarchy 탐색이 limit 없이 끝났다"는 뜻이지만, 사용자와 Agent는
"이 함수에 영향이 없다"로 읽는다. 현재 응답은 이 오해를 구조적으로 막지 못한다.

1. **하나의 boolean이 세 가지 질문에 답하려 한다.** 탐색이 끝났는가(traversal), provider가 결과를 만들 수
   있는 상태였는가(request/indexing), 그래프가 어떤 종류의 근거로 만들어졌는가(semantic)는 독립 축인데
   `complete` 하나로 압축된다.
2. **실패와 빈 결과가 구분되지 않을 위험이 있다.** provider가 준비되지 않아 비어 있는 결과와 실제로 caller가
   0건인 결과가 같은 "영향 없음"으로 요약되면 가장 위험한 false negative가 된다. `IL-LIM-005` 3단계가
   `not_ready`를 요구하는 이유다.
3. **어휘가 두 곳에서 갈라진다.** `coverage.traversal.status`의 `complete`는 `complete: true`와 단어가 겹치고,
   `semantic.status`의 `augmented`는 추론(inference)과 관측(observation)을 구분하지 못한다.
   `IL-LIM-009`는 각각 `exhausted`와 `provider-static | static-plus-inference | static-plus-observation`을 제안한다.
4. **상태 정의가 실측이 아니라 상수다.** `cli/src/coverage.ts`는 `semantic.status`를 `'static-only'`,
   `indexing.status`를 `'unknown'`으로 하드코딩한다. 실제로 측정되는 축은 traversal 하나뿐이다.
5. **선언(schema)과 구현(type)이 이미 드리프트했다.** 아래 조사 결과 3건이 그대로 남아 있으면 새 상태값을
   추가할 때 어느 쪽이 계약인지 판단할 수 없다.

이 문서는 구현자가 boolean 추론 없이 표만 보고 결과 상태를 생성할 수 있는 truth table을 만들고, 어휘 충돌
2건에 대한 결정안을 근거와 함께 제시한다.

## 범위

- M1에서 발생 가능한 모든 상태 조합의 3축 값, indexing 상태, envelope 형태, code, severity, 사용자 노출 문구 확정
- 모순 조합의 열거와, 타입 또는 schema로 표현 자체를 불가능하게 만드는 방법
- `provider-coverage-contract.md`의 provider 실패 코드 표에 없는 code 제안
  (`indexing` stage, `provider_protocol_incompatible`, `IL-LIM-004` 2단계 doctor용 4종)
- traversal/semantic 어휘 충돌 2건의 선택지 비교와 권장안
- schema version 정책(v1 additive 유지 vs v2 승격) 제안
- 승인 시 적용할 `provider-coverage-contract.md` 개정 diff 초안

## 제외 범위

- `cli/src/types.ts`, `cli/src/coverage.ts`, `cli/src/impact.ts`, `cli/schemas/response.schema.json`,
  `src/types.ts`, `src/coverage.ts`의 실제 수정. 결정 승인 후 별도 단계에서 수행한다.
- `provider-coverage-contract.md` 파일 자체의 수정. 개정안은 이 문서 5절에 제안 형태로만 담는다.
- Extension UX 구현(`IL-LIM-009` 3단계), Plugin response policy(`IL-LIM-009` 4단계)
- preset catalog 실구현(`IL-LIM-004` 1·3·4단계), 양방향 JSON-RPC core 구현(`IL-LIM-005` 1·2단계)
- coverage 백분율, runtime 관측 edge 생성, framework DI 추론
- `IL-LIM-001`/`IL-LIM-002`가 만들 augmented semantic 값의 실제 생산. 여기서는 값의 자리만 예약한다.

## 현재 구현 조사 결과

### 선언과 구현의 드리프트 3건

| 항목 | `cli/schemas/response.schema.json` | `cli/src/types.ts` | `src/types.ts` (Extension) |
| --- | --- | --- | --- |
| `provider.selectedBy` | `bundled, auto, preset, project, custom, vscode` (6) | `bundled, custom` (2) | `vscode` (1, 리터럴) |
| `coverage.traversal.status` | `complete, depth-limited, node-limited, timeout, failed` (5) | `complete, depth-limited, node-limited` (3) | 동일 3종 |
| `provider.host` | `lsp, vscode` (2) | `lsp` (1) | `vscode` (1, 리터럴) |

schema가 넓고 구현이 좁은 방향이라 기존 소비자는 깨지지 않지만, `timeout`과 `failed`는 **아무도 생산하지
않는 선언**이다. 이 문서는 이 두 값을 삭제하지 않고 v1 projection 대상으로 채택해 드리프트를 해소한다
(4절 참조).

### 실제로 측정되는 축은 traversal 하나

- `cli/src/coverage.ts:9-13`: `limits` set으로 `node-limited > depth-limited > complete` 우선순위 계산.
- `cli/src/coverage.ts:17-18`: `semantic.status: 'static-only'`, `indexing.status: 'unknown'` 하드코딩.
- `cli/src/impact.ts:80-88`: `limitations`는 항상 `dynamic_calls_not_inferred`,
  `unsaved_buffers_unavailable`로 시작하고 조건부로 `provider_diagnostics_unsupported`,
  `depth_limit_reached`, `node_limit_reached`를 덧붙인다.
- `cli/src/impact.ts:100`: `complete: traversal.limits.size === 0`. 즉 `complete`는 이미 traversal 상태의
  projection이지만, 별도 필드로 직렬화되므로 계산과 저장이 분리돼 모순 값을 만들 수 있는 구조다.
- `src/coverage.ts:19-46`: Extension은 같은 규칙을 손으로 복제한 두 번째 사본이다. 공유 모듈이 없다.

### 실패 경로

- provider 실패는 `ok: false` envelope로만 표현된다(`cli/src/index.ts` catch 경로). 이때 `data`, `capabilities`,
  `coverage`가 전혀 없어 3축을 읽을 자리가 없다.
- 현재 provider 관련 code: `provider_required_for_language`, `provider_language_mismatch`(`lspProvider.ts:70`),
  `provider_launch_failed`, `provider_initialize_failed`(`:198`, `:238`), `provider_capability_missing`(`:220`),
  `provider_query_failed`(`:267`, `:290`), `provider_ipc_unavailable`(`childIpc.ts:71`).
- **계약 문서에 없는 실사용 code가 이미 있다.** `cli/src/jsonRpc.ts:93-100`은 `timeout`(exit 6, retryable,
  `details.stage` 포함)을 던진다. `provider-coverage-contract.md`의 실패 코드 표에는 없다.
- 취소(cancellation) 경로는 존재하지 않는다. `$/cancelRequest` 전송은 `IL-LIM-005` 1단계 과제다.
- `indexing` stage는 `ProviderLifecycleStage` union에는 있지만 이 stage를 설정하거나 실패로 보고하는 코드가
  없다. 계약상 예약만 된 상태다.
- root 선택 실패는 `target_not_found`/`target_ambiguous`(`impact.ts:161-168`, exit 3)로 별도 처리된다.

### 배포된 소비자

- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:70-79`가 `traversal.status: "complete"`,
  `semantic.status: "static-only"`, `indexing.status: "unknown"`을 예시 JSON으로 고정하고 있다.
- `scripts/test-plugin-artifact-e2e.mjs:125-126`이 `response.data.provider.selectedBy === 'bundled'`와
  `response.data.complete === true`를 하드 assert한다.
- `schemaVersion: 1`은 `cli/src/index.ts:103`, `:122`의 리터럴 2개다. 단일 상수가 아니다.
- `src/graphPanel.ts:292`는 `!truncated && reachedDepth < requestedDepth`일 때 `call hierarchy completed`를
  표시한다. 정적 경계는 tooltip에만 있다.

### 불변식 후보 발견

`cli/src/impact.ts:118`의 traversal은 root를 항상 `entries`에 넣고 시작한다. 따라서 **성공한 분석의 `nodes`는
절대 빈 배열일 수 없다.** 실제 caller 0건은 `nodes.length === 1 && edges.length === 0`이다.
이 사실은 "provider 실패를 성공한 empty graph로 반환"을 schema만으로 금지할 수 있게 해준다(3절 X2).

## 1. 상태 모델

### 1.1 세 축과 보조 축

`IL-LIM-009`가 제안한 3축을 채택하되, 실패 envelope까지 같은 어휘로 덮기 위해 각 축에 "그래프 없음"을
표현하는 값을 추가한다.

| 축 | 값 | 의미 |
| --- | --- | --- |
| `requestStatus` | `succeeded` | 요청한 탐색이 limit·중단 없이 끝났고 결과를 결론에 사용할 수 있다 |
| | `partial` | 사용할 수 있는 그래프가 있지만 경계가 있어 미탐이 존재할 수 있다 |
| | `failed` | 결론에 사용할 수 있는 그래프가 없다 |
| `traversalStatus` | `exhausted` | 요청 범위 안에서 더 확장할 incoming edge가 없다 |
| | `depth-limited` | depth 경계에서 확장하지 않은 caller가 남았다 |
| | `node-limited` | node 예산 소진으로 확장하지 않은 caller가 남았다 |
| | `timeout` | 요청 timeout으로 탐색을 중단했다 |
| | `cancelled` | 사용자 또는 상위 host가 취소했다 |
| | `unknown` | 탐색은 종료했지만 provider 준비 상태 때문에 종료 의미를 신뢰할 수 없다 |
| | `failed` | 탐색 도중 provider 또는 adapter가 실패했다 |
| | `not-started` | 탐색을 시작하지 못했다(provider 확보 실패) |
| `semanticScope` | `provider-static` | provider의 정적 Call Hierarchy만 사용했다 |
| | `static-plus-inference` | 정적 결과 + 출처가 표시된 추론 edge (`IL-LIM-002`, M4) |
| | `static-plus-observation` | 정적 결과 + 출처가 표시된 runtime 관측 edge (`IL-LIM-001`, M4) |
| | `none` | 그래프가 없어 semantic scope를 말할 수 없다 |

`unknown`, `failed`, `not-started`, `none`은 `IL-LIM-009` 원안에 없거나 부분적으로만 있는 값이다. 추가 근거:

- `not-started`와 `failed`를 구분해야 "provider를 못 구했다"와 "탐색 중 깨졌다"를 사용자 문구에서 분리할 수
  있다. 후자는 부분 결과가 있을 수 있고 재시도가 유효하지만, 전자는 설치·설정 조치가 필요하다.
- `unknown`은 `IL-LIM-005` 3단계의 `not_ready`를 3축으로 표현하는 유일한 값이다. `exhausted`로 쓰면
  "다 찾았다"가 되고, `failed`로 쓰면 실제로 반환된 부분 결과를 버리게 된다.
- `none`이 없으면 실패 envelope에서 `semanticScope`를 `provider-static`으로 채워야 하는데, 이는 존재하지 않는
  그래프에 정적 근거가 있다고 주장하는 셈이다.

보조 축 두 개를 함께 고정한다.

| 보조 축 | 값 | 규칙 |
| --- | --- | --- |
| `indexingStatus` | `ready` | provider가 명시적 준비 완료 신호를 줬을 때만. 근거 필드 동반 필수 |
| | `working` | 준비 중임을 provider 신호 또는 readiness probe로 확인 |
| | `unknown` | 신호가 없음. 현재 모든 경로의 기본값 |
| `stage` | `discovery, launch, initialize, indexing, capability, query` | 마지막으로 도달한 lifecycle 단계 |

### 1.2 severity와 문구 정책

| severity | 정의 | Agent 행동 규칙 |
| --- | --- | --- |
| `info` | 항상 참인 방법론적 경계. 결론을 바꾸지 않는다 | 요약 말미에 1회 언급 |
| `warning` | 결과가 부분적이다. 결론은 가능하지만 범위를 명시해야 한다 | 결론과 함께 경계·재분석 action 제시 |
| `error` | 결론을 내리면 안 된다 | 결론 앞에 표시하고 "영향 없음/안전" 주장 금지 |

문구 규칙 세 가지를 고정한다.

1. **결과 수를 먼저, 판정을 나중에.** "No incoming callers were returned"는 사실이고,
   "This function is unused"는 금지 문구다.
2. **빈 결과 문구는 항상 근거 조건을 붙인다.** `indexingStatus`가 `ready`가 아니면 "within the indexed
   scope" 같은 조건절 없이 빈 결과를 말하지 않는다.
3. **실패 문구는 조치를 포함한다.** severity `error` 항목은 반드시 `action` 문자열을 가진다.

## 2. 상태 truth table (IL-LIM-009 1단계)

### 2.1 성공 및 부분 결과 (`ok: true`)

`data`, `capabilities`, `limitations`, `timings`가 모두 존재한다. `nodes`는 root를 포함하므로 최소 1개다.

| ID | 상황 | `requestStatus` | `traversalStatus` | `semanticScope` | `indexingStatus` | v1 `complete` | v1 `traversal.status` | `truncated` | 필수 reason code |
| --- | --- | --- | --- | --- | --- | ---: | --- | ---: | --- |
| S1 | 자연 종료, caller 1건 이상 | `succeeded` | `exhausted` | `provider-static` | `unknown` | `true` | `complete` | `false` | 기본 |
| S2 | 자연 종료, caller 0건, indexing 근거 있음 | `succeeded` | `exhausted` | `provider-static` | `ready` | `true` | `complete` | `false` | 기본 + `no_incoming_callers` |
| S3 | 자연 종료, caller 0건, indexing 근거 없음 | `succeeded` | `exhausted` | `provider-static` | `unknown` | `true` | `complete` | `false` | 기본 + `no_incoming_callers` + `index_state_unknown` |
| S4 | depth limit 도달 | `partial` | `depth-limited` | `provider-static` | `unknown` | `false` | `depth-limited` | `true` | 기본 + `depth_limit_reached` |
| S5 | node limit 도달 | `partial` | `node-limited` | `provider-static` | `unknown` | `false` | `node-limited` | `true` | 기본 + `node_limit_reached` |
| S6 | depth·node 동시 도달 | `partial` | `node-limited` | `provider-static` | `unknown` | `false` | `node-limited` | `true` | 기본 + `depth_limit_reached` + `node_limit_reached` |
| S7 | 준비 중, 부분 결과 있음 | `partial` | `unknown` | `provider-static` | `working` | `false` | `failed` | `true` | 기본 + `provider_not_ready` |
| S8 | 준비 중, caller 0건 | `partial` | `unknown` | `provider-static` | `working` | `false` | `failed` | `true` | 기본 + `provider_not_ready`. `no_incoming_callers` **금지** |
| S9 | timeout, 부분 결과 있음 | `partial` | `timeout` | `provider-static` | `unknown` | `false` | `timeout` | `true` | 기본 + `traversal_timeout` |
| S10 | 취소, 부분 결과 있음 | `partial` | `cancelled` | `provider-static` | `unknown` | `false` | `failed` | `true` | 기본 + `traversal_cancelled` |
| S11 | 탐색 중 provider 실패, 부분 결과 있음 | `partial` | `failed` | `provider-static` | `unknown` | `false` | `failed` | `true` | 기본 + `provider_query_failed` |
| S12 | 자연 종료 + 추론 edge 포함 (M4) | `succeeded` | `exhausted` | `static-plus-inference` | `unknown` | `true` | `complete` | `false` | 기본 + `inferred_edges_included` |
| S13 | 자연 종료 + 관측 edge 포함 (M4) | `succeeded` | `exhausted` | `static-plus-observation` | `unknown` | `true` | `complete` | `false` | 기본 + `observed_edges_included` |

`기본`은 `dynamic_calls_not_inferred`, `unsaved_buffers_unavailable`을 뜻한다. Extension 경로는 여기에
`identity_unavailable_through_vscode_api`가 항상 추가된다. provider가 diagnostics를 지원하지 않으면 모든 행에
`provider_diagnostics_unsupported`(severity `info`)가 직교적으로 붙는다.

S9~S11은 **현재 CLI에 없는 동작**이다. 지금은 timeout·query 실패가 예외로 전파돼 `ok: false`가 된다.
부분 결과 반환은 `IL-LIM-005` 1단계의 bounded cancellation 위에서 구현하며, 그 전까지는 각각 F17, F16으로
떨어진다. 이 표는 두 시점을 모두 덮기 위해 양쪽 행을 모두 정의한다.

### 2.2 실패 (`ok: false`)

`data`/`capabilities`/`coverage`가 없고 `error`가 있다. 3축은 `error.details.completion`에 additive로 싣는다
(4.3절 결정 대상). 모든 행에서 `requestStatus`는 `failed`, `semanticScope`는 `none`이다.

| ID | 상황 | stage | code | `traversalStatus` | `indexingStatus` | 신규 |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | 지원 언어가 아니고 provider 미지정 | `discovery` | `provider_required_for_language` | `not-started` | `unknown` | |
| F2 | 명시 `languageId`와 감지 언어 불일치 | `discovery` | `provider_language_mismatch` | `not-started` | `unknown` | |
| F3 | preset 실행 파일을 PATH·명시 경로에서 못 찾음 | `discovery` | `provider_executable_not_found` | `not-started` | `unknown` | 신규 |
| F4 | version이 지원 범위 밖 | `discovery` | `provider_version_unsupported` | `not-started` | `unknown` | 신규 |
| F5 | version command 출력 해석 불가 | `discovery` | `provider_version_unreadable` | `not-started` | `unknown` | 신규 |
| F6 | 검증된 후보가 둘 이상이라 결정 불가 | `discovery` | `provider_selection_ambiguous` | `not-started` | `unknown` | 신규 |
| F7 | bundled artifact 손상·부재 | `discovery` | `bundled_provider_artifact_missing` / `_unreadable` / `_corrupt` | `not-started` | `unknown` | |
| F8 | process를 시작하지 못함 | `launch` | `provider_launch_failed` | `not-started` | `unknown` | |
| F9 | child stdio가 전달되지 않는 환경 | `launch` | `provider_ipc_unavailable` | `not-started` | `unknown` | |
| F10 | initialize 중 종료·오류 | `initialize` | `provider_initialize_failed` | `not-started` | `unknown` | |
| F11 | 필수 server request/notification 미호환 | `initialize` | `provider_protocol_incompatible` | `not-started` | `unknown` | 신규 |
| F12 | server가 Call Hierarchy 미제공 | `capability` | `provider_capability_missing` | `not-started` | `unknown` | |
| F13 | capability probe가 결론을 못 냄 | `capability` | `provider_capability_probe_failed` | `not-started` | `unknown` | 신규 |
| F14 | readiness budget 내 준비 실패, 질의 미수행 | `indexing` | `provider_not_ready` | `not-started` | `working` | 신규 |
| F15 | readiness profile이 요구하는 build metadata 부재 | `indexing` | `provider_project_metadata_missing` | `not-started` | `unknown` | 신규 |
| F16 | prepare/incoming/didOpen 실패, 부분 결과 없음 | `query` | `provider_query_failed` | `failed` | `unknown` | |
| F17 | 요청 timeout, 부분 결과 없음 | `details.stage` | `timeout` | `timeout` | `unknown` | 표에 미기재 |
| F18 | 사용자·상위 취소, 부분 결과 없음 | `details.stage` | `request_cancelled` | `cancelled` | `unknown` | 신규 |
| F19 | 위치에 callable symbol 없음 | `query` | `target_not_found` | `not-started` | `unknown` | 표에 미기재 |
| F20 | 위치에 후보가 둘 이상 | `query` | `target_ambiguous` | `not-started` | `unknown` | 표에 미기재 |
| F21 | adapter·CLI 내부 실패 | `details.stage` | `internal_error` | `failed` | `unknown` | 표에 미기재 |
| F22 | doctor 기준 fixture가 기대 caller를 반환하지 않음 | `query` | `provider_fixture_failed` | `failed` | `unknown` | 신규, doctor 전용 |

`표에 미기재`는 코드에 이미 있으나 `provider-coverage-contract.md`의 실패 코드 표에 없는 것을 뜻한다.
5절 개정안에서 함께 문서화한다.

### 2.3 severity와 사용자 노출 문구

문구는 CLI JSON `message`/`action`, Extension header, Plugin summary에서 동일하게 쓴다. 영문은 제품 표면에
그대로 나가는 문자열이다.

| ID | severity | 사용자 노출 문구 | action |
| --- | --- | --- | --- |
| S1 | `info` | `{n} incoming callers found. Static call hierarchy only; dynamic and reflective calls are not inferred.` | — |
| S2 | `warning` | `No incoming callers found within the indexed workspace. Static call hierarchy only; dynamic, reflective and cross-process calls are not inferred.` | `Confirm dynamic entry points manually before removing this symbol.` |
| S3 | `warning` | `No incoming callers were returned. The provider did not report an index state, so this is not proof that none exist.` | `Re-run after the provider finishes indexing, or verify with a workspace search.` |
| S4 | `warning` | `Partial result: depth limit {requestedDepth} reached. Callers beyond this depth were not expanded.` | `Re-run with a higher depth.` |
| S5 | `warning` | `Partial result: node budget {maxNodes} exhausted. Some callers were not expanded.` | `Re-run with a higher maxNodes, or narrow the target.` |
| S6 | `warning` | `Partial result: node budget {maxNodes} exhausted before the depth limit {requestedDepth} was cleared.` | `Re-run with a higher maxNodes first.` |
| S7 | `error` | `Partial result: the provider is still indexing. Callers found so far are shown, but the set is incomplete.` | `Wait for indexing to finish and re-run.` |
| S8 | `error` | `The provider is still indexing and returned no callers. This is not evidence that the symbol has no callers.` | `Wait for indexing to finish and re-run.` |
| S9 | `warning` | `Partial result: the analysis timed out after {timeoutMs} ms.` | `Re-run with a higher timeout or a smaller depth.` |
| S10 | `warning` | `Partial result: the analysis was cancelled before the traversal finished.` | `Re-run to get the full result.` |
| S11 | `error` | `Partial result: the language server failed during traversal after returning some callers.` | `Check the provider diagnostics and re-run.` |
| S12 | `warning` | `{n} callers found, including {k} inferred edges. Inferred edges are heuristic and marked with their source.` | `Review inferred edges before acting on them.` |
| S13 | `warning` | `{n} callers found, including {k} observed edges from runtime evidence. Coverage depends on what the recorded run exercised.` | `Runtime evidence covers only executed paths.` |
| F1 | `error` | `Impact Lens has no bundled provider for {detectedLanguageId}.` | `Configure a Language Server for this language, or use a verified preset.` |
| F2 | `error` | `The requested languageId "{requestedLanguageId}" does not match the detected language "{detectedLanguageId}".` | `Remove the languageId override, or point at a file of the requested language.` |
| F3 | `error` | `The provider executable for preset "{preset}" was not found.` | `Install {tool} and make it available on PATH, or set an explicit path.` |
| F4 | `error` | `{tool} {found} is outside the supported range {range}.` | `Upgrade {tool}, or override the version check explicitly.` |
| F5 | `error` | `Could not read a version from {tool}.` | `Verify the executable is {tool} and not a wrapper, or set an explicit path.` |
| F6 | `error` | `More than one verified provider matches this project.` | `Choose one preset explicitly; Impact Lens does not guess.` |
| F7 | `error` | `The bundled TypeScript provider could not be loaded from the installed package.` | `Reinstall the CLI or plugin, or check package permissions.` |
| F8 | `error` | `The Language Server process could not be started.` | `Verify the command path and execute permission.` |
| F9 | `error` | `Impact Lens could not exchange any data with the Language Server process.` | `Run outside the sandbox, allow child process I/O, or use the Extension.` |
| F10 | `error` | `The Language Server started but did not complete initialize.` | `Check the reported exit status and stderr tail.` |
| F11 | `error` | `The Language Server requires a protocol feature Impact Lens does not support: {method}.` | `Report this server; use a supported preset in the meantime.` |
| F12 | `error` | `The Language Server does not provide Call Hierarchy.` | `Use a server that advertises callHierarchyProvider.` |
| F13 | `error` | `The Call Hierarchy capability probe did not complete.` | `Re-run doctor; if it repeats, raise the timeout or report the server.` |
| F14 | `error` | `The provider did not become ready within {budgetMs} ms.` | `Wait for the project index to finish and re-run.` |
| F15 | `error` | `This provider needs {metadata} to analyze the project, and it was not found.` | `Generate {metadata} with your build system, then re-run. Impact Lens does not run builds.` |
| F16 | `error` | `The Language Server failed while answering the Call Hierarchy request.` | `Check the reported stage and stderr tail, then re-run.` |
| F17 | `error` | `The request timed out after {timeoutMs} ms during {stage}.` | `Re-run with a higher timeout or a smaller depth.` |
| F18 | `info` | `The analysis was cancelled.` | — |
| F19 | `error` | `No callable symbol was found at the requested position.` | `Point at the declaration name, not the body.` |
| F20 | `error` | `More than one callable symbol matched the requested position.` | `Pass expectedSymbol to disambiguate.` |
| F21 | `error` | `Impact Lens failed unexpectedly during {stage}.` | `Report this with the debug log.` |
| F22 | `error` | `The provider initialized but the reference fixture returned no callers.` | `The preset is not usable for this project yet; use a custom provider.` |

**금지 문구.** 어떤 행에서도 다음을 생성하지 않는다: `no impact`, `safe to change`, `unused`,
`fully analyzed`, `complete analysis`, `all callers`. `complete: true`만 근거로 이 표현을 만드는 응답은
`IL-LIM-009` 4단계 eval에서 실패로 처리한다.

## 3. 금지 조합과 표현 불가능화

각 항목은 "무엇을 금지하는가"와 "타입/schema에서 어떻게 표현 자체를 불가능하게 하는가"를 함께 정의한다.
X1~X4는 현재 계약이 이미 금지하는 4가지이고, X5~X11은 3축 도입으로 새로 생기는 모순이다.

| ID | 금지 조합 | 타입으로 막는 방법 | schema로 막는 방법 |
| --- | --- | --- | --- |
| X1 | `complete: true` + `traversalStatus !== 'exhausted'` | `complete`를 응답 builder의 입력에서 제거하고, `completion` 하나만 받는 단일 함수 `toEnvelope(completion)`에서만 계산한다. builder 입력 타입에 `complete`가 없으면 모순 값을 넣을 자리가 없다 | `if traversal.status !== "complete" then complete: {const: false}` 와 `if traversal.status === "complete" then complete: {const: true}` |
| X2 | provider 실패를 성공한 empty graph로 반환 | 결과를 discriminated union으로 만든다. `type Outcome = {kind:'graph'; nodes:[Node, ...Node[]]} \| {kind:'failure'; code: FailureCode; stage: Stage}`. `nodes`를 non-empty tuple로 선언하면 빈 배열이 컴파일되지 않는다 | `if ok === true then data.nodes: {minItems: 1}` 와 `if ok === false then {not: {required: ["data"]}}`. root는 항상 node이므로 성공 응답의 `nodes`는 비어 있을 수 없다 |
| X3 | 근거 없이 `indexing.status: "ready"` | `type Indexing = {status:'ready'; evidence: ReadinessEvidence} \| {status:'working'\|'unknown'}`. `ready`를 만들려면 evidence를 반드시 제공해야 한다 | `if indexing.status === "ready" then required: ["evidence"]` |
| X4 | 감지 언어와 다른 bundled provider 자동 실행 | provider 선택 함수의 반환 타입을 `SelectedProvider \| LanguageMismatch` union으로 하고 `SelectedProvider.languageMatch: true \| 'unknown'`으로 좁힌다. `false`를 담은 선택 결과는 타입상 존재할 수 없다 | `if selectedBy in ["bundled","auto","preset"] then languageMatch: {not: {const: false}}` |
| X5 | `requestStatus: 'succeeded'` + 경계 있는 traversal | `type Completion = {requestStatus:'succeeded'; traversalStatus:'exhausted'} \| {requestStatus:'partial'; traversalStatus: BoundedStatus} \| {requestStatus:'failed'; traversalStatus: FailedStatus}` | `if completion.requestStatus === "succeeded" then completion.traversalStatus: {const: "exhausted"}` |
| X6 | `requestStatus: 'failed'` + `ok: true` | 위 union의 `failed` variant는 `Outcome.kind === 'failure'`에서만 생성되고, `failure`는 error envelope writer로만 흐른다 | `if completion.requestStatus === "failed" then ok: {const: false}` |
| X7 | `traversalStatus: 'exhausted'` + limit reason 포함 | reason 배열을 자유 `string[]`이 아니라 `reasonsFor(completion, flags)` 순수 함수로만 생성한다 | `if traversal.status === "complete" then reasons: {items: {not: {enum: ["depth_limit_reached","node_limit_reached","traversal_timeout","traversal_cancelled","provider_not_ready"]}}}` |
| X8 | `semanticScope: 'none'` + `data` 존재 | `none`은 `failure` variant에만 있는 리터럴로 둔다 | `if completion.semanticScope === "none" then {not: {required: ["data"]}}` |
| X9 | `indexingStatus: 'working'` + `requestStatus: 'succeeded'` | `succeeded` variant의 indexing 타입을 `{status:'ready'\|'unknown'}`으로 좁힌다 | `if indexing.status === "working" then completion.requestStatus: {enum: ["partial","failed"]}` |
| X10 | `truncated: false` + `traversalLimits` 비어 있지 않음 | X1과 동일하게 두 필드 모두 projection 함수에서만 생성 | `if truncated === false then traversalLimits: {maxItems: 0}` |
| X11 | `provider_not_ready`와 `no_incoming_callers` 동시 포함 | reason 생성 함수에서 `no_incoming_callers`를 `requestStatus === 'succeeded'` 분기에서만 push | `reasons`에 두 code의 상호 배제 `allOf` 규칙 추가 |

**핵심 구현 원칙 하나.** X1, X7, X10이 공통으로 말하는 것은 "`complete`, `truncated`, `traversalLimits`,
`coverage.*`, `reasons`는 저장 필드가 아니라 `completion` 하나에서 파생되는 projection"이다. 이 원칙만 지키면
모순 조합의 대부분이 코드 리뷰가 아니라 컴파일과 schema validation에서 걸린다.

## 4. 용어 충돌 2건 — 결정안

> **이 절은 2026-08-27 승인됐다.** 승인 범위는 4.1(traversal 어휘), 4.2(semantic 어휘),
> 4.3(schema version 정책)의 묶음 전체이며, 세 절 모두 권장안 (c) additive가 그대로 채택됐다.
> `schemaVersion`은 1을 유지한다. 아래 비교 표는 결정 근거로 남겨둔 기록이다.
>
> 승인 결과는 `provider-coverage-contract.md`에 5절대로 반영됐다. 타입·schema 반영과
> `data.completion`의 실제 생산은 아직 코드에 없다.

### 4.1 충돌 1 — traversal 어휘

**문제.** 현재 `coverage.traversal.status`의 `complete`는 top-level `complete: true`와 단어가 같다.
두 값이 항상 함께 움직이므로 소비자는 `complete`를 "분석이 완전하다"로 읽는다. `IL-LIM-009`는
`exhausted | depth-limited | node-limited | cancelled | unknown`을 제안한다. 또한 schema에는 `timeout`,
`failed`가 이미 선언돼 있지만 코드가 생산하지 않는 드리프트가 있다.

| 기준 | (a) 현재 어휘 유지 + 문서 보완 | (b) 새 어휘로 교체 + schema v2 승격 | (c) 새 필드 additive + 기존 필드 projection (v1 유지) |
| --- | --- | --- | --- |
| 정확성 | 낮음. `complete` / `complete: true` 중복이 그대로 남는다 | 높음 | 높음. 새 소비자는 `completion.traversalStatus`만 본다 |
| 표현력 | timeout·cancelled·not-ready를 표현할 자리가 없다 | 충분 | 충분 |
| 하위 호환 | 완전 | 깨짐. `schemaVersion` 분기가 없는 소비자는 전부 실패 | 유지. `complete`, `truncated`, `traversalLimits`, `coverage.traversal.status` 그대로 |
| 배포된 소비자 영향 | 없음 | `cli-contract.md` 예시, `test-plugin-artifact-e2e.mjs:125-126`, Extension `ImpactCoverage`, 외부 Agent 통합을 모두 수정 | 없음. e2e의 `complete === true` assert는 bundled happy path에서 계속 통과 |
| migration 비용 | 0 | 높음. v1/v2 동시 생산 기간 + `schemaVersion` 리터럴 상수화 + 소비자 문서 전면 개정 + deprecation 기간 | 중간. projection 함수 1개, type union 1개, schema `$defs` 1개 추가 |
| 드리프트 해소 | 안 됨 | 됨 | 됨. schema의 `timeout`/`failed`를 projection 대상으로 채택해 "선언만 있고 생산하지 않는 값"을 없앤다 |
| 위험 | 오해가 M1 이후에도 지속. `IL-LIM-009` 수용 기준 미충족 | 릴리스 조율 실패 시 Plugin이 조용히 깨진다 | 필드 2벌 공존 기간 동안 어느 쪽이 진실인지 문서로 못 박아야 한다 |

**권장: (c) additive.** 근거 세 가지.

1. **비용 대비 효과.** 정확성 이득은 (b)와 같고 배포 소비자 영향은 0이다. 이 저장소에는 이미 배포된
   Plugin skill 문서, e2e assert, 손으로 맞춘 병렬 구현 2벌이 있어 (b)의 조율 비용이 실제로 크다.
2. **드리프트를 없애는 방향이 옳다.** schema의 `timeout`/`failed`를 지우는 대신 v1 projection 값으로 채택하면
   선언과 구현이 같은 방향으로 수렴한다. 삭제는 producer 계약을 좁히는 변경이라 오히려 v2 사유가 된다.
3. **v2를 나중에 더 싸게 만든다.** 두 릴리스 동안 새 소비자가 `completion`만 쓰게 하고 그 뒤 v2에서
   구필드를 제거하면, v2의 실제 작업이 "삭제"뿐이 된다.

권장안의 구체 내용:

- 새 optional 필드 `data.completion = { requestStatus, traversalStatus, semanticScope, indexingStatus, stage }`
- v1 projection 규칙 (단일 함수, 다른 곳에서 생성 금지):

| `completion.traversalStatus` | `coverage.traversal.status` | `complete` | `truncated` |
| --- | --- | ---: | ---: |
| `exhausted` | `complete` | `true` | `false` |
| `depth-limited` | `depth-limited` | `false` | `true` |
| `node-limited` | `node-limited` | `false` | `true` |
| `timeout` | `timeout` | `false` | `true` |
| `cancelled` | `failed` | `false` | `true` |
| `unknown` | `failed` | `false` | `true` |
| `failed` | `failed` | `false` | `true` |
| `not-started` | (성공 envelope 없음) | — | — |

- `cancelled`/`unknown`을 v1에서 `failed`로 내리는 것은 의도적인 **안전한 방향의 정보 손실**이다. 구소비자는
  "완전하지 않다"만 읽고, 세부 구분은 새 필드에서만 제공한다.
- `coverage.traversal.status`의 enum은 schema를 그대로 두고, 코드가 5개 값을 모두 생산하도록 맞춘다.
- 문서에서 `complete`는 "traversal exhausted의 v1 호환 표현"으로만 정의하고, 새 산문에서는 `exhausted`를 쓴다.

### 4.2 충돌 2 — semantic 어휘

**문제.** 현재 `static-only | augmented`에서 `augmented`는 추론 edge(`IL-LIM-002`)와 runtime 관측
edge(`IL-LIM-001`)를 구분하지 못한다. 두 근거는 신뢰도와 사용자 조치가 다르다. 추론은 "검토하라"이고
관측은 "실행된 경로만 덮는다"이다. `IL-LIM-009`는
`provider-static | static-plus-inference | static-plus-observation`을 제안한다.

| 기준 | (a) 현재 어휘 유지 + 문서 보완 | (b) 새 어휘로 교체 + v2 | (c) 새 필드 additive + projection (v1 유지) |
| --- | --- | --- | --- |
| 정확성 | 낮음. 근거 종류를 값으로 구분하지 못한다 | 높음 | 높음 |
| 보완 가능성 | `evidenceSources` 배열이 이미 출처를 담아 부분 보완은 된다 | — | `evidenceSources`와 새 값이 서로를 검증한다 |
| 하위 호환 | 완전 | 깨짐 | 유지 |
| 배포된 소비자 영향 | 없음 | `cli-contract.md`의 `"static-only"` 예시, Extension `ImpactCoverage.semantic.status` 리터럴 타입, 외부 통합 | 없음 |
| migration 비용 | 0 | (a)/(c)보다 높지만 충돌 1의 (b)보다는 낮다. `augmented`를 **현재 아무도 생산하지 않기 때문**이다 | 낮음. projection 2줄 |
| 실제 위험 | M4에서 두 근거가 같은 값으로 뭉개져 사용자 문구를 분기할 수 없다 | 릴리스 조율 비용 | 낮음 |

**권장: (c) additive.** 근거 두 가지.

1. **일관성이 결정을 지배한다.** 충돌 1을 (c)로 가면 충돌 2만 (b)로 갈 이유가 없다. 한 응답 안에서 한 필드는
   v2, 다른 필드는 v1인 상태가 가장 나쁘다. 두 결정을 **하나의 결정으로 묶는다.**
2. **`augmented`는 아직 사어(死語)다.** 어떤 코드도 생산하지 않으므로 (b)의 실질 이득이 "문자열 정리"뿐이다.
   반대로 (c)의 손실도 거의 없다. `augmented`는 M4 이전까지 값이 등장하지 않고, 등장할 때는 이미
   `evidenceSources`가 출처를 담고 있다.

권장안의 구체 내용:

- `data.completion.semanticScope`를 4값(`provider-static`, `static-plus-inference`,
  `static-plus-observation`, `none`)으로 둔다.
- v1 projection: `provider-static` → `static-only`, 나머지 둘 → `augmented`, `none` → 성공 envelope 없음.
- `evidenceSources`는 v1/v2 공통으로 유지하고, `semanticScope`와의 일관성을 계약 규칙으로 못 박는다.
  `static-plus-inference`이면 `evidenceSources`에 `inferred-*` 항목이 최소 1개 있어야 한다.

### 4.3 schema version 정책 (같은 결정에 포함)

**권장: M1은 `schemaVersion: 1` additive 유지.** v2는 다음 조건이 모두 충족될 때만 승격한다.

1. `completion`과 `limitationDetails`가 최소 두 minor release 동안 v1 필드와 함께 배포됐다.
2. `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`가 새 필드만 사용하도록 개정됐다.
3. `scripts/test-plugin-artifact-e2e.mjs`의 assert가 `data.complete`가 아니라
   `data.completion.traversalStatus === 'exhausted'`를 검사한다.
4. Extension과 CLI의 coverage 상수가 단일 출처를 공유하거나, 최소한 두 벌이 같은 truth table fixture로
   교차 검증된다.
5. `schemaVersion` 리터럴 2개(`cli/src/index.ts:103`, `:122`)가 단일 상수로 추출됐다.

v2 승격 사유로 인정하는 변경은 **필드 제거 또는 기존 필드 의미 변경**뿐이다. 구체적으로
`complete`/`truncated`/`traversalLimits` 제거, `coverage.traversal.status` enum 축소,
`limitations`를 문자열 배열에서 객체 배열로 전환, `coverage.semantic.status` 어휘 교체가 해당한다.
값 추가와 optional 필드 추가는 v1에서 계속 허용한다.

**두 벌 구현에 대한 메모.** Extension과 CLI가 코드를 공유하지 않는 병렬 구현이라는 점이 이 결정의 위험을
키운다. 어휘를 교체하는 (b)를 택하면 두 벌을 같은 릴리스에 맞춰 바꿔야 하는데 VSIX와 npm package는 릴리스
주기가 다르다. (c)는 두 벌이 서로 다른 시점에 새 필드를 채택해도 v1 계약이 계속 유효하다. 이것이 (c)를
권장하는 네 번째 근거다.

**승인 시 확정되는 것.** 4.1, 4.2, 4.3은 하나의 결정 묶음이다. 부분 승인(예: 충돌 1만 (c), 충돌 2는 (b))은
4.2의 근거 1을 위반하므로 권장하지 않는다.

## 5. `provider-coverage-contract.md` 개정안 (적용 완료)

4절 승인(2026-08-27)에 따라 아래 5.1~5.4를 `provider-coverage-contract.md`에 모두 적용했다.
아래 diff는 적용 내용의 기록이며, 실제 문서와 어긋나면 계약 문서를 기준으로 한다.
적용 중 추가로 발견한 사항은 5.5절에 있다.

### 5.1 `## Coverage metadata` 절 개정

```diff
-- `coverage.traversal.status`: 요청한 정적 그래프 탐색이 `complete`, `depth-limited`, `node-limited`인지 표시한다.
-- `coverage.semantic.status`: 현재 `static-only`; 향후 출처가 표시된 보조 edge가 포함되면 `augmented`이다.
+- `data.completion`: 상태의 단일 출처다. `requestStatus`(`succeeded | partial | failed`),
+  `traversalStatus`(`exhausted | depth-limited | node-limited | timeout | cancelled | unknown | failed | not-started`),
+  `semanticScope`(`provider-static | static-plus-inference | static-plus-observation | none`),
+  `indexingStatus`와 마지막 `stage`를 담는다.
+- `coverage.traversal.status`, `coverage.semantic.status`, `complete`, `truncated`, `traversalLimits`는
+  `completion`에서 파생되는 v1 projection이며 직접 계산하지 않는다. projection 표는
+  `docs/work/task-m1-state-truth-table.md` 4.1절과 4.2절에 있다.
+- `coverage.traversal.status`는 `complete`, `depth-limited`, `node-limited`, `timeout`, `failed` 5값을 모두
+  생산한다. `cancelled`와 `unknown`은 v1에서 `failed`로 내려 표현한다.
```

### 5.2 `## 허용 상태와 금지 상태` 절 교체

기존 4행 표를 이 문서 2.1절 S1~S13과 2.2절 F1~F22로 교체하고, 계약 문서에는 요약 표만 두고 전체 표는
이 작업 문서를 참조한다. 금지 조합 목록은 다음으로 확장한다.

```diff
 - `complete: true`이면서 traversal이 limited인 결과
 - provider 실패를 성공한 empty graph로 반환하는 결과
 - 명시적 근거 없이 indexing을 `ready`로 표시하는 결과
 - 감지 언어와 다른 bundled provider를 자동 실행하는 결과
+- `requestStatus: succeeded`이면서 traversal이 `exhausted`가 아닌 결과
+- `requestStatus: failed`이면서 `ok: true`인 결과
+- `semanticScope: none`이면서 `data`가 있는 결과
+- `indexingStatus: working`이면서 `requestStatus: succeeded`인 결과
+- `provider_not_ready`와 `no_incoming_callers`를 함께 담은 결과
+
+금지 조합은 문서 규칙이 아니라 타입 union과 schema `allOf`로 표현 불가능하게 만든다. 성공 응답의
+`data.nodes`는 root를 항상 포함하므로 `minItems: 1`이며, 빈 그래프는 표현할 수 없다. 실제 caller 0건은
+`nodes.length === 1`과 `edges.length === 0`으로 나타난다.
```

### 5.3 `## Provider 실패 코드` 표 확장

```diff
 | `provider_required_for_language` | discovery | bundled 지원 언어가 아니므로 해당 언어 provider를 설정해야 함 |
 | `provider_language_mismatch` | discovery | 명시한 `languageId`와 대상 언어가 다름 |
+| `provider_executable_not_found` | discovery | preset이 요구하는 실행 파일을 PATH·명시 경로에서 찾지 못함. 공식 설치 안내와 custom provider 경로를 제시 |
+| `provider_version_unsupported` | discovery | version은 읽었으나 preset의 지원 범위 밖. 업그레이드 또는 명시적 override |
+| `provider_version_unreadable` | discovery | version command는 실행됐으나 출력에서 version을 해석하지 못함. 실행 파일 확인 |
+| `provider_selection_ambiguous` | discovery | 검증된 후보가 둘 이상이라 결정적으로 고를 수 없음. 명시 preset 선택 요구 |
 | `provider_launch_failed` | launch | 실행 파일을 시작하지 못함 |
 | `provider_initialize_failed` | initialize | process가 시작됐지만 initialize를 완료하지 못함 |
+| `provider_protocol_incompatible` | initialize | server가 요구하는 필수 request/notification을 지원할 수 없거나 표준 응답을 거부함. `details.method` 포함. silent ignore 금지 |
 | `provider_capability_missing` | capability | server가 Call Hierarchy를 제공하지 않음 |
+| `provider_capability_probe_failed` | capability | initialize는 성공했으나 capability probe가 timeout·오류로 결론을 내지 못함. 명확한 부재인 `provider_capability_missing`과 구분 |
+| `provider_not_ready` | indexing | readiness budget 안에 provider가 준비되지 않음. 빈 결과를 caller 부재로 승격하지 않는다 |
+| `provider_project_metadata_missing` | indexing | readiness profile이 요구하는 build metadata 부재. metadata 생성 안내만 제공하고 build·configure·sync를 실행하지 않는다 |
 | `provider_query_failed` | query | prepare/incoming/open 요청 중 실패 |
+| `provider_fixture_failed` | query | doctor 기준 fixture가 기대 caller를 반환하지 않음. preset을 `verified-external`로 승격하지 않는다 |
+| `timeout` | `details.stage` | 요청이 timeout budget을 초과함. retryable |
+| `request_cancelled` | `details.stage` | 사용자 또는 상위 host가 취소함. 실패가 아니라 중단으로 보고 |
+| `target_not_found` / `target_ambiguous` | query | 요청 위치에서 callable symbol을 특정하지 못함 |
+| `internal_error` | `details.stage` | adapter 또는 CLI 내부 실패 |
```

**중복·충돌 검토 결과.** 신규 10종(`provider_executable_not_found`, `provider_version_unsupported`,
`provider_version_unreadable`, `provider_selection_ambiguous`, `provider_protocol_incompatible`,
`provider_capability_probe_failed`, `provider_not_ready`, `provider_project_metadata_missing`,
`provider_fixture_failed`, `request_cancelled`)은 기존 code 집합(`provider_*` 6종,
`provider_ipc_unavailable`, `node_*` 3종, `cli_artifact_*` 2종, `npm_runtime_unavailable`,
`bundled_provider_artifact_*` 3종, `timeout`, `target_*` 2종, `workspace_*` 2종, `internal_error`,
`invalid_request`, `invalid_command`)과 문자열이 겹치지 않는다. 의미 중복도 없다.

- `provider_version_unsupported`는 Node engine을 다루는 `node_version_unsupported`와 대상이 다르다
  (외부 Language Server vs Node runtime). 접두사가 이를 구분한다.
- `provider_executable_not_found`는 `cli_artifact_missing`(Impact Lens 자신의 artifact)이나
  `bundled_provider_artifact_missing`(package 내부 bundled server)과 달리 **사용자 환경의 외부 실행 파일**을
  가리킨다. 세 가지는 조치가 각각 CLI 재설치, package 재설치, 외부 도구 설치로 다르다.
- `provider_capability_probe_failed`와 `provider_capability_missing`은 "결론을 못 냄"과 "명확히 없음"이다.
  전자는 재시도가 유효하고 후자는 provider 교체가 필요하다.
- `provider_not_ready`는 error code와 `coverage.reasons` 양쪽에 같은 이름으로 나타난다. 의미는 같고,
  `ok` 필드가 사용 가능한 `data` 유무를 결정한다. 이 규칙을 계약에 명시한다.
- `request_cancelled`만 `provider_` 접두사를 쓰지 않는다. 취소는 provider의 결함이 아니라 host의 결정이므로
  provider 실패 code와 같은 계열로 묶으면 진단이 왜곡된다.

### 5.4 `## 기준 fixture` 표 추가 행

```diff
+| indexing 지연 mock server | custom provider | `provider_not_ready`, indexing working, 빈 결과를 caller 부재로 승격하지 않음 |
+| 미지원 server request를 보내는 mock server | custom provider | `provider_protocol_incompatible`와 `details.method` |
+| version 출력이 범위 밖·해석 불가인 mock executable | doctor | `provider_version_unsupported` / `provider_version_unreadable` 구분 |
+| 실행 파일 부재 preset | doctor | `provider_executable_not_found`와 설치 안내 |
+| capability는 있으나 fixture가 빈 결과 | doctor | `provider_fixture_failed`, preset 미승격 |
+| depth·node 동시 도달 그래프 | fake provider | `node-limited` 우선, reason 2종 동시 포함 |
+| 취소된 분석 | fake provider | `traversalStatus: cancelled`, 부분 결과 유지, `complete: false` |
```

### 5.5 적용하면서 추가로 처리한 것

5.1~5.4 diff를 실제 문서에 옮기는 과정에서 원안에 없던 항목 4건을 함께 처리했다.

1. **`provider_ipc_unavailable`이 실패 코드 표에 없었다.** `cli/src/childIpc.ts:71`이 실제로 던지는 code인데
   계약 표에 한 줄도 없었다. 2.2절 F9로는 이미 열거돼 있었지만 5.3 diff에는 빠져 있었다. `launch` stage
   행으로 추가했다. 부수 발견 code 목록에 이 항목을 추가한다.
2. **doctor code 표와 provider code 표의 경계를 명시했다.** `node_version_unsupported`(Node engine)와
   신규 `provider_version_unsupported`(외부 Language Server)가 이름이 비슷해 혼동되므로, 앞 표가 Impact Lens
   자신의 runner/packaging을, 뒤 표가 사용자 환경의 외부 server를 다룬다는 문장을 두 표 사이에 넣었다.
3. **`provider_` 접두사가 없는 code를 별도 표로 분리했다.** `timeout`, `request_cancelled`,
   `target_not_found`/`target_ambiguous`, `internal_error`를 `## Provider 실패 코드` 절 안의 두 번째 표로
   두고, 접두사를 쓰지 않는 이유(원인이 provider가 아니라 요청·위치·host 결정·Impact Lens 자신)를 적었다.
   같은 표에 섞으면 "provider가 고장났다"는 잘못된 진단을 유도한다.
4. **문서 상단에 truth table 참조와 우선순위 규칙을 넣었다.** 5.2가 "계약 문서에는 요약 표만 두고 전체 표는
   작업 문서를 참조한다"고 정했으므로, 두 문서가 어긋날 때 truth table이 기준이라는 규칙을 명시했다.
   또한 금지 문구 목록(`no impact`, `safe to change`, `unused` 등)을 요약해 계약 문서에도 남겼다.

### 5.6 적용 후 검증

| 확인 항목 | 결과 |
| --- | --- |
| `complete`의 정의가 "traversal exhausted의 v1 호환 표현"으로만 남아 있는가 | 통과. `## Coverage metadata` 말미 한 곳에서만 정의하고 `completion.traversalStatus === "exhausted"`를 기준으로 삼는다. 허용 상태 요약 표의 `complete` 열은 정의가 아니라 projection 값이다 |
| 새 error code가 기존 표의 code와 중복되지 않는가 | 통과. provider 표 16행 + 비-provider 표 5행의 code 문자열이 모두 유일하고, doctor/runner 표(`node_*`, `cli_artifact_*`, `npm_*`, `bundled_provider_artifact_*`)와도 겹치지 않는다 |
| 기존 금지 조합 4가지가 새 표에서 누락되지 않았는가 | 통과. 원문 4개 항목을 문자 그대로 유지하고 그 아래에 신규 5개를 덧붙였다 |
| 실사용 중인데 표에 없던 code가 문서화됐는가 | 통과. `timeout`, `request_cancelled`, `target_not_found`/`target_ambiguous`, `internal_error`를 두 번째 표에, `provider_ipc_unavailable`을 provider 표에 추가했다 |

## 단계별 구현 계획

각 단계는 독립적으로 검증·commit·push 가능하다.

### 1단계 — 상태 truth table과 결정안 문서화 (이 문서)

1. 현재 계약, `IL-LIM-004/005/009`, M1 마일스톤과 코드 기준선을 조사한다.
2. 3축 상태 모델, S1~S13 / F1~F22 truth table, severity와 사용자 문구를 확정한다.
3. 금지 조합 X1~X11과 타입/schema 표현 불가능화 방법을 정의한다.
4. 어휘 충돌 2건과 schema version 정책의 선택지를 비교하고 권장안을 제시한다.
5. `provider-coverage-contract.md` 개정 diff를 제안 형태로 작성한다.

종료 조건: 구현자가 boolean 추론 없이 표만으로 결과 상태를 만들 수 있고, 사람이 4절만 보고 승인 여부를
결정할 수 있다. **코드와 schema 파일은 변경하지 않는다.**

### 2단계 — 결정 승인과 계약 문서 반영 (완료, 2026-08-27)

1. 4절 권장안의 승인 여부를 받는다. — 완료. 4.1/4.2/4.3 묶음 전체가 권장안 (c)로 승인됐다.
2. 승인된 어휘로 5절 diff를 `provider-coverage-contract.md`에 적용한다. — 완료. 5.1~5.4 전부와
   5.5의 추가 4건을 적용했다.
3. `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`에 `completion` 예시와 금지 문구를
   추가한다. — **보류.** Plugin reference는 실제 응답 예시를 담는 문서라, `data.completion`을 생산하는
   구현(W1-C) 전에 예시를 넣으면 문서가 실제 출력과 어긋난다. W1-C와 함께 갱신한다.

종료 조건: 계약 문서가 승인된 어휘를 쓰고, 코드·schema는 변경하지 않는다. Plugin reference 갱신은
`data.completion` 구현 시점으로 이월했다.

### 3단계 — additive contract 구현 (`IL-LIM-009` 2단계, 별도 lane)

> 1~2를 포함한 타입·schema 반영은 W0-3 lane이, `data.completion`을 실제로 생산하는 구현은 W1-C lane이
> 맡는다. 이 문서는 두 lane의 입력 계약이며 직접 구현하지 않는다.


1. `cli/src/types.ts`에 `Completion` discriminated union과 non-empty `nodes` 타입을 도입한다.
2. `cli/src/coverage.ts`를 projection 함수로 바꾸고 `complete`/`truncated`/`traversalLimits` 계산을 단일
   함수로 모은다.
3. `cli/schemas/response.schema.json`에 `completion` `$defs`와 X1~X11의 `allOf` 규칙을 추가한다.
4. `src/types.ts`, `src/coverage.ts`에 같은 모델을 반영하고 두 벌이 같은 fixture로 교차 검증되게 한다.
5. `schemaVersion` 리터럴 2개를 단일 상수로 추출한다.

종료 조건: 기존 JSON fixture와 새 상태 fixture가 동시에 통과하고, 모순 조합이 컴파일 또는 validation에서
실패한다.

### 4단계 — 신규 error code 구현

1. `IL-LIM-005` 3단계와 함께 `provider_not_ready`, `provider_project_metadata_missing`,
   `provider_protocol_incompatible`을 구현한다.
2. `IL-LIM-004` 2단계와 함께 doctor 4종(`provider_executable_not_found`,
   `provider_version_unsupported`/`provider_version_unreadable`, `provider_capability_probe_failed`,
   `provider_fixture_failed`)을 구현한다.
3. `request_cancelled`와 `timeout`의 `details.stage`를 계약대로 정렬한다.

종료 조건: 5.4절 fixture가 모두 통과하고 doctor가 M1 종료 gate의 5개 상태를 구분한다.

## 테스트 및 완료 기준

### 1단계 완료 기준 (이 문서)

- [x] provider unavailable 6단계(discovery / language mismatch / launch / initialize / capability / query)가
      모두 표에 있다 — F1~F2, F8~F9, F10~F11, F12~F13, F16
- [x] prepare 성공 + caller 0건(실제 empty)이 indexing 근거 유무로 나뉘어 있다 — S2, S3
- [x] provider 준비 중 빈 결과(`not_ready`)가 실제 empty와 분리돼 있다 — S7, S8, F14
- [x] 자연 종료, depth limit, node limit, 동시 도달이 있다 — S1, S4, S5, S6
- [x] 요청 timeout이 부분 결과 유무로 나뉘어 있다 — S9, F17
- [x] 사용자·상위 취소가 부분 결과 유무로 나뉘어 있다 — S10, F18
- [x] adapter/내부 실패가 있다 — S11, F16, F21
- [x] 각 조합의 3축 + severity + 사용자 노출 문구가 확정됐다 — 2.1, 2.3
- [x] 모순 조합이 금지로 표시되고 타입/schema 표현 불가능화 방법이 함께 적혀 있다 — 3절 X1~X11
- [x] 현재 계약이 금지하는 4가지가 포함됐다 — X1~X4
- [x] `indexing` stage code, `provider_protocol_incompatible`, doctor 4종이 제안됐다 — 5.3
- [x] 신규 code가 기존 code와 문자열·의미상 충돌하지 않음이 검토됐다 — 5.3 하단
- [x] 어휘 충돌 2건에 대해 각각 3개 선택지를 비교하고 하나를 권장했다 — 4.1, 4.2
- [x] schema version 정책이 같은 결정으로 묶여 제안됐다 — 4.3
- [x] `provider-coverage-contract.md` 개정안이 별도 절에 제안 형태로 있다 — 5절
- [x] 코드·schema 파일을 변경하지 않았다

### 2단계 완료 기준

- [x] 4절 상단 경고가 승인 사실(2026-08-27, 4.1/4.2/4.3 묶음 전체)로 갱신됐다
- [x] 5절 제목의 `(승인 대기)`가 `(적용 완료)`로 갱신됐다
- [x] 5.1 Coverage metadata 개정이 계약 문서에 적용됐다
- [x] 5.2 허용/금지 상태 절이 요약 표 + 금지 조합 9개로 교체됐다
- [x] 5.3 provider 실패 코드 표가 16행으로 확장되고 비-provider code 표가 추가됐다
- [x] 5.4 기준 fixture 7행이 추가됐다
- [x] `complete`의 정의가 "traversal exhausted의 v1 호환 표현" 한 곳에만 남아 있다
- [x] 신규 code가 기존 표의 code와 문자열 중복이 없다
- [x] 기존 금지 조합 4가지가 문자 그대로 유지됐다
- [x] `timeout`, `request_cancelled`, `target_*`, `internal_error`, `provider_ipc_unavailable`이 문서화됐다
- [x] `cli/src/**`, `src/**`, `cli/schemas/**`를 수정하지 않았다

### 후속 단계 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| 모델 | S1~S13 전 행 | 기대 3축, projection 4필드, reason 집합이 정확히 일치 |
| 모델 | F1~F22 전 행 | 기대 code, stage, severity, action이 정확히 일치 |
| 타입 | X1~X11 각 조합 | TypeScript 컴파일 실패 또는 생성 불가 |
| schema | X1~X11 각 조합 | validation 실패 |
| schema | 기존 v1 fixture | 변경 없이 통과 |
| 호환 | `test-plugin-artifact-e2e.mjs` | `selectedBy === 'bundled'`, `complete === true` assert 유지 통과 |
| 교차 | Extension/CLI 동일 상황 | 두 구현이 같은 3축과 projection을 생산 |
| Plugin eval | S3, S8 | "영향 없음"·"unused" 결론을 생성하지 않음 |
| Plugin eval | S4, S5 | 부분 결과와 재분석 action을 결론보다 먼저 제시 |

## 작업 로그

### 2026-08-27 — 1단계: 조사와 문서 작성

**조사한 파일과 확인 사항**

- `AGENTS.md`: branch 분리, 작업 문서 형식, 단계별 commit·push 규칙 확인. 이 문서 형식을 1절에 맞췄다.
- `docs/development-management/provider-coverage-contract.md`: 현재 4행 허용/금지 표와 6종 provider 실패
  코드 표를 기준선으로 삼았다.
- `docs/development-management/stories/il-lim-009-completeness-semantics.md`: 3축 제안과 1단계 종료 조건 확인.
- `docs/development-management/stories/il-lim-005-custom-lsp-compatibility.md`: 3단계 readiness와 `not_ready`
  요구, rollout 절의 `provider_protocol_incompatible` 언급 확인.
- `docs/development-management/stories/il-lim-004-first-class-language-presets.md`: 2단계 doctor가 구분해야
  하는 4상태(missing executable, unsupported version, missing capability, fixture 실패) 확인.
- `docs/development-management/milestones/m1-provider-platform-ux.md`: 종료 gate의 doctor 구분 항목과
  "`complete: true`만으로 runtime 영향 없음을 주장하지 않는 fixture" 요구 확인.
- `cli/src/types.ts`, `cli/src/coverage.ts`, `cli/src/impact.ts`, `cli/schemas/response.schema.json`,
  `src/types.ts`, `src/coverage.ts`: 드리프트 3건, 하드코딩 2건, projection 구조 확인.
- 추가 조사: `cli/src/jsonRpc.ts`, `cli/src/lspProvider.ts`, `cli/src/childIpc.ts`, `cli/src/doctor.ts`,
  `cli/src/index.ts`, `src/graphPanel.ts`, `scripts/test-plugin-artifact-e2e.mjs`,
  `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`.

**설계 결정과 이유**

1. **3축에 "그래프 없음" 값을 추가했다.** `IL-LIM-009` 원안은 성공 응답만 상정한다. 실패 envelope까지 같은
   어휘로 덮지 않으면 Agent가 두 개의 상태 어휘를 다뤄야 한다. `not-started`/`failed`/`unknown`/`none`을
   추가한 근거는 1.1절에 적었다.
2. **`unknown`을 `not_ready`의 traversal 표현으로 채택했다.** `exhausted`는 거짓말이 되고, `failed`는 실제로
   반환된 부분 결과를 버리게 된다.
3. **root node 불변식을 발견해 X2의 schema 표현에 사용했다.** `cli/src/impact.ts:118`이 root를 항상 넣으므로
   성공 응답의 `nodes`는 `minItems: 1`이다. 빈 그래프 자체가 표현 불가능해진다.
4. **projection 단일 함수 원칙을 X1/X7/X10의 공통 해법으로 정리했다.** 모순 조합의 대부분은 "계산된 값과
   저장된 값이 따로 있다"에서 나온다.
5. **schema의 `timeout`/`failed`를 삭제하지 않고 채택했다.** 삭제는 producer 계약 축소라 v2 사유가 되고,
   채택하면 드리프트가 코드 쪽에서 해소된다.
6. **어휘 충돌 2건과 schema version 정책을 하나의 결정으로 묶었다.** 한 응답에서 한 필드는 v2, 다른 필드는
   v1인 상태가 가장 나쁘다.
7. **`request_cancelled`에 `provider_` 접두사를 붙이지 않았다.** 취소는 provider 결함이 아니라 host의
   결정이므로 provider 실패 code와 같은 계열로 묶으면 진단이 왜곡된다.

**실행한 검사**

- `git diff --check`: 통과(공백 오류 없음).
- 코드·schema 변경이 없으므로 컴파일·테스트는 이 단계의 검증 대상이 아니다. 문서에 인용한 파일 경로와
  줄 번호는 조사 시점 `origin/main`(`19a10b0`) 기준이다.

**제한 사항과 남은 작업**

- 4절과 5절은 **승인 대기 상태**다. 승인 전에는 `provider-coverage-contract.md`와 코드에 반영하지 않는다.
- S9~S11(부분 결과를 동반한 timeout/취소/query 실패)은 `IL-LIM-005` 1단계의 bounded cancellation 없이는
  구현할 수 없다. 그때까지는 F17/F18/F16으로 떨어진다는 사실을 2.1절에 명시했다.
- `indexingStatus: ready`의 `evidence` 필드 형태는 provider별 readiness 신호가 확정되는 `IL-LIM-005`
  3단계에서 정의한다. 이 문서는 "근거 없이는 `ready`를 만들 수 없다"는 제약만 고정한다.
- `limitationDetails`(code/severity/scope/message/action 객체 배열)의 정확한 필드 형태는 3단계에서 확정한다.
  이 문서는 severity 3단계와 문구·action 값만 확정했다.
- Extension과 CLI의 상수 단일 출처화는 이 문서 범위 밖이다. 4.3절의 v2 승격 조건 4로 남겨뒀다.

### 2026-08-27 — 2단계: 결정 승인과 계약 문서 반영

**승인 내용**

4.1(traversal 어휘), 4.2(semantic 어휘), 4.3(schema version 정책)이 묶음으로 승인됐다. 세 절 모두 권장안
(c) additive가 그대로 채택됐고 `schemaVersion`은 1을 유지한다. 부분 승인은 없었다.

**변경한 파일과 핵심 변경 내용**

- `docs/work/task-m1-state-truth-table.md`
  - 머리말의 "승인 필요"를 "승인 상태"로 바꾸고 승인 일자와 범위, 후속 lane(W0-3, W1-C)을 명시했다.
  - 4절 상단의 "이 절은 제안이다" 경고를 승인 사실로 교체했다. 비교 표는 결정 근거 기록으로 남겼다.
  - 5절 제목을 `(승인 대기)`에서 `(적용 완료)`로 바꾸고, 실제 문서와 어긋나면 계약 문서를 기준으로 한다는
    규칙을 넣었다.
  - 5.5(적용하며 추가 처리한 4건)와 5.6(적용 후 검증 4항목)을 새로 썼다.
  - 단계별 계획의 2단계를 완료로, 3단계를 별도 lane 소유로 표시했다.
  - 2단계 완료 기준 체크리스트를 추가했다.
- `docs/development-management/provider-coverage-contract.md`
  - 머리말에 truth table 참조와 "어긋나면 truth table 기준" 규칙 추가.
  - `## Coverage metadata`: `data.completion`을 상태의 단일 출처로 선언하고, 나머지 5필드를 projection으로
    재정의했다. `complete`의 정의를 `completion.traversalStatus === "exhausted"`의 v1 호환 표현으로 바꿨다.
    `### schema version 정책` 소절을 추가했다.
  - `## 허용 상태와 금지 상태`: 4행 표를 3축 요약 표 10행으로 교체하고, 금지 조합을 4개에서 9개로 늘렸다.
    금지 문구 목록과 "타입 union + schema `allOf`로 표현 불가능하게 만든다"는 원칙을 덧붙였다.
  - `## Provider 실패 코드`: 6행에서 16행으로 확장하고, `provider_` 접두사가 없는 code 4종을 별도 표로
    분리했다.
  - `## 기준 fixture`: 7행 추가.

**설계 결정과 이유**

1. **`provider_ipc_unavailable`을 provider 표에 추가했다.** 5.3 원안 diff에 빠져 있었지만 코드가 실제로
   던지는 code이고 truth table F9에는 이미 있었다. 문서화하지 않으면 "표에 없는 code" 문제가 그대로 남는다.
2. **비-provider code를 같은 표에 섞지 않았다.** `timeout`, `request_cancelled`, `target_*`,
   `internal_error`는 원인이 provider가 아니다. 하나의 "Provider 실패 코드" 표에 넣으면 사용자와 Agent가
   provider 설정을 의심하게 만든다. 절은 같게 두되 표를 나누고 이유를 적었다.
3. **`node_version_unsupported`와 `provider_version_unsupported`의 경계를 명시했다.** 이름이 비슷해 혼동
   위험이 있어 두 표 사이에 한 문장을 넣었다.
4. **Plugin reference 갱신을 이월했다.** `cli-contract.md`는 실제 응답 예시를 담는 문서다. `data.completion`
   생산 구현 전에 예시를 넣으면 문서가 실제 출력과 어긋난다. W1-C와 함께 갱신한다.

**실행한 검사**

- `git diff --check`: 통과.
- 계약 문서 전체를 다시 읽어 4항목을 확인했다. 결과는 5.6절 표에 있다. 요약: `complete` 정의 1곳 유지,
  code 문자열 중복 없음, 기존 금지 조합 4가지 문자 그대로 유지, 부수 발견 code 5종 문서화 완료.
- `cli/src/**`, `src/**`, `cli/schemas/**`에 변경 없음을 `git status`로 확인했다.

**아직 코드에 반영되지 않은 것**

- `data.completion` 필드 자체가 존재하지 않는다. 계약 문서는 이 필드를 "상태의 단일 출처"로 선언했지만
  CLI는 아직 생산하지 않는다. **문서가 구현보다 앞서 있는 구간이며 W1-C가 닫는다.**
- `coverage.traversal.status`의 `timeout`과 `failed`는 여전히 schema에만 있고 `cli/src/coverage.ts`는
  3값만 생산한다. 계약 문서는 5값을 모두 생산한다고 선언했다. W0-3/W1-C가 닫는다.
- `cli/src/types.ts`의 union은 여전히 3값이고, `src/types.ts`는 리터럴 타입이라 새 값 도입 시 먼저 깨진다.
- 신규 error code 10종(+ `provider_ipc_unavailable` 문서화)은 문서에만 있다. `provider_not_ready`,
  `provider_project_metadata_missing`, `provider_protocol_incompatible`은 `IL-LIM-005` 3단계에,
  doctor 5종은 `IL-LIM-004` 2단계에, `request_cancelled`는 `IL-LIM-005` 1단계 cancellation에 묶인다.
- 5.4에 추가한 fixture 7종은 아직 존재하지 않는다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`는 여전히 구어휘 예시만 담고 있다.

**남은 모호함**

- `data.completion`의 `stage` 값이 실패 envelope의 `error.details.stage`와 같은 필드인지, 별도로 두는지가
  아직 정해지지 않았다. 두 곳에 같은 값을 중복 저장하면 X-계열 모순이 하나 더 생긴다. W0-3에서 결정해야
  한다.
- `no_incoming_callers`와 `index_state_unknown`은 이번에 새로 도입한 reason code인데, 기존 reason code와
  달리 error code 표에 대응 항목이 없다. reason 전용 code의 목록을 계약 문서에 별도 표로 둘지 결정이 남았다.
- `traversal_timeout` / `traversal_cancelled` reason과 `timeout` / `request_cancelled` error code가 같은
  사건의 두 표현이다. 이름을 통일할지 지금처럼 분리할지는 W0-3에서 확정한다.
