# M1 종료 gate: provider 호환성 matrix, 하위 호환, build 미실행 증명 (W3-A / lane R1)

- 상태: 구현 완료, PR 대기(merge는 조정 세션이 진행)
- branch: `test/m1-compatibility-matrix`
- 상위 문서: [`docs/development-management/milestones/m1-provider-platform-ux.md`](../development-management/milestones/m1-provider-platform-ux.md),
  [`docs/work/task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md) (Wave 3, lane W3-A)

## 목적과 사용자 가치

M1 milestone("provider platform UX")의 구현은 이미 전부 `main`에 merge됐고 단위·통합 test는 녹색이다.
그런데 milestone 종료 gate 중 아래 세 가지는 **오늘 "됐다"는 주장만 있고, 그 주장을 재현 가능하게 증명하는
test가 없었다**:

1. custom provider 요청과 M1 이전 형태의 provider JSON이 지금도 그대로(하위 호환으로) 동작한다.
2. Impact Lens는 사용자 승인 없이 `npm install`/`build`/`git pull` 같은 build·configure·sync 동작을
   스스로 실행하지 않는다.
3. bundled/custom provider가 capability 없음, indexing unknown, partial(depth/node 제한) 같은 상태를
   실제 CLI 진입점(`analyze --stdin`)을 통해 일관되게 보고한다.

이 세 가지가 증명되지 않은 채 v0.7.0을 릴리스하면, 릴리스 노트가 "기존 사용자 설정은 안전하다", "이 도구는
당신의 프로젝트를 마음대로 빌드하지 않는다"고 말해도 그 말을 재현 가능하게 뒷받침하는 근거가 없다. 이
lane이 끝나면:

- 기존 provider 설정(예: 사내 Language Server를 raw command로 직접 지정해 온 사용자)이 이번 릴리스에서
  깨지지 않는다는 것을 CI가 매 커밋마다 재확인한다.
- CLI가 워크스페이스에 몰래 `npm install`이나 `git config` 같은 명령을 실행하지 않는다는 것을, "코드를 읽고
  그렇게 판단했다"가 아니라 소스 스캔 test로 재확인한다.
- provider 선택 경로(bundled 자동탐지/custom raw command)별로 실제 CLI 프로세스가 capability 없음,
  indexing unknown, partial 상태를 어떻게 보고하는지 한 곳에서 대조할 수 있다.

이 작업은 4개 병렬 lane(R1~R4) 중 R1이며, 제품 코드(`cli/src/*.ts`, `src/*.ts`)는 수정하지 않고 test와
작업 문서만 추가한다. R3(gate 판정 문서화)가 이 결과를 인용해 M1 종료 여부를 판정한다.

## 배경과 해결할 문제

`docs/work/task-m1-agent-team-execution.md`의 Wave 3 표는 이 lane(W3-A)의 산출물을 다음과 같이 정의한다:

> `IL-LIM-005` 3단계 검증. bundled/custom/mock provider의 capability·timeout·indexing unknown·partial
> 결과 matrix, `scripts/test-plugin-artifact-e2e.mjs:125-126`의 `selectedBy`·`complete` assert를 새
> 계약에 맞게 갱신, CI matrix에 mock provider case 추가

milestone 종료 gate 문서는 다음 3개 항목을 명시적으로 요구한다:

- "custom provider 요청과 기존 provider JSON은 하위 호환으로 동작한다."
- "build/configure/sync는 사용자 승인 없이 실행되지 않는다."
- "Auto가 검증되지 않은 server를 임의 선택하거나 다른 언어 provider로 fallback하지 않는다." (조정 세션이
  이미 커버리지를 확인함 - 아래 감사 표 참고, 이 lane은 이 축에 새 test를 추가하지 않는다)

## 범위와 범위에서 제외할 항목

**포함**:
- `cli/src/test/`에 이미 존재하는 258개 test 중 이 matrix가 요구하는 축을 실제로 덮는지 직접 재확인(감사).
- 감사에서 미충족으로 판정된 축만 새 test로 채운다.
- `scripts/test-plugin-artifact-e2e.mjs`의 `selectedBy`/`complete` 하드 assert가 실제로 새 계약과
  충돌하는지 재확인한다.
- CI(`​.github/workflows/`)가 새 test를 실제로 실행하는지 확인한다.

**제외**:
- `Auto가 다른 언어로 fallback하지 않는다` 축에 새 test를 추가하는 것. 조정 세션이 확인한 대로
  `providers.test.ts`/`contract.test.ts`/`scripts/test-plugin-artifact-e2e.mjs`가 이미 이 축을 충분히
  덮는다(아래 감사 표 참고). 이 lane은 감사 결과만 표로 남기고 새 test를 쓰지 않는다.
- 제품 코드(`cli/src/*.ts`, `src/*.ts`) 수정. 이번 조사에서 이 gate를 위반하는 실제 결함은 발견되지
  않았으므로(아래 참고) 제품 코드 변경은 필요하지 않았다.
- `user-tests/m1-user-test-spec.md` 작성 - 별도 lane(W3-B)의 책임.

## 현재 구현 조사 결과 - 커버리지 감사

`cli/src/test/`의 각 test 파일을 직접 열어 재확인했다(파일명·test 이름·정확한 assert까지 확인, 계획
세션의 초기 매핑을 그대로 신뢰하지 않았다).

### Auto fallback 금지 (조정 세션이 이미 확인, 이 lane은 새 test를 추가하지 않음)

| 근거 | 확인 |
| --- | --- |
| `cli/src/test/providers.test.ts` "an unsupported language never falls back to another language provider" | 직접 읽고 확인 |
| `cli/src/test/providers.test.ts` "a matching preset with no installed executable is not replaced by another language" | 직접 읽고 확인 |
| `cli/src/test/providers.test.ts` "an explicitly named preset is refused for a language it does not claim" | 직접 읽고 확인 |
| `cli/src/test/providers.test.ts` "two installed verified providers for one language are reported, not guessed between" | 직접 읽고 확인 |
| `cli/src/test/providers.test.ts` "the shipped catalog only claims languages that have been verified" | 직접 읽고 확인 |
| `cli/src/test/contract.test.ts` "does not launch the bundled TypeScript provider for Python" | 직접 읽고 확인 |
| `cli/src/test/contract.test.ts` "rejects an explicit languageId mismatch before launching the provider" | 직접 읽고 확인 |
| `scripts/test-plugin-artifact-e2e.mjs`의 `detectedLanguageId`/`requestedLanguageId`/`languageMatch`/`selectedBy === 'bundled'` assert (release 아티팩트 수준) | 직접 읽고 확인 - 코드 주석이 "`auto`가 여기 나오면 릴리스가 머신에 설치된 무언가에 의존하기 시작했다는 뜻이고, 그것이 이 test가 잡으려는 것"이라고 명시 |

**판정: 완전히 덮임. 새 test 없음.**

### capability / timeout / indexing unknown / partial (실제 산출물 1)

| 축 | 이미 있는 근거(직접 재확인함) | 판정 |
| --- | --- | --- |
| missing capability | `contract.test.ts` "reports missing Call Hierarchy capability instead of an empty graph" (CLI 진입점, custom raw command, `noCapabilityServer.js`) / `doctor.test.ts` "a server without Call Hierarchy is reported as a missing capability" / `readiness.integration.test.ts` "a server that advertises Call Hierarchy nowhere is still rejected" | **완전히 덮임. 새 test 없음.** bundled provider는 catalog 검증으로 capability가 보장되므로("the shipped catalog only claims languages that have been verified") capability-missing을 bundled에서 재현하는 test는 의미가 없다. |
| timeout / budget | `readiness.integration.test.ts` "a proceed-partial budget overrun...", "a fail budget overrun..." (in-process) / `providers.test.ts` "version probe stops a hanging provider at its declared budget" (버전 discovery, doctor 범위) | **CLI 진입점에서는 도달 불가능 - 새 test를 추가하지 않고 한계로 기록**. `stateReachability.integration.test.ts`가 이미 문서화한 대로, readiness `budgetMs`는 `ProviderPreset`에만 존재하고(`providers/preset.ts`), 실제 CLI 진입점(`index.ts`)은 `providerPreset`/override로만 provider를 구성하며 test 전용 `resolution.catalog` 주입 경로를 통해서만 readiness profile을 가진 preset에 도달할 수 있다. stdin JSON, CLI 인자, `.impact-lens/provider.json` 어디에도 readiness를 선언하는 필드가 없다(모두 직접 grep으로 재확인). 아래 상세 참고. |
| indexing unknown | `readiness.integration.test.ts` "a preset without a readiness profile still reports the index state as unknown" (in-process) / `stateReachability.integration.test.ts`의 `SHIPPED_CATALOG_REACHABLE` (in-process) / `schema.test.ts`의 `analyzeInFixtureWorkspace()`가 provider 필드 없이 bundled로 성공하지만 `indexingStatus`를 명시적으로 assert하지 않음 | **부분적으로만 덮임 - CLI 진입점에서 명시적 assert가 없어서 채움.** `cli/src/test/providerMatrix.test.ts`에 추가. |
| partial (depth/node 제한) | `completion.test.ts` S4~S11 (내부 함수 `analyzeImpact`) / `coverage.test.ts` 동명 행 (projection 함수 `projectCompletion`) / `stateReachability.integration.test.ts`의 `bundledTypeScriptRows()` - depth-limit, node-limit, both-limits를 **in-process**(`analyzeImpact` 직접 호출)로 증명 | **CLI 진입점(subprocess 경계)에서는 증명한 test가 없음 - 채움.** `cli/src/test/providerMatrix.test.ts`에 depth-limited 케이스 추가(bundled만; custom은 아래 이유로 생략). |
| custom(raw command) provider end-to-end | `providers.test.ts` "a raw custom command outranks every other tier"는 **선택 우선순위만** 덮는다. 그러나 실제로는 `contract.test.ts`(capability-missing, initialize/query 실패 다수)와 `requestOverrides.test.ts`("the CLI sends request initialization options and settings to the selected provider", "request-level secrets are redacted from provider failures")가 이미 raw custom command를 **CLI 진입점에서 광범위하게** 실행한다 | **원래 감사 표의 "미확인" 판정은 틀렸다 - 이미 상당 부분 덮여 있었다.** 다만 이 test들은 모두 M1 이후 필드(override)를 함께 보내거나 실패 경로만 다뤄서, "M1 이전 형태 요청이 성공까지 도달하는가"는 별도로 비어 있었다(아래 하위 호환 절 참고). |
| stdout 1줄 불변식 | `doctor.test.ts` "doctor writes exactly one JSON line to stdout and its progress to stderr" / `contract.test.ts`, `requestOverrides.test.ts`의 여러 test가 `stdout.trimEnd().split('\n').length === 1`을 반복 확인 | **덮임. 새 test 없음.** 이번에 추가한 test들도 동일한 불변식을 각자 확인한다(관례를 따름). |

**timeout/budget 상세**: `providers/resolve.ts` 및 `index.ts`를 직접 읽고, `providerPreset`/`provider`
필드가 어떻게 provider를 구성하는지 추적했다. `resolution.catalog`를 주입하는 유일한 경로는
`LspCallHierarchyProvider`의 TypeScript 생성자 옵션이며, 이는 `readiness.integration.test.ts`와
`stateReachability.integration.test.ts`만 사용하는 test 전용 API다(두 파일 모두 자기 주석에 "no counterpart
in the CLI's stdin JSON, CLI arguments, or project config surface"라고 이미 기록해 두었고, 직접
`cli/schemas/request.schema.json`과 `cli/src/providers/projectConfig.ts:17`의 `ALLOWED_FIELDS`를 읽어
`readiness`라는 필드가 어디에도 없음을 재확인했다). 따라서 이 축은 "실제 CLI 진입점에서는 오늘 도달 불가능한
상태"이고, 이를 인위적으로 만들려면 제품 코드에 test 전용 진입점을 추가해야 하는데 그것은 이 lane의 소유
범위(`cli/src/*.ts` 수정 금지) 밖이다. 새 test를 추가하는 대신 이 한계를 이 문서와
`cli/src/test/providerMatrix.test.ts`의 주석에 남긴다.

### 하위 호환 (실제 산출물 2)

`requestOverrides.test.ts`를 처음부터 끝까지 읽었다. "The real CLI" 구역(238~330행)의 세 test는 모두
`providerPreset`/`initializationOptions`/`settings` 중 하나 이상을 **명시적으로 보낸다** - 즉 M1이 추가한
필드가 정상 동작하는지 증명하지만, "그 필드들을 아예 보내지 않는 M1 이전 요청도 여전히 성공하는가"는
증명하지 않는다.

`contract.test.ts`를 처음부터 끝까지 읽었다. 이 파일의 모든 `analyze --stdin` test는 이미 M1 이전 형태
(`provider: {command, args, languageId}`만 있고 `providerPreset`/`initializationOptions`/`settings`는
전혀 없음)로 요청을 보낸다 - 그러나 15개 test 전부가 **실패 경로**(missing server, capability 없음,
initialize 실패, query 실패 등)만 도달한다. `ok: true`로 끝나는 test가 하나도 없다.

**판정: 진짜 공백.** "M1 이전 형태 요청이 실패가 아니라 성공까지 도달한다"를 증명하는 test가 없었다.
`schema.test.ts`의 `analyzeInFixtureWorkspace()`가 provider 필드 없이(자동탐지) 성공하는 것은 있지만,
이는 "provider 필드 자체를 생략한 자동탐지" 축이고, gate 문구의 "기존 provider JSON"(즉 `provider:
{command, args}` 형태로 provider를 **명시한** 요청)과는 다른 축이다. 채웠다 - 아래 작업 로그 참고.

### build/configure/sync 미실행 (실제 산출물 3)

이 gate를 증명하는 test가 오늘 하나도 없다는 것을 확인했다: `forbidden.test.ts`는 응답 상태 조합과 금지
문구를 검사하지 spawn 지점을 검사하지 않고, `errors.test.ts`는 에러 코드 선언/사용을 대조할 뿐이다.
`cli/src`(비-test) 전체를 다음 순서로 직접 조사했다:

1. `grep -rn "spawn\|exec(" cli/src/*.ts cli/src/providers/*.ts cli/src/lsp/*.ts cli/src/doctor/*.ts`로
   1차 후보를 뽑고, `exec(`이 실제로는 `RegExp.exec`(정규식 메서드, `jsonRpc.ts:290`,
   `discovery.ts:155-156`)이지 `child_process`가 아님을 개별 확인해 제외했다.
2. `child_process` import 지점을 전수 확인: `childIpc.ts`, `jsonRpc.ts`, `notes.ts`,
   `providers/discovery.ts` 4개 파일이 각각 `spawn`(2곳) 또는 `spawnSync`(2곳)만 가져온다. `exec`,
   `execFile`, `fork` 계열은 어디에도 import되지 않는다.
3. 4개 spawn 호출 지점을 각각 실제로 읽었다:
   - `childIpc.ts:31` `spawn(process.execPath, ['-e', ...])` - 자기 자신(Node 바이너리)을 프로브하는
     내부 IPC 점검. 명령어가 아니라 이 프로세스를 실행 중인 바로 그 Node 실행 파일이다.
   - `jsonRpc.ts:63` `spawn(command, [...args], ...)` - **호출자가 지정한** LSP provider를 실행한다.
     `command`는 리터럴이 아니라 생성자 매개변수이며, 요청 JSON의 `provider.command` 또는 shipped
     catalog가 준다.
   - `providers/discovery.ts:121` `spawnSync(executable, [...probe.args], ...)` - 호출자가 지정한
     provider 자신의 버전 프로브(`--version` 등)를 실행한다. 역시 리터럴이 아니다.
   - `notes.ts:188` `spawnSync('git', ['-C', workspace, 'check-ignore', '--quiet', '--no-index', '--',
     file], ...)` - 코드베이스에서 **유일하게 하드코딩된** 명령. `check-ignore`는 읽기 전용 조회이고
     mutating 인자(`push`/`pull`/`config`/`init` 등)는 전혀 없다.
4. `providers/readiness.ts`의 `assertProjectMetadata` 함수 자체가 이미 "this never generates, builds,
   configures or syncs anything"이라고 주석으로 선언하고 있음을 확인했다(구현도 `fs.stat`만 호출하는
   읽기 전용임을 재확인).
5. Extension 쪽(`src/*.ts`)도 `grep -rn "child_process\|spawn(" src/*.ts`로 확인했다 - 결과 0건. 이
   gate는 CLI(`cli/src`)에만 적용되고, 그 쪽은 애초에 spawn 자체를 하지 않는다.

**판정: 진짜 공백이었지만, 위반 사례는 발견되지 않았다.** 제품 코드는 이미 gate를 지키고 있었다 - 다만 그
사실을 재확인할 test가 없었다. `cli/src/test/buildInvocation.sources.test.ts`로 채웠다.

**막을 수 없는 예외 (숨기지 않고 기록)**: 이 스캔은 "생산 코드가 build/configure/sync 명령을
하드코딩하지 않는다"만 증명할 수 있다. **사용자가 명시적으로 `provider.command`를 `npm`이나 `make`로
지정하면 CLI는 그대로 그 명령을 실행한다** - 이것은 결함이 아니라 CLI의 존재 목적 자체다(임의의 Language
Server 실행 파일을 시작해야 한다). 그 값은 요청 JSON이나 shipped catalog에서 온 명시적 승인된 설정이지,
숨겨진 자동 실행이 아니다. 이 구분은 `buildInvocation.sources.test.ts`의 파일 상단 주석에도 동일하게
기록했다.

## 단계별 구현 계획 (실제 수행 순서)

### 단계 1 - 개발 환경 구성과 기준선 확인

- 목적: 기존 test가 실제로 녹색인지 재확인하지 않고 새 test를 얹으면, 내가 추가한 test의 실패와 기존
  결함을 구분할 수 없다.
- 산출물: 루트/`cli/`에 `npm install` 실행(저장소에 lockfile이 커밋돼 있지 않아 `node_modules`가
  비어 있었음), `node_modules`/`cli/node_modules` 생성.
- 검증: `npm run test:unit` → 58/58(Extension), 258/258(CLI). `npm run test:response-policy` → 16
  checks 통과. `npm run test:plugin-artifact` → 통과. 사용자가 알려준 기준선과 정확히 일치함을 확인.

### 단계 2 - build/configure/sync 미실행 소스 스캔 test

- 목적: gate 3("build/configure/sync는 사용자 승인 없이 실행되지 않는다")를 재현 가능한 test로 고정한다.
- 산출물: `cli/src/test/buildInvocation.sources.test.ts` (신규, 4개 test). `errors.test.ts`/
  `stateReachability.sources.test.ts`와 동일한 `nonTestSources()`/vacuous-pass 패턴을 재사용했다(공용
  helper를 새로 만들지 않고 관례를 따름).
- 검증: 정방향 통과 확인 + 역방향 관찰(아래 로그) + `npm run cli:test` 전체 재실행.

### 단계 3 - 기존 provider JSON 하위 호환 회귀 test

- 목적: gate 2("custom provider 요청과 기존 provider JSON은 하위 호환으로 동작한다")의 "성공까지
  도달한다" 절반을 고정한다.
- 산출물: `cli/src/test/contract.test.ts`에 test 1개 추가("an old-style request with only provider
  command/args/languageId - no preset, no overrides - still completes a successful analysis"). 기존
  파일의 관례(같은 워크스페이스/파일 경로, `spawnSync` 직접 호출)를 그대로 따랐다.
- 검증: 정방향 통과 확인 + 역방향 관찰(아래 로그) + `cli:test` 전체 재실행.

### 단계 4 - CLI 진입점 provider matrix (실제 산출물 1의 미충족 축만)

- 목적: 감사에서 확인한 두 개의 진짜 공백(진입점에서 indexing unknown 미확인, 진입점에서 partial 미확인)만
  채운다. 이미 덮인 축(capability-missing, Auto fallback, 진입점 밖 timeout)은 재작성하지 않고 파일 상단
  주석과 이 문서에 표로만 남긴다.
- 산출물: `cli/src/test/providerMatrix.test.ts` (신규, 3개 test): indexing-unknown(bundled),
  indexing-unknown(custom raw command), depth-limited partial(bundled). custom-provider의
  depth/node-limited는 의도적으로 생략했다 - 이유는 파일 내 주석과 아래 "제외 판단" 참고.
- 검증: 정방향 통과 확인 + 역방향 관찰(depth-limited test, 아래 로그) + `cli:test` 전체 재실행.

### 단계 5 - `scripts/test-plugin-artifact-e2e.mjs`/CI 확인 (변경 없음 확정)

- 목적: 계획 문서가 지시한 "assert 갱신"과 "CI matrix에 mock provider case 추가"가 **오늘도 필요한지**
  재확인한다. 필요 없다는 결론이면 그 이유를 기록하고 변경하지 않는다(불필요한 범위 추가 금지 원칙).
- 조사 결과:
  - `scripts/test-plugin-artifact-e2e.mjs:125-141`의 `provider.selectedBy === 'bundled'`/
    `complete === true` assert를 직접 읽었다. 이미 `providerPreset`/`provider` 없이 packed
    아티팩트를 실행하는 시나리오이므로 `selectedBy`가 `'bundled'`인 것이 **여전히 올바른 기대값**이다
    (자동탐지가 shipped catalog의 bundled-typescript를 고르는 것이 맞는 동작이고, `'auto'`가 나오면
    오히려 결함이라고 그 자리의 주석이 직접 설명한다). `npm run test:plugin-artifact`가 실제로 통과함을
    재확인했다(위 단계 1, 그리고 최종 검증에서 재확인). **assert는 이미 올바르고, 갱신할 필요가 없다.**
  - `.github/workflows/unit-tests.yml`을 읽었다. `npm test`, `npm run cli:test`,
    `npm run test:response-policy`가 이미 PR과 main push마다 실행된다. `unit-tests.yml`이 실행하는
    `cli:test`는 `cli/src/test/*.test.ts` 전부를 컴파일해서 돌리므로(`cli/package.json`의 `test` 스크립트:
    `tsc -p ./ && node --test dist/test/*.test.js`), 이번에 추가한 3개 새 파일도 **파일을 추가하는 것만으로
    자동으로 CI에 편입된다.** 별도 workflow 변경이 필요 없다.
  - `.github/workflows/plugin-artifact-e2e.yml`을 확인했다(패키징 전용 워크플로, `unit-tests.yml`과
    분리되어 있다는 것도 그 파일 자체의 주석이 설명한다) - 이번 lane의 변경과 무관하다.
- 산출물: 없음(코드 변경 없음). 이 판단 자체가 산출물이며, "자동 설치·build·sync를 milestone 완료 수단으로
  쓰지 않는다"는 원칙에 따라 필요하지 않은 CI/스크립트 변경을 임의로 만들지 않았다.
- 검증: `npm run test:plugin-artifact` 재실행, 통과 확인(로그 참고).

**계획 문서(task-m1-agent-team-execution.md) 대비 차이**: 그 문서는 "assert 갱신"과 "CI matrix에 mock
provider case 추가"를 이 lane의 산출물로 지시했지만, 직접 코드를 읽은 결과 **assert는 이미 올바르고
CI는 이미 새 test 파일을 자동으로 포함한다**. 계획 문서 작성 시점(Wave 1/2 착수 전)에는 Auto/preset 도입이
아직 `selectedBy`를 깨뜨릴 것으로 예상됐지만, 실제 구현(이미 merge된 W1-B)이 `selectedBy: 'bundled'`를
자동탐지의 정상적인 결과값으로 유지하도록 설계됐기 때문에 이 우려가 실현되지 않았다. 계획과 실제 구현이
갈라진 지점을 여기 기록한다.

## 작업 로그

- **환경 구성**: 저장소에 `package-lock.json`/`cli/package-lock.json`이 커밋돼 있지 않다(루트에는
  `pnpm-lock.yaml`만 tracked, CI는 pnpm 사용). 로컬 검증을 위해 `npm install`(루트), `npm install`
  (`cli/`)을 실행해 `node_modules`를 만들었다. 생성된 `package-lock.json`/`cli/package-lock.json`은
  커밋하지 않았다(untracked로 유지 - 기존 저장소 관례에 개입하지 않기 위해).
- **기준선**: `npm run test:unit` → Extension 58/58, CLI 258/258. `npm run test:response-policy` →
  16 checks. `npm run test:plugin-artifact` → 통과. 사용자가 알려준 기준선과 일치.
- **추가 파일**:
  - `cli/src/test/buildInvocation.sources.test.ts` (신규 205줄): spawn-family 호출 지점 인벤토리(4곳
    고정), `node:child_process`에서 import하는 식별자 허용목록(`spawn`/`spawnSync`/타입
    `ChildProcessWithoutNullStreams`), 하드코딩된 리터럴 명령어 허용목록(`git`만), git 호출의 인자가
    mutating subcommand를 포함하지 않음을 확인하는 4개 test.
  - `cli/src/test/contract.test.ts`: 기존 15개 test에 1개 추가(`pathToFileURL` import 추가). 순수
    M1 이전 형태 요청이 raw custom provider를 통해 성공까지 도달함을 증명.
  - `cli/src/test/providerMatrix.test.ts` (신규): CLI 진입점(`analyze --stdin` subprocess) 수준에서
    indexing-unknown(bundled/custom 2개)과 partial/depth-limited(bundled 1개) 상태를 증명하는 3개
    test. 파일 상단에 이번 감사에서 확인한 전체 matrix(어느 축이 이미 덮여 있고 어느 축이 새로
    추가됐는지, 그리고 timeout/budget이 왜 이 경계에서 도달 불가능한지)를 표와 근거로 기록했다.
- **설계 결정**:
  - custom(raw command) provider에 대한 depth/node-limit 진입점 test는 만들지 않았다. 기존 mock LSP
    fixture 6개(`dynamicCallHierarchyServer.ts`, `readinessServer.ts`, `settingsRequiredServer.ts` -
    `incomingCalls`를 구현하는 3개를 모두 확인) 전부가 `callHierarchy/incomingCalls`에 항상 빈 배열로
    응답한다. 다단계 호출 체인을 흉내 내려면 새 fixture가 필요한데, depth/node 제한을 적용하는 순회
    루프(`cli/src/impact.ts`)는 `provider.selectedBy`와 무관하게 동일한 코드 경로이므로(모든 provider의
    `incomingCalls()` 결과를 동일하게 소비한다), bundled provider로 이미 그 경로를 진입점 수준에서
    증명했다면 custom provider로 같은 경로를 다시 증명하는 것은 새 fixture를 만드는 비용에 비해 한계
    가치가 낮다고 판단했다. "새 fixture는 공용 헬퍼를 쓰고 프레임 파서를 복붙하지 않는다"는 원칙에서 한
    걸음 더 나아가, 애초에 불필요한 새 fixture를 만들지 않는 쪽을 택했다.
  - 하위 호환 test는 `dynamicCallHierarchyServer.js` fixture를 재사용했다(새 fixture를 만들지 않음).
    이 fixture는 `IMPACT_LENS_MOCK_TARGET_URI`가 설정되면 대상 심볼 하나를 반환하고 `incomingCalls`는
    빈 배열을 반환해 `ok: true`, "callers 없음"으로 결정적으로 종료한다 - 하위 호환 성공 경로를 증명하는
    데 필요한 전부다.
  - `scripts/test-plugin-artifact-e2e.mjs`와 `.github/workflows/*.yml`은 수정하지 않았다(단계 5 참고,
    이유를 위에 기록).
- **역방향 관찰 (PR #49 방식)**: 아래 세 번 모두 "생산 코드를 의도적으로 깨고 → 목표한 test가 정확히
  그 이유로 실패하는지 확인 → 원복 → `git diff`로 바이트 동일 확인" 순서를 따랐다.
  1. `cli/src/notes.ts`에 `spawnSync('npm', ['install'])`을 호출하는 미사용 함수를 임시로 추가 →
     `buildInvocation.sources.test.ts`의 "every spawn-family call site is inventoried..." test가
     "expected exactly 4 spawn-family call sites in cli/src, found 5"로 정확히 실패 → 원복 →
     `git diff cli/src/notes.ts` 출력 없음(바이트 동일) 확인.
  2. `cli/src/lspProvider.ts:459`의 `name: result.serverInfo?.name ?? 'language-server'`를
     `name: 'DEBUG-broken-name'`으로 임시 변경 → `contract.test.ts`의 새 하위 호환 test가
     `actual: 'DEBUG-broken-name', expected: 'dynamic-call-hierarchy-server'`로 정확히 실패(같은 파일 내
     capability-missing test 1개도 같은 필드를 검사하므로 함께 실패했고, 다른 13개 test는 영향 없이
     통과 - 회귀 범위가 이 필드를 실제로 사용하는 test로 정확히 제한됨을 확인) → 원복 →
     `git diff cli/src/lspProvider.ts` 출력 없음 확인.
  3. `cli/src/impact.ts`의 depth 제한 조건 `current.depth >= maxDepth`를
     `current.depth >= maxDepth + 100`으로 임시 변경 → `providerMatrix.test.ts`의 depth-limited test가
     `actual: [], expected: ['depth']`로 정확히 실패(같은 파일의 나머지 2개 test는 영향 없이 통과) →
     원복 → `git diff cli/src/impact.ts` 출력 없음 확인.
- **상위 목표 기여**: 세 gate 문구가 각각 test 이름으로 추적 가능해졌다(아래 완료 기준 참고). R3(gate
  판정 lane)가 이 문서와 test 이름을 그대로 인용해 M1 종료 여부를 판정할 수 있다.
- **남은 제한 사항**:
  - timeout/budget 축은 CLI 진입점에서 도달 불가능하다는 것을 증명했을 뿐, 그 축 자체를 진입점에서
    테스트 가능하게 만들지는 않았다(그러려면 제품 코드에 test 전용 진입점을 추가해야 하는데, 이는 이
    lane의 소유 범위 밖이다). readiness 관련 요청 표면이 실제로 추가되는 시점(이후 milestone)에 다시
    감사해야 한다.
  - `buildInvocation.sources.test.ts`는 텍스트 스캔이다: `require('child_process')`처럼 `import`가
    아닌 경로로 spawn 함수를 가져오는 경우는 감지하지 못한다. 이 코드베이스는 프로덕션 소스 전체에서
    ES `import`만 사용하므로(직접 확인) 현재는 이론적 위험이다.

## 테스트 및 완료 기준

### 실행한 검증 (최종, 이 문서의 모든 변경 반영 후)

| 명령 | 결과 |
| --- | --- |
| `npm run test:unit` | Extension 58/58, CLI **266/266**(기존 258 + 신규 8: buildInvocation 4 + contract 1 + providerMatrix 3) |
| `npm run test:response-policy` | 16 checks 통과 |
| `npm run test:plugin-artifact` | 통과("Plugin artifact E2E passed: clean install and Codex/Claude TS/TSX/JS/JSX release fallback.") |
| `git diff --check` | 통과(공백 오류 없음) |
| 역방향 관찰 3건 | 모두 의도한 test만 정확한 이유로 실패 → 원복 → `git diff` 바이트 동일 확인(위 로그) |

### 완료 기준 대비 결과

- [x] 감사 표가 작업 문서에 있고, 새로 추가한 test는 감사에서 미충족으로 판정된 축만 덮는다. (위 "커버리지
  감사" 절)
- [x] fallback 금지 / 하위 호환 / build 미실행 3개 gate 문구가 각각 test 이름으로 추적 가능하다:
  - fallback 금지: `providers.test.ts`의 5개 test + `contract.test.ts`의 2개 test + packed 아티팩트
    E2E의 assert (신규 test 없음, 기존 근거로 추적 가능)
  - 하위 호환: `contract.test.ts` "an old-style request with only provider command/args/languageId -
    no preset, no overrides - still completes a successful analysis"
  - build 미실행: `buildInvocation.sources.test.ts`의 4개 test, 특히 "every spawn-family call site in
    cli/src is inventoried, and none hardcodes a command outside the allowed list"
- [x] 역방향 관찰 결과가 로그에 기록됐다. (위 "작업 로그" 절)

### 이 PR로 아직 달성되지 않는 것

- M1 milestone 전체 종료 판정은 이 lane의 책임이 아니다 - R3(gate 판정 문서화) lane이 이 문서와 R2(문서
  lane)의 결과를 함께 인용해 판정한다.
- `user-tests/m1-user-test-spec.md`의 실제 사용자 검증은 별도 lane(W3-B/W3-C)의 책임이며 이 PR과 무관하게
  남아 있다.
- 이 PR은 merge하지 않는다 - 조정 세션이 검증 후 진행한다.
