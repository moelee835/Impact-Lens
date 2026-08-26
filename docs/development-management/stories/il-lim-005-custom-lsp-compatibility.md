# IL-LIM-005 사용자 지정 LSP 호환성 확장

- 상태: Backlog
- 우선순위: P1
- 완료 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../milestones/m1-provider-platform-ux.md)
- 영향도: 높음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

현재 generic adapter는 command, args, languageId와 빈 `initializationOptions`를 사용한다.
서버별 초기화 옵션, workspace settings, configuration 요청, indexing 대기가 필요하면 표준 Call Hierarchy를
지원하는 서버도 초기화에 실패하거나 불완전한 결과를 반환할 수 있다.
server process가 initialize 전에 종료될 때 stderr stream이 완전히 drain되기 전에 오류를 생성하면
`Language Server exited (1):`처럼 원인 없는 메시지만 남아 provider 설정과 실행환경 문제를 진단하기 어렵다.

## 사용자 스토리

사용자 지정 Language Server를 연결하는 개발자로서 서버가 요구하는 안전한 초기화 설정을 제공하고,
indexing 완료 후 안정적으로 분석하고 싶다.

## 범위

- JSON schema에 제한된 initialization options와 settings 전달 계약을 설계한다.
- `workspace/configuration`과 필요한 표준 lifecycle 요청을 지원한다.
- indexing 준비 전략과 timeout/실패 상태를 명확히 보고한다.
- process launch부터 stdio close까지 lifecycle과 redacted 진단 계약을 보강한다.
- preset별 build metadata와 readiness profile을 core protocol과 분리한다.

## 제외 범위

- 임의 shell command 평가
- 비표준 protocol 전체를 자동으로 추론하는 범용 adapter
- project configure, dependency resolve, build 또는 application의 무단 실행

## 수용 기준

- [ ] 설정 값이 schema 검증을 거쳐 Language Server에 전달된다.
- [ ] configuration 요청 및 준비 대기가 필요한 fixture가 통과한다.
- [ ] 민감한 설정 값이 stdout·stderr에 임의 노출되지 않는다.
- [ ] 기존 TypeScript 기본 provider 계약과 결과가 유지된다.
- [ ] initialize 전후 process crash가 단계·exit/signal·redacted stderr와 함께 재현 가능하게 보고된다.
- [ ] build/index 준비가 필요한 provider가 `not_ready`와 실제 empty graph를 구분한다.

## 검증

- mock LSP lifecycle/설정 contract 테스트
- 실제 서버 최소 2종의 initialization 및 Call Hierarchy 통합 테스트
- timeout, 잘못된 옵션과 server crash 회귀 테스트

## 의존성 및 위험

- `IL-LIM-003`의 provider 상태 모델과 함께 설계하는 것이 좋다.
- 자유 형식 설정은 재현성과 보안 위험을 높이므로 허용 범위를 문서화해야 한다.

## 현재 기준선

- `ProviderCommand`는 `command`, optional `args`, optional `languageId`만 가진다.
- CLI initialize 요청은 `initializationOptions: {}`로 고정되어 있고 client capability도 Call Hierarchy와
  diagnostics, workspaceFolders의 최소 subset만 선언한다.
- `JsonRpcClient`는 client→server request 응답과 server notification만 처리한다. method와 id가 함께 있는
  server→client request는 pending client request가 아니므로 현재 응답하지 못한다.
- `workspace/configuration`, `client/registerCapability`, `window/workDoneProgress/create`, request cancellation과
  document sync negotiation이 구현되어 있지 않다.
- child process의 `exit` 이벤트에서 누적 stderr를 즉시 읽는다. `close` 이벤트 전에 남은 pipe data가 도착하면
  실제 오류가 메시지에서 빠질 수 있으며, 현재 error에는 discovery/launch/initialize 단계도 없다.

## 조사 결과

- [LSP initialize](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialize)는
  client capability, initializationOptions, workspaceFolders와 server capability negotiation을 정의한다.
- [typescript-language-server configuration](https://github.com/typescript-language-server/typescript-language-server/blob/master/docs/configuration.md)은
  initializationOptions와 `workspace/didChangeConfiguration`을 모두 사용하며 설정 필요성이 서버마다 다름을 보여준다.
- [python-lsp-server configuration](https://github.com/python-lsp/python-lsp-server/blob/develop/CONFIGURATION.md)도
  `workspace/didChangeConfiguration` 기반의 자체 settings namespace를 가진다.
- LSP server request는 response와 같은 `id`를 가지므로 현재 `JsonRpcClient.handle`의 “id면 pending response”
  분기만으로는 표준 client 역할을 완수할 수 없다.
- clangd의 compile database, SourceKit-LSP의 toolchain/build index와 Kotlin LSP의 Gradle/Maven import처럼
  protocol이 표준이어도 의미 있는 결과를 위한 project readiness 조건은 provider마다 다르다. 자유 형식
  shell hook이 아니라 제한된 preset profile과 doctor evidence로 다뤄야 한다.

## 대안 검토와 결정

1. **서버별 hard-coded 분기만 추가**: 빠르지만 preset이 늘 때 client core가 오염된다.
2. **완전한 범용 LSP client library 교체**: 기능은 많지만 package 크기·migration 위험이 크다.
3. **필요한 표준 lifecycle을 작은 core로 보강하고 preset profile로 차이를 격리**: 현재 구조를 유지하면서
   테스트 가능한 범위로 확장할 수 있어 우선 권장한다.
4. **자유 형식 환경 변수·명령 template 허용**: secret 노출과 shell 위험 때문에 제외한다.

## 권장 대응

- `JsonRpcClient`를 message 종류별로 분리한다: client response, server request, notification.
- server request handler registry를 추가하고 알 수 없는 method에는 JSON-RPC `MethodNotFound`를 응답한다.
- 최소 표준 handler를 순차 지원한다.
  - `workspace/configuration`: 요청 section에 해당하는 명시 설정만 반환
  - `client/registerCapability`/`unregisterCapability`: Call Hierarchy 등 필요한 동적 등록 추적
  - `window/workDoneProgress/create`: token 등록과 progress notification 수집
  - `workspace/workspaceFolders`: 현재 단일 workspace 반환
- provider config에 JSON-compatible `initializationOptions`와 `settings`를 추가하되 size/depth 제한,
  prototype key 거부와 schema validation을 적용한다.
- indexing readiness는 범용 추측 대신 preset이 정의한 signal/timeout/first-query 전략을 사용한다.
- 모든 timeout은 `$/cancelRequest`를 보낸 뒤 child process 종료까지 bounded하게 처리한다.
- process 종료는 `exit`와 stdio `close`를 구분하고 bounded drain 뒤 stderr tail을 redaction한다. error에는
  lifecycle stage, exit/signal, executable basename과 관측 version을 포함하되 전체 argv와 환경은 기본 노출하지 않는다.
- readiness profile은 필요한 metadata(`compile_commands.json`, `Package.swift`, Gradle/Maven files 등),
  안전한 read-only probe와 사용자 승인 필요 작업을 분리한다.

## 단계별 계획

### 1단계 — JSON-RPC 양방향 core

1. message type guard와 server request handler registry를 구현한다.
2. success/error response writer와 id collision 테스트를 추가한다.
3. request timeout 시 `$/cancelRequest` notification을 전송한다.
4. malformed/oversized frame과 stderr cap의 기존 안전 경계를 유지한다.
5. spawn error, stderr-only exit, partial frame 후 exit와 graceful shutdown을 각각 fixture로 만든다.

종료 조건: mock server가 initialize 중 보낸 request에 응답하고 client request도 정상 완료된다.

### 2단계 — 설정 계약

1. request schema에 `initializationOptions`와 `settings`의 허용 구조·크기 제한을 정의한다.
2. preset defaults, project config와 one-shot request override의 merge 순서를 정한다.
3. secret-like key와 value를 debug log에서 redaction한다.
4. `workspace/configuration` section mapping과 didChangeConfiguration 전송 시점을 구현한다.

종료 조건: TypeScript와 설정을 요구하는 mock/Python server가 기대 설정을 받고 초기화된다.

### 3단계 — capability와 readiness

1. static/dynamic registration을 하나의 observed capability state로 병합한다.
2. work-done progress token을 추적하되 indexing 완료 보장으로 과해석하지 않는다.
3. preset별 readiness probe와 maximum wait budget을 정의한다.
4. 준비 전 empty result와 실제 empty graph를 구분하는 limitation을 추가한다.

종료 조건: delayed-index mock server에서 premature empty 결과를 성공으로 확정하지 않는다.

### 4단계 — 실제 서버 호환 matrix

1. bundled TypeScript, gopls, Python 후보와 `IL-LIM-014`~`016`의 provider를 단계적으로 실제 process로 검증한다.
2. initialization transcript에서 지원하지 않은 server request를 탐지해 fixture로 고정한다.
3. 문서화된 최소·권장 설정 profile을 preset으로 이동한다.

종료 조건: 최소 2종 외부 server가 별도 client patch 없이 통과하고 미지원 서버는 진단 가능하게 실패한다.

## 예상 변경 영역

- `cli/src/jsonRpc.ts`: 양방향 request, cancellation과 progress
- `cli/src/lspProvider.ts`: process lifecycle 진단, capability registration, settings와 readiness
- `cli/src/types.ts`, `cli/src/index.ts`: provider config validation
- `cli/schemas/request.schema.json`: initialization/settings 계약
- `cli/src/test/`: scripted mock LSP와 실제 provider integration
- `cli/README.md`, Plugin contract: 허용 설정과 보안 경계

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| protocol | server request와 client response의 id 교차 | 각 요청이 올바른 방향으로 응답됨 |
| protocol | unknown server method | MethodNotFound 응답 후 session 유지 |
| 설정 | nested initialization/settings | schema 제한 내 값만 정확한 section에 전달 |
| 보안 | prototype key, oversized config, secret-like field | 거부 또는 redaction되고 로그에 원문 미노출 |
| lifecycle | timeout과 cancellation | cancel 전송 후 bounded dispose, orphan process 없음 |
| lifecycle | stderr 출력 직후 code 1 종료 | close/drain 뒤 redacted stderr와 initialize 단계가 보존됨 |
| readiness | build metadata 없음·index 진행 중 | empty graph와 다른 상태 및 안전한 해결 방법 반환 |
| 통합 | TypeScript·gopls·Python·clangd·SourceKit/Kotlin 후보 | capability와 expected graph가 provider별 fixture와 일치 |

## rollout과 관측

- JSON-RPC core 변경은 먼저 bundled TypeScript 회귀 suite 뒤에 feature flag 없이 적용하되 새 config field는 opt-in이다.
- debug mode에서 처리·미처리 server method 이름과 단계별 timing만 기록한다.
- 기본 오류에는 안전한 요약만 넣고 사용자가 요청한 debug artifact에만 redacted transcript와 discovery detail을 남긴다.
- 지원하지 않은 server request가 오면 silent ignore하지 않고 `provider_protocol_incompatible` detail을 제공한다.
- 실제 server matrix가 안정된 뒤에만 해당 preset을 `verified-external`로 승격한다.
- core 회귀 시 새 handler를 비활성화하기보다 이전 TypeScript fixture 실패를 release blocker로 취급한다.

## 미해결 질문

- 범용 JSON 설정의 최대 byte/depth와 허용 scalar type을 어느 수준으로 제한할지 결정이 필요하다.
- dynamic registration을 모든 method에 일반화할지 Call Hierarchy 관련 method만 수용할지 범위를 정해야 한다.
- server process 재사용이 필요한 indexing 비용과 one-shot CLI 격리 원칙 사이의 tradeoff를 benchmark해야 한다.
- build/project import가 code execution을 수반할 수 있는 provider에서 workspace trust와 명시 승인을 어떤
  host 계약으로 받을지 결정해야 한다.
