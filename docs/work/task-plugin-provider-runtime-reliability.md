# IL-LIM-017 Plugin provider 실행·배포 신뢰성 구현

## 배경과 해결할 문제

Codex/Claude Code Plugin runner가 유효한 JavaScript/JSX 요청에서 선택한 bundled TypeScript Language
Server가 initialize 전에 exit code 1로 종료하고 stderr도 비어 있던 사례가 있었다. source checkout의
테스트와 CLI tarball 단독 smoke가 통과해도 runner가 explicit path, checkout, global binary, release
fallback 중 무엇을 선택했는지 알 수 없고, 선택 경로마다 Node 사전검사가 달라 실제 Plugin cache에서는
기본 기능 전체가 실패할 수 있다.

이 작업은 M0의 다음 P0 항목인 `IL-LIM-017`을 구현한다. 사용자가 provider나 경로를 직접 지정하지 않아도
bundled TypeScript/JavaScript 분석이 동작하게 하고, 설치·런타임 문제가 생기면 source code나 credential을
노출하지 않는 구조화된 진단과 복구 절차를 제공한다.

## 범위

- Plugin runner의 네 CLI resolution 경로와 선택 provenance를 결정적으로 전달한다.
- 모든 resolution 경로 전에 Node 22 이상을 동일하게 검사하고 npm fallback 요구 사항을 별도로 진단한다.
- CLI에 bundled TypeScript provider doctor와 runtime metadata를 추가한다.
- Node, CLI package, provider entry/version, file access, initialize/capability smoke 실패를 구분한다.
- 실제 `npm pack` tarball을 격리 prefix에 설치하고 Codex/Claude Plugin 배치 형태에서 TS/TSX/JS/JSX를
  분석하는 E2E를 자동화한다.
- 지원 OS matrix의 packed E2E를 CI release gate로 추가하고 안전한 복구 문서를 제공한다.

## 범위에서 제외할 항목

- Node/npm 또는 Language Server를 runner가 임의 설치·업그레이드하는 기능
- Python/C/C++/Swift/Kotlin external provider preset과 자동 탐색
- provider별 indexing ready 신호 및 dynamic registration
- DI, reflection, framework wiring과 런타임 호출 관계 추론
- 모든 shell, Node version manager와 사설 npm registry 조합 보장
- 아직 생성하지 않은 실제 GitHub release artifact의 사후 검증 또는 release 발행

## 현재 구현 조사 결과

- `plugins/impact-lens/scripts/run-impact-lens`는 explicit path → source checkout → global binary → pinned release
  tarball 순으로 선택하지만 선택 source를 하위 CLI에 전달하지 않는다.
- Node 22 검사는 npm fallback에서만 수행한다. explicit JavaScript entry, checkout과 global binary는 runner
  차원의 공통 검사 없이 실행된다.
- runner 오류는 모든 원인을 `cli_unavailable` 한 종류로 합치며 실제 operation, 선택 source, Node version과
  복구 가능한 원인을 구분하지 않는다.
- CLI package는 `engines.node >=22`, `typescript-language-server 6.0.0`과 TypeScript 5.9.3을 선언하고 bundled
  entry를 `require.resolve`한 뒤 `process.execPath`로 실행한다. 그러나 이 정보를 독립적으로 점검하는 doctor
  명령은 없다.
- 기존 IL-LIM-003 구현은 discovery/launch/initialize/capability/query 오류와 stderr drain/redaction을
  제공한다. 이번 작업은 이를 다시 구현하지 않고 packaged runtime 경계의 사전 진단과 E2E에 집중한다.
- 저장소에는 GitHub Actions workflow가 없고 runner 전용 contract test도 없다. 과거 release 작업은
  tarball clean install smoke를 수동으로 기록했지만 Plugin runner의 실제 네 resolution branch와 cache
  layout을 release gate로 고정하지 않았다.
- `plugin-creator`가 요구하는 개인 마켓플레이스 조회는
  `/Users/woony6/.agents/plugins/marketplace.json` 부재로 실패했다. 저장소 내부 `.agents` marketplace는
  존재하지만 개인 설치 registry가 아니므로 cachebuster/reinstall 성공으로 간주하지 않는다.

## 설계 결정

- runner는 경로나 argv 전체 대신 `explicit | checkout | global | release-fallback` source만 환경변수로
  CLI에 전달한다. release fallback은 URL 자체가 아닌 CLI가 알고 있는 package version만 응답한다.
- Node 검사는 네 경로 모두보다 먼저 수행한다. Impact Lens global binary도 Node CLI이므로 runner와 CLI
  양쪽이 Node 22 계약을 소유해 직접 실행과 Plugin 실행의 오류가 일치하게 한다.
- 정상 analyze/note 응답에는 additive top-level `runtime`을 제공하고 doctor도 같은 모델을 재사용한다.
  기존 schema v1 소비자는 알 수 없는 field를 무시할 수 있어 호환성을 유지한다.
- doctor 기본 모드는 파일 존재·접근·version을 점검하는 빠른 preflight이며, `--smoke`에서만 실제 server
  initialize/capability 확인을 수행해 일반 분석 지연을 늘리지 않는다.
- E2E는 source checkout/global CLI 접근을 차단하고 runner의 release fallback에 로컬 tarball을 주입한다.
  외부 네트워크 없이 같은 artifact boundary를 재현한다.

## 단계별 구현 계획

### 1단계 — runner resolution provenance와 공통 Node preflight

1. runner가 argument를 해석하기 전에 Node 존재와 major version 22 이상을 검사한다.
2. 네 resolution branch가 선택 source를 path-safe 환경변수로 전달하도록 한다.
3. missing/old Node, missing explicit artifact, non-executable artifact와 missing npm을 서로 다른 구조화 오류로
   반환하고 recovery hint를 포함한다.
4. 격리 PATH와 fake CLI를 사용하는 runner contract test로 네 branch, argument 보존과 negative case를
   검증한다.

종료 조건: runner 선택 경로와 사전검사 실패를 source path나 credential 없이 재구성할 수 있고 관련
contract test 및 전체 CLI test가 통과해 독립 commit/push가 가능하다.

### 2단계 — CLI runtime metadata와 bundled provider doctor

1. CLI startup에서 Node engine을 방어적으로 확인하고 package/runtime metadata helper를 만든다.
2. `doctor bundled-typescript [--smoke]` 명령을 추가해 CLI version, Node version, runner source, server package
   version, resolved entry와 access를 점검한다.
3. 정상 analyze/note 응답과 오류 envelope에 secret/path-safe runtime metadata를 additive하게 포함한다.
4. missing/corrupt provider artifact, unsupported Node와 smoke initialize/capability를 단위·통합 테스트한다.

종료 조건: 설치/runtime/provider artifact 문제를 provider spawn 이전 또는 명시적 smoke 단계에서 고유 code와
actionable hint로 구분하고 CLI 전체 테스트 및 schema 검증이 통과한다.

### 3단계 — packed CLI와 Plugin layout E2E 및 CI gate

1. CLI tarball을 격리 npm cache/prefix에 설치하는 재사용 가능한 E2E script를 만든다.
2. Codex와 Claude Plugin cache 형태를 임시 디렉터리에 각각 구성하고 source/global 접근이 없는 PATH에서
   runner release fallback을 실행한다.
3. TS/TSX/JS/JSX multi-file fixture로 실제 incoming-call graph와 doctor smoke를 검증한다.
4. Linux/macOS/Windows matrix에서 같은 script를 실행하는 GitHub Actions workflow를 release-blocking
   기준으로 추가한다.

종료 조건: source tree와 global CLI 없이 packed artifact와 Plugin runner만으로 네 기본 확장자 smoke가
통과하며 local E2E와 workflow/config 검사가 독립 commit/push 가능한 상태다.

### 4단계 — 복구 UX, 관리 상태와 최종 회귀 마감

1. INSTALL/Plugin contract에 Node, stale global/cache, missing provider, fallback network 실패별 안전한 복구
   순서와 doctor 사용법을 기록한다.
2. `IL-LIM-017`, M0 및 개발 관리 index의 실제 수용 기준, 검증 근거와 남은 수동 사용자 검증을 갱신한다.
3. plugin 정적 validation, 전체 Extension/CLI test, package dry-run, E2E와 diff 검사를 최종 실행한다.
4. 개인 marketplace 부재로 실제 Codex cachebuster/reinstall을 수행하지 못한 사실과 위험을 명시한다.

종료 조건: 자동 완료 기준이 모두 근거와 함께 반영되고 검증 불가 항목을 성공으로 표시하지 않으며 마지막
문서 단계가 독립 commit/push된다. 구현 PR이 없으면 story 상태는 `In progress`를 유지한다.

### 5단계 — PR의 항상 실행되는 원격 OS gate 보강

1. 문서-only 상태 기록 commit에서도 required check가 pending/skipped되지 않도록 pull request path filter를
   제거하고 모든 PR head에서 packed Plugin E2E가 실행되게 한다.
2. workflow YAML과 3-OS Node 22 matrix를 정적으로 검증하고 local packed E2E를 다시 실행한다.
3. 변경과 계획 로그를 독립 commit으로 남겨 같은 원격 branch에 push한다.

종료 조건: 이후 PR 및 host-smoke 기록 commit마다 Ubuntu/macOS/Windows packed E2E가 새 HEAD에서 실행될 수
있으며 local gate가 통과한다.

### 6단계 — 구현 PR과 원격 3-OS matrix 마감

1. 현재 누적 M0 branch와 `origin/main` 차이 및 기존 PR을 확인하고 main 대상 구현 PR을 생성한다.
2. PR의 Ubuntu/macOS/Windows Node 22 check를 관찰하고 실패 시 해당 OS 원인을 수정·검증·commit·push한다.
3. 모든 원격 check가 성공한 실제 URL/결과를 작업 로그와 story/M0 상태에 기록하고 독립 commit/push한다.
4. 기록 commit으로 다시 실행된 required matrix도 성공하는지 확인한다.

종료 조건: open PR의 최신 head에서 3-OS packed Plugin E2E가 모두 성공한다. 승인·merge는 별도 권한과 review
단계이므로 이번 단계에서 수행하지 않는다.

### 7단계 — 실제 Codex/Claude host 설치 smoke

1. 공식 OpenAI 문서와 설치된 Codex/Claude CLI help를 대조해 현재 host의 marketplace/install 명령을 확정한다.
2. plugin-creator 절차로 marketplace 이름·source를 검증하고, 이미 설치된 local plugin이면 cachebuster helper
   및 reinstall을 사용한다. marketplace가 없거나 remote source이면 임의 변경하지 않고 제한으로 기록한다.
3. 가능한 host에서 Plugin inventory, runner doctor smoke와 TS/JS 분석을 검증한다. 설치 전후 사용자 source나
   note를 변경하지 않는다.
4. host 결과와 불가능한 항목을 기록해 독립 commit/push하고 최신 PR matrix가 다시 성공하는지 확인한다.

종료 조건: 자동 release gate와 가능한 실제 host smoke가 완료되고, 다음 작업이 계획돼 있던 M0 사용자 테스트
명세 제안임이 명확하다. 사용자 테스트 명세 작성과 실제 사용자 테스트는 시작하지 않는다.

## 테스트 및 완료 기준

- [x] runner explicit/checkout/global/release-fallback 각각의 source가 하위 CLI에 전달된다.
- [x] Node missing/old, npm missing과 CLI artifact 오류가 서로 다른 JSON error code로 반환된다.
- [x] doctor가 Node/CLI/provider package와 entry/access를 점검하고 `--smoke`가 initialize/capability를 확인한다.
- [x] 정상 및 오류 envelope runtime metadata에 raw path, 전체 argv, registry credential이 포함되지 않는다.
- [x] clean tarball과 Codex/Claude layout의 TS/TSX/JS/JSX incoming-call E2E가 통과한다.
- [x] Linux/macOS/Windows packed E2E matrix가 workflow에 존재한다.
- [x] `npm run test:all`, schema parse, plugin validation, package dry-run과 E2E가 통과한다.
- [x] 검증하지 못한 실제 개인 Plugin cache 재설치 및 사용자 테스트는 남은 제한으로 기록된다.

## 작업 로그

### 2026-08-25 — 착수와 기준선 조사

- 선행 IL-LIM-003 변경이 있는 `docs/limitations-story-backlog`에서 런타임 구현 전용
  `fix/il-lim-017-provider-runtime` branch를 생성했다. main과 구현 branch는 분리돼 있다.
- IL-LIM-017, M0, runner, CLI package/startup, 기존 test와 plugin manifests를 조사했다.
- 저장소에 runner contract test와 CI workflow가 없으며 현재 Node preflight가 release fallback에만 있다는
  기준선을 확인했다.
- `plugin-creator` 지침에 따라 개인 marketplace 이름을 먼저 조회했으나 파일 부재로 실패했다. 개인
  marketplace를 임의 생성하지 않고 repository plugin 구현·정적 검증을 진행하며 실제 cache reinstall은
  완료로 간주하지 않기로 했다.

### 2026-08-25 — 1단계 runner provenance와 Node preflight

- `plugins/impact-lens/scripts/run-impact-lens`가 CLI resolution 전에 Node 존재, version 출력 형식과 major 22
  이상을 공통 검사하도록 변경했다. 기존에는 npm fallback만 검사했으나 이제 explicit JavaScript/실행 파일,
  checkout과 global binary도 같은 계약을 거친다.
- 네 분기는 하위 CLI에 raw path 대신 `IMPACT_LENS_RUNNER_SOURCE=explicit|checkout|global|release-fallback`만
  전달한다. release package override는 실행 인자로만 사용하고 runner error JSON에는 포함하지 않는다.
- `node_runtime_unavailable`, `node_version_unreadable`, `node_version_unsupported`, `cli_artifact_missing`,
  `cli_artifact_not_executable`, `npm_runtime_unavailable`을 분리하고 startup/resolution stage, component와
  고정 recovery code를 제공했다. runner가 받은 command를 기반으로 error의 operation도 보존한다.
- `cli/src/test/runner.test.ts`에 격리 PATH와 fake node/npm/CLI를 사용한 process contract test 6개를 추가했다.
  explicit 경로의 공백 포함 인자, checkout/global/fallback 선택, package credential 비노출, old Node,
  missing artifact/npm을 검증한다. Windows의 Node test runner에는 `/bin/sh`가 보장되지 않아 이 POSIX contract
  suite만 skip하며 Windows Plugin E2E는 3단계의 Git Bash workflow가 담당한다.
- 최초 `npm --prefix cli test`에서 checkout 실행 경로의 `../..`가 남은 문자열과 canonical expected path를
  직접 비교해 1건 실패했다. 실행 대상은 동일했으므로 실제 경로를 정규화해 비교하도록 테스트를 수정했다.
- 최종 `sh -n plugins/impact-lens/scripts/run-impact-lens`: 통과.
- 최종 `npm --prefix cli test`: 31/31 통과(기존 25개 + runner 6개).
- `git diff --check`: 통과.

### 2026-08-25 — 2단계 CLI runtime metadata와 bundled provider doctor

- `cli/src/runtime.ts`에 Node 22 startup guard, CLI/Node/runner runtime metadata와 bundled
  `typescript-language-server`/TypeScript package version 및 entry 접근 검사를 구현했다. package resolution,
  read permission과 package metadata 손상을 `bundled_provider_artifact_missing|unreadable|corrupt`로 분리하고
  오류에는 절대경로나 parser 원문을 포함하지 않는다.
- `cli/src/doctor.ts`와 `doctor bundled-typescript [--smoke] [--timeout-ms N]` 명령을 추가했다. 기본 preflight는
  파일·version만 동기 점검해 일반 분석 latency와 무관하고, `--smoke`만 실제 bundled server를 initialize해
  advertised Call Hierarchy capability를 확인한다.
- `LspCallHierarchyProvider`의 bundled command resolution이 공통 artifact inspector를 사용하게 했으며 doctor가
  query 없이 initialization 결과를 읽는 제한된 public method를 추가했다. analyze/note의 기존 query 경로는
  변경하지 않았다.
- CLI 정상·오류 envelope에 additive `runtime`을 추가하고 response schema에 CLI/Node/runner 구조와
  `provider.doctor` operation을 정의했다. runner가 CLI 시작 전에 실패하는 경우에도 schema가 일치하도록
  `version: unknown`, `node.version: unavailable`을 허용한 안전한 snapshot을 포함했다.
- allowlist 밖의 `IMPACT_LENS_RUNNER_SOURCE`는 `direct`로 정규화한다. release URL, 전체 argv, provider entry의
  절대경로는 runtime이나 doctor 결과에 포함하지 않는다.
- `cli/src/test/runtime.test.ts` 5개와 doctor contract/smoke/validation 3개를 추가하고 runner 조기 오류 runtime
  assertion을 보강했다. unsupported Node, 실제 package version/entry, missing/unreadable/corrupt artifact,
  resolution 실패 redaction, 양수가 아닌 timeout 거부와 실제 server initialize를 검증한다.
- `npm run test:all`: Extension 34/34, CLI 37/37 통과. 이후 negative case를 보강한 최종
  `npm --prefix cli test`: 39/39 통과.
- AJV 2020 strict mode로 실제 doctor 성공 envelope와 invalid-command 오류 envelope를 검증: 모두
  `response.schema.json`과 일치.
- `validate_plugin.py plugins/impact-lens`: 통과. quick validator를 처음 plugin-creator의 scripts 아래에서
  호출해 파일 부재로 실패했으나, 실제 공용 위치인 skill-creator의 `quick_validate.py`로 다시 실행해
  `plugins/impact-lens/skills/impact-lens-cli` validation이 통과했다.
- 개인 marketplace 부재는 계속되므로 cachebuster/reinstall은 아직 검증하지 못했다. 이 항목은 4단계까지
  성공으로 표시하지 않는다.

### 2026-08-25 — 3단계 packed CLI와 Plugin layout E2E 및 CI gate

- `scripts/test-plugin-artifact-e2e.mjs`와 root `test:plugin-artifact` script를 추가했다. E2E는 실제
  `npm pack` tarball을 임시 npm cache와 clean prefix에 production install하고, 설치된 bin의
  `doctor bundled-typescript --smoke`를 먼저 실행한다.
- 같은 tarball을 Codex `plugins/cache/personal/impact-lens/0.1.0` 및 Claude
  `plugins/cache/impact-lens/0.1.0` 형태에 복사한 repository Plugin runner의 release fallback으로 실행한다.
  `npm_config_offline=true`와 동일 임시 cache를 사용하므로 runner 단계에서는 네트워크나 source checkout에
  의존하지 않는다.
- 각 Plugin layout에서 doctor smoke와 `.ts`, `.tsx`, `.js`, `.jsx` multi-file incoming-call을 실행한다.
  모든 응답이 `runtime.runner.source: release-fallback`, bundled provider, complete traversal과 예상 direct
  caller를 반환해야 통과한다. clean-prefix 설치 bin은 `runner.source: direct`여야 한다.
- runner에서 외부 `dirname` 명령 의존성을 제거하고 POSIX parameter expansion으로 script directory를
  계산하게 했다. 격리 PATH와 Windows Git Bash에서도 불필요한 system utility 차이를 줄인다.
- `.github/workflows/plugin-artifact-e2e.yml`을 추가했다. pull request의 CLI/Plugin/E2E 관련 변경과 `v*` tag,
  수동 실행에서 Ubuntu/macOS/Windows, Node 22 matrix가 packed E2E를 실행한다. branch protection의 required
  check 지정은 저장소 외부 설정이므로 이번 구현에서 변경하거나 완료로 주장하지 않는다.
- 최초 sandbox 실행은 clean prefix dependency 설치가 registry에 접근하지 못해 120초 timeout됐다. 파일
  또는 assertion 실패로 처리하지 않고 네트워크 허용 환경에서 동일 테스트를 재실행해 약 19초에 통과했다.
  설치 timeout은 느린 CI를 고려해 5분으로 확대했고 최종 clean run도 약 19초에 통과했다.
- 최종 `npm run test:plugin-artifact`: macOS local에서 clean install, 두 Plugin layout, doctor 3회와 언어 분석
  8회 모두 통과. Linux/Windows matrix는 workflow로 정의·YAML parse했지만 아직 원격 workflow가 실행되지
  않았으므로 해당 OS 실행 성공으로 간주하지 않는다.
- `npm --prefix cli test`: 39/39 통과. `sh -n`/Node syntax, 3-OS matrix YAML assertion,
  `validate_plugin.py plugins/impact-lens`와 `git diff --check`: 통과.

### 2026-08-25 — 4단계 복구 UX와 최종 회귀 마감

- `cli/README.md`, root `README.md`, `INSTALL.md`에 `runtime`, bundled doctor의 preflight/smoke 차이와
  source별 복구 순서를 추가했다. TypeScript/JavaScript 사용자는 provider JSON을 작성하지 않고 doctor로
  Node/package/entry/initialize/capability를 먼저 진단한다.
- Plugin skill과 contract가 `runtime.runner.source`를 확인하고 bundled startup 실패 때 doctor를 한 번 실행한
  뒤 재설치/update를 제안하도록 변경했다. runner resolution 실패와 provider lifecycle 실패를 구분하고
  raw path, registry URL, credential과 argv를 요구하거나 보고하지 않는다.
- `docs/development-management/provider-coverage-contract.md`에 runtime/doctor 및 runner/artifact 오류 계약을
  추가했다. IL-LIM-017과 개발 관리 index 상태를 `In progress`로 바꾸고 M0의 local 자동 gate 통과 항목을
  체크했다.
- 관측 사례를 직접 고정하기 위해 `silentExitServer.ts`와 contract test를 추가했다. provider가 stderr 없이
  exit 1로 종료해도 `provider_initialize_failed`, `details.stage: initialize`, exit code와
  `runtime.runner.source`가 남고 비어 있는 stderr field는 만들지 않는다.
- 최종 `npm run test:all`: Extension 34/34, CLI 40/40 통과.
- 실제 doctor smoke 성공 및 invalid-command 오류 envelope를 AJV 2020 strict mode로 검증: schema 일치.
- `npm pack --dry-run --json`: 15개 파일, 22,771 bytes archive 예상. 새 `dist/runtime.js`,
  `dist/doctor.js`, schema와 runtime 모듈이 포함되고 source/test output은 제외됨.
- 최종 `npm run test:plugin-artifact`: macOS clean install, installed bin doctor, Codex/Claude layout doctor와
  TS/TSX/JS/JSX 8개 분석이 모두 통과. registry 응답 대기 때문에 tool call은 길어졌지만 harness 자체
  출력 기준 clean run은 약 19초였다.
- Plugin validator와 skill quick validator, runner shell/Node E2E syntax, workflow 3-OS matrix YAML,
  수정 Markdown local link, schema JSON과 `git diff --check`: 모두 통과.
- `CHANGELOG.md` Unreleased에 runner provenance, Node preflight, bundled doctor와 packed Plugin E2E를 기록했다.

### 2026-08-25 — 5단계 PR 항상 실행 gate

- `.github/workflows/plugin-artifact-e2e.yml`의 pull request path filter를 제거했다. 구현 이후 결과를 기록하는
  문서-only commit도 새 PR head가 되므로 Ubuntu/macOS/Windows required check가 생략되지 않아야 한다.
- workflow가 `pull_request`, `workflow_dispatch`, `v*` tag에서 실행되고 3개 OS와 Node 22를 유지하는지 YAML
  assertion으로 확인했다.
- `npm run test:plugin-artifact`: macOS local clean tarball, Codex/Claude layout과 TS/TSX/JS/JSX 분석 통과.
- `git diff --check`: 통과.
- commit `c27955d`를 `origin/fix/il-lim-017-provider-runtime`에 push하고 local/upstream head 일치를 확인했다.

### 2026-08-25 — 6단계 구현 PR과 원격 3-OS matrix

- 누적 M0 구현 branch에서 `main` 대상 [PR #16](https://github.com/moelee835/Impact-Lens/pull/16)을 생성했다.
  PR에는 limitation backlog, IL-LIM-003 provider transparency와 IL-LIM-017 runtime reliability가 함께 포함됨을
  본문에 명시했다. PR은 open 상태이며 승인·merge는 수행하지 않았다.
- 첫 원격 실행 [32826088306](https://github.com/moelee835/Impact-Lens/actions/runs/32826088306)에서 Ubuntu와
  macOS는 통과했지만 Windows가 첫 `npm pack`에서 `spawnSync npm.cmd EINVAL`로 실패했다. provider나 tarball
  결함이 아니라 Node가 Windows command shim을 직접 spawn한 harness 이식성 결함이었다.
- `scripts/test-plugin-artifact-e2e.mjs`의 npm 호출을 OS별로 캡슐화했다. Windows는 `shell: true`의 quoting 및
  injection 위험을 도입하지 않고 현재 npm이 제공한 `npm_execpath`를 `process.execPath`로 실행하며, POSIX는
  기존 `npm` 직접 실행을 유지한다.
- 수정 후 Node syntax, `git diff --check`, local `npm run test:plugin-artifact`가 통과했고 commit `a28609d`를
  push했다.
- 최신 구현 head의 원격 실행 [32826288752](https://github.com/moelee835/Impact-Lens/actions/runs/32826288752)에서
  Ubuntu 30초, macOS 47초, Windows 2분 2초로 모두 통과했다. Windows도 clean package install, doctor와
  Codex/Claude TS/TSX/JS/JSX fixture 전체를 완료했다.

### 계획과 실제 구현의 차이 및 남은 제한

- 계획의 “Plugin cache 설치”는 실제 host가 만든 개인 cache를 변경하지 않고 임시 디렉터리에 동일 payload
  layout을 구성하는 hermetic E2E로 구현했다. 개인 marketplace 파일이 없어 plugin-creator cachebuster와
  실제 Codex reinstall은 수행하지 못했으며 성공으로 간주하지 않는다.
- 최초 Windows 원격 실행은 `.cmd` 직접 spawn 호환성 결함으로 실패했고 `npm_execpath`를 Node로 실행하도록
  계획에 없던 harness 수정을 추가했다. 수정된 PR head에서는 Linux/macOS/Windows가 모두 통과했다.
- PR #16은 생성됐지만 아직 open이며 merge되지 않았다. 실제 host 설치 smoke와 계획된 M0 사용자 검증도
  아직 완료되지 않았으므로 story와 마일스톤 상태는 `In progress`를 유지한다.
- GitHub branch protection의 required check 설정은 저장소 외부 정책 변경이므로 수행하지 않았다. workflow는
  PR 관련 변경 및 `v*` tag에서 실행되지만 실제 merge/release 차단 여부는 repository 설정이 필요하다.
- M0 사용자 테스트 명세는 사용자의 이전 지시대로 이번 단계에서 작성하거나 실행하지 않았다. M0 자동
  E2E가 PR matrix를 통과한 뒤 별도 단계에서 제안할 예정이다.
- 첫 release fallback의 npm network/proxy 실패는 CLI가 시작되기 전 npm stderr로 나타날 수 있다. 설치된
  provider crash와는 구분되지만 아직 runner의 단일 JSON envelope로 정규화되지 않아 후속 UX 보완이 필요하다.
- IL-LIM-017의 local 수용 기준은 충족했으나 구현 PR, 원격 3-OS 결과와 실제 사용자/host cache 검증이 없어
  story와 M0는 `In progress`를 유지한다.

### 2026-08-25 — 5단계 PR 항상 실행 OS gate 보강

- PR head가 문서-only 기록 commit으로 바뀌면 path-filtered required workflow가 skipped/pending 상태가 될 수
  있음을 발견했다. `.github/workflows/plugin-artifact-e2e.yml`의 `pull_request.paths`를 제거해 모든 PR
  revision에서 packed Plugin E2E가 실행되게 했다. `v*` tag와 수동 trigger는 유지했다.
- GitHub-hosted runner 자체가 사용자 GUI/원격 PC를 대신하므로 이 단계는 GUI 환경을 요구하지 않는다.
- workflow YAML event/job과 Ubuntu/macOS/Windows Node 22 matrix 정적 검사: 통과.
- `npm run test:plugin-artifact`: clean install, Codex/Claude layout과 TS/TSX/JS/JSX release fallback 모두 통과.
- `git diff --check`: 통과.

### 2026-08-25 — 6단계 PR 생성과 첫 원격 matrix 결과

- Git credential을 process-local `GH_TOKEN`으로만 사용해 기존 열린 PR이 없음을 확인하고 main 대상
  [PR #16](https://github.com/moelee835/Impact-Lens/pull/16)을 생성했다. PR은 선행 IL-LIM-003, 개발 관리
  backlog/milestone과 IL-LIM-017 runtime 구현을 함께 포함하며 사용자 테스트는 제외한다고 본문에 명시했다.
- 첫 workflow run `32826088306`에서 Ubuntu(33초)와 macOS(35초)는 통과했고 Windows는 43초에 실패했다.
- Windows log에서 provider 실행 전 `spawnSync npm.cmd EINVAL`을 확인했다. 이는 Language Server나 tarball
  문제가 아니라 Node가 Windows command shim을 shell 없이 직접 spawn한 harness portability 결함이다.
- `shell: true`로 우회하면 path/argument escaping 계약이 약해지므로 사용하지 않았다. Windows에서는
  `npm run`이 제공한 `npm_execpath`를 현재 `process.execPath`로 실행하고 POSIX에서는 기존 `npm` binary를
  유지하도록 `scripts/test-plugin-artifact-e2e.mjs`를 수정했다.
- 수정 후 Node syntax, `git diff --check`와 local `npm run test:plugin-artifact`: 모두 통과. 다음 commit/push로
  PR matrix를 다시 실행한다.
