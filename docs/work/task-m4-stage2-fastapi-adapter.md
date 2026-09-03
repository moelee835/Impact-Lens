# M4 stage 2 — 첫 adapter 구현 (FastAPI)

- 상태: `fastapi-static-v1` adapter 구현·배선·테스트 완료. commit 대기.
- branch: `feat/m4-stage2-fastapi-adapter`
- 마일스톤: [M4 동적 호출·DI·테스트 의미 보완](../development-management/milestones/m4-semantic-augmentation.md)
- 선행: PR #72(M4 stage 1, evidence 계약 확정) merge(`3c13580`) 후 착수.
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m4-stage2-first-adapter.md`(commander scratchpad)

## 목적과 사용자 가치

stage 1이 확정한 evidence 계약(`docs/work/task-m4-stage1-evidence-contract.md`)을 처음으로 코드로
만든다. **계약이 실제로 안전한지는 첫 구현이 그 계약 위에서 실제로 동작해야 증명된다.**

## 순서 변경 보고 — Spring이 아니라 FastAPI가 1차 adapter다 (commander가 먼저 확인)

마일스톤 문서(`m4-semantic-augmentation.md`)는 "Spring Java/Kotlin bean/context resolution
1차 adapter"라고 적고 있다. **이건 지금 불가능하다** — 직접 확인했다:

- `cli/src/providers/resolve.ts`의 `languageId()`에 `.java` case가 아예 없다(`default: return
  'plaintext'`로 떨어진다). `.kt`/`.kts`는 `'kotlin'`으로 감지는 되지만,
- `PROVIDER_CATALOG`(`cli/src/providers/catalog.ts:516`)에 Java나 Kotlin preset이 없다 —
  `[bundledTypeScript, gopls, bundledPyright, clangd]` 넷뿐이다.

**Spring adapter를 만들려면 Java/Kotlin 언어 지원부터 필요하고, 그건 M3 이후의 일이다.** 이건
임의 변경이 아니라 이 저장소가 지금 갖춘 것과 안 갖춘 것이 강제하는 사실이다.

**FastAPI가 유일하게 지금 가능한 1차 adapter다.** Python preset(`bundled-pyright`)이 이미
shipped됐고, `pythonFastapiIntegration.test.ts`에 **진짜 FastAPI fixture와 실측 관측이 이미
있다** — 직접 재확인: route handler(`get_items`)와 `Depends()` target(`get_db`) 둘 다
`provider_null_incoming_calls`와 함께 "호출자 없음"을 단언하는 테스트 3개가 존재한다. **M4가
해결하려는 그 gap이 이미 재현 가능한 상태로 저장소에 있다.**

**흥미롭게도 `IL-LIM-002` 자신은 이미 FastAPI를 1차로 적어 뒀다** — "권장 대응"이 "첫 adapter를
`fastapi-static-v1`로 한정"하고 Spring을 "후속 adapter"라고 명시한다. **틀린 건 마일스톤 문서
하나뿐이었다.**

### 문서 정정 (원문 보존)

- `m4-semantic-augmentation.md`: 최상단에 이 발견을 정리한 정정 blockquote를 추가하고, "포함
  범위"·"산출물"·"단계별 계획"의 Spring 관련 문구에 취소선 + 정정을 달았다. **가장 중요한 것**:
  종료 gate의 "Spring constructor/field/method injection의 대표 fixture가 bean candidate와
  ambiguity를 재현한다"를 **이 마일스톤에서 통과 불가능한 형태**로 판단하고, **FastAPI
  `Depends()`/route dependency의 대표 fixture로 대체**했다 — Spring 버전은 Java/Kotlin 언어
  지원이 생긴 뒤 별도 milestone/story로 이어받는다.
- `il-lim-002-framework-di-routing.md`: 5단계(Spring feasibility) 앞에 "이건 '후속'이 아니라
  '착수 불가'다 — Java/Kotlin 언어 지원이 먼저 필요하다"는 사실을 추가했다(스토리 자신은 이미
  순서를 맞게 적어 뒀으므로 반전이 아니라 보강).

### 검증

- `grep -n "'.java'" cli/src/providers/resolve.ts` — 0건.
- `cli/src/providers/catalog.ts:516`의 `PROVIDER_CATALOG` 배열 직접 확인 — Java/Kotlin preset
  없음.
- `cli/src/test/pythonFastapiIntegration.test.ts`의 `provider_null_incoming_calls` 관련 assertion
  3건 직접 확인 — route handler·Depends() target 둘 다 존재.

## 다음 (commander 확인 후)

구현 범위는 요구사항 문서(`m4-stage2-first-adapter.md`)를 따른다 — FastAPI adapter 하나, 지금
필요 없는 일반화 금지, kill switch 기본값 결정과 근거, corpus 4건(stage 1의 4a/4b 중 4a만, 4b는
stage 2 결정 항목이 아니라 열어 둔 채로) 기반 fixture.

**가장 중요한 검증**: `pythonFastapiIntegration.test.ts`가 지금 route handler와 `Depends()`에
대해 단언하는 "호출자 없음 + `provider_null_incoming_calls`"가, adapter가 켜져 `augmentedEdges`가
생겨도 **그대로 참이어야 한다** — stage 1 계약의 실증이다.

이 문서는 순서 변경 보고 이후, commander 확인을 받고 나서 구현 단계별 작업 로그를 이어서
기록한다.

## Backlog — flaky 테스트 기록 (조사만, 수정 안 함)

**테스트**: `cli/src/test/contract.test.ts`의 `'preserves initialize exit diagnostics after
stderr closes and redacts secrets'`(`exitingServer.js` fixture를 실제로 spawn해 stderr가 닫힌
뒤에도 진단이 보존되고 secret이 redact되는지 검증).

**어디서**: PR #72(`docs/m4-stage1-evidence-contract`)의 `workflow_dispatch`/`pull_request` CI,
run `33731679960`의 `gopls / macos-latest` job(1차 시도)에서 실패 — `not ok 57`,
`AssertionError`. 이 PR은 `.md` 파일 3개만 바꿔 코드 변경이 0건이었으므로 원인이 될 수 없음을
`git diff --stat`으로 먼저 확인했다.

**무엇이 타이밍에 민감한가**: 이 테스트는 실제 자식 프로세스(`spawnSync`로 fixture 서버)를 띄우고
그 프로세스가 **stderr를 닫는 시점**과 **진단이 캡처되는 시점**의 상대적 순서에 의존한다 — 실제
OS 프로세스 스케줄링/스트림 flush 타이밍이 관여하는 종류의 테스트라 CI runner 부하에 따라
간헐적으로 순서가 달라질 수 있다.

**재실행으로 통과 확인**: `gh run rerun 33731679960 --failed`로 그 job만 재실행 → 통과(`gopls /
macos-latest`, 2m23s). 재실행 전 코드 diff가 0이었다는 것과 재실행 후 통과했다는 것 둘 다
직접 확인했다(추측 아님).

**최근 발생 빈도(직접 조사)**: 오늘 이 세션이 트리거한 최근 workflow 실행 14개
(`gh run list --workflow=unit-tests.yml --limit 15`, 이 backlog 기록 시점 기준)의
`run_attempt`를 `gh api`로 전부 확인 — **`33731679960` 하나만 `attempt=2`이고 나머지 13개는
전부 `attempt=1`**(첫 시도에 성공, 재실행 없음). 즉 **최근 14회 실행 중 1회, 그 1회도
`gopls / macos-latest`에서만** 발생했다 — 상시 flaky는 아니지만 실재하는 간헐적 실패다.
(주의: `gh api .../jobs`는 기본적으로 최신 attempt의 job만 보여줘서, 재실행되지 않은 실행에
같은 테스트가 실패했다가 같은 attempt 안에서 다시 통과했을 가능성까지는 이 조사로 배제하지
못한다 — `run_attempt` 카운트로 확인 가능한 것은 "재실행이 필요했던 횟수"까지다.)

**원인 조사·수정은 하지 않는다** — 범위 밖(commander 지시). 다음에 이 테스트가 실패하면 이 기록을
참고해 "알려진 flaky"로 넘기기 전에 실제 회귀인지부터 확인한다.

## 작업 로그

### 구현 — `fastapi-static-v1` adapter

**변경한 파일**:
- `cli/src/adapters/types.ts`(신규) — adapter SPI(`AdapterInput`/`AdapterResult`/`FrameworkAdapter`/
  `RegisteredAdapter`/`AdapterBudget`). 플러그인 로딩 시스템이 아니라 배열 하나 — IL-LIM-001의 "대안
  검토"가 어댑터 하나짜리 구현에 무거운 추상화를 만드는 걸 이미 반려했다.
- `cli/src/adapters/fastapiDependencyAdapter.ts`(신규) — 정규식 기반 텍스트 스캔(Python AST 아님,
  bounded heuristic). `Depends(target)`/`Annotated[T, Depends(target)]`와 route handler 데코레이터
  두 패턴을 찾고, 텍스트 매치로 끝내지 않고 실제 provider(`prepare()`)로 재확인해야 edge를 만든다 —
  이름만 같고 다른 심볼인 경우(corpus case 1)를 텍스트 매치만으로는 걸러낼 수 없기 때문.
- `cli/src/adapters/index.ts`(신규) — adapter registry(`ADAPTERS` 배열 하나), kill switch(`enabled`
  false면 adapter 호출 자체를 안 함), adapter 전용 budget(`maxFiles`/`maxMatchesPerFile`, static
  traversal budget과 완전히 분리 — stage 1의 "budget/limits leak" 결정).
- `cli/src/types.ts` — `AnalyzeRequest.augmentationEnabled`(kill switch, 기본 `false`/미지정),
  `AnalysisObservations.augmentationBudgetExceeded`, `data.augmentedEdges`용 타입 일체
  (`AugmentedEdge`/`AugmentedEndpoint`/`AugmentedEdgeSource`/`AugmentedEdgeResolution`) — stage 1
  계약 그대로(`resolution`은 `single`/`multiple`만, `confirmed` 없음).
- `cli/src/impact.ts` — `analyzeImpact()`에 `runAugmentation()` 호출 추가. static traversal 이후,
  `nodes`/`edges` 계산과 분리된 자리에 위치 — `augmentedEdges`는 그 둘을 읽기만 하고(`existingNodeIds`
  확인용) 쓰지 않는다. `augmentedEdges`가 있으면 `observations.semantic`을
  `{ scope: 'static-plus-inference', evidenceSources: ['inferred-fastapi-static-v1'] }`로 채운다 —
  M1이 이미 깔아 둔 `coverage.ts`/`completion.semanticScope` 배관을 그대로 재사용(stage 1 Q1 결정).
  `uriFile`/`externalRange`를 adapter가 재사용할 수 있게 export로 변경(순수 함수, 새 로직 아님).
- `cli/src/coverage.ts` — `augmentationBudgetExceeded` observation을
  `augmentation_budget_exceeded` limitation으로 변환. static
  `completion`/`complete`/`truncated`/`traversalLimits`는 절대 건드리지 않는다(stage 1 결정 그대로).
- `cli/src/index.ts` — CLI `--augmentation` 플래그(boolean), JSON 요청의
  `augmentationEnabled`(boolean만 허용, 그 외 타입은 `invalid_request`).
- `cli/package.json` — packaged 파일 목록에 `dist/adapters/*.js` 추가(안 하면 npm 배포판에서
  adapter가 빠져 kill switch를 켜도 아무것도 안 되는 조용한 실패가 난다).
- 테스트: `cli/src/test/pythonFastapiIntegration.test.ts`(augmentation ON 테스트 5개 + corpus case 1
  전용 fixture 2개 대상 테스트 2개 추가 — 아래 "가장 중요한 검증" 항목 포함),
  `cli/src/test/stateReachability.integration.test.ts`(`AUGMENTATION_REACHABLE` — adapter가 실제로
  `static-plus-inference`를 reachable하게 만든다는 걸 실행 증명),
  `cli/src/test/stateReachabilityClassification.ts`(`semantic`/`augmentationBudgetExceeded`를
  `no-producer`→`has-producer`로 재분류).
- 신규 fixture: `cli/src/test/fixtures/python-fastapi/{consumer,decoy_module,real_module}.py` —
  stage 1 corpus case 1("같은 이름, 다른 심볼")을 실제 파일 3개로 재현.

**가장 중요한 검증 — 통과**: `pythonFastapiIntegration.test.ts`의 기존 M2 단언(route handler·
`Depends()`에 대해 "호출자 없음 + `provider_null_incoming_calls`")이 augmentation ON에서도 그대로
참임을 새 테스트가 직접 확인한다(`data.edges.length === 0`, `provider_null_incoming_calls` 존재를
매 augmentation-ON 테스트에서 재확인). stage 1 계약이 실제로 지켜졌다는 증거다.

### 검증 중 발견한 결함 — `stateReachability.sources.test.ts`가 놓친 절반

`npm test` 전체 실행(337개) 중 1건 실패:
`nothing outside tests and types.ts assigns AnalysisObservations.semantic`. 원인: 이 텍스트 스캔
테스트가 "`semantic:` 키가 non-test 소스 어디에도 없어야 한다"를 그대로 단언하고 있었는데, 위 구현이
`impact.ts`에 `semantic: { scope: 'static-plus-inference', ... }`를 실제로 추가했으므로 그 전제가
깨졌다. 같은 파일의 자기 자신의 에러 메시지가 정확히 이 상황을 지시하고 있었다("move it out of
UNREACHABLE_SEMANTIC_SCOPES here into a reachable list ... in the same change") — `integration.test.ts`
쪽(`AUGMENTATION_REACHABLE`)은 이미 반영돼 있었지만 `sources.test.ts` 쪽 절반이 누락된 상태였다.

**수정**: `UNREACHABLE_SEMANTIC_SCOPES`에서 `static-plus-inference` 항목 제거(`static-plus-observation`
만 남음, 길이 2→1). 기존 테스트는 "`semantic` 키 자체가 안 쓰인다"는 이제 거짓인 명제를 검사했으므로,
`scope: 'static-plus-observation'`이라는 더 좁은 리터럴 조합만 검사하도록 재작성(`hasKeyValueProducer`
신규 helper) — `coverage.ts`에 이미 있던 `'static-plus-observation': 'augmented'` 같은 룩업 테이블
키와 혼동되지 않도록 `scope:` 뒤에 오는 값만 매칭. 재빌드 후 전체 337개 재실행 — 334 pass, 3 skip
(실제 gopls 필요, 기존과 동일), 0 fail.

**이 발견이 의미하는 것**: stage 1 계약(추론 edge와 확정 edge를 안 섞는다)이 지켜졌는지는 코드 리뷰만
으로는 안 보였고, 이 저장소의 trip-wire 테스트 인프라(`errors.ts`의 `CONTRACT_ONLY_ERROR_CODES`와 같은
기법)가 "선언과 구현의 어긋남"을 스스로 잡아냈다 — 정확히 그 인프라가 설계된 목적대로.

### PR 분리 (`main`에 없던 문서 4건 vs 구현) — commander와의 handoff

commander가 문서 4건(`72d830c`/`dd77125`/`8b8cfd3`/`1389a0b`)으로 PR #73을 열었는데, 그 직후 이
세션이 stage 2 구현(`cfa218b`)을 같은 branch에 push해 PR #73이 자동으로 "docs-only" 설명과 어긋나는
diff를 갖게 됐다(PR은 고정 commit이 아니라 branch tip을 추적하므로) — 잡아서 보고했다. commander가
문서 4건만 담은 새 branch(`docs/m4-stage2-groundwork`)로 **PR #74**를 새로 열어 분리했고, **PR #73은
이 stage 2 구현 전용 PR**로 남았다. `main`에 아직 없는 파일이 있어야 diff가 나므로, `main`에 없던 M4
계약·정정 문서 4건은 #74로, 구현은 #73으로 각각 검토받는다.

### corpus 커버리지 재검사 — 4건 중 1건만 구현돼 있었다

PR #73 본문을 정확하게 다시 쓰기 전에 stage 1 계약의 corpus 4건(1/2/3/4a, 4b는 stage 2 범위 밖)을
`grep -rn "orphan|ProdService|DevService|framework_route_mount|dedupe" src/test/ src/adapters/
src/coverage.ts src/impact.ts`로 재대조 — **결과 0건**. corpus 1(이름만 같고 무관)만 구현·테스트돼
있었고, corpus 2(조건부 대입 → `resolution: 'multiple'`)·3(orphan router)·4a(같은 세션 dedupe)는
코드도 fixture도 없었다.

**심각도가 셋이 다르다는 걸 commander가 구분했다**: corpus 3만 **활성 false positive**다 — 지금 코드는
mount 여부를 전혀 확인하지 않고 `@x.get(...)` 데코레이터만 보면 route edge를 만들었으므로, **mount
안 된 orphan router의 handler도 "reachable"로 잘못 보고했다.** 이건 이 마일스톤의 첫 번째 위험("false
positive가 신뢰를 훼손할 수 있다")을 첫 adapter가 그대로 어기는 것이라 **연기 불가**로 판단했다.
corpus 2(조건부 대입)는 **false negative**(못 찾는 것 — 이 저장소가 항상 고르는 안전한 방향과 같은
편)라 연기 가능. corpus 4a(dedupe)는 **소음**(같은 관계가 `edges`/`augmentedEdges`에 중복 — 혼란스럽지만
거짓 주장은 아님)이라 역시 연기 가능. 둘 다 "틀린 결론에 도달하게 만들지는 않는다"는 게 연기 판단의
근거다.

### corpus case 3 구현 — orphan router mount 확인

**변경한 파일**:
- `cli/src/adapters/fastapiDependencyAdapter.ts` — `ROUTE_DECORATOR_PATTERN`이 데코레이터의 base
  식별자(`@app.get(...)`의 `app`)를 캡처하도록 확장. `isDirectFastapiApp(name, rootText)`: `name`이 이
  파일에서 `FastAPI()`로 직접 바인딩됐는지 확인(root 파일 범위, `importsFastapi`와 같은 bounded 범위) —
  참이면 이미 최상위 app이라 mount 확인 자체가 불필요(기존 `app.py` 테스트가 안 깨지는 이유).
  `isRouterMounted(name, workspace, budget)`: workspace 전체를 도는 bounded 텍스트 검색으로
  `include_router(name` 형태(bare identifier 인자만, 함수 호출 결과는 제외)를 찾는다. **provider 기반
  reference resolution이 아니라 텍스트 검색이다** — `CallHierarchyProvider`가 노출하는 건 `prepare()`
  하나뿐이고 이건 callable 심볼(함수/메서드)만 다루므로, 함수가 아닌 router 변수에는 애초에 적용할
  방법이 없다(코드 주석에 이유를 명시). route handler 판정 블록을 "mount 확인됨 → 기존 edge 생성" /
  "mount 미확인 → edge 생성 안 함 + `mountUnresolved` 플래그"로 분기.
- `cli/src/adapters/types.ts` — `AdapterResult.mountUnresolved: boolean` 추가.
- `cli/src/adapters/index.ts` — `AugmentationResult.mountUnresolvedAdapterIds` 추가·집계.
- `cli/src/types.ts` — `AnalysisObservations.augmentationMountUnresolved?: readonly string[]` 추가.
- `cli/src/impact.ts` — 위 필드를 observations에 threading(기존 `augmentationBudgetExceeded`와 같은
  패턴).
- `cli/src/coverage.ts` — `mountUnresolvedDetails()`: `framework_route_mount_unresolved` limitation
  생성. **message는 코드 경로 하나에서만 만들어지는 단일 문자열**이라 두 fixture가 다른 문구를 낼 방법이
  구조적으로 없다(commander 지시대로 — "message를 상수 하나로 두세요... 문구로 구별하는 게 구조적으로
  불가능해집니다"). 문구는 "이 workspace 범위에서 mount를 찾지 못했다"만 말하고 "mount가 없다"는
  주장하지 않는다.
- `cli/src/test/stateReachabilityClassification.ts` — `augmentationMountUnresolved`를
  `has-producer`/`analyze-caller`로 분류.
- 신규 fixture: `orphan_router.py`(진짜 unmounted), `dynamic_mount_router.py`(동적 등록으로만 mount —
  `include_router(get_dynamic_router())`처럼 인자가 함수 호출 결과라 bare-identifier 검색 범위 밖).
- 신규 테스트 3개: corpus 3(a)(edge 없음 + limitation), corpus 3(b)(3(a)와 **message 텍스트까지 완전
  동일**함을 직접 비교로 확인), 그리고 회귀 가드(`app.py`의 `@app.get(...)`은 mount 확인 없이 기존과
  동일하게 동작 — mount 체크가 일반 app route에 오탐을 내지 않는지 확인).

**검증**: 재빌드 후 전체 재실행 — **337 pass, 3 skip(실제 gopls 필요, 기존과 동일), 0 fail.**
`pythonFastapiIntegration.test.ts` 단독 실행 11개 전부 통과, corpus 3(b) 테스트가 3(a)와 3(b) 응답의
`message` 문자열을 실제로 `assert.equal`로 비교해 통과함을 직접 확인(코드가 같다고 주장만 한 게
아니라 실행으로 증명).

### 남은 것

- **corpus 2(조건부 대입 → `resolution: 'multiple'`)**: 미구현. false negative 방향(못 찾음)이라
  연기. stage 3 정확도 gate 이전에 구현 필요.
- **corpus 4a(같은 세션 dedupe)**: 미구현. `runAugmentation()`이 이미 계산된 `edges` 배열을 받지
  않아 dedupe할 방법이 구조적으로 없음. 소음 방향(중복 표시, 거짓 아님)이라 연기. stage 3 이전에
  `edges`를 augmentation 입력에 threading해야 구현 가능.
- decorator-level(`dependencies=[Depends(target)]`)·router-level(`APIRouter(...,
  dependencies=[...])`) 선언은 이 패스가 다루지 않음(구현 docstring에 명시된 의도적 범위 제외, 누락
  아님).
- 환경 간 표현 일관성(corpus 4b, clangd 17 vs 23에서 같은 관계가 `edges`/`augmentedEdges` 중 어디에
  나타나는지) — handover에 기록된 대로 아직 미결.

### PR #73 review — mount 확인의 텍스트 검색이 낸 활성 오탐, 리뷰어·commander 독립 발견

리뷰어가 fixture로 재현: 서로 다른 두 파일이 각각 `router = APIRouter()`를 정의하고 하나만 mount되면,
**mount 안 된 쪽의 handler에도 edge가 생겼다** — `isRouterMounted()`가 이름만 보고 파일을 구분하지
않았기 때문. commander가 독립적으로 격리된 정규식 스크립트로 같은 함수를 직접 실행해 **리뷰어가 안 짚은
형태 셋을 추가로 찾았다**: 주석 처리된 mount 호출, docstring 안의 mount 언급, 문자열 리터럴 안의 mount
언급 — 전부 `include_router(name`이라는 텍스트만 보고 실제 코드인지 확인하지 않아서 생기는 같은 계열의
오탐. **주석 케이스가 특히 심각한 이유**: corpus 3이 재현하려는 "등록만 되고 mount 안 된 router"의
가장 흔한 실제 발생 경로가 mount 코드를 주석 처리하는 것이라, 이 오탐이 corpus 3의 목표 상황과 정확히
겹친다.

**메커니즘**: mount "확인"의 진짜 의미는 "이 root 파일의 이 router 변수가 mount됐다"여야 하는데, 지금
구현은 "workspace 어딘가에 이 이름을 mount하는 텍스트가 있다"였다 — 다른 진술이고 후자가 전자를
뒷받침하지 않는다. commander는 두 방향을 검토했다: (A) import 연결을 실제로 추적(정확하지만 Python
import를 부분 구현하면 같은 계열의 오탐을 더 많은 코드로 재생산할 위험), (B) 모호성을 감지해 안전한
쪽(edge 없음)으로 fallback. **(B)를 골랐다** — router 이름은 root 파일의 데코레이터에서 이미 알고
있고 이미 모든 Python 파일을 순회하므로 추가 비용이 거의 없으며, 실패 방향이 stage 1 계약 5번("확정
못 하면 edge를 만들지 않는다")과 정확히 같은 안전한 쪽이다.

**구현** (`cli/src/adapters/fastapiDependencyAdapter.ts`):
- `stripCommentsAndStrings(text)`(신규): triple-quoted 블록 전체 제거 → 줄 단위로 문자열 리터럴 제거 →
  남은 첫 `#` 기준으로 줄 자르기, 이 순서로 처리. **순서가 중요하다**: 문자열을 먼저 제거하기 때문에
  `x = "#"; app.include_router(router)` 같은 줄에서 `"#"` 안의 `#`가 주석 시작으로 오인되지 않는다
  (naive하게 raw 줄에서 첫 `#`를 바로 자르는 방식이었다면 이 줄의 진짜 mount 호출까지 지웠을 것 —
  commander가 그 실패 형태를 미리 지적했고, 순서를 바꿔 피했다).
- `isRouterMounted()`에 **모호성 검사 추가**: `name`을 `= APIRouter(...)`로 바인딩하는 파일이 root
  파일 말고 **또 있으면**, mount 여부와 무관하게 `found: false`로 처리(그 이름은 워크스페이스 전체에서
  모호하다는 뜻). 두 검사(mount 텍스트 검색, 바인딩 충돌 검사) 모두 `stripCommentsAndStrings`를 거친
  텍스트에 대해 수행.
- 코드 주석을 "bare identifier만 매칭하는 게 deliberate"에서 "동적 등록을 안 잡는 것만 deliberate이고,
  이름 충돌·주석·문자열을 걸러내는 건 원래 의도가 아니라 이번에 고친 부작용"으로 정정.

**fixture 6개 신규**: `mounted_router.py`(정상 매치 회귀 고정 — 유일하게 mount되고 충돌 없는 router는
여전히 edge가 생겨야 함), `commented_out_router.py`, `docstring_mention_router.py`,
`string_literal_router.py`(오탐 형태 3건), `collision_router_unmounted.py`/`collision_router_mounted.py`
(리뷰어의 이름 충돌 — 둘 다 unresolved가 나와야 하고, **진짜 mount된 쪽도 예외 없이** unresolved다).
테스트 6개: guard fixture 5개가 baseline(`orphan_router.py`)과 **message 텍스트까지 동일**한지 데이터
기반 루프로 검증, `mounted_router.py`는 정상 edge가 그대로 나오는지 검증.

**non-vacuity 직접 검증**: 새 fixture들이 다른 이유로 우연히 통과하는 게 아님을 실제로 되돌려 확인했다
— `isRouterMounted()`를 임시로 고치기 전 버전(bare `include_router(name` 텍스트 검색, stripping도
ambiguity 검사도 없음)으로 되돌리고 재빌드·재실행: **새 guard 테스트 5개 전부 실패**(주석·docstring·
문자열·이름 충돌 2건 — 전부 잘못된 edge 1개씩 생성하며 실패), 반면 `mounted_router.py` 회귀 테스트와
기존 corpus 3(a)/(b)/app 회귀 테스트는 **그대로 통과**(새 메커니즘과 무관함을 확인). 이후 수정을
정확히 복원(`diff`로 원본과 byte-identical 확인)하고 재빌드·전체 재실행 — **343 pass, 3 skip, 0
fail.**

**잡히는 것과 남는 한계 (commander 지시: "고쳤다"가 아니라 "어디까지 고쳤다")**:
- 잡힘: 주석 처리된 mount 호출, docstring 안 언급, 문자열 리터럴 안 언급, 서로 다른 파일의 동명이인
  router 바인딩 충돌(양쪽 다 unresolved 처리).
- 남는 한계: `stripCommentsAndStrings`는 Python lexer가 아니다. 알려진 미해결 형태:
  f-string 안에 중첩된 quote(`f"...{'#'}..."`류)나 삼중따옴표 안에 이스케이프된 삼중따옴표가 있는
  극단적인 경우는 완전히 정확하지 않을 수 있다. 모듈 속성 접근(`users.router`)이나 alias 변수
  (`users_router`)로 mount하는 흔한 다중 모듈 layout은 **이전부터, 그리고 지금도** bare-identifier
  패턴에 안 걸려 unresolved로 나간다(이번 수정이 만든 회귀가 아니라 기존 한계 — commander가 사전에
  측정: 이 형태들은 지금도 이미 매치 안 됨). import 연결을 실제로 추적하는 (A) 방향은 이번에 채택하지
  않았고, 채택 시 Python import 해석을 부분 구현해야 해 같은 계열의 새 오탐을 만들 위험이 있다는 게
  이번 판단의 근거였다 — 다음에 이 부분을 넓히려면 이 판단부터 재검토해야 한다.

### CI 회귀 — Windows 3개 job 실패, 원인은 이번 수정 자체의 새 버그였다

`aacb7ec` push 후 PR #73 CI에서 `clangd`/`gopls`/`cli:test`의 **windows-latest 3개 job만** 실패,
macOS·Linux는 전부 통과. 실패 지점은 정확히 새로 추가한 회귀 테스트 하나: `mounted_router.py`(충돌도
comment/string 트릭도 없는, 유일하게 mount된 정상 케이스)의 `augmentedEdges.length`가 기대한 1이 아니라
0 — 즉 **이 수정 자체가 Windows에서 정상 케이스까지 unresolved로 오분류**하고 있었다.

**추적**: `isRouterMounted()`의 신규 ambiguity 검사가 `path.resolve(file) !== resolvedRootFile`로 "이
파일이 root 파일이 맞는지"를 비교하는데, 두 경로의 출처가 다르다 — `rootFile`은
`fileURLToPath(input.root.uri)`(root의 `uri`는 **bundled-pyright LSP 서버가 응답한 값**이고,
`vscode-uri` 계열 라이브러리의 관행대로 Windows drive letter를 **소문자**로 반환하는 경우가 흔하다),
반면 workspace 순회 중의 `file`은 `path.join(workspace, ...)`(CI 로그에 실측된 실제 작업 디렉터리
`D:\a\Impact-Lens\Impact-Lens` — **대문자** `D`)로 만들어진다. `path.resolve()`는 대소문자를
정규화하지 않으므로(파일시스템을 아는 함수가 아니라 순수 문자열 유틸리티), `d:\...`와 `D:\...`가
strict `!==`로 다른 파일 취급되고, **root 파일 자신의 router 바인딩이 "다른 파일의 동명이인
바인딩"으로 오인**돼 매번 ambiguous 처리됐다 — 오직 Windows에서만, drive letter가 있는 플랫폼이라서.

이 저장소의 기존 관례(`impact.ts`의 `isOutside()`가 `path.relative(path.resolve(a),
path.resolve(b))`를 쓴다)를 살펴봤지만, 그 함수는 대소문자를 맞춰 주지 않는다(Node의 `path` 모듈은
파일시스템의 대소문자 무시 규칙을 모른다) — 이번 문제는 대소문자 정규화가 필요한 경우였다.

**수정**: `sameFile(a, b)` 신규 — `path.resolve()` 후 `process.platform === 'win32'`일 때만
소문자로 비교(Windows/NTFS는 대소문자를 구분하지 않는다는 사실에 근거, Linux/macOS는 기존 strict
비교 유지). `path.resolve(file) !== resolvedRootFile` 자리를 `!sameFile(file, rootFile)`로 교체.

**검증**: 로컬(macOS) 재빌드·전체 재실행 — 343 pass, 3 skip, 0 fail(이 플랫폼은 애초에 이 버그를
재현하지 않으므로 로컬 실행만으로는 Windows 수정 자체를 증명 못 한다 — **Windows CI 재실행 결과로
확인 예정**, 아직 주장하지 않음). **이후 Windows CI 12개 전부 재실행해 통과 확인함**(commander에게도
보고, PR #73 `CLEAN`/`MERGEABLE`로 전환).

## 리뷰어 발견 A·B — mount 확인이 여전히 안전하지 않은 두 방향

리뷰어가 corpus 3 수정을 fixture로 재현: 서로 다른 두 파일이 각각 `router = APIRouter()`를 갖고
하나만 mount되면 **mount 안 된 쪽에도 edge가 생긴다.** commander가 독립적으로 격리 스크립트로 같은
검사를 실행해 **리뷰어가 안 짚은 오탐 형태 셋을 추가로 찾았다**(주석 처리된 mount, docstring 언급,
문자열 리터럴 언급) — 전부 `stripCommentsAndStrings`가 이미 처리하는 형태였지만, **truncate와
binding 형태에서 남은 위험 둘**을 별도로 지적했다.

### A(심각, merge 차단) — truncate된 검색이 부정 주장을 뒷받침하면 안 된다

**직접 재현**(먼저 재현 후 판단하라는 지시대로): `maxFiles`를 1로 임시로 낮추고, root 파일 자신이
router를 정의·자기-mount하는 fixture(`a_root_and_mount.py`)와, **같은 이름을 바인딩하는 별도 파일**
(`z_collision_router.py`, 알파벳 순으로 뒤에 오게 이름 지음)을 워크스페이스에 둔 뒤 실행 —
**`augmentedEdges`에 edge가 실제로 생겼다**, `augmentation_budget_exceeded`가 동시에 떠 있는데도.
walk가 root 파일 하나만 보고 끝나 `z_collision_router.py`의 진짜 충돌을 못 본 채 "충돌 없음"으로
결론 낸 것 — commander의 진단이 실측으로 확인됐다.

**원인**: `mountFound`(긍정 주장, truncate돼도 안전 — 못 찾으면 그냥 못 찾은 것)와 `nameAmbiguous`
불린 부정(`!nameAmbiguous`, "다른 어떤 파일도 이 이름을 안 쓴다")의 성질이 다른데 똑같이 취급했다.
truncate된 walk는 **부정 주장을 뒷받침할 근거가 없다**(안 본 파일에 충돌이 있었을 수 있음).

**수정**: `isRouterMounted()`의 반환을 `found: mountFound && !nameAmbiguous && !walkState.truncated`로 —
truncate되면 무조건 unresolved. 큰 프로젝트에서 비용이 커질 수 있다는 게 commander의 지적인데, stage
1 계약 5번("확정 불가면 edge를 안 만든다")과 정확히 같은 방향이라 그 비용을 받아들였다.

**검증**: 같은 재현 시나리오에서 수정 후 재실행 — `augmentedEdges: []`, 두 limitation
(`augmentation_budget_exceeded`/`framework_route_mount_unresolved`) 모두 뜸. 원래 예산(200)으로
복원 후 전체 재실행 — 정상.

### B(같은 라운드) — binding pattern이 흔한 두 형태를 놓쳤다

commander가 격리 실행으로 확인: `router: APIRouter = APIRouter()`(타입 주석)와 `router =
fastapi.APIRouter()`(모듈 경유)가 **원래 bindingPattern에 안 걸렸다** — corpus 1이 경고한 것과
정확히 같은 형태("fixture가 코드가 다루는 모양만 써서" 통과). 직접 재현(격리 정규식 스크립트)으로
동일하게 확인.

**수정**: `bindingPattern`에 선택적 타입 주석(`(?:\s*:\s*[^=\n]+)?`)과 선택적 모듈 접두
(`(?:\w+\.)*`)를 추가. `except SomeError as e` 같은 무관 구문과 안 겹치는지도 확인(이건 `bindingPattern`이
아니라 alias 쪽 우려였지만 같은 종류의 위험이라 함께 점검).

**fixture 4개 신규**(`collision_typed_unmounted/mounted.py`, `collision_qualified_unmounted/mounted.py`),
**non-vacuity 확인**: `bindingPattern`만 narrow 버전으로 되돌려 재실행 — **"다른 파일이 exotic
형태를 쓰는" 방향 2개만 정확히 실패**(같은 파일이 exotic 형태를 쓰는 반대 방향은 기존에 이미 걸리던
plain 형태 매치라 안 바뀜 — 예상과 일치). 복원 후 재검증 — 21개 전부 통과.

**`sameFile()`에도 위험 방향 기록**: win32 소문자 비교가 반대 방향 오류(대소문자만 다른 진짜 별개
파일을 같다고 오판)를 낼 수 있다는 것을 주석에 명시(commander 지적 — case-sensitive NTFS라는 드문
전제가 필요해 받아들일 만하다고 판단했지만, 방향을 숨기지 않는다).

## 리뷰어·commander가 짚은 검증 공백 둘 — mount 버그를 놓친 것과 같은 형태

commander가 mount 버그와 같은 메커니즘("fixture가 코드가 다루는 모양만 쓴다")으로 **fixture가 아예
그 코드 경로를 부르지도 않는** 곳 둘을 찾았다. 우선순위 A→B→1→2(→3)로 처리.

### 1. import alias 추적 — commander 예상보다 더 깊이 깨져 있었다

commander의 격리 정규식 실행: alias는 **import 목록 첫 번째일 때만** 감지되고, **괄호 여러 줄
import**(black/isort 기본 출력 형태)는 전혀 안 잡힌다. 직접 재현으로 동일 확인.

**정규식을 넓힐지 판단**: 넓히지 않기로 결정했다 — `import` 앵커를 없애고 이름만으로 매칭하면
`except SomeError as e`(import와 무관한 Python 문법) 오탐 위험이 생긴다는 걸 **직접 실행으로
확인**(`except get_db as db:`가 이름-only 패턴에 매칭됨). 안전한 false negative를 위험한 false
positive로 바꾸는 방향이라 거부. 주석을 실제 범위("첫 자리 단일 줄만")로 정정.

**그런데 fixture를 만들다가 이보다 깊은 결함을 발견했다**: `localNames`가 **root 파일 자신의
텍스트에서** 계산되고 있었다 — alias는 **가져다 쓰는(consumer) 파일**의 속성인데, root는 자기 자신을
import하지 않으므로 이 메커니즘은 **애초에 alias를 하나도 못 찾는 구조**였다(narrow냐 wide냐의
문제가 아니라 완전히 다른 파일을 보고 있었음). "caught" 방향 fixture를 만들어 직접 재현: 0 edge.

**1차 수정**(파일 스코프 교정) 후에도 여전히 0 edge — **두 번째, 더 깊은 원인**을 발견: pyright의
`prepareCallHierarchy`가 **alias 사용 지점(`Depends(target_alias)`의 `target_alias`)에서 원본
심볼로 안 이어진다** — alias 자신의 독립된 symbol identity를 반환한다(`name`도 "target_alias",
`id`도 root와 다름 — 직접 쿼리로 확인). 반면 **import 문 안의 원본 이름(`alias_target_fn`) 자신의
위치**에서 `prepare()`하면 root로 정확히 resolve된다(직접 쿼리로 확인).

**2차 수정**(진짜 fix): `aliasBindingsFor()`가 alias 이름 대신 **import 문의 원본 이름 위치**를
반환하도록 재설계 → 그 위치에서 `prepare()`로 검증 → 검증된 alias만 `localNames`에 추가. 검증된
alias로 찾은 `Depends(alias)` 참조는 참조 지점에서 재검증하지 않는다(어차피 실패하므로) — import
문에서 이미 provider로 검증했다는 사실을 신뢰한다. 이 과정에서 **잠재 버그 하나 더** 발견: edge의
evidence range 길이가 `input.root.name.length`로 고정돼 있어 alias(길이가 다름)에 적용하면 범위가
어긋났다 — `reference.name.length`로 교체.

**fixture 3개**(`alias_target.py`, `alias_caught_consumer.py`, `alias_uncaught_consumer.py`), 테스트
1개(잡히는 것 1개 + 안 잡히는 것 1개를 edge count로 함께 검증). **non-vacuity**: 전체 변경분을
되돌려 재실행 — 정확히 이 테스트 1개만 실패(21/22), 나머지 전부 통과(A·B 변경은 안 건드렸다는 것도
같이 확인). 복원 후 348/348.

### 2. `resolution: 'multiple'` — fixture를 못 만들었다, 근거 기록

`resolved.items.length > 1 ? 'multiple' : 'single'` 분기를 실제로 타는 테스트가 없다는 지적 확인 —
`grep`으로 재대조, `'single'` 단언만 2건, `'multiple'`은 0건.

**시도**: 가장 자연스러운 Python 패턴(조건부 재정의 — `if cond: def f(): ... else: def f(): ...`)으로
throwaway fixture를 만들어 실제 pyright에 직접 쿼리 — `Depends(multi_get_db)` 참조 지점에서
`prepare()`한 결과 **`nodes.length === 1`**(마지막에 정의된 쪽 하나만 resolve, 두 후보를 안 냄).
**pyright가 이 패턴에서 ambiguity를 노출하지 않는다는 것을 직접 확인했다.**

**억지로 만들지 않는다** — commander 지시대로. `@typing.overload`처럼 다른 구성도 있지만, 그건 타입
스텁 선언이지 "런타임에 실제로 여럿 중 하나가 선택되는" 상황과 성질이 달라 이 corpus 항목의 의도와
안 맞을 수 있어 시도하지 않았다. **stage 3로 미룬다** — pyright가 실제로 다중 후보를 내는 조건을
더 조사하거나, provider mock으로 우회 검증하는 방법을 그때 검토한다. 이 항목(작업 로그의 이 절)이
그 기록 위치다.

### 3. 중첩 dependency(sub-dependency) — fixture 없음, 별도 코드 경로 아님

gate가 "sub-dependency(중첩 dependency)"도 요구하는데 fixture가 없다. commander 판단대로 **별도
코드 경로가 아니라 같은 `Depends()` 탐색이 한 단계 더 도는 것**(예: `get_db`가 자기 `Depends(get_config)`를
가짐)으로 보인다 — `findEnclosingDef`가 이미 임의 깊이의 enclosing function을 찾고, `Depends()` 검색은
파일 단위로 이미 재귀적이라 추가 코드 변경 없이도 동작할 가능성이 높다. **fixture로 직접 확인하지는
않았다** — stage 3(마일스톤 종료 판정)에서 재확인 필요. 이 절이 그 기록 위치다.

## 남은 것 (갱신)

- **corpus 2(조건부 대입)·4a(같은 세션 dedupe)**: 앞서 기록한 대로 미구현, 심각도가 달라 연기.
- **`resolution: 'multiple'` fixture**: 위 "2" 참고 — pyright가 조건부 재정의에서 ambiguity를
  안 내는 것을 확인했고, 다른 구성은 stage 3에서 재검토.
- **중첩 dependency fixture**: 위 "3" 참고 — 별도 코드 경로는 아닌 것으로 보이나 fixture로 미확인,
  stage 3에서 재확인.
- decorator-level·router-level dependency 선언은 의도적 범위 제외(기존 기록 그대로).
- corpus 4b(환경 간 표현 일관성) — 기존 기록대로 아직 미결.
- **`maxFiles: 200`(`cli/src/adapters/index.ts`의 `DEFAULT_BUDGET`) 재검토 — commander 리뷰 3라운드
  발견**: A 수정(truncate → 무조건 unresolved) 이후 이 상수의 의미가 바뀌었다. 이전에는 truncate가
  "mount를 못 찾을 수도 있음"(부분 열화)이었지만, 지금은 **"소스 `.py`가 `maxFiles`를 넘는
  workspace에서는 route mount를 절대 확정할 수 없다 — 그 workspace의 plain-`APIRouter()` route
  edge가 전부 안 나온다"**로 강화됐다(`.py` 카운트는 `IGNORED_DIRECTORIES` 제외 후 기준이라
  `venv`/`site-packages`는 예산을 안 먹는다는 것도 확인됨). 200은 옛 의미 기준으로 정해진 값이라 이
  강화된 의미로 재검토된 적이 없다. **지금 값을 올리지 않는다** — 예산은 latency와 맞바꾸는 것이고
  그 판단은 stage 3의 일이다. 이 기록 자체가 산출물이다(값을 지금 결정하지 않는다는 게 아니라, 재검토
  없이 남아 있다는 사실을 남긴다).
- **plugin skill·`cli-contract.md` 문서화 — "stage 3 후보"가 아니라 "augmentation을 기본 on으로
  바꾸기 전 필수 선행" (리뷰어 발견, commander 확인)**: 이 PR이 `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`,
  `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`를 전혀 안 건드렸다는 것을
  직접 확인했다(`grep -c`로 `augmentedEdges`/`augmentationEnabled`/`framework_route_mount_unresolved`/
  `augmentation_budget_exceeded` 전부 0건). **지금은 문제가 아니다** — kill switch 기본값이 off라서
  (`options.get('augmentation') === true`, `value.augmentationEnabled === true` 둘 다 strict
  비교이므로 미지정은 off) augmentation을 안 켜면 응답에 이 필드들이 아예 없고, 그걸 모르는 agent가
  오해할 대상 자체가 없다. **문제는 augmentation을 실제로 켜는 순간**이다 — 그때 agent(plugin skill을
  통해 이 CLI를 쓰는 소비자)는 `augmentedEdges`가 뭔지, `framework_route_mount_unresolved`/
  `augmentation_budget_exceeded`가 무슨 뜻인지 배운 적 없이 응답을 읽는다. **이 마일스톤이 막으려는
  것이 정확히 "추측이 확정으로 읽히는 것"인데, 그걸 읽을 소비자가 그 구분을 아예 배운 적이 없는
  상태가 된다.** 그래서 이건 다른 "미확인/미구현" 항목들과 다르게, **stage 3에서 여유 있을 때
  다루는 후보가 아니라 augmentation의 기본값을 off에서 on으로 바꾸는 결정 이전에 반드시 끝나 있어야
  하는 선행 조건**으로 남긴다.
