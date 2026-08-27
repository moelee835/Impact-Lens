# W1-B — Preset catalog, 선택 우선순위와 doctor 일반화

- 작성일: 2026-08-27
- lane: `il-provider-platform` / M1 Wave 1 W1-B
- branch: `feat/m1-preset-catalog` (착수 기준 `origin/main` `dbc6c9b`, 진행 중 `f0cb40e`(W1-C merge)를 merge)
- story: [`IL-LIM-004`](../development-management/stories/il-lim-004-first-class-language-presets.md) 1·2단계
- 상위 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md) Wave 1 W1-B
- 선행 산출물: [`task-m1-provider-seam.md`](task-m1-provider-seam.md) (W0-4가 만든 seam)
- 필드 계약: [`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md) (W1-A 제안 + lead 결정)
- 인계 문서: [`task-m1-wave0-handover.md`](task-m1-wave0-handover.md)

## 1. 배경과 해결할 문제

provider 선택은 W0-4가 `cli/src/providers/resolve.ts`로 옮겨놨지만 내용은 아직 삼항 연산자 두 줄이다.
`custom`이 아니면 `bundled`이고, 그 사이에 preset도 project 설정도 discovery도 없다. 그래서 지금은

- 사용자가 preset을 이름으로 고를 방법이 없고,
- workspace가 "이 프로젝트는 이 provider를 쓴다"고 기록할 자리가 없고,
- 설치된 external Language Server를 찾아낼 수단이 없다.

doctor 쪽 결함은 더 구체적이다. 서브커맨드가 `doctor bundled-typescript` 하나뿐이고, 모든 check의
`status`가 `'pass'` **리터럴로 고정**돼 있다(`cli/src/doctor.ts`). 즉 doctor는 구조적으로 실패를 보고할
수 없다. 실패는 check가 되는 대신 예외가 되어 첫 실패에서 전체를 중단시키므로, 사용자는 한 번에 하나의
문제만 볼 수 있고 "무엇이 되고 무엇이 안 되는지"의 전체 그림을 얻지 못한다.

W1-B는 IL-LIM-004의 1·2단계를 구현한다. **M1의 범위는 TypeScript reference preset까지다.** 검증 근거
없는 언어를 catalog에 넣거나 `verified-external`로 문서화하지 않는다.

## 2. 범위

### 포함

1. `ProviderPreset` manifest 타입과 catalog 형식 확정. `$ref` 해석, 값 트리 검증, tier 병합.
2. 선택 우선순위 `raw custom > explicit preset > trusted project choice > verified auto-discovery >
   unsupported` 구현. 마지막 단계에서 **다른 언어의 provider로 fallback하지 않는다.**
3. shell을 쓰지 않는 PATH discovery와 timeout·출력 크기 제한이 걸린 version probe.
4. `doctor <preset>` 일반화, check 단위 `pass`/`warn`/`fail`, 첫 실패에서 중단하지 않는 전체 실행.
5. missing executable / unsupported version / language mismatch / missing capability / fixture 실패를
   doctor 출력에서 서로 구분.
6. TypeScript reference preset이 기존 bundled 경로와 **응답 바이트 단위로 동일**함을 증명.

### 제외

- **자동 설치.** executable이 없으면 공식 설치 문서 링크와 custom provider 경로만 안내한다.
  build/configure/sync는 어떤 경로에서도 실행하지 않는다.
- TypeScript 외 preset의 catalog 등재. gopls는 IL-LIM-004 3단계(M2)다.
- `cli/schemas/**` 변경. 요청 최상위 `providerPreset`/`initializationOptions`/`settings` 필드 추가는
  lead 결정 L6에 따라 **W1-C merge 직후 별도 contract lane**이 한다. 이 lane은 그 필드가 아직 없다는
  전제로 배관만 만든다.
- `cli/src/jsonRpc.ts`, `cli/src/lsp/**`, `cli/src/lspProvider.ts` — W1-A 동시 작업 중.
- `cli/src/coverage.ts`, `cli/src/impact.ts`, `cli/src/types.ts` — W1-C 동시 작업 중.
- `plugins/**` 문서 — 별도 lane. 낡아지는 문장은 8절에 목록으로 남긴다.
- readiness 신호의 **실제 관측**. Wave 2 W2-A다. 이 lane은 manifest가 선언을 담을 자리만 만들고,
  선언이 없으면 `indexingStatus`는 오늘과 같은 `unknown`으로 남는다(D7).

## 3. 현재 구현 조사 결과

라인 번호는 곧 이동하므로 `파일:심볼`로 적는다. 기준은 `main` `dbc6c9b`이며
[`task-m1-wave0-handover.md`](task-m1-wave0-handover.md) 5절의 조사 결과를 재조사하지 않고 전제한다.

| 사실 | 근거 |
| --- | --- |
| 선택은 custom/bundled 이분법이고 preset·PATH·설정 파일이 없다 | `cli/src/providers/resolve.ts:resolveProvider` |
| 타 언어 fallback 금지는 이미 지켜지고 있다 | 같은 파일 `defaultTypeScriptServerCommand`가 TS 계열 4종 밖이면 `provider_required_for_language`로 끝낸다 |
| bundled command가 **런타임 계산값**이라 정적 리터럴 manifest로 표현할 수 없다 | `cli/src/runtime.ts:bundledTypeScriptCommand`가 `process.execPath` + resolve된 entry를 조합한다 |
| bundled의 `--log-level`은 환경변수 조건부다 | `cli/src/runtime.ts:bundledProviderLogArgs` |
| doctor의 모든 check `status`가 `'pass'` 리터럴이다 | `cli/src/doctor.ts:doctorBundledTypeScript` |
| doctor는 첫 실패에서 예외로 중단한다 | 같은 함수가 `inspectBundledTypeScriptArtifact()`와 `initializeForDoctor()`의 예외를 잡지 않는다 |
| doctor 서브커맨드가 하나로 하드코딩돼 있다 | `cli/src/index.ts:operationName`의 `argv[1] === 'bundled-typescript'` |
| `selectedBy` enum이 이미 6값이라 새 tier를 담을 수 있다 | `cli/src/types.ts:PROVIDER_SELECTED_BY` = bundled/auto/preset/project/custom/vscode (W0-3) |
| `cli/package.json`의 `files`가 디렉터리를 명시 나열한다 | `["dist/*.js", "dist/providers/*.js", ...]`. npm glob의 `*`는 한 단계만 매칭한다 |
| 기존 doctor 응답의 형태를 고정하는 테스트가 있다 | `contract.test.ts`가 `data.status === 'ready'`, `checks[2].version`, `checks.at(-1).id === 'initialize-capability-smoke'`를 본다 |
| artifact E2E가 `selectedBy === 'bundled'`와 `complete === true`를 하드 assert한다 | `scripts/test-plugin-artifact-e2e.mjs` |

### 3.1 지시와 다르게 판단한 지점

착수 지시에 대한 반박·수정은 전부 여기에 모은다. 조용히 따르지도, 조용히 무시하지도 않는다.

**(1) 단계 순서를 1·3 합침으로 바꿨다.**
지시는 "3단계(manifest 타입 확정)만 합의를 기다리고 1·2단계를 먼저 하라"였다. 착수 시점에
`origin/docs/m1-preset-manifest-contract`에 제안서가 이미 있었고 lead 결정 6건도 함께 전달됐다.
기다릴 대상이 없어졌는데도 순서를 지키면, 1단계에서 임시 preset 모양을 만들고 3단계에서 그것을 버리는
작업이 된다. 그래서 **manifest 타입 확정을 1단계 안으로 끌어왔다.** 지시의 취지("합의 없이 필드 형태를
혼자 정하지 마라")는 그대로 지켜진다 — 형태는 합의 문서에서 그대로 가져왔다.

**(2) `doctor <preset> --smoke`가 실패해도 exit 0을 유지한다.**
지시는 exit code를 말하지 않았지만, check 단위 `fail`을 도입하면 "doctor가 실패를 발견함"을 exit code로
표현하고 싶어진다. 하지 않는다. 이 CLI의 exit code는 `error.code`에 1:1로 묶인 계약이고
(`cli/src/errors.ts`), `ok: true` envelope에 0이 아닌 exit를 붙이면 그 대응이 깨진다. doctor가 진단에
**성공**한 것과 진단 **대상**이 건강한 것은 다른 사건이다. 전자가 envelope의 `ok`이고 후자가
`data.status`다. 새 exit code가 필요하다면 그것은 계약 lane의 결정이므로 9절 후속 과제로 올린다.

**(3) doctor의 실패 종류는 `error.code`가 아니라 check의 `code` 필드로 구분한다.**
계약 문서의 fixture 표는 "실행 파일 부재 preset → doctor → `provider_executable_not_found`"처럼 적었지만,
그 code를 **던지면** 첫 실패에서 중단하지 않는다는 요구와 정면으로 충돌한다. 그래서 doctor의 실패 종류는
`data.checks[].code`로 나가고 `CliError`가 되지 않는다. 이렇게 하면 다섯 종류가 한 응답에 동시에 나타날
수 있고, 그것이 "전체 그림을 보고한다"의 실제 의미다.

**(4) 실제 fixture 실행은 `--smoke`가 아니라 `--fixture`로 분리했다.**
"capability probe와 실제 fixture 실행을 분리해 일반 analyze latency에 provider process를 더하지 않는다"는
원칙을, 지시는 analyze와 doctor 사이의 분리로 적었지만 doctor 내부에도 같은 분리가 필요하다. capability
probe는 initialize 한 번이고 fixture는 workspace 생성 + prepare + incoming이다. 둘을 한 플래그에 묶으면
`--smoke`의 비용이 조용히 몇 배가 된다. 부수 효과로 `checks.at(-1).id === 'initialize-capability-smoke'`를
보는 기존 테스트가 그대로 통과한다.

**(5) 요청 수준 `providerPreset`을 이 PR에서 쓸 수 없으므로 explicit preset의 M1 표면은 두 개다.**
lead 결정 L6이 요청 스키마 추가를 후속 lane으로 미뤘고, `cli/src/index.ts`는 doctor dispatch 외 변경이
금지돼 있다. 그래서 explicit preset tier는 (a) `doctor <preset>` 인자와 (b) 환경변수
`IMPACT_LENS_PROVIDER_PRESET`으로만 노출한다. 선택 계층 자체는 `providerPreset` 이름으로 배관돼 있으므로
후속 lane이 스키마 필드를 추가하면 한 줄로 연결된다.

**(6) trusted project tier는 workspace를 명시로 받을 때만 동작한다. `process.cwd()` fallback을 넣지 않았다.**
`resolveProvider(file, command)`의 호출부는 `cli/src/lspProvider.ts:LspCallHierarchyProvider` 생성자인데
그 파일은 W1-A가 동시에 작업 중이라 건드릴 수 없다. 그 생성자만 workspace를 알고 있다. `cwd`로 대신하면
"A 프로젝트를 분석하는데 B 디렉터리의 `.impact-lens/provider.json`이 provider를 바꾸는" 경로가 생긴다.
조용히 틀린 provider를 고르는 것은 이 도구가 만들면 안 되는 종류의 결과이므로, **fallback 없이 명시
workspace를 요구**하고 analyze 경로 연결은 9절 후속 과제로 남긴다. 필요한 변경은 한 줄이다:
`resolveProvider(file, command, { workspace: this.workspace })`.

**(7) `cli/src/errors.ts`에 code를 추가한다.**
역할 정의는 error code를 `il-contract-architect` 소유로 적었지만, `cli/src/errors.ts`의 헤더 주석이
"각 code를 구현하는 lane이 그것을 던지는 줄과 **같은 변경에서** 여기에 추가한다"고 명시했고
`errors.test.ts`가 그것을 강제한다. lead도 `provider_config_invalid`에 대해 "던지는 쪽은 너다.
merge 시점에 union에 없으면 네 PR에서 넣어라"라고 지시했다. 실제로 던지는 code만 넣는다.

## 4. 확정한 manifest 계약

[`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md)의 D1~D13과 lead 결정
L1·L3~L7을 그대로 타입으로 확정한다. 아래는 **그 문서와 달라진 지점만** 적는다. 나머지는 문서가 정본이다.

| # | 변경 | 이유 |
| --- | --- | --- |
| M1 | `ResolvedProviderSession`을 `providers/preset.ts`가 아니라 `providers/resolve.ts`에 둔다 | `ResolvedProvider`가 거기 있다. 확대 타입을 다른 파일에 두면 `preset.ts → resolve.ts` 순환 import가 생긴다. 의미는 그대로다 |
| M2 | `ProviderVersionProbe.supported: string` → `{ minimum: string; maximum?: string }` | 범위 문자열(`>=1.2 <2`)은 파서다. D1(b)가 "manifest에 표현식 언어를 넣지 않는다"를 이미 기각 근거로 썼는데 version 범위만 예외로 두면 같은 문을 옆으로 다시 여는 것이다. 점 구분 숫자 비교는 파서가 필요 없다 |
| M3 | `ProviderPreset.fixture?: ProviderFixture` **추가** | Wave 1 종료 gate가 "fixture 실패가 doctor에서 구분된다"를 요구한다. fixture는 preset마다 다른 **데이터**이고, code에 preset id로 분기해 숨기면 preset 추가가 코드 변경이 된다. `verified-external` 승격 조건 자체가 "실제 fixture 통과"이므로 승격 근거는 preset 옆에 있어야 한다 |
| M4 | `IndexingReadinessEvidence`를 선언하지 않는다 | L4에서 형태(`{ signal, detail }`)는 승인됐지만 필드가 사는 파일은 `cli/src/types.ts`(W1-C 소유)다. 이 lane이 소비하지 않는 타입을 미리 선언하면 W0-3이 `errors.ts`에서 거부한 "선언만 하고 생산하지 않는 값"이 된다 |
| M5 | `MANIFEST_REF_SOURCES`는 `nodeExecutable`, `bundledModuleEntry` 2개로 닫는다 | 문서 그대로다. 변경이 아니라 확인이다 |

`ProviderPreset`의 최종 필드: `id`, `displayName`, `tier`, `languageIds`, `extensions`, `command`,
`version?`, `initializationOptions?`, `settings?`, `settingsDelivery?`, `sensitive?`, `readiness?`,
`fixture?`, `docs?`, `lastVerified?`.

### 열어둔 채로 남기는 것

- **L2**(`workspace.configuration: true` 선언이 bundled 캡처를 바꾸는지)는 미결이다. 이 lane은 client
  capability를 선언하지 않으므로(D11: capability는 코드 소유, manifest가 건드리지 않는다) 영향을 받지
  않는다. **"bundled 동작 무변경" 제약을 그대로 유지**하고, 캡처 차이가 관측되면 기대값을 갱신하지 않고
  차이 내용을 보고한다.
- `readiness`는 타입과 검증만 만들고 **관측하지 않는다.** TypeScript reference preset은 `readiness`를
  갖지 않으므로 `indexing.status`는 오늘과 같은 `unknown`이다.
- 요청 최상위 `providerPreset`/`initializationOptions`/`settings`의 스키마 추가는 후속 lane이다(L6).

## 5. 단계별 구현 계획

각 단계는 독립적으로 검증·commit·push할 수 있다.

### 1단계 — 작업 문서와 무변경 기준선

- 이 문서를 만든다.
- W0-4가 부록에 남긴 캡처 스크립트를 그대로 재사용해 **코드를 바꾸지 않은 채** 기준선을 뜬다.
  같은 빌드로 여러 번 떠서 캡처 자체가 결정적인지 먼저 확인한다. 이 확인이 없으면 이후 어떤 "diff 0"
  주장도 근거가 없다.

### 2단계 — manifest 타입, catalog, 선택 우선순위, discovery

- `cli/src/providers/preset.ts` — 4절에서 확정한 타입.
- `cli/src/providers/manifest.ts` — 값 트리 검증(L5 수치), `$ref` 해석, tier 병합(D9), 민감 값 수집(D6).
- `cli/src/providers/discovery.ts` — shell 미사용 PATH 탐색과 version probe.
- `cli/src/providers/projectConfig.ts` — `.impact-lens/provider.json` 읽기와 검증.
- `cli/src/providers/catalog.ts` — TypeScript reference preset 하나.
- `cli/src/providers/resolve.ts` — 5단계 선택 우선순위.
- `cli/src/runtime.ts` — `bundledProviderLogArgs` export, `bundledTypeScriptCommand` 제거.
- 검증: build, `cli:test`, `test`, **캡처 diff 0**.

### 3단계 — doctor 일반화

- `cli/src/doctor.ts` 삭제, `cli/src/doctor/index.ts`·`checks.ts` 신설.
- `cli/package.json`의 `files`에 `"dist/doctor/*.js"` 추가.
- `cli/src/index.ts`는 doctor dispatch 블록만 최소 변경.
- 검증: build, `cli:test`, `test`, 캡처 diff(doctor 2건은 의도된 차이, 나머지 27건 diff 0),
  `npm pack --dry-run`으로 tarball 파일 집합 확인.

### 4단계 — artifact E2E와 회귀 증명

- `npm run test:plugin-artifact` 실행. assert가 깨지면 같은 PR에서 갱신하고 근거를 남긴다.
- 최종 캡처 비교와 완료 기준 대조.

## 6. 테스트 및 완료 기준

- [x] `npm run cli:build` 통과
- [x] `npm run cli:test` 통과 — 159 pass / 0 fail
- [x] `npm test` 통과 — 35 pass / 0 fail
- [x] `npm run test:plugin-artifact` 통과 — 네트워크가 있어 실제로 실행했다
- [x] bundled TypeScript 경로의 응답이 기준선과 **byte 단위 동일** — analyze·note 27종 전부.
      doctor 2종만 달라지고 그 차이는 전부 additive이며 4단계 로그에 목록으로 있다
- [x] missing executable / unsupported version / language mismatch / missing capability / fixture 실패가
      doctor 출력에서 서로 구분되고 각각 테스트로 증명된다 (`cli/src/test/doctor.test.ts`)
- [x] doctor가 첫 실패에서 중단하지 않는다 — `every check runs even when earlier ones fail`이
      한 응답에서 실패 3건과 경고 1건을 동시에 관측한다
- [x] doctor의 stdout이 정확히 JSON 한 줄이고 진행 로그가 stderr로만 나간다 — 테스트로 증명
- [x] 선택 우선순위 5단계가 각각 테스트로 덮인다 (`cli/src/test/providers.test.ts`)
- [x] PATH 탐색이 shell을 쓰지 않는다 — `srv; touch pwned && echo $(whoami)` 이름의 실행 파일을
      설치해 그것이 파일명으로 취급되고 `pwned`가 생기지 않음을 확인한다
- [x] `main`에서 어떤 파일도 변경하지 않았다

## 7. 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| 새 하위 디렉터리가 npm tarball에서 빠져 릴리스만 깨진다 | `cli/package.json`의 `files`에 `dist/doctor/*.js`를 같은 commit에서 추가하고 `npm pack --dry-run`과 `test:plugin-artifact`로 확인한다. 단위 테스트는 checkout의 `dist`를 쓰므로 이 회귀를 못 잡는다 |
| `dist/doctor.js`(구 파일)가 남아 `dist/doctor/index.js`를 가린다 | import를 `./doctor/index`로 명시해 디렉터리 해석 자체를 없앤다. 검증 전에 `cli/dist`를 지우고 새로 빌드한다 |
| 캡처가 코드 무변경에서도 diff를 낸다 | workspace 경로 고정(W0-4). 추가로 이번에 발견한 `provider.observed.diagnostics` 경쟁도 마스킹한다(9절) |
| Auto 도입이 artifact E2E assert를 깬다 | 같은 PR에서 처리한다. 느슨하게 만들지 않고 **새 계층에서 무엇이 참이어야 하는지**로 다시 표현한다 |
| preset이 늘면서 manifest가 표현식 언어가 된다 | ref 2개, `match`는 경로+값 하나, version은 점 구분 숫자 비교로 닫는다. 조건부 인자와 재시도 전략은 M1에서 의도적으로 뺀다 |

## 8. 이 변경으로 낡아지는 문서 문장

`plugins/**`는 이 lane이 수정하지 않는다. 아래는 별도 lane이 갱신해야 할 목록이다.

| 파일 | 문장 | 왜 낡는가 |
| --- | --- | --- |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md` | "provider 없으면 비-TS/JS는 무조건 에러" 취지의 서술 | preset catalog가 자라면 provider JSON 없이도 verified preset이 선택된다. 지금은 catalog가 TypeScript 하나라 결과가 같지만 **명제 자체가 뒤집힌다** |
| 같은 파일 | `doctor bundled-typescript` 고정 표기 | `doctor <preset>`으로 일반화됐다 |
| 같은 파일 | doctor 예시 응답 | `preset` 객체와 check별 `status`가 추가됐다. 예시가 실제 출력과 어긋난다 |
| `plugins/impact-lens/skills/impact-lens-cli/SKILL.md` | doctor를 한 번 실행해 package/version을 확인하라는 안내 | check가 `pass`/`warn`/`fail`을 가지므로 "전부 pass인가"를 읽는 방법이 필요하다 |
| `docs/development-management/provider-coverage-contract.md` | fixture 표의 "doctor → `provider_executable_not_found`" 류 | doctor는 이 code들을 **던지지 않고** check의 `code`로 보고한다(3.1-(3)). 계약 lane이 표현을 맞춰야 한다 |

## 9. 후속 과제

이 lane이 끝내지 않고 근거와 함께 남기는 것이다.

| # | 항목 | 왜 여기서 끝내지 않았나 | 누가 |
| --- | --- | --- | --- |
| 1 | analyze 경로에 workspace를 흘려 trusted project tier를 켠다 | 호출부가 `cli/src/lspProvider.ts`의 생성자인데 W1-A가 동시에 작업 중이라 건드릴 수 없다. 필요한 변경은 `resolveProvider(file, command, { workspace: this.workspace })` 한 줄이다. 지금은 doctor와 단위 테스트에서만 tier가 동작한다 | W1-A merge 후 |
| 2 | 요청 최상위 `providerPreset` / `initializationOptions` / `settings` 스키마 추가 | lead 결정 L6이 후속 contract lane으로 지정했다. 이름은 고정됐고 배관은 그 이름으로 이미 있다 | contract lane |
| 3 | `ResolvedProviderSession`의 `initializationOptions`·`settings`·`settingsDelivery`·`redactionValues`를 실제 wire에 싣는다 | 프로토콜 계층(`lspProvider.ts`, `jsonRpc.ts`)은 W1-A 소유다. 이 lane은 값을 만들어 seam에 올려두는 데까지다 | W1-A |
| 4 | readiness 신호의 실제 관측과 `coverage.indexing.evidence` | Wave 2 W2-A. 지금은 선언을 담을 자리만 있고 TypeScript preset은 선언하지 않으므로 `indexing.status`는 `unknown` 그대로다 | W2-A |
| 5 | doctor가 발견한 문제를 exit code로도 알릴지 | exit code는 `error.code`에 1:1로 묶인 계약이라 `ok: true` envelope에 0이 아닌 exit를 붙이는 것은 계약 변경이다. 3.1-(2) 참조 | 계약 lane |
| 6 | `plugins/**` 문서 갱신 | 이 lane의 금지 범위. 낡아지는 문장은 8절에 목록으로 있다 | plugin docs lane |
| 7 | gopls verified-external preset | IL-LIM-004 3단계, M2. 실제 fixture 통과가 승격 조건이고 그 fixture 자리는 `ProviderPreset.fixture`로 이미 있다 | M2 |

## 10. 작업 로그

### 2026-08-27 — 1단계: 작업 문서와 무변경 기준선

**변경한 파일**: 이 문서만. 코드는 아직 바꾸지 않았다.

**기준선 (`origin/main` `dbc6c9b`, 코드 무변경)**

| 검증 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 (`cli/dist`를 지우고 새로 빌드) |
| `npm run cli:test` | tests 63 / pass 63 / fail 0 |
| `npm test` | tests 35 / pass 35 / fail 0 |
| `npm run test:plugin-artifact` | exit 0, `Plugin artifact E2E passed: clean install and Codex/Claude TS/TSX/JS/JSX release fallback.` |
| 고정 캡처 | 29 시나리오 |

**캡처 스크립트는 W0-4가 남긴 것을 그대로 쓴다.** `task-m1-provider-seam.md` 부록 A의 전문을 추출해
실행했다. 시나리오 29종은 선택 로직이 만들어내는 5개 값의 모든 분기를 지나고 bundled/custom 양쪽,
성공 9 / 실패 18 / 기타 2를 포함한다.

**W0-4의 캡처 방법에서 한 가지를 고쳐야 했다 — 발견한 비결정성 1건**

코드를 한 줄도 바꾸지 않은 채 캡처를 두 번 떠서 비교했더니 `ok-ts` 시나리오에서 diff가 났다.

```
547c547
<         "diagnostics": true
---
>         "diagnostics": false
```

`data.provider.observed.diagnostics`와 그것의 `capabilities` 미러다. 이 값은
`lspProvider.collectDiagnostics`의 **고정 100ms 대기** 안에 `textDocument/publishDiagnostics`가
도착했는지로 정해지므로 실행마다 달라질 수 있다. handover 5절이 적은 "진단 수집 대기가 고정 100ms라
느린 서버의 진단은 통째로 누락된다"는 결함의 관측 가능한 형태이고, 고치는 것은 W1-A의 몫이다.

W0-4의 정규화 목록은 **키 이름** 기준이라 `diagnostics`를 넣으면 `advertised.diagnostics`("서버가
진단을 광고하는가")까지 같이 가려진다. 그것은 초기화 응답에서 오는 결정적 값이고 회귀를 볼 가치가 있다.
그래서 **경로 기준** 마스킹을 추가했다.

```
data/provider/diagnostics
data/provider/observed/diagnostics
capabilities/diagnostics
capabilities/observed/diagnostics
```

이 네 경로만 마스킹한 뒤 같은 빌드로 캡처를 **세 번** 떠서 `diff -r`이 세 번 모두 빈 것을 확인했다.
이 확인 전에는 "diff 0"이 아무것도 증명하지 못한다.


### 2026-08-27 — 2단계: manifest 타입, catalog, 선택 우선순위, discovery

**변경한 파일**

| 파일 | 내용 |
| --- | --- |
| `cli/src/providers/preset.ts` (신규) | 확정된 manifest 타입 |
| `cli/src/providers/manifest.ts` (신규) | 값 트리 검증, `$ref` 해석, tier 병합, redaction 표 수집 |
| `cli/src/providers/discovery.ts` (신규) | shell 미사용 PATH 탐색, version probe와 비교 |
| `cli/src/providers/projectConfig.ts` (신규) | `.impact-lens/provider.json` 읽기·검증 |
| `cli/src/providers/catalog.ts` (신규) | TypeScript reference preset 하나 |
| `cli/src/providers/resolve.ts` | 선택 우선순위 5단계와 session 값 |
| `cli/src/runtime.ts` | `bundledProviderLogArgs` export(+env 인자), `bundledModuleEntryPath` 추가, `bundledTypeScriptCommand` 제거 |
| `cli/src/errors.ts` | code 3종 추가 |
| `cli/src/test/runtime.test.ts` | 제거된 함수를 쓰던 테스트 2건 갱신 |
| `cli/src/test/providers.test.ts` (신규) | 41 테스트 |

**선택 우선순위의 구현 위치**는 `cli/src/providers/resolve.ts:chooseProvider`다. 다섯 갈래가 한 함수
안에 번호 주석과 함께 순서대로 있고, 그 뒤의 `autoDiscover`가 4·5단계를 담당한다.

**타 언어 fallback 금지를 두 곳에서 강제한다.** `autoDiscover`는 detected language를 claim하는 preset만
후보로 보고, `assertPresetSpeaksLanguage`는 explicit preset·project tier로 들어온 preset을 같은 기준으로
검사한다. 두 번째가 없으면 `providerPreset: bundled-typescript` + `.py` 조합이
`languageIdFrom: 'detected'` 때문에 languageId `python`으로 tsserver를 띄운다. 테스트로 고정했다.

**`selectedBy` 매핑을 tier가 아니라 "어떻게 골랐는가"로 정했다.**

| tier | `selectedBy` |
| --- | --- |
| raw custom command | `custom` |
| explicit preset (`providerPreset` / 환경변수) | `preset` |
| trusted project choice | `project` |
| auto-discovery, 고른 preset이 `bundled` tier | `bundled` |
| auto-discovery, 그 외 | `auto` |

마지막 두 줄이 중요하다. bundled preset은 **탐색되는 것이 아니라 tarball에 들어 있는 것**이므로
auto 경로로 골라도 `bundled`이 맞고, 그 덕분에 기존 사용자의 응답에서 `selectedBy`가 그대로 유지된다.
`auto`는 "PATH에서 찾아냈다"는 뜻으로 남겨둔다.

**bundled TypeScript preset이 오늘의 command를 그대로 만든다**

```
command: process.execPath
args:    [<resolved lib/cli.mjs>, '--stdio', ...(IMPACT_LENS_PROVIDER_LOG_LEVEL이 1~4일 때만 --log-level N)]
languageId: detected
```

`--log-level`은 manifest 어휘로 표현할 수 없는 유일한 항목이다(조건부는 manifest를 프로그램으로 만든다).
`presetCommand`가 bundled tier일 때만 덧붙이고, 이것을 **M1 manifest의 알려진 표현 한계**로 기록한다.

**`bundledModuleEntry` ref의 허용 목록은 한 줄이다.** 임의 specifier를 resolve하게 두면 manifest가 설치
경로를 알아내는 수단이 된다. `cli/src/runtime.ts:bundledModuleEntryPath`가
`typescript-language-server/lib/cli.mjs`만 받고 나머지는 `provider_config_invalid`로 거절한다.
resolve 자체는 `inspectBundledTypeScriptArtifact()`를 통과하므로 artifact 부재·읽기 실패 시
**오늘과 똑같은 재설치 안내 오류**가 나온다.

**`cli/src/errors.ts`에 3종을 추가했다** — `provider_executable_not_found`,
`provider_selection_ambiguous`, `provider_config_invalid`. 셋 다 이 PR의 코드가 실제로 던진다.
계약에 있으나 아직 안 던지는 나머지 8종은 그대로 뒀고, 그중 4종이 doctor의 check `code`로만 쓰인다는
사실을 주석에 적었다. `errors.test.ts`의 "선언했으면 생산해야 한다" 규칙은 그대로 통과한다.

**project 설정 파일의 절대 경로를 거절한다.** `.impact-lens/provider.json`은 저장소에 커밋되어 모든
체크아웃이 공유하므로 절대 경로는 어딘가에서 반드시 틀린다. IL-LIM-004의 "workspace 설정에는 preset ID와
최소 override만 저장하고 절대 경로는 사용자/CI 설정으로 둔다"를 검증 규칙으로 옮긴 것이다. 절대 경로가
필요하면 요청 수준 `provider` 블록을 쓴다.

**version probe는 doctor에서만 실행된다.** 선택 경로는 파일 존재 확인만 하고 프로세스를 만들지 않는다.
일반 analyze latency에 provider 프로세스를 더하지 않는다는 원칙이 여기서 지켜진다.

**검증**

| 검증 | 기준선 | 2단계 후 |
| --- | --- | --- |
| `npm run cli:build` | 통과 | 통과 |
| `npm run cli:test` | 63 pass / 0 fail | 105 pass / 0 fail (신규 41 + 기존 63, 갱신 1) |
| `npm test` | 35 pass / 0 fail | 35 pass / 0 fail |
| 고정 캡처 29종 `diff -r` | — | **29/29 byte 단위 동일** |

캡처가 전부 동일하다는 것은 bundled 경로가 `command`, `args`, `languageId`, `selectedBy`,
`requestedLanguageId`, `detectedLanguageId`, `languageMatch`, 오류 message·details·exit code, stdout 줄 수
어느 하나도 바뀌지 않았다는 뜻이다.

**중간에 실제로 고친 결함 1건**: version 파서의 첫 정규식이 `\b(\d+...)`였는데 `v3.0` 형태에서 `v`와 `3`
사이에 word boundary가 없어 `0`을 뽑았다. dotted run을 우선 시도하고 없을 때만 단일 숫자로 내려가는
형태로 바꿨다. 덕분에 `fixture-server-v2 1.4.0`도 제품명이 아니라 `1.4.0`을 고른다.


### 2026-08-27 — 캡처 기준선 재수립 (병렬 lane 오염 대응)

lead가 경고를 보냈다. **scratchpad와 `os.tmpdir()`의 고정 workspace 경로가 병렬 lane과 공유**되어 W1-C의
첫 baseline이 다른 lane에 덮여썼다는 것이다. 확인 결과 **이 lane도 같은 위험에 노출돼 있었다.**

- W0-4의 캡처 스크립트는 workspace를 `os.tmpdir()/il-provider-seam-capture-fixed`로 **lane 이름 없이**
  고정한다. 이 milestone에서 같은 스크립트를 쓰는 lane이 최소 넷이므로, 두 lane이 동시에 캡처를 뜨면
  같은 디렉터리를 서로 지우고 다시 만든다.
- 공유 scratchpad에 실제로 다른 lane의 산출물(`base4`, `base5`, `stage3`, `w1c`, `v-before-*` 등)이
  있었고, 내 출력 디렉터리 이름(`base1`~`base3`)은 그것들과 같은 관례를 쓰고 있었다.

**대응**

1. 캡처 workspace를 `il-m1-preset-catalog-capture-fixed`로 바꾸고 `IL_CAPTURE_WORKSPACE`로 덮어쓸 수
   있게 했다. 출력도 전부 `scratchpad/m1-preset-catalog/` 아래로 옮겼다.
2. **기준선을 처음부터 다시 떴다.** 오염 가능성이 있는 이전 캡처는 폐기했다.
3. 기준선을 이 worktree가 아니라 **`git archive origin/main | tar -x`로 별도 디렉터리에 펼친 독립 트리**에서
   빌드해 떴다. 내 작업 트리 상태에 전혀 의존하지 않는다.
4. 기준선을 **두 번 떠서 `diff -r`이 빈 것을 먼저 확인**한 뒤에야 기준선으로 인정했다.

**비교 기준을 `dbc6c9b`에서 `origin/main`(`f0cb40e`)로 올렸다.** 그 사이 W1-C(PR #36)가 merge되어 응답에
`completion` 등이 추가됐다. 옛 commit과 비교하면 W1-C의 변경이 내 lane의 변경으로 섞여 보이므로,
**이 lane만의 효과를 분리하려면 현재 `main`이 기준선이어야 한다.**

**함정 하나를 더 밟고 고쳤다.** 처음에는 baseline과 after에 **서로 다른** workspace 경로
(`ws-baseline` / `ws-after`)를 썼는데, 그 순간 29개 중 11개에서 diff가 났다. 원인은 `symbolId`가 파일
URI를 해싱한다는 것 — 즉 **workspace 경로를 고정하는 것으로는 부족하고, 비교하는 두 캡처가 같은 경로를
써야 한다.** 두 실행이 같은 경로를 순차로 쓰도록 바꾸자 diff가 정확히 의도한 2건으로 줄었다.
handover 8절의 `mkdtemp` 경고는 "고정하라"까지만 적었는데, 정확히는 **"양쪽이 같은 값으로 고정하라"**다.


### 2026-08-27 — 3단계: doctor 일반화

**변경한 파일**

| 파일 | 내용 |
| --- | --- |
| `cli/src/doctor.ts` | 삭제 |
| `cli/src/doctor/index.ts` (신규) | `runDoctor(preset, options)` 오케스트레이션과 두 개의 프로세스 check |
| `cli/src/doctor/checks.ts` (신규) | 던지지 않고 check를 돌려주는 개별 진단 |
| `cli/src/index.ts` | doctor dispatch 블록만 변경 |
| `cli/package.json` | `files`에 `dist/doctor/*.js` 추가 |
| `cli/src/providers/resolve.ts` | `resolveSessionValues` export |
| `cli/src/test/doctor.test.ts` (신규) | 15 테스트 |

**doctor가 구분하는 실패 종류** — 전부 `data.checks[].code`이고, `error.code`가 아니다.

| 실패 | check id | status | code |
| --- | --- | --- | --- |
| 실행 파일 부재 | `provider-executable` | `fail` | `provider_executable_not_found` (+ `install`) |
| 지원 범위 밖 version | `provider-version` | `fail` | `provider_version_unsupported` (+ `detected`, `supported`) |
| version 해석 불가 | `provider-version` | `warn` | `provider_version_unreadable` (+ `reason`) |
| language mismatch | `language-support` | `fail` | `provider_language_mismatch` (+ `detectedLanguageId`) |
| Call Hierarchy 미제공 | `initialize-capability-smoke` | `fail` | `provider_capability_missing` |
| fixture 실패 | `fixture-call-hierarchy` | `fail` | `provider_fixture_failed` (+ `reason`, `observedCallers`) |
| 설정 파일 손상 | `project-config` | `fail` | `provider_config_invalid` |
| 도달 불가 settings 키 | `settings-keys` | `warn` | — (`unreachableSections`) |
| Node 버전 미달 | `node-engine` | `fail` | `node_version_unsupported` |

`provider_version_unsupported`를 `fail`로, `provider_version_unreadable`을 `warn`으로 나눈 이유:
범위 밖이라는 것은 preset의 지원 선언에 근거한 사실이지만, version을 못 읽은 것은 서버만큼이나 우리
파서에 대한 정보다. 후자를 근거로 막으면 우리가 가진 것보다 강한 주장을 하게 된다.

**`--fixture`를 `--smoke`에서 분리했다.** capability probe는 initialize 한 번이고 fixture는 임시 workspace
생성 + prepare + incoming이다. 한 플래그에 묶으면 싼 check의 비용이 조용히 몇 배가 된다. 부수 효과로
`checks.at(-1).id === 'initialize-capability-smoke'`를 보는 기존 테스트가 그대로 통과한다.

**`fixture`를 preset 필드로 넣은 이유**는 4절 M3에 적었다. TypeScript preset의 fixture는 실제
bundled 서버로 통과하는 것을 확인했다(`observedCallers: ['fixtureCaller']`).

**중간에 실제로 고친 결함 1건**: 처음 구현에서 settings 트리를 command 해석과 같은 `resolveProvider`
호출에서 가져왔다. 그래서 **실행 파일이 없으면 settings check가 조용히 vacuous pass가 됐다.** "첫 실패가
뒤 check를 무력화하지 않는다"는 이 설계의 존재 이유를 정확히 위반하는 버그이고, 테스트가 잡았다.
settings 해석을 `resolveSessionValues`로 분리해 command 실패와 독립시켰다.

**`cli/src/doctor.ts`를 지우고 디렉터리를 만들면서 두 가지를 함께 했다.**

1. `cli/package.json`의 `files`에 `"dist/doctor/*.js"`를 추가했다. `"dist/**/*.js"`로 넓히지 않았다 —
   그러면 `dist/test`가 tarball에 끌려 들어간다.
2. `cli/src/index.ts`의 import를 `'./doctor'`가 아니라 **`'./doctor/index'`**로 적었다. 예전 빌드가 남긴
   `dist/doctor.js`가 있으면 Node의 해석 순서상 그것이 `dist/doctor/index.js`를 **가린다.** 실제로 이
   worktree에서 재빌드 후 `dist/doctor.js`가 남아 있는 것을 확인했다. 경로를 명시하면 그 해석 자체가
   사라진다. 검증 빌드는 매번 `cli/dist`를 지우고 새로 했다.

**`files` 한 줄이 load-bearing임을 실증했다.** `"dist/doctor/*.js"`를 뺀 상태로
`npm run test:plugin-artifact`를 돌리면 릴리스 tarball에서 설치한 CLI가 **모든 명령에서** 이렇게 죽는다.

```
code: 'MODULE_NOT_FOUND',
requireStack: [ '…/node_modules/@impact-lens/cli/dist/index.js' ]
```

되돌린 뒤 통과를 다시 확인했다. `npm run cli:test`와 `npm test`는 checkout의 `dist`를 직접 쓰므로
159개·35개가 전부 녹색인 채로 이 회귀를 놓친다.


### 2026-08-27 — 4단계: artifact E2E assert와 회귀 증명

**`scripts/test-plugin-artifact-e2e.mjs`의 기존 assert는 깨지지 않았다.** 우연이 아니라 설계의 결과다.
`selectedBy`를 tier가 아니라 "어떻게 골랐는가"로 정의했고, bundled preset은 PATH에서 **탐색되는 것이
아니라 tarball에 들어 있는 것**이므로 auto 경로로 골라도 `bundled`이다.

그래서 assert를 **느슨하게 바꾸지 않고 강화했다.** 새 계층에서 무엇이 참이어야 하는지를 추가로 적었다.

| 추가한 assert | 왜 |
| --- | --- |
| `provider.detectedLanguageId === fixture.languageId` | 새 선택 계층이 지켜야 할 규칙 그 자체. 다른 언어 provider가 물리면 빈 Call Hierarchy가 "아무도 안 부른다"와 구분되지 않는다 |
| `provider.requestedLanguageId === fixture.languageId` | 위와 같음. 서버에 **선언하는** 언어까지 고정한다 |
| `provider.languageMatch === true` | 위 둘의 판정 결과 |
| `doctor data.preset.id === 'bundled-typescript'` | doctor가 일반화됐으므로 어떤 preset을 진단했는지 고정한다 |
| `doctor data.status === 'ready'` + 모든 check `pass` | **doctor가 이제 부분 실패를 보고할 수 있다.** `mode`만 읽으면 모든 check가 fail이어도 통과한다. 패키징된 아티팩트가 뭔가 빠뜨렸을 때 doctor가 그것을 말하게 만드는 것이 이 assert의 값이다 |

기존 `selectedBy === 'bundled'`는 **정확 비교 그대로 뒀다.** 여기서 `auto`가 나온다면 릴리스가 사용자
머신에 설치된 무언가에 의존하기 시작했다는 뜻이고, 그것이 이 테스트가 잡아야 할 회귀다. 주석으로 그
이유를 남겼다. `stdout은 정확히 JSON 한 줄` 불변식(`parseEnvelope`)은 손대지 않았다.

**bundled 경로 응답 회귀 — 27/29 byte 단위 동일**

| 시나리오 | 결과 |
| --- | --- |
| analyze 성공 9종, 실패 12종, note 3종, CLI 표면 3종 (27개) | **byte 단위 동일** |
| `doctor-preflight`, `doctor-smoke` (2개) | 의도된 차이. 아래 |

doctor 응답의 차이는 **전부 additive**다. 제거되거나 의미가 바뀐 필드가 없다.

| 달라진 것 | 내용 |
| --- | --- |
| `data.preset` (신규) | `id`, `displayName`, `tier`, `languageIds`, `limitations` |
| `checks`에 3건 추가 | `language-support`, `settings-keys`, `project-config`. 전부 `pass` |
| stderr (smoke) | `impact-lens doctor: initializing bundled-typescript` 진행 로그 1줄 |

그대로 유지된 것: `data.status: 'ready'`, `data.mode`, 기존 check 3건의 id·순서·필드, `stdoutLines=1`,
exit 0, preflight의 **빈 stderr**.

**검증**

| 검증 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | tests 159 / pass 159 / fail 0 |
| `npm test` | tests 35 / pass 35 / fail 0 |
| `npm run test:plugin-artifact` | exit 0 (네트워크가 있어 실제로 실행) |
| `npm pack --dry-run` | total files 24. `dist/doctor/*.js` 2개, `dist/providers/*.js` 6개 포함 |
| 고정 캡처 29종 | 27 동일 / 2 의도된 doctor 차이 |


### 2026-08-27 — 최종 검증

`cli/dist`를 지우고 다시 빌드한 뒤 전부 실행했다.

| 검증 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | tests 159 / pass 159 / fail 0 |
| `npm test` | tests 35 / pass 35 / fail 0 |
| `npm run test:plugin-artifact` | exit 0. 네트워크가 있어 실제로 실행했다 |
| 캡처 after 두 벌 `diff -r` | 비어 있음 (변경 후 상태도 결정적이다) |
| 캡처 baseline vs after | 27/29 byte 단위 동일. `doctor-preflight`·`doctor-smoke` 2건만 의도된 additive 차이 |

`main`에서는 어떤 파일도 변경하지 않았다. 전 작업이 `feat/m1-preset-catalog`에서 이뤄졌고,
`origin/main`(`f0cb40e`)은 merge로만 가져왔다. force push와 history rewrite는 하지 않았다.
