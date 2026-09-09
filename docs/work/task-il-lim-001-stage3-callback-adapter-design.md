# IL-LIM-001 3단계 — callback/event 추론 adapter 설계 (측정 우선, 코드 없음)

**이 문서는 구현 문서가 아니라 설계 판단 문서다.** commander의 명시적 지시("측정 결과 → 설계 판단
→ 반박 → 구현" 순서, "adapter 코드를 쓰지 마세요")에 따라 이 lane은 문서·측정까지만 하고, 구현은
이 문서에 대한 commander/reviewer의 반박을 받은 뒤 별도 lane(별도 branch, 별도 PR)에서 한다.

## 목적과 사용자 가치

**지금 Impact Lens는 "값으로 넘겨진 함수"의 호출자를 통째로 못 본다.** 콜백으로 등록된 함수, 이벤트
핸들러는 그래프에서 호출자가 0인 것처럼 보이고, 사용자는 그걸 "아무도 안 부른다"로 읽는다 — 실제로는
런타임에 불린다. 변경 영향을 과소평가하게 만드는, `IL-LIM-001`이 P0·영향도 "매우 높음"인 이유
그 자체다.

`IL-LIM-001`의 1·2단계(provenance 계약 — `EdgeEvidence`/`data.augmentedEdges`, adapter SPI —
`cli/src/shared/adapters/`)는 M4 stage 1·2가 이미 지었다. 3단계("제한된 callback/event 추론")에
남은 건 **두 번째 adapter를 실제로 만드는 것**이다 — FastAPI adapter(`fastapiDependencyAdapter.ts`,
`fastapi-static-v1`)가 framework DI(`IL-LIM-002`)의 첫 사례였다면, 이건 동적 호출(`IL-LIM-001`)
자체의 첫 사례다.

## 요구사항 — commander가 정한 순서

1. **adapter를 설계하기 전에 그 edge들이 정말 LSP에 없는지부터 잰다.** M4 stage 3이 `resolution:
   'multiple'`을 실증하려다 pyright가 이미 1개만 반환하는 걸 뒤늦게 발견해 gate 문구를 고친
   전례가 있다 — 다 만들고 "provider가 이미 준다"를 발견하면 lane 전체가 낭비다.
2. **문서가 구현보다 먼저다.** 이번엔 설계 결정이 많고 되돌리기 비싸다.

## 조사 결과 — 전부 `[실행]`, 이 세션이 직접 측정(reviewer의 독립 측정과 사후 대조, 서로 안 보고 각자)

측정 환경: 재현 스크립트/워크스페이스 `/private/tmp/.../scratchpad/callback-probe/`(이 세션
scratchpad, 세션 종료 시 사라진다 — 재현하려면 이 문서의 fixture 코드를 그대로 다시 만들면 된다).
`cli/dist/lspProvider.js`의 `LspCallHierarchyProvider`를 직접 생성해 실제 번들 `typescript-language-
server`를 띄우고 `prepare()`/`analyzeImpact()`를 호출했다 — mock이 아니다.

### 측정 1 — 명시적 callback 전달은 오늘 LSP에 없다

같은 워크스페이스에 `handler.ts`(대상 함수), `direct.ts`(직접 호출), `registerCallback.ts`
(`register(handler)`), `forEachCallback.ts`(`arr.forEach(handler)`), `timeoutCallback.ts`
(`setTimeout(handler, 0)`)를 두고 `handler`의 incoming calls를 조회했다.

**결과: `direct.ts`만 나온다. register/forEach/setTimeout 셋 다 0건.** reviewer의 독립 측정과
일치(reviewer: "셋 다 incoming calls에 안 나옴").

### 측정 2 — event subscription도 오늘 LSP에 없다

`emitter.ts`(`export const emitter = new EventEmitter()`), `subscribe.ts`
(`emitter.on('x', handler)`), `fire.ts`(`emitter.emit('x')`).

**결과: `handler`의 incoming calls에 `subscribe.ts`도 `fire.ts`도 안 나온다.** reviewer와 일치
("노드 1개, edge 0개"). **두 lane의 전제(둘 다 provider에 없음)가 살아남았다.**

### 측정 3 — commander의 receiver-resolve 제안(대안 (b))은 오늘의 SPI로 불가능하다

commander는 "`emitter.on('x', h)`와 `emitter.emit('x')`의 `emitter`가 같은 심볼로 resolve되는지
`prepare()`로 확인하자"고 제안했다("제가 측정 안 했다"고 명시). 직접 측정: `subscribe.ts`/`fire.ts`
양쪽에서 `emitter` 식별자 위치에 `prepare()`를 호출 → **양쪽 다 빈 배열 `[]`.**

이유: `textDocument/prepareCallHierarchy`는 LSP 스펙상 **callable 심볼(함수·메서드) 전용**이고,
`emitter`는 변수(`const`)라 애초에 대상이 아니다. **이 발견이 설계를 갈랐다** — 아래 "결정" 참고.
commander가 이 결론을 받아들여 receiver-resolve 제안을 철회했다.

### 측정 4 — `prepare()`는 함수 참조 위치에서 이름 일치가 아니라 진짜 재확인을 한다

`register(handler)`의 **인자 위치**(`handler`가 선언이 아니라 참조로 쓰인 자리)에서 `prepare()`를
호출 → `handler.ts`의 선언과 **완전히 같은 canonical item**(같은 `uri`, 같은 `selectionRange`)을
반환한다. `obj.onClick = handler`(프로퍼티 대입)의 `handler` 위치에서도 마찬가지로 같은 canonical
item을 반환한다.

**shadowing 부정 fixture**: `register(handler)` 안의 `handler`가 **지역 함수**(같은 이름, 다른
scope)일 때 `prepare()`는 `shadowed.ts`(지역 선언)를 반환하고 `handler.ts`(찾으려는 대상)를
**반환하지 않는다** — uri가 다르다. 즉 **이름만 맞추는 접근이었다면 이 경우를 오탐으로 만들었을
것을, `prepare()` 기반 재확인이 막는다.** gate 4의 `importsNameFromModule`이 지키는 것과 같은
규율("이름 일치만으로 연결하지 않는다", story 3단계 항목 2)이 **`definition`/`reference` provider
없이, 이미 SPI에 있는 `prepare()`만으로 성립한다**는 뜻이다 — story는 이 재확인에
definition/reference provider가 필요하다고 적어 뒀지만, 측정 결과 call-hierarchy의 `prepare()`가
이미 그 역할을 한다(적어도 callable 대상에 대해서는).

## 결정

### 1. 이번 lane은 "callable 대상"만 다룬다 — event의 emit 쪽은 범위 밖, 이유는 "정확도 판단"이 아니라 "능력 부재"

측정 3이 설계를 가른다:

- **다루는 것 — 재확인 대상이 함수인 모든 경우**: `register(handler)`, `arr.forEach(handler)`,
  `setTimeout(handler, 0)`, **`emitter.on('x', handler)`의 등록 지점**(`handler` 자신은 함수라
  `prepare()` 가능), `obj.onClick = handler` 같은 프로퍼티/슬롯 대입. **오늘의 SPI(`prepare()`)로
  구현 가능**하고 측정 4가 재확인이 실제로 동작함을 보였다.
- **안 다루는 것 — `emit` 지점 → handler**: 재확인 대상이 변수(`emitter`)라 `prepare()`가 `[]`를
  반환한다. **오늘의 SPI로 원리적으로 불가능하다.**

**이 구분을 명시적으로 남긴다**: 안 다루는 이유는 "정확도가 안 나와서"가 아니라 "이 SPI에 그 능력이
없어서"다. story 3단계 항목 2가 요구한 "definition/reference provider"가 바로 이 능력이다 — SPI에
없을 뿐, story가 예상 못 한 새 범위가 아니다. `fastapiDependencyAdapter.ts`의
`importsNameFromModule`과 그 주변(Python 모듈 해석을 손으로 구현한 ~200줄)도 근본적으로 같은
결핍(adapter가 language server에 "이 이름이 어디서 왔냐"를 물을 수 없음) 때문에 존재하고, gate 4가
네 라운드에 걸쳐 닫은 오탐 여섯 가지도 전부 그 손수 해석의 결함이었다 — `definition` 능력이 있었으면
그 라운드 대부분이 필요 없었을 것이다. **그래서 `definition` 추가는 이 lane 밖에서도 값어치가
있지만, 새 adapter와 새 LSP 능력을 한 PR에 같이 넣으면 뭐가 뭘 깨는지 못 가리므로 이번 lane에는
안 넣는다** — (a)만으로 adapter 하나를 먼저 세우고, 그게 SPI의 다른 가정(`mountUnresolved`, budget)
을 드러낸 뒤 `definition` 추가를 별도 lane으로 한다.

### 2. "동적 호출 유형 2개"는 재확인 방식이 아니라 구문 형태로 센다

`IL-LIM-001` 수용 기준 "최소 2개 동적 호출 유형의 fixture"와 3단계 종료 조건 "선정한 두 패턴에서
정해진 정확도 기준을 충족"의 "두 패턴"을 무엇으로 셀지 **먼저 기준을 적고 나서 fixture를 만든다**
— 분모가 다섯 번 흔들렸던 precision corpus의 교훈과 같다.

**기준(반박 가능)**: 재확인 메커니즘(둘 다 `prepare()`)이 아니라 **탐지해야 하는 구문 형태**로
가른다 — 탐지 코드(향후 AST/정규식)가 다른 AST 노드 종류를 봐야 하고, 서로 다른 오탐 모양을 낸다면
별개 유형이다.

- **유형 A — 호출 인자로 전달**(`CallExpression`의 argument 위치): `register(handler)`,
  `arr.forEach(handler)`, `setTimeout(handler, 0)`, `emitter.on('x', handler)`의 등록 지점.
- **유형 B — 프로퍼티/슬롯에 대입**(`AssignmentExpression`/객체 리터럴 property의 value 위치):
  `obj.onClick = handler`, `element.onclick = handler`, `{ onEvent: handler }`.

**둘이 정말 다른 유형인 근거(오탐 모양이 다르다) — 실측이 아니라 설계 추론, fixture로 아직
검증 안 함, 명시한다**:
- 유형 A의 실제 위험은 **범위 폭발**이다 — 거의 모든 함수 호출이 "인자로 뭔가를 전달"하므로, 어떤
  CallExpression이 "콜백 등록"이고 어떤 게 그냥 값 전달인지 API 이름(`register`/`on`/`addEventListener`/
  `setTimeout`/`forEach`/…)으로 한정하지 않으면 사실상 모든 함수 호출을 후보로 만든다. 오탐의 모양은
  "콜백이 아닌 평범한 인자를 콜백으로 오인"이다.
- 유형 B의 실제 위험은 **이름 규칙에 대한 과신**이다 — `onClick`/`onEvent`처럼 관례적인 프로퍼티
  이름이 실제로 나중에 호출되는 슬롯인지, 단순 데이터 저장(설정 객체, 나중에 검사만 하는 필드)인지
  구문만으로는 구별 안 된다. 오탐의 모양은 "이름은 handler-slot처럼 생겼지만 실제로 호출되는 슬롯이
  아닌 프로퍼티".
- 두 위험은 서로 다른 완화책이 필요하다(A는 API 이름 allowlist, B는 프로퍼티 이름 패턴 + 아마도
  타입 검사) — 그래서 두 개의 유형으로 센다. **이 근거는 fixture로 아직 검증되지 않았다** — 구현
  lane에서 유형 B가 실제로 A와 다른 오탐을 내는 fixture를 만들어야 이 근거가 확정된다(commander의
  요구). 지금은 설계 근거일 뿐이다.
- **유형 B가 오늘 SPI로 재확인 가능함은 이미 측정으로 확인**(측정 4, `obj.onClick = handler`) —
  구문 형태가 다르다고 재확인 메커니즘까지 다른 건 아니다.

### 3. `AdapterResult.mountUnresolved`/`DEFAULT_BUDGET` 일반화는 이번 lane에서 판단하지 않는다

commander가 별도로 지적한 SPI 결함(`mountUnresolved`가 FastAPI 어휘로 굳어 있고, 두 번째
adapter에는 무의미한 `mountUnresolved: false`를 강제로 반환해야 함)은 **이 lane이 실제 두 번째
데이터 포인트를 만든 뒤에** 판단한다 — 지금 고치면 하나의 데이터로 추측하는 것과 같다. 구현
lane에서 이 필드를 실제로 채워야 하는 순간 마주치면, 그 자리에서 "일반화 vs 그대로 둠"을 결정하고
이 문서(또는 구현 work doc)에 기록한다.

## 범위

**포함(이번 lane, 이 문서가 승인되면 이어질 구현 lane)**:
- 유형 A(호출 인자 전달, API 이름 allowlist로 한정 — 최소 `register`/`.on(`/`setTimeout`/
  `forEach`부터 시작, 정확한 목록은 구현 lane에서 확정)와 유형 B(프로퍼티/슬롯 대입)를 탐지하는
  두 번째 adapter.
- 각 후보를 `prepare()`로 재확인(측정 4의 shadowing 부정 사례를 실제 부정 fixture로 고정).
- 두 유형 각각의 positive/negative fixture.

**제외(범위 밖, 능력 부재로 인해)**:
- event의 `emit` 지점 → handler 연결. `definition`/`reference` provider가 SPI에 추가된 뒤 별도
  lane.

**제외(범위 밖, 데이터 부족으로 인해)**:
- `AdapterResult.mountUnresolved`/budget 일반화 여부 결정.

**제외(story 자체가 이미 배제)**:
- 문자열 이름 기반 연결, reflection, framework DI(`IL-LIM-002` 소관).

## commander/reviewer의 반박을 기다린다

이 문서는 구현 전 단계다. 특히 다음을 반박 대상으로 명시한다:
1. 유형 A/B를 가르는 기준(재확인 방식이 아니라 구문 형태) 자체.
2. 유형 A의 API 이름 allowlist를 무엇으로 시작할지(TS/Node 생태계에서 어떤 API가 "콜백 등록"의
   대표 사례인지).
3. 유형 B의 프로퍼티 이름 패턴을 얼마나 좁게/넓게 잡을지.
4. `definition` 능력 추가를 별도 lane으로 미루는 판단 자체.
