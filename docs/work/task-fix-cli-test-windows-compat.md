# `cli:test`가 Windows에서 처음 돌아 드러난 사전 존재 결함 수정

- 상태: In progress
- branch: `fix/cli-test-windows-compat`
- 관련: M2 stage 3(`test/m2-gopls-ci-verification`, PR #60)가 처음으로 `npm run cli:test`를 Windows CI
  runner에서 돌리다 발견했다. gopls나 Go와는 무관한, 이 test 파일들 자체의 사전 존재 결함이다.

## 목적과 사용자 가치

M1 W0-2가 CI에 `cli:test`를 돌리는 안전망을 만들었지만, **그 안전망은 실제로는 ubuntu 하나에서만
작동해 왔다.** `.github/workflows/unit-tests.yml`의 `unit` job은 `runs-on: ubuntu-latest`뿐이고,
`plugin-artifact-e2e.yml`은 3-OS matrix를 돌리지만 `test:plugin-artifact`만 실행할 뿐 `cli:test`를
호출하지 않는다. **즉 Windows 사용자를 대상으로 한 CLI 코드 경로 test가 이 저장소 역사상 한 번도 CI에서
실행된 적이 없었다.**

이 lane이 끝나면 Windows에서도 CLI test 8건(지금은 실패하는)이 실제로 통과해, 다음에 누가 Windows 전용
버그를 심어도 사람 손 없이 CI가 잡는다. 이건 gopls 지원과 별개로 이 저장소 전체의 안전망 공백을 메우는
작업이다 — M2 stage 3가 우연히 그 공백을 처음 드러냈을 뿐, 이 8건은 gopls가 존재하지 않았어도 항상
거짓이었을 test들이다.

## 배경과 해결할 문제 — 실패 원인 둘, 근본 원인은 하나

M2 stage 3(`test/m2-gopls-ci-verification`)의 `go-provider` windows-latest job이 `npm run cli:test`를
실행하며 8건 실패를 냈다(`providers.test.ts` 5건, `runtime.test.ts` 2건, `providers.test.ts` 1건 —
아래 분류). 전수 진단한 결과 두 가지 서로 다른 결함이며 gopls·Go 코드와는 완전히 무관하다.

### 원인 A — platform 시뮬레이션에 host가 만든 실제 경로를 섞어 씀

`providers.test.ts`의 다음 5개 test가 `resolveProvider`/`findExecutable`에 `lookup: { platform:
'linux' }`(또는 `'linux'`)를 강제로 넘겨 POSIX 동작(PATH 구분자 `:`, 실행 비트 확인)을 host OS와
무관하게 결정론적으로 재현하려 한다:

- `auto-discovery reports the auto tier for a discovered external preset`
- `two installed verified providers for one language are reported, not guessed between`
- `PATH lookup treats shell metacharacters as ordinary filename characters`
- `PATH lookup returns the first directory that has the file and undefined when none does`
- `a name containing a separator is verified as a path and never searched for`

이 test들은 PATH 값을 만들 때 `temporaryDirectory()`(내부적으로 `os.tmpdir()` 사용)가 반환한 **실제
host의 절대 경로**를 그대로 쓴다. Windows CI runner에서 이 경로는 `C:\Users\runneradmin\...\Temp\...`
형태다. **`platform: 'linux'`를 강제하면 `findExecutable()`은 PATH 구분자로 `:`를 쓰는데, 이 경로
문자열 자체에 드라이브 문자 뒤의 `:`가 이미 들어 있어 그 자리에서 잘못 잘린다** —
`"C:\Users\...".split(':')`는 `["C", "\\Users\\..."]`가 되어 둘 다 실재하지 않는 경로가 된다.

**진짜 교훈은 "Windows에서 깨진다"가 아니다.** platform을 인자로 시뮬레이션하면서 그 시뮬레이션이
가정하는 문자열 형태(POSIX 절대경로, 콜론 없음)를 실제로 보장하지 않고 host OS가 만든 경로를 그대로
섞어 쓴 것이 원인이다 — 어느 host든 이 가정이 깨지면 재현될 수 있는 결함이었다.

### 원인 B — assertion이 forward slash를 하드코딩

- `providers.test.ts`: `the TypeScript reference preset produces the command the bundled path produced
  before`가 `args[0].endsWith('lib/cli.mjs')`를 assert.
- `runtime.test.ts`: `bundled artifact inspection reports package versions without exposing its path
  contract`가 `artifact.entryPath.endsWith(artifact.entry)`를(`entry`가 `"lib/cli.mjs"`), `the manifest
  module reference resolves only the bundled server entry`가
  `bundledModuleEntryPath(...).endsWith('lib/cli.mjs')`를 assert.

실제 `entryPath`/`command.args[0]`는 `path.join()`으로 만들어져 Windows에서 backslash
(`...\lib\cli.mjs`)를 쓰는데, 기대값은 forward slash 문자열이라 항상 불일치한다.

## 범위와 범위에서 제외할 항목

**포함**: 위 8건의 원인 A·B 수정, 제품 코드는 건드리지 않는다(원인 둘 다 test 자체의 가정 문제 — 아래
"판정" 참고). **`unit-tests.yml`에 `cli:test`를 windows-latest/macos-latest에서 실행하는 새 job
(`cli-tests-cross-os`) 추가** — 아래 "결정 정정" 참고.

**포함하지 않는 것(commander 지시)**: 이 8건을 **Windows에서 skip 처리하지 않는다** — 그건 방금 찾은
커버리지를 그 자리에서 다시 잃는 것과 같다. 실제로 3개 OS 모두에서 의미 있게 통과하도록 고친다.

**후속 과제로만 기록(지금 하지 않음)**: `npm test`(Extension test suite)도 `cli:test`와 똑같이 지금까지
ubuntu에서만 돌았다 — Windows에서 한 번도 실행된 적이 없어 이 fix가 고친 것과 같은 종류의 미검증 POSIX
가정이 남아 있을 가능성이 높다. **의도적으로 이 PR 범위에 포함하지 않는다** — `unit` job 전체를
3-OS matrix로 바꾸면 Extension test에서도 사전 존재 결함이 쏟아질 수 있고, 그러면 이 PR이 무한정
커진다. `cli:test`만 새 job으로 분리해 범위를 통제한다.

### 결정 정정(2026-09-02, commander) — Windows CI를 이 PR에 추가한다

원래 계획은 "Windows `cli:test` CI 추가는 후속 과제, 지금 하지 않는다"였다. **commander가 이 판단을
철회했다.** 이유: 이 PR 자체가 "`cli:test`를 Windows에서 동작하게 만드는" lane인데, 그 결과를 이 PR의
CI가 증명하지 못하면 검증 없이 주장한 것이 된다 — PR #58(gopls preset)이 걸렸던 바로 그 실패 모드다.
또한 지금 구조(Windows `cli:test` 커버리지가 M2 gopls `go-provider` job의 부수 효과로만 존재)는 Go
lane이 바뀌면 조용히 사라질 위험이 있다는 점도 이 결정 정정의 근거다. 그래서 `unit-tests.yml`에
`cli-tests-cross-os`(windows-latest, macos-latest, `fail-fast: false`) job을 추가해 `cli:test`만
돌린다 — ubuntu는 이미 `unit` job이 돈다. `npm test`(Extension)는 범위 밖으로 명시적으로 남겨
후속 과제로 기록한다(바로 위 문단).

### `cli-tests-cross-os` 초록이 증명하는 것과 증명하지 않는 것

`cli/src/test/runner.test.ts:8`에 **이 PR과 무관하게 이미 있던** skip이 있다:

```js
const posixOnly = process.platform === 'win32' ? test.skip : test;
```

이 한 줄이 **10개 test**(전부 plugin runner — Codex/Claude Code plugin이 CLI를 spawn하는 bash 스크립트
경로를 검증하는 test들, `runner.test.ts:66`부터 나열)를 Windows에서 전부 skip시킨다. **이 PR은 이
skip을 만들지 않았고 건드리지도 않았다** — "이 PR이 새로 만든 win32 skip은 없다"는 앞선 진술은 정확하다.

다만 그 결과로 **`cli:test / windows-latest: SUCCESS`가 "CLI test 전체 suite가 Windows에서 실행되고
통과했다"를 뜻하지 않는다.** 271개 중 10개는 Windows에서 아예 실행되지 않은 채로 초록에 포함된다. 이건
이 저장소가 계속 구분해 온 "도달 가능 vs 관측됨"과 같은 종류의 구분이다 — 지금 명시하지 않으면 나중에
이 초록을 "Windows에서 CLI 전체가 검증됐다"로 잘못 읽는 사람이 생긴다(PR #58의 gopls preset이 정확히
이 실패 모드였다).

**이 10개 skip이 정당한지(Windows에 진짜 대응 방법이 없는지, 아니면 GitHub Windows runner의 Git
Bash로 돌릴 수 있는데 안 돌리고 있는 것인지)는 이 PR의 판단 범위 밖이다.** 고치지 않았다 — 이 PR은
이미 한 번 범위가 커졌다(CI job 추가). reviewer 판정을 기다리고, 그 결과에 따라 후속 과제로 넘긴다.

## 판정 — 제품 결함이 아니라 test 결함이다

원인 A·B·C(아래 "원인 C" 참고) 전부 `cli/src/providers/discovery.ts`, `cli/src/runtime.ts`의 실제
프로덕션 동작에는 문제가 없다. `findExecutable()`의 platform별 분기는 의도대로 동작하고,
`bundledModuleEntryPath()`/artifact inspection이 만드는 실제 경로도 각 OS에서 올바른 네이티브 경로다.
문제는 오직 **test가 그 경로를 검증하는 방식**(host가 만든 진짜 절대경로를 다른 platform 시뮬레이션에
섞어 씀, OS 무관해야 할 assertion에 forward slash를 하드코딩함, host의 `path.join()` 반환값을 다른
platform 시뮬레이션에 명시 경로로 투입함)에 있다.

**특히 원인 C에 대해 명시적으로 판정한다: `findExecutable()`을 고치지 않는다.**
`name.includes('/') || (platform === 'win32' && name.includes('\\'))`가 `platform: 'linux'`에서
backslash를 경로 구분자로 인정하지 않는 건 **버그가 아니라 올바른 설계**다 — 실제 Linux/macOS에서
backslash는 파일명에 쓸 수 있는 평범한 문자이고, 그걸 구분자로 오인하면 `a\b`라는 이름의 실제 파일을
경로 두 조각으로 잘못 쪼갤 수 있다. 이 판정을 놓치고 production 코드 쪽을 "고쳐서" 통과시켰다면 실제
Linux 사용자에게 영향을 주는 새 버그를 심는 것이었다. 다음에 같은 실패를 보는 사람은 test의 문자열
생성 방식을 의심해야지 `findExecutable()`을 의심하면 안 된다.

### 세 원인의 공통 규칙 (guard test 대신 코드 주석으로 남김)

A·B·C 전부 뿌리가 같다: **platform을 인자로 시뮬레이션하면서 host가 실제로 만든 문자열을 그 안에
섞어 썼다.** `os.tmpdir()`의 드라이브 콜론(A), assertion의 forward-slash 하드코딩(B),
`path.join()`의 반환값을 명시 경로로 재사용(C) — 형태는 다르지만 전부 "시뮬레이션이 요구하는 문자열
형태를 실제로 보장하지 않았다"는 하나의 실수다. **regex source-scan guard는 추가하지 않는다** —
`cli-tests-cross-os` CI job 자체가 이미 이보다 강한 guard이고(네 번째 사례가 생기면 실행 결과로 바로
잡힌다), 이 저장소는 이미 두 번(`stateReachability.sources.test.ts`의 shorthand 맹점,
`buildInvocation.sources.test.ts`의 정규식 구멍) source-scan guard의 한계에 시간을 썼다. 대신 이
규칙을 test가 실제로 작성되는 자리(`syntheticPosixDirectory()`/`writeExecutable()` 옆 주석)에
직접 적어 다음 사람이 유혹을 느끼는 순간 바로 보이게 했다.

## 단계별 구현 계획

### 1단계 — 원인 A·B 수정 (하나의 commit)

- 목적: 8건이 3개 OS 모두에서 실제로, 의미 있게(skip 아님) 통과하게 만든다.
- 산출물:
  - 원인 A: `temporaryDirectory()` 대신 콜론이 절대 섞이지 않는 합성 POSIX 스타일 경로를 만드는 새
    헬퍼(`syntheticPosixDirectory` 가칭)를 추가해 위 5개 test에 적용. 실제 파일은 그 경로에 실제로
    생성해 real filesystem 검증은 유지한다.
  - 원인 B: 위 3개 assertion을 `path.sep`/`path.join` 기반의 OS-무관 비교로 교체.
- 검증: 로컬(macOS)에서 `npm run cli:test` 전체 통과 확인(회귀 없음). Windows 환경은 로컬에 없으므로
  로직을 코드 리뷰 수준으로 재확인하고, 최종적으로 stage 3 PR(#60)의 rebase 후 실제 Windows CI 3회
  실행으로 검증한다(아래 완료 기준).

## 테스트 및 완료 기준

- [x] 원인 A 5개 test(+ 실패하진 않았지만 같은 패턴이던 1개, 아래 참고)가 `platform: 'linux'`를
  강제하면서도 host OS와 무관한 합성 경로(`syntheticPosixDirectory`)만 쓴다.
- [x] 원인 B 3개 assertion이 forward slash를 하드코딩하지 않고 `path.join`/`path.sep`로 비교한다.
- [x] **이 PR이 새로 만든 win32 skip은 없다.** 단, 이 문장은 처음에 "이 파일이 새 skip을 안 만들었다"는
  좁은 확인이었고 저장소 전체 관점에서는 부정확한 인상을 줬다 — **정정**: `cli/src/test/*.ts` 전수
  `grep -n "win32"` 결과는 4곳이다(`providers.test.ts:383`의 정당한 `platform: 'win32'` 명시 test,
  `testFsHelpers.ts`의 주석 2곳, 그리고 **`runner.test.ts:8`의 `posixOnly` — 10개 plugin runner test를
  Windows에서 skip시키는 사전 존재 코드**). 이 마지막 항목을 처음 완료 기준에서 빠뜨렸다 — reviewer가
  재검토에서 지적했다. 아래 "`cli-tests-cross-os` 초록이 증명하는 것과 증명하지 않는 것" 섹션이 그
  범위를 다룬다. 이 PR은 그 skip을 만들지도 고치지도 않았지만, "win32 skip 없음"이라는 진술 자체는
  이 파일 하나가 아니라 저장소 전체를 정확히 가리켜야 했다.
- [x] 로컬(macOS) `npm run cli:test` 271/271, `npm run test:all` 전체 통과(회귀 없음).
- [x] **이 PR 자신의 CI**에 `cli-tests-cross-os`(windows-latest, macos-latest) job을 추가해
  `npm run cli:test`가 실제로 두 OS에서 green이 되는 것을 이 PR 안에서 직접 확인했다 —
  1차 실행: `/tmp/...` 합성 경로 자체는 유효(6개 중 5개 통과), 원인 C(별도 결함) 1건 추가 발견.
  2차 실행(원인 C 수정 후): windows-latest·macos-latest·ubuntu-latest 전부 green, `mergeStateStatus:
  CLEAN`.
- [x] 원인 A·B·C 공통 규칙을 guard test가 아니라 `syntheticPosixDirectory()` 옆 코드 주석으로
  남겼다(commander 판단: `cli-tests-cross-os` 자체가 이미 이보다 강한 guard).
- [x] `doctor.test.ts`의 잔여 원인 A 인스턴스 2건(`:108`, `:264`)을 `syntheticPosixDirectory()`로
  교체했다. 헬퍼를 `cli/src/test/testFsHelpers.ts`로 옮겨 `providers.test.ts`·`doctor.test.ts` 양쪽이
  공유하게 해, 헬퍼가 private이라 재사용이 막혀 있던 구조적 원인 자체를 없앴다.
- [ ] 위 doctor.test.ts 수정과 shared helper 이동을 실제 Windows CI로 재확인한다(다음 push).
- [ ] merge 후 PR #60(`test/m2-gopls-ci-verification`)을 rebase → `go-provider` windows-latest job도
  전체 `cli:test`로 green인지 재확인(같은 fix가 다른 job에서도 성립하는지 교차 확인 — 결과가 다르면
  그 자체가 결함).

## 이 lane이 남긴 후속 과제 (한자리 정리, commander 요청)

M2 gopls lane 전체(PR #58~#61)에서 미룬 것들이 쌓였다. **1~4는 이 lane과 무관한 별도 후속 과제이고,
5만 M2 stage 3(PR #60)의 이번 lane 안에서 닫힌다** — 그 구분을 흐리지 않는다.

**후속 과제(이 lane 밖, 지금 손대지 않음)**:
1. Extension `npm test`의 Windows/macOS 커버리지 부재 — `cli:test`와 같은 이유로 한 번도 실행된 적
   없고, 같은 종류의 미검증 POSIX 가정이 있을 가능성이 높다(위 "후속 과제로만 기록" 참고).
2. `runner.test.ts`의 `posixOnly` skip 10건의 정당성 — 이 PR이 만들지 않았고 건드리지도 않았다. **판정
   근거가 이미 이 저장소 안에 있다**: `scripts/test-plugin-artifact-e2e.mjs:15`가
   `process.platform === 'win32' ? findExecutable('bash.exe', 'bash') : '/bin/sh'`로 **같은
   `run-impact-lens`를 실제 Windows CI에서 돌려 green**이다(3-OS matrix, 이 저장소 CI에서 실행 확인
   가능). 반면 `runner.test.ts:56`의 `run()`은 `spawnSync('/bin/sh', ...)`를 리터럴로 하드코딩한다 —
   "Windows에 POSIX shell이 없다"는 전제가 같은 저장소 안에서 이미 거짓으로 증명돼 있고, skip의 진짜
   원인은 shell 부재가 아니라 `run()`의 invocation 방식일 가능성이 높다. **이번 PR에서 고치지
   않는다** — 10개 test의 실행 방식을 바꾸면 새 Windows 실패가 나올 수 있고 이 PR은 이미 두 번
   커졌다. 다음 사람은 `test-plugin-artifact-e2e.mjs:15`의 `findExecutable('bash.exe', 'bash')`
   패턴을 `run()`에 적용하는 것부터 시도하면 조사를 반복하지 않는다.
3. `unit` job과 `cli-tests-cross-os` job의 구조 정리 — 지금 `cli:test`가 ubuntu에서는 두 job
   모두에서 중복 실행된다(`unit`이 이미 돌리고, `cli-tests-cross-os`는 windows/macos만 추가했지만
   구조적으로는 "`unit` 전체를 3-OS matrix로 정리"가 더 깔끔할 수 있다 — 다만 그러면 후속 과제 1이
   같이 딸려온다).
4. `serverInfo.version`이 응답의 54.6%를 차지하며 무제한으로 통과하는 계약 구멍(commander가
   PR #60 작업 문서에 근본 원인을 이미 기록해 둠 — `lspProvider.ts:460` 유입 지점 하나).

**이 lane 안(M2 stage 3, PR #60에서 닫힘)**:
5. README.md/`m1-user-test-spec.md`의 "catalog에 preset이 하나뿐"/"`verified-external` preset이
   하나도 없다" 서술 정정 — PR #60의 "알면서 남겨둔 창" 섹션에 이미 기록돼 있고, 그 PR의 CI가 3-OS
   green이 되는 대로 같은 PR에서 `lastVerified` OS 확대와 함께 처리한다.

## 작업 로그

### 2026-09-02 — 착수와 구현

- PR #60의 `gopls / windows-latest` CI 실패 8건을 진단, gopls/Go와 무관한 원인 둘(A: platform 시뮬레이션에
  실제 host 경로 혼입, B: forward slash 하드코딩)로 분류.
- commander에게 보고, "windows에서만 skip" 대안을 명시적으로 거부받고 "실제로 3-OS에서 통과하게 고친다"
  방향으로 이 별도 branch를 분리했다. Windows 3-OS coverage가 gopls lane의 부수 효과로만 존재한다는
  구조적 위험은 후속 과제로만 기록하고 이 lane에서 다루지 않는다.
- **원인 A 수정**: `providers.test.ts`에 `syntheticPosixDirectory(t, prefix)` 헬퍼를 추가 — 콜론이
  전혀 없는 리터럴 `/tmp/impact-lens-test-<prefix><pid>-<random>` 경로에 실제 디렉터리를 만든다.
  `platform: 'linux'`를 강제하는 6개 test(실패했던 5개 + 같은 패턴이라 나중에 같이 맞춘 "a directory on
  PATH is not mistaken for an executable" 1개, 이건 CI에서 우연히 통과했었다 — 디렉터리 자체가
  `isFile()`에서 걸러지므로 PATH 분해가 틀려도 결과가 우연히 같았을 뿐이라 판단해 함께 고쳤다)에
  `temporaryDirectory()` 대신 적용.

  **커밋 시점까지 검증하지 못한 가정 하나(정직하게 기록)**: `/tmp/...`가 Windows CI runner에서
  실제로 쓰기 가능한 위치인지는 로컬(macOS)에서 확인할 수 없다. Node는 드라이브 문자가 없는 절대경로를
  현재 작업 디렉터리의 드라이브를 기준으로 해석하므로(`D:\a\Impact-Lens\Impact-Lens`에서 실행 중이면
  `/tmp/x`는 `D:\tmp\x`), 이 드라이브 루트에 디렉터리를 만들 권한이 있다는 전제에 의존한다. 이 전제가
  틀리면 PR #60 rebase 후 windows-latest job이 여전히 실패할 것이고, 그 경우 실제 host 경로에서
  드라이브 문자를 제거한 상대경로 방식(예: `process.chdir()` + `path.basename()`)으로 다시 시도해야
  한다 — 이건 추측이 아니라 다음 CI 실행이 실제로 답한다.
- **원인 B 수정**: `providers.test.ts`(TypeScript reference preset 경로)와 `runtime.test.ts`(bundled
  artifact `entryPath`, `bundledModuleEntryPath` 반환값) 3곳의 forward-slash 하드코딩을
  `path.join('lib', 'cli.mjs')` 또는 `.split('/').join(path.sep)` 기반 비교로 교체.
- 로컬 검증: `npm run cli:build`, `npm run cli:test`(271/271), `npm run test:all`(전체) 통과. 이 시점에
  `grep`을 이 세 파일(`providers.test.ts`/`runtime.test.ts`/새 헬퍼)에만 돌려 "새 skip 없음"을
  확인했다 — **`cli/src/test/` 전체로 넓혀 돌리지 않아 `runner.test.ts:8`의 사전 존재 `posixOnly`
  skip을 놓쳤다.** 이건 이 PR이 만든 게 아니지만, 아래 2026-09-02 후반 항목에서 정정한 대로 "win32
  skip 없음"이라는 진술은 처음부터 저장소 전체를 가리켰어야 했다.
- commander가 "검증 못 하는 fix는 약한 fix"라고 지적하며 앞서 후속 과제로 미룬 "Windows CI 추가"
  결정을 철회 — `unit-tests.yml`에 `cli-tests-cross-os`(windows-latest, macos-latest,
  `fail-fast: false`, `npm run cli:test`만) job을 이 PR 자신에 추가했다. `npm test`(Extension)는
  범위 밖으로 명시하고 후속 과제로 남김(위 "결정 정정" 참고).

### 2026-09-02 — 실제 Windows CI 1차 결과: `/tmp` 가정은 맞았고, 별도 결함 1건을 추가로 잡음

PR #61(이 branch)에 새로 추가한 `cli-tests-cross-os` job을 실제로 돌린 결과:
`macos-latest` 271/271 통과, **`windows-latest` 270/271, 1건만 추가 실패** —
"a name containing a separator is verified as a path and never searched for".

**`/tmp/...` 합성 경로 가정은 검증됐다 — 실제로 Windows CI runner(`D:\a\...`에서 실행 중)에서 쓰기
가능했다.** 원인 A로 고쳤던 6개 test 중 5개가 이 실행에서 처음으로 Windows에서 통과했다. 추측이 아니라
CI가 답을 준 사례.

**남은 1건의 원인은 원인 A와 다른, 세 번째 결함**이다: `writeExecutable()`의 반환값은
`path.join(directory, name)`로 만드는데, 이건 **실제 host의 `path.join()`**이라 Windows에서 항상
backslash로 정규화한다(내가 넘긴 원본 `directory` 문자열이 forward slash였어도 무관하다). 이 test는
그 반환값을 그대로 `findExecutable(executable, { platform: 'linux' })`에 "명시적 경로"로 넘기는데,
`findExecutable()`의 명시적 경로 판정(`name.includes('/') || (platform === 'win32' &&
name.includes('\\'))`)은 **`platform`이 `'linux'`일 때는 backslash를 경로 구분자로 인정하지 않는다**
(실제 Linux에서 backslash는 평범한 파일명 문자이므로 이건 production 코드로서 올바른 설계다). 그 결과
backslash로 정규화된 문자열은 두 조건 다 거짓이 돼 PATH 검색 분기로 새고, 빈 PATH에서 당연히 못
찾는다.

이것도 원인 A와 같은 계열의 실수다 — platform을 시뮬레이션하면서 그 시뮬레이션이 요구하는 문자열
형태(여기서는 forward slash 구분자)를 실제 host가 만든 문자열(`path.join()`의 native separator)로
대체한 것. `writeExecutable()`의 반환값을 재사용하지 않고, `${binaries}/impact-lens-fixture-server`로
forward slash를 직접 만들어 해결했다 — `binaries` 자체가 이미 forward-slash 리터럴이므로 이 조합은
어느 host에서도 forward slash를 유지한다. `fs.statSync`는 Windows에서도 forward slash 경로를 그대로
받아들이므로 실제 파일 조회에는 문제가 없다.

로컬(macOS) 재검증: `npm run cli:test` 271/271. 이 수정을 실제 Windows CI로 재확인하는 것이 다음
단계다.

### 2026-09-02 — reviewer 재검토: 필수 수정 2건, 그리고 보고 완결성 문제 자체를 정정

reviewer가 이 PR을 재검토해 commander를 통해 두 가지 필수 항목을 지적했다.

**1) 검증 문장이 부정확했다.** 위 항목에서 "새 skip 없음"을 `providers.test.ts`/`runtime.test.ts`/
새 헬퍼 세 파일에만 grep해 확인하고, `cli/src/test/` 전체로 넓히지 않아 `runner.test.ts:8`의 사전
존재 `posixOnly`(10개 test skip)를 놓쳤다. 위 완료 기준과 작업 로그의 해당 문장을 원문을 지우지 않고
정정 표시로 고쳤다 — `runner.test.ts:8`을 포함한 전수 `grep -n "win32"` 결과(4곳)를 명시했다.

**2) `doctor.test.ts`에 원인 A와 정확히 같은 패턴 2건이 남아 있었다**(`:108`, `:264` —
`temporaryDirectory()` + `lookup: { platform: 'linux' }`). 지금은 `binaries`가 빈 디렉터리라 "실행파일
못 찾음"이라는 기대 결과가 PATH 분해의 정오와 무관하게 같아 우연히 통과하고 있었다 — 이미 인정한
6번째 사례(`a directory on PATH is not mistaken...`)와 같은 이유다. **구조적 원인은
`syntheticPosixDirectory()`가 `providers.test.ts`의 private 함수라 `doctor.test.ts`가 재사용할 수
없었다는 것**이었다. `cli/src/test/testFsHelpers.ts`를 새로 만들어 이 헬퍼(와 규칙 주석)를 옮기고
`providers.test.ts`·`doctor.test.ts` 양쪽이 import해 쓰게 했다. `doctor.test.ts`의 두 자리를
`syntheticPosixDirectory(t, 'doctor-nobin-')`/`syntheticPosixDirectory(t, 'doctor-multi-bin-')`로
교체. 로컬 재검증: `npm run cli:build`, `npm run cli:test` 271/271.

**보고 완결성 문제 자체를 기록한다.** commander가 지적한 대로, 직전 라운드의 "요청하신 내용 반영"
보고가 필수 2건 중 1건만 담았다 — 검증 문장 정정만 보고하고 `doctor.test.ts` 잔여 인스턴스는
구현 중이었는데도 보고에 없었다. 요청이 여러 항목일 때 항목별로 반영 여부를 명시하지 않고 뭉뚱그려
"반영했다"고 보고하면, 반영 안 된 항목이 있어도 상대가 diff를 직접 떠보기 전까지 드러나지 않는다 —
이 lane이 코드와 문서에 요구해 온 "실행해서 확인하고, 읽은 것과 검증한 것을 섞지 않는다"는 원칙이
보고 자체에도 적용돼야 한다는 게 이번에 다시 확인된 교훈이다.
