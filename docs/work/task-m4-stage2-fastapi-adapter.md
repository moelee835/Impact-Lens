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

### 남은 것

- `git status`가 보여주는 변경분(신규 `cli/src/adapters/` 3개 파일, fixture 3개, 수정 8개 파일 + 이
  문서)은 아직 커밋되지 않음 — 이 작업 로그 직후 커밋·push 예정.
- decorator-level(`dependencies=[Depends(target)]`)·router-level(`APIRouter(...,
  dependencies=[...])`) 선언은 이 패스가 다루지 않음(구현 docstring에 명시된 의도적 범위 제외, 누락
  아님).
- 환경 간 표현 일관성(corpus 4b, clangd 17 vs 23에서 같은 관계가 `edges`/`augmentedEdges` 중 어디에
  나타나는지) — handover에 기록된 대로 아직 미결.
