# M2 Python·Go·C/C++ v0.8.0 release 정합성

- 상태: **완료.** v0.8.0 tag·GitHub Release 발행(commander 세션, 직접 사용자 승인),
  release-fallback 공개 default-path 사후 검증(B-4) 완료, release decision(B-5) 기록까지 끝났다.
  release: https://github.com/moelee835/Impact-Lens/releases/tag/v0.8.0
- branch: `release/0.8.0`(merge 후 삭제됨, merge commit `54635c2`), 이 문서의 사후 기록은
  `docs/m2-release-0-8-0-verification-log`.
- 선행: PR #68(M2 gate-gaps, 8개 종료 gate 전부 닫힘) merge 완료(`8eb1358`) 후 착수.
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m2-closure-release.md`(commander scratchpad)의 B절.
- 절차 원본: [`task-m1-release-0-7-0.md`](task-m1-release-0-7-0.md)의 5단계. 그 문서를 먼저 읽고 그대로
  따른다 — version 소유 위치 표는 그대로 베끼지 않고 이 문서 착수 시점에 직접 grep해 다시 만든다
  (commander 지시, M1 문서 자신도 M0 대비 같은 원칙을 지켰다).

## 목적과 사용자 가치

M2(Python `bundled-pyright`, Go `gopls`, C/C++ `clangd`)는 `main`에 merge됐고 8개 종료 gate 판정도
끝났다(PR #67·#68). **그런데 이 중 어느 것도 아직 사용자에게 도달하지 않았다.** 최신 tag는 `v0.7.0`이고
`CHANGELOG.md`의 `Unreleased`에는 M2 내용이 코드 상태로만 쌓여 있다.

이 작업이 끝나면 Python/Go/C/C++ 사용자가 **설치 가능한 v0.8.0에서** 새 preset을 쓸 수 있게 된다.
**M2 마일스톤 완료와 이 릴리스는 같은 것이 아니다** — 마일스톤은 gate가 전부 닫혔다는 뜻이고, 릴리스는
그 결과를 실제로 공개 배포하는 행위다. 그리고 **이 릴리스가 "verified"를 약속하지 않는다는 것**이
가장 중요한 부분이다 — 세 preset 전부 사용자 검증 미실행으로 `experimental`이고, CHANGELOG와 release
본문 어디에도 그 반대로 읽히는 문장이 들어가면 안 된다(commander 지시).

## 범위와 범위에서 제외할 항목

**포함(B-1~B-3, 지금 한다)**:
- CLI/Extension `0.7.0` → `0.8.0`(minor). Plugin payload는 아래 B-2에서 판단.
- `CHANGELOG.md`의 `Unreleased`를 `0.8.0` 절로 확정.
- 전체 자동 gate 재실행(Extension/CLI test, packed Plugin E2E, 3-OS matrix).
- PR merge, `main`에서 artifact 재생성, **tag/Release 발행 직전에 멈춘다.**

**제외(B-4·B-5, 사용자 승인 후)**:
- 발행 후 공개 default-path 사후 검증(override 없는 release-fallback으로 doctor·analyze 실행).
- release decision 기록, M2 milestone 상태를 "Done"으로 갱신.
- `user-tests/m2-user-test-spec.md`의 실제 사용자 검증 실행 — 마일스톤 문서가 이미 보류로 닫음.

## B-1. version 소유 위치 재조사 — 2026-09-03, `8eb1358`(PR #68 merge 직후) 기준 직접 grep

`grep -rn "0\.7\.0"`로 저장소 전체를 다시 훑었다(`node_modules/`, `.git/`, `.claude/`, `dist/`, `out/`
제외). M1 문서의 표를 신뢰하지 않고 이 결과만 근거로 쓴다.

**기능적 — 안 바꾸면 깨진다**

| 위치 | 역할 | M1 문서 대비 |
| --- | --- | --- |
| `package.json:6` | Extension/VSIX version | 동일 위치 |
| `cli/package.json:3` | CLI package version, tarball 파일명 결정 | 동일 위치 |
| `cli/src/test/contract.test.ts:31` | `runtime.cli.version` 계약 assertion | 줄 번호만 이동(29→31, M2가 그 사이에 assertion을 추가했다) |
| `plugins/impact-lens/scripts/run-impact-lens:11` | release fallback tarball URL pin — **Release가 실재한 뒤에만 유효하므로 발행 3단계와 함께 묶는다** | 동일 위치 |
| `plugins/impact-lens/.claude-plugin/plugin.json:4` | plugin payload version | 동일 위치, 현재 값 `0.3.0`(M1이 올린 값) |
| `plugins/impact-lens/.codex-plugin/plugin.json:3` | plugin payload version | 동일 위치, 현재 값 `0.3.0` |

**사용자 대상 — 낡으면 링크·명령이 깨진다**

| 위치 | 역할 | M1 문서 대비 |
| --- | --- | --- |
| `README.md:11,52,55,64,276` | badge, VSIX/CLI 설치 명령, runner fallback 설명 | 4곳은 동일, 270→276로 6줄 이동(M1 자신의 후속 커밋이 그 사이 본문을 늘렸다) |
| `INSTALL.md`(17개 행: 10,56,63,72,83,92,97,101,102,111,187,229,233,238,244,250,251) | 다운로드 URL, 설치·확인·digest 명령 | **개수는 17개로 M1 문서와 동일하지만 줄 번호는 다르다**(M1 표는 184/226/230/235/241/247/248, 지금은 187/229/233/238/244/250/251 — M1 자신의 3단계 갱신이 사이 본문을 늘렸다). 새로 늘어난 위치는 없다 — 세 M2 lane 모두 INSTALL.md를 건드리지 않았다. |
| `docs/DEVELOPMENT.md:188,193,208,227,233,243` | VSIX 파일명·release 절 예시 | 동일 위치 |
| `CHANGELOG.md` | `Unreleased` → `0.8.0` 절 확정 | 동일 |

**표에 없던 새 위치 — 불활성이지만 일관성을 위해 함께 올린다**

| 위치 | 역할 | 확인 |
| --- | --- | --- |
| `scripts/fixtures/response-policy/01~21-*.json`(**21개 파일**, M1 시점 10개에서 **11개 늘었다** — commander가 정확히 예측한 항목) | `test-response-policy.mjs`가 여전히 fixture의 `version` 필드를 전혀 읽지 않는다 — 이번에도 다시 grep해 직접 재확인(`grep -n "version" scripts/test-response-policy.mjs` 0건) | 불활성 확인 |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:29,35,290` | 계약 예시 응답 | 불활성이지만 agent가 읽는 문서라 갱신한다(M1 시점 29,35,245였고, M2가 새 섹션을 추가해 245→290으로 이동) |

**바꾸지 않는다 — 역사적 기록**

`CHANGELOG.md`의 `0.7.0`/`0.6.3`/... 과거 절, `docs/development-management/user-tests/m1-user-test-spec.md`,
`docs/work/task-m1-*.md`·`docs/work/task-m2-*.md`(이미 완료된 작업 로그), `pnpm-lock.yaml:1046`(**우리
package가 아니라 무관한 npm dependency의 `engines` 필드** — `grep`으로 직접 확인, 이 lockfile은 우리
자신의 workspace package 버전 문자열을 전혀 담지 않는다는 것도 `grep -n "impact-lens" pnpm-lock.yaml`로
확인했다: 0건).

**확인했지만 위치가 아닌 것 — commander가 지목한 후보 두 개를 직접 검사**

- **"workflow의 release fallback pin"**: `.github/workflows/**`를 `0.7.0`으로 다시 grep했지만 **0건**이다
  — 어떤 workflow 파일도 버전을 하드코딩하지 않는다. release fallback pin은
  `plugins/impact-lens/scripts/run-impact-lens:11` 하나뿐이고 이미 "기능적" 표에 있다. commander의
  가설과 다르므로 그대로 보고한다(추측한 위치를 확인 없이 표에 추가하지 않는다).
- **plugin payload**: 아래 B-2에서 판단 — 새 위치가 아니라 "이번에 버전을 올려야 하는가"의 문제였다.

**M1 문서와의 차이 요약**: 새 기능적/사용자 대상 위치는 **없다**. 줄 번호 이동만 있다(M1 자신의 릴리스
작업과 M2 세 lane이 그 사이 본문을 늘린 결과). 유일한 실질적 차이는 response-policy fixture가 10→21개로
늘어난 것인데, 그 필드가 여전히 읽히지 않아 불활성으로 남는다.

## B-2. version 선택

### CLI/Extension: `0.8.0`

M2는 **언어 지원 추가**다 — breaking change 없음, additive. `schemaVersion`은 **1을 유지한다.**

- **무엇이 추가됐는가**: `gopls`(Go, `verified-external`)와 `clangd`(C/C++, `verified-external`) 두 신규
  catalog preset, `bundled-pyright`(Python, `bundled`) 1개 신규 preset(3개 preset 신규 → 총 4개).
  `limitationDetails`에 `provider_null_incoming_calls`(모든 provider 공통)와
  `compile_database_missing`/`_stale`/`_ambiguous`(C/C++ 전용) 신규 코드. `coverage.indexing.status`/
  `completion.indexingStatus`가 처음으로 `working`/`ready`를 실제로 낼 수 있게 됨(`gopls`가 최초로
  `readiness`를 선언). `.h` 파일의 `languageMatch: 'unknown'` 신규 값.
- **무엇이 안 깨졌는가**: 위 전부 **응답에 새 필드 값·새 코드가 추가된 것이지, 기존 필드의 제거·재정의는
  없다.** `data.required` 배열도 M1의 `0.7.0` 승격 이후 변경이 없다(직접 확인:
  `cli/schemas/response.schema.json`의 `required` 목록이 M1 문서가 기록한 8개 필드와 동일). request
  스키마는 이번 M2 세 lane 전체에서 전혀 건드리지 않았다(`git diff 3d5863c..8eb1358 --
  cli/schemas/request.schema.json` — 0줄).
- **schemaVersion 유지의 유일한 예외 후보 — `response.schema.json`의 `serverInfo.version`에 `maxLength:
  256` 추가(PR #62)**: 기존 필드의 타입을 바꾸지 않고 제약만 좁혔다. M1 문서가 정한 기준("필드
  제거·재정의가 schema v2 승격 기준")에 해당하지 않는다 — 실제 provider가 256 byte를 넘는 버전 문자열을
  보낼 일은 없고(실측 사례인 gopls의 3,062 byte는 이 CLI가 진입점에서 직접 잘라내므로 스키마에는 애초에
  도달하지 않는다), 이 제약을 어길 수 있는 경로가 이미 코드로 막혀 있다. `0.8.0`도 이 판단을 그대로
  가져온다 — 별도 재검토 불필요.
- **`0.8.0`이 자연스럽다**: minor다. patch가 아닌 이유는 새 preset 3개, 새 응답 코드 여러 개가 patch
  범위(버그 수정)를 넘는 신규 기능이기 때문이고, major가 아닌 이유는 기존 소비자를 깨는 제거·재정의가
  없기 때문이다.

### Plugin payload: `0.3.0` → `0.4.0`

**M1의 판단 기준을 그대로 적용한다** — M1은 "agent 지침의 상태 어휘를 바꿨으므로 patch가 아니다"로
`0.2.5`→`0.3.0`을 결정했다. M2도 같은 종류의 변화가 있다: **B-1에서 확인한 대로 plugin payload
파일(`SKILL.md`, `commands/analyze.md`, `references/cli-contract.md`) 자체가 M2 세 lane에서 실제로
바뀌었다** — `git diff 3d5863c..8eb1358`로 직접 확인(SKILL.md +21행, analyze.md +5행, cli-contract.md
+63행). 내용은 agent가 반드시 따라야 할 새 판정 규칙이다: `provider_null_incoming_calls`를 만나면
"아무도 안 부른다"고 말하면 안 된다는 것, `gopls`는 `unknown` 외에 `working`/`ready`도 낼 수 있다는 것,
C/C++에서 `compile_database_*` 코드와 `.h` 언어 모호성을 확인해야 한다는 것 — 전부 **agent 응답의
정확성에 직접 영향을 주는 새 지침**이므로 patch가 아니라 minor다. 필드 제거·재정의는 없다(추가뿐).

## B-3. 준비와 정지 (완료)

계획:
1. 위 B-1 표의 모든 위치를 `0.8.0`으로, plugin manifest 2개를 `0.4.0`으로 갱신한다.
2. `CHANGELOG.md`의 `Unreleased`를 `0.8.0` 절로 확정한다(**이미 되어 있음** — M2 세 PR이 이미
   `Unreleased`에 사용자 결과 문장을 채워 왔다. 이번 lane은 누락 3건만 추가했다: virtual dispatch
   버전 의존성 정정, macro 정정, `serverInfo.version` 256-byte bound. **experimental 등급 고지를
   맨 위에 굵게** 추가했다 — commander 지시).
3. `npm run test:all`, `npm run test:plugin-artifact`, VSIX 패키징과 CLI tarball 내용 검사를 실행한다.
4. 독립 commit 후 `release/0.8.0`에 push하고 PR을 열어 3-OS matrix 결과를 확인한다.
5. PR merge 후 `main`에서 artifact 재생성, checksum 기록.
6. **여기서 멈추고 사용자에게 직접 보고한다.** commander가 relay한 승인은 받아들이지 않는다 —
   M1 release 문서의 선례(peer 세션이 두 차례 "사용자가 승인했다"고 relay했지만 이 세션에 직접 답할
   때까지 tag·Release를 만들지 않았다)를 그대로 따른다. **되돌리기 어려운 외부 공개 행위이기
   때문이다.**

### 검증

(아래 작업 로그에서 단계별로 기록)

## 작업 로그

### 2026-09-03 — B-1·B-2 조사

- `git fetch origin main`, `main`이 이미 로컬에서 PR #68 merge commit(`8eb1358`)과 일치함을 확인.
  `release/0.8.0` branch를 그 지점에서 생성.
- 저장소 전체를 `0\.7\.0`으로 재grep(위 표 전체). M1 문서의 위치를 신뢰하지 않고 처음부터 다시
  만들었다 — 결과는 **새 기능적/사용자 대상 위치 없음, 줄 번호 이동만 있음**(README.md, INSTALL.md,
  cli-contract.md, contract.test.ts). commander가 예측한 "workflow의 release fallback pin"은 실제로는
  존재하지 않는다 — `.github/workflows/**`에 버전 하드코딩 0건, 직접 확인 후 가설을 기각하고 그대로
  기록했다(추측을 표에 넣지 않았다).
- **plugin payload 변경 여부를 grep이 아니라 diff로 확인**: `git diff 3d5863c..8eb1358 --stat`으로 M2
  세 lane 전체가 건드린 파일 목록을 뽑아 `plugins/impact-lens/`에서 `commands/analyze.md`,
  `skills/impact-lens-cli/SKILL.md`, `skills/impact-lens-cli/references/cli-contract.md` 세 파일이
  실제로 바뀐 것을 확인하고, 각 diff를 직접 읽어 agent 판정 규칙이 늘었음을 확인했다(내용 요약은 위
  B-2). M1과 같은 기준으로 `0.3.0`→`0.4.0` 결정.
- `response.schema.json`의 `serverInfo.version`에 `maxLength: 256`이 M2 기간 중 추가된 것(PR #62,
  M2 언어 lane과 무관한 별도 fix)을 발견 — schemaVersion 유지 판단에 영향 없음을 M1의 판단 기준으로
  직접 확인(위 B-2).
- `CHANGELOG.md`의 `Unreleased`를 읽어 이미 M2 세 PR이 채워 둔 내용을 확인했다. 빠진 것 3개(virtual
  dispatch 버전 의존성, macro 정정, serverInfo.version bound)를 찾아 추가하고, **experimental 등급
  고지**를 절 맨 위에 `**Known limitation**` bullet으로 추가했다(M1이 "known limitation"을 절 후반부에
  둔 것과 달리, commander가 이 릴리스에서 가장 오독되기 쉬운 지점으로 지목했으므로 맨 위에 뒀다).
- **부수 발견(이 lane의 범위 밖, 기록만 한다)**: `docs/development-management/user-tests/
  m2-user-test-spec.md:5`의 `상태: 작성 완료, 검토 대기`가 `m2-p1-language-support.md`의 gate 8
  판정문("명세는 작성·검토 완료")과 모순돼 보인다 — 검토가 실제로 끝났다면 이 파일 자체의 상태 문구가
  갱신되지 않은 것으로 보인다. **버전 문자열이 아니므로 B-1의 대상이 아니고, A(마일스톤 종료 처리)의
  영역이라 이 릴리스 lane이 대신 고치지 않는다** — commander에게 별도로 보고한다.

### 2026-09-03 — B-3 구현

- 위 B-1 표의 모든 위치를 `0.8.0`으로, plugin manifest 2개(`0.3.0`→`0.4.0`)를 갱신했다. 파일별로
  `0.7.0` 잔존 0건, `0.8.0` 등장 횟수가 원래 grep으로 찾은 occurrence 수와 정확히 일치함을 개별
  확인했다(README.md 5건, INSTALL.md 17건, DEVELOPMENT.md 6건, cli-contract.md 3건, response-policy
  fixture 21개 각 1건). 전체 재grep(`grep -rln "0\.7\.0"`, node_modules/.git/.claude/dist/out 제외)
  결과 남은 위치는 전부 CHANGELOG 과거 절과 M1/M2 역사적 work 문서, 그리고 무관한 lockfile
  `engines` 필드뿐 — 새로 추가한 `task-m2-release-0-8-0.md` 자신(이 문서가 `0.7.0`을 이전 버전으로
  서술하는 것은 의도된 것)을 빼면 전부 예상된 목록과 일치한다.
- `run-impact-lens:11`의 release fallback pin을 `v0.8.0`/`impact-lens-cli-0.8.0.tgz`로 올렸다 —
  M1과 같은 트레이드오프: Release가 아직 없으므로 이 커밋부터 발행 시점까지 release-fallback 경로는
  404다(checkout·global 경로는 무관).
- **검증**: `npm run test:all`(`test:unit`+`test:response-policy`+`test:plugin-artifact`) 전부
  통과 — Extension·CLI 유닛 331개 중 328 pass·0 fail·3 skip(로컬 gopls PATH 환경 문제, PR #68에서
  실제 3-OS CI로 회귀 아님을 이미 확인), response-policy 27/27(21개 fixture 전부 `0.8.0`으로 갱신된
  채 그대로 통과 — `version` 필드가 eval에 영향 없다는 M1의 확인을 재확인), plugin-artifact E2E 통과.
  두 스크립트 출력 모두 `impact-lens@0.8.0`/`@impact-lens/cli@0.8.0`로 버전이 정확히 반영됨을 확인.
- **패키징 검증**(session 전용 `npm_config_cache`, 사용자 홈 `~/.npm` 권한 변경 없음):
  - VSIX(`vsce package`): 31 files, 1.1 MB, leak 패턴(`.claude/`, `.github/`, `scripts/`,
    `extension/src/`, `extension/cli/`, `extension/plugins/`, `extension/docs/`) 매치 0건. SHA-256
    (branch 빌드): `0c8098a9405d920554965f8bb8bc009205a793277968ca31133c7d4aed30a753`.
  - CLI tarball(`npm pack`): 32 entries(M1 시점 31개보다 1개 많음 — `childIpc.js`,
    `providers/compileDatabase.js`, `providers/readiness.js` 등 M1 이후 실제로 추가된 신규 소스
    모듈 때문이며 leak이 아니다: `dist/**`(27), `schemas/**`(2), `package.json`, `README.md`,
    `LICENSE`만 포함, `src/`·`test/`·`docs/`·`plugins/` 없음을 `tar -tzf`로 직접 확인). SHA-256
    (branch 빌드): `baff6e9f3fc6ce10ec9cfacabdf756c496fc17007ddca435c44198dc8fe4798f`.
  - **이 두 값은 branch 빌드 값이다. PR merge 후 `main`에서 재생성해 재확인한다**(M1과 동일 절차 —
    tree가 다르면 값이 달라질 수 있으므로 release 시점 재생성이 필수).

### 2026-09-03 — commander 발견: CHANGELOG의 clangd 항목 과잉 주장 정정

commander가 PR #69의 CHANGELOG를 직접 대조해 발견했다: clangd 항목의 "verified end to end ...
**for its pinned minimum version**, on Linux/macOS/Windows CI on every push" 문장이 **사실이
아니다.** 직접 재확인했다:

- `catalog.ts`의 clangd `supported.minimum`은 `'17.0.0'`이다.
- `.github/workflows/unit-tests.yml`의 `clangd-provider` job은 17.0.0을 설치하지 않는다 — Linux는
  `apt.llvm.org`의 clangd 23(실측 23.1.1), macOS는 Homebrew `llvm@23`(실측 23.1.0), Windows는
  Chocolatey `llvm --version=22.1.7`(Chocolatey에 23.x 패키지가 없어서). **CI는 17.0.0을 한 번도
  돌리지 않는다.**
- `catalog.ts`의 `lastVerified` 주석이 이미 이 사실을 정확히 적어 뒀다: *"the CI-verified version is
  NOT the same on all three OSes, so 'verified on 3 OSes' would overclaim"*. 이 문장이 `gopls`
  항목(실제로 CI가 `supported.minimum`과 정확히 같은 `0.19.1`을 설치·실행함, `go install
  golang.org/x/tools/gopls@v0.19.1`)에서 그대로 복사돼 clangd에 잘못 옮겨진 것으로 보인다 — CHANGELOG
  작성 시점에 재검증하지 않았다.
- **CHANGELOG를 정정했다**: "for its pinned minimum version"을 지우고, darwin/arm64 수동 검증은
  17.0.0(pinned minimum) 기준이라는 것과, CI는 그와 **다른** 버전(Linux 23.1.1/macOS 23.1.0/Windows
  22.1.7)을 돈다는 것을 명시적으로 구분해서 적었다.
- **같은 기준으로 나머지 전체를 재대조했다**: gopls 항목(CI가 정확히 `0.19.1` pin을 설치·실행 —
  `lastVerified.versions: ['0.19.1', '0.23.0']`와 workflow의 `go install ...@v0.19.1`이 실제로
  일치함을 재확인, 정정 불필요), Python 항목의 "covered unconditionally by the existing cross-OS
  `cli:test` jobs"(`unit-tests.yml`의 python-provider 부재 설명 주석이 "temporarily moving
  cli/node_modules/pyright aside... fails those four tests loudly... never skips them"이라고 실측을
  적어 뒀음을 재확인 — 정정 불필요), 나머지 6개 bullet(모두 OS/버전 claim이 없는 순수 동작 설명 —
  대상 없음). **clangd 항목 1건만 정정 대상이었다.**
- **부수 발견(이 lane의 범위 밖, 기록만 한다)**: `catalog.ts`의 Python(`bundled-pyright`)
  `lastVerified` 주석이 "this preset has no CI job yet exercising windows-latest/ubuntu-latest ...
  Stage 5 ... is where that gap closes"라고 미래형으로 적혀 있는데, `unit-tests.yml`의 실제 주석은
  이미 그 gap이 닫혔다고(실측 포함) 서술한다 — `catalog.ts` 쪽 주석이 stage 5 완료 후 갱신되지 않은
  것으로 보인다. **CHANGELOG의 근거는 아니었다**(CHANGELOG는 이미 두 사실을 정확히 구분해서 적었다 —
  "darwin에서 손으로 검증"과 "cross-OS cli:test가 무조건 커버"를 별개 문장으로 뒀다), 릴리스 lane의
  범위도 아니라 고치지 않았다 — commander에게 별도로 보고한다.

### 검증

- `git diff --stat`: `CHANGELOG.md` 1 file, 5 insertions, 3 deletions 만 변경.
- `npm run test:all` 재실행 — 회귀 없음(clangd 항목 문구 수정은 코드가 아니라 CHANGELOG 텍스트만
  바꾸므로 테스트 영향 없음, response-policy eval은 CHANGELOG.md를 읽지 않는다는 것도 재확인).

### 2026-09-03 — reviewer 발견: INSTALL.md의 `검증`/`verified` 용어 충돌 정정 (backlog 아님)

reviewer가 `INSTALL.md:438`(당시 줄 번호)에서 "Python·Go·C/C++는 이미 **검증된 preset**이 있어
Auto가 자동으로 고릅니다"가 같은 릴리스 CHANGELOG 맨 위의 "All three ship as `experimental` ...
not as 'verified'"와 **정반대로 읽힌다**고 지적했다. commander가 backlog로 미루지 않고 이 PR에서
바로 고치라고 지시했다 — 이 PR이 이미 INSTALL.md를 건드리고 있어(버전 bump) 범위 밖이 아니라는
이유였다.

**진단**: "검증된"이 여기서는 `resolve.ts`의 선택 순서 용어("verified auto-discovery" — CLI가
catalog 선언과 실행 파일 존재를 확인했다는 뜻)를 가리키는 기존 표현이었다 — 이 PR이 만든 결함이
아니다. 하지만 문장이 "검증된 preset**이 있어**"로 읽혀 preset 자체의 속성(사용자 검증 완료)처럼
보인다.

**INSTALL.md 전체를 같은 눈으로 재훑었다**(`grep -n "검증\|verified" INSTALL.md`):

- `:133-134`의 `verified-external` tier 이름은 그대로 두었다 — 배포 형태 tier의 정식 이름이고
  바로 옆에 무엇을 뜻하는지(PATH 설치 필요) 이미 명시돼 있어 모호하지 않다.
  `:144`("설치 검증")과 `:231`("다운로드 파일 검증")은 동사형 "확인하다"의 뜻으로 완전히 다른
  의미이며 모호하지 않다 — 대상 아님.
- `:422`("검증된 auto-discovery")와 `:427`("검증된 provider 후보")은 정의 없이 쓰인 선택 순서
  전문 용어였다 — README.md:196의 기존 정의("감지된 언어를 지원한다고 catalog에 선언된 preset이
  정확히 하나뿐이고 그 실행 파일을 찾을 수 있을 때만 선택된다")를 빌려와 `:422`에 괄호로 명시적
  정의를 추가했고("사용자가 그 결과를 검증했다는 뜻이 아닙니다"까지 명시), `:427`은 "검증된"을
  빼고 "auto-discovery 후보"로만 표현해 재사용 없이 단순화했다.
- `:438-443`(reviewer가 지목한 문단): "이미 **검증된** preset이 있어"를 "이미 catalog에 preset이
  있어"로 바꿔 preset의 속성이 아니라 **Auto가 찾아 자동 선택한다는 사실**만 말하게 했다. 그
  바로 뒤에 새 문장을 추가했다: **"세 preset 모두 실제 사용자 검증은 아직 실행되지 않아
  `experimental` 등급입니다"** + "Auto가 자동으로 고른다는 것은 catalog에 등록되고 실행 파일이
  발견됐다는 뜻이지, 그 결과가 사람에 의해 검증됐다는 뜻이 아닙니다"(commander 지시: 그 근처에
  등급·미검증 사실을 한 줄로 넣으라는 것). 대비 구조도 고쳤다 — "그 외 언어는 아직 검증된
  preset이 없어서"(검증 여부로 대비)를 "그 외 언어는 catalog에 preset 자체가 없어서"(preset
  존재 여부로 대비, 실제 차이와 일치)로 바꿨다.

**부수 발견(이 PR 범위 밖, 기록만)**: `README.md:210`에 **동일한 대비 구조**("그 외 언어는 ...
오늘 검증된 preset이 없어서")가 있다 — README.md는 이번 버전 bump 대상에 포함되지 않아(B-1 감사
결과, 버전 숫자 5곳뿐) 이 PR이 건드리지 않는 파일이다. commander에게 별도로 보고하고 이 릴리스
lane에서 임의로 고치지 않는다.

### 검증

- `grep -n "검증\|verified" INSTALL.md` 전체 재확인 — 남은 항목은 전부 위에서 검토한 대로
  모호하지 않은 것으로 판정.
- `npm run test:response-policy` 27/27 재실행 — 회귀 없음(eval이 INSTALL.md를 읽지 않는다는 것도
  재확인).
- `git diff --stat`: `INSTALL.md` 1 file, 10 insertions, 6 deletions.

### 2026-09-03 — commander 지시: README.md도 같은 방식으로 정정 (범위 밖 아님)

commander가 README.md를 backlog로 남기지 않고 이 PR에서 고치라고 지시했다 — 이유: (1) 이 PR이
이미 README.md를 건드리고 있다(`git diff --stat main...release/0.8.0 -- README.md`, 버전 숫자
5곳), (2) 문제가 INSTALL.md보다 넓다 — README:210은 "그 외 언어는 검증된 preset이 없다"고 해서
**나머지 셋은 검증됐다는 것을 반대 방향으로 함의**하고, README는 이 도구를 처음 보는 사람이 읽는
문서라 파급력이 크다.

INSTALL.md와 정확히 같은 방식으로 고쳤다:

- `:196`("검증된 auto-discovery"): 이미 그 자리에서 정의하고 있었지만("감지된 언어를 지원한다고
  catalog에 선언된 preset이 정확히 하나뿐이고 그 실행 파일을 찾을 수 있을 때만 선택됩니다"),
  괄호로 명시적 구분을 추가했다 — "CLI가 catalog 선언과 실행 파일 존재를 확인했다는 뜻이지,
  사용자가 그 결과를 검증했다는 뜻이 아닙니다."
- `:210`("오늘 검증된 preset이 없어서"): 대비를 검증 여부에서 preset 존재 여부로 바꿨다 — "오늘
  catalog에 preset 자체가 없어서."
- 그 직전에 새 문장을 추가했다: **"`bundled-pyright`, `gopls`, `clangd` 세 preset 모두 실제 사용자
  검증은 아직 실행되지 않아 `experimental` 등급입니다"** + "Auto가 자동으로 고른다는 것은 catalog에
  등록되고 실행 파일이 발견됐다는 뜻이지, 그 결과가 사람에 의해 검증됐다는 뜻이 아닙니다"(commander
  지시: CHANGELOG의 known limitation이 README에서도 읽혀야 한다).

**파일 전체 재훑음**(`grep -n "검증\|verified" README.md`): `:107`("검증 근거", 변경 영향 검토용
증거), `:150`("검토와 검증이 필요한"), `:240`("--fixture는 ... 검증합니다", doctor 명령의 진단
동작) 셋 다 preset 등급과 무관한 다른 뜻이라 대상 아님. `:207`의 `verified-external` tier 이름은
그대로 뒀다(이미 옆에 뜻이 명시돼 모호하지 않음, INSTALL.md와 동일 판단).

### 검증

- `grep -n "검증\|verified" README.md` 재확인 — 남은 3곳 전부 무관한 뜻으로 판정.
- `npm run test:response-policy` 27/27 재실행 — 회귀 없음.
- `git diff --stat README.md`: 1 file, 8 insertions, 4 deletions.

### 2026-09-03 — 3단계 전반부: PR merge, `main`에서 artifact 재생성, 정지

- PR #69를 reviewer 검토·CI 12개 check(SUCCESS, 세 차례 재확인) 확인 후 사용자 승인을 받아 commander가
  merge했다. **merge commit: `54635c2`.** local `main`을 `54635c2`로 fast-forward했다(`git fetch
  origin --prune` + `git merge origin/main --ff-only`).
- **`main`에서 재검증**(branch 빌드에 의존하지 않음): `npm run test:all` — Extension·CLI 유닛 331개
  중 328 pass·0 fail·3 skip(로컬 gopls PATH 환경 문제, PR CI로 회귀 아님을 이미 확인), response-policy
  27/27, plugin-artifact E2E 통과.
- `grep -rln "0\.7\.0"`(node_modules/.git/.claude/dist/out 제외) 전체 재실행: 잔존 위치는 CHANGELOG
  과거 절, M1/M2 역사적 work 문서(이 문서 자신 포함, `0.7.0`을 이전 버전으로 서술하는 것은 의도됨),
  무관한 lockfile `engines` 필드뿐 — **그 밖에는 0건.**
- **`main`에서 artifact 재생성**(session 전용 `npm_config_cache`, 사용자 홈 `~/.npm` 권한 변경 없음):
  - `impact-lens-0.8.0.vsix`: `vsce package`로 생성, 31 files, **1,151,985 bytes**(`ls -la`/`stat`로
    실측한 실제 파일 크기 — 처음 보고했던 1,316,011 bytes는 `unzip -l` 출력 맨 아래 총합 줄을 잘못
    읽은 것으로, 그 줄은 zip 내부 각 entry의 **압축 해제 후** 크기 합계이지 `.vsix` 파일 자체의
    디스크 크기가 아니다 — commander가 공개 asset과 대조해 발견, `ls -la`로 재확인해 정정한다).
    SHA-256은 처음 보고한 값과 일치하고(파일 자체는 맞았다), 실제 크기 숫자만 틀렸었다. SHA-256
    `49a69b0701a607769135de6d94a0c9f005ca091987e0e2993a64f0fc9d57f025`. `unzip -l` + leak 패턴
    grep(`.claude`/`.github`/`scripts/`/`extension/src/`/`extension/cli/`/`extension/plugins/`/
    `extension/docs/`)로 leak 없음 확인(매치 0건). **branch 빌드 checksum
    (`0c8098a9...`)과 다르다** — M1이 기록한 `vsce package`의 알려진 비결정성(zip 메타데이터)
    때문으로 판단, CLI tarball은 아래처럼 branch와 정확히 일치하므로 트리 불일치가 아니다.
  - `impact-lens-cli-0.8.0.tgz`: `npm pack`(cli/)으로 생성, 32 entries, 100.2 kB(unpacked 368.9 kB).
    SHA-256 `baff6e9f3fc6ce10ec9cfacabdf756c496fc17007ddca435c44198dc8fe4798f` — **branch 빌드 값과
    정확히 일치**(tar 패키징 재현 가능). `run-impact-lens:11`의 pin URL을 직접 열어 파일명이
    `impact-lens-cli-0.8.0.tgz`와 정확히 일치함을 대조했다. `tar -tzf`로 leak 없음 재확인
    (`dist/**`(27), `schemas/**`(2), `package.json`, `README.md`, `LICENSE`만).
  - **이 두 값이 release에 올릴 최종 값이다. 재생성하지 않고 이 파일을 그대로 보고한다** — 파일은
    `/private/tmp/claude-503/-Users-woony6-dev-Impact-Lens/40ff2d12-584e-47d4-bc1e-ed35c646cf67/
    scratchpad/pack-0.8.0-main/`에 보존돼 있다.
- tag·Release·asset 업로드는 이 세션이 수행하지 않는다 — commander가 자신의 세션에서 받은 직접
  사용자 승인으로 발행을 맡는다(relay된 승인으로는 발행하지 않는다는 v0.7.0 규칙을 지키기 위해).

### 2026-09-03 — commander 발견: vsix 크기 오보고 정정

commander가 공개 asset과 대조하는 과정에서 발견했다: 위 기록의 `impact-lens-0.8.0.vsix` 크기
"1,316,011 bytes"가 **실제 파일 크기가 아니다.** 원인을 직접 재확인했다 — 그 숫자는 `unzip -l`
출력 맨 아래 총합 줄("1316011 31 files")이었는데, 그 줄은 zip **내부 각 entry의 압축 해제 후
크기 합계**이지 `.vsix` 파일 자체의 디스크 크기가 아니다. `ls -la`/`stat`로 실제 파일을 다시 재본
결과 **1,151,985 bytes**였고, 이는 commander가 대조한 공개 Release asset의 크기와도 일치한다.
**SHA-256은 처음부터 정확했다** — 해시한 파일 자체는 맞았고, 옆에 적은 사람이 읽을 수 있는 크기
숫자만 잘못 옮겨 적은 것이었다. 위 B-3 기록을 실제 값으로 정정했다. `impact-lens-cli-0.8.0.tgz`
쪽은 npm이 직접 보고한 "package size"(디스크 크기)를 그대로 옮겼던 것이라 `ls -la`로 재대조해도
100,167 bytes(≈100.2 kB)로 일치 — 정정 불필요.

## B-4. 공개 default-path 사후 검증 — CI가 대신할 수 없는 유일한 검증

`task-m1-release-0-7-0.md` 4단계와 같은 이유로 필수다: `test-plugin-artifact-e2e.mjs:70`이
`IMPACT_LENS_CLI_PACKAGE`로 로컬 tarball을 주입하므로, PR #69의 3-OS CI 전부 green이었어도 **방금
발행한 실제 `v0.8.0` Release URL은 한 번도 타지 않았다.**

### 상위 선택 경로 4개를 전부 명시적으로 막고 실행

1. **checkout 경로 차단**: `run-impact-lens` 스크립트를 저장소 밖(`$SCRATCH/b4-verify/`)에 파일
   하나만 복사해 실행했다 — 원본 경로 `plugins/impact-lens/scripts/run-impact-lens`는 스크립트
   기준 상대 경로(`plugin_dir/../../cli/dist/index.js`)가 정확히 저장소 root의 `cli/dist/index.js`를
   가리키도록 설계돼 있으므로, `scripts/`라는 중첩 구조 없이 파일 하나만 복사하면 그 상대 경로가
   다른 곳을 가리킨다. **가리키는 곳에 실제로 `cli/dist/index.js`가 없음을 스크립트와 동일한 경로
   계산 로직을 직접 재현해 먼저 확인**했다(`CDPATH= cd -- ... && pwd` 그대로 재현) — 계산된 경로:
   `.../scratchpad/../../cli/dist/index.js`, `[ -f ... ]` 결과 부재 확인.
2. **global 경로 차단**: `command -v impact-lens` — 이 머신에 전역 설치 없음을 확인(빈 결과).
3. **override 환경변수 차단**: `env -u IMPACT_LENS_CLI_PATH -u IMPACT_LENS_CLI_PACKAGE`로 두 변수
   모두 명시적으로 unset한 상태에서 실행(원래도 미설정이었지만 이중으로 확인).
4. **fresh npm cache**: 이 검증 전용으로 새로 만든 `$SCRATCH/b4-fresh-npm-cache`(이전에 이 세션이
   `test:plugin-artifact` 등에서 쓴 캐시와 완전히 분리) — 이전 실행이 실제 release URL을 이미 캐시해
   둔 것을 재사용하는 착시를 배제한다.

### 실행 결과 — 둘 다 release-fallback, 새 preset(Python)까지 함께 검증

- `doctor bundled-pyright --smoke`: `runtime.cli.version: "0.8.0"`, `runtime.runner.source:
  "release-fallback"`, `status: "ready"`, 7개 check 전부 `pass`(`bundled-provider-artifact`가
  `pyright 1.1.413`를 실제로 읽어 들였고 `initialize-capability-smoke`가 실제 Language Server를
  띄워 `callHierarchy: true`를 확인).
- 실제 `.py` 2-파일 fixture(`target.py`/`caller.py`, `fixture_caller`가 `fixture_target`을 호출)로
  `analyze` 실행: `ok: true`, `runtime.cli.version: "0.8.0"`, `runtime.runner.source:
  "release-fallback"`, `provider.selectedBy: "bundled"`, `fixture_caller`가 `fixture_target`의
  direct caller로 정확히 검출됨(`completion.requestStatus: "succeeded"`,
  `traversalStatus: "exhausted"`).
- **실제 네트워크 fetch였다는 것도 확인**: 방금 만든 fresh cache 안에
  `_npx/.../node_modules/@impact-lens/cli/package.json`이 실제로 생성됐고 그 `version`이
  `"0.8.0"`임을 직접 열어 확인했다 — 가정이 아니라 이 검증이 만든 파일을 직접 읽었다.

**결과**: override 없이, checkout·global 경로를 명시적으로 막은 상태에서, release-fallback으로
`0.8.0`이 실제로 도달 가능함을 doctor와 analyze 양쪽에서, 그리고 신규 preset(bundled-pyright)을
통해 확인했다. **pin 404 창이 여기서 닫혔다** — commander가 별도로 공개 URL SHA-256 대조로도 이미
확인했다.

### 검증

- 위 4개 항목 전부 명령 출력으로 직접 확인(추측 없음).
- doctor·analyze 응답 JSON 원문을 이 로그의 근거로 인용했다(요약이 아니라 실제 필드값).

### reviewer의 독립 재현 — 이 세션과 별개로 다시 실행, 갭 없음

commander가 "발행된 pin이 동작한다"는 주장은 틀리면 지금 사용자에게 영향이 가는 종류라고 판단해
reviewer에게 B-4의 독립 재현을 별도로 맡겼다. **reviewer의 결과는 이 세션의 결과와 100% 일치했고,
재현 방법이 세 지점에서 더 강했다**(commander를 통해 전달받은 reviewer의 결과 — 이 세션이 직접
실행을 관측한 것은 아니고, 아래는 그 보고를 그대로 기록한다):

1. **재도출이 아니라 실행 중인 스크립트 자신의 trace에서 직접 관측**: 이 세션은 `run-impact-lens`의
   경로 계산 로직(`CDPATH= cd -- ... && pwd`)을 별도로 재현해 결과 경로에 파일이 없음을 확인했다.
   reviewer는 `sh -x`로 **실행 중인 그 스크립트 자체의 trace**에서 계산된 경로를 직접 뽑았다:
   ```
   + impact_lens_repo_entry=<tmp>/plugins/impact-lens/../../cli/dist/index.js
   ```
   재도출("내가 계산한 경로와 runner가 실제로 쓰는 경로가 같은가")과 동일 실행 관측("runner가 실제로
   쓴 경로 그 자체")은 증거의 층위가 다르다 — 후자는 그 질문 자체가 성립하지 않는다.
   [부수 관측: reviewer가 옮긴 trace 줄이 `plugin_dir` 계산 단계(cd 이전, `..` 미해석)를 보여주는
   것으로 보인다 — 이 세션이 관측한, `cd`로 이미 해석된 `impact_lens_plugin_dir` 이후의 최종 경로와
   표현 형태가 다르지만, 가리키는 실질(저장소 밖이라 `cli/dist/index.js` 부재)은 같다.]
2. **"시도했지만 실패"가 아니라 "진입조차 안 했다"는 것을 trace 전체에서 확인** — `impact_lens_run_path`
   (explicit/checkout/global 세 경로가 공통으로 호출하는 함수)가 trace에 **한 번도 나타나지 않았고**,
   `impact_lens_select_source release-fallback` 호출만 실행됐다. **이 세션의 기록에는 없던 사실**이다
   — 이 세션은 최종 응답의 `runner.source: "release-fallback"` 필드로 결과를 확인했지만, 세 상위 경로
   함수가 아예 호출되지 않았다는 것을 실행 경로 자체에서 직접 보인 것은 reviewer의 재현이 처음이다.
3. **npm verbose 로그로 실제 network fetch(cache miss)를 확인**:
   ```
   npm http fetch GET 200 https://release-assets.githubusercontent.com/.../impact-lens-cli-0.8.0.tgz ... (cache miss)
   ```
   이 세션은 fresh cache 안에 생긴 `_npx/.../package.json`의 `version` 필드를 읽어 "실제로 발행된
   tarball을 받았다"는 것을 확인했다. reviewer는 npm의 verbose network 로그로 그 fetch가 **cache
   miss(=이전 실행 결과 재사용이 아니라 이번에 실제로 내려받음)**였다는 것을 한 단계 더 직접
   확인했다 — 같은 결론에 도달하는 서로 다른 두 증거다.
4. **같은 fixture를 재사용하지 않고 독립적으로 새로 작성**: 이 세션은 `target.py`/`caller.py`
   (기존 bundled-pyright preset 정의의 fixture와 같은 구조)로 direct call 1건만 확인했다. reviewer는
   `util.py`/`main.py`를 직접 새로 작성해 **direct(`run` → `greet`)와 transitive(`(module)` → `run`)
   두 단계**를 확인했고, call site 줄 번호를 자신이 작성한 소스와 대조까지 했다. 같은 fixture를
   다시 돌리는 것과 다른 fixture·다른 depth로 같은 결론에 도달하는 것은 서로 다른 종류의 증거다.

**결론**: 두 독립 실행(이 세션 + reviewer)이 서로 다른 방법으로 같은 결과(release-fallback이
발행된 v0.8.0 URL에서 실제로 CLI를 받아 bundled-pyright로 정확한 결과를 낸다)에 도달했고,
reviewer의 재현이 특히 "상위 경로가 진입조차 안 했다"는, 이 세션의 기록에는 없던 더 강한 증거를
추가했다.

## B-5. release decision 기록

**무엇을 발행했는가**: `v0.8.0`(CLI/Extension), plugin payload `0.4.0`. `main`의 `54635c2`(PR #69
merge commit)를 가리키는 tag, non-draft·non-prerelease GitHub Release, asset 2개
(`impact-lens-0.8.0.vsix`, `impact-lens-cli-0.8.0.tgz`). Release 본문은 `CHANGELOG.md`의 `0.8.0`
절 전문(known limitation 문단 포함).

**무엇이 검증됐는가**:
- M2의 8개 종료 gate 전부 근거와 함께 판정됐다(PR #67·#68, `task-m2-closure.md`·
  `task-m2-gate-gaps.md`).
- 버전 소유 위치 전수 재조사 — 새 기능적/사용자 대상 위치 없음, 잔존 `0.7.0` 0건(B-1, 이 문서).
- `npm run test:all`이 branch와 `main` 양쪽에서 통과, VSIX·tarball 패키징 leak 없음, 공개 asset의
  SHA-256이 로컬 재계산 값과 정확히 일치(commander가 직접 다운로드해 대조).
- **release-fallback 공개 default-path가 실제로 동작한다** — checkout·global 경로를 명시적으로
  막은 상태에서 doctor·analyze 둘 다 성공, 새 preset(Python)까지 함께 확인(B-4, 위). **reviewer가
  독립적으로 재현해 100% 일치했고, 상위 경로가 "진입조차 안 했다"는 것을 trace로 추가 확인했다**
  (B-4의 "reviewer의 독립 재현" 절).
- CHANGELOG의 preset별 OS/버전 claim을 코드·CI 로그와 대조해 clangd 항목의 과잉 주장 1건을 실제로
  찾아 고쳤다(commander·reviewer).
- INSTALL.md·README.md의 `검증`/`verified` 용어가 선택 tier(코드가 확인한 것)와 promotion 등급
  (사람이 검증한 것)을 섞어 쓰던 지점을 찾아 분리했다 — 사용자가 가장 먼저 읽는 두 문서가 CHANGELOG의
  known limitation과 반대로 읽히던 문제였다.

**무엇이 여전히 안 됐는가 — 가장 중요한 부분**:
- **세 preset(`bundled-pyright`/`gopls`/`clangd`) 전부 실제 사용자 검증이 실행되지 않았다.** 이
  저장소의 `tier`(`bundled`/`verified-external`)는 배포 형태이지 사용자 검증 등급이 아니다 —
  `verified-external`인 gopls·clangd도, `bundled`인 pyright도 **셋 다 지금은 `experimental`이다.**
  `user-tests/m2-user-test-spec.md`는 작성·검토만 됐고 실행은 마일스톤 4단계가 명시적으로 보류한
  상태이며, 이 릴리스도 그 보류를 뒤집지 않는다. **"v0.8.0이 발행됐다"가 "세 언어가 verified로
  승격됐다"를 뜻하지 않는다** — CHANGELOG 맨 위, INSTALL.md, README.md 세 곳 모두 이 문장을 명시적
  으로 담고 있다.
- clangd 18-21 버전의 virtual dispatch 동작은 여전히 미측정이다(17/22/23만 실측, `catalog.ts`
  `docs.limitations` 참고).
- upstream LLVM Releases 바이너리 설치 경로는 CI가 검증한 적 없다(apt.llvm.org/Homebrew/Chocolatey
  세 경로만 CI가 실제로 검증).

**backlog로 남긴 것 3건**(이 릴리스가 고치지 않음, 사용자에게 새지 않는다는 commander 판단 또는
파일이 이 릴리스 범위 밖이라는 이유):
1. ~~`cli/src/providers/catalog.ts`의 `bundled-pyright` `lastVerified` 주석이 stage 5 완료 전
   시점의 미래형 문구("Stage 5 ... is where that gap closes")로 남아 있다~~ — **M2 종료 후 별도
   정리 lane에서 clangd의 정정된 주석을 본으로 삼아 고쳤다**(`docs/m2-m1-milestone-status-cleanup`
   branch). `unit-tests.yml`의 실제 주석은 이미 그 gap이 실측으로 닫혔다고 서술했었다.
2. ~~reviewer가 발견한 stale worktree(`.claude/worktrees/agent-a74c7b5dab71f5309`,
   `.claude/worktrees/agent-ad65e9c6c64ba60cc`) 정리~~ — **같은 정리 lane에서 확인**: 둘 다
   `.gitignore:10`(`.claude/worktrees/`)로 추적 제외된 로컬 산출물이다(`git ls-files` 0건, `git
   check-ignore -v`로 확인). **저장소에 정리할 대상이 없다** — PR에 포함하지 않는다. (부수 확인:
   같은 디렉터리에 M1 시절 branch를 가리키는 worktree가 4개 더 있었다 — 전부 로컬 전용, 저장소
   정리 대상 아님, 실제 디스크 정리가 필요하면 별도 사용자 판단.)
3. ~~`README.md:210`의 용어 충돌~~ — **이미 이 lane에서 고쳤다**(commander 지시로 범위에
   포함됨, 위 작업 로그 "README.md도 같은 방식으로 정정" 참고). 애초 backlog 후보였다가 승격된
   항목이므로 여기 목록에서는 제외한다.
