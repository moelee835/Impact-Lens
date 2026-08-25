# M0 Provider Runtime 신뢰성 세션 Handover

## 배경과 해결할 문제

이 문서는 `IL-LIM-003` provider coverage transparency와 `IL-LIM-017` Plugin provider runtime reliability를
구현한 세션의 상태를 다음 세션에 인계한다. 자동 구현과 실제 Codex/Claude Code local Plugin 설치 smoke는
진행됐지만, Plugin의 기본 fallback이 가리키는 공개 v0.5.0 CLI와 이번 branch의 새 runtime/doctor 계약이
일치하지 않는다. 다음 세션은 이미 끝난 조사를 반복하지 않고 이 release 경계를 먼저 해결해야 한다.

## 범위

- 현재 개발 branch, PR, commit과 검증 상태를 고정한다.
- 완료된 구현과 실제 host 설치 상태를 재구성할 수 있게 기록한다.
- 공개 artifact 불일치의 재현 결과와 사용자 영향도를 명시한다.
- 다음 세션의 작업 순서, 승인 경계와 완료 조건을 제안한다.

## 범위에서 제외할 항목

- PR #16 merge
- version bump, tag 생성, GitHub release 또는 package 발행
- GitHub branch protection 변경
- M0 사용자 테스트 명세 작성 또는 실제 사용자 테스트
- Python/C/C++/Swift/Kotlin preset, DI·reflection·framework edge 구현

## 현재 구현 조사 결과

### Git과 PR 상태

- 저장소: `/Users/woony6/dev/Impact-Lens`
- 개발 branch: `fix/il-lim-017-provider-runtime`
- remote branch: `origin/fix/il-lim-017-provider-runtime`
- handover 작성 직전 HEAD: `13e3b9589af5c449c367c2f4e77f8431f8ee3a84`
- PR: [#16 Improve provider transparency and plugin runtime reliability](https://github.com/moelee835/Impact-Lens/pull/16)
- base: `main`
- 상태: `OPEN`, `MERGEABLE`, `CLEAN`, 미병합
- PR은 IL-LIM-017만이 아니라 선행 limitation backlog, milestone과 IL-LIM-003 구현도 함께 포함한다.

### 완료된 구현

- Plugin runner의 `explicit | checkout | global | release-fallback` provenance와 모든 경로의 Node 22 preflight
- Node, npm, CLI artifact, provider artifact와 provider lifecycle 실패의 구조화 오류 분리
- additive `runtime` metadata와 `doctor bundled-typescript [--smoke]`
- stderr 없이 exit code 1로 종료하는 provider 회귀 fixture
- 실제 CLI tarball clean install과 Codex/Claude cache layout의 TS/TSX/JS/JSX E2E
- Ubuntu/macOS/Windows Node 22 GitHub Actions matrix
- Windows의 `spawnSync npm.cmd EINVAL`을 피하는 shell-free `npm_execpath` 실행
- 모든 PR head에서 matrix가 실행되도록 pull request path filter 제거
- 설치/runtime/provider별 복구 절차와 limitation/milestone 문서 반영

### 주요 commit

| Commit | 내용 |
| --- | --- |
| `f374703` | Plugin runner resolution과 Node preflight 강화 |
| `ebcaa0f` | bundled provider runtime doctor 추가 |
| `0f50327` | packed Plugin E2E와 3-OS gate 추가 |
| `9c61f9b` | Plugin runtime 복구 UX 문서화 |
| `c27955d` | 모든 PR head에서 artifact gate 실행 |
| `a28609d` | Windows npm invocation 수정 |
| `f85395c` | PR platform gate 결과 기록 |
| `13e3b95` | 실제 Codex/Claude host smoke 결과 기록 |

### 자동 검증 상태

- `npm run test:all`: Extension 34/34, CLI 40/40 통과
- `npm run test:plugin-artifact`: clean tarball, Codex/Claude layout과 TS/TSX/JS/JSX 통과
- Plugin validator, skill quick validator, Claude marketplace validator: 통과
- schema, package dry-run, workflow matrix/YAML과 `git diff --check`: 통과
- 최신 PR head `13e3b95`의
  [GitHub Actions run 32827284514](https://github.com/moelee835/Impact-Lens/actions/runs/32827284514):
  Ubuntu 32초, macOS 31초, Windows 1분 24초로 모두 성공

## 실제 host 설치 상태

### Codex

- 확인한 CLI: `codex-cli 0.149.1`
- repository local marketplace `personal` 등록
- `impact-lens@personal` version 0.1.0 설치·활성화
- 설치 cache runner:
  `/Users/woony6/.codex/plugins/cache/personal/impact-lens/0.1.0/scripts/run-impact-lens`

### Claude Code

- 확인한 CLI: Claude Code 2.1.245
- repository marketplace `impact-lens`를 local scope로 등록
- `impact-lens@impact-lens` version 0.1.0 설치·활성화
- component inventory: `analyze`, `impact-lens-cli`, `notes` skill 3개
- 설치 cache runner:
  `/Users/woony6/.claude/plugins/cache/impact-lens/impact-lens/0.1.0/scripts/run-impact-lens`

### host smoke 결과

- 현재 branch에서 pack한 22,771-byte CLI tarball을 `IMPACT_LENS_CLI_PACKAGE`로 주입하면 실제 두 cache
  runner의 doctor smoke가 모두 성공한다.
- 확인 runtime: Node 25.8.1, TypeScript Language Server 6.0.0, TypeScript 5.9.3,
  `runtime.runner.source: release-fallback`, Call Hierarchy capability true
- 같은 두 runner에서 TypeScript와 JavaScript 분석 총 4건이 성공했다. TypeScript는
  `doctorBundledTypeScript`의 direct caller인 `cli/src/index.ts`의 `run`을 찾았다.
- 테스트용 `/private/tmp/impact-lens-host-smoke-20260825` tarball과 npm cache는 제거했다.
- Codex/Claude local marketplace와 Plugin 설치는 다음 세션에서 확인할 수 있도록 유지했다.

## 현재 차단 조건과 원인

설치된 두 cache runner를 override 없이 실행하면 runner가 다음 공개 artifact를 사용한다.

```text
https://github.com/moelee835/Impact-Lens/releases/download/v0.5.0/impact-lens-cli-0.5.0.tgz
```

이 공개 v0.5.0 CLI에는 이번 branch에서 추가한 doctor contract가 없다. 따라서 두 host 모두 아래 오류를
반환했다.

```json
{"schemaVersion":1,"operation":"unknown","ok":false,"error":{"code":"invalid_request","message":"Unexpected argument: bundled-typescript","retryable":false}}
```

이는 marketplace 설치 실패나 Language Server initialize 실패가 아니다. 새 Plugin runner와 이미 공개된 구형
CLI의 version/contract 불일치다. hermetic E2E는 현재 branch tarball을 주입하므로 통과하지만, 실제 사용자의
default-path 첫 실행은 새 CLI release와 runner pin이 일치하기 전까지 같은 계약을 보장하지 못한다.

추가로 이 Mac의 기본 `~/.npm` cache에는 root 소유 파일이 있어 local pack이 `EPERM`으로 실패했다. 사용자 홈
권한을 임의 수정하지 말고 검증 시 task-specific 임시 npm cache를 사용한다. CLI 시작 전 npm 오류는 아직
runner의 단일 JSON envelope로 정규화되지 않았다.

## 다음 세션 단계별 계획

### 1단계 — 상태 재확인과 release 계약 조사

1. `AGENTS.md`와 이 handover, 기존
   [`task-plugin-provider-runtime-reliability.md`](task-plugin-provider-runtime-reliability.md)를 먼저 읽는다.
2. branch/worktree, PR #16 head와 최신 3-OS check를 확인한다.
3. 기존 release workflow, version 소유 위치, asset naming과 tag 절차를 조사한다.
4. 다음 release version과 “CLI artifact 발행 → runner pin 일치 → Plugin 배포” 순서를 문서화한다.

종료 조건: 실제 파일을 변경하기 전에 release version, artifact URL, rollback과 검증 순서가 새 work document에
기록되고 사용자 승인이 필요한 발행·merge 경계가 명확하다.

### 2단계 — 승인된 release-candidate 정합성 구현

1. 사용자가 release 준비 변경을 승인한 경우에만 package/Plugin version과 runner fallback을 일관되게 갱신한다.
2. 아직 존재하지 않는 URL을 안정 사용 경로로 문서화하지 않는다.
3. clean tarball, 두 Plugin cache layout, 전체 test와 3-OS PR matrix를 재실행한다.
4. 단계 종료 시 독립 commit 후 동일 개발 branch에 push한다.

종료 조건: 한 version의 source, manifests, tarball 이름과 runner pin이 일치하고 발행 전 자동 gate가 모두
통과한다. 실제 tag/release 발행은 별도 명시 승인이 없으면 수행하지 않는다.

### 3단계 — 공개 artifact와 실제 default-path 사후 검증

1. 사용자가 승인한 절차로 artifact가 발행된 뒤 URL, digest와 package contents를 검증한다.
2. Codex/Claude local Plugin을 정식 절차로 update/reinstall한다.
3. `IMPACT_LENS_CLI_PATH`와 `IMPACT_LENS_CLI_PACKAGE` 없이 두 cache runner의 doctor와 TS/JS 분석을 실행한다.
4. 성공 runtime의 CLI version, runner source와 3-OS release run을 기록하고 commit/push한다.

종료 조건: 실제 default fallback이 새 공개 artifact로 doctor와 분석을 성공한다. 공개 artifact가 없거나
override가 필요하면 완료로 표시하지 않는다.

### 4단계 — 사용자 테스트 단계로 인계

1. 3단계가 끝난 뒤에만 M0 사용자 테스트 명세 제안을 시작한다.
2. 사용자 테스트 명세는 별도 work document와 독립 commit/push 단계로 수행한다.
3. GUI 또는 원격 PC가 필요한 실제 사용성 검증은 참여 환경과 승인 후 진행한다.

종료 조건: 이번 handover에서는 이 단계에 진입하지 않는다.

## 다음 세션용 확인 명령

민감한 token이나 credential을 출력하지 않는다. GitHub 조회는 인증된 `gh` 환경에서 실행한다.

```sh
git status --short --branch
git rev-parse HEAD
gh pr view 16 --repo moelee835/Impact-Lens
gh pr checks 16 --repo moelee835/Impact-Lens
codex plugin marketplace list
codex plugin list
claude plugin marketplace list
claude plugin list
claude plugin details impact-lens@impact-lens
```

## 테스트 및 완료 기준

- [x] 현재 branch, remote, PR과 merge 상태가 기록됐다.
- [x] 주요 구현 commit과 자동 검증 근거가 기록됐다.
- [x] 실제 Codex/Claude 설치 상태와 cache runner 위치가 기록됐다.
- [x] 공개 v0.5.0 contract 불일치가 성공으로 숨겨지지 않고 재현 결과와 함께 기록됐다.
- [x] release/merge와 사용자 테스트의 승인 경계가 명시됐다.
- [x] 다음 세션 작업이 단계별 종료 조건과 commit/push 규칙으로 정리됐다.
- [x] Markdown diff 검사가 통과하고 handover만 독립 commit/push할 수 있다.

## 작업 로그

### 2026-08-25 — Handover 작성

- 변경 파일: `docs/work/task-m0-provider-runtime-handover.md`
- 기존 구현 문서를 대체하지 않고 다음 세션의 진입점 역할만 하도록 범위를 제한했다.
- 최신 clean PR head의 3-OS 성공과 actual host release-candidate 성공을 별도로 기록했다.
- override 없는 공개 v0.5.0 실패를 release blocker로 유지하고, merge·release·사용자 테스트는 수행하지 않았다.
- 임시 artifact는 제거됐고 실제 local Plugin 설치만 유지된 상태를 기록했다.
- 필수 work document 섹션, 기존 구현 문서 local link, `git diff --check`와 변경 범위를 확인했다. 문서 한
  파일만 새로 추가됐으며 코드·설정·사용자 소유 파일은 변경하지 않았다.
