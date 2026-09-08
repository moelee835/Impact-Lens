# M4 gate 4 마무리 — mount import provenance를 정확한 경로 비교로

## 목적과 사용자 가치

**router 모듈이 둘 이상인 평범한 FastAPI 프로젝트에서 이 기능이 실제로 작동하게 만든다.**

`router`는 FastAPI 공식 튜토리얼이 쓰는 관행적 변수명이다 — 실제 프로젝트는 거의 항상 `users.py`,
`orders.py`처럼 라우터별 파일을 나누고 각각 `router = APIRouter()`를 쓴다. 지금 `isRouterMounted()`의
`nameAmbiguous` 검사는 "워크스페이스 어디든 같은 이름을 `APIRouter()`에 바인딩하는 다른 파일이 있으면
거부"라서, **router 모듈이 둘만 돼도 mount 확인이 실패한다.** 즉 이 기능은 지금 "router 파일이 딱
하나뿐인" 비현실적인 프로젝트에서만 돈다 — M4 stage 3가 "이 기능이 신뢰성 있게 발동하는 조건이
사실상 bare identifier 단일 mount"라고 기록한 것의 가장 큰 조각이 바로 이것이다.

동시에, **PR #84가 발견하고 문서화만 해 둔 cross-package 잔여 오탐**(`importsNameFromModule()`이
마지막 dotted segment만 비교해, 같은 basename의 다른 package도 통과시키는 문제)을 실제로 닫는다.
지금 그게 안 터지는 건 `nameAmbiguous`가 우연히 막고 있기 때문이고, 설계된 방어가 아니다.

**사용자가 두 가지를 결정했다(2026-09-07, commander 경유): (1) 이 gap을 지금 닫는다, (2) 그다음은
gate 2(확장 UI 표현) — 설계 판단이 먼저라 별도 lane.** 이 문서는 (1)만 다룬다.

## 배경과 해결할 문제

PR #84(`docs/work/task-m4-gate4-mount-false-positive.md`)가 `importsNameFromModule()`을 추가해
"mount 호출부가 root의 모듈에서 그 이름을 import하는지" 확인하게 했다. 하지만 그 구현은 **모듈
경로의 마지막 dotted segment만 비교**한다 — `from pkg_b.users import router`와 `from
pkg_a.users import router`를 구분하지 못한다. 이 gap은 지금 `nameAmbiguous`(더 오래된, 워크스페이스
전체에서 같은 bare 이름의 다른 `APIRouter()` 바인딩을 찾는 검사)가 **우연히** 막고 있다 — `pkg_b/
users.py`가 실재하려면 그 파일도 거의 항상 `router = APIRouter()`를 바인딩하고, 그게
`nameAmbiguous`를 켜기 때문이다. 이게 바로 **다중 router 프로젝트에서 mount 확인이 실패하는 그
검사**다. 두 문제는 같은 원인(부정확한 provenance 검사를 `nameAmbiguous`가 과도하게 넓게
보완하고 있는 것)의 두 증상이다.

## 범위와 범위에서 제외할 항목

**포함**:
1. `importsNameFromModule()`을 stem 비교 대신 **importing 파일 기준 정확한 경로 해석**으로 교체
   (상대 import는 정확히, 절대 import는 workspace-root=package-root 근사).
2. `nameAmbiguous`의 역할 재검토 — 정확해진 provenance 검사가 실제로 무엇을 대체하는지 실측하고,
   대체되지 않는 부분이 있다면 남기고 이유를 기록(무작정 삭제하지 않는다).
3. fixture 양쪽 방향(새로 통과해야 하는 것, 계속 거부해야 하는 것) 추가, 기존 전부 유지 확인.
4. 정확도 corpus·latency 재측정, 바뀐 게 있으면 발행 숫자 정정.
5. gate 4 최종 판정(닫을 수 있는지) 보고, 닫을 수 있으면 관련 문서 3건의 개수를 갱신.

**제외**:
- gate 2(확장 UI 표현) — 사용자가 순서를 정했고, 설계 판단이 먼저 필요해 별도 lane. **이번 lane에서
  착수하지 않는다.**
- 절대 import의 src-layout/editable-install/`sys.path` 조작까지 정확히 처리하는 것 — workspace
  root를 package root로 보는 근사만 하고, 그 근사가 틀릴 수 있는 조건은 문서화하되 코드로
  일반화하지 않는다(과설계 위험, 이 파일의 "bounded heuristic" 원칙과 일치).
- 모듈 속성 mount(`x.router`), 여러 줄 `Depends()` 등 이미 알려진 다른 미탐 shape — 이번 lane과
  무관.

## 현재 구현 조사 결과

### `importsNameFromModule()`의 정확한 문제

`fromPattern`이 `from\s+\.*(?:\w+\.)*STEM\s+import`로, dots 개수와 절대/상대 여부를 무시하고
마지막 세그먼트만 본다. 상대 import(`from .users import`)와 절대 import(`from pkg_b.users
import`)를 같은 방식으로 처리하는데, 실제로는 완전히 다른 이름 공간 규칙을 따른다 — 상대 import는
importing 파일의 위치에 대해 상대적이고, 절대 import는 (일반적으로) 프로젝트 루트에 대해
절대적이다. 이 구분을 무시하는 것이 cross-package collision을 통과시키는 근본 원인이다.

### `nameAmbiguous`가 실제로 막는 것 — 격리 재현으로 확인(`[실행]`)

세션 scratchpad의 격리 스크립트(`module-resolution-probe.mjs`, `[실행]`, 저장소에는 포함 안 함)로
10개 케이스(상대 import 3종 깊이, 절대 import, cross-package collision 2종, 다중 router 프로젝트
양성, alias 거부, CRLF 2종)를 새 경로-비교 로직으로 직접 돌려 전부 기대대로 통과함을 확인했다.

**그런데 `nameAmbiguous`를 완전히 삭제하면 기존 fixture 하나가 깨진다는 것도 실측으로 확인했다.**
`collision_router_mounted.py`(자기 파일 안에서 self-mount, `collision_router_unmounted.py`가
워크스페이스 어딘가에서 같은 bare 이름 "router"로 **무관한** `APIRouter()`를 바인딩)는 지금
"mount-unresolved"가 기대값이다. 이건 **cross-file import provenance와 무관한 self-mount
경로**(`isRootFile` 분기 — import 검사를 아예 안 거침)이기 때문에, provenance 검사가 아무리
정확해져도 이 경로 자체를 대체하지 못한다. `nameAmbiguous`를 완전히 없애면 이 fixture의 self-mount가
무조건 확정 edge가 되어 **기존 기대값이 뒤집힌다.**

**결론(방향 3번 항목에 대한 답): `nameAmbiguous`는 완전히 삭제하지 않는다 — self-mount 경로에만
한정해서 남긴다.** 근거:

- cross-file import 경로: provenance 검사가 정확한 경로 비교로 바뀌면, "resolved path === rootFile"
  자체가 이미 유일한 정답을 가리킨다 — 워크스페이스에 같은 bare 이름을 쓰는 다른 파일이 있다는 사실은
  **이 특정 import 문이 무엇을 가리키는지에 관해 아무것도 바꾸지 않는다.** 여기서 `nameAmbiguous`는
  진짜로 잉여다.
- self-mount 경로: import 문이 아예 없다(같은 파일 안의 지역 변수 참조라 provenance 검사를 거치지
  않는다). `nameAmbiguous`가 여기서 하는 일 — "워크스페이스 어딘가에 같은 bare 이름의 무관한
  라우터가 있으면 이 self-mount도 불확실로 본다" — 는 정확한 경로 비교로 대체되는 대상이 아니다.
  **삭제하면 `collision_router_mounted.py`/`collision_router_unmounted.py`,
  `collision_typed_*`, `collision_qualified_*`(합 6개 fixture)의 기존 기대값이 깨진다.**

**따라서 산출물**: `mountFound`를 self-mount 기여(`selfMountFound`)와 cross-file 기여
(`crossFileMountFound`)로 분리하고, `found = (crossFileMountFound || (selfMountFound &&
!nameAmbiguous)) && !truncated`로 재구성한다. `bindingPattern`은 살아있고 이유가 문서에 남는다 —
"죽은 코드를 남기지 말라"는 요청을 이렇게 만족한다: 코드가 죽지 않았고, 왜 살아있는지 위에 적었다.

### 절대 import 실패 시 정책 — 결정

**거부(false negative)를 기본으로 한다** — 이 파일의 기존 비대칭 원칙(확신 없으면 edge를 안
만든다)과 일치하고, 새로 추가하는 코드가 아니라 정확한 경로 비교의 자연스러운 결과다(계산된 경로가
`rootFile`과 다르면 그냥 `false`). src layout(`src/pkg/...`), editable install, `sys.path`
조작, namespace package처럼 workspace-root=package-root 근사가 틀리는 프로젝트에서는 **절대
import를 쓰는 cross-file mount가 계속 미탐으로 남는다** — 새로 만드는 한계가 아니라, 기존에도
전혀 탐지되지 않던 것이 여전히 안 되는 것뿐이다(상대 import 쪽만 새로 정확해진다). 이 정책은
아래 "보고" 절에서 먼저 보고한다.

## 단계별 구현 계획

### 1단계 — `importsNameFromModule()`을 경로 기반으로 재작성

**목적**: 위 cross-package collision을 실제로 막고, 상대 import 기반의 다중 router 프로젝트가
동작하게 한다.

**산출물**:
- `from` import 문을 `(dots, modulePath, importList)`로 파싱하는 헬퍼.
- `importingFile`·`workspace`·`rootFile`을 받아 상대/절대 import를 해석해 `rootFile`과 정확히
  비교하는 새 `importsNameFromModule()`(시그니처 변경 — `moduleStem` 대신 `rootFile`,
  `importingFile`, `workspace`).
- `isRouterMounted()`가 새 시그니처로 호출하도록 갱신.
- `fastapiDependencyAdapterImportsNameFromModule.test.ts`를 새 시그니처에 맞춰 갱신(CRLF 케이스
  유지·확장).

**검증**: 격리 스크립트로 이미 검증한 10개 케이스를 유닛 테스트로 고정. CRLF 케이스 포함.

### 2단계 — `nameAmbiguous`를 self-mount 경로로 한정

**목적**: cross-file 경로에서 잉여가 된 `nameAmbiguous`를 걷어내 다중 router 프로젝트를 통과시키되,
self-mount+워크스페이스 충돌 케이스의 기존 기대값은 그대로 지킨다.

**산출물**: `isRouterMounted()`의 `found` 계산을 `selfMountFound`/`crossFileMountFound` 분리
구조로 재작성.

**검증**: 기존 collision fixture 6종 + cross-file positive + self-mount positive 전부 재확인,
non-vacuity(각 분기를 따로 무력화해 정확히 그 분기가 지키는 fixture만 실패하는지).

### 3단계 — fixture 양방향 추가

**신규**:
- cross-package basename collision(상대·절대 각 1개) — 거부돼야 함.
- 다중 router 프로젝트 양성(상대 import) — **이 lane의 핵심 산출물**, 통과해야 함.
- 상대 import 깊이(`.`, `..`) 각 1개, 절대 import 1개 — 전부 통과해야 함.

**기존 재확인**: 적대적 6종, `crossfile_positive_*`, `mounted_router.py`, `collision_*` 6종,
CRLF 유닛 테스트.

### 4단계 — 재측정과 gate 4 판정

**목적**: 넓어진 탐지 범위가 새 오탐을 안 만드는지 확인하고, 발행된 숫자가 바뀌면 정정하고, gate
4를 닫을 수 있는지 최종 판단한다.

**산출물**: 정확도 corpus 재실행, latency 재측정(파일 읽기 패턴 안 바뀌면 영향 없다고 예상 —
실측으로 확인), gate 4 판정 보고 및 관련 문서 갱신(닫힌다면 닫힘 4/열림 4로).

## 테스트 및 완료 기준

- CLI 전체 스위트 pass, 0 fail.
- 신규 fixture 전부 mutation 기반 non-vacuity 확인.
- `nameAmbiguous` 축소가 기존 collision fixture 6종의 기대값을 안 바꾸는지 확인.
- 정확도·latency 재측정 결과 기록(안 바뀌었어도 "안 바뀌었다"고 기록).
- gate 4 최종 판정 보고 — 닫히지 않는다면 무엇이 남았는지 명시.

## 작업 로그

### 초기 결정 → commander 독립 검증으로 두 번 다 뒤집힘

착수 전 보고한 두 결정(절대 import는 workspace-root 근사, `nameAmbiguous`는 self-mount에만 한정
유지) 둘 다 commander가 직접 실측해 반례를 냈고, 이 세션이 각각 재현해 확정했다:

1. **절대 import: workspace-root 근사 → path-segment suffix 비교로 교체.** commander의 6케이스
   행렬(flat/src/nested layout × 정답/오답 package)을 이 세션이 격리 스크립트로 재현: 기존
   last-segment 비교는 6개 중 3개 오답, workspace-root-exact 비교는 1개 오답(src layout 정답
   케이스를 새로 깸 — **회귀**), suffix 비교는 6개 전부 정답(`[실행]`, 스크립트:
   `module-resolution-probe2.mjs`). 상대 import 정확 해석에는 영향 없음(둘 다 이미 정확했음).
2. **`nameAmbiguous`: self-mount에 한정 유지 → 완전 삭제, collision-mounted fixture 3개 기대값
   반전.** commander가 Python 스코프 규칙으로 반례를 제시: self-mount(같은 파일 안의 바인딩+
   `include_router()`)는 다른 파일이 뭘 하든 의미가 바뀌지 않는다 — `nameAmbiguous`가 self-mount를
   막을 근거가 없었다. 이 세션이 `collision_router_mounted.py`/`collision_typed_mounted.py`/
   `collision_qualified_mounted.py` 세 fixture를 직접 확인해 전부 순수 self-mount임을 재확인하고
   동의, `nameAmbiguous`/`bindingPattern`을 통째로 제거했다. **부수 확인**: `nameAmbiguous`를 남긴
   채로는 다중 router 프로젝트 양성(cross-file) 케이스도 막힌다는 것을 mutation으로 직접 확인 —
   두 문제가 정말 같은 원인이었다.

### 구현

- **변경 파일**: `cli/src/adapters/fastapiDependencyAdapter.ts`(`importsNameFromModule()` 전면
  재작성 — `FromImportClause` 파싱, `resolveRelativeImportTargetFile()`, `pathEndsWithSegments()`
  추가; `isRouterMounted()`에서 `nameAmbiguous`/`bindingPattern` 제거), `pythonFastapiIntegration
  .test.ts`(collision-mounted 3개를 `MOUNT_UNRESOLVED_GUARD_FIXTURES`에서
  `CONFIRMED_DESPITE_COLLISION_FIXTURES`로 이동, 신규 fixture 4개 테스트 추가, latency 테스트 주석의
  `nameAmbiguous` 언급 정정), `fastapiDependencyAdapterImportsNameFromModule.test.ts`(새 시그니처에
  맞춰 재작성, relative/absolute/suffix/CRLF 케이스 14개).
- **신규 fixture**(첫 real 디렉터리 구조 — 이전까지 이 corpus는 flat이었다):
  `module_resolution_pkg_a/users.py`(cross-package collision 피해자 역, 절대 import),
  `module_resolution_pkg_b/{users.py,main.py}`(다중 router 프로젝트 양성, 절대 import),
  `module_resolution_relative/{main.py,routers/users.py}`(상대 import 1-dot, subpackage),
  `module_resolution_relative/{deep/main.py,routers/nested_users.py}`(상대 import 2-dot).
- **실제 end-to-end 확인**(빌드된 CLI로 직접, 문서화 전에): pkg_a 쿼리 → mount-unresolved(정답),
  pkg_b 쿼리 → 확정 edge(정답), 두 상대 import 쿼리 → 확정 edge(정답) — 넷 다 `[실행]`.

### 검증

- **CLI 전체 스위트**: 387 tests, 384 pass / 0 fail / 3 skip(기존과 동일).
- **non-vacuity 1(절대 import suffix 비교)**: `pathEndsWithSegments` 호출을 last-segment-only
  비교로 되돌림(mutation) → 재빌드 → 정확히 5개 테스트만 실패(신규 유닛 테스트 4개 + 신규 fixture
  cross-package 거부 테스트 1개), 나머지 49개는 그대로 통과 → 원복 → 384 pass 재확인.
- **non-vacuity 2(`nameAmbiguous` 제거)**: `nameAmbiguous`/`bindingPattern`을 되살리는 mutation →
  재빌드 → 정확히 4개 테스트만 실패(collision-mounted 반전 3개 + 다중 router 프로젝트 양성 1개),
  나머지 36개는 그대로 통과 → 원복 → 384 pass 재확인. **이 4번째 실패가 두 문제(collision 반전,
  다중 router 프로젝트)가 같은 원인이었다는 것의 실행 증거다.**
- **정확도 corpus 재측정**: PR #84가 추가한 adversarial fixture 6개가 이 문서의 precision 집계에
  반영된 적이 없었다는 것을 재측정 과정에서 처음 발견(발행 시점 19개가 아니라 25개여야 했음, PR
  #84 자체의 누락). 이번 lane의 변경(collision-mounted 3개 반전 + 신규 4개)까지 합쳐 **최종
  29개(진양성 12/진음성 17), precision 100%(오탐 0건) 그대로** —
  `task-m4-stage3-accuracy-latency-gates.md`에 근거와 함께 정정.
- **latency 재측정**: 파일 워크 구조는 안 바꿨고 이미 매칭된 후보 줄에 대해서만 저렴한 경로 비교로
  교체했을 뿐이라 200/400개 synthetic 벤치마크는 다시 안 돌렸다(안 한 것으로 기록). 실제 fixture
  corpus(`orphan_router.py`, worst case)에서 기존 테스트와 같은 방법으로 재측정: 추가 비용 +8ms,
  latency gate 테스트(<5000ms) 그대로 통과 — 회귀 없음.
- **response-policy eval**: 이번 lane은 `response-policy-engine.mjs`를 안 건드려 재실행 불필요(코드
  변경 없음).

### gate 4 판정 — round 1: "닫힘"으로 결론 → round 2: commander 반례로 되돌림

**round 1에서 다음과 같이 결론지었었다(이제 틀린 것으로 확인됨, 기록으로 남긴다):** 세 번째
promotion 지점(mount 확인)에 대해 알려진 오탐 경로가 모두 닫혔다고 보고, gate 4를 닫힘으로
판정했다. 남은 것은 절대 import suffix 비교의 "서로 다른 두 최상위 트리가 우연히 완전히 같은
dotted path suffix로 끝나는 경우"뿐이라고 보고, gate 3과 같은 성격의 narrower-than-worded 한계로
accepted 처리했다.

**round 2 — commander가 self-mount 근거 자체에 반례를 냈다, 실행으로 확인.** "self-mount는 같은
파일 안이라 Python 스코프상 자명하다"는 주장이 **단일 스코프를 가정**하고 있었다 — 안쪽 스코프
(함수 매개변수, comprehension 변수, 중첩 `def`)가 module-level 바인딩을 가리는 경우를 빠뜨렸다.
직접 재현(`[실행]`):

```python
router = APIRouter()

@router.get("/x")
def handler() -> str: ...

def setup(app, router):          # 매개변수가 module-level router를 가림
    app.include_router(router)   # module-level router가 아니라 매개변수를 가리킴
```

이 파일을 실제 fixture로 만들어 쿼리하면(수정 전) `augmentedEdges` 1건과 확정 edge가 나왔다 —
module-level router는 한 번도 mount된 적이 없는데도 "도달 가능"이 확정으로 나간 것이다.
`adversary_param_router.py`(PR #84)와 정확히 같은 형태가, **root 파일 자기 자신 안에** 있는
버전이다. **이 근거는 commander가 준 것이었고, 이전 세션이 "반례를 못 찾았다"고 보고한 것은
정직한 결과였다 — 전제 자체가 틀려 있었다.**

**수정**: `MODULE_LEVEL_LINE_PATTERN`(`/^\S/` — 들여쓰기 없는 줄만 인정) 추가, `include_router(NAME)`
매칭 줄 자체가 module-level일 때만 self-mount·cross-file 양쪽 다 신뢰하도록 변경. cross-file
경로도 같은 노출이 있다는 지적을 확인·반영했다 — provenance(import)가 진짜여도 실제로 credit되는
`include_router(...)` 호출이 그 파일의 안쪽 스코프에 있을 수 있기 때문이다.

**검증**: 기존 양성 fixture(`mounted_router.py`, `collision_*_mounted.py` 3종, `crossfile_positive_*`,
`module_resolution_*` 전체) 전부 module-level이라 실행으로 재확인 — 회귀 없음(전체 스위트
386→389 tests, 계속 pass). 신규 fixture 2개(`adversary_selfshadow_router.py`,
`adversary_crossshadow_router.py`) 추가 — mutation으로 non-vacuity 확인(module-level 요구를
제거하면 정확히 이 2개만 실패). **부작용(안전한 방향, 한계로 기록)**: 모듈 레벨 `if`/`try` **블록
안에 들여써서** 쓴 진짜 mount 호출은 이제 미탐이 된다.

**잔여 한계 서술도 정정**: `importsNameFromModule()`의 절대 import suffix 비교 잔여 위험을 "두
vendored 사본"으로 좁게 적었던 것을 "segment 하나뿐인 절대 import는 basename 비교로 퇴화해 어느
깊이의 동명 파일이든 맞는다"는 실제 범위로 고쳤다 — commander가 직접 반례(`from users import
router` vs 깊이 4단계 root)로 확인.

**gate 4 최종 판정: 아직 닫지 않는다.** gate 문구("모호한 DI/dynamic target을 임의로 확정 caller
승격 안 됨")가 정확히 금지하는 형태(root의 router를 가리키지도 않는 증거로 도달성을 확정)가 이번에
또 나왔다 — PR #81이 한 실수(근거는 실재했지만 경로 범위가 좁았음)와 같은 부류다. 이번 수정
(module-level 요구)으로 발견된 형태는 닫았지만, **같은 판단 오류가 반복된 이력(round 1도 "닫혔다"고
결론지었다가 틀렸음)을 고려해 이번에도 스스로 닫힘 선언을 하지 않는다** — reviewer의 독립 검토
결과와 사용자 결정을 기다린다.

**문서 갱신**: `handover-2026-09-04.md`·`task-m4-milestone-closure-audit.md`·`task-m4-gate3-gate4-
closure.md`를 round 1의 "닫힘 4 / 열림 4"에서 **닫힘 3 / 재개방·수정 중 1(gate 4) / 열림 4**로
되돌리고, 왜 아직 못 닫는지 명시했다.
