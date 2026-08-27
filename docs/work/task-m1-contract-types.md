# M1 타입·스키마 계약 정리 (Wave 0-3)

- 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 선행 문서: [M1 상태 truth table과 completeness 어휘 결정](task-m1-state-truth-table.md) (4절 승인됨)
- 선행 계약: [`provider-coverage-contract.md`](../development-management/provider-coverage-contract.md)
  (W0-1이 승인된 어휘를 이미 반영, `128fe1b`)
- 성격: 리팩터링. **CLI가 생산하는 JSON 응답의 내용을 한 글자도 바꾸지 않는다.**

## 배경과 해결할 문제

승인된 결정은 `schemaVersion: 1`을 유지한 채 새 `data.completion`을 진실의 원천으로 두고
`complete`/`truncated`/`traversalLimits`/`coverage.*`를 projection으로 만드는 것이다. 그 구현(W1-C)에
들어가기 전에, **선언(schema)과 구현(TypeScript type)이 이미 갈라져 있는 상태**를 먼저 정리해야 한다.
갈라진 채로 새 필드를 얹으면 "어느 쪽이 계약인가"를 판단할 근거가 사라진다.

현재 확인된 문제는 네 가지다.

1. **드리프트 3건.** `cli/schemas/response.schema.json`이 선언한 enum이 `cli/src/types.ts`의 union보다
   넓다. `selectedBy`(6 vs 2), `coverage.traversal.status`(5 vs 3), `provider.host`(2 vs 1).
2. **`CliError.code`가 자유 문자열이다.** `cli/src/types.ts:201-211`. 오타가 컴파일에 잡히지 않고,
   실제로 존재하는 code 집합을 코드에서 읽을 방법이 없다.
3. **`schemaVersion: 1`이 리터럴 2개다.** `cli/src/index.ts:103`, `:122`. truth table 4.3절이 v2 승격
   조건 5번으로 "단일 상수 추출"을 명시했다.
4. **계약 테스트가 드리프트를 못 잡는다.** `cli/src/test/schema.test.ts`는 schema JSON 문자열에
   정규식을 걸 뿐이라 위 3건을 한 번도 잡지 못했다.

추가로 Extension 쪽 `src/types.ts:9-46`은 provider/coverage 타입을 **리터럴 하나**로 좁혀 놨다
(`name: 'unknown'`, `selectedBy: 'vscode'`, `evidenceSources: readonly ['vscode-call-hierarchy']` 등).
새 상태값을 도입하면 UI를 고치기 전에 타입 에러부터 나므로, 계약 어휘를 넓히는 이번 단계에서 함께 푼다.

## 범위

- `cli/schemas/response.schema.json`이 선언한 어휘와 `cli/src/types.ts`의 union을 일치시킨다.
- schema가 선언한 어휘를 **런타임에서 읽을 수 있는 상수**로 만들어 타입과 schema를 테스트로 묶는다.
- `cli/src/errors.ts`를 신설해 실제로 던져지는 `CliError.code`를 union 타입과 상수로 중앙화한다.
- `schemaVersion` 리터럴 2개를 단일 상수로 추출한다.
- 실제 CLI 응답을 schema로 검증하는 계약 테스트와, 타입·schema 어휘 parity 테스트를 추가한다.
- `src/types.ts`의 리터럴 타입을 CLI와 같은 union으로 넓힌다. **값은 바꾸지 않는다.**

## 제외 범위

- **`data.completion`과 `limitationDetails`의 타입·schema·생산.** 이유는 아래 "결정 1"에 적었다.
  W1-C가 타입·schema·생산을 한 번에 한다.
- reason code(`no_incoming_callers`, `traversal_timeout` 등)의 신설·개명·중앙화. reason은 성공 응답의
  limitation이고 error code는 실패 envelope의 식별자다. 서로 다른 개념이므로 같은 union에 섞지 않는다.
  이름 통일 여부는 W1-C가 결정한다.
- 새 error code(`provider_not_ready`, `provider_executable_not_found` 등 10종)의 구현. 계약 문서에는
  선언돼 있지만 아직 아무도 던지지 않는다. Wave 1/2의 해당 lane이 구현과 함께 union에 추가한다.
- `cli/src/lspProvider.ts`, `cli/src/jsonRpc.ts`, `cli/src/providers/**`, `cli/src/doctor*` 수정.
- `.github/**`, `scripts/**`, `cli/src/test/fixtures/**` 수정.
- `src/**`의 UI 파일 수정(`src/types.ts`, `src/coverage.ts`만 허용).
- `docs/development-management/provider-coverage-contract.md` 수정.
- exit code / retryable 불일치의 **수정**. 발견하면 이 문서에 보고만 한다.

## 결정과 근거

### 결정 1 — `data.completion`의 타입·스키마를 지금 추가하지 않는다

계약 문서는 이미 `data.completion`을 "상태의 단일 출처"로 선언했지만 어떤 코드도 생산하지 않는다.
여기에 타입이나 schema만 먼저 추가하면, 지금 없애려는 드리프트와 **정확히 같은 종류의 드리프트를 새로
만드는 것**이다. 선언과 구현의 간격은 지금 3건인데 4건이 된다.

`completion`은 세 곳(타입, schema, 생산 코드)이 동시에 바뀌어야 의미가 생긴다. 부분 선언은 소비자에게
"이 필드는 언젠가 온다"는 잘못된 신호를 주고, optional이므로 schema validation도 그 부재를 잡지 못한다.
따라서 W1-C가 세 곳을 한 번에 처리한다. 계약 문서와 코드 사이의 이 간격은 **알려진 이월 항목**이며
이 lane이 메우지 않는다.

### 결정 2 — 드리프트 3건은 모두 "타입을 schema에 맞추는" 방향으로 해소한다

세 건 모두 schema가 넓고 타입이 좁다. 방향은 두 가지뿐이다. schema를 좁히거나 타입을 넓히거나.

**schema를 좁히는 것은 v1에서 불가능하다.** `cli/schemas/response.schema.json`은 `cli/package.json`의
`files`에 `schemas/**`로 포함돼 npm tarball과 함께 배포된다. 즉 이미 공개된 producer 계약이다. enum
축소는 producer 계약을 좁히는 변경이고, truth table 4.3절이 승인한 정책은 그것을 **v2 승격 사유**로
분류한다. M1은 v1을 유지하므로 schema 축소는 선택지가 아니다.

건별 근거는 다음과 같다.

| 건 | 방향 | 근거 |
| --- | --- | --- |
| `coverage.traversal.status` (5 vs 3) | 타입을 5값으로 넓힌다 | 승인된 결정이 명시했다. `timeout`/`failed`는 삭제가 아니라 v1 projection 대상으로 채택한다(truth table 4.1절 projection 표). W1-C가 `completion.traversalStatus`의 `timeout`/`cancelled`/`unknown`/`failed`를 이 두 값으로 내려 표현한다 |
| `provider.selectedBy` (6 vs 2) | 타입을 6값으로 넓힌다 | 아래 별도 검토 |
| `provider.host` (2 vs 1) | 타입을 2값으로 넓힌다 | schema `#/$defs/provider`는 CLI 전용 shape이 아니라 **Extension과 CLI가 공유하는 provider metadata 계약**이다. 계약 문서 "Provider metadata" 표가 `host`를 "`lsp` 또는 VS Code가 중개하는 `vscode`"로 정의하고, `src/coverage.ts`가 실제로 `vscode`를 생산한다. 두 표면이 같은 어휘를 써야 한다는 것이 이번 lane 5번 항목(`src/types.ts`를 "CLI 쪽과 같은 union으로")의 전제이기도 하다 |

**`selectedBy`에 대한 별도 검토 — 아직 생산되지 않는 값을 타입에 넣는 것이 결정 1과 충돌하는가.**

충돌하지 않는다. 두 상황은 선언의 유무에서 갈린다.

- `completion`은 **아직 어디에도 선언이 없다.** 타입을 추가하면 새 선언이 하나 생기고, 그 선언을
  뒷받침하는 구현은 없다. 드리프트가 늘어난다.
- `selectedBy`의 6값은 **이미 배포된 schema에 선언돼 있다.** 타입을 넓혀도 새 선언은 생기지 않는다.
  이미 있는 선언에 타입을 맞출 뿐이므로 드리프트가 줄어든다.

방향의 정당성은 하나 더 있다. `ProviderCapabilities`는 CLI가 **쓰는** 타입인 동시에 소비자가 **읽는**
shape이다(`data.provider`, `capabilities`로 그대로 직렬화된다). 읽는 쪽에서 좁은 union은 거짓
exhaustiveness를 만든다. 계약이 6값을 허용하는데 코드가 2값만 상정하면, `auto`가 처음 등장하는 순간
`switch`가 조용히 빠뜨린다. 읽는 타입은 **계약이 허용하는 전부**여야 안전하다.

반대로 `completion`을 미리 선언하면 소비자에게 "이 필드가 생산된다"는 **거짓 생산 보장**을 준다. 넓히는
쪽의 위험(거짓 exhaustiveness)과 미리 선언하는 쪽의 위험(거짓 생산 보장)은 방향이 반대다. 전자는
넓혀야 사라지고 후자는 선언하지 않아야 사라진다.

생산 정밀도는 떨어지지 않는다. `cli/src/lspProvider.ts:63`은 여전히
`const selectedBy = command ? 'custom' : 'bundled'`로 리터럴 두 개만 만들고 TypeScript는 그 자리에서
좁은 리터럴 타입을 추론한다. 넓힌 union은 저장 필드의 타입일 뿐 생산 지점의 타입이 아니다.

### 결정 3 — 어휘를 런타임 상수로 만들고 schema와 테스트로 묶는다

드리프트를 "지금" 없애는 것과 "다시 생기지 않게" 하는 것은 다른 작업이다. TypeScript union은 컴파일
후 사라지므로, 타입만 고치면 다음 사람이 schema만 넓혔을 때 아무도 알아채지 못한다. 실제로 이번 3건이
그렇게 생겼다.

그래서 `cli/src/types.ts`에 `as const` 배열을 두고 타입을 `(typeof X)[number]`로 유도한다. 배열은
런타임 값이므로 테스트가 schema의 enum과 직접 비교할 수 있다. 이것이 드리프트 3건을 실제로 잡는
유일한 검사다(아래 결정 5 참조).

### 결정 4 — `errors.ts`는 error code만 담고, `CliError`는 `types.ts`에서 재수출한다

`CliError`를 `errors.ts`로 옮기면 이미 import하고 있는 `cli/src/lspProvider.ts`와 `cli/src/jsonRpc.ts`를
고쳐야 하는데 두 파일은 다른 lane 소유다. `types.ts`가 `errors.ts`를 재수출하면 기존 import 경로가 모두
그대로 동작하고, 새 코드는 `./errors`에서 직접 가져올 수 있다.

union에는 **현재 실제로 던져지는 code만** 넣는다. 계약 문서가 선언한 신규 10종
(`provider_not_ready`, `provider_executable_not_found`, `provider_version_unsupported`,
`provider_version_unreadable`, `provider_selection_ambiguous`, `provider_protocol_incompatible`,
`provider_capability_probe_failed`, `provider_project_metadata_missing`, `provider_fixture_failed`,
`request_cancelled`)은 넣지 않는다. 결정 1과 같은 이유다. 던지는 코드 없이 union에만 넣으면 그 순간
새 드리프트가 된다. 이 원칙을 테스트로 강제한다(결정 5).

reason code는 섞지 않는다. reason은 성공 응답의 `coverage.reasons`/`limitations` 항목이고 error code는
실패 envelope의 `error.code`다. `provider_not_ready`처럼 문자열이 같아질 수 있는 항목이 있지만 개념이
다르므로 같은 union에 넣으면 `error.code`에 reason을 넣는 실수가 컴파일을 통과하게 된다.

### 결정 5 — 계약 테스트는 자체 checker로 만든다 (ajv devDependency 대신)

두 방법을 비교했다.

| 기준 | (a) ajv를 devDependency로 추가 | (b) 자체 checker |
| --- | --- | --- |
| 정확성 | 높음. JSON Schema 2020-12 전체 | 이 schema가 쓰는 구문만. 미지원 구문을 만나면 조용히 통과할 위험 |
| 구현 비용 | 낮음 | 중간(~120줄) |
| 의존성 | 이 저장소 devDependency 2종 → 3종 + 전이 의존성 5종 이상 | 0 |
| lockfile | `pnpm-lock.yaml` 갱신 필요. CI가 `--frozen-lockfile`이므로 lockfile과 manifest가 어긋나면 3개 OS 전부 install 단계에서 실패 | 없음 |
| tarball | `files`가 `dist/*.js`, `README.md`, `schemas/**`뿐이라 devDependency는 배포물에 안 들어간다 | 동일 |
| 드리프트 3건 검출 | **못 잡는다** | **못 잡는다** |

마지막 행이 결정적이다. **응답을 schema로 검증하는 방식은 어느 구현이든 이번 드리프트 3건을 잡을 수
없다.** 드리프트는 "schema가 6값을 허용하는데 타입은 2값"인데, CLI가 실제로 생산하는 값
(`bundled`/`custom`, `complete`/`depth-limited`/`node-limited`, `lsp`)은 **전부 schema의 허용 집합
안에 있기 때문**이다. 어떤 실제 응답도 schema를 통과한다.

따라서 계약 테스트를 두 층으로 만든다.

1. **응답 ↔ schema 검증.** 실제 CLI 응답이 schema를 만족하는지 확인한다. 앞으로의 회귀(필드 누락,
   enum 밖 값 생산, `additionalProperties` 위반)를 잡는다. 지금 문제인 3건은 못 잡는다.
2. **타입 어휘 ↔ schema enum parity.** `types.ts`의 `as const` 배열과 schema의 `enum`이 정확히 같은
   집합인지 확인한다. **이것이 드리프트 3건을 잡는 검사다.**

1번을 ajv로 하든 자체 checker로 하든 드리프트 검출력은 같으므로, 남는 판단 기준은 의존성과 lockfile
위험이다. 이 저장소는 devDependency가 `@types/node`, `typescript`(+ 루트 `@types/vscode`, `@vscode/vsce`)
뿐이고 CI가 `--frozen-lockfile`로 3개 OS에서 install한다. 검출력을 늘리지 못하는 대가로 그 위험을 지는
것은 남는 장사가 아니다. **(b)를 택한다.**

(b)의 약점("미지원 구문을 조용히 통과")은 negative fixture로 막는다. schema가 금지하는 변형
(enum 밖 값, 필수 필드 제거, `additionalProperties` 위반, `ok:false`인데 `error` 없음 등)을 만들어
checker가 실제로 거부하는지 검사한다. checker가 무력화되면 이 검사들이 먼저 깨진다.

3번째 검사도 넣는다. **`CLI_ERROR_CODES`의 모든 항목이 `cli/src`의 어딘가에서 실제로 던져지는지**
소스 텍스트로 확인한다. 결정 4의 "생산하지 않는 code를 union에 넣지 않는다"를 테스트로 강제한다.

## 현재 구현 조사 결과

### 드리프트 3건 (조사 시점 `origin/main` = `84188ea`)

| 항목 | `cli/schemas/response.schema.json` | `cli/src/types.ts` | `src/types.ts` |
| --- | --- | --- | --- |
| `provider.host` | `lsp, vscode` | `lsp` (`:37`) | `vscode` (리터럴, `:10`) |
| `provider.selectedBy` | `bundled, auto, preset, project, custom, vscode` | `bundled, custom` (`:42`) | `vscode` (리터럴, `:14`) |
| `coverage.traversal.status` | `complete, depth-limited, node-limited, timeout, failed` | 앞 3종 (`:73`) | 앞 3종 (`:35`) |

schema에만 있고 타입에 없는 값은 5개다: `auto`, `preset`, `project`, `timeout`, `failed`.

### 실제로 던져지는 `CliError.code` 전수 (22종)

`grep -rn "new CliError(" cli/src`로 수집한 뒤 다중행 호출을 각각 확인했다. `cli/src/test/`는 제외했다.

| code | exit | retryable | 생산 위치 |
| --- | ---: | --- | --- |
| `invalid_command` | 2 | false | `index.ts:85` |
| `invalid_request` | 2 | false | `index.ts` 13곳, `impact.ts:348`, `notes.ts:99` |
| `workspace_escape` | 2 | false | `impact.ts:212`, `impact.ts:222`, `notes.ts:173` |
| `unsupported_uri` | 2 | false | `notes.ts:165`, `notes.ts:355` |
| `unsupported_note_language` | 2 | false | `notes.ts:456` |
| `target_not_found` | 3 | false | `impact.ts:175`, `impact.ts:229`, `notes.ts:179` |
| `target_ambiguous` | 3 | false | `impact.ts:177` |
| `workspace_not_found` | 3 | false | `impact.ts:241` |
| `conflict` | 4 | true | `notes.ts:316`, `notes.ts:403`, `notes.ts:530` |
| `invalid_note_document` | 4 | false | `notes.ts:304` |
| `expected_token_required` | 4 | true | `notes.ts:527` |
| `provider_required_for_language` | 5 | false | `lspProvider.ts:314` |
| `provider_language_mismatch` | 5 | false | `lspProvider.ts:70` |
| `provider_launch_failed` | 5 | true | `jsonRpc.ts:247`(→`:261`) |
| `provider_initialize_failed` | 5 | true | `lspProvider.ts:198`, `:238`, `jsonRpc.ts:249`(→`:261`) |
| `provider_capability_missing` | 5 | false | `lspProvider.ts:220` |
| `provider_query_failed` | 5 | true | `lspProvider.ts:267`, `:290`, `jsonRpc.ts:250`(→`:261`) |
| `provider_ipc_unavailable` | 5 | false | `childIpc.ts:70` |
| `bundled_provider_artifact_missing` | 5 | false | `runtime.ts:82` |
| `bundled_provider_artifact_unreadable` | 5 | false | `runtime.ts:98` |
| `bundled_provider_artifact_corrupt` | 5 | false | `runtime.ts:150` |
| `timeout` | 6 | true | `jsonRpc.ts:94` |
| `node_version_unsupported` | 7 | false | `runtime.ts:41` |
| `internal_error` | 10 | false | `index.ts:97` |

exit code는 Plugin skill reference의 exit status 표(`cli-contract.md:209-219`)와 일치한다.

### 배포된 소비자 제약

- `scripts/test-plugin-artifact-e2e.mjs:125-126`이 `selectedBy === 'bundled'`와 `complete === true`를
  하드 assert한다. 응답이 바뀌지 않아야 하는 가장 강한 이유다.
- `cli/package.json`의 `files`는 `dist/*.js`, `README.md`, `schemas/**`다. `dist/test/**`와 `src/**`는
  배포되지 않으므로 테스트 헬퍼가 tarball을 키우지 않는다.

## 단계별 구현 계획

각 단계는 독립적으로 검증·commit·push 가능하다.

### 1단계 — 작업 문서와 계획 (이 문서)

결정 1~5의 근거를 확정한다. 코드는 변경하지 않는다.

### 2단계 — 드리프트 3건 해소

`cli/src/types.ts`에 schema 어휘를 `as const` 배열로 두고 union을 유도한다. `ProviderCapabilities.host`,
`.selectedBy`, `Coverage.traversal.status`를 schema와 같은 집합으로 넓힌다.

### 3단계 — `cli/src/errors.ts` 신설

`CLI_ERROR_CODES`, `CliErrorCode`, `isCliErrorCode`, `CliError`, `CliErrorShape`를 옮기고
`CliError.code`를 union으로 좁힌다. `types.ts`는 재수출만 한다.

### 4단계 — `schemaVersion` 상수화

`SCHEMA_VERSION`을 `types.ts`에 두고 `index.ts`의 리터럴 2개를 대체한다.

### 5단계 — 계약 테스트

자체 JSON Schema checker와 negative fixture, 실제 CLI 응답 검증, 타입↔schema parity, error code 전수
검사를 `cli/src/test/`에 추가한다.

### 6단계 — Extension 타입 리터럴 해제

`src/types.ts:9-46`의 리터럴을 CLI와 같은 union으로 넓힌다. `src/coverage.ts`의 생산 값은 그대로 둔다.
Extension 어휘도 schema와 parity 검사한다.

## 테스트 및 완료 기준

- [ ] `npm run test:all` 통과
- [ ] `npm run test:plugin-artifact`가 변경 전후 동일
- [ ] CLI 응답 16종 캡처가 변경 전후 byte 단위로 동일(휘발성 필드만 정규화)
- [ ] parity 테스트가 드리프트 3건을 실제로 잡는지 확인(타입을 되돌려 실패를 관측)
- [ ] `data.completion`/`limitationDetails`를 추가하지 않았다
- [ ] 다른 lane 소유 파일을 변경하지 않았다

## 작업 로그

### 2026-08-27 — 1단계: 조사와 계획

**조사한 파일**

- `AGENTS.md`, `docs/work/task-m1-state-truth-table.md`(승인본), `provider-coverage-contract.md`(`128fe1b`).
- `cli/src/types.ts`, `cli/src/coverage.ts`, `cli/src/impact.ts`, `cli/src/index.ts`,
  `cli/schemas/response.schema.json`, `src/types.ts`, `src/coverage.ts`.
- 추가: `cli/src/lspProvider.ts`, `cli/src/jsonRpc.ts`, `cli/src/childIpc.ts`, `cli/src/notes.ts`,
  `cli/src/runtime.ts`, `cli/src/test/*.test.ts`, `src/graphPanel.ts`, `cli/package.json`,
  `.github/workflows/plugin-artifact-e2e.yml`,
  `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`.

**확인 사항**

- `selectedBy`/`host`/`traversal.status`를 exhaustive `switch`로 다루는 코드는 없다. union을 넓혀도
  기존 코드는 컴파일이 깨지지 않는다.
- `src/graphPanel.ts`의 `GraphPayload`는 coverage와 provider를 전부 `string`으로 받는다. Extension
  타입을 넓혀도 UI 파일을 고칠 필요가 없다.
- `cli/src/jsonRpc.ts:246-250`은 `code`를 변수로 만들어 `CliError`에 넘긴다. 추론되는 타입이
  세 리터럴의 union이라 `CliErrorCode`로 좁혀도 컴파일된다. 그래서 이 파일을 고치지 않아도 된다.

**기준선 기록 (변경 전)**

- `npm run test:all`: 51 pass / 0 fail.
- `npm run test:plugin-artifact`: exit 0,
  `Plugin artifact E2E passed: clean install and Codex/Claude TS/TSX/JS/JSX release fallback.`
- CLI 응답 16종(성공 6, 실패 10)을 임시 workspace에서 캡처해 저장했다. 휘발성 필드
  (`totalMs`, `msSinceSpawn`, `analyzedAt`, `updatedAt`, `token`, workspace 경로, node executable)만
  정규화하고 나머지는 원문 그대로다. 매 단계 후 같은 캡처를 다시 떠서 diff가 비었는지 확인한다.

**남은 작업**: 2~6단계.

### 2026-08-27 — 응답 무변경 증명 방법 확정

첫 캡처는 `mkdtemp`로 workspace를 매번 새로 만들었는데, `symbolId`가 파일 URI를 해싱하고 note conflict
token이 workspace 경로를 포함하기 때문에 **아무것도 바꾸지 않아도 diff가 났다**. workspace 경로를
고정(`$TMPDIR/il-contract-capture-fixed`)하고 매 실행 전에 삭제·재생성하도록 바꾼 뒤, 변경 없이 두 번
캡처해 diff가 비는 것을 먼저 확인했다. 이후 모든 단계의 무변경 증명은 이 고정 캡처를 기준으로 한다.

정규화하는 필드는 `timings.totalMs`, `details.msSinceSpawn`, `analyzedAt`, `updatedAt`, note
`conflictToken`/`token`, node executable 경로뿐이다. `rootId`, node id, `conflictTokens`, provider
metadata, coverage, limitations, error code/message/details는 전부 원문 그대로 비교한다.

### 2026-08-27 — 2단계: 드리프트 3건 해소

**변경한 파일**: `cli/src/types.ts`

- schema가 선언한 어휘 6종을 `as const` 배열로 추가했다. `PROVIDER_HOSTS`, `PROVIDER_SELECTED_BY`,
  `PROVIDER_LIFECYCLE_STAGES`, `PROVIDER_LIFECYCLE_STATUSES`, `TRAVERSAL_STATUSES`,
  `SEMANTIC_STATUSES`, `INDEXING_STATUSES`. 각 타입은 `(typeof X)[number]`로 유도한다.
- `ProviderCapabilities.host`를 `'lsp'`에서 `ProviderHost`(2값)로, `.selectedBy`를 2값에서
  `ProviderSelectedBy`(6값)로 넓혔다.
- `Coverage.traversal.status`를 3값에서 `TraversalStatus`(5값)로 넓혔다. `semantic.status`,
  `indexing.status`, `ProviderLifecycle.status`도 같은 방식으로 상수에서 유도하게 바꿨다.
- 기존 `ProviderLifecycleStage` union 리터럴 선언은 `PROVIDER_LIFECYCLE_STAGES`에서 유도하도록
  교체했다. 값 집합은 동일하므로 `cli/src/jsonRpc.ts`의 import는 그대로 동작한다.

**설계 결정**: 상수를 별도 `contract.ts`가 아니라 `types.ts`에 뒀다. 소비자가 이미 전부 `./types`를
보고 있고, 어휘와 그 어휘를 쓰는 interface가 한 파일에 있어야 한쪽만 고치는 실수가 눈에 띈다.

**검증**

- `npm --prefix cli run build`: 통과. 넓힌 union 때문에 깨지는 호출부는 없었다.
- `npm run test:all`: 51 pass / 0 fail (기준선과 동일).
- 고정 캡처 16종: 기준선과 `diff` 결과 **완전 동일**. 타입만 넓혔고 생산 값은 그대로다.

**확인한 사실**: 이 단계만으로는 드리프트가 다시 생기는 것을 막지 못한다. union은 컴파일 후 사라지므로
schema만 넓히는 변경을 아무도 못 잡는다. 5단계의 parity 테스트가 그 자물쇠다.

### 2026-08-27 — 3단계: `cli/src/errors.ts` 신설

**변경한 파일**: `cli/src/errors.ts`(신규), `cli/src/types.ts`, `cli/src/test/errors.test.ts`(신규),
`cli/src/test/childIpc.test.ts`

- `CLI_ERROR_CODES`(24종), `CliErrorCode`, `isCliErrorCode`, `CliErrorShape`, `CliError`를 `errors.ts`로
  모았다. `CliError.code`와 `CliErrorShape.code`가 `string`에서 `CliErrorCode`로 좁혀졌다.
- 배열은 exit status 순서로 정렬하고 구간마다 주석을 달았다. 정렬 기준을 알파벳이 아니라 exit status로
  잡은 이유는, code를 추가하는 사람이 "이 code의 exit status는 무엇인가"를 먼저 결정하게 만들기
  위해서다. 이 질문을 건너뛰면 `internal_error`(10)로 흘러간다.
- `types.ts`는 `errors.ts`를 재수출만 한다(결정 4). 덕분에 `lspProvider.ts`, `jsonRpc.ts`,
  `childIpc.ts`, `runtime.ts`, `notes.ts`, `impact.ts`, `index.ts`의 import를 한 줄도 고치지 않았다.
- 계획에는 error code 전수 검사를 5단계에 뒀지만 3단계로 당겼다. 이 검사는 schema가 아니라 `errors.ts`의
  불변식을 지키는 것이고, 모듈과 그 자물쇠는 같은 commit에 있어야 한다.

**union 좁히기가 실제로 잡아낸 것**: `cli/src/test/childIpc.test.ts:6`의 helper가 `code`를 추론된
`string`으로 받고 있어서 컴파일이 깨졌다. 좁히기 전에는 이 자리에 어떤 오타를 넣어도 통과했다.
`code: CliErrorCode`로 명시해 고쳤다. 이 한 건이 "오타가 컴파일에 잡히지 않는다"의 실제 사례다.

**검증**

- `npm run test:all`: 54 pass / 0 fail (신규 3건 포함).
- 전수 검사가 실제로 동작하는지 확인: `CLI_ERROR_CODES`에 아직 아무도 던지지 않는
  `provider_not_ready`를 임시로 넣고 실행했더니
  `declared but never produced: provider_not_ready`로 실패했다. 확인 후 되돌렸다.
- 고정 캡처 16종: 기준선과 완전 동일. 실패 envelope 10종의 `error.code`/`message`/`details`가 그대로다.

**exit code / retryable 일관성 점검 결과 (수정하지 않고 보고)**

같은 code가 서로 다른 exit status나 retryable로 던져지는 자리는 **없다**. 위 전수 표의 24종 모두
생산 지점이 여러 곳이어도 값이 일치한다. Plugin skill reference의 exit status 표
(`cli-contract.md:209-219`)와도 어긋나지 않는다. 다만 계약과 코드 사이에 아래 3건의 틈이 있다.
전부 동작 변경이 필요하므로 이 lane에서 고치지 않는다.

1. **`provider_ipc_unavailable`의 stage가 계약 표와 어긋날 수 있다.** 계약 문서는 이 code를 `launch`
   stage로 적었지만, `cli/src/childIpc.ts:68-80`은 원래 오류의 `details`를 그대로 펼쳐 담는다.
   `looksLikeSilentProviderFailure`가 `provider_initialize_failed`와 `provider_query_failed`도
   받아들이므로(`childIpc.ts:52-56`) `details.stage`가 `initialize`나 `query`로 나갈 수 있다.
   실제로 어느 쪽이 옳은지는 "IPC가 죽은 시점"이 아니라 "죽은 것을 알아챈 시점"을 무엇으로 볼지의
   문제다. 계약 표를 고칠지 code를 고칠지는 계약 문서 소유 lane과 IPC lane의 결정 사항이다.
2. **`timeout`과 `internal_error`의 `details.stage`가 계약대로 항상 있지는 않다.** 계약 표는 두 code의
   stage 열에 `details.stage`라고 적었는데, `internal_error`는 `cli/src/index.ts:97`에서 details 없이
   만들어진다. truth table 4단계가 "`request_cancelled`와 `timeout`의 `details.stage`를 계약대로
   정렬한다"로 이미 잡아 둔 과제다.
3. **runner 계열 code는 TypeScript에서 중앙화할 수 없다.** `node_runtime_unavailable`,
   `node_version_unreadable`, `cli_artifact_missing`, `cli_artifact_not_executable`,
   `npm_runtime_unavailable`과 release fallback code 5종은 Node가 뜨기 전에
   `plugins/impact-lens/scripts/run-impact-lens`(POSIX shell)가 직접 JSON을 쓴다. `errors.ts`에 넣으면
   "TypeScript가 던진다"는 거짓 신호가 되므로 제외하고 그 이유를 파일 주석에 남겼다. 이 계열의 계약
   준수는 `cli/src/test/runner.test.ts`가 실제 실행으로 검사한다.
