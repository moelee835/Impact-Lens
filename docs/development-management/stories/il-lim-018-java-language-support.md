# IL-LIM-018 Java 언어 지원 (jdtls) 검증

- 상태: Backlog
- 우선순위: P2
- 완료 마일스톤: [M3 — Swift·Kotlin 및 callable 확장](../milestones/m3-p2-language-callables.md)
- 영향도: 중간~높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

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

종료 조건: required static edge와 provider-variable edge가 재현 가능하게 분리된다.

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
