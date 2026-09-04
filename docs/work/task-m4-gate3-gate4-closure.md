# M4 gate 3·4 종료 처리

- 상태: gate 3·gate 4 모두 완료
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

**결론: gate 4("모호한 DI/dynamic target은 하나의 확정 caller로 임의 승격되지 않는다")는 두 지점
모두 방어가 생겨 닫혔다.**

## 남은 것

- closure audit이 기록한 나머지 gate(1: IL-LIM-001/010/002 gate C, 2: UI 구분, 5: test-passed 색,
  7: latency budget, 8: user-test 명세)는 이 lane의 범위 밖.
- source 경로의 "침묵의 대가"(위 참고) — limitation 신호가 필요하다는 결론이면 별도 lane에서
  `V1_WITHHELD_REASON_CODES`/plugin skill/`cli-contract.md`/response-policy eval을 함께 갱신해야
  한다. 이 lane은 그 필요성만 기록하고 만들지 않았다.
