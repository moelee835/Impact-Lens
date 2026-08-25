# IL-LIM-016 Kotlin LSP 지원 검증

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간~높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

Kotlin CLI/Plugin에는 검증된 provider preset이 없으며 사용자가 standalone Kotlin LSP의 설치, JDK와 Gradle/Maven
project import 조건을 직접 해결해야 한다. 공식 Kotlin LSP가 Call Hierarchy를 제공하지만 Alpha 상태이므로
일반 Kotlin, Android와 Spring/Kotlin을 하나의 안정 지원으로 선언하면 provider drift와 framework gap을 숨긴다.

## 사용자 스토리

Kotlin 개발자로서 검증된 Kotlin LSP와 JDK/project 조건을 Impact Lens가 진단하고, 일반 호출과 Kotlin/Spring
DI 같은 런타임 관계의 차이를 설명해 주길 원한다.

## 범위

- JetBrains Kotlin LSP의 standalone discovery, version/capability와 project readiness를 검증한다.
- Gradle/Maven JVM fixture를 첫 대상으로 하고 Android는 별도 experimental lane으로 둔다.
- direct/cross-file/interface/lambda/coroutine/test 관계를 provider baseline으로 기록한다.
- Spring/Koin/Dagger/Hilt 관계를 일반 Call Hierarchy와 구분해 framework story에 연결한다.

## 제외 범위

- JDK, Kotlin LSP, Gradle/Maven과 Android SDK 자동 설치
- Gradle sync, dependency download, compiler plugin이나 build를 사용자 승인 없이 실행
- Alpha provider의 모든 version을 호환으로 간주
- Spring/Koin/Dagger/Hilt 관계를 Kotlin preset 자체에서 확정

## 수용 기준

- [ ] pinned JVM fixture에서 provider 없는 `.kt` 요청이 검증 Kotlin LSP를 선택한다.
- [ ] JDK, build system import, indexing과 capability 상태가 구분된다.
- [ ] direct/cross-file/method/test baseline과 interface/lambda variable edge가 반복 기록된다.
- [ ] provider Alpha/version drift와 partially closed-source 상태가 지원 등급에 반영된다.
- [ ] Spring/Koin/Dagger/Hilt gap을 빈 caller로 오해하지 않도록 limitation과 후속 adapter가 연결된다.

## 검증

- supported platform executable와 version discovery
- dependency가 self-contained한 Gradle/Maven fixture real-process E2E
- Android project experimental/manual matrix
- Plugin zero-config, cold/warm import와 framework negative fixture

## 의존성 및 위험

- `IL-LIM-003`~`005`와 `IL-LIM-017`에 의존한다.
- Spring/Kotlin은 `IL-LIM-002`, dynamic dispatch는 `IL-LIM-001`, callable/note는 `IL-LIM-011/013`에 연결한다.
- Gradle project import는 build script와 plugin code를 실행할 수 있으므로 workspace trust가 필수다.

## 현재 기준선

- CLI에 Kotlin languageId, preset, JDK 또는 build readiness 계약이 없다.
- generic adapter는 server→client configuration/progress와 장기 indexing을 충분히 처리하지 않는다.
- Kotlin/Gradle/Maven/Android fixture와 provider version matrix가 없다.
- Spring DI를 일반 Call Hierarchy가 보여줄 수 있다는 잘못된 지원 기대를 분리하는 문서가 없다.

## 조사 결과

- [JetBrains Kotlin LSP](https://github.com/Kotlin/kotlin-lsp)는 official Kotlin support, standalone CLI,
  Gradle/Maven, Call Hierarchy를 제공한다고 설명한다.
- 같은 공식 문서는 현재 project 상태를 Alpha로 표시하고 구현 일부가 proprietary component를 포함한다고 밝힌다.
- [Kotlin LSP release 기록](https://github.com/Kotlin/kotlin-lsp/blob/main/RELEASES.md)은 Call Hierarchy와 Android
  project import가 추가·변경되고 있음을 보여주므로 exact version matrix와 drift detection이 필요하다.
- Kotlin의 interface dispatch, lambda/coroutine callback과 reflection은 provider가 반환해도 runtime target
  전체를 보장하지 않으며 Spring/Koin/Dagger/Hilt wiring은 별도 framework semantics다.

## 대안 검토와 결정

1. **Alpha server를 즉시 기본 지원**: 사용자 편의는 빠르지만 안정성 근거가 없어 제외한다.
2. **IntelliJ 내부 분석 API 의존**: 독립 CLI와 배포/라이선스 경계가 불명확해 기본 전략에서 제외한다.
3. **pinned Kotlin LSP experimental preset + strict E2E gate**: 공식 standalone 경로를 사용하면서 위험을 표시해 권장한다.
4. **Gradle을 자동 실행해 import 보장**: code execution과 latency 위험으로 explicit trust/승인 전에는 제외한다.

## 권장 대응

- preset ID를 `kotlin.jetbrains-lsp`로 두고 verified version을 좁게 관리한다.
- JDK compatibility, `build.gradle(.kts)`/`pom.xml`, module import와 indexing을 doctor의 별도 축으로 표시한다.
- build import가 필요한 경우 예상 동작과 위험을 안내하고 Plugin이 임의로 Gradle을 시작하지 않는다.
- JVM Gradle/Maven을 첫 verified scope로 두고 Android/AGP는 experimental subprofile로 분리한다.
- framework relation은 `IL-LIM-002`의 provenance adapter로만 추가하고 provider edge와 섞지 않는다.

## 단계별 계획

### 1단계 — JVM fixture와 raw baseline

1. local dependency만 사용하는 Gradle/Maven multi-module fixture를 설계한다.
2. top-level/function/method/extension function, interface, lambda, coroutine과 test caller를 분류한다.
3. pinned Kotlin LSP의 raw capability와 Call Hierarchy를 cold/warm 반복 capture한다.
4. Alpha drift와 비결정 결과를 snapshot 자동 승인 없이 diff artifact로 남긴다.

종료 조건: required static edge와 provider-variable edge가 재현 가능하게 분리된다.

### 2단계 — discovery와 JDK compatibility

1. standalone binary의 platform path와 version parser를 구현한다.
2. provider 자체 runtime와 symbol resolution/build JDK 요구를 구분한다.
3. missing/incompatible/ambiguous JDK에 구체적인 doctor 결과를 제공한다.
4. environment와 absolute JDK path는 기본 출력에서 redaction한다.

종료 조건: provider launch 전 복구 가능한 runtime 문제를 식별한다.

### 3단계 — project import와 readiness

1. Gradle/Maven marker와 module state를 read-only로 조사한다.
2. LSP configuration/progress를 `IL-LIM-005` core로 처리한다.
3. import/indexing 중 empty result를 실제 no-caller와 분리한다.
4. Gradle sync/build/dependency download는 workspace trust와 명시 승인 없이는 실행하지 않는다.

종료 조건: project not imported, indexing, ready와 query failure가 구분된다.

### 4단계 — Impact Lens·Plugin E2E

1. Auto/explicit/custom provider 요청을 비교하고 selectedBy를 확인한다.
2. provider 원본과 normalized graph, diagnostics와 test classification을 검증한다.
3. interface/lambda/coroutine gap을 `IL-LIM-001`, Spring/Koin/Dagger/Hilt gap을 `IL-LIM-002`에 전달한다.
4. callable kind와 Kotlin `//` note syntax를 `IL-LIM-011/013` fixture에 연결한다.

종료 조건: JVM verified scope에서 raw provider 설정 없이 반복 가능한 Plugin 결과가 나온다.

### 5단계 — Android와 지원 등급

1. minimal Android/AGP fixture의 import 요구, latency와 generated source를 측정한다.
2. CI에 안전하게 고정할 수 없으면 dated manual evidence와 experimental 상태를 유지한다.
3. JVM gate와 Android gate를 분리해 README/INSTALL에 공개한다.

종료 조건: Alpha 상태와 실제 검증 범위를 숨기지 않는 support tier가 정해진다.

## 예상 변경 영역

- `cli/src/providers/`: Kotlin LSP preset, JDK/build discovery와 readiness
- `cli/src/test/fixtures/kotlin-lsp/`: Gradle/Maven/optional Android fixture
- external-provider CI와 version drift artifact
- Plugin skill, README/INSTALL과 troubleshooting
- `IL-LIM-001`, `002`, `011`, `013` 언어/framework evidence

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| discovery | binary/JDK missing·mismatch·복수 | launch 전 actionable 상태 반환 |
| JVM E2E | direct·cross-file·extension·test | required static edge가 안정됨 |
| dynamic | interface·lambda·coroutine | provider/variable/runtime gap 구분 |
| framework | Spring/Koin/Dagger/Hilt marker | 일반 caller 없음과 framework 미지원 구분 |
| Plugin | provider 없는 `.kt` | verified scope에서 Auto preset 사용 |
| 안전 | Gradle import 필요 | trust/승인 없이 build script를 실행하지 않음 |

## rollout과 관측

- Kotlin LSP가 Alpha인 동안 preset은 experimental과 좁은 verified version 범위를 유지한다.
- JVM scope부터 opt-in으로 제공하고 Android를 별도 badge/limitation으로 표시한다.
- provider/version, JDK compatibility, import/index state와 timing만 local artifact에 기록한다.
- version drift나 crash 증가 시 해당 version을 unverified로 내리고 custom path는 유지한다.

## 미해결 질문

- Kotlin LSP release cadence에 맞춰 CI version 범위를 얼마나 자주 갱신할지 정해야 한다.
- Gradle import의 workspace trust와 사용자 승인을 비대화형 Plugin에서 어떻게 표현할지 결정해야 한다.
- partially closed-source provider를 지원할 때 재현성·보안 공지와 fallback 정책을 검토해야 한다.
