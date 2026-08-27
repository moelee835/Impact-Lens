# M1 W1-C — `data.completion` 생산과 v1 projection

- 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대응 스토리: `IL-LIM-009` 2단계
- lane: W1-C (`il-contract-architect`), branch `feat/m1-completeness-emit`
- 입력 계약: [`task-m1-state-truth-table.md`](task-m1-state-truth-table.md),
  [`provider-coverage-contract.md`](../development-management/provider-coverage-contract.md)
- 직전 세션 인계: [`task-m1-wave0-handover.md`](task-m1-wave0-handover.md)

## 배경과 해결할 문제

W0-1이 상태 truth table을 확정하고 계약 문서까지 반영했지만, **코드는 아직 그 표의 상태를 생산하지 않는다.**
handover 7절이 "문서가 구현보다 앞선 구간"으로 추적 중인 항목 두 개가 이 lane의 대상이다.

1. `data.completion`이 상태의 단일 출처라고 계약 문서가 선언했으나 CLI는 그 필드를 만들지 않는다.
2. `coverage.traversal.status`는 계약상 5값인데 `cli/src/coverage.ts`는 3값(`complete`/`depth-limited`/
   `node-limited`)만 만든다. `timeout`과 `failed`는 아무도 생산하지 않는 선언이다.

그리고 지금 구조는 모순 값을 만들 수 있다. `complete`, `truncated`, `traversalLimits`, `coverage.*`가
각각 독립적으로 계산되어 `cli/src/impact.ts`의 반환 객체 리터럴에 나란히 저장되므로, 한 줄만 잘못 고치면
`complete: true` + `traversal.status: 'depth-limited'`가 컴파일도 되고 schema validation도 통과한다.
truth table 3절의 X1·X7·X10이 지적하는 그대로다.

## 범위

- `data.completion`(`requestStatus`/`traversalStatus`/`semanticScope`/`indexingStatus`) 생산
- `coverage.traversal.status` 5값 전부를 생산하는 경로 개설
- `complete`/`truncated`/`traversalLimits`/`coverage.*`/`limitations`를 `completion`에서 파생되는
  **단일 projection 함수**로 재구성 (출력 값은 무변경)
- structured `limitationDetails` additive 필드 추가
- `indexing`을 `ready`/`working`으로 **받을 수 있는 경로**만 개설. 실측은 하지 않는다(Wave 2)
- 금지 조합 X1~X11을 타입 union과 schema `allOf`로 표현 불가능하게 만들기
- 금지 문구 6종을 어떤 상태에서도 생성하지 않음을 테스트로 강제
- handover 6절 미결 1·2·3·5 결론과 계약 문서 반영
- (lead 추가 지시, 2026-08-27) 신규 error code `provider_config_invalid` 선언
- (lead 추가 지시, 2026-08-27) handover 6절 미결 4번 — `provider_ipc_unavailable`의 stage를 계약 문서에서
  코드에 맞춘다. 코드는 건드리지 않는다

## 제외 범위

- `cli/src/jsonRpc.ts`, `cli/src/lspProvider.ts`, `cli/src/lsp/**` — W1-A 소유
- `cli/src/providers/**`, `cli/src/doctor*`, `cli/src/runtime.ts`, `cli/src/childIpc.ts` — W1-B / W1-A 소유.
  `provider_config_invalid`를 실제로 던지는 코드도 W1-B다
- 요청 스키마의 `providerPreset` / 요청 수준 `initializationOptions` / `settings` — W1-C merge 직후의 별도
  contract lane
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md` — 같은 wave에서 W1-B도 다른 절을
  고칠 예정이라 한 파일 2 lane 규칙에 걸린다. **이 문서 부록 B에 "낡아진 예시 목록"만 남기고 후속 lane에 넘긴다.**
- `src/**` (Extension) — Wave 2 (W2-B). CLI와 코드를 공유하지 않는 병렬 구현이므로 이 lane에서 건드리지 않는다
- `indexing` 실측, `$/cancelRequest` 전송, 부분 결과 반환 트리거 — W1-A/W2-A
- `schemaVersion` 2 승격. 이 lane은 additive만 한다

## 현재 구현 조사 결과

기준선은 `origin/main` `dbc6c9b`(W0-4 merge 완료)다. handover 5절의 "재조사 불필요한 사실"은 재확인하지
않고 그대로 사용했다. 아래는 이 lane이 새로 확인한 것만 적는다.

### 상태가 저장 필드로 흩어져 있다

`cli/src/impact.ts`의 `analyzeImpact()` 반환 리터럴에 다음이 각각 독립 계산으로 들어간다.

| 필드 | 현재 계산식 |
| --- | --- |
| `truncated` | `traversal.limits.size > 0` |
| `traversalLimits` | `[...traversal.limits].sort()` |
| `complete` | `traversal.limits.size === 0` |
| `coverage` | `coverageForTraversal(traversal.limits, ...)` |
| `limitations` | 배열 리터럴에 조건부 `push` 5회 |

`coverage.reasons`는 `limitations` 배열과 **같은 객체 참조**다. 즉 두 필드는 이미 하나의 값이며, 계약이
말하는 "`limitations`는 `reasons`의 projection"은 우연히 성립하고 있다.

### `limitations`의 현재 생산 순서

`dynamic_calls_not_inferred`, `unsaved_buffers_unavailable`, (`provider_diagnostics_unsupported`),
(`depth_limit_reached`), (`node_limit_reached`). 괄호는 조건부다. 이 순서는 배열 값이므로 바이트 비교
대상이다. 새 구조가 같은 순서를 재현해야 한다.

### 실패 envelope에는 3축을 실을 자리가 없다

`cli/src/index.ts`의 `main()` catch는 `error.{code,message,retryable,details?}`만 만든다.
`data`/`capabilities`/`coverage`가 없다. truth table 2.2절은 3축을 `error.details.completion`에 additive로
싣는 것을 "결정 대상"으로 남겼다.

### `internal_error`에는 `details`가 없다 (미결 5)

`cli/src/index.ts`의 generic catch는 `new CliError('internal_error', message, 10)`을 만든다. 4번째 인자
(`details`)를 주지 않으므로 `details.stage`가 존재할 수 없다. 반면 `timeout`은 `cli/src/jsonRpc.ts`가
`{ stage: this.lifecycleStage, method }`를 실제로 붙인다. 즉 계약 표의 `details.stage` 열은 `timeout`에서는
참이고 `internal_error`에서는 거짓이다.

### 캡처 비결정성을 새로 발견했다

handover 8절이 경고한 `mkdtemp` 함정 외에 **두 번째 비결정 요인**이 있다. 고정 workspace로 코드를 하나도
바꾸지 않고 캡처를 두 번 떴더니 `ok-ts.txt`만 달랐다.

```
547c547
<         "diagnostics": true
---
>         "diagnostics": false
```

`provider.observed.diagnostics`다. `cli/src/lspProvider.ts`가 `publishDiagnostics`를 고정 100 ms만
기다리므로(handover 5절), 부하가 걸린 머신에서는 알림이 늦게 도착해 필드가 `false`로 뒤집힌다.
top-level `provider.diagnostics`(advertised 기반)는 안정적이라 `limitations`의
`provider_diagnostics_unsupported` 유무는 영향을 받지 않는다. 캡처 스크립트에서 `timings`와 같은 이유로
정규화했고, 정규화 후 3회 연속 캡처가 완전 동일함을 확인했다.

이것은 이 lane의 변경과 무관한 **기존 결함**이다. W1-A(고정 100 ms 대기 제거)의 입력으로 넘긴다.

구현 중에 비결정 요인 두 가지를 더 만났다(`os.tmpdir()`이 프로세스 간에 안정적이지 않다, scratchpad가 다른
에이전트와 공유된다). 둘 다 2단계 작업 로그에 적었다.

## 설계 결정

### D1. `completion`은 저장이 아니라 **입력**이고, 나머지는 전부 그 projection이다

`cli/src/coverage.ts`에 `graphCompletion(observations)` 하나만 두고, `complete`/`truncated`/
`traversalLimits`/`coverage`/`limitations`/`limitationDetails`를 `projectCompletion()` 하나가 함께 만든다.
`cli/src/impact.ts`는 관측값(limit set, interruption, indexing, semantic scope)만 넘기고 결과를 펼친다.
X1·X7·X10이 요구하는 "계산과 저장을 분리하지 않는다"를 이렇게 만족한다.

### D2. `data.completion`에 `stage`를 넣지 않는다 (미결 1 결론)

**선택지**

| # | 안 | 결과 |
| --- | --- | --- |
| a | `completion.stage`와 `error.details.stage`를 둘 다 둔다 | 성공 envelope에서 `completion.stage`가 `capabilities.lifecycle.stage`와 **같은 사실의 두 번째 사본**이 된다. 모순 조합이 하나 늘어난다 |
| b | `completion`을 실패 envelope의 `error.details`에도 싣고 `stage`는 `completion`에만 둔다 | 실패 envelope의 `error.details.stage`(이미 배포됨)와 중복. 기존 소비자 필드를 못 없애므로 결국 (a)와 같다 |
| c | `completion`에서 `stage`를 뺀다 | 성공 → `data.provider.lifecycle.stage`, 실패 → `error.details.stage`. 한 envelope에 stage가 정확히 한 곳 |

**결론: (c).** 근거는 두 가지다.

1. **중복이 실재한다.** 성공 응답은 이미 `data.provider.lifecycle.stage`(= `capabilities.lifecycle.stage`)를
   담고 있고, 그 정의가 truth table 1.1절의 `stage`와 글자 그대로 같다("마지막으로 도달한 lifecycle 단계").
   `completion.stage`를 추가하면 `lifecycle.stage: 'query'` + `completion.stage: 'initialize'`라는 모순이
   표현 가능해진다. 미결 1이 경계한 바로 그 상황이다.
2. **축이 다르다.** `completion`의 나머지 4필드는 *결과*의 속성이고 `stage`는 *provider*의 속성이다.
   provider가 없는 결과(Extension 경로, 향후 캐시 경로)에도 `completion`은 있어야 하지만 `stage`는 없을 수 있다.

계약 문서의 "`completion`은 … 마지막 `stage`를 담는다" 문장을 이 결론으로 고친다.

### D3. reason code를 계약에 별도 표로 둔다 (미결 2 결론)

`no_incoming_callers`와 `index_state_unknown`은 대응 error code가 없다. 이는 결함이 아니라 **두 이름공간이
다르기 때문**이다. `cli/src/errors.ts`가 이미 그 규칙을 주석으로 못 박고 union에서 reason을 배제한다.
계약 문서에 reason code 전용 표를 추가하고, 각 code의 severity·scope·대응 error code 유무를 명시한다.
"대응 error code 없음"이 정상 상태임을 표가 보여주면 다음 lane이 이름을 억지로 맞추지 않는다.

### D4. `traversal_timeout`/`traversal_cancelled`는 `timeout`/`request_cancelled`와 **통일하지 않는다** (미결 3 결론)

| # | 안 | 근거 |
| --- | --- | --- |
| a | 이름을 통일한다(`timeout`, `request_cancelled`를 reason으로도 사용) | 이름은 하나가 되지만 `limitations: ["dynamic_calls_not_inferred","timeout"]`이 "요청이 실패했다"로 읽힌다. 실제로는 부분 그래프가 있는 성공 응답이다 |
| b | 현행 유지(`traversal_*` prefix) | 접두사가 "무엇이 중단됐는가"를 말한다. 그래프가 있는 중단과 없는 실패를 문자열만 보고 구분할 수 있다 |

**결론: (b).** 대신 계약에 **짝을 명시**한다. `traversal_timeout` ↔ `timeout`,
`traversal_cancelled` ↔ `request_cancelled`이며, 규칙은 "`traversal_` 접두사가 붙은 reason은 사용할 수 있는
부분 그래프가 있는 `ok: true` 응답을 뜻하고, 접두사 없는 error code는 그래프가 없는 `ok: false`를 뜻한다".
`provider_not_ready`가 양쪽에 같은 이름으로 나타나는 기존 규칙("`ok`가 `data` 유무를 결정한다")과 같은 형태다.

### D5. `internal_error`의 stage 열은 계약이 틀렸다 (미결 5 결론)

계약 표는 `internal_error`의 stage를 `details.stage`로 적었지만 generic catch는 stage를 알 수 없다.
없는 사실을 만들어 붙이는 것은 이 계약이 금지하는 "근거 없는 주장"과 같은 종류다.

**결론: 문서를 고친다.** `internal_error`의 stage 열을 "없음(알 수 없음)"으로 바꾸고, 규칙을 추가한다 —
`details.stage`는 **던지는 지점이 stage를 실제로 아는 경우에만** 존재한다. generic catch는 stage를 지어내지
않는다. `timeout`은 `cli/src/jsonRpc.ts`가 실제로 stage를 붙이므로 표 그대로 둔다.
코드는 바꾸지 않는다(`cli/src/index.ts`는 이 lane 소유가 아니고, 현재 동작이 옳다).

### D6. `no_incoming_callers`/`index_state_unknown`은 v1 배열에 넣지 않는다 — **lead 결정 필요**

여기서 지시 두 개가 충돌한다.

- 완료 조건 3·2: `limitations`/`coverage.reasons`를 포함한 기존 필드는 **값이 지금과 동일**해야 하고,
  추가 필드를 제거하면 baseline과 바이트 동일해야 한다.
- 완료 조건 4: truth table S2·S3가 도달 가능해야 한다. 두 행의 "필수 reason"은
  `기본 + no_incoming_callers (+ index_state_unknown)`이다.

caller 0건은 **지금도 발생하는 상태**다(캡처 시나리오 `ok-no-callers`). 두 code를 v1 배열에 넣으면 그 응답의
`limitations`와 `coverage.reasons` 값이 바뀌므로 바이트 비교가 깨진다. 반대로 넣지 않으면 v1 배열과
`limitationDetails`의 code 집합이 갈라진다.

**이 lane의 선택:** 새 code는 `limitationDetails`에만 싣고 v1 배열에서는 보류한다. 보류 대상은
`cli/src/coverage.ts`의 `V1_WITHHELD_REASON_CODES` 상수 **한 곳**에 있고, 상수를 비우면 S2·S3의 v1 배열이
truth table대로 채워진다는 것을 테스트가 증명한다.

**lead 결정이 필요한 이유:** 두 code를 v1 배열에 넣는 것이 `IL-LIM-009`의 목적(0건 결과를 "영향 없음"으로
읽지 못하게 한다)에 더 부합한다. 하지만 그것은 이미 배포된 필드의 **값 변경**이므로, `cli-contract.md`
예시 갱신·plugin eval 갱신과 같은 릴리스에서 처리해야 한다. W2-C(`docs/m1-plugin-auto-contract`)가 그
자리다. 결정을 그 lane으로 넘긴다.

### D7. `indexing.status: 'ready'`는 evidence 없이는 타입으로 만들 수 없다 (X3)

`Coverage['indexing']`을 union으로 바꾼다.

```ts
type IndexingCoverage =
  | { readonly status: 'ready'; readonly evidence: IndexingReadinessEvidence }
  | { readonly status: 'working' | 'unknown' };
```

`evidence`의 정확한 형태는 provider별 readiness 신호가 확정되는 `IL-LIM-005` 3단계(W2-A)가 소유한다.
이 lane은 `{ signal, detail? }` 최소 형태만 예약하고, **evidence 없이 `ready`를 만들 수 없다**는 제약만
고정한다. 값을 생산하지 않으므로 출력은 변하지 않는다.

### D8. interruption은 열거된 관측 사건으로 받는다

`traversalStatus`를 직접 받으면 호출자가 모순을 만들 수 있다. 대신 관측 사건을 받는다.

| interruption | `traversalStatus` | v1 traversal | reason |
| --- | --- | --- | --- |
| 없음 + limit 없음 | `exhausted` | `complete` | — |
| 없음 + depth | `depth-limited` | `depth-limited` | `depth_limit_reached` |
| 없음 + nodes | `node-limited` | `node-limited` | `node_limit_reached` |
| `timeout` | `timeout` | `timeout` | `traversal_timeout` |
| `cancelled` | `cancelled` | `failed` | `traversal_cancelled` |
| `provider-failed` | `failed` | `failed` | `provider_query_failed` |
| `provider-not-ready` | `unknown` | `failed` | `provider_not_ready` |

interruption은 limit보다 우선한다. node 예산이 남았는지와 무관하게 탐색을 멈춘 **직접 원인**이기 때문이다.
limit reason은 실제로 limit에 도달했다면 함께 실린다(S6과 같은 형태).

**이 lane은 interruption을 생산하지 않는다.** 생산자는 W1-A(`$/cancelRequest`, timeout budget)와
W2-A(readiness probe)다. 이 lane은 `analyzeImpact()`의 선택적 4번째 인자로 **받을 수 있는 경로**만 연다.

### D9. `provider_config_invalid`는 선언하되 **던지는 union에는 넣지 않는다** (lead 추가 지시 1)

project 설정 파일의 provider 설정이 스키마 검증에 실패한 상황을 덮는 code가 승인된 신규 11종에 없다.
`invalid_request` 재사용은 lead가 기각했다(요청은 멀쩡한데 사용자가 고쳐야 할 파일을 잘못 지목하게 된다).

W0-3이 `cli/src/errors.ts`에 세운 불변식은 "`CLI_ERROR_CODES`에는 `cli/src`의 어떤 줄이 실제로 던지는 code만
넣는다"이고 `cli/src/test/errors.test.ts`가 텍스트 검사로 강제한다. `provider_config_invalid`를 던지는 쪽은
W1-B이고 아직 없다.

| # | 안 | 결과 |
| --- | --- | --- |
| a | 계약 문서에만 추가하고 `errors.ts`는 손대지 않는다 | 불변식 유지. 그러나 lead 지시("`errors.ts`에 추가하라")를 못 지키고, 계약에만 있는 code 목록이 여전히 **주석 산문**으로만 남는다 |
| b | `CLI_ERROR_CODES`에 넣고 텍스트 검사에서 예외 처리한다 | 지시는 지키지만 W0-3의 불변식이 예외 목록만큼 약해진다. "선언만 있고 아무도 안 던지는 code"가 정확히 이 모듈이 막으려던 것이다 |
| c | `CONTRACT_ONLY_ERROR_CODES` 배열을 새로 export하고, 두 배열이 서로소이며 contract-only code는 `new CliError(`로 던져지지 않음을 테스트로 강제한다 | 지시를 지키면서 불변식이 **강해진다** |

**결론: (c).** 근거 세 가지.

1. `errors.ts`에는 이미 계약 전용 code 10종이 주석 산문으로 나열돼 있다. 산문은 검사되지 않으므로,
   누가 그중 하나를 던지기 시작해도 주석은 그대로 남는다. 배열로 바꾸면 검사할 수 있다.
2. 새 테스트는 "contract-only code를 `new CliError('<code>'`로 던지면 실패"다. 즉 W1-B가 실제로 던지는
   순간 빌드가 깨지고, 그 lane이 code를 `CLI_ERROR_CODES`로 **옮기도록 강제**한다. 이는 W0-3 불변식의
   반대 방향 짝이며 둘이 합쳐져야 양방향이 닫힌다.
3. reason code와 error code는 이름이 겹칠 수 있으므로(`provider_not_ready`) 텍스트 검사를
   `new CliError('<code>'` 패턴으로 좁혔다. 단순 문자열 포함 검사로는 이 lane이 coverage.ts에 넣는
   reason 문자열을 error code 사용으로 오인한다.

### D10. `provider_ipc_unavailable`의 stage는 `{launch, initialize, query}`다 (lead 추가 지시 2, 미결 4 종결)

lead가 `il-lsp-protocol`의 조사와 권고를 채택했다. **계약 문서를 코드에 맞춘다. 코드는 바꾸지 않는다.**

`cli/src/childIpc.ts`의 `childIpcUnavailableError()`가 원래 오류의 `details`를 그대로 펼치고,
`looksLikeSilentProviderFailure()`가 `provider_launch_failed`·`provider_initialize_failed`·
`provider_query_failed`를 모두 받아들이므로 `details.stage`는 셋 중 하나로 나간다.

채택된 근거(lead 제시, 두 번째가 결정적):

1. `details.stage`는 다른 모든 code에서 "마지막으로 도달한 lifecycle 단계"다. 한 code에서만 "원인의 시점"으로
   바꾸면 축의 정의가 code마다 달라진다.
2. **stdio가 전달되지 않는 환경에서 "IPC가 죽은 시점"은 관측 불가능하다.** child는 정상 spawn되고 실패는
   언제나 다음 상호작용에서 드러난다. 관측할 수 없는 값을 계약에 적으면 그 값은 추측이 된다.
3. `initialize`에서 알아챈 것과 `query`에서 알아챈 것은 사용자에게 다른 정보다. `launch`로 뭉개면
   "server가 한 번 답한 뒤 stdio가 끊겼다"를 표현할 수 없다.

truth table 2.2절 F9 행도 `launch` 고정이므로 함께 고친다.

### D11. `coverage.indexing.evidence`에 절대 시각을 넣지 않는다

lead 승인 형태는 `{ signal, detail }`이다. 벽시계 값을 넣으면 이 저장소의 검증 방식(응답 캡처 바이트 비교)이
통째로 무력화된다. 이 lane이 여는 "받을 수 있는 경로"의 타입에도 timestamp 필드를 두지 않고, 그 이유를
`cli/src/types.ts`에 주석으로 남긴다. Wave 2가 형태를 확장할 때 같은 제약을 상속하게 하기 위해서다.

## 단계별 구현 계획

### 1단계 — 작업 문서와 무변경 기준선 (이 커밋)

1. 이 문서를 작성한다.
2. W0-4 부록 A의 캡처 스크립트를 재사용해 고정 workspace로 baseline을 뜬다.
3. 코드를 바꾸지 않은 채 **3회 캡처**해 캡처 자체가 결정적임을 먼저 증명한다.

검증: `npm run cli:build`, 캡처 3회 `diff -r` 공백.

### 2단계 — completion 모델과 v1 projection

1. `cli/src/types.ts`에 `completion` 어휘 배열·union과 `IndexingCoverage` union, `LimitationDetail`를 추가한다.
2. `cli/src/coverage.ts`를 `graphCompletion()` + `projectCompletion()` 구조로 바꾼다.
3. `cli/src/impact.ts`가 projection 결과를 펼치도록 바꾸고 `AnalysisObservations` 인자를 연다.
4. `cli/schemas/response.schema.json`에 `completion`·`limitationDetail`·`indexingEvidence` `$defs`와
   `data.completion`/`data.limitationDetails` 선언을 additive로 추가한다.
5. S1~S13 도달 가능성 테스트와 enum parity 테스트를 추가한다.

검증: `npm run cli:build`, `npm run cli:test`, `npm test`, 캡처 strip 비교, `npm run test:plugin-artifact`.

### 3단계 — 금지 조합과 금지 문구 강제

1. schema `allOf`에 X1·X2·X3·X5·X7·X8·X9·X10·X11 규칙을 추가한다.
2. 각 금지 조합을 만든 envelope가 validation에서 실패하는 테스트를 추가한다.
3. 타입으로 막는 X1·X2·X3·X5·X6·X8·X9·X10·X11은 컴파일 거부 fixture로 증명한다.
4. 금지 문구 6종이 어떤 상태에서도 생성되지 않음을 테스트로 강제한다.

검증: `npm run cli:build`, `npm run cli:test`, `npm test`.

### 4단계 — 계약 문서 반영, 신규 code 선언과 인계

1. `provider-coverage-contract.md`에 D2·D3·D4·D5 결론과 reason code 표, projection 규칙을 반영한다.
2. `provider_config_invalid`를 계약 문서에 추가하고 `cli/src/errors.ts`에 D9의 (c)안으로 선언한다.
3. `provider_ipc_unavailable`의 stage를 계약 문서와 truth table F9에서 D10대로 고친다.
4. 이 문서 부록 B에 `cli-contract.md`의 낡아진 예시·문장 목록을 남긴다.

검증: `npm run cli:test`, `npm run test:all`.

## 테스트 및 완료 기준

- [x] `npm run cli:build`, `npm run cli:test`, `npm test` 통과
- [x] 캡처 29 시나리오에서 **추가 필드를 제거하면 baseline과 바이트 동일** (최소 15개, 성공·실패·부분 포함)
- [x] 스키마 enum ↔ TS union parity 테스트가 새 필드까지 덮는다
- [x] S1~S13 각 행이 실제로 도달 가능함을 보이는 테스트가 있다
- [x] X1~X11이 타입 또는 schema `allOf`로 표현 불가능하다
- [x] 금지 문구 6종이 어떤 상태에서도 생성되지 않는다
- [x] `npm run test:plugin-artifact` 통과, `selectedBy === 'bundled'`·`complete === true` assert 유지
- [x] `schemaVersion`은 1 그대로
- [ ] 미결 1·2·3·4·5의 결론과 근거가 이 문서와 계약 문서에 있다
- [ ] `provider_config_invalid`가 계약 문서와 `cli/src/errors.ts`에 선언되고, W0-3의 불변식이 약해지지 않았다
- [x] `coverage.indexing.evidence` 타입에 절대 시각 필드가 없다

## 작업 로그

### 2026-08-27 — 1단계: 작업 문서와 무변경 기준선

**수행**

- 입력 문서 5종(AGENTS.md, handover, truth table, 계약 문서, 실행 계획)과 직전 두 lane의 작업 문서를 읽고
  W0-4 부록 A의 캡처 스크립트를 그대로 재사용했다. 저장소에 커밋하지 않는 이유도 그대로 유효하다.
- `feat/m1-completeness-emit`을 `origin/main` `dbc6c9b`에서 만들었다.
- `npm install`, `npm --prefix cli install`, `npm run cli:build` 성공.

**캡처 결정성 검증 (코드 변경 전)**

| 회차 | 결과 |
| --- | --- |
| base1 vs base2 (정규화 전) | `ok-ts.txt` 2줄 차이 — `provider.observed.diagnostics` |
| base1 vs base2 vs base3 (정규화 후) | **완전 동일** |

`observed.diagnostics` 비결정성은 조사 결과 절에 적었다. 이 lane과 무관한 기존 결함이며 W1-A로 넘긴다.

**캡처한 29 시나리오**

| 분류 | 개수 | 시나리오 |
| --- | ---: | --- |
| 성공(자연 종료) | 7 | `ok-ts`, `ok-tsx`, `ok-js`, `ok-jsx`, `ok-mts`, `ok-include-source`, `ok-no-callers` |
| 부분(limit 도달) | 2 | `ok-depth-limited`, `ok-node-limited` |
| provider 실패 | 10 | `err-language-mismatch`, `err-required-for-language-py`, `err-required-for-language-txt`, `plaintext-unknown-match`, `err-launch-failed`, `err-initialize-silent`, `err-initialize-logged`, `err-initialize-exiting`, `err-capability-missing`, `err-query-failed`, `custom-no-language-id` |
| 대상 실패 | 2 | `err-target-not-found`, `err-bad-position` |
| CLI 표면 | 2 | `err-invalid-command`, `err-unknown-option` |
| doctor | 2 | `doctor-preflight`, `doctor-smoke` |
| note | 3 | `note-set`, `note-get`, `note-list` |

(provider 실패 행은 11개 시나리오를 담고 있어 합계는 29다.)

**결정 사항**

- D1~D8을 설계 결정 절에 적었다. 미결 1·2·3·5의 결론은 각각 D2·D3·D4·D5다.
- D6은 지시 충돌이라 **lead 결정 필요**로 남기고 기본값(보류)을 구현한다. 근거는 D6에 있다.

### 2026-08-27 — 2단계: completion 모델과 v1 projection

**변경한 파일**

| 파일 | 핵심 변경 |
| --- | --- |
| `cli/src/types.ts` | `REQUEST_STATUSES`/`COMPLETION_TRAVERSAL_STATUSES`/`SEMANTIC_SCOPES`/`TRAVERSAL_LIMITS`/`LIMITATION_SEVERITIES`/`LIMITATION_SCOPES` 어휘 배열, `Completion` 3-variant union, `IndexingCoverage`·`SettledIndexingCoverage` union, `IndexingReadinessEvidence`, `LimitationDetail`, `TraversalInterruption`, `AnalysisObservations` 추가. `Coverage['indexing']`를 union으로 교체 |
| `cli/src/coverage.ts` | `graphCompletion()`·`projectCompletion()` 도입. `coverageForTraversal()`을 대체. `V1_WITHHELD_REASON_CODES`, v1 projection 표 2개, reason 생성 함수 1개 |
| `cli/src/impact.ts` | 반환 리터럴의 5개 상태 필드를 `projectCompletion()` 결과 하나로 교체. `analyzeImpact()`에 선택적 4번째 인자 `observations` 개설 |
| `cli/schemas/response.schema.json` | `completion`/`limitationDetail`/`indexingEvidence` `$defs`, `coverage.indexing.evidence`, analyze 분기의 `data` 필드 선언 8종 (전부 additive) |
| `cli/src/test/coverage.test.ts` | projection 단위 테스트로 재작성. S1~S13 + v1 무변경 + 규칙 5종 |
| `cli/src/test/completion.test.ts` | 신규. S1~S13을 `analyzeImpact()` 실제 호출로 재현 |
| `cli/src/test/schema.test.ts` | parity 표에 8행 추가 (새 enum 6종 + `data.traversalLimits`) |

**설계 결정과 이유**

1. `Completion`을 3-variant discriminated union으로 만들어 X5·X6·X8·X9를 컴파일 단계에서 막았다.
   `graphCompletion()`의 반환 타입에 `FailedCompletion`이 없으므로 성공 envelope에 실패 상태를 실을 수 없다.
2. `projectCompletion()`이 `complete`/`truncated`/`traversalLimits`/`coverage`/`limitations`/
   `limitationDetails`를 **한 번에** 만든다. `impact.ts`에는 이 값들을 개별로 계산하는 코드가 남지 않았다.
3. **X9를 코드 경로 제거로 해결했다.** 초안은 "indexing이 `working`인데 `exhausted`"를 런타임 예외로 막으려
   했다. 그러면 도달 불가능한 dead branch가 생긴다. 대신 "index를 만드는 중이면 더 확장할 것이 없다는 사실
   자체를 알 수 없다"는 관찰을 그대로 코드로 옮겨, `working`이면 `unknown`을 반환하고 함수를 빠져나가게 했다.
   `succeeded`를 만드는 유일한 지점보다 앞에서 반환되므로 모순이 표현 불가능해진다. 부수 효과로 S7·S8이
   별도 interruption 값 없이 indexing 관측만으로 도달 가능해졌고, `TraversalInterruption`에서
   `provider-not-ready`를 뺄 수 있었다(한 사실을 한 곳에서만 표현).
4. v1 배열 순서를 `limitationDetails` 생성 순서로 재현했다. 조건부 code 5종의 순서가 바이트 비교 대상이다.
5. `limitations`와 `coverage.reasons`는 **같은 배열 객체**로 유지했다. 기존 코드도 그랬고, 두 벌을 만들면
   서로 다를 수 있는 필드가 하나 더 생긴다. 테스트가 참조 동일성을 검사한다.
6. `completion` `$def`에 `additionalProperties: false`를 넣었다. D2 결론(`stage`를 넣지 않는다)이 문서
   문장이 아니라 schema 규칙이 된다.

**검증**

| 검사 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | 통과 (96 tests, 이전 81) |
| `npm test` (Extension) | 통과 (35 tests) |
| 고정 workspace 캡처 29 시나리오, **strip 후 baseline 바이트 비교** | **완전 동일** |
| 같은 캡처, strip 없이 | 성공·부분 응답 9종만 차이. 차이는 `data.completion`과 `data.limitationDetails` 두 필드뿐 |
| `npm run test:plugin-artifact` | 통과 (`selectedBy === 'bundled'`, `complete === true` assert 유지) |

**캡처 함정 2건 (둘 다 기존 결함이며 이 lane의 변경과 무관하다)**

1. handover 8절의 `mkdtemp` 경고는 알고 있었으나, **`os.tmpdir()` 자체가 이 환경에서 프로세스 간에 안정적이지
   않다.** 같은 이름의 고정 디렉터리를 써도 `TMPDIR`이 호출마다 달라져 `symbolId`(파일 URI 해시)와 note
   conflict token이 바뀐다. 캡처 workspace 경로를 환경 변수 `IL_CAPTURE_WS`로 **명시**하도록 바꿨다.
2. scratchpad 디렉터리가 다른 에이전트와 공유된다. 처음 뜬 baseline이 병렬 lane의 캡처 산출물로 덮여
   비교가 거짓 실패했다. 캡처 출력을 전용 하위 디렉터리로 분리했다. 이 두 가지를 확인하지 않았다면
   "무변경 증명"이 그냥 통과했을 수도, 거짓 실패했을 수도 있다.

**baseline을 다시 뜬 방법**

코드 변경 후에 기준선이 필요했으므로 `git stash push -- cli/`로 되돌려 빌드·캡처하고 `git stash pop`했다.
`cli/dist/coverage.js`에 `projectCompletion`이 없고 `coverageForTraversal`이 있음을 확인해 기준선 빌드임을
검증한 뒤 3회 캡처해 결정성을 먼저 확인했다.

### 2026-08-27 — 3단계: 금지 조합과 금지 문구 강제

**변경한 파일**

| 파일 | 핵심 변경 |
| --- | --- |
| `cli/schemas/response.schema.json` | X1·X2·X3·X4·X5·X6·X7·X8·X9·X10·X11 규칙 추가. `$defs/coverage/properties/indexing`(X3), `$defs/provider`(X4), `data`의 `allOf` 9항목, 실패 envelope 분기(X2 후반) |
| `cli/src/test/jsonSchema.ts` | `contains`와 `$comment` 키워드 지원 추가 |
| `cli/src/test/forbidden.test.ts` | 신규. schema 거부 16 fixture, 도달 가능 상태 14종 통과 확인, 타입 거부 6 fixture, 금지 문구 스캔 |

**설계 결정과 이유**

1. **`contains` 키워드를 checker에 추가했다.** X11("두 reason code가 함께 있으면 안 된다")은 `contains` 없이는
   schema로 쓸 수 없다. 대안은 규칙을 주석으로 남기는 것인데, 그것이 이 계약이 벗어나려는 상태다.
   `assertSupportedKeywords`가 있어서 키워드 추가가 검사를 약화시키지 않는다.
2. **타입 거부는 `@ts-expect-error`가 아니라 실제 `tsc` 실행으로 증명했다.** `@ts-expect-error`는 "무언가
   거부됐다"만 남기고 어떤 조합이 왜 거부됐는지 테스트 이름에 남지 않는다. fixture마다 `tsconfig.json`을
   만들어 `types: []`로 컴파일한다. 이 설정이 없으면 ambient `@types/node`의 무관한 오류로 모든 fixture가
   "거부됨"이 되어 검사가 거짓 통과한다(실제로 처음에 그렇게 실패했고, 통과해야 할 control fixture가 함께
   실패한 덕에 발견했다). **control fixture가 없었으면 이 거짓 통과를 못 잡았다.**
3. **X1·X7·X10은 타입 fixture에 넣지 않았다.** 이 셋은 "값의 모양"이 아니라 "누가 그 필드를 쓸 수 있는가"에
   대한 규칙이고, projection 함수가 유일한 writer라는 구조로 이미 보장된다. 타입 fixture로 흉내 내면
   실제로는 막지 않는 것을 막는 것처럼 보이게 된다. X2·X4도 뺐다 — 전자는 분석 결과가 아직
   `Record<string, unknown>`이고, 후자의 선택 함수 타입은 W1-B 소유다. 각각 schema로만 막고 이유를
   테스트 주석에 남겼다.
4. **금지 문구 검사는 직렬화된 envelope 전체를 훑는다.** code 목록만 검사하면 `message`나 `action`에 들어간
   표현을 놓친다. 검사기가 실제로 위반을 볼 수 있는지도 함께 테스트한다(심어둔 문장을 잡는지).
5. `completion`에 `stage`를 넣은 envelope가 schema에서 거부되는 것을 fixture로 넣었다. D2 결론이 문서 문장이
   아니라 검사 가능한 규칙이 됐다.

**검증**

| 검사 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | 통과 (101 tests, 이전 96) |
| `npm test` | 통과 (35 tests) |
| 캡처 strip 비교 | **완전 동일** (3단계는 schema와 테스트만 바꾸므로 응답 무변경) |

## 부록 A — 캡처 스크립트 변경점

W0-4 부록 A의 스크립트를 그대로 쓰되 두 곳만 바꿨다. 전문은 그 문서에 있으므로 여기서는 delta만 남긴다.

1. 고정 workspace 이름을 `il-completeness-capture-fixed`로 바꿨다(두 lane의 캡처가 서로를 덮지 않게).
2. `provider.observed.diagnostics`를 `timings`와 같은 이유로 정규화했다. 근거는 조사 결과 절에 있다.
3. 4번째 인자 `strip`을 추가했다. 응답 트리에서 `completion`, `limitationDetails`, `evidence` 키를 제거한 뒤
   렌더링한다. 이 lane이 추가한 필드가 정확히 그 셋이므로, strip 캡처가 baseline과 바이트 동일하면
   "추가한 것 말고는 아무것도 안 바뀌었다"가 증명된다.

```sh
node il-capture.mjs . /tmp/base            # 변경 전
node il-capture.mjs . /tmp/after-strip strip   # 변경 후, 추가 필드 제거
diff -r /tmp/base /tmp/after-strip             # 비어야 한다
```

## 부록 B — `cli-contract.md`에서 낡아진 예시·문장 (후속 lane 입력)

`plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`는 이 lane에서 **의도적으로 수정하지
않았다**(같은 wave에서 W1-B도 다른 절을 고친다). 아래가 이 lane의 변경으로 낡아진 지점이다. W2-C
(`docs/m1-plugin-auto-contract`)의 입력으로 넘긴다.

목록은 4단계 작업 로그에서 실제 파일을 대조해 채운다.
