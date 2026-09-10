# M4 사용자 테스트 명세 — Semantic Augmentation Evidence 이해도와 Rollout 결정

- 대상 마일스톤: [M4 — Semantic Augmentation](../milestones/m4-semantic-augmentation.md) 4단계
- 작성 기준 코드 상태: `main`에 merge된 M4 lane 전체(gate 1~7 닫힘, `feat/il-lim-001-002-inference-limitations`
  / `feat/il-lim-010-stage1-evidence-and-patterns` / `feat/il-lim-001-gate1-lang-limitations` 등). **발행
  버전이 아니라 merge된 코드 기준으로 쓴다** — M1 명세가 발행 버전과 작성 기준을 혼동해 사후
  정정이 필요했던 전례를 반복하지 않는다. 이 명세가 merge된 직후 `v0.9.0`이 발행될 예정이라 두
  기준이 우연히 거의 겹치지만, **그 우연을 규칙으로 적지 않는다** — 다음 마일스톤에서는 명세
  merge 시점과 release 시점이 다시 벌어질 수 있다.
- 상태: 작성 완료, **검토 대기**. **아직 실행하지 않았다.**
- 작성 규칙: [마일스톤별 사용자 테스트 명세 계획](../milestones/user-validation-planning.md)
- 근거: [IL-LIM-001](../stories/il-lim-001-dynamic-runtime-calls.md),
  [IL-LIM-002](../stories/il-lim-002-framework-di-routing.md),
  [IL-LIM-010](../stories/il-lim-010-test-impact-discovery.md),
  `docs/work/task-m4-il-lim001-002-inference-limitations.md`,
  `docs/work/task-m4-il-lim-010-stage1-completion.md`,
  `docs/work/task-m4-gate1-lane-d-language-limitations.md`

이 문서는 명세일 뿐이며, **존재만으로 사용자 검증을 통과한 것으로 표시하지 않는다.** 실행은 별도
승인, 참여자 모집과 환경 준비 후에 수행한다.

## 0. 진입점과 범위 경계

설치·초기화·runner 우선순위(M0), Auto 선택과 doctor 복구(M1), 언어별 provider 신뢰성(Python/Go/
C/C++, M2)은 M4에서 바뀌지 않았다 — 이 문서는 그것들을 다시 검증하지 않는다. 아직 실행하지 않은
독자는 [M0 사용자 테스트 명세](m0-user-test-spec.md) → [M1](m1-user-test-spec.md) →
[M2](m2-user-test-spec.md) → 이 문서 순서로 진행한다. M3(Java/Kotlin 언어 지원)는 아직 구현되지
않았으므로 이 문서의 범위 밖이다.

이 문서는 M4가 새로 더한 것만 본다:

1. **augmentation 기능**(`fastapi-static-v1`/`dynamic-callback-static-v1` adapter, `data.
   augmentedEdges`, 관련 `limitationDetails` 5종) - 기본값 꺼짐.
2. **evidence 어휘**(`data.edges` "확정" vs `data.augmentedEdges` "후보")가 실제로 그렇게 읽히는가.
3. **`IL-LIM-010` 사용자 test 분류 설정**(`.impact-lens/test-patterns.json`, `testRule`/
   `testRuleSuppressed`).
4. **M4 gate 1 lane D가 발견한 `data.edges` 라벨 부정확**(Go `gopls`/C·C++ `clangd`에서 호출
   없는 순수 참조가 caller로 보고됨) - #106이 문서만 고쳤고 동작은 그대로다.

## 1. 검증 목적

M4의 자동 검사는 이미 기계 쪽 절반을 증명했다 - `data.augmentedEdges`가 실제 FastAPI/JS 콜백
fixture에서 실제로 뜨고, 5개 augmentation limitation code가 실제 응답에 실리며, gate 1 lane D의
발견은 두 세션이 독립 재현했다. **이 문서는 나머지 절반, 사람이 그 값을 실제로 그렇게 읽는지를
본다** - gate 8의 문구 그대로("evidence 이해도와 실제 누락·오탐 검토").

1. `data.edges`(확정)와 `data.augmentedEdges`(후보)를 **다른 강도의 주장**으로 읽는가.
2. "함수가 콜백 자리로 전달됐다"와 "그 함수가 호출된다"가 **다르다**는 것을 이해하는가.
   `[].forEach(handler)`는 0번 부를 수 있고, `setTimeout`은 취소될 수 있고, 이벤트는 안 올 수
   있다 - adapter가 실제로 하는 주장은 "전달됐다"이지 "호출됐다"가 아니다.
3. 새 안내 `augmentation_inference_unresolved`를 "caller 목록이 불완전할 수 있다"로 읽는가, 아니면
   신경 안 써도 되는 잡음으로 넘기는가.
4. `관련 테스트 후보`(`testRule`)를 "테스트가 통과했다"로 오해하지 않는가 - Impact Lens는 테스트를
   **실행하지 않는다.**
5. **(M4 고유, gate 1 lane D 발견)** Go/C에서 참조뿐인 항목이 caller로 나올 때, 실제로 몇 곳에서
   "호출"되는지 과신하지 않는가 - 그리고 #106이 새로 추가한 경계 문구를 읽고 나면 그 과신이 실제로
   풀리는가.

**그리고 실제 누락·오탐 검토**(gate 8의 두 번째 요구): 참여자가 자기 실제 코드베이스에서
augmentation을 켠 채 변경 영향을 검토하며 정적 그래프가 놓친 관계를 찾는가, 반대로 잘못된 후보를
찾아내는가.

## 2. 이번 테스트로 판단하지 않을 항목

M0~M2가 이미 검증한 계층(설치, Auto 선택, doctor 복구, 언어별 provider의 기본 Call Hierarchy
신뢰성)은 다시 판단하지 않는다. 정적 Call Hierarchy의 절대 정확도, 대규모 workspace 성능(M5),
Note 사용성(M6), graph 시각 디자인은 판단하지 않는다.

**augmentation의 정밀도·재현율 수치**(precision/recall, latency budget)는 판단하지 않는다 -
이미 gate 3(자동 정확도·성능 gate)과 gate 7(예산·실제 코드 정밀도) 실측으로 닫혔다. 이 문서는
"측정값이 맞는가"가 아니라 "사람이 그 측정값을 올바르게 읽는가"만 본다.

**adapter 간 비교도 하지 않는다.** `fastapi-static-v1`과 `dynamic-callback-static-v1`은 독립
승격 결정 대상이다(§10). 한 adapter의 결과가 다른 adapter의 판정에 들어가지 않는다.

**Go/C `edges` 라벨 문제의 코드 수정(필터링/라벨링/계약 변경)은 판단하지 않는다** - 별도 이슈로
이미 뗐다(`docs/work/task-m4-gate1-lane-d-language-limitations.md`). 이 문서는 "#106이 붙인
문서 경계가 실제로 오해를 푸는가"만 잰다.

## 3. 참여자 — 두 트랙, 성격이 다르다

**이 구분 자체가 이 명세의 정직성이다.** Part A(§6-A)는 유지보수자가 지금 혼자 수행할 수 있다 -
"동작이 맞는가"를 재는 엔지니어링 확인이지, "사람이 그 값을 어떻게 읽는가"가 아니다. Part
A만으로는 blind가 성립하지 않는다: 제품을 만든 사람은 이미 `edges`/`augmentedEdges`가 뭘
뜻하는지 안다. **Part A를 전부 통과해도 그것은 사용자 검증이 아니다 — gate 8이 실제로 묻는
"사람이 그 값을 그렇게 읽는가"는 Part A만으로는 여전히 미측정으로 남는다.**

Part B(§6-B)만 naive 참여자가 필요하고, 이 문서가 재려는 evidence 이해도의 대부분이 여기 있다.

### Part A 수행자

- 유지보수자 본인, 또는 이 저장소의 provider/adapter 계층을 아는 사람.
- 자기 소유의 실제 FastAPI(Python) 프로젝트 하나, 실제 JS/TS 프로젝트 하나(§6 A5), 가능하면 실제
  Go 또는 C 프로젝트 하나(§6 A4)를 준비한다. 없으면 §6이 제공하는 최소 재현 fixture로 대체한다.

### Part B 참여자

- **adapter당 독립 모집**: `fastapi-static-v1` 트랙(FastAPI 경험자)과 `dynamic-callback-static-v1`
  트랙(JS/TS 콜백·이벤트 코드 경험자)은 각각 pilot 2명 + 본 라운드 4명, 총 12명.
- Go/C `edges` 라벨(B5)은 **트랙과 무관하게** Go 또는 C/C++ 경험자 pilot 2명 + 본 라운드 4명을
  별도 모집한다 - 총 18명.
- 자격: 해당 언어/framework로 자기 코드베이스를 하나 이상 유지하고 있을 것.
- 제외: 이 저장소에 기여한 적 있는 사람, augmentation adapter나 `data.edges`/`data.augmentedEdges`
  구분을 이미 아는 사람. **M2의 참여자를 재사용하지 않는다** - M2 참여자는 이미 `provider_null_
  incoming_calls`/candidate 어휘에 노출됐을 수 있다.

## 4. 환경 matrix

| 트랙 | adapter/발견 | 필요 언어 경험 | Host |
| --- | --- | --- | --- |
| B1~B4 (FastAPI) | `fastapi-static-v1` | Python + FastAPI | CLI 직접, Extension, Plugin 각 1회 |
| B1~B4 (JS/TS 콜백) | `dynamic-callback-static-v1` | JS/TS | CLI 직접, Extension, Plugin 각 1회 |
| B5 | gate 1 lane D 발견 | Go 또는 C/C++ | CLI 직접, Extension 각 1회 |
| B6 | IL-LIM-010 | 무관(자기 프로젝트에 test 파일이 있으면 됨) | Extension |

M2와 같은 이유로 **Plugin runner에서 최소 1회씩** 수행한다 - 에이전트 요약이 evidence 강도를
옮기는지는 그 조합에서만 관측된다(M2 §4/§12).

## 5. 시작 상태와 사전조건

- Part A는 `jq`(JSON 필드 확인용)가 설치돼 있어야 한다 - 없으면 `brew install jq` /
  `apt-get install jq` / `choco install jq`로 설치하거나, 출력 JSON을 에디터로 열어 직접 눈으로
  비교해도 된다. Part A의 모든 명령은 저장소를 merge된 상태로 checkout하고 `pnpm install &&
  pnpm --dir cli run build`를 한 번 실행했다고 가정한다.
- M0 가이드에 더해, augmentation은 **기본값 꺼짐**을 확인한 상태에서 시작한다(§6 A1이 그 확인
  자체를 과업으로 만든다).
- Part B 참여자에게는 세션 시작 전에 `data.edges`/`data.augmentedEdges`/`augmentation_inference_
  unresolved`/`testRule` 중 어떤 것도 미리 설명하지 않는다 - 이 문서 §6-B의 자유 서술 단계가
  측정하려는 것이 정확히 "설명 없이 처음 봤을 때 어떻게 읽는가"다.
- B5는 참여자의 실제 Go/C 코드베이스에서 **함수를 값으로만 참조하고 실제로는 호출하지 않는 지점**을
  진행자가 미리 찾아 둔다(예: 콜백 등록 함수에 이름만 전달하고 등록 자체가 조건부로 실행 안 되는
  경우, 또는 함수 포인터를 구조체 필드에 저장만 하는 경우). 없으면 §6 B5의 최소 재현 fixture로
  대체한다 - 원본 프로젝트는 건드리지 않는다.

## 6. 과업

### Part A — 유지보수자가 지금 직접 수행 (엔지니어링 확인, blind 아님)

각 과업은 **명령 → 기대 출력 → 실제 결과 기록란** 순서다. 이 저장소를 merge된 상태로 checkout한
뒤 `pnpm --dir cli run build`를 한 번 실행하고 시작한다.

**A1 — augmentation 기본값과 on/off 무변경 확인.**

```sh
mkdir -p /tmp/il-a1 && cd /tmp/il-a1
cat > target.py <<'EOF'
def get_db():
    return "db"
EOF
cat > caller.py <<'EOF'
from fastapi import Depends
from target import get_db


def read_items(db=Depends(get_db)):
    return db
EOF
```

이 문서의 모든 명령은 저장소 루트에서 `pnpm --dir cli run build`를 이미 실행했다고 가정하고,
`CLI=<저장소 절대경로>/cli/dist/index.js`로 CLI 실행 파일을 가리킨다:

```sh
CLI=/path/to/Impact-Lens/cli/dist/index.js

# 1) augmentationEnabled 생략(기본값)
echo '{"workspace":"/tmp/il-a1","file":"target.py","line":1,"column":5,"depth":5,"maxNodes":50}' \
  | node "$CLI" analyze --stdin > /tmp/il-a1-off.json

# 2) augmentationEnabled: true
echo '{"workspace":"/tmp/il-a1","file":"target.py","line":1,"column":5,"depth":5,"maxNodes":50,"augmentationEnabled":true}' \
  | node "$CLI" analyze --stdin > /tmp/il-a1-on.json
```

**기대 출력**:
- `/tmp/il-a1-off.json`의 `.data.augmentedEdges`가 `[]`이거나 필드 자체가 없다.
- `/tmp/il-a1-on.json`의 `.data.augmentedEdges`에 `adapterId: "fastapi-static-v1"`,
  `reasonCode: "fastapi-depends"` 항목이 최소 1개 있다.
- 두 파일의 `.data.edges`와 `.data.nodes`가 **byte-identical**하다:
  `diff <(jq .data.edges /tmp/il-a1-off.json) <(jq .data.edges /tmp/il-a1-on.json)`가 출력 없이
  종료.

| 확인 항목 | 기대 | 실제 | PASS/FAIL |
| --- | --- | --- | --- |
| augmentation 기본값이 꺼져 있다(augmentedEdges 없음/빈 배열) | | | |
| 켜면 augmentedEdges에 fastapi-depends 항목이 생긴다 | | | |
| edges/nodes가 on/off 사이 byte-identical하다 | | | |

같은 과업을 JS/TS로도 반복한다(콜백 slot):

```sh
mkdir -p /tmp/il-a1-js && cd /tmp/il-a1-js
cat > target.ts <<'EOF'
export function handler(): void {}
EOF
cat > caller.ts <<'EOF'
import { handler } from './target';

export function timeoutCaller(): void {
  setTimeout(handler, 0);
}
EOF
echo '{"workspace":"/tmp/il-a1-js","file":"target.ts","line":1,"column":17,"depth":5,"maxNodes":50,"augmentationEnabled":true}' \
  | node "$CLI" analyze --stdin > /tmp/il-a1-js.json
```

**기대 출력**: `/tmp/il-a1-js.json`의 `.data.augmentedEdges`에 `adapterId: "dynamic-callback-
static-v1"`, `reasonCode: "callback-registration"` 항목이 있다(`setTimeout` 호출은 반드시 함수
본문 **안**에 있어야 한다 - 모듈 최상위 문장은 감싸는 함수가 없어 이 adapter가 인식하지 못한다).

| 확인 항목 | 기대 | 실제 | PASS/FAIL |
| --- | --- | --- | --- |
| setTimeout 콜백 등록이 dynamic-callback-static-v1 candidate로 뜬다 | | | |

**A2 — 사용자가 직접 재현 가능한 augmentation limitation code 두 개.**

이 명세는 5개 code 중 사용자가 특수한 내부 상태(강제 실패, budget 소진) 없이 자기 힘으로 재현할
수 있는 **`framework_route_mount_unresolved`**와 **`augmentation_inference_unresolved`**만
과업으로 다룬다. `augmentation_adapter_failed`/`augmentation_internal_error`/`augmentation_
budget_exceeded`는 정상적인 소스 코드로는 사용자가 임의로 유도할 수 없는 내부 실패/예산 상태이고
CI의 mutation-검증 통합 테스트가 이미 덮는다(`cli/src/test/augmentationBudgetExceededEndToEnd.
test.ts`가 budget을, `cli/src/test/augmentationFailureIsolation.test.ts`가 adapter_failed/
internal_error를 각각 덮는다) - 이 세 code까지 이 명세에서 인위적으로 유도하면 실제
사용자가 만나지 않을 조작된 상태를 재는 것이 되어 오히려 오해를 만든다.

```sh
mkdir -p /tmp/il-a2 && cd /tmp/il-a2
cat > app.py <<'EOF'
from fastapi import APIRouter

router = APIRouter()


@router.get("/x")
def handler():
    return "x"
EOF
```

`include_router(router)`를 어디에서도 호출하지 않았다 - `router.get("/x")`가 데코레이트한
`handler`를 조회하면 route가 마운트됐는지 확인할 수 없어야 한다. (`handler`는 2번째 줄이 아니라
**7번째 줄**에 있다 - `@router.get(...)` 데코레이터 자체는 6번째 줄이다.)

```sh
echo '{"workspace":"/tmp/il-a2","file":"app.py","line":7,"column":5,"depth":5,"maxNodes":50,"augmentationEnabled":true}' \
  | node "$CLI" analyze --stdin > /tmp/il-a2.json
```

**기대 출력**: `/tmp/il-a2.json`의 `.data.limitationDetails`에
`code: "framework_route_mount_unresolved"` 항목이 있다.

| 확인 항목 | 기대 | 실제 | PASS/FAIL |
| --- | --- | --- | --- |
| 마운트 안 된 router의 route handler 조회 시 framework_route_mount_unresolved가 뜬다 | | | |

`augmentation_inference_unresolved`는 module-level alias 케이스로 재현한다
(`docs/work/task-m4-il-lim001-002-inference-limitations.md`가 실측한 것과 같은 모양):

```sh
mkdir -p /tmp/il-a2-b && cd /tmp/il-a2-b
cat > target.py <<'EOF'
def get_db():
    return "db"
EOF
cat > caller.py <<'EOF'
from fastapi import Depends
from target import get_db

XDep = Depends(get_db)


def read_items(db=XDep):
    return db
EOF
echo '{"workspace":"/tmp/il-a2-b","file":"target.py","line":1,"column":5,"depth":5,"maxNodes":50,"augmentationEnabled":true}' \
  | node "$CLI" analyze --stdin > /tmp/il-a2-b.json
```

**기대 출력**: `/tmp/il-a2-b.json`의 `.data.limitationDetails`에
`code: "augmentation_inference_unresolved"` 항목이 있다(module-level alias는
`capability-blocked`로 분류된다).

| 확인 항목 | 기대 | 실제 | PASS/FAIL |
| --- | --- | --- | --- |
| module-level alias 형태에서 augmentation_inference_unresolved가 뜬다 | | | |

**A3 — IL-LIM-010: 자기 프로젝트에서 놓친 test 파일을 직접 고친다.**

1. 자기 소유 프로젝트에서, 5개 내장 규칙(`docs.limitations`/`cli-contract.md`의 test 분류 규칙
   목록 참고)이 놓치는 실제 test 파일을 하나 찾는다 - 흔한 예: `e2e/*.flow.ts`,
   `qa/*.scenario.py`처럼 이 저장소 관례와 다른 명명.
2. 그 파일이 호출하는 함수 하나를 대상으로 분석을 실행하고, 그 파일에 해당하는 node의 `relation`이
   `"test"`가 아님을 확인한다(`testRule`이 `null`).
3. 프로젝트 루트에 `.impact-lens/test-patterns.json`을 만든다:
   ```json
   { "include": ["e2e/**/*.flow.ts"] }
   ```
   (glob은 `*`/`**`만 지원한다 - `?`/`[...]`/`{...}`/`!`/`\`는 지원하지 않는다.)
4. 같은 분석을 다시 실행하고, 그 node의 `relation`이 `"test"`로 바뀌고 `testRule.source`가
   `"user-include"`임을 확인한다.
5. exclude도 반복한다: 내장 규칙이 test로 잘못 분류하는 파일이 있으면(드물면 생략 가능)
   `.impact-lens/test-patterns.json`의 `exclude`에 추가하고, 그 node의 `testRuleSuppressed`에
   `ruleId`(원래 매칭됐을 규칙)와 `excludePattern`(이긴 exclude 패턴)이 채워지는지 확인한다.

| 확인 항목 | 기대 | 실제 | PASS/FAIL |
| --- | --- | --- | --- |
| include 패턴 추가 전 놓친 test 파일을 실제로 찾았다 | | | |
| include 패턴 추가 후 relation이 test로 바뀌고 testRule.source가 user-include다 | | | |
| (해당 시) exclude 패턴 추가 후 testRuleSuppressed에 ruleId/excludePattern이 채워진다 | | | |

**A4 — Go/C `edges` 라벨 발견의 재현.**

가능하면 자기 소유 Go 또는 C/C++ 프로젝트에서, 함수가 **값으로만 참조되고 그 참조 지점에서
직접 호출되지 않는** 곳(콜백 등록 테이블, 함수 포인터를 구조체에 저장만 하는 코드 등)을 찾아
그 함수를 조회하고 `data.edges`에 그 참조 지점이 caller로 나오는지 확인한다. 찾지 못하면 아래
최소 재현으로 대체한다(Go):

```sh
mkdir -p /tmp/il-a4 && cd /tmp/il-a4
cat > go.mod <<'EOF'
module fixture

go 1.21
EOF
cat > target.go <<'EOF'
package fixture

func FixtureTarget() int {
	return 1
}
EOF
cat > caller.go <<'EOF'
package fixture

func FixtureCaller() int {
	var f func() int = FixtureTarget
	_ = f
	return 0
}
EOF
echo '{"workspace":"/tmp/il-a4","file":"target.go","line":3,"column":6,"depth":5,"maxNodes":50}' \
  | node "$CLI" analyze --stdin > /tmp/il-a4.json
```

(`gopls`가 PATH에 있어야 한다.)

**기대 출력**: `/tmp/il-a4.json`의 `.data.edges`에 `FixtureCaller`가 caller로 나온다 - 이
파일에는 `FixtureTarget()` 같은 호출 표현식이 **한 곳도 없다.**

| 확인 항목 | 기대 | 실제 | PASS/FAIL |
| --- | --- | --- | --- |
| 호출이 전혀 없는 값 참조가 실제로 caller로 보고된다(자기 프로젝트 또는 최소 재현) | | | |

**A5 — 자기 실제 코드베이스에서 augmentation blind-ish review.**

**이 과업의 축을 분명히 한다: "augmentation이 실제로 맞는 것을 찾는가/틀린 것을 만드는가"라는
엔지니어링 질문이지, §6-B가 재는 "사람이 문구를 어떻게 읽는가"라는 질문이 아니다. 이 과업을
포함한 Part A 전체를 통과해도 그것은 사용자 검증이 아니다.**

1. 자기 소유의 실제 FastAPI 또는 JS/TS 프로젝트에서 augmentation을 켜고, 평소에 하던 대로 함수
   몇 개의 영향 범위를 조회한다.
2. **누락 탐색**: `data.augmentedEdges`에 뜬 후보 중, 자신이 코드를 알고 있어 "이건 진짜
   caller다"라고 확신할 수 있는 것이 있는가 - 있다면 정적 그래프(`data.edges`)만 봤을 때 놓쳤을
   관계다.
3. **오탐 탐색**: 반대로 `data.augmentedEdges`의 후보 중 실제로는 그 함수가 호출되지 않는 경우가
   있는가(등록됐지만 조건부로 절대 실행 안 되는 콜백, 실제로는 다른 함수가 매칭되는 이름 충돌 등).
4. 발견한 각각을 아래 표에 기록하고, 재현 가능한 최소 코드를 남긴다.

| 유형(누락/오탐) | 함수 | 재현 코드/경로 | 실제 관계 | augmentation 응답 |
| --- | --- | --- | --- | --- |
| | | | | |

### Part B — naive 참여자 필요 (evidence 이해도, blind)

각 과업은 M2와 같은 순서다: **자유 서술 단계 → 확인 단계.** 진행자는 자유 서술 단계에서 힌트를
주지 않는다. 자유 서술이 끝나기 전에는 다음 단어를 진행자가 먼저 꺼내지 않는다: `확정`, `후보`,
`추측`, `참조`, `불완전`, `잡음`, `테스트 통과`. **"이건 확정된 관계인가요?" 같은 답을 심는
질문은 금지한다** — M1 §6/§14, M2 §6이 이미 금지한 패턴과 같다.

**예외 - `호출(된다)`은 금지어가 아니다.** B2/B5의 질문 문구("몇 번 호출된다고 생각합니까")가
이 단어를 쓴다 - 이 두 과업이 **재려는 대상 자체가 "호출 여부와 횟수"**이기 때문에, 그 동사
없이는 질문 자체를 구성할 수 없다. 금지어 규칙의 취지는 **답을 미리 흘리지 않는 것**이지 특정
단어를 봉인하는 것이 아니다 - "호출"은 참여자가 검증해야 할 대상의 이름일 뿐, 정답의 방향("맞다"/
"아니다")을 심지 않는다(reviewer 확인). 이 예외를 여기 명시하는 이유는, 나중에 누군가 금지어
목록과 질문 문구를 기계적으로 대조하면 위반처럼 보일 수 있기 때문이다.

**B1 — `edges`와 `augmentedEdges`를 다른 강도로 읽는가.**

augmentation을 켠 상태로 FastAPI(또는 JS/TS) 프로젝트에서 `data.edges`에 1개, `data.
augmentedEdges`에 1개 항목이 있는 실제 응답을 보여준다(Extension Graph UI 또는 Plugin 요약).
질문: **"이 두 목록 각각이 당신에게 무엇을 말해준다고 생각합니까? 하나를 근거로 삭제 결정을
내린다면 어느 쪽을 더 믿겠습니까?"**

확인 단계: `data.edges`는 provider가 확인한 관계, `data.augmentedEdges`는 adapter의 추론이라는
사실을 알려주고, 자유 서술과 일치했는지 기록한다.

**B2 — "전달됨"과 "호출됨"을 구분하는가.**

`[].forEach(handler)`, `setTimeout(handler, 0)`, `element.addEventListener('click', handler)`
세 형태 각각으로 `dynamic-callback-static-v1`이 만든 candidate 하나를 보여준다. 질문: **"이
candidate가 있다는 것은 `handler`가 몇 번 호출된다는 뜻입니까?"**

확인 단계: 셋 다 "전달됨"만 보장하고 "호출 횟수"는 보장하지 않는다는 것(forEach 빈 배열이면
0번, setTimeout은 clearTimeout으로 취소 가능, 이벤트는 안 올 수 있음)을 알려주고, 참여자가
스스로 "몇 번 호출되는지는 모른다"에 도달했는지와 비교한다.

**B3 — `augmentation_inference_unresolved`를 어떻게 읽는가.**

A2가 만든 것과 같은 실제 응답(module-level alias 사례)을 보여준다. 질문: **"이 안내를 읽고,
위에 나온 caller 목록에 대해 어떻게 생각이 바뀝니까?"**

확인 단계: "목록이 불완전할 수 있다"로 답했는지, 아니면 무시해도 되는 잡음으로 취급했는지 기록.

**B4 — `관련 테스트 후보`를 테스트 통과로 오해하는가.**

`relation: "test"`, `testRule` 채워진 실제 node를 보여준다. 질문: **"이 함수와 관련된 테스트에
대해 이 화면이 알려주는 것은 무엇입니까?"**

확인 단계: Impact Lens는 테스트를 **실행하지 않으며**, 이 표시는 "관련 있는 test 파일이
있다"는 뜻이지 "그 테스트가 통과했다"는 뜻이 아니라는 것을 알려주고 비교한다.

**B5 — Go/C의 참조=caller, 그리고 새 경계 문구가 실제로 오해를 푸는가.** (M4 gate 1 lane D가 남긴
질문에 대한 유일한 실측 - "문서를 고쳤다"와 "그 문서가 오해를 실제로 푼다"는 다른 주장이고, 이
전에는 잰 적이 없다.)

1. §5가 준비한 참조-전용 사례(또는 A4의 최소 재현)를 조회한다. `data.edges`에 caller가 나온다.
   질문: **"이 함수는 몇 곳에서 호출된다고 생각합니까?"**
2. 자유 서술을 기록한 뒤, **실제 소스 코드를 공개**한다 - 그 "caller"가 실제로는 호출이 아니라
   값 참조라는 것을 보여준다. 질문: **"방금 답과 실제 코드가 다르다면, 왜 다르다고 생각합니까?"**
3. 그 다음에만, README.md/`cli/README.md`가 #106으로 추가한 경계 문구(Go/C에서 참조가 caller로
   나올 수 있다는 문단)를 보여준다. 질문: **"이 문구를 미리 읽었다면 방금 1번 답이 달라졌을 것
   같습니까? 이 문구가 실제로 무슨 뜻인지 설명해 보세요."**

확인 단계 없음 - 이 과업 자체가 3단계 관측이다. §8/§10에 각 단계의 응답을 그대로 기록한다.

**B6 — `testRuleSuppressed`/`ruleId`의 근거가 legible한가.**

A3가 만든 것과 같은, `testRuleSuppressed`가 채워진 실제 node를 보여준다. 질문: **"이 함수가 왜
'test'로 분류되지 않았는지, 이 화면에 나온 정보만으로 설명해 보세요."**

확인 단계: `ruleId`(원래 매칭됐을 규칙)와 `excludePattern`(이긴 exclude 패턴)이 실제로 그
설명을 만드는 데 쓰였는지, 아니면 참여자가 그 필드를 그냥 무시했는지 기록.

## 7. 과업별 기대 결과와 중단 조건

- Part A의 어떤 확인 항목이 FAIL이면 §6-B를 시작하기 전에 원인을 고친다 - 틀린 동작을 근거로
  참여자에게 이해도를 묻는 것은 무의미하다.
- **B1~B6의 자유 서술 단계에서 진행자가 힌트를 주면 그 세션은 무효**다. 무효 세션 비율은 §10의
  판정 항목이다.
- B5의 3단계 순서(자유 서술 → 코드 공개 → 문구 공개)를 바꾸면 그 세션은 무효다 - 순서 자체가
  측정 대상이다.
- 참여자 프로젝트를 도구가 자동으로 build·install·수정하면 즉시 중단하고 결함으로 보고한다.

## 8. 관측 지표

- Part A: 확인 항목별 PASS/FAIL, A5에서 발견한 누락/오탐 건수.
- B1: `edges`/`augmentedEdges`를 다른 신뢰 수준으로 표현한 참여자 비율.
- B2: "전달됨≠호출됨"을 자유 서술에서 스스로 언급한 참여자 비율(forEach/setTimeout/event 형태별
  독립 기록).
- B3: "목록이 불완전할 수 있다"에 도달한 비율 vs 잡음으로 취급한 비율.
- B4: 테스트 통과로 오해한 참여자 비율.
- **B5**: 1단계에서 실제 호출 횟수를 과대평가한 비율, 2단계(코드 공개) 후에도 여전히 "호출"이라는
  표현을 쓴 비율, **3단계(경계 문구 공개) 후 이해가 바뀌었다고 답한 비율** - 이 마지막 수치가
  #106의 문서 수정이 실제로 작동하는지의 유일한 실측이다.
- B6: `ruleId`/`excludePattern`을 근거로 실제 인용한 참여자 비율.
- 전 과업: 자동 build·install·수정이 일어난 횟수(0이어야 하는 안전 불변식).
- Plugin runner 조합에서는 에이전트 요약 원문을 매번 기록한다(§12).

## 9. 사후 질문

자유 서술이 완전히 끝난 뒤에만 쓴다. §6이 금지한 단어를 여기서는 쓰되, 이미 발화가 기록된 뒤이므로
유도가 성립하지 않는다.

- "`data.edges`와 `data.augmentedEdges` 중 어느 쪽이 더 확실한 정보라고 생각했습니까? 왜
  그렇게 생각했습니까?"
- "이 도구가 '호출된다'고 확실히 말하지 않는 경우가 있다는 것을 알고 있었습니까?"
- (B5) "Go/C와 다른 언어(Python/JS)에서 이 도구의 caller 표시가 다르게 동작할 수 있다는 것을
  알고 있었습니까?"
- "이 도구가 실제로 테스트를 실행한다고 생각했습니까?"

## 10. 통과·보류 기준 — 사용자 결과가 rollout 결정에 연결되는 지점

**사용자 결정(확정)**: augmentation은 **`v0.9.0`에서도 기본값 꺼짐으로 출하한다.** 이 절의
기준을 전부 통과해도 "augmentation을 기본값으로 켠다"로 자동 연결되지 않는다 - 그건 별도
결정이고, 이미 gate 3/7의 정확도·성능 기준의 몫이다. 이 절이 실제로 정하는 것은 **지금의 opt-in
+ 경고 문구 상태를 그대로 유지할지, adapter별로 opt-in을 거두거나(폐기) 문구를 더 강화할지**다.

**정성 통과 기준** (baseline 확정 전에도 적용, M2 §10과 같은 규칙):

- Part A의 모든 확인 항목이 PASS다. 하나라도 FAIL이면 §6-B 전체를 재시험 대상으로 보류한다.
- **B1에서 두 목록을 같은 신뢰 수준으로 읽은 참여자가 과반이면, 그 adapter의 opt-in을 유지하되
  `SKILL.md`/`cli-contract.md`의 candidate-caller 어휘 규칙을 재작업하고 재시험한다.**
- **B2에서 "전달됨=호출됨"으로 오해한 참여자가 과반이면 `dynamic-callback-static-v1`의 opt-in을
  유지하되 adapter의 message/action 문구를 재작업한다.**
- **B3에서 잡음으로 취급한 참여자가 과반이면 `augmentation_inference_unresolved`의 문구를
  재작업한다** - `catalog.ts`/`coverage.ts`의 message 자체가 대상이다.
- **B4에서 테스트 통과로 오해한 참여자가 1명이라도 있으면 즉시 보류하고 `testRule` UI 표현을
  재작업한다** - M2가 `provider_null_incoming_calls`에 적용한 것과 같은 0-tolerance 기준이되,
  근거는 더 강하다(reviewer 지적): B1~B3/B5는 "관계가 얼마나 확실한가"라는 **정도 문제**라
  문구 조정으로 교정 가능하지만, B4는 **"실행 안 함"을 "통과함"으로 읽는 범주 오류**다 - 안전
  신호 자체가 반전되므로 과반 기준을 적용할 수 없다.
- **B5 - 이 명세의 핵심 연결점**: 3단계(경계 문구 공개) 후에도 이해가 바뀌지 않은 참여자가
  과반이면, **`#106`의 문서 수정만으로는 불충분하다고 판단하고, gate 1 lane D가 별도 이슈로
  미룬 `edges`의 caller/reference 라벨 부정확 해결(필터링/라벨링/계약 변경)의 우선순위를
  올린다.** 문구 공개 후 과반이 이해를 바꿨다면 현재 문서 경로를 유지한다.
- **A5에서 체계적인 오탐 패턴(같은 원인으로 반복되는 잘못된 candidate)이 발견되면, B트랙 결과와
  무관하게 그 adapter의 rollout을 보류하고 원인 fixture를 추가한다.**
- 어떤 과업에서도 도구가 참여자 프로젝트를 자동으로 build·install·수정하지 않는다.
- 진행자 유도로 무효 처리된 세션 비율이 0이다.

**보류 기준**: 위 항목 중 하나라도 미달하면 **그 adapter만** 현재 상태(opt-in)를 유지하며 문구를
재작업한다. 다른 adapter의 판정에 영향을 주지 않는다. B4/B6처럼 안전 관련 오해(테스트 통과 오해,
분류 근거 불투명)는 코드가 아니라 **문구와 UI 표현**을 먼저 의심한다 - M2 §10과 같은 원칙이다.

## 11. Privacy와 동의

- 참여자 동의 없이는 어떤 기록도 수집하지 않는다. 동의 범위를 과업 시작 전에 문서로 확인한다.
- 참여자는 자기 실제 코드베이스를 쓴다(§6 A3/A4/A5/B5). 화면 기록·출력 수집 전에 사내 코드 공개
  가능 여부를 확인하고, 불가하면 함수명·경로를 가린 요약만 수집한다.
- B5의 실제 소스 코드 공개 단계는 참여자 본인 코드다 - 진행자가 아니라 참여자가 스스로 공개
  범위를 정한다.

## 12. 증거 형식

- 과업별 화면 기록 또는 터미널 로그(동의 범위 내), Part A는 명령 출력 JSON 원문.
- Plugin runner 조합에서는 에이전트 요약 원문 전체 - 참여자마다 문구가 다를 수 있어, 두 참여자가
  다른 결론에 도달했을 때 편차로 단정하기 전에 원문을 나란히 놓고 실제로 다른 문구를 봤는지부터
  확인한다(M1/M2 명세와 같은 규칙).
- 응답 JSON의 `limitationDetails`·`augmentedEdges`·`testRule`/`testRuleSuppressed` 전문.
- B5는 3단계 각각의 발화를 구분해서 기록한다(1단계 자유 서술 / 2단계 코드 공개 후 반응 / 3단계
  문구 공개 후 반응) - 합쳐 기록하면 §10의 핵심 지표(3단계 후 이해가 바뀐 비율)를 잃는다.

## 13. 실패 처리와 재시험

- 도구 결함이 확인되면 수정 후 **그 adapter/발견만** 재시험한다.
- 절차 결함(유도, B5 순서 오염)이 확인되면 §6을 고치고 해당 세션을 폐기한다.
- 한 adapter의 재시험이 다른 adapter나 B5의 일정을 막지 않는다.

## 14. 검토 체크리스트

- [ ] Part A와 Part B의 성격 구분("엔지니어링 확인" vs "사람의 이해도")이 §3/§6에서 명확한가,
  그리고 "Part A 전부 통과 = 사용자 검증 아님" 문장이 있는가.
- [ ] B1~B6이 자유 서술을 먼저 요구하고, 금지 단어 목록이 실제로 각 과업의 확인 문구와 충돌하지
  않는가(사후 질문은 자유 서술이 끝난 뒤에만 쓴다).
- [ ] B5의 3단계 순서(자유 서술 → 코드 공개 → 문구 공개)가 뒤바뀌지 않았는가, 그리고 §10이 이
  발견을 gate 1 lane D의 별도 이슈와 실제로 연결하는가.
- [ ] B4가 0-tolerance 기준으로 적혀 있는가(다수결이 아니라 1건).
- [ ] §10에 "augmentation 기본값 off는 사용자 결정으로 확정"과 "이 gate 통과가 기본값 on으로
  자동 연결되지 않는다"가 둘 다 명시됐는가.
- [ ] Part A의 각 과업이 실제로 복사·실행 가능한 명령과 기대 출력, 기록란을 갖췄는가(추상적
  서술로 남지 않았는가).
- [ ] adapter 간(fastapi-static-v1 vs dynamic-callback-static-v1) 결과가 서로의 판정에 안
  들어가는가.
- [ ] "발행 버전이 아니라 merge된 코드 기준" 문장이 있고, `v0.9.0` 발행 시점과의 우연한 일치를
  규칙처럼 적지 않았는가.
- [ ] Privacy 항목이 B5의 참여자 코드 공개 범위를 참여자 본인이 정하도록 했는가.
- [ ] 승격/보류 판정이 adapter별·발견별로 독립 기록되는가.
