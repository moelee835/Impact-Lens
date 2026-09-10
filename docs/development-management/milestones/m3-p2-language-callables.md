# M3 Swift·Kotlin·Java 및 callable 확장

- 상태: **착수됨 — 1단계 진입 조건(층 3 실측) 수행 완료, 결과가 순서를 바꿨다**(2026-09-10,
  `docs/work/task-m3-java-entry-gate.md`와 아래 "2026-09-10 진입 조건 실측 결과"). **Java는 진입
  gate를 통과했고, Kotlin은 오늘 지원할 수 없다** — 미룬 것이 아니라 **막혔고**, 재개 조건을 우리가
  아니라 upstream이 정한다. Swift는 순서만 뒤로 갔고 story의 범위·수용 기준은 하나도 안 바뀌었다.
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

## 2026-09-10 진입 조건 실측 결과 — 이 절이 아래 계획보다 새롭다

`docs/work/task-m3-java-kotlin-spring-planning-refinement.md` §5가 **"층 3(실제 서버 기동)은 M3 1단계의
진입 조건이고 그 lane은 수행하지 않았다"**고 남겨 뒀다. **이 절이 그 수행 결과다.** 아래 "단계별 계획"과
"종료 gate"는 그대로 유효하되, **어느 언어부터 여는가**는 이 실측이 정한다.

### Java(`IL-LIM-018`) — 진입 gate 통과

`IL-LIM-018` 1단계 5번이 **preset 등재 전의 entry gate**로 못박아 둔 질문("`eclipse.jdt.ls#3388`의
수정이 outgoing만 건드렸는데, **incoming도 이 버그를 가졌는가**")에 답이 나왔다: **incoming은 영향받지
않는다.**

- **구버전(`v1.45.0`)과 신버전(`v1.61.0`) 둘 다**, **standalone·Gradle·Maven 셋 다**, method
  reference(static·instance)로만 호출되는 메서드의 incoming call hierarchy가 **정확히 잡힌다.**
- **음성 결과를 믿을 수 있게 만든 것은 대조군이다** — 같은 fixture에서 **outgoing이 구버전에서 실제로
  `[]`를 내며 알려진 버그를 재현**했다. 이것이 없었다면 "incoming이 멀쩡하다"와 "우리 harness가
  둔감해 아무것도 못 잡았다"가 구분되지 않는다.
- **cross-file·cross-module에서도 유지된다**(`app`/`lib` 2모듈 Gradle). **영향도 분석의 존재 이유가
  cross-file이므로 이 확인 전에는 나머지 측정이 의미가 없었다.**
- **응답 모양은 `[]`**(빈 배열)다 — `null`도 에러도 아니다. pyright와 같은 방향, Pyrefly와 반대.
  **이 fixture들에서 관측한 것**이며 모든 경우에 대한 주장이 아니다.
- **story 종료 조건의 "outgoing 수정을 포함하는 최소 릴리스 번호"는 우리 용도와 무관해졌다** — 우리는
  incoming만 쓰고, 구버전에서도 incoming이 멀쩡하므로 하한을 좁힐 이유가 사라졌다. `v1.46.0`은
  일부러 재지 않았다.

**안 잰 것(공백으로 남긴다)**: interface default method·record·test caller 형태, cold/warm을 진짜로
가르는 큰 fixture(아래 참고), Kotlin과 공유하기로 한 discovery/JDK 진단.

**부수 발견 둘** — 둘 다 이 마일스톤 밖의 축이지만 preset 구현 전에 알아야 한다:
1. **lambda 본문 안의 호출은 caller가 사용자 소스에 없는 합성 메서드 이름**(`Fixture$1.accept(String)`)
   으로 나온다. 관계는 실재하므로 버그가 아니지만, **"관계는 맞는데 이름이 사용자의 코드 모델과
   어긋나는"** 형태다 — M4가 Go/`clangd`의 `edges` caller 라벨에서 만난 것과 같은 축이다.
2. **timeout이 "빈 결과 오독"의 자리를 대신 차지할 수 있다.** jdtls는 인덱싱 중 빈 결과를 내지 않고
   **Ready까지 응답을 미룬 뒤 정답을 낸다** — 두 story가 종료 조건으로 걸어 둔 그 위험이 이 provider
   에서는 발생하지 않는다. 대신 **우리 쪽 기본 `timeoutMs`(30000)가 먼저 터질 수 있다.** 실제
   `spring-boot-starter-web` 하나를 넣은 첫 사용(캐시 없음) import가 **약 19초**였고, 타임아웃이
   나면 사용자가 받는 것은 **`Language Server request timed out: textDocument/prepareCallHierarchy`**
   — **raw LSP 메서드 이름을 노출하고 "아직 준비 중"이라는 신호가 없다.** `retryable: true`는 정직하나
   **기계에게만 보이는 정직**이다. **이건 새로 설계할 문제가 아니라 기존 메커니즘을 연결하는 문제다** —
   jdtls는 `language/status` 스트림을 실제로 보내고 있고, `gopls` preset이 이미 쓰는 `readiness`
   프로필이 raw custom provider 경로에는 연결돼 있지 않다(성공 응답에서도 `indexingStatus`가 늘
   `unknown`인 것이 그 증거).

### Kotlin(`IL-LIM-016`) — **오늘 지원할 수 없다. 미룬 것이 아니라 막혔다**

두 배포 채널을 실제로 받아 기동했고, **둘 다 다른 이유로 막혔다.**

- **GitHub Releases 채널**: 문서가 지정한 하한(`v262.4739.0`)과 **현재 공개된 최신 릴리스**
  (`v262.9593.0`) **둘 다 기동 즉시 "This build has expired"로 종료**(exit 7). 최신 릴리스조차
  발행 후 약 6.5주 만에 이미 만료였다. **릴리스 간격보다 만료 윈도우가 짧아 보이므로, "이 버전을
  핀한다"는 기존 방침은 출하 시점부터 이미 고장 난다.**
- **VS Code Marketplace 채널**: **이 채널의 존재 자체가 이번 실측의 발견이다.** 계획 문서가 핀한
  GitHub Releases는 **본류가 아니었다** — Marketplace 빌드는 빌드 라인이 다르고(`263.x` vs `262.x`)
  훨씬 최신이며 **만료되지 않았다.** 그런데 **`prepareCallHierarchy`가 top-level 함수에서 `null`,
  class method에서는 정상 아이템**을 낸다 — 같은 빌드·같은 세션에서. **실제 `gradle build` 성공
  이후에도, 더 긴 대기 후에도 바뀌지 않았다.** `definition`/`references`는 같은 위치에서 정상
  응답하므로 심볼 인식 문제가 아니다. **Kotlin의 관용적 코드가 top-level 함수이므로, 이것이 확정되면
  지원 범위가 잘린다.**
  **다만 이 관측에는 끝내 풀지 못한 불확실성이 하나 있다 — 일반적인 "재확인이 더 필요하다"가 아니라
  구체적인 의심이다**: 이 측정은 손으로 만든 raw LSP client로 했고, **그 client가 실제 VS Code
  익스텐션이 서버에 보내는 project-import 트리거를 재현했는지 확인되지 않았다.** 실제 익스텐션으로
  같은 질문을 하려 했으나 **그 경로에서는 서버 프로세스 자체가 뜨지 않아**(아래 참고) **"진짜
  익스텐션 트리거 아래에서도 top-level이 `null`인가"는 한 번도 직접 검증하지 못했다.** 실제
  `gradle build` 성공과 더 긴 대기가 결과를 바꾸지 않았다는 것이 readiness 가설을 크게 약화시키지만,
  **이 한 조각은 열린 채로 남는다.**
- **실제 VS Code 익스텐션 경로**: 폴더로 열기·JDK 21을 `JAVA_HOME`/`PATH`에 얹기·Gradle wrapper
  생성·정상 창(Extension Development Host 아님)·`.kt` 파일 열기를 **모두 갖춘 조건에서도 서버
  프로세스가 뜨지 않는다.** 익스텐션은 정상 활성화되는데(`workspaceContains:build.gradle.kts`)
  **활성화 이후 아무 것도 하지 않는다** — 에러도 재시도도 없고 출력 채널 로그가 0바이트다. **셋업
  요구가 무엇인지는 밝히지 못했고, 익스텐션 프로토콜 역공학은 이 lane의 목적이 아니라고 판단해
  멈췄다.**

**판정**: 어느 채널로도 **오늘 등재할 근거가 없다.** standalone 채널은 만료 위험과 top-level capability
격차를 **동시에** 갖고, 익스텐션 채널은 재현 가능한 조건으로 기동조차 안 된다.

**story에 반영해야 할 결함 둘**:
1. **버전 하한 문장이 채널을 명시하지 않는다.** 번호만 적혀 있어 **어느 채널의 번호인지조차
   불분명**하고, 실제로 핀한 쪽이 본류가 아니었다.
2. **discovery에 세 번째 형태가 필요하다.** `catalog.ts`의 `bundled`/`verified-external`, 그리고
   `PROVIDER_SELECTED_BY`의 `'vscode'`(= VS Code 내장 provider에 위임) **셋 중 어느 것도**
   "다른 익스텐션이 자기 용도로 설치한 서버 바이너리를 그 익스텐션 디렉터리에서 찾아 쓴다"가 아니다.
   **지금 설계하지 않는다** — 열리는 질문만 남긴다: 그 익스텐션이 없으면 어떻게 안내하는가, 설치를
   유도하는가, **VS Code 밖 CLI 단독 사용 시에는 이 채널이 존재하지 않는데 그때는 무엇을 쓰는가.**

### 순서 결정 — Java 먼저, Swift는 뒤로, Kotlin은 막힘

> **2026-09-10 결정(사용자 지시로 M3 착수, 사용자가 직전에 Spring 호환성을 물음)**: **JVM을 먼저
> 열고 Swift를 뒤로 미룬다.** 실측 후 실제 형태는 **Java 단독 선행**이다 — Kotlin이 위 이유로 막혔기
> 때문이다.

**이 결정과 위 "2026-09-04 추가"의 조건문은 트리거가 다르다. 구분해서 읽어야 한다.**
- 그 조건문은 **사후 대응형**이다: "Swift 때문에 M3가 실제로 길어지면 그때 Java를 뗀다."
- 이 결정은 **사전 선택형**이다: "시작부터 JVM을 먼저 연다." **Swift가 지연시킨 적이 없으므로 그
  조건문은 발동하지 않았다.** 둘을 섞어 읽으면 나중에 "조건이 발동 안 했는데 왜 Java가 먼저 갔나"가
  된다.

**임의 재배치가 아닌 근거**(reviewer 검토):
1. 이 마일스톤 문서가 **이미 JVM(Java+Kotlin)을 readiness를 공유하는 하나의 단위로** 취급한다 —
   새 축을 만드는 것이 아니라 **이미 있는 축을 먼저 쓰는 것**이다.
2. **Spring 경로가 Java/Kotlin에만 있다는 것은 선호가 아니라 기존 의존성 그래프의 사실**이다
   (`IL-LIM-002` 5단계가 `IL-LIM-018`/`IL-LIM-016`에 의존하고 Swift는 이 체인에 없다).
3. **gate 순서를 바꾸는 것과 gate 내용(수용 기준)을 바꾸는 것은 다르다** — Swift story의 범위·기준은
   하나도 건드리지 않는다.
4. **그리고 Kotlin이 외부 요인으로 막혔으므로, Java 선행은 선호가 아니라 사실상 유일하게 진행 가능한
   경로다.**

**Swift 재개 조건 — "나중에"라고 적지 않는다.** `IL-LIM-018`의 **1단계(raw baseline)가 닫히면 Swift
(`IL-LIM-015`)를 병렬로 착수한다.** 판정 가능한 조건이며, 조건 없이 "나중에"만 적으면 6개월 뒤
"Swift는 왜 아직 Backlog인가"에 아무도 답하지 못한다.

**Kotlin 재개 조건은 우리가 정하지 않는다.** 위 세 채널 중 하나라도 **기동 가능하고 top-level 함수를
해결하는 상태**가 되어야 하며, 그 시점은 upstream이 정한다. **"미룬 것"과 "막힌 것"은 재개 조건의
소유자가 다르다.**

**Swift story와 Kotlin story의 상태 필드·수용 기준은 이 결정으로 바뀌지 않는다** — 순서와 현재
관측 사실만 기록한다.

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
