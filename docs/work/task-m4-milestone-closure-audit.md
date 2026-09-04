# M4 마일스톤 종료 gate 대조

- 상태: 대조 완료, 기록 lane — 코드 변경 없음
- branch: `docs/m4-milestone-closure-audit`
- 선행: PR #72(stage 1)·#73(stage 2)·#75~#79(stage 3) merge 완료. `m2-closure` lane(PR #67, *"M2
  milestone closure processing: what's proven, what isn't"*)과 같은 성격의 작업.
- 요구사항: commander와 별도 reviewer가 **서로 안 보고 각각** M4 종료 gate 8개를 근거와 대조한 뒤
  교차 확인했다. 이 문서는 그 대조 결과를 저장소에 기록한다 — **이 lane은 기록만 한다. 어떤 코드도
  고치지 않는다.**

## 목적과 사용자 가치

**지금 M4의 실제 상태는 "stage 1~3이 순서대로 끝났으니 마일스톤도 거의 끝났다"로 오해되기 쉬운
상태다.** 마일스톤 자신의 5단계 계획 중 1~3단계(evidence 계약, adapter 구현, 정확도·성능 gate)가
실제로 산출물을 냈다는 것과, 마일스톤이 스스로 정한 **종료 gate 8개 중 실제로 닫힌 것은 1개**라는
것은 **다른 사실**이다. 이 문서가 그 둘을 나란히 적어, 다음에 이 lane을 이어받는 사람이 "stage
3까지 끝났다"를 "마일스톤이 끝났다"로 잘못 읽지 않게 한다.

이번 대조 자체가 새로운 결함 5건(서로 안 겹치는 발견)을 찾았다 — **코드가 없는 게 아니라, 코드가
하는 일과 계약이 요구하는 일 사이에 실측되지 않은 간극이 있다는 것**을 이 대조가 처음으로 실행/코드
읽기로 확인했다. 아래 "핵심 발견"에 정리한다.

## 핵심 발견

### "3/5 단계 완료"와 "gate 1/8 닫힘"을 나란히 적는다

- **마일스톤 5단계 계획 기준**: 1단계(evidence 계약·corpus, PR #72), 2단계(adapter 구현, PR #73),
  3단계(자동 정확도·성능 gate, PR #75~#79)가 각각 산출물을 냈다 — **3/5 단계가 실행됐다.**
- **마일스톤 종료 gate 8개 기준**: 아래 판정표대로 **1개만 닫혔다(gate 6, rollback).** 나머지
  7개는 열려 있거나 부분적으로만 열려 있다.
- 이 둘은 같은 숫자가 아니다. "단계가 진행됐다"는 "그 단계가 만들어야 할 gate 증거를 전부
  만들었다"를 뜻하지 않는다 — 특히 3단계 자신이 "LSP-only 비교, ambiguity, false-positive,
  latency와 rollback fixture를 통과한다"고 스스로 적어 뒀는데, 이번 대조가 그 문장이 가리키는
  gate들(3·4·5·7) 중 다수가 아직 안 닫혔다는 것을 찾았다.

### 대조 과정에서 나온 자기 오류 2건 — 그대로 기록한다

이 대조의 신뢰성은 "누가 어떻게 확인했는지"에 있다. commander가 스스로 낸 오판 2건을 감추지 않고
아래에 그대로 남긴다 — 다음 사람이 같은 방식으로 틀리지 않게 하기 위해서다.

1. **gate 3을 "닫힘 후보"로 잘못 판정**: commander의 초기 판정은 다른 세션이 전달한 보고
   (`[전달]`)에 의존했고, corpus를 직접 열거하지 않았다. reviewer가 실제로 fixture를 하나씩
   열거해서 **cross-file router-include의 양성(edge가 실제로 만들어지는) fixture가 없다**는 것을
   찾았다 — 있는 두 cross-file mount fixture(`attr_mount_*`, `alias_mount_*`)는 둘 다 자신의
   docstring에 "accepted miss"(false negative)라고 스스로 적어 둔 **실패 사례**이고, 유일한 양성
   fixture(`mounted_router.py`)는 router 정의와 mount 호출이 **같은 파일** 안에 있다(cross-file이
   아니다). 이 문서 작성 과정에서 세 fixture 파일을 직접 읽어 재확인했다(아래 gate 3 참고).
2. **`impact.ts`의 crash 가설이 틀림**: commander가 `runAugmentation()`의 실패 격리 공백을 조사하며
   구체적인 crash 경로(`rootLines[rootDefLine].length`가 배열 범위를 벗어나 예외를 던질 수 있는
   경우)를 의심했으나, 실제로는 `findRouteDecorator`가 그 지점에 도달하기 전에 먼저 `undefined`를
   반환해 그 코드 경로 자체가 지금은 도달 불가능하다는 것을 확인했다 — **그 구체적 crash 가설은
   틀렸다.** 다만 이것이 gate 4의 판정 자체를 뒤집지는 않는다: gate가 요구하는 것은 "이 특정 줄이
   안 던진다"가 아니라 "**보조 분석이 실패해도 기존 정적 그래프가 죽지 않는다**"이고, 이 문서
   작성 과정에서 `impact.ts`/`adapters/index.ts` 양쪽에 `runAugmentation()` 주변 try/catch가 전혀
   없다는 것을 직접 grep으로 재확인했다(아래 gate 1 참고) — 방어 자체가 없다는 사실은 특정 crash
   가설의 참/거짓과 무관하게 그대로 남는다.

## 판정표

| # | gate 문구(요약) | 판정 | 근거 요약 |
| --- | --- | --- | --- |
| 1 | IL-LIM-001·002·010 수용 기준 통과 | 열림 | 001·010 story 전체가 `Backlog`, 002는 gate C(runtime-only fixture) 공백 + `runtime-observation`/실패 격리 미충족 |
| 2 | JSON과 UI에서 확정/추론 구분 | 열림 | JSON은 됨(`augmentedEdges` 분리). UI(`src/`)는 `augmentedEdges` 참조 0건 |
| 3 | alias·sub-dependency·cross-file 대표 fixture가 candidate·ambiguity 재현 | 열림 | alias·sub-dependency는 양성 fixture 있음. **cross-file router-include 양성 fixture 없음** |
| 4 | 모호한 DI/dynamic target이 임의로 확정 caller 승격 안 됨 | 부분 열림 | 직접 참조(literal-name) 경로만 `resolutionCandidateCount`로 구분됨. **alias 검증 경로(`resolutionCandidateCount`가 무조건 1로 고정)와 enclosing(source) 경로(`items[0]` 무조건 채택) 둘 다 다중-후보 검사 없음** |
| 5 | path convention만으로 가짜 test passed 상태를 안 만듦 | 열림 | 모델엔 'passed' 상태 자체가 없어 "안 만든다"는 참이지만, **UI가 test 관련 node/edge에 VS Code의 test-passed 색 토큰을 그대로 씀** — 데이터와 화면이 다른 말을 함 |
| 6 | augmentation 끄면 안전하게 rollback | **닫힘** | PR #79의 OFF/ON 회귀 테스트 2건, reviewer가 격리 worktree에서 실행 재검증 |
| 7 | 정해진 false-positive·latency budget 통과 | 열림 | PR #77이 이미 "측정값·tripwire는 있지만 정해진 budget 없음"으로 기록 |
| 8 | user-test 명세 작성 + 결과/보류 사유가 rollout 결정에 연결 | 열림 | `docs/development-management/user-tests/m4-user-test-spec.md` 자체가 아직 없음(직접 확인) |

## Gate별 상세 — 근거와 확인 방법(누가, 실행인지 코드 읽기인지)

### Gate 1 — IL-LIM-001·002·010 수용 기준

- **IL-LIM-001·IL-LIM-010이 story 전체로 `Backlog`**: 두 파일 3번째 줄 `상태: Backlog` 직접 확인
  (이 문서 작성 세션, 코드/문서 읽기). 마일스톤 자신의 "단계별 계획" 2번이 이미 "test evidence
  adapter를 kill switch와 함께 구현한다"고 stage 2 범위에 포함시켜 뒀는데 실제로 만들어지지
  않았다 — Spring이 "M3 이후"로 막연히 떠 있다가 정정된 것과 같은 형태의 계획 공백(commander
  발견, 이 세션이 `il-lim-010-test-impact-discovery.md` 상태 필드로 재확인).
- **IL-LIM-002 수용 기준 "단일 후보, 복수 후보와 runtime-only binding이 확정·후보·미지원 관계로
  구분된다"의 runtime-only binding 부분**: PR #79에서 이미 정정·기록(gate C) — DI 후보를 정적으로
  단 하나도 나열할 수 없는 경우(profile/programmatic registration/proxy-AOP)를 재현하는 fixture가
  이 저장소에 없다. `fastapi-static-v1`에 runtime-only 전용 코드 경로·limitation이 없다는 것과
  `dynamic_mount_router.py`가 mount 시나리오이지 DI 열거 불가 시나리오가 아니라는 것을 이 세션이
  직접 코드/fixture 읽기로 재확인.
- **IL-LIM-001 수용 기준 "정적, 추론, 외부 관측 관계가 구별된다"의 외부 관측(`runtime-observation`)
  부분**: commander 발견, 이 세션이 `grep -rn "runtime-observation" cli/src`로 재확인 —
  `AUGMENTED_EDGE_SOURCES = ['static-inference', 'runtime-observation']`(`types.ts:407`) 선언
  한 줄뿐, 이 값을 실제로 만들어 내는 producer도 이 값을 검증하는 테스트도 0건.
- **IL-LIM-001 수용 기준 "보조 분석 실패가 기존 정적 그래프를 실패시키지 않는다"**: commander 발견
  (crash 가설은 위 "핵심 발견"에서 정정), 이 세션이 `grep -n "try\|catch"`로 재확인 —
  `impact.ts`의 `await runAugmentation(...)` 호출(line 96)과 `adapters/index.ts`의
  `adapter.run(...)` 호출 둘 다 try/catch로 감싸여 있지 않다. `AdapterInput`/`FrameworkAdapter`
  SPI 주석이 "두 번째 adapter"를 이미 전제하는 상황에서, 향후 추가되는 adapter 하나가 예외를 던지면
  정적 traversal이 이미 만들어 둔 `nodes`/`edges`까지 포함해 요청 전체가 실패한다 — 지금 이 순간
  fastapi-static-v1가 도달 가능한 throw 경로를 찾았다는 뜻은 아니다(찾지 못했다, 그리고 안 찾았다는
  것과 없다는 것은 다르다).

### Gate 2 — JSON과 UI 구분

- **JSON**: `data.edges`/`data.augmentedEdges` 분리, `resolution`/`evidenceSource` 필드, "candidate
  caller" 어휘가 response-policy eval로 고정됨(stage 3 단계 1) — 이미 닫힌 부분.
- **UI**: commander 발견, 이 세션이 `git grep -l "augmentedEdges" -- 'src/*'` 재실행으로 재확인 —
  0건. VS Code Extension(`src/`)이 `augmentedEdges`를 한 번도 참조하지 않는다. stage 2 요구사항이
  "UI/Extension 표현"을 범위 밖에 뒀지만 어느 stage가 이어받는지는 적히지 않았다 — stage 3도
  안 이어받았다(stage 3 work document에 "M4 gate A"로 이미 기록).

### Gate 3 — alias·sub-dependency·cross-file 대표 fixture

- **alias**: 양성(`alias_target.py` 등, stage 2) + 음성(`alias_uncaught_consumer.py`, stage 2) 둘
  다 있음 — 닫힘.
- **sub-dependency**: 양성(`nested_dependency_config/db/consumer.py`, PR #79에서 실측 확인) 있음 —
  닫힘.
- **cross-file dependency**(`Depends()` 참조가 정의 파일과 다른 파일에 있는 경우)는 양성 있음
  (`consumer.py`/`real_module.py`, stage 2 corpus case 1) — 닫힘.
- **cross-file router-include**는 **양성 fixture가 없다.** 이 문서 작성 중 직접 재확인(파일 읽기):
  - `mounted_router.py`(유일한 양성) — router 정의(`mounted_router = APIRouter()`)와 mount 호출
    (`mounted_app.include_router(mounted_router)`)이 **같은 파일**.
  - `attr_mount_router.py`/`attr_mount_app.py`(cross-file, module-attribute mount) — 자신의
    docstring이 "accepted miss (false negative)"라고 명시, `augmentedEdges: []`가 기대값.
  - `alias_mount_router.py`/`alias_mount_app.py`(cross-file, alias mount) — 마찬가지로 "accepted
    miss", `augmentedEdges: []`가 기대값.
  - `IL-LIM-002`의 테스트 계획 표가 cross-file 항목의 통과 기준으로 **"실제 symbol ID로 연결되고
    이동 가능"**(성공한 연결)을 요구하는데, 그 경로를 성공시키는 fixture가 없다.
  - `isRouterMounted()`는 워크스페이스 전체를 텍스트로 훑는 구조라, **bare identifier로 cross-file
    mount하는 경우 코드상 이미 성공할 것으로 보인다** — 다만 이걸 확인하는 fixture가 없어서
    "될 것 같다"이지 "된다"가 아니다. 이 lane이 반복 경고해 온 "fixture 없는 코드 경로" 모양
    그대로다.

### Gate 4 — 임의 승격 금지

**"target 쪽엔 임의 승격이 없다"고 넓게 적으면 안 된다** — target 쪽에도 경로가 둘 있고, 그중
하나(alias 검증 경로)엔 방어가 없다. 정확한 문장: **직접 참조(literal-name) 경로에는 다중-후보
방어가 있고, alias 검증 경로와 source(enclosing function) 경로 둘 다에는 없다.**

- **target, 직접 참조(literal-name) 경로**: `resolved.items.length`를 `resolutionCandidateCount`로
  저장해 `resolution: 'multiple'`/`'single'`을 구분 — 임의 승격 없음(`fastapiDependencyAdapter.ts`
  502-512행).
- **target, alias 검증 경로** — 리뷰어 발견, 이 세션이 `fastapiDependencyAdapter.ts:478-481`을
  직접 읽어 재확인:
  ```ts
  const verified = await resolveEndpoint(input, file, { line: binding.line, character: binding.character });
  if (verified.items.some(item => symbolId(item) === input.rootId)) {
    localNames.push(binding.alias);
  }
  ```
  `.some()`은 **root가 후보 중에 있는지**만 본다 — `verified.items.length`(후보가 몇 개인지)는
  안 본다. 이 alias가 검증되면 하류에서 `isVerifiedAlias`가 참이 되어 `resolutionCandidateCount`가
  **무조건 1로 고정**된다(500행: `let resolutionCandidateCount = 1;`, 501-513행:
  `if (!isVerifiedAlias) { ... }` 블록 안에서만 재계산되므로 alias 경로는 절대 안 들어감).
  **import line이 실제로 복수 후보로 resolve되고 그중
  하나가 root여도, 만들어지는 edge는 무조건 `resolution: 'single'`이다** — source 쪽과 같은 모양의
  임의 승격이다.
- **source(= enclosing function, candidate edge의 caller) 쪽**: commander 발견, 이 세션이
  `fastapiDependencyAdapter.ts:514-522`를 직접 읽어 재확인 —
  ```
  const enclosingResolved = await resolveEndpoint(input, file, { line: enclosing.line, character: enclosing.character });
  if (enclosingResolved.items.length === 0) {
    continue;
  }
  const { id: sourceId, endpoint: sourceEndpoint } = endpointFor(input, enclosingResolved.items[0]);
  ```
  `length === 0`(못 찾음) 검사만 있고 **`length > 1`(여러 후보) 검사가 없다** — enclosing 함수
  이름이 provider 쪽에서 여러 후보로 resolve되는 경우, 그중 `items[0]`을 무조건 caller로 확정해
  edge를 만든다. target 쪽엔 있는 다중-후보 구분이 source 쪽엔 없는 **비대칭**이다.

### Gate 5 — path convention으로 가짜 test passed를 안 만듦

두 사실을 **둘 다** 적는다 — 합치면 "공허하게 참"이 아니라 한쪽에서 위반이다.

1. **모델에는 'passed' 상태가 없다**: commander 발견, 이 세션이 `types.ts:6`
   (`TestFreshness = 'notRun' | 'outdated'`) 재확인. "만들지 않는다"가 방어 로직 때문이 아니라
   **표현 수단 자체가 없어서** 참이다.
2. **그런데 UI가 'test passed' 색을 쓴다**: commander 발견, reviewer 확인, 이 세션이
   `src/graphPanel.ts`를 직접 읽어 재확인 — line 275(`.edge-test`), 283(`.node.test rect`),
   295(`.node.test .relation-marker`), 301(`.node.test .node-relation`),
   307(`.legend .test::before`) **다섯 곳 모두** `--vscode-testing-iconPassed`(VS Code의 "테스트
   통과" 아이콘 색)를 쓴다. 대조군인 `direct`/`transitive` relation은 중립적인
   `--vscode-charts-blue`/`--vscode-charts-purple`를 쓰는데, `test`만 이 특정 토큰이다.

**합친 결론**: Impact Lens는 테스트를 실행하지 않고, 데이터 모델도 '통과'를 표현할 수 없게 의도적으로
설계돼 있다. 그런데 화면은 "test 관계로 분류된 node/edge"에 초록색 통과 아이콘을 씌워, 모델이
의도적으로 거부한 주장을 색으로 하고 있다.

### Gate 6 — rollback (닫힘)

PR #79(`885246e`, comment fix `9927593`)의 OFF 상태 테스트(요청에 `augmentationEnabled` 생략 vs
명시적 `false`)와 ON 상태 테스트(찾았을 때도 보호 필드 불변)로 고정. reviewer가 격리 worktree에서
직접 실행해 재검증했고 새 결함을 못 찾았다 — 유일하게 완전히 닫힌 gate.

### Gate 7 — 정해진 false-positive·latency budget

PR #77(`8c4c436`)이 이미 기록: on/off 비용은 측정됐고(worst case 200개 파일 기준 +41ms) 회귀
tripwire(5000ms)도 있지만, "얼마나 느려지면 too slow인가"에 대한 **정해진 budget 자체가 없다** —
그 판단은 이 lane이 아니라 기본값 on 전환 시점에 나올 값일 수 있다고 이미 명시.

### Gate 8 — user-test 명세

`docs/development-management/user-tests/` 디렉터리에 `m0`/`m1`/`m2` 명세는 있지만
`m4-user-test-spec.md`는 없다(이 문서 작성 중 `ls`로 직접 확인). 마일스톤 4단계("사용자 테스트
명세 제안")조차 아직 시작되지 않았다.

## 값싼 수정 후보 vs lane 하나 분량 — 구분만 하고 고치지 않는다

**이 lane은 아무것도 고치지 않는다.** 아래는 다음 lane이 우선순위를 정할 때 참고할 분류다.

- **값싼 수정으로 보이는 것** (각각 별도 판단·검증 필요, 지금 손대지 않음):
  - Gate 4: 두 지점을 **같이** 봐야 완전하다 — 하나만 고치면 나머지 하나가 여전히 gate를 어긴다.
    (a) `enclosingResolved.items.length > 1`일 때 `resolution: 'multiple'`로 표시하거나 edge를 안
    만들도록 분기 추가(직접 참조 경로에 이미 있는 패턴을 source 쪽에 대칭 적용하는 정도로 보인다).
    (b) alias 검증 경로도 `verified.items.length`를 반영하도록 `resolutionCandidateCount`를 무조건
    1로 고정하지 않게 고친다. 둘 다 fixture로 이 경로를 실제로 트리거할 수 있는지는 별도 확인이
    필요하다(gate 3의 "코드상 될 것 같다"와 같은 함정).
  - Gate 1(실패 격리): `runAugmentation()` 호출을 try/catch로 감싸고 실패를 limitation으로
    격리 — 다만 "무엇을 실패로 볼지"(timeout? 특정 에러 타입만? 전체 catch?)는 설계 판단이
    필요하다.
- **UI 변경이라 Extension 동작 확인이 필요한 것** (토큰 하나를 바꾸는 게 아니라 실제로 어떻게
  보이는지 확인해야 하는 lane):
  - Gate 5: `.node.test`/`.edge-test`/`.legend .test`의 색 토큰 변경. 값싸 보이지만 **Extension이
    실제로 렌더링하는 화면을 봐야** 무엇으로 바꿀지(중립색? 별도 토큰? 툴팁으로 설명만 추가?)
    판단할 수 있다 — "코드 한 줄"이 아니라 UX 판단이 딸린 변경이다.
- **story 하나 분량(별도 stage/lane 필요)**:
  - Gate 1: `IL-LIM-010`(테스트 탐지) 전체 — 통째로 미착수.
  - Gate 2: UI 구분 — Extension 쪽에 `augmentedEdges`를 아예 새로 연결해야 한다(그래프 렌더링,
    필터, legend 전부 영향).
  - Gate 8: user-test 명세 작성 자체(마일스톤 4단계).
- **fixture만 있으면 되는 것(구현 확인 없이 fixture 하나로 닫힐 가능성)**:
  - Gate 3: cross-file bare-identifier router-include 양성 fixture. 코드는 이미 될 것 같다는
    것까지만 확인됐다 — fixture로 직접 실행해 확인하는 것이 다음 단계다.
- **정의(무엇이 "정해진"인지)가 필요한 것, 코드 문제 아님**:
  - Gate 7: latency budget 값 자체.

## 패턴 — 주석이 주장하는 보장과 코드가 실제로 하는 일이 어긋난 사례 3건

**주석이 주장하는 보장과 코드가 실제로 하는 일이 어긋난 사례가 이 마일스톤에서 3건 나왔고, 셋 다
읽기가 아니라 실행·대조로 발견됐다.** 다음 사람이 이 저장소의 주석을 근거로 삼기 전에 알아야 할
사실이라 여기 남긴다(이 lane은 이 주석들을 고치지 않는다 — 기록만 한다):

1. **throw 방어 주석**(PR #79, `fastapiDependencyAdapterMultipleCandidate.test.ts`): "스크립트를
   넘는 호출은 throw해서 테스트가 시끄럽게 실패한다"고 적혀 있었지만, `resolveEndpoint()`가 모든
   `prepare()` 예외를 `{items: []}`로 바꿔 삼켰다 — throw는 실제로 아무 일도 안 했다. 리뷰어가
   mutation(throw를 `return []`로 바꿔도 바이트 단위로 같은 실패 메시지)으로 발견.
2. **`capabilities` 중복 주석**(PR #79, `stripAugmentationVariableFields`): "envelope가
   `capabilities`/`limitations`/`timings`를 root와 `data` 양쪽에 같은 이름으로 갖는다"고 적혀
   있었지만, `data.capabilities`는 존재하지 않는다 — data 쪽 대응 필드는 이름이 다른
   `data.provider`다. 리뷰어가 실제 CLI 응답을 떠서 키를 대조해 발견.
3. **alias ambiguity 주석**(이번 대조, `fastapiDependencyAdapter.ts:537`): "alias 참조는 항상
   `single`이다 — ambiguity가 있었다면 import-line 검증 단계에서 이미 해소됐다"고 적혀 있지만,
   **멤버십 확인(root가 후보 중에 있는가)과 해소(후보가 하나로 좁혀졌는가)는 다른 진술**이다 —
   위 gate 4 참고. 리뷰어가 코드 대조로 발견, commander가 초기 판정에서 놓침.

**세 번이면 우연이 아니다.** 이 저장소의 주석은 코드가 보장하기를 **의도한 것**을 적는 경향이
있고, 세 번 다 그 보장이 실제로는 코드에 없었다.

## 이 lane이 하지 않는 것

- 위 어떤 것도 고치지 않는다.
- 8개 gate 중 어느 것을 지금 닫을지 우선순위를 정하지 않는다 — 그건 다음 lane 배정의 몫이다.
- 마일스톤 상태 필드를 갱신하지 않는다 — M2 closure lane의 전례(story 상태는 안 건드리고 마일스톤
  상태만, 그것도 "완료"가 아니라 무엇이 남았는지 읽히는 값으로)를 따를지는 commander 판단.
