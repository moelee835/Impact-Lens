# M4: augmentation adapter 실패를 정적 그래프로부터 격리

- 상태: 진행 중
- branch: `fix/m4-augmentation-failure-isolation`
- 선행: PR #95(`dynamic-callback-static-v1`, 두 번째 adapter) merge 완료 — 이 lane이 닫는 gap이
  두 번째 adapter로 throw 표면이 두 배가 됐다는 사실이 이 lane을 지금 시점으로 당긴 근거.
- 근거 문서: `docs/work/task-m4-milestone-closure-audit.md`의 **Gate 1(실패 격리)** — "보조 분석
  실패가 기존 정적 그래프를 실패시키지 않는다"가 열림으로 판정된 항목. 이 lane은 그 gate를 닫는다.

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
- `cli/src/types.ts`의 `AnalysisObservations`에 `augmentationAdapterFailed?: readonly {
  adapterId: string; errorKind: string }[]`와 `augmentationInternalError?: { errorKind: string }`
  추가(기존 `augmentationBudgetExceeded`/`augmentationMountUnresolved` 옆).
- `cli/src/coverage.ts`에 `augmentationAdapterFailedDetails()`/`augmentationInternalErrorDetails()`
  추가, `augmentationBudgetDetails()`/`mountUnresolvedDetails()`와 같은 자리에서 호출.
- `scripts/lib/response-policy-engine.mjs`의 `LIMITATION_SURFACE_PATTERNS`에
  `augmentation_adapter_failed`/`augmentation_internal_error` 패턴 추가, `docs/work/task-m4-gate4-
  mount-false-positive.md` finding 5가 쓴 것과 같은 방식(coverage.ts 메시지 문구 + 예상 자연어
  패러프레이즈 둘 다 커버)으로 작성.

## 검증 계획

- [실행] 새 unit test(`cli/src/test/`): 두 stub adapter 중 하나만 throw하는 `ADAPTERS` 배열을
  주입 → 살아남은 adapter의 edge는 그대로 있고, 실패한 adapter는 `augmentation_adapter_failed`
  detail 하나로만 나타나는지 확인.
- [실행] rollback-parity 스타일 테스트: 실제 CLI 프로세스를 두 번 실행(augmentation on, adapter
  하나가 throw하도록 조작된 workspace/설정 — 또는 index.ts 레벨 단위 테스트로 대체) 비교해
  `augmentedEdges`/`limitationDetails`/`limitations`를 제외한 나머지 필드가 바이트 단위로 같은지.
  M4 stage 1의 rollback 계약 테스트 형태를 그대로 차용.
- [실행] host-level 회귀: `runAugmentation` 자체가 throw하도록 만든(예: adapters 인자에 loop
  진입 전 던지는 것이 아니라, 함수 계약을 깨는 방식이 아니라 실제로는 이 경로가 도달 불가능할 수도
  있음 — 도달 가능한 경로를 못 찾으면 그 사실을 "찾지 못했다"고 기록하고 vi.mock/monkeypatch로
  강제 유발하는 테스트로 대체) 두 host 각각에서 정적 그래프가 살아남는지.
- [실행] `response-policy-engine`에 새 fixture 2개(코드별 1개) 추가 — 새 코드를 CLI 권장 문구
  그대로 공개한 요약이 `missing_high_severity_disclosure`로 오탐나지 않는지 실행으로 확인.
- [실행] `npm run cli:test`, `npm test`, `test:response-policy` 전부 green, `rm -rf out cli/dist`
  후 재확인.
- 뮤테이션: try/catch를 제거하거나 조건을 반대로 바꿔 각 새 테스트가 정확히 의도한 대로 실패하는지
  확인 후 원복·재확인(이 세션 전체의 비어있지-않음 규율).

## M4 종료 gate 감사와의 관계

이 PR이 merge되면 `docs/work/task-m4-milestone-closure-audit.md`의 **Gate 1(실패 격리)** 항목을
"닫힘"으로 갱신하는 정정을 같은 PR에 포함한다(원문 보존, 날짜 정정 관행) — 열린 발견이 조용히
사라지는 것과 명시적으로 닫히는 것은 다르다는 것이 commander의 지적.
