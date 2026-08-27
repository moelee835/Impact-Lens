# Provider와 coverage 계약

이 문서는 Extension, Agent CLI와 Plugin이 분석 결과의 범위를 같은 의미로 해석하기 위한 schema v1
additive 계약이다. 기존 `complete`, `truncated`, `traversalLimits`, `limitations`는 v1에서 유지한다.

상태 조합의 전수 표(성공 13행, 실패 22행), 금지 조합 11건과 각 조합을 타입·schema로 표현 불가능하게 만드는
방법은 [`docs/work/task-m1-state-truth-table.md`](../work/task-m1-state-truth-table.md)에 있다. 이 문서에는
요약 표만 둔다. 두 문서가 어긋나면 truth table을 기준으로 하고 이 문서를 고친다.

## Provider metadata

| 필드 | 의미 |
| --- | --- |
| `host` | provider를 직접 구동하는 `lsp` 또는 VS Code가 중개하는 `vscode` |
| `name`, `version` | initialize에서 확인한 identity. VS Code 공개 API로 알 수 없으면 `unknown` |
| `requestedLanguageId` | provider에 전달한 document languageId |
| `detectedLanguageId` | 대상 파일 확장자 또는 VS Code document에서 감지한 languageId |
| `selectedBy` | `bundled`, `custom`, `vscode`; 향후 `auto`, `preset`, `project` 추가 가능 |
| `languageMatch` | 확인 가능한 일치 여부. VS Code 중개처럼 증명할 수 없으면 `unknown` |
| `advertised` | initialize capability로 선언된 기능. VS Code 중개에서는 `unknown` |
| `observed` | 현재 session에서 성공한 prepare/incoming/diagnostics 동작 |
| `lifecycle` | 마지막 `discovery/launch/initialize/indexing/capability/query` 단계와 상태 |

기존 `callHierarchy`, `diagnostics` boolean은 v1 소비자 호환을 위해 유지한다. 새 소비자는 선언과 실제 성공을
구분하기 위해 `advertised`와 `observed`를 우선 사용한다.

## Runtime metadata와 bundled doctor

Agent CLI와 Plugin envelope의 top-level `runtime`은 실행된 CLI package name/version, Node version/major와
runner source를 기록한다. source는 `direct`, `explicit`, `checkout`, `global`, `release-fallback`만 허용한다.
절대 executable/provider 경로, release URL, registry credential과 전체 argv는 포함하지 않는다. Plugin
manifest version은 host inventory가 소유하며 CLI runtime이 추측하지 않는다.

`doctor bundled-typescript`는 Node engine, CLI package, `typescript-language-server`/TypeScript version과
논리적 entry/read access를 확인한다. `--smoke`에서만 실제 initialize와 advertised Call Hierarchy를 검사해
일반 analyze latency에 추가 provider process를 만들지 않는다.

| code | 계층 | 의미와 조치 |
| --- | --- | --- |
| `node_runtime_unavailable` / `node_version_unreadable` / `node_version_unsupported` | runner/startup | Node 22+ 설치 또는 active version 확인 |
| `cli_artifact_missing` / `cli_artifact_not_executable` | runner resolution | 선택된 explicit/global/cache artifact 재설치·경로·permission 확인 |
| `npm_runtime_unavailable` | runner resolution | release fallback에 필요한 npm 설치 또는 CLI 직접 설치 |
| `bundled_provider_artifact_missing` / `unreadable` / `corrupt` | provider discovery | CLI/Plugin 재설치 또는 package permission 확인 |

선택된 explicit/global artifact가 손상돼도 다음 후보로 조용히 넘어가지 않는다. 오류의
`runtime.runner.source`와 `error.details.recovery`로 해당 설치를 수정한다.

이 표는 Impact Lens 자신의 runner와 packaging을 다룬다. 사용자 환경에 설치된 **외부** Language Server의
탐색·version·capability 진단은 아래 [Provider 실패 코드](#provider-실패-코드)의 `provider_*` 계열이 담당한다.
`node_version_unsupported`는 Node engine, `provider_version_unsupported`는 외부 Language Server를 가리킨다.

## Coverage metadata

- `data.completion`: 상태의 단일 출처다. `requestStatus`(`succeeded | partial | failed`),
  `traversalStatus`(`exhausted | depth-limited | node-limited | timeout | cancelled | unknown | failed | not-started`),
  `semanticScope`(`provider-static | static-plus-inference | static-plus-observation | none`),
  `indexingStatus`(`ready | working | unknown`)와 마지막 `stage`를 담는다.
- `coverage.traversal.status`, `coverage.semantic.status`, `complete`, `truncated`, `traversalLimits`는
  `completion`에서 파생되는 v1 projection이며 직접 계산하지 않는다. projection 표는
  `docs/work/task-m1-state-truth-table.md` 4.1절과 4.2절에 있다.
- `coverage.traversal.status`는 `complete`, `depth-limited`, `node-limited`, `timeout`, `failed` 5값을 모두
  생산한다. `cancelled`와 `unknown`은 v1에서 `failed`로 내려 표현한다. 이는 의도적인 안전한 방향의 정보
  손실이며, 세부 구분은 `completion.traversalStatus`에서만 제공한다.
- `coverage.semantic.status`는 `completion.semanticScope`의 v1 projection이다. `provider-static`은
  `static-only`로, `static-plus-inference`와 `static-plus-observation`은 `augmented`로 내려 표현한다.
- `coverage.semantic.evidenceSources`: 현재 CLI는 `lsp-call-hierarchy`, Extension은
  `vscode-call-hierarchy`를 기록한다. `semanticScope`가 `static-plus-inference`이면 `inferred-*` 항목이,
  `static-plus-observation`이면 `observed-*` 항목이 최소 1개 있어야 한다.
- `coverage.indexing.status`: 명시적 provider 신호가 없으므로 기본값은 `unknown`이다. 단순 query 성공을
  전체 workspace indexing 완료로 승격하지 않는다. `ready`는 근거 필드를 동반할 때만 만들 수 있다.
- `coverage.reasons`: machine-readable limitation code이다. top-level `limitations`는 v1에서 이 배열과 같은
  projection을 유지한다.

`complete: true`는 `completion.traversalStatus === "exhausted"`의 v1 호환 표현일 뿐이다. 이는 요청한 정적
Call Hierarchy 탐색이 limit 없이 끝났다는 의미이며, runtime caller가 없거나 workspace index가 완전하다는
의미가 아니다. 새 문서와 새 소비자는 `complete` 대신 `exhausted`를 쓴다.

### schema version 정책

M1은 `schemaVersion: 1`을 유지한다. `completion`과 향후 `limitationDetails`는 optional additive 필드이며,
값 추가와 optional 필드 추가는 v1에서 계속 허용한다. v2 승격은 **필드 제거 또는 기존 필드 의미 변경**이
필요할 때만 한다. 승격 조건과 후보 변경 목록은 `docs/work/task-m1-state-truth-table.md` 4.3절에 있다.

## 허용 상태와 금지 상태

성공 envelope(`ok: true`)의 요약이다. 전수 표는 truth table 문서 2.1절 S1~S13에 있다.

| 상황 | `requestStatus` | `traversalStatus` | `complete` | v1 traversal | 필수 reason |
| --- | --- | --- | ---: | --- | --- |
| 자연 종료 | `succeeded` | `exhausted` | `true` | `complete` | `dynamic_calls_not_inferred` |
| 자연 종료, caller 0건 | `succeeded` | `exhausted` | `true` | `complete` | 위 + `no_incoming_callers`, indexing 근거가 없으면 `index_state_unknown` |
| depth 제한 | `partial` | `depth-limited` | `false` | `depth-limited` | `depth_limit_reached` |
| node 제한 | `partial` | `node-limited` | `false` | `node-limited` | `node_limit_reached` |
| depth·node 동시 도달 | `partial` | `node-limited` | `false` | `node-limited` | `depth_limit_reached` + `node_limit_reached` |
| provider 준비 중 | `partial` | `unknown` | `false` | `failed` | `provider_not_ready` |
| 요청 timeout, 부분 결과 | `partial` | `timeout` | `false` | `timeout` | `traversal_timeout` |
| 취소, 부분 결과 | `partial` | `cancelled` | `false` | `failed` | `traversal_cancelled` |
| 탐색 중 실패, 부분 결과 | `partial` | `failed` | `false` | `failed` | `provider_query_failed` |
| provider 확보·질의 실패 | `failed` | `not-started` 또는 `failed` | 성공 data 없음 | 해당 없음 | error code와 `details.stage` 사용 |

실패 envelope(`ok: false`)에서는 `requestStatus`가 항상 `failed`, `semanticScope`가 항상 `none`이다.
전수 표는 truth table 문서 2.2절 F1~F22에 있다.

다음 조합은 만들지 않는다.

- `complete: true`이면서 traversal이 limited인 결과
- provider 실패를 성공한 empty graph로 반환하는 결과
- 명시적 근거 없이 indexing을 `ready`로 표시하는 결과
- 감지 언어와 다른 bundled provider를 자동 실행하는 결과
- `requestStatus: succeeded`이면서 traversal이 `exhausted`가 아닌 결과
- `requestStatus: failed`이면서 `ok: true`인 결과
- `semanticScope: none`이면서 `data`가 있는 결과
- `indexingStatus: working`이면서 `requestStatus: succeeded`인 결과
- `provider_not_ready`와 `no_incoming_callers`를 함께 담은 결과

금지 조합은 문서 규칙이 아니라 타입 union과 schema `allOf`로 표현 불가능하게 만든다. 성공 응답의
`data.nodes`는 root를 항상 포함하므로 `minItems: 1`이며, 빈 그래프는 표현할 수 없다. 실제 caller 0건은
`nodes.length === 1`과 `edges.length === 0`으로 나타난다. 각 금지 조합의 타입·schema 표현은 truth table
문서 3절 X1~X11에 있다.

사용자 노출 문구는 결과 수를 먼저 말하고 판정을 나중에 한다. `no impact`, `safe to change`, `unused`,
`fully analyzed`, `complete analysis`, `all callers`는 어떤 상태에서도 생성하지 않는다.

## Provider 실패 코드

| code | stage | 의미와 조치 |
| --- | --- | --- |
| `provider_required_for_language` | discovery | bundled 지원 언어가 아니므로 해당 언어 provider를 설정해야 함 |
| `provider_language_mismatch` | discovery | 명시한 `languageId`와 대상 언어가 다름 |
| `provider_executable_not_found` | discovery | preset이 요구하는 실행 파일을 PATH·명시 경로에서 찾지 못함. 공식 설치 안내와 custom provider 경로를 제시 |
| `provider_version_unsupported` | discovery | version은 읽었으나 preset의 지원 범위 밖. 업그레이드 또는 명시적 override |
| `provider_version_unreadable` | discovery | version command는 실행됐으나 출력에서 version을 해석하지 못함. 실행 파일 확인 |
| `provider_selection_ambiguous` | discovery | 검증된 후보가 둘 이상이라 결정적으로 고를 수 없음. 명시 preset 선택 요구 |
| `provider_launch_failed` | launch | 실행 파일을 시작하지 못함 |
| `provider_ipc_unavailable` | launch | child process는 생성됐으나 환경이 stdio를 전달하지 않아 어떤 data도 주고받지 못함. sandbox 밖 실행, child process I/O 허용 또는 Extension 사용 |
| `provider_initialize_failed` | initialize | process가 시작됐지만 initialize를 완료하지 못함 |
| `provider_protocol_incompatible` | initialize | server가 요구하는 필수 request/notification을 지원할 수 없거나 표준 응답을 거부함. `details.method` 포함. silent ignore 금지 |
| `provider_capability_missing` | capability | server가 Call Hierarchy를 제공하지 않음 |
| `provider_capability_probe_failed` | capability | initialize는 성공했으나 capability probe가 timeout·오류로 결론을 내지 못함. 명확한 부재인 `provider_capability_missing`과 구분 |
| `provider_not_ready` | indexing | readiness budget 안에 provider가 준비되지 않음. 빈 결과를 caller 부재로 승격하지 않는다 |
| `provider_project_metadata_missing` | indexing | readiness profile이 요구하는 build metadata 부재. metadata 생성 안내만 제공하고 build·configure·sync를 실행하지 않는다 |
| `provider_query_failed` | query | prepare/incoming/open 요청 중 실패 |
| `provider_fixture_failed` | query | doctor 기준 fixture가 기대 caller를 반환하지 않음. preset을 `verified-external`로 승격하지 않는다 |

provider lifecycle 밖에서 발생하는 실패도 같은 envelope로 보고한다. 이 code들은 `provider_` 접두사를 쓰지
않는다. 원인이 provider가 아니라 요청, 위치, host의 결정 또는 Impact Lens 자신이기 때문이다.

| code | stage | 의미와 조치 |
| --- | --- | --- |
| `timeout` | `details.stage` | 요청이 timeout budget을 초과함. retryable. timeout을 높이거나 depth를 줄여 재실행 |
| `request_cancelled` | `details.stage` | 사용자 또는 상위 host가 취소함. 실패가 아니라 중단으로 보고 |
| `target_not_found` / `target_ambiguous` | query | 요청 위치에서 callable symbol을 특정하지 못함. 선언 이름을 지정하거나 `expectedSymbol`로 구분 |
| `internal_error` | `details.stage` | adapter 또는 CLI 내부 실패. debug log와 함께 보고 |

`provider_not_ready`는 error code와 `coverage.reasons` 양쪽에 같은 이름으로 나타난다. 의미는 같고, `ok`
필드가 사용 가능한 `data` 유무를 결정한다.

process 실패의 `error.details`는 가능한 경우 executable basename, exit code/signal과 redacted stderr tail을
제공한다. command 전체와 source 내용은 기록하지 않는다.

## 기준 fixture

| fixture | 기대 provider | 기대 coverage/오류 |
| --- | --- | --- |
| bundled TypeScript cross-file caller | `lsp`, `selectedBy: bundled`, observed prepare/incoming | static-only, indexing unknown, traversal complete |
| fake provider depth/node graph | `lsp`, advertised/observed true | 각 limit와 reasons가 기존 필드와 일치 |
| VS Code broker metadata unit fixture | `vscode`, `name: unknown`, languageId 보존 | identity limitation, static-only, indexing unknown |
| provider 없는 Python | process 미실행 | `provider_required_for_language`, discovery |
| stderr 후 exit하는 mock server | custom provider | initialize failure, exit/stderr 보존 및 secret redaction |
| stderr 없이 exit 1인 mock server | custom provider | initialize stage/exit와 runner provenance 보존 |
| didOpen 후 exit하는 mock server | custom provider | query failure로 분리되고 stderr 보존 |
| indexing 지연 mock server | custom provider | `provider_not_ready`, indexing working, 빈 결과를 caller 부재로 승격하지 않음 |
| 미지원 server request를 보내는 mock server | custom provider | `provider_protocol_incompatible`와 `details.method` |
| version 출력이 범위 밖·해석 불가인 mock executable | doctor | `provider_version_unsupported` / `provider_version_unreadable` 구분 |
| 실행 파일 부재 preset | doctor | `provider_executable_not_found`와 설치 안내 |
| capability는 있으나 fixture가 빈 결과 | doctor | `provider_fixture_failed`, preset 미승격 |
| depth·node 동시 도달 그래프 | fake provider | `node-limited` 우선, reason 2종 동시 포함 |
| 취소된 분석 | fake provider | `traversalStatus: cancelled`, 부분 결과 유지, `complete: false` |

Python/C/C++/Swift/Kotlin의 정상 provider E2E fixture와 indexing adapter는 해당 언어별 스토리에서 추가한다.
