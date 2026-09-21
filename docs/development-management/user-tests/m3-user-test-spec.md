# M3 사용자 테스트 명세 — Java(jdtls) callable 및 JVM readiness

- 대상 마일스톤: [M3 — Swift·Kotlin 및 callable 확장](../milestones/m3-p2-language-callables.md) 4단계
- 작성 기준 코드 상태: `main`에 merge된 M3 Java lane(IL-LIM-018 stage 2 `#122`, stage 3 `#123`).
  **발행 버전이 아니라 merge된 코드 기준으로 쓴다** — M1 명세가 발행 버전과 작성 기준을 혼동해 사후
  정정이 필요했던 전례를 반복하지 않는다.
- 상태: **작성 중, 검토 대기. 아직 실행하지 않았다. 실행 전제조건이 아직 갖춰지지 않았다(아래 §0).**
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
4. **빈 결과를 진짜 "호출자 없음"으로 단정하지 않는다.** (a) indexing 중이거나 (b) build 없이 여러
   파일로 구성된 project의 cross-file, (c) Spring/DI로만 연결된 메서드에서 caller가 비어 나올 수 있다.
   사용자가 빈 결과를 보고 "아무도 안 부른다 → 지워도 된다"로 가는가. (§6 T4)
5. **합성 lambda caller 이름을 관계로 인식하는가.** lambda 본문에서 호출되는 메서드의 caller가 사용자
   소스에 없는 합성 이름(`Fixture$1.accept(String)`)으로 나온다. 사용자가 이것을 "모르는 코드/오류"로
   버리는가, 실재하는 관계로 읽는가. (§6 T5)

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

**T4 — 빈 결과의 세 가지 출처.** 정적 Call Hierarchy가 caller를 비워 내는 세 경우를 각각 조회하게
한다.
- **indexing 중**: import 직후(아직 ready 아님) 조회. (T3와 연결되나 여기선 "빈 결과"에 초점)
- **build 없는 cross-file**: build system 없이 여러 `.java` 파일로 구성된 디렉터리에서, 다른 파일에
  실제 호출자가 있는 메서드를 조회한다. 실측상 `no_incoming_callers`(빈 배열)로 나온다.
- **Spring/DI**: Spring 등 DI 컨테이너로만 연결되는 메서드(`@Autowired`, component scan 등)를 조회한다.
  일반 Call Hierarchy에는 caller가 없다.

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
  못한 비율). raw LSP 메서드 이름 노출을 언급한 비율.
- T4: **빈 결과를 보고 "지워도 된다/안 쓰인다"에 도달한 참여자 중, 못 보는 연결 가능성을 스스로
  언급하지 않은 비율.** 세 출처(indexing/cross-file/DI)별로 따로 집계.
- T5: 합성 caller 항목을 "무시할 것/오류"로 버린 비율.
- 전 과업: 자동 build·install·수정이 일어난 횟수(**0이어야 하는 안전 불변식**).
- Plugin runner 조합: **에이전트 요약 원문을 매번 기록**(§12).

## 9. 사후 질문

**이 절의 질문은 해당 과업의 자유 서술이 완전히 끝난 뒤에만 쓴다.** §6이 금지한 단어를 여기서는 쓰는데,
그때는 이미 관측할 발화가 기록된 뒤이므로 유도가 성립하지 않는다.

- (T1) "Java가 자동으로 잡히지 않고 직접 지정해야 했습니다. 왜 그렇게 돼 있다고 생각했습니까?"
- (T3) "그 timeout 메시지를 읽고 무슨 뜻으로 이해했습니까? 다시 시도할 생각이 들었습니까?"
- (T4) "이 결과가 완전하다고 생각했습니까? 이 도구가 못 보는 호출이 있다면 어떤 것일 것 같습니까?"
- (T5) "그 목록에서 낯선 이름의 항목은 무엇이라고 생각했습니까?"

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
  않으면(0명 언급) 승격을 보류한다.** 세 출처별로 독립 적용한다.
- **T5에서 합성 caller 항목을 전원이 오류/무시로 버리면 승격을 보류한다** — caller 이름을 사용자가
  읽을 수 있는 형태로 다시 매핑하는 것을 우선 과제로 본다(milestone/story가 지목한 M4 gate1 lane D와
  같은 축).
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
- [ ] T4의 세 출처(indexing/cross-file/DI)가 실제로 빈 결과를 내는 서로 다른 경로이며, "호출자가
  있습니까"로 묻지 않고 개방형으로 묻는가.
- [ ] T5의 합성 caller 예시(`Fixture$1.accept(String)` 형태)가 실측 결과와 일치하고, method reference
  대비군을 함께 제시하는가.
- [ ] §6의 금지 단어 목록이 §8·§9 문구와 충돌하지 않는가(사후 질문은 자유 서술 뒤에만).
- [ ] 참여자 프로젝트의 준비 상태(JDK/build/index cache)를 진행자가 고치지 않는가.
- [ ] Privacy 항목이 실제 코드베이스 사용과 JDK/build 경로 유출을 둘 다 다루는가.
- [ ] 승격 등급이 Java 단독으로 기록되고, verified가 이 테스트 범위 밖임이 명시됐는가.
- [ ] milestone 종료 gate 문장("toolchain별 환경과 callable 오탐 확인 포함")과 IL-LIM-018 수용 기준을
  실제로 가리키는가.
