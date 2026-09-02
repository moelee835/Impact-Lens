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

- [ ] provider JSON 없이 `.c`·`.cpp` fixture에서 검증 clangd가 자동 선택된다.
- [ ] compile database 유무·경로·staleness와 capability가 doctor 결과에서 구분된다.
- [ ] direct, cross-file, method와 overload incoming call이 pinned clangd fixture에서 반복 통과한다.
- [ ] function pointer, virtual dispatch, macro와 조건부 컴파일 한계가 provider 원본 결과와 함께 기록된다.
- [ ] metadata가 없을 때 configure/build를 실행하지 않고 안전한 생성 안내만 제공한다.

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
