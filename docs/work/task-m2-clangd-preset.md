# M2 — C/C++ clangd provider preset

- 상태: Stage 6(사용자 문서 sweep) 완료, commander 보고 후 최종 검토 대기(PR은 그 이후)
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

## Stage 2 addendum — commander 승인 + wire 누출 수정, stage 3 우선순위 정정

**commander 승인(2026-09-02)**: `AMBIGUOUS_LANGUAGE_ID` 결정 자체는 승인. 두 가지를 지적했다.

### 고칠 것: 발명한 식별자가 실제로 LSP wire에 나갔다

`AMBIGUOUS_LANGUAGE_ID`(`'c-cpp-header'`)는 이 CLI가 만든 내부 전용 문자열이고 어떤 LSP 레지스트리에도
없다. 그런데 raw custom provider가 `languageId`를 명시하지 않고 `.h`를 열면, 이 문자열이 그대로
`requestedLanguageId`가 되고(`resolve.ts:129`), `lspProvider.ts:218`의 `languageIdOverride`를 거쳐
`textDocument/didOpen`에 실려 **실제로 wire에 나갔다**.

**직접 재현**: 가짜 LSP server(`fake-lsp-echo-server.mjs`, scratchpad, 미commit — didOpen에서 받은
`languageId`를 파일에 그대로 적는다)를 만들어 raw custom provider로 지정하고 `.h`를 열었다. 수정
전 결과:
```
{"languageId":"c-cpp-header"}
```
**진짜로 나갔다.** stage 2의 real E2E 테스트가 이걸 못 잡은 이유도 확인했다 — 그 테스트는 raw
custom provider에 `"languageId": "cpp"`를 **명시적으로** 넣었었다(clangd 자체가 이 필드를 무시한다는
것도 같은 stage에서 이미 확인했었다). 그래서 "명시 안 함" 경로 자체가 한 번도 실행되지 않았다.

**수정**(`resolve.ts`): `requestedLanguageId`가 `AMBIGUOUS_LANGUAGE_ID`가 되는 경우(오직 raw
경로에서, 사용자가 languageId를 명시 안 했을 때만 실제로 발생 가능 — preset 경로는
`assertPresetSpeaksLanguage()`와 `presetsForLanguage()`가 이미 `AMBIGUOUS_LANGUAGE_ID`를 실제로
선언한 preset만 통과시키므로 이 값이 `presetLanguageId()`의 빈-배열 폴백까지 갈 수 없다 — 이건
코드로 직접 확인했다, 아래) `'plaintext'`로 치환한다 — 이 변경 이전과 정확히 같은 wire 값이다.
사용자가 명시한 값은 그대로 유지된다.

**"preset 경로는 원래 안전하다"는 주장을 직접 반증 시도해 확인**: `languageIds: []`인 malformed
preset을 명시로 골라 `.h`를 열어봤다 — `presetLanguageId()`의 빈-배열 폴백에 도달하기 전에
`assertPresetSpeaksLanguage()`가 `provider_language_mismatch`로 먼저 막는다는 것을 실측으로
확인했다(그래서 이 시나리오를 커버한다고 주장하는 guard test는 작성하지 않았다 — 도달 불가능한
경로를 테스트하는 것은 vacuous pass이므로). 즉 이 wire guard가 실제로 발동하는 경로는 **raw
custom + languageId 미명시** 하나뿐이다 — 그래도 `resolveProvider()`의 단일 지점에서 막아,
"안전하다"가 "다른 함수가 우연히 막아준다"가 아니라 하나의 불변식으로 명시되게 했다.

**guard test 3개 추가**(`providers.test.ts`): (1) 명시 languageId는 그대로 wire에 나간다(기존
테스트에 assertion 추가), (2) raw + 미명시 → wire에 `'plaintext'`, `AMBIGUOUS_LANGUAGE_ID` 아님,
(3) preset 경로(정상 선언)는 원래도 안전했다는 것 유지 확인.

**직접 재실행으로 수정 확인**: 같은 가짜 server로 재현 — 수정 후 `{"languageId":"plaintext"}`.
명시 languageId 케이스도 재확인 — `{"languageId":"cpp"}`(그대로 유지). stage 2의 real clangd E2E도
재실행 — 회귀 없음(`fixture_target`→`fixture_caller` 정상, `languageMatch: "unknown"` 정상).

**검증**: `npm run cli:build` 통과, `npm run cli:test` 294 pass/2 skip/0 fail(296 total, stage 2
대비 +1 — 신규 wire-guard 테스트 추가, 도달 불가능하다고 확인된 flawed 테스트는 작성 후 바로
제거).

### stage 3에 넘기는 우선순위 정정 — commander 지적

이전 기록은 "헤더가 여러 target에 걸침"을 stage 3 입력으로 적었는데, commander가 **더 무거운 사실을
먼저 짚었다**: stage 2 관측 (c)에서 compile database가 없을 때 `incomingCalls`가 `[]`를 반환한다는
것을 이미 봤는데, **이건 `null`이 아니라 `[]`다.** M2 Python lane이 만든
`provider_null_incoming_calls`는 "provider가 `[]`가 아니라 `null`을 줬다"에 걸리는 신호라서, **이
경우는 그 신호가 전혀 안 걸린다** — 증명된 0(진짜 호출자가 없음)과 구별되지 않는 빈 결과가
나간다. **이게 IL-LIM-009가 막으려는 형태 그대로이고, 기존 기계(`null`/`[]` 구분)로는 못 잡는다.**
stage 3은 `null`/`[]` 축이 아니라 **compile database 상태 자체**를 근거로 한계를 표면화해야
한다 — 헤더 target 모호성보다 이쪽이 우선이다(헤더 케이스는 정확도가 부분적으로 떨어지는 것이고,
이건 빈 결과가 완전한 답처럼 보이는 것이다). stage 3에서 세 안(하드 게이트/표면화/둘 다)을 정할 때
이 사실을 근거로 쓴다.

**branch 정리**: 원격의 옛 이름 branch(`docs/m2-clangd-investigation`)는 commander 지시대로 그대로
둔다 — 원격 branch 삭제는 사용자 명시 요청 없이 하지 않는다(AGENTS.md).

## Stage 3 — compile database

**목적**: 결과가 build 설정에 의존한다는 사실을 사용자가 알게 한다. compile database가 없으면
조용히 나빠지는 것이 이 언어의 기본 실패다(stage 1/2가 실측으로 확인).

### commander가 먼저 차단한 축: `completion.traversalStatus`는 건드리지 않는다

`COMPLETION_TRAVERSAL_STATUSES`(`types.ts:58-67`, `exhausted`/`depth-limited`/`node-limited`/
`timeout`/`cancelled`/`unknown`/`failed`/`not-started`)를 확인했다 — 전부 **이 CLI 자신의
traversal**(예산 소진, 중단)에 대한 진술이지 "provider가 다른 파일을 못 봤다"는 축이 아니다. 기존
값을 갖다 쓰면 잘못된 라벨이고, 새 값을 추가하면 `types.ts:30-32`의 경고("declaring a new value
narrows the producer contract... v2-only change")에 그대로 걸린다 — `schemaVersion`도 이 lane
범위 밖(요구사항 문서 "이 lane이 하지 않는 것"). **이 필드는 손대지 않았다** — 실제로 어떤 커밋도
`types.ts`의 `COMPLETION_TRAVERSAL_STATUSES`/`SucceededCompletion`/`PartialCompletion`을 바꾸지
않았다(아래 검증에서 실측 확인).

### 결정: 표면화(`limitationDetails`). 하드 게이트 아님.

**세 안**:
1. **하드 게이트**: compile database가 없거나 낡았거나 모호하면 분석을 거부한다(`provider_project_metadata_missing`류, gopls의 `requiredProjectFiles`와 같은 형태).
2. **표면화**: 분석은 그대로 진행하고 `limitationDetails`에 상태를 기록한다(`provider_null_incoming_calls`와 같은 형태).
3. **둘 다**: 특정 조건(예: 모호성)만 게이트하고 나머지는 표면화한다.

**표면화를 선택했다.** 근거:
- gopls의 `go.mod` 게이트가 성립한 이유는 "Go module 프로젝트라면 사실상 항상 `go.mod`가 있다"는
  전제였다(정상 프로젝트를 막지 않음). **이 전제가 compile database에는 성립하지 않는다** —
  `compile_commands.json`은 빌드 시스템이 명시적으로 생성해야 하는 산출물이고, 많이 생성하지
  않는다.
- **이 lane 자신의 fixture가 반례다.** stage 1의 `without-db/` fixture(compile database 전혀 없음)로
  실제 clangd를 돌려보니 `fixture_target`↔`fixture_caller`의 직접 호출 관계는 **정확하게** 나왔다
  (fallback 명령으로도 이 단순한 코드는 충분히 분석됐다). 하드 게이트를 걸면 이렇게 **지금 실제로
  정답을 내는 프로젝트까지 전부 `unsupported`가 된다.**
- 스토리(`il-lim-014`)의 문구도 "구분한다"·"안내한다"이지 "차단한다"가 아니다("compile database
  유무·경로·staleness와 capability가 doctor 결과에서 구분된다", "metadata가 없을 때 configure/build를
  실행하지 않고 안전한 생성 안내만 제공한다").
- **다만 `[]` 케이스가 이 도구가 낼 수 있는 최악의 답이라는 것**(실제 호출자가 있는데 없다고
  보임, stage 2 관측 (c))을 근거의 무게로 뒀다 — 그래서 표면화를 "정보성 참고"가 아니라
  `no_incoming_callers`/`provider_null_incoming_calls`와 같은 `severity: 'warning'`으로 만들었다.

**"둘 다"를 고르지 않은 이유**: 모호성(ambiguous)만 게이트하는 방안도 검토했다 — 모호한
compile database는 clangd가 어느 쪽을 선택했는지조차 알 수 없으니 게이트할 근거가 더 강해
보인다. 하지만 stage 2의 헤더 모호성 관측과 같은 이유로 기각했다 — **모호한 상태에서도 clangd가
선택한 쪽 TU에 대해서는 여전히 정확한 답을 낼 수 있다**(단지 "이게 어느 쪽인지 모른다"는 한계가
붙을 뿐). 이것도 표면화로 충분하고, 게이트-표면화 두 가지 처리 경로를 유지하는 복잡도를 정당화할
근거가 부족했다.

### 구현

- `cli/src/providers/compileDatabase.ts`(신규): `inspectCompileDatabase(workspace)` — read-only,
  `compile_commands.json` 후보(workspace root + `build`/`out`/`cmake-build-debug`/
  `cmake-build-release`)를 찾아 `missing`/`present(+stale)`/`ambiguous` 셋 중 하나를 반환한다.
  **CMake configure, project build, 자동 설치는 전혀 하지 않는다** — `fs.stat`/`fs.readFile`만
  쓴다(테스트로 확인: read-only scan 후 workspace에 새 파일이 생기지 않음).
  - staleness는 workspace root의 `CMakeLists.txt` mtime과만 비교한다 — 스토리의 "미해결 질문"이
    이미 "mtime만으로 판단할지 build-system adapter가 필요한지 검토해야 한다"고 적어 둔 대로,
    정밀하게 풀지 않고 **정직하게 제한된 휴리스틱**으로 남겼다. `CMakeLists.txt`가 없으면(non-CMake
    빌드) staleness를 판단할 근거가 없으므로 `stale: false`(모른다를 안다고 하지 않음 — 이
    저장소의 반복되는 원칙).
- `cli/src/types.ts`: `AnalysisObservations.compileDatabase?: CompileDatabaseObservation` 필드
  추가, `CompileDatabaseObservation` 타입 정의. `types.ts`는 이 저장소의 무의존 기반 계층이라
  (import 없음) 타입은 여기 두고 `compileDatabase.ts`가 거꾸로 import한다.
- `cli/src/coverage.ts`: `V1_WITHHELD_REASON_CODES`에 `compile_database_missing`/`_stale`/
  `_ambiguous` 3개 추가(배포된 `limitations`/`coverage.reasons` 두 필드는 안 바뀜).
  `compileDatabaseDetails()`가 `observations.compileDatabase` 상태에 따라 코드를 만든다 —
  `provider_null_incoming_calls`와 같은 자리(`scope: 'provider'`)지만, **호출자 수(`incomingCallerCount`)에
  무관하게** 표면화한다(`provider_null_incoming_calls`는 0건일 때만) — missing/stale 상태에서는
  fallback 모드가 cross-file 인덱스 자체가 없어서(stage 1/2 관측), 호출자를 몇 명 찾았든 그 목록이
  불완전할 수 있기 때문이다.
- `cli/src/impact.ts`의 `analyzeImpact()`: `provider.capabilities.detectedLanguageId`가
  `C_FAMILY_LANGUAGE_IDS`(`resolve.ts` 신규 export, `'c'`/`'cpp'`/`AMBIGUOUS_LANGUAGE_ID`)에 속할
  때만 `inspectCompileDatabase(workspace)`를 실행해 관측에 병합한다 — 다른 모든 언어는
  `observations.compileDatabase`가 아예 `undefined`로 남는다(필드가 생기는 게 아니라 요청 자체가
  안 함).
- `cli/src/doctor/checks.ts`: `compileDatabaseCheck(preset, workspace)` 신규 — preset의
  `languageIds`가 C 계열을 하나라도 포함하면 활성화(clangd preset ID를 하드코딩하지 않음 — stage 4가
  실제 preset을 추가하는 순간 자동으로 활성화된다). `status`는 missing/stale/ambiguous 전부
  `'warn'`, present+fresh만 `'pass'` — **`'fail'`은 절대 없다**(표면화 결정을 코드로 강제).

### doctor 3-state 검증 — 실제로 다른 출력을 내는지 확인

C 계열 languageIds를 선언한 stand-in preset(`externalPreset`류, clangd preset은 stage 4 전이라
아직 없음)으로 `runDoctor()`를 직접 호출해 4가지 상태를 각각 실제로 만들어 비교했다:

| 상태 | `status` | `state` | 비고 |
| --- | --- | --- | --- |
| 없음 | `warn` | `missing` | |
| 있음(신선) | `pass` | `present` | `path` 필드에 상대경로만 |
| 있음(낡음) | `warn` | `stale` | `CMakeLists.txt`가 더 최신 |
| 여러 후보 | `warn` | `ambiguous` | `candidatePaths` 배열 |

넷 다 서로 다른 `(status, state)` 조합을 실제로 낸다는 것을 테스트로 직접 확인했다(`doctor.test.ts`).
비-C 계열 preset(`bundled-typescript` 등)은 `compile-database` check 자체가 checks 목록에 **없다**
— "이 언어는 관계없다"는 pass보다 정확한 신호다.

### redaction — 1차 수정(`redactPreprocessorDefines`), commander가 반증, 표면 자체를 없애는 쪽으로 재설계

**1차 수정**: commander가 "vacuous pass가 나기 가장 쉬운 자리"라고 지목한 대로였다. 기존
`redactProviderText()`(`jsonRpc.ts`)를 실제 절대 경로 + `-D` 플래그가 든 compile command 문자열로
직접 돌려보니, 홈 경로는 `~`로 정확히 치환됐지만 `-DAPI_TOKEN=...`은 전혀 안 걸렸다(`\b` 단어
경계가 밑줄로 이어진 토큰 내부에서 발동하지 않기 때문). `redactPreprocessorDefines()`를 추가해
`-D<NAME>=<value>`의 값을 이름과 무관하게 `[REDACTED]`로 바꾸는 것으로 고쳤다.

**commander가 이 1차 수정 자체에서 도달 가능한 유출 4가지를 직접 정규식으로 돌려 반증했다**:

| 형태 | 예 | 1차 수정 결과 |
| --- | --- | --- |
| 표준(붙여쓰기) | `-DAPI_TOKEN=abc123` | `-DAPI_TOKEN=[REDACTED]` — 잡힘 |
| 공백 분리 | `-D API_TOKEN=abc123` | 그대로 노출 |
| 따옴표+공백 값 | `-DGREETING="tok abc123"` | `-DGREETING=[REDACTED] abc123"` — 뒷부분 노출 |
| MSVC `/D` | `/DAPI_TOKEN=abc123` | 그대로 노출 |

**"공백 분리" 형태는 이 코드 자신의 실제 경로로 도달 가능하다** — `sampleCompileCommand()`가
`first.arguments.join(' ')`로 합치는데, JSON Compilation Database 규격의 `arguments` 배열은
`["-D", "API_TOKEN=secret"]`처럼 `-D`와 값을 분리하는 것이 흔한 형태다. join하면 정확히 유출
형태가 된다. `/D`는 windows-latest에서 도는 MSVC/clang-cl 경로라 무관하지 않다.

**재설계 — 표면 자체를 없앤다(commander 권장, 채택).** 두 방향을 검토했다:
1. **더 많은 형태를 덮는다**: 분리 토큰, 닫는 따옴표까지 소비, `/D` 모두 처리. **기각** — 플래그
   표면이 넓다(`-U`, `-include`, `@response-file`, `--param`, 절대 경로 든 `-I`...). 패턴을 하나
   막으면 다른 축이 열리는 것을 **같은 세션의 response-policy-engine lane이 다섯 라운드**에 걸쳐
   실증했다 — 같은 근본 원인(자유 형식 텍스트에 대한 어휘 매칭에는 경계가 없다)이 여기도 그대로
   적용된다.
2. **출력하는 것을 줄인다**: `sample` 필드의 목적은 애초에 주석이 적은 대로 "database가 읽히고
   진짜라는 증명"이다 — 플래그 전체를 보여줄 필요가 없다. 컴파일러 이름(basename만)·대상 파일
   (workspace-relative만)·인자 개수만 보여도 그 목적은 그대로 달성되고, **플래그의 이름이나 값을
   응답에 전혀 읽어 들이지 않으므로 지울 것 자체가 없다.** **채택.**

**무엇을 잃는지**: "왜 내 헤더를 못 찾나"류 진단에 실제 flag 값(예: `-I` 경로)이 유용할 수 있다.
하지만 `compile_commands.json`은 사용자 자신의 디스크에 있는 파일이라 필요하면 직접 열어 보면
된다 — doctor가 그 내용을 대신 인쇄해 줄 필요가 없고, 스토리의 권장 대응 절도 이미 "compile
command의 전체 flags는 기본 출력하지 않는다"고 적어 뒀다(이 결정이 그 문구와 더 가깝다). 진단
편의보다 실제 시크릿이 GitHub 이슈에 붙여넣기로 새는 위험이 훨씬 무겁다고 판단했다.

**구현**: `redactPreprocessorDefines()`·`sampleCompileCommand()`를 삭제하고
`sampleCompileCommandMetadata()`로 교체 — `{ compiler: string, file?: string, argumentCount: number }`만
반환한다. `compiler`는 첫 토큰의 **basename만**(전체 경로 아님), `file`은 workspace 밖으로 나가면
아예 생략(절대 경로를 보여주지 않는다는 이 파일의 기존 규칙과 동일), `argumentCount`는 개수뿐.
`redactProviderText` import도 제거했다 — 더 이상 이 함수가 redaction할 텍스트를 다루지 않는다.

**검증(양방향, commander 지시대로 — 어느 방향을 택하든 네 형태 전부 + 역방향)**: commander가 제시한
네 형태(표준/공백 분리/따옴표+공백/`/D`) 전부를 fixture로 만들어 `compile-database` check의
**전체 JSON 출력**(필드 하나가 아니라)에 시크릿 문자열이 없는지 확인했고, 같은 원본 fixture
내용에는 실제로 그 문자열이 있었다는 것도 확인했다(vacuous pass 배제). **non-vacuity를 한 번 더
확인** — 방금 폐기한 1차 수정(`redactPreprocessorDefines` + `redactProviderText`)을 인라인으로
재구성해 이 4개 fixture에 그대로 돌려보니, "공백 분리"·"따옴표+공백"·`/D` **3개가 실제로
샜다**(표준 형태만 잡혔었다) — commander의 표에서 예측한 것과 정확히 일치한다.

### 검증

- `node --test cli/dist/test/compileDatabase.test.js`: 8/8(discovery 모듈 단독).
- `node --test cli/dist/test/coverage.test.js`: 33/33(신규 7개 포함, `limitationDetailsFor` 와이어링).
- `node --test cli/dist/test/doctor.test.js`: 25/25(신규 10개 포함 — 3-state 4개, sample 모양 1개,
  누출 형태 4개 + non-vacuity 확인).
- `npm run cli:test`(전체): 319 pass/2 skip/0 fail(321 total). 회귀 없음 — `AnalysisObservations`
  필드 인벤토리 테스트(`stateReachability.sources.test.ts`)가 새 필드를 감지해 분류를 요구했고,
  `stateReachability.integration.test.ts`의 provider-runtime 대조 테스트는 `compileDatabase`가
  `LspCallHierarchyProvider.analysisObservations()`가 아니라 `impact.ts`에서 만들어진다는 사실과
  안 맞아 실패했다 — `OBSERVATION_FIELD_PRODUCER`(신규, `'lsp-provider'`/`'analyze-caller'` 구분)로
  분류 체계를 확장해 고쳤고, 두 맵이 서로 어긋나지 않는지 확인하는 테스트도 추가했다.
- **실제 clangd로 real end-to-end**: `without-db/` fixture(`.c` 직접 분석)에서
  `limitationDetails`에 `compile_database_missing`이 실제로 나타남을 확인했다(메시지·action 전부
  실제 응답에서 확인). `with-db/` fixture는 `compile_database_*` 코드가 전혀 없는 깨끗한 응답임을
  같은 방식으로 확인했다.
- **`completion.traversalStatus`/`coverage.traversal`이 실제로 안 바뀌었는지 실측 확인**: 위
  real E2E 응답의 `completion`/`coverage.traversal`을 직접 출력해 `traversalStatus: "exhausted"`,
  `coverage.traversal.status: "complete"`임을 확인했다 — commander가 차단한 축을 실제로 안
  건드렸다는 증거다.

## 남은 작업

- **Stage 3 완료(redaction 재설계 포함). commander에게 재보고 후 승인 대기 — stage 4(preset 작성)
  이전에 한 번 더 검토받는다**(commander가 명시). 나머지 stage 3 결정(표면화, `provider_null_incoming_calls`와의
  차이, `status`에 `'fail'`을 아예 안 쓰는 것, `traversalStatus` 무변경, `stateReachability` 분류
  확장)은 이미 승인받았다 — redaction만 재작업했다.

### Stage 3 addendum — commander가 `9634b33`을 승인하며 남은 구멍 하나 지적, 고침

**commander가 `9634b33`(표면 제거 재설계)을 승인했다** — "패턴을 늘리는 대신 표면을 없앴다"는 방향,
네 형태 양방향 테스트, `workspaceRelativeOrUndefined()`의 절대 경로 미노출까지 전부 맞다고 확인했다.

**남은 구멍 하나**: `compiler: path.basename(compilerToken!)`가 토큰 하나를 무조건 통과시킨다.
`arguments[0]`이 컴파일러가 아니라 flag인 손으로 만든/손상된 database(규격 위반이지만 가능)라면
그 토큰이 그대로 나간다 — `path.basename('-DAPI_TOKEN=secret')`은 슬래시가 없어 전체 문자열을
그대로 돌려준다. **직접 재현해 확인**:

```
$ node -e "console.log(require('path').basename('-DAPI_TOKEN=secret'))"
-DAPI_TOKEN=secret
```

commander가 "구멍을 닫는다"(첫 토큰이 `-`/`/`로 시작하면 `compiler` 생략)를 권했다 — **다만 그
정확한 조건을 그대로 구현하기 전에 직접 검증했다.** `/`로 시작하는지만 보면 `/usr/bin/clang`
같은 **정상적인 절대 경로 compiler(내 테스트 fixture 전부가 쓰는 흔한 형태)까지 flag로
오분류**된다:

```
$ node -e "const t='/usr/bin/clang'; console.log(t.startsWith('-')||t.startsWith('/'))"
true   # 정상 compiler인데도 flag로 잘못 분류됨
```

**그래서 조건을 정제했다** — `startsWith('-')`(Unix flag, 실제 실행 파일 경로는 `-`로 시작하지
않음)이거나 `startsWith('/') && includes('=')`(MSVC `/D<NAME>=<value>` 형태만 정확히 잡고,
`/usr/bin/clang`처럼 `=`가 없는 정상 절대 경로는 건드리지 않음). 직접 테스트로 재확인:

| 토큰 | 정제된 조건 |
| --- | --- |
| `/usr/bin/clang` | `false`(정상 표시) |
| `-DAPI_TOKEN=secret` | `true`(생략) |
| `/DAPI_TOKEN=secret` | `true`(생략) |
| `-D`(손상된 database) | `true`(생략) |
| `clang`/`clang-cl` | `false`(정상 표시) |

**commander의 정확한 문구를 그대로 구현하지 않고 정제한 이유를 코드 주석에 남겼다** — 문구 그대로
구현했다면 정상적인 테스트가 깨졌을 것이고(기존 "sample 모양" 테스트가 `/usr/bin/clang`→`clang`을
기대), 이건 그 자체로 좋은 반증 사례다: peer 리뷰의 제안이라도 구현 전에 직접 검증한다.

`LEAK_SHAPES`에 다섯 번째 케이스(`arguments[0]`이 그 자체로 `-D` define인 손상된 database)를
추가했다. non-vacuity: 방금 고친 무조건 통과 로직을 재구성해 이 정확한 fixture에 돌려보니
`{"compiler":"-DAPI_TOKEN=abc123secret"}`로 실제로 샜다는 것을 확인했다.

**검증**: `npm run cli:build` 통과, `node --test cli/dist/test/doctor.test.js` 26/26(신규 1개),
`npm run cli:test`(전체) 320 pass/2 skip/0 fail(322 total). 기존 "sample 모양" 테스트(`/usr/bin/clang`
→ `compiler: 'clang'`)가 정제된 조건에서도 그대로 통과함을 확인 — 정상 케이스를 깨지 않았다.

### Stage 3 addendum 2 — commander가 정제한 조건을 승인하며 플랫폼 종속 버그 하나 더 지적, 고침

commander가 정제한 `looksLikeFlag` 조건 자체는 직접 돌려 승인했다 — `/usr/bin/clang`·`clang-cl`·
사용자 홈 경로 든 compiler는 정상 표시, `-DAPI_TOKEN=secret`류 넷은 전부 생략됨을 확인했다고
했다. **그리고 자신이 준 원래 문구가 틀렸고 내가 구현 전에 잡은 것도 맞다고 확인했다.**

**추가로 지적한 것**: `path.basename()` 자체가 **플랫폼 종속**이다. POSIX에서 실행하면 `\`를
구분자로 안 본다 — Windows에서 생성된 `compile_commands.json`(`arguments[0]`이
`C:\Users\me\LLVM\bin\clang.exe`류)을 macOS/Linux에서 열면 **경로 전체가 그대로 나간다.** 저장소에
커밋된 database를 다른 OS에서 여는 것은 드물지 않은 시나리오라고 짚었다. **직접 재현**:

```
$ node -e "console.log(require('path').basename('C:\\\\Users\\\\me\\\\LLVM\\\\bin\\\\clang.exe'))"
C:\Users\me\LLVM\bin\clang.exe   # POSIX에서 실행 시 전혀 안 잘림
```

**같은 근본 원인이 `file` 필드에도 있다는 것을 스스로 먼저 확인했다** — commander가 짚지 않은 두
번째 자리였지만, 같은 클래스의 버그라 직접 점검했다. `workspaceRelativeOrUndefined()`의
`path.isAbsolute()`도 플랫폼 종속이라, Windows 절대 경로가 POSIX에서는 "절대 경로 아님"으로
읽혀 `path.resolve(workspace, file)`을 거쳐 그대로 relative처럼 반환된다:

```
$ node -e "... workspaceRelativeOrUndefined('/tmp/ws', 'C:\\\\Users\\\\me\\\\project\\\\main.c') ..."
C:\Users\me\project\main.c   # 그대로 샘
```

**고쳤다**:
- `crossPlatformBasename()` 신규 — `token.split(/[\\/]/).pop()`으로 두 구분자 전부에서 마지막
  세그먼트를 취한다. `/usr/bin/clang`→`clang`, `C:\Users\me\LLVM\bin\clang.exe`→`clang.exe` 둘
  다 정확히 확인.
- `workspaceRelativeOrUndefined()`에 foreign-absolute 가드 추가 —
  `(path.posix.isAbsolute(file) || path.win32.isAbsolute(file)) && !path.isAbsolute(file)`이면
  절대 경로를 이 workspace에 안전하게 relate할 수 없다고 보고 즉시 생략한다. **검증한 방향은
  "Windows 경로를 POSIX에서 읽는" 쪽뿐이다** — 반대 방향(POSIX 경로를 실제 win32 네이티브
  프로세스에서 읽는 경우)은 따로 증명하지 않았다고 문서에 명시했다(이 저장소가 반복해서 요구하는
  "확인 못 한 것을 확인한 척하지 않는다" 원칙).

**`/DNDEBUG`(값 없는 MSVC define)는 고치지 않고 알려진 한계로 남겼다** — commander가 판단을
맡겼다. `=`가 없어 `looksLikeFlag`에 안 걸리고 `compiler: "DNDEBUG"`로 잘못 표시되지만, **값이
없으므로 시크릿 유출은 아니다.** 이걸 잡으려면 MSVC 단일 문자 flag 코드(`/D`, `/I`, `/O`, `/W`,
`/U`...)를 이름으로 나열해야 하는데, 이게 정확히 이번 재설계가 피하려 한
"모든 flag 형태를 나열" 함정이라 기각했다 — 코드 주석에 이유를 남겼다.

**`LEAK_SHAPES`에 여섯 번째 케이스**(Windows 절대 compiler 경로) + **`file` 필드용 신규 테스트**
(Windows 절대 file 경로) 추가. non-vacuity: 방금 고친 두 함수를 각각 재구성해 이 정확한 fixture에
돌려보니 둘 다 실제로 샜음을 확인했다(위 재현 블록의 실측값과 일치).

**검증**: `npm run cli:build` 통과, `node --test cli/dist/test/doctor.test.js` 28/28(신규 2개),
`npm run cli:test`(전체) 322 pass/2 skip/0 fail(324 total).

## Stage 4 — preset 작성

**목적**: 지금까지 확정된 입력(stage 1의 readiness 제외, stage 2의 `AMBIGUOUS_LANGUAGE_ID`,
stage 3의 표면화 결정)을 실제 shipped preset으로 만든다. commander가 지시한 입력 그대로 따랐다.

### 구조: `tier: 'verified-external'`, `languageIds`에 `c`/`cpp`/`AMBIGUOUS_LANGUAGE_ID`

gopls와 같은 `verified-external`(clangd는 LLVM 바이너리라 번들 불가). `AMBIGUOUS_LANGUAGE_ID`를
빼면 stage 2가 확인한 그대로 `.h` 요청이 auto-discovery에서 항상 탈락한다(`presetsForLanguage`가
`detectedLanguageId`가 `languageIds`에 있는지로만 매칭하므로).

### 순환 import 회피 — `AMBIGUOUS_LANGUAGE_ID`/`C_FAMILY_LANGUAGE_IDS`를 `preset.ts`로 이동

`catalog.ts`가 preset 정의에 `AMBIGUOUS_LANGUAGE_ID`를 직접 써야 하는데, 그 상수는 stage 2에서
`resolve.ts`에 정의했었다. `resolve.ts`는 이미 `catalog.ts`에서 `PROVIDER_CATALOG`를 import하므로,
`catalog.ts`가 `resolve.ts`에서 이 상수를 import하면 **순환 import**가 된다. `preset.ts`는 import가
전혀 없는 최하위 계층이고 `resolve.ts`·`catalog.ts` 둘 다 이미 여기서 import하고 있어서, 두 상수를
`preset.ts`로 옮기고 `resolve.ts`는 `import` 후 `export`로 재노출했다(기존 import 지점
`impact.ts`·`doctor/checks.ts`·`providers.test.ts`가 전부 `from '../providers/resolve'`를 쓰므로
안 건드리기 위해). `export { X } from './module'` 형태는 로컬 바인딩을 안 만든다는 것도 실제로
확인했다 — 처음에 이 형태로 썼다가 `resolve.ts` 자신의 코드(`languageMatch` 계산 등)가
`AMBIGUOUS_LANGUAGE_ID`를 못 찾는 것을 빌드로 확인하고 `import` + `export` 두 줄로 고쳤다.

### version 파서 — 이미 접두어 무관, 실측으로 확인만 함

`parseVersion()`(`discovery.ts`)를 직접 읽어보니 이미 첫 번째 점-숫자 패턴을 찾는 방식이라
접두어에 의존하지 않는다 — gopls의 `-json` 문제(`parseVersion`이 첫 번째로 찾은 숫자를 그대로
쓰는데, `-json`은 `GoVersion`을 먼저 뱉어 그게 첫 번째가 되는 문제)와 달리, clangd의 두 배너
모두 실제로 돌려서 확인했다:
```
"Apple clangd version 17.0.0 (clang-1700.6.4.2)..." → parseVersion → "17.0.0" (괄호 안
  "1700.6.4.2"보다 앞에 있어 정확히 잡힘)
"Homebrew clangd version 23.1.0..." → parseVersion → "23.1.0"
```
**preset에 별도 parser 설정이 필요 없다** — `ProviderVersionProbe` 타입 자체에 그런 필드가 없다.
`supported.minimum: '17.0.0'`(실제로 돌린 두 버전 중 낮은 쪽), `lastVerified.versions: ['17.0.0',
'23.1.0']`(실측 두 버전만, 사이 버전은 추측 안 함) — gopls의 선례와 동일한 원칙.

### `docs.limitations` — 네 가지를 실제로 clangd에 돌려서 확인

commander 지시대로 "provider 원본 결과와 함께" 적기 위해, 이 stage에서 네 시나리오를 실제로
probe했다(추측이 아니라 실측):

| 시나리오 | 실측 결과 |
| --- | --- |
| 함수 포인터 호출(`fp()`) | `incomingCalls`가 대입 지점("fp")만 보이고, 실제로 포인터를 통해 호출한 함수는 안 보임 |
| virtual dispatch(`b->target()`, `b: Base*`) | `Base::target`의 `incomingCalls`엔 정확히 잡히지만, **`Derived::target`의 `incomingCalls`는 빈 배열** — 정적 타입 기준으로만 잡힘 |
| 단순 macro(`#define CALL_TARGET() macro_target()`) | **정확히 잡힘** — 애초 예상(스토리가 지목한 "제한사항")과 반대 결과. clangd가 전처리 후 AST로 동작하기 때문 |
| 조건부 컴파일(`#ifdef ENABLE_FEATURE`, 미정의) | `incomingCalls`가 빈 배열 — 컴파일 안 된 분기는 AST에 아예 없음 |

**macro 결과가 스토리의 가정과 반대라는 것을 그대로 적었다** — "매크로는 제한사항이다"라고
뭉뚱그리지 않고, 단순 매크로는 실측으로 통과했고 더 복잡한 형태(token-pasting, X-macro)는
테스트 안 했다고 정확한 범위로 적었다. `docs.limitations`의 각 항목에 이 실측 근거를 그대로
반영했다.

### fixture 버그 발견·수정 — `doctor clangd --fixture`가 실제로 잡았다

처음에는 gopls/pyright처럼 `target.c`/`caller.c` 두 파일로 fixture를 만들었다(compile database는
넣을 수 없음 — `ProviderFixtureFile.content`가 정적 문자열이라 `fixtureCheck()`가
`fs.mkdtempSync()`로 만드는 런타임 temp 디렉터리 경로를 주입할 방법이 없다). **`doctor clangd
--fixture`를 실제로 돌리자 실패했다**: `observedCallers: []`.

**원인을 직접 추적**: stage 1의 `without-db` probe가 "compile database 없어도 정답이 나온다"고
증명했던 건, **그 probe가 `caller.c`·`target.c` 둘 다 미리 `didOpen`으로 열어 둔 상태**였기
때문이다. 실제 제품의 `fixtureCheck()`는 `target`이 지정한 파일 **하나만** 연다 —
`caller.c`는 아예 안 열린다. clangd의 fallback 모드는 index가 없으므로, **연 적 없는 다른 파일의
호출은 원천적으로 안 보인다.**

**직접 재현·검증**: 같은 두 함수를 **한 파일**에 두고(`fixture.c`) 같은 조건(compile database
없음)으로 열어보니 `incomingCalls`가 정확히 `fixture_caller`를 찾았다 — 같은 파일 안이면 fallback
모드도 정상 동작한다는 것을 확인했다.

**stage 3의 "without-db 성공" 재검토·정정(정정 표시, 원문 유지)**: stage 3에서 재확인 삼아 돌렸던
"`without-db/caller.c`에서 쿼리" real E2E도 다시 조사했다 — **그건 실제로 성공했다**(nodes에
`fixture_target`(target.h)·`fixture_caller`(caller.c) 둘 다, edge도 정확). 왜 이건 되고 fixture는
안 됐는지 확인했다: 그 쿼리는 `caller.c`(호출 지점 자체)에서 시작했고, `caller.c`가
`#include "target.h"`로 target의 선언을 끌어들이므로, clangd 입장에서는 **caller.c 하나를 여는
것만으로 같은 translation unit 안에 호출 지점과 선언이 함께 들어온다** — 진짜 "다른 파일에 있는
호출자를 index로 찾는" 것이 아니라 "연 파일 안에 있던 호출을 본" 것이었다. 반면 fixture는
**target 정의 파일을 먼저 열고 그 반대 방향(누가 나를 부르나)을 물었는데, 호출자는 별도의
안 열린 파일에 있었다** — 이 방향은 index가 필요하고, compile database가 없으면 index가 없다.

**즉 stage 1/3에서 "without-db도 정답을 낸다"는 주장은 참이지만, 어떤 방향/모양의 쿼리에서
그런지에 대한 조건이 빠져 있었다** — "쿼리가 이미 열린 파일(또는 그 파일이 `#include`하는
헤더) 안에서 답을 찾을 수 있으면 fallback도 정답을 낸다. 정의 파일만 열고 반대 방향으로
'누가 나를 부르나'를 물으면(정확히 doctor fixture와 이 stage 4 이전의 관례적인 fixture 설계
방향), 그 호출자가 다른 파일에 있는 한 fallback으로는 못 찾는다." 이 구분을 몰랐던 채로 stage 1/3
문서에 "정답을 낸다"라고 뭉뚱그려 적은 것은 부정확했다 — 여기서 정정한다. **stage 3의 결론
자체(표면화, 하드 게이트 아님)는 안 바뀐다** — 오히려 이 발견이 그 결론을 더 강하게 뒷받침한다:
같은 "compile database 없음" 상태에서도 쿼리 모양에 따라 결과가 갈리는 게 사용자에게 안 보이는
문제라면, 하드 게이트보다 표면화가 더 맞는 방향이다(사용자가 매번 다른 이유로 막히는 것보다,
위험을 알리고 정답이 나올 때는 정답을 주는 쪽).

**고침**: fixture를 `target.c`+`caller.c` 2파일에서 `fixture.c` 1파일로 교체, catalog.ts 주석에
이 발견을 정확히 남겼다. `doctor clangd --fixture` 재실행 — `fixture-call-hierarchy: pass`,
`observedCallers: ["fixture_caller"]`. 전체 상태도 `blocked`(fixture 실패로 인한)에서
`degraded`(compile-database missing 경고만 남음, 이 저장소 자체에 compile database가 없다는
정확한 사실)로 바뀌었다.

### 기존 테스트 3개 회귀 수정 — `fixtureUnclaimedLanguagePreset`이 'c'→'swift'로 다시 이동

`fixtureUnclaimedLanguagePreset()`의 주석이 이미 예견했던 상황("clangd가 나오면 다시 옮겨야
한다")이 실제로 발생했다. `.c`가 이제 real clangd preset이 있으므로:
- `providers.test.ts`의 auto-discovery/ambiguity 테스트 4개(`.c` 파일 사용) — 'swift'로 이동
  (`languageId()`가 `.swift`→'swift'로 매핑하지만 어떤 preset도 아직 안 씀, kotlin이 다음
  후보라고 주석에 남겼다).
- `contract.test.ts`의 "does not launch the bundled TypeScript provider for an unclaimed
  language" — 같은 이유로 `.swift`로 이동.
- "the shipped catalog only claims languages that have been verified" — 하드코딩된 preset id
  목록에 `'clangd'` 추가.

### real E2E 검증 — `.c`·`.cpp`·`.h` auto-discovery, provider 필드 전혀 없이

commander 지시대로 preset name도 provider 필드도 없이 순수 auto-discovery로 셋 다 확인:

```
.h  (header-c-only fixture): provider=clangd, selectedBy=auto, detectedLanguageId=c-cpp-header
    nodes=[fixture_target, fixture_caller]  ✅
.c  (with-db fixture):       provider=clangd, selectedBy=auto, detectedLanguageId=c
    nodes=[fixture_target, fixture_caller]  ✅
.cpp (신규 cpp-only fixture): provider=clangd, selectedBy=auto, detectedLanguageId=cpp
    nodes=[fixture_target, fixture_caller]  ✅
```

`doctor clangd`(preflight) / `--smoke` / `--fixture` 전부 실제로 돌렸다 — `provider-executable`·
`provider-version`(17.0.0 정확히 파싱)·`language-support`·`compile-database`(이 저장소 자체가
missing이라는 정확한 사실)·`initialize-capability-smoke`(`callHierarchy: true`)·
`fixture-call-hierarchy`(위 수정 후 pass) 전부 확인.

### 검증

- `npm run cli:build` 통과, `npm run cli:test`(전체) 322 pass/2 skip/0 fail(324 total, 변화 없음
  — preset 추가 자체는 새 unit test를 요구하지 않았고, 기존 3개 테스트의 stand-in 언어만 옮겼다).
- 교차 검사 guard(`"every preset's declared extensions are actually reachable through
  languageId()"`)가 `PROVIDER_CATALOG`를 자동 순회하므로 clangd의 `extensions`/`languageIds`
  일관성도 이 테스트로 자동 검증됐다(선언 일치만 보장 — commander가 짚은 대로 이것만으로는 실제
  round trip을 증명 못 하므로, 위 real E2E가 그 증명이다).
- `doctor clangd` / `--smoke` / `--fixture` 전부 real clangd로 실행, 실패 없음.
- `.c`/`.cpp`/`.h` 전부 provider 필드 없이 real auto-discovery로 정답 확인.

## Stage 5 — CI

**목적**: stage 4의 preset fixture는 저하 경로(database 없음, 단일 파일)만 증명한다 — 이 preset이
실제로 파는 기능(database 있음, cross-file 호출자 발견)은 아직 어디서도 증명되지 않았다. stage 5가
그 공백을 CI로 메운다.

### with-database cross-file 왕복 — real integration test (신규 파일)

`cli/src/test/clangdIntegration.test.ts` 신규 작성. gopls의 `stateReachability.integration.test.ts`
후반부(`goplsGatedTest`)와 같은 형태 — `clangdGatedTest()`(clangd가 PATH에 있으면 실행, 없고
`IMPACT_LENS_REQUIRE_CLANGD=1`이면 실패, 아니면 skip). preset fixture와 달리 **테스트 코드는 실제
temp 디렉터리 경로를 알고 있는 시점에 실행되므로**, 진짜 `compile_commands.json`(절대 경로 포함)을
만들 수 있다 — stage 4가 발견한 "preset fixture는 이걸 못 한다"는 한계를 정확히 우회하는 자리다.

**양성**: `target.h`(선언)·`target.c`(정의, target.h를 include)·`caller.c`(호출, target.h를
include) 3파일 + 진짜 `compile_commands.json`. `target.c`에서 `fixture_target`의 incoming calls를
쿼리 — stage 4의 fixture 버그가 못 찾았던 정확히 그 방향("정의만 열고 반대 방향으로 누가
부르나"). `fixture_caller`가 다른 파일에서 실제로 발견됨을 확인하고, `compile_database_missing`이
**없음**도 확인한다.

**음성 대조군**: 같은 3파일, `compile_commands.json`만 뺀다. `fixture_caller`가 **안 보임**을
확인하고(stage 4가 발견한 정확히 그 실패 형태 재현), `compile_database_missing`이 **있음**도
확인한다. 두 테스트가 파일 구조를 공유하고 db 유무 하나만 다르므로, 각각이 정확히 무엇을
증명하는지 분명하다.

### 실제 timing race를 발견하고 고쳤다 — readiness 미선언의 실측 결과

양성 테스트를 처음 만들어 **격리 실행**하니 항상 통과했다(57ms, 3회 반복 재현). 그런데 **전체
스위트에 포함시켜 돌리자 간헐적으로 실패**했다(`observedCallers: []`) — 재실행하면 다시
통과하기도 했다. **결정론적 버그가 아니라 진짜 timing race**였다: clangd의 background indexing은
비동기이고, 이 preset은 `readiness`를 선언하지 않으므로(stage 1의 게이트 결론) `awaitReadiness()`가
즉시 반환한다 — **아무것도 기다리지 않고 바로 쿼리한다.** 격리 실행에서는 매번 우연히 충분히
빨랐지만, 전체 스위트의 시스템 부하 아래서는 indexing이 쿼리보다 늦게 끝나는 경우가 실제로
있었다.

**고쳤다** — 같은 provider 세션(새 clangd 프로세스를 매번 띄우지 않음)에 대해 caller가 나타나거나
예산이 끝날 때까지 250ms 간격으로 재쿼리하는 `queryUntilCallerFound()`를 추가했다(실제 사용자가
"다시 물어보면" 겪을 회복 경로와 같은 모양). 전체 스위트를 3회 연속 재실행해 324/324 통과를
확인했다(양성 테스트 소요시간이 93~355ms로 재시도가 실제로 걸렸음을 보여준다 — 격리 실행의 57ms
기준선보다 길다).

**이건 이 preset의 실제 프로덕션 동작에 대한 새 사실이기도 하다** — `readiness` 미선언 상태에서는
**실제 사용자 쿼리도 같은 race를 겪을 수 있다**(background indexing이 끝나기 전에 쿼리하면 완전한
답 대신 이르게 끝난 결과를 받을 수 있음). 이 stage는 이걸 새 기능으로 고치지 않았다 — 어느 stage
결정 문서에도 없는 새 product 변경을 이 자리에서 임의로 추가하지 않는다는 원칙에 따라, 발견한
사실만 기록하고 프로덕션 코드는 안 건드렸다.

### 3-OS CI job, clangd 버전 pinned

`.github/workflows/unit-tests.yml`에 `clangd-provider` job 추가(`go-provider`와 같은 구조,
`IMPACT_LENS_REQUIRE_CLANGD=1`). **OS마다 설치 경로가 다르다는 게 이 job의 어려운 부분**이라고
commander가 짚은 대로였다 — gopls의 `go install`처럼 OS 무관 단일 명령이 없다.

**버전 선택**: 실측(WebSearch)으로 LLVM 최신 릴리스가 **23.1.0**(2026-08-26 릴리스)임을 확인했다
— 이 lane이 stage 1에서 이미 Homebrew로 검증한 바로 그 버전과 정확히 일치한다. `supported.minimum`
(17.0.0)이 아니라 23을 pin한 이유: apt.llvm.org는 "최근 2개 major만" 저장소를 유지한다고 공식
문서가 적고 있어서, 지금(2026-09) 시점에 17은 그 창을 한참 벗어났다 — 23을 pin해도
`supported.minimum: '17.0.0'`(상한 없음) 범위 안에 있으므로 preset 계약은 위반하지 않는다.

- **Linux**: `apt.llvm.org`의 공식 `llvm.sh 23` 스크립트 + `apt-get install clangd-23`, 그 다음
  `clangd-23`을 `clangd`로 symlink(preset의 `command.candidates: ['clangd']`가 맨 이름을 찾으므로).
- **macOS**: Xcode 번들 clangd(`/usr/bin/clangd`, Apple 자체 버전 체계라 LLVM major와 안 맞음, 이
  머신에서 17.0.0)가 아니라 Homebrew `llvm`(stage 1이 이미 검증한 정확한 경로) — keg-only라
  `$(brew --prefix llvm)/bin`을 `GITHUB_PATH`에 명시적으로 추가.
- **Windows**: Chocolatey `llvm` 패키지, `--version=23.1.0`으로 pin.

**정직하게 남기는 한계**: Linux·macOS 설치 경로는 공식 문서(apt.llvm.org)와 이 lane 자신이 이미
실행한 경로(Homebrew)에 근거하지만, **Windows의 Chocolatey 패키지가 정확히 "23.1.0" 문자열로
지금 공개돼 있는지는 이 세션에서 직접 확인하지 못했다** — `community.chocolatey.org`가 이 세션의
WebFetch를 403으로 막았다. gopls의 "Log installed version" 관행을 그대로 따라 `clangd --version`을
매 OS에서 실행해 실제 설치된 버전을 로그에 남기게 했다 — 버전이 다르게 잡히면 로그에서 바로
보인다. **이 job의 3-OS 실제 실행 결과가 이 job을 쓴 이후 유일하게 남은 실측 검증**이다(이
lane의 다른 모든 주장과 달리, 이것만은 push 후 real CI 로그로 확인해야 한다 — 아래 "남은 작업"에
적는다).

### skip은 실패로 취급 — 직접 확인

`clangdGatedTest()`를 3가지 상태로 직접 실행해 확인했다:
```
clangd PATH에 있음                              → 테스트 정상 실행·통과
PATH에 없음 + IMPACT_LENS_REQUIRE_CLANGD=1       → 테스트 실패(명확한 메시지), skip 아님
PATH에 없음 + 환경변수 없음                        → skip(조용하지만 눈에 보이는 skip)
```
PATH를 clangd 없는 디렉터리로 좁혀 직접 재현했다(Python lane의 symlink 이동 방식과 같은 원리).

### 후속 항목 기록 — preset fixture 메커니즘의 구조적 한계

`ProviderFixtureFile.content`가 정적 문자열이라 절대 경로가 필요한 project metadata(compile
database 등)를 preset fixture에 담을 방법이 없다는 것을 스토리의 "미해결 질문"에 기록했다 —
clangd 하나의 각주가 아니라 **메커니즘 자체의 한계**(gopls의 `go.mod`는 경로가 없고 pyright는
아무 metadata도 안 필요해서 이 lane 전까지 안 드러났다)라고 명시했다. 후속 lane 범위로
`ProviderFixtureFile`에 워크스페이스 경로 치환 템플릿을 추가하는 안을 남겼다 — Python lane의
readiness 발견과 같은 성격의 cross-cutting 기록.

### 검증

- `node --test cli/dist/test/clangdIntegration.test.js`(격리) 2/2, 3회 반복 재현.
- `npm run cli:test`(전체) 3회 연속 재실행 — 324/324 매번(race 수정 확인).
- `python3 -c "import yaml; ..."`로 workflow YAML 구문 검증.
- `clangdGatedTest`의 3가지 상태(present/required-absent/optional-absent) 전부 PATH 조작으로 직접
  재현.

## Stage 5 addendum — commander가 macOS job의 버전 고정 누락을 지적, 고침

`b69fdc7`의 push가 SSH 세션 중단으로 로컬에만 남아 있던 것을 commander가 발견해 직접 push했다(같은
커밋, 새 커밋 아님 — `git fetch`로 원격이 로컬과 동일함을 확인). 그 리뷰에서 commander가 별도로 지적한
결함:

Linux는 `llvm.sh 23` + `clangd-23`, Windows는 `choco install llvm --version=23.1.0`으로 메이저 버전이
고정되는데, macOS 단계만 `brew install llvm` — **버전 지정이 전혀 없는 명령**이었다. Homebrew의 `llvm`
formula는 항상 "현재 최신 메이저"를 가리키므로, 이 job의 이름(`clangd / macos-latest`)과 주변 주석은
"23으로 고정"이라고 주장하면서 실제로는 Homebrew가 24로 넘어가는 순간 그 사실을 알리는 실패 없이 조용히
24를 테스트하게 된다 — 검증된 버전 주장이 사용자가 행동하는 근거라는 원칙(commander가 stage 3 redaction
라운드에서도 반복한 것)을 macOS 단계만 어기고 있었다.

고치기 전에 "`llvm@23`이 실제로 존재하는가"부터 확인했다(주장을 확인 없이 코드에 넣지 않는다는 이 lane의
원칙) — `formulae.brew.sh`의 `llvm` formula API 응답을 직접 fetch: 현재 stable이 23.1.0이고, `llvm@23`은
그 현재 릴리스 자신의 버전 alias로 존재하며, homebrew-core는 새 메이저가 나올 때마다 이전 메이저를
`llvm@22`, `llvm@21`, ..., `llvm@14`까지 별도의 versioned formula로 유지해 왔다는 것을 확인했다. 즉
`llvm@23`을 쓰면 오늘은 `llvm`과 동일한 결과를, Homebrew가 24로 넘어간 뒤에도 이 저장소가 과거 메이저에
의존해 온 것과 같은 패턴으로 계속 23을 가리키는 것을 기대할 수 있다 — 이것이 실제 고정이다.

수정: `.github/workflows/unit-tests.yml`의 macOS 단계를 `brew install llvm` → `brew install llvm@23`,
PATH 단계도 `brew --prefix llvm` → `brew --prefix llvm@23`으로 변경. 주변 주석에 "bare `llvm`은 고정이
아니다"라는 근거와 `llvm@23`을 확인한 방법을 남겨, 다음에 이 job을 읽는 사람이 같은 검증을 반복하지 않아도
되게 했다. `python3 -c "import yaml; ..."`로 YAML 구문만 재검증(clangd 자체를 실행하는 변경이 아니므로
`npm run cli:test` 재실행은 불필요 — CI job 정의만 바뀜).

## Stage 6 — 사용자 문서 sweep

### 목적과 사용자 가치

**목적**: stage 1-5가 만든 것(`clangd` verified-external preset, compile database 상태 표면화, `.h`
ambiguity)은 코드에는 있지만 사용자와 agent가 읽는 문서에는 아직 없었다. 문서가 낡은 채로 남으면 두 가지
실패가 생긴다 — (1) 사람 사용자가 README/INSTALL만 보고 "C/C++는 아직 preset이 없다"고 오해해서 이미
동작하는 기능을 쓰지 않거나 raw custom provider를 불필요하게 직접 설정하고, (2) agent가 SKILL.md/
cli-contract.md에 `compile_database_missing` 계열의 뜻을 배우지 못한 채 그 코드를 만나면 stage 3이 막으려던
바로 그 오독("호출자가 없다")을 반복한다. **이 stage가 끝나면 사람은 정확한 preset 개수와 설치 요구사항을
알고, agent는 compile database 상태와 `.h` ambiguity를 올바르게 읽고 요약한다.**

**상위 목표와의 관계**: M2(Python·Go·C/C++)의 마지막 lane, 마지막 stage. 이 stage가 끝나야 PR을 올릴
근거(코드와 문서가 같은 사실을 말한다)가 갖춰진다.

### 절차 — 식별자 grep, 문장 grep 아님

commander 지시대로 `bundled-typescript`/`gopls`/`bundled-pyright`/`clangd`를 식별자로 grep해 후보 파일을
추리고, 각 후보는 **전체를 읽었다** — 부분 grep이 아니라 파일 전체 read. 이 방식으로 원래 계획에 없던
결함 하나를 찾았다(아래 "부수 발견" 참고).

### 변경한 사용자 문서

| 파일 | 무엇을 고쳤나 |
| --- | --- |
| `README.md` | "preset이 세 개" → 네 개(clangd 추가); C/C++가 "다음 후보"라는 낡은 문장 제거(이미 shipped); `complete: true`가 증명하지 않는 것 절에 `compile_database_*` 새 항목과 `.h`→`languageMatch: 'unknown'` 항목 추가; 분석 경계 절에 `.h` ambiguity 한 줄 추가 |
| `INSTALL.md` | "세 preset" → 네 preset; **부수 발견**(아래) 수정 |
| `cli/README.md` | `knownPresetIds` 예시, doctor 예시 triple, "has three entries" → four entries, 새 "Compile database state (C/C++)" 절 추가(compile_database_* 세 코드, `.h` ambiguity, clangd readiness 미선언) |
| `CHANGELOG.md` | `## Unreleased`에 clangd preset·`compile_database_*`·`.h` ambiguity 세 항목 추가(gopls/pyright 항목과 같은 형식) |
| `plugins/impact-lens/skills/impact-lens-cli/SKILL.md` | `unknown` bullet에 clangd 추가; `compile_database_*`/`.h` ambiguity를 다루는 새 bullet 추가 |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md` | `unknown` 절에 clangd 추가; 새 "C/C++: compile database state and header ambiguity" 절 추가 |
| `.claude/agents/il-provider-platform.md` | "오늘 3개 preset" → 4개, clangd 추가 |
| `docs/development-management/stories/il-lim-014-c-cpp-clangd-support.md` | `현재 기준선` 절 위에 "2026-09-03 갱신" 인용 블록 추가(원문은 보존 — 이 lane의 "정정 표시, 원문 유지" 관행) |

### 부수 발견 — INSTALL.md의 낡은 "Python은 아직 미검증" 문구, clangd와 무관하게 이미 틀려 있었다

`INSTALL.md`의 "CLI에서 provider 오류" 절을 전체 read하다가(부분 grep이었다면 못 찾았을 것 — commander가
정확히 이 실패 방식을 경고했다) 발견: "Python/C/C++/Swift/Kotlin 등은 **아직 검증된 preset이 없어서**..."
라는 문장이 남아 있었다. Python은 M2 Python lane(PR #64, merge 완료, `bundled-pyright`)이 이미 검증된
preset을 만들었으므로 **이 문장은 clangd 착수 이전부터, Python lane 자신의 stage 6에서 이미 놓쳤던
결함**이다(Go는 그 lane에서 이 목록에서 빠졌지만 Python은 남아 있었다 — 아마 같은 문장을 두 번 고칠 때
Go만 지우고 Python은 남긴 편집 실수로 보인다, git blame으로 확정하지는 않았다). clangd 문서화 작업과
같은 문단을 만지는 김에 함께 고쳤다: Python/Go/C/C++를 검증된 preset이 있는 언어로 옮기고 Swift/Kotlin만
"아직 없음" 목록에 남겼다. **clangd 범위 밖의 사전 결함을 발견 즉시 고친 것 — 임의로 범위를 넓힌 것은
아니다** (같은 문단, 같은 grep에서 나온 발견).

### response-policy 채점기 — 확장 전 SCOPE/KNOWN LIMITATION을 먼저 읽었다

commander가 "fixture 쓰기 전에 `scripts/lib/response-policy-engine.mjs` 최상단 SCOPE/KNOWN LIMITATION을
읽고, 오탐을 만나도 채점기부터 고치려 하지 말라"고 지시했다. 전문을 읽은 결과:

- SCOPE: 이 채점기의 유일한 caller는 `scripts/test-response-policy.mjs`(`npm run test:response-policy`).
  cli/나 plugins/ 런타임에서는 아무도 import하지 않는다 — dev-time 회귀 harness다.
- KNOWN LIMITATION: `INDEX_SCOPED_MAY_NOT_UNCERTAINTY`(대명사 참조, 접속사 경계)는 Python lane이 5라운드
  측정 끝에 "regex 기반 어휘 매칭은 원리적으로 주어를 판별할 수 없다"고 결론 내고 멈춘 지점이다.

이번에 한 일은 이 KNOWN LIMITATION과 다른 종류다 — 기존 정밀도 문제를 다섯 번째로 다시 건드린 게 아니라,
**새 코드 세 개(`compile_database_missing`/`_stale`/`_ambiguous`)에 대해 `LIMITATION_SURFACE_PATTERNS`
테이블 항목을 추가**했다. 이 테이블은 파일 자신의 주석이 "새 코드는 항목이 없으면 밑줄→공백 fallback으로
검사된다"고 이미 예상해 둔 확장 지점이고, `provider_not_ready`("still indexing"/"not ready")·
`provider_null_incoming_calls`(`Depends()` 등)처럼 기존 코드마다 이미 있는 패턴과 같은 종류의 항목이다.
KNOWN LIMITATION이 경고하는 "정밀도를 더 짜내려는 시도"가 아니므로 사전 보고 없이 진행했다 — 다만 무엇을
왜 추가했는지는 이 절과 커밋 메시지에 남긴다(사후 투명성).

세 코드에 각각 독립 패턴을 줬다(공유 패턴 하나가 아니라) — "stale"이라고 말한 요약이 "missing"/
"ambiguous"까지 표면화했다고 잘못 인정되는 것을 막기 위해서다. `cli-contract.md`/`SKILL.md`에 쓴 실제
문구("No compile_commands.json was found", "compile database is stale" 등)와 맞춰 패턴을 만들었다.

fixture 2개 추가(`scripts/fixtures/response-policy/20-*.json`, `21-*.json`), `provider_null_incoming_calls`의
11/12번 fixture 쌍과 같은 구조 — 20번은 clangd + `indexingStatus: unknown` + `compile_database_missing`을
모두 정확히 요약한 must-pass, 21번은 같은 응답을 "Nothing calls this, safe to remove"로 오독한 must-fail
(`unsupported_no_impact_conclusion`/`missing_index_caveat`/`missing_high_severity_disclosure` 3개 위반 동시
발생 — index 상태 불명과 compile database 부재라는 두 개의 독립된 근거가 한 번에 무시되는 것을 보여준다).
`stale`/`ambiguous`는 별도 fixture로 잠그지 않았다 — 두 코드는 `missing`과 같은 매커니즘
(`highSeverityLimitations` + `surfacesLimitation` 테이블 조회)을 쓰고, 그 매커니즘 자체는 20/21번이 이미
검증한다.

### 검증

- `npm run cli:build` 성공(코드 변경 없음, 문서만 — 실패 시 문서가 실제 식별자와 어긋난다는 신호였을
  것).
- `npm run cli:test` 324/324 pass, 2 skip(로컬에 gopls 없음, 기존과 동일).
- `npm run test:response-policy` — 21개 fixture(신규 2개 포함) 전부 기대한 위반과 정확히 일치, doc
  invariant와 negative-direction 증명 5개 전부 통과. `<!-- response-policy-example -->` 두 블록은 건드리지
  않았다.
- `npm run test:plugin-artifact` — clean install E2E 통과(plugin 쪽 문서 경로는 이번에 변경하지 않았지만
  전체 sweep이라 회귀 확인 차 실행).
- `grep -rn "preset이 세\|three entries\|has three entries"` — 남은 매치는 `docs/work/task-m2-gopls-ci-
  verification.md`의 과거 시점 작업 기록 하나뿐(그 lane 당시엔 실제로 두 preset이었다는 역사적 사실 —
  고치지 않음, AGENTS.md의 작업 로그 보존 원칙).

## 남은 작업

- **Stage 1-6 전부 완료. commander에게 보고 후 최종 검토 대기 — PR 올리기 전에 한 번 더 검토받는다**
  (commander가 명시). 이 lane에서 코드로 남은 일은 없다 — 남은 것은 검토와 CI 실측뿐이다.
- **push 후 실제 CI 로그로 확인해야 하는 것**: `clangd-provider` job의 3-OS 실행 결과, 특히
  Windows의 Chocolatey `llvm --version=23.1.0` 설치와 macOS의 `llvm@23` 설치가 실제 CI 러너에서
  성공하는지(이 세션에서는 API 응답으로만 확인, 실제 `brew install`/`choco install` 실행은 못 함) —
  이 세션에서 직접 확인 못 함. 실패하면 그 자리에서 버전 문자열을 조정하는 후속 커밋이 필요하다.
- **후속 lane 후보로 남긴 것**(이번 lane 범위 밖, il-lim-014 `미해결 질문`에 기록): `awaitReadiness()`를
  `open()` 뒤로 옮기는 재설계(pyright·clangd 둘 다 뒷받침하는 근거), `ProviderFixtureFile`의 워크스페이스
  경로 템플릿 메커니즘.
