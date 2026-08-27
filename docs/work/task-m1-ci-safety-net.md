# M1 CI 안전망: 단위 테스트 CI 실행과 mock LSP fixture 인프라

## 배경과 해결할 문제

M1은 provider/coverage 타입 계약을 넓히는 마일스톤이다. 계약이 넓어지는 동안 단위 테스트가 회귀를
잡아주어야 하는데, 지금 저장소에는 두 개의 구멍이 있다.

### 1. 단위 테스트가 어떤 CI에서도 실행되지 않는다

`.github/workflows/` 아래 워크플로가 `plugin-artifact-e2e.yml` 하나뿐이고, 그 워크플로는
`npm run test:plugin-artifact`만 실행한다. 따라서 다음이 CI에서 한 번도 돌지 않는다.

- `npm test` — Extension 단위 테스트 (`out/test/*.test.js`, 34건)
- `npm run cli:test` — CLI 테스트 (`cli/dist/test/*.test.js`, 51건)

packaged artifact E2E는 tarball을 만들어 clean prefix에 설치하고 doctor/analyze를 돌리는 통합 검증이라,
`src/**`와 `cli/src/**`의 로직 회귀는 거의 잡지 못한다. 즉 총 85건의 단위 테스트가 사람이 로컬에서
실행하는 것에만 의존하고 있다. M1처럼 타입 계약이 여러 lane에서 동시에 넓어지는 시기에는 실질적 위험이다.

`npm run test:all`도 `npm test && npm run cli:test`라서 이름과 달리 "전체"가 아니다.
`test:plugin-artifact`를 포함하지 않는다.

### 2. 양방향 LSP 프로토콜을 검증할 mock 서버 수단이 없다

`cli/src/jsonRpc.ts`의 `handle()`은 id가 붙은 메시지를 받으면 자신의 pending map에서 찾고, 없으면
조용히 버린다.

```ts
if (message.id !== undefined) {
  const pending = this.pending.get(message.id);
  if (!pending) {
    return;   // server -> client request가 여기서 소멸한다
  }
```

LSP에서 서버는 `workspace/configuration`, `client/registerCapability` 같은 **request**를 클라이언트로
보낼 수 있고, 클라이언트가 응답하지 않으면 서버가 handshake를 끝내지 못하거나 타임아웃으로 죽는다.
현재 구현은 그런 request를 응답 없이 폐기하므로 단방향이다.

이 결함을 테스트로 드러내려면 server→client request를 보내는 mock 서버가 있어야 하는데,
`cli/src/test/fixtures/` 의 6개 fixture 중 그런 fixture는 하나도 없다. 게다가 fixture 4개가
동일한 Content-Length 프레임 파서를 문자 단위로 복붙하고 있어(총 약 90줄 중복) 새 동작을 추가하려면
같은 파서를 다섯 번째로 복사해야 한다.

| fixture | 줄 수 | 프레임 파서 |
| --- | --- | --- |
| `loggingExitServer.ts` | 41 | 복붙 |
| `noCapabilityServer.ts` | 37 | 복붙 |
| `parentWatchdogServer.ts` | 60 | 복붙 |
| `queryExitServer.ts` | 42 | 복붙 |
| `exitingServer.ts` | 5 | 없음 (stderr 쓰고 즉시 종료) |
| `silentExitServer.ts` | 3 | 없음 (조용히 종료) |

## 범위

- `npm test`와 `npm run cli:test`를 CI에서 실행한다.
- `npm run test:all`의 이름과 실제 범위를 일치시킨다.
- fixture의 복붙된 프레임 파서를 공용 헬퍼로 추출한다.
- 헬퍼에 server→client request 전송 능력을 추가하고, 그 능력을 쓰는 fixture를 준비한다.

## 범위에서 제외할 항목

- **제품 코드 수정.** `cli/src/*.ts`, `src/*.ts`는 건드리지 않는다. `jsonRpc.ts`의 단방향 결함을
  고치는 것은 Wave 1의 `il-lsp-protocol` lane 몫이다.
- **새 fixture를 쓰는 테스트 작성.** 현재 CLI는 server request에 응답하지 못하므로 그런 테스트는
  반드시 실패한다. 이 lane은 헬퍼와 fixture만 준비하고, 테스트는 결함을 고치는 lane이 함께 작성한다.
- `scripts/test-plugin-artifact-e2e.mjs:125-126`의 `selectedBy === 'bundled'` / `complete === true`
  단언 갱신. Auto/preset provider가 실제로 들어오는 Wave 3에서 다룬다.
- `scripts/test-plugin-artifact-e2e.mjs:157-161`의 "stdout은 정확히 JSON 한 줄" 불변식 완화.
- Extension 통합 테스트(`@vscode/test-electron`) 도입.

## 현재 구현 조사 결과

- 테스트 러너는 외부 프레임워크 없이 `node --test`다. root는 `tsc -p ./ && node --test out/test/*.test.js`,
  cli는 `tsc -p ./ && node --test dist/test/*.test.js`.
- fixture는 별도 빌드 단계 없이 `cli/tsconfig.json`의 `include: ["src/**/*.ts"]`에 걸려 컴파일되고,
  테스트는 `dist/test/fixtures/*.js`를 `spawnSync`로 실행한다
  (`cli/src/test/contract.test.ts:139,163,191,211,236,256`).
- fixture는 `cli/dist/test/fixtures/*.js`로 **직접 실행**되므로 CommonJS 최상위 스크립트여야 하고,
  런타임 의존성을 가질 수 없다. 헬퍼는 같은 디렉터리의 상대 `require`로만 가져와야 한다.
- 저장소는 pnpm 10.34.5 workspace(`.`와 `cli`)다. root script는 pnpm binary가 없는 환경도 지원하려고
  내부적으로 `npm --prefix cli`를 쓴다.
- 기존 워크플로 트리거는 `pull_request`, `v*` 태그 push, `workflow_dispatch`다.
  **`main` push에는 아무 워크플로도 돌지 않는다.**
- 로컬 측정: `npm test` + `npm run cli:test` 약 5초, `npm run test:plugin-artifact` 약 19초.
  E2E는 임시 디렉터리에 새 npm cache를 만들어 tarball 의존성(typescript, typescript-language-server)을
  실제로 내려받으므로 **네트워크가 필요하다.**

## 단계별 구현 계획

### 1단계 — CI에서 단위 테스트를 실행한다

- 단위 테스트 전용 워크플로를 추가하고 `npm test`와 `npm run cli:test`를 각각 별도 step으로 돌린다.
- `npm run test:all`이 실제로 전체를 의미하게 만든다.

### 2단계 — mock LSP fixture 인프라를 만든다

- `cli/src/test/fixtures/mockServer.ts`에 프레임 파서와 송신 헬퍼를 추출한다.
- 기존 fixture 4개를 헬퍼 위에서 재작성하되 관측 가능한 동작을 그대로 유지한다.
- server→client request를 보내는 능력을 헬퍼에 추가하고 그것을 쓰는 fixture를 준비한다.

## 테스트 및 완료 기준

- [ ] 1단계: 새 워크플로가 PR에서 실행되고 `npm test`, `npm run cli:test`가 CI에서 통과한다.
- [x] 1단계: `npm run test:all`의 범위가 이름과 일치하고, 빠른 offline 경로가 별도 script로 남는다.
- [x] 2단계: `npm run cli:test`가 리팩터링 전후로 동일한 결과(51/51)를 낸다.
- [x] 2단계: `npm run test:plugin-artifact`가 리팩터링 전후로 동일하게 통과한다.
- [x] 2단계: 새 헬퍼와 fixture가 `tsc -p cli` 컴파일을 통과한다.
- [x] 2단계: Wave 1이 쓸 수 있도록 헬퍼 사용법이 이 문서에 기록된다.

## 작업 로그

### 기준선 측정 (변경 전)

리팩터링이 관측 동작을 바꾸지 않았음을 증명하려면 먼저 기준선이 필요하다. `main`과 동일한 commit
(`19a10b0`)에서 측정했다.

- `pnpm install --frozen-lockfile`: 성공 (pnpm 10.34.5, Node v25.8.1)
- `npm test`: **34/34 통과**, duration 191ms
- `npm run cli:test`: **51/51 통과**, duration 4307ms
- `npm run test:plugin-artifact`: **통과** — `clean install and Codex/Claude TS/TSX/JS/JSX release fallback`,
  실제 소요 18.6초

이 세 수치가 2단계 리팩터링의 before/after 비교 기준이다.

### 1단계 — CI에서 단위 테스트를 실행한다

#### 변경한 파일

- `.github/workflows/unit-tests.yml` (신규): `npm test`와 `npm run cli:test`를 CI에서 실행한다.
- `package.json` (`scripts`): `test:unit`을 추가하고 `test:all`이 `test:plugin-artifact`까지 포함하게 했다.

```jsonc
"test:unit": "npm test && npm run cli:test",
"test:all": "npm run test:unit && npm run test:plugin-artifact"
```

#### 결정 1: 기존 워크플로에 job을 추가하지 않고 새 파일을 만들었다

`plugin-artifact-e2e.yml`에 `unit` job을 추가할 수도 있었지만 별도 파일을 선택했다.

- **check 이름의 의미가 유지된다.** 워크플로 이름이 PR check 이름의 접두사가 된다.
  `Plugin artifact E2E / Node 22 / ubuntu-latest`라는 check가 사실은 단위 테스트라면, 실패했을 때
  packaging 회귀인지 로직 회귀인지 이름만 보고 구분할 수 없다. 두 종류의 회귀가 같은 check 이름을
  공유하지 않게 하는 것이 이 lane의 목적(안전망의 신호 품질)에 직접 부합한다.
- **실행 형태가 다르다.** E2E는 3-OS matrix에 15분 timeout이고, 단위 테스트는 단일 OS에 10분 timeout이다.
  같은 파일에 두면 matrix가 job-level이라 동작은 하지만, 파일 하나가 성격이 다른 두 gate를 담게 된다.
- **트리거를 독립적으로 조정할 수 있다.** 아래 결정 2에서 단위 테스트만 `main` push에 추가했다.
  같은 파일이었다면 3-OS E2E까지 main push마다 돌거나, 하나의 파일 안에서 job마다 트리거가 다른
  (`if:` 조건을 쓰는) 복잡한 구성이 필요했다.
- **필수 check와 재실행을 따로 다룰 수 있다.** branch protection에서 빠른 단위 테스트만 필수로 걸고,
  네트워크 의존적인 E2E는 별도로 재실행하는 운영이 가능하다.

#### 결정 2: 단위 테스트만 `main` push를 추가했다

조사대로 현재 `main` push에는 **아무 워크플로도 실행되지 않는다.** PR check만 있고 merge 후 main
자체를 검증하는 것이 없다.

M1은 여러 lane이 동시에 각자 PR을 열고 순차 merge하는 구조다. 각 PR이 자기 head에서 green이어도,
서로 다른 PR이 넓힌 타입 계약이 main에서 처음 만나는 순간(semantic conflict)은 아무도 검증하지 않는다.
merge 직후 1분 안에 그걸 잡는 것이 이 lane이 닫으려는 구멍과 같은 종류다.

단위 테스트는 단일 OS 1 job이라 비용이 거의 없어 추가했다. 반면 `plugin-artifact-e2e.yml`의 트리거는
**건드리지 않았다.** 3-OS × 15분 timeout에 실제 네트워크 설치를 하는 gate를 main push마다 돌리는 것은
비용 대비 이득이 낮고, packaging 회귀는 이미 `v*` 태그 push에서 release 직전에 걸린다.

나머지 트리거(`pull_request`, `v*` 태그 push, `workflow_dispatch`)는 기존 워크플로와 맞췄다.

#### 결정 3: `test:all`을 진짜 "전체"로 만들고 `test:unit`을 추가했다

`test:all`이 `test:plugin-artifact`를 포함하지 않는 것은 이름과 어긋난다. 두 선택지 중 포함시키는 쪽을
택했다.

- **비용이 예상만큼 크지 않다.** 로컬 측정으로 `test:unit` 약 5초, `test:all` 전체 **24.9초**다.
  "크게 늘어난다"고 할 수준이 아니다.
- **이름을 바꾸는 선택지는 이 lane의 소유 경로 밖을 고쳐야 한다.** `test:all`은 `README.md:258`과
  `docs/DEVELOPMENT.md:51,130`에서 표준 검증 명령으로 안내되고 있고, 특히 `DEVELOPMENT.md:126`은
  그것을 "Agent CLI까지 포함한 전체 검증"이라고 설명한다. `test:all`을 제거하거나 이름을 바꾸면 그
  문서들이 깨지는데, 이 lane은 `README.md`와 `docs/DEVELOPMENT.md`를 수정하지 않는다. 반대로
  범위를 넓히는 쪽은 기존 문서 문장을 **더 참으로** 만들 뿐이라 문서 수정 없이 정합적이다.
- **빠른 경로는 `test:unit`으로 남겼다.** `test:plugin-artifact`는 임시 npm cache에 tarball 의존성을
  실제로 내려받으므로 **네트워크가 필요하다.** offline이거나 tight loop을 도는 동안에는
  `npm run test:unit`을 쓰면 된다. CI는 `test:all`을 쓰지 않고 job을 나눠 실행하므로 CI 시간에는
  영향이 없다.

#### 실행한 검증

- `npm run test:unit`: Extension **34/34**, CLI **51/51** 통과.
- `npm run test:all`: Extension 34/34, CLI 51/51, 그리고
  `Plugin artifact E2E passed: clean install and Codex/Claude TS/TSX/JS/JSX release fallback.`
  전체 **24.9초**.
- 두 워크플로 파일을 `yaml.safe_load`로 파싱해 문법과 job 구조를 확인했다.
- `node -e "JSON.parse(...)"`로 `package.json`이 유효한 JSON임을 확인했다.

### 2단계 — mock LSP fixture 인프라를 만든다

#### 변경한 파일

- `cli/src/test/fixtures/mockServer.ts` (신규, 약 145줄): Content-Length 프레임 파서와 송신 헬퍼.
- `cli/src/test/fixtures/loggingExitServer.ts`: 41줄 → 11줄
- `cli/src/test/fixtures/noCapabilityServer.ts`: 37줄 → 8줄
- `cli/src/test/fixtures/queryExitServer.ts`: 42줄 → 14줄
- `cli/src/test/fixtures/parentWatchdogServer.ts`: 60줄 → 29줄
- `cli/src/test/fixtures/configurationRequestServer.ts` (신규): server→client `workspace/configuration`
- `cli/src/test/fixtures/registerCapabilityServer.ts` (신규): server→client `client/registerCapability`

`exitingServer.ts`(5줄)와 `silentExitServer.ts`(3줄)는 프레임 파서가 없어 그대로 두었다. 헬퍼를 끼우면
오히려 길어진다.

#### 헬퍼 설계에서 지킨 제약

- **런타임 의존성 없음.** fixture는 `node dist/test/fixtures/<name>.js`로 직접 실행되므로 Node
  built-in과 같은 디렉터리의 상대 `require` 외에는 아무것도 쓸 수 없다.
- **관측 동작 보존.** `process.exit(2)`(Content-Length 없는 frame), 미완성 frame에서의 `return`,
  `Content-Length: N\r\n\r\n`과 body를 **두 번의 `process.stdout.write`로 나눠 쓰는 것**,
  `JSON.stringify` 키 순서(`jsonrpc, id, result` / `jsonrpc, method, params`)까지 원본과 같게 유지했다.
  `JSON.parse` 실패를 잡지 않는 것도 원본과 같다.
- **server request id는 client id와 겹치지 않는 대역을 쓴다.** `JsonRpcClient.nextId`가 1부터 올라가므로
  server request id를 1부터 매기면, client가 자기 pending `initialize`(id 1)를 server request와
  혼동해 잘못 resolve할 수 있다. 그러면 테스트가 진짜 결함이 아니라 id 충돌을 재현하게 된다.
  `SERVER_REQUEST_ID_BASE = 1000`으로 대역을 분리했다.
- **응답 라우팅.** `id`가 있고 `method`가 없는 메시지가 pending server request와 맞으면 그 request의
  `onResponse`로 보내고 fixture handler에는 전달하지 않는다. 기존 fixture는 pending이 항상 비어 있으므로
  이 분기가 동작을 바꾸지 않는다.

#### 헬퍼 API (Wave 1 `il-lsp-protocol` lane 사용법)

```ts
import { notify, pendingRequestCount, request, respond, respondWithError, serve, timeoutFromEnv }
  from './mockServer';

serve(message => { /* message: { id?, method?, params?, result?, error? } */ });

respond(id, result);                 // client request에 응답
respondWithError(id, code, message); // client request를 error로 실패시킴
notify(method, params);              // client가 응답하지 않는 server notification

// server -> client request. 반환값은 할당된 id (1000부터).
request('workspace/configuration', { items: [{ section: 'impactLens' }] }, {
  timeoutMs: 2000,
  onResponse: response => { /* response.result 사용 */ },
  onTimeout: () => { /* 종료하거나 상태를 보고 */ },
});

pendingRequestCount();                       // 아직 답을 못 받은 server request 수
timeoutFromEnv('IMPACT_LENS_...', 2000);     // 테스트가 env로 시간 예산을 조일 수 있게
```

##### `configurationRequestServer.ts`

initialize 단계에서 `workspace/configuration`을 묻고 답을 받기 전에는 진행하지 않는다.

| env | 값 | 의미 |
| --- | --- | --- |
| `IMPACT_LENS_MOCK_CONFIG_PHASE` | `before-initialize-response` (기본) | initialize 결과를 **보류**하고 먼저 물어본다. client는 initialize를 기다리고 server는 client 답을 기다리는 교착. |
| | `after-initialize-response` | initialize에 먼저 응답한 뒤 물어본다. handshake가 끝났다고 믿는 client에게 request가 도착한다. |
| `IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS` | 기본 `2000` | 이 시간 안에 답이 없으면 stderr에 진단을 쓰고 exit 1. |

답을 받으면 `window/logMessage`로 받은 설정을 남기고, 이후 `textDocument/prepareCallHierarchy`에 `[]`,
`shutdown`에 `null`, `exit`에 exit 0으로 정상 lifecycle을 마친다.

##### `registerCapabilityServer.ts`

`initialized` notification을 받은 뒤 `client/registerCapability`를 보낸다. 답을 받으면
`window/logMessage`로 `client/registerCapability acknowledged`를 남기고, 답이 없으면 기본적으로
`window/logMessage`(type 1)로 `pending=` 개수를 보고하되 분석은 계속 진행한다.
`IMPACT_LENS_MOCK_REQUIRE_REGISTRATION=1`을 주면 무응답을 stderr + exit 1로 치명적으로 만든다.
교착이 아니라 **응답 여부 자체**를 단언하고 싶을 때 쓰는 fixture다.

#### 이 단계에서 테스트를 추가하지 않은 이유

현재 `cli/src/jsonRpc.ts:179`는 pending에 없는 id를 조용히 버리므로 server request에 절대 응답하지 않는다.
새 fixture를 쓰는 테스트를 지금 추가하면 반드시 실패한다. 헬퍼와 fixture만 준비하고 테스트는 결함을
고치는 lane이 함께 작성한다.

다만 결함이 실제로 재현되는지는 확인했다. 빌드된 CLI를 `configurationRequestServer`에 직접 물려보면
다음 envelope이 나온다 (`IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS=1500`, 수동 실행, 테스트 파일 아님).

```json
{"code":"provider_initialize_failed","message":"Language Server node failed during initialize (exit code 1).",
 "details":{"stage":"initialize","exitCode":1,"msSinceSpawn":1584,"bytesFromServer":131,"requestsSent":1,
 "stderr":"configuration-request-server: no client answer to workspace/configuration within 1500ms"}}
```

`bytesFromServer: 131`은 server request가 client에 **도달했다는** 증거이고, stderr 한 줄은 client가
그것에 **응답하지 않았다는** 증거다. Wave 1이 잡아야 할 회귀가 정확히 이 형태다.
`registerCapabilityServer`는 관대 모드에서 분석이 계속 진행되어 `target_not_found`(exit 3)로 끝난다.

#### 실행한 검증

**1. 관측 동작 동일성 (differential 비교).**
리팩터링 전(`main`) fixture와 리팩터링 후 fixture를 **바이트 단위로 같은 stdin 스트림**으로 구동해
stdout 바이트, stderr 바이트, exit code, signal을 전부 비교했다. 16개 시나리오 전부 동일했다.

| fixture | 시나리오 | 결과 |
| --- | --- | --- |
| `loggingExitServer` | initialize / frame 3분할 / 잘못된 header / notification only | exit 1(315B), exit 1(315B), exit 2, exit 0 — 모두 동일 |
| `noCapabilityServer` | initialize / 잘못된 header / 한 chunk에 frame 2개 / id 없는 initialize | exit 0(136B), exit 2, exit 0(272B), exit 0(0B) — 모두 동일 |
| `queryExitServer` | initialize→didOpen / didOpen 먼저 / 잘못된 header | exit 1 + `query failed after didOpen`, exit 1 + 동일 stderr, exit 2 — 모두 동일 |
| `parentWatchdogServer` | processId 없는 전체 lifecycle / processId 전달 / 한 chunk에 전체 / 모르는 method / 잘못된 header | exit 0(280B), exit 1(0B), exit 0(280B), exit 0(0B), exit 2 — 모두 동일 |

frame 분할과 한 chunk 다중 frame 시나리오를 넣은 이유는 추출한 파서가 부분 수신과 batch 수신을
원본과 똑같이 다루는지가 이 리팩터링의 유일한 실질 위험이기 때문이다.

**2. 기존 테스트 결과 동일성.**

| 검증 | 리팩터링 전 | 리팩터링 후 |
| --- | --- | --- |
| `npm test` | 34/34 | **34/34** |
| `npm run cli:test` | 51/51 | **51/51** |
| `npm run test:plugin-artifact` | 통과 | **통과** (동일 메시지) |

`cli/package.json`의 `files`가 `dist/*.js`라 `dist/test/**`는 tarball에 들어가지 않는다. 새 fixture가
패키징 결과를 늘리지 않는 것을 E2E 통과로 확인했다.

**3. 새 fixture 동작 확인.** 7개 시나리오를 수동 구동해 문서화한 대로 동작함을 확인했다.

| fixture | 조건 | 결과 |
| --- | --- | --- |
| `configurationRequestServer` | phase=before, client 응답 | `workspace/configuration id=1000` → logMessage → initialize 응답 |
| | phase=before, client 침묵 | exit 1, stderr 한 줄 (initialize 응답 없음) |
| | phase=after, client 응답 | initialize 응답 → request → logMessage |
| | phase=after, client 침묵 | exit 1, stderr 한 줄 |
| `registerCapabilityServer` | client 응답 | `client/registerCapability id=1000` → `acknowledged` logMessage |
| | client 침묵, 기본 | exit 없이 진행, type 1 logMessage로 `pending=` 보고 |
| | client 침묵, `REQUIRE_REGISTRATION=1` | exit 1, stderr 한 줄 |

#### 남은 작업

- Wave 1 `il-lsp-protocol`: `jsonRpc.ts`가 server request에 응답하도록 고치고, 위 두 fixture를 쓰는
  테스트를 `cli/src/test/contract.test.ts`에 추가한다.
- 단위 테스트 워크플로는 현재 `ubuntu-latest` 단일 OS다. Windows에서만 깨지는 단위 테스트(경로 구분자,
  symlink 권한)가 나오면 그때 matrix로 넓힌다. packaged artifact 경로는 이미 3-OS로 덮여 있다.
