# M3 lane G — `IL-LIM-018` 진입 gate: jdtls incoming call hierarchy 실측

- 상태: **실측 완료 — 층 3.** 실제 jdtls 두 버전을 실제로 기동해 이 저장소의 fixture로
  `prepareCallHierarchy`/`incomingCalls`/`outgoingCalls`를 직접 호출하고 응답을 관찰했다.
  **결론: incoming 방향에서는 이 버그가 관측되지 않았다** - 아래 "실측 결과" 참고. preset
  등재 여부에 대한 판단까지만 하고 구현(preset/catalog/CI)은 하지 않는다(commander 지시).
- branch: `feat/m3-java-entry-gate`
- 선행: `docs/development-management/stories/il-lim-018-java-language-support.md` 1단계 5번
  (2026-09-09 추가, entry gate), `docs/work/task-m3-java-kotlin-spring-planning-refinement.md`
  §2-2/§5(층 2 조사, "층 3은 M3 1단계의 진입 조건").

## 목적과 사용자 가치

Java에서 `list.forEach(this::handle)`처럼 **method reference로만 호출되는 메서드**가 있을 때,
사용자가 그 메서드의 변경 영향을 물으면 "호출자 없음"이 나올 수 있다 - 사용자는 그걸 "안 쓰이는
코드"로 읽고 지운다. `eclipse.jdt.ls#3388`은 이 정확한 버그를 **outgoing(callee)** 방향에서
실제로 냈다는 것이 이미 층 2(소스·이슈 조사)로 확인돼 있다 - 그러나 **incoming(caller) 방향이
애초에 이 버그를 가졌는지는 아무도 재지 않았다.** Impact Lens가 실제로 쓰는 건 incoming
(`callHierarchy/incomingCalls`, "이 함수를 누가 부르는가") 방향이다.

**이 실측 없이는 이 위험을 배제할 수 없고, 배제 못 한 채로 jdtls preset을 카탈로그에 등재하면
안 된다** - 이게 이 문서가 M3 1단계 "entry gate"라고 불리는 이유다. 이 lane이 끝나면:
- incoming 방향에 이 버그가 있는지 없는지가 **문서 인용이 아니라 실제 서버 응답**으로 확정된다.
- 있다면: jdtls preset 자체를 이 형태로 등재하면 안 된다는 근거가 생긴다(구현 lane이 다른 설계로
  가야 한다).
- 없다면: 다음 lane(discovery/JDK compatibility, 2단계)이 안전하게 시작할 수 있는 근거가 생긴다.

## 범위 — 이 lane이 재는 것과 재지 않는 것

**잰다**:
1. method reference로만 호출되는 메서드의 incoming call hierarchy.
2. lambda 본문 안에서 직접 호출되는 메서드의 incoming call hierarchy(story 1단계 2번이 lambda도
   같이 분류하라고 요구 - 원 버그 리포트가 lambda는 정상이라고 재현해 뒀지만, 그건 outgoing
   기준이었다는 것도 §2-2가 이미 짚었다. incoming에서도 재확인한다).
3. 평범한 직접 호출(대조군) - 이게 안 잡히면 버그가 아니라 이 세션의 셋업 결함이라는 뜻이다.
4. cold(초기화 직후) vs warm(indexing 완료 후) 반복 - 다르면 그 자체가 보고 대상이다(M2가 이미
   겪은 "indexing 중 빈 결과 ≠ 진짜 no-caller").
5. `eclipse.jdt.ls#3388`(outgoing 버그) 수정을 포함하는 jdtls 최소 릴리스 번호 - 두 버전(수정
   전/후로 추정되는 것 하나씩)을 실제로 받아 outgoing으로 재확인해 하한을 좁힌다. **전수 조사가
   아니다** - 시도한 두 버전에서 관측한 것만 "이 버전에서 이렇게 관측했다"로 적는다(clangd가
   버전별로 갈린 전례를 그대로 따른다 - 폭넓게 "v X 이상"이라고 단정하지 않는다).
6. provider 자체 runtime JDK(21+, jdtls 자신을 실행하는 데 필요)와 분석 대상 fixture의 JDK/
   language level(별개)을 구분해 기록한다.

**안 잰다(commander 지시로 이번 lane 범위 밖)**:
- interface default method, record compact constructor - 이 버그와 무관한 별개 위험이라고 이미
  분리돼 있고(story 문서 2026-09-09 정정), 이번 entry gate의 핵심 질문이 아니다.
- preset 구현, `PROVIDER_CATALOG` 등재, CI job 추가.
- Kotlin(`IL-LIM-016`) - reviewer가 병렬로 잰다.
- Swift.
- Gradle/Maven project import, dependency 해석, build 실행 - jdtls가 standalone `.java` 파일도
  지원한다고 문서가 주장하므로(층 1), 이 entry gate는 **standalone 파일**로만 검증한다. Gradle/
  Maven multi-module fixture는 story 1단계의 더 넓은 baseline(interface default method/record
  포함, 전체 관계 분류) 몫으로 남긴다 - 이 lane은 그 넓은 baseline을 만들지 않는다. **standalone
  으로 충분한 이유**: entry gate의 질문("method reference로만 호출되는 메서드의 incoming이
  잡히는가")은 Call Hierarchy provider의 검색 메커니즘(AST 기반인지 index/search 기반인지) 자체를
  묻는 것이라 프로젝트 구조(단일 파일 vs 멀티모듈)와 무관하다고 판단했다 - **다만 이 가정 자체가
  검증 안 됐다는 것도 결과에 같이 적는다**(standalone에서 안 잡히는 것이 멀티모듈에서도 안 잡힌다는
  보장은 아니다, 그 반대도 마찬가지).

## Fixture 설계 (실행에 쓴 최종 형태 - commander 지시로 둘 추가)

**standalone `.java` 파일**(`/tmp/jdtls-fixture/Fixture.java`) + **같은 소스를 담은 최소 Gradle
프로젝트**(`/tmp/jdtls-gradle-fixture/`, dependency 없음 - 음성 결과의 일반화 규칙, 아래
참고), 다섯 개의 독립된 호출 모양:

```java
import java.util.List;

public class Fixture {
    // 대조군 - 평범한 직접 호출. 이게 안 잡히면 버그가 아니라 이 세션의 셋업 문제다.
    static void directCaller() {
        directTarget();
    }

    static void directTarget() {
    }

    // 핵심 질문 - static method reference로만 호출된다. 직접 호출 표현식이 어디에도 없다.
    static void methodRefCaller(List<String> items) {
        items.forEach(Fixture::methodRefTarget);
    }

    static void methodRefTarget(String s) {
    }

    // 핵심 질문(2) - commander 지시로 추가: instance method reference(bound/unbound가 FastAPI
    // lane에서 다르게 동작한 전례가 있어 static과 별도로 잰다).
    void instanceRefCaller(List<String> items) {
        items.forEach(this::instanceRefTarget);
    }

    void instanceRefTarget(String s) {
    }

    // 부차 질문 - lambda 본문 "안에서" 직접 호출된다(참조가 아니라 진짜 호출 표현식).
    static void lambdaCaller(List<String> items) {
        items.forEach(s -> lambdaTarget(s));
    }

    static void lambdaTarget(String s) {
    }

    // 응답 "모양" 질문(commander 지시로 추가) - 어디서도 호출 안 됨. null/[]/에러 중 무엇이
    // 오는지 확인하는 용도.
    static void neverCalled() {
    }
}
```

## 측정 실행 (전부 `[실행]`)

### 준비

- **JDK**: Eclipse Temurin 21.0.12.1+1(macOS aarch64)를 `/tmp/jdk21`에 압축 해제만 해서 사용
  - `brew install openjdk@21`이 이 머신의 무관한 디렉터리(`pwsh` 관련) 소유권 문제로 막혀서,
    대신 Adoptium의 공식 tarball을 직접 받아 sha256 대조 후 압축 해제하는 방식으로 우회했다
    (시스템 설치 없음, `/tmp` 밖에 아무 흔적도 안 남긴다 - "되돌리기 쉬움" 요구를 그대로
    만족한다).
  - **이 JDK는 jdtls 자신을 구동하는 데만 쓴다.** 분석 대상 Gradle fixture의
    `build.gradle`은 `java.toolchain.languageVersion = JavaLanguageVersion.of(21)`을 선언했는데,
    이건 jdtls의 요구와 **우연히 같은 값을 고른 것**이지 같은 요구가 아니다 - method
    reference는 Java 8부터 지원되므로 fixture의 language level은 원래 8 이상 아무 값이어도
    됐다. 이 lane은 21로 통일해 실행했을 뿐, "fixture도 21이 필요하다"는 뜻으로 읽으면 안 된다.
  - **Gradle**: 8.10.2를 공식 배포 zip으로 직접 받아 `/tmp/gradle-8.10.2`에 압축 해제. jdtls의
    Gradle import가 wrapper를 내려받지 않도록 `initializationOptions.settings.java.import.
    gradle.wrapper.enabled=false`/`.home=/tmp/gradle-8.10.2`/`.offline.enabled=true`로
    명시했다 - fixture 자체의 `build.gradle`도 `id 'java'` 플러그인 하나만 쓰고 외부
    dependency가 없다(commander 지시 "의존성 없음"을 그대로 만족).
- **jdtls 버전 - commander 결정대로 둘만, 순서대로**:
  - `v1.45.0`(milestone build `jdt-language-server-1.45.0-202502271238.tar.gz`, commit
    2025-02-27) - `eclipse.jdt.ui#2035`(2025-03-06 merge) **이전**.
  - `v1.61.0`(`jdt-language-server-1.61.0-202609031315.tar.gz`, commit 2026-09-02) - 최신
    안정.
  - 둘 다 `download.eclipse.org/jdtls/milestones/<ver>/`에서 직접 tar.gz로 받았다(GitHub
    Release 자산이 아니라 Eclipse 자체 milestone 배포 서버 - `README.md`에 문서화된 경로).
- **측정 도구**: 이 저장소의 CLI를 쓰지 않고, 최소 stdio LSP client를 이 세션에서 직접
  작성했다(`/tmp/jdtls-probe.mjs`/`jdtls-probe-gradle.mjs`/`jdtls-probe-outgoing.mjs`, 제품
  코드 아님, 이 lane 전용 1회성 도구) - `initialize`/`initialized`/`didOpen`/
  `prepareCallHierarchy`/`incomingCalls`/`outgoingCalls`를 raw JSON-RPC로 직접 주고받고 모든
  응답을 원문 그대로 기록한다.

### 실행 1 - standalone, `v1.45.0`(구버전)

cold/warm 둘 다 동일:

| target | prepare | incoming |
| --- | --- | --- |
| `directTarget` | 1개 | `directCaller` ✅ |
| `methodRefTarget` | 1개 | `methodRefCaller` ✅ |
| `instanceRefTarget` | 1개 | `instanceRefCaller` ✅ |
| `lambdaTarget` | 1개 | `accept(String)`(합성 lambda 메서드, 아래 "발견 2" 참고) |

### 실행 2 - standalone, `v1.61.0`(최신) - `neverCalled` 포함 재실행

cold/warm 둘 다 동일, 실행 1과 완전히 같은 패턴 + 응답 모양 확인:

| target | prepare | incoming |
| --- | --- | --- |
| `directTarget` | 1개 | `directCaller` ✅ |
| `methodRefTarget` | 1개 | `methodRefCaller` ✅ |
| `instanceRefTarget` | 1개 | `instanceRefCaller` ✅ |
| `lambdaTarget` | 1개 | `accept(String)`(`Fixture$1`, 합성) |
| `neverCalled` | 1개 | **`[]`**(빈 배열 - null 아님, 에러 아님, 아래 "발견 3" 참고) |

### 실행 3 - 최소 Gradle project(dependency 없음), `v1.61.0` - 음성 결과 일반화 확인

commander의 비대칭 규칙("버그가 안 보이면 일반화하지 말고 Gradle project로 재확인") 적용 -
standalone 결과가 전부 음성(버그 없음)이었으므로, 제품이 실제로 겨냥하는 형태(standalone이
아니라 Gradle/Maven project)로 다시 쟀다. **실제 Gradle import가 일어났다는 것을 진행 알림으로
직접 확인**("Starting Gradle Daemon" → "Run build" → "Configure project" →
`ProjectStatus: OK` → `ServiceReady`) - `--offline` 로컬 Gradle로 네트워크 없이 완료됐다.

| target | incoming |
| --- | --- |
| `directTarget` | `directCaller` ✅ |
| `methodRefTarget` | `methodRefCaller` ✅ |
| `instanceRefTarget` | `instanceRefCaller` ✅ |
| `lambdaTarget` | `accept(String)`(동일) |

cold/warm 완전히 동일. **`v1.45.0` × Gradle 조합은 실행하지 않았다** - 이 lane이 실제로 확인해야
하는 건 "미래에 preset으로 등재할 버전"(최신)이 실제 프로젝트 형태에서 안전한가이지, 구버전 ×
Gradle 조합의 전수 확인이 아니라고 판단했다 - **다만 이 판단 자체를 결과로 기록한다**(안 잰
조합이라는 것을 숨기지 않는다).

### 실행 4 - outgoing 대조(이미 알려진 버그의 재확인, harness 자체의 민감도 검증)

`methodRefCaller`에서 outgoing을 걸어, 이미 소스·이슈로 확인된 버그가 **이 harness로도** 재현
되는지 확인했다 - incoming이 "멀쩡하다"는 결과가 harness 결함이 아니라는 것을 증명하는 대조군.

| jdtls 버전 | `methodRefCaller`의 outgoing |
| --- | --- |
| `v1.45.0` | **`[]`** - 알려진 버그 그대로 재현(`methodRefTarget`이 안 나옴) |
| `v1.61.0` | `methodRefTarget` ✅ - 수정 확인 |

**이 대조가 증명하는 것**: 이 세션의 harness는 실제로 존재하는 버그를 놓치지 않는다 - 그러니
incoming 쪽에서 버그를 못 찾은 것은 "측정 도구가 둔감해서"가 아니라 "그 방향엔 원래 버그가
없어서"라고 읽을 수 있다.

## cold/warm 방법론의 정직한 한계 (숨기지 않는다)

**실제로는 "cold"를 못 잡았다.** 두 실행(standalone·Gradle) 모두에서 `Started: Ready`/
`ServiceReady` 알림이 `initialize` 응답이 돌아오고 `didOpen`을 보내는 그 짧은 왕복 시간
안에 이미 도착해 있었다(진행 로그의 정확한 순서로 확인: "cold" 쿼리를 보내기 전에 이미
"Ready" 알림이 지나갔다). 즉 이번 fixture(파일 하나, 외부 dependency 없음)는 jdtls가
색인을 끝내는 데 걸리는 시간이 우리 쪽 요청 왕복 시간보다 짧아서, **"cold"라고 이름 붙인
쿼리도 실제로는 이미 warm 상태에서 실행됐다.** cold/warm이 "동일했다"는 진술은 정확하지만,
그건 "두 상태를 비교했는데 차이가 없었다"가 아니라 **"두 상태를 실제로 분리하지 못했다"**는
뜻이다 - 이 차이를 구분해 적는다. 진짜 indexing-중 상태를 관측하려면 더 큰 fixture(여러
파일, 실제 dependency가 있어 resolve에 시간이 걸리는 프로젝트)가 필요하다 - 이 entry gate는
그걸 시도하지 않았다.

## 발견 요약 — 핵심 질문에 대한 답

**1. 핵심 질문: method reference로만 호출되는 메서드의 incoming call hierarchy가 잡히는가.**

**YES - 이번에 측정한 두 jdtls 버전(v1.45.0, v1.61.0), 두 project 형태(standalone, 최소
Gradle) 전부에서 static·instance method reference 둘 다 정확한 caller를 반환했다.**
`eclipse.jdt.ls#3388`은 **outgoing 방향에만** 있었고, **incoming 방향은 이 버그의 영향을
받지 않았다** - 이 harness가 같은 fixture로 outgoing 쪽 버그를 실제로 재현했다는 대조(실행
4)가 이 결론이 harness 둔감성 때문이 아님을 뒷받침한다.

**2. 발견 - lambda 호출은 caller 이름이 사용자가 안 쓴 합성 메서드로 나온다.**

`lambdaTarget`의 incoming caller가 사용자가 실제로 작성한 `lambdaCaller`가 아니라
**`Fixture$1.accept(String)`** - 컴파일러가 람다를 구현하려고 만든 합성 클래스의 합성
메서드다. 이건 이 lane이 찾으려던 "caller 없음" 버그가 아니다(caller가 실제로 있다) - 하지만
**다른 종류의 문제**다: Impact Lens가 이 이름을 그대로 사용자에게 보여주면 "이 함수는
`accept`가 부른다"처럼 사용자가 작성한 적 없는 이름이 나온다. `methodRefTarget`/
`instanceRefTarget`은 진짜 enclosing 메서드 이름(`methodRefCaller`/`instanceRefCaller`)이
그대로 나왔다는 것과 대비된다 - **method reference와 lambda가 "caller 정체성"을 표현하는
방식 자체가 다르다.** 이 lane의 범위 밖(entry gate는 "잡히는가"만 확인, "이름을 어떻게
보여줄지"는 구현 lane의 몫)이지만, 다음 lane이 이 사실을 모르고 시작하지 않도록 여기 남긴다.

**3. 발견 - 응답 모양은 빈 배열이지 `null`이 아니다.**

`neverCalled`(어디서도 호출 안 됨)의 `incomingCalls`는 **`[]`**를 반환했다 - `null`도
아니고 에러도 아니다. 이건 pyright(빈 배열)와 같은 방향이고 Pyrefly(`null`)와는 다른 방향
이다 - `provider_null_incoming_calls`가 존재하는 이유였던 그 갈림이 jdtls에서는 (적어도
이번에 측정한 두 버전에서는) 발생하지 않는다는 뜻이다. **다만 이건 "안전한 shape"이 확정됐다는
뜻이지 "빈 결과가 항상 진짜 no-caller"라는 뜻은 아니다** - indexing 미완료 상태에서의 빈
결과와 진짜 no-caller를 구분하는 문제(위 "cold/warm 한계" 참고)는 여전히 안 풀렸다.

## jdtls 버전 하한에 대한 판단 — commander의 조건부 규칙 그대로 적용

**incoming이 두 버전 모두에서 멀쩡했으므로, `v1.46.0`을 추가로 시도하지 않았다** -
commander가 정확히 이 조건("오래된 쪽에서도 incoming이 멀쩡하면 거기서 멈추라")을 미리
정해 뒀고, 그 조건이 실제로 성립했다.

**`eclipse.jdt.ls#3388`(outgoing 버그)의 최소 수정 릴리스 번호는 이 lane이 확정하지
않는다 - 그리고 그 확정이 우리 용도에 필요하지도 않다고 판단한다.** Impact Lens가 실제로
쓰는 방향은 incoming이고, incoming은 측정한 범위(v1.45.0~v1.61.0) 안에서 한 번도 깨진
적이 없다. outgoing 버그의 정확한 하한이 궁금하다면 `v1.45.0`(깨짐)과 `v1.61.0`(고쳐짐)
사이 어딘가라는 것만 실측으로 안다 - **더 좁히지 않았다.** story의 종료 조건 문구("수정을
포함하는 최소 릴리스 번호가 실측으로 채워진다")는 이 실측 결과에 비춰 **"outgoing
자체를 쓰지 않는 한 그 번호는 이 story의 preset 등재 판단에 영향을 주지 않는다"**로 다시
읽어야 한다 - 필요하면 언제든 `v1.46.0`을 추가로 재고 좁힐 수 있다(비용은 다운로드 하나,
실행 몇 분).

## 이 실측이 preset 등재 여부에 주는 함의

**entry gate 자체는 통과한다** - method reference로만 호출되는 메서드가 "caller 없음"으로
잘못 보고될 위험은, 이번에 측정한 범위(standalone + 최소 Gradle, v1.45.0 + v1.61.0) 안에서는
**배제됐다.** 이게 "Java preset을 지금 당장 등재해도 된다"는 뜻은 아니다 - story의 2·3·4단계
(discovery/JDK compatibility, project import/readiness, Plugin E2E)가 여전히 안 끝났고,
아래 "남은 공백"이 있다.

## 남은 공백 (이 lane이 안 잰 것 - 숨기지 않는다)

- **cold/warm을 실제로 분리하지 못했다**(위 절 참고) - 더 큰 fixture가 필요하다.
- **`v1.45.0` × Gradle project 조합을 안 잰다** - 최신 버전(등재 후보)의 안전성만 실제
  프로젝트 형태로 재확인했다.
- **interface default method, record compact constructor는 이번 lane의 범위 밖**(story
  문서가 이미 별개 위험으로 분리해 둔 항목) - 여전히 미확인.
- **Maven은 안 잤다** - Gradle만 확인했다. story의 범위는 Gradle/Maven 둘 다 언급하지만, 이
  entry gate는 "project 형태가 결과를 바꾸는가"라는 질문에 하나의 real project 예시만
  있으면 충분하다고 판단했다 - Maven이 다르게 동작할 가능성은 배제되지 않았다.
- **멀티모듈, cross-file caller는 안 잰다** - fixture가 단일 파일/단일 모듈이다. Java의
  cross-file/cross-module 관계 관측은 story 1단계의 더 넓은 baseline(이번 entry gate가
  아닌) 몫으로 남는다.
- **jdtls의 advertised capability(`callHierarchyProvider` 선언 값)를 정식으로 기록하지
  않았다** - raw `initialize` 응답에 있었지만 이 문서에 표로 옮기지 않았다(원본 JSON 로그에는
  있다).

## 재현 방법 (다음 사람을 위해)

```sh
# JDK (Adoptium Temurin 21, sha256 검증됨)
curl -sL -o jdk21.tar.gz "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.12.1_1.tar.gz"
tar xzf jdk21.tar.gz
export JAVA_HOME=$PWD/jdk-21.0.12.1+1/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"

# jdtls 두 버전 (Eclipse milestone 서버, GitHub Release 아님)
curl -sL -o jdtls-1.45.0.tar.gz "https://download.eclipse.org/jdtls/milestones/1.45.0/jdt-language-server-1.45.0-202502271238.tar.gz"
curl -sL -o jdtls-1.61.0.tar.gz "https://download.eclipse.org/jdtls/milestones/1.61.0/jdt-language-server-1.61.0-202609031315.tar.gz"
# (최신 버전을 다시 재현하려면 download.eclipse.org/jdtls/milestones/의 최신 디렉터리를 다시
# 확인한다 - v1.61.0이 이 lane 실행 시점의 최신이었을 뿐 영구적이지 않다.)

# Gradle (dependency 없는 fixture 재현용)
curl -sL -o gradle-8.10.2-bin.zip "https://services.gradle.org/distributions/gradle-8.10.2-bin.zip"
unzip -q gradle-8.10.2-bin.zip
```

Fixture와 probe 스크립트는 이 문서의 "Fixture 설계"/"측정 실행" 절에 전문이 있다 - 실제
raw JSON 응답은 이 세션의 `/tmp/jdtls-result-*.json` 파일에 있었으나 `/tmp`라 세션 종료 시
사라진다(제품 코드가 아니므로 저장소에 커밋하지 않았다) - 재현하려면 위 절차를 그대로
다시 실행한다.
