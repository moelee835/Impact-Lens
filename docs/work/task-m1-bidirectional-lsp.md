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

- [x] `npm run cli:build`, `npm run cli:test`(95), `npm test`(35) 통과
- [x] `configurationRequestServer`의 두 phase 모두에서 client가 응답하고 initialize가 완료된다
- [x] `registerCapabilityServer`가 `REQUIRE_REGISTRATION=1`에서도 통과한다
      (단 이 fixture는 경주로도 통과 가능하다. 엄격한 증명은 `clientAnswerServer`다 — 1단계 로그 3번 참조)
- [x] server request id가 1부터인 fixture에서 client의 pending `initialize`가 오염되지 않는다
- [x] 모르는 server request에 MethodNotFound로 답한다 (침묵하지 않는다)
- [x] 민감 값이 오류 message·details 어디에도 없다 (sentinel 검증)
- [x] `observed.diagnostics`가 같은 입력에 대해 결정적이다 (4회 반복 테스트)
- [x] 정상 경로 응답의 무변경 — **2단계 ↔ 3단계 0줄. base ↔ 2단계는 16줄이며 그 내용을 그대로 기록했다**
- [x] `npm run test:plugin-artifact` 통과
- [x] stdout은 정확히 JSON 한 줄 (transcript를 켜도 stdout은 그대로)

### 남은 작업 (이 lane 밖)

| 항목 | 담당 |
| --- | --- |
| 요청 최상위 `providerPreset`/`initializationOptions`/`settings` 스키마 추가 | W1-C merge 직후 별도 contract lane (L6) |
| `provider_config_invalid` code 추가와 D8 크기·depth 검증 | W1-C(code) + W1-B(검증 지점) |
| readiness 신호 관측과 `coverage.indexing.status` 실측화 | Wave 2 W2-A |
| `textDocument.callHierarchy.dynamicRegistration: true` | Wave 2 W2-A (static/dynamic 병합 이후) |
| 분석 전체 예산(세션 budget) | Wave 2 W2-A (readiness budget과 함께) |

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
2. **W0-4 캡처 스크립트를 문서에서 그대로 추출해 쓰는 것 자체에 함정이 있었다.** scratchpad에 둔 사본이
   문서 원문과 달랐던 것을 발견했다. 이후의 무변경 증명은 **문서에서 매번 새로 추출한 원문 스크립트**로
   다시 수행했다(2단계 로그 참조). 캡처 도구를 손보면 그 도구가 증명하려는 대상을 정의하게 되므로,
   도구 자체가 base와 after 양쪽에서 동일해야 한다.
3. **`registerCapabilityServer`와 `configurationRequestServer`(phase=after)를 CLI로 돌리는 테스트는
   경주에서 이겨서 통과할 수 있다.** 두 fixture 모두 응답 여부와 무관하게 Call Hierarchy를 계속
   서비스하므로, client가 답하지 않아도 fixture의 무응답 타이머가 울리기 전에 분석이 끝난다.
   **응답 자체를 엄격하게 증명하는 것은 `clientAnswerServer`다.** 이 fixture는 모든 응답을 검증할
   때까지 `textDocument/prepareCallHierarchy` 응답을 보류하므로 client가 답하지 않으면 반드시 실패한다.
   두 기존 fixture는 소유가 다른 파일이라 수정하지 않았다.

### 2026-08-27 — 2단계: cancellation, progress, 진단 대기 대체

**변경한 파일**

| 파일 | 내용 |
| --- | --- |
| `cli/src/jsonRpc.ts` | timeout 시 `$/cancelRequest` 전송, cancelled pending의 grace 유지, `protocolCounters()` |
| `cli/src/lspProvider.ts` | `$/progress` 수신·기록, 신호 기반 진단 대기, opt-in transcript |
| `cli/src/test/fixtures/cancelObservingServer.ts` (신규) | 취소 수신을 파일에 기록하고 늦은 RequestCancelled 응답을 보낸다 |
| `cli/src/test/fixtures/progressServer.ts` (신규) | work-done progress 전체 주기 |
| `cli/src/test/fixtures/slowDiagnosticsServer.ts` (신규) | 100ms보다 늦게 진단을 publish |
| `cli/src/test/bidirectional.test.ts` | 취소·progress·stdout 불변식 3건 추가 |
| `cli/src/test/lsp.integration.test.ts` | 진단 대기 2건 추가 |

**설계 결정과 이유**

- **취소한 pending을 즉시 지우지 않는다.** spec은 취소된 요청에도 server가 응답하는 것을 허용한다.
  즉시 지우면 그 늦은 응답이 "알 수 없는 id"로 집계돼, 존재하지 않는 프로토콜 문제를 가리키는 증거가
  만들어진다. `CANCEL_GRACE_MS = 2000` 동안 인식만 하고 아무것도 하지 않는다.
- **고정 100ms 대기를 "신호"로 바꿨다. 시간 값을 늘린 것이 아니다.** 고정 대기의 결함은 값이 작다는
  것이 아니라 **끝났다는 신호가 아니라 시계를 기준으로 판단한다**는 것이다. 이제 열어둔 문서마다
  `publishDiagnostics`가 한 번씩 도착하면 즉시 진행하고, budget(2000ms, 세션 timeout으로 다시 상한)은
  **아무것도 publish하지 않는 server를 위한 상한으로만** 쓴다.
- **`$/progress`의 `end`를 준비 완료로 승격하지 않는다.** token이 무엇을 나타내는지는 그 token을 만든
  server만 안다. 승격하면 색인하지 않은 workspace에 대해 자신 있는 empty 결과를 보고하게 된다.
  Wave 1은 **관측만** 하고, 어떤 token이 무엇을 뜻하는지는 Wave 2의 preset 선언이 정한다.
- **미처리 request와 progress를 성공 envelope에 넣지 않았다.** 성공 응답에 필드를 더하는 것은 다른 lane의
  계약 변경이고, Wave 1의 agent가 그 값으로 할 수 있는 일도 없다. 대신 기본값이 꺼져 있는
  `IMPACT_LENS_LSP_TRANSCRIPT=1` transcript를 **stderr에 JSON 한 줄로** 남긴다. stdout은 그대로
  정확히 JSON 한 줄이다.
- **분석 전체 예산(세션 budget)은 넣지 않았다.** 지금 per-request timeout은 `timeoutMs`(기본 30초)이고,
  그 위에 세션 예산을 얹으면 **기존 성공 경로의 실패 조건이 하나 늘어난다.** 무변경 제약과 정면으로
  충돌하며, 값의 근거가 될 관측도 아직 없다. `$/cancelRequest`가 들어간 지금 취소 자체는 가능하므로,
  예산의 도입은 readiness budget과 함께 Wave 2(W2-A)에서 근거를 갖고 하는 것이 맞다고 판단했다.
  **이것은 지시받은 2단계 항목에서 의도적으로 남긴 부분이며 그 이유를 여기 기록한다.**

**실행한 검사**

| 검사 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | 86/86 통과 |
| 취소 fixture | `$/cancelRequest`가 server에 도달함을 server 쪽 파일 기록으로 확인 |
| 진단 대기 | 400ms 지연 publish를 잡아냄(옛 100ms 대기에서는 0건), 즉시 publish에서는 500ms 미만 반환 |

#### 무변경 증명 — 관측된 차이 1건 (lead 결정 필요)

캡처 도구의 신뢰성 문제를 없애기 위해 `docs/work/task-m1-provider-seam.md`에서 **매 실행마다 새로
추출한 원문 스크립트**로 다시 수행했다. 같은 worktree에서 `git checkout dbc6c9b -- cli/src cli/package.json`
으로 기준선 소스를 복원해 빌드·캡처하고, 다시 branch HEAD로 복원해 빌드·캡처했다.

| 비교 | 결과 |
| --- | --- |
| 기준선 3회끼리 | 29 시나리오 **전부 동일** |
| branch 3회끼리 | 29 시나리오 **전부 동일** |
| 기준선 ↔ branch | **16줄 차이. 전부 같은 필드 한 개다.** |

차이의 전체 목록은 다음 하나뿐이다.

```
data.provider.observed.diagnostics      false -> true
capabilities.observed.diagnostics       false -> true   (같은 값의 mirror)
```

`ok-ts`, `ok-tsx`, `ok-js`, `ok-mts`, `ok-depth-limited`, `ok-node-limited`, `ok-include-source`,
`ok-no-callers` 8개 성공 시나리오에서 각 2줄씩이다. **node의 `diagnostics` 배열 내용, 그래프, 노드 수,
`coverage`, `limitations`, 모든 실패 envelope은 한 바이트도 다르지 않다.**

원인은 진단 대기 교체다. `workspace.configuration` 선언(3단계)은 이 시점에 아직 없다.

**이것을 "임의로 갱신"하지 않고 그대로 보고한다.** 판단 재료는 셋이다.

1. **옛 코드도 `true`를 낸 적이 있다.** 착수 시 기준선 5벌 중 base1이 `true`였다(C1). 즉 `false`는
   고정된 계약이 아니라 100ms 안에 `publishDiagnostics`가 도착했는지에 대한 경주 결과다.
   이번 3벌이 모두 `false`로 일치한 것은 그 경주가 이 머신에서 대체로 한쪽으로 기운다는 뜻일 뿐이다.
2. **`false`는 사실이 아니다.** transcript로 확인하면 bundled TypeScript는 열어둔 문서 4개 전부에
   대해 진단을 publish한다(`diagnosticsPublishedFor: 4, openedDocuments: 4`). 옛 코드는 그것을
   받고도 이미 듣기를 그만둔 뒤였다.
3. **이 필드가 `false`인 동안 node의 `diagnostics`는 구조적으로 빈 배열이었다.** 오류가 있는
   workspace였다면 옛 코드는 진단을 통째로 누락했을 것이다. 이번 캡처 workspace에 오류가 없어서
   배열 내용에는 차이가 나지 않았을 뿐이다.

되돌리는 선택지도 있다: 고정 100ms를 유지하면 이 16줄은 사라지지만 진단 누락과 비결정성이 함께 남는다.
**결정은 lead에게 있다.** 이 lane은 값을 바꾸는 테스트나 기대값 파일을 만들지 않았다(그런 파일이 없다).

**알려진 비용**: 문서를 열고도 `publishDiagnostics`를 전혀 보내지 않는 provider에서는 분석마다
budget 상한(2000ms, 세션 timeout으로 다시 상한)만큼 기다린다. bundled TypeScript는 신호에서
빠져나오므로 해당되지 않는다. preset이 이 값을 선언하는 것은 Wave 2 readiness budget의 일이다.


### 2026-08-27 — 3단계: 설정 주입 경로와 secret redaction

lead가 확정한 `task-m1-preset-manifest-contract.md`의 D2·D3·D4·D5·D6·D11에 맞춰 구현했다.
L2만 미결이었고, **이 단계에서 그 관측을 수행했다.**

**변경한 파일**

| 파일 | 내용 |
| --- | --- |
| `cli/src/lsp/session.ts` (신규) | `ProviderSessionConfig`/`resolveSession`, `SettingsDelivery`, 세션 redaction 표 수집 |
| `cli/src/lspProvider.ts` | client capability 2개 선언, `initializationOptions` 주입, `didChangeConfiguration` push, transcript redaction |
| `cli/src/jsonRpc.ts` | `setRedactionValues`, `redactProviderText(value, secrets)` |
| `cli/src/test/fixtures/settingsRequiredServer.ts` (신규) | 선언·옵션·조회 결과를 자기가 검증하는 oracle |
| `cli/src/test/fixtures/secretEchoServer.ts` (신규) | 받은 설정을 자기 말로 stderr·logMessage에 되뱉는다 |
| `cli/src/test/lsp.integration.test.ts` | 설정 주입·push 억제·secret·결정성 4건 추가 |
| `cli/src/test/lspProtocol.test.ts` | 세션·secret 수집 단위 5건 추가 |

**설계 결정과 이유**

- **세션 설정은 생성자의 선택적 인자로 받는다.** `providers/`(W1-B)와 `index.ts`를 건드리지 않고도
  주입 경로가 열리고, 기본값이 빈 세션이라 bundled 경로의 wire가 그대로다. `$ref`도 `ProviderPreset`도
  이 계층에서 import 하지 않는다(D2).
- **요청 최상위 `providerPreset`/`initializationOptions`/`settings`는 배선하지 않았다.** lead가 이름을
  고정했지만 스키마 추가는 후속 lane이고, 지금 요청에 넣으면 `invalid_request`로 거부된다.
  **그래서 3단계의 end-to-end 검증은 CLI 프로세스가 아니라 provider API 수준에서 한다.**
- **`didChangeConfiguration`은 preset이 요구할 때만, 그리고 트리가 비어 있지 않을 때만 보낸다.**
  무조건 push는 bundled TypeScript handshake에 프레임을 하나 더한다. 기존 동작 무변경 제약과 충돌한다.
- **redaction은 값 치환을 패턴 치환보다 **먼저** 적용한다.** 패턴 규칙이 줄을 먼저 고쳐 쓰면 그 안의
  비밀이 리터럴로 더 이상 발견되지 않을 수 있다.
- **키 이름 휴리스틱을 단어 경계에서 부분 문자열로 바꿨다.** 처음에 쓴 `(^|[._-])token($|[._-])` 형태는
  `authToken` 같은 **camelCase 키를 통째로 놓쳤고**, 실제 설정 키는 대부분 camelCase다. 대가는 가끔의
  오탐(`tokenizer` 설정이 가려짐)이고, 그 교환은 의도적이다. 가려진 로그 한 줄은 불편이지만 유출된
  credential은 되돌릴 수 없다.
- **표는 긴 문자열부터 치환한다.** 짧은 비밀이 긴 비밀의 부분 문자열이면 순서가 뒤집힐 때 긴 값의
  나머지가 남는다.
- **길이 4 미만과 비문자열은 표에 넣지 않는다.** `1`이나 `on`을 치환하면 무관한 로그가 파괴되고,
  그 값 자체로는 식별력도 없다.
- **D8의 크기·depth·금지 키 검증은 이 lane에서 구현하지 않았다.** 그 검증의 실패 code
  `provider_config_invalid`가 아직 `errors.ts`에 없고(L1에 따라 W1-C가 추가한다), 검증이 걸릴 지점은
  manifest·override를 읽는 `providers/`(W1-B)다. 프로토콜 계층에서는 `lookupSection`이
  `hasOwnProperty`만 따라가고 `clone`이 평범한 객체만 만들므로 prototype 오염 경로는 닫혀 있다.

#### L2 관측 결과 — **차이 없음**

`workspace.configuration: true`와 `window.workDoneProgress: true` 선언, 그리고 하드코딩 `{}` 대신 해석된
`initializationOptions` 전달을 켠 전후로 캡처를 비교했다.

| 비교 | 결과 |
| --- | --- |
| 3단계 직전(2단계 HEAD) 2회끼리 | 29 시나리오 **전부 동일** |
| 3단계 2회끼리 | 29 시나리오 **전부 동일** |
| **3단계 직전 ↔ 3단계** | **29 시나리오 전부 바이트 동일** |

즉 **`workspace.configuration` 선언은 bundled TypeScript의 응답을 바꾸지 않는다.** typescript-language-server가
이 선언으로 `workspace/configuration`을 보내기 시작하더라도 우리가 `[null]`을 답하고 server가 기본값을
쓰므로 결과가 같다는 가정이 관측으로 확인됐다. L2의 (a)·(b) 어느 대응도 필요하지 않다.

#### 캡처 디렉터리 충돌 확인 (lead 요청)

**충돌은 실재했고, 이 lane에서도 관측됐다.** scratchpad에 두었던 캡처 스크립트 사본이
`m1-preset-catalog` lane의 편집으로 바뀌어 있었다(workspace 기본 경로가
`il-m1-preset-catalog-capture-fixed`로, `VOLATILE_PATHS` 마스킹이 추가된 상태). W0-4 문서 원문과
`diff`해서 발견했다.

대응:

1. 캡처 스크립트를 **문서에서 다시 추출**하고, workspace 경로만
   `il-w1a-bidirectional-lsp-capture-fixed`로 바꿔 lane 전용 파일명
   (`scratchpad/w1a-lsp/capture-w1a.mjs`)으로 저장했다. 그 외에는 원문과 동일하다.
2. 출력 디렉터리도 `scratchpad/w1a-lsp/` 아래로 옮겼다.
3. **모든 비교를 처음부터 다시 수행했다.** 각 side를 2회씩 떠서 side 내부가 동일한 것을 먼저 확인한 뒤에만
   기준선으로 인정했다.

재수행 결과는 이전 결과와 같았다(base ↔ 2단계 16줄, 2단계 ↔ 3단계 0줄). 즉 이전 비교가 오염되지는
않았지만, **오염 여부를 확인할 수단이 없었던 것이 문제였고 지금은 있다.**

#### `observed.diagnostics` 결정성 (lead 요청)

같은 입력으로 4회 반복해 같은 값이 나오는 것을 테스트로 고정했다
(`lsp.integration.test.ts`의 "reports the same diagnostics observation for the same input every time").
고정 100ms 대기에서는 이 값이 부하에 따라 갈렸다. 이제 열어둔 문서마다 publish를 기다리므로 값이
관측에서 나온다.

**주의로 기록한다**: 이 lane의 캡처 비교에서 base ↔ 2단계의 16줄 차이는 **진짜 회귀가 아니라 이 필드의
경쟁이 사라진 결과**다. 캡처를 "같게 만들려고" 코드를 되돌리지 않았고, 차이를 그대로 보고했다.

**실행한 검사**

| 검사 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | 95/95 통과 |
| `npm test` | 35/35 통과 |
| `npm run test:plugin-artifact` | 통과 |
| 캡처 2단계 ↔ 3단계 | 29 시나리오 바이트 동일 |
| sentinel 검증 | `IL-SENTINEL-…`이 오류 message·details 어디에도 없고 `[REDACTED]`가 들어간 것을 확인 |

## handover 6절 미결 4번 — 실제 동작 관측과 권고

lead가 이미 (a)"문서를 코드에 맞춘다"로 닫았고 계약 문서는 `details.stage ∈ {launch, initialize, query}`로
갱신됐다. 이 lane은 지시대로 **실제 동작을 확인**했고, 그 결과 **한 가지 좁힐 여지를 발견했다.**

### 관측

빌드한 CLI와 `cli/src/childIpc.ts`의 함수를 직접 구동했다.

| 시나리오 | code | `details.stage` | `bytesFromServer` | `stderr` | `providerLog` |
| --- | --- | --- | --- | --- | --- |
| `silentExitServer` | `provider_initialize_failed` | `initialize` | 0 | 없음 | 없음 |
| `queryExitServer` | `provider_query_failed` | `query` | 164 | 있음 | 없음 |

`looksLikeSilentProviderFailure`에 세 stage를 각각 넣으면 전부 `true`이고,
`childIpcUnavailableError`는 `launch`/`initialize`/`query`를 **그대로 보존**한다.

즉 **코드는 계약 표의 `launch` 고정과 어긋나며, lead가 채택한 갱신이 옳다.** 확인 완료.

### 추가 발견 — `query`는 실제로 도달할 수 없다

`looksLikeSilentProviderFailure`는 `bytesFromServer === 0`을 요구한다. 그런데 lifecycle이 `query`가
되려면 `doInitialize`가 끝나야 하고, 그러려면 **initialize 응답을 받아야 하므로 `bytesFromServer > 0`이다.**
위 표의 `queryExitServer` 행이 그것을 그대로 보여준다(164 바이트).

따라서 `provider_ipc_unavailable`이 실제로 가질 수 있는 stage는 **`launch`와 `initialize` 둘뿐이다.**

- `launch` — spawn 자체가 실패해 `spawned`가 false인 경우.
- `initialize` — child는 떴지만 한 바이트도 말하지 않은 경우. **sandbox stdio 미전달의 전형적 모양이다.**

**권고**: 계약 표를 `{launch, initialize}`로 좁히거나, `query`를 남긴다면 "현재 코드에서는 도달 불가이며
`looksLikeSilentProviderFailure`의 조건이 완화되면 열린다"는 단서를 함께 적는다. 좁히는 쪽을 권한다 —
도달 불가능한 값을 계약에 남기는 것은 미결 4번을 닫은 근거("관측할 수 없는 값을 계약에 적으면 그 값은
추측이 된다")와 같은 문제다.

**계약 문서는 수정하지 않았다.** `provider-coverage-contract.md`는 W1-C 소유다.
`cli/src/childIpc.ts`도 건드리지 않았다 — 지금 동작이 맞다고 판정된 코드다.
