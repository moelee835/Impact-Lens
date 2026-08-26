# IL-LIM-015 Swift SourceKit-LSP 지원 검증

- 상태: Backlog
- 우선순위: P2
- 완료 마일스톤: [M3 — Swift·Kotlin 및 callable 확장](../milestones/m3-p2-language-callables.md)
- 영향도: 중간~높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

Swift는 VS Code의 Swift extension 범위에서는 분석할 수 있지만 독립 CLI/Plugin에 검증된 SourceKit-LSP
preset이 없다. SwiftPM과 Xcode project는 toolchain, SDK, build setting과 index 상태가 맞아야 cross-module
분석이 가능하며, 단순 `sourcekit-lsp` command 설정만 노출하면 사용자는 긴 초기화와 빈 결과의 원인을 알기 어렵다.

## 사용자 스토리

Swift 개발자로서 설치된 공식 toolchain과 기존 project metadata를 Impact Lens가 안전하게 발견하고,
SwiftPM 또는 지원 가능한 Xcode workspace의 Call Hierarchy 준비 상태와 한계를 명확히 알고 싶다.

## 범위

- SourceKit-LSP executable/toolchain discovery와 capability probe를 제공한다.
- SwiftPM을 첫 검증 project로 삼고 Xcode workspace는 별도 feasibility lane으로 둔다.
- SDK, toolchain, build/index readiness를 provider availability와 분리해 진단한다.
- direct/cross-file/protocol/closure/async와 test target fixture를 검증한다.

## 제외 범위

- Swift toolchain, Xcode, SDK와 package dependency 자동 설치
- `swift build`, package resolve 또는 Xcode build를 사용자 승인 없이 실행
- protocol dispatch, Objective-C runtime, selector와 macro expansion을 완전한 runtime graph로 확정
- 모든 Apple platform·scheme·configuration 검증

## 수용 기준

- [ ] pinned SwiftPM fixture에서 provider 없는 `.swift` 요청이 검증 SourceKit-LSP를 선택한다.
- [ ] toolchain/SDK/project/index 상태와 Call Hierarchy capability가 별도 doctor 상태로 보고된다.
- [ ] direct·cross-file·method·async/test caller baseline이 반복 가능하게 기록된다.
- [ ] protocol/closure, `@objc` selector와 macro 등 variable gap이 provenance/limitation으로 표시된다.
- [ ] Xcode-only 조건을 SwiftPM 지원과 섞어 공식화하지 않는다.

## 검증

- macOS와 지원 Linux toolchain discovery/version parser
- self-contained SwiftPM real-process E2E와 cold/warm timing
- Xcode workspace 수동/자동 feasibility matrix
- Plugin runner 및 dynamic-dispatch negative fixture

## 의존성 및 위험

- `IL-LIM-003`~`005`와 bundled runtime 신뢰성 `IL-LIM-017`에 의존한다.
- dynamic relation은 `IL-LIM-001`, callable은 `IL-LIM-011`, note syntax는 `IL-LIM-013`에 연결한다.
- toolchain과 SDK path는 사용자 환경 정보이므로 진단 artifact를 redaction해야 한다.

## 현재 기준선

- CLI의 languageId 자동 판별과 provider catalog에 Swift가 없다.
- generic adapter는 SourceKit-LSP가 요구할 수 있는 workspace configuration, progress와 readiness를 충분히 처리하지 않는다.
- SwiftPM/Xcode fixture, 실제 capability capture와 Plugin E2E가 없다.
- Extension은 실행 provider identity/version을 공개 API에서 확인할 수 없어 VS Code lane과 CLI lane 비교 근거가 없다.

## 조사 결과

- [SourceKit-LSP 공식 저장소](https://github.com/swiftlang/sourcekit-lsp)는 Swift toolchain과 Xcode에 포함되며
  SwiftPM 및 `compile_commands.json` project를 지원한다고 설명한다.
- 공식 문서는 최근 build가 없으면 global/cross-module 기능이 제한될 수 있고 experimental background indexing을
  별도로 언급한다. initialize 성공과 의미 있는 index readiness는 같지 않다.
- SourceKit-LSP는 toolchain과 sourcekitd/SDK 조합에 민감하므로 임의 binary와 toolchain을 섞는 custom path를
  기본 지원으로 선언하면 재현성이 낮다.
- Swift의 protocol witness, closure, Objective-C interoperability와 macro는 runtime/생성 관계를 포함하여
  provider Call Hierarchy가 반환한 범위를 넘어설 수 있다.

## 대안 검토와 결정

1. **`sourcekit-lsp` PATH preset만 제공**: 빠르지만 toolchain/index 실패를 숨겨 제외한다.
2. **모든 요청 전에 `swift build` 실행**: coverage를 높일 수 있으나 지연·network·plugin 실행 위험으로 제외한다.
3. **toolchain-aware discovery + 기존 metadata + readiness doctor**: 안전한 기본값으로 권장한다.
4. **Xcode와 SwiftPM 동시 공식화**: matrix가 과도하고 실패 원인이 달라 SwiftPM부터 단계적으로 진행한다.

## 권장 대응

- preset ID를 `swift.sourcekit-lsp`로 두고 현재 toolchain과 같은 distribution의 executable을 우선한다.
- `Package.swift`, workspace root, target source membership과 toolchain/SDK version을 read-only로 진단한다.
- SwiftPM fixture로 Call Hierarchy capability를 실제 probe하고, 문서에 있다고 가정하여 승격하지 않는다.
- build/index가 필요한 상태는 `provider_not_ready` 계열 coverage로 표시하고 자동 build 대신 공식 명령과 예상 비용을 안내한다.
- Xcode workspace는 scheme/configuration/derived data가 필요한 조건을 별도 evidence로 수집한 뒤 지원 등급을 정한다.

## 단계별 계획

### 1단계 — SwiftPM fixture와 capability baseline

1. network dependency가 없는 library/executable/test target fixture를 만든다.
2. direct, cross-file, method, async, protocol과 closure 관계를 expectation category로 분류한다.
3. pinned toolchain의 initialize capability와 raw Call Hierarchy를 cold/warm 반복 capture한다.
4. sourcekit-lsp가 capability를 제공하지 않거나 불안정하면 unsupported baseline으로 기록한다.

종료 조건: 실제 provider evidence 없이 지원을 가정하지 않는 재현 가능한 baseline이 있다.

### 2단계 — toolchain-aware discovery

1. macOS `xcrun`/Xcode와 swift.org toolchain의 executable/version 탐색 규칙을 정의한다.
2. selected Swift compiler와 SourceKit-LSP가 같은 toolchain인지 검사한다.
3. 복수 toolchain은 project choice 또는 actionable ambiguity로 반환한다.
4. 전체 환경변수와 SDK path를 기본 로그에 노출하지 않는다.

종료 조건: supported/missing/mismatch/ambiguous toolchain 상태가 구분된다.

### 3단계 — project와 indexing readiness

1. SwiftPM manifest와 source membership을 read-only로 확인한다.
2. server progress, index artifact와 bounded first-query를 조합하되 `ready`를 과장하지 않는다.
3. build 필요 상태와 실제 no-caller를 분리한다.
4. package resolve/build는 별도 사용자 승인 없이는 실행하지 않는다.

종료 조건: cold workspace에서 premature empty를 성공으로 확정하지 않는다.

### 4단계 — Impact Lens·Plugin E2E

1. Auto preset 요청과 explicit preset, raw custom을 비교한다.
2. graph normalization, symbol URI/range, diagnostics와 test target 분류를 검증한다.
3. protocol/closure/selector/macro gap을 `IL-LIM-001` evidence matrix에 전달한다.
4. Swift callable와 `//` Source note fixture를 `IL-LIM-011/013`에 연결한다.

종료 조건: SwiftPM 지원 범위가 Plugin에서 raw provider 설정 없이 반복된다.

### 5단계 — Xcode feasibility와 rollout

1. 최소 Xcode project에서 scheme, SDK와 derived data 조건을 기록한다.
2. 자동화 가능한 lane과 수동 evidence를 분리하고 미검증 platform을 명시한다.
3. SwiftPM gate 통과 후 experimental preset을 공개하고 Xcode는 별도 등급으로 유지한다.

종료 조건: SwiftPM과 Xcode 지원 문구가 각 evidence 수준과 일치한다.

## 예상 변경 영역

- `cli/src/providers/`: SourceKit-LSP preset, toolchain discovery와 readiness
- `cli/src/test/fixtures/swift-sourcekit-lsp/`: SwiftPM fixture와 expectations
- optional Xcode integration fixture/checklist 및 CI matrix
- Plugin skill, README/INSTALL과 troubleshooting
- `IL-LIM-001`, `011`, `013` 언어 evidence

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| discovery | Xcode/swift.org/mismatch/복수 toolchain | 결정적 선택 또는 설명 가능한 오류 |
| SwiftPM | direct·cross-file·async·test | required static edge가 안정됨 |
| dynamic | protocol·closure·selector·macro | provider 결과와 미지원 범위가 구분됨 |
| readiness | fresh/recently built workspace | index 상태가 empty graph와 구분됨 |
| Plugin | provider 없는 `.swift` | 검증 환경에서 Auto, 아니면 설치/readiness 안내 |
| 안전 | unresolved package/build 필요 | package resolve/build를 자동 실행하지 않음 |

## rollout과 관측

- SwiftPM experimental preset부터 시작하고 Xcode 지원을 같은 문구로 묶지 않는다.
- toolchain/version, project kind, readiness와 timing만 local debug artifact에 기록한다.
- version drift로 fixture가 실패하면 해당 toolchain 범위를 unverified로 낮추고 raw custom은 유지한다.
- cold latency가 budget을 넘으면 기본 Auto를 blocking 분석 대신 준비 상태와 재시도 UX로 전환한다.

## 미해결 질문

- SourceKit-LSP Call Hierarchy의 지원 toolchain 범위와 cross-module 안정성을 어느 버전부터 gate할지 spike가 필요하다.
- Xcode scheme/configuration 선택을 비대화형 Plugin 요청에서 어떻게 제공할지 결정해야 한다.
- background indexing을 기본 권장할지 사용자 자원 사용과 privacy를 포함해 검토해야 한다.
