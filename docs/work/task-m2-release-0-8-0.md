# M2 Python·Go·C/C++ v0.8.0 release 정합성

- 상태: 진행 중 — B-3(준비와 정지)까지 진행, **tag·GitHub Release 발행 직전에 멈춘다.** 사용자 승인
  대기.
- branch: `release/0.8.0`
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

## B-3. 준비와 정지 (진행 중)

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
