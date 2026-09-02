# M2 — C/C++ clangd provider preset

- 상태: Stage 2 완료(`.h` 결정 + 구현), commander 보고 후 stage 3 승인 대기
- branch: `feat/m2-clangd-preset`(stage 1까지는 `docs/m2-clangd-investigation` — 조사만 있던 단계의
  이름. stage 2부터 실제 코드 변경이 생겨 AGENTS.md 명명 규칙에 맞춰 이 시점에 개명했다. commit
  history는 그대로 이어진다.)
- 선행: PR #64(`feat/m2-python-preset`, M2 Python lane) merge 완료 후 착수.
- 스토리: `docs/development-management/stories/il-lim-014-c-cpp-clangd-support.md`
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m2-clangd.md`(commander scratchpad)
- 성격: **조사 + 구현을 한 lane에서 한다.** Python lane(조사 lane과 구현 lane을 분리)과 다르다.
  다만 stage 1은 게이트였다 — 관측 결과가 stage 2 이후의 설계를 바꿨다(readiness 제외 확정).
  stage 2는 `.h` 결정 자체가 이 lane 고유의 설계 문제라 결정과 구현·검증을 모두 포함한다.

## 목적과 사용자 가치

**C/C++ 사용자는 지금 Impact Lens를 못 쓴다.** `.c`/`.cpp`에 `impact`를 돌리면 preset이 없어
`unsupported`로 끝난다. TypeScript·Python은 설정 없이, Go는 gopls 설치로 쓴다.

**이 lane이 끝나면 C/C++ 사용자가 "이 함수를 누가 부르는가"에 답을 받는다.** 그리고 그 답이 build
설정(compile database)에 의존한다는 사실 — 없거나 낡았을 때 결과가 조용히 나빠질 수 있다는 것 — 을
사용자가 알 수 있게 한다. C/C++은 같은 소스가 compile flag에 따라 다른 코드가 되는 언어라 이 부분이
특히 중요하다.

**상위 목표와의 관계**: 이 lane이 M2의 마지막 언어다. 끝나면 Python·Go·C/C++ 셋이 닫힌다.

**이 lane이 물려받아 다시 조사하지 않는 사실**(계획 세션이 이미 코드로 확인):

| 사실 | 근거 |
| --- | --- |
| `.c`→`c`, `.cc`/`.cpp`/`.cxx`/`.hh`/`.hpp`/`.hxx`→`cpp` 매핑 이미 존재 | `resolve.ts:597-603` |
| `.h`는 매핑에 없다 — `plaintext`로 떨어진다 | 같은 switch에 case 자체가 없음 |
| preset `extensions` ↔ `languageId()` 교차 검사 guard 존재 | `providers.test.ts:734` |
| `bundledModuleEntryPath()` 허용 목록은 명시적 `if`, 일반화 금지 | `runtime.ts` 주석이 이유를 적음 |
| readiness 신호는 `awaitReadiness()`가 `didOpen` 이전에 끝난다 | `lspProvider.ts:585` vs `:651` |
| `titlePattern` 생략 = 모든 token 통과 | `preset.ts:91`, `readiness.ts:151` |
| `provider_null_incoming_calls`가 `null`/`[]`를 구분해 표면화 | M2 Python lane stage 3 |

스토리의 `현재 기준선` 절은 낡았다 — "CLI의 자동 languageId에는 C/C++ 확장자가 없다"와 "provider가
없으면 TypeScript server를 실행한다" 둘 다 틀렸다(확장자는 있고, `IL-LIM-004`가 다른 언어로 fallback
하지 않는다고 명시한다). Stage 6에서 고친다.

## Stage 1 — 조사 게이트 (구현 전에 멈춘다)

**목적**: gopls·pyright에서 각각 다른 곳이 문제였다. clangd가 어느 쪽인지 구현 전에 안다 — 특히
readiness 신호의 형태(gopls형/pyright형)가 stage 4의 preset 설계를 가른다.

**방법**: gopls·pyright stage 1과 같은 방식 — 문서를 읽고 판정하지 않고, 실제로 설치해 raw
JSON-RPC probe(`lsp-probe-clangd.mjs`, scratchpad에만 있고 이 branch에는 commit하지 않음 — 조사
도구이지 산출물이 아님, gopls/pyright lane과 같은 선례)로 stdio를 직접 주고받았다.

**환경**: darwin/arm64, 이 machine. `/usr/bin/clangd` — Apple clangd version 17.0.0
(clang-1700.6.4.2), `Features: mac+xpc`. **이 lane은 CI를 만들지 않으므로 stage 1의 모든 결과는
darwin 관측이지 3-OS 검증이 아니다.** 추가로 Apple clangd는 Xcode Command Line Tools가 배포하는
빌드로, feature flag에 `xpc`가 붙어 있어 upstream LLVM clangd(Linux/Windows 사용자, 또는 Homebrew
`llvm` package)와 인덱싱 내부 구현이 다를 가능성이 있다 — **이 위험을 줄이기 위해 upstream LLVM
clangd도 별도로 설치해 같은 probe로 교차 검증했다**(아래 "교차 검증" 절).

**fixture**: 2-file C project, `target.h`/`target.c`(`fixture_target`, `fixture_unused` 정의)/
`caller.c`(`fixture_target()`을 호출하는 `fixture_caller` 정의). 두 변형을 만들었다 — 손으로 쓴
`compile_commands.json`이 있는 `with-db/`와 없는 `without-db/`.

### (1) Call Hierarchy 실제 왕복 — PASS

`with-db/`, `without-db/` 둘 다: `initialize` 응답의 `callHierarchyProvider: true`(선언)와 별개로,
실제 `textDocument/prepareCallHierarchy`(target.c의 `fixture_target` 정의 위치) →
`callHierarchy/incomingCalls` 왕복이 `caller.c`의 `fixture_caller`를 정확히 반환했다.

```
prepareCallHierarchy result: [{"name":"fixture_target", ...}]
incomingCalls result: [{"from":{"name":"fixture_caller", ...}, "fromRanges":[...]}]
RESULT: fixture_caller found as incoming call? true
```

선언과 실제 왕복을 별도로 확인했다(이 저장소가 이미 아는 구분 — `doctor.test.ts`).

### (2) readiness 신호의 형태 — **pyright형. gopls형이 아니다.** (게이트 결론)

**관측**: `with-db/`에서 `initialize` → `initialized` 이후, **어떤 파일도 열지 않고 15초를
기다렸다**(첫 5초 시도에서도 동일했고, 재현성을 의심할 여지를 없애려 캐시를 지우고 15초로
재실행했다) — 이 15초 동안 `$/progress`(`backgroundIndexProgress`) 알림이 **0건** 도착했다. 그
직후 `caller.c`·`target.c`에 `textDocument/didOpen`을 보내자 **거의 즉시** `$/progress` 4건
(`report 0/3` → `1/3` → `2/3` → `end`)이 도착했다.

```
[+0.022s] === waiting 15s BEFORE opening any file ===
[+15.024s] === pre-open window: $/progress seen = 0 (delta 0) ===
[+15.025s] === opening caller.c and target.c now (didOpen) ===
[+20.027s] === post-open window: $/progress seen after didOpen = 4 (total so far 4) ===
```

캐시를 지운 상태(`rm -rf with-db/.cache`)에서 재현했다 — 첫 실행이 이전 실행의 디스크 인덱스를
재사용해 "이미 끝나 있었다"는 착시일 가능성을 배제했다.

**결론**: clangd의 `backgroundIndexProgress`는 **workspace 단위로 파일 open 전에 도착하는 gopls형이
아니라, `textDocument/didOpen`이 트리거하는 pyright형이다.** Python lane이 실측으로 확인한 것과 같은
구조적 제약이 그대로 적용된다 — `cli/src/lspProvider.ts`의 `LspCallHierarchyProvider.awaitReadiness()`
는 `doInitialize()` 안에서 어떤 파일도 열리기 전에 호출되므로(`:585`), 이 지점에서 clangd의
readiness 신호는 **아직 존재하지 않는다.** `readiness`를 preset에 넣으면 그 신호를 영원히 기다리다
`budgetMs`를 통째로 태우는 순수 지연만 생긴다 — Python은 이 대가가 10초였다.

**요구사항 문서의 게이트 조건이 여기서 발동한다: "pyright형이면 여기서 멈추고 보고하라."** 이
문서는 그 보고이고, 이 세션은 `readiness`를 preset에 추가하지 않는다. `awaitReadiness()`를
`open()` 뒤로 옮기는 cross-cutting 재설계는 TS·gopls·custom이 공유하는 경로라 이 lane 하나가 할
일이 아니다(gopls readiness의 3-OS 재검증이 필요한 별도 lane 규모) — 요구사항 문서와 스토리의
"미해결 질문" 절이 이미 이렇게 적어 뒀다.

### 교차 검증 — upstream LLVM clangd (Homebrew `llvm` package)

Apple clangd의 `mac+xpc` feature가 인덱싱 스케줄링에 영향을 줄 가능성을 배제하기 위해, 같은 machine에
`brew install llvm`으로 upstream LLVM clangd(23.1.0, Homebrew bottle)를 설치해 **같은 probe, 같은
fixture 내용**(경로만 새 디렉터리로 복제, `compile_commands.json`도 새 경로로 재작성)으로
재실행했다.

```
$ /opt/homebrew/opt/llvm/bin/clangd --version
Homebrew clangd version 23.1.0
Features: mac+xpc
Platform: arm64-apple-darwin25.5.0
```

**결과 — 5개 항목 전부 Apple clangd 17.0.0과 질적으로 동일**:

| 항목 | Apple clangd 17.0.0 | upstream LLVM clangd 23.1.0 |
| --- | --- | --- |
| (1) Call Hierarchy 왕복 | PASS | PASS |
| (2) readiness 신호 (`with-db`, 15초 pre-open 대기) | pre-open 0건 / post-open 4건 | pre-open 0건 / post-open 8건(건수만 다름, "0 before, N after didOpen"이라는 정성적 사실은 동일) |
| (3) `null` vs `[]`(`fixture_unused`) | `[]` | `[]` |
| (4) `--version` 형태 | "Apple clangd version..." 평문 | "Homebrew clangd version..." 평문(첫 두 단어만 다름, JSON 아님) |
| (5) `without-db` 저하 형태 | stderr만: "Failed to find compilation database" + "with command clangd fallback"; `publishDiagnostics`는 `[]`; Call Hierarchy는 정상 동작 | 동일 — stderr 메시지, fallback 문구, 빈 `publishDiagnostics`, 정상 동작까지 바이트 수준까지는 아니지만 형태가 전부 같다 |

**`--version` 배너의 첫 단어가 배포자에 따라 달라진다는 것이 실측으로 확정됐다** — Apple은
`"Apple clangd version"`, Homebrew는 `"Homebrew clangd version"`으로 시작한다(둘 다 이어서 `X.Y.Z`).
upstream LLVM 자체 릴리스 바이너리(GitHub Releases)는 아직 실측하지 않았다 — 이 문서는 그 세 번째
배포 경로를 관측했다고 주장하지 않는다. **버전 파서를 만들 때(stage 4) 배포자 접두어에 의존하지
말고 뒤에 오는 `X.Y.Z` 숫자 패턴으로 매칭해야 한다** — gopls의 `-json` 함정과 달리 이건 파싱
전략만 조심하면 되는 문제다.

**결론**: 두 배포 경로(Apple/Xcode CLT, Homebrew `llvm`)에서 readiness·null-vs-\[\]·compile-database
저하 형태가 일치했다. `mac+xpc` feature flag는 두 빌드 모두에 붙어 있었다 — Apple 고유 동작이
아니라 이 darwin 플랫폼 빌드 일반의 feature로 보인다(추가 조사 없음, 이 lane 범위 밖). **darwin
단일 머신 관측이라는 한계는 남는다**(Linux/Windows 미검증) — 이건 이 lane이 CI를 만들지 않는 한
좁힐 수 없고, stage 5에서 3-OS CI가 생기면 그때 각 OS의 실제 clangd 배포로 재확인된다.

### (3) `null` vs `[]` — 이 fixture에서는 `[]`

`fixture_unused`(정의는 있으나 아무도 안 부르는 함수)에 `prepareCallHierarchy` →
`incomingCalls`를 실행하면 `with-db/`·`without-db/` 둘 다 **빈 배열 `[]`**을 반환했다(`null`이
아님).

```
incomingCalls(fixture_unused) raw result (typeof=object, isArray=true, isNull=false): []
RESULT: null-vs-[] for zero-caller symbol => EMPTY ARRAY []
```

**주의 — 이건 이 단순 fixture 하나의 관측이지 일반 결론이 아니다.** `M2 Python preset lane`이
`provider_null_incoming_calls`를 만든 이유는 pyright가 **어떤** 상황에서 `null`을 반환했기
때문이다(전체 조건은 미확정). 이 stage는 clangd가 **적어도 이 단순한 case에서는** `[]`로 확정 응답을
준다는 것만 확인했다 — clangd가 다른 조건(예: 미완성 인덱스 상태에서 쿼리, macro-generated call,
template instantiation 미해결)에서도 항상 `[]`만 주는지는 이 stage의 범위 밖이다. 만약 stage 4
E2E나 실사용에서 `null`이 관측되면, Python lane이 만든 `provider_null_incoming_calls` 신호가 그대로
걸린다 — 이게 그 신호를 provider-agnostic하게 설계한 이유다(M2 Python lane stage 3).

### (4) version 명령의 출력 형태 — 안전. `-json`류 함정 없음

```
$ clangd --version
Apple clangd version 17.0.0 (clang-1700.6.4.2)
Features: mac+xpc
Platform: arm64-apple-darwin25.5.0
```

평문 다중 행, JSON이 아니다. `clangd --help-hidden`에도 gopls의 `-json`(GoVersion을 먼저 뱉어
오파싱을 유발한 전례, `catalog.ts` 주석)에 대응하는 `--version-json`류 flag가 없다 — `--input-style`/
`--pretty`는 LSP stdin 스트림 자체의 인코딩 옵션이지 `--version`과 조합되는 flag가 아니다.

**주의**: 위 배너는 **Apple clangd**의 형태다. upstream LLVM clangd의 배너는 보통
`clangd version 17.0.0 (https://github.com/llvm/llvm-project ...)` 형태로 시작 단어가 다르다(Apple
빌드는 "Apple clangd version", upstream은 "clangd version") — **버전 파서가 두 형태 모두를
받아들여야 한다.** 아래 교차 검증 절에서 실측값으로 확정한다.

### (5) compile database 없을 때의 저하 형태 — **조용히 저하된다. gopls AdHoc형이다. pyright 진단형이 아니다.**

`without-db/`(어떤 `compile_commands.json`도 없는 디렉터리)로 같은 probe를 실행했다.

**stderr(clangd 자신의 내부 로그, LSP client가 받는 프로토콜 메시지가 아님)**:
```
Failed to find compilation database for .../without-db/caller.c
Failed to find compilation database for .../without-db/target.c
ASTWorker building file .../without-db/caller.c version 1 with command clangd fallback
ASTWorker building file .../without-db/target.c version 1 with command clangd fallback
```

**LSP 프로토콜 상으로 client가 실제로 받는 것(`textDocument/publishDiagnostics`)**:
```json
{"diagnostics":[],"uri":"file:///.../without-db/caller.c","version":1}
{"diagnostics":[],"uri":"file:///.../without-db/target.c","version":1}
```

**`$/progress`(`backgroundIndexProgress`)는 이 fixture에서 아예 발생하지 않았다**(0건, before/after
둘 다) — compile database가 없으니 background index를 세울 대상이 없었던 것으로 보인다(추가 조사
없음, stage 4 범위).

그런데도 Call Hierarchy는 **정상 동작했다** — `fixture_caller`가 여전히 발견되고, `fixture_unused`는
여전히 `[]`. 즉 clangd는 "clangd fallback"이라는 **내장 generic 컴파일 명령**으로 조용히 대체했고,
**LSP 프로토콜로는 그 사실을 진단(diagnostic)으로도, 다른 신호로도 client에 알리지 않았다** —
`Failed to find compilation database`는 stderr 로그일 뿐이다.

**결론**: `.c`/`.cpp` 파일 자체가 표준 라이브러리 정도만 include하는 이 단순 fixture에서는 fallback
명령으로도 정답이 나왔지만, **project-specific include path나 macro define이 필요한 실제 프로젝트라면
같은 침묵 속에서 파싱이 부분적으로 실패하거나(누락된 헤더) 잘못된 매크로 확장으로 다른 코드가
분석될 수 있다** — gopls가 `go.mod` 없이 AdHoc으로 조용히 저하됐던 것과 같은 형태다(pyright처럼
미해결 import를 명시적 진단으로 드러내지 않는다). **`requiredProjectFiles`(또는 그에 준하는 명시적
compile-database-존재 게이트/limitation)가 gopls와 같은 이유로 필요하다** — 요구사항 문서 stage 1
항목 5가 예상한 그대로다. 정확한 형태(하드 게이트 vs. limitation 표시)는 stage 3에서 결정한다.

### commander 승인 (2026-09-02)

Stage 1 보고에 commander가 승인 회신 — readiness 제외 결정 확정. commander가 추가로 짚은 두 가지:

1. **"gopls만 예외"로 프레이밍을 뒤집어야 한다.** 지금까지 조사한 non-bundled provider 셋(gopls,
   pyright, clangd) 중 gopls만 workspace형이고 나머지 둘은 didOpen형이다 — "현재 설계가 전제하는
   순서가 소수 사례"라는 뜻이다. 스토리의 "미해결 질문" 절을 이 프레이밍으로 갱신했다(아래 작업
   로그).
2. **stage 2(`.h`)에 새 입력**: compile database는 보통 소스 파일만 담고 헤더는 안 담는다 — `.h`를
   어떻게 처리하든 그 파일 자체의 compile command는 database에 없을 가능성이 높다. clangd가 헤더를
   어떻게 다루는지(연관 소스의 command를 유추하는지)를 stage 2에서 같이 관측하라고 지시했다. 아래
   Stage 2 절이 그 관측을 포함한다.

## Stage 2 — `.h` 결정

**목적**: `.h` 파일을 조회하는 사용자가 틀린 답이나 침묵 중 무엇도 받지 않게 한다. `.h`는 매핑이
없어서 `plaintext`로 떨어지는데, 이건 단순 누락이 아니라 **진짜 모호성**이다 — C 헤더일 수도 C++
헤더일 수도 있다.

### 관측 — commander가 추가한 입력: clangd는 헤더의 compile command를 어떻게 얻는가

`lsp-probe-clangd-header.mjs`(scratchpad, 미commit)로 헤더 파일을 **직접** 열어(연관 `.c`/`.cpp`를
먼저 열지 않고) 세 가지 fixture를 실측했다.

**(a) 헤더가 정확히 하나의 source에만 포함될 때 — 정확히 추론된다.**

`target.h`를 `target.c`(정의)·`caller.c`(호출자) 둘 다 `#include`하는 `header-c-only/` fixture에서,
`target.h`만 열고 `prepareCallHierarchy`→`incomingCalls`를 실행했다.

```
ASTWorker building file .../target.h version 1 with command inferred from .../target.c
```

**`clangd fallback`이 아니라 `inferred from target.c`다** — 파일명 stem이 일치하는 같은 디렉터리의
source를 찾아 그 진짜 compile command(모든 include path 포함)를 헤더에도 적용한다. 결과: `caller.c`의
`fixture_caller`가 정확히 발견됐다 — **cross-file 정확도가 완전히 유지된다.**

**(b) 헤더가 C 소스와 C++ 소스 양쪽에 포함될 때 — 조용히 하나만 고른다.**

`shared.h`를 C로 컴파일되는 `a.c`(호출자 `a_caller`)와 C++로 컴파일되는 `b.cpp`(호출자 `b_caller`)
양쪽이 `#include`하는 `ambiguous-header/` fixture를 만들어 같은 방식으로 열었다.

```
ASTWorker building file .../shared.h version 1 with command inferred from .../a.c
incomingCalls result: [{"from":{"name":"a_caller", ...}}]   -- b_caller는 없음
```

**`a_caller`만 발견되고 `b_caller`는 발견되지 않는다** — clangd가 `a.c`를 골라 그 컴파일 단위 하나만
분석했고, **`b.cpp`가 존재하고 같은 헤더를 포함한다는 사실 자체를 client에 전혀 알리지 않는다.**

세 가지 변수를 바꿔가며 이 선택을 흔들어봤다 — **전부 실패, 여전히 `a.c`만 선택됨**:
- 우리가 didOpen에 보내는 `languageId`를 `'c'`→`'cpp'`로 바꿔도 동일 (clangd의 선택은 우리 languageId
  주장과 무관).
- `compile_commands.json`에서 `b.cpp` 항목을 `a.c`보다 먼저 배치해도 동일 (listing 순서 무관).

**결론**: clangd는 모호한 헤더에 대해 **결정론적이지만 client에게 불투명한** 내부 휴리스틱으로 정확히
하나의 TU를 고른다. **우리 CLI가 관여할 방법이 없다** — languageId도, compile_commands.json 순서도
그 선택에 영향을 주지 못한다. 이건 "우리가 c/cpp 중 뭘 고르든" 문제가 아니라 **clangd 자신의 선택이
이미 불투명하다**는 문제다.

**(c) 헤더에 compile database가 아예 없을 때 — fallback이지만 cross-file 지식이 없다.**

`without-db/`의 `target.h`를 직접 열면: `"command clangd fallback"`(generic), `incomingCalls`
결과가 **`[]`** — `caller.c`가 같은 디렉터리에 실재하는데도 못 찾는다. compile database가 없으면
background index 자체가 안 서므로(stage 1 항목 5), fallback 모드는 열린 파일 하나만 고립되게 파싱할
뿐 워크스페이스의 다른 파일을 전혀 모른다. **"호출자가 0개"처럼 보이는 결과가 실제로는 "다른
파일을 아예 못 찾음"이다** — IL-LIM-009가 막으려는 정확히 그 실패 형태다.

**(d) 우리가 선언하는 `languageId`가 clangd의 실제 파싱 방언을 바꾸는지 — 아니다.**

`without-db/`에 C++ 전용 문법(`namespace fixture_ns { ... }`)을 담은 헤더를 만들어
`languageId='c'`로 열었다 — **문법 오류 없이 파싱됐다**(`publishDiagnostics: []`). 진단 자체가
동작하는지 sanity check으로 명백히 틀린 문법(`this is not valid c or c++ syntax !!! ###`)을 같은
방식으로 열어 확인 — `"Expected unqualified-id"` 진단이 정확히 떴다(진단 파이프라인은 살아있다,
단지 이 경우엔 안 걸렸을 뿐). **즉 clangd의 fallback은 우리가 보낸 `languageId`에 의존해 C/C++ 방언을
고르지 않는다** — 파일 확장자 기반의 자체 판단으로 보인다(추가 조사 없음, 이 stage 범위 밖).

### 결정: `.h` → 새 값 `AMBIGUOUS_LANGUAGE_ID`(`'c-cpp-header'`). `c`도 `cpp`도 `plaintext`도 아니다.

이 저장소의 선례(`languageMatch: 'unknown'`, `advertised`/`observed` — 요구사항 문서가 먼저 읽으라고
지목한 그 타입들)를 따랐다: **모르는 것을 아는 척하지 않는 세 번째 값**을 만들었다. 위 관측이 이
선택을 직접 뒷받침한다:

- **`c`나 `cpp`로 확정하면 거짓 확신이 된다** — (b)가 보여주듯 clangd 자신도 어느 언어인지 결정론적
  이지만 불투명하게 고르고, 그 선택은 **우리가 뭐라고 주장하든 안 바뀐다((d))**. 우리 언어 주장이
  clangd의 실제 동작을 바꾸지 못하므로, 확정 주장은 clangd의 실제 선택을 정확히 반영한다는 보장이
  없는 **순전한 허구**다.
- **매핑하지 않으면(`plaintext`) (a)의 흔한 경우조차 버려진다** — `resolve.ts`의 `autoDiscover()`는
  `detectedLanguageId`가 preset의 `languageIds`에 있는지로만 매칭하므로(`catalog.ts:328`,
  `presetsForLanguage`), `plaintext`는 **어떤 preset의 `languageIds`에도 없어 auto-discovery가 항상
  `provider_required_for_language`로 끝난다** — 단일 언어 프로젝트의 명확한 헤더 조회조차 절대 답을
  못 받는다. (a)가 증명한, clangd가 완벽하게 답할 수 있는 케이스를 이유 없이 버리는 것이다.
- **`AMBIGUOUS_LANGUAGE_ID`는 두 요구를 동시에 만족한다**: preset이 `languageIds`에 이 값을 포함하면
  auto-discovery가 정상적으로 clangd에 도달하고((a)의 정확한 답을 살린다), 그러면서도
  `languageMatch`는 `'unknown'`을 보고해 **"확인된 일치"라는 거짓 확신을 절대 만들지 않는다.**

### 구현 (`cli/src/providers/resolve.ts`)

1. `languageId()`에 `case '.h': return AMBIGUOUS_LANGUAGE_ID;` 추가, 새 export
   `AMBIGUOUS_LANGUAGE_ID = 'c-cpp-header'` 정의(주변 `.c`/`.cc`/`.cpp`/`.cxx`/`.hh`/`.hpp`/`.hxx`
   케이스는 그대로).
2. `languageMatch` 계산: `detectedLanguageId === 'plaintext'`뿐 아니라
   `=== AMBIGUOUS_LANGUAGE_ID`일 때도 `'unknown'`.
3. `presetLanguageId()`의 wire-level languageId 폴백(현재는 `plaintext`일 때만
   `preset.languageIds[0]`으로 대체): `AMBIGUOUS_LANGUAGE_ID`일 때도 같은 폴백 — **어느 구체 언어로
   말할지는 preset의 1순위 선언이 고르는 추측이지, 이 CLI가 확인한 사실이 아니다**(plaintext와 같은
   근거).
4. **`assertPresetSpeaksLanguage()`는 의도적으로 건드리지 않았다** — `plaintext`는 아무것도
   주장하지 않아 이름이 명시된 어떤 preset이든 통과시키지만, `.h`는 "C 계열"이라는 것은 주장한다.
   그래서 무관한 언어의 preset이 `.h`를 조용히 받아가면 안 된다 — `AMBIGUOUS_LANGUAGE_ID`를 자기
   `languageIds`에 명시적으로 선언한 preset만 `.h`를 받을 수 있다(clangd preset이 stage 4에서 이걸
   선언할 것이다). 두 값이 `assertPresetSpeaksLanguage`에서 다르게 취급되는 이유를 주석에 남겼다 —
   미래 편집자가 "plaintext처럼 스킵 안 하는 게 버그 아닌가"로 오해하지 않도록.

### 검증

**단위 테스트**(`cli/src/test/providers.test.ts`, `npm run cli:test`로 293 pass/2 skip/0 fail —
회귀 없음, 신규 4개 포함):
- `.h`/`.H` → `AMBIGUOUS_LANGUAGE_ID`, 이웃한 `.c`/`.cc`/`.cpp`/`.cxx`/`.hh`/`.hpp`/`.hxx`는 그대로
  (새 `case` 추가가 기존 `case`들을 건드리지 않았음을 직접 확인).
- raw custom provider로 `.h` 열면 `detectedLanguageId === AMBIGUOUS_LANGUAGE_ID`(≠ `'plaintext'`),
  `languageMatch === 'unknown'`.
- `AMBIGUOUS_LANGUAGE_ID`를 선언하지 **않은** preset을 명시로 `.h`에 지정하면
  `provider_language_mismatch`로 거부됨(plaintext와 다른 취급을 직접 증명).
- `AMBIGUOUS_LANGUAGE_ID`를 선언한 preset은 `.h`를 받고, wire-level `requestedLanguageId`가
  preset의 1순위 언어로 폴백됨을 직접 증명.

**실제 clangd로 real end-to-end**(`header-c-only/` fixture, raw custom provider로 `/usr/bin/clangd`
직접 지정 — clangd preset이 아직 없으므로 stage 4 전 단계에서 가능한 최대 실측):
```
$ node cli/dist/index.js analyze --stdin <<< '{"workspace":"...", "file":"target.h", "line":3,
  "column":6, "provider":{"command":"clangd","args":["--background-index"],"languageId":"cpp"}}'
```
```json
"ok": true,
"provider": {"detectedLanguageId": "c-cpp-header", "languageMatch": "unknown", "name": "clangd", ...},
"nodes": [{"name":"fixture_target","file":"target.h"}, {"name":"fixture_caller","file":"caller.c"}],
"edges": [{"source":"...fixture_caller...","target":"...fixture_target...", "callSites":[...]}]
```
`target.h`에서 시작한 쿼리가 `caller.c`의 실제 호출자를 정확히 찾았고, `languageMatch: "unknown"`이
정직하게 보고됐다 — 설계 의도대로 동작.

**전환기(stage 4 이전, 실제 catalog에 clangd preset이 아직 없는 지금) 동작도 확인**: provider 필드
없이 실제 `.h` 파일로 analyze를 실행하면 `provider_required_for_language`,
`"No bundled provider supports c-cpp-header; configure a Language Server provider for this
language."` — 조용한 실패나 크래시가 아니라 사용자가 이유를 읽을 수 있는 명확한 에러(exit 5).

### 고르지 않은 선택지와 이유

| 선택지 | 왜 안 골랐나 |
| --- | --- |
| `.h` → `c` 고정 | clangd 자신의 실제 선택이 우리 주장과 무관하다는 것을 (d)로 직접 확인했다 — 확정 주장은 clangd의 진짜 동작을 반영한다는 보장이 없는 허구다. C++ 프로젝트에서 조용히 틀린 라벨을 붙이는 것과 같은 효과. |
| `.h` → `cpp` 고정 | 위와 대칭 — C 프로젝트에서 같은 문제. |
| 매핑하지 않음(`plaintext`, 현상 유지) | (a)가 증명한 가장 흔하고 명확한 경우(헤더가 정확히 하나의 source에만 속함)조차 `provider_required_for_language`로 항상 버려진다 — clangd가 완벽하게 답할 수 있는 요청을 이유 없이 거부하는 것. |
| 내용/프로젝트 문맥으로 판정(compile database 직접 파싱) | `resolve.ts`의 `languageId()`는 파일 확장자만 보는 순수 함수이고 어떤 provider 세션과도 독립적으로 호출된다 — compile database를 읽으려면 이 계층에 파일시스템 I/O와 JSON 파싱을 추가해야 하는 구조 변경이고, stage 3(compile database 처리)이 이제 막 다룰 주제다. 게다가 (b)가 보여주듯 **clangd 자신도 이미 이 판정을 하고 있고 우리에게 알려주지 않는다** — 우리가 같은 판정을 다시 구현해도 clangd의 실제 선택과 어긋날 수 있다. 이 lane은 그 판정을 clangd에게 위임하고(이미 (a)에서 정확하게 하는 것을 확인했다), 대신 **판정이 모호했다는 사실 자체를 표시**하는 쪽을 선택했다. |

### stage 3와의 연결 (commander가 예고한 얽힘, 관측으로 확인됨)

commander가 "compile database는 보통 소스 파일만 담고 헤더는 안 담는다"고 지적한 것이 (a)·(b)·(c)
관측으로 정확히 확인됐다 — 내 fixture의 `compile_commands.json` 어디에도 `target.h`/`shared.h`
자체는 등장하지 않는다, `.c`/`.cpp`만 있다. clangd는 그 간극을 **자기 나름의 방식으로**(파일명 stem
매칭 추정) 메우지만, 그 과정이 client에게 불투명하다((b))는 것이 이제 이 lane의 실측 사실이다.

**stage 3/4로 넘기는 것**: 헤더가 여러 타겟에 걸치는 모호성을 실제로 사용자에게 표시하려면(스토리의
수용 기준), `AMBIGUOUS_LANGUAGE_ID`만으로는 부족하다 — 그건 "언어 자체가 모호하다"만 표시한다.
"이 헤더가 N개의 서로 다른 compile command를 가진 소스에 포함돼 있고, 답은 그중 정확히 하나만
반영한다"는 것은 **우리가 compile_commands.json을 직접 읽어 해당 헤더를 include하는 source가 여러
개인지 확인해야만** 알 수 있다(clangd는 이걸 알려주지 않는다) — 이건 stage 3의 compile database
처리 범위다. `provider_null_incoming_calls`와 같은 계열의 새 `limitationDetails` 코드(가칭)가
필요할 수 있다는 것이 stage 2가 stage 3에 남기는 구체적 입력이다. **이 lane은 stage 2에서 이
코드를 만들지 않는다** — commander의 승인 없이 stage 3로 넘어가지 않는다는 게이트 규칙을 그대로
따른다.

## 작업 로그

### 2026-09-02 — Stage 1 착수·완료

- branch `docs/m2-clangd-investigation`을 `origin/main`(PR #64 merge 후 최신)에서 분기.
- `docs/development-management/stories/il-lim-014-c-cpp-clangd-support.md` 전체와 계획 세션의
  요구사항 문서(`m2-clangd.md`)를 읽었다.
- clangd 존재 확인: `/usr/bin/clangd`, Apple clangd 17.0.0(Xcode Command Line Tools 번들).
- `lsp-probe-clangd.mjs`(scratchpad, 미commit)로 raw stdio JSON-RPC 왕복 — gopls/pyright stage 1과
  같은 방법론.
- 2-file C fixture(`with-db/`, `without-db/`) 손으로 작성, `with-db/`에만 손으로 쓴
  `compile_commands.json` 배치.
- 5개 항목 순서대로 실측, 위 절에 기록. **항목 2(readiness)가 게이트를 발동시켰다** — pyright형으로
  확정, `readiness`를 preset에 넣지 않기로 결정.
- 재현성 확인을 위해 `.cache` 삭제 후 15초 대기로 재실행 — 결과 동일(0건 pre-open, 4건 post-open).
- Apple clangd의 `mac+xpc` feature가 결과를 오염시킬 위험을 줄이기 위해 `brew install llvm`으로
  upstream LLVM clangd(23.1.0)를 백그라운드로 설치, 완료 후 같은 fixture 내용을 새 디렉터리에 복제해
  같은 probe로 재실행 — 5개 항목 전부 질적으로 동일한 결과 확인(교차 검증 절 참고). readiness가
  pyright형이라는 게이트 결론이 배포 경로(Apple/Homebrew) 차이로 생긴 우연이 아님을 확인했다.
- `docs/work/task-m2-clangd-preset.md`(이 문서) 작성 완료. stage 1은 구현이 없으므로 코드 diff
  없음 — 이 작업 문서 자체가 이 단계의 유일한 산출물이다.
- `git status`로 작업 트리 확인, 이 문서만 staged. `node --check`나 lint 대상 코드 변경이 없어
  해당 검증은 이 단계에 적용되지 않는다(AGENTS.md 4절 — 검증할 수 없는 항목이 아니라 "이 단계는
  코드가 없다"는 것을 명시).
- commander가 stage 1을 승인, stage 2 진행 지시(위 "commander 승인" 절). 스토리의 "미해결 질문"
  절을 "gopls만 예외"로 프레이밍 갱신.

### 2026-09-02 — Stage 2 착수·완료

- 지시받은 대로 branch를 `feat/m2-clangd-preset`으로 개명(코드 변경이 생겨 `docs/` 접두어가 더 이상
  맞지 않음).
- `lsp-probe-clangd-header.mjs`(scratchpad, 미commit) 새로 작성, `header-c-only/`(비모호),
  `ambiguous-header/`(C+C++ 둘 다 포함, 순서 뒤집은 변형도)와 `header-nodb-*`(compile database
  없음, C++ 전용 문법·명백한 오류 문법 각각) fixture로 4개 관측(a)~(d) 완료.
- `cli/src/providers/resolve.ts`: `AMBIGUOUS_LANGUAGE_ID` export 추가, `.h` case,
  `languageMatch`·`presetLanguageId()` 확장, `assertPresetSpeaksLanguage()`는 의도적으로 미변경
  (주석으로 이유 명시).
- `cli/src/test/providers.test.ts`: 신규 테스트 4개(확장자 매핑, `languageMatch: 'unknown'`,
  preset 거부, preset 수락+wire fallback) — `npm run cli:build` 통과, `npm run cli:test` 293
  pass/2 skip/0 fail(회귀 없음).
- 실제 `/usr/bin/clangd`를 raw custom provider로 지정해 `header-c-only/target.h`에 real CLI
  end-to-end 실행 — `caller.c`의 `fixture_caller`를 정확히 찾음, `languageMatch: "unknown"` 정직하게
  보고됨.
- 전환기(clangd preset 미존재) 동작도 실측 — provider 필드 없이 real `.h` 파일 analyze 시
  `provider_required_for_language`로 명확히, 조용한 실패 없음.
- 이 작업 문서에 결정과 "고르지 않은 선택지" 표를 기록.

## 남은 작업

- **Stage 2 완료. commander에게 보고 후 승인 대기 — stage 3(compile database) 이후는 이 세션이
  임의로 시작하지 않는다.** 요구사항 문서와 commander 지시("`.h` 결정이 나오면 보고하고, stage 3
  결정은 그다음입니다")가 명시한 순서다.
- stage 3에 남기는 구체적 입력: 헤더의 target 모호성을 실제로 표시하려면 compile_commands.json을
  직접 읽어 해당 헤더를 포함하는 source가 여럿인지 확인해야 한다 — `AMBIGUOUS_LANGUAGE_ID`(언어
  모호성)와는 다른 축이다. `provider_null_incoming_calls`류의 새 limitationDetails 코드가 필요할
  수 있다.
- 이전 stage 1 결론 요약(변경 없음): (1) Call Hierarchy 왕복 PASS, (2) **readiness는 pyright형 — 이
  lane은 `readiness`를 preset에 넣지 않는다**, (3) 이 fixture에서는 `null` 아닌 `[]`(일반화 아님),
  (4) version 배너는 배포자별로 접두어가 다른 평문 — JSON 함정 없음, 파서는 `X.Y.Z` 숫자 패턴
  매칭으로, (5) compile database 없으면 **조용히 fallback으로 저하 — gopls AdHoc형**,
  `requiredProjectFiles` 상당의 게이트가 stage 3에서 필요할 것으로 보인다.
