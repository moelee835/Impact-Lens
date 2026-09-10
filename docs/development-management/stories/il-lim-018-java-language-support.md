# IL-LIM-018 Java 언어 지원 (jdtls) 검증

- 상태: Backlog
- 우선순위: P2
- 완료 마일스톤: [M3 — Swift·Kotlin 및 callable 확장](../milestones/m3-p2-language-callables.md)
- 영향도: 중간~높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

> **2026-09-09 정정(`docs/work/task-m3-java-kotlin-spring-planning-refinement.md`)**: 이 문서가
> 다섯 자리("범위"의 "direct/cross-file/interface(default method 포함)/lambda/method
> reference/record/test 관계를 provider baseline으로 기록한다", "수용 기준"의 "direct/cross-file/
> method/test baseline과 interface default method/lambda/method reference edge가 반복
> 기록된다", 1단계 계획의 "interface default method, lambda, method reference, record와 test
> caller를 분류한다", 4단계 계획의 "interface default method/lambda/method reference gap을
> `IL-LIM-001`... 에 전달한다", 테스트 계획 표의 "interface default method·lambda·method
> reference")에서 반복하는 "interface default method/lambda/method reference"라는 한 묶음은
> **서로 다른 위험 셋을 하나로 뭉친 것**이다 — 실제 jdtls 버그(`eclipse-jdtls/eclipse.jdt.ls#3388`,
> 아래 "권장 대응" 참고)가 method reference만 깨뜨리고 **lambda는 원 버그 리포트 자신이 정상
> 동작으로 재현해 뒀다.** interface default method는 이 버그와 아예 무관한 별개의 구문이다.
> 아래 원문은 보존하고, 이 다섯 자리 전부 다음으로 갈라 읽는다: **lambda**(이 특정 버그의 영향을
> 받지 않는다고 실측됨, 다른 위험이 있을 수 있으나 이 lane은 찾지 못했다), **method reference**
> (outgoing 방향은 특정 jdtls 버전 이전에서 깨짐, 실측·버전 하한은 "권장 대응" 참고, incoming
> 방향은 미확인), **interface default method**(이 lane이 조사하지 않은 별개 위험, 세 번째로
> 분리해 둘 뿐 별도 근거는 없음). 실측 근거의 자세한 내용은 위 work document 참고.

## 문제

Java에는 진입점 자체가 없다. `cli/src/providers/resolve.ts`의 `languageId()`에 `.java` case가 아예
없어 `default: return 'plaintext'`로 떨어지고(직접 확인), `PROVIDER_CATALOG`
(`cli/src/providers/catalog.ts`)에도 Java preset이 없다(`bundledTypeScript`/`gopls`/
`bundledPyright`/`clangd` 넷뿐, 직접 확인). C/C++·Go처럼 "verified preset은 없지만 raw custom
provider로는 분석 가능"과도 다르다 — `resolveProvider()`는 인식 못 하는 확장자를 `languageMatch:
'unknown'`으로 처리해 raw custom command 자체는 이론상 막지 않지만(`.h`·`notes.txt`와 같은 경로,
`providers.test.ts`의 "an unrecognised extension asserts nothing about the language" 테스트로 직접
확인), Java를 위한 preset·문서·doctor 안내·Extension 노출이 전혀 없어 이 경로는 사용자가 발견할 수
없는 비공식 우회일 뿐이다. 이 공백이 M4를 이미 막고 있다 — Spring이 M4의 1차 framework adapter
후보였다가 FastAPI로 바뀐 이유가 정확히 이것이다
(`docs/development-management/milestones/m4-semantic-augmentation.md`의 2026-09-03 정정,
`IL-LIM-002`의 5단계 정정 참고).

## 사용자 스토리

Java 개발자로서 검증된 Java LSP와 JDK/build(Gradle 또는 Maven) 조건을 Impact Lens가 진단하고,
일반 메서드 호출과 Spring 같은 DI/컨테이너 런타임 관계의 차이를 설명해 주길 원한다.

## 범위

- Eclipse JDT Language Server(jdtls)의 standalone discovery, version/capability와 project readiness를
  검증한다.
- Gradle/Maven JVM fixture를 대상으로 하고, `IL-LIM-016`(Kotlin)과 JDK/build readiness 진단 기반을
  공유한다 — 각 언어가 독립된 JVM 진단 코드를 새로 만들지 않는다.
- direct/cross-file/interface(default method 포함)/lambda/method reference/record/test 관계를 provider
  baseline으로 기록한다.
- Spring 관계는 일반 Call Hierarchy와 구분해 `IL-LIM-002`(framework story)에 연결하고, 이 story 자체는
  구현하지 않는다.

## 제외 범위

- JDK, jdtls, Gradle/Maven 자동 설치
- Gradle sync, dependency download, annotation processor나 build를 사용자 승인 없이 실행
- Spring/CDI/Guice 등 DI framework 관계를 Java preset 자체에서 확정
- Android(레거시 Java 기반 포함) — Android는 `IL-LIM-016`의 별도 experimental lane으로 이미 다룬다,
  Java story에서 중복하지 않는다.

## 수용 기준

- [ ] pinned JVM fixture에서 provider 없는 `.java` 요청이 검증 jdtls preset을 선택한다.
- [ ] JDK, build system(Gradle/Maven) import, indexing과 capability 상태가 구분된다.
- [ ] direct/cross-file/method/test baseline과 interface default method/lambda/method
  reference/record edge가 반복 기록된다.
- [ ] provider version drift가 지원 등급에 반영된다.
- [ ] Spring(및 다른 DI container) gap을 빈 caller로 오해하지 않도록 limitation과 후속 adapter가
  연결된다(`IL-LIM-016`의 동일 수용 기준과 같은 문제를 Java에서도 닫는다 — M2가 이미 겪은 "빈 결과가
  실제로는 framework gap인데 no-caller로 오독되는" 실패를 언어마다 새로 반복하지 않기 위해서다).

## 검증

- supported platform executable와 JDK version discovery
- dependency가 self-contained한 Gradle/Maven fixture real-process E2E
- Plugin zero-config, cold/warm import와 framework negative fixture

## 의존성 및 위험

- `IL-LIM-003`~`005`와 `IL-LIM-017`에 의존한다(Kotlin과 동일).
- **JVM readiness 진단은 `IL-LIM-016`과 공유한다** — JDK compatibility, build script trust, indexing
  상태 구분은 언어가 아니라 JVM toolchain의 속성이라, 두 story가 서로 다른 진단 코드를 만들면
  구현·gate가 불필요하게 두 배가 된다. 이 story의 2단계(discovery와 JDK compatibility)는 Kotlin story의
  2단계와 같은 코드 경로를 공유하는 것을 기본 가정으로 한다 — 실제로 공유가 불가능하다고 판명되면
  구현 lane에서 분리하고 그 근거를 기록한다.
- Spring은 `IL-LIM-002`, dynamic dispatch는 `IL-LIM-001`, callable/note는 `IL-LIM-011/013`에 연결한다.
- Gradle/Maven project import는 build script와 plugin code를 실행할 수 있으므로 workspace trust가
  필수다(Kotlin과 동일한 위험).

## 현재 기준선

- CLI에 Java languageId, preset, JDK 또는 build readiness 계약이 없다 — `.java`는 `languageId()`에서
  `plaintext`로 떨어진다(위 "문제" 참고, 직접 확인).
- generic adapter는 server→client configuration/progress와 장기 indexing을 충분히 처리하지 않는다
  (Kotlin story와 동일한 기준선).
- Java/Gradle/Maven fixture와 provider version matrix가 없다.
- Spring DI를 일반 Call Hierarchy가 보여줄 수 있다는 잘못된 지원 기대를 분리하는 문서가 없다.

## 조사 결과

- [Eclipse JDT Language Server(eclipse-jdtls/eclipse.jdt.ls)](https://github.com/eclipse-jdtls/eclipse.jdt.ls)는
  공식 기능 목록에 "Call Hierarchy"를 명시한다 — **문서상 주장이며, 이 story는 실제 동작을 검증하지
  않는다**(clangd 사례처럼 문서의 지원 주장과 실제 동작이 다를 수 있다는 것이 이미 이 저장소의 실측
  결과다 — 실제 동작 검증은 구현 lane의 몫으로 남긴다).
- 같은 저장소는 서버 실행에 **JDK 21 이상의 runtime**이 최소로 필요하다고 명시한다 — 이는 분석 대상
  프로젝트가 요구하는 JDK 버전과는 별개의, 서버 자체의 runtime 요구다(Kotlin LSP의 JDK 요구와 유사한
  이중 구조).
- Maven(`pom.xml`)과 Gradle(experimental Android 포함) project import, 그리고 standalone `.java` 파일을
  지원한다고 설명한다.
- Eclipse 공식 milestone/snapshot 빌드와 일부 Linux 패키지 관리자를 통해 jar/binary로 배포되며, IDE
  플러그인 없이 standalone으로 직접 실행 가능하다고 설명한다 — VS Code의 Java Extension Pack을 포함해
  여러 에디터가 이 서버를 내부적으로 재사용한다(사실상 표준 Java LSP로, Kotlin LSP처럼 대안이 여럿
  갈리는 상황이 아니다).
- Kotlin LSP(Alpha, 일부 proprietary component)와 달리 jdtls는 성숙한 오픈소스 프로젝트로 문서상
  소개된다 — 다만 이 차이도 문서 인용이며, 실제 안정성 비교는 구현 lane에서 두 provider를 나란히
  운용하며 확인한다.

## 대안 검토와 결정

1. **jdtls 대신 다른 독립 Java LSP를 채택**: 조사 시점에 jdtls만큼 널리 재사용되는 대안을 찾지 못했다
   — 대부분의 에디터 Java 지원이 jdtls를 내부적으로 감싸는 형태다. 새 대안이 나타나면 재검토한다.
2. **IntelliJ 내부 분석 API 의존**: Kotlin story와 같은 이유(독립 CLI와 배포/라이선스 경계 불명확)로
   기본 전략에서 제외한다.
3. **pinned jdtls preset + strict E2E gate**: 공식 standalone 경로를 사용하면서 JDK/build readiness를
   명시적으로 표시해 권장한다.
4. **Gradle/Maven을 자동 실행해 import 보장**: code execution과 latency 위험으로 explicit trust/승인
   전에는 제외한다(Kotlin story와 동일한 판단).

## 권장 대응

- preset ID를 `java.jdtls`로 두고 검증 version 범위를 좁게 관리한다.

  > **2026-09-09 추가(`docs/work/task-m3-java-kotlin-spring-planning-refinement.md`)**: 이 "좁게
  > 관리한다"의 실제 하한선에 넣어야 할 실측 하나를 여기 남긴다 — jdtls 자신의 실제 버그
  > (`eclipse-jdtls/eclipse.jdt.ls#3388`, 2026-08-05 닫힘, "textDocument/callHierarchy/
  > outgoingCalls not detecting method via method reference")가 upstream 수정
  > (`eclipse-jdt/eclipse.jdt.ui#2035`, 2025-03-06 merge, `CalleeAnalyzerVisitor.java` 하나만
  > 변경)을 반영하기 전 릴리스라면, method reference(`obj::method`)로만 호출되는 메서드의 **outgoing**
  > call hierarchy가 누락된다(직접 확인). **이 수정을 포함하는 jdtls 릴리스 번호는 이 계획
  > lane이 확인하지 않았다** — 버전 하한을 실제 숫자로 확정하려면 그 확인이 먼저 필요하고, 이걸
  > M3 1단계의 구체적 산출물로 명시한다(아래 1단계 계획 참고). **이 버그는 lambda와 무관하다** —
  > 원 이슈가 이미 lambda(정상 동작)와 method reference(깨짐)를 나란히 재현해 뒀다(스크린샷·raw
  > `callHierarchyOutgoingCalls` JSON 응답 둘 다 이슈 본문에 있음). **incoming 방향이 이 버그의
  > 영향을 받는지는 이 lane이 확인하지 않았다** — 수정 PR이 건드린 파일(`CalleeAnalyzerVisitor.java`,
  > outgoing/callee 쪽)과 incoming/caller 쪽 파일(`CallerMethodWrapper.java`/`RealCallers.java`/
  > `MethodReferencesSearchRequestor.java`)이 서로 다르다는 것만 확인됐고, 이건 "이 PR이 incoming을
  > 못 고쳤다"는 것만 증명하지 "incoming이 애초에 이 버그를 가졌는지"는 증명하지 않는다 — 그 답은
  > 이 저장소의 fixture로 직접 실측해야 나온다(아래 1단계 계획, M3 진입 조건에 추가).
- JDK compatibility(서버 runtime용과 project 컴파일용을 구분), `build.gradle(.kts)`/`pom.xml`, project
  import와 indexing 상태를 doctor의 별도 축으로 표시한다.
- build import가 필요한 경우 예상 동작과 위험을 안내하고 Plugin이 임의로 Gradle/Maven을 시작하지 않는다.
- Kotlin story의 discovery/JDK-compatibility 코드를 공유 모듈로 구현해 두 언어가 각자 진단 코드를
  중복 구현하지 않게 한다(위 "의존성 및 위험" 참고).
- framework relation(Spring 등)은 `IL-LIM-002`의 provenance adapter로만 추가하고 provider edge와
  섞지 않는다 — 이 story는 framework adapter를 만들지 않는다.

## 단계별 계획

### 1단계 — JVM fixture와 raw baseline

1. local dependency만 사용하는 Gradle/Maven multi-module fixture를 설계한다.
2. top-level/instance method, interface default method, lambda, method reference, record와 test
   caller를 분류한다.
3. pinned jdtls의 raw capability와 Call Hierarchy를 cold/warm 반복 capture한다.
4. version drift와 비결정 결과를 snapshot 자동 승인 없이 diff artifact로 남긴다.
5. **(2026-09-09 추가)** method reference로만 호출되는 메서드의 **incoming** call hierarchy를
   실제로 조회해 응답을 관찰한다 — `eclipse.jdt.ls#3388`의 수정이 outgoing(callee) 쪽 파일만
   건드렸다는 것은 확인됐지만 incoming(caller) 쪽이 애초에 이 버그를 가졌는지는 확인되지
   않았다(`docs/work/task-m3-java-kotlin-spring-planning-refinement.md`). 이 항목이 이 story를
   검증 preset으로 등재하기 전의 **entry gate**다 — method reference로만 호출되는 메서드가
   "caller 없음"으로 잘못 보고될 위험을 이 실측 없이는 배제할 수 없다.

종료 조건: required static edge와 provider-variable edge가 재현 가능하게 분리된다. jdtls 버전
하한선에 `eclipse.jdt.ls#3388` 수정을 포함하는 최소 릴리스 번호가 실측으로 채워진다(위 "권장
대응" 참고, 이 lane은 그 번호를 확인하지 않았다).

> **2026-09-10 종료 조건 정정 (commander 지시, PR #117의 Swift 재개 트리거가 이 조건을
> 판정 가능해야 하므로 필요).** 위 두 번째 조건("최소 릴리스 번호가 실측으로 채워진다")은
> **`eclipse.jdt.ls#3388`이 outgoing 방향에 있다는 것을 전제로 세워진 조건이었다.** entry gate
> 실측(아래 2026-09-10 블록)이 밝힌 것: Impact Lens는 **incoming만 쓰고**, incoming은
> **구버전(`v1.45.0`, 수정 전)에서도 이미 정확했다** — 즉 이 결함은 애초에 Impact Lens가 쓰는
> 방향에 없었다. **이 조건은 적용되지 않는다** — 원문은 지우지 않되, 더 이상 1단계 종료를
> 막는 조건으로 읽지 않는다.
>
> **이 조건을 대체하는 것**: "method reference로만 호출되는 메서드의 incoming call hierarchy가
> 정확하다는 것이 최소 두 jdtls 버전(수정 전후)·세 프로젝트 형태(standalone/Gradle/Maven)에서
> 실측으로 확인된다." **이건 이미 충족됐다** — 아래 2026-09-10 entry gate 블록과
> `docs/work/task-m3-java-entry-gate.md` 전체가 그 근거다. 첫 번째 조건(required static
> edge와 provider-variable edge 분리)은 여전히 미충족 — 1단계는 **그 조건 하나만 남기고 그
> 조건으로만 판정한다.**

> **2026-09-10 entry gate 실측 완료(`docs/work/task-m3-java-entry-gate.md`)**: 5번 항목이
> **통과**했다 - jdtls v1.45.0/v1.61.0, standalone·최소 Gradle(dependency 없음)·멀티모듈
> (cross-file·cross-module) 전부에서 static·instance method reference로만 호출되는 메서드의
> incoming call hierarchy가 정확했다. `eclipse.jdt.ls#3388`은 outgoing에만 있었고 incoming은
> 영향받지 않았다는 것이 harness 자신의 outgoing 재현(같은 fixture, v1.45.0에서 알려진 버그
> 재현 확인)으로 뒷받침된다. incoming이 구/신 버전 모두 멀쩡해 `eclipse.jdt.ls#3388`의 최소
> 수정 릴리스 번호는 더 좁히지 않았다 - **Impact Lens가 incoming만 쓰는 한 이 번호는 preset
> 등재 판단에 영향을 주지 않는다**는 것이 이번 실측의 결론이다.
>
> **다만 entry gate 통과 과정에서 이번 마일스톤이 계속 다뤄 온 것과 같은 축의 문제를
> 하나 더 찾았다(commander 지적).** lambda 본문 안에서 직접 호출되는 메서드의 incoming
> caller가 사용자가 작성한 이름(`lambdaCaller`)이 아니라 **컴파일러가 만든 합성 메서드**
> (`Fixture$1.accept(String)`)로 나온다 - method reference의 경우 caller가 진짜 enclosing
> 메서드 이름 그대로 나오는 것과 대비된다. 관계 자체는 실재하지만(그 합성 메서드가 실제로
> `lambdaTarget`을 부른다), **caller 이름이 사용자의 소스 모델과 어긋난다** - 이건 M4 gate 1
> lane D가 `gopls`/`clangd`의 `data.edges`에서 찾은 것("관계는 실재하지만 'caller' 라벨이
> 확인된 것보다 더 많이 약속한다")과 근본 축이 같다. 그쪽은 라벨(호출 vs 참조)이 어긋났고
> 여기는 caller의 **이름 자체**가 사용자 코드에 없는 식별자로 나온다는 차이가 있을 뿐, "관계는
> 맞는데 사용자 모델과 표현이 안 맞는다"는 실패 모양은 같다. Java preset을 실제로 구현하는
> lane은 이 문제를 gopls/clangd 건과 같은 방식(문서 각주 또는 caller 이름을 사용자가 읽을 수
> 있는 형태로 다시 매핑)으로 다룰지 판단해야 한다 - 이 실측 lane은 발견만 하고 해결하지 않는다.
>
> **후속 실측(cross-file/multi-module, cold/warm, Maven, 실제 dependency×timeout 상호작용)도
> 전부 entry gate를 통과시켰다** - 자세한 근거는 `docs/work/task-m3-java-entry-gate.md` 참고.
> 다만 **실제 dependency가 있는 프로젝트의 import 시간이 CLI 기본 timeout(30초)을 넘으면,
> jdtls가 "블로킹"으로 답을 미루는 방식이라 그 blocking이 timeout에 먼저 잘린다** - 그 결과가
> `code: "timeout"`, `"Language Server request timed out: textDocument/prepareCallHierarchy"`
> 라는 raw LSP 메서드 이름을 노출하는 일반 오류다. **"아직 project를 import/색인 중이다"라는
> 신호가 없어, 사용자가 "이 도구는 Java에서 안 된다"로 오독할 수 있다** - 이건 이 story와
> `IL-LIM-016`(Kotlin) 둘 다 종료 조건으로 걸어 둔 "indexing 중 빈 결과와 진짜 no-caller를
> 분리한다"는 요구가, jdtls에서는 정확히 이 timeout 구간에서 아직 안 풀려 있다는 뜻이다.
>
> **이건 preset 구현 lane이 새로 설계할 문제가 아니라, 이미 있는 메커니즘을 연결하는
> 문제다(commander 확인).** `gopls` preset이 이미 `work-done-progress` 신호로 `readiness`
> 프로필을 선언해 이 정확한 문제를 풀어 뒀다(위 "현재 기준선"/`catalog.ts`의 gopls 항목
> 참고). jdtls도 같은 종류의 신호(`language/status` 알림 스트림 - `Starting` →
> `Started: Ready` → `ServiceReady`, 실측으로 직접 확인)를 이미 보내고 있다 - 지금은 preset이
> 없어 raw custom provider로만 접근하다 보니 이 신호가 전혀 연결돼 있지 않을 뿐이다. **preset
> 구현 lane은 이 신호를 gopls와 같은 방식으로 `readiness` 프로필에 연결하는 것부터 시작하면
> 된다** - 새 프로토콜이나 새 신호를 찾을 필요가 없다.

## Kotlin(`IL-LIM-016`)과의 상황 차이 (2026-09-10, reviewer 조사 중)

Kotlin은 Java와 상황이 다르다 - `prepareCallHierarchy`가 **top-level 함수에서는 `null`을
반환하고 class method에서는 실제 아이템을 낸다**(reviewer 조사, 진행 중 - index confound를
푸는 중이라 아직 확정 아님). Kotlin의 관용적 코드가 top-level 함수를 많이 쓰기 때문에, 이게
확정되면 Kotlin의 지원 범위가 Java보다 더 좁게 잘릴 수 있다. 이 story(`IL-LIM-018`)의 entry
gate 결과를 Kotlin에 그대로 옮기지 않는다 - 두 언어는 서로 다른 provider(jdtls vs Kotlin
LSP)이고, 이번 실측이 보여준 대로 같은 종류의 질문(method reference/top-level 함수의 incoming
가시성)이 provider마다 다른 답을 낼 수 있다.

### 2단계 — discovery와 JDK compatibility (Kotlin과 공유)

1. standalone binary/jar의 platform path와 version parser를 구현한다 — `IL-LIM-016`의 동일 단계와
   공유 가능한 부분을 먼저 식별한다.
2. provider 자체 runtime(JDK 21+)과 분석 대상 project의 JDK 요구를 구분한다.
3. missing/incompatible/ambiguous JDK에 구체적인 doctor 결과를 제공한다.
4. environment와 absolute JDK path는 기본 출력에서 redaction한다.

종료 조건: provider launch 전 복구 가능한 runtime 문제를 식별한다.

### 3단계 — project import와 readiness

1. Gradle/Maven marker와 module state를 read-only로 조사한다.
2. LSP configuration/progress를 `IL-LIM-005` core로 처리한다.
3. import/indexing 중 empty result를 실제 no-caller와 분리한다.
4. Gradle/Maven sync·build·dependency download는 workspace trust와 명시 승인 없이는 실행하지 않는다.

종료 조건: project not imported, indexing, ready와 query failure가 구분된다.

### 4단계 — Impact Lens·Plugin E2E

1. Auto/explicit/custom provider 요청을 비교하고 selectedBy를 확인한다.
2. provider 원본과 normalized graph, diagnostics와 test classification을 검증한다.
3. interface default method/lambda/method reference gap을 `IL-LIM-001`, Spring gap을 `IL-LIM-002`에
   전달한다.
4. callable kind와 Java `//`/`/* */` note syntax를 `IL-LIM-011/013` fixture에 연결한다.

종료 조건: JVM verified scope에서 raw provider 설정 없이 반복 가능한 Plugin 결과가 나온다.

## 예상 변경 영역

- `cli/src/providers/`: jdtls preset, `.java` languageId 추가, JDK/build discovery와 readiness
- `cli/src/test/fixtures/java-jdtls/`: Gradle/Maven fixture
- external-provider CI와 version drift artifact
- Plugin skill, README/INSTALL과 troubleshooting
- `IL-LIM-001`, `002`, `011`, `013` 언어/framework evidence

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| discovery | binary/JDK missing·mismatch·복수 | launch 전 actionable 상태 반환 |
| JVM E2E | direct·cross-file·interface·record·test | required static edge가 안정됨 |
| dynamic | interface default method·lambda·method reference | provider/variable/runtime gap 구분 |
| framework | Spring marker | 일반 caller 없음과 framework 미지원 구분 |
| Plugin | provider 없는 `.java` | verified scope에서 Auto preset 사용 |
| 안전 | Gradle/Maven import 필요 | trust/승인 없이 build script를 실행하지 않음 |

## rollout과 관측

- JVM scope부터 opt-in으로 제공한다.
- provider/version, JDK compatibility, import/index state와 timing만 local artifact에 기록한다.
- version drift나 crash 증가 시 해당 version을 unverified로 내리고 custom path는 유지한다.

## 미해결 질문

- jdtls의 discovery/JDK-compatibility 코드를 `IL-LIM-016`과 실제로 공유 모듈화할지, 아니면 각자
  구현 후 중복을 나중에 제거할지 구현 lane에서 결정해야 한다.
- Gradle/Maven import의 workspace trust와 사용자 승인을 비대화형 Plugin에서 어떻게 표현할지
  결정해야 한다(Kotlin story와 같은 미해결 질문).
- jdtls의 실제 Call Hierarchy 동작(문서 주장과 별개로)이 인터페이스 default method나 record
  compact constructor 같은 Java 고유 구문에서 어떻게 나타나는지 구현 lane에서 실측해야 한다.
