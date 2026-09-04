# M3 Swift·Kotlin·Java 및 callable 확장

- 상태: Planned
- 완료 소유: IL-LIM-015, IL-LIM-016, IL-LIM-018, IL-LIM-011
- 릴리스 성격: toolchain language experimental/minor release

> **2026-09-04 추가(Java 언어 지원 계획)**: 사용자 지시로 Java 언어 지원(`IL-LIM-018`)을 이 마일스톤에
> 추가한다. M3가 맞는 자리라는 근거는 이 저장소가 이미 갖고 있다 — `m4-semantic-augmentation.md`의
> 2026-09-03 정정("Spring adapter를 만들려면 Java/Kotlin 언어 지원이 먼저 필요하고, 그건 M3 이후의
> 일이다"), `IL-LIM-002`의 5단계 정정(같은 문장), M3가 이미 "언어 확장" 마일스톤이라는 것, 그리고
> Kotlin story(`IL-LIM-016`)가 이미 JDK/Gradle/Maven readiness, build 승인 없이 실행 금지, indexing
> 중 빈 결과와 진짜 no-caller 구분이라는 JVM 기반을 세우고 있어 Java가 그 기반을 그대로 공유할 수
> 있다는 것. **이 lane은 계획 문서만 바꾼다 — Java preset은 구현하지 않는다.**
>
> **Swift 때문에 M3가 길어지면 Java를 떼어낼 수 있다는 조건을 여기 남긴다** — 지금 그 결정을 내리지
> 않는다. JVM readiness(Kotlin과 공유)가 이미 준비된 상태에서 Swift만 지연되면 Java를 먼저 닫고 별도
> release로 분리하는 것이 M3 전체를 묶어 두는 것보다 나을 수 있다는 뜻이며, 실제로 그 상황이 오면
> 그때 판단한다.

## 목표

Swift·Kotlin·Java를 각 toolchain의 준비 상태를 존중하는 verified 또는 명시적 experimental preset으로
제공한다. 동시에 여러 언어에서 실제 `prepareCallHierarchy`가 성공한 callable syntax만 CodeLens/분석
진입점으로 확장한다.

## 포함 범위

- SourceKit-LSP toolchain discovery, SwiftPM 기준 E2E와 Xcode project 경계
- JetBrains Kotlin LSP version pin, JDK/Gradle/Maven readiness와 Alpha 지원 정책
- Eclipse JDT Language Server(jdtls) discovery, JDK/Gradle/Maven readiness(Kotlin과 JVM readiness
  진단을 공유)
- language/provider별 callable symbol/prepare matrix
- getter/operator/subscript/function object 등 검증된 candidate kind와 bounded probe
- 지원 언어별 source/project readiness와 cold/warm latency 기록

## 진입 조건

- M1의 provider adapter/doctor가 toolchain path와 initialization option을 표현할 수 있다.
- M2에서 language fixture와 지원 등급 승격 절차가 검증된다.

## 산출물

- SourceKit-LSP, Kotlin LSP와 jdtls preset, version/OS/project matrix
- SwiftPM, Kotlin Gradle/Maven과 Java Gradle/Maven self-contained fixture
- `CallableSymbolPolicy`와 provider/version evidence matrix
- 문서 version별 bounded probe/cache와 negative callable fixture
- Swift Xcode/Objective-C runtime, Kotlin Android/Gradle sync의 명시적 한계 안내
- Java·Kotlin 공통 JVM readiness 진단(JDK compatibility, build import, indexing 상태 구분)

## 단계별 계획

1. **toolchain 기준선**: SourceKit-LSP, Kotlin LSP/jdtls의 JDK와 SwiftPM/Gradle/Maven project matrix를
   고정한다.
2. **preset·callable policy 구현**: toolchain discovery, experimental version policy와 bounded callable
   probe를 구현한다. Kotlin과 Java의 JDK/build readiness 진단은 공유 코드로 시도한다(`IL-LIM-018`
   "의존성 및 위험" 참고).
3. **자동 toolchain E2E**: Swift/Kotlin/Java caller, readiness, latency와 callable positive/negative
   fixture를 독립적으로 통과한다.
4. **사용자 테스트 명세 제안**: release candidate가 준비되면 `user-tests/m3-user-test-spec.md`를 작성한다.
   Swift/Kotlin/Java 실제 사용자가 기존 toolchain project에서 분석을 시작하고, 느린 indexing·Alpha
   경고·project readiness를 이해하며, getter/operator/subscript 등 검증 callable을 찾되 일반 property
   오탐을 발견할 수 있는 과업을 정의한다. 지금은 상세 case나 참여자를 확정·실행하지 않는다.
5. **사용자 검증과 지원 등급 결정**: 별도 승인 후 SwiftPM/Xcode, Kotlin Gradle/Maven과 Java Gradle/Maven
   사용자가 수행하고, toolchain별 결과를 근거로 verified 또는 version-pinned experimental 등급을
   결정한다.

## 종료 gate

- [ ] IL-LIM-015, IL-LIM-016, IL-LIM-018, IL-LIM-011의 수용 기준이 통과한다.
- [ ] SwiftPM, Kotlin과 Java JVM fixture가 선언된 toolchain matrix에서 direct/cross-file caller를
  재현한다.
- [ ] Kotlin LSP Alpha drift가 version pin·experimental badge·fallback으로 관리된다.
- [ ] Gradle/Maven sync, Swift build/package resolve와 Xcode indexing을 자동 실행하지 않는다.
- [ ] 추가 callable kind마다 positive provider 근거와 false-positive negative fixture가 있다.
- [ ] 큰 symbol 문서에서 CodeLens probe budget과 cancellation 기준을 통과한다.
- [ ] 기존 function/method/constructor 및 M2 언어 동작이 유지된다.
- [ ] Java의 Spring(및 Kotlin의 Spring/Koin/Dagger/Hilt) gap이 빈 caller로 오해되지 않는다는 것이
  fixture로 재현된다(`IL-LIM-016`이 이미 갖고 있던 수용 기준을 `IL-LIM-018`도 같은 이유로 갖는다 —
  M2가 겪은 "빈 결과가 framework gap인데 no-caller로 오독되는" 실패를 언어마다 새로 반복하지 않기
  위해서다).
- [ ] `user-tests/m3-user-test-spec.md`가 toolchain별 환경과 callable 오탐 확인을 포함해 검토됐으며, 사용자
  결과 또는 보류 사유가 지원 등급 결정에 기록된다.

## 제외 범위

- Android 전체 project model 공식 지원(Java 레거시 Android 포함 — `IL-LIM-016`의 별도 lane으로 이미
  다룬다)
- Xcode private index API 또는 Objective-C selector runtime 완전 추론
- 모든 symbol kind에 대한 eager Call Hierarchy probe
- Spring/Koin/Dagger/Hilt 등 framework adapter 구현(언어 지원과 framework 계층을 분리 —
  `IL-LIM-002`의 몫)

## 주요 위험과 대응

- Kotlin LSP가 Alpha라 protocol/behavior가 바뀔 수 있다: verified가 아니라 version-pinned experimental로
  시작하고 회귀 시 preset만 비활성화한다.
- Xcode와 SwiftPM의 준비 모델이 다르다: SwiftPM을 첫 gate로 두고 Xcode는 별도 capability profile로 둔다.
- callable probe가 editor latency를 늘릴 수 있다: profile allowlist, per-document cache와 hard budget을 둔다.
- Java의 표준 build 방식이 Gradle과 Maven 둘로 갈려 fixture와 readiness 진단이 사실상 두 배가 될 수
  있다: Kotlin과 JVM readiness 진단을 공유해 중복 구현을 줄이고, 두 build system을 처음부터 동시
  gate로 요구하지 않고 순차로 닫는다.

## 다음 마일스톤 연결

M4는 M2/M3의 언어·callable fixture를 semantic augmentation 회귀 matrix로 사용한다. 특정 P2 언어가 지연돼도
M4 spike는 가능하지만, augmentation schema가 지원 언어별로 안전하게 degrade하는지 확인해야 release한다.

`IL-LIM-018`(Java)이 닫히면 `IL-LIM-002`의 5단계(Spring Java/Kotlin feasibility spike)가 시작 가능
상태가 된다 — `m4-semantic-augmentation.md`와 `IL-LIM-002` 양쪽의 2026-09-03 정정이 "M3 이후"로만
가리키던 조건이 이제 이 story로 구체화된다. Spring adapter 자체는 M3가 아니라 M4(`IL-LIM-002`)의
몫이라는 언어/framework 계층 분리는 그대로 유지한다.
