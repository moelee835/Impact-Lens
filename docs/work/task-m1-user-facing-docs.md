# M1 사용자 문서 반영 — provider platform UX

- 작성일: 2026-08-31
- branch: `docs/m1-user-facing-docs`
- 대상 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대상 story: [IL-LIM-009 분석 완료 의미와 불완전성 전달](../development-management/stories/il-lim-009-completeness-semantics.md)
  수용 기준 "README, UI와 CLI schema의 용어가 일치한다"
- 근거 커밋: `main` `d2a37cb` (M1 구현 전부 merge 완료, `npm run cli:test` 258/258, `npm test` 58/58)
- 선행 조사: [W3-A 상태 도달 가능성 검증](task-m1-state-reachability.md) (PR #49),
  [W2-C plugin 응답 정책](task-m1-plugin-response-policy.md) (PR #48),
  [M1 사용자 테스트 명세](../development-management/user-tests/m1-user-test-spec.md) §2

## 목적과 사용자 가치

M1은 CLI/Extension에 provider preset catalog, `doctor <preset>` 일반화, `.impact-lens/provider.json` 프로젝트
설정, 요청 단위 provider override, 결과 완전성 어휘(`coverage.traversal`/`semantic`/`indexing`)를 이미
구현해 `main`에 merge했다. 그런데 사람이 읽는 문서(`README.md`, `INSTALL.md`)는 M1 기간 동안 갱신되지 않았다.

이 상태로 v0.7.0을 릴리스하면 사용자는 다음을 알 방법이 없다.

- provider를 아무것도 설정하지 않았을 때 무슨 일이 일어나는지(선택 계층: custom > preset > project > auto >
  unsupported).
- 오늘 자동으로 동작하는 언어가 TypeScript/JavaScript뿐이라는 사실과, 그 이유가 "아직 검증된 preset이
  없어서"이지 "곧 지원 예정"이 아니라는 것.
- `doctor`가 preset 일반 명령이 됐고 check 단위로 pass/warn/fail을 보고하며 첫 실패에서 멈추지 않는다는 것,
  그리고 custom provider는 여전히 doctor로 진단할 수 없다는 한계.
- `.impact-lens/provider.json`과 요청 단위 provider override에 실제로 어떤 필드를 쓸 수 있는지.
- `complete: true`가 정적 traversal 완료만 의미하고 `semantic: static-only`나 `indexing: unknown`을
  무효화하지 않는다는 것 — 이 문장은 이미 README에 한 줄 있지만 IL-LIM-009가 요구하는 "README/UI/CLI
  schema 용어 일치" 수준까지는 강화되어 있지 않다.
- Extension에 새로 생긴 `impactLens.provider.detailLevel`, `impactLens.provider.doctorCommandLine` 설정과
  `Impact Lens: Run Provider Doctor` 명령.

이 작업이 끝나면 README/INSTALL만 읽은 신규 사용자도 Auto가 무엇을 자동으로 하고 무엇을 하지 않는지, 실패했을
때 doctor로 무엇을 알아낼 수 있는지, `complete: true`를 보고 "안전하게 지워도 된다"고 결론 내리면 안 되는
이유를 코드를 열어보지 않고도 파악할 수 있다.

## 배경과 해결할 문제

- 이 세션(R2)은 4-lane 병렬 작업 중 하나다. R1(test lane, `cli/src/test/**`·`.github/workflows/**`·
  `scripts/**`)과 병렬 진행하며, R3(gate 판정 문서화)는 R1·R2가 PR을 연 뒤 조정 세션이 merge를 확인하고
  시작한다. 이 세션은 PR을 여는 것까지만 하고 merge하지 않는다.
- 대상 파일은 `README.md`, `INSTALL.md`, `cli/README.md`, `docs/DEVELOPMENT.md`(필요 시)로 지정됐다.
- **범위 충돌 발견**: 이 세션의 시스템 역할 정의(소유 경로)는 `plugins/**`, `.claude-plugin/**`, `.agents/**`,
  `README.md`, `INSTALL.md`, `CHANGELOG.md`만 소유하며 `cli/**`와 `src/**`는 명시적으로 수정 금지 대상이다.
  `cli/README.md`는 `cli/**` 아래에 있어 이 경계와 정면으로 충돌한다. 이 문서 자체가 상위 지시(작업 배정
  메시지)와 세션에 미리 설정된 권한 경계가 상충할 때 임의로 권한 경계를 넓히지 말라는 원칙에 따라, 이
  세션은 `cli/README.md`를 수정하지 않는다. 대신 실제 코드로 확인한 내용을 `README.md`의 "Agent CLI와
  Plugin"/"분석 경계" 절에 충분히 반영해 문서 공백을 최소화하고, `cli/README.md`가 여전히 M1 이전 상태로
  남아 있다는 사실을 완료 보고에서 별도로 표시한다. 아래 "범위와 범위에서 제외할 항목"과 최종 보고를 참고.

## 범위와 범위에서 제외할 항목

포함:

- `README.md`: 제공 기능 표, "Agent CLI와 Plugin", "분석 경계", "설정" 절에 provider 선택 계층, catalog
  현황, `doctor <preset>` 일반화, 프로젝트/요청 provider 설정, 결과 완전성 어휘, IL-LIM-009 어휘를 반영.
  Extension의 신규 설정 두 개와 `Run Provider Doctor` 명령, empty state 세 종류 구분을 반영.
- `INSTALL.md`: Agent CLI 설치 확인 절차와 문제 해결(9절)에 doctor 일반화, `.impact-lens/provider.json`,
  custom provider의 doctor 진단 한계를 반영.

제외(하지 않음):

- `cli/README.md` — 위 범위 충돌 사유로 이 세션(r2-user-docs)은 수정하지 않는다. **2026-08-31 정정: 조정
  세션이 같은 branch/PR에 별도 commit으로 처리했다. 아래 "2026-08-31 정정" 로그 참고.**
- 버전 번호 갱신(`0.6.3` → `0.7.0` 등) — R4 담당.
- `docs/DEVELOPMENT.md` — 조사 결과 이 문서는 provider/doctor를 아예 언급하지 않고 대상은 environment
  setup·build·test 절차라, "필요 시"에 해당하는 구체적 부정확 서술을 찾지 못했다. 변경하지 않는다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md` — 이 세션의 소유 경로(`plugins/**`)
  안에 있지만, 상위 지시가 "이 파일은 수정하지 않고 어휘만 맞춘다"고 명시했고 실제로 조사해 보니 이 파일은
  이미 M1 상태를 정확히 반영하고 있어(예: provider 선택 계층, `unknown`/`working`/`ready` 세 indexing 상태,
  `complete: true`가 `semanticScope`/`indexingStatus`를 무효화하지 않는다는 문장) 변경할 이유도 없다.
- 코드·설정 변경, 새 기능 서술, 코드로 확인하지 못한 동작 서술.

## 현재 구현 조사 결과 (코드 기준, 전부 파일:행으로 재확인)

1. **provider 선택 계층** — `cli/src/providers/resolve.ts:101-161`(`resolveProvider`)의 `chooseProvider`가
   `raw custom(요청 provider) > explicit providerPreset > .impact-lens/provider.json(project) > verified
   auto-discovery > unsupported(provider_required_for_language)` 순서를 구현한다. 언어가 안 맞는 preset은
   어떤 tier로 들어와도 `assertPresetSpeaksLanguage`(`resolve.ts:338-359`)가 거부하므로 "TS provider가 Python
   파일에 조용히 붙어 빈 그래프를 내는" 실패 모드가 구조적으로 막혀 있다.
2. **shipped catalog** — `cli/src/providers/catalog.ts:87`의 `PROVIDER_CATALOG`는 `bundled-typescript`
   하나뿐이다(`catalog.ts:36-85`). 파일 상단 주석이 명시하듯 "M1 delivers the preset machinery, not a list
   of languages"이고, gopls(M2)·Python(IL-LIM-006 대기)이 다음 후보다. 비-TS/JS 파일은 auto-discovery 후보가
   없어 항상 `provider_required_for_language`로 끝난다(`resolve.ts:240-252`).
3. **`doctor <preset>`** — `cli/src/doctor/index.ts:64-115`가 preset id를 받아 `nodeEngineCheck`,
   `cliPackageCheck`, `executableCheck`, `versionCheck`, `languageSupportCheck`, `settingsKeysCheck`,
   `projectConfigCheck`, (`--smoke`/`--fixture`에서) capability smoke와 fixture check를 전부 실행하고 각각
   `pass`/`warn`/`fail`로 기록한다(`doctor/checks.ts`). 첫 실패에서 멈추지 않는다(`doctor/index.ts:28-31`
   주석). preset id가 catalog에 없으면 `invalid_command`로 즉시 끝나 provider를 전혀 진단하지 않는다
   (`doctor/index.ts:68-77`) — custom(비-preset) provider를 doctor로 점검하는 경로가 없다는 뜻이다.
4. **`.impact-lens/provider.json`** — `cli/src/providers/projectConfig.ts:17`의 `ALLOWED_FIELDS`는
   `presetId`, `command`, `args`, `languageId`, `initializationOptions`, `settings` 6개뿐이다. `readiness`는
   허용 필드가 아니며, 이 파일 어디에도 그 필드를 읽는 코드가 없다.
5. **요청 단위 provider override** — `cli/schemas/request.schema.json`의 `impact.analyze` 스키마는
   `provider`(raw command/args/languageId), `providerPreset`, `initializationOptions`, `settings`를 받고
   `provider`와 `providerPreset`을 동시에 금지한다(`not.required`). 비밀 값은
   `cli/src/providers/manifest.ts:297-327`의 `SENSITIVE_KEY_PATTERN`
   (`/(token|secret|password|passwd|credential|api[-_]?key|auth)/i`, 4자 미만 제외)과 preset이 선언한
   dotted path(`preset.sensitive`)가 함께 redaction 대상 문자열 표를 만든다.
6. **결과 완전성 어휘** — `cli/schemas/response.schema.json`의 `completion`(`requestStatus`,
   `traversalStatus`, `semanticScope`, `indexingStatus`)과 `coverage`(`traversal`/`semantic`/`indexing`)가
   상태의 단일 출처다. `docs/work/task-m1-state-reachability.md`(PR #49)가 실행으로 증명한 바에 따르면
   shipped catalog(`bundled-typescript` 하나)로 실제 도달 가능한 completion 4-tuple은 3개뿐이고
   (`stateReachability.integration.test.ts:64-68`) 셋 다 `indexingStatus: unknown`이다.
   `ready`/`working`은 오늘 어떤 요청 JSON, `.impact-lens/provider.json` 또는 실제 CLI 진입점으로도 만들 수
   없고 test 전용 내부 API(`resolution.catalog` 생성자 override)로만 재현된다(같은 문서, `readiness` 필드는
   `ProviderPreset`에만 존재).
7. **`complete: true`가 보장하지 않는 것** — README §분석 경계에 이미 "`complete: true`는
   `coverage.traversal`이 완료됐다는 뜻이며 `semantic: static-only` 또는 `indexing: unknown`을 무효화하지
   않는다"는 문장이 있다(`README.md:226-227`, 이 작업 시작 시점). `plugins/impact-lens/skills/impact-lens-cli/
   references/cli-contract.md:117-120`은 같은 사실을 더 강하게 "Never produce the conclusions `no impact`,
   `safe to change`, `unused`, `fully analyzed`, `complete analysis`, `all callers`"로 명시한다. 두 문서가
   같은 결론(완전한 정적 traversal ≠ 영향 없음)을 말하되 README 쪽 표현이 상대적으로 약하다.
8. **Extension 신규 설정·명령** — `package.json:158-176`에 `impactLens.provider.detailLevel`
   (`summary`/`verbose`, 기본 `summary`)과 `impactLens.provider.doctorCommandLine`(machine scope, 기본
   빈 문자열)이 있다. `package.json:66-70`에 `Impact Lens: Run Provider Doctor` 명령이 있다. 구현은
   `src/controller.ts:641-712`(`runProviderDoctor`) — host-side 사실(caller 발견 여부, document symbol 존재
   여부, 마지막 분석의 provider/coverage)을 Output Channel에 출력하고, `doctorCommandLine`이 설정돼 있으면
   그 명령을 **전체 텍스트로 보여준 뒤에만** 명시적 확인을 받아 터미널에서 실행 제안하며 출력은 절대 읽어오지
   않는다. Empty state 세 종류는 `src/completeness.ts`와 `src/impactTreeProvider.ts:17-31`에 구현돼 있다.
   - "caller/provider 없음" 두 원인은 VS Code 공개 API가 구분할 방법이 없어 의도적으로 병합됐다
     (`completeness.ts:128-140` `noProviderSummary`, 주석의 "F1 and F19 are merged").
   - "정상 결과지만 caller가 0개" 상태는 `summarizeCompleteness`가 indexing 상태별로 다른 문구를 낸다.
   - 그래프가 아예 없는 최초 empty state(`EmptyItem`)와, 그래프는 있지만 완전성 caveat이 있는 상태
     (`NoticeItem`)는 `impactTreeProvider.ts:15-36`에서 타입 수준으로 분리돼 있다.

## 단계별 구현 계획

### 1단계 — README.md 갱신

- 목적: README만 읽는 사용자가 provider Auto 동작, catalog 현황, doctor 일반화, project/request 설정,
  결과 완전성 어휘, `complete: true`의 한계, Extension 신규 설정·명령을 코드와 일치하게 파악할 수 있게 한다.
- 산출물: "무엇을 확인할 수 있나요?"/"Agent CLI와 Plugin"/"분석 경계"/"설정" 절 갱신.
- 검증: 문서에 적은 명령(`doctor <preset>`, `.impact-lens/provider.json` 필드명 등)을 실제로 실행/조회해
  확인. 상대 링크 확인. `git diff --check`.

### 2단계 — INSTALL.md 갱신

- 목적: 설치 후 provider 확인·문제 해결 절차가 doctor 일반화와 project/request 설정을 반영하게 한다.
- 산출물: 3절(Agent CLI 설치), 9절(문제 해결) 갱신.
- 검증: 1단계와 동일.

두 단계는 서로 다른 파일이라 독립적으로 검증 가능하지만, 같은 사실 확인(코드 조사)에 기반하므로 하나의
commit으로 묶어 커밋 단위가 "이 세션이 실제로 조사해 확인한 M1 사용자 문서 갱신"이라는 하나의 의미를
갖게 한다.

## 테스트 및 완료 기준

- 문서 전용 변경이므로 `npm run cli:test`/`npm test` 재실행은 필수가 아니다(변경 파일이 test 대상이 아님).
- 문서에 적은 명령과 필드명을 실제로 한 번씩 실행/조회해 확인한다(아래 작업 로그에 기록).
- `git diff --check`로 공백 오류가 없는지 확인한다.
- README.md/INSTALL.md 안의 상대 링크가 실제 파일을 가리키는지 확인한다.
- 완료 기준: 위 "포함" 목록의 8개 항목이 코드 근거와 함께 README.md/INSTALL.md에 반영되고, `cli/README.md`를
  건드리지 못한 이유와 잔여 공백이 최종 보고에 별도로 기록된다. **2026-08-31 정정: `cli/README.md` 공백은
  조정 세션의 addendum commit으로 닫혔다 — 더 이상 잔여 공백이 아니다.**

## 작업 로그

### 2026-08-31 — 조사 및 범위 충돌 확인

- `cli/src/providers/resolve.ts`, `catalog.ts`, `projectConfig.ts`, `cli/src/doctor/index.ts`,
  `doctor/checks.ts`, `cli/schemas/request.schema.json`, `cli/schemas/response.schema.json`,
  `cli/src/providers/manifest.ts`, `cli/src/providers/preset.ts`를 직접 읽고 위 "현재 구현 조사 결과"를
  작성했다.
- `docs/work/task-m1-state-reachability.md`와 그 test 파일(`cli/src/test/stateReachability.integration.test.ts`)
  에서 shipped catalog 도달 가능 상태 3개(`indexingStatus: unknown`)와 `ready`/`working`이 오늘 사용자가
  설정할 수 없는 test 전용 경로로만 도달 가능하다는 사실을 재확인했다.
- `package.json`의 `impactLens.provider.detailLevel`/`impactLens.provider.doctorCommandLine`과
  `src/controller.ts`의 `runProviderDoctor`, `src/completeness.ts`/`src/impactTreeProvider.ts`의 empty state
  구분을 확인했다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`를 전체 읽고 이미 M1 상태를 정확히
  반영하고 있음을 확인했다(이 세션에 배정된 작업 배경 정보의 "line 126-128이 구식"이라는 서술은 이
  worktree의 실제 파일 내용과 일치하지 않았다 — 해당 파일은 이미 provider 선택 계층과 세 indexing 상태를
  정확히 설명한다. 최종 보고에서 이 불일치도 별도로 표시한다).
- **범위 충돌 발견**: 작업 배정 메시지는 `cli/README.md`를 대상 파일로 지정했지만, 이 세션의 시스템
  역할 정의는 `cli/**`를 명시적으로 수정 금지 대상으로 고정한다. 코드를 확인한 결과 `cli/README.md`는
  M1 이전 상태 그대로다(providerPreset, project config, doctor 일반화, `completion` 필드, 세 indexing 상태
  중 어느 것도 언급하지 않는다). 이 세션은 사전에 설정된 권한 경계를 스스로 넓히지 않고 `cli/README.md`를
  수정하지 않기로 했다. 대신 README.md 자체에 필요한 내용을 충분히 반영해 최소한 최상위 진입 문서는
  정확하게 유지하고, `cli/README.md` 갱신이 남은 후속 작업이라는 것을 최종 보고에서 명시한다.
- branch를 worktree 기본 이름(`worktree-agent-ad65e9c6c64ba60cc`)에서 `docs/m1-user-facing-docs`로
  변경했다(`git branch -m`). 변경 전 `git status --short --branch`로 clean 상태와 `origin/main`(`d2a37cb`)과
  HEAD가 정확히 일치함을 확인했다.

### 2026-08-31 정정 — `cli/README.md` 범위 충돌 해소 (조정 세션 addendum)

이 세션(r2-user-docs)이 위에서 기록한 범위 충돌 판단 — "사전에 설정된 권한 경계를 스스로 넓히지 않는다" —
은 그대로 옳았다. 이 세션은 조정 세션의 명시적 위임 메시지에도 `cli/README.md`를 수정하지 않았다: 다른
에이전트 세션의 메시지는 harness가 부여한 권한 경계를 확장할 수 없기 때문이다(사용자 또는 권한 시스템만 가능). 이 판단은 "가능하면 사용자 승인까지
끝낸다"는 상위 지시보다 우선한다.

대신 **조정 세션(`coder`) 자신이 별도 local worktree(`coder/r2-cli-readme-addendum`, `origin/docs/m1-user-facing-docs`
기준)에서 직접 `cli/README.md`를 갱신**해 같은 branch/PR(#53)에 추가 commit으로 반영했다. 조정 세션은
`cli/**` 수정 금지 같은 경로 제약이 없으므로 이것은 권한 확장이 아니라, 애초에 범위 충돌이 없는 세션이
남은 파일을 처리한 것이다.

반영 내용(전부 코드 재확인 후 작성, 위 "현재 구현 조사 결과" 1·2·3·4·5·6항과 동일 근거):

- `## Contract` 절에 `data.completion`이 상태의 단일 출처라는 문장과, `complete: true`가 보장하지 않는 결론
  목록(`no impact`/`safe to change`/`unused`/`all callers`)을 추가. `coverage.indexing`이 `unknown`/`working`/
  `ready` 3값이며 오늘 shipped catalog로는 `unknown`만 도달 가능하다는 문장으로 교체.
- `## Bundled provider doctor`를 `## Provider doctor`로 일반화: `--fixture` 플래그 추가, check 목록을 preset
  일반 명령에 맞게 갱신, custom provider는 doctor로 진단 불가하고 미등록 preset은 `invalid_command`로 즉시
  끝난다는 문장과 실제 오류 JSON 예시 추가.
- 새 `## Provider selection` 절: 5단계 선택 순서(raw custom > explicit preset > project > verified auto >
  unsupported)와 언어 경계를 절대 넘지 않는다는 문장, `### Shipped catalog`(`bundled-typescript` 하나뿐,
  "곧 지원" 아님), `### .impact-lens/provider.json과 요청 단위 override`(허용 필드 6개 표 + redaction 휴리스틱)
  하위 절 추가.
- 기존 provider 예시 절은 `## Custom provider`로 이름을 바꾸고 그대로 유지(custom command JSON 예시,
  lifecycle 오류 코드).

검증(직접 실행, README/INSTALL과 동일 기준):

- `cli/` 의존성을 이 worktree에 새로 설치(`cd cli && npm install`) 후 `npm run cli:build` 성공.
- `node cli/dist/index.js doctor bundled-typescript` → `checks` 배열에 `node-engine`/`cli-package`/
  `bundled-provider-artifact`/`language-support`/`settings-keys`/`project-config` 각각 독립 `pass`, 최상위
  `status: "ready"` 관측(이 환경엔 로컬 `typescript-language-server`가 설치돼 있어 r2-user-docs가 관측한
  `status: "blocked"`와 다른 결과가 나왔다 — 두 결과 모두 "각 check가 독립적으로 보고되고 첫 실패에서
  멈추지 않는다"는 문서 서술과 일치하며 모순이 아니다).
- `node cli/dist/index.js doctor not-a-real-preset` → `invalid_command`/`Unknown provider preset`/exit 2,
  `details.knownPresetIds: ["bundled-typescript"]` 관측.
- 임시 워크스페이스에 `{"presetId":"bundled-typescript","typo":true}`인 `.impact-lens/provider.json`을 두고
  `doctor bundled-typescript --workspace <dir>` 실행 → `project-config` check가 `provider_config_invalid`/
  "it has unknown fields: typo."로 실패함을 관측.
- `git diff --check` 통과. 임시 fixture(`/tmp/il-cli-readme-fixture`)는 검증 후 삭제.
- 이 변경은 `cli/README.md` 한 파일만 건드리므로 `npm run cli:test`/`npm test` 재실행은 대상 밖이다(문서
  전용 변경, 코드 미변경).

이로써 원래 "포함" 목록에서 유일하게 미해결이던 `cli/README.md` 공백이 닫혔다. R2 lane 전체(README.md +
INSTALL.md + cli/README.md)가 이제 완료 기준을 충족한다.

### 2026-08-31 — README.md/INSTALL.md 갱신과 실행 검증

- `README.md`: "무엇을 확인할 수 있나요?" 표에 provider 행 추가, "Agent CLI와 Plugin" 아래에 "Provider 선택
  순서"/"`doctor <preset>`로 provider 진단"/"`.impact-lens/provider.json`과 요청 단위 override" 세 절 추가,
  "분석 경계" 아래에 "`complete: true`가 증명하지 않는 것" 절 추가(IL-LIM-009/`cli-contract.md` 어휘와
  맞춤 — "안전하게 지워도 된다", "영향 없음", "완전히 분석됨", "모든 호출자를 확인함"을 금지 결론으로
  명시), "설정" 표에 `impactLens.provider.detailLevel`/`impactLens.provider.doctorCommandLine` 행과
  empty state 설명 추가, "개발" 절 명령 목록에 `Impact Lens: Run Provider Doctor` 추가.
- `INSTALL.md`: 3절의 doctor 안내를 preset 일반화·check 단위 pass/warn/fail·custom provider 진단 불가로
  갱신, 9절 "Extension에서 caller가 나타나지 않음"에 Run Provider Doctor와 caller/provider 병합 empty
  state 설명 추가, "CLI에서 provider 오류"를 provider 선택 순서·`provider_selection_ambiguous`·
  `provider_config_invalid`·custom provider doctor 한계로 확장.
- **실제 실행으로 검증**(코드만 읽고 쓰지 않았다):
  - `npm run cli:build` 성공 후 `node cli/dist/index.js doctor bundled-typescript`를 실행해 check별
    `pass`/`fail` 배열(`node-engine`/`cli-package`/`bundled-provider-artifact`/`language-support`/
    `settings-keys`/`project-config`)과 `status: "blocked"`(첫 실패에서 멈추지 않고 나머지 check가 이어짐)를
    직접 관측했다.
  - `node cli/dist/index.js doctor not-a-real-preset`을 실행해 `invalid_command`/`Unknown provider preset`/
    exit 2를 관측해 "custom·미등록 preset은 doctor로 진단할 수 없다"는 README/INSTALL 서술을 확인했다.
  - 임시 워크스페이스에 `{"presetId": "bundled-typescript", "typo": true}`인 `.impact-lens/provider.json`을
    두고 `doctor bundled-typescript --workspace <dir>`을 실행해 `project-config` check가
    `provider_config_invalid`/"it has unknown fields: typo."를 정확히 보고함을 확인했다 — README/INSTALL의
    `ALLOWED_FIELDS` 서술과 일치한다.
  - `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`에 대한 상대 링크와 README/
    INSTALL의 다른 모든 상대 링크를 스크립트로 존재 확인했다(모두 OK).
  - `git diff --check`로 공백 오류 없음을 확인했다. 처음 작성한 INSTALL.md 문단 하나에서 인라인 코드
    span(`` `provider_required_for_language` ``)이 줄바꿈 중간에서 끊겨 렌더링 시 식별자 가운데 공백이
    삽입될 위험을 발견해 즉시 한 줄로 재배치했다(CommonMark는 code span 안의 줄바꿈을 공백으로 치환한다).
  - `cli/dist`는 `.gitignore`에 있어 빌드로 생긴 파일이 `git status`에 나타나지 않음을 확인했다(정리 불필요).
- 이 단계는 코드·설정을 변경하지 않았으므로 `npm run cli:test`/`npm test` 재실행은 하지 않았다(변경 파일이
  test 대상이 아님, 작업 문서 "테스트 및 완료 기준"에 기록한 대로).

### 2026-08-31 정정 — reviewer 검토 반영 (조정 세션)

`reviewer` 세션이 PR #53을 검토해 2건의 수정과 1건의 범위 추가를 요청했다. 조정 세션이 같은 worktree에서
직접 반영했다.

1. **[blocker] `cli/README.md`의 readiness 문장이 `README.md`와 정반대였다.** `cli/README.md`가 "A
   user-configured provider with its own `readiness` profile can still report `working` or `ready`"라고
   썼는데, `README.md:307-308`은 정반대로 "오늘은 사용자가 요청 JSON이나 `.impact-lens/provider.json`으로
   만들 수 없다"고 정확히 썼다. 직접 재확인: `request.schema.json`에 `readiness` 필드가 없고
   `projectConfig.ts`의 `ALLOWED_FIELDS`(6개)에도 없다 — 오늘 사용자가 붙일 경로가 존재하지 않는다.
   `cli/README.md`를 `README.md` 쪽 사실에 맞춰 정정: "`working`/`ready`는 `readiness`를 선언한 preset이
   catalog에 들어와야만(코드 변경) 나타나며, 오늘의 요청 필드나 `.impact-lens/provider.json` 필드로는
   만들 수 없다."
2. **[경미] `invalid_command` 예시가 실제 출력과 달랐다.** `node dist/index.js doctor not-a-real-preset`을
   다시 실행해 실제 출력 전체(`retryable:false`, `details.stage:"startup"` 포함)를 확인하고 예시를
   그대로 교체했다.
3. **[범위 추가] 같은 거짓 문장이 `main`의 shipped plugin 문서에도 있었다.** `cli/README.md`의 그 문장은
   `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:138-140`(이 worktree 기준
   행 번호)에서 옮겨온 것이었고, 원본이 먼저 틀려 있었다. **이것은 PR #51(`fix/m1-reachability-naming`)이
   의도했던 정정이 빠뜨린 자리다** — PR #51은 `USER_CONFIGURED_ADDITIONAL_REACHABLE`이라는 이름이 "사용자
   설정으로 도달 가능"하다는 인상을 준다는 이유로 개명했지만, 실제로 변경한 파일은
   `stateReachability.integration.test.ts`, `stateReachability.sources.test.ts`, 작업 문서 3개뿐이었고
   `cli-contract.md`는 손대지 않았다. reviewer의 지시대로 별도 PR로 쪼개지 않고 이 PR(#53)에 함께 반영했다
   — 같은 문장·같은 결함이라 분리하면 두 문서가 한동안 서로 다른 말을 하게 되고, R4가 이 파일이 속한
   plugin payload를 0.3.0으로 올리기 전에 고치지 않으면 거짓 문장을 새 버전으로 발행하게 되기 때문이다.
   `plugins/**`는 `il-plugin-docs` 소유 경로이므로 이 변경 자체는 범위 충돌이 아니다. 다만 그 역할 정의가
   "문구 변경이 plugin 응답 정책에 해당하면 대응하는 eval 또는 contract fixture를 함께 갱신한다"고
   요구하므로 `npm run test:response-policy`를 재실행했다 — **16/16 통과**(기존과 동일한 fixture 10개 +
   doc invariant 6개, negative-direction 포함). `working`/`ready` code span 표시가 그대로 유지돼
   "un-marking every `working` code span... fails" 음의 방향 증명도 영향받지 않았다.
   **R3에 후속 항목으로 남긴다: PR #51의 정정이 `cli-contract.md`를 빠뜨렸다는 사실을 gate 판정 문서에
   기록해야 한다.**
4. reviewer는 기존 `README.md:219-229`와의 중복·모순은 없다고 확인했다(226-227행의 `complete: true` 한
   줄을 정확히 치환하고 새 절로 확장했을 뿐 겹쳐 쓰지 않음) — 별도 조치 불필요.

검증: `git diff --check` 통과. `npm run test:response-policy` 16/16 통과(위 3번). `cli/README.md`/
`cli-contract.md` 변경은 문서 전용이라 `npm run cli:test`/`npm test` 재실행은 대상 밖이다.
