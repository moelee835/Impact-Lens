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
"판정" 참고).

**포함하지 않는 것(commander 지시)**: 이 8건을 **Windows에서 skip 처리하지 않는다** — 그건 방금 찾은
커버리지를 그 자리에서 다시 잃는 것과 같다. 실제로 3개 OS 모두에서 의미 있게 통과하도록 고친다.

**후속 과제로만 기록(지금 하지 않음)**: 지금 구조에서 Windows의 `cli:test` 커버리리지는 M2 gopls
lane의 `go-provider` job 부수 효과로만 존재한다. Go lane이 나중에 바뀌거나 정리되면 Windows 커버리지가
조용히 사라질 위험이 있다. 제대로 하려면 `unit` job 자체가 3-OS matrix가 되고 `go-provider` job은 Go
전용 test만 돌아야 하지만, **이건 이 lane의 판단 범위를 벗어난다** — 별도 결정으로 남긴다.

## 판정 — 제품 결함이 아니라 test 결함이다

원인 A·B 둘 다 `cli/src/providers/discovery.ts`, `cli/src/runtime.ts`의 실제 프로덕션 동작에는 문제가
없다. `findExecutable()`의 platform별 분기는 의도대로 동작하고, `bundledModuleEntryPath()`/artifact
inspection이 만드는 실제 경로도 각 OS에서 올바른 네이티브 경로다. 문제는 오직 **test가 그 경로를
검증하는 방식**(host가 만든 진짜 절대경로를 다른 platform 시뮬레이션에 섞어 씀, 그리고 OS 무관해야
할 assertion에 forward slash를 하드코딩함)에 있다.

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
- [x] 아무 test도 `win32`에서 skip되지 않는다 — `grep -n "win32"` 재확인: 남은 매치는 새 헬퍼의 주석과
  `platform: 'win32'`를 명시적으로 테스트하는 기존 test(이미 옳게 설계돼 있던 것) 하나뿐이다.
- [x] 로컬(macOS) `npm run cli:test` 271/271, `npm run test:all` 전체 통과(회귀 없음).
- [ ] 이 branch가 merge된 뒤 PR #60(`test/m2-gopls-ci-verification`)을 rebase하고, `go-provider`
  windows-latest job이 `npm run cli:test` 전체로 green이 되는 것을 실제 CI 실행으로 확인한다 — **로컬은
  macOS라 Windows 자체를 재현할 수 없으므로 이 단계가 유일한 실제 검증이다.**

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
- 로컬 검증: `npm run cli:build`, `npm run cli:test`(271/271), `npm run test:all`(전체) 통과. `grep`으로
  `win32` skip 패턴이 새로 생기지 않았음을 확인 — 남은 매치는 주석 하나와 원래부터 있던
  `platform: 'win32'` 명시 test 하나뿐이다.
