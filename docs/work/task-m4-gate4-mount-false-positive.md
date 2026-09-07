# M4 gate 4 재개방 — router mount 오탐 수정

## 목적과 사용자 가치

**FastAPI 사용자가 존재하지 않는 라우트 도달성을 확정으로 통보받는 것을 막는다.** 지금은 workspace
어딘가에 우연히 같은 이름을 쓰는 `include_router(...)` 호출이 있기만 하면 — 그 이름이 root의 router와
실제로 아무 관계가 없어도 — 한 번도 mount되지 않은 라우트가 "도달 가능"으로 보고된다. 경고 없이.

이 마일스톤 전체가 막으려는 것은 "추론이 확정으로 읽히는 것"이다. 지금까지 M4가 잡은 사례들은 전부
"확정 edge와 후보 edge를 구분해서 보여주는가"의 문제였다. 이번 것은 다르다 — **후보로도 나가지 않고,
edge 자체가 잘못 확정된다.** 사용자가 지금 유일하게 틀린 답을 받는 경로다.

동시에, 이 마일스톤이 만든 두 limitation 코드(`augmentation_budget_exceeded`,
`framework_route_mount_unresolved`)를 정직하게 공개하면 `response-policy-engine`의 안전망이 오탐을
내는 상태를 없앤다. 안전망이 정직한 응답을 벌주면 아무도 쓰지 않는다.

## 배경과 해결할 문제

M4 stage 3 사후 감사(commander 요청, 세션 앞부분에서 이미 보고됨)에서 발견 1로 보고된 항목이다.
commander가 직접 격리 regex probe로 재확인해 판정을 확정했다:

`fastapiDependencyAdapter.ts`의 `isRouterMounted()`는 route decorator가 있는 함수가 실제로
"도달 가능"인지 판정하기 위해 workspace 전체에서 두 개의 독립적인 정규식을 돈다.

- `mountPattern`: `include_router(NAME` 형태가 **어느 파일에서든** 나타나는가.
- `bindingPattern`: **root 파일이 아닌 다른 파일**이 `NAME = APIRouter(...)`를 바인딩하는가(이름
  충돌 — 있으면 mount를 확정하지 않는다).

문제: `mountPattern`이 매칭되는 자리에서 `NAME`이 실제로 root의 router와 같은 심볼인지는 **전혀 확인하지
않는다.** `bindingPattern`은 "다른 진짜 `APIRouter()` 바인딩과 이름이 겹치는가"만 본다 — 함수 매개변수,
loop 변수, dict/attr 대입, factory 반환값, 다른 모듈에서 import한 값, `APIRouter`가 아닌 타입 주석을
가진 값처럼 **`APIRouter()`로 바인딩되지 않은** 동명 식별자는 `bindingPattern`에 걸리지 않고,
`mountPattern`은 그 식별자가 `include_router(...)`에 전달되기만 하면 원인을 안 가리고 통과시킨다.

commander가 직접 확인(격리 regex probe, 입력 행렬 6종 — 함수 매개변수/loop 변수/다른 모듈에서
import/dict·attr 대입/factory 반환/non-APIRouter 타입 주석)한 결과 전부 `mountFound=true,
nameAmbiguous=false`로 통과했고, 이 세션에서도 동일 6종을 독립적으로 재현했다(아래 "조사" 참고).
호출 지점(`fastapiDependencyAdapter.ts:422`)도 확인 — 합성 route entrypoint edge가 생성되고
`framework_route_mount_unresolved`는 나가지 않는다.

**이 발견의 핵심**: guard가 올바르게 거부하는 유일한 형태가 기존 fixture가 있는 바로 그 형태(진짜
`APIRouter()` 바인딩끼리의 이름 충돌)뿐이다. guard의 실제 적용 범위가 fixture corpus와 정확히 겹친다 —
corpus 밖의 형태는 전부 뚫린다.

### gate 4 재개방 판단

gate 4 문구는 "모호한 DI/dynamic target을 임의 승격하지 않는다"이다. 이 발견은 정확히 그 형태다 — target
router를 가리키지도 않는 증거로 "도달 가능"을 승격한다. PR #81은 `Depends()` 경로의 승격 지점 둘을
고쳤고, mount 경로의 세 번째 승격 지점은 다루지 않았다. **따라서 gate 4를 다시 연다.**

반론 여지: gate 문구를 "DI target"으로 좁게 읽으면 mount는 별개 판정 대상이라고 볼 수도 있다. 다르게
판단할 여지가 있다는 것을 기록해 둔다 — 다만 그렇게 읽더라도 **기존 gate 대조(PR #81/#83)가 이 경로를
한 번도 확인하지 않았다**는 사실 자체는 남는다. 이 문서는 "임의 승격 안 됨"을 mount 지점까지 포함하는
넓은 해석으로 판단해 gate 4를 재개방 상태로 다룬다.

## 범위와 범위에서 제외할 항목

**포함**:
1. mount 오탐 수정 (`isRouterMounted()`) — 이 lane의 본체.
2. `LIMITATION_SURFACE_PATTERNS`에 `augmentation_budget_exceeded`/`framework_route_mount_unresolved`
   항목 추가 (사후 감사 발견 5).
3. 발행된 문서 정정: `task-m4-stage3-accuracy-latency-gates.md`의 known-shape 카탈로그(5번째 범주
   추가, 2/4→2/5), `handover-2026-09-04.md`의 같은 숫자, gate 대조 문서(`task-m4-milestone-closure-audit.md`)의
   gate 4/3/7 판정.
4. `response-policy-engine.mjs`의 `mentionsIndexUncertainty()` 주석/gap 목록 교차 참조 수정(사후 감사
   발견 4) — **정규식 로직은 건드리지 않는다.**
5. `fastapiDependencyAdapter.ts` 최상단 주석 정정 — "모든 후보가 provider로 검증된다"는 주장이 mount
   경로에는 해당하지 않음을 명시.

**제외** (commander가 명시적으로 이번 lane 밖으로 지정):
- 여러 줄 `Depends(...)` 미탐(발견 2) — **코드 수정 안 함.** 발행된 숫자만 정정(카탈로그 5번째 범주로
  추가, 비율 정정). 정규식을 줄 경계 너머로 넓히는 것은 alias 정규식에서 이미 거부된 방향(안전한 미탐을
  오탐 가능성과 맞바꿈)과 같은 트레이드오프이고, 본체가 오탐 수정인 lane에서 섞으면 안 된다.
- `response-policy-engine.mjs`의 정규식 재설계 — 5라운드 검토 끝에 "regex 기반 lexical match는 원칙적으로
  주장을 진짜 주어에 귀속시킬 수 없다"로 의도적으로 멈춘 것. 다시 열지 않는다.
- 이미 알려진 항목(사후 감사 보고에서 "전달"로 표시한 것들): 남은 gate 5개, `runtime-observation` producer
  공백, `runAugmentation()` 미포착 예외, corpus 중복 제거 공백, `maxFiles` 값 자체, gopls CI flake 2건.

## 현재 구현 조사 결과

### 코드 읽기 — provider 재검증(방향 a)이 구조적으로 불가능함을 확인

`AdapterInput.provider`의 타입은 `CallHierarchyProvider`(`cli/src/types.ts:243`)이고, 이 인터페이스가
adapter에 노출하는 메서드는 `prepare(file, position)`과 `incoming(item)` 둘뿐이다. 둘 다 **호출 가능한
심볼(함수/메서드)** 을 전제로 한다 — `isRouterMounted()`의 자기 주석(273행 위 doc comment, 208행)이 이미
명시: "a router variable is neither [resolvable via CallHierarchyProvider]". `Depends()` 경로가
`prepare()`로 재검증할 수 있는 이유는 그 자리가 함수 참조이기 때문이고, mount 지점(`include_router(...)`
안의 router 변수 참조)은 애초에 이 provider가 답할 수 있는 질문이 아니다. 새 provider capability(예:
definition/references)를 추가하는 것은 이 파일의 SPI 범위를 벗어나는 별도 작업이고, `AdapterInput`의
설계 주석 자체가 "단일 함수 타입, 플러그인 시스템 아님"을 명시(스타일 근거: `adapters/types.ts` 최상단
주석) — 지금 lane에서 할 일이 아니다.

**결론: 방향 (a)는 기존 provider 인터페이스로 구현 불가능하다.** 이건 판단이 아니라 타입 선언을 직접
읽어 확인한 사실이다(`[읽음]`). 남은 선택은 (b) — mount 인자가 root의 router 바인딩과 실제로 연결된다는
추가 텍스트 증거를 요구하는 것뿐이다.

### 격리 재현 — 6종 입력 행렬과 후보 수정안

commander의 6종(함수 매개변수, loop 변수, 다른 모듈에서 import, dict/attr 대입, factory 반환,
non-APIRouter 타입 주석)을 독립적으로 재현하고, 후보 수정 함수 `importsNameFromModule()`을 격리
스크립트로 직접 실행해 검증했다(`[실행]`, 스크립트: 세션 scratchpad `mount-fix-probe.mjs`, 이 저장소에는
포함하지 않음 — 검증 방법의 기록일 뿐 산출물이 아님).

결과: 10개 케이스(양성 3종 — 기존 cross-file positive, relative import 변형, dotted package 변형; 음성
7종 — 위 6종 + aliased import) 전부 기대대로 통과. 상세는 아래 "단계별 구현 계획" 1단계 참고.

이 저장소의 기존 관례(`aliasBindingsFor`, `findDependsReferences`)와 일치시켰다: 한 줄 단위, alias는
별도로 취급, 괄호로 감싼 여러 줄 import는 다루지 않음(같은 이유로 이미 문서화된 한계) — 새 한계를
만드는 게 아니라 이 파일이 이미 받아들인 한계를 같은 강도로 반복하는 것이다.

## 단계별 구현 계획

### 1단계 — mount 오탐 수정 (본체)

**목적**: `include_router(NAME)`이 root의 router 바인딩과 실제로 연결됨을 확인할 수 없으면 mount를
확정하지 않는다 — false negative가 안전한 방향(이 파일 자신의 비대칭 원칙, alias 정규식 주석과 동일).

**산출물**:
- `importsNameFromModule(lines, name, moduleStem)` 함수 추가 — root가 아닌 파일에서 mount 후보가
  발견되면, 그 파일이 실제로 `from <root의 모듈> import ... NAME ...`(alias 없이) 형태로 NAME을
  import하는지 확인. root 파일 자신에서의 self-mount(같은 파일 안에서 바인딩과 mount가 함께 있는
  경우, 예: `mounted_router.py`)는 이 확인 없이 그대로 통과(교차 파일 연결이 필요 없는 경우이므로).
- `isRouterMounted()` 수정: `mountPattern`이 root가 아닌 파일에서 매칭됐을 때 위 확인을 추가로 요구.
- fixture 6종 신규 추가(각 adversarial 형태 1개씩) — 모두 "mount-unresolved"가 기대 결과.
- 파일 최상단 주석 정정(위 "범위" 5번).

**검증**:
- 기존 양성 경로 전부 재확인 — `mounted_router.py`(self-mount), `crossfile_positive_*`(교차 파일 양성),
  `collision_*_mounted.py` 3쌍(이름 충돌해도 mount된 쪽 판정 — 주의: 이 fixture들의 mount 호출은 모두
  같은 파일 안에 있으므로 self-mount 경로로 통과해야 하고, `nameAmbiguous`가 별도로 걸어야 한다.
  **통과만 보지 않고 왜 통과하는지 확인** — self-mount 경로로 통과하는지, 새 import 확인 경로로 통과하는지
  구분해서 기록).
- 신규 fixture 6종 각각 mutation으로 non-vacuity 확인: 수정한 guard를 되돌렸을 때 정확히 그 fixture만
  실패하는지 확인.
- 전체 CLI 테스트 스위트.
- latency: 이 fix는 파일 워크 구조를 바꾸지 않고, 이미 방문한 파일에 대해 `mountPattern`이 매칭된
  경우에만 문자열 검사 하나를 추가하므로 방향 (a)와 달리 재측정이 필수는 아니다(commander 문서 자체가
  "(a)를 택하면 필수"라고 명시). 그래도 회귀가 없는지 가벼운 확인은 수행하고 기록한다.

### 2단계 — limitation 공개 패턴 추가

**목적**: 새 두 limitation 코드를 문서 권장 문구로 정직하게 공개해도 `response-policy-engine`이 오탐을
내지 않게 한다.

**산출물**: `LIMITATION_SURFACE_PATTERNS`에 `augmentation_budget_exceeded`,
`framework_route_mount_unresolved` 항목 추가 — 패턴은 `coverage.ts`의 실제 message/action 문구에서 추출.
eval fixture 추가.

**검증**: `response-policy-engine` eval 전체 통과. 두 코드를 공식 권장 문구로 공개한 요약이 더 이상
"미공개"로 오탐되지 않는지 직접 실행 확인.

### 3단계 — 문서 정정 (발행된 측정치·gate 판정)

**목적**: 이미 발행된 숫자·판정과 실제가 어긋난 상태를 없앤다. AGENTS.md의 "shipped 상태와 실제가 다르면
정정 대상"에 따라, 코드 변경이 아니라 문서 신뢰성 문제로 취급한다.

**산출물**:
- `task-m4-stage3-accuracy-latency-gates.md`: known-shape 카탈로그에 5번째 범주(여러 줄 `Depends()`)
  추가, 비율 `2/4 (50%)` → `2/5 (40%)`로 정정, 문서 자신이 예고한 경고("아직 발견 못 한 형태는 이
  proxy에 반영 안 됨")가 실제로 맞았다는 것을 기록.
- `handover-2026-09-04.md`의 같은 숫자 정정.
- `task-m4-milestone-closure-audit.md`(gate 대조 문서): gate 4 재개방, gate 3은 "문구상 유지되나 지정된
  범위보다 좁다"는 것을 기록, gate 7의 precision 19/0 숫자는 "숫자가 틀린 게 아니라 이 오탐 경로가
  ledger에 없었다"로 의미 범위를 좁혀 기록(숫자 삭제 안 함).
- `response-policy-engine.mjs`의 `mentionsIndexUncertainty()` 주석: 후보-caller 블록이 whole-summary
  동작을 gap 3로 가리키는데 gap 3은 문장 scope 분기만 설명 — 첫 분기(전체 문자열 scope)가 별도임을 gap
  목록에 추가하고, PR #75가 가르친 어휘(`\bindex\b`)와의 충돌을 기록.

**검증**: 문서 상호 참조 재확인(숫자가 나오는 모든 자리를 grep으로 다시 확인), 코드 변경 없음이므로
빌드/테스트 영향 없음.

## 테스트 및 완료 기준

- CLI 전체 테스트 스위트 pass, 0 fail.
- 신규 fixture 6종 + 기존 양성 fixture 전부 mutation 기반 non-vacuity 확인 완료.
- `response-policy-engine` eval 전체 pass.
- gate 4 재개방 판단, 문서 정정, 코드 수정이 각각 독립 commit으로 분리되고 push됨.
- 완료 후에도 남는 것: 발견 2(여러 줄 `Depends()`)는 의도적으로 미수정 — 사용자가 이 형태를 쓰면 여전히
  후보가 나타나지 않는다. 발견 4는 주석만 정정 — `stale_index_caveat`의 unscoped 분기 자체는 남는다.

## 작업 로그

### 1단계 완료 — mount 오탐 수정

- **변경 파일**: `cli/src/adapters/fastapiDependencyAdapter.ts`(`importsNameFromModule()` 추가, `isRouterMounted()` 수정, 최상단 주석 정정), `cli/src/test/pythonFastapiIntegration.test.ts`(fixture 6종을 `MOUNT_UNRESOLVED_GUARD_FIXTURES`에 추가), fixture 신규 8개(`adversary_param_router.py`/`adversary_param_shadow.py`, `adversary_loop_router.py`/`adversary_loop_shadow.py`, `adversary_elsewhere_router.py`/`adversary_elsewhere_source.py`/`adversary_elsewhere_shadow.py`, `adversary_dictattr_router.py`/`adversary_dictattr_shadow.py`, `adversary_factory_router.py`/`adversary_factory_shadow.py`, `adversary_typed_router.py`/`adversary_typed_shadow.py`).
- **방향 결정 (a) vs (b)**: `AdapterInput.provider`의 타입(`CallHierarchyProvider`, `cli/src/types.ts:243`)을 직접 읽어 `prepare()`/`incoming()` 둘 다 호출 가능한 심볼만 다룬다는 것을 확인 — 방향 (a)(provider 재검증)는 기존 인터페이스로 구현 불가능함을 판단이 아니라 타입 선언으로 확인했다(`[읽음]`). 방향 (b)(`importsNameFromModule()` — mount 호출부가 root의 모듈에서 실제로 그 이름을 import하는지 확인)를 세션 scratchpad의 격리 스크립트(`mount-fix-probe.mjs`, 저장소에는 포함 안 함)로 10개 케이스(양성 3 + 음성 7) 전부 검증 후 채택(`[실행]`).
- **예상 못한 충돌**: `.exec()`를 쓰자 `cli/src/test/buildInvocation.sources.test.ts`의 spawn-family 인벤토리 테스트가 `RegExp.prototype.exec`를 `child_process`류 member call로 오인 — `String.prototype.match()`로 교체해 해결. 이어서 이 사실을 설명하는 주석 자체가 `.exec(`꼴 문자열을 텍스트로 포함해 같은 테스트를 4건 트립시킴(정규식이 주석·코드를 구분하지 않는 순수 텍스트 스캔이기 때문) — 주석 표현을 리터럴 회피 문구로 재작성해 해결. 둘 다 실행으로 발견·확인.
- **non-vacuity**: `isRootFile || importsNameFromModule(...)` 조건에 `|| true`를 임시 삽입해 guard를 무력화 → 신규 fixture 6개만 정확히 실패(`pythonFastapiIntegration.test.ts`), 기존 34개는 전부 그대로 통과 → 원복 → 전체 CLI 스위트 369 pass/0 fail/3 skip 재확인.
- **기존 양성 경로가 왜 통과하는지**: `mounted_router.py`(self-mount, `isRootFile` 분기로 통과 — 새 import 검사를 거치지 않음), `crossfile_positive_*`(교차 파일, `importsNameFromModule()`이 실제로 `from crossfile_positive_router import crossfile_positive_router`를 찾아 통과), `collision_*_mounted.py` 3쌍(mount 호출이 전부 바인딩과 **같은 파일** 안에 있어 self-mount 분기로 통과 — `nameAmbiguous`는 별도로 다른 파일의 진짜 `APIRouter()` 바인딩에 의해 걸림) — 셋 다 코드 읽기로 확인 후 전체 스위트 통과로 재확인. **2026-09-07 정정(commander 독립 검증)**: 바로 위에서 "`nameAmbiguous`는 ... 이번 수정과 무관"이라고 적었는데 **무관하지 않다** — 아래 "남은 한계(commander 독립 검증으로 추가)" 참고. `nameAmbiguous`는 이 fixture 3쌍의 self-mount 판정에는 정말 무관하지만, `importsNameFromModule()`이 여는 별도의 구멍(cross-package 동명 basename)을 **우연히** 막고 있다는 점에서 이 수정 전체와 무관하지 않다.
- **latency**: 방향 (b)는 파일 워크 구조를 바꾸지 않으므로 재측정을 필수로 보지 않았다(문서 자체가 "(a)를 택하면 필수"라고 명시). 기존 latency gate 테스트(`~3448ms`, 수정 전 `~3461ms`)가 그대로 통과해 회귀 없음을 가볍게 확인.
- **커밋**: `f91f1c1`.

### 2단계 완료 — limitation 공개 패턴 추가

- **변경 파일**: `scripts/lib/response-policy-engine.mjs`(`LIMITATION_SURFACE_PATTERNS`에 두 항목 추가), fixture 신규 2개(`scripts/fixtures/response-policy/25-augmentation-budget-exceeded-correctly-reported.json`, `26-framework-route-mount-unresolved-correctly-reported.json` — 저장소의 다음 번호가 이미 24까지 쓰여 있어 23/24 대신 25/26 사용).
- **패턴 출처**: `coverage.ts`의 `augmentationBudgetDetails()`/`mountUnresolvedDetails()` 실제 message/action 문구와 `SKILL.md`의 "Check limitationDetails for..." 권장 패러프레이즈 둘 다에서 추출.
- **뜻밖의 상호작용 발견(실행으로)**: `framework_route_mount_unresolved` fixture를 SKILL.md의 정확한 문구("this is not evidence the route is unreachable, only that this scan could not confirm it")로 작성했더니 `stale_index_caveat`가 오탐으로 걸렸다 — 이 문구의 "not evidence"가 이미 알려진 finding 4(gap 3의 scope 없는 첫 분기)와 정확히 충돌한 것이다. 요약 어디든 "index"가 한 번, "not evidence" 등이 다른 곳에 한 번만 있으면 `indexingStatus: ready`에서도 거짓 발동한다는 것을 이 fixture 작성 과정에서 직접 재현했다(`[실행]`). finding 4는 이번 lane에서 정규식을 고치지 않기로 했으므로, fixture 26은 대신 `coverage.ts`의 원문 문구("does not mean the route is unmounted")를 쓰도록 다시 작성해 이 충돌을 우회했다 — fixture description에 이 상호작용을 기록해 다음 사람이 finding 4를 볼 때 이 사례도 참고하게 했다.
- **non-vacuity**: 추가한 두 항목을 삭제 → `node scripts/test-response-policy.mjs` 재실행 → 정확히 fixture 25·26만 실패(`missing_high_severity_disclosure` 방향), 나머지 32개 체크는 그대로 통과 → 원복 → 전체 34개 체크 통과 재확인.
- **커밋**: `7d4d505`.

**2026-09-07 정정 — commander 독립 검증(engine 두 버전을 나란히 실행)이 세 가지를 찾음:**

1. **`/\binclude_router\(/i` 패턴이 공개 검사를 무력화함(`[실행]`, 직접 재현).** 나머지 네 패턴은
   "mount를 확인 못 했다"는 **주장 형태**인데 이것만 함수 이름 하나였다. `evaluateSummary()`를 직접
   불러 두 개의 나쁜 요약으로 확인: (a) "orphan_handler is reachable via include_router() in
   main.py."(mount 미확인인데 **정반대**를 주장) → 위반 0건, (b) 이름만 언급하고 아무 공개도 안 함 →
   위반 0건. 둘 다 `missing_high_severity_disclosure`가 나와야 하는데 안 나왔다. 패턴 제거 후 재확인:
   두 나쁜 요약 모두 정확히 `missing_high_severity_disclosure`로 잡히고, fixture 26(coverage.ts 원문
   문구 사용)은 나머지 네 패턴만으로 그대로 통과 — **제거해도 잃는 게 없다.** 패턴 목록에서 제거함.
2. **패턴 목록 자체에 finding 4 함정을 명시하는 주석 추가.** 세 번째 패턴("not evidence ... route is
   unreachable", SKILL.md 원문)이 `stale_index_caveat`의 스코프 없는 첫 분기와 충돌한다는 사실이
   fixture 26의 description에는 있었지만 패턴 목록 자체에는 없었다 — 패턴만 보고 편집하는 사람은 못
   본다는 지적을 받아들여 `LIMITATION_SURFACE_PATTERNS` 바로 위에 "TRAP" 주석으로 명시했다. 정규식은
   손대지 않음(finding 4는 별도, 이미 5라운드 검토 끝에 의도적으로 정지된 상태).
3. **주석의 fixture 인용 오류 정정**: "scripts/fixtures/response-policy/23-*, 24-*"라고 썼던 것을
   실제 파일명인 "25-*, 26-*"로 고쳤다 — 이 저장소 자신이 "줄 번호가 아니라 원문으로 인용한다"고
   요구하는데, 새로 쓴 주석의 인용이 파일명 리네임(23/24→25/26) 이후 안 갱신된 채로 남아 있었다.

재검증: `node scripts/test-response-policy.mjs` 전체 34개 체크 통과, 위 두 나쁜 요약 모두
`missing_high_severity_disclosure`로 정확히 잡힘 재확인. 커밋: `3dd3cc2`(1·2단계와 별도).

## 남은 한계(commander 독립 검증으로 추가, `f91f1c1` 검증)

`importsNameFromModule()`을 격리 스크립트로 뽑아 실행한 결과, 이번 lane의 수정 자체가 완전하지
않다는 것이 드러났다. 코드는 고치지 않고(commander 지시) 여기에 기록만 한다.

### 한계 1 — 같은 basename, 다른 package는 여전히 통과한다

`importsNameFromModule()`은 **마지막 dotted segment만** 비교한다. root가 `pkg_a/users.py`일 때,
`pkg_b/users.py`(완전히 무관한 다른 package)를 `from pkg_b.users import router`로 import해
`include_router(router)`하는 파일도 provenance 검사를 **통과한다**(`[실행]`, commander가 격리
스크립트로 확인 → 이 세션이 같은 결과를 직접 재현: `importsNameFromModule(['from pkg_b.users import
router'], 'router', 'users')`가 `true`를 반환). `users.py`/`api.py`/`routes.py`가 여러 package에
있는 것은 FastAPI 프로젝트에서 드물지 않다. `importsNameFromModule()`의 doc comment에 이 gap을
명시했다(위 1단계 파일, "KNOWN, ACCEPTED GAP" 문단).

### 한계 2 — `nameAmbiguous`가 이미 provenance 증명된 mount도 미탐으로 만든다

`nameAmbiguous`(기존 로직, 이번 lane에서 안 건드림)는 **다른 아무 파일이나 같은 이름을
`APIRouter()`에 바인딩하면** mount를 거부한다. `importsNameFromModule()`이 이미 "mount 호출부가
root의 모듈에서 그 이름을 가져왔다"를 증명한 뒤에도, 워크스페이스 어딘가에 무관한
`router = APIRouter()`가 하나만 있으면 이 mount는 여전히 미확인 처리된다(`[실행]`, 이 세션이 직접
재현: `bindingPattern` 정규식이 `router = APIRouter()`에 매칭됨을 확인). `router`는 FastAPI 공식
튜토리얼이 쓰는 관행적 이름이라(실제 저장소 통계는 아니고 관행 근거), router 모듈이 둘 이상인
프로젝트는 provenance가 증명돼도 mount 확인에 실패할 수 있다.

### 결합 — 1번은 2번 때문에 우연히 안전하다

**한계 1을 실제로 막고 있는 건 한계 2다.** `pkg_b/users.py`가 워크스페이스에 실재하려면 그 파일이
진짜 router 모듈이어야 하고(즉 `router = APIRouter()`를 바인딩), 그게 `nameAmbiguous`를 켜서 한계
1의 오탐을 결과적으로 막는다 — **설계가 아니라 우연한 결합**이다(이 세션이 5개 파일 시나리오를
논리적으로 추적해 확인: `mountFound=true`(한계 1) && `nameAmbiguous=true`(한계 2) → `found =
mountFound && !nameAmbiguous` = `false`). `nameAmbiguous`를 "이미 provenance가 있으니 잉여"라고
보고 없애거나 완화하면 한계 1이 바로 열린다. `importsNameFromModule()`의 doc comment에 이 결합
관계와 "제대로 고치려면 상대 import를 importing 파일 기준으로 완전히 resolve해서 `rootFile`과
전체 경로로 비교해야 한다"는 방향을 함께 적었다.

### recall proxy 분모에 넣을지 — 판단: 넣지 않는다

commander가 판단을 요청했다. **한계 2("guard가 이미 증명된 mount를 워크스페이스 구성 때문에
거부하는 경우")는 `task-m4-stage3-accuracy-latency-gates.md`의 "known shape coverage" proxy
분모에 넣지 않는 게 맞다고 본다.** 그 proxy는 "mount 참조를 표현하는 **구문 형태**(모듈 속성,
alias 변수, 괄호 여러 줄 import, 비-첫자리 alias, 여러 줄 `Depends()`) 중 몇 개를 탐지하는가"를
묻는다 — 전부 "이 코드를 어떻게 썼는가"에 대한 질문이다. 한계 2는 코드를 어떻게 썼는지와
무관하다: **올바른 구문(bare identifier, 정확히 import됨)을 썼는데도, 워크스페이스에 무관한
동명 router 모듈이 하나 존재한다는 이유만으로** 거부된다 — 성격이 다른 질문("이 코드가 얼마나
자주 다른 코드와 충돌하는가")이라 억지로 같은 분모에 넣지 않는다. 대신 "이 기능이 신뢰성 있게
발동하는 조건" 서술에 별도 항목으로 추가했다(`task-m4-stage3-accuracy-latency-gates.md`).

### 3단계 완료 — 문서 정정

- **`task-m4-stage3-accuracy-latency-gates.md`**: 5번째 known shape(여러 줄 `Depends()`, finding 2)
  추가, 비율 2/4(50%)→2/5(40%) 정정, 이 정정 자체가 문서 자신의 "아직 발견 못 한 shape은 proxy에
  반영 안 됨" 경고가 맞았다는 증거임을 기록. 한계 2(워크스페이스 구성 의존 미탐, commander 독립
  검증)도 "신뢰성 있게 발동하는 조건" 절에 별도 항목으로 추가(분모에는 안 넣음, 판단 근거 명시).
- **`task-m4-gate3-gate4-closure.md`**: 상태 줄과 결론 문단에 gate 4 재개방·gate 3 범위 협소 정정
  섹션 추가.
- **`handover-2026-09-04.md`**: 미탐 비율(2/4·50%→2/5·40%), gate 표(gate 4 재개방·gate 5 닫힘·gate
  7 ledger 범위 축소), PR #81/#82/#83 행 정정.
- **`task-m4-milestone-closure-audit.md`**: 판정표는 대조 시점 스냅샷으로 그대로 두고 바로 아래에
  "이후 갱신" 정정 문단 추가, gate 7 절에 precision 19개 쿼리 ledger 범위 축소 정정 추가.
- **`response-policy-engine.mjs`(finding 4, 정규식은 안 건드림)**: `mentionsIndexUncertainty()`의
  scope 없는 첫 분기를 별도 "UNSCOPED GAP" 주석으로 명시(이전에는 이 분기에 대한 설명이 전혀 없었고,
  다른 두 자리(`augmented_edges_not_distinguished` 주석, finding 5의 `framework_route_mount_
  unresolved` TRAP 주석)가 잘못 `INDEX_SCOPED_MAY_NOT_UNCERTAINTY`의 "gap 3"(문장 scope 분기 전용)을
  가리키고 있던 것을 정정 — 세 자리 모두 올바른 위치를 가리키도록 고침). PR #75가 가르친 어휘
  (`\bindex\b`가 boundary marker, "not confirmed" 등 hedging 어휘)와의 충돌도 근본 원인으로 기록.
- **검증**: 코드 변경 없는 순수 문서 수정 3건은 검증 대상 아님. `response-policy-engine.mjs`
  주석 수정은 `node scripts/test-response-policy.mjs`(34개 체크 통과)로, `fastapiDependencyAdapter
  .ts`의 doc comment 추가(한계 1·2 기록)는 `npx tsc -p ./` + CLI 전체 스위트(369 테스트, 366 pass/
  0 fail/3 skip)로 재확인.
- **커밋**: `d061446`.

### PR #84 리뷰 — commander 최종 검증(2026-09-07)

commander가 PR #84 전체를 자신의 harness로 재실행해 요청 4건 모두 실재함을 확인(`[실행]`) — 두
fixture는 그대로 통과, 세 가지 오탐 케이스(정반대 주장/무공개/전혀 언급 안 함) 전부
`missing_high_severity_disclosure`로 잡힘. TRAP·UNSCOPED GAP 주석, 교차 참조 정정, fixture 인용
전부 실재 확인. finding 4 교차 참조를 `augmented_edges_not_distinguished` 자리까지 스스로 더 찾아
고친 것을 별도로 긍정 평가받음. recall proxy 분모 미포함 판단에 동의 받음.

**정정 요청 1건**: `handover-2026-09-04.md`의 "현재도 3개 근방이되 어느 3개인지가 바뀌었습니다"
표현이 이 lane이 고치려는 것과 같은 종류의 모호함(`c78dc92`의 "4 of 8"이 stale해서 상태가 잘못
읽힌 것)을 반복한다는 지적 — "근방" 대신 정확한 3-1-4 분해("닫힘 3개 / 재개방·판정대기 1개 / 열림
4개", 합 8)로 교체했다. 커밋: `0fe29b6`.

**CI 완주 — Windows 회귀 1건 발견·수정(`[실행]`).** CI 12개 잡 완주, 9개 pass·3개 fail(전부
`windows-latest`: `clangd`, `cli:test`, `gopls`). 로그 확인 결과 `clangd`/`gopls` 잡도 같은 CLI
테스트 스위트를 돌리며, 셋 다 **같은 원인**으로 실패: `closure audit gate 3: a bare-identifier
router mount succeeds across files` 테스트가 `augmentedEdges.length`에서 `1`을 기대했는데 `0`을
받음(`crossfile_positive_*` 양성 fixture가 더 이상 통과하지 않음).

원인: `importsNameFromModule()`의 `fromPattern`이 `(.+)$`로 끝나는데, Windows CI는(이 저장소에
`.gitattributes`가 없어) 체크아웃 시 fixture 파일을 CRLF로 받는다. JS 정규식의 `.`은 `\r`을
포함하지 않으므로, 줄 끝에 남는 `\r` 때문에 `$`가 절대 매칭되지 않아 이 정규식 전체가 CRLF 파일에서
항상 실패한다 — `crossfile_positive_app.py`뿐 아니라 이 함수가 검사하는 모든 파일에서. 로컬(LF)
에서는 재현되지 않아 이전 non-vacuity 검증에서 놓쳤다.

수정: `$` 앵커를 제거(`(.+)`만 남김) — `.`이 이미 `\r`/`\n`을 제외하므로 앵커 없이도 그 지점에서
멈추고, LF 파일에서의 동작은 그대로다. 격리 검증: Node에서 CRLF 줄을 직접 넣어 앵커 있음/없음 각각
테스트 → 있음은 실패, 없음은 성공(`crossfile_positive_router` 캡처) 확인. 로컬 CLI 전체 스위트
재확인(369/366 pass/0 fail/3 skip). **non-vacuity 재확인**: 이 수정 후에도 `isRootFile ||
importsNameFromModule(...)`을 `isRootFile || true`로 무력화 → 신규 fixture 6개만 정확히 실패,
나머지 그대로 통과 → 원복 → 전체 그린 재확인 — CRLF 수정이 guard의 실질 동작을 바꾸지 않았음을
같이 증명했다.

커밋: 아래 push 후 해시 기록. push 후 CI 재확인 예정.