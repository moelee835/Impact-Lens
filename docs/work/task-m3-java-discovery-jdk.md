# M3 lane I — `IL-LIM-018` 2단계: jdtls discovery와 JDK compatibility (설계안, 미구현)

- 상태: **설계안 — commander 확인 대기, 아직 코드 없음.** commander 지시로 이 lane에 한해
  preset 코드 작성이 허용됐지만, **catalog 등재는 여전히 금지**(story 3·5단계의 몫).
- branch: `feat/m3-java-discovery-jdk`
- 선행: `docs/work/task-m3-java-entry-gate.md`(층 3 entry gate, 이미 merge), story 2단계
  (`il-lim-018-java-language-support.md`), `docs/work/task-m2-clangd-preset.md`(Chocolatey
  JDK-유사 축 전례), `cli/src/providers/{discovery,preset,readiness,resolve}.ts`·
  `cli/src/doctor/{checks,index}.ts`(전부 이번 lane에서 직접 읽음).

## 목적과 사용자 가치

지금 Java를 분석하려면 사용자가 jdtls 실행 명령을 직접 알아내 `provider.command`로 수동
설정해야 한다. 이 lane이 끝나면 **jdtls가 설치돼 있으면 자동으로 찾아서 쓰고, 없거나 못 쓰는
상태면 왜 안 되는지·무엇을 해야 하는지를 구체적으로 말해 준다.** "launch를 시도했다가 timeout
raw 에러로 실패한다"에서 "launch 전에 복구 가능한 문제를 진단한다"로 바뀌는 것이 이 lane의
전부다 — preset 등재, 정확도 판정, 사용자 검증은 다음 단계(3·5단계)의 몫이다.

## 범위

**포함**: standalone jdtls 실행 파일 discovery, JDK 세 축 진단(아래), doctor 결과 코드,
redaction. **제외**: catalog 등재(어떤 tier로도), CI job, Gradle/Maven project import·readiness
자체 연결(story 3단계), preset의 정확도·완성도 주장(story 5단계). Kotlin 공유는 "구체적으로
구현 + 공유 가능 지점 주석 표시"까지 — Kotlin 코드는 건드리지 않는다.

## 기존 아키텍처에서 재사용 가능한 것 — 직접 읽고 확인

- **`discovery.ts`의 `findExecutable`/`probeVersion`/`parseVersion`/`compareVersions`는 이미
  언어 중립적이다.** PATH lookup, shell 없음, timeout·byte ceiling 있는 버전 프로브 — jdtls의
  실행 파일 자체를 찾는 데 코드 변경 없이 그대로 쓸 수 있다. **다만 jdtls는 gopls/clangd와 달리
  단일 바이너리가 아니라 디렉터리 트리 배포**라 "실행 파일 이름"이 뭔지부터 별도 설계가
  필요하다(아래 "standalone discovery" 절).
- **`readiness.ts`의 `ReadinessSignal`이 이미 `notification` kind를 지원한다** - `{ kind:
  'notification', method: string, match?: { path, equals } }`. jdtls의 `language/status`
  알림(`{"type":"ServiceReady"}`, entry gate lane에서 실측 확인됨)은 **새 시그널 종류를 발명할
  필요 없이 이 기존 shape로 그대로 표현된다** - commander가 지적한 "연결하는 문제"가 코드
  레벨에서도 정확히 맞다. **다만 이 lane은 실제로 그 시그널을 catalog에 선언하지 않는다**(catalog
  등재 금지) - 이 문서는 "표현 가능함을 확인했다"까지만 하고, 실제 선언은 story 3단계(또는
  preset 등재가 허용되는 시점)의 몫으로 남긴다.
- **`doctor/checks.ts`의 개별 check 패턴**(`DoctorCheck { id, status, code?, recovery? }`,
  절대 throw 안 함, `executableCheck`의 "basename만 노출" 관행)이 JDK 세 축 check의 그대로 쓸
  틀이다. `compileDatabaseCheck`가 `C_FAMILY_LANGUAGE_IDS` 멤버십으로 조건부 활성화되는 것과
  같은 패턴을, JDK check도 "이 preset이 Java용인가"로 조건부 활성화하면 된다.

## 실제로 발견한 설계 공백 — 추측 아니라 코드로 확인

**`doctor <presetId>`는 catalog에 등록된 preset만 진단할 수 있다.** `runDoctor()`는
`findPreset(catalog, presetId)`가 없으면 즉시 `Unknown provider preset` 에러를 던진다
(`doctor/index.ts:70-78`) - **raw custom command를 진단하는 경로가 없다.** `analyze`는
`resolve.ts`의 `chooseProvider()`에서 "raw custom command wins outright"(`kind: 'raw'`,
preset 없음)를 1순위로 지원하는데, `doctor`에는 그 대응 경로가 없다 - `ProviderCommand`만
받는 `doctor` 모드 자체가 존재하지 않는다.

**이게 이 lane에 실제로 걸린다**: catalog 등재가 금지된 상태에서, jdtls를 진단하려는 사용자는
`impact-lens doctor jdtls` 같은 걸 칠 수 없다(그런 preset id가 없으므로). **이 lane이 만드는
JDK 진단을 실제로 쓸 수 있게 하려면, `doctor`가 raw custom command(`--command`/`--args` 같은
형태, `analyze`가 이미 받는 것과 같은 모양)를 받아 진단하는 경로가 필요하다** - catalog 등재
없이. 이건 새 개념이 아니라 **`analyze`에 이미 있는 raw-command 우선순위를 `doctor`에도
똑같이 여는 것**이다.

**설계 결정(commander 확인 필요)**: `runDoctor()`를 `presetId: string` 대신
`presetId: string | { command: ProviderCommand }` 같은 형태로 받게 확장하거나, `doctor`
CLI 명령 자체에 `--command`/`--args` 옵션을 추가해 raw 모드로 진입하게 한다. raw 모드에서는
`preset` 관련 필드(`tier`, `lastVerified`, `docs.limitations`)가 전부 없으므로 응답 스키마의
`preset` 블록이 optional이 되거나 `tier: 'custom'`(이미 `PROVIDER_TIERS`에 있지만 지금 어디서도
안 쓰이는 값 - grep으로 직접 확인)로 채워지는 최소 형태가 된다. **이 확장 자체가 이 lane의
산출물이다** - JDK check들은 이 raw 모드 위에서 동작한다.

## JDK 세 축 — commander 지적대로 둘이 아니라 셋

story 2단계 2번은 "provider 자체 runtime과 project의 JDK 요구를 구분한다"로 둘만 말하지만,
reviewer가 실측한 Gradle 8.14×JDK 25 실패(JDK 21에서는 동작)가 **세 번째 축, build tool이
요구하는 JDK**를 보여준다. 셋을 구분 안 하면 사용자가 "JDK를 맞췄는데 왜 안 되지"를 반복한다 -
어느 축이 안 맞는지 모르기 때문이다.

| 축 | 무엇을 요구하는가 | 확인 방법(read-only) | 안 맞으면 |
| --- | --- | --- | --- |
| **jdtls 자신의 runtime** | jdtls를 실행하는 JVM 자체가 JDK 21+(entry gate lane에서 확인한 요구사항) | jdtls를 실행할 JVM을 찾아 `java -version` 프로브(gopls의 `probeVersion`과 같은 패턴, 다만 jdtls는 `JAVA_HOME`/`JDTLS_JAVA_HOME`류 환경변수 또는 PATH의 `java`로 별도 결정 - jdtls 자신의 launcher 스크립트가 이미 하는 결정 로직을 read-only로 재현해야 한다, 아래 "확인 필요" 참고) | `code: jdk_runtime_incompatible`, "jdtls는 JDK 21 이상이 필요합니다" |
| **분석 대상 project가 요구하는 JDK** | project의 `sourceCompatibility`/`targetCompatibility`(Gradle) 또는 `maven.compiler.source/target`(Maven)이 명시하는 언어 레벨 | `build.gradle`/`build.gradle.kts`/`pom.xml`을 **read-only로 텍스트 검사**(실행하지 않음 - readiness.ts의 "generate/build/sync 안 함" 원칙과 동일) | `code: jdk_project_requirement_unmet` - 다만 이건 "실행이 안 된다"가 아니라 "결과가 project 의도와 다를 수 있다"는 **경고**에 가깝다(project 요구 JDK 버전이 다르다고 jdtls 실행 자체가 막히는 건 아니다 - 이 구분을 doctor 응답에 명시해야 한다) |
| **build tool(Gradle) 자신이 요구하는 JDK** | Gradle 8.14가 JDK 25에서 실패하고 21에서 동작 - **reviewer가 직접 재현해 원문을 보냈다(2026-09-10, commander 요약이 아니라 원문)**, 아래 상세 참고 | `gradle/wrapper/gradle-wrapper.properties`의 버전 문자열을 read-only로 읽어 알려진 비호환 조합과 정확히 일치할 때만 `fail` | `code: jdk_buildtool_incompatible` - **jdtls 자신의 runtime과는 다른 JVM이 이 축의 주체다**(jdtls가 project를 import할 때 내부적으로 Gradle을 실행하는 JVM은 jdtls 자신의 runtime JVM과 같을 수도 다를 수도 있다 - entry gate lane에서 jdtls가 Maven은 "자기 내장 지원"을 썼다는 관찰이 있었지만 Gradle은 확인 안 함, 이 lane에서 확인 필요) |

### `jdk-buildtool` 축 상세 - reviewer의 실제 재현 (2026-09-10, 원문 직접 수신)

**commander의 최초 요약("Gradle 8.14가 JDK 25에서 내부 오류로 실패")은 부정확했다** - reviewer가
직접 재현해 보낸 원문은 그보다 **더 정확하고 더 좁다.**

- **환경**: Gradle `8.14`(공식 배포), JDK Adoptium Temurin, `gradle build --no-daemon
  --stacktrace`.
- **JDK 25.0.4.1 + Kotlin DSL(`build.gradle.kts`)**: `IllegalArgumentException: 25.0.4.1` -
  스택트레이스가 `org.gradle.kotlin.dsl.*`/`org.jetbrains.kotlin.com.intellij.util.lang.
  JavaVersion.parse` - **프로젝트의 Kotlin 코드가 아니라 Gradle 자신이 빌드 스크립트
  파일(`.kts`)을 해석하는 데 쓰는, Gradle에 번들된 Kotlin DSL 컴파일러**가 JDK 버전 문자열
  `"25.0.4.1"`을 파싱하다 죽는다. **프로젝트 설정 평가 전, 스크립트 컴파일 단계에서 실패.**
- **reviewer가 직접 갈라 확인**: Kotlin 플러그인이 전혀 없는 순수 Java 프로젝트를 `.kts`로
  만들어도 **똑같이 실패**(Kotlin 프로젝트 여부와 무관 - Gradle의 Kotlin DSL **파일 형식** 자체
  문제) - **같은 프로젝트를 Groovy DSL(`build.gradle`, `.kts` 아님)로 바꾸면 다른 에러**로
  실패: `Unsupported class file major version 69`(JDK 25의 class file major version - Gradle
  번들 ASM이 아직 모르는 값). **DSL 형식과 무관하게 Gradle 8.14 + JDK 25 조합 자체가 깨진다 -
  단지 깨지는 메커니즘이 둘(Kotlin DSL 버전 문자열 파싱 vs Groovy DSL class file 버전 인식)이다.**
- **JDK 21.0.12.1 + 같은 프로젝트**: clean 상태에서 재확인, `BUILD SUCCESSFUL in 6s`.
- **reviewer가 명시적으로 가른 "안 본 것"**: JDK 22/23/24 - 21과 25 사이 경계 불명. 더 최신
  Gradle(8.14 이후, 9.x)이 JDK 25를 지원하는지 안 봄. Maven·다른 build tool 안 봄. **"Gradle
  8.14는 JDK 25를 지원 안 한다"까지만 관측 - "Gradle이 JDK 25를 영영 지원 안 한다"나 "이
  버전까지만 된다"는 관측 밖.**

**`jdk-buildtool` check 설계(이제 확정, commander 정정 반영)**: `gradle-wrapper.properties`의
`distributionUrl`에서 Gradle 버전을 read-only로 추출하고, jdk-runtime과 같은 방식(JAVA_HOME →
PATH)으로 실제 쓰일 JVM major 버전을 확인한 뒤, **정확히 "Gradle 8.14 + JDK major 25" 조합일
때만** `fail`한다. 그 외 조합(JDK 22/23/24, Gradle 8.14보다 위 버전, Maven 등)은 **`pass`가
아니라 check 자체를 안 낸다** - `compileDatabaseCheck`가 C-family가 아니면 `undefined`를
반환하는 것과 같은 패턴("모른다"를 "안전하다"로 착각시키지 않는다, 이전 초안의 모순 - "pass"와
"check 생략" 둘 다 적어 뒀던 것 - 정리함).

**이 축은 Kotlin 전용 각주가 아니다(commander 정정) - 세 축 중 가장 넓게 걸리는 축이고, 이미
이 lane 자신의 전제다.** reviewer의 재현이 밝힌 것: 깨지는 지점이 **project의 Kotlin 코드가
아니라 Gradle 자신이 빌드 스크립트를 해석하는 데 쓰는 번들 컴포넌트**이고, Kotlin 플러그인이
전혀 없는 **순수 Java 프로젝트도 똑같이 깨진다**(DSL 형식만 바꿔 가며 직접 확인됨). 이 lane의
fixture는 전부 Gradle 위에 있다 - 사용자가 JDK 25 + Gradle 8.14를 쓰고 있으면 **Java 분석
자체가 성립하지 않는다**, 그리고 그 증상은 다른 timeout류 증상들과 마찬가지로 "Impact Lens가
Java에서 안 된다"로 오독되기 쉽다. **severity를 다른 두 축과 같은 수준으로 두지 않는다** - 이건
"launch가 막힌다"가 아니라 **project import 자체가 실패**하는, 세 축 중 가장 심각한 축이다.

**doctor 메시지 문구는 관측 경계를 넘지 않는다(commander 지시)**: "이 조합은 안 된다"가 아니라
**"이 조합에서 실패가 관측됐다 / 무엇을 확인하라"** 형태로 쓴다 - 예: `"Gradle 8.14 with JDK 25
has been observed to fail during build-script evaluation (two independent causes, both inside
Gradle's own bundled tooling, not the project's code). Try JDK 21, or a newer Gradle if
available."`류. reviewer가 명시한 "안 본 것"(JDK 22-24 경계, 더 최신 Gradle의 지원 여부, Maven)
을 넘어서는 주장을 하지 않는다 - 표를 관측보다 넓히면 오늘 이 저장소가 이미 여러 번 만난 실수와
같은 모양이 된다.

**doctor 응답에서 세 축을 어떻게 구분해 보여줄지(설계)**: `executableCheck`/`versionCheck`
패턴을 따라 **check id를 축마다 분리**한다 - `jdk-runtime`(jdtls 자신), `jdk-project-hint`
(project 요구, `status: warn`만 가능 - 안 막는다), `jdk-buildtool`(위 설계, 확인된 비호환
조합일 때만 `fail`, 그 외엔 check 생략). 세 check가 각자 자기 축만 말하고, 합쳐서 "왜 안
되는지"를 사용자가 스스로 조립할 수 있게 한다 - 하나의 뭉뚱그린 "JDK incompatible" 메시지로
합치지 않는다(오늘 CI flake 문서를 쓰면서 배운 것과 같은 교훈 -
"뭉뚱그리면 행동으로 이어지지 않는다").

## standalone jdtls discovery — 단일 바이너리가 아니다

gopls/clangd는 PATH의 실행 파일 하나(`gopls`, `clangd`)면 끝나지만, **jdtls는 디렉터리
트리**(`bin/jdtls` 래퍼 스크립트 + `plugins/`의 jar들 + `config_*`)로 배포된다(entry gate
lane에서 Eclipse milestone tarball을 직접 풀어 확인한 구조). discovery가 찾아야 하는 건
"jdtls 디렉터리의 `bin/jdtls`"이지 단일 이름이 아니다.

**두 가지 실제 설치 경로(확인 필요, 이 문서 시점에서 미확인)**:
1. Eclipse milestone tarball을 직접 풀어 쓰는 경우(entry gate lane이 실제로 한 것) -
   사용자가 그 경로를 알아야 한다. `findExecutable('jdtls')`가 PATH에서 못 찾는다.
2. **Homebrew 등 패키지 매니저가 `jdtls`라는 이름의 PATH 진입점(래퍼 스크립트)을 따로
   제공하는지** - 확인이 필요하다(이 문서 작성 시점에서 이 세션이 직접 확인하지 않았다,
   추측하지 않는다). 만약 제공한다면 `findExecutable('jdtls')`가 그대로 통한다.

**설계**: `findExecutable('jdtls')`를 1순위로 시도(패키지 매니저 경로가 있다면 그걸로 끝),
실패하면 **`JDTLS_HOME` 같은 명시적 환경변수 하나**(gopls/clangd에는 없는, jdtls 고유의 추가
탐색 경로)를 2순위로 읽어 `$JDTLS_HOME/bin/jdtls`를 확인한다 - `ProviderCommandTemplate`의
기존 `candidates` 배열에 자연스럽게 들어가는 모양(문자열 후보를 여러 개 순서대로 시도하는
기존 패턴 그대로, 새 메커니즘 아님). **이 환경변수 이름과 존재 여부 자체가 확인 필요 항목**
(다음 단계에서 실측).

## timeout 문구 — 이 lane이 얼마나 고칠 수 있는가(솔직한 한계)

지금 문구(`Language Server request timed out: textDocument/prepareCallHierarchy`)가 raw
LSP 메서드 이름을 노출하는 건 **readiness 프로필이 연결 안 돼 있어서**(entry gate lane의
결론) - 그 연결 자체는 story 3단계의 일이라 **이 lane이 직접 고치지 못한다.** 이 lane이
기여할 수 있는 건 **그 timeout이 애초에 발생하는 경로 중 하나(잘못된 JDK 때문에 jdtls가
기동/응답을 못 하는 경우)를 launch 전에 미리 잡아내 timeout 자체가 안 일어나게 만드는 것**
- JDK 진단이 launch보다 먼저 걸리면, "JDK가 안 맞아서 jdtls가 응답을 안 한다"는 이제
timeout이 아니라 `jdk-runtime`/`jdk-buildtool` check의 `fail`로 먼저 나온다. **다만 이건
전체 timeout 문제의 일부만 없앤다** - jdtls가 실제 dependency 해석에 오래 걸려서(entry gate
lane의 Spring Boot 측정, ~19초) timeout이 나는 경우는 JDK와 무관하고, 이 lane이 손댈 수
없다(readiness 연결이 필요한 채로 남는다).

## redaction 설계

`doctor/checks.ts`의 기존 관행(`executableCheck`의 `path.basename(found)`,
`compileDatabaseCheck`의 "절대경로·플래그 내용 절대 안 보여줌" 원칙)을 그대로 따른다 - **새
redaction 메커니즘을 만들지 않는다.**

- JDK 실행 파일의 절대 경로 → `path.basename()`만(`java`/`java.exe`), 어느 JDK 설치 디렉터리인지
  안 보여준다.
- `JAVA_HOME`/`JDTLS_HOME` 등 환경변수의 **존재 여부**(설정됨/안 됨)는 보여주되 **값**은 안
  보여준다 - `executableCheck`가 "찾았는가/못 찾았는가"만 말하고 어디서 찾았는지 경로 전체를
  안 보여주는 것과 같은 수위.
- Gradle/Maven wrapper 파일에서 읽은 버전 문자열(`gradle-wrapper.properties`의 distributionUrl
  등)은 파일 경로가 아니라 **버전 숫자만** 추출해 보여준다 - `compileDatabaseCheck`가 컴파일러
  경로 대신 basename만 보여주는 것과 같은 수위.

## Kotlin과의 경계 (commander 지시)

**Java 경로를 구체적으로 구현**하고, 공유 가능해 보이는 지점(예: `findExecutable` 기반
discovery, JDK-runtime 축의 `java -version` 프로브 패턴, doctor check id 네이밍 관행)은 **코드
주석으로만 표시**(`// 공유 가능 - Kotlin의 동등한 검사도 이 shape를 따를 수 있다`류) - Kotlin이
실제로 열렸을 때 그 세션이 실제 Kotlin LSP의 요구를 보고 추출하게 남긴다. **지금 이 lane에서
제네릭 인터페이스나 추상 클래스를 만들지 않는다** - 검증 못 할 두 번째 소비자를 위한 구조는
작성자가 상상한 모양에만 맞는다는 게 이 저장소가 이미 배운 것(commander 지시 그대로).

## 확인이 필요한 것 (구현 전 실측 계획)

1. ~~jdtls의 JDK-runtime 결정 로직~~ **확인 완료 - `/tmp/jdtls-1.61.0/bin/jdtls.py`를 직접
   읽었다(22-51번째 줄).** 순서: `--java-executable` 플래그(이 CLI는 안 씀) → **`JAVA_HOME`
   환경변수**가 있으면 `$JAVA_HOME/bin/java[.exe]`가 실제 파일이어야 씀 → 없으면 **문자열
   `'java'` 그대로**(subprocess가 PATH에서 resolve). 버전 검증은 `java -version`의 stderr를
   정규식 `(?<=version\s\")(?P<major>\d+)`로 파싱해 **21 미만이면 예외**("jdtls requires at
   least Java 21"). **jdtls 고유의 별도 환경변수(`JDTLS_JAVA_HOME`류)는 없다** - 이 문서 초안의
   추측이 틀렸다, `JAVA_HOME` 하나뿐이다. `jdk-runtime` doctor check는 이 순서를 정확히
   재현(read-only로 - 직접 실행하지 않고 `JAVA_HOME`/PATH를 같은 순서로 확인만)해야 jdtls가
   실제로 쓸 JVM과 다른 JVM을 진단하는 실수를 피한다.
2. Homebrew 등 패키지 매니저의 `jdtls` PATH 진입점 존재 여부 - **여전히 미확인.**
3. ~~Gradle 8.14×JDK 25~~ **확인 완료 - reviewer가 직접 재현한 원문을 받았다(2026-09-10).**
   상세는 위 "`jdk-buildtool` 축 상세" 절.
4. jdtls가 project import 시 내부적으로 쓰는 JVM이 자기 runtime JVM과 같은지 별도인지 -
   여전히 미확인(entry gate lane은 Maven만 "자체 내장 지원"을 관찰했고 Gradle은 확인 안 함).

**추가로 이번에 새로 발견한 것(읽다가 나온 것, 원래 계획에 없던 항목) - 배관 문제가 아니라
정합성 위험이다(commander 정정 반영)**: `-data` 인자를 안 주면 jdtls.py가 **자기 cwd의
basename만 sha1 해시**해서 기본 경로를 계산한다(`jdtls.py:83, 98-99` -
`cachedir/jdtls/jdtls-<sha1(basename(cwd))>`). **경로 전체가 아니라 마지막 디렉터리 이름만
해시하므로, 위치가 다른 두 프로젝트가 같은 폴더 이름(`api`/`backend`/`service`/`server`류 -
흔한 이름이지 예외적인 이름이 아니다, 한 사람이 이런 이름의 프로젝트를 둘 이상 갖는 게 오히려
기본값에 가깝다)을 가지면 같은 `-data` 디렉터리, 즉 같은 인덱스를 공유하게 된다.**

**이 결함이 나타나는 방식이 최악이다**: 에러가 나지 않는다. **다른 프로젝트의 인덱스에서 나온
답을 그대로 caller 목록으로 받는다** - 사용자는 그게 틀렸다는 신호를 어디서도 못 받는다. 이건
이 milestone이 하루 종일 쫓아 온 것과 정확히 같은 모양이다 - **관계는 있어 보이지만 사용자의
소스 모델과 안 맞는 것**이 아니라, 이번엔 **조용히 다른 프로젝트의 답**이라는 한 단계 더
심각한 버전이다. "새 `$ref` 종류가 필요하다"는 요구사항이 아니라, **"이걸 안 하면 서로 다른
프로젝트가 인덱스를 공유해 조용히 틀린 caller를 낼 수 있다"는 정합성 위험**으로 다음 사람에게
전달한다 - 그래야 우선순위가 제대로 잡힌다.

**아직 실측은 아니다(명시)**: 소스를 읽고 추론한 것이지, **실제로 같은 이름의 두 프로젝트를
만들어 오염을 재현한 것은 아니다.** 그 재현은 이 lane의 범위 밖(catalog 등재 금지)이고, preset
구현 lane이 할 일이다.

## 종료 조건 (story 그대로)

provider launch 전에 복구 가능한 runtime 문제를 식별한다 - 세 JDK 축 각각에 대해
missing/incompatible/ambiguous를 구분된 doctor check로 보여주고, 절대 경로·환경변수 값은
기본 출력에서 안 보인다.

## 원문을 직접 요구한 것이 왜 값어치 있었는가 (commander 지적, 기록해 둔다)

commander의 최초 요약("Gradle 8.14가 JDK 25에서 실패")은 **틀리지 않았다.** 그런데 그 요약
위에 이 축을 설계했다면 "Kotlin 프로젝트 호환성"이라는 **잘못된 축**으로 좁혀 잡았을 것이다 -
reviewer의 원문을 받고 나서야 이게 **project의 Kotlin 여부와 무관한, Gradle 자신의 빌드
스크립트 해석 문제**라는 게 드러났고, 그래서 이 lane의 Gradle 기반 fixture 전체를 막는
**가장 넓은 축**이라는 게 밝혀졌다. **"인용은 열어 보기 전까지 근거가 아니다"의 두 번째
이유** - 첫째는 인용이 틀릴 수 있다는 것이고, 둘째는 **원문을 열면 요약에 없던 것이 보인다는
것**이다(commander의 표현 그대로). 이번 경우는 인용이 틀린 게 아니라, 원문을 열어서야 보이는
것이 실제로 있었다.

## `jdk-buildtool`이 Gradle을 절대 안 부른다는 것 - 어느 테스트가 실제 증거인가 (reviewer가
## 더 날카롭게 읽음, commander 지시로 기록)

`cli/src/test/doctor.test.ts`에 이름부터 "never spawns Gradle"로 붙였던 테스트가 있었는데,
**그건 실제로는 약한 증거였다** - reviewer가 잡았다. 그 테스트의 workspace에는
`gradle-wrapper.properties` 자체가 없어서, `jdkBuildToolCheck()`가 spawn 지점에 도달하기도
전에 이미 `undefined`를 반환한다 - "함수가 끝까지 갔는데도 spawn이 없었다"가 아니라 "거기까지
가지도 않았다"를 증명할 뿐이다.

**실제 비공허 증거는 "hit" 테스트다** - 정확한 조합(Gradle `8.14` + JDK major `25`)을
`PATH: ''`(완전히 빈 PATH)에서 돌려 **정상적으로 `jdk_buildtool_incompatible`을 낸다.** 이
경로는 **끝까지 실행되고**, 만약 코드가 어딘가에서 `gradle`을 spawn하려 했다면 빈 PATH 때문에
ENOENT로 죽었을 것이다 - 깨끗한 결과가 나온다는 사실 자체가 spawn이 없었다는 증거다.

**정정**: 이름이 틀렸던 테스트는 `jdk-buildtool is omitted (not thrown or hung) when there is
no gradle-wrapper.properties at all`로 이름을 바꾸고, 주석에 "이게 실제 spawn-free 증거가
아니다"를 명시했다. "hit" 테스트 쪽에는 "이게 진짜 증거다"라는 주석을 새로 달았다. **둘은 같은
것을 증명하지 않는다** - 다음 사람이 약한 쪽을 spawn-free의 근거로 삼지 않도록, 그리고 나중에
그 테스트가 바뀌어도 이 안전 속성이 실제로 깨졌는지 알 수 있도록 코드 자체에 남겨 뒀다.

## 관측: spawn-family 감사(`buildInvocation.sources.test.ts`)의 탐지 방식이 코드·주석의 표현에
## 비용을 물린다 (commander 지시 - 관측만, 개선안 없음)

이 lane을 구현하며 실제로 겪은 것을 기록한다. **감사 자체의 가치를 깎으려는 게 아니다** - 이
저장소의 모든 프로세스 실행 지점을 전수 관리하는 것은 값어치가 있다. **다만 그 탐지 방식(순수
텍스트 스캔, `.exec(`/`.spawn(` 앞 8글자 안에 `/`가 있는지로 정규식 리터럴과 실제 child_process
호출을 가른다)의 비용이 코드와 문서의 표현에서 빠져나가고 있고, 그게 어디에도 적혀 있지 않다.**

**직접 겪은 두 가지**:

1. `jdkChecks.ts`의 텍스트 파싱 정규식을 처음엔 읽기 좋은 이름 붙인 상수(`GRADLE_TOOLCHAIN_
   PATTERN` 등)로 뺐다가, 감사가 **child_process 호출과 무관한데도** "관리 안 된 spawn 지점"으로
   잡았다 - 그 탐지 규칙이 리터럴 `/pattern/.exec(...)` 모양만 인식하고, 이름 붙은 변수를 통한
   같은 호출은 인식하지 못하기 때문이다. 고침: 상수를 포기하고 각 호출 지점에 정규식을 그대로
   인라인했다(`discovery.ts`의 기존 관행과 같은 모양이 됐다는 건 우연이다 - 감사를 통과시키려고
   고친 것이지, 가독성 때문에 고른 모양이 아니다).
2. 그 수정을 설명하려고 쓴 **주석의 산문마저** 감사에 걸렸다 - 주석 안에 예시로 적은
   `child_process`류 호출 표현과 이름 붙인 패턴 변수의 호출 표현이 그 자체로 감사가 찾는 문자열
   모양과 일치했기 때문이다. 감사는 코드와 주석을 구분하지 않는 순수 텍스트 스캔이라, **주석 안의
   예시 문구조차 다시 써야 했다.**

**왜 기록해 둘 값어치가 있는가**: 두 경우 모두 **독자를 위한 선택이 아니라 검사기를 위한
선택**이었다 - 이름 붙인 상수가 리터럴보다 읽기 나빴던 게 아니고, 원래 주석 문구가 불명확했던
것도 아니다. 감사를 통과시키기 위해 둘 다 바꿨다. 다음 사람이 이 파일이나 비슷한 파일에서 "왜
굳이 여기만 정규식을 인라인으로 썼지"·"왜 주석이 이렇게 돌려 말하지"를 마주치면, 그 답은 이
문단이다.

## 이 문서가 아직 답하지 못한 것 (숨기지 않는다)

- "확인이 필요한 것" 남은 두 항목(패키지 매니저 PATH 진입점, jdtls의 Gradle-import용 내부
  JVM이 자기 runtime과 같은지) - commander 확인 후 실측부터 시작한다.
- `jdk-buildtool` check가 "확인된 비호환 조합일 때만 fail, 그 외엔 생략"이라는 설계가
  맞는지 - commander가 방금 확인했으므로(이 절 작성 시점 기준) 이 부분은 사실상 확정으로
  본다.
- `doctor`의 raw-command 확장이 정확히 어떤 CLI 옵션 모양이 될지 - 설계 방향만 적었고
  구체적 옵션 이름·스키마는 commander 확인 후 정한다.
- Gradle/Maven wrapper 버전과 JDK 비호환의 "알려진 조합" 표는 지금 데이터 포인트가
  reviewer의 실측 하나뿐이다 - 이 lane이 직접 재현해 확인할 예정이고, 그 전까지는 표를
  채우지 않는다.
