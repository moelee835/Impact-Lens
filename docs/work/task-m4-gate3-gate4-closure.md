# M4 gate 3·4 종료 처리

- 상태: gate 3(문구상 유지, 범위는 좁음) 완료 / **gate 4는 이 문서가 다룬 두 지점 완료 → 세 번째
  지점(mount)이 M4 stage 3 사후 감사에서 발견돼 2026-09-07 재개방(`docs/work/task-m4-gate4-mount-
  false-positive.md`) → `docs/work/task-m4-gate4-module-resolution.md`에서 수정 진행 중, **아직 안
  닫힘**(commander 독립 검증이 self-mount 근거의 반례를 또 찾음 — nested scope shadowing).** 상세는
  아래 "2026-09-07 정정" 참고.
- branch: `feat/m4-gate3-gate4-closure`
- 선행: PR #80(`docs/m4-milestone-closure-audit`, merge `09e0f50`)이 찾은 gate 3·4의 공백을 닫는다.
- 이 둘을 같이 묶는 이유: 같은 파일(`fastapiDependencyAdapter.ts`)이고, 둘 다 "fixture 없는 코드
  경로"라는 같은 근본 원인이다.

## 목적과 사용자 가치

closure audit이 8개 gate 중 1개만 닫혔다고 기록했다. 이 lane은 그중 판단이 거의 필요 없고 story
분량이 아니며 UX 결정·사용자 참여가 안 걸리는 두 개(gate 3, gate 4)를 닫는다(또는 실제로 안 닫혀야
한다면 그 근거를 기록한다).

## 단계 1 — gate 3: cross-file router-include 양성 fixture (완료)

### 조사 — 먼저 실측, 코드를 안 고치고

closure audit이 "코드상 성공할 것 같다(추론), 실측 아님"이라고 정확히 표시해 뒀다. throwaway
fixture(저장소 밖 scratch)로 먼저 확인: 파일 A(`router = APIRouter()` + route handler)와 파일
B(`from A import router; app.include_router(router)`)를 분리해 실제 CLI로 쿼리 — **성공했다**:
`augmentedEdges` 1건, `resolution: 'single'`, `reasonCode: 'fastapi-route-handler'`,
`framework_route_mount_unresolved` 없음.

**이름 충돌을 피했다**: 이 corpus에 이미 `router`라는 이름을 쓰는 파일이 4개 있다
(`alias_mount_router.py`, `attr_mount_router.py`, `collision_router_mounted.py`,
`collision_router_unmounted.py` — `grep`으로 먼저 확인). `crossfile_positive_router`라는 corpus
전체에서 유일한 이름을 써서, ambiguity 검사(다른 파일이 같은 이름을 바인딩하는지)가 이 fixture와
무관한 이유로 실패하지 않게 했다 — commander가 명시적으로 경고한 함정.

**실제 corpus 디렉터리에 파일을 임시로 복사해 재확인**: 다른 fixture들과 같은 workspace에서 워크
전체 ambiguity 검사가 실제로 걸리지 않는지까지 확인(격리된 2파일 workspace와 실제 corpus 양쪽에서
동일하게 성공).

### 구현

- 신규 fixture: `crossfile_positive_router.py`(정의), `crossfile_positive_app.py`(mount, 다른 파일).
- `pythonFastapiIntegration.test.ts`에 테스트 1개 신규.

### 검증

- non-vacuity: `crossfile_positive_app.py`의 `include_router(...)` 호출을 `pass`로 임시 교체 →
  재빌드 → 새 테스트 실패(`0 !== 1`) → 원복 → 재빌드 → 통과 확인.
- 전체 스위트: 358 pass(신규 1건 포함)/3 skip(기존과 동일)/0 fail.

**결론: gate 3의 "cross-file router-include 양성" 요구는 이제 fixture로 재현된다 — 닫혔다.**

## 단계 2 — gate 4: 방어 없는 두 지점 (완료)

### 조사 — 두 지점 모두 실측, stub 없이 real Python으로 트리거 시도

commander가 지적한 두 지점을 real Python 구성으로 트리거할 수 있는지 먼저 확인했다(임시
`process.stderr` 로그, 확인 후 즉시 제거 — `git diff`로 코드 변경 0건 재확인).

1. **source(enclosing function) 경로**(`fastapiDependencyAdapter.ts:518`,
   `enclosingResolved.items.length`): 조건부 재정의(`if True: def handler(...): ... else: def
   handler(...): ...`, 두 branch 모두 자기 자신의 `Depends(get_db)`를 가짐)로 두 `def handler`
   각각의 **선언 위치 자체**를 개별적으로 `prepare()`했다 — **두 쿼리 모두 `items.length === 1`**,
   그리고 둘 다 같은 단일 항목(첫 번째 `def handler`)으로 resolve됐다. pyright가 선언 위치를
   물어봐도 여러 개를 안 돌려준다.
2. **alias 검증 경로**(`fastapiDependencyAdapter.ts:478`, `verified.items.length`): `module_a.py`에
   조건부로 재정의된 `get_db`(같은 패턴)를 `from module_a import get_db as db_dep`로 별명 import한
   뒤, alias 검증이 쿼리하는 정확한 위치(import line의 `get_db` occurrence)를 직접 쿼리 —
   **`items.length === 1`.**

**이건 `resolution: 'multiple'`(stage 3, "단계 4") 때와 정확히 같은 결과다** — 시도한 구성마다
pyright가 정확히 1개만 돌려준다. 전수 조사는 아니다(시도한 구성에서 못 찾았다는 것만 실측).
**"두 지점 모두 real Python으로 트리거하는 방법을 못 찾았다"**는 이 사실은 fixture로 이 방어를
검증하려면 stub이 필요할 가능성이 높다는 뜻이지, 확정은 아니다.

### 결정 — commander 확인 완료, 둘 다 구현

commander가 두 판단에 동의하고 각각에 조건을 붙였다.

- **alias 경로 (`:478`, 커밋 `cb8d1de`)**: literal-name 경로가 이미 쓰는 것과 **같은 의미**다 —
  `matchesRoot` 통과 + `count = resolved.items.length`. alias 경로도
  `resolutionCandidateCount = verified.items.length`로 두면 새 개념이 아니라 **빠져 있던 자리를
  채우는 것**이다. `verified.items.some(...)`(멤버십 확인)과 alias의 실제 후보 수를 별도로 기록하는
  `aliasCandidateCounts: Map<string, number>`를 도입해, `isVerifiedAlias`일 때 하드코딩된 `1`
  대신 그 값을 쓰도록 고쳤다. `:537`의 "ambiguity가 이미 해소됐다" 주석도 정확한 서술로 교체.
- **source 경로 (`:534` 부근, 별도 커밋)**: source endpoint는 노드 하나뿐이라 "여러 source"를
  표현할 자리가 없으므로, **edge를 안 만드는 것만으로 gate 4는 닫힌다** — commander의 정정:
  gate가 요구하는 건 "임의 승격 안 함"이지 "limitation을 낸다"가 아니다. limitation 코드는
  별도 비용(`V1_WITHHELD_REASON_CODES`, plugin skill, `cli-contract.md`, response-policy eval까지
  번짐)이라는 지적을 받아들여 **새로 만들지 않았다** — 기존 코드 중 의미가 맞는 게 없어서(직접
  `coverage.ts`의 limitation 코드 17개 전부 확인), `enclosingResolved.items.length > 1`일 때 그냥
  `continue`(edge 없음, 신호 없음)로 처리했다.

**침묵의 대가를 코드 주석에 그대로 적었다**: edge가 없고 아무 limitation도 없으면, 사용자는
"후보가 없다"와 "후보가 여럿이라 못 골랐다"를 구분할 수 없다 — M2가 `provider_null_incoming_calls`로
푼 바로 그 문제가 여기선 안 풀렸다. 동시에 이 adapter는 이미 다른 미탐(모듈 속성 mount, alias 변수
mount)도 신호 없이 넘긴다 — **일관성은 있지만 좋은 상태는 아니다.** 이 긴장은 해소하지 않고 그대로
남겼다(commander 지시대로 이 lane에서 새 limitation 코드를 만들지 않았다).

### stub 증거 — gate 3과 다른 이유

**두 지점 다 real Python으로는 못 만들었다**(위 "조사" 참고, 각각 다른 구성으로 시도, 전수 조사
아님). 그래서 두 fix 모두 stub 기반 coverage 테스트를 새로 만들었다
(`fastapiDependencyAdapterMultipleCandidate.test.ts`) — 그런데 이건 gate 3의 stub 판단과
**반대 결론**이라, 왜 여기선 되고 거기선 안 됐는지 적는다:

- **gate 3 문구**("대표 fixture가 ... 재현한다")는 **실세계 발생의 실증**을 묻는다 — stub은 실세계
  코드가 아니므로 "대표 fixture"가 될 수 없다. 그래서 gate 3은 real Python 성공 사례가 필요했다.
- **gate 4 문구**("모호한 DI/dynamic target은 하나의 확정 caller로 임의 승격되지 **않는다**")는
  **이 코드의 동작**에 대한 진술이다 — 실세계에서 그 상황이 얼마나 자주 생기는지를 안 묻는다.
  그래서 stub으로 "후보가 여럿일 때 임의 승격하지 않는다"를 보이는 것은 gate 4의 정당한 증거다.

`resolution: 'multiple'`(stage 3, "단계 4") 때 stub을 gate 증거로 안 쓴 이유는 "stub이 항상
부족해서"가 아니라 **그 gate 문구가 실세계 재현을 요구했기 때문**이다 — 문구의 성격이 다르면 같은
도구(stub)의 정당성도 달라진다.

### 검증

- non-vacuity(alias 경로): fix만 되돌리고(테스트는 유지) 재빌드 → 신규 alias-multiple 테스트만
  실패(`actual 'single', expected 'multiple'`), 나머지 3개 그대로 통과 → 원복 → 4개 전부 통과.
- non-vacuity(source 경로): fix만 되돌리고 재빌드 → 신규 source-multiple 테스트만 실패(엣지가
  생겨서 `1 !== 0`) → 원복 → 4개 전부 통과.
- 전체 스위트: 360 pass(신규 2건 포함: alias-multiple, source-multiple)/3 skip(기존과 동일)/0 fail.

**결론(2026-09-07 정정 — 아래 "2026-09-07 정정" 절 참고): gate 4는 이 문서가 다룬 두 지점(alias
검증 경로, source 경로)에 대해서는 방어가 생겼다. 세 번째 지점(mount 확인)이 이후 발견됐고, 같은
날 마저 닫혀 gate 4는 최종적으로 닫힘이다(`docs/work/task-m4-gate4-module-resolution.md`).**

## 남은 것

- closure audit이 기록한 나머지 gate(1: IL-LIM-001/010/002 gate C, 2: UI 구분, 5: test-passed 색,
  7: latency budget, 8: user-test 명세)는 이 lane의 범위 밖.
- source 경로의 "침묵의 대가"(위 참고) — limitation 신호가 필요하다는 결론이면 별도 lane에서
  `V1_WITHHELD_REASON_CODES`/plugin skill/`cli-contract.md`/response-policy eval을 함께 갱신해야
  한다. 이 lane은 그 필요성만 기록하고 만들지 않았다.

## 2026-09-07 정정 — gate 4가 세 번째 지점 때문에 다시 열렸다, gate 3은 문구보다 좁다

**gate 4 재개방.** 이 문서는 "두 지점 모두 방어가 생겨 닫혔다"고 결론지었지만, M4 stage 3 사후 감사
(post-hoc audit)가 **세 번째 promotion 지점**을 찾았다: 이 문서가 다룬 alias 검증 경로(`:478`)와
source 경로(`:534` 부근) 둘 다 `Depends()` 쪽이고, **mount 확인 경로(`isRouterMounted()`)는 이
lane이 아예 살펴보지 않았다.** 사후 감사 finding 1: `include_router(NAME)`이 텍스트로 매칭되기만
하면 `NAME`이 root의 router와 실제로 관계가 있는지 전혀 확인하지 않은 채 "도달 가능"으로 승격했다
— gate가 요구하는 "모호한 DI/dynamic target을 임의 승격 안 함"과 정확히 같은 형태의 위반이다. 상세
경위와 수정은 `docs/work/task-m4-gate4-mount-false-positive.md` 참고(branch
`fix/m4-gate4-mount-false-positive`).

**그 lane이 이 특정 형태(동명이인 무관 식별자)는 고쳤지만, gate 4를 다시 "닫힘"으로 판정하지는
않는다.** 같은 수정을 commander가 독립 검증하는 과정에서 **잔여 gap**을 하나 더 찾았다 — mount
provenance 검사가 마지막 dotted segment만 비교해, 같은 basename을 쓰는 **다른 package**의 무관한
router도 통과시킨다. 이는 현재 `nameAmbiguous`(이 문서의 alias 경로와 무관한, 더 오래된 로직)가
**우연히** 막고 있을 뿐 설계된 방어가 아니다 — 예를 들어 그 다른 package의 파일이 `APIRouter()`를
직접 바인딩하지 않고 다른 곳에서 재-export만 한다면 이 우연한 방어도 뚫린다(이 경로는 실측하지
않았다 — 실측 안 된 잔여 위험으로만 기록한다). 그러므로 **gate 4는 "완전히 닫혔다"고 확정하지 않고,
"이 lane이 발견된 특정 형태는 닫았으나 판정 자체는 재검토 대기"로 남긴다.** 최종 판정은 사용자·
commander의 몫이다.

**gate 3은 문구상 유지되지만, 문구가 원하는 것보다 좁다.** 위 "단계 1"이 확인한 것은 "bare
identifier가 정확히 import된 정상 경로 하나가 실제로 성공한다"는 것뿐이다. 같은 사후 감사가 이
경로의 provenance 검사(`importsNameFromModule()`, gate 4 수정의 일부) 자체에 위와 같은 cross-package
gap이 있다는 걸 보였으므로, gate 3의 "대표 fixture가 candidate·ambiguity를 재현한다"는 요구는 "이
구현이 흔한 케이스에서 작동한다"는 뜻이지 "이 구현의 mount 확인 경로가 어떤 워크스페이스 구성에서도
정확하다"는 뜻이 아니다 — gate 문구 자체는 이 구분을 요구하지 않지만, 그 구분이 존재한다는 사실은
남겨 둔다.

## 2026-09-07 정정 2 — 사용자 결정으로 잔여 gap 수정을 이어감, 그러나 gate 4는 아직 못 닫음

바로 위 절이 "재검토 대기"로 남긴 잔여 gap(cross-package basename 충돌, 그리고 이를 우연히 막던
`nameAmbiguous`가 self-mount에서는 근거 없이 미탐만 만든다는 것)을 사용자 결정으로
`docs/work/task-m4-gate4-module-resolution.md`에서 수정했다 — 절대 import는 dotted path 전체를
`rootFile`의 path segment suffix와 비교(마지막 segment만 비교하던 것에서 교체, commander가 flat/
src/nested layout 6케이스 행렬로 회귀 없음을 검증), 상대 import는 기존처럼 정확히 해석, `nameAmbiguous`
는 완전히 제거(self-mount는 Python 스코프상 다른 파일과 무관하게 항상 명확하다는 것을 확인 —
`collision_router_mounted.py`/`collision_typed_mounted.py`/`collision_qualified_mounted.py`의
기존 "mount-unresolved" 기대값을 "확정 edge"로 반전).

**한 차례 "gate 4를 최종 닫힘으로 판정한다"고 적었으나, commander 독립 검증이 그 self-mount 근거
자체에 반례를 찾아 되돌렸다.** self-mount 분기의 "같은 파일이면 Python 스코프상 자명하다"는 주장이
**단일 스코프를 가정**했는데, 함수 매개변수 등 안쪽 스코프가 module-level 바인딩을 가리는 경우
(`adversary_param_router.py`와 같은 형태가 root 파일 자기 자신 안에 있는 경우)를 놓쳤다 — 직접
재현 확인. gate 문구("모호한 DI/dynamic target을 임의 승격 안 함")가 정확히 금지하는 형태라 gate
4를 다시 닫지 않는다. 상세 수정은 같은 작업 문서 참고 — **gate 4는 여전히 재개방·수정 중.**

남은 잔여 한계(절대 import suffix 비교, 서술을 실제 범위로 정정 — "두 vendored 사본"이 아니라
"segment 하나뿐인 절대 import는 basename 비교로 퇴화")는 gate 3이 이미 안고 있는 것과 같은 성격의
narrower-than-worded 한계로 받아들일 후보이지만, **gate 4 전체의 최종 판정은 self-mount shadowing
수정이 검증된 뒤로 미룬다.**

## 2026-09-07 정정 3 — commander/reviewer 병렬 검토, round 3: 결함 2건 더 발견·수정

round 2 수정을 commander와 `reviewer`(별도 세션)가 병렬로 독립 검토했다. `reviewer`가 실제
CLI+pyright로 두 결함을 재현했다:

1. **역방향 alias**: `importsNameFromModule()`의 alias 검사가 `router as X`(정방향, 우리 이름이
   다른 이름으로 나감)만 걸렀고 `other_thing as router`(역방향, root 모듈의 다른 심볼을 로컬에서
   우리 이름으로 alias)를 놓쳤다 — 무관한 객체가 확정 edge로 mount됐다. 상대·절대 import 양쪽이
   같은 검사를 공유해 둘 다 영향받았다. 수정: import 목록을 콤마로 쪼개 별칭 없는 정확한 항목만
   인정(`entry.trim() === name`) — 9케이스 행렬(commander)로 검증.
2. **`isDirectFastapiApp`이 원문을 그대로 검사**: `stripCommentsAndStrings()`를 거치지 않아, 주석
   한 줄(`# app = FastAPI()`)만으로 `isRouterMounted()` 전체를 건너뛰었다 — 이 lane이 쌓은 모든
   검사(provenance, module-level scoping)를 comment 하나가 우회했다. `origin/main`에도 있던 기존
   결함(이 branch의 회귀 아님)이지만 gate 4가 금지하는 형태라 이번 lane에서 닫았다. 수정:
   `stripCommentsAndStrings(rootText)`를 넘기도록 변경.

**이 셋(round 2 self-mount shadow, round 3 역방향 alias, round 3 comment-bypass)의 뿌리가
같다** — provider 재검증이 없는 텍스트 매치(`isRouterMounted()`/`importsNameFromModule()`,
`isDirectFastapiApp()`)에서만 스코프·alias 착각이 사용자에게 도달한다. `Depends()` 경로의 텍스트
매치는 전부 `prepare()`로 재검증돼 같은 종류의 실수가 사용자에게 안 드러난다. 이 구조적 논증은
`fastapiDependencyAdapter.ts` 최상단 주석에 기록했다(두 번째 adapter가 재검증 없는 텍스트 매치를
새로 만들면 이 논증이 깨진다는 조건도 같이).

**gate 4는 여전히 열려 있다** — round 3 수정 후에도 스스로 닫힘 선언을 하지 않는다. `reviewer` 재검토와
사용자 결정을 기다린다.

## 2026-09-08 추가 — 주된 잔여(segment 하나짜리 절대 import) 수정, 닫힘 판정, 판정문 정정

PR #85(round 3 포함)가 merge된 뒤, `reviewer`의 완전성 논증 재검증 과정에서 `importsNameFromModule()`
의 절대 import 경로 중 segment 하나짜리인 경우가 여전히 depth 무관 basename 매치로 퇴화하던 주된
잔여가 지적됐다(`docs/work/task-m4-gate4-single-segment-import.md`). 사용자가 "한 라운드 더"를
결정해 이 lane이 그 잔여를 닫았다 — `rootFile`이 workspace root 바로 아래 있어야 한다는 depth
요구를 segment-하나 case에 추가(대안인 workspace 전체 basename uniqueness는 양방향으로 틀려
직접 측정 후 기각).

이 수정은 `importsNameFromModule()` **내부의 비교 로직만** 바꿨다 — 위 완전성 논증이 의존하는
"재검증 없는 두 함수" 경계 자체는 그대로다(새 재검증-없는 경로를 만들지 않았다). commander의
명시적 지시("이번엔 판정까지 하세요")에 따라 이 세션이 처음에 **"알려진 오탐 경로 0"으로 gate 4를
닫힘 판정했으나, 그 조건이 사실이 아니었다.** commander가 직접 측정해 지적했다: 다중 segment
절대 import는 여전히 같은 dotted-path suffix로 끝나는 두 파일(vendored 사본 등)을 구분하지
못한다 — `pathEndsWithSegments()`가 애초에 이 케이스를 못 가르는 suffix 비교이고, 이 함수 자신의
doc comment가 이미 "vendored copies of the same nested path"로 이 시나리오를 언급하고 있었는데
판정문은 그걸 반영하지 못했다. 재현해 확인한 뒤(`[실행]`, 유닛 테스트 "KNOWN, ACCEPTED RESIDUAL
FALSE POSITIVE"로 고정) **판정문을 정정한다: gate 4는 "오탐 경로 0"이 아니라 "수용된 잔여 1건
(다중 segment vendored-tree 충돌)을 안고" 닫는다** — 그 잔여를 지금 고치지 않는 근거(병리적
배치가 필요해 좁음, 유일한 수정안은 PR #85가 이미 기각한 설계와 같음)는
`docs/work/task-m4-gate4-single-segment-import.md`의 "gate 4 판정" 절 참고. `reviewer`의 독립
재검토는 여전히 남아 있다 — round 1의 성급한 닫힘 선언·번복 이력이 있으므로, 이 판정(정정판
포함)은 PR 병합 전까지 잠정으로 취급한다.
