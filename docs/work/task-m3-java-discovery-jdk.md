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
| **build tool(Gradle/Maven) 자신이 요구하는 JDK** | Gradle 8.14가 JDK 25에서 실패하고 21에서 동작한다는 reviewer 실측 - Gradle/Maven 버전과 그 도구를 실행할 JVM 사이의 호환성 | Gradle: `gradle/wrapper/gradle-wrapper.properties`의 버전 문자열을 read-only로 읽어 알려진 비호환 조합과 대조(**"알려진 조합"의 출처는 이 lane이 직접 실측한 것만 - 추측으로 표를 채우지 않는다**, reviewer의 이번 실측 하나가 유일한 데이터 포인트다). Maven: 비슷한 위치(`.mvn/wrapper/maven-wrapper.properties`) | `code: jdk_buildtool_incompatible` - **jdtls 자신의 runtime과는 다른 JVM이 이 축의 주체다**(jdtls가 project를 import할 때 내부적으로 Gradle/Maven을 실행하는 JVM은 jdtls 자신의 runtime JVM과 같을 수도 다를 수도 있다 - entry gate lane에서 jdtls가 "자기 내장 Maven 지원"을 썼다는 관찰이 있었지만 Gradle은 확인 안 함, 이 lane에서 확인 필요) |

**doctor 응답에서 세 축을 어떻게 구분해 보여줄지(설계)**: `executableCheck`/`versionCheck`
패턴을 따라 **check id를 축마다 분리**한다 - `jdk-runtime`(jdtls 자신), `jdk-project-hint`
(project 요구, `status: warn`만 가능 - 안 막는다), `jdk-buildtool`(Gradle/Maven 요구, 알려진
비호환 조합이 있을 때만 `fail`, 모르면 아예 check를 안 낸다 - `compileDatabaseCheck`가
C-family가 아니면 `undefined`를 반환하는 것과 같은 패턴). 세 check가 각자 자기 축만 말하고,
합쳐서 "왜 안 되는지"를 사용자가 스스로 조립할 수 있게 한다 - 하나의 뭉뚱그린 "JDK
incompatible" 메시지로 합치지 않는다(오늘 CI flake 문서를 쓰면서 배운 것과 같은 교훈 -
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

1. jdtls의 JDK-runtime 결정 로직 - `bin/jdtls` 래퍼 스크립트(Python)가 실제로 어떤 순서로
   JVM을 찾는지 스크립트 자체를 읽어 확인(entry gate lane이 이미 `jdtls.py`를 한 번 열어본
   적 있음 - 이번엔 JDK 탐색 로직에 초점을 맞춰 다시 읽는다).
2. Homebrew 등 패키지 매니저의 `jdtls` PATH 진입점 존재 여부.
3. Gradle 8.14×JDK 25 실패의 정확한 에러 모양(reviewer의 실측 원문을 요청해 인용 - 이 문서는
   아직 그 실측을 직접 보지 못했고, commander의 요약만 인용했다는 것을 명시해 둔다).
4. jdtls가 project import 시 내부적으로 쓰는 JVM이 자기 runtime JVM과 같은지 별도인지(entry
   gate lane은 Maven만 "자체 내장 지원"을 관찰했고 Gradle은 확인 안 함).

## 종료 조건 (story 그대로)

provider launch 전에 복구 가능한 runtime 문제를 식별한다 - 세 JDK 축 각각에 대해
missing/incompatible/ambiguous를 구분된 doctor check로 보여주고, 절대 경로·환경변수 값은
기본 출력에서 안 보인다.

## 이 문서가 아직 답하지 못한 것 (숨기지 않는다)

- "확인이 필요한 것" 네 항목 전부 - 이 설계안은 그 실측 전에 쓰였다. commander 확인 후
  실측부터 시작한다.
- `doctor`의 raw-command 확장이 정확히 어떤 CLI 옵션 모양이 될지 - 설계 방향만 적었고
  구체적 옵션 이름·스키마는 commander 확인 후 정한다.
- Gradle/Maven wrapper 버전과 JDK 비호환의 "알려진 조합" 표는 지금 데이터 포인트가
  reviewer의 실측 하나뿐이다 - 이 lane이 직접 재현해 확인할 예정이고, 그 전까지는 표를
  채우지 않는다.
