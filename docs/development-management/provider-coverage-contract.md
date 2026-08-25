# Provider와 coverage 계약

이 문서는 Extension, Agent CLI와 Plugin이 분석 결과의 범위를 같은 의미로 해석하기 위한 schema v1
additive 계약이다. 기존 `complete`, `truncated`, `traversalLimits`, `limitations`는 v1에서 유지한다.

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

## Coverage metadata

- `coverage.traversal.status`: 요청한 정적 그래프 탐색이 `complete`, `depth-limited`, `node-limited`인지 표시한다.
- `coverage.semantic.status`: 현재 `static-only`; 향후 출처가 표시된 보조 edge가 포함되면 `augmented`이다.
- `coverage.semantic.evidenceSources`: 현재 CLI는 `lsp-call-hierarchy`, Extension은
  `vscode-call-hierarchy`를 기록한다.
- `coverage.indexing.status`: 명시적 provider 신호가 없으므로 기본값은 `unknown`이다. 단순 query 성공을
  전체 workspace indexing 완료로 승격하지 않는다.
- `coverage.reasons`: machine-readable limitation code이다. top-level `limitations`는 v1에서 이 배열과 같은
  projection을 유지한다.

`complete: true`는 `coverage.traversal.status === "complete"`의 호환 표현일 뿐이다. 이는 요청한 정적
Call Hierarchy 탐색이 limit 없이 끝났다는 의미이며, runtime caller가 없거나 workspace index가 완전하다는
의미가 아니다.

## 허용 상태와 금지 상태

| 상황 | `complete` | traversal | 필수 reason |
| --- | ---: | --- | --- |
| 자연 종료 | `true` | `complete` | `dynamic_calls_not_inferred` |
| depth 제한 | `false` | `depth-limited` | `depth_limit_reached` |
| node 제한 | `false` | `node-limited` | `node_limit_reached` |
| provider discovery/launch/initialize 실패 | 성공 data 없음 | 해당 없음 | error code와 `details.stage` 사용 |

다음 조합은 만들지 않는다.

- `complete: true`이면서 traversal이 limited인 결과
- provider 실패를 성공한 empty graph로 반환하는 결과
- 명시적 근거 없이 indexing을 `ready`로 표시하는 결과
- 감지 언어와 다른 bundled provider를 자동 실행하는 결과

## Provider 실패 코드

| code | stage | 의미와 조치 |
| --- | --- | --- |
| `provider_required_for_language` | discovery | bundled 지원 언어가 아니므로 해당 언어 provider를 설정해야 함 |
| `provider_language_mismatch` | discovery | 명시한 `languageId`와 대상 언어가 다름 |
| `provider_launch_failed` | launch | 실행 파일을 시작하지 못함 |
| `provider_initialize_failed` | initialize | process가 시작됐지만 initialize를 완료하지 못함 |
| `provider_capability_missing` | capability | server가 Call Hierarchy를 제공하지 않음 |
| `provider_query_failed` | query | prepare/incoming/open 요청 중 실패 |

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
| didOpen 후 exit하는 mock server | custom provider | query failure로 분리되고 stderr 보존 |

Python/C/C++/Swift/Kotlin의 정상 provider E2E fixture와 indexing adapter는 해당 언어별 스토리에서 추가한다.
