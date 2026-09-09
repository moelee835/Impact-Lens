# M4: augmentation adapter 실패를 정적 그래프로부터 격리

- 상태: 구현·검증 완료, PR 대기
- branch: `fix/m4-augmentation-failure-isolation`
- 선행: PR #95(`dynamic-callback-static-v1`, 두 번째 adapter) merge 완료 — 이 lane이 닫는 gap이
  두 번째 adapter로 throw 표면이 두 배가 됐다는 사실이 이 lane을 지금 시점으로 당긴 근거.
- 근거 문서: `docs/work/task-m4-milestone-closure-audit.md`의 **Gate 1**의 세 항목 중 "보조 분석
  실패가 기존 정적 그래프를 실패시키지 않는다" 하나. 이 lane은 그 항목만 닫는다 — gate 1 전체는
  나머지 두 항목(IL-LIM-001·010 Backlog, `runtime-observation` producer 부재) 때문에 계속 열림
  (아래 "M4 종료 gate 감사와의 관계" 참고).

## 목적과 사용자 가치

**지금 상태**: 등록된 adapter 중 하나가 예외를 던지면 그 예외가 `runAugmentation()`을 호출한 두
host(`cli/src/impact.ts`, `src/impactAnalyzer.ts`) 밖으로 그대로 전파되어, 이미 계산되어 있던
정적 call-hierarchy 그래프(`nodes`/`edges`)까지 포함한 요청 전체가 실패한다. 사용자 입장에서는
"augmentation이라는 부가 기능 하나가 잠깐 문제가 생겼다"가 아니라 "impact 분석 자체가 실패했다"로
보인다 — 두 기능의 신뢰 수준이 다른데 실패 시 뭉뚱그려진다.

adapter가 지금 하나(`fastapi-static-v1`)에서 둘(`dynamic-callback-static-v1` 추가, PR #95)로 늘며
이 gap의 throw 표면이 두 배가 됐고, `FrameworkAdapter`/`AdapterInput`의 SPI 주석이 "세 번째 adapter"
를 이미 전제하고 있어 이 gap은 adapter가 늘수록 커지기만 한다. 지금 닫아야 다음 adapter(Spring 등)
설계자가 "실패하면 어떻게 되는지"를 걱정하지 않고 adapter 본문에만 집중할 수 있다.

이 PR이 끝나면: adapter 하나(또는 `runAugmentation()` 자신)가 예외를 던져도 정적 그래프는 항상
살아남고, 사용자는 `limitationDetails`에서 어떤 adapter가 실패했는지(또는 orchestration 자체의
내부 오류인지)와 실패의 종류(예외 이름)를 알 수 있다 — 단, 예외 메시지 원문(파일 경로, symbol
이름을 담을 수 있음)은 절대 노출하지 않는다(IL-LIM-001 rollout 항목 준수).

이 PR 이후에도 남는 것: 이 lane은 예외 격리만 다룬다. adapter 자체의 오탐/누락 정확도는 다루지
않고, Java/Kotlin/Spring adapter 구현도 다루지 않는다(별도 lane, 이 PR 다음 순서).

## 설계 — commander 승인 사항 요약(승인 근거는 커밋 메시지에 링크)

1. **격리 위치는 `runAugmentation()` 자신의 for-loop 안, adapter별로.** 호스트 콜사이트만 감싸면
   한 adapter의 throw가 같은 실행의 다른 adapter 결과까지 날린다 — 두 adapter가 있는 지금 이건
   실제로 지킬 수 있는 성질이 아니게 된다. 추가로 두 host의 `await runAugmentation(...)` 콜사이트도
   감싸 `runAugmentation()` 자신의 loop 바깥 버그(adapter 코드가 아닌 orchestration 자체의 버그)에
   대비한다.
2. **catch 범위는 블랭킷.** `resolveEndpoint()`의 기존 선례(모든 `prepare()` 예외를 삼켜 no-match로
   접음)와 대칭이고, gate 4의 완전성 논증("재확인 실패는 예외를 포함해 언제나 포기로 접힌다")의
   연장이다. adapter의 역할 자체가 "확정 못하면 edge를 안 만든다"이므로 예외도 같은 종류의
   "확정 실패"로 취급한다.
3. **limitation 코드는 둘로 분리한다** (commander 지적 — 안 그러면 우리 orchestration 버그가
   영원히 "adapter가 좀 힘들었나 보다"로 읽힌다):
   - `augmentation_adapter_failed` — adapter의 `run()` 자체가 던짐. adapter id별로 기록.
   - `augmentation_internal_error` — `runAugmentation()`의 loop 바깥(orchestration 자체)에서
     던짐. 이건 우리 코드의 버그이지 adapter의 한계가 아니다.
4. **두 코드 모두 `scripts/lib/response-policy-engine.mjs`의 `LIMITATION_SURFACE_PATTERNS`에
   등록한다.** 이 마일스톤이 정확히 이 함정을 한 번 밟았다(gate 4 재개방 lane,
   `docs/work/task-m4-gate4-mount-false-positive.md` finding 5) — `augmentation_budget_exceeded`/
   `framework_route_mount_unresolved`를 등록 없이 도입해서, 계약이 권장하는 표현 그대로 정직하게
   공개한 요약이 `missing_high_severity_disclosure`로 오탐났다. 두 코드 모두 `severity: 'warning'`
   이라 `highSeverityLimitations()`가 포함하는 경로를 그대로 탄다. **등록 후 실행으로(fixture 하나
   추가해서) 확인한다 — 읽어서 확인 아님.**
5. **limitation detail 내용의 경계**: adapter id만으로는 부족하다(예외였는지 정말 매치가 없었는지
   구분 안 됨) — 그래서 `error.name`(예: `TypeError`, `RangeError`)을 담는다. 하지만 예외 메시지
   원문은 담지 않는다 — `IL-LIM-001` rollout 항목이 "사용자 코드나 symbol 이름을 전송하지 않고
   adapter 시간, 후보·채택·거부 수만 남긴다"고 못박아 뒀고, 예외 메시지에는 파일 경로/symbol
   이름이 들어갈 수 있다. **종류(kind)는 담고 내용(content)은 담지 않는다.**
6. **`ADAPTERS` 주입 가능**: `runAugmentation()`에 마지막 옵션 파라미터(기본값 현재 `ADAPTERS`)를
   추가 — 기존 두 host 호출은 코드 변경 없이 그대로 default를 쓰고, 테스트만 throw하는 stub
   adapter를 주입한다.
7. **테스트는 rollback 계약과 같은 극성으로 쓴다** — "정적 graph가 살아남는다"가 아니라, M4 stage
   1의 rollback 계약 테스트가 쓰는 형태("달라도 되는 필드만 지우고 나머지 전부를 비교한다")를
   그대로 적용한다: **adapter가 던졌을 때의 응답이, augmentation을 끈 응답과
   `augmentedEdges`/`limitationDetails`(및 그로부터 파생되는 `limitations` 문자열)를 제외하면
   완전히 같은지** 바이트 단위로 단정한다. "살아남았다"는 통과시키기 쉽고 "한 글자도 안 달라졌다"는
   어렵다 — 이 lane이 지키려는 성질은 후자다.

## 구현 지점 (실측, 이 문서 작성 중 직접 확인)

- `cli/src/shared/adapters/index.ts`
  - `AugmentationResult`에 `failedAdapterIds`류 필드 추가 — adapter id + errorKind 쌍의 배열.
  - `runAugmentation()`의 `for (const adapter of ADAPTERS)` loop 안, `await adapter.run(...)`
    호출을 try/catch로 감싼다. catch에서 `edges`/`budgetExceeded`/`mountUnresolved`는 건드리지
    않고(이 adapter의 기여가 없었던 것으로 취급), `{ adapterId: adapter.id, errorKind: error
    instanceof Error ? error.name : 'unknown' }`을 실패 목록에 push하고 다음 adapter로 계속 진행.
  - loop 진입 전/후, 함수 본문 나머지에서 던질 수 있는 부분(현재는 없어 보이지만 향후 방지)까지
    포함해 함수 전체를 얇게 감싸는 두 번째 계층은 두지 않는다 — "loop 바깥"의 진짜 의미는 이 함수를
    호출하는 host 코드 자신의 버그이지 이 함수 내부 코드가 아니므로, 내부 계층을 하나 더 두면
    `augmentation_internal_error`가 무엇을 가리키는지 모호해진다. `augmentation_internal_error`는
    **host의 `await runAugmentation(...)` 호출 자체**를 감싸는 try/catch에서만 발생시킨다(항목
    8 참고). *(이 결정은 6번 설계 판단을 그대로 따른 것 — loop 안 = adapter 원인, host 콜사이트 =
    orchestration 원인, 두 계층이 절대 겹치지 않게.)*
  - `runAugmentation(...)`의 시그니처 끝에 `adapters: readonly RegisteredAdapter[] = ADAPTERS`
    파라미터 추가.
- `cli/src/impact.ts:104`의 `const augmentation = await runAugmentation(...)`을 try/catch로
  감싼다. catch 시 `augmentation`을 빈 결과로 대체하고(`edges: []`, 나머지 빈 배열들), 별도로
  `internalErrorKind`를 기록해 아래 `observations`에 흘려보낸다.
- `src/impactAnalyzer.ts:181`의 `augmentedEdges` 계산도 동일하게 감싼다 — 이쪽은 `.edges`만 뽑아
  쓰므로 catch 시 `[]`로 대체하고 `augmentationLimitations`(177번 줄 근처, 이미 있는 배열)에 코드를
  push하는 기존 패턴을 그대로 재사용한다(이 host는 `limitationDetails` 구조 자체가 아직 CLI만큼
  안 갖춰져 있어 문자열 코드 배열에 맞춘다 — 기존 `augmentation_unsupported_workspace` push와 같은
  자리).
- `cli/src/types.ts`의 `AnalysisObservations`에 `augmentationAdapterFailed?: readonly
  AugmentationAdapterFailure[]`와 `augmentationInternalError?: AugmentationInternalError` 추가
  (기존 `augmentationBudgetExceeded`/`augmentationMountUnresolved` 옆). **실행 중 발견한 함정**:
  처음엔 이 두 필드를 인라인 object 타입(`readonly { adapterId: string; errorKind: string }[]`)으로
  썼는데, `stateReachability.sources.test.ts`의 필드-인벤토리 검사가 `interface
  AnalysisObservations { ... }` 본문 전체를 정규식으로 훑어 모든 `readonly <name>:`을 최상위
  필드로 간주해서, 중첩된 `adapterId`/`errorKind`가 분류 안 된 유령 필드로 잡혀 테스트가 실패했다
  (읽어서 예측한 게 아니라 `npm run cli:test` 실행 후 발견). `AugmentationAdapterFailure`/
  `AugmentationInternalError`를 그 interface 밖에 이름 있는 타입으로 선언해 해결 — `cli/src/
  shared/adapters/index.ts`의 `AugmentationResult.failedAdapters`도 같은 타입을 재사용(중복 정의
  대신 `types.ts`에서 import, `compileDatabase`가 이미 쓰는 "types.ts는 의존성 없는 base layer"
  원칙을 그대로 따름).
- `cli/src/test/stateReachabilityClassification.ts`의 `CLASSIFIED_OBSERVATION_FIELDS`/
  `OBSERVATION_FIELD_PRODUCER`에 두 필드를 `has-producer`/`analyze-caller`로 추가 — 안 하면 위
  필드-인벤토리 검사가 "분류 안 된 필드"로 그대로 실패한다(실행으로 확인).
- `cli/src/coverage.ts`에 `augmentationAdapterFailedDetails()`/`augmentationInternalErrorDetails()`
  추가, `augmentationBudgetDetails()`/`mountUnresolvedDetails()`와 같은 자리에서 호출.
- `scripts/lib/response-policy-engine.mjs`의 `LIMITATION_SURFACE_PATTERNS`에
  `augmentation_adapter_failed`/`augmentation_internal_error` 패턴 추가, `docs/work/task-m4-gate4-
  mount-false-positive.md` finding 5가 쓴 것과 같은 방식(coverage.ts 메시지 문구 + 예상 자연어
  패러프레이즈 둘 다 커버)으로 작성. 새 fixture 2개(`27-*`, `28-*`)를 등록 **전** 상태로 실행해
  gate 4와 정확히 같은 모양의 `missing_high_severity_disclosure` 오탐을 재현한 뒤 등록·재확인함
  (뮤테이션 검증, 아래 "검증 계획" 참고).

## 검증 계획 — 실행 결과

- [실행, 완료] `cli/src/test/augmentationFailureIsolation.test.ts`(신규 파일, 5 테스트):
  - `runAugmentation()`에 stub adapter 배열 주입 — 하나만 throw → 살아남은 adapter의 edge는
    그대로, 실패한 adapter는 `failedAdapters`에 `{ adapterId, errorKind: 'TypeError' }` 하나로만
    기록.
  - 둘 다 throw → `edges: []`이지만 함수 자체는 던지지 않고 `failedAdapters` 2건으로 기록.
  - `Error`가 아닌 값(경로/심볼 이름이 든 문자열)을 throw → `errorKind: 'unknown'`으로만 기록되고
    내용은 어디에도 담기지 않음을 확인(rollout 항목의 "내용 금지" 경계를 직접 검증).
  - languageId가 안 맞는 adapter는 실행 자체가 안 되어 실패로 안 잡힘.
  - `analyzeImpact()` 레벨: `t.mock.method`로 `runAugmentation` export 자체를 throw하도록 교체 →
    augmentation 끈 baseline과 `nodes`/`edges`/`truncated`/`traversalLimits`/`complete`/`provider`/
    `coverage.traversal`/`coverage.indexing`가 완전히 같고, `augmentedEdges`만 `[]`,
    `limitationDetails`에 `augmentation_internal_error`만 있고 `augmentation_adapter_failed`는
    없음을 확인(rollback-parity와 같은 극성 — 달라도 되는 필드만 제외하고 나머지 전부 비교).
- [실행, 완료] 뮤테이션 검증 둘:
  1. `runAugmentation()`의 `try`/`catch`를 `if (true)`로 바꾸고 catch 블록 제거 → 위 5개 테스트 중
     throw를 실제로 일으키는 3개(단일 실패/이중 실패/비-Error 값)만 정확히 실패, 나머지 2개(언어
     불일치, 호스트 레벨)는 그대로 통과 — 원복 후 5개 전부 재통과 확인.
  2. `impact.ts`의 외곽 `try`/`catch`를 `if (true)`로 바꾸고 catch 제거 → `analyzeImpact()` 테스트
     하나만 정확히 실패(`TypeError: synthetic orchestration failure`가 그대로 전파), 나머지 4개는
     영향 없음 — 원복 후 재통과 확인.
- [실행, 완료] `response-policy-engine`에 fixture 2개(`27-*`/`28-*`) 추가. 등록 **전** 상태로
  `npm run test:response-policy` 실행 → gate 4와 동일한 모양의 `missing_high_severity_disclosure`
  오탐을 실제로 재현(패턴 삭제 → 두 fixture 모두 FAIL, 정확히 그 코드로) → 패턴 복원 후 28개
  fixture 전부(신규 2개 포함) pass, 총 36 checks pass.
- [실행, 완료] `rm -rf out cli/dist` 후 `npm run cli:test`(448/448 pass, 3 skip 그대로),
  `npm test`(84/84 pass), `test:response-policy`(36/36), `test:vsix-contents`(경고 없이 통과) 전부
  재확인.
- [실행, 완료] `npx tsc --noEmit` 양쪽(`cli/`, 루트) 타입 검사 통과 — `AnalysisObservations`
  필드 타입 변경이 두 host 모두에서 깨지지 않음을 확인.

## M4 종료 gate 감사와의 관계

`docs/work/task-m4-milestone-closure-audit.md`의 판정표 gate 1("IL-LIM-001·002·010 수용 기준
통과")은 세 개의 독립된 미해결 항목을 안고 "열림"이었다 — (1) IL-LIM-001·010 story 전체가
`Backlog`, (2) `runtime-observation` 값을 실제로 만드는 producer가 없음, (3) 보조 분석 실패가
기존 정적 그래프를 실패시키는 문제(이 lane이 다루는 것). 이 PR은 **(3)만** 닫는다 — (1)·(2)는
손대지 않으므로 **gate 1 전체는 이 PR 이후에도 여전히 "열림"으로 남는다**. 같은 PR에 감사 문서의
Gate 1 상세 절에 정정 하나를 추가해 이 구분을 정확히 기록한다(원문 보존, 날짜 정정 관행, gate
4가 "수용된 잔여 1건을 안고 닫힘"이라고 정확히 구분해 적은 선례와 같은 방식) — 열린 발견 중
일부가 닫혔다고 전체가 조용히 닫힘으로 읽히면 안 된다는 것이 commander의 지적.
