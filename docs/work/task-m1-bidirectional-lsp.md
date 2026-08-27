# M1 W1-A — 양방향 LSP 세션 (server→client request 처리, cancellation, 설정 주입)

- 작성일: 2026-08-27
- lane: W1-A `il-lsp-protocol`
- branch: `feat/m1-bidirectional-lsp` (base `origin/main` = `dbc6c9b`)
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 관련 story: [`IL-LIM-005`](../development-management/stories/il-lim-005-custom-lsp-compatibility.md) 1·2단계
- 실행 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md) Wave 1 W1-A 행
- 필드 계약: [`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md)
  (`origin/docs/m1-preset-manifest-contract`, 같은 역할의 다른 세션이 작성, lead가 L2를 제외하고 확정)

## 배경과 해결할 문제

LSP는 양방향 프로토콜이다. 실제 Language Server는 client에게 `workspace/configuration`을 묻고
`client/registerCapability`로 기능을 등록하며 `window/workDoneProgress/create`로 progress token을 만든다.
지금 CLI의 `cli/src/jsonRpc.ts:JsonRpcClient.handle`은 `message.id !== undefined`를 **먼저** 검사하므로
`id`와 `method`가 함께 오는 server→client request가 pending 응답 테이블 조회로 빠지고, 그 표에 없으므로
조용히 폐기된다. 응답을 보내는 함수 자체가 존재하지 않는다.

결과의 정확한 모양은 W0-2가 재현해뒀다. 빌드한 CLI를
`cli/src/test/fixtures/configurationRequestServer.ts`에 물리면 이렇게 나온다.

```
provider_initialize_failed
details.bytesFromServer: 131      // server request는 client에 도달했다
details.stderr: "configuration-request-server: no client answer to workspace/configuration within 1500ms"
```

**원인은 타임아웃이 아니라 우리가 답을 안 한 것이다.** 프로토콜 위반이 타임아웃으로 위장돼 있다.
이 lane이 그 위장을 걷어낸다.

## 범위

1. server→client request 디스패치와 응답 전송. shape 기반 방향 판정, outbound/inbound 표 분리,
   D10 응답 표, 미지원 method의 MethodNotFound 응답과 기록.
2. `$/cancelRequest` 전송, `$/progress` 수신, 고정 100ms 진단 대기 대체.
3. `initializationOptions`/`settings` 주입 경로와 secret redaction.

## 범위에서 제외할 항목

- **provider 선택·preset catalog·PATH discovery·doctor** — W1-B 소유(`cli/src/providers/**`,
  `cli/src/doctor*`, `cli/src/runtime.ts`). 이 branch에서 수정하지 않는다.
- **`data.completion` 생산과 `coverage.*` projection** — W1-C 소유(`cli/src/coverage.ts`,
  `cli/src/impact.ts`, `cli/schemas/**`, `cli/src/types.ts`).
- **요청 스키마의 `providerPreset`/`initializationOptions`/`settings` 필드 추가** — lead가 이름을
  확정했으나 스키마 추가는 W1-C merge 직후 별도 lane이 한다. 이 lane은 **필드가 아직 없다는 전제로
  배관만** 만든다.
- **`$ref` 해석과 manifest 병합** — D2에 따라 `providers/`(W1-B)가 한다. 프로토콜 계층은 해석이 끝난
  평문 JSON만 받는다.
- **readiness 신호의 실제 관측과 `coverage.indexing.status` 실측화** — Wave 2 W2-A.
- **`textDocument.callHierarchy.dynamicRegistration: true`** — D11에 따라 Wave 1에서 켜지 않는다.
  지금 켜면 server가 정적 광고 대신 동적 등록을 택할 수 있고 `doInitialize`의 `callHierarchyProvider`
  검사가 `provider_capability_missing`으로 오탐한다.
- **`cli/src/childIpc.ts`** — 미결 4번이 "코드가 맞다"로 닫혔다. 건드리지 않는다.

## 현재 구현 조사 결과

라인 번호는 이동하므로 `파일:심볼`로 적는다. `main`(`dbc6c9b`) 기준이며
[`task-m1-wave0-handover.md`](task-m1-wave0-handover.md) 5절과
[`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md) "현재 구현 조사 결과"를
재조사하지 않고 전제한다.

이 lane이 **추가로** 확인한 것:

| # | 사실 | 근거 |
| --- | --- | --- |
| C1 | 성공 envelope의 `data.provider.observed.diagnostics`가 **코드 무변경에서도 실행마다 달라진다** | 아래 "기준선 자체가 비결정적이다" 절 |
| C2 | 진단은 응답 본문에 실린다 | `cli/src/impact.ts`의 `diagnosticsForItem`이 각 node의 `diagnostics` 배열을 만든다 |
| C3 | 실패 `details`에 키를 무조건 추가하면 기존 캡처가 깨진다 | `finalizeProcessFailure`가 `...(stderr ? { stderr } : {})` 형태로 조건부 확장을 이미 쓰고 있다 |
| C4 | `requestsSent`는 client가 발급한 id 수(`nextId - 1`)다 | `contract.test.ts`의 `requestsSent: 1` 단언이 이 값을 고정한다. outbound 카운터 의미를 바꾸면 안 된다 |
| C5 | 성공 경로의 stderr는 비어 있어야 한다 | `contract.test.ts`의 doctor preflight가 `result.stderr === ''`를 단언한다 |
| C6 | `provider_protocol_incompatible`은 계약에는 있으나 `cli/src/errors.ts` union에는 없다 | `errors.ts` 헤더 주석이 "구현하는 lane이 그 변경에서 함께 추가한다"고 규정하고 `errors.test.ts`가 강제한다 |

### 기준선 자체가 비결정적이다 (C1)

W0-4의 캡처 스크립트를 코드 변경 **없이** 5회 실행했다.

| 실행 | `ok-ts`의 `observed.diagnostics` |
| --- | --- |
| base1 | `true` |
| base2 · base3 · base4 · base5 | `false` (네 벌은 서로 바이트 동일) |

원인은 `cli/src/lspProvider.ts:collectDiagnostics`의 고정 100ms 대기다.
`textDocument/publishDiagnostics`가 100ms 안에 도착하면 `observe({ diagnostics: true })`가 실행되고,
늦으면 실행되지 않는다. 즉 **오늘의 응답은 경주(race)의 결과**이며 "baseline과 바이트 동일"이라는
완료 조건은 이 필드에 대해서는 애초에 성립하지 않는다.

이 사실은 2단계 설계에 직접 영향을 준다. 고정 대기를 신호 기반 대기로 바꾸면 이 필드가
**결정적으로** 되지만, 그 결정값이 base2~5의 `false`와 다를 수 있다. 그 차이는 임의로 갱신하지 않고
관측 결과를 이 문서와 최종 보고에 적어 lead 결정을 받는다.

## 단계별 구현 계획

각 단계는 독립적으로 검증·commit·push 가능하다.

### 1단계 — server→client request 디스패치와 응답 전송

- `cli/src/lsp/` 신설. 프로토콜 타입과 server request 라우터를 여기에 둔다
  (`cli/src/types.ts`는 W1-C가 잡고 있으므로 새 프로토콜 타입을 넣지 않는다).
- `jsonRpc.ts`의 판정 순서를 뒤집는다: **`method` 검사가 `id` 검사보다 먼저 온다.**

  | 수신 메시지 | 판정 | 처리 |
  | --- | --- | --- |
  | `method` 있음 + `id` 있음 | server → client request | 핸들러 실행 후 같은 id·같은 타입으로 응답 |
  | `method` 있음 + `id` 없음 | server notification | 기존 notification 핸들러 |
  | `method` 없음 + `id` 있음 | client request의 response | **client가 발급한 id 표에서만** 조회 |
  | 그 외 | 프로토콜 위반 | 카운트 |

- 표를 둘로 나눈다. `pendingOutbound`(우리가 발급)와 `inflightInbound`(server가 발급). 서로 조회하지 않는다.
- server의 id는 **타입까지 그대로** 되돌려준다(`number | string`).
- D10 응답 표를 구현한다. 표에 없는 method는 JSON-RPC `-32601` MethodNotFound로 답하고 기록한다.
  조용히 버리지 않는다.
- 미처리 method가 기록된 stage에서 실제로 실패하면 code를 `provider_protocol_incompatible`로 승격하고
  `details.method`에 첫 미처리 method를 싣는다(D10 (c)). 승격은 미처리 기록이 있을 때만 일어나므로
  기존 fixture의 캡처는 바뀌지 않는다.
- 새 `details` 키는 전부 조건부다(C3). 값이 없으면 키가 없다.
- fixture: `mockServer.ts`에 `IMPACT_LENS_MOCK_SERVER_ID_BASE`를 추가해 server request id를 1부터
  매길 수 있게 하고, 그 시나리오에서 client의 pending `initialize`가 오염되지 않음을 검증한다.

검증: `npm run cli:build`, `npm run cli:test`, `npm test`, 무변경 캡처 비교.

### 2단계 — cancellation과 progress, 진단 대기 대체

- timeout 시 `$/cancelRequest`를 먼저 보내고 pending을 즉시 지우지 않는다. 짧은 grace 후 정리해
  뒤늦은 응답이 "알 수 없는 id"로 잘못 집계되지 않게 한다(D13).
- `$/progress` 수신 처리. `window/workDoneProgress/create`가 만든 token의 begin/report/end를 기록한다.
  **완료 신호로 해석하지 않는다.** 값은 Wave 2가 쓴다.
- `collectDiagnostics`의 고정 100ms를 신호 기반 대기로 바꾼다. 열어둔 uri 전부가
  `publishDiagnostics`를 한 번씩 받으면 즉시 진행하고, budget을 상한으로만 쓴다.
- 분석 전체 예산: per-request 타임아웃만 있는 현재 상태를 유지할지, 세션 예산을 넣을지는
  구현 중 관측으로 결정하고 이 문서에 근거를 남긴다.

검증: 1단계와 동일 + `observed.diagnostics` 결정성 확인(같은 캡처 5회 반복이 서로 동일한가).

### 3단계 — 설정 주입 경로와 secret redaction

- D11: client capability에 `workspace.configuration: true`와 `window.workDoneProgress: true`를 추가한다.
  그 이상 넓히지 않는다.
- D3: `workspace/configuration` 응답 규칙 — items와 같은 길이·같은 순서, `scopeUri` 무시,
  section 없음이면 유효 settings 트리 root, section 있으면 점 표기 중첩 walk, 도달 못 하면 `null`.
- D4: `settings` push는 manifest가 명시할 때만. 유효 트리가 비면 어떤 push도 보내지 않는다.
  유효 트리는 `initialize` write 전에 이미 해석돼 있어야 한다.
- D2: 프로토콜 계층은 해석이 끝난 평문 JSON만 받는다. `$ref`도 `ProviderPreset`도 import 하지 않는다.
  세션 설정은 `LspCallHierarchyProvider` 생성자의 **선택적 인자**로 받는다. 기본값은 오늘과 동일한
  빈 트리이므로 `cli/src/index.ts`를 고치지 않아도 bundled 경로의 wire가 유지된다.
- D6: 세션 redaction 표. 선언 경로 + 키 이름 휴리스틱에 걸린 문자열 값을 모아
  `redactProviderText`가 리터럴로 치환한다. 오류 `details`에는 값이 아니라 키 경로만 넣는다.
- **L2 관측**: `workspace.configuration: true` 선언 전후로 bundled TypeScript 캡처를 비교한다.
  차이가 나오면 기대값을 임의로 갱신하지 않고 정확한 내용을 여기 적는다.

검증: 1·2단계와 동일 + sentinel 문자열 grep(stdout·stderr 0건).

## 테스트 및 완료 기준

- [ ] `npm run cli:build`, `npm run cli:test`, `npm test` 통과
- [ ] `configurationRequestServer`의 두 phase 모두에서 client가 응답하고 initialize가 완료된다
- [ ] `registerCapabilityServer`가 `REQUIRE_REGISTRATION=1`에서도 통과한다
- [ ] server request id가 1부터인 fixture에서 client의 pending `initialize`가 오염되지 않는다
- [ ] 모르는 server request에 MethodNotFound로 답한다 (침묵하지 않는다)
- [ ] 민감 값이 stdout·stderr 어디에도 없다 (sentinel grep)
- [ ] 정상 경로 응답의 무변경(또는 관측된 차이의 명시적 기록)
- [ ] `npm run test:plugin-artifact` 통과 또는 미실행 사유 기록
- [ ] stdout은 정확히 JSON 한 줄

## 작업 로그

### 2026-08-27 — 착수와 기준선

- branch `feat/m1-bidirectional-lsp`를 `origin/main`(`dbc6c9b`)에서 만들었다.
- `npm install`, `npm --prefix cli install`, `npm run cli:build` 성공.
- W0-4의 캡처 스크립트(29 시나리오)를 그대로 재사용해 기준선을 5벌 떴다.
  base2~5는 서로 바이트 동일했고 base1만 `ok-ts`의 `observed.diagnostics`가 달랐다.
  **코드를 하나도 바꾸지 않은 상태에서 난 차이다.** 위 C1 절에 기록했다.
  이후 비교의 기준선은 base2로 삼는다.

### 2026-08-27 — 1단계: server→client request 디스패치와 응답 전송

**변경한 파일**

| 파일 | 내용 |
| --- | --- |
| `cli/src/lsp/protocol.ts` (신규) | wire 어휘와 `classifyIncoming`. `id`가 아니라 **모양**으로 방향을 판정한다 |
| `cli/src/lsp/configuration.ts` (신규) | D3의 `workspace/configuration` 조회 규칙. 순수 함수 |
| `cli/src/lsp/serverRequests.ts` (신규) | D10 응답 표와 `methodNotFound` |
| `cli/src/jsonRpc.ts` | 표 2개 분리, 응답 전송, 미처리 request 기록, code 승격, 조건부 진단 필드 |
| `cli/src/lspProvider.ts` | 핸들러 설치(생성자, initialize write 이전), 등록·progress token 기록, 실패 시 승격 적용 |
| `cli/src/errors.ts` | `provider_protocol_incompatible` 추가 |
| `cli/package.json` | `files`에 `dist/lsp/*.js` 추가 |
| `cli/src/test/fixtures/mockServer.ts` | `IMPACT_LENS_MOCK_SERVER_ID_BASE` 추가 |
| `cli/src/test/fixtures/clientAnswerServer.ts` (신규) | D10 표 전체를 자기가 검증하는 oracle fixture |
| `cli/src/test/fixtures/unknownRequestServer.ts` (신규) | 미지원 request 없이는 진행하지 못하는 server |
| `cli/src/test/bidirectional.test.ts` (신규) | CLI end-to-end 6건 |
| `cli/src/test/lspProtocol.test.ts` (신규) | 순수 단위 12건 |

**설계 결정과 이유**

- **"네임스페이스 분리"를 client id를 큰 수로 올리는 방식으로 구현하지 않았다.** JSON-RPC에서 두 방향의
  id 공간은 원래 독립이고, 결함은 `handle()`이 `method`보다 `id`를 먼저 검사한 것이다. 번호를 피해 다니는
  방식은 증상만 가리며, server가 어떤 번호를 쓸지 우리가 통제할 수 없으므로 보장도 되지 않는다.
  결과적으로 표는 둘로 나뉘었지만(`pendingOutbound` / `inflightInbound`) 그것은 판정 수정의 **결과**다.
  이 진단은 lead가 D12로 확정한 것과 같다.
- **server의 id는 타입까지 그대로 되돌려준다.** `JsonRpcResponse.id`가 `number`로 선언돼 있었지만 spec은
  문자열을 허용한다. 숫자로 강제하면 문자열 id를 쓰는 server의 응답을 잃는다.
- **미지원 method는 침묵이 아니라 `-32601`로 답한다.** 침묵은 server를 영원히 매달고, 그 정지는 provider
  타임아웃으로 보고돼 우리가 깬 규칙을 server 탓으로 돌린다.
- **미처리 request를 즉시 실패로 만들지 않았다.** 선택적 server request는 무시해도 분석이 정상 완료되므로
  즉시 실패는 지금보다 견고성을 낮춘다. 대신 **같은 stage가 실제로 실패했을 때만**
  `provider_protocol_incompatible`로 승격한다(`JsonRpcClient.stageFailure`).
- **`details.method`는 미처리 method를 담고, 원래 실패한 요청 이름은 `duringRequest`로 옮겼다.**
  계약 표의 "`details.method` 포함"을 지키면서 두 사실을 모두 잃지 않기 위한 선택이다.
- **새 진단 필드는 전부 조건부다.** `serverRequestsAnswered`, `unhandledServerRequestMethods`,
  `unmatchedResponses`, `protocolViolations`는 값이 0/빈 배열이면 키 자체가 없다. server request를 보내지
  않는 기존 fixture의 실패 envelope은 바이트가 그대로다.
- **`errors.ts`에 code 하나를 추가했다.** `errors.ts` 헤더 주석이 "구현하는 lane이 그 변경에서 함께
  추가한다"고 규정하고 `errors.test.ts`가 강제한다. 계약에 이미 승인된 code이고 스키마는 error code를
  열거하지 않으므로 `cli/schemas/**` 변경은 없다. 신규 code를 만든 것이 아니다.
- **`cli/package.json`의 `files`에 한 줄을 추가해야 했다.** 아래 "발견 사항" 참조.

**실행한 검사**

| 검사 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | 81/81 통과 (기존 51 → 신규 30 추가) |
| `npm test` | 35/35 통과 |
| `npm run test:plugin-artifact` | 통과 (`files` 수정 이후) |
| 캡처 비교 (29 시나리오 × 2회) | base2와 **바이트 동일** |

**새 테스트가 실제로 결함을 잡는지 확인했다.** `classifyIncoming`을 옛 순서(`id` 우선)로 되돌려
빌드한 뒤 `bidirectional.test.js`를 돌렸다. 6건 중 4건이 실패했다.

| 테스트 | 옛 순서에서 |
| --- | --- |
| configuration, phase=before | **실패** (교착 후 provider 실패) |
| configuration, phase=after | 통과 — 아래 한계 참조 |
| server id base = 1 | **실패** (`initialize`가 server request로 잘못 resolve됨) |
| registerCapability, REQUIRE=1 | 통과 — 아래 한계 참조 |
| clientAnswerServer | **실패** (5.1초 후 응답 검증 timeout) |
| unknownRequestServer | **실패** (승격 없음) |

**발견 사항**

1. **`cli/package.json`의 `files`가 `dist/lsp/*.js`를 빠뜨려 tarball이 깨졌다.**
   `npm run test:plugin-artifact`가 `Cannot find module './lsp/protocol'`로 실패했다. `files` 패턴은
   경로 세그먼트를 한 단계만 매칭하므로 `dist/*.js`는 하위 디렉터리를 포함하지 않는다. W0-4가
   `dist/providers/*.js`를 추가해야 했던 것과 같은 함정이다. **단위 테스트는 checkout에서 돌기 때문에
   이것을 절대 잡지 못한다.** 한 줄을 추가하고, 같은 실수가 반복되지 않도록
   `lspProtocol.test.ts`에 `cli/src`의 디렉터리와 `files` 패턴을 대조하는 테스트를 넣었다.
2. **`registerCapabilityServer`와 `configurationRequestServer`(phase=after)를 CLI로 돌리는 테스트는
   경주에서 이겨서 통과할 수 있다.** 두 fixture 모두 응답 여부와 무관하게 Call Hierarchy를 계속
   서비스하므로, client가 답하지 않아도 fixture의 무응답 타이머가 울리기 전에 분석이 끝난다.
   **응답 자체를 엄격하게 증명하는 것은 `clientAnswerServer`다.** 이 fixture는 모든 응답을 검증할
   때까지 `textDocument/prepareCallHierarchy` 응답을 보류하므로 client가 답하지 않으면 반드시 실패한다.
   두 기존 fixture는 소유가 다른 파일이라 수정하지 않았다.
