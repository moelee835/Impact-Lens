# M3 사용자 테스트 명세 — Java(jdtls) callable 및 JVM readiness

- 대상 마일스톤: [M3 — Swift·Kotlin 및 callable 확장](../milestones/m3-p2-language-callables.md) 4단계
- 작성 기준 코드 상태: `main`에 merge된 M3 Java lane(IL-LIM-018 stage 2 `#122`, stage 3 `#123`).
  **발행 버전이 아니라 merge된 코드 기준으로 쓴다** — M1 명세가 발행 버전과 작성 기준을 혼동해 사후
  정정이 필요했던 전례를 반복하지 않는다.
- 상태: **초안 작성 + reviewer 1·2차 적대적 검토 반영 완료, 3차 닫힘 검증 승인, 기술 스모크 검증 반영
  (§0.1). 아직 사람 대상 실행은 하지 않았다.** 실행 전제조건은 아래 §0. 스모크 검증으로 T3~T6의 기술적
  가정이 실측 확인됐고(§0.1), 사람이 그 값을 어떻게 읽는지는 여전히 실제 참여자로만 잰다(§3). 반영한
  검토 지적: callable 오탐 과업(T6) 신설,
  T4 "indexing 중" 제거·두 출처(cross-file/DI)로 통일(jdtls 블로킹 실측 반영), T3 timeout 환경 통제
  (자연/강제 형태), T6 수행 전제(도구 callable 진입점 사전 확인), 참여자 패턴 적합성 fallback,
  §9 폐쇄형 질문 개방형화, build-없는 cross-file 원인 미분리 명시, jdtls 캐시 OS별 처리.
- 작성 규칙: [마일스톤별 사용자 테스트 명세 계획](../milestones/user-validation-planning.md)
- 근거: [IL-LIM-018 Java](../stories/il-lim-018-java-language-support.md),
  [IL-LIM-016 Kotlin](../stories/il-lim-016-kotlin-lsp-support.md),
  [IL-LIM-015 Swift](../stories/il-lim-015-swift-sourcekit-lsp-support.md),
  [IL-LIM-011 callable](../stories/il-lim-011-callable-symbol-coverage.md),
  [IL-LIM-009 완전성 의미론](../stories/il-lim-009-completeness-semantics.md)

이 문서는 명세일 뿐이며, 존재만으로 사용자 검증을 통과한 것으로 표시하지 않는다. 실행은 별도 승인,
참여자 모집과 환경 준비 후에 수행한다.

설치·초기화·runner 우선순위는 M0 이후 바뀌지 않았으므로 [M0 테스트 환경 구성과 초기화
가이드](m0-environment-setup.md)를 그대로 따른다. M3에서만 필요한 준비는 §5에서 그 위에 더한다.

## 0. 실행 전제조건과 현재 상태 — 이 절을 먼저 읽는다

이 명세가 재려는 대상(Java)은 M2의 세 언어와 **상태가 다르다.** 실행에 앞서 이 경계를 분명히 한다.

- **Java는 Auto로 선택되지 않는다.** `java-jdtls` preset은 catalog에 등록돼 있으나 `tier:
  'unsupported'`이며 displayName이 "Eclipse JDT Language Server (jdtls) - unverified"다. 사용자는
  **`providerPreset: 'java-jdtls'`를 명시**해야만 이 경로를 쓴다. 이것은 버그가 아니라 의도된 설계다
  (IL-LIM-018, `task-m3-java-project-import-readiness.md`) — **T1은 이 명시 opt-in을 재는 과업이지,
  Auto 성공을 재는 과업이 아니다.**
- **Kotlin은 오늘 테스트 대상이 아니다.** `prepareCallHierarchy`가 top-level 함수에서 `null`을 내는
  provider 문제와 배포 채널 만료로 막혀 있다(milestone "Kotlin — 오늘 지원할 수 없다"). 재개 조건은
  upstream이 정한다. 이 명세는 Kotlin 과업을 **보류 사유로만** 기록한다(§11).
- **Swift는 순서가 뒤로 갔다.** SourceKit-LSP preset이 아직 구현되지 않았다. 이 명세는 Swift 과업의
  **형태만 예약**하고, 실행은 Swift lane(IL-LIM-015)이 열릴 때 별도로 붙인다(§11).
- **실행에는 toolchain과 fixture가 필요하다.** JDK 21+ (jdtls 서버 runtime), jdtls 배포본, 그리고
  dependency가 self-contained한 Gradle/Maven Java fixture. 이 셋 중 하나라도 없으면 실행은 성립하지
  않는다. **명세 작성·검토는 이 준비 없이도 가능하며, 그것이 이 문서의 현재 단계다.**

## 0.1 기술 스모크 검증 결과 — 명세의 기술적 가정은 실측으로 확인됐다

**이 절은 사람 대상 실행이 아니다.** 아래는 명세가 재려는 과업들의 *기술적 전제*(도구가 실제로 그런
결과를 내는가)를 최소 fixture로 확인한 것이다. 사용자가 그 값을 어떻게 읽는지(T1~T6의 본질)는 여전히
실제 참여자로만 잴 수 있다(§3). 이 검증은 그 과업들이 **없는 현상을 재려 하지 않음**을 보증한다.

- **환경:** openjdk 27 (≥21), jdtls 1.61.0 (Homebrew, PATH의 `jdtls` — preset `candidates: ['jdtls']`가
  그대로 discovery), impact-lens CLI 0.9.1. `providerPreset: "java-jdtls"`를 stdin body로 지정. 2026-09-23 측정.
- **T5 합성 lambda caller — 확인.** lambda 본문에서 호출된 메서드의 caller가 `App$1.accept(String)`
  (합성 익명클래스 `<Type>$1` + functional 메서드)으로 나온다 — 명세가 예시한 `Fixture$1.accept(String)`
  패턴과 형태가 같다. 같은 대상을 **method reference**로 부르면 caller가 **실제 enclosing 메서드 이름**
  그대로 나온다(T5 대비군 성립).
- **T6 callable 오탐 — 확인(가정보다 강함).** jdtls는 **일반 필드(LSP `SymbolKind.Field`)에도 call
  hierarchy를 반환**하고, 그 필드의 모든 읽기/쓰기 지점을 "caller"로 낸다. 즉 "호출처럼 보이지만 별개
  callable이 아닌" 지점을 도구가 진입점으로 제시한다 — T6가 재려던 과잉 제시가 실재한다. 응답에
  `kind`(=Field)가 실려 있어 **host UI 계층은 구분할 수 있으나 분석 자체는 억제하지 않는다.** 이로써
  T6 수행 전제(도구가 accessor/필드를 callable 진입점으로 제시하는지)의 미확정 부분이 해소된다 —
  제시한다.
- **T3 timeout 문구 — 확인 + 정밀화.** timeout 오류 message는 `Language Server request timed out:
  <method>` 템플릿(`cli/src/jsonRpc.ts`)으로 **raw LSP 메서드 이름을 그대로 노출**하고, "아직 준비 중"
  신호가 없다. `retryable: true`와 `details.stage`는 JSON에는 있으나 **사람이 보는 message에는 없다** —
  T3가 지적한 바로 그 공백. **정밀화:** timeoutMs를 지나치게 낮추면(예: 100ms) 오류가
  `prepareCallHierarchy`가 아니라 **`initialize` 단계**에서 걸린다. 명세가 인용한
  `textDocument/prepareCallHierarchy` 문구를 강제 형태로 재현하려면 timeout을 **init 비용보다는 크고
  (cold) call-hierarchy 비용보다는 작게** 맞춰야 한다(§6 T3 강제 형태에 이 조건을 반영).
- **T4 build-없는 cross-file — 확인.** build system 없는 2파일 디렉터리에서 다른 파일의 호출자를 가진
  메서드를 조회하면 caller가 **빈 배열**로 나오는데, 응답은 `complete: true` · `indexingStatus: ready` ·
  `requestStatus: succeeded`다 — **진짜 "호출자 없음"과 구별할 신호가 없다.** IL-LIM-018 Lane J의
  "원인 미분리" 우려가 그대로 재현된다.
- **재현하지 않은 것:** 경량(무의존) fixture라 cold import가 빨라(~5s) **T3 자연 형태(느린 첫 import)는
  이 검증에서 발생하지 않았다.** 자연 형태는 무거운 전이 의존을 가진 실제 프로젝트가 필요하다(§5).
  Kotlin/Swift는 §0·§11대로 대상이 아니다.

## 1. 검증 목적

M3 Java의 종료 gate는 사용자가 **raw provider JSON을 쓰지 않고**(명시 opt-in은 하되) Java 분석을
시작하고, JVM 특유의 준비 모델(JDK 호환·build import·indexing)을 이해하며, jdtls가 내는 결과의 특수한
모양(느린 첫 import, 합성 lambda caller 이름, framework gap)을 과신하지 않는지를 본다. 자동 검사와
실측 lane이 이미 기계 쪽 절반(incoming call hierarchy 정확성, readiness 신호 존재)을 증명했다. **이
테스트는 나머지 절반, 사람이 그 값을 실제로 그렇게 읽는지를 본다.**

1. **명시 opt-in과 unverified tier를 이해한다.** Java가 Auto로 안 잡히는 것을 도구 고장이 아니라
   "아직 검증 안 된 실험적 경로를 일부러 골라 쓰는 것"으로 읽는가. (§6 T1)
2. **JVM 준비 모델을 이해한다.** 서버 runtime JDK(21+)와 분석 대상 project의 JDK가 다를 수 있고,
   Gradle/Maven import가 필요하며 도구가 그것을 사용자 승인 없이 실행하지 않는다는 것을 이해하는가.
   (§6 T2)
3. **느린 첫 import를 "아직 준비 중"으로 읽는가 — 이 문서에서 가장 값진 과업이다.** 실제 dependency가
   있는 project의 cold import가 CLI 기본 timeout(30초)을 넘으면, 사용자는 raw LSP 메서드 이름을 담은
   오류(`"Language Server request timed out: textDocument/prepareCallHierarchy"`)를 받는다. "아직
   import/indexing 중"이라는 신호가 없다. 사용자가 이것을 "Java에선 이 도구가 안 된다"로 오독하는가,
   아니면 재시도/대기로 읽는가. (§6 T3)
4. **빈 결과를 진짜 "호출자 없음"으로 단정하지 않는다.** (a) build 없이 여러 파일로 구성된 project의
   cross-file, (b) Spring/DI로만 연결된 메서드에서 caller가 비어 나올 수 있다. (indexing 중에는 jdtls가
   빈 결과 대신 Ready까지 블로킹하므로, 그 경우는 빈 결과가 아니라 timeout으로 나타난다 — §6 T3.)
   사용자가 빈 결과를 보고 "아무도 안 부른다 → 지워도 된다"로 가는가. (§6 T4)
5. **합성 lambda caller 이름을 관계로 인식하는가.** lambda 본문에서 호출되는 메서드의 caller가 사용자
   소스에 없는 합성 이름(`Fixture$1.accept(String)`)으로 나온다. 사용자가 이것을 "모르는 코드/오류"로
   버리는가, 실재하는 관계로 읽는가. (§6 T5)
6. **callable 오탐을 분별한다.** getter나 record accessor처럼 "호출 지점"으로 보이는 심볼에서, 실제
   호출 관계가 있는 것과 일반 property/field 접근 오탐을 구분하는가. milestone 종료 gate가 요구하는
   "callable 오탐 확인"이 이 과업이다. (§6 T6)

## 2. 이번 테스트로 판단하지 않을 항목

정적 Call Hierarchy의 절대 정확도, 대규모 workspace 성능(M5), Note 사용성(M6), graph 시각 디자인,
성공률·지연 시간의 합격 수치(§10에서 baseline만 잰다)는 판단하지 않는다. M1이 검증한 계층(doctor 복구,
`complete` 의미론)과 M2가 검증한 언어들은 M3에서 바뀌지 않았으므로 다시 판단하지 않는다.

- **Kotlin과 Swift는 판정하지 않는다.** Kotlin은 provider 차원에서 막혀 있고(§0), Swift는 preset이
  없다. 두 언어의 과업은 §11에 보류/예약으로만 둔다. **언어 간 비교도 하지 않는다** — milestone이
  preset별 독립 승격을 요구한다.
- **jdtls 배포판·버전 간 차이는 판단하지 않는다.** 명세는 하나의 pinned 범위만 대상으로 한다.
- **Java preset을 이 테스트로 `verified`까지 올리지 않는다.** Java는 현재 unsupported tier다. 이
  테스트가 통과하면 최대 `experimental`(명시 opt-in) 승격의 근거가 되고, 미달하면 unsupported로 남는다.

## 3. 참여자

- Java 단독. pilot 2명 + 본 라운드 4명.
- 자격: Java로 **Gradle 또는 Maven 프로젝트를 하나 이상 유지**하고, JDK 21+ 를 설치할 수 있을 것.
  합성 프로젝트를 주지 않는다 — 준비 상태(JDK·build·index)가 실제로 어떤지가 이 테스트의 대상이다.
- **과업별 코드 패턴 적합성:** T4-DI(컨테이너 전용 연결), T5(lambda 내부 호출), T6(getter/record
  accessor)는 참여자 프로젝트에 해당 패턴이 있어야 수행된다. 또한 **T4 build-없는 cross-file은
  정의상 참여자 실제 프로젝트로 수행할 수 없다** — §3 자격이 Gradle/Maven 프로젝트를 요구하므로
  참여자 프로젝트에는 항상 build system이 있다. 따라서 이 sub-scenario는 **언제나 별도의 non-build
  디렉터리(진행자 제공 보조 구성)에서** 수행한다. 위 네 경우 모두, 참여자의 실제 프로젝트에 패턴이
  없거나(또는 build-없는 구성이 필요해) 보조 fixture를 쓰면 **해당 sub-scenario만** 보조에서 수행하고,
  합성 보조임을 기록하고 관측을 "실제 코드베이스" 결과와 구분해 집계한다(T1~T3의 환경/readiness 관측은
  반드시 참여자 실제 프로젝트에서 한다). 보조 fixture로 대체한 과업 비율은 §10 모수 해석에 반영한다.
- 제외: 이 저장소에 기여한 적 있는 사람, Impact Lens의 provider 계층을 아는 사람, jdtls 내부 동작을
  아는 사람.
- **참여자에게 "Java는 아직 검증 안 된 실험적 지원"임을 시작 전에 고지한다.** 이 고지 자체가 T1의
  일부다 — 참여자가 그 맥락에서 어떻게 행동하는지가 관측 대상이다.

## 4. 환경 matrix

| 언어 | preset | tier | 사용자 설치 | OS |
| --- | --- | --- | --- | --- |
| Java | `java-jdtls` (명시 opt-in) | unverified/experimental | JDK 21+ 및 jdtls | macOS / Linux / Windows |

- Java × 3 OS를 최소 1회씩 덮는다. **jdtls의 project import·indexing latency가 OS·디스크·JDK 버전에
  민감하므로, T3(timeout 오독)는 3 OS 모두에서 최소 1회 수행한다.**
- Host는 M1과 동일(CLI 직접, Extension, Plugin runner). **T3·T4·T5는 Plugin runner에서 최소 1회
  수행한다** — 에이전트 요약이 timeout·빈 결과·합성 caller 이름의 한계를 옮기는지가 그 조합에서만
  관측된다.

## 5. 시작 상태와 사전조건

M0 가이드에 더해, **참여자 프로젝트의 준비 상태를 사전에 고치지 않는다.** 진행자는 다음을 기록만 한다:

- 설치된 JDK 버전과 `JAVA_HOME`. 서버 runtime용(21+)과 project 컴파일용이 다른지.
- build system: Gradle(`build.gradle(.kts)`) 또는 Maven(`pom.xml`), wrapper 유무.
- 실제 외부 dependency 유무(cold import 시간에 직접 영향 — T3의 시작 조건).
- 이전에 이 프로젝트를 IDE로 연 적이 있어 index 캐시가 있는지(cold vs warm 구분).

**이 값들이 T2·T3의 시작 조건이고, 정리해 버리면 이 테스트가 재려는 것이 사라진다.** cold import를
재려면 index 캐시가 없는 상태가 필요하므로, 이미 warm된 프로젝트는 §6 절차로 **캐시를 비운 사본**에서
T3를 수행한다(원본은 건드리지 않는다).

**cold 상태 만들기(OS별 jdtls `-data` 처리).** jdtls의 workspace 메타데이터는 preset이 지정하는
`-data` 디렉터리에 쌓인다(`java-jdtls` preset은 cwd basename의 SHA1로 키를 만든다 — `catalog.ts`,
`task-m3-java-project-import-readiness.md`). cold를 보장하는 신뢰할 수 있는 방법은 **매 세션 새 `-data`
경로를 쓰거나 해당 `-data` 디렉터리를 통째로 지우는 것**이다. 진행자는 세션에서 사용한 실제 `-data`
경로를 먼저 확인해 기록하고, OS별로 그 경로를 어떻게 비웠는지 남긴다(경로가 OS·jdtls 버전에 따라
다르므로 "캐시를 지웠다"만으로는 재현 불가). 프로젝트 원본 디렉터리는 건드리지 않는다.

## 6. 과업

각 과업은 **자유 서술 단계 → 확인 단계** 순서다. 진행자는 자유 서술 단계에서 어떤 힌트도 주지 않는다.

**T1 — 명시 opt-in으로 첫 분석.** 자기 Java 프로젝트에서 메서드를 하나 고르고 "이 메서드를 바꾸면
무엇이 영향받는가"를 확인한다. Java는 Auto로 안 잡히므로, 도구가 안내하는 대로(문서·doctor·오류 안내)
`java-jdtls`를 명시하고 JDK/jdtls를 준비한다. **관측:** 참여자가 "Java가 왜 자동으로 안 되는가"를
어떻게 해석하는가(고장 vs 미검증 실험 경로), 그리고 명시 opt-in 방법을 도구 출력만으로 찾는가.

**T2 — JVM 준비 모델 이해.** JDK가 없거나 버전이 낮은(21 미만) 상태에서 시작한다. 진행자가 설치 방법을
알려주지 않고 **도구 출력(doctor 포함)만으로** 복구할 수 있는지 본다. 이어서 **Gradle/Maven import가
필요한 상태**에서, 도구가 사용자 승인 없이 build를 실행하지 않는다는 것을 참여자가 확인한다. **관측:**
서버 runtime JDK와 project JDK의 구분을 이해하는가, build를 도구가 자동 실행하지 않는 것을 안전으로
읽는가.

**T3 — 느린 첫 import의 모양.** index 캐시가 없는(cold) 상태에서, 실제 외부 dependency가 있는
프로젝트의 메서드를 조회한다. import가 CLI 기본 timeout을 넘으면 참여자는 raw LSP 메서드 이름을 담은
timeout 오류를 받는다. 참여자에게 **"이 결과를 보고 이 도구와 이 프로젝트에 대해 무엇을 알게
됐습니까?"**를 자유 서술로 답하게 한다 — **"도구가 고장났습니까?" / "다시 시도하겠습니까?"라고 묻지
않는다.** 그렇게 물으면 진행자가 해석 틀을 심는다. **참여자가 묻지 않았는데도 "이 도구는 Java에서
안 된다"에 스스로 도달하는지**, 아니면 "아직 준비 중"으로 읽는지가 관측 대상이다. 자유 서술이 끝난 뒤
실제로 잠시 뒤 재시도하면 결과가 나온다는 것을 보여준다.

**T3 재현 조건 — 환경 의존성을 통제한다(그러지 않으면 세션이 조용히 무효가 된다).** IL-LIM-018이
기록한 cold import ~19초는 **특정 머신 1회 측정**이다. 빠른 디스크·경량 dependency 환경에서는 import가
30초 timeout 안에 끝나 T3가 재려는 현상 자체가 발생하지 않는다. 이를 통제하기 위해 진행자는 T3를
다음 두 형태 중 하나로 **명시적으로** 세팅하고 어느 쪽이었는지 기록한다:
- **(자연 형태)** 참여자 프로젝트가 실제 외부 dependency를 상당량(예: Spring Boot starter 등 전이적
  의존이 큰 것) 포함해 cold import가 기본 timeout을 넘길 것이 예상되는 경우. 그래도 timeout이 나지
  않으면 아래 강제 형태로 전환한다.
- **(강제 형태)** CLI `timeoutMs`를 cold import 실측치보다 낮게(예: 3000ms) 설정해 timeout 경로를
  결정적으로 재현한다. 이때 관측 대상은 "느림 자체"가 아니라 **timeout 오류 문구를 사람이 어떻게
  읽는가**이므로, 낮춘 timeout으로도 관측 목표는 동일하다. **단 timeout을 지나치게 낮추면(스모크
  검증에서 100ms일 때) 오류가 `prepareCallHierarchy`가 아니라 `initialize` 단계에서 걸려 message에
  담기는 raw 메서드 이름이 달라진다(§0.1).** 명세가 재려는 `prepareCallHierarchy` 문구를 재현하려면
  timeoutMs를 **init(서버 기동)이 끝날 만큼은 크고, cold call-hierarchy가 끝나기 전에는 작게** 잡는다.
  진행자는 실제로 재현된 오류의 `details.method`가 무엇이었는지 기록한다.

두 형태 중 어느 쪽으로도 timeout 오류를 재현하지 못한 세션은 **T3 무효**로 기록하고 §10 모수에서
제외한다.

**T4 — 빈 결과의 두 가지 출처.** 정적 Call Hierarchy가 caller를 비워 내는 두 경우를 각각 조회하게
한다.

> **"indexing 중 빈 결과"는 이 과업에서 제외한다(jdtls 실측 반영).** IL-LIM-018 실측상 jdtls는
> **indexing 중 빈 결과를 내지 않고 Ready까지 응답을 블로킹**한다 — Ready가 CLI timeout보다 늦으면
> 사용자가 받는 것은 빈 배열이 아니라 **timeout 오류**다. 즉 "indexing 중"은 빈 결과 경로가 아니라
> **T3의 timeout 경로**다. 여기서는 실제로 빈 배열이 나오는 아래 두 경로만 다룬다.

- **build 없는 cross-file**: build system 없이 여러 `.java` 파일로 구성된 디렉터리에서, 다른 파일에
  실제 호출자가 있는 메서드를 조회한다. IL-LIM-018 stage 3(Lane J) 실측에서 `no_incoming_callers`
  (빈 배열)로 나왔다. **다만 그 실측은 "원인은 분리되지 않았다"고 명시했다** — jdtls 버전·OS·디렉터리
  구조에 따라 재현이 달라질 수 있으므로, 진행자는 세션마다 이 sub-scenario가 **실제로 빈 배열을
  재현했는지 먼저 확인**하고, 재현되지 않으면 그 세션의 이 sub-scenario를 무효로 기록한다.
- **DI 컨테이너 전용 연결**: 런타임 컨테이너로만 연결돼 정적 caller가 없는 메서드를 조회한다. 일반
  Call Hierarchy에는 caller가 비어 나온다.
  - **진행자 절차(§6 금지 단어 우회 방지):** 진행자는 **세션 전에 미리** 참여자 프로젝트에서 이런
    메서드 하나를 식별해 둔다(예: 컨테이너가 주입/스캔으로만 호출하는 handler·service 메서드). 세션
    중에는 그 메서드를 **파일:라인으로만 중립적으로 제시**하고("이 메서드를 조회해 주세요"),
    framework 이름이나 "왜 caller가 없는지"를 **말하지 않는다.** 진행자가 framework를 입에 올리면
    유도이며 그 세션은 무효다(§7).

**T4 진행 절차 — 유도 금지가 이 과업의 핵심이다. M1 §6·M2 §6의 규칙을 그대로 따른다.**

참여자에게 묻는 문장은 **"이 결과를 보고, 이 메서드에 대해 다음에 무엇을 하시겠습니까?"** 하나다.
선택지를 주지 않는다. **진행자가 먼저 꺼내지 않는 단어**: `지워`, `삭제`, `안 쓰인`, `안전`, `완전`,
`한계`, `caveat`, `Spring`, `DI`, `indexing`. **"이 메서드를 지워도 됩니까?" / "이 결과가 안전해
보이나요?" 같은 질문은 답을 심는 질문이므로 금지한다.** M1·M2가 이 패턴을 명시적으로 금지했고, 그
전례를 여기 승계한다.

참여자가 **스스로** 삭제·미사용 판단에 도달하는지, 그때 "이 도구가 못 보는 연결이 있을 수 있다"를
**스스로** 언급하는지가 관측 대상이다.

**T5 — 합성 lambda caller 이름.** lambda 본문 안에서 호출되는 메서드를 조회한다. caller가 사용자
소스에 없는 합성 이름(`Fixture$1.accept(String)` 형태)으로 나온다. 참여자에게 **"이 목록에서 각 항목이
무엇으로 보입니까?"**를 자유 서술로 답하게 한다. **관측:** 합성 이름 항목을 "모르는 코드/오류/무시할
것"으로 버리는가, 실재하는 호출 관계로 읽는가. (method reference caller는 실제 enclosing 메서드 이름
그대로 나오므로, 같은 프로젝트에서 대비군으로 함께 보여준다.)

**T6 — callable 오탐 분별(getter/record accessor).** milestone 종료 gate가 요구하는 "callable 오탐
확인" 과업이다. Java에는 Swift/Kotlin의 operator·subscript 같은 callable kind가 없으므로(그 언어들은
§0·§11로 보류/예약), **Java에서 재는 callable 오탐은 getter/setter와 record accessor다.**

- 참여자에게 **(a) 실제 caller가 있는 getter 또는 record accessor**와 **(b) 필드 직접 접근처럼
  "호출처럼 보이지만 별개 callable이 아닌" 지점**을 각각 조회하게 한다. 도구가 (a)에는 callable 진입점과
  실제 caller를 제시하고, (b)에는 callable 진입점을 **과잉 제시하지 않는지**를 본다.
- 참여자에게 묻는 문장은 **"이 심볼은 무엇으로 보이고, 여기서 무엇을 조회할 수 있다고 생각합니까?"**
  하나다. **"이건 오탐입니까?" / "이게 진짜 호출입니까?"라고 묻지 않는다** — 오탐이라는 틀을 진행자가
  심게 된다.
- **관측:** 참여자가 도구가 callable로 제시한 것과 실제 호출 관계가 있는 것을 **스스로** 구분하는가,
  아니면 도구가 진입점을 보여줬다는 이유만으로 별개 callable로 과신하는가.
- **참여자 프로젝트에 record나 뚜렷한 getter/property가 없으면** §3 fallback(진행자 제공 최소 보조
  fixture)으로 이 과업만 보조 코드에서 수행하고, 보조 fixture 사용 사실을 기록한다.
- **T6 수행 전제(먼저 확인한다):** Java preset은 현재 unsupported tier이다. **스모크 검증(§0.1)에서
  jdtls는 getter뿐 아니라 일반 필드(SymbolKind.Field)에도 call hierarchy를 반환함이 확인됐다** — 즉
  raw jdtls는 accessor/필드를 call hierarchy 대상으로 제시하며, 억제하지 않는다. 다만 그 위 host UI가
  응답의 `kind`를 써서 진입점을 걸러낼 수 있고, IL-LIM-011 정책이 최종적으로 무엇을 진입점으로 보일지는
  세팅에 따라 다를 수 있다. 그러므로 진행자는 T6 전에 **참여자가 실제로 쓰는 host(§4)에서 도구가
  getter/record accessor(그리고 필드)에 callable 진입점을 제시하는지 사전 확인**한다. 제시하지 않으면
  (b) 오탐 sub-scenario는 그 host에서 관측 대상이 없으므로, **"이 host/설정은 이 callable kind에
  진입점을 제시하지 않는다"는 사실 자체를 IL-LIM-011 정책 gap으로 기록**하고 T6를 그 관측으로 마감한다
  — 없는 오탐을 억지로 만들지 않는다.

## 7. 과업별 기대 결과와 중단 조건

- T1에서 참여자가 명시 opt-in 경로를 도구 출력만으로 전혀 찾지 못하면(진행자 직접 안내 필요), 그
  사실을 기록하고 T2 이후를 진행하되 **T1을 승격 판단의 결정적 미달로 본다.**
- **T3·T4·T5의 자유 서술 단계에서 진행자가 힌트를 주면 그 세션은 무효**다. 무효 세션 비율은 §10의
  판정 항목이다.
- 참여자 프로젝트를 도구가 **자동으로 Gradle/Maven build·dependency download·수정**하면 **즉시
  중단하고 결함으로 보고**한다(milestone 종료 gate: "Gradle/Maven sync를 자동 실행하지 않는다").

## 8. 관측 지표

- T1: 명시 opt-in까지의 시도 수, 참여자가 "미검증 실험 경로"로 인식했는지(자유 서술 사후 판정).
- T2: JDK 복구까지 시도 수, 서버/프로젝트 JDK 구분 이해 여부, build 자동실행 없음을 안전으로 읽었는지.
- T3: **참여자가 자유 서술에서 "이 도구는 Java에서 안 된다"고 단정한 비율**(timeout을 준비중으로 읽지
  못한 비율). raw LSP 메서드 이름 노출을 언급한 비율. **자연 형태/강제 형태(timeoutMs 단축)를 구분해
  집계**한다 — 강제 형태는 "느림" 맥락이 약해 인지 맥락이 다를 수 있다.
- T4: **빈 결과를 보고 "지워도 된다/안 쓰인다"에 도달한 참여자 중, 못 보는 연결 가능성을 스스로
  언급하지 않은 비율.** 두 출처(build-없는 cross-file/DI)별로 따로 집계.
- T5: 합성 caller 항목을 "무시할 것/오류"로 버린 비율.
- T6: 도구가 callable로 제시한 것을 실제 호출 관계와 **구분하지 못하고** 과신한 비율. 보조 fixture로
  대체 수행한 세션 수.
- 전 과업: 자동 build·install·수정이 일어난 횟수(**0이어야 하는 안전 불변식**). 진행자 유도로 무효
  처리된 세션과 T3/T4 재현 실패로 무효 처리된 세션 수.
- Plugin runner 조합: **에이전트 요약 원문을 매번 기록**(§12).

## 9. 사후 질문

**이 절의 질문은 해당 과업의 자유 서술이 완전히 끝난 뒤에만 쓴다.** §6이 금지한 단어를 여기서는 쓰는데,
그때는 이미 관측할 발화가 기록된 뒤이므로 유도가 성립하지 않는다.

- (T1) "Java가 자동으로 잡히지 않고 직접 지정해야 했습니다. 왜 그렇게 돼 있다고 생각했습니까?"
- (T3) "그 메시지를 읽고 무슨 뜻으로 이해했습니까? 그다음 무엇을 하려고 했습니까?" *(개방형 —
  "다시 시도" 같은 특정 행동을 진행자가 먼저 이름 붙이지 않는다.)*
- (T4) "이 결과에 대해 어떻게 생각했습니까? 이 목록이 이 메서드에 대해 무엇을 말해준다고 봅니까?"
  *(개방형 — "완전한가"로도 "못 보는 호출이 있다면"으로도 묻지 않는다. 후자는 hidden call의 존재를
  전제하는 유도이므로, §6 금지 단어 "완전"과 함께 사후 질문에서도 진행자가 먼저 꺼내지 않는다.)*
- (T5) "그 목록에서 낯선 이름의 항목은 무엇이라고 생각했습니까?"
- (T6) "그 심볼을 조회했을 때 나온 것을 어떻게 이해했습니까?" *(개방형 — "오탐"·"진짜 호출" 프레임을
  진행자가 먼저 꺼내지 않는다.)*

## 10. 통과·보류 기준

수치 기준은 지금 추측하지 않는다. pilot 2명의 결과로 baseline을 만든 뒤 본 라운드 기준을 확정한다 —
M0·M1·M2와 같은 규칙이다.

**정성 통과 기준** (본 라운드 확정 전에도 적용):

- T1에서 과반이 진행자의 직접 안내 없이 명시 opt-in 경로를 찾고, 그 맥락(미검증 실험 지원)을 이해한다.
- **T3에서 timeout 오류를 "도구가 Java에서 안 된다"로 단정한 참여자 전원이 "아직 준비 중"이라는 해석에
  전혀 도달하지 못하면(0명 도달), 그 자체로 Java preset의 experimental 승격을 보류한다.** baseline
  없이도 지금 바로 적용되는 T3 기준이다 — 이 경우 코드가 아니라 **timeout 오류 문구**(raw LSP 메서드
  이름 노출, readiness 신호 부재)를 먼저 고친다.
- **T4에서 빈 결과를 보고 지워도 된다고 답한 참여자 전원이 못 보는 연결 가능성을 스스로 언급하지
  않으면(0명 언급) 승격을 보류한다.** 두 출처(build-없는 cross-file/DI)별로 독립 적용한다.
- **T5에서 합성 caller 항목을 전원이 오류/무시로 버리면 승격을 보류한다** — caller 이름을 사용자가
  읽을 수 있는 형태로 다시 매핑하는 것을 우선 과제로 본다(milestone/story가 지목한 M4 gate1 lane D와
  같은 축).
- **T6에서 도구가 callable로 제시한 것을 실제 호출 관계와 구분하지 못하고 전원이 과신하면(0명 구분)
  승격을 보류한다** — callable 진입점 제시 기준(어떤 심볼에 진입점을 보일지)과 그 표현을 우선 과제로
  본다. milestone 종료 gate의 "callable 오탐 확인"이 이 기준으로 판정된다.
- 어떤 과업에서도 도구가 참여자 프로젝트를 자동으로 build·install·수정하지 않는다.
- 진행자 유도로 무효 처리된 세션 비율이 0이다.

**승격 등급**: 통과하면 `experimental`(명시 opt-in, unverified badge 유지), T1은 통과하나 T3/T4/T5가
미달하면 `unsupported` 유지, T1이 실패하면 `unsupported` 유지. **Java 단독으로 기록하고 Kotlin/Swift와
평균 내지 않는다.** verified 승격은 이 테스트 범위 밖이다(§2).

## 11. Kotlin·Swift 보류/예약 기록

- **Kotlin(IL-LIM-016) — 보류.** provider(`prepareCallHierarchy`가 top-level 함수에서 `null`) 문제와
  배포 채널 만료로 오늘 테스트할 수 없다. 재개 조건은 upstream이 정한다. 위 T1~T5 형태를 Kotlin에
  그대로 옮기지 않는다 — Kotlin은 top-level 함수 가시성이라는 별도 위험이 먼저다. 재개 시 별도 절로
  추가한다.
- **Swift(IL-LIM-015) — 예약.** SourceKit-LSP preset 구현 후 SwiftPM 기준으로 T1(Auto/preset 시작)·
  readiness·callable(getter/subscript/operator) 오탐 과업을 붙인다. Swift lane이 열릴 때 이 절을
  실제 과업으로 승격한다.

## 12. 증거 형식

- 과업별 화면 기록 또는 터미널 로그(동의 범위 내).
- **Plugin runner 조합에서는 에이전트 요약 원문 전체.** 특히 timeout(T3)·빈 결과(T4)·합성 caller(T5)를
  요약이 어떻게 옮기는지가 핵심이다.
- 응답 JSON의 `limitationDetails`·readiness/indexing 상태 필드 전문, timeout 오류의 `code`와 message
  원문. 참여자가 무엇을 봤는지 사후 재구성에 필요하다.
- **JDK/build 경로 유출 주의**(§13 privacy).

## 13. Privacy와 동의

- 참여자 동의 없이는 어떤 기록도 수집하지 않는다. 동의 범위를 과업 시작 전에 문서로 확인한다.
- **참여자는 자기 실제 Java 코드베이스를 쓴다.** 화면 기록·출력 수집 전에 사내 코드 공개 가능 여부를
  확인하고, 불가하면 메서드명·경로를 가린 요약만 수집한다.
- doctor 출력과 오류에 `JAVA_HOME`·jdtls 설치 경로·Gradle/Maven 로컬 경로가 들어갈 수 있다. **수집 시
  이 값이 redaction되는지 진행자가 확인한다**(도구는 이미 redaction하지만, 수집 절차도 같은 가정을
  하지 않는다 — milestone 2단계 종료 조건이 "absolute JDK path를 기본 출력에서 redaction"을 요구).

## 14. 실패 처리와 재시험

- 도구 결함(자동 build 실행, 잘못된 preset 선택 등)이 확인되면 수정 후 재시험한다.
- 절차 결함(유도, 준비 상태 오염, cold/warm 혼동)이 확인되면 §6을 고치고 해당 세션을 폐기한다.
- **T3/T4/T5 미달은 코드보다 문구를 먼저 의심한다** — timeout 오류의 message/readiness 신호,
  `no_incoming_callers`의 문구, 합성 caller 이름 표현, Plugin 응답 정책이 실제 사람에게 통하는지가 이
  과업들이 재는 것이다.

## 15. 검토 체크리스트

- [ ] §0의 세 경계(Java 명시 opt-in/unverified, Kotlin 보류, Swift 예약)가 과업 설계에 정확히
  반영됐는가.
- [ ] T1이 "Auto 성공"이 아니라 "명시 opt-in과 미검증 tier 이해"를 재는가.
- [ ] T3가 raw LSP timeout 노출을 "도구가 못 함 vs 아직 준비 중"의 해석 갈림으로 정확히 재는가, 그리고
  "도구가 고장났습니까/다시 시도하겠습니까" 형태의 유도가 없는가.
- [ ] T3의 timeout 재현이 환경 의존적임을 통제하는가(자연/강제 형태 명시, timeout 미재현 세션 무효
  처리).
- [ ] T4가 **빈 배열을 실제로 내는 두 경로**(build-없는 cross-file, DI 컨테이너 전용)만 다루고,
  "indexing 중"은 jdtls 블로킹→T3 timeout이므로 제외했는가. build-없는 cross-file의 원인 미분리·재현
  불확실성을 세션마다 확인하는가. DI sub-scenario를 진행자가 금지 단어 없이 중립(파일:라인) 제시하는
  절차가 있는가. "호출자가 있습니까"로 묻지 않고 개방형으로 묻는가.
- [ ] T5의 합성 caller 예시(`Fixture$1.accept(String)` 형태)가 실측 결과와 일치하고, method reference
  대비군을 함께 제시하는가.
- [ ] T6(callable 오탐)가 존재하고, Java에서 getter/record accessor로 재며(operator/subscript는 Swift/
  Kotlin이라 보류), "오탐입니까/진짜 호출입니까" 형태의 유도 없이 개방형으로 묻는가. 참여자 프로젝트에
  패턴이 없을 때 보조 fixture fallback과 그 집계 분리가 있는가. **T6 전에 도구가 getter/record accessor에
  callable 진입점을 제시하는지 사전 확인하는 절차가 있는가**(제시 안 하면 IL-LIM-011 정책 gap으로 기록).
- [ ] **내부 일관성:** §1 목적·§8 지표·§10 기준·§15가 모두 T4를 "두 출처(build-없는 cross-file/DI)"로
  일치시키고, "indexing 중 빈 결과"를 어디에도 남기지 않았는가(indexing은 T3 timeout으로만 기술).
- [ ] §6의 금지 단어 목록이 §8·§9 문구와 충돌하지 않는가(사후 질문은 자유 서술 뒤에만).
- [ ] 참여자 프로젝트의 준비 상태(JDK/build/index cache)를 진행자가 고치지 않는가.
- [ ] Privacy 항목이 실제 코드베이스 사용과 JDK/build 경로 유출을 둘 다 다루는가.
- [ ] 승격 등급이 Java 단독으로 기록되고, verified가 이 테스트 범위 밖임이 명시됐는가.
- [ ] milestone 종료 gate 문장("toolchain별 환경과 callable 오탐 확인 포함")과 IL-LIM-018 수용 기준을
  실제로 가리키는가.
