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

### round 3 — commander/reviewer 병렬 검토, 결함 2건 더 발견·수정

`reviewer`(별도 세션)가 round 2 수정을 실제 CLI+pyright로 독립 재검증하는 동시에, 같은 파일에서
새 결함 2건을 찾았다. 둘 다 이 세션이 재현·수정했다.

**결함 1 — `importsNameFromModule()`의 alias 검사가 역방향을 놓침(`[실행]`).** 기존 검사(`aliasedPattern
= /\bname\s+as\s+\w+/`, `namePattern = /\bname\b/`)는 `router as X`(정방향 - 우리 이름이 다른
이름으로 나감)만 걸렀다. `other_thing as router`(역방향 - root 모듈의 **다른 심볼**을 로컬에서
`router`로 alias)는 `namePattern`이 그 alias 토큰에 매치되고 `aliasedPattern`은 "`router` 다음에
`as`"만 찾으므로 걸리지 않았다. 재현: `/tmp/reverse-alias-probe`에 실제 target/shadow 파일을 만들어
빌드된 CLI로 쿼리 → 확정 edge + `framework_route_mount_unresolved` 없음 확인. 상대 import 분기도
같은 `importsBareNameEntry()` 검사를 공유하므로 같은 형태로 재현(`/tmp` 대신 corpus에 직접 추가한
fixture로).

수정: import 목록을 콤마로 쪼개 **별칭 없는 정확한 항목**만 인정(`entry.trim() === name`) —
`importsBareNameEntry()`. 정방향 alias 거부, 역방향 alias 거부(위치 무관), 목록 안 bare name 허용
(첫 자리든 아니든, 기존 동작과 동일), 공백, 부분문자열 함정(`routerX`) 전부 격리 스크립트로 9케이스
확인 후 반영.

**결함 2 — `isDirectFastapiApp()`이 원문을 그대로 검사(`[실행]`).** `rootText`를
`stripCommentsAndStrings()` 없이 그대로 넘겼다. `# app = FastAPI()` 같은 주석 한 줄만으로 실제로는
`APIRouter()`인 변수가 "FastAPI 앱 자체"로 오인되고, `mountConfirmed = true`가 되어
`isRouterMounted()` 호출 자체가 스킵된다 — 이 lane이 쌓은 provenance·module-level 검사가 전부 그
뒤에 있어 comment 한 줄이 전 체인을 우회한다. 재현: `/tmp/directapp-probe`에 실제 fixture를 만들어
빌드된 CLI로 쿼리 → 확정 edge 확인. `origin/main`에도 있던 기존 결함(이 branch의 회귀 아님)이지만,
gate 4가 금지하는 형태이고 `isRouterMounted()` 자신이 이미 "주석/docstring/문자열 안 언급은 mount
증거가 아니다"를 원칙으로 문서화·fixture화(`commented_out_router.py` 등)까지 해 둔 상태라 이번
lane에서 닫았다.

수정: 호출부에서 `isDirectFastapiApp(routeDecorator.routerName, stripCommentsAndStrings(rootText))`
로 변경(`rootText` 자체는 `rootLines`/evidence range가 원문 줄 번호를 써야 해서 그대로 두고, 이
호출 지점에서만 stripped 버전을 넘김).

**fixture 신규 5개**: `adversary_reversealias_target.py`/`adversary_reversealias_shadow.py`(역방향
alias, 절대 import), `adversary_reversealias_list_shadow.py`(같은 결함, 콤마 목록 안 두 번째 위치 -
target 쿼리에 동반 존재로만 검증), `module_resolution_relative/routers/reversealias_target.py` +
`module_resolution_relative/reversealias_shadow.py`(같은 결함, 상대 import), `adversary_commentapp_
router.py`(comment-bypass).

**non-vacuity**: 두 mutation을 각각 독립적으로 적용해 확인 — (1) `importsBareNameEntry()`를 예전
word-anywhere + 정방향-alias-전용 로직으로 되돌림 → 정확히 역방향 alias 테스트 2개(절대·상대)만
실패, 나머지 43개는 그대로 통과 → 원복. (2) `isDirectFastapiApp()` 호출부를 raw `rootText`로 되돌림
→ 정확히 comment-bypass 테스트 1개만 실패, 나머지 44개는 그대로 통과 → 원복. 두 mutation을 동시에
적용했을 때도 정확히 그 3개만 실패함을 확인(교차 오염 없음). 전체 스위트 392 tests, 389 pass/0
fail/3 skip 재확인.

**정확도 corpus 재측정**: 신규 진음성 3개 추가 — 최종 34개(진양성 12/진음성 22), precision 100%
그대로. `task-m4-stage3-accuracy-latency-gates.md`에 반영.

**구조적 논증 — 열거 대신 이유를 적는다(commander/reviewer 공동 결론).** 이 adapter의 `Depends()`
경로 텍스트 매치는 전부 `resolveEndpoint()` → `input.provider.prepare()`로 재검증되므로, 정규식이
스코프·alias를 착각해도 pyright가 걸러내 사용자에게 도달하지 않는다. **재검증이 없는 텍스트 매치는
`isRouterMounted()`(`importsNameFromModule()` 포함)와 `isDirectFastapiApp()` 둘뿐**이다 — router/app
변수가 `CallHierarchyProvider`가 다루는 호출 가능 심볼이 아니기 때문에 구조적으로 재검증 경로가
없다. M4 gate 4의 사후 lane 두 개(mount 오탐, module-resolution)가 찾은 결함 전부가 이 두 함수
안에만 있었던 건 우연이 아니라 이 경계 때문이다 — "훑어봤는데 더 없더라"보다 강한 논증이라고
판단해 `fastapiDependencyAdapter.ts` 최상단 주석에 기록했다. **이 논증이 깨지는 조건도 같이
적었다**: 두 번째 framework adapter가 재검증 없는 텍스트 매치를 새로 만들면 노출 범위가 다시
넓어진다. adapter SPI 계약(`./types.ts`)에 규칙으로 올릴지 판단을 요청받아, **올리지 않기로
결정했다** — adapter가 하나뿐인 지금 아직 보지 못한 형태에 대한 계약 규칙을 만드는 것은
`IL-LIM-001`의 "대안 검토"가 이미 거부한 것과 같은 과설계 위험이라고 판단했다. 대신 코드 주석에
"두 번째 adapter 저자는 이 주석을 먼저 읽으라"고 남겼다.

**gate 4는 round 3 수정 후에도 계속 열어 둔다** — 스스로 닫힘 선언을 하지 않는다. `reviewer` 재검토와
사용자 결정을 기다린다.

### round 3 마무리 — commander 재검증에서 나온 작은 항목 둘

commander가 `46f3e5a`/`1efc768`를 검증하며 `importsBareNameEntry()`를 경계 8형태로 재확인(전부
정확)하고, 이 세션이 걱정했던 것과 다른 걱정 하나를 스스로 실행해 확인해 줬다 —
`MODULE_LEVEL_LINE_PATTERN`이 `stripCommentsAndStrings()`가 삼중따옴표 블록을 줄바꿈째 제거한
텍스트 위에서 돌아 들여쓰기 판정이 어긋날 수 있는지. 5가지 형태(함수 안 docstring 뒤 들여쓴
mount, 모듈 레벨 mount, docstring 안 홀수 개 `"""`, 한 줄 문자열 안 삼중따옴표, 닫는 `"""` 뒤 같은
줄 코드)로 직접 재서 **오탐 방향으로 새는 형태를 못 찾았다** — `importsBareNameEntry()`의 doc
comment 옆, `MODULE_LEVEL_LINE_PATTERN` 선언부에 "의심했지만 실행해서 확인한 항목"으로 기록했다.

**신규로 좁아진 것 1건 발견**: `from pkg.users import (router)`(한 줄짜리 괄호 import)가 이제
미탐이다 — 이전 `namePattern`(`\bname\b`)은 괄호를 비-단어 문자로 보고 매치했지만, 새 정확-일치
비교(`entry.trim() === name`)는 "(router)" !== "router"라 거부한다. `/tmp`에 실제 fixture를 만들어
직접 재현 확인(`[실행]`) — 이 lane이 만든 새 narrowing이지, 기존에 이미 있던 한계가 아니다.
`aliasBindingsFor()`의 기존 "여러 줄 괄호 import" 한계와는 다른 형태(이건 한 줄)라 별도로 기록했다.
유닛 테스트로 고정(`fastapiDependencyAdapterImportsNameFromModule.test.ts`).

**adapter 계약 문서 위치 이동**: `fastapiDependencyAdapter.ts` 최상단의 구조적 논증을
`adapters/types.ts`의 `FrameworkAdapter` 타입 doc comment로 옮겨 적었다(런타임 강제 아님, 문서화만)
— commander 지적대로 두 번째 adapter 저자는 `fastapiDependencyAdapter.ts`를 안 열고 SPI 타입만
본다.

## 누적된 좁힘 — 이번 lane이 정확도를 위해 포기한 것 전부 (commander 요청, 한곳에 모음)

이 lane의 네 번(round 0=PR #84, round 1~3) 수정은 전부 **정확도를 넓히는 동시에 recall을 깎는**
방향이다. 개별 항목은 각 함수의 doc comment에 있지만, 다음 사람이 "정확한데 거의 안 도는" 상태로
넘어갔는지 판단하려면 누적 목록이 필요하다:

1. **(round 0, PR #84) 동명이인 무관 식별자 거부** — 함수 매개변수·loop 변수·dict/attr 대입·factory
   반환·non-router 타입·다른 모듈 import로 얻은 이름은 root의 모듈에서 실제로 온 게 아니면 거부.
2. **(round 1) 정확한 모듈 비교** — 상대 import는 정확한 경로, 절대 import는 dotted path 전체를
   `rootFile` 경로의 segment suffix와 비교. (잔여: segment 하나뿐인 절대 import는 여전히 basename
   비교로 퇴화 — 이건 narrowing이 아니라 이 접근법 자체의 잔여 한계, 별도로 문서화됨.)
3. **(round 2) module-level 줄만 인정** — `include_router(NAME)`이 들여쓰기 없는 줄에 있어야 self-
   mount·cross-file 양쪽 다 신뢰. **부작용**: 모듈 레벨 `if`/`try` 블록 **안에 들여써서** 쓴 진짜
   mount 호출이 이제 미탐.
4. **(round 3) alias 양방향 정확-일치** — import 목록의 각 항목이 별칭 없이 정확히 target 이름과
   같아야 인정. **부작용**: 한 줄짜리 괄호 import(`from x import (name)`)가 이제 미탐.

**narrowing이 아닌 것도 명시한다**: `isDirectFastapiApp()`에 comment/string-stripped 텍스트를 넘긴
것(round 3)은 recall을 깎지 않는다 — 주석 안의 가짜 매치만 제거하고, 실제 코드 안의 진짜 매치는
그대로 인정되기 때문이다. 순수하게 정밀도만 올라간 유일한 수정이다.

**이 넷(1~4)이 겹치면 실제로 무슨 일이 생기는가**: 이미 stage 3 문서가 "이 기능이 신뢰성 있게
발동하는 조건은 사실상 bare identifier 단일 mount와 첫 자리·한 줄 alias뿐"이라고 적어 뒀다 — 이
lane은 그 "신뢰성 있게 발동하는" 좁은 통로 자체는 넓혔지만(다중 router 프로젝트, cross-package
구분, self-mount shadowing 등 **오탐 후보였던 것들을 정확히 걸러내는 방향**), 동시에 그 통로의
가장자리(들여쓴 mount, 괄호 import)를 깎아 recall을 살짝 더 좁혔다. **오탐 감소와 미탐 증가가 같은
lane 안에서 같이 일어났다** — precision 100%를 지키는 게 이 lane의 유일한 목표였고, recall 저하는
그 목표의 부산물로 받아들인 것이지 별도로 최적화한 게 아니다.

## 2026-09-08 round 4 — reviewer 독립 재검토, 코드 결함 0건·문서 정확도 3건

reviewer가 round 3(`46f3e5a`/`1efc768`)를 독립적으로 재검토했고, **코드 결함은 나오지 않았다.** 세
가지 문서 정확도 지적이 나왔고, 그중 세 번째는 상당한 재작업이 필요했다.

**1. 완전성 논증 — reviewer가 stub provider로 non-vacuity까지 확인, 논증을 더 강하게 다시 썼다.**
mutation 3종(항상 throw / 이름 일치 후 enclosing-def 조회에서 throw / alias 검증 조회에서 throw)
전부 `edges: []`, 대조군(안 던짐)은 `edges.length === 1` — 실행 확인(`[실행]`, reviewer 보고를
그대로 받지 않고 이 논증이 코드와 실제로 맞는지 `resolveEndpoint()`/호출부 3곳을 직접 읽어 재확인,
위 "완전성 논증" 절 참고). 이 발견의 핵심은 "재검증이 항상 성공한다"가 아니라 "재검증 실패(예외
포함)가 항상 무산 방향으로 접힌다"는 것 — 계약 노트(`./types.ts`)의 문구가 성공 쪽만 말하고 있어서
"그럼 prepare()가 던지면?"이라는 다음 질문에 답이 없었다. `./types.ts`와
`fastapiDependencyAdapter.ts` 양쪽 최상단 주석에 이 구분을 추가했다.

**2. "Depends() 경로는 스코프 착각으로 고칠 일이 없었다" — 문구를 좁혔다.** reviewer가 git log를
대조해 그 경로에 버그 3건(`4a783fb`/`cb8d1de`/`1147f19`)이 실제 있었음을 확인 — `[실행]`, 커밋
로그를 직접 대조(`git show --stat`). 셋 다 `prepare()`가 옳은 심볼을 이미 찾은 뒤 후보 개수 세기·
승격 로직의 버그이지, 이 계약 노트가 경고하는 "재검증 없이 새어나간 스코프/alias 착각"이 아니다 —
그래서 원래 문구는 안 깨졌지만, "버그가 없었다"로 오독될 위험이 있어 "스코프/alias 착각으로 인한
오탐은 없었다"로 좁히고 세 커밋을 명시했다. `./types.ts`/`fastapiDependencyAdapter.ts`/
`task-m4-stage3-accuracy-latency-gates.md`(정정 5 앞)에 반영.

**3. precision 분모 — commander가 `crossfile_positive_router.py` 누락을 발견, 포함 기준 자체를
요청했다.** 34개를 1:1 재대조한 reviewer의 산수는 맞았지만(`[읽음]`, reviewer 보고), commander가
`CONFIRMED_DESPITE_COLLISION_FIXTURES`/`module_resolution_pkg_b`와 assertion 구조가 같은
`crossfile_positive_router.py`가 목록에 없음을 직접 확인했다(`[실행]`, commander 보고를 그대로
쓰지 않고 `:487` 테스트를 직접 읽어 구조 동일성 재확인). "뺀 이유를 한 줄 적자"가 아니라 **기계적
포함 기준을 정의하라**는 요청 — 5번 바뀐 숫자(19→25→29→31→34)가 전부 "누가 무엇을 세는 걸
기억했는가"에 달려 있었기 때문이다.

기준을 정의했다: `pythonFastapiIntegration.test.ts`에서 `augmentedEdges.length`를 정확히 0 또는
1로 단언하는 것이 주된 목적인 모든 test() 블록(배열 순회 포함), `>` 부등호나 `deepEqual`로 다른
불변 조건(rollback/latency)을 확인하는 테스트는 제외, "known false negative" 명명 테스트는 제외
(recall 문제이지 precision 문제가 아니므로). 이 기준을 파일 전체(783줄, 전 테스트)에 직접 적용해
재세었다(`[실행]`) — commander가 지적한 `crossfile_positive_router.py`뿐 아니라, **아무도 지적하지
않은 두 번째 누락**을 찾았다: `nested_dependency_config.py`의 sub-dependency 회귀 테스트(`:625`,
M4 stage 3 "단계 5"에서 추가)도 같은 형태의 assertion을 가지는데 목록에 없었다 — 새 fixture를 다른
단계에서 추가하고 중앙 집계를 안 고치는, 이 문서가 이미 두 번(PR #84, round 1) 기록한 것과 똑같은
실패가 이 문서 자체 안에서 세 번째로 일어나 있었다.

**최종: 36개(진양성 14 + 진음성 22), precision 100%(오탐 0건) 그대로** — commander가 예상한 35가
아니다. 전체 재계산과 기준 전문은 `task-m4-stage3-accuracy-latency-gates.md`의 "2026-09-08 정정
5" 참고. `npm test` 재실행(`[실행]`, 2026-09-08): `pythonFastapiIntegration.test.ts` 45/45 pass.

**코드 변경 없음** — 이번 round는 문서 정확도 수정뿐이다(계약 노트 문구 확장, precision 분모 기준
정의·재계산). 전체 스위트 재확인 필요.
