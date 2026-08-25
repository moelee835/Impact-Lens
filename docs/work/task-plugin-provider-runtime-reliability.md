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

## 테스트 및 완료 기준

- [x] runner explicit/checkout/global/release-fallback 각각의 source가 하위 CLI에 전달된다.
- [x] Node missing/old, npm missing과 CLI artifact 오류가 서로 다른 JSON error code로 반환된다.
- [x] doctor가 Node/CLI/provider package와 entry/access를 점검하고 `--smoke`가 initialize/capability를 확인한다.
- [x] 정상 및 오류 envelope runtime metadata에 raw path, 전체 argv, registry credential이 포함되지 않는다.
- [ ] clean tarball과 Codex/Claude layout의 TS/TSX/JS/JSX incoming-call E2E가 통과한다.
- [ ] Linux/macOS/Windows packed E2E matrix가 workflow에 존재한다.
- [ ] `npm run test:all`, schema parse, plugin validation, package dry-run과 E2E가 통과한다.
- [ ] 검증하지 못한 실제 개인 Plugin cache 재설치 및 사용자 테스트는 남은 제한으로 기록된다.

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
