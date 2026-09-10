# M3 lane G — `IL-LIM-018` 진입 gate: jdtls incoming call hierarchy 실측 (계획, 실행 전)

- 상태: **계획 단계 — 아직 jdtls를 기동하지 않았다.** commander 지시대로 fixture 설계와 측정
  계획을 먼저 맞춘 뒤 실행한다.
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

## Fixture 설계

**하나의 standalone `.java` 파일**, 세 개의 독립된 호출 모양 + 대조군 하나:

```java
import java.util.List;

public class Fixture {
    // 대조군 - 평범한 직접 호출. 이게 안 잡히면 버그가 아니라 이 세션의 셋업 문제다.
    static void directCaller() {
        directTarget();
    }

    static void directTarget() {
    }

    // 핵심 질문 - method reference로만 호출된다. 직접 호출 표현식이 어디에도 없다.
    static void methodRefCaller(List<String> items) {
        items.forEach(Fixture::methodRefTarget);
    }

    static void methodRefTarget(String s) {
    }

    // 부차 질문 - lambda 본문 "안에서" 직접 호출된다(참조가 아니라 진짜 호출 표현식).
    static void lambdaCaller(List<String> items) {
        items.forEach(s -> lambdaTarget(s));
    }

    static void lambdaTarget(String s) {
    }
}
```

각 `*Target` 메서드에 `prepareCallHierarchy` → `incomingCalls`를 걸어 어떤 caller가 나오는지
관찰한다. 기대(가설, 실측으로 확정 전까지는 가설):
- `directTarget` → `directCaller`가 나온다(안 나오면 셋업 결함).
- `methodRefTarget` → `methodRefCaller`가 나오는지가 **이 lane의 핵심 산출물**.
- `lambdaTarget` → `lambdaCaller`가 나오는지(원 버그가 outgoing 기준으로는 정상이라고 재현해
  뒀지만, incoming은 별도로 확인해야 한다).

## 측정 절차(초안, 실행 전)

1. **JDK 준비**: jdtls 실행에 필요한 JDK 21+를 이 머신에 설치(현재 `/usr/bin/java`는 stub, 실제
   JDK 없음 - 직접 확인). 분석 대상 fixture 자체는 특별한 language level이 필요 없다(method
   reference는 Java 8부터 지원) - **fixture의 language level(예: 8 이상 아무 값)과 jdtls 실행용
   JDK(21+, 별개)를 결과 기록에 명시적으로 분리한다.**
2. **jdtls 다운로드** - 두 버전:
   - **"수정 전으로 추정되는" 버전**: `eclipse.jdt.ui#2035`(2025-03-06 merge) 이전에 릴리스된
     jdtls 빌드.
   - **"수정 후로 추정되는" 버전**: 현재 최신 안정 릴리스.
   - 정확한 버전 번호는 `gh api repos/eclipse-jdtls/eclipse.jdt.ls/releases` (또는 milestone
     빌드 목록)로 조사해 실행 직전에 확정한다 - 지금 이 문서에서 추측해 적지 않는다.
3. **기동**: jdtls를 standalone 모드로 stdio LSP 서버로 띄우고, `initialize`(workspaceFolder =
   fixture 디렉터리) → `initialized` → **cold** 상태에서 즉시 세 `*Target` 메서드에
   `prepareCallHierarchy`/`incomingCalls` 호출.
4. **warm 대기**: `$/progress`(또는 유사 신호)가 완료를 알릴 때까지, 혹은 일정 시간 poll한 뒤
   같은 세 쿼리를 반복.
5. **cold/warm 응답을 raw JSON으로 둘 다 남긴다** - 요약이 아니라 원문. 다르면 그 차이 자체를
   기록한다.
6. 두 jdtls 버전(신/구) 각각에 대해 위 3~5를 반복 - **outgoing** 방향도 같은 fixture로 한 번 더
   재현해(이미 알려진 버그의 재확인, 대조용) incoming과 나란히 표로 남긴다.
7. 버전 번호 하한 판정: 구버전에서 outgoing이 깨지고 신버전에서 고쳐졌다면, 그 사이의 릴리스
   변경 로그(`gh api`)로 **어느 릴리스부터 고쳐졌는지**를 좁힌다 - 전수 이분 탐색은 하지 않고,
   시도한 두 버전 사이에서 relevant 릴리스 노트/커밋 날짜로 합리적 추정을 하되 "이 두 버전에서
   관측했다"는 사실과 "그 사이 어딘가부터일 것"이라는 추론을 구분해 적는다.

## 관측 지표

- 세 `*Target` 메서드 각각의 incoming call hierarchy 결과(caller 이름, range) - cold/warm ×
  구버전/신버전 = 최대 12개 raw 응답.
- outgoing 재현 결과(대조, 이미 알려진 버그의 재확인) - 같은 매트릭스.
- jdtls 기동 시간, `initialize` 응답의 advertised capability(`callHierarchyProvider: true`인지
  실제로 선언하는지).
- 에러/timeout 발생 여부(있으면 그 자체가 결과다 - 조용히 재시도하지 않는다).

## 이 계획이 아직 확정하지 않은 것 (commander 확인 요청)

1. **jdtls 버전 두 개의 정확한 번호 - 이미 조사해 후보를 냈다.** `gh api
   repos/eclipse-jdtls/eclipse.jdt.ls/tags`로 태그 목록과 각 태그의 commit 날짜를 직접 확인:
   - **`v1.45.0`**(commit 2025-02-27) - `eclipse.jdt.ui#2035`(2025-03-06 merge) **이전**이라
     outgoing 버그를 아직 포함할 가능성이 높은 후보.
   - **`v1.46.0`**(commit 2025-03-27) - 병합 **직후** 첫 릴리스로 보이는 후보.
   - **최신 안정 릴리스**(현재 `v1.61.0`, commit 2026-09-02) - 확실히 수정 후.
   3버전(구/병합직후/최신)을 다 시도하면 하한을 `v1.45.0`과 `v1.46.0` 사이로 좁힐 수 있고,
   2버전(구/최신)만 시도하면 "이 두 버전에서 관측했다"는 사실만 남긴다 - **어느 쪽으로 할지
   확인 요청.** (jdtls가 매 릴리스마다 `eclipse.jdt.ui` 의존성을 즉시 갱신한다는 보장은 없어,
   `v1.46.0`이 실제로 수정을 포함하는지는 실행해서만 안다 - 태그 날짜만으로 확정하지 않는다.)
2. **JDK 설치 방법** - `brew install openjdk@21`(네트워크 필요, 이 저장소의 "임의 실행 금지"
   원칙과는 무관한 개발 도구 설치이지만 확인차 보고) vs 다른 방법 선호 여부.
3. **fixture가 standalone 파일로 충분한가**, 아니면 이 entry gate조차 최소 Gradle/Maven
   구조(단일 모듈, dependency 없음)를 요구해야 하는가 - 위 "범위" 절의 판단 근거를 적었지만
   최종 결정은 확인받는다.
4. **lambda 케이스의 정확한 모양** - 위 fixture는 `s -> lambdaTarget(s)`(명시적 호출)를 썼다.
   `items.forEach(lambdaTarget2)`처럼 메서드 참조와 헷갈리는 변형은 이미 method reference
   케이스가 덮으므로 중복하지 않았다 - 이 판단에 이견 있으면 알려 달라.

## 예상 산출물

- 세 `*Target` × cold/warm × 신/구 버전의 raw `incomingCalls` JSON 응답 전문(이 문서 또는 별도
  로그 파일에 첨부).
- 위 "핵심 질문"에 대한 **YES/NO 답**과 그 근거 응답.
- jdtls 버전 하한(실측한 범위 안에서, 전수 조사 아님을 명시).
- 이 실측이 preset 등재 여부에 주는 함의(등재 가능/불가/조건부 - 이 lane은 그 판단까지만 하고
  구현은 하지 않는다).
