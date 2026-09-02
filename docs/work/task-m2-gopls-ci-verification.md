# M2 — gopls preset CI 검증 (stage 3)

- 상태: In progress — PR [#60](https://github.com/moelee835/Impact-Lens/pull/60) open, 3-OS CI 결과
  대기 중
- branch: `test/m2-gopls-ci-verification`
- 선행 PR: [#58](https://github.com/moelee835/Impact-Lens/pull/58)(merge `13378e1`) — `gopls` preset을
  shipped catalog에 추가(M2 stage 1·2), [#59](https://github.com/moelee835/Impact-Lens/pull/59)
  (merge `fe0c239`) — `.go` 파일이 `languageId()`에서 `plaintext`로 감지돼 gopls가 실사용자 경로로
  도달 불가능했던 결함 수정(이 lane이 실제 왕복 test를 처음 작성하다 발견)
- 상위 계획: `m2-gopls-plan.md`(계획 세션 작성, 저장소 밖 scratchpad) §3,
  `m2-gopls-stage3-ci.md`(계획 세션이 stage 3 결정 사항을 확정한 문서, 저장소 밖 scratchpad — 이 문서에
  핵심 판단 근거를 옮겨 적는다)

## 목적과 사용자 가치

PR #58의 `gopls` preset은 `lastVerified: { date: '2026-09-01', versions: ['0.19.1', '0.23.0'] }`를
**darwin/arm64로 한정**해 주장한다 — 이 machine에서 사람이 직접 실행해 확인한 것 이상을 주장하지 않기
위해서다. 하지만 Impact Lens는 Windows/macOS/Linux 세 OS에 배포된다. **지금은 macOS 개발자 외의 사용자가
`gopls`를 설치해도 이 CLI가 실제로 동작하는지 아무도 검증한 적이 없다** — 검증 없이 "동작한다"고 주장하는
것과 실제로 동작하는 것은 다르고, 이 lane이 메우는 것이 그 공백이다.

또한 PR #58은 `coverage.indexing.status`의 `ready`/`working`이 "실사용자가 도달 가능하다"고 정정했지만,
**이 저장소의 어떤 자동 test도 실제 gopls로 그 도달을 관측한 적이 없다** — 근거는 사람이 한 번 실행해 본
수동 조사뿐이다. "도달 가능"과 "관측됨"은 다른 주장이고, 이 lane이 후자를 만든다.

이 lane이 끝나면:
- 3개 OS 전부에서 `gopls` 설치와 Call Hierarchy 동작이 CI로 자동 재검증된다 — 이후 누군가
  `golang.org/x/tools`나 Go 툴체인을 바꿔도 회귀가 사람 손 없이 잡힌다.
- `coverage.indexing.status`의 `ready`(그리고 가능하면 `working`)가 real gopls로 CI에서 실제로
  관측된다 — "도달 가능" 주장에 자동 검증 근거가 생긴다.
- 이 lane이 끝나도 `lastVerified`의 OS 범위나 README의 지원 OS 서술은 넓히지 않는다 — CI가 3개 OS에서
  통과한 뒤에만(이 문서의 완료 기준 확인 후) 별도 작업으로 넓힌다. 그 확대 자체는 M2 stage 4 범위다.

## 배경과 해결할 문제

`docs/work/task-m2-gopls-preset.md`(stage 1·2)가 이미 gopls의 Call Hierarchy 지원, 버전 정책,
readiness 신호를 darwin/arm64에서 검증했다. milestone M2 문서는 포함 범위에 "Windows/macOS/Linux
executable discovery와 version policy"를 명시하고, 위험 대응에 "언어별 job/cache를 분리하고 한 언어
실패가 다른 언어의 지원 근거를 숨기지 않게 한다"고 적었다 — 지금 `unit-tests.yml`은 job 하나뿐이라 이
요구를 충족하지 못한다.

## 범위와 범위에서 제외할 항목

**포함**:
- 3개 OS(ubuntu/macos/windows) matrix로 Go 툴체인과 **버전 고정** gopls를 설치하는 별도 CI job.
- `stateReachability.integration.test.ts`에 real gopls 기반 row 추가(`ready`, 가능하면 `working`) —
  로컬에서는 gopls 부재 시 skip, CI job에서는 skip을 실패로 취급.
- 회귀 확인: `test:plugin-artifact`의 TypeScript 선택 결과, `buildInvocation.sources.test.ts` guard.

**포함(commander 결정, 2026-09-02)**: README.md/`m1-user-test-spec.md`의 "catalog에 preset이
`bundled-typescript` 하나뿐" / "`verified-external` tier preset이 하나도 없다" 서술 정정 — 단
**이 PR의 CI가 3개 OS에서 실제로 green이 된 뒤, `lastVerified` OS 확대와 같은 commit에서 한 번에**
처리한다(아래 "알면서 남겨둔 창" 참고). 미리 catalog 개수만 고치고 나중에 OS 범위를 또 고치면 같은
문단을 두 번 건드리게 된다.

**제외(stage 4 이후)**:
- Python/clangd(M2의 나머지 lane) — 이 lane은 gopls 하나만 다룬다.

## 알면서 남겨둔 창 — README·user-test-spec의 "preset 하나뿐" 서술 (닫힘, 2026-09-02)

**CI가 3개 OS(ubuntu-latest, macos-latest, windows-latest) 전부에서 green이 된 뒤, 아래 목록을
`git grep`으로 재생성해 한 번에 정정했다.** `README.md`, `cli/README.md`(재생성 과정에서 처음
발견 — 아래 참고), `m1-user-test-spec.md`, `cli-contract.md` 전부 반영. `lastVerified` OS 확대는
`catalog.ts`에 별도로 반영(아래 "OS 확대" 참고).

원래 발견 시점(`main` `fe0c239` 기준) 목록:

- `README.md:196` — "검증된 auto-discovery — ... 정확히 하나뿐이고" (일반 서술, 그 자체로는 여전히 참 —
  "정확히 하나"라는 선택 규칙 자체는 맞고, 문제는 다음 줄).
- `README.md:201` — **"오늘 shipped catalog에는 preset이 `bundled-typescript` 하나뿐입니다."** —
  `main`에서 이미 거짓이다. gopls가 두 번째 `verified-external` preset으로 들어와 있다.
- `README.md:308` — "shipped catalog(오늘은 `bundled-typescript`뿐)는 색인 상태를 선언하지 않으므로
  오늘 실제로 볼 수 있는 값은 `unknown`뿐" — 거짓이다. gopls는 readiness를 선언하므로 `ready`/`working`도
  이제 실사용자가 볼 수 있다.
- `docs/development-management/user-tests/m1-user-test-spec.md:60` — "`verified-external` tier preset이
  catalog에 하나도 없다" — 거짓이다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:142` — "Those two states only
  start appearing once a preset that declares `readiness` enters the shipped catalog" — 이 문장 자체는
  조건문이라 아직 거짓이 아니지만, 조건이 이미 충족됐다는 사실이 근처 문맥에 반영돼야 한다(직접 재확인
  필요).

**지금 고치지 않는 이유**: OS 지원 범위(`lastVerified`가 darwin/arm64 한정)는 이 PR의 CI 결과가 나와야
확정된다. catalog 개수만 먼저 고치면 같은 문단을 OS 확대 시점에 또 고쳐야 한다 — PR #55가 이미 정적
목록이 낡는 전례를 남겼다. 이 PR의 CI가 3-OS 전부 green이 된 뒤, 이 섹션 바로 아래 "OS 확대와 문서
정정" 작업 로그 항목에서 `git grep`을 다시 실행해 위 목록을 재생성하고 한 번에 처리한다.

**왜 급하지 않은가(commander 판정)**: 지금 거짓인 방향이 **과소진술**이다 — "Go 지원 안 함"이라고 적혀
있는데 실제로는 된다. 사용자가 결과를 과신하게 만드는 방향(readiness 과장류)과 반대 성질이라 급한
안전 문제는 아니다. 그래도 **release 전에는 반드시 닫혀야 하는 gate**로 취급한다 — 다음 release에
이 서술이 그대로 나가면 사용자가 실제로 가능한 걸 못 하는 줄 알고 넘어간다.

**발행된 v0.7.0과의 구분**: v0.7.0(이미 발행 완료, `docs/work/task-...v0.7.0...` 참고)은 gopls가 없는
시점에 발행됐으므로, 그 릴리스가 가리키는 README/문서 스냅샷에 대해서는 위 서술이 **여전히 참**이다.
이 gap은 `main`(다음 release 후보)에만 해당한다.

### 실제 정정 내역

- `README.md:201` — "preset이 `bundled-typescript` 하나뿐" → 두 preset(`bundled-typescript`, `gopls`)
  명시, Python/C·C++가 다음 후보라고 정정.
- `README.md:305-308` 부근 — `working`/`ready`가 "오늘 사용자가 만들 수 없다"고 했던 문장을, gopls로
  Go 프로젝트를 분석하면 실제로 도달한다고 정정.
- **`cli/README.md`(원래 목록에 없었다 — `git grep`을 CLI 하위 README까지 넓혀 재실행하다 발견)**:
  `:184` "catalog has exactly one entry today, `bundled-typescript`" → 두 entry로 정정.
  `:110-115` "No preset in the shipped catalog declares a readiness profile, so unknown is the only
  value reachable today" → gopls는 선언한다고 정정. **이건 원래 "알면서 남겨둔 창" 목록 자체가
  불완전했다는 뜻이다** — PR #55가 이미 겪은 "정적 목록이 낡는다"는 위험이 이번엔 발견 단계에서부터
  나타났다. 다음에 이런 sweep을 할 땐 `README.md`뿐 아니라 하위 디렉터리의 모든 `README.md`/`*.md`를
  `git grep`으로 훑어야 한다는 교훈으로 남긴다.
- `docs/development-management/user-tests/m1-user-test-spec.md:60` 등 3행 — 원문은 지우지 않고(이
  표 자체가 M1 시점 기록으로서의 가치가 있음), 2026-09-02 정정 인용문을 표 바로 아래에 추가해 Go에
  한해 검증 가능해졌다고 명시.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:137-145` — "No preset...
  declares a readiness profile yet... cannot reach ready or working through any configuration available
  today"를 gopls 기준으로 정정. `test:response-policy`의 doc-invariant check(SKILL.md/cli-contract.md/
  analyze.md의 구조적 불변식을 검증)가 이 수정 후에도 통과함을 확인 — 이 파일은 자유 형식 문서가
  아니라 검증되는 계약이므로 이 확인이 필요했다.
- `cli/src/providers/catalog.ts`의 `lastVerified` 주석 — darwin/arm64 전용 서술을, "0.19.1은 CI가 3-OS
  실제 검증, 0.23.0은 여전히 darwin/arm64 수동 검증뿐"이라고 버전별로 정정(과장 방지 — 0.23.0까지
  3-OS로 확대 주장하지 않는다).

## 현재 구현 조사 결과

- `.github/workflows/unit-tests.yml`: job 하나(`ubuntu-latest`)에서 `npm test` + `cli:test` +
  `test:response-policy`. Go 툴체인 없음.
- `.github/workflows/plugin-artifact-e2e.yml`: 이미 3-OS matrix(`fail-fast: false`) 패턴이 있다 — 이
  lane의 Go job이 그대로 재사용할 구조.
- `cli/src/test/stateReachability.integration.test.ts`: `SHIPPED_CATALOG_REACHABLE`(bundled-typescript,
  `unknown`만)과 `CATALOG_DECLARED_READINESS_REACHABLE`(mock 서버, `ready`/`working`) 두 배열과 그
  cross-check만 있다. real gopls를 쓰는 row가 없다.
- `resolveProvider(file, command, options)`(`cli/src/providers/resolve.ts:117`)는 `options.catalog ??
  PROVIDER_CATALOG`다 — `LspCallHierarchyProvider`를 `resolution` 옵션 없이 생성하면 **실제 shipped
  catalog**로 auto-discovery한다. `.go` 파일을 주면 `gopls`가 유일한 후보라 `selectedBy: 'auto'`로
  선택된다(이미 `providers.test.ts`가 이 경로 자체는 검증함). 이게 이 lane이 mock 없이 "real user path"를
  만들 수 있는 이유다.
- `cli/src/providers/discovery.ts`의 `findExecutable('gopls')`로 로컬에 gopls가 있는지 test 파일
  안에서 동기적으로 확인할 수 있다.

## 단계별 구현 계획

### 1단계 — CI job과 stateReachability Go rows (하나의 commit)

- 목적: gopls를 CI 3개 OS에 설치하고, 그 설치가 실제로 Call Hierarchy를 동작시키는지 자동으로
  재확인한다. "도달 가능"과 "관측됨"을 분리한다.
- 산출물: 새 workflow(또는 `unit-tests.yml`에 분리된 job) `go-provider`(matrix ubuntu/macos/windows),
  `stateReachability.integration.test.ts`에 real-gopls 기반 test 2개(ready, working) 추가, 로컬/CI
  skip-vs-fail 분기.
- 검증: 로컬(gopls 없음)에서 `npm run cli:test`가 skip으로 통과, `IMPACT_LENS_REQUIRE_GOPLS=1`을 주고
  gopls가 없는 상태로 실행하면 실패(직접 재현), CI 3개 OS 전부 green, `test:plugin-artifact`와
  `buildInvocation.sources.test.ts` 회귀 없음.

## 테스트 및 완료 기준

- [x] 새 Go CI job(`go-provider`)이 `unit-tests.yml`의 기존 job과 분리돼 있고 `fail-fast: false`인
  3-OS matrix다.
- [x] gopls가 버전 고정(`v0.19.1`, `@latest` 아님)으로 설치되고, job 로그에 실제 `gopls version` 출력이
  남는다.
- [x] Go job에서 `IMPACT_LENS_REQUIRE_GOPLS=1`이 설정돼 있고, gopls가 없으면 skip이 아니라 fail한다는
  것을 로컬에서 직접 재현해 확인했다.
- [x] `stateReachability.integration.test.ts`에 real gopls 기반 `ready` row 추가, 로컬(gopls 있음)에서
  통과 확인.
- [x] `working` row도 추가해 통과 확인(readiness budget만 override, 나머지는 shipped preset 그대로).
- [x] `npm run test:all` 로컬 통과(gopls 있음/없음 양쪽), `test:plugin-artifact`의 TypeScript
  `selectedBy: 'bundled'` 유지 확인.
- [x] `buildInvocation.sources.test.ts`는 `cli/src` 아래 `.ts` 파일만 스캔하고 `.github/workflows/`의
  `go install`은 대상이 아니다 — CI 설정은 제품 코드가 아니므로 이 guard의 범위 밖이라는 구분을 확인
  (guard 소스를 직접 읽어 확인, 4/4 재실행 통과).
- [x] CI에 push한 뒤 3개 OS 전부 green 확인 — 1차(`33585611214`)에서 확인, PR #61 merge 후 rebase한
  2차(같은 run)에서도 재확인.
- [x] 3개 OS 전부 green 확인 **후**, `git grep`을 재실행해 README.md/`cli/README.md`(sweep 중 새로
  발견)/`m1-user-test-spec.md`/`cli-contract.md`의 "preset 하나뿐"/"readiness 도달 불가" 서술과
  `catalog.ts`의 `lastVerified` 주석(버전별로 구분: 0.19.1은 3-OS, 0.23.0은 여전히 darwin/arm64만)을
  한 commit에서 정정했다.

## 작업 로그

### 2026-09-02 — 착수

- PR #58 merge(`13378e1`) 확인, local main fast-forward, 이 branch를 `main`에서 분리.
- stage 3 결정 사항(`m2-gopls-stage3-ci.md`) 확인 — 별도 job, 버전 고정, skip-을-fail로 강제하는
  요구사항을 그대로 반영한다.

### 2026-09-02 — CI job과 real-gopls test 구현, 착수 중 `.go` 도달 불가 결함 발견(PR #59로 분리)

- `.github/workflows/unit-tests.yml`에 `go-provider` job 추가: matrix
  ubuntu-latest/macos-latest/windows-latest, `fail-fast: false`, `actions/setup-go`로 Go 1.26.1(1단계가
  실제로 검증한 조합), `go install golang.org/x/tools/gopls@v0.19.1`(버전 고정, `lastVerified.minimum`과
  일치), `IMPACT_LENS_REQUIRE_GOPLS=1` 환경변수로 이 job 안에서는 gopls-gated test가 skip이 아니라
  fail하도록 강제. 설치된 `gopls version`을 로그에 남긴다.
- `stateReachability.integration.test.ts`에 real-gopls 기반 test 2개 추가(`goplsGatedTest` 헬퍼로
  로컬 skip/CI fail 분기): (1) test 전용 옵션 없이 `.go` fixture로 auto-discovery → `ready`, (2)
  readiness budget만 1ms로 줄인 override(command/version/signal은 shipped preset 그대로) → `working`.
- **처음 실행했을 때 `.go` 파일이 `languageId()`에서 `plaintext`로 감지돼 gopls가 전혀 선택되지 않는
  결함을 발견했다.** 이건 이 lane(CI 검증) 범위가 아니라 이미 merge된 PR #58의 핵심 약속이 깨져 있던
  것이라 별도 hotfix branch `fix/go-language-detection`(PR #59, merge `fe0c239`)로 분리해 먼저
  처리했다 — 상세 경위와 근거는 `docs/work/task-fix-go-language-detection.md`. 이 branch는 PR #59
  merge 후 `main`에 rebase했다(작업 중이던 CI job·test는 `git stash`로 보존).
- PR #59 merge 후 재시도: `IMPACT_LENS_REQUIRE_GOPLS=1` + 실제 gopls로 두 test 모두 통과했으나, "ready"
  test가 `FixtureCaller`를 못 찾고 root(`FixtureTarget`)만 반환 — 3건 반복 실행 모두 동일하게 실패해
  타이밍 문제가 아니라 구조적 원인으로 판단하고 진단했다.
- **진단 결과: 이 lane 자신의 test 버그였다, gopls나 readiness 신호의 결함이 아니다.** `realGoplsWorkspace()`가
  `fs.mkdtemp()` 결과를 그대로 workspace로 썼는데, macOS에서 `os.tmpdir()`는 `/var/...`(→
  `/private/var/...`의 symlink) 아래를 반환한다. `LspCallHierarchyProvider`는 이 raw 경로를 gopls의
  workspaceFolder root로 그대로 보내는 반면, `analyzeImpact()`는 내부적으로 `canonicalWorkspace()`로
  같은 경로를 realpath해서 파일을 연다 — 두 경로가 문자열로 달라, gopls가 등록한 module root와 실제로
  열리는 파일의 경로가 어긋나 `caller.go`가 그 module에 속한 것으로 인식되지 못했다(root 자신은 같은
  파일이라 항상 발견됨). `fs.realpath()`를 workspace 생성에 추가하자 즉시, 매번 재현 가능하게
  해결됐다 — 직접 두 번 대조해 확인(realpath 없이 3회 연속 실패, 추가 후 매번 성공).

  **기존 헬퍼와의 관계(commander 요청으로 명시)**: 이 파일의 `mockScratch()` 헬퍼(mock readiness 서버
  시나리오가 쓰는)는 이미 `await fs.realpath(await fs.mkdtemp(...))`로 정확히 같은 이유로 realpath를
  거친다 — mock 서버도 LSP workspaceFolder root를 그대로 전달받는 구조라 같은 mismatch 위험이 있었고,
  그 시나리오를 처음 쓴 사람이 이미 이 문제를 막아 뒀다. **이건 새로운 문제가 아니라 이 저장소가 이미
  확립해 둔 패턴에서 새 헬퍼(`realGoplsWorkspace()`)가 이탈한 것이다** — `mockScratch()`를 그대로
  본떠 만들었어야 했는데, mock 서버 대신 real gopls를 쓴다는 차이에만 신경 쓰다 이 부분을 놓쳤다. 다음에
  workspace를 만드는 새 헬퍼를 추가할 때는 `mockScratch()`/`realGoplsWorkspace()` 둘 다 참고해 realpath
  단계를 기본값으로 넣어야 한다는 게 이 사건이 남기는 교훈이다.
- 수정 후 로컬 확인: `npm run cli:test`(gopls 없음) 271 pass / 2 skip. `IMPACT_LENS_REQUIRE_GOPLS=1` +
  gopls 없음 → 의도한 대로 fail(재현). `PATH`에 gopls 추가 후 `npm run cli:test` 273/273 pass(신규 2건
  포함). `PATH`+`IMPACT_LENS_REQUIRE_GOPLS=1`로 `npm run test:all` 전체 통과(cli:test 273, response-policy
  16, plugin-artifact e2e) — `test:plugin-artifact`의 TypeScript `selectedBy: 'bundled'` 유지 확인,
  선택 로직 회귀 없음. `buildInvocation.sources.test.ts` 4/4 개별 재확인.
- `serverInfo.version` 중복 passthrough 실측(commander 요청, PR #59 작업 문서에 기록): 문자열
  3,062 byte가 응답 안에 `data.provider.version`/top-level `capabilities.version` 두 곳에
  byte-identical하게 중복돼 총 6,124 byte, 11,219 byte 응답의 54.6%. 이 lane의 수정 범위 밖 — 판단
  근거로만 남긴다.

  **commander의 구조 분석(다음 lane을 위한 기록, 이 PR에서 손대지 않음)**: 유입 지점은 정확히 한
  곳(`cli/src/lspProvider.ts:460`, `result.serverInfo?.version`을 그대로 `this._capabilities.version`에
  대입) — provider가 통제하는, 길이 제한이 전혀 없는 문자열이다. 응답에 두 번 나타나는 건 M1이 만든
  v1 호환 projection이 같은 `_capabilities` 객체를 `data.provider`와 top-level `capabilities` 양쪽에
  싣기 때문이다. **즉 이건 gopls의 특이한 동작이 아니라 계약의 구멍이다**: 이 저장소는 다른 provider
  출력 경로(`ProviderVersionProbe.maxOutputBytes`, stderr budget 등)에는 이미 크기 예산을 걸어 두고서,
  `serverInfo.version` 이 경로에만 예산이 없다 — gopls는 그 구멍을 처음으로 드러낸 provider일 뿐,
  어떤 custom provider도 여기에 임의 크기 문자열을 넣을 수 있다. 이 응답을 주로 읽는 게 에이전트(매
  분석마다 토큰 과금)라는 점에서, 응답의 절반 이상이 중복된 하나의 무제한 필드라는 건 판단이 필요한
  문제다. **고칠 가능성이 높은 자리는 유입 지점 하나(`lspProvider.ts:460`)** — 두 projection이 같은
  `_capabilities`를 읽으므로 거기서 bound하면 양쪽이 함께 잡힌다. 이번 PR 범위가 아니므로 코드는
  건드리지 않았다 — 3단계 merge 후 별도 lane으로 다룬다.
- 다음 단계: push → 3개 OS CI 실제 실행·확인 → green이면 "알면서 남겨둔 창" 섹션의 문서 정정과
  `lastVerified` OS 확대를 같은 PR에 추가.

### 2026-09-02 — PR #61 merge 후 rebase, `unit-tests.yml` 충돌 해결

- PR #59(hotfix)에 이어 PR #61(`fix/cli-test-windows-compat`, Windows에서 `cli:test` 8건이 실패하던
  gopls·Go와 무관한 사전 존재 결함 수정)이 merge됐다(`331dd6f`). local `main` fast-forward 후 이
  branch를 `main`에 rebase.
- `.github/workflows/unit-tests.yml`에서 실제 충돌 발생 — PR #61의 `cli-tests-cross-os` job과 이
  branch의 `go-provider` job이 같은 위치에 각자 새 job을 추가했다. **둘 다 유지**하는 방향으로 수동
  해결(`unit` → `cli-tests-cross-os` → `go-provider` 순서). 두 번째 commit은 충돌 없이 재적용됐다.
- 로컬(macOS, 실제 gopls + `IMPACT_LENS_REQUIRE_GOPLS=1`) `npm run test:all` 전체 통과 확인 후
  `git push --force-with-lease`로 rebase 결과를 반영.

**`cli:test` 중복 실행에 대한 정정(commander 지적, PR #61 작업 문서의 후속 3번 항목에도 반영 필요)**:
merge 후 ubuntu에서 `unit`과 `go-provider` 둘 다, windows/macos에서 `cli-tests-cross-os`(gopls
없음)와 `go-provider`(gopls 필수)가 각각 `cli:test`를 돈다. **이건 순수한 중복이 아니다** — 같은
suite를 다른 환경에서 돌려 서로 다른 것을 증명한다:
- `unit`/`cli-tests-cross-os`(gopls 없는 환경): "gopls가 없어도 나머지 CLI가 정상 동작한다"(실사용자
  대다수의 조건). gopls-gated test는 skip된다.
- `go-provider`(gopls 설치 + `IMPACT_LENS_REQUIRE_GOPLS=1`): "gopls가 있으면 auto-discovery가 실제로
  그걸 고르고 readiness를 관측한다"뿐 아니라, **gopls가 PATH에 있어도 기존(비-Go) test들이 여전히
  통과하는지** — 예를 들어 auto-discovery가 TypeScript 요청에 실수로 gopls를 고르는 회귀가 없는지도
  같이 증명한다.
- 나중에 이 중복을 "ubuntu에서 두 번 도네, 하나 지우자"는 식으로 정리하면 안 된다. 특히 `go-provider`의
  `cli:test`를 gopls 전용 test로만 좁히면, gopls가 PATH에 있는 환경에서 기존 test 전체가 통과하는지
  아무도 안 보게 된다. **PR #61 작업 문서(`task-fix-cli-test-windows-compat.md`)의 후속 과제 3번
  ("`unit` job과 `cli-tests-cross-os` job의 구조 정리")에 이 구분을 후속 커밋으로 추가해야 한다** —
  이건 별도 커밋 대상이라 지금 이 branch에서 처리하지 않는다.

### 2026-09-02 — 3-OS green 확인 후 문서 정정 커밋

- CI 3-OS(ubuntu-latest, macos-latest, windows-latest) 전부 green(`mergeStateStatus: CLEAN`) 확인 후,
  계획대로 `lastVerified` OS 확대와 README/user-test-spec/cli-contract.md 정정을 같은 PR의 후속
  commit으로 추가했다.
- `catalog.ts`의 `lastVerified` 주석: darwin/arm64 전용 서술을 버전별로 정정 — **`0.19.1`은 CI가 3-OS
  전부에서 실제 auto-discovery+Call Hierarchy+readiness 왕복을 검증**, `0.23.0`은 여전히 darwin/arm64
  수동 검증뿐(CI는 `0.19.1`만 설치·검증하므로 `0.23.0`까지 3-OS로 확대 주장하지 않는다 — 과장 방지).
- 문서 정정 4개 파일: `README.md`(2곳), `cli/README.md`(2곳 — **sweep 도중 새로 발견, 원래
  "알면서 남겨둔 창" 목록에 없었다**), `m1-user-test-spec.md`(원문 유지, 정정 인용문 추가),
  `cli-contract.md`(readiness 도달 불가 서술 정정, `test:response-policy`의 doc-invariant check로
  구조적 정합성 재확인).
- **`cli/README.md`가 원래 목록에 없었다는 사실 자체를 기록한다**: "알면서 남겨둔 창" 섹션을 처음 쓸
  때 `README.md`/`m1-user-test-spec.md`/`cli-contract.md`만 `git grep`했고 하위 디렉터리의
  `cli/README.md`는 빠뜨렸다. 이번 sweep에서 범위를 넓혀 재실행하다 발견했다 — PR #55가 이미 겪은
  "정적 목록이 낡는다"는 위험이, 이번엔 목록을 처음 작성하는 단계에서부터 나타난 것이다.
- 로컬 재검증: `npm run cli:build`, `PATH`+`IMPACT_LENS_REQUIRE_GOPLS=1`로 `npm run test:all` 전체
  통과(cli-contract.md 수정이 `test:response-policy`의 doc-invariant check를 깨지 않음을 확인).
  `buildInvocation.sources.test.ts` 4/4 재확인 — `cli/src` 아래 `.ts` 파일만 스캔하므로
  `.github/workflows/`의 `go install`은 이 guard의 대상이 아니라는 한계를 직접 소스로 재확인했다.
