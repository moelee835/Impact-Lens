# IL-LIM-002 프레임워크 DI·라우팅 관계 보완

- 상태: Backlog
- 우선순위: P0
- 완료 마일스톤: [M4 — 동적 호출·DI·테스트 의미 보완](../milestones/m4-semantic-augmentation.md)
- 영향도: 매우 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

FastAPI `Depends()`와 decorator route, Spring/Guice 계열 DI처럼 프레임워크가 런타임에 연결하는
관계는 일반 Call Hierarchy에서 누락될 수 있다. 프레임워크 중심 프로젝트에서는 진입점과 서비스
의존성이 보이지 않아 분석 가치가 크게 낮아진다.

## 사용자 스토리

프레임워크 기반 서비스를 변경하는 개발자로서 route·DI 관계를 추론 관계로 확인하여,
변경된 서비스가 어떤 endpoint와 component에 영향을 줄 수 있는지 알고 싶다.

## 범위

- 첫 대상 프레임워크와 지원할 관계를 명시적으로 선정한다.
- framework adapter registry와 지원 등급을 정의하고 FastAPI 이후 Spring Java/Kotlin 후보를 분리한다.
- framework adapter가 만든 edge에 adapter 이름, 근거 위치와 추론 상태를 기록한다.
- 일반 호출 관계와 프레임워크 관계를 함께 탐색하되 필터링할 수 있게 한다.

## 제외 범위

- 여러 프레임워크를 한 번에 지원
- Spring Context, Koin, Dagger/Hilt와 Swift DI를 하나의 규칙으로 일반화
- 애플리케이션 실행 없이 런타임 구성을 완전하게 확정

## 수용 기준

- [ ] 선정한 프레임워크의 DI와 route fixture에서 기대 관계가 탐지된다.
- [ ] 추론 관계가 정적 확정 관계와 UI·JSON에서 구분된다.
- [ ] alias, 중첩 dependency와 cross-file 사례가 테스트된다.
- [ ] 모호한 관계는 확정 edge로 생성되지 않고 limitation으로 보고된다.
- [ ] 단일 후보, 복수 후보와 runtime-only binding이 확정·후보·미지원 관계로 구분된다.

> **2026-09-03 정정(M4 stage 1, `docs/work/task-m4-stage1-evidence-contract.md`)**: 이 문서 안에서
> 바로 위 문장(확정·후보·미지원)과 아래 "권장 대응"의 Spring 절("Spring Java/Kotlin 후속
> adapter는 bean registration과 injection point를 분리하고 결과를 세 단계로 표현한다"로 시작하는
> 부분, `confirmed`/`candidate`/`runtime-only`를 라벨로 나란히 씀)이 **서로 다른 어휘를 쓴다** —
> 같은 스토리 안의 모순이며, 어느 쪽도 그냥 "따르면" 안 된다(줄 번호가 아니라 원문으로 인용한다 —
> 이 정정을 처음 쓸 때 줄 번호로 인용했다가, 정정 삽입 자체가 그 줄 번호를 밀어서 자기 인용이
> 깨진 적이 있다). stage 1이 정한 최종 vocabulary: **`edges`(기존, LSP)에는 M4 어휘를 붙이지
> 않는다.** M4가 새로 만드는 `data.augmentedEdges` 항목은 두 독립 축을 갖는다 —
> `source: static-inference | runtime-observation`(어디서 왔는가), `resolution: single |
> multiple`(target이 몇 개로 좁혀지는가, "단일 후보"/"복수 후보"에 대응). **`confirmed`는 어느
> 축에도 쓰지 않는다** — `augmentedEdges`는 정의상 provider가 확정하지 않은 것들이라, 안에서
> "confirmed"를 쓰면 `edges`가 이미 암묵적으로 갖는 그 의미와 충돌해 추측이 확정으로 오독된다.
> **"runtime-only binding"(바로 위 수용 기준 문장)/"미지원"은 세 번째 `resolution` 값이 아니라
> edge 자체가 생기지 않는 경우다** — profile, 정적으로 안 풀리는 conditional, programmatic
> registration, proxy/AOP처럼 후보 target을 정적으로 단 하나도 나열할 수 없으면 edge를 만들지
> 않고 limitation만 보고한다("모호한 관계는 확정 edge로 생성되지 않고 limitation으로 보고된다"는
> 바로 위 수용 기준을, 이 경우엔 대체가 아니라 유일한 출력으로 적용한다). 자세한 근거는 work
> document 참고.

> **2026-09-04 추가 정정(M4 stage 3, `docs/work/task-m4-stage3-accuracy-latency-gates.md`
> "단계 3")**: 위 수용 기준 "단일 후보, **복수 후보**와 runtime-only binding이 확정·후보·미지원
> 관계로 구분된다"의 "복수 후보"를 FastAPI adapter로 실증하려고 서로 다른 두 구성(조건부 재정의,
> try/except import fallback)을 직접 시도했으나 pyright의 `prepareCallHierarchy`가 두 경우 모두
> 정확히 1개 항목만 반환해 만들지 못했다(전수 조사 아님, 시도한 두 구성에서 못 찾았다는 것만
> 실측 — `m4-semantic-augmentation.md`의 같은 날짜 정정에 전체 근거). 이 수용 기준에서 "복수
> 후보" 실증 요구는 제거하고, 단일 후보와 runtime-only binding 구분만 gate 대상으로 남긴다.
> `resolution: 'multiple'` 값 자체(코드)는 유지한다.
>
> **이 정정이 남기는 것과 `m4-semantic-augmentation.md`의 같은 날짜 정정이 남기는 것은 서로 다른
> 조건이라는 것을 명시한다** — 리뷰어가 짚었다. M4 gate 쪽 정정은 "단일 후보 + ambiguity"를 남기고
> ambiguity는 mount name-collision fixture(`isRouterMounted()`의 `nameAmbiguous`)로 이미 충족된다.
> 반면 이 수용 기준이 남기는 "runtime-only binding" 구분은 **다른 개념이다** — stage 1의 기존 정정이
> "후보 target을 정적으로 단 하나도 나열할 수 없으면 edge를 만들지 않고 limitation만 보고한다"로
> 이미 정의해 둔 대로 profile, 정적으로 안 풀리는 conditional, programmatic registration, proxy/AOP
> 같은 경우이고, mount 확인 가능 여부와는 코드 경로도 개념도 다르다. **이 저장소에 이 시나리오를
> 재현하는 fixture는 없다**(직접 확인:
> `fastapi-static-v1`에 runtime-only binding 전용 코드 경로나 limitation이 없고,
> `dynamic_mount_router.py`도 mount 쪽 시나리오이지 DI 후보 열거 불가 시나리오가 아니다). **이
> PR은 이 fixture 공백을 새로 만들지도, 닫지도 않는다** — mount ambiguity로 대체됐다고 재정의하지
> 않는다(개념이 다른 둘을 같다고 선언하는 것이 되므로). 아래 "M4 gate C"로 별도 기록.

## 검증

- 최소 FastAPI fixture의 route → handler → dependency 관계 통합 테스트
- provider 원본과 adapter 보완 결과 비교
- false-positive fixture 및 adapter 비활성화 회귀 테스트

## 의존성 및 위험

- `IL-LIM-003`과 `IL-LIM-006`이 선행되어야 하며 관계 모델은 `IL-LIM-001`과 공유할 수 있다.
- 프레임워크 버전과 coding pattern에 따라 추론 정확도가 크게 달라질 수 있다.

## 현재 기준선

- 현재 Extension과 CLI는 framework adapter나 Python AST parser를 포함하지 않는다.
- `src/declarationAnchor.ts`는 Python `def`/`async def`와 decorator 뒤의 선언 위치를 보정하지만
  route 또는 dependency 관계를 생성하지 않는다.
- 기존 cross-file route → service → repository 테스트는 provider가 반환한 일반 호출 edge를 검증할 뿐
  FastAPI의 `Depends()`나 decorator 실행 관계를 검증하지 않는다.
- README는 FastAPI 고유 관계가 누락될 수 있음을 명시하고 있다.

## 조사 결과

- [FastAPI Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)는 dependency 함수를 사용자가
  직접 호출하지 않고 FastAPI가 호출하며, dependency가 다시 sub-dependency를 선언할 수 있다고 설명한다.
- [Spring Framework의 annotation-based container 설정](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config.html)은
  component scan, `@Autowired`, `@Primary`, `@Qualifier`와 `@Bean` 같은 container resolution 규칙을 사용한다.
  일반 코드에 직접 생성 호출이 없어도 Spring Context가 연결하므로 별도 framework evidence가 필요하다.
- dependency는 `Annotated[..., Depends(function)]` 또는 기본값 `Depends(function)`으로 나타날 수 있고,
  [decorator dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-in-path-operation-decorators/)처럼
  path operation decorator의 `dependencies=[Depends(...)]`에도 선언될 수 있다.
- Python AST는 `FunctionDef.decorator_list`, `Call`, `Import`와 `ImportFrom`을 구조적으로 제공하므로
  코드를 실행하지 않고 명시적 FastAPI 선언을 찾을 수 있다.
- FastAPI의 OpenAPI schema는 dependency 요구를 통합하지만 source function identity와 call site를
  직접 보존하는 계약은 아니므로 source graph 구축의 단독 근거로는 부족하다.

## 대안 검토와 결정

1. **FastAPI 앱 import·실행 후 route graph 조사**: runtime 구성에는 가깝지만 사용자 코드 side effect,
   환경 의존성과 보안 위험 때문에 기본 방식에서 제외한다.
2. **OpenAPI만 분석**: endpoint 목록에는 유용하지만 dependency source symbol을 안정적으로 연결하기 어렵다.
3. **Python AST + provider definition 해석**: 정적 선언만 지원하지만 근거 range를 보존하고 안전하게
   실행할 수 있어 v1 방식으로 권장한다.
4. **문자열·factory 결과까지 휴리스틱 연결**: 오탐 위험이 높아 명확한 symbol resolution이 가능한
   pattern 이후로 연기한다.

## 권장 대응

- 첫 adapter를 `fastapi-static-v1`로 한정하고 지원 문법을 versioned capability로 공개한다.
- 공통 `FrameworkRelationAdapter`는 adapter별 언어, framework/version, project marker, relation type과
  confidence를 선언한다. FastAPI 규칙을 Spring이나 다른 container에 재사용하지 않는다.
- v1 관계는 다음 순서로 지원한다.
  1. 함수 parameter의 `Depends(target)`와 `Annotated[T, Depends(target)]`
  2. route decorator의 `dependencies=[Depends(target)]`
  3. `APIRouter(..., dependencies=[...])`와 `include_router(..., dependencies=[...])`
  4. dependency 함수 내부의 sub-dependency 재귀
- import alias를 추적하고 provider definition 결과로 실제 target symbol을 확인한다. definition을
  하나로 확정할 수 없으면 edge를 만들지 않고 `fastapi_dependency_ambiguous`로 보고한다.
- dependency edge는 handler/dependant → dependency 방향으로 만들고 `static-inference` evidence를 붙인다.
- HTTP route는 실제 source caller가 없으므로 `GET /items` 같은 synthetic entrypoint node를 도입하되,
  일반 function node와 다른 kind·provenance로 표시한다.
- route node 도입은 dependency edge 검증 뒤 별도 단계로 진행하여 기존 graph identity 변경을 격리한다.
- Spring Java/Kotlin 후속 adapter는 bean registration과 injection point를 분리하고 결과를 세 단계로 표현한다.
  - `confirmed`: type·qualifier·primary·조건으로 단일 bean이 결정됨
  - `candidate`: 복수 implementation 또는 정적으로 확정하지 못한 조건
  - `runtime-only`: profile, conditional, programmatic registration, proxy/AOP 등 실행 전 확정 불가
  > **2026-09-03 정정(M4 stage 1)**: 이 세 판정 기준(단일 bean 결정/복수 또는 미확정 조건/실행 전
  > 확정 불가) 자체는 그대로 쓰지만, **라벨은 바뀐다** — `confirmed`→`resolution: 'single'`,
  > `candidate`→`resolution: 'multiple'`(edge로 노출), `runtime-only`→ **edge 없음, limitation만**
  > (위 수용 기준 정정 참고). "confirmed"라는 단어를 M4의 새 edge 어휘에 쓰지 않기로 했기 때문이다.
- Koin, Dagger/Hilt와 Swift DI container는 annotation/generated/runtime 모델이 달라 별도 수요·fixture 검토 후
  독립 adapter story로 승격한다.

## 단계별 계획

### 1단계 — 기준 fixture와 지원 문법 확정

1. `IL-LIM-006` fixture에 direct dependency, `Annotated`, decorator dependency, alias와 sub-dependency를 추가한다.
2. 실제 Python provider의 원본 Call Hierarchy를 저장하고 누락 관계를 baseline으로 확정한다.
3. FastAPI 최소·검증 버전과 Python syntax 범위를 기록한다.

종료 조건: 각 관계가 provider 결과에 있는지 없는지 재현 가능하게 구분된다.

### 2단계 — Python 분석 adapter 기반

1. CLI와 Extension이 공유할 수 있는 adapter 입출력 계약을 정의한다.
2. Python AST를 얻는 실행 경계를 결정한다. Node package 도입보다 고정 Python helper process를 우선
   검토하고, executable과 version을 명시적으로 검증한다.
3. import alias table과 source range 변환을 구현한다.
4. workspace 밖 import와 syntax error를 부분 limitation으로 격리한다.

종료 조건: AST fixture에서 decorator, call과 import target 후보를 결정적 JSON으로 반환한다.

### 3단계 — dependency edge

1. parameter/default/Annotated/decorator/router dependency extractor를 순차 구현한다.
2. definition provider로 target을 검증하고 기존 symbol ID에 mapping한다.
3. sub-dependency cycle을 감지하며 기존 depth/node budget에 통합한다.
4. 지원하지 않는 factory·callable instance pattern을 limitation에 집계한다.

종료 조건: v1 fixture의 기대 dependency edge가 모두 inferred evidence로 표시되고 negative fixture에 오탐이 없다.

### 4단계 — route entrypoint

1. route decorator의 HTTP method와 정적 path literal을 추출한다.
2. synthetic node의 stable ID, navigation range와 표시 규칙을 정의한다.
3. dynamic path·custom decorator는 generic `framework entrypoint` 또는 미지원 상태로 처리한다.

종료 조건: route → handler → dependency 경로를 정적 Call Hierarchy와 혼동 없이 탐색할 수 있다.

### 5단계 — Spring Java/Kotlin feasibility와 adapter 분리

> **2026-09-03 추가(M4 stage 2, `docs/work/task-m4-stage2-fastapi-adapter.md`)**: 이 단계가
> FastAPI(1~4단계) 이후라는 순서는 이미 맞았다 — 다만 "언젠가는 온다"가 아니라 **지금은 하드
> 블로커로 막혀 있다**는 것을 명시적으로 남긴다. 직접 확인: `cli/src/providers/resolve.ts`의
> `languageId()`에 `.java` case가 없고, `PROVIDER_CATALOG`에 Java/Kotlin preset이 없다. 이
> 단계는 Java 또는 Kotlin이 먼저 언어 지원을 얻은 뒤(M3 이후)에만 시작할 수 있다 — 그 전까지는
> "후속"이 아니라 "착수 불가"다. `m4-semantic-augmentation.md`의 종료 gate도 이 사실을 반영해
> 정정했다.
>
> **2026-09-04 추가**: 위 "Java 또는 Kotlin이 먼저 언어 지원을 얻은 뒤(M3 이후)"가 이제 구체적인
> story를 가리킨다 — Java는 [`IL-LIM-018`](il-lim-018-java-language-support.md)(M3 신규), Kotlin은
> [`IL-LIM-016`](il-lim-016-kotlin-lsp-support.md)이다. 이 story들이 만드는 것은 언어 지원(provider
> preset)뿐이다 — Spring adapter 자체(이 5단계)는 여전히 M4, `IL-LIM-002`의 몫으로 남는다(언어
> 계층과 framework 계층의 분리는 그대로 유지).

1. component/service/repository, constructor injection, `@Bean`, qualifier/primary와 interface 구현 fixture를 만든다.
2. profile, conditional, collection injection, proxy/AOP와 programmatic registration을 negative/runtime-only로 둔다.
3. Java/Kotlin provider definition 결과와 build model을 이용해 bean type을 기존 symbol ID에 mapping할 수 있는지 측정한다.
4. FastAPI adapter의 공통 SPI만 재사용하고 Spring resolution rule은 별도 adapter와 release gate로 분리한다.

종료 조건: exact/candidate/runtime-only 분류 정확도와 성능이 승인된 경우에만 독립 구현 Issue를 만든다.
(2026-09-03 정정: `exact`/`runtime-only`는 M4 stage 1이 정한 `resolution: single/multiple` + edge
없음(limitation만)으로 대체 — 위 수용 기준 정정 참고.)

## 예상 변경 영역

- 신규 `src/frameworkAdapters/`, `cli/src/frameworkAdapters/` 또는 공유 package: adapter와 FastAPI extractor
- `src/types.ts`, `cli/src/types.ts`: synthetic node와 edge evidence
- `src/impactAnalyzer.ts`, `cli/src/impact.ts`: framework graph 병합
- `src/graphPanel.ts`, `src/impactTreeProvider.ts`: route·dependency 시각 구분
- Python/FastAPI integration fixture와 adapter contract tests
- README/INSTALL: 정확히 지원되는 FastAPI 문법과 미지원 pattern

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| AST | import alias, `Annotated`, decorator list | target 후보와 source range가 정확함 |
| 통합 | route → handler → direct/sub-dependency | 모든 edge가 inferred provenance로 연결됨 |
| cross-file | 다른 module의 dependency와 router include | 실제 symbol ID로 연결되고 이동 가능 |
| 부정 | `Depends(factory())`, 동적 decorator, 동명 함수 | 모호한 확정 edge가 생성되지 않음 |
| Spring spike | 단일·복수·조건부 bean | confirmed/candidate/runtime-only가 근거와 함께 분리됨(2026-09-03 정정: `resolution: single/multiple` + edge 없음(limitation만)으로 대체, 위 참고) |
| 안전 | import 시 side effect가 있는 module | 사용자 module을 실행하지 않음 |
| 회귀 | adapter 비활성화 | 기존 Language Server graph와 JSON이 유지됨 |

## rollout과 관측

- Python/FastAPI 감지 workspace에서도 최초에는 설정 opt-in으로 제공한다.
- graph header에 adapter version, inferred dependency·route 수와 skipped pattern 수를 표시한다.
- 지원 문법별 fixture가 안정된 뒤 direct `Depends`부터 단계적으로 기본 활성화한다.
- FastAPI import가 없는 Python workspace에서는 adapter를 시작하지 않는다.
- 문제가 생기면 framework adapter만 비활성화하고 provider 원본 graph로 즉시 rollback한다.

## 미해결 질문

- AST helper를 Python runtime에 의존할지 TypeScript parser dependency로 구현할지 spike가 필요하다.
- `include_router` prefix와 재사용 router가 만든 여러 route를 synthetic node identity에 어떻게 반영할지 결정해야 한다.
- callable class dependency와 dependency override를 v1 범위에 포함할지 실제 사용 fixture를 바탕으로 정해야 한다.
- Spring adapter에서 application context를 실제로 띄우지 않고 어느 수준까지 condition을 해석할지 경계를 정해야 한다.
