# M1 Provider 플랫폼 v0.7.0 release 정합성

- 상태: 진행 중 — 1~2단계(버전 정합성 PR·merge)까지는 사용자 확인 없이 진행. 3단계(tag+Release 발행) 직전
  사용자 확인 필요.
- branch: `release/0.7.0`

## 목적과 사용자 가치

M1(양방향 LSP, provider preset catalog, `doctor <preset>`, indexing readiness, 요청 단위 provider
override, Extension의 empty/incomplete 구분, plugin 응답 정책)은 전부 `main`에 merge됐고 gate 판정도
끝났다([`task-m1-gate-closure.md`](task-m1-gate-closure.md)). **그런데 이 중 어느 것도 아직 사용자에게
도달하지 않았다.** 최신 tag는 `v0.6.3`이고, `CHANGELOG.md`의 `Unreleased`에는 Codex manifest 항목 하나뿐이다.
VS Code 사용자도, plugin runner의 release fallback을 쓰는 agent도 여전히 M1 이전 코드를 실행한다.

이 작업이 끝나면 사용자는 **설치 가능한 v0.7.0에서 Auto로 provider를 시작하고, 실패하면 `doctor <preset>`로
복구하며, 결과의 완전성을 문서(README/INSTALL/cli-contract.md)로 이해할 수 있게 된다.** plugin runner의
release fallback을 쓰는 agent도 실제로 M1 계약(provider 진단, indexing 상태, 요청 단위 override)이 담긴
CLI를 받는다.

## 배경과 해결할 문제

R1(compatibility matrix, PR #54)·R2(사용자 문서, PR #53)·R3(gate 판정, PR #55)가 모두 merge됐다. 이 lane
(R4)은 4개 병렬 lane 중 마지막이며, 나머지 세 lane의 결과를 실제로 발행하는 것이 유일한 목적이다.

**단일 행위자가 통째로 수행한다.** 버전 정합성은 원자적이어야 한다 — `docs/work/task-m0-release-0-6-0.md`가
"하나라도 빠지면 runner pin과 공개 artifact가 다시 어긋난다"고 경고한 지점이다. R3에서 확인한 대로
agent 역할(`il-*`)의 소유 경로는 이 작업의 대상 파일(`package.json`, `cli/package.json`,
`cli/src/test/contract.test.ts`, `docs/DEVELOPMENT.md` 등)을 조각조각 나눠 갖고 있어, 역할별로 쪼개면
정합성이 구조적으로 깨진다. 이 lane은 조정 세션이 직접 수행한다.

이 작업의 절차 원본은 [`task-m0-release-0-6-0.md`](task-m0-release-0-6-0.md)(v0.6.0 release)다. 그 문서의
version 소유 위치 표는 위치 정보가 낡았다는 것을 R3 준비 과정에서 확인했으므로(R2가 README/INSTALL 본문을
바꿔 줄 번호가 이동했고, W2-C가 `scripts/fixtures/response-policy/**`라는 새 위치를 추가했다), 표를 그대로
베끼지 않고 이 문서 착수 시점에 직접 grep해 다시 만든다.

## 범위와 범위에서 제외할 항목

**포함**:
- Extension/CLI `0.6.3` → `0.7.0`(minor). Plugin payload `0.2.5` → `0.3.0`(양쪽 host). `schemaVersion`은
  `1` 유지(M1은 response에 필드를 추가했을 뿐 제거·재정의는 없다 — 아래 "version 선택 근거" 참고).
- `CHANGELOG.md`의 `Unreleased`를 `0.7.0` 절로 확정하고 M1 전체를 사용자 결과 중심으로 다시 쓴다.
- 전체 자동 gate 재실행(Extension/CLI test, packed Plugin E2E, 3-OS matrix).
- PR merge, `v0.7.0` tag와 GitHub Release 발행(`impact-lens-0.7.0.vsix`, `impact-lens-cli-0.7.0.tgz`).
- override 없는 실제 Codex/Claude Plugin default-path 사후 검증과 결과 기록.
- `docs/development-management/user-tests/m1-user-test-spec.md:4`의 stale release-candidate 버전 문구
  정정(아래 "판단이 필요한 항목" 참고).

**제외(하지 않음)**:
- `user-tests/m1-user-test-spec.md`의 실제 사용자 검증 실행 — R3가 release decision으로 이미 보류 처리함.
- 기존 `v0.6.3` tag/asset 수정 또는 삭제.
- npm registry 발행(CLI는 계속 GitHub Release asset으로만 배포).
- 역사적 기록(`CHANGELOG.md` 과거 절, `docs/work/**`의 이미 완료된 작업 로그, `m0-user-test-spec.md`) —
  `0.6.3`이 남아 있어도 사실 기록이므로 고치지 않는다.

## 현재 구현 조사 결과

### version 소유 위치 — 2026-08-31, `d1463f6`(R3 merge 직후) 기준 직접 grep

`grep -rn "0\.6\.3"`로 저장소 전체를 다시 훑었다(`node_modules/`, `.claude/worktrees/` 제외). M0 표를
신뢰하지 않고 이 결과만 근거로 쓴다.

**기능적 — 안 바꾸면 깨진다**

| 위치 | 역할 |
| --- | --- |
| `package.json:6` | Extension/VSIX version |
| `cli/package.json:3` | CLI package version, tarball 파일명 결정 |
| `cli/src/test/contract.test.ts:29` | `runtime.cli.version` 계약 assertion |
| `plugins/impact-lens/scripts/run-impact-lens:11` | release fallback tarball URL pin — **Release가 실재한 뒤에만 유효하므로 발행 3단계와 함께 묶는다** |
| `plugins/impact-lens/.claude-plugin/plugin.json:4` | plugin payload version |
| `plugins/impact-lens/.codex-plugin/plugin.json:3` | plugin payload version |

**사용자 대상 — 낡으면 링크·명령이 깨진다**

| 위치 | 역할 |
| --- | --- |
| `README.md:11,52,55,64,270` | badge, VSIX/CLI 설치 명령, runner fallback 설명(270은 M0 표의 202에서 PR #53이 옮긴 새 위치) |
| `INSTALL.md:10,56,63,72,83,92,97,101,102,111,184,226,230,235,241,247,248`(17개 행) | 다운로드 URL, 설치·확인·digest 명령. **M0 표는 "13개 위치"라고 적었으나 지금은 17개다 — 그 숫자를 신뢰하지 않는다** |
| `docs/DEVELOPMENT.md:188,193,208,227,233,243` | VSIX 파일명·release 절 예시 |
| `CHANGELOG.md` | `Unreleased` → `0.7.0` 절 확정 |

**표에 없던 새 위치 — 불활성이지만 일관성을 위해 함께 올린다**

| 위치 | 역할 |
| --- | --- |
| `scripts/fixtures/response-policy/01~10-*.json`(10개 파일, 각 12행) | `test-response-policy.mjs`가 `version` 필드를 전혀 읽지 않으므로 안 바꿔도 안 깨진다(직접 확인). W2-C(PR #48)가 만든 위치라 M0 표에는 있을 수 없었다 |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:29,35,245` | 계약 예시 응답. 불활성이지만 agent가 읽는 문서라 갱신한다(245는 M0 표의 241에서 이동) |

**바꾸지 않는다 — 역사적 기록**

`docs/development-management/user-tests/m0-user-test-spec.md:4`, `CHANGELOG.md`의 `0.6.3`/`0.6.2`/... 과거
절, `docs/work/task-redact-local-paths.md:25`, `docs/work/task-m1-request-overrides-runtime.md:93`,
`docs/work/task-child-ipc-detection.md:67`, `docs/work/task-work-purpose-context.md:48`,
`docs/work/task-plugin-manifest-compatibility.md:5,30,94`, `docs/work/task-m1-user-facing-docs.md:66`(R2가
자기 lane의 범위 결정을 기록한 문장 — 사실 그대로다).

**판단이 필요한 항목**: `docs/development-management/user-tests/m1-user-test-spec.md:4`의 "작성 기준
release candidate: CLI/Extension `0.6.3`, Plugin payload `0.2.5`"는 **작성 시점에 이미 부정확했다** — 명세는
M1이 merge된 미발행 `main`을 기준으로 썼는데 마지막 "발행" 버전인 `0.6.3`을 적었다. v0.7.0 발행 후 정직한
표현은 "이 명세는 v0.7.0으로 발행된 코드 상태를 기준으로 작성됐다"다. 이 저장소가 반복해서 정정해 온 것이
정확히 이런 stale 상태 문구다(같은 문서 5행의 "검토 대기"가 같은 종류였다). 조용히 숫자만 바꾸지 않고, 왜
바꾸는지 로그에 남기고 원문 보존 + 정정 표시 관행을 따른다.

### version 선택 근거

`0.7.0`을 쓴다. M1 milestone 문서가 "provider platform minor release"로 성격을 규정했고, 새 명령
(`doctor <preset>`), 새 응답 필드(`completion`, `limitationDetails`), 새 설정(Extension 2종)이 추가됐으므로
patch가 아니라 minor다. `schemaVersion`은 **1을 유지한다.** request 계약은 완전히 additive하다
(`provider`/`providerPreset` 상호배타 추가뿐). response는 `data.required`가
`["provider","coverage"]` → `["provider","coverage","completion","complete","truncated",
"traversalLimits","nodes","limitationDetails"]`로 늘었다 — 기존 필드의 제거·재정의는 없어 consumer는
깨지지 않지만, **CLI가 내보내야 하는 필드가 늘고 검증이 엄격해진 producer 측 변화**라는 점이 request
쪽과 다르다. `schemaVersion: 1` 유지 결정 자체는 이 차이와 무관하게 유효하다(필드 제거·재정의가
schema v2 승격 기준이며, M1은 그 기준에 해당하지 않는다).

Plugin payload는 `0.2.5` → `0.3.0`이다. W2-C(PR #48)가 agent 지침의 상태 어휘(`working`/`ready`/`unknown`
indexing vocabulary, 금지 문구)를 바꿨으므로 patch가 아니다.

### E2E가 release pin 오류를 검증하지 못한다는 것 — 4단계가 필수인 이유

`scripts/test-plugin-artifact-e2e.mjs`는 `IMPACT_LENS_CLI_PACKAGE`로 로컬에서 pack한 tarball을 주입한다
— packed artifact E2E는 `run-impact-lens:11`의 하드코딩된 release pin URL을 **한 번도 실제로 타지 않는다.**
따라서 CI가 3-OS 전부 초록이어도, pin을 `v0.7.0`으로 올렸는데 Release를 아직 발행하지 않았거나 asset
이름이 다르면 실제 사용자의 release-fallback 경로는 404가 난다. `runner.source === 'release-fallback'`
assert는 주입된 tarball로 충족되는 것이지 실제 URL로 충족되는 게 아니다 — M0 릴리스 문서 첫머리가 경고한
바로 그 문제다. **그래서 4단계(발행 후 공개 default-path 사후 검증)는 CI가 대신할 수 없는 유일한 검증이고,
선택이 아니라 필수다.**

## 단계별 구현 계획

### 1단계 — release 계약 계획 문서화 (완료)

- 목적: 실제 코드/설정 변경 전에 version 소유 위치, 발행 순서와 승인 경계를 기록한다.
- 산출물: 이 문서.
- 검증: `git diff --check`, 독립 commit·push.

### 2단계 — 0.7.0 version 정합성 구현

1. 위 "기능적"·"사용자 대상"·"불활성" 표의 모든 위치를 `0.7.0`으로, plugin manifest 2개를 `0.3.0`으로
   갱신한다.
2. `CHANGELOG.md`의 `Unreleased`를 `0.7.0` 절로 확정하고 M1 전체를 사용자 결과 중심 문장으로 다시 쓴다.
3. `m1-user-test-spec.md:4`의 stale RC 버전 문구를 정정 표시와 함께 갱신한다.
4. `npm run test:all`, `npm run test:plugin-artifact`, VSIX 패키징과 CLI tarball 내용 검사를 실행한다.
5. 독립 commit 후 같은 개발 branch에 push하고 PR을 열어 3-OS matrix 결과를 확인한다.

완료 조건: 한 version의 source, manifest, tarball 이름과 runner pin이 일치하고 모든 자동 gate가 통과한다.

### 3단계 — PR merge와 v0.7.0 artifact 발행 (tag/Release 직전 사용자 확인 필요)

1. PR head의 3-OS check가 모두 성공한 것을 확인하고 merge한다. **여기까지는 확인 없이 진행한다.**
2. merge된 `main`을 fetch하고 그 commit에서 VSIX와 CLI tarball을 생성한다.
3. tarball/VSIX 파일 목록과 SHA-256 checksum을 기록한다.
4. **여기서 멈추고 사용자에게 보고한다** — 잔존 `0.6.3` 참조가 (CHANGELOG 과거 절·work 문서 제외) 0건이라는
   grep 결과, `npm run test:all` 결과, 두 asset의 파일명과 SHA-256, merge commit hash를 함께 제시한다.
5. 승인을 받으면 merge commit을 가리키는 `v0.7.0` tag와 non-draft·non-prerelease release를 만들고 두
   asset을 올린다. **2단계(merge)와 이 단계 사이를 지연시키지 않는다** — 그 구간 동안 `run-impact-lens`의
   pin이 아직 존재하지 않는 URL을 가리킨다.
6. 공개 asset의 digest가 local checksum과 같은지 확인한다.

완료 조건: `https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-cli-0.7.0.tgz`가
실재하고 digest가 일치한다.

rollback: 검증 실패 시 release를 draft로 되돌리거나 삭제하고 tag를 제거한다. 문제가 발견되면 `v0.7.1`로
재발행한다. `main`은 revert PR로만 되돌린다.

### 4단계 — 공개 default-path 사후 검증 (CI가 대신할 수 없는 유일한 검증)

1. `IMPACT_LENS_CLI_PATH`와 `IMPACT_LENS_CLI_PACKAGE`를 **제거한** 환경에서 plugin runner를 실행한다.
2. `runtime.cli.version`이 `0.7.0`, `runtime.runner.source`가 `release-fallback`인지 확인한다.
3. `doctor <preset> --smoke`와 TypeScript/JavaScript 분석을 실행해 성공을 확인한다.
4. 결과를 이 문서에 기록한다.

완료 조건: override 없이 `runner.source: release-fallback`, `cli.version: 0.7.0`으로 doctor와 분석이
성공한다. 실패하면 완료로 표시하지 않고 원인과 함께 기록한다.

검증 환경 주의: 이 Mac의 기본 `~/.npm` cache에 root 소유 파일이 있어 local pack이 `EPERM`으로 실패한 전례가
있다(M0). 사용자 홈 권한을 바꾸지 않고 세션 전용 npm cache로 검증한다.

### 5단계 — release decision 기록

- R3가 기록한 사용자 검증 보류 결정(`task-m1-gate-closure.md`)을 이 문서에서도 인용해, M1 milestone
  문서와 릴리스 기록 양쪽에서 참조 가능하게 한다.
- M1 milestone 문서의 상태를 "In progress" → "Done"으로 갱신한다(gate 3의 문구-구현 불일치는 별도
  후속 결정 필요 항목으로 남긴 채).

## 테스트 및 완료 기준

- [x] 1단계: version 소유 위치, 발행 순서와 rollback이 문서화되고 commit/push됐다.
- [x] 2단계: `0.6.3` 잔존 참조가 CHANGELOG 과거 절과 역사적 work 문서를 제외하고 0건이다.
- [x] 2단계: `npm run test:all`과 `npm run test:plugin-artifact`가 통과한다.
- [x] 2단계: CLI tarball과 VSIX 파일 목록이 예상 범위만 포함한다(leak 없음).
- [ ] 2단계: PR head의 Ubuntu/macOS/Windows Node 22 check가 모두 성공한다.
- [ ] 3단계: 사용자 확인 후 `v0.7.0` tag가 merge commit을 가리키고 release가 draft/prerelease가 아니다.
- [ ] 3단계: 두 asset의 공개 digest가 local checksum과 같다.
- [ ] 4단계: override 없는 plugin runner의 doctor smoke와 분석이 성공한다.
- [ ] 5단계: release decision과 milestone 상태가 갱신된다.

## 작업 로그

### 2026-08-31 — 1단계 release 계약 조사와 계획 수립

- `git grep`으로 `0.6.3` 전체 위치를 재조사했다(M0 표를 그대로 신뢰하지 않음). M0 표 대비 늘어난 위치
  (INSTALL.md 17개, README.md:270, 새 fixture 10개, cli-contract.md:245)와 그대로인 위치를 구분해 표로
  고정했다.
- `run-impact-lens:11`, `.claude-plugin/plugin.json:4`, `.codex-plugin/plugin.json:3`을 직접 읽어 현재
  값(`v0.6.3` pin, `0.2.5` payload)을 확인했다.
- `test-response-policy.mjs`가 fixture의 `version` 필드를 읽지 않는다는 R2의 확인을 그대로 신뢰하지 않고
  다시 grep해 재확인했다(불활성 위치 판정 근거).
- 병합된 PR 목록(#30~#55)을 `gh pr list`로 조회해 CHANGELOG 작성 근거로 확보했다.
- `m1-user-test-spec.md:4`의 stale RC 버전 문구를 "판단이 필요한 항목"으로 분리하고 정정 방식(원문 보존 +
  정정 표시)을 미리 정했다.

### 2026-08-31 — 2단계 0.7.0 version 정합성 구현

- 위 "version 소유 위치" 세 표(기능적 6곳, 사용자 대상 4곳/파일, 불활성 2곳/그룹)의 모든 위치를 `0.7.0`으로,
  plugin manifest 2개(`0.2.5` → `0.3.0`)를 갱신했다. `sed`로 파일 단위 일괄 치환 후 각 파일에서 `0.6.3`
  잔존 0건, `0.7.0` 등장 횟수가 원래 발견한 occurrence 수와 일치함을 개별 확인했다(README.md 5건,
  INSTALL.md 17건, DEVELOPMENT.md 6건, cli-contract.md 3건, response-policy fixture 10개 각 1건).
- **CHANGELOG.md**: `Unreleased`를 비우고(원래 있던 Codex manifest 항목은 `0.7.0` 절 마지막 bullet으로
  이동) `0.7.0` 절을 사용자 결과 문장으로 새로 썼다. 병합 PR #30~#55 중 사용자에게 보이는 결과가 있는
  것만 반영했다: provider 이름으로 진단(`doctor <preset>`), 무설정 안전 선택과 언어 fallback 금지,
  `workspace/configuration`을 요구하는 서버의 정상 초기화(이전엔 타임아웃/`provider_initialize_failed`로
  위장), 색인 중인 provider와 진짜 빈 결과 구분, Extension의 empty/incomplete 구분, `complete: true`만으로
  결론 못 내리게 막는 eval, 요청 단위 provider 설정과 secret redaction, `data.completion`/
  `limitationDetails` 신규 필드(기존 필드는 그대로 유지되는 projection), 사용자 문서 갱신, TS/JS preset
  하나뿐이라는 한계. **PR #31(CI), #34(provider seam 추출), #54(test)는 사용자 결과가 없는 내부 변경이라
  제외했다.**
- **Extension empty state bullet 작성 중 오류 발견**: 처음에는 "caller 없음/provider 없음/부분 결과"
  세 가지로 구분된다고 쓰려 했으나, `src/completeness.ts:128`의 `noProviderSummary()`를 직접 열어보니
  코드 주석이 "Truth table F1 + F19, merged. See the module comment for why they cannot be told apart
  here"라고 명시했다 — caller 없음과 provider 없음은 VS Code 공개 API 한계로 **의도적으로 병합**돼 있다.
  구분되는 것은 "그래프 자체가 없음"(`EmptyItem`) vs "그래프는 있지만 완전성 caveat이 있음"(`NoticeItem`)
  두 가지뿐이다. **이 오류는 R3(PR #55, 이미 merge됨)의 Wave 2 gate 표에도 같은 형태로 들어가 있었다** —
  발견 즉시 별도 commit(`12acff7`)으로 정정했다(위 "판단이 필요한 항목" 절 참고 대신 이 로그에 기록).
  CHANGELOG bullet은 정정된 사실대로 작성했다.
- `m1-user-test-spec.md:4`를 원문 보존 + "2026-08-31 정정" 표시로 갱신했다.
- **검증**: `npm test`(Extension 58/58), `npm run cli:test`(266/266), `npm run test:response-policy`
  (16/16, 10개 fixture의 `version` 필드 변경이 eval 결과에 영향 없음 확인 — 애초에 그 필드를 읽지 않으므로
  예상대로), `npm run test:plugin-artifact` 통과.
- **패키징 검증**(session 전용 `npm_config_cache`, 사용자 홈 `~/.npm` 권한 변경 없음):
  - VSIX(`vsce package`): 31 files, 1.09 MB. `.claude/`, `.github/`, `scripts/`, `src/`, `cli/`,
    `plugins/`, `docs/` 등 leak 없음(M0가 `.vscodeignore`에 추가해 둔 제외 규칙이 그대로 유효함을 확인).
    SHA-256(branch 빌드): `4a598dc51258b4875e659b7f8e5b506a2bb37cb0c8678c353517f96a97998886`.
  - CLI tarball(`npm pack`): 31 entries, `dist/**`(19개), `schemas/**`(2개), `package.json`, `README.md`,
    `LICENSE`만 포함 — leak 없음. `pnpm`이 이 환경 PATH에 없어 M0와 동일하게 `npm pack`을 사용했다(CI의
    `test-plugin-artifact-e2e.mjs`도 `npm pack`을 쓰므로 tarball 내용은 동일). SHA-256(branch 빌드):
    `f49a8549419e98dff45e80c3fbd3043b12d53f49f5834d3062f3531e68d5e396`.
  - **이 두 checksum은 branch 빌드 값이다. 3단계에서 merge 후 `main`으로 재생성해 tree hash와 checksum이
    같은지 재확인하고, release asset은 그 재생성 결과를 올린다** (M0가 따른 절차와 동일 — branch와 merge
    commit의 tree가 다르면 값이 달라질 수 있으므로 release 시점 재생성이 필수다).
