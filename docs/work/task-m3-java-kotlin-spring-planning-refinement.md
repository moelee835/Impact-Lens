# M3 Java·Kotlin 언어 지원 및 M4 Spring adapter 계획 정련

- 상태: commander·reviewer 검토 완료(반박 2+2건 반영), story/milestone 문서 정정 적용, PR 대기
  (계획 문서 lane — 코드 변경 없음)
- branch: `docs/m3-java-kotlin-spring-planning-refinement`
- 선행: PR #78(M3에 `IL-LIM-018` 추가), PR #97(M4 augmentation 실패 격리) merge 완료.
- 요구사항: commander가 M4 close 전에 끝내라고 지시한 lane. `IL-LIM-018`(Java)/`IL-LIM-016`(Kotlin)
  story는 이미 존재하지만(PR #78), 오늘 dynamic-callback-adapter lane(IL-LIM-001 stage 3)에서 얻은
  실측 통찰(`prepare()` 기반 재확인이 손수 만든 이름 해석보다 강하다는 것)과, jdtls/Kotlin LSP에
  대한 새 실측(아래)이 아직 반영되지 않았다.

## 목적과 사용자 가치

**M4를 닫을 때 "Java/Kotlin/Spring은 M3 이후"라고만 적으면, M3에 들어가는 사람이 정확히 무엇을
검증해야 진짜로 시작할 수 있는지 알 수 없다.** 이 lane은 그 공백을 셋으로 나눠 채운다:

1. **순환 의존성을 M4 자신의 문서에 명시적으로 남긴다** — M4가 소유한 `IL-LIM-002`의 5단계(Spring
   adapter)는 M3가 만드는 언어 지원 없이는 M4 안에서 절대 실행할 수 없다. 이건 일정 조정이 아니라
   구조적 제약이고, M4를 닫는 사람이 "내가 뭘 안 하고 닫는지"를 문서만 보고 알아야 한다.
2. **Java/Kotlin 계획에 버전 하한과 위험 분리를 채운다** — 기존 story는 "verified version을 좁게
   관리한다"고만 적었지 숫자가 없었다. 이 lane이 그 숫자를 실측으로 채운다.
3. **Spring adapter의 설계 재료를 오늘 얻은 실측으로 미리 준비한다** — FastAPI adapter가 손수 만든
   200줄짜리 모듈 해석과 gate 4의 네 라운드를 쓴 이유는 정확히 `prepare()` 기반 재확인을 안 썼기
   때문이다. Spring의 `@Autowired` 같은 injection도 같은 종류의 문제라, 이 교훈을 미리 적어 두면
   나중에 Spring adapter를 시작하는 사람이 같은 실수를 반복하지 않는다.

**이 lane 자체는 아무것도 구현하지 않는다.** Java/Kotlin preset도, Spring adapter도 만들지 않는다
— 계획 문서만 정련한다. 다음 lane(M3 진입)이 이 문서를 근거로 실제 구현을 시작한다.

## 검증 층위 — 이 문서 전체에 적용

reviewer의 tier 형식을 그대로 쓴다. **이 조사 전체가 층 2다. 층 3은 하나도 없다.**

- **층 1(문서 서술)**: 프로젝트의 README/공식 문서가 하는 주장. 실제로 그렇게 동작하는지는 검증 안 됨.
- **층 2(소스 코드·capability 선언 확인)**: GitHub API로 실제 소스 파일/이슈/PR을 직접 열어 확인.
  "선언돼 있다"/"이 코드가 존재한다"까지는 실측이지만, **서버를 실제로 기동해 이 저장소의 fixture로
  호출한 적은 없다.**
- **층 3(실제 기동)**: JDK/jdtls 또는 Kotlin LSP 바이너리를 실제로 내려받아 실행하고, 이 저장소의
  fixture로 `prepareCallHierarchy`/`incomingCalls`를 직접 호출해 응답을 관찰하는 것. **이 문서는
  층 3을 전혀 수행하지 않는다** — JDK 설치, alpha 바이너리 다운로드 비용을 지금 이 계획 단계에서
  치르지 않기로 한 것이 이 lane의 명시적 결정이다(아래 "층 3은 어디로 가는가" 참고).

각 항목마다 `[층 2]`/`[층 1]`로 표시한다.

---

## 1. 순환 의존성 — M4가 스스로 적어야 하는 것

**사실관계** `[층 2, 이 저장소 자신을 읽음]`: `IL-LIM-002`(M4 소유)의 5단계는 이미
"Java 또는 Kotlin이 먼저 언어 지원을 얻은 뒤(M3 이후)에만 시작할 수 있다 — 그 전까지는 '후속'이
아니라 '착수 불가'다"라고 정확히 적어 뒀다(`il-lim-002-framework-di-routing.md`의 2026-09-03 추가).
`m4-semantic-augmentation.md`의 종료 gate도 이걸 반영해 Spring 항목을 대체 gate로 바꿨다.

**이 lane이 짚는 것은 그 문장의 정확성이 아니라 위치다.** 위 문장들은 전부 `IL-LIM-002`/
`m4-semantic-augmentation.md` **안**에 있다 — M4를 "닫는" 실제 행위(milestone 상태를 Planned에서
다른 값으로 바꾸는 순간, 또는 그 결정을 기록하는 문서)가 이 사실을 **자기 것으로 반복해서 적지
않으면**, M4 종료를 처리하는 사람이 두 story 문서를 각각 열어 읽지 않는 한 "M4가 자기 story의 한
단계를 실행 못 하고 닫는다"는 것을 모를 수 있다. 이건 이 마일스톤이 이미 한 번 겪은 실패 모양이다
— Spring이 처음엔 "M3 이후"로 막연히 떠 있다가 2026-09-04에야 구체적 story(`IL-LIM-018`/`016`)를
가리키도록 정정됐다(PR #78). **같은 종류의 암묵성이 지금 "M4 종료" 자체에 남아 있다.**

`docs/work/task-m4-milestone-closure-audit.md`(M4 종료 gate 대조 문서, 사실상 M4가 실제로 무엇을
닫고 무엇을 못 닫았는지 기록하는 자리)에 다음을 명시적으로 추가한다(이 lane이 merge되면 별도
커밋으로):

> M4는 `IL-LIM-002` 5단계(Spring Java/Kotlin adapter)를 **자신의 범위 안에서 실행할 수 없다** —
> 언어 지원(`IL-LIM-018`/`IL-LIM-016`, 둘 다 M3 소유)이 없으면 Spring 코드를 분석할 provider
> 자체가 없기 때문이다. 이건 우선순위 조정이 아니라 구조적 순서다: **M4가 이 단계를 이월한다는
> 사실은 M4 종료 판정 자체의 일부로 기록되어야 한다**, `IL-LIM-002` 문서 안에 있는 각주로 남는 게
> 아니라. M4를 형식적으로 닫는 사람(milestone 상태를 바꾸는 사람)은 이 문단을 근거로 "8개 gate 중
> 하나는 완료가 아니라 이월"이라고 명시해야 한다. **시작 조건과 완결 조건은 다르고, 둘 다 지금
> 정한다** — 미룰 근거가 없다:
>
> - **재개(착수) 가능 조건**: `IL-LIM-018` **또는** `IL-LIM-016` 중 하나가 닫히는 것. 재개
>   범위는 **닫힌 그 언어로 한정된다** — Java만 닫히면 Java/Spring 조합만 시작하고, Kotlin
>   조합은 `IL-LIM-016`이 닫힐 때까지 계속 이월 상태로 남는다.
> - **완결 조건**: `IL-LIM-002` 5단계가 자신이 지원한다고 주장하는 언어(Java, Kotlin) 전부가
>   검증된 provider를 가질 때 — 즉 `IL-LIM-018`과 `IL-LIM-016` **둘 다** 닫힌 뒤.
>
> 둘을 하나의 "재개 조건"으로 뭉치면 안 된다 — 뭉치면 이 문단을 읽는 사람이 "언어 하나로는 아무것도
> 시작 못 한다"거나 "언어 하나만 닫혀도 5단계 전체가 끝난다"는 잘못된 양극단 중 하나로 읽는다.

## 2. Java(`IL-LIM-018`) 계획 정련

### 2-1. jdtls의 capability 선언과 구현 — `[층 2]`

- `InitHandler.java`가 조건 없이 `capabilities.setCallHierarchyProvider(Boolean.TRUE)`를 호출한다
  (2026-09-09, `gh api repos/eclipse-jdtls/eclipse.jdt.ls/contents/.../InitHandler.java`로 직접
  파일 내용 확인).
- `CallHierarchyHandler.java`가 실제 핸들러를 구현하고, `JDTLanguageServer.java`가 이를
  `callHierarchyIncomingCalls`/`prepareCallHierarchy`에 연결하며, jdtls 자신의 테스트 스위트에
  전용 테스트 파일(`CallHierarchyHandlerTest.java`)이 있다(같은 방식으로 GitHub code search API로
  확인 — 파일 3개가 매치됨).
- **이게 증명하는 것과 안 하는 것**: jdtls 소스에 call hierarchy 기능이 실제로 구현돼 있고 jdtls
  자신의 corpus로 테스트된다는 것은 확인했다. **이 저장소의 fixture(Gradle/Maven multi-module,
  interface default method, lambda, method reference, record)로 그 구현을 직접 호출해 본 적은
  없다** — 그건 층 3이고 M3 1단계의 몫이다(아래 "층 3" 절).

### 2-2. 실제 jdtls 버그(`eclipse.jdt.ls#3388`) — 재조사로 더 정확해진 그림 `[층 2]`

기존 요약(다른 세션이 전달)은 "method reference call이 OUTGOING call hierarchy에서 누락되는
버그, INCOMING 방향은 미확인"이라고만 적었다. 이 lane이 이슈·PR을 직접 열어 재확인하며 세 가지를
더 정확히 알아냈다:

1. **이슈 자체가 이미 lambda와 method reference를 구분해서 재현했다** — 원 보고자(`saideepakb`,
   2025-02-17)가 첨부한 두 스크린샷이 각각 `a.forEach(x -> gatewayEndpoint(x))`(lambda, **정상
   동작**)와 `a.forEach(this::gatewayEndpoint)`(method reference, **깨짐**)을 나란히 보여준다.
   **reviewer가 추가로 확인한 것**: 이 대조는 댓글뿐 아니라 **이슈 본문 자체**에 이미 raw
   `callHierarchyOutgoingCalls` JSON 응답으로도 들어 있다 — 증거가 이 문서가 처음 적은 것보다
   더 강하다(과장이 아니라 과소진술이었다). **jdtls 자신의 버그 트래커가 "lambda와 method
   reference는 다른 위험"이라는 것을 이미 실측으로 증명해 뒀다.** `IL-LIM-018`의 3단계 계획이
   "interface default method/lambda/method reference gap"을 한 문장으로 묶은 것은 이 실측과
   어긋난다 — lambda는 이 버그와 전혀 무관했다.
2. **고친 PR(`eclipse-jdt/eclipse.jdt.ui#2035`, 2025-03-06 merge, 제목 "Add method reference
   support to Call hierarchy **callee** tree")이 건드린 생산 코드 파일은 `CalleeAnalyzerVisitor.java`
   하나뿐이다**(테스트 파일 둘 — `CallHierarchyContentProviderTest.java`,
   `CallHierarchyTestHelper.java` — 도 같이 바뀌었지만 이건 그 하나의 생산 코드 변경을 검증하는
   테스트일 뿐, 별도 동작 변경이 아니다) — outgoing(= callee) 쪽 AST 방문자다. jdtls 저장소의
   같은 디렉터리를 나열해 보면 incoming(= caller) 쪽은 `CallerMethodWrapper.java`/
   `RealCallers.java`/`MethodReferencesSearchRequestor.java`로 **완전히 다른 파일**을 쓴다.
   **이 구조적 분리가 확실히 뜻하는 건 하나뿐이다** — 이 PR이 incoming 쪽을 고쳤을 리 없다(파일이
   다르다, 확인 끝). **incoming 쪽이 애초에 이 버그를 가졌는지는 여전히 모른다.** (초안이 여기서
   "파일명이 `MethodReferencesSearchRequestor`이니 검색 기반이라 이 버그와 무관할 수 있다"는
   어원 추론을 폈었는데, **reviewer가 직접 파일을 열어 이 추론이 틀렸음을 확인했다** — 그 클래스와
   `CallerMethodWrapper.findChildren()`이 쓰는 것은 `SearchPattern.createPattern(member,
   IJavaSearchConstants.REFERENCES, ...)` + `SearchEngine.search(...)`이고, 여기서 "References"는
   JDT search API 자체의 용어(Eclipse의 일반 "Find References"와 같은 메커니즘)이지 Java 8의
   `::` method-reference 문법과 무관하다 — 게다가 두 파일의 copyright 표기가 2000-2011,
   2009-2011로 전부 Java 8(2014, `::` 문법 도입) 이전이다. 이름의 우연한 중의성에 근거를 댄
   것이었으므로 그 인용은 뺀다.) **실제로 층 3 없이도 말할 수 있는, 근거가 더 나은 구분은
   이것이다**: callee 쪽은 AST visitor(`CalleeAnalyzerVisitor`)라 노드 타입마다 명시적으로 처리해야
   하고 그래서 `MethodReferenceExpression`을 못 봐서 깨졌지만, caller 쪽은 search-engine/index
   기반이라 AST 노드 종류에 구조적으로 덜 민감할 수도 있다 — **이것도 검증된 사실이 아니라
   가설이다**(`eclipse.jdt.core`의 indexer 코드를 봐야 하는, 이 lane 범위 밖의 질문). **어느
   쪽이든 답은 층 3(실제 fixture로 method reference를 가진 메서드의 incoming calls를 조회)으로만
   알 수 있다** — 이 lane은 그 답을 모른 채로 남긴다, 추측하지 않는다.
3. jdtls 자신의 이슈는 2026-08-05에 "fixed by eclipse.jdt.ui#2035"로 닫혔다 — jdtls가 그 상류
   수정을 반영한 시점이 이 날짜라는 뜻이다(PR 자체는 2025-03-06 merge, jdtls 이슈 트래커에 반영·
   닫힘 처리된 날짜는 그보다 늦은 2026-08-05 — 상류 수정과 jdtls 자신의 tracker 업데이트 사이에
   시차가 있었다는 뜻이고, jdtls의 **어느 릴리스**부터 이 수정을 포함하는지는 이 lane이 확인하지
   않았다 — 버전 하한을 정하려면 이 확인이 필요하다, 아래 "권장 대응" 참고).

### 2-3. `IL-LIM-018` 문서에 반영할 정정

- **버전 하한선에 이 수정을 포함하는 jdtls 릴리스를 명시한다.** 지금 story는 "verified version
  범위를 좁게 관리한다"고만 적어 숫자가 없다 — 이 lane은 숫자 자체(어느 jdtls 릴리스부터 PR
  #2035가 포함되는지)를 확인하지 않았으므로(위 2-2의 3번 참고), **이 확인 자체를 M3 1단계의
  구체적 산출물로 명시한다**(이 lane이 숫자를 채우는 대신, "숫자를 어떻게 채울지"를 명시한다).
- **incoming 방향 method reference fixture를 M3 진입 조건에 추가한다.** outgoing 수정이
  incoming까지 덮는지 확인되지 않았으므로, jdtls를 검증 provider로 등재하기 전에 "method
  reference를 통해 호출되는 메서드의 incoming calls가 실제로 반환되는가"를 이 저장소의 fixture로
  직접 실측해야 한다 — 이게 안 되면 method reference로만 호출되는 메서드가 "caller 없음"으로
  잘못 보고될 위험이 outgoing 버그와 별개로 여전히 남는다.
- **"interface default method/lambda/method reference gap"을 세 개로 분리한다.** lambda는 위
  버그와 무관하다는 것이 실측으로 확인됐으니, 3단계 계획에서 lambda를 별도 항목으로 떼어 "이 항목은
  이 특정 버그의 위험을 안고 있지 않다"고 명시한다. interface default method도 이 버그와 무관한
  별개의 위험이라 마찬가지로 분리한다.

## 3. Kotlin(`IL-LIM-016`) 계획 정련

### 3-1. 버전 하한 실측 — `[층 2]`

Kotlin LSP(`Kotlin/kotlin-lsp`)의 `RELEASES.md`를 직접 읽었다(2026-09-09,
`gh api repos/Kotlin/kotlin-lsp/contents/RELEASES.md`). **`v262.4739.0`의 changelog가 정확히
이렇게 적는다**:

> Call hierarchy (`textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`,
> `callHierarchy/outgoingCalls`) — invoke "Show Call Hierarchy" / "Show Incoming/Outgoing Calls"
> on a Kotlin function or property to see who calls it and which symbols it calls. Fixes
> `Kotlin/kotlin-lsp#143`.

이 항목이 "새 capability"로 그 버전의 changelog에 나열되어 있고, 더 오래된 버전(`v262.2310.0`,
`v262.1817.0`, `v262.1668.0`, `v261.13587.0`, `v0.25x.*`)의 changelog에는 call hierarchy 언급이
없다(같은 파일 전체를 훑어 확인) — **`v262.4739.0`이 call hierarchy를 처음 도입한 릴리스라는
근거다.**

### 3-2. `IL-LIM-016` 문서에 반영할 정정

- **버전 하한을 `v262.4739.0`으로 명시한다.** `IL-LIM-016`의 "권장 대응"이 이미 "verified version을
  좁게 관리한다"고 요구해 뒀는데 숫자가 없었다 — **이 숫자가 바로 그 요구를 채우는 값이다.**
  `v262.4739.0` 미만 버전은 call hierarchy 자체가 없으므로 이 preset의 verified 범위 밖에 둔다.
- alpha + 일부 proprietary component라는 기존 등급 판단(experimental)은 그대로 유지한다 — 이
  lane은 그 판단을 바꿀 근거를 찾지 못했다(찾지 않았다, 가 아니라 새 릴리스가 이 상태를 바꿨다는
  기록을 못 봤다).
- kotlin-lsp#143(위에서 인용된 fixes 대상)을 참고 링크로 추가한다 — Kotlin LSP 자신의 call
  hierarchy 도입 배경을 확인하고 싶은 다음 사람을 위해서다.

## 4. Spring(`IL-LIM-002` 5단계) 설계 재료 — 오늘 얻은 실측을 미리 남긴다

### 4-1. 오늘 lane의 핵심 발견을 Spring에 그대로 적용

IL-LIM-001 stage 3(`dynamic-callback-static-v1` adapter, 오늘 merge된 PR #95)의 설계는 두 축의
독립 검증으로 정착했다 — (1) allowlist(이 위치가 스펙상 callback 자리인가, human-curated), (2)
`prepare()` 재확인(해석된 대상이 진짜 그 root symbol인가, shadow가 아닌가). **두 번째 축이 핵심
교훈이다**: `prepare()`가 language server 자신의 symbol 해석을 통해 이름 충돌·shadowing을
잡아낸다는 것을, gate 4가 이미 FastAPI adapter의 손수 만든 모듈 해석에서 **네 라운드**에 걸쳐
실패로 증명했다(대소문자 없는 basename 충돌, 역방향 alias, nested scope shadowing, 주석 안
`FastAPI()` 언급까지). FastAPI adapter의 router-mount 확인 경로(`isRouterMounted()`)가 유독
반복해서 깨졌던 이유는 정확히 그 경로가 **callable symbol이 아니라서 `prepare()`로 재확인할 수
없었기 때문**이다(`types.ts`의 `FrameworkAdapter` 타입 자체의 문서 주석이 이미 이 인과관계를
명시해 뒀다).

**Spring의 `@Autowired`/`@Inject` 필드·생성자 injection은 FastAPI의 `Depends()`와 같은 종류의
문제다** — 둘 다 "이 이름이 가리키는 대상이 무엇인가"를 정적으로 판단해야 한다. **차이는
`Depends(get_db)`가 함수를 인자로 넘기는 반면(callable, `prepare()`로 바로 재확인 가능), Spring
DI는 필드/파라미터의 **타입**으로 bean을 찾는다는 것**이다 — 이건 `prepare()`가 직접 풀어 주는
모양이 아니다(`prepare()`는 위치가 가리키는 symbol을 알려주지, "이 타입을 구현하는 다른 클래스들"을
열거해 주지 않는다). 따라서 Spring adapter의 첫 설계 질문은 **"주입 지점의 타입을 알아낸 뒤,
그 타입의 constructor/구현체를 어떻게 `prepare()`/provider 능력만으로 찾을 것인가"**가 되어야
한다 — 오늘 얻은 교훈은 "가능하면 `prepare()` 경로를 우선하라"이지 "Spring도 무조건 `prepare()`로
다 풀린다"가 아니다. 이 구분을 설계 시작 시점에 명시해 두지 않으면, FastAPI adapter처럼 손수 만든
해석 코드로 먼저 갔다가 gate 4 같은 라운드를 또 반복할 위험이 있다.

### 4-2. 부재한 능력 셋 — `reference` 하나, `implementation` 하나, 어느 쪽도 아닌 벽 하나

**commander 반박으로 1차 정정, reviewer 반박으로 2차 정정** — 초안은 이 절에 세 항목을 "같은
`reference` 능력의 부재"로 묶었는데, 그중 하나(layer 2)는 어휘가 틀렸고(유형 A/B와 layer 1/2를
혼동) 능력 귀속도 틀렸다(1차 정정, 위 §4-2 이력 참고). **reviewer가 추가로 짚은 것**: 남은 두
항목(emit 페어링, Spring bean)을 똑같이 "`reference`"로 뭉뚱그린 것도 정밀하지 않다 — LSP 표준
capability 중 "이 심볼을 참조하는 모든 위치"는 `textDocument/references`이지만, "이 인터페이스/
타입의 구현체 전부"는 별도 표준 capability `textDocument/implementation`이다. Spring bean
해석(타입 → 구현체)은 후자에 정확히 대응하고, `register()`/emit-on 페어링(어떤 심볼을 참조하는
호출부 전부)은 전자에 대응한다 — 하나로 뭉치면 나중에 `reference`만 검토하고
`implementation`을 후보에서 놓칠 수 있다. **이 저장소의 `CallHierarchyProvider`(`cli/src/
types.ts`)엔 오늘 기준 둘 다 없다**(grep으로 직접 확인 — `reference`/`implementation`이라는
이름의 LSP capability 멤버가 없다).

**`reference` 능력 부재로 설명되는 것**:

1. **event emit 쪽 연결**(`EventEmitter.on`/`.emit` 페어링) — 어떤 `.emit('event', arg)` 호출이
   어떤 `.on('event', handler)`와 실제로 짝지어지는지 확인하려면 이벤트 이름이 아니라 emitter
   인스턴스 자신의 흐름을 추적해야 한다 — 정적 이름 매칭이 아니라 `definition`/`reference` 기반
   데이터 흐름이 필요하다.

**`implementation` 능력 부재로 설명되는 것**:

2. **Spring bean 해석**(4-1) — 타입으로부터 구현체를 찾는 건 "이 심볼을 참조하는 곳"이 아니라
   "이 타입을 구현하는 타입들"이라, `reference`가 아니라 `implementation`이 표준적으로 맞는
   이름이다.

**어느 쪽도 아닌 별개의 벽 — layer 2**(콜백을 받는 함수가 `register`처럼 관례 이름의 사용자 정의
함수인 경우)는 `reference`도 `implementation`도 아니다. 초안은 "그 함수를 호출하는 모든 지점을
찾아야 한다"고 적었지만 이건 틀렸다 — `register`를 부르는 곳을 전부 찾아도 `register`가 **자기
파라미터를 실제로 호출하는지**는 알 수 없다. 그건 `register` **본문 안**의 문제다. reviewer가
이미 이걸 실측했다(dynamic-callback-adapter 설계 문서 135-136번째 줄): `register`의 **파라미터
선언 위치**와 `register` 본문 안에서 그 파라미터를 호출할 법한 **표현식 위치** 둘 다 `prepare()`가
**0건**을 반환한다. 즉 함수 파라미터가 애초에 `prepareCallHierarchy`가 다루는 callable symbol로
취급되지 않는다는, 두 능력 모두와 무관한 **별개의 벽**이다 — `reference`나 `implementation`
어느 쪽을 추가해도 이 벽은 안 풀린다. 이 구분을 안 지키면, 나중에 능력 추가를 판단할 사람이 "이걸
넣으면 layer 2도 열린다"고 잘못 기대하게 된다.

### 4-3. `IL-LIM-002` 5단계 문서에 반영할 추가

- 위 4-1의 설계 방향(주입 지점 타입 판별 → 구현체 열거 문제로 명시적으로 재정의)을 5단계 절차
  1번("component/service/repository, constructor injection... fixture를 만든다") 앞에 전제
  조건으로 추가한다.
- 위 4-2의 세 갈래를 "미해결 질문"에 그대로 추가한다 — emit 페어링은 `reference` 부재, Spring
  bean은 `implementation` 부재, layer 2는 둘 중 어느 쪽도 아닌 별개의 벽(파라미터가 callable
  symbol로 취급되지 않음). 세 갈래를 하나로 뭉치지 않는다.

## 5. 층 3은 M3 1단계의 진입 조건이다 — 이 lane이 정의하지 않는다

카탈로그 등재 규칙("실제 fixture를 통과해야 preset이 등재된다")은 **구현 단계의 게이트**이지 이
계획 문서의 문턱이 아니다. 이 lane은 jdtls도 Kotlin LSP도 실제로 기동하지 않았다 — JDK 설치나
alpha 바이너리 다운로드 비용을 지금 치르지 않기로 한 결정이다. 대신 이렇게 적는다:

> **각 서버(jdtls, Kotlin LSP)를 실제로 기동해 이 저장소의 fixture로 `prepareCallHierarchy`/
> `incomingCalls`/`outgoingCalls`를 직접 호출하고 응답을 관찰하는 것이 M3 1단계("JVM fixture와
> raw baseline")의 첫 산출물이다.** 이 문서(계획)가 그 실측을 대신하지 않는다 — `IL-LIM-018`/
> `IL-LIM-016`의 1단계 종료 조건("required static edge와 provider-variable edge가 재현 가능하게
> 분리된다")이 이미 이걸 요구하고 있고, 이 lane은 그 요구에 아래 두 항목을 구체적으로 추가한다:
> (a) method reference의 incoming 방향 실측(2-3 참고), (b) `v262.4739.0` 이상에서 Kotlin call
> hierarchy 세 메서드(`prepareCallHierarchy`/`incomingCalls`/`outgoingCalls`)가 실제로 응답하는지
> 확인.

## 검증 요약

이 문서 자체는 코드를 바꾸지 않으므로 실행 테스트가 없다. 검증은 인용의 정확성이다 — 아래 각
사실을 재확인하려는 사람을 위해 실제로 사용한 조회 명령을 남긴다:

- `gh api repos/eclipse-jdtls/eclipse.jdt.ls/issues/3388`(제목, 상태, 닫힌 날짜)
- `gh api repos/eclipse-jdtls/eclipse.jdt.ls/issues/3388/comments`(lambda vs method reference
  재현, 상류 PR 링크)
- `gh api repos/eclipse-jdt/eclipse.jdt.ui/pulls/2035`(제목, merge 날짜, 변경 파일)
- `gh api "search/code?q=setCallHierarchyProvider+repo:eclipse-jdtls/eclipse.jdt.ls"`
- `gh api "search/code?q=callHierarchyIncomingCalls+repo:eclipse-jdtls/eclipse.jdt.ls"`
- `gh api repos/eclipse-jdtls/eclipse.jdt.ls/contents/.../InitHandler.java`
- `gh api repos/eclipse-jdt/eclipse.jdt.ui/contents/.../callhierarchy`(디렉터리 나열)
- `gh api repos/Kotlin/kotlin-lsp/contents/RELEASES.md`

## 반박 반영 기록

commander의 1차 반박 둘을 이 문서에 직접 반영했다(각각 §1, §4-2에 인라인으로 표시):

1. **§1의 이월 재개 조건이 스스로를 취소하던 문제** — "둘 다 닫혀야 재개"와 "하나만 닫혀도 부분
   시작 가능"을 한 문단에서 동시에 주장하고 결정을 미뤘었다. **시작 조건**(`IL-LIM-018` 또는
   `IL-LIM-016` 중 하나, 재개 범위는 닫힌 언어로 한정)과 **완결 조건**(둘 다 닫힘)을 분리해 지금
   확정했다 — 미룰 근거가 없다는 지적을 받아들였다.
2. **§4-2의 유형 A/B ↔ layer 1/2 혼동과 능력 귀속 오류** — "Type B 슬롯"이라는 이름을 붙이고
   layer 2(관례 이름 callee) 문제를 설명했던 것을 어휘로 정정했고, "그 함수를 호출하는 모든
   지점을 찾아야 한다(`reference`)"는 능력 귀속이 틀렸다는 것도 reviewer의 기존 실측(`register`의
   파라미터 선언 위치·본문 내 호출 표현식 위치 둘 다 `prepare()` 0건)으로 재확인해 반영했다 —
   layer 2는 `reference` 부재가 아니라 파라미터가 callable symbol로 취급되지 않는 별개의 벽이다.

reviewer의 반박 둘도 반영했다(§2-2, §4-2에 인라인으로 표시):

3. **§2-2의 파일명 어원 추론(결함, 교체함)** — "`MethodReferencesSearchRequestor`라는 이름이
   검색 기반이라 이 버그와 무관할 수 있다"는 초안의 추론을 reviewer가 그 파일과
   `CallerMethodWrapper.findChildren()`을 직접 열어 반박했다 — 이 코드가 쓰는
   `IJavaSearchConstants.REFERENCES`는 JDT search API 자체의 "Find References" 용어이지 Java 8
   `::` 문법과 무관하고(두 파일 모두 Java 8 이전 copyright), 이 세션도 `CallerMethodWrapper.java`를
   직접 열어 `IJavaSearchConstants.REFERENCES` 사용을 재확인했다. 이 인용은 뺐다 — 결론(층 3
   없이는 모른다)은 안 바뀌지만, 그 결론을 뒷받침하던 근거를 reviewer가 제시한 더 나은 것(AST
   visitor vs. search-engine/index라는 구조적 차이, 이것도 검증 안 된 가설로 명시)으로 바꿨다.
4. **§4-2의 `reference`/`implementation` 미분리(정밀도 개선)** — emit 페어링과 Spring bean
   해석을 똑같이 `reference`로 뭉쳤던 것을, LSP 표준 capability 이름 기준으로 분리했다 — Spring
   bean(타입 → 구현체)은 `textDocument/implementation`, emit 페어링(심볼 → 참조 위치)은
   `textDocument/references`. 이 저장소의 `CallHierarchyProvider`엔 오늘 기준 둘 다 없다는 것도
   직접 grep으로 재확인했다.

## 다음 단계

이 work document를 commander/reviewer에게 먼저 보였다(commander의 명시적 요구 — "계획서는
merge되면 다음 마일스톤 전체가 그 위에 선다"). 위 반박을 반영했으니, 재확인 후 아래 파일에 실제
정정을 적용한다:

1. `docs/work/task-m4-milestone-closure-audit.md` — 순환 의존성 이월 명시, 시작/완결 조건 분리
   (위 1절).
2. `docs/development-management/stories/il-lim-018-java-language-support.md` — 버전 하한 확인
   절차 명시, incoming method-reference fixture를 M3 진입 조건에 추가, lambda/method
   reference/interface default method 위험 분리(위 2-3절).
3. `docs/development-management/stories/il-lim-016-kotlin-lsp-support.md` — 버전 하한
   `v262.4739.0` 명시(위 3-2절).
4. `docs/development-management/stories/il-lim-002-framework-di-routing.md` — Spring 설계
   방향 전제 조건과 `reference`/`implementation`/layer 2 세 갈래 추가(위 4-3절).
