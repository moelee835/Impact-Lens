# IL-LIM-014 C/C++ clangd 지원 검증

- 상태: Backlog
- 우선순위: P1
- 완료 마일스톤: [M2 — Python·Go·C/C++ verified support](../milestones/m2-p1-language-support.md)
- 영향도: 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

C와 C++은 VS Code Extension에서 설치된 provider 범위로 사용할 수 있지만 CLI/Plugin에는 검증된 preset이
없다. 사용자가 clangd executable, args와 languageId를 직접 지정하더라도 compile flags와 build target을
알 수 없으면 header, macro, template와 overload를 잘못 해석해 불완전한 graph를 만들 수 있다.

## 사용자 스토리

C/C++ 프로젝트를 분석하는 개발자로서 기존 compile database를 Impact Lens가 안전하게 발견하고 검증된
clangd를 자동 선택하여, provider 내부 설정을 직접 작성하지 않고 정적 incoming-call graph를 얻고 싶다.

## 범위

- `clangd` verified-external preset, executable/version/capability discovery와 doctor를 제공한다.
- CMake 등에서 이미 생성된 `compile_commands.json`과 `.clangd` 상태를 read-only로 진단한다.
- C와 C++ direct/cross-file 호출의 Call Hierarchy E2E와 언어 고유 limitation fixture를 만든다.
- header의 language/target ambiguity와 index readiness를 결과에 표시한다.

## 제외 범위

- compiler, clangd, CMake 또는 build dependency 자동 설치
- CMake configure나 project build를 사용자 승인 없이 실행
- function pointer, virtual dispatch와 macro-generated call을 runtime 확정 관계로 표시
- 모든 compiler와 non-CMake build system 조합 검증

## 수용 기준

> **2026-09-03 갱신(M2 마일스톤 종료 처리, `docs/work/task-m2-closure.md`)**: 아래 5개 항목을 근거와
> 함께 판정했다. 3번은 당시 **부분만 충족**이라 미체크였다. 4번의 macro 항목은 **A-3 정정**을 반영해
> 판정했다 — stage 4 실측이 작성 시점 가정("macro는 한계")을 반증했다(simple macro는 정확히 잡힘).
>
> **2026-09-03 후속 갱신(M2 gate-gaps lane, `docs/work/task-m2-gate-gaps.md`)**: 그 공백을 닫아 3번도
> 체크했다. **이 과정에서 실측이 shipped `docs.limitations`를 실제로 반증했다** — virtual dispatch
> 항목의 "never under a derived override's"가 Apple clangd 17.0.0에서만 참이고, 3-OS CI가 실제로
> 설치하는 22.1.7/23.1.0/23.1.1에서는 전부 거짓임을 real CI로 확인했다(세 OS·두 major가 완전히 같은
> 방향으로 갈렸다 — flaky 아님). `docs.limitations`를 버전별 사실로 정정하고, 테스트 자체도 실제
> clangd major를 읽어 그 버전에서 관측된 동작을 단언하도록 바꿨다(17/22/23 외 버전은 조용히 통과시키지
> 않고 명시적으로 실패). 4번도 이 정정을 반영해 재판정했다.

- [x] provider JSON 없이 `.c`·`.cpp` fixture에서 검증 clangd가 자동 선택된다. —
      `cli/src/test/clangdIntegration.test.ts`의 두 테스트 전부 `provider` 필드 없이 순수
      auto-discovery로 실행되고 `selectedBy: 'auto'`를 직접 단언한다.
- [x] compile database 유무·경로·staleness와 capability가 doctor 결과에서 구분된다. —
      `cli/src/doctor/checks.ts`의 `compileDatabaseCheck()`가 missing/ambiguous/stale/present 4상태를
      `state`/`path`/`candidatePaths`/`sample` 필드로 구분해 보고한다.
- [x] direct, cross-file, method와 overload incoming call이 pinned clangd fixture에서 반복
      통과한다. — direct·cross-file은 `cli/src/test/clangdIntegration.test.ts`의 기존 두 테스트가
      compile database 있음/없음 양방향으로 반복 증명한다. **method·overload·virtual dispatch는
      M2 gate-gaps lane stage 1이 추가했다** — 같은 파일의 새 `clangdGatedTest`("C++ with a real
      compile database: method calls, overload resolution and virtual-dispatch attribution are all
      correct for this clangd version")가 한 provider 세션에서: (1) 클래스 메서드 호출
      (`Base::helper`) 발견 — 기능 증명이자 아래 단언들의 대조군, (2) overload 구분
      (`overloaded(int)`에만 호출자, `overloaded(double)`에는 없음 — 버전 무관, 세 major 전부
      불변), (3) virtual dispatch — `Base::target`에는 항상 호출자가 붙음(버전 무관), `Derived::
      target`은 **실제 설치된 clangd major를 읽어** 그 버전에서 관측된 동작을 단언한다(17 → 없음,
      22·23 → 있음, 그 외 미관측 버전 → 명시적 실패). non-vacuity는 assertion 위치/값을 실제로
      바꿔 각각 실패를 확인한 뒤 byte-identical 복원으로 확인했다(`docs/work/task-m2-gate-gaps.md`).
      **주의**: 이 정정된 형태의 3-OS CI 재실행 결과는 아직 확인 전이다 — push 후 실제 로그로
      확인이 남아 있다(정정 전 형태는 이미 3-OS 전부에서 이 버전 차이를 실측으로 잡아냈다).
- [x] function pointer, virtual dispatch, macro와 조건부 컴파일 한계가 provider 원본 결과와 함께
      기록된다. — `cli/src/providers/catalog.ts`의 clangd `docs.limitations` 4항목 전부가 실제
      probe로 뒷받침된다: function pointer, 조건부 컴파일(`#ifdef`)은 원래 문구 그대로 유효하다.
      **macro는 정정된 문구로 판정한다**(M2 마일스톤 종료 처리 A-3) — "simple macro that expands
      directly to a function call is resolved correctly (verified); more complex macro patterns...
      have not been tested." 즉 macro는 무조건적 "한계"가 아니라 단순한 경우는 한계가 아님이
      실측으로 확인됐고 복잡한 패턴만 미검증이다. **virtual dispatch도 M2 gate-gaps lane이 다시
      정정했다** — 원래 문구("appears under the statically-declared base method's Call Hierarchy
      result, never under a derived override's")의 `never`가 틀렸다. 정정된 문구: base 메서드에는
      **항상**(17/22/23 전부) 붙고, derived override에는 **버전에 따라** 다르다(17.0.0은 없음,
      22.1.7/23.1.0/23.1.1은 있음, 18-21은 미측정 — 경계를 추측하지 않는다). 이 정정 자체가 "한 번짜리
      수동 probe를 반복 검증으로 바꾸자 실제로 그 주장이 틀렸다는 게 드러난" 이 lane의 핵심
      산출물이다.
- [x] metadata가 없을 때 configure/build를 실행하지 않고 안전한 생성 안내만 제공한다. —
      `cli/src/coverage.ts`의 `compile_database_missing.action`은 안내 문구뿐이고("Generate a compile
      database... and re-run"), 세 M2 lane 전체에서 CMake configure나 build를 실행하는 코드 경로가
      추가된 적이 없다(작업 로그 확인).

## 검증

- Linux/macOS/Windows의 clangd discovery 및 version parser 단위 테스트
- C와 C++ compile database fixture의 cold/warm real-process E2E
- Plugin runner의 provider 없는 `.c`/`.cpp` 분석
- header ambiguity, missing/stale command와 dynamic-dispatch negative fixture

## 의존성 및 위험

- `IL-LIM-003` provider/coverage, `IL-LIM-004` preset과 `IL-LIM-005` lifecycle 기반에 의존한다.
- 동적 관계는 `IL-LIM-001`, callable은 `IL-LIM-011`, note 문법은 `IL-LIM-013`에 evidence를 제공한다.
- compile command에는 사용자 환경 경로와 define이 포함될 수 있으므로 진단 출력은 redaction해야 한다.

## 현재 기준선

> **2026-09-03 갱신**: 아래 네 항목은 이 스토리가 작성된 시점(작업 착수 전)의 기준선이며, 지금은 더 이상
> 정확하지 않다. `feat/m2-clangd-preset` branch의 stage 1-5(`docs/work/task-m2-clangd-preset.md`)가 이
> 기준선 자체를 구현으로 대체했다 — `clangd` verified-external preset이 catalog에 있고, compile
> database 상태(`compile_database_missing`/`_stale`/`_ambiguous`)와 `.h` ambiguity(`languageMatch:
> 'unknown'`)가 doctor와 분석 응답 모두에서 구분되며, `cli/src/test/clangdIntegration.test.ts`가 실제
> clangd process로 cross-file Call Hierarchy 왕복을 증명한다. PR은 아직 열리지 않았고 commander 검토
> 대기 중이므로 이 절과 상단 `상태: Backlog`는 병합·release 전까지 원문을 보존한다(수정이 아니라 추가
> 표시).

- CLI의 자동 languageId에는 C/C++ 확장자가 없으며 provider가 없으면 TypeScript server를 실행한다.
- raw custom provider로 clangd를 지정할 수 있지만 version, compile database와 index readiness를 검사하지 않는다.
- Source note는 일부 C/C++ 확장자의 `//`를 지원하지만 provider 지원 등급과 연결된 공통 fixture가 없다.
- 실제 clangd process를 사용하는 C/C++ Call Hierarchy integration test가 없다.

## 조사 결과

- LLVM clangd의 [ClangdServer 구현](https://github.com/llvm/llvm-project/blob/main/clang-tools-extra/clangd/ClangdServer.cpp)은
  `prepareCallHierarchy`, incoming과 outgoing calls를 제공한다.
- [clangd project setup](https://clangd.llvm.org/installation#project-setup)은 compile command가 실제 build와
  일치해야 한다고 설명하며 CMake의 `CMAKE_EXPORT_COMPILE_COMMANDS`를 대표 경로로 안내한다.
- clangd는 background index를 사용하므로 initialize 성공만으로 cross-file 결과가 준비됐다고 단정할 수 없다.
- C/C++ 의미는 build target, compiler flags, preprocessor define과 header include context에 따라 달라진다.
  따라서 파일 확장자와 executable 발견만으로 `verified` 결과를 선언할 수 없다.

## 대안 검토와 결정

1. **clangd command preset만 제공**: zero-config처럼 보이지만 build context 오류를 숨겨 제외한다.
2. **Impact Lens가 configure/build 실행**: metadata는 좋아지나 project code 실행·지연·side effect가 있어 기본값에서 제외한다.
3. **기존 metadata read-only discovery + doctor + E2E**: 안전성과 재현성을 함께 확보하므로 권장한다.
4. **AST 자체 분석기 추가**: clang semantic/index 기능을 중복 구현하고 유지비가 커 fallback 우선순위에서 제외한다.

## 권장 대응

- preset ID를 `cpp.clangd`로 두고 `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`와 VS Code languageId를 명시한다.
- discovery는 명시 preset 경로, PATH와 platform package 경로를 제한적으로 검사하고 version/capability를 probe한다.
- project root부터 compile database 후보를 찾고 선택 근거를 기록한다. 복수 후보나 header target ambiguity는
  조용히 하나를 선택하지 않고 project choice 또는 limitation을 반환한다.
- doctor는 provider 상태와 build metadata 상태를 분리한다. compile command의 전체 flags는 기본 출력하지 않는다.
- 분석 결과는 direct/static provider edge와 function-pointer·virtual 가능성을 구분하고 `complete`를 runtime
  coverage로 해석하지 않는다.

## 단계별 계획

### 1단계 — fixture와 provider baseline

1. network dependency가 없는 C와 C++ multi-file CMake fixture를 만든다.
2. direct call, overload, namespace, method, header와 test caller expectation manifest를 작성한다.
3. function pointer, virtual method, macro, template와 conditional compile을 variable/negative category로 둔다.
4. pinned clangd의 raw capability·Call Hierarchy 결과를 cold/warm 각 3회 capture한다.

종료 조건: provider 원본 coverage와 비결정성이 version별 artifact로 재현된다.

### 2단계 — preset과 discovery

1. `IL-LIM-004` catalog에 `cpp.clangd` 후보와 platform executable path를 추가한다.
2. C/C++ extension/languageId 및 raw custom override 우선순위를 구현한다.
3. provider가 없거나 version이 미검증이면 설치 안내와 `unverified_version`을 구분한다.
4. `.h`처럼 언어·target이 모호한 파일은 build metadata 없이는 자동 확정하지 않는다.

종료 조건: 검증 fixture는 Auto로 선택되고 모호한 workspace는 잘못된 provider를 실행하지 않는다.

### 3단계 — build metadata와 readiness doctor

1. compile database 후보, target command 존재와 source 포함 여부를 read-only로 검사한다.
2. `.clangd` 존재와 compile flags source를 기록하되 내용과 secret-like define은 redaction한다.
3. background index 준비 전 empty와 실제 no-caller를 반복 query/bounded readiness profile로 구분한다.
4. metadata 생성 명령은 안내만 하고 별도 사용자 승인 없이는 실행하지 않는다.

종료 조건: missing/stale/ambiguous/ready 상태마다 해결 가능한 진단이 있다.

### 4단계 — Impact Lens·Plugin E2E

1. provider 원본과 Impact Lens normalized graph를 비교한다.
2. Plugin runner에서 raw provider 없는 C/C++ 요청을 실행한다.
3. depth/node, diagnostics, source declaration과 test classification 회귀를 확인한다.
4. `IL-LIM-001/011/013` matrix에 동적 gap, callable kind와 note syntax 결과를 전달한다.

종료 조건: 지원 OS의 pinned matrix가 반복 통과하고 알려진 gap이 결과에서 식별된다.

### 5단계 — 지원 등급 승격

1. 최소·권장 clangd와 build metadata 조건을 INSTALL에 기록한다.
2. 검증 범위를 C와 C++로 나눠 공개하고 header/target 제약을 설명한다.
3. scheduled integration으로 clangd drift를 탐지하고 snapshot 변경은 review한다.

종료 조건: 모든 gate 통과 후에만 `verified-external`로 승격한다.

## 예상 변경 영역

- `cli/src/providers/`: clangd preset, discovery, version과 readiness profile
- `cli/src/lspProvider.ts`: C/C++ languageId와 provider metadata
- `cli/src/test/fixtures/c-cpp-clangd/`: project와 expectation manifest
- CI external-provider matrix와 release evidence
- Plugin skill, README/INSTALL과 limitation 문서
- `IL-LIM-001`, `011`, `013`의 언어 matrix artifact

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| discovery | PATH/명시 경로/미설치 | 결정적 선택 또는 actionable error |
| metadata | ready/missing/stale/복수 database | 상태와 선택 근거가 구분됨 |
| C E2E | direct·cross-file·function pointer | direct edge 안정, pointer gap 명시 |
| C++ E2E | overload·virtual·template·macro | provider 결과와 variable gap이 분리됨 |
| Plugin | provider 없는 `.cpp` | Auto preset으로 분석되고 raw command 불필요 |
| 안전 | metadata 없음 | configure/build process를 시작하지 않음 |

## rollout과 관측

- 첫 release는 doctor와 experimental preset으로 시작하고 기본 Auto 실행은 pinned matrix 통과 후 켠다.
- provider version, metadata 상태, index wait와 query timing만 로컬 debug artifact에 기록한다.
- regression 시 C/C++ preset만 `disabled-by-default`로 내리고 raw custom과 다른 언어를 보존한다.
- compile database 원문, source와 symbol 이름은 telemetry로 전송하지 않는다.

## 미해결 질문

- header가 여러 target에 포함될 때 사용자에게 target 선택을 언제 요청할지 결정해야 한다.
- compile database staleness를 mtime만으로 판단할지 build-system adapter가 필요한지 검토해야 한다.
- MSVC/clang-cl과 Apple clangd를 같은 verified matrix로 볼 수 있는지 실제 fixture가 필요하다.
- **readiness 신호가 파일 open 이후에만 오는 provider의 일반 문제 — 지금까지 조사한 non-bundled
  provider 셋 중 gopls만 예외다.** M2 Python preset lane(`docs/work/task-m2-python-preset.md`,
  "아키텍처 발견 독립 기록" 항목)이 pyright의 work-done-progress가 workspace 초기화가 아니라
  `textDocument/didOpen`이 트리거한다는 것을 실측으로 확인했다. M2 clangd lane stage 1
  (`docs/work/task-m2-clangd-preset.md`)이 clangd도 같은 형태임을 실측으로 확인했다 — `with-db`
  fixture에서 `initialize` 후 15초 동안 어떤 파일도 열지 않았을 때 `$/progress` 0건, `didOpen`
  직후 즉시 도착. Apple clangd 17.0.0과 upstream LLVM clangd 23.1.0 양쪽에서 재현해 빌드 특성이
  아님을 확인했다. **즉 "readiness는 파일 open 전에 workspace 단위로 온다"는 것이 다수 사례가
  아니라 gopls 하나의 사례다** — 지금 구조(`cli/src/lspProvider.ts`의
  `LspCallHierarchyProvider.awaitReadiness()`가 `doInitialize()` 안, 어떤 `open()`보다 먼저 호출됨,
  `:585` vs `:651`)가 전제하는 순서가 실제로는 소수 provider에만 맞는다. `awaitReadiness()`를
  `open()` 뒤로 옮기는 재설계는 TS·gopls·custom이 공유하는 경로라 provider 하나만의 fix가 아니라
  별도 lane 규모다(gopls readiness의 3-OS 재검증이 필요) — 이 사실을 이제 두 provider(pyright,
  clangd)가 뒷받침하므로, 그 별도 lane의 우선순위를 다음 계획 세션이 재평가할 근거가 됐다.
- **preset `fixture` 메커니즘이 절대 경로가 필요한 project metadata 파일을 못 다룬다 — clangd
  하나의 각주가 아니라 메커니즘 자체의 한계다.** `ProviderFixtureFile.content`(`preset.ts`)는 정적
  문자열이고, `fixtureCheck()`(`doctor/index.ts:275,281`)는 그 내용을 `fs.mkdtempSync()`로 만든
  런타임 임시 디렉터리에 쓰기만 한다 — preset 정의 시점에는 그 경로가 존재하지 않는다. gopls의
  `go.mod`는 경로를 담지 않고, pyright는 project metadata 파일 자체가 필요 없어서 이 lane 전까지는
  이 한계가 드러난 적이 없었다. M2 clangd lane stage 4(`docs/work/task-m2-clangd-preset.md`)가
  실제로 부딪혔다 — `compile_commands.json`의 `directory` 필드는 절대 경로를 요구하는데 fixture에
  그 값을 주입할 방법이 없어서, 이 preset의 shipped fixture는 **저하 경로(database 없음, 단일
  파일)만 증명한다.** 정상 경로(database 있음, cross-file 호출자 발견 — 이 preset이 실제로 파는
  기능)는 별도 CI 전용 integration test(`cli/src/test/clangdIntegration.test.ts`, stage 5)가 실제
  temp 경로로 진짜 `compile_commands.json`을 만들어 증명한다 — **preset fixture 메커니즘 자체는
  여전히 이 종류의 project metadata를 못 다룬다.** 앞으로 절대 경로 기반 project metadata가 필요한
  provider가 또 나오면(예: 다른 build-system 기반 언어) 같은 벽에 부딪힌다. M2 Python preset
  lane의 readiness 발견과 같은 성격의 cross-cutting 항목 — `ProviderFixtureFile`에 워크스페이스
  경로를 참조할 수 있는 템플릿 메커니즘(예: `{{workspace}}` 치환)을 추가하는 것이 후속 lane의
  범위다.
