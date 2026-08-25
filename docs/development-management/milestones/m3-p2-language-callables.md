# M3 Swift·Kotlin 및 callable 확장

- 상태: Planned
- 완료 소유: IL-LIM-015, IL-LIM-016, IL-LIM-011
- 릴리스 성격: toolchain language experimental/minor release

## 목표

Swift와 Kotlin을 각 toolchain의 준비 상태를 존중하는 verified 또는 명시적 experimental preset으로 제공한다.
동시에 여러 언어에서 실제 `prepareCallHierarchy`가 성공한 callable syntax만 CodeLens/분석 진입점으로 확장한다.

## 포함 범위

- SourceKit-LSP toolchain discovery, SwiftPM 기준 E2E와 Xcode project 경계
- JetBrains Kotlin LSP version pin, JDK/Gradle/Maven readiness와 Alpha 지원 정책
- language/provider별 callable symbol/prepare matrix
- getter/operator/subscript/function object 등 검증된 candidate kind와 bounded probe
- 지원 언어별 source/project readiness와 cold/warm latency 기록

## 진입 조건

- M1의 provider adapter/doctor가 toolchain path와 initialization option을 표현할 수 있다.
- M2에서 language fixture와 지원 등급 승격 절차가 검증된다.

## 산출물

- SourceKit-LSP와 Kotlin LSP preset, version/OS/project matrix
- SwiftPM 및 Kotlin Gradle/Maven self-contained fixture
- `CallableSymbolPolicy`와 provider/version evidence matrix
- 문서 version별 bounded probe/cache와 negative callable fixture
- Swift Xcode/Objective-C runtime, Kotlin Android/Gradle sync의 명시적 한계 안내

## 종료 gate

- [ ] IL-LIM-015, IL-LIM-016, IL-LIM-011의 수용 기준이 통과한다.
- [ ] SwiftPM과 Kotlin JVM fixture가 선언된 toolchain matrix에서 direct/cross-file caller를 재현한다.
- [ ] Kotlin LSP Alpha drift가 version pin·experimental badge·fallback으로 관리된다.
- [ ] Gradle sync, Swift build/package resolve와 Xcode indexing을 자동 실행하지 않는다.
- [ ] 추가 callable kind마다 positive provider 근거와 false-positive negative fixture가 있다.
- [ ] 큰 symbol 문서에서 CodeLens probe budget과 cancellation 기준을 통과한다.
- [ ] 기존 function/method/constructor 및 M2 언어 동작이 유지된다.

## 제외 범위

- Android 전체 project model 공식 지원
- Xcode private index API 또는 Objective-C selector runtime 완전 추론
- 모든 symbol kind에 대한 eager Call Hierarchy probe

## 주요 위험과 대응

- Kotlin LSP가 Alpha라 protocol/behavior가 바뀔 수 있다: verified가 아니라 version-pinned experimental로
  시작하고 회귀 시 preset만 비활성화한다.
- Xcode와 SwiftPM의 준비 모델이 다르다: SwiftPM을 첫 gate로 두고 Xcode는 별도 capability profile로 둔다.
- callable probe가 editor latency를 늘릴 수 있다: profile allowlist, per-document cache와 hard budget을 둔다.

## 다음 마일스톤 연결

M4는 M2/M3의 언어·callable fixture를 semantic augmentation 회귀 matrix로 사용한다. 특정 P2 언어가 지연돼도
M4 spike는 가능하지만, augmentation schema가 지원 언어별로 안전하게 degrade하는지 확인해야 release한다.
