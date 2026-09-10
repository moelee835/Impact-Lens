# M4 IL-LIM-001/002: 인식했지만 못 좁힌 관계를 limitation으로 드러낸다 (branch `feat/il-lim-001-002-inference-limitations`)

- 상태: 설계 (구현 전 — commander 지시대로 설계안 보고 후 구현)
- 선행: gate 7(`docs/work/task-m4-gate7-real-code-measurement.md`) — 실제 참조의 약 40%가 조용히
  기각된다는 것을 실측. PR #100(`fastapi-static-v1`의 `classifyDependsReferenceContext` reject
  경로)과 PR #91 이전 gate 7 lane(`dynamicCallbackAdapter.ts`의 4채널 scope-blind 결함) 둘 다
  "인식했는데 조용히 버린다"는 같은 모양을 남겼다.

## 목적과 사용자 가치

**사용자가 겪는 문제.** augmentation이 어떤 관계를 인식은 했지만 확정 caller 하나로 좁히지
못하면, 지금은 아무 말 없이 그냥 사라진다. 사용자는 짧아진 "관련 caller" 목록을 보고 "영향이
여기까지구나"라고 읽지만, 실제로는 "우리가 못 푼 게 있었다"인 경우가 많다 — gate 7 실측으로
**실제 참조의 약 40%가 이렇게 사라진다**는 게 확인됐다. 이건 이 milestone이 반복해서 막아 온
실패 모양(짧아진 목록 = 조용한 기각)이 augmentation 기능 자체에 남아 있는 마지막 큰 구멍이다.

**이 작업 완료 후 가능해지는 것**: 사용자가 "augmentation이 이 관계를 인식했지만 하나로
못 좁혔다"는 사실을 응답에서 직접 본다 — 그리고 **왜** 못 좁혔는지(아직 안 만들어서/provider
capability가 없어서/지금 기법으로는 안전하게 못 판별해서/애초에 정적으로 원리적으로 불가능해서)
를 4가지 축 중 하나로 안다. 이 정보는 "언제 다시 시도하면 좋아질지"(backlog·capability-blocked는
후속 작업으로 풀릴 수 있다), "언제 안 풀릴지"(runtime-only는 정적 분석으로 원리적으로 못 푼다)를
구분해 준다.

**상위 목표와의 관계**: `docs/development-management/stories/il-lim-001-*.md` 수용 기준 4번("미지원
동적 관계가 limitation과 사용자 문서에 명시된다"), `il-lim-002-*.md` 수용 기준 4번("모호한 관계는
확정 edge로 생성되지 않고 limitation으로 보고된다")과 5번("단일 후보 ... runtime-only binding이
확정·후보·미지원 관계로 구분된다")을 닫는다 — gate 1의 미통과·부분 항목 중 셋. gate 1 전체(14개
기준)는 이 lane으로 안 닫힌다 — IL-LIM-001 수용 기준 5번(언어 matrix fixture, 2026-09-10 정정이
"각 언어 대표 gap 줄 최소 하나를 fixture 수준까지 끌어올려야 한다"고 요구한 부분)은 완전히 다른
작업이라 범위 밖이다.

**왜 지금**: PR #104(IL-LIM-010 stage 1) merge 직후 commander가 gate 1의 남은 세 기준을 지정해
착수를 지시했다. reviewer가 vue-core(520개 파일)로 이미 사전 측정을 마쳐 놨다(아래 "이미 있는
측정" 참고) — 새로 측정하지 않는다.

## 배경과 해결할 문제 — 지금 코드가 실제로 하는 일

- `cli/src/shared/adapters/fastapiDependencyAdapter.ts`의 `classifyDependsReferenceContext()`는
  세 갈래(`parameter`/`decorator`/`reject`) 중 `reject`를 반환하면 `findEnclosingDef()`가 그냥
  `undefined`를 돌려주고, 호출부는 그 후보를 조용히 버린다 — `AnalysisObservations`/
  `LimitationDetail`에 이 사실이 닿는 경로가 전혀 없다(직접 확인, `grep -rn "reject" cli/src/shared/
  adapters/fastapiDependencyAdapter.ts` → 반환값 생성 지점만 있고 소비하는 limitation 코드 없음).
  `reject`는 최소 두 다른 이유로 발생한다:
  1. **module-level bare 문**(`XDep = Annotated[T, Depends(fn)]`처럼 감싸는 `def(`/decorator(`
     paren이 전혀 없는 경우) — alias를 따라가려면 `reference`/`definition` capability가 필요하고
     이 adapter SPI엔 없다. → **capability-blocked**.
  2. **분류 불가능한 다른 unclosed call**(def(도 decorator(도 아닌 어떤 함수 호출 안) — 이건 현재
     기법(뒤로 paren depth를 세는 문자열 스캔)이 안전하게 구분 못 하는 경우다. → **technique-blocked**
     (넓히면 새 오귀속 위험, gate 4가 이미 두 번 겪음).
  - 세 번째 알려진 reject 원인(문서로만 존재, 코드 경로 없음): **router/`include_router` 레벨
    `dependencies=[Depends(fn)]`**(`il-lim-002-framework-di-routing.md` 미해결 질문 5번) — "router
    membership" capability가 없어 아예 탐지 시도조차 안 함. → **capability-blocked**.
- `cli/src/shared/adapters/dynamicCallbackAdapter.ts`의 `findEnclosingFunction()`은 세 경로로
  `undefined`를 반환한다: (a) `stripSameLineCommentsAndStrings`가 null(문자열/주석 파싱 모호,
  드묾), (b) `UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER`에 걸리는 method-shorthand/화살표 스코프
  (gate 7이 4채널로 실측·의도적으로 수용한 경계 — 정규식을 넓히면 새 오귀속 위험), (c) 파일
  최상단까지 스캔해도 못 찾음. **전부 조용히 후보를 버린다.**
- **reviewer의 vue-core(520개 파일) 실측(재측정 안 함, 그대로 인용)**: 표본 12개 중 6개 거부,
  **전부 (b)의 method-shorthand/화살표 스코프 원인 하나로 수렴** — 새 원인이 아니라 gate 7이 이미
  받아들인 경계가 외부 실제 코드에서도 지배적이라는 첫 외부 검증. `TransitionGroup.ts`의
  `onUpdated(() => {...})` 한 곳이 거부 3건을 낸다 — occurrence마다 쌓으면 등록 지점 하나에서
  세 줄이 뜬다. n=12는 표본이라 **50%라는 숫자를 정밀 근거로 쓰지 않는다** — "원인이 하나로
  수렴한다"는 구조적 발견이 숫자보다 단단하다.
- **gate C(runtime-only binding) — 별개 잔여, 새로 만들지 않고 그대로 인용**: `il-lim-002` 2026-09-04
  정정이 "코드 경로도 개념도 다르다"고 이미 명시적으로 갈라 놨다 - profile 분기, 정적으로 안 풀리는
  conditional, programmatic registration, proxy/AOP처럼 **후보 target을 정적으로 단 하나도 나열할
  수 없는 경우**다(mount 확인 가능 여부와 다른 개념). 이 시나리오를 재현하는 fixture가 저장소에
  **하나도 없다**(직접 확인 유지 - `fastapi-static-v1`에 runtime-only 전용 코드 경로·limitation
  없음, `dynamic_mount_router.py`는 mount 시나리오이지 이 시나리오가 아님).

## 범위와 범위에서 제외할 항목

- **포함**: 새 limitation code 1개(4개 분류 축 포함) 설계·구현, `fastapi-static-v1`의 module-level
  alias reject 경로와 `dynamic-callback-static-v1`의 scope-blind reject 경로에 이 code를 연결,
  gate C 전용 fixture(runtime-only binding, FastAPI 대상 - 이미 확정 adapter가 있으니), 사용자
  문서 3곳(`README.md`, `cli/README.md`, `cli-contract.md`) 수정.
- **제외 — router-level `dependencies=[]`(capability-blocked 축의 세 번째 알려진 사례) 코드
  경로 신설**: 이번 lane은 **기존에 이미 reject를 만들어 내는 경로**(module-level alias, 기법
  한계, method-shorthand/arrow)에 새 limitation을 연결하는 것이지, 아직 탐지 시도조차 안 하는
  router-level `dependencies=[]`를 새로 감지하는 코드를 만드는 건 아니다 — 그건 `il-lim-002`
  미해결 질문 5번("router-membership resolution capability")이 먼저 필요한 별도 작업이다. 이
  lane에서는 그 gap이 존재한다는 사실만 문서(limitation의 `capability-blocked` 분류 설명, 사용자
  문서)에 명시하고, 코드로 새로 감지하지 않는다.
- **제외(commander 명시)**: `dynamic-callback-static-v1`의 `maxFiles` 유도(별도 lane), 정규식을
  넓혀 recall을 올리는 것(technique-blocked를 backlog처럼 다루는 것과 같고, arrow-scope 채널을
  먼저 닫아야 한다는 순서가 이미 고정돼 있다 - `dynamicCallbackAdapter.ts` 자신의 주석).
- **제외**: augmentation 기본값 on 전환. 이 lane이 끝나도 조용한 기각이 보이게 되는 것과 기본
  활성화가 안전해지는 것은 다른 주장이다.
- **제외**: IL-LIM-001 수용 기준 5번(언어 matrix fixture 최소 하나를 C++ virtual dispatch 수준까지
  끌어올림) — 완전히 다른 작업, 별도 lane.

## 설계안 1 — 새 limitation code

### code, severity, scope

```
code: 'augmentation_inference_unresolved'
severity: 'warning'
scope: 'semantic'
```

**severity를 `warning`으로 두는 이유 (`augmentation_budget_exceeded`와의 관계)**: 이 코드가
속하는 가족(`augmentation_budget_exceeded`/`framework_route_mount_unresolved`/
`augmentation_adapter_failed`/`augmentation_internal_error`) 전부가 이미 `warning`이다 - 공통
구조가 같기 때문이다: **정적 그래프 자체는 멀쩡하고, augmentation이라는 보조 신호의 일부가
불완전하다는 경고**다. `error`로 올리면 "이 응답 전체를 못 믿는다"는 신호가 되는데 실제로는
`data.edges`(확정 caller)는 전혀 영향받지 않으므로 과장이다. `info`로 낮추면 이 milestone이
반복해서 경계해 온 "조용한 기각"을 "안 읽어도 되는 잡음"으로 재포장하는 꼴이라 안 된다 -
`augmentation_adapter_failed`도 "adapter가 실패했을 뿐 정적 결과는 안전하다"는 정확히 같은
성격인데 `warning`이다. gate C(runtime-only binding)가 나중에 이 code를 쓸 때도(category만
`runtime-only`로 추가) 같은 논리가 적용된다 - "찾을 수 없다는 것을 안다"는 정직한 상태이지 분석
실패가 아니다. **다만 gate C 자체는 이번 PR 범위 밖이다** - 아래 "설계안 3" 참고.

### 데이터 모델 — occurrence마다 쌓지 않는다

commander 지시(`onUpdated` 실측이 근거): entry 하나 + message에 건수·분류 요약. 새 SPI 필드:

```ts
// cli/src/shared/adapters/types.ts
// 2026-09-10 commander 최종 결정 - `runtime-only`는 이 배열에 없다. 이유는 아래 "gate C는 후속
// lane" 절 참고 - 요약하면 "출하된 값을 빼는 것은 비싸지만 출하 안 된 값을 넣는 것은 싸다"는
// `AUGMENTED_EDGE_SOURCES`의 `runtime-observation` 유지 근거를 그대로 반대 방향으로 적용한 것:
// producer가 없는 값을 미리 예약하면 계약이 "유령 값"을 갖게 되고, 소비자는 절대 오지 않는 case를
// 처리해야 한다. gate C lane이 실제 producer를 만들 때 값을 추가한다 - 그게 싼 쪽이다. 4축
// 분석틀(backlog/capability-blocked/technique-blocked/runtime-only) 자체는 이 문서에 남기지만,
// **코드에 싣는 건 producer가 있는 세 값뿐이다.**
export const REJECTED_INFERENCE_CATEGORIES = [
  'backlog',
  'capability-blocked',
  'technique-blocked',
] as const;
export type RejectedInferenceCategory = (typeof REJECTED_INFERENCE_CATEGORIES)[number];

export interface RejectedInferenceTally {
  /** kebab-case, adapter-internal - reuses AugmentedEdge.reasonCode's existing free-form-string
   * convention rather than inventing a second vocabulary. e.g. 'module-level-alias',
   * 'unclassified-enclosing-call', 'unrecognized-scope-opener'. */
  readonly reasonCode: string;
  readonly category: RejectedInferenceCategory;
  readonly count: number;
}
```

`AdapterResult`에 `readonly rejectedInferences?: readonly RejectedInferenceTally[];` 추가 (다른
optional 필드들과 같은 관례 - "해당 없으면 undefined", `mountUnresolved`와 나란히). 각 adapter는
내부적으로 `Map<string, number>`(reasonCode → count)를 하나 들고 있다가 실행 끝에 배열로
변환한다 - occurrence마다 별도 엔트리를 만들지 않는다.

`AnalysisObservations`에는 기존 `augmentationAdapterFailed`(어댑터별 실패 목록)와 같은 모양으로:

```ts
export interface AugmentationInferenceRejection {
  readonly adapterId: string;
  readonly tallies: readonly RejectedInferenceTally[];
}
readonly augmentationInferenceRejected?: readonly AugmentationInferenceRejection[];
```

`cli/src/shared/adapters/index.ts`의 `runAugmentation()`이 각 adapter 결과에서
`rejectedInferences`가 비어있지 않으면 이 배열에 추가한다(다른 필드들과 같은 취합 지점).

### message 문안 (사용자가 실제로 읽을 문장)

`coverage.ts`의 `augmentationAdapterFailedDetails()`와 정확히 같은 모양 - flat code, message에
adapter별로 나열(commander 지시: `inference_adapter_failed:<id>` 같은 code-suffix 방식은 이
저장소가 안 쓰는 모양):

```ts
function augmentationInferenceRejectedDetails(
  rejections: AnalysisObservations['augmentationInferenceRejected'],
): readonly LimitationDetail[] {
  if (rejections === undefined || rejections.length === 0) {
    return [];
  }
  const perAdapter = rejections.map(rejection => {
    const total = rejection.tallies.reduce((sum, tally) => sum + tally.count, 0);
    const byCategory = summarizeByCategory(rejection.tallies); // "2 blocked by the current detection technique, 1 waiting on a provider capability"
    return `${rejection.adapterId} recognized ${total} relationship(s) it could not resolve into a specific caller (${byCategory})`;
  }).join('; ');
  return [{
    code: 'augmentation_inference_unresolved',
    severity: 'warning',
    scope: 'semantic',
    message: `${perAdapter}. The static call graph above is unaffected, but the caller list at these points may be incomplete, which can understate the actual impact radius.`,
    action: 'This means augmentation recognized a pattern it could not confirm a specific target for - not that no such relationship exists; the categories above explain whether this may improve in a future release (backlog, capability-blocked) or is a structural limit of the current detection technique.',
  }];
}
```

**2026-09-10 commander 지적 반영 - "unaffected"로 끝내지 않는다.** 최초 초안은 뒷문장을
`"These relationships are not represented as augmented edges; the static call graph above and
every confirmed caller are unaffected."`로 썼다. **앞부분(정적 그래프는 안전하다)은 참이고
유지한다** - 불필요한 공포를 막는다. 문제는 거기서 끝나면 "그러니 신경 안 써도 된다"로 읽힌다는
것 - 사용자가 실제로 지는 위험은 정반대다: **caller 목록이 이 지점들에서 불완전할 수 있고, 그래서
영향 범위를 과소평가할 수 있다.** 이 저장소에 같은 교정 전례가 있다 - pyright preset의
`Depends()` 관련 문구가 초안에서 "not called at all, only referenced by name"이라고 적었다가
"그러니 지워도 안전하다"는 오독을 정면으로 초대한다는 이유로 되돌려졌다(`catalog.ts` 주석). 위
message는 "정적 그래프는 영향 없음" + "다만 이 지점들에서 caller 목록이 불완전할 수 있음(영향
범위 과소평가 위험)" 두 절 모두를 담도록 고쳤다 - 둘 다 참이고, 둘 다 있어야 정직하다.

**category → 사람이 읽는 문구 매핑안** (`summarizeByCategory`, 순서 고정 - backlog →
capability-blocked → technique-blocked, 카테고리가 0건이면 그 구절 생략. `runtime-only`는
producer가 없어 이번 PR의 코드에 없다 - 위 "데이터 모델" 절 참고):
- `backlog` → `"N not yet implemented"`
- `capability-blocked` → `"N waiting on a provider capability this analysis does not have"`
- `technique-blocked` → `"N blocked by the current detection technique (a safer, broader technique risks new false attributions)"`

예시 문장(reviewer의 vue-core 표본을 예시로만 사용, 실제 코드에 하드코딩하지 않음):
`"dynamic-callback-static-v1 recognized 6 relationship(s) it could not resolve into a specific caller (6 blocked by the current detection technique (a safer, broader technique risks new false attributions)). The static call graph above is unaffected, but the caller list at these points may be incomplete, which can understate the actual impact radius."`

### `LIMITATION_SURFACE_PATTERNS` 등록안

```js
augmentation_inference_unresolved: [
  /\brecognized\b[^.!?]{0,80}\bcould not resolve\b/i,
  /\bcaller list\b[^.!?]{0,40}\b(?:may be |might be )?incomplete\b/i,
  /\bunderstate\b[^.!?]{0,40}\bimpact\b/i,
  /\bblocked by the current detection technique\b/i,
],
```
`augmentation_adapter_failed`가 이미 쓰는 "두 근거(코드 자신의 message + 예상 paraphrase)"
방식을 그대로 따른다 - 최종 문구가 확정되면 SKILL.md/cli-contract.md에 실을 권장 표현과 대조해
같이 확정한다.

## 설계안 2 — reasonCode → category 매핑 (실제 코드 위치별)

| adapter | reject 발생 위치 | reasonCode(안) | category |
| --- | --- | --- | --- |
| `fastapi-static-v1` | `classifyDependsReferenceContext`의 module-level bare 문(감싸는 paren 없음) | `module-level-alias` | **capability-blocked**(`reference`/`definition` capability 필요) |
| `fastapi-static-v1` | `classifyDependsReferenceContext`의 분류 불가 unclosed call | `unclassified-enclosing-call` | **technique-blocked**(현재 paren-depth 스캔으로 안전하게 분류 불가) |
| `dynamic-callback-static-v1` | `findEnclosingFunction`의 `UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER` 매치(method-shorthand/화살표) | `unrecognized-scope-opener` | **technique-blocked**(정규식을 넓히면 새 오귀속, gate 7이 이미 실측) |
| `dynamic-callback-static-v1` | `stripSameLineCommentsAndStrings`가 null(문자열/주석 파싱 모호) | `unparseable-line` | **technique-blocked** |
| (인식기 자체 없음, 이번 lane 범위 밖) | router/`include_router` 레벨 `dependencies=[]` | 없음 - tally 대상 아님 | 없음(아래 "인식기 부재" 절 참고) |
| (gate C, 별도 fixture, 설계 재작업 필요) | profile/conditional/programmatic registration/proxy-AOP | `runtime-determined-target`(안) | **runtime-only** |

### `router-level dependencies=[]` — capability-blocked 목록에서 뺀다: 이 lane 이후에도 안 보인다 (2026-09-10 commander 지적)

원래 표는 이 형태를 `capability-blocked`로 분류해 tally 대상에 넣으려 했다. **틀렸다.** capability-
blocked/technique-blocked 두 축이 tally를 낼 수 있는 건 `classifyDependsReferenceContext()`/
`findEnclosingFunction()`이 **일단 그 자리에 도달해서 reject를 반환하기 때문**이다 - 즉 "인식은
했지만 좁히지 못했다"의 전제(인식)가 이미 충족돼 있다. router-level `dependencies=[]`는 다르다:
`findDependsReferences()`가 애초에 이 형태를 검색하지 않으므로(router/`include_router` 호출의
`dependencies=` 인자를 스캔하는 코드 자체가 없다) **분류할 대상 자체가 생기지 않는다** - reject를
반환할 함수 호출까지 도달하지 못한다.

**즉 인식기 자체가 없으면 집계도 못 하고, 따라서 limitation에도 안 잡힌다.** 이 lane이 만드는
`augmentation_inference_unresolved`는 "adapter가 인식은 한 뒤 좁히지 못한 것"만 보이게 만든다 -
router-level `dependencies=[]`처럼 **인식기 자체가 없는 형태는 집계 대상이 아니며, 이 lane
이후에도 응답에서는 여전히 보이지 않는다.** 그 형태의 유일한 공개 창구는 사용자 문서다(아래
설계안 4의 "무엇이 탐지되지 않는가" 절에 반드시 이름을 댄다) - 그러지 않으면 이 lane은 "조용한
기각을 없앴다"고 주장하면서 조용한 기각 하나를 그대로 남기는 셈이 된다.

**backlog 카테고리 사례가 지금 코드에 없는 이유**: commander의 네 축 정의(backlog = "지금 SPI만으로
원리적으로 풀리는데 아직 안 한 것")에 해당하는 구체적 reject 사례를 이번 조사에서 찾지 못했다 -
위 표의 모든 reject는 capability-blocked 아니면 technique-blocked다. **backlog 값 자체는 vocabulary에
유지한다**(commander가 넷으로 확정했고, 향후 실제로 "안 한 것"이 생기면 바로 쓸 자리가 필요하다) -
다만 이번 PR이 실제로 만드는 tally에는 backlog 항목이 0건일 수 있다는 것을 정직하게 기록한다(추측으로
채우지 않는다).

## 설계안 3 — gate C(runtime-only binding) fixture: 실측 결과, 셋 다 기각, 원인 분석과 재설계 필요

**절대 gate 7 잔여 fixture와 합치지 않는다** - `il-lim-002`의 2026-09-04 정정이 "코드 경로도 개념도
다르다"고 이미 명시했다. mount ambiguity(`isRouterMounted()`의 `nameAmbiguous`)는 기존 fixture로
충족되고, gate C는 **완전히 새 fixture**가 필요하다.

**2026-09-10 commander 지시 - 원래 초안("조건부 재정의" 모양)은 폐기, 세 후보를 실측했다.**
원래 초안은 stage 3이 이미 시도해서 실패한 모양(조건부 재정의 - pyright가 정확히 1개를 돌려줌)과
같은 shape이었다 - commander가 즉시 잡아, 대신 세 후보(호출 결과를 `Depends()` 인자로 쓰는 것,
registry 조회, `dependency_overrides`)를 제시하고 **설계 전에 먼저 돌려서 확인하라**고 지시했다.
직접 스크래치 workspace를 만들어 실제 `cli/dist/index.js`(빌드된 CLI, 실제 bundled pyright)로
돌렸다(전수 조사 아님, 세 후보를 시도했다는 것만 실측):

```python
def get_db_a(): ...
def get_db_b(): ...
def get_dependency_by_name(name): ...  # returns get_db_a or get_db_b
def registry_lookup(): ...             # returns REGISTRY[os.environ.get("PROFILE")]

@app.get("/call-result-target")
def read_by_call_result(db=Depends(get_dependency_by_name(os.environ.get("DEP", "a")))): ...

@app.get("/registry-target")
def read_by_registry(db=Depends(registry_lookup())): ...
```
`get_db_a`/`get_db_b`를 각각 root로 두 augmentation 쿼리 모두 `[실행]` **`augmentedEdges: []`**를
확인했다 - 표면적으로는 "0 candidates"라 gate C 요구를 만족하는 것처럼 보인다.

**하지만 이건 gate C가 원하는 "0"이 아니다 - 코드를 다시 읽어 원인을 확인했다.** `findDependsReferences()`
(`fastapiDependencyAdapter.ts`)는 쿼리 중인 root의 **이름 자체가 `Depends(<이름>`으로 바로 나타나는
경우만** 찾는다. 위 두 fixture는 `Depends(get_dependency_by_name(...))`/`Depends(registry_lookup())`처럼
**`get_db_a`/`get_db_b`라는 이름 자체가 `Depends(` 바로 뒤에 텍스트로 나타나지 않는다** - 그래서
`classifyDependsReferenceContext()`(reject를 반환해 tally를 만드는 바로 그 함수)까지 **도달하지도
않는다.** 즉 이 두 후보는 "인식했지만 좁히지 못함"(gate C가 원하는 모양)이 아니라 **"애초에
인식기가 없음"**(바로 위 절의 router-level `dependencies=[]`와 정확히 같은 결함 모양)이다. 이
fixture를 그대로 쓰면 gate C를 "닫았다"고 주장하면서 실제로는 또 다른 조용한 기각 사례를 만드는
셈이 된다 - **채택하지 않는다.**

**세 번째 후보(`dependency_overrides`)는 애초에 다른 개념이라 시도하지 않았다.** FastAPI의
`app.dependency_overrides[get_db_a] = get_test_db`는 route handler의 `Depends(get_db_a)` 호출
지점 자체는 완전히 평범하고 정적으로 확정 가능하다(`Depends(get_db_a)`가 문자 그대로 있다) - 다만
**그 edge가 실제로 실행될 때 다른 함수로 대체될 수 있다**는, "후보를 못 좁힌다"가 아니라 "좁힌
후보가 런타임에 바뀔 수 있다"는 별개의 주장이다. gate C의 정의("후보 target을 정적으로 단 하나도
나열할 수 없음")에 맞지 않아 후보에서 제외한다.

**결론 - 세 후보 모두 gate C가 요구하는 "인식은 했지만 정적으로 후보를 못 좁힌" 코드 경로를
만들지 못한다.** 현재 SPI/두 adapter의 어떤 기존 코드 경로도 `runtime-only`에 해당하는 tally를
실제로 만들어 내지 않는다.

**2026-09-10 commander 최종 결정 - gate C는 후속 lane, 이번 PR 범위 밖으로 확정.** 이 lane은
`IL-LIM-002` 수용 기준 5번("runtime-only binding이 확정·후보·미지원 관계로 구분된다")을
**닫지 않는다** - PR 본문에도 명시한다. `runtime-only`는 vocabulary에 값으로도 넣지 않는다(위
"데이터 모델" 절 참고 - `AUGMENTED_EDGE_SOURCES`의 `runtime-observation` 유지 근거를 정확히
반대 방향으로 적용: 출하된 값을 빼는 건 비싸지만 출하 안 된 값을 넣는 건 싸므로, **만들어 낼 수
없는 값은 출하하지 않는다**. producer 0건인 값을 계약에 미리 넣으면 소비자가 절대 오지 않는
case를 처리해야 하는, "정직"이 아니라 "유령 값으로 계약을 채우는" 결과가 된다).

**후속 lane에 반드시 넘기는 질문 - 이번 실측이 드러낸 진짜 문제**: `Depends()`의 대상을 하나도
열거할 수 없다면, 그게 지금 쿼리한 root를 가리키는지도 알 수 없다. 그러면 응답에 뭘 적어야 하는가?
- workspace 전체의 미해결 `Depends()`를 전부 보고 → 사용자가 `get_user`를 물었는데 무관한 라우트
  12개의 동적 의존성을 듣는다 - 이건 공개가 아니라 소음이고, occurrence당 집계를 막은 것과 같은
  실패 모양이다.
- 아무것도 보고 안 함 → 지금 상태 그대로(이 lane이 존재하는 이유 자체가 무효화된다).
- **가능한 중간 답(측정 없이 확정하지 않는다)**: 이미 이 분석의 그래프에 들어온 파일들로 범위를
  좁혀 "이 분석에 등장한 파일에서 N개의 의존성을 확정하지 못했다"고 말하는 것 - root 관련성이
  있고 경계도 있다. 다만 이건 설계 판단이고, 측정 없이 정하면 gate 7이 저지른 실수를 반복한다.

**즉 gate C의 acceptance 문구가 root 범위 분석에서 원리적으로 충족 가능한지 자체가 아직 열린
질문이다** - 후속 lane은 설계부터 시작하지 않고 이 질문부터 시작한다. `dependency_overrides`를
후보에서 뺀 판단(안 돌려보고 개념으로 배제)도 같이 넘긴다 - "런타임에 대체될 수 있다"(전자)와
"후보를 못 좁힌다"(gate C)는 다른 주장이고, 전자는 `Depends(get_db_a)` 호출 지점이 완전히
정적으로 확정되는 경우라는 구분을 후속 lane도 다시 하지 않도록 여기 남긴다.

### 2026-09-10 reviewer 지적 — "runtime-only binding" 하나가 아니라 서로 다른 메커니즘 셋이다

원래 이 절은 세 후보를 "gate C(runtime-only binding)"라는 하나의 개념 아래 순서대로 시도해
기각한 것처럼 적었다. **틀린 프레이밍이다.** 실측과 코드 재확인 결과 셋은 애초에 같은 문제의
변주가 아니라 서로 다른 세 메커니즘이었다 - 하나로 묶어 "다음 lane이 runtime-only 하나를
설계하면 된다"고 넘기면 다음 lane이 시작부터 잘못된 단일 설계 문제를 풀게 된다.

1. **registry lookup** (`Depends(registry_lookup())`, 반환값이 `REGISTRY[os.environ.get(...)]`) —
   대상이 "정적으로 하나도 안 보이는" 게 아니라 **어떤 capability로도 원리적으로 못 푼다.** 실행
   시점 환경변수·dict 내용에 의존하므로, `reference`/`definition` 같은 워크스페이스 전체 참조
   추적이 있어도 후보를 열거할 수 없다 - `capability-blocked`(더 강한 capability로 언젠가
   풀린다)조차 아니다. 세 후보 중 유일하게 "진짜 runtime-only" 개념에 해당한다.
2. **`Depends(factory())`** (`Depends(get_dependency_by_name(name))`, factory가 실제로는 상수
   함수 하나만 반환) — registry lookup과 겉모양(호출 결과가 `Depends()` 인자)은 같지만 성격이
   다르다. factory의 반환 타입 정보가 있으면(예: `-> Callable[..., Session]`이 아니라 실제
   구체 반환 타입) 원리적으로 좁혀질 수도 있는 경우가 있다 - "지금 없는 정보로 풀릴 수도 있는
   gap"이라 `capability-blocked`에 더 가깝다. 두 후보를 같은 줄에 놓은 원래 표가 이 차이를
   지웠다.
3. **`dependency_overrides`** — 위에서 이미 정리한 대로 gate C와 무관한 별개 개념(호출 지점은
   완전히 정적으로 확정되고, "확정된 후보가 실행 시 대체될 수 있다"는 다른 주장)이다. 세 후보
   목록에 나란히 있을 자리가 아니다 - 애초에 gate C의 예시가 아니라 gate C와 헷갈리기 쉬운
   인접 개념으로 따로 적어야 했다.

**후속 lane에 넘기는 정정된 지시**: gate C 후속 lane은 "runtime-only binding 하나"를 설계하지
않는다. registry lookup(원리적으로 불가능 - 후보 존재 자체를 노출하지 않는 방향의 설계가 필요)과
`Depends(factory())`(반환 타입 정보로 부분적으로 풀릴 수 있는, 별도 capability-blocked 계열
gap)를 처음부터 서로 다른 질문으로 분리해서 시작한다. `dependency_overrides`는 gate C의 예시
목록에서 완전히 제외하고, 필요하면 별도의 "확정 후 런타임 대체" 개념으로 언급한다.

**`runtime-observation` 유지 / `runtime-only` 미도입 — 같은 비용-방향 규칙을 두 번 적용한 것**
(reviewer 확인). `AUGMENTED_EDGE_SOURCES`의 `runtime-observation` 값은 이미 출하돼 있어 빼면
소비자를 깨뜨리므로 producer가 없어도 유지한다. 이번 lane이 `runtime-only`를 vocabulary에
아예 넣지 않은 것은 그 반대 방향이다 - 아직 출하 전이므로 producer 없는 값을 미리 넣지 않는다.
두 판단은 서로 다른 규칙이 아니라 **"출하된 producer-less 값은 비싸서 유지하고, 출하 전
producer-less 값은 싸서 안 넣는다"는 하나의 비용-방향 규칙을 상황만 바꿔 두 번 적용한 것**이다.

**이 fixture의 종료 조건(후속 lane이 실제로 착수할 때 적용)**: `runtime-only`(또는 그때 확정되는
이름)의 category tally가 최소 1 증가하고, `augmentedEdges`에는 해당 관계의 edge가 **생기지
않는다**(현재 `resolution` 두 값 - `single`/`multiple` - 어디에도 안 들어감, stage 1이 이미
정의해 둔 대로).

## 설계안 4 — 사용자 문서 3곳 수정안

1. **`README.md`**: augmentation 언급이 0건 - 새 절 추가(위치는 기존 구조에 맞춰 결정, 초안은
   구현 단계에서). "무엇이 탐지되는가"(FastAPI Depends()/route, JS/TS 콜백·이벤트 등록)와 "무엇이
   탐지되지 않으며 왜인가"를 이번 PR이 실제로 만드는 세 축(backlog/capability-blocked/
   technique-blocked)으로 설명한다. **router-level `dependencies=[]`처럼 인식기 자체가 없어
   이번 PR로도 여전히 안 보이는 형태를 반드시 이름 대서 언급한다** - 그 형태의 유일한 공개
   창구가 이 문서이기 때문이다(위 "router-level dependencies=[]" 절 참고). runtime-only binding
   (gate C)은 이번 PR이 만들지 않으므로 이 문서에서도 "아직 별도로 다루지 않는다"로만 짧게
   언급하고 4축 분석틀을 사용자 문서에까지 노출하지 않는다(코드가 없는 축을 사용자에게 약속하지
   않는다).
2. **`cli/README.md`**: 현재 거짓 문장(`"coverage.semantic is static-only until provenance-bearing
   augmentation is implemented"`, line 109)을 고친다 - `cli/src/impact.ts:171`이 이미
   `static-plus-inference`를 만들고 있다. 정정 문장은 "augmentation이 켜지면
   `static-plus-inference`가 된다"는 사실을 정확히 반영.
3. **`plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`**: `fastapi-static-v1`만
   나열된 곳(line 443 근처)에 `dynamic-callback-static-v1`을 추가하고, 새 limitation code
   `augmentation_inference_unresolved`도 기존 `framework_route_mount_unresolved`/
   `augmentation_budget_exceeded` 절 옆에 같은 형식으로 문서화.

## 검증 계획(초안, 구현 단계에서 구체화)

- 단위: `RejectedInferenceTally` 집계가 occurrence를 올바르게 셈(같은 reasonCode 여러 번 → count
  누적, 다른 reasonCode → 별도 엔트리).
- 단위: `augmentationInferenceRejectedDetails()`가 category 순서 고정, 0건 category 생략, 여러
  adapter를 `; `로 구분.
- 통합: `fastapi-static-v1`의 module-level alias 실제 fixture로 `capability-blocked` tally 1
  이상 발생 확인(gate 7 fixture 재사용, 새로 안 만듦).
- 통합: `dynamic-callback-static-v1`의 vue-core 발견 패턴(method-shorthand)과 같은 shape의 fixture로
  `technique-blocked` tally 확인(이미 있는 gate 7 fixture 재사용 우선 검토).
- (후속 lane, 이번 PR에 없음): gate C fixture - `runtime-only` tally 확인 + `augmentedEdges`에
  해당 edge 없음. 위 "설계안 3"의 "후속 lane에 반드시 넘기는 질문"부터 시작한다.
- 뮤테이션: 이 milestone 관례대로, 실제로 tally 집계 코드를 무력화해 관련 테스트만 실패하는지 확인.
- `LIMITATION_SURFACE_PATTERNS` 등록 후 `npm run test:response-policy` 무관 영역 회귀 없음 확인 +
  새 fixture 추가해 이 code의 disclosure 검출 확인.
- 문서 3곳 수정 후 response-policy의 doc invariant 테스트 영향 없음 확인(`cli-contract.md` 변경이
  기존 forbidden-phrase/working code span 검사를 안 깨는지).

## 2026-09-10 commander 확인 반영 — 넷 다 최종 확정

1. **code 이름** → `augmentation_inference_unresolved`로 확정(위 "설계안 1" 전체에 반영 완료) -
   "rejected"는 "우리가 아니라고 판단했다"로 오독되지만 실제로는 정반대(관계는 진짜일 가능성이
   높은데 caller를 못 짚었다)이고, 이 저장소는 정확히 같은 상황에 이미 `unresolved`
   (`framework_route_mount_unresolved`)를 쓰고 있어 어휘를 일관되게 맞췄다.
2. **message** → "unaffected"로 끝내지 않고 "caller 목록이 이 지점들에서 불완전할 수 있고, 영향
   범위를 과소평가할 수 있다"는 행동 가능한 절반을 추가(위 "설계안 1" message 절에 반영 완료) -
   `catalog.ts`의 pyright `Depends()` 문구 교정 전례와 같은 함정("그러니 지워도/신경 안 써도
   안전하다" 오독).
3. **gate C fixture shape** → 원래 초안(조건부 재정의 모양)은 stage 3이 이미 실패를 확인한 모양과
   같아 폐기, commander가 제시한 세 후보를 실측했으나 **셋 다 채택 불가**로 판정됐다(위 "설계안 3"
   전체 재작성 참고) - 앞 두 후보는 `findDependsReferences()`가 애초에 인식하지 못해
   router-level `dependencies=[]`와 같은 "인식기 부재" 결함이 되고, 세 번째(`dependency_overrides`)는
   gate C와 다른 개념이다. **commander 최종 결정: gate C는 후속 lane, 이번 PR 범위 밖.** 그리고
   `runtime-only`는 vocabulary 예약조차 하지 않는다 - `AUGMENTED_EDGE_SOURCES`의
   `runtime-observation` 유지 근거("출하된 값을 빼는 게 더 비싸다")를 반대 방향으로 적용하면
   "출하 안 된, 만들어 낼 수 없는 값은 넣지 않는다"가 된다(producer 0건인 값을 미리 넣으면
   소비자가 절대 안 오는 case를 처리해야 하는 유령 값이 된다). **이번 PR의 코드가 싣는 category는
   `backlog`/`capability-blocked`/`technique-blocked` 셋뿐이다.** 후속 lane에는 "gate C의
   acceptance 문구가 root 범위 분석에서 원리적으로 충족 가능한가"라는, 이번 실측이 새로 드러낸
   더 근본적인 질문을 함께 넘긴다(위 "설계안 3" 마지막 절 참고) - 설계부터 다시 시작하지 않게.
4. **router-level `dependencies=[]`** → 코드 경로 신설 안 함, 확정. 다만 "capability-blocked로
   분류해 tally한다"는 원래 설계는 **틀렸다** - 인식기 자체가 없어 tally 대상이 되지도 못한다(위
   "router-level dependencies=[] — capability-blocked 목록에서 뺀다" 절 참고). 이 lane 이후에도
   응답에서 안 보인다는 사실을 작업 문서·PR 본문·사용자 문서 세 곳 모두에 명시한다.

## 작업 로그 — 구현 완료

**변경 파일**:
- `cli/src/types.ts` - `REJECTED_INFERENCE_CATEGORIES`(3값)/`RejectedInferenceCategory`/
  `RejectedInferenceTally`/`AugmentationInferenceUnresolved` 신규 export,
  `AnalysisObservations.augmentationInferenceUnresolved?` 필드 추가(named type, field-inventory
  스캔 요구사항 준수).
- `cli/src/test/stateReachabilityClassification.ts` - 새 필드를 `has-producer`/`analyze-caller`로
  분류.
- `cli/src/shared/adapters/types.ts` - `AdapterResult.rejectedInferences?` 추가.
- `cli/src/shared/adapters/index.ts` - `AugmentationResult.inferenceUnresolved`(항상 배열) 추가,
  `runAugmentation()`이 각 adapter 결과를 집계.
- `cli/src/impact.ts` - `augmentation.inferenceUnresolved.length > 0` 조건으로 observation에 투영
  (다른 augmentation-* 필드와 같은 관례).
- `cli/src/coverage.ts` - `augmentationInferenceUnresolvedDetails()`(flat code, category 순서
  고정, 0건 category 생략, adapter별 `; `로 나열) 신규, 파이프라인에 연결.
- `cli/src/shared/adapters/fastapiDependencyAdapter.ts` - `classifyDependsReferenceContext`의
  `reject` 두 갈래에 reasonCode/category 부여(module-level-alias → capability-blocked,
  unclassified-enclosing-call → technique-blocked), `findEnclosingDef()`가 그 정보를 그대로
  통과시키도록 반환 타입 변경, 호출부에서 tally 집계.
- `cli/src/shared/adapters/dynamicCallbackAdapter.ts` - `findEnclosingFunction()`의 두 "포기"
  경로(unparseable-line, unrecognized-scope-opener)에 technique-blocked 부여, 파일 최상단까지
  스캔해도 못 찾는 경우(진짜로 감싸는 함수가 없는 정답)는 tally 안 함, 호출부에서 tally 집계.
- `scripts/lib/response-policy-engine.mjs` - `augmentation_inference_unresolved` 등록.
- `scripts/fixtures/response-policy/29-*.json`(긍정)/`30-*.json`(부정) 신규.
- `cli/src/test/pythonFastapiIntegration.test.ts`/`dynamicCallbackIntegration.test.ts` - 기존
  실제 fixture(모듈 레벨 alias, method-shorthand/화살표 계열 3건)로 새 code가 실제로 뜨는지 확인하는
  end-to-end 테스트 추가.
- `README.md` - "augmentation(선택적 보조 추론)" 신규 절(무엇을 찾는지 + 3축 + router-level
  `dependencies=[]`처럼 여전히 안 보이는 형태를 명시적으로 이름 댐 + gate C는 이번 lane 범위 밖임을
  명시).
- `cli/README.md` - 거짓 문장(`coverage.semantic is static-only until provenance-bearing
  augmentation is implemented`) 정정.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md` - adapter 목록에
  `dynamic-callback-static-v1` 추가, limitation code 목록에 기존에 누락돼 있던
  `augmentation_adapter_failed`/`augmentation_internal_error`까지 포함해 정리, 신규
  `augmentation_inference_unresolved`를 3축 + router-level `dependencies=[]` 잔여와 함께 문서화.
- `plugins/impact-lens/skills/impact-lens-cli/SKILL.md` - agent가 확인해야 할 limitation code
  목록에 신규 code 추가(이 lane의 목적 자체가 "응답에 조용히 사라짐" 대신 정보를 남기는 것인데,
  agent가 그 정보를 다시 요약에서 빠뜨리면 같은 실패가 한 층 위에서 재발하므로).

**검증(전부 `[실행]`, `rm -rf out cli/dist` 후)**:
- `npm run cli:test` - 507 tests, 504 pass, 0 fail, 3 skip(기존 gopls 실환경 skip, 무관).
- `npm test`(Extension) - 84 tests, 84 pass, 0 fail(회귀 없음).
- `npm run test:response-policy` - 38 checks 통과(fixture 29·30 포함, doc invariant 회귀 없음).
- **실제 fixture로 end-to-end 확인** (스텁 아님): `module_level_alias_self_ref.py`(gate 7 fixture
  재사용)를 실제 쿼리 → `augmentation_inference_unresolved` 발생, `capability-blocked` 1건 확인.
  `handler.ts` 다중 fixture 쿼리(`dynamicCallbackIntegration.test.ts`가 이미 쓰는 공유 workspace) →
  `technique-blocked` 3건 확인(vue-core가 실측한 것과 같은 채널 - method-shorthand/화살표/기타
  scope-blind reject).
- **뮤테이션 검증**: 두 adapter 모두에서 `recordRejection(...)` 호출을 주석 처리해 재빌드·재실행 →
  각각 정확히 새로 추가한 테스트 1개만 실패, 다른 테스트는 전부 그대로 통과, 원복 후 재통과 확인.
  `LIMITATION_SURFACE_PATTERNS`에서 새 code 등록을 제거해 재실행 → fixture 29만 실패
  (`missing_high_severity_disclosure`), 원복 후 재통과 확인.

**사용자 결과 vs 남은 것**: IL-LIM-001 수용 기준 4번과 IL-LIM-002 수용 기준 4번이 실제 코드로
검증됐다 - augmentation이 인식했지만 하나로 못 좁힌 관계가 이제 `augmentation_inference_unresolved`
limitation으로 사용자에게 보이고, 왜 못 좁혔는지(backlog/capability-blocked/technique-blocked)도
같이 나온다. **아직 안 되는 것**: IL-LIM-002 수용 기준 5번(runtime-only binding, gate C)은 이
lane이 안 닫는다 - 후속 lane 몫이고, 이번 lane의 실측이 그 후속 lane이 먼저 풀어야 할 더 근본적인
질문(root 범위 분석에서 그 acceptance 문구 자체가 충족 가능한가)을 남겼다. router-level
`dependencies=[]`는 여전히 완전히 안 보인다 - 사용자 문서가 유일한 공개 창구다. gate 1 전체
(IL-LIM-001 수용 기준 5번의 언어 matrix 등)는 이 lane 범위 밖으로 계속 열려 있다. augmentation
기본값은 이 lane 이후에도 여전히 꺼져 있다.

## 2026-09-10 reviewer 전체 diff 감사 — 6곳 미집계 재확인(re-verification) 지점 반영

위 "작업 로그"까지 PR #105로 push한 뒤, reviewer가 diff 전체를 다시 훑어 **양쪽 adapter의
`resolveEndpoint()`/`resolveAt()` 재확인(re-verification) 호출 6곳**이 0건/복수건 결과를
하나도 tally하지 않고 있다는 걸 찾았다 - 그중 하나(`dynamicCallbackAdapter.ts`의 다중 후보
분기)는 코드 자체의 기존 주석이 "전용 limitation code가 없어 일부러 안 다뤘다"고 자백하고
있던 자리였다. commander가 셋의 처리를 예시로 명시하고 나머지 셋은 같은 기준으로 내가 직접
판단하되 근거를 남기라고 지시했다.

**commander의 판단 기준(그대로 인용)**: adapter가 이미 "관계 후보가 진짜 존재한다"까지 확인한
뒤 그걸 좁히는 데 실패했으면 센다. 경로 자체가 "관계 없음"이라는 진짜 결론이면 안 센다. 세는
것이 adapter가 실제로 알지도 못하는 관계의 존재를 단언하는 셈이 되면 안 센다.

### 6곳 판정표

| 파일 | 위치 | 조건 | 판정 | reasonCode / category |
| --- | --- | --- | --- | --- |
| `fastapiDependencyAdapter.ts` | target 참조 `resolveEndpoint()` | `resolved.items.length === 0` | **집계 안 함** | - |
| `fastapiDependencyAdapter.ts` | enclosing def `resolveEndpoint()` | `enclosingResolved.items.length === 0` | **집계함** | `enclosing-function-unresolved` / `technique-blocked` |
| `fastapiDependencyAdapter.ts` | enclosing def `resolveEndpoint()` | `enclosingResolved.items.length > 1` | **집계함** | `multiple-source-candidates` / `backlog` |
| `dynamicCallbackAdapter.ts` | 전달된 handler 인자 `resolveAt()` | `handlerResolved.length !== 1` | **집계 안 함** | - |
| `dynamicCallbackAdapter.ts` | callee(호출 대상) `resolveAt()` | `calleeResolved.length === 0` | **집계 안 함**(commander 지정) | - |
| `dynamicCallbackAdapter.ts` | enclosing function `resolveAt()` | `enclosingResolved.length === 0` 또는 `> 1` | **집계함**(둘로 분리) | `enclosing-function-unresolved`/`technique-blocked`, `multiple-source-candidates`/`backlog` |

**집계 안 하는 3곳의 공통 이유**: 이 세 지점은 모두 "root가 실제로 이 지점과 관련된 진짜 관계의
후보다"라는 사실 자체가 아직 확인되지 않은 단계에서 실패한다. target 참조가 0건이면 애초에
`findDependsReferences()`가 잡은 텍스트 매치가 진짜 `Depends()` 참조가 아니었을 가능성이 더
크고(참조 자체가 허상), handler/callee 인자가 안 풀리면 이 호출 지점이 진짜 콜백 슬롯 호출인지
조차 모른다. 여기서 tally하면 adapter가 확인한 적 없는 관계의 존재를 단언하는 것이라 commander의
셋째 기준에 정확히 걸린다.

**집계하는 3곳의 공통 이유**: 이 세 지점에 도달했다는 것 자체가 이미 "root가 이 콜백 슬롯/
`Depends()` 인자로 실제로 전달됐다(또는 신뢰하는 alias로 확인됐다)"는 관계 존재가 확인된
뒤라는 뜻이다 - 남은 건 그 관계의 caller(감싸는 함수)를 못 좁힌 것뿐이므로 commander의 첫째
기준("존재는 확인했고 좁히는 데 실패")에 해당한다. `> 1`(다중 후보) 쪽은 `backlog`로 분류했다
- provider가 이미 쓸만한 다중 후보 답을 줬고, 부족한 건 `AugmentedEdge`가 후보를 하나 이상
표현할 스키마 필드가 없다는 구현 갭이지 provider capability 문제가 아니기 때문이다(target 쪽에
이미 있는 `resolution: 'multiple'`과 대칭되는 갭).

이로써 "이번 PR이 실제로 만드는 tally에는 backlog 항목이 0건일 수 있다"(위 설계안 2의 정직한
기록)는 상황이 바뀌었다 - `multiple-source-candidates`가 양쪽 adapter에 실제 코드 경로로
생겼다. 다만 실제 LSP가 자연스럽게 복수 후보를 돌려주는 fixture는 아직 못 만들었다(아래 "남은
검증 공백" 참고) - 뮤테이션으로 그 분기가 도달 가능함만 확인했다.

### README "이제 조용히 사라지지 않습니다" 문장 — 5번째 "문서가 코드보다 앞서 나간" 사례

commander 지적대로 이 절이 처음 쓴 문장("인식했지만 하나로 못 좁힌 경우 — 이제 조용히 사라지지
않습니다")은 무조건문이었는데, 위 표의 "집계 안 함" 3곳(target/handler/callee 식별 자체가
안 풀린 경우)은 애초에 "인식했지만"의 전제(root 관련 후보 존재 확인)가 충족되지 않으므로 이
code로도 안 잡힌다 - 좁게 읽으면(= "인식" = provider가 실제로 확인해 준 경우) 문장은 참이지만,
독자가 그 좁은 정의를 알 방법이 없으므로 넓게 읽으면 깨진 것처럼 보인다. **README에 명시적
예외 조항을 추가했다**(callee/handler 식별 불가 시 아무것도 안 보인다는 사실을 이름 대서
기술) - 코드를 문장에 맞추는 대신 문장이 코드의 실제 경계를 정확히 말하도록 고쳤다.

`docs/work/task-m4-milestone-closure-audit.md`가 이미 추적 중인 "문서/주석이 코드가 실제로
하는 일보다 더 많이 약속한다" 패턴의 **5번째 사례**로 기록한다(아래 그 문서 자체의 갱신 참고).
앞의 네 사례와 다른 점: 그것들은 전부 **한 번은 사실이었다가 코드가 바뀌면서 stale해진 문서**였다
- 이번 건은 그런 drift가 아니라 **이 PR이 새로 쓴 문장이 이 PR이 새로 쓴 코드보다 앞서 나간
것**이다(문서 작성 시점에 코드의 정확한 경계를 충분히 검토하지 않고 목표(무조건 "안 사라짐")를
그대로 문장으로 옮긴 것에 가깝다) - drift가 아니라 처음부터 범위가 안 맞은 경우.

### 실측 재검증 — dispatch·vue-core, 6곳 반영 전후 byte-identical

commander 요구("집계가 늘어 소음이 되는지 확인 후 merge 전 보고")에 따라 이 lane이 이미 설계
검증에 쓴 두 참조 코퍼스에 대해 6곳 반영 전/후를 `git stash`로 격리해 재측정했다.

- **FastAPI(dispatch)**: `dd2837e82a0bf5565b1b4b4b91ea30b7262d4061` pin, 기존 census에 쓴 8개
  쿼리(`src/dispatch/auth/service.py`의 `get_current_role` 등) 전부 재실행 - `precisionCommand`
  출력(edges/limitationDetails 포함) **전후 byte-identical**. `augmentation_inference_unresolved`
  발생 건수·message 문구 변화 없음.
- **JS/TS(vue-core)**: `54097087a0918b98f16c84599b1a6d654e952ca7`로 새로 클론(reviewer가 원래
  고정했을 커밋과 다를 수 있음, 원 커밋 소재를 찾지 못해 새로 pin) -
  `packages/runtime-dom/src/components/TransitionGroup.ts`의 `callPendingCbs` 쿼리(budget을
  피하려 `workspace`를 `packages/runtime-dom`으로 좁힘, 17개 파일만 대상) 재실행 - **전후
  byte-identical**.
- **방법**: `git stash` → `npm run cli:build` → 측정(before) → `git stash pop` → `npm run
  cli:build` → 측정(after) → diff. 두 코퍼스 모두 delta 0 - 6곳 반영이 이미 검증된 두 코퍼스
  기준으로는 disclosure 건수를 전혀 늘리지 않았다(두 코퍼스가 우연히 이 6곳에 해당하는 코드
  패턴을 안 가지고 있다는 뜻이지, 6곳이 다른 코퍼스에서도 항상 0건이라는 보장은 아니다 - 아래
  "남은 검증 공백" 참고).

### 뮤테이션 검증 — 6곳 새 분기가 실제로 살아있는지

`enclosingResolved.length === 0` 분기를 양쪽 adapter에서 강제로 `true`(항상 미확정)로 바꿔
재빌드 후 재실행 - `fastapiDependencyAdapter.ts` 쪽 7개, `dynamicCallbackAdapter.ts` 쪽 8개
테스트가 각각 정확히 예상한 방식으로 실패(다른 테스트는 그대로 통과)함을 확인, `/tmp/fda2.bak`/
`/tmp/dca2.bak`에서 원복 후 전체 재통과 확인.

### 남은 검증 공백 (commander/reviewer에 공개, merge 판단에 반영 요청)

`multiple-source-candidates`(`backlog`) 분기는 실제 LSP가 자연스럽게 복수 후보를 돌려주는
fixture를 아직 만들지 못했다 - 뮤테이션(강제 `true`)으로 그 코드 경로가 도달 가능함만
증명했고, 진짜 다중 정의(예: 같은 이름을 서로 다른 조건부 경로에서 두 번 정의)를 pyright/
tsserver가 실제로 `> 1`개 심볼로 되돌려주는 자연 fixture는 구성 난이도가 높아 이번 라운드에서
보류했다. 받아들일 수 있는 검증 공백인지 판단을 요청한다.
