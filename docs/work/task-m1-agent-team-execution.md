# M1 마일스톤 Agent Team 실행 계획

- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 완료 소유 story: `IL-LIM-005`, `IL-LIM-009`
- 선행 기여 story: `IL-LIM-004` 1~2단계
- 작성일: 2026-08-27
- 상태: Planned (구현 미착수)

## 배경과 해결할 문제

M0의 자동 종료 gate는 모두 충족됐고 남은 항목은 실제 사용자 검증 하나다. M1의 진입 조건인
"packed bundled provider와 Plugin cache E2E 통과"는 이미 `v0.6.x` release로 만족하므로 M1 구현은
지금 착수할 수 있다.

M1은 한 사람이 순차로 진행하기에는 변경 표면이 넓다. 조사 결과 M1은 서로 다른 4개 계층
(CLI protocol, CLI provider platform, VS Code Extension, Plugin/문서/CI)을 동시에 건드리고,
각 계층은 공통 타입·스키마 계약 하나를 공유한다. 계약을 먼저 고정하지 않고 병렬로 착수하면
같은 파일에서 충돌하거나, 서로 다른 상태 어휘를 구현해 재작업이 발생한다.

이 문서는 M1을 Agent Team으로 실행하기 위한 역할 분담, 파일 소유권, wave 순서와 gate를 정의한다.
개별 구현 계획과 작업 로그는 각 wave가 자신의 `docs/work/<task>.md`에 별도로 작성한다.

## 범위

- M1 구현을 wave와 lane으로 분해하고 각 lane의 파일 소유권을 확정한다.
- Agent Team 역할(`.claude/agents/*.md`)과 협업 규칙을 정의한다.
- wave별 진입 조건, 종료 gate, 검증 명령과 PR 경계를 정의한다.
- M1 착수 전에 반드시 사람이 결정해야 할 항목을 명시한다.

## 범위에서 제외할 항목

- M1 기능의 실제 구현, 커밋과 릴리스
- M0 사용자 테스트 실행(별도 승인 사항)
- Python/Go/C/C++/Swift/Kotlin을 verified support로 선언(M2 이후)
- 동적 호출·DI·framework edge 추론(M4)
- 이 문서에서 새 story를 만들거나 기존 story의 우선순위를 변경하는 일

## 현재 구현 조사 결과

세 개의 조사 lane(스토리 계약 / CLI provider 계층 / host·릴리스 계층)에서 확인한 사실이다.
근거는 조사 시점의 `main`(`19a10b0`) 기준이다.

### 1. CLI protocol 계층 — 단방향 JSON-RPC

- `cli/src/jsonRpc.ts:179`의 `handle()`은 `id` 유무로만 분기한다. `id`와 `method`가 함께 온
  server→client request는 pending 테이블 조회로 빠지거나 조용히 폐기되고, 응답을 보내는 함수 자체가 없다.
- server request의 id가 client `nextId`(`cli/src/jsonRpc.ts:26`)와 같은 네임스페이스라
  서버가 `id: 1` request를 보내면 client의 `initialize` pending을 잘못 resolve할 수 있다.
- `dynamicRegistration: false`(`cli/src/lspProvider.ts:187`), `$/progress` 미구현,
  `initializationOptions`는 `{}` 하드코딩(`cli/src/lspProvider.ts:192`), `workspace/configuration` 응답 불가.
- 결과적으로 `workspace/configuration`을 요구하는 서버는 프로토콜 위반이 아니라
  **타임아웃 또는 `provider_initialize_failed`로 위장**되어 관측된다.
- `$/cancelRequest` 미전송. per-request 타임아웃(`cli/src/jsonRpc.ts:92-101`)만 있고 분석 전체 예산은 없다.
- 진단 수집 대기가 고정 100ms(`cli/src/lspProvider.ts:147`)라 느린 서버의 진단은 통째로 누락된다.

### 2. CLI provider 선택·doctor — bundled 하드코딩

- provider 선택은 삼항 연산자 두 줄(`cli/src/lspProvider.ts:63-64`)이다. preset catalog, PATH 탐색,
  설정 파일 병합이 전부 없다.
- bundled은 TS 계열 4종만 허용하고 그 외는 `provider_required_for_language`
  (`cli/src/lspProvider.ts:312-327`)로 즉시 종료한다. 타 언어 fallback 금지 규칙 자체는 이미 지켜지고 있다.
- doctor 서브커맨드는 `doctor bundled-typescript` 하나뿐이고(`cli/src/index.ts:202-204`),
  모든 check의 `status`가 `'pass'` 리터럴 고정(`cli/src/doctor.ts:4-47`)이라 부분 실패를 보고할 수 없다.
  첫 실패는 예외로 전체를 중단시킨다.

### 3. 상태 계약 — 스키마와 코드가 이미 드리프트

- `coverage.semantic.status`는 `'static-only'`, `coverage.indexing.status`는 `'unknown'` 하드코딩이다
  (`cli/src/coverage.ts:17-18`). 실측되는 값은 `traversal.status` 하나뿐이다.
- `cli/schemas/response.schema.json`과 `cli/src/types.ts` 사이에 확인된 드리프트 3건이 있다.
  `selectedBy` 6 vs 2, `traversal.status` 5 vs 3, `host` 2 vs 1.
- `schemaVersion: 1`은 공유 상수가 아니라 `cli/src/index.ts:103`과 `:122`의 리터럴 2개다.
- 실제 CLI 응답을 스키마에 대조하는 테스트가 없다. `cli/src/test/schema.test.ts`는 스키마 JSON에
  특정 문자열이 있는지만 확인한다.
- `CliError.code`가 자유 문자열(`cli/src/types.ts:201-211`)이라 오타가 컴파일에 잡히지 않는다.

### 4. Extension — CLI와 코드를 공유하지 않는 병렬 구현

- `src/*.ts` 전체에 CLI 호출이 없다. 분석 경로는 `vscode.prepareCallHierarchy` →
  `vscode.provideIncomingCalls`(`src/impactAnalyzer.ts:22,64`) 하나뿐이다.
- coverage 계약은 `src/coverage.ts`와 `cli/src/coverage.ts`에 **손으로 맞춰둔 두 벌의 상수**다.
- `src/types.ts:9-46`이 리터럴 타입으로 좁혀져 있어(`selectedBy: 'vscode'`, `indexing.status: 'unknown'` 등)
  새 상태값을 도입하면 UI 변경 이전에 타입 에러로 먼저 막힌다.
- provider 관련 `contributes.configuration` 항목이 하나도 없다(`package.json:113-167`).
- `stateLabel()`이 `src/impactTreeProvider.ts:176-190`과 `src/graphPanel.ts:588-594`에 중복 구현돼 있다.
- `semantic`을 노출하는 UI 지점은 graph state pill의 `title`(`src/graphPanel.ts:297-303`) 하나뿐이다.

### 5. Plugin·CI

- Plugin 문서는 `bundled | custom` 이분법만 설명한다. `Auto`, preset, 언어별 설치 안내가 없고,
  `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:126-128`의
  "provider 없으면 비-TS/JS는 무조건 에러"는 Auto 도입 시 정반대 명제가 된다.
- `scripts/test-plugin-artifact-e2e.mjs:125-126`이 `provider.selectedBy === 'bundled'`와
  `complete === true`를 하드 assert한다. **Auto/preset 도입 즉시 E2E가 실패한다.**
- CI 워크플로가 `plugin-artifact-e2e.yml` 하나뿐이라 `npm test`(Extension 단위 10개)와
  `cli:test`가 **어떤 워크플로에서도 실행되지 않는다.** 타입 계약을 넓히는 M1에서 실질적 위험이다.

### 6. 스토리 간 의존과 미결 충돌

- 착수 순서: `IL-LIM-005` 1단계(독립) → `005` 2단계 ∥ `004` 1단계(manifest의 settings/readiness 필드가
  상호 의존) → `009` 1·2단계 → `004` 2단계 doctor → `005` 3단계 readiness → `009` 3·4단계.
- **용어 충돌 2건이 미해결이며 다른 모든 작업의 선행 조건이다.**
  1. traversal: 계약의 `complete` vs `IL-LIM-009` 제안 `exhausted` (+ `cancelled`/`unknown` 신규)
  2. semantic: 계약의 `static-only`/`augmented` vs `IL-LIM-009` 제안
     `provider-static`/`static-plus-inference`/`static-plus-observation`
- 계약 문서에 `indexing` stage에 대응하는 error code가 없다. `005`의 `not_ready`,
  `provider_protocol_incompatible`, `004` 2단계의 missing executable/unsupported version/fixture 실패 코드가
  모두 미등재다.

## Agent Team 구성

### 역할

`.claude/agents/`에 프로젝트 scope로 정의한다. 각 역할은 자신의 소유 파일 밖을 수정하지 않는다.

| 역할 | 담당 | 주 소유 경로 |
| --- | --- | --- |
| `il-contract-architect` | 상태 truth table, 타입·스키마 계약, error taxonomy | `cli/src/types.ts`, `cli/src/errors.ts`, `cli/schemas/**`, `src/types.ts`, `docs/development-management/provider-coverage-contract.md` |
| `il-lsp-protocol` | 양방향 JSON-RPC, cancellation, progress, readiness | `cli/src/jsonRpc.ts`, `cli/src/lsp/**`, `cli/src/lspProvider.ts` |
| `il-provider-platform` | preset catalog, 선택 우선순위, discovery, doctor | `cli/src/providers/**`, `cli/src/doctor/**`, `cli/src/runtime.ts` |
| `il-host-ux` | Extension UI, 설정, doctor 진입점 | `src/**`(types 제외), `package.json` contributes |
| `il-plugin-docs` | skill·slash command·contract 문서, README/INSTALL | `plugins/**`, `.claude-plugin/**`, `.agents/**`, `README.md`, `INSTALL.md` |
| `il-test-release` | CI, mock fixture 인프라, artifact E2E | `.github/**`, `scripts/**`, `cli/src/test/fixtures/**` |
| `il-reviewer` | 적대적 검토 전담. **구현 금지** | 없음(읽기 전용) |

`il-reviewer`는 어떤 PR도 직접 수정하지 않고, 발견 사항을 lead에게 반환한다.
사용자 테스트 명세 검토는 `docs/development-management/milestones/user-validation-planning.md`의
"구현자가 아닌 검토자" 규칙에 따라 반드시 `il-reviewer`가 수행한다.

### 협업 규칙

1. 모든 구현 에이전트는 `isolation: "worktree"`로 실행해 서로의 working tree를 침범하지 않는다.
2. 에이전트는 `main`/`master`를 절대 수정하지 않고, 자신의 lane 전용 branch에서만 작업한다.
   branch 이름은 아래 wave 표의 값을 사용한다.
3. **한 wave 안에서 두 에이전트가 같은 파일을 수정하지 않는다.** 소유권이 겹치는 변경은
   wave를 나눠 직렬화한다.
4. 계약(타입·스키마·error code·상태 어휘) 변경은 `il-contract-architect`만 제안하고 lead가 승인한다.
   다른 에이전트는 계약 변경이 필요하면 직접 수정하지 않고 lead에게 보고한다.
5. 에이전트 간 직접 협상을 하지 않는다. 모든 조정은 lead를 경유한다.
6. 각 에이전트는 `AGENTS.md`의 stage gate를 그대로 따른다. 단계 종료 시 검증 → 작업 문서 갱신 →
   독립 commit → 동일 이름 원격 branch push를 모두 마쳐야 다음 단계로 간다.
7. PR 생성까지는 에이전트가 수행하고, `main` merge는 lead가 `il-reviewer` 검토 후 결정한다.
8. 자동 설치·build·sync를 milestone 완료 수단으로 사용하지 않는다.

## 단계별 구현 계획

각 wave의 최상위 단계는 독립적으로 검증·commit·push·PR 가능한 단위다.

### Wave 0 — 계약 확정과 안전망 (직렬 gate)

M1의 모든 후속 작업이 이 wave의 산출물 위에서 진행된다. 동작 변경 없이 계약과 검증 기반만 만든다.

| lane | 에이전트 | branch | 내용 |
| --- | --- | --- | --- |
| W0-1 | `il-contract-architect` | `docs/m1-state-truth-table` | `IL-LIM-009` 1단계 truth table 작성, 용어 충돌 2건 결정안 제시, `provider-coverage-contract.md`에 `indexing`/`not_ready`/`protocol_incompatible`/preset discovery error code 추가 |
| W0-2 | `il-test-release` | `test/m1-ci-safety-net` | `npm test`와 `cli:test`를 CI에서 실행, mock LSP fixture의 중복 프레임 파서를 `cli/src/test/fixtures/mockServer.ts` 공용 헬퍼로 추출 |

W0-1과 W0-2는 파일이 겹치지 않으므로 병렬 실행한다.

| lane | 에이전트 | branch | 내용 |
| --- | --- | --- | --- |
| W0-3 | `il-contract-architect` | `refactor/m1-contract-types` | W0-1 결정을 타입·스키마에 반영. 드리프트 3건 해소, `selectedBy`/`traversal`/`semantic` union 확정, `cli/src/errors.ts` 중앙화, `schemaVersion` 상수화, 실제 응답을 `response.schema.json`에 대조하는 계약 테스트 추가, `src/types.ts:9-46` 리터럴 타입 해제 |
| W0-4 | `il-provider-platform` | `refactor/m1-provider-seam` | `cli/src/lspProvider.ts:63-64`의 선택 로직을 `cli/src/providers/resolve.ts`로 **순수 이동**. `cli/src/coverage.ts`의 상수 3개를 인자로 파라미터화(값은 동일). 동작·응답 무변경 |

W0-3은 W0-1 merge 후, W0-4는 W0-3 merge 후 착수한다. W0-4가 끝나면 Wave 1의
`il-lsp-protocol`(`lspProvider.ts`)과 `il-provider-platform`(`providers/`)이 파일 단위로 완전히 분리된다.

**Wave 0 종료 gate**
- [ ] 용어 결정 2건이 문서로 확정되고 lead 승인이 기록된다.
- [ ] CI에서 `npm test`, `cli:test`, `test:plugin-artifact`가 모두 실행되고 녹색이다.
- [ ] 스키마-코드 드리프트 3건이 계약 테스트로 재발 방지된다.
- [ ] W0-3, W0-4 전후로 `test:plugin-artifact` 결과가 동일하다(무변경 증명).

### Wave 1 — 코어 구현 (3 lane 병렬)

| lane | 에이전트 | branch | story 단계 | 내용 |
| --- | --- | --- | --- | --- |
| W1-A | `il-lsp-protocol` | `feat/m1-bidirectional-lsp` | `IL-LIM-005` 1·2단계 | server→client request 디스패치와 응답 전송, server request id 네임스페이스 분리, `$/cancelRequest`, `workspace/configuration`·`client/registerCapability`·`window/workDoneProgress/create` 처리, `initializationOptions`/`settings` 주입 경로와 secret redaction |
| W1-B | `il-provider-platform` | `feat/m1-preset-catalog` | `IL-LIM-004` 1·2단계 | `ProviderPreset` 타입과 catalog 형식, 선택 우선순위 `custom > explicit preset > trusted project > verified auto > unsupported`, shell 미사용 PATH discovery, version probe, `doctor <preset>` 일반화와 check 단위 `pass/warn/fail` |
| W1-C | `il-contract-architect` | `feat/m1-completeness-emit` | `IL-LIM-009` 2단계 | truth table의 상태를 CLI 응답이 실제로 생성하도록 `cli/src/coverage.ts`·`cli/src/impact.ts` 연결, `completion`과 structured `limitationDetails` additive 필드, 기존 `complete`/`truncated`/`limitations`를 projection으로 유지 |

세 lane은 W0-4 이후 서로 다른 파일을 소유한다. W1-A는 `jsonRpc.ts`+`lsp/`+`lspProvider.ts`,
W1-B는 `providers/`+`doctor/`+`runtime.ts`, W1-C는 `coverage.ts`+`impact.ts`+스키마다.

**교차 의존 처리**
- W1-B의 preset manifest에 들어갈 `initializationOptions`/`settings`/readiness 필드 형태는
  W1-A의 2단계 계약과 상호 의존한다. 두 lane은 **착수 전에 lead 주재로 필드 형태를 먼저 합의**하고,
  합의 결과를 W1-B가 manifest 타입으로 확정한다.
- W1-C는 `indexing` 실측값을 아직 만들지 않는다. Wave 2까지 `unknown`을 유지하되,
  `ready`/`working`/`not_ready`를 받을 수 있는 경로만 열어둔다.

**Wave 1 종료 gate**
- [ ] server request를 보내는 mock fixture에서 client가 응답하고 initialize가 완료된다.
- [ ] 설정을 요구하는 mock server가 기대한 설정을 받고 초기화된다.
- [ ] 민감 값이 stdout·stderr 어디에도 노출되지 않는다.
- [ ] missing executable / unsupported version / language mismatch / missing capability / fixture 실패가
      doctor에서 서로 구분된다.
- [ ] TypeScript reference preset이 기존 bundled 동작·결과와 호환된다.
- [ ] 기존 JSON fixture와 새 상태 fixture가 동시에 통과한다.

### Wave 2 — 통합과 UX (2 lane 병렬 + 1 직렬)

| lane | 에이전트 | branch | story 단계 | 내용 |
| --- | --- | --- | --- | --- |
| W2-A | `il-lsp-protocol` | `feat/m1-provider-readiness` | `IL-LIM-005` 3단계 | static/dynamic registration을 단일 observed state로 병합, `$/progress` token 추적, preset별 readiness probe와 max wait budget, `not_ready`와 실제 empty graph 구분, `coverage.indexing.status` 실측화 |
| W2-B | `il-host-ux` | `feat/m1-extension-completeness-ux` | `IL-LIM-009` 3단계 | header를 결과 수 → traversal → semantic scope → action 순으로 재구성, empty state를 "caller 없음 / provider 없음 / 부분 결과"로 분리, 중복 `stateLabel()` 통합, `.state.partial` 표현 추가, provider 설정 항목과 doctor 실행 명령 추가 |

W2-A는 CLI만, W2-B는 Extension만 수정하므로 병렬 가능하다.

| lane | 에이전트 | branch | story 단계 | 내용 |
| --- | --- | --- | --- | --- |
| W2-C | `il-plugin-docs` | `docs/m1-plugin-auto-contract` | `IL-LIM-009` 4단계 | skill·slash command·`cli-contract.md`를 Auto/preset 계약으로 갱신, 고정 summary template과 금지 문구, `complete: true` 단독으로 "영향 없음" 결론을 내면 **실패시키는 eval** 추가 |

W2-C는 W1-B와 W2-A의 사용자 노출 문구가 고정된 뒤 착수한다.

**Wave 2 종료 gate**
- [ ] delayed-index mock에서 premature empty를 성공으로 확정하지 않는다.
- [ ] Extension에서 empty와 incomplete가 문구만으로 구분된다.
- [ ] Codex와 Claude Code 대표 prompt가 동일한 completeness 경계를 전달한다.
- [ ] `complete: true`만으로 runtime 영향 없음이나 indexing 완료를 주장하지 않는 fixture가 통과한다.

### Wave 3 — 검증과 release candidate

| lane | 에이전트 | branch | 내용 |
| --- | --- | --- | --- |
| W3-A | `il-test-release` | `test/m1-compatibility-matrix` | `IL-LIM-005` 3단계 검증. bundled/custom/mock provider의 capability·timeout·indexing unknown·partial 결과 matrix, `scripts/test-plugin-artifact-e2e.mjs:125-126`의 `selectedBy`·`complete` assert를 새 계약에 맞게 갱신, CI matrix에 mock provider case 추가 |
| W3-B | `il-contract-architect` | `docs/m1-user-test-spec` | `user-tests/m1-user-test-spec.md` 작성. Auto 시작, doctor 안내만으로 missing/unsupported 복구, custom 전환, `complete`의 정적 범위 해석을 검증하도록 설계 |
| W3-C | `il-reviewer` | — | W3-B 명세의 재현성·안전성·편향 검토. 구현자가 아닌 검토자 규칙 적용 |

**중요**: `scripts/test-plugin-artifact-e2e.mjs:125`의 `provider.selectedBy === 'bundled'` assert는
W1-B가 Auto/preset을 도입하는 순간 실패한다. W1-B PR과 W3-A의 assert 갱신은 **같은 PR 또는 연속 PR로
묶어 CI가 빨간 상태로 머물지 않게 한다.**

**Wave 3 종료 gate = M1 종료 gate**
- [ ] `IL-LIM-005`와 `IL-LIM-009`의 수용 기준이 모두 통과한다.
- [ ] custom provider 요청과 기존 provider JSON이 하위 호환으로 동작한다.
- [ ] Auto가 검증되지 않은 server를 임의 선택하거나 다른 언어 provider로 fallback하지 않는다.
- [ ] build/configure/sync가 사용자 승인 없이 실행되지 않는다.
- [ ] `user-tests/m1-user-test-spec.md`가 release candidate 기준으로 검토됐고, 실제 사용자 검증 결과 또는
      실행 보류 사유가 release decision에 기록된다.

## 테스트 및 완료 기준

각 wave는 자기 범위에 맞는 명령을 실행하고 결과를 작업 문서에 기록한다.

| 범위 | 명령 |
| --- | --- |
| Extension 단위 | `npm test` |
| CLI 단위·통합 | `npm run cli:test` |
| 전체 단위 | `npm run test:all` |
| Plugin artifact E2E | `npm run test:plugin-artifact` |

- Wave 0 이후 모든 PR은 위 4개가 전부 CI에서 실행된 상태여야 한다.
- 검증할 수 없는 항목은 성공으로 간주하지 않고 사유와 위험을 작업 로그에 남긴다.
- milestone 완료 판정은 story checklist 개수가 아니라 완료 소유 story 2개와 공통 gate로 한다.

## 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| Extension과 CLI가 coverage 계약을 두 벌로 손수 유지해 드리프트한다 | W0-3의 계약 테스트로 양쪽 상태 어휘를 잠그고, 새 상태는 반드시 계약 문서 → 타입 → 두 구현 순서로 반영한다 |
| Auto 도입이 기존 artifact E2E assert를 깬다 | W1-B와 W3-A를 연속 PR로 묶고, 그 사이 CI 실패를 허용 상태로 문서화한다 |
| W1-A와 W1-B의 manifest 필드 상호 의존으로 재작업이 발생한다 | 착수 전 lead 주재 합의로 필드 형태를 먼저 고정한다 |
| 용어 결정 없이 additive 구현을 시작해 이름 변경 재작업이 생긴다 | Wave 0 gate 전에는 어떤 lane도 상태 필드를 추가하지 않는다 |
| 병렬 에이전트가 같은 파일을 수정해 충돌한다 | wave별 파일 소유권 표를 강제하고, 겹치면 wave를 나눈다 |
| doctor가 stdout에 진행 로그를 흘려 "stdout 한 줄" 불변식을 깬다 | W1-B는 진행 로그를 stderr로만 보내고 W3-A가 `parseEnvelope` 불변식을 회귀 테스트로 유지한다 |

## 착수 전 사람이 결정할 항목

1. **M0 사용자 검증 실행 여부와 시점.** M0의 남은 gate는 실제 사용자 검증 하나이며
   `user-validation-planning.md`상 별도 승인이 필요하다. M1 개발과 병행할지, M0 검증 완료 후
   M1을 시작할지 결정이 필요하다. M1 진입 조건 자체는 이미 충족돼 병행에 기술적 제약은 없다.
2. **용어 결정 2건.** W0-1이 안을 제시하지만 schema version 정책(v1 additive 유지 vs v2 승격)과
   함께 승인이 필요하다.
3. **Agent Team 동시 실행 규모.** 위 계획은 wave당 최대 3 lane을 가정한다.

## 작업 로그

### 2026-08-27 — 계획 수립

- 조사 lane 3개를 병렬로 실행해 스토리 계약, CLI provider 계층, host·릴리스 계층의 현재 상태를 확인했다.
- 조사 결과 M1 착수를 막는 선행 문제 4건을 확인했다.
  1. 용어 충돌 2건 미결
  2. 스키마-코드 드리프트 3건
  3. `npm test`/`cli:test`가 CI에서 전혀 실행되지 않음
  4. Auto 도입 시 즉시 깨지는 artifact E2E assert
  이 4건을 Wave 0으로 분리해 계약과 안전망을 먼저 세우는 순서로 계획을 구성했다.
- 병렬화 단위를 story가 아니라 **파일 소유권**으로 잡았다. story 기준으로 나누면
  `IL-LIM-005`와 `IL-LIM-004`가 `cli/src/lspProvider.ts`에서, `IL-LIM-009`가 `cli/src/types.ts`에서
  충돌한다. W0-4의 seam 추출을 넣은 이유가 이 충돌 제거다.
- 이 문서는 계획만 담으며 구현·커밋 대상 코드는 변경하지 않았다.
