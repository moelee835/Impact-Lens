# M4 gate 3·4 종료 처리

- 상태: gate 3 완료, gate 4는 결정 보고 대기(구현 전)
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

## 단계 2 — gate 4: 방어 없는 두 지점 (조사 완료, 구현 전 보고)

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

### 결정 — 아직 구현하지 않는다, commander 보고 대기

commander가 결정을 넘겼다: `items.length > 1`일 때 두 지점 각각 무엇을 해야 하는가.

- **source 경로**: source endpoint는 노드 하나뿐이라 "여러 source"를 표현할 자리가 없다 —
  **edge를 안 만들고 limitation만 내는 쪽이 stage 1 계약과 맞아 보인다.** 다만 어떤 limitation
  코드를 쓸지(기존 코드 재사용 가능한지, 새 코드가 필요한지)는 아직 안 정했다.
- **alias 경로**: 참조 자체는 하나이고 후보가 여럿이므로 **`resolution: 'multiple'`로 표시하는
  쪽이 맞아 보인다.** 다만 `fastapiDependencyAdapter.ts:537`의 "ambiguity가 이미 해소됐다"는
  주석(closure audit이 이미 부정확하다고 기록한 그 주석)도 같이 고쳐야 한다.

**이 판단은 코드를 읽고 낸 것이지 실측이 아니다** — 실제로 구현하기 전에 commander에게 보고하고
확인받는다(아래 "보고" 참고). fixture로 이 경로를 트리거할 수 없다면(위 조사 결과가 그럴 가능성을
보여준다) stub provider(`fastapiDependencyAdapterMultipleCandidate.test.ts`의 패턴)로 coverage만
만들고, **그건 gate 통과가 아니라 coverage라는 구분을 명시**해야 한다 — `resolution: 'multiple'`
stub coverage 때와 같은 원칙.

### 아직 하지 않은 것

- 두 지점 모두 코드 변경 없음(디버그 로그만 추가했다가 확인 후 제거, `git diff` 0 확인).
- limitation 코드 설계, `resolution: 'multiple'` 표시, 주석 수정 전부 미착수 — 결정 보고 후 진행.

## 남은 것

- gate 4 구현(결정 확인 후).
- closure audit이 기록한 나머지 gate(1: IL-LIM-001/010/002 gate C, 2: UI 구분, 5: test-passed 색,
  7: latency budget, 8: user-test 명세)는 이 lane의 범위 밖.
