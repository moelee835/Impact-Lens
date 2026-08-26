# M0 Provider Runtime v0.6.0 release 정합성

## 배경과 해결할 문제

[`M0 Provider 실행 신뢰성`](../development-management/milestones/m0-provider-runtime-trust.md) 마일스톤의 종료
gate 중 자동 검증 항목은 모두 통과했지만, 마지막 gate 하나가 남아 있다.

> 실제 Plugin의 기본 fallback이 이번 runtime/doctor 계약을 포함한 공개 CLI release와 일치한다.

[`M0 handover`](task-m0-provider-runtime-handover.md)가 기록한 대로, plugin runner의 release fallback은 공개
`v0.5.0` tarball을 가리키는데 그 artifact에는 이번 branch가 추가한 `doctor bundled-typescript` 계약이 없다.
`IMPACT_LENS_CLI_PATH` 또는 `IMPACT_LENS_CLI_PACKAGE` override 없이 설치된 Plugin을 실행하면 두 host 모두
다음을 반환한다.

```json
{"schemaVersion":1,"operation":"unknown","ok":false,"error":{"code":"invalid_request","message":"Unexpected argument: bundled-typescript","retryable":false}}
```

이것은 marketplace 설치 실패나 Language Server initialize 실패가 아니라 **새 runner와 이미 공개된 구형 CLI의
version/contract 불일치**다. hermetic E2E는 현재 branch의 tarball을 주입하므로 통과하지만, 실제 사용자의
default-path 첫 실행은 새 CLI release가 발행되고 runner pin이 그 release와 일치하기 전까지 같은 계약을
보장하지 못한다.

이 작업은 `0.6.0` release로 그 불일치를 해소하고, 공개 artifact 기준의 default-path 동작을 실제로 검증한다.

## 범위

- `0.5.0` → `0.6.0` version 정합성: source, manifest, runner pin, 계약 예시와 설치 문서
- Plugin payload manifest version `0.1.0` → `0.2.0` (Codex/Claude 양쪽)
- 전체 자동 gate 재실행: Extension/CLI test, packed Plugin E2E, 3-OS matrix
- PR [#16](https://github.com/moelee835/Impact-Lens/pull/16) merge
- `v0.6.0` tag와 GitHub Release 발행 (`impact-lens-0.6.0.vsix`, `impact-lens-cli-0.6.0.tgz`)
- override 없는 실제 Codex/Claude Plugin default-path 사후 검증과 결과 기록

## 범위에서 제외할 항목

- M0 사용자 테스트 명세(`user-tests/m0-user-test-spec.md`) 작성 또는 실제 사용자 테스트 실행
- Python/C/C++/Swift/Kotlin preset, DI·reflection·framework edge 구현
- npm registry 발행 (CLI는 계속 GitHub Release asset으로만 배포한다)
- GitHub branch protection이나 release 자동화 workflow 신설
- 기존 `v0.5.0` tag/asset 수정 또는 삭제

## 현재 구현 조사 결과

### Git과 PR 상태 (2026-08-26 확인)

- 개발 branch: `fix/il-lim-017-provider-runtime`, worktree clean, `origin`과 동기화
- HEAD: `0978913ed35af3b516cc20f77d37d52f67d05d8e`
- PR #16: `OPEN`, `MERGEABLE`, `CLEAN`, base `main`, main 대비 19 commit
- 최신 3-OS gate [run 32828571293](https://github.com/moelee835/Impact-Lens/actions/runs/32828571293):
  Ubuntu 33s, macOS 46s, Windows 3m12s 모두 성공
- 재검증한 local `npm run test:all`: Extension과 CLI 테스트 전부 통과 (CLI 40/40)

### 설치된 host 상태

- Codex `codex plugin list`: `impact-lens@personal` version `0.1.0`, installed·enabled,
  marketplace root `~/dev/Impact-Lens`
- Claude Code `claude plugin list`: `impact-lens@impact-lens` version `0.1.0`, local scope, enabled
- 두 host 모두 repository local marketplace를 사용하므로, plugin manifest version을 올리면 host의 update
  경로로 새 payload를 받을 수 있다.

### release 절차와 artifact 계약

- release artifact를 만드는 workflow는 없다. `.github/workflows/plugin-artifact-e2e.yml`은 `pull_request`,
  `v*` tag push와 `workflow_dispatch`에서 packed Plugin E2E만 실행한다. tag push는 검증 gate이지 발행이 아니다.
- [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md) 9장: PR merge 후 최종 `main`에서 VSIX를 다시 생성하고, tag가 그
  merge commit을 가리키는지, draft/prerelease가 아닌지, asset digest가 local checksum과 같은지 확인한다.
- CLI artifact는 `pnpm --dir cli pack`으로 만들고 tarball에 `dist/**`, `README.md`, `schemas/**`만 포함되는지
  확인한다. CLI package는 VSIX에 포함하지 않는다.
- 기존 asset naming(`v0.5.0` release에서 확인): `impact-lens-<version>.vsix`,
  `impact-lens-cli-<version>.tgz`
- 발행 이력: `v0.1.1`, `v0.2.0`, `v0.3.0`~`v0.3.3`, `v0.4.0`, `v0.5.0` (모두 수동 발행)

### version 소유 위치

`0.5.0`을 명시하는 위치는 다음과 같다. 하나라도 빠지면 runner pin과 공개 artifact가 다시 어긋난다.

| 위치 | 역할 |
| --- | --- |
| `package.json:6` | Extension/VSIX version |
| `cli/package.json:3` | CLI package version, tarball 파일명 결정 |
| `plugins/impact-lens/scripts/run-impact-lens:11` | release fallback tarball URL pin |
| `cli/src/test/contract.test.ts:28` | `runtime.cli.version` 계약 assertion |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:25,31` | skill 계약 예시 응답 |
| `README.md:11,52,55,64,202` | release badge, VSIX/CLI 설치 명령, runner fallback 설명 |
| `INSTALL.md` 13개 위치 | 다운로드 URL, 설치 명령, 설치 확인, digest 검증 명령 |
| `CHANGELOG.md` | `Unreleased` 항목을 `0.6.0` 절로 확정 |
| `docs/DEVELOPMENT.md` | VSIX 파일명 예시 |

Plugin payload version은 별도 체계다.

| 위치 | 현재 | 목표 |
| --- | --- | --- |
| `plugins/impact-lens/.claude-plugin/plugin.json` | `0.1.0` | `0.2.0` |
| `plugins/impact-lens/.codex-plugin/plugin.json` | `0.1.0` | `0.2.0` |

`scripts/test-plugin-artifact-e2e.mjs`는 `npm pack --json` 결과의 파일명을 그대로 사용하므로 version에
결합되어 있지 않다. 별도 수정이 필요 없다.

### version 선택 근거

`0.6.0`을 사용한다. 이번 변경은 provider identity/coverage metadata, `runtime` metadata,
`doctor bundled-typescript` 신규 명령을 추가한다. 기존 schema v1 필드를 유지하는 additive 변경이지만 새 CLI
명령과 응답 필드가 늘어나므로 patch가 아니라 minor가 맞다. 기존 `v0.5.0` release는 그대로 두고 새 tag를
발행해 이미 배포된 asset의 digest를 바꾸지 않는다.

### 순환 의존 검토

runner pin이 아직 없는 URL을 가리키는 구간이 생기지만, 발행 순서를 지키면 사용자 노출 구간은 없다.

1. branch에서 pin을 `v0.6.0` URL로 바꾼다. 이 시점에도 checkout/global 경로가 우선하므로 개발 환경은 영향이
   없고, hermetic E2E는 `IMPACT_LENS_CLI_PACKAGE`로 packed tarball을 주입한다.
2. PR을 merge한다.
3. merge commit에 `v0.6.0` tag를 붙이고 같은 tag의 release에 asset을 올린다. 이 순간 pin URL이 실재하게 된다.
4. 사용자에게 노출되는 문서(`README.md`, `INSTALL.md`)의 링크는 3단계 이후에 유효하다. 발행 전에 main에
   merge되는 구간이 있으므로 3단계는 2단계 직후 지연 없이 수행한다.

## 단계별 구현 계획

### 1단계 — release 계약 계획 문서화

1. 이 문서를 작성한다.
2. version 소유 위치, 발행 순서, rollback과 검증 순서를 확정한다.
3. `git diff --check` 후 문서만 독립 commit하고 개발 branch에 push한다.

완료 조건: 실제 코드/설정 변경 전에 version, artifact URL, 발행 순서와 승인 경계가 기록된다.

### 2단계 — 0.6.0 version 정합성 구현

1. 위 표의 모든 위치를 `0.6.0`으로, plugin manifest 2개를 `0.2.0`으로 갱신한다.
2. `CHANGELOG.md`의 `Unreleased` 항목을 `0.6.0` 절로 확정한다.
3. `npm run test:all`, `npm run test:plugin-artifact`, `pnpm exec vsce package`(dry-run 성격)와
   `pnpm --dir cli pack` 내용 검사를 실행한다.
4. 독립 commit 후 같은 개발 branch에 push하고 PR #16의 3-OS matrix 재실행 결과를 확인한다.

완료 조건: 한 version의 source, manifest, tarball 이름과 runner pin이 일치하고 모든 자동 gate가 통과한다.

### 3단계 — PR merge와 v0.6.0 artifact 발행

1. PR #16의 최신 head에서 3-OS check가 모두 성공한 것을 확인하고 merge한다.
2. merge된 `main`을 fetch하고 그 commit에서 VSIX와 CLI tarball을 생성한다.
3. tarball 파일 목록과 SHA-256 checksum을 기록한다.
4. merge commit을 가리키는 `v0.6.0` tag와 non-draft, non-prerelease release를 만들고 두 asset을 올린다.
5. 공개 asset의 digest가 local checksum과 같은지 확인한다.

완료 조건: `https://github.com/moelee835/Impact-Lens/releases/download/v0.6.0/impact-lens-cli-0.6.0.tgz`가
실재하고 digest가 일치한다.

rollback: 검증 실패 시 release를 draft로 되돌리거나 삭제하고 tag를 제거한다. 이미 asset을 받은 사용자가
없다는 것을 전제하지 않고, 문제가 발견되면 `v0.6.1`로 재발행한다. `main`은 revert PR로만 되돌린다.

### 4단계 — 공개 default-path 사후 검증

1. Codex와 Claude Code의 Impact Lens Plugin을 정식 절차로 update 또는 reinstall한다.
2. `IMPACT_LENS_CLI_PATH`와 `IMPACT_LENS_CLI_PACKAGE`를 제거한 환경에서 두 host의 cache runner로
   `doctor bundled-typescript --smoke`와 TypeScript/JavaScript 분석을 실행한다.
3. `runtime.cli.version`, `runtime.runner.source`, Node runtime과 provider version을 기록한다.
4. `main`에서 분기한 문서 branch에 결과를 기록하고 PR로 반영한다. `main`에 직접 commit하지 않는다.
5. M0 마일스톤과 IL-LIM-003/017 story의 상태를 실제 결과로 갱신한다.

완료 조건: override 없이 두 host에서 doctor와 분석이 성공하고, `runner.source`가 `release-fallback`이며
`cli.version`이 `0.6.0`이다. 실패하면 완료로 표시하지 않고 원인과 함께 기록한다.

검증 환경 주의: 이 Mac의 기본 `~/.npm` cache에는 root 소유 파일이 있어 local pack이 `EPERM`으로 실패한 적이
있다. 사용자 홈 권한을 임의로 바꾸지 말고 검증 시 task-specific 임시 npm cache를 사용한다.

## 테스트 및 완료 기준

- [x] 1단계: version 소유 위치, 발행 순서와 rollback이 문서화되고 commit/push됐다.
- [x] 2단계: `0.5.0` 잔존 참조가 CHANGELOG의 과거 절과 이 문서를 제외하고 없다.
- [x] 2단계: `npm run test:all`과 `npm run test:plugin-artifact`가 통과한다.
- [x] 2단계: CLI tarball 파일 목록이 `dist/**`, `README.md`, `schemas/**`만 포함한다.
- [x] 2단계: PR #16 head의 Ubuntu/macOS/Windows Node 22 check가 모두 성공한다.
- [x] 3단계: `v0.6.0` tag가 merge commit을 가리키고 release가 draft/prerelease가 아니다.
- [x] 3단계: 두 asset의 공개 digest가 local checksum과 같다.
- [x] 4단계: override 없는 Codex/Claude cache runner의 doctor smoke가 성공한다.
- [x] 4단계: 같은 조건에서 TypeScript와 JavaScript 분석이 성공한다.
- [x] 4단계: M0 gate와 관련 story 상태가 실제 결과로 갱신된다.

## 작업 로그

### 2026-08-26 — 1단계 release 계약 조사와 계획 수립

- 변경 파일: `docs/work/task-m0-release-0-6-0.md` (신규)
- 조사 결과: release artifact를 만드는 자동화는 없고 `docs/DEVELOPMENT.md` 9장의 수동 절차가 유일한 계약이다.
  tag push는 `plugin-artifact-e2e` 검증만 트리거한다.
- `0.5.0` 문자열이 남아 있는 위치를 전수 조사해 표로 고정했다. `scripts/test-plugin-artifact-e2e.mjs`는
  `npm pack --json` 출력에서 파일명을 읽으므로 version에 결합되지 않는다는 것을 확인했다.
- 사용자 결정: version `0.6.0`, 현재 개발 branch에서 bump 후 merge, plugin manifest `0.2.0`,
  merge·tag·release와 사후 검증까지 이번 작업 범위에 포함.
- version 선택은 새 CLI 명령(`doctor`)과 additive 응답 필드 추가를 근거로 minor bump로 정했고, 기존 `v0.5.0`
  asset의 digest를 바꾸지 않기 위해 재발행 대신 새 tag를 사용하기로 했다.
- 상태 재확인: HEAD `0978913`, PR #16 `MERGEABLE`/`CLEAN`, 최신 3-OS run 32828571293 전부 성공,
  local `npm run test:all` 통과, 두 host에 plugin `0.1.0`이 설치·활성화된 상태.

### 2026-08-26 — 2단계 0.6.0 version 정합성 구현

- 변경 파일: `package.json`, `cli/package.json`, `plugins/impact-lens/scripts/run-impact-lens`,
  `cli/src/test/contract.test.ts`, `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`,
  `README.md`, `INSTALL.md`, `docs/DEVELOPMENT.md`, `CHANGELOG.md`,
  `plugins/impact-lens/.claude-plugin/plugin.json`, `plugins/impact-lens/.codex-plugin/plugin.json`,
  `.vscodeignore`
- 조사 표의 모든 `0.5.0` 위치를 `0.6.0`으로 바꾸고 plugin manifest 2개를 `0.2.0`으로 올렸다. `CHANGELOG.md`의
  `Unreleased` 절은 `0.6.0`으로 확정했다. 잔존 `0.5.0` 참조는 CHANGELOG의 과거 절과 이미 발행된 결과를 기록한
  work document/story뿐이며, 과거 기록은 사실이므로 고치지 않았다.
- `contract.test.ts`의 `runtime.cli.version` assertion은 literal `'0.6.0'`으로 유지했다. package.json에서 값을
  읽어오면 assertion이 자기 자신을 검증하게 되고, 다음 bump에서 test가 실패하는 편이 pin 누락을 더 빨리 드러낸다.
- **발견한 결함**: branch VSIX를 만들자 31 files가 나왔고 `.github/workflows/plugin-artifact-e2e.yml`,
  `scripts/test-plugin-artifact-e2e.mjs`, 그리고 untracked `.claude/settings.local.json`이 포함됐다. 마지막
  파일에는 이 host의 절대 경로 `~/dev/Impact-Lens`가 들어 있어 그대로 발행하면 사용자 환경 정보가
  공개 artifact에 실린다. 이번 branch가 `.github/`, `scripts/`, `.claude/`를 새로 추가하면서 `.vscodeignore`가
  따라가지 못한 회귀다.
- `.vscodeignore`에 `.claude/**`, `.github/**`, `scripts/**`를 추가하고 재패키징해 28 files, 1.08 MB로
  줄었으며 leak 검사에서 `.claude`, `.github`, `scripts/`, `cli/`, `plugins/` 항목이 모두 사라졌다.
  27 files였던 v0.5.0 대비 증가분은 새 `out/coverage.js` 하나뿐이다.
- 검증 결과
  - `npm run test:all`: Extension 34/34, CLI 40/40 통과
  - `npm run test:plugin-artifact`: clean install과 Codex/Claude TS/TSX/JS/JSX release fallback 통과
  - CLI tarball `impact-lens-cli-0.6.0.tgz`: 15 entries로 `dist/*.js` 10개, `schemas/**` 2개,
    `package.json`, `README.md`, `LICENSE`만 포함. SHA-256
    `0852e7f1ef1fe7d37611ecd33ecf8ca63bf2fb2feb209be990a2b533ecafe4e4` (branch 기준 값이며 release asset은
    merge 후 main에서 다시 생성한다)
  - branch VSIX: 28 files, 1.08 MB
- 이 환경에는 `pnpm`이 PATH에 없어 `docs/DEVELOPMENT.md`의 `pnpm --dir cli pack` 대신 `npm pack`을 사용했다.
  두 명령 모두 `cli/package.json`의 `files` 목록만 담으며, CI E2E(`scripts/test-plugin-artifact-e2e.mjs`)도
  `npm pack`을 사용하므로 tarball 내용은 동일하다.
- 이 Mac의 기본 `~/.npm` cache는 root 소유 파일 때문에 실패하므로 모든 pack/install 검증은 세션 전용
  `npm_config_cache`로 실행했다. 사용자 홈 권한은 바꾸지 않았다.

### 2026-08-26 — 3단계 PR merge와 v0.6.0 release 발행

- version bump commit `3cdf77a`에서 PR #16의 3-OS gate를 재실행해
  [run 32915527971](https://github.com/moelee835/Impact-Lens/actions/runs/32915527971)이 Ubuntu 36초,
  macOS 33초, Windows 1분 31초로 모두 성공했고 PR 상태는 `CLEAN`이었다.
- 저장소 관례대로 squash가 아니라 merge commit으로 병합했다. merge commit은
  `4e1403b80b3fee18cc18983c6e0cb3f7ea9111c7`이다.
- 병합된 `main`을 checkout해 그 tree에서 artifact를 다시 생성했다. `origin/main`과 개발 branch의 tree hash가
  `d5f132b`로 동일한 것을 먼저 확인했고, CLI tarball SHA-256도 branch 빌드와 같은
  `0852e7f1ef1fe7d37611ecd33ecf8ca63bf2fb2feb209be990a2b533ecafe4e4`로 재현됐다.
- `v0.6.0` tag를 merge commit에 붙이고 draft/prerelease가 아닌 release로 발행했다. 공개 asset의 digest는
  local checksum과 정확히 일치한다.
  - `impact-lens-0.6.0.vsix` 1,129,489 bytes, `3afa31de3f2cfbf2baa0a96f4cbfacc4768d220169ad922ec310c272047a55cc`
  - `impact-lens-cli-0.6.0.tgz` 22,770 bytes, `0852e7f1ef1fe7d37611ecd33ecf8ca63bf2fb2feb209be990a2b533ecafe4e4`
- release note는 CHANGELOG의 `0.6.0` 절과 두 asset의 digest 표로 구성했다.

### 2026-08-26 — 4단계 공개 default-path 사후 검증

- Claude Code는 `claude plugin update impact-lens@impact-lens --scope local`로 `0.1.0` → `0.2.0` update에
  성공했다. 기본 `--scope user`는 이 plugin이 local scope로 설치돼 있어 실패하므로 scope를 명시해야 한다.
- Codex CLI에는 `plugin update`가 없어 `codex plugin remove` 후 `codex plugin add`로 재설치했고
  cache root가 `~/.codex/plugins/cache/personal/impact-lens/0.2.0`으로 갱신됐다.
- 검증은 `IMPACT_LENS_CLI_PATH`와 `IMPACT_LENS_CLI_PACKAGE`가 없는 상태에서 두 host의 cache runner를 직접
  실행했다. 전역 `impact-lens`도 설치돼 있지 않아 runner가 실제로 release fallback까지 내려간다.
- 결과: 두 runner 모두 `runtime.runner.source` `release-fallback`, `runtime.cli.version` `0.6.0`으로
  doctor preflight와 `--smoke`가 `status: ready`를 반환했다. checks는 `node-engine`, `cli-package`,
  `bundled-provider-artifact`, `initialize-capability-smoke` 전부 `pass`다.
- 같은 조건에서 분석 4건이 성공했다.
  - TypeScript `cli/src/doctor.ts`의 `doctorBundledTypeScript`: direct caller `run`과 transitive `main`을
    `cli/src/index.ts`에서 찾았다.
  - JavaScript `scripts/test-plugin-artifact-e2e.mjs`의 `runNpm`: 같은 파일의 direct caller를 찾았다.
- 응답 metadata: `provider.host` `lsp`, `selectedBy` `bundled`, `languageMatch` true,
  `lifecycle.stage` `query` / `status` `ready`, `coverage.traversal.status` `complete`
  (requestedDepth 5, reachedDepth 3), `coverage.semantic.status` `static-only`,
  limitations `dynamic_calls_not_inferred`, `unsaved_buffers_unavailable`.
- 확인 runtime: Node 25.8.1, typescript-language-server 6.0.0, TypeScript 5.9.3.
- 이번 검증에서는 `~/.npm` cache 권한 문제가 재현되지 않아 release fallback이 사용자 기본 npm cache로
  정상 동작했다. pack/E2E 단계에서만 세션 전용 cache를 사용했다.
- 문서 갱신: M0 마일스톤의 공개 fallback gate를 충족으로 바꾸고 release 검증 기록을 추가했다.
  `IL-LIM-003`은 `Done`으로 전환했고, `IL-LIM-017`은 사용자 검증만 남아 `In progress`를 유지했다.
  이전 handover 문서 상단에는 blocker 해소 사실과 이 문서 link를 추가했다.
- 남은 작업: `user-tests/m0-user-test-spec.md` 작성과 실제 사용자 검증. 별도 승인 후 수행한다.
