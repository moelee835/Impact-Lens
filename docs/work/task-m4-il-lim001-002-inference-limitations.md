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
code: 'augmentation_inference_rejected'
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
성격인데 `warning`이다. **`error`로 올릴 유일한 후보는 gate C(runtime-only binding)인데, 그것도
"찾을 수 없다는 것을 안다"는 정직한 상태이지 분석 실패가 아니므로 같은 가족에 남긴다** - 아래
설계안 4에서 gate C도 이 code를 쓰되 category만 `runtime-only`로 다르다는 점 참고.

### 데이터 모델 — occurrence마다 쌓지 않는다

commander 지시(`onUpdated` 실측이 근거): entry 하나 + message에 건수·분류 요약. 새 SPI 필드:

```ts
// cli/src/shared/adapters/types.ts
export const REJECTED_INFERENCE_CATEGORIES = [
  'backlog',
  'capability-blocked',
  'technique-blocked',
  'runtime-only',
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
    code: 'augmentation_inference_rejected',
    severity: 'warning',
    scope: 'semantic',
    message: `${perAdapter}. These relationships are not represented as augmented edges; the static call graph above and every confirmed caller are unaffected.`,
    action: 'This means augmentation recognized a pattern it could not confirm a specific target for - not that no such relationship exists; the categories above explain whether this may improve in a future release (backlog, capability-blocked) or is a structural limit of static analysis (technique-blocked, runtime-only).',
  }];
}
```

**category → 사람이 읽는 문구 매핑안** (`summarizeByCategory`, 순서 고정 - backlog →
capability-blocked → technique-blocked → runtime-only, 카테고리가 0건이면 그 구절 생략):
- `backlog` → `"N not yet implemented"`
- `capability-blocked` → `"N waiting on a provider capability this analysis does not have"`
- `technique-blocked` → `"N blocked by the current detection technique (a safer, broader technique risks new false attributions)"`
- `runtime-only` → `"N determined only at runtime, which static analysis cannot resolve in principle"`

예시 문장(reviewer의 vue-core 표본을 예시로만 사용, 실제 코드에 하드코딩하지 않음):
`"dynamic-callback-static-v1 recognized 6 relationship(s) it could not resolve into a specific caller (6 blocked by the current detection technique (a safer, broader technique risks new false attributions)). These relationships are not represented as augmented edges; the static call graph above and every confirmed caller are unaffected."`

**reviewer/commander 검토를 위한 질문**: 이 message 문안이 실제로 사용자가 다음 행동을
결정하는 데 충분한지(특히 "이게 나아질 수 있는지" 판단), 그리고 `action` 문구가
`augmentation_adapter_failed`의 "This is the adapter failing to complete, not evidence that no
augmented relationship exists" 톤과 일관되는지 확인 부탁.

### `LIMITATION_SURFACE_PATTERNS` 등록안

```js
augmentation_inference_rejected: [
  /\brecognized\b[^.!?]{0,80}\bcould not resolve\b/i,
  /\bnot represented as augmented edges\b/i,
  /\bblocked by the current detection technique\b/i,
  /\bdetermined only at runtime\b/i,
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
| (문서에만, 코드 경로 신설 안 함) | router/`include_router` 레벨 `dependencies=[]` | `router-level-dependencies` | **capability-blocked**("router membership" capability 필요) |
| (gate C, 별도 fixture) | profile/conditional/programmatic registration/proxy-AOP | `runtime-determined-target` | **runtime-only** |

**backlog 카테고리 사례가 지금 코드에 없는 이유**: commander의 네 축 정의(backlog = "지금 SPI만으로
원리적으로 풀리는데 아직 안 한 것")에 해당하는 구체적 reject 사례를 이번 조사에서 찾지 못했다 -
위 표의 모든 reject는 capability-blocked 아니면 technique-blocked다. **backlog 값 자체는 vocabulary에
유지한다**(commander가 넷으로 확정했고, 향후 실제로 "안 한 것"이 생기면 바로 쓸 자리가 필요하다) -
다만 이번 PR이 실제로 만드는 tally에는 backlog 항목이 0건일 수 있다는 것을 정직하게 기록한다(추측으로
채우지 않는다).

## 설계안 3 — gate C(runtime-only binding) fixture, 별도로 유지

**절대 gate 7 잔여 fixture와 합치지 않는다** - `il-lim-002`의 2026-09-04 정정이 "코드 경로도 개념도
다르다"고 이미 명시했다. mount ambiguity(`isRouterMounted()`의 `nameAmbiguous`)는 기존 fixture로
충족되고, gate C는 **완전히 새 fixture**가 필요하다.

**fixture 후보 (FastAPI, 이미 확정 adapter가 있는 언어로 한정)**: `Depends()`의 대상 함수가 정적으로
하나로 안 좁혀지는 경우 - 예를 들어
```python
if os.environ.get("PROFILE") == "test":
    get_db = get_test_db
else:
    get_db = get_prod_db

@router.get("/items")
def read_items(db = Depends(get_db)):
    ...
```
여기서 `get_db`는 module-level 변수지만, 그 변수에 대입되는 값 자체가 조건부라 정적으로 단 하나의
함수를 가리키지 않는다(이미 module-level-alias reject로 걸리긴 하지만, **이 fixture가 검증해야 할
것은 "alias를 못 따라가서"가 아니라 "따라가도 후보가 여러 개(또는 확정 불가)라서"**라는 다른
주장이다 - 설계 단계에서 정확한 코드 shape은 reviewer와 함께 확정, 최소한 `runtime-only`로
분류되는 real 코드 경로 하나를 검증 가능한 fixture로 고정하는 게 목표).

**이 fixture의 종료 조건**: `runtime-only` category tally가 최소 1 증가하고, `augmentedEdges`에는
해당 관계의 edge가 **생기지 않는다**(현재 `resolution` 두 값 - `single`/`multiple` - 어디에도
안 들어감, stage 1이 이미 정의해 둔 대로).

## 설계안 4 — 사용자 문서 3곳 수정안

1. **`README.md`**: augmentation 언급이 0건 - 새 절 추가(위치는 기존 구조에 맞춰 결정, 초안은
   구현 단계에서). "무엇이 탐지되는가"(FastAPI Depends()/route, JS/TS 콜백·이벤트 등록)와 "무엇이
   탐지되지 않으며 왜인가"를 4축(backlog/capability-blocked/technique-blocked/runtime-only)으로
   설명.
2. **`cli/README.md`**: 현재 거짓 문장(`"coverage.semantic is static-only until provenance-bearing
   augmentation is implemented"`, line 109)을 고친다 - `cli/src/impact.ts:171`이 이미
   `static-plus-inference`를 만들고 있다. 정정 문장은 "augmentation이 켜지면
   `static-plus-inference`가 된다"는 사실을 정확히 반영.
3. **`plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`**: `fastapi-static-v1`만
   나열된 곳(line 443 근처)에 `dynamic-callback-static-v1`을 추가하고, 새 limitation code
   `augmentation_inference_rejected`도 기존 `framework_route_mount_unresolved`/
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
- 신규: gate C fixture(설계안 3) - `runtime-only` tally 확인 + `augmentedEdges`에 해당 edge 없음.
- 뮤테이션: 이 milestone 관례대로, 실제로 tally 집계 코드를 무력화해 관련 테스트만 실패하는지 확인.
- `LIMITATION_SURFACE_PATTERNS` 등록 후 `npm run test:response-policy` 무관 영역 회귀 없음 확인 +
  새 fixture 추가해 이 code의 disclosure 검출 확인.
- 문서 3곳 수정 후 response-policy의 doc invariant 테스트 영향 없음 확인(`cli-contract.md` 변경이
  기존 forbidden-phrase/working code span 검사를 안 깨는지).

## 열린 질문 (commander/reviewer 검토 요청)

1. **severity/message 문안**(위 설계안 1) - 특히 `action` 필드 톤과 category별 문구.
2. **code 이름**(`augmentation_inference_rejected`) - 대안이 있다면.
3. **gate C fixture의 정확한 코드 shape**(설계안 3의 예시가 실제로 "runtime-only"를 검증하는 데
   충분한지, 아니면 profile 분기가 아닌 다른 shape - 정적으로 안 풀리는 conditional, programmatic
   registration, proxy/AOP 중 어느 것을 대표로 삼을지).
4. **router-level `dependencies=[]`를 이번 lane에서 코드 경로까지 만들지, 문서화만 할지**(현재
   설계는 문서화만 - 위 "범위" 절 참고).
