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

**이후 갱신(이 표는 대조 시점 스냅샷 — 갱신하지 않고 그대로 둔다):** gate 3·4는 PR #81
(`docs/work/task-m4-gate3-gate4-closure.md`)이 이 문서가 찾은 공백을 닫았고, 이후 M4 stage 3
사후 감사가 gate 4의 **세 번째 지점**(mount 확인 — 이 문서도 PR #81도 다루지 않은 경로)에서 새
오탐을 찾아 2026-09-07 재개방했다(`docs/work/task-m4-gate4-mount-false-positive.md`). 사용자
결정으로 잔여 gap(cross-package basename 충돌) 수정을 이어갔으나(`docs/work/task-m4-gate4-
module-resolution.md`), **commander 독립 검증이 그 lane 자체의 self-mount 근거에 또 다른 반례
(nested scope shadowing)를 찾아 gate 4는 여전히 열려 있었다.** 수정 후 commander/reviewer 병렬
검토가 세 번째 라운드에서 **역방향 alias**와 **주석 안 `FastAPI()` 언급이 mount 검사 전체를
건너뛰는 문제**를 추가로 발견·수정(PR #85 merge, `fe5b0d0`) — 그 시점엔 **gate 4는 계속 열려
있었다, reviewer 재검토·사용자 결정 대기.**

**2026-09-08 추가 — gate 4 주된 잔여 수정, 닫힘 판정, 판정문 정정.** PR #85 merge 뒤 reviewer가
완전성 논증을 stub-provider mutation으로 재검증하는 과정에서 주된 잔여(segment 하나짜리 절대
import가 depth 무관 basename 매치로 퇴화)를 지적했고, 사용자가 "한 라운드 더"를 결정했다
(`docs/work/task-m4-gate4-single-segment-import.md`). 이 lane이 그 잔여를 닫았고, commander의
명시적 지시("이번엔 판정까지 하세요")에 따라 이 세션이 **"알려진 오탐 경로 0"으로 닫힘 판정**했다.
**곧바로 commander가 직접 측정해 정정을 요구했다** — 다중 segment 절대 import가 여전히 같은
dotted-path suffix로 끝나는 두 파일(vendored 사본 등)을 못 가르는 잔여가 살아 있었고, 그 함수
자신의 doc comment가 이미 그 시나리오를 언급하고 있었는데 판정문이 이를 반영하지 못했다. 재현
확인 후(`[실행]`, 유닛 테스트로 고정) **판정문을 "수용된 잔여 1건을 안고 gate 4를 닫는다"로
정정**했다 — 근거는 위 문서의 "gate 4 판정" 절.

gate 5는 PR #82가 닫았다. gate 6은 이 표 그대로 닫힘 유지. gate 7은 아래 "Gate 7" 절에 정정 추가.

**2026-09-08 추가 — gate 2(JSON과 UI 구분) 판정.** JSON 쪽은 stage 3에서 이미 닫혀 있었다
(`data.edges`/`data.augmentedEdges` 분리, response-policy eval). UI 쪽(이 gate가 못 닫힌 유일한
이유, 아래 "Gate 2" 절)을 PR #87(adapter 공유 추출) → #88(wiring) → #89(실제 렌더링)로 닫았다.
`reviewer`가 새 CSS 규칙의 뮤테이션 재현과 클라이언트 스크립트 순수 함수의 직접 실행까지 독립
확인했다. 근거·검증 범위(무엇이 검증됐고 무엇은 안 됐는지)는 `docs/work/task-m4-gate2-shared-
adapter.md`의 "gate 2 판정" 절 — 실제 VS Code webview 렌더, marker 시각 구별, 라벨 겹침, 실행
기반 off/on 비교는 이 저장소에 vscode-host harness가 없어 미검증으로 명시했다.

**2026-09-08 기준: 8개 중 닫힘 5(rollback·gate 2·gate 3·gate 4·gate 5, gate 4는 수용된 잔여 1건을
안고 닫힘, gate 2는 위 미검증 범위를 안고 닫힘), 열림 3(gate 1·7·8).** gate 2(PR #87·#88·#89,
마지막 `0e1794c`)·gate 4(PR #86, `19b525e`) 전부 merge 완료, `reviewer` 재검토도 거쳐 최종이다.

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

> **2026-09-09 추가 — 위 네 항목 중 마지막(실패 격리) 항목만 닫혔다, gate 1 전체는 여전히 열림.**
> `fix/m4-augmentation-failure-isolation`(docs/work/task-m4-augmentation-failure-isolation.md)이
> `runAugmentation()` 자신의 loop 안에 adapter별 blanket try/catch를(한 adapter의 throw가 다른
> adapter의 결과나 이미 계산된 정적 그래프에 번지지 않도록), 그리고 두 host의
> `await runAugmentation(...)` 호출 자체에도 바깥 catch를(orchestration 자체의 버그를 별도
> `augmentation_internal_error`로 구분해) 추가했다 — `augmentationFailureIsolation.test.ts`의
> 뮤테이션 검증(catch를 제거하면 정확히 의도한 테스트만 실패, 원복 후 재확인)으로 실행 검증했다.
> **하지만 이 위 네 항목 중 나머지 둘("IL-LIM-001·010이 story 전체로 Backlog", "runtime-observation
> 값을 실제로 만드는 producer가 없다")은 이 PR이 손대지 않았다** — 그래서 판정표의 gate 1은
> 여전히 **열림**으로 남는다(위 세 항목 중 하나가 닫혔다고 gate 전체를 닫힘으로 바꾸지 않는다,
> gate 4가 "수용된 잔여 1건을 안고 닫힘"이라고 정확히 구분해 적은 것과 같은 이유). 이 PR의
> 커밋/PR 본문에는 "gate 1의 실패 격리 항목을 닫는다"로 정확히 인용한다 — "gate 1을 닫는다"라고
> 쓰면 이 문서와 어긋난다.

> **2026-09-09 추가 2 — `IL-LIM-002` 5단계(Spring adapter)는 M4 자신의 범위 안에서 아예 시작할
> 수 없다는 사실을, 지금까지 이 문서·`IL-LIM-002` 문서 모두 각주로만 흩어 놓았다.** 위 네 항목
> (Backlog·gate C·runtime-observation·실패 격리)은 전부 "M4가 만든 것이 계약을 완전히 못
> 채운다"는 gap이다 — 이건 종류가 다르다: `IL-LIM-002`의 5단계는 Java/Kotlin 언어 지원
> (`IL-LIM-018`/`IL-LIM-016`, 둘 다 M3 소유)이 없으면 분석할 provider 자체가 없어서, **M4가
> 아무리 노력해도 이 단계는 M4 안에서 실행 불가능하다.** `il-lim-002-framework-di-routing.md`의
> 2026-09-03 추가가 이미 이 사실 자체는 정확히 적어 뒀지만, 그 문서 안에서만 적혀 있어서 M4를
> 형식적으로 닫는 사람이 `IL-LIM-002` 문서를 따로 열어 읽지 않으면 "M4가 자기 story의 한 단계를
> 이월한 채로 닫는다"는 것을 모를 수 있다(`docs/work/task-m3-java-kotlin-spring-planning-
> refinement.md`, commander 지시로 이 lane이 짚음). **M4를 형식적으로 닫을 때(milestone 상태를
> `Planned`에서 바꿀 때) 아래를 gate 판정과 별개로 명시한다**:
>
> - **시작(착수) 가능 조건**: `IL-LIM-018` **또는** `IL-LIM-016` 중 하나가 닫히는 것. 재개 범위는
>   **닫힌 그 언어로 한정된다** — 예를 들어 Java만 닫히면 Java/Spring 조합만 시작 가능하고, Kotlin
>   조합은 `IL-LIM-016`이 닫힐 때까지 이월 상태를 유지한다.
> - **완결 조건**: `IL-LIM-002`가 지원한다고 주장하는 언어(Java, Kotlin) 전부가 검증된 provider를
>   가질 때 — 즉 `IL-LIM-018`과 `IL-LIM-016` **둘 다** 닫힌 뒤. 이 둘을 하나의 "재개 조건"으로
>   뭉치면 "언어 하나로는 아무것도 시작 못 한다"거나 "하나만 닫혀도 5단계가 끝난다"는 잘못된
>   양극단 중 하나로 읽힌다 — 그래서 나눠 적는다.

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

**이후 갱신 — 위 두 결함은 PR #81(`cb8d1de`/`1147f19`)에서 닫혔다.** 이 절 자체는 고쳐 쓰지
않는다 — 대조 시점(`4c63936` 무렵)엔 정확한 기록이었다. `cb8d1de`("M4 gate 4 (1/2): fix the alias
path's silent single-candidate collapse")가 alias 검증 경로를, `1147f19`("M4 gate 4 (2/2): source
path no longer arbitrarily promotes a candidate")가 source 경로를 각각 고쳤다 — 지금
`fastapiDependencyAdapter.ts`를 직접 읽으면(`[실행]`) alias 경로는 `resolutionCandidateCount =
aliasCandidateCounts.get(reference.name)!`로 실제 후보 수를 반영하고, source 경로는
`if (enclosingResolved.items.length > 1) { ... }` 분기로 다중 후보를 확정 edge로 승격하지 않는다.

**같은 갱신에서 인용도 고친다 — 줄 번호가 밀려 자기 인용이 깨졌다.** 위 "500행: `let
resolutionCandidateCount = 1;`"과 "514-522행"은 지금 그 줄에 없다(현재 그 줄들엔 각각
`nameAmbiguous` 관련 예시 주석과 `mountFound`에 대한 무관한 서술이 있다 - `reviewer`가 지적, 이
세션이 재확인). 이 문서 자신을 포함해 M4 작업 문서들이 이미 세운 규칙("줄 번호가 아니라 원문으로
인용한다 - 정정 삽입이 줄 번호를 밀어서 자기 인용이 깨진 적이 있어서", `task-m4-stage3-accuracy-
latency-gates.md` 참고)이 경고한 바로 그 실패가 이 문서 자신에서 일어났다 - 그 규칙이 옳았다는
증거로 기록해 둔다. 위 인용을 줄 번호 대신 원문으로 다시 남긴다:

- alias 검증 경로(당시 무조건 1로 고정됐던 지점): `let resolutionCandidateCount = 1;`
- source 경로(당시 다중-후보 검사가 없었던 지점): `const enclosingResolved = await
  resolveEndpoint(input, file, { line: enclosing.line, character: enclosing.character });` 뒤에
  `length === 0` 검사만 있고 `length > 1` 검사 없이 `enclosingResolved.items[0]`을 바로 채택하던
  형태.

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

**2026-09-07 추가 — precision "19개 쿼리 오탐 0건"의 의미가 좁아졌다.** M4 stage 3 사후 감사가 찾은
mount 오탐(gate 4 재개방 원인, `docs/work/task-m4-gate4-mount-false-positive.md`)은 이 19개 판정
가능 쿼리의 corpus 안에 있는 형태가 아니었다 — **숫자 자체(19개 중 0건)는 다시 세어봐도 정확히
재현된다.** 다만 그 숫자가 "이 기능이 낼 수 있는 오탐을 전부 헤아렸다"는 뜻은 아니었다는 게
드러났다: 오탐 경로 하나가 이 ledger(측정 corpus)에 아예 없었다. 숫자를 지우지 않는다 — 측정의
**의미 범위**가 이 corpus가 실제로 담은 shape으로 한정된다는 것만 명시한다.

**2026-09-07 추가 2 — corpus 크기 자체도 그 뒤 네 번 더 자랐다.** `docs/work/task-m4-gate4-module-
resolution.md` 재측정: PR #84가 추가한 adversarial fixture 6개가 이 19개 집계에 반영된 적이 없었고
(발행 시점 25개여야 했다), module-resolution lane이 이름 충돌 self-mount 3건의 판정을 뒤집고
cross-package fixture 4개를 더했으며(round 1), nested scope shadowing 수정이 fixture 2개(round
2), 역방향 alias·주석-안-`FastAPI()` 수정이 fixture 3개(round 3, commander/reviewer 병렬 검토)를
더해 **34개(진양성 12/진음성 22), precision 100%(오탐 0건) 그대로**였다. **2026-09-08 정정 —
분모에 포함 기준이 없어 34도 틀렸다.** commander가 `crossfile_positive_router.py`(gate 3 재현
fixture)가 이 집계에 빠져 있음을 지적했고, "뺀 이유를 적자"가 아니라 포함 기준 자체를 기계적으로
정의하라고 요청했다. 정의한 기준(`pythonFastapiIntegration.test.ts`에서 `augmentedEdges.length`를
정확히 0 또는 1로 단언하는 것이 주된 목적인 모든 테스트, "known false negative" 명명 테스트 제외 —
전문은 `docs/work/task-m4-stage3-accuracy-latency-gates.md`의 "2026-09-08 정정 5")를 파일 전체에
적용해 재세니 `crossfile_positive_router.py` 외에 아무도 지적하지 않은 두 번째 누락
(`nested_dependency_config.py`의 sub-dependency 회귀 테스트)까지 나와 **36개(진양성 14/진음성
22), precision 100%(오탐 0건) 그대로**였다. **2026-09-08 추가 3 — gate 4 마지막 잔여 수정으로
fixture 2개가 같은 기준에 편입돼 현재 38개(진양성 15/진음성 23), precision 100% 그대로**다(정정
6, `task-m4-stage3-accuracy-latency-gates.md`). 위 "의미 범위가 한정된다"는 지적은 여전히
유효하다 — corpus가 커진 것과 corpus가 실제 코드베이스를 대표하게 된 것은 다른 이야기다.

**2026-09-09 추가 — gate 7의 budget 산출물이 실행으로 채워졌고, 그 과정에서 실제 오탐 경로가
드러나 고쳐졌다(PR #99·#100).** 전체 기록은 `docs/work/task-m4-gate7-budget-and-real-code-
measurement.md` §3·§4-이후·5절. 요약:

- **latency budget 확정**: `max(400ms, 0.25 × static traversal latency)`. 절대 허용치 400ms는
  두 실제 프로젝트에서 관측한 worst-case(717파일 전체 스캔, +181ms)의 2배.
- **false-positive budget 확정**: "구성이 명시된 corpus(TS fixture 18 + Python fixture 38+PR
  #100의 신규 4 + 오늘 새로 실측한 실제 코드 참조 27)에서 0건, 발견 즉시 재개방" — 오늘 재측정
  기준 실제 코드 참조 27개 전체에서 실제로 0건(Python fixture의 정확한 새 합계는 감사 기준
  재적용이 아직 안 됐다 — gate7 문서 §4-이후 참고).
- **`maxFiles: 200`이 실제 프로젝트(Netflix/dispatch, 717개 `.py` 파일)의 39% 지점에서 이미
  못 미친다는 것을 실측으로 확인했다** — 비용이 아니라(717파일 전체 스캔도 worst-case +181ms)
  숫자 자체가 작게 골라진 문제. 이 lane은 `maxFiles: 2000` 상향을 권고했지만 **프로덕션 코드는
  바꾸지 않았다**(측정 전용 override, 어느 branch에도 커밋 안 됨) — 별도 lane의 몫.
- **이 lane의 최종 판단: "아직 기본값 on을 권하지 않는다."** 정확도 결함(gate 7이 찾은 것)은
  닫혔지만, `maxFiles`가 실제 규모 프로젝트에서 답 자체를 못 내는 가용성 결함은 진단만 되고
  안 고쳐졌고, extension host latency는 여전히 한 번도 안 쟀다(4절, 1단계 harness 미착수).
  **gate 7은 "정해진 budget"이라는 뜻으로는 닫혔지만("정의가 필요한 것" 항목, 아래 348행 —
  이제 정의됐다), "기본값 on 전환 판단"이라는 이 gate의 진짜 목적으로는 아직 열려 있다** —
  `maxFiles` 조정 lane과 extension host 1단계 harness가 남은 선행 조건이다.

**2026-09-09 정정(gate 7 lane, commander 2차 반박 반영) — 위 세 줄을 지우지 않고 정정한다**:

1. **"`max(400ms, ...)`"와 "`maxFiles: 2000` 상향"은 서로 모순이었다** — 717파일 worst
   case가 181ms이고 거의 선형이면 1600파일 근처에서 이미 400ms에 닿는데, 2000은 그 budget을
   넘는 작업을 허용한다. **`maxFiles`는 이제 latency budget에서 유도한다**(공식:
   `maxFiles = budget ÷ 파일당 비용`, 파일당 비용은 오늘 실측한 0.253ms/file) — **1500(잠정)**
   으로 정정. 자세한 유도는 gate7 문서 §4-이후.
2. **"절대 허용치 400ms = 오늘 worst-case의 2배"는 그 자체로 사용자 쪽 근거가 아니다** — 오늘
   측정에서 역산한 임시값일 뿐이다. **400ms는 이제 명시적으로 "잠정, extension host 측정
   전에는 확정 아님"으로 표시한다** — 확정치가 아니라 25%(비율)와 같은 "검증도 반박도 못 한
   임시값" 취급이다.
3. **위음성 0은 recall이 적용되는 형태(파라미터 + route decorator, 12개)에 한정된 말이었다**
   — module-level 별칭(5)과 이번에 새로 이름 붙인 router/`include_router`-level
   `dependencies=[]`(3), 합 8개는 **기각이 안전(오탐 없음)해졌을 뿐 여전히 위음성으로 알려진
   상태**다. `il-lim-002-framework-di-routing.md`의 "미해결 질문"에 다섯 번째 능력-공백
   항목으로 기록했다. **(2026-09-09 3차 정정) "recall이 적용되는 형태 안에서 100%"만 적는
   것도 같은 함정의 한 단계 위였다** — 사용자는 어떤 형태가 겨냥 대상인지 모른 채 자기 코드의
   `Depends()` 참조 목록을 본다. **실제 참조 20개 전체 기준으로는 12/20(60%)** — 이 숫자를
   반드시 같이 적는다.
4. **(2026-09-09 3차 정정) 기각이 완전히 조용하다 — limitation이 없다.**
   `classifyDependsReferenceContext`가 `reject`를 반환하면 호출부는 그냥 `continue`한다 —
   아무 limitation도 안 남는다. **실제 참조의 40%(20개 중 8개)가 사용자에게 아무 신호 없이
   버려진다** — 짧아진 결과 목록을 보고 그게 전부라고 읽을 수밖에 없다. 이 저장소엔 정확히
   이 문제를 위한 선례가 있다(`framework_route_mount_unresolved` — "route는 찾았는데 mount를
   확인 못 했다"를 조용히 안 버리려고 만든 코드) — 여기도 같은 모양이다. **이 lane은 이
   limitation 코드를 추가하지 않는다**(코드 변경이라 이 PR과 분리 — "코드와 판단이 섞이면
   리뷰가 둘 다 흐려진다"는 이 milestone의 기존 원칙 그대로) — 대신 "아직 기본값 on을 권하지
   않는다"는 판단의 **네 번째 근거**로 추가한다: 지원 안 되는 형태가 조용히 버려진다는 것
   자체가, 이미 적힌 세 근거(가용성 결함·extension host 미측정·corpus 프로젝트 둘)보다
   사용자에게 더 직접적이다. 별도 lane에서 `framework_depends_form_unsupported`류 limitation
   코드 추가와 `LIMITATION_SURFACE_PATTERNS` 등록(#97이 쓴 절차 그대로: 등록 전 오탐 재현 →
   등록 → 재검증)을 진행한다.

**gate 7의 최종 판단("아직 기본값 on을 권하지 않는다")은 이 정정으로 안 바뀐다 — 오히려 근거가
넷으로 늘었다.** 바뀐 건 budget 숫자 두 개의 확정도, recall 숫자의 범위 표시, 그리고 "조용한
기각" 자체가 새 근거로 추가된 것이다.

**2026-09-09 4차 정정(reviewer가 실행으로 잡은 산수 오류, PR #102가 가용성 결함을 닫음)** — 위
세 블록을 지우지 않고 정정한다:

1. **template 프로젝트의 `Depends()` 참조는 6개가 아니라 7개다.** `get_current_active_superuser`
   (6곳)를 셀 때 `get_db`(1곳, `SessionDep = Annotated[Session, Depends(get_db)]`)를 총합에서
   빠뜨렸다 — reviewer가 `grep -rn "Depends(get_current_active_superuser)\|Depends(get_db)"`로
   재확인. **참조 총계 20→21, "위음성 8건(B 5 + C 3)" 중 두 프로젝트 합산 항목만 8→9(template의
   B가 1 늘어남 — dispatch-only인 §3-3 본문의 "8건"은 원래 정확했다, 합산 절에서만 틀렸다),
   recall 12/20(60%)→12/21(약 57%), 실제 코드 corpus 27→28.** 정확도(오탐 10→0) claim은 이
   오류와 무관해 그대로 유효 — reviewer가 before/after 두 CLI 빌드를 직접 재실행해 재확인했다.
2. **`maxFiles: 200`의 가용성 결함이 이제 닫혔다.** commander의 "적용 안 된 budget은 budget이
   아니다"는 지적에 따라 `maxFiles: 1500`을 실제로 적용하는 별도 PR #102(`docs/work/task-m4-
   gate7-apply-maxfiles.md`)를 열었다 — "상한 없음"이 아니라 실제 1500 값으로 dispatch 8개
   쿼리를 재실행해 전부 `augmentation_budget_exceeded: false`로 확인했다. **이 항목은 더 이상
   "아직 기본값 on 아님"의 근거가 아니다** — 남은 근거는 recall(약 57%), 조용한 기각(limitation
   없음), extension host 미측정, corpus 프로젝트 둘, 그리고 새로 찾은 `Security()` 미인식(아래
   3번)이다.
3. **`Security()`가 `Depends()`의 동의어인데 이 adapter에 전혀 안 보인다(reviewer 발견).**
   `findDependsReferences`가 `Depends(` 리터럴만 찾아서, FastAPI의 `Security(fn, scopes=[...])`
   형태는 reference 자체가 안 잡힌다 — B/C처럼 안전하게 기각되는 게 아니라 "원래 없었던 것"과
   구분이 안 된다. 두 프로젝트 다 `Security(` 사용 0건이라(reviewer 확인) 오늘 census 숫자엔
   영향 없지만, "네 형태로 다 분류된다"는 이 gate의 전제 자체가 완전하지 않다는 뜻이라 기록한다
   — 새 lane 대상.

**gate 7의 최종 판단은 여전히 안 바뀐다** — 다만 근거 하나(가용성)가 닫히고 새 근거 하나
(`Security()` 미인식)가 늘어 결과적으로는 그대로 "아직 기본값 on을 권하지 않는다"다.

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
  - ~~Gate 7: latency budget 값 자체.~~ **2026-09-09: 정의됐다**(위 추가 참고) — 남은 건 정의가
    아니라 `maxFiles` 값 자체를 바꾸는 코드 변경(아래) 그리고 extension host harness다.
  - ~~Gate 7의 새 후속: `DEFAULT_BUDGET.maxFiles`를 200에서 올린다~~ **2026-09-09 4차 정정:
    PR #102가 닫았다** — 1500(latency budget에서 유도, 400ms가 바뀌면 이 값도 같이 바뀌는
    잠정값)으로 실제 적용, dispatch 8개 쿼리를 실제 값으로 재검증했다.

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
