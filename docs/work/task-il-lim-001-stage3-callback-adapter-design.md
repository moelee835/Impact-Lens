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

commander가 "이 adapter의 안전성 논증 전체가 여기 달려 있다"고 지적해 5개 위치 전부 개별 측정했다
(reviewer가 측정한 `emitter`는 변수였다 — **함수 참조** 위치는 이 측정이 처음이다).

| 참조 위치 | `prepare()` 결과 | `handler.ts` 선언과 동일 canonical item? |
| --- | --- | --- |
| `handler.ts`의 선언 자체(대조군) | non-empty | 자기 자신이므로 동일 |
| `register(handler)`의 `handler` | non-empty | **동일**(같은 uri, 같은 selectionRange) |
| `arr.forEach(handler)`의 `handler` | non-empty | **동일** |
| `setTimeout(handler, 0)`의 `handler` | non-empty | **동일** |
| `obj.onClick = handler`의 `handler` | non-empty | **동일** |
| `register(handler)`인데 `handler`가 **지역 함수**(shadowing 부정 fixture) | non-empty | **다르다** — 지역 선언의 uri를 반환, `handler.ts`가 아님 |

**함수 참조는 선언 위치가 아니어도 `prepare()`가 실패하지 않는다** — 측정 3(변수 `emitter`)과
정확히 대조된다: `emitter`(변수)는 참조든 선언이든 전부 빈 배열, `handler`(함수)는 참조·선언
어디서든 non-empty다. **이게 유형 A/B를 가르는 근거이자(결정 1 참고), 이 adapter의 핵심 안전성
논증이다**: `register(handler)`의 `handler`가 정말 원하는 그 함수인지, 같은 이름의 다른 스코프
함수인지를 **텍스트로 안 맞추고 `prepare()`로 확정**할 수 있다 — shadowing 부정 fixture가 그걸
증명한다(다른 uri를 반환하므로 adapter가 이 경우 edge를 안 낸다).

**의미**: gate 4의 `importsNameFromModule`이 지키는 규율("이름 일치만으로 연결하지 않는다", story
3단계 항목 2)이 **`definition`/`reference` provider 없이, 이미 SPI에 있는 `prepare()`만으로
성립한다** — story는 이 재확인에 definition/reference provider가 필요하다고 적어 뒀지만, 측정
결과 call-hierarchy의 `prepare()`가 이미 그 역할을 한다(callable 대상에 한해). 그래서 이 adapter는
**FastAPI adapter가 손으로 짠 이름 해석(`importsNameFromModule`, ~200줄) 없이, language server에
물어서 확정하는 방식으로 시작할 수 있다** — gate 4가 네 라운드에 걸쳐 닫은 오탐 종류(같은 이름 다른
심볼, 스코프 shadowing, 역방향 alias)가 **이 adapter에서는 설계상 발생하지 않는다**(shadowing은
위에서 직접 fixture로 확인했다; 나머지 두 종류는 구현 lane에서 구체적 fixture로 추가 확인이
필요하다 — 지금은 설계 추론이다).

## 2026-09-09 추가 — commander의 반박 1번(callee 호출 의미)을 측정으로 검증, 예상보다 크게 좁아짐

commander의 반박: `prepare()`가 닫는 건 "`handler`가 그 함수인가"뿐이고, "그 callee가 실제로
`handler`를 호출하는가"는 안 닫힌다 — `logger.register(handler)`가 그냥 map에 저장만 하고 절대
안 부를 수도 있다. 제안된 완화책(1층 = 표준 API로 호출 의미가 보장됨, 2층 = 관례 이름)을 직접
측정했다.

### callee 쪽도 `prepare()`로 확인은 되지만, 결과가 Type B와 EventEmitter를 v1에서 밀어낸다

| 호출 형태 | callee 위치 `prepare()` | 판정 |
| --- | --- | --- |
| `setTimeout(handler, 0)` | `.../typescript/lib/lib.dom.d.ts` | **1층 확인됨** — 번들 표준 lib 선언 |
| `arr.forEach(handler)` | `.../typescript/lib/lib.es5.d.ts` | **1층 확인됨** |
| `arr.push(handler)`(대조군) | `.../typescript/lib/lib.es5.d.ts` | **1층 확인됨** |
| `button.addEventListener('click', handler)` | `.../typescript/lib/lib.dom.d.ts` | **1층 확인됨**, `handler` 인자도 별도로 재확인됨(선언과 동일) |
| `register(handler)`(사용자 정의) | 워크스페이스 파일 자신 | **2층**(예상대로 — 표준 lib 아님) |
| `emitter.on('x', handler)` | **빈 배열 `[]`** | **측정 전 예상과 다름** — Node `EventEmitter.on`은 실존하는 잘 알려진 API인데도 `prepare()`가 콜리 위치에서 아무것도 못 돌려준다(overload 많은 제네릭 메서드 시그니처 때문으로 추정, 확정 원인은 조사 안 함) |
| `button.onclick = handler`의 **`onclick`(대입 대상 프로퍼티 자체)** | **빈 배열 `[]`** | **Type B는 callee/slot 쪽 검증 메커니즘이 아예 없다** — property access는 애초에 `prepareCallHierarchy` 대상이 아니다(callable 심볼만 되는 게 측정 3의 반복). `handler`(대입되는 값) 쪽은 여전히 재확인됨(선언과 동일) |

### 결론 — 문서가 갖고 있던 두 가정이 둘 다 틀렸다

1. **"emit 등록 지점(`emitter.on(...)`)은 유형 A의 1층 후보"라고 적었던 건 틀렸다.** 콜리
   `emitter.on`이 `prepare()`로 전혀 확인이 안 되므로, commander의 원칙("1층만으로 1차를 낸다")을
   그대로 적용하면 **event subscription 등록 지점 자체가 v1에서 빠진다** — `handler` 쪽만 맞고
   콜리 쪽을 전혀 못 좁히면 사실상 이름 하나(`.on`)로만 거르는 것과 같다(gate 4가 이미 실패한
   모양).
2. **Type B(프로퍼티/슬롯 대입)는 1층/2층을 가를 방법 자체가 없다.** 대입되는 값(`handler`)은
   재확인되지만, 대입 대상 프로퍼티(`onclick` 자신)는 `prepare()`로 절대 확인이 안 된다 —
   DOM 표준 슬롯(`button.onclick`)이든 임의 객체 리터럴 키(`{ onEvent: handler }`)든 **오늘의
   SPI로는 구분 불가능**하다. Type A보다 약한 게 아니라, **검증축이 아예 하나 없는** 상태다.

**남은 v1 후보는 순수 표준 라이브러리 호출-인자 전달뿐이다**: `setTimeout`/`setInterval`(추정,
`setTimeout`과 같은 lib 선언 계열이라 미검증이지만 개연성 높음)/`addEventListener`/
`Array.prototype.forEach|map|filter`(추정, `forEach`/`push`와 같은 `lib.es5.d.ts` 계열) — **전부
"호출 인자로 전달"(유형 A) 안의 항목이고, 유형 B와 `.on()`류는 v1에서 완전히 빠진다.** "유형 2개"
주장이 다시 위태롭다 — 지금 남은 게 진짜 유형 A 하나(표준 API 호출-인자 전달)뿐일 수 있다. 이건
반박을 더 받아야 할 지점이고, 이 세션이 혼자 결론 내지 않는다.

## 2026-09-09 추가 2 — 설계 확정(commander·reviewer 교차 확인)

reviewer가 독립적으로 두 갈래를 더 실측해 위 내용을 확정했다:

**"callee가 자기 인자를 실제로 호출하는가"는 이 adapter가 구조적으로 못 닫는 축이다** — 두 후보
지점(`register`의 파라미터 선언 위치, `register` 본문 안에서 그 파라미터를 호출하는 표현식이
있을 법한 위치) 모두 `prepare()`가 0건. `incoming(register)`(누가 `register`를 부르는가)도
무관한 질문이라는 게 같이 확인됐다. **그러므로 API 이름 allowlist는 "오탐을 막는 완화책"이 아니라
"검증 안 되는 축을 아예 다루지 않기 위한 범위 한정"이다** — 이 문서 전체에서 이렇게만 부른다.

**layer 1은 이름 일치가 아니라 실제 경로 확인이다** — reviewer의 대조군도 `register` 호출부가
정확히 사용자 소스 파일로 갈렸다(`[실행]`, 이 세션의 측정과 일치).

**추가 실측 — layer 1 안에도 신뢰 등급이 둘이다**: `@types/node`를 설치한 워크스페이스에서
`setTimeout` callee를 다시 쟀다 — **두 개의 canonical item을 함께 반환한다**:
```
1) .../node_modules/.pnpm/@types+node@22.20.1/node_modules/@types/node/timers.d.ts
2) .../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.dom.d.ts
```
(1)은 **워크스페이스의 npm 패키지**(`node_modules/@types/node`) — 사용자가 자기 프로젝트에
shim을 넣어 바꿀 수 있는 경로다. (2)는 **provider가 쓰는 TypeScript 설치에 번들된 것** — 사용자가
절대 못 바꾼다. **"표준 선언"이라는 한 단어로 뭉치지 않는다**:
- **1a(가장 강함)** — 해석된 경로가 provider의 TypeScript 설치 안 `lib/lib.*.d.ts`.
- **1b(약함, 그래도 v1에 포함)** — 해석된 경로가 워크스페이스의 `node_modules/@types/**` 안.
  실무에서 Node 프로젝트의 `setTimeout`은 거의 항상 이쪽으로 resolve된다(방금 측정) — 1a만
  받으면 `@types/node`가 설치된 평범한 Node 프로젝트에서 `setTimeout`이 통째로 후보에서 빠진다.
  둘 다 받아들이되, **1b는 사용자가 바꿀 수 있는 신뢰 경계라는 걸 코드 주석과 이 문서 양쪽에
  명시한다** — 이건 이 adapter 하나만의 새 위험이 아니라 이 도구가 이미 workspace 코드/의존성
  전반에 갖고 있는 신뢰 가정과 같은 종류이지만, 감춰서는 안 된다.

**구현 규칙(반드시 지킬 것 — 방금 끝난 lane의 교훈)**: 해석된 경로를 **문자열 포함/suffix**로
비교하지 않는다. `pathEndsWithSegments`(gate 4, `fastapiDependencyAdapter.ts`)처럼 **경로를
세그먼트로 쪼개 비교**한다 — `lib.dom.d.ts`라는 파일명은 vendoring된 사본이나 사용자 워크스페이스
어디에도 있을 수 있고, IL-LIM-010에서 조상 디렉터리 문자열 일치가 분류를 오염시킨 것과 같은 함정이다.
1a는 "provider가 실제로 실행 중인 TypeScript 설치 경로 + `/lib/` 세그먼트"로, 1b는 "워크스페이스
루트 + `/node_modules/@types/` 세그먼트"로 각각 앵커링해서 비교한다.

**유형 B**: layer 1만 내면 DOM 표준 슬롯(`element.onclick`류) 한 종류로 쪼그라들 수 있다 — 이건
지금 fixture 없이 못 정한다. 구현 lane에서 fixture로 실제로 확인하고, 쪼그라들면 결함이 아니라
정보로 기록한 뒤 "유형 2개"를 무엇으로 채울지 다시 논의한다.

**layer 2(관례 이름, 재확인 안 됨)는 이번 PR에 안 넣는다** — 닫힌 축과 안 닫힌 축이 한 정확도
숫자에 섞이면 그 숫자가 뭘 뜻하는지 아무도 못 말한다(gate 4가 "오탐 경로 0"을 정정해야 했던
바로 그 실패 모양).

**§4(mountUnresolved/budget 결정)와 위 "범위" 절의 모순은 §4가 맞는 것으로 정정했다** — 아래
"범위" 절 참고.

**이 설계는 확정이다 — 구현 lane으로 넘어간다.**

## 2026-09-09 추가 3 — 방금 "확정"이라고 적은 것 중 두 가지가 이미 틀렸다(commander가 같은 시각 지적)

위 "설계 확정" 절을 커밋한 직후 commander가 **내가 직접 잰 `push` 측정값** 자체가 그 절의 정의를
깬다고 지적했다 — 반박이 아니라 내 결과를 내가 잘못 해석한 것이었다.

**정정 1 — "표준 lib으로 resolve되면 1층"은 포함 기준이 될 수 없다.** `Array.prototype.push`도
`lib.es5.d.ts`로 정확히 resolve된다(위 표에 이미 있었다) — **그런데 `push`는 자기 인자를 절대
호출하지 않는다.** "표준 lib에 닿는다"는 사실 하나로는 "그 API가 콜백을 부른다"를 못 보장한다.
**올바른 구조는 둘로 분리한다**:
1. **명시적 allowlist(포함 기준, 사람이 정함)** — 호출 의미가 **규격/문서로 보장된** 함수만
   미리 나열한다. 후보: `setTimeout`/`setInterval`/`queueMicrotask`/`process.nextTick`(지연·예약
   호출), `addEventListener`(이벤트 구동 호출), `Array.prototype.forEach|map|filter|find`(즉시
   동기 순회 호출) — `push`/`pop`/`slice` 등은 목록에 없으므로 애초에 후보가 안 된다.
2. **`prepare()` 재확인(1번 목록에 오른 이름의 callee가 진짜 그 표준 선언인지)** — 사용자가 같은
   이름의 함수를 만들어 shadowing한 경우를 여기서 걸러낸다(가짜 `forEach`를 만들었다면 workspace
   파일로 resolve되어 탈락).

**1번이 "무엇을 후보로 볼지"를 정하고, 2번이 "그 후보가 진짜인지" 재확인한다 — 둘을 하나("표준
lib에 닿으면 1층")로 뭉쳤던 게 이번 정정 대상이다.** 그래도 gate 4보다 강한 이유는 그대로다:
거기선 이름 해석을 손으로 했고 여기서는 language server가 한다(2번 단계).

**정정 2 — "유형 2개"는 구문이 아니라 런타임 호출 방식으로 센다.** story 원문은 "최소 2개 **동적
호출** 유형"이지 "구문 유형"이 아니다. 구문(호출 인자 전달 vs 프로퍼티 대입)으로 센 게 이 세션의
판단이었고, 그 기준이 lane을 유형 1개로 쪼그라뜨린 원인이었다 — **`push`와 `forEach`가 구문·resolve
결과 둘 다 같은데 호출 여부가 다른 것 자체가, 구문이 아니라 "런타임에 어떻게 불리는가"로 갈라야
한다는 증거다.** 새 기준:
- **지연/예약 호출**: `setTimeout(handler, 0)`, `queueMicrotask(handler)` — 런타임이 나중에 부른다.
- **이벤트 구동 호출**: `addEventListener('click', handler)` — 외부 사건이 부른다.
- **고차 함수 즉시 동기 순회 호출**: `arr.forEach(handler)`, `arr.map(handler)` — 라이브러리 함수가
  같은 tick 안에서 부른다.

셋 다 layer 1(위 allowlist + `prepare()` 재확인) 하나 안에 있고, **최소 2개**는 이 셋 중 아무
둘을 골라도 채워진다 — "유형이 1개로 줄었다"는 이 세션의 오판이었다. story가 이름 댄 두 패턴
("명시적 callback 전달"=지연 호출 계열, "event subscription"=이벤트 구동 계열)도 **둘 다 layer 1
안에 있다.**

**정정 3 — "event subscription이 v1에서 빠진다"는 표현이 틀렸다.** `emitter.on(...)`(Node
`EventEmitter`) 하나가 `prepare()`로 확인 안 되는 것이지, **event subscription이라는 패턴
자체는 `addEventListener`(DOM) 경로로 이미 layer 1에 있다.** 빠지는 건 "이 패턴의 Node 구현체
하나"이지 "이 패턴"이 아니다 — 이전 절의 "event subscription 등록 지점 자체가 v1에서 빠진다"는
문장을 이걸로 정정한다. **`EventEmitter.on`이 왜 안 되는지는 이번 lane에서 조사하지 않는다** —
앞서 "오버로드 많은 제네릭 시그니처로 추정"이라고 적었는데, 확인 안 된 추정을 원인처럼 적은
것 자체가 잘못이었다. **원인 미확인, v1에 불필요**라고만 남긴다.

**유지되는 것 — 유형 B는 빠진다, 근거 재구성**: `onclick` 같은 슬롯 자체가 `prepare()`로 전혀
확인 안 되는 건 그대로다. 이건 "정확도가 부족해서 제외"가 아니라 **"검증 능력이 없어서 제외"**이고,
event의 `emit` 지점(변수 재확인 불가)과 같은 칸에 넣는다. **그리고 이 둘은 FastAPI adapter의
`importsNameFromModule`이 애초에 손으로 이름을 해석해야 했던 이유와 같은 근본 원인(callable이
아닌 대상을 language server에 물을 방법이 없음)을 공유한다** — 세 가지 전부
`definition`/`reference` provider 하나가 있으면 닫힌다. 이 셋을 한 자리(아래 "능력 부재로 제외")에
모아 둔다 — 그 능력 추가를 나중에 판단할 사람이 값어치를 한 번에 보도록.

**allowlist 항목은 "콜백을 부를 것 같다"가 아니라 1차 출처로 확인한다** — IL-LIM-010의 framework
기본 패턴 검증과 같은 급. `setTimeout`/`addEventListener`는 MDN에서 확인했다(`[실행]`, WebFetch):
MDN의 `addEventListener` 설명은 "sets up a function **that will be called** whenever the specified
event is delivered"로 명시적으로 "불린다"고 적는다. `setTimeout`은 지연 시간의 정확한 보장은
없지만("실제 지연은 더 길 수 있다") **콜백 자체가 결국 불린다는 서술은 있다.** 나머지
(`setInterval`/`queueMicrotask`/`process.nextTick`/`forEach`/`map`/`filter`/`find`)는 이 문서
작성 시점엔 1차 출처를 개별 확인하지 않았다 — **구현 lane에서 fixture를 만들기 전에 하나씩 확인하고,
확인 안 된 항목은 allowlist에서 뺀다.**

## 2026-09-09 추가 4 — reviewer의 반례로 allowlist 판정 기준 자체를 바꾼다(최종)

reviewer가 `push`/`sort`/`reduce`를 다시 쟀다 — **셋 다 `forEach`/`setTimeout`/`addEventListener`와
완전히 같은 파일(`lib.es5.d.ts`), 같은 신뢰도로 resolve된다.** 즉 **"callee가 표준 lib으로
resolve된다"는 재확인(2번)은 "그 인자 자리가 콜백인가"에 아무 신호를 안 준다** — `push`와 `forEach`를
못 가른다. "추가 3"에서 이미 allowlist(1번)와 재확인(2번)을 분리했지만, 재확인이 allowlist의
부담을 조금이라도 던다는 인상이 남아 있었다면 이걸로 지운다: **1번(allowlist)이 전부이고, 2번은
"그 이름이 진짜 그 표준 선언인가"만 재확인한다.**

**"무조건 호출된다" vs "조건부 호출된다"로 나누는 것도 실패한다** — reviewer가 직접 반례를 냈다:
`[].forEach(cb)`(빈 배열, 0회), `setTimeout(cb,0)`+`clearTimeout`(0회),
`addEventListener`(이벤트 없으면 0회), `[].sort(cb)`/`[1].reduce(cb, no-init)`(0회),
`new Promise(()=>{}).then(cb)`(영원히 미정착, 0회) — **"무조건 호출" 칸이 비어 있다.** 콜백
등록에 호출을 보장하는 API는 없다 — 그게 이 기능이 "candidate caller"라고 부르는 이유 그 자체다.

**최종 기준: "규격이 그 인자 자리를 콜백으로 정의하는가"** — 런타임 무관, 규격 문서로 판정
가능하다.
- **콜백 자리(allowlist 후보)**: `forEach`/`map`/`filter`/`find`/`sort`/`reduce`(위치는 다르지만
  전부 함수 인자를 받아 명시된 조건에서 호출하도록 규격이 정의), `then`, `setTimeout`/`setInterval`/
  `queueMicrotask`/`process.nextTick`, `addEventListener`.
- **콜백 자리 아님**: `push`/`includes`/`indexOf`/`console.log` 등 — 그 인자 자리는 **데이터**로
  규격이 정의한다.
- `push`/`sort`가 재확인(2번)에서 안 갈리는 건 결함이 아니다 — **1번(allowlist)에서 애초에
  `push`가 후보가 안 되므로 2번까지 갈 필요가 없다.** `sort`는 콜백 자리가 맞으므로(비교 함수)
  allowlist에 있고, 실제로 호출되는지는 "조건부"(빈/한 원소 배열이면 0회)이며 그건 이 기능이
  주장하는 바가 아니다(아래 참고).

**allowlist 항목은 `{ 함수, 콜백 인자 위치 }`로 둔다** — 이름만 넣으면 `setTimeout(delay, fn)`처럼
인자 순서가 바뀌거나 다른 자리에 함수를 넘긴 경우가 통과한다. 위치: `setTimeout`/`setInterval`/
`queueMicrotask`/`process.nextTick`/`forEach`/`map`/`filter`/`find`/`sort`/`reduce`(초기값 없는
경우 포함) 전부 0번째 인자, `addEventListener`는 1번째 인자(0번째는 이벤트 이름 문자열) — 각
API 자신의 표준 타입 선언(`lib.dom.d.ts`/`lib.es5.d.ts`) 시그니처로 확인 가능(별도 1차 출처
조회 불필요 — 인자 순서는 논쟁의 여지가 없는 언어 상식이라 IL-LIM-010의 framework 관례 검증과
같은 급의 검증이 필요하지 않다고 판단했다).

**부록 — `addEventListener`의 별도 축(재확인을 안 깬다)**: `addEventListener`의 두 번째 인자는
함수뿐 아니라 `handleEvent` 메서드를 가진 객체(`EventListenerObject`)일 수도 있다. 이건 "규격이
호출을 보장하는가"와 다른 축("정적 분석이 그 참조를 함수로 따라갈 수 있는가")이다 — `prepare()`가
그 자리에서 함수가 아닌 걸 만나면 빈 배열을 주고, 이 adapter는 그걸 기각으로 접는다(안전한 방향의
실패, gate 4와 같은 fold-to-abandonment).

**이 adapter가 실제로 주장하는 것(문서에 고정)**: "이 함수가 **호출된다**"가 아니라 **"규격상
콜백 자리에 이 함수가 전달됐다"**다. 위 모든 0회 호출 반례(빈 배열, 이벤트 미발생,
clearTimeout, 미정착 Promise)가 이 주장 밖의 반례가 아니라 **이 주장이 원래 포함하는 범위**다 —
`candidate caller`(확정 아님)라는 기존 라벨이 정확히 이 의미를 이미 표현하고 있었다. 새 UI 문구는
필요 없다.

## 결정

**정정 안내(2026-09-09)**: 이 섹션은 이 문서를 쓰면서 가장 먼저 나온 판단이고, 아래 "2026-09-09
추가 2/추가 3"에서 그중 두 개가 정정됐다 — **2번(유형 A/B를 구문으로 가른다)은 "런타임 호출
방식으로 가른다"로, 4번(mountUnresolved만 다룸)은 결론 자체는 유지되지만 근거가 "추가 3"에서
보강됐다.** 원문은 지우지 않고 그대로 두되, 최종 결론은 아래 "## 범위 (최종 — 2026-09-09 추가 3
반영)" 절을 따른다.

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

### 3. 정확도 corpus 분모 — fixture를 만들기 전에 세는 기준을 먼저 적는다

FastAPI adapter의 precision 분모가 19→25→29→31→34→36→38로 다섯 번 흔들린 이유는 **세고 나서
기준을 맞췄기 때문**이었다(`docs/work/task-m4-il-lim-010-test-classifier.md`에도 같은 교훈이
반복된다). 이번엔 반대로 한다 — `cli/src/test/pythonFastapiIntegration.test.ts`에 사후 적용했던
기계적 기준을 그대로 이식해 **fixture를 하나도 안 만든 지금** 적는다:

> callback/event adapter의 정확도 corpus에 들어가는 테스트는, 이 adapter가 만들 예정인 통합
> 테스트 파일(가칭 `callbackEventIntegration.test.ts`)에서 **`augmentedEdges.length`를 정확히
> 0 또는 1로 단정하는 것이 그 테스트의 주된 목적인 테스트 전부**다. 아래는 제외한다:
> - budget/latency가 주 목적인 테스트(FastAPI corpus와 같은 제외 기준).
> - 테스트 이름에 리터럴 부분 문자열 "known false negative" 또는 "accepted residual"이 포함된
>   테스트(가능한 미탐/잔여를 의도적으로 pin하는 테스트 — 정확도 주장에 넣으면 스스로 인정한
>   한계를 강점으로 착각하게 만든다).

이 기준을 구현 lane의 work document 맨 위에 그대로 복사해 넣고, fixture를 다 만든 뒤 이 기준을
기계적으로 적용한 개수를 보고한다 — 사람이 센 숫자를 먼저 보고하고 기준을 나중에 맞추지 않는다.

### 4. `AdapterResult.mountUnresolved`/`DEFAULT_BUDGET` — 두 번째 데이터 포인트로 지금 결정한다

commander가 "미루면 세 번째 adapter까지 간다"고 지적해 이번엔 미루지 않는다. 근거는 이 adapter가
실제로 어떤 모양으로 동작할지에 대한 설계 추론이다(구현 전이라 확정은 아니다 — fixture 작업 중
틀렸다고 밝혀지면 이 절을 정정한다):

**`mountUnresolved` → optional로 바꾼다(`mountUnresolved?: boolean`)**. 이 필드는 FastAPI adapter의
"route decorator는 찾았는데 mount 여부를 확인 못 함"이라는 **FastAPI 고유의 중간 상태**를 표현한다.
callback/event adapter에는 그런 중간 상태가 없다 — 유형 A/B 둘 다 "패턴을 찾고 `prepare()`로
재확인" 두 단계뿐이고, 재확인이 실패하면 그건 FastAPI의 "mount 불확실"이 아니라 그냥 **기각**이다
(gate 4와 같은 fold-to-abandonment). 그러니 이 adapter는 `mountUnresolved`에 대응하는 개념이 아예
없다 — 강제로 `false`를 반환하게 하면 "확인했고 문제없다"로 읽히는데 실제로는 "이 개념 자체가
무관하다"는, commander가 이미 지적한 바로 그 결함을 새 adapter에도 그대로 물려주는 것이다.
optional로 바꾸면 FastAPI는 그대로 `true`/`false`를 반환하고, callback/event adapter는 필드
자체를 안 채워도 된다 — `runAugmentation()`의 `if (result.mountUnresolved)` 체크는 `undefined`에도
그대로 안전하다(falsy).

**`DEFAULT_BUDGET`의 shape(`{maxFiles, maxMatchesPerFile}`)는 그대로 공유한다 — adapter별 override만
추가한다.** 이 adapter도 FastAPI와 같은 비용 모델을 쓸 가능성이 높다: 파일을 텍스트/정규식으로
스캔해 후보 패턴(유형 A/B 각각의 구문 모양)을 찾고 `prepare()`로 재확인하는 방식이라, "파일 몇 개를
스캔했는가, 파일당 매치가 몇 개인가"라는 같은 두 축으로 비용이 결정된다 — **shape을 바꿀 이유가
없다.** 다만 **숫자(200/20)는 FastAPI(Python 프로젝트)를 기준으로 잰 값**이고, TS/JS 워크스페이스는
파일 수 분포가 다를 수 있어(모노레포 등) 같은 숫자가 맞으리라는 보장이 없다 — 그래서 `RegisteredAdapter`에
optional `budget?: AdapterBudget`을 추가해 어댑터가 자기 값을 선언할 수 있게 하고, 없으면
`DEFAULT_BUDGET`로 떨어지게 한다(하위 호환 — 기존 FastAPI 등록은 변경 없음). **정확한 숫자는 구현
lane에서 실측(측정 원칙 그대로 — 추측하지 않는다)한다.**

## 범위 (최종 — 2026-09-09 추가 4 반영)

**포함**:
- **allowlist(기준: "규격이 그 인자 자리를 콜백으로 정의하는가", 위치까지 지정) + `prepare()`
  재확인(그 이름이 진짜 표준 선언인지만)**으로 동작하는 하나의 adapter. `{함수, 콜백 인자 위치}`:
  `setTimeout`/`setInterval`/`queueMicrotask`/`process.nextTick`(0번째, 지연·예약 호출),
  `addEventListener`(1번째, 이벤트 구동 호출), `Array.prototype.forEach|map|filter|find|sort|
  reduce`(0번째, 즉시 동기 순회 호출) — `push`/`includes`/`indexOf` 등은 그 인자 자리가 규격상
  데이터이므로 애초에 후보가 아니다(재확인으로 거르는 게 아니라 allowlist에 없다).
- "동적 호출 유형 2개"는 **런타임 호출 방식**(지연/예약, 이벤트 구동, 즉시 동기 순회 — 최소 이
  셋 중 둘)으로 채운다. story가 이름 댄 "명시적 callback 전달"(지연 호출)과 "event subscription"
  (이벤트 구동, `addEventListener`)이 둘 다 이 안에 있다.
- 각 후보를 `prepare()`로 이중 재확인: **callee**가 allowlist가 가리키는 진짜 표준 선언인지(같은
  이름의 사용자 함수가 아닌지, shadowing 부정 fixture로 고정), **handler**가 원하는 그 함수인지
  (측정 4의 shadowing 부정 fixture로 고정). `addEventListener`의 두 번째 인자가 함수가 아니라
  `EventListenerObject`(`handleEvent` 메서드를 가진 객체)인 경우 `prepare()`가 빈 배열을 주고
  기각으로 접는다 — 별도 처리 불필요.
- **이 adapter가 실제로 내는 주장은 "호출된다"가 아니라 "규격상 콜백 자리에 이 함수가 전달됐다"다**
  — 빈 배열에서 `forEach`가 0회 호출되는 것, `clearTimeout`된 타이머, 이벤트가 안 난 리스너 전부
  이 주장이 원래 포함하는 범위이지 반례가 아니다. 기존 `candidate caller` 라벨이 이미 이 의미다.

**제외(범위 밖, 능력 부재로 인해 — 셋이 같은 근본 원인을 공유한다)**:
1. 유형 B(프로퍼티/슬롯 대입, `obj.onClick = handler`류) — 대입 대상 프로퍼티 자체가 `prepare()`로
   전혀 확인 안 됨(측정: `button.onclick` → `[]`).
2. event의 `emit` 지점 → handler 연결 — receiver(`emitter`, 변수)가 `prepare()`로 확인 안 됨.
3. FastAPI adapter(`fastapiDependencyAdapter.ts`)가 `importsNameFromModule`로 이름을 손으로
   해석해야 했던 것(기존 사실, 새로 발견한 게 아니라 같은 자리로 재확인).

세 가지 전부 "callable이 아닌 대상(프로퍼티, 변수, 모듈 경로)을 language server에 물어 확정할
방법이 없다"는 같은 결핍에서 나온다 — `definition`/`reference` provider 하나가 SPI에 추가되면
셋 다 동시에 풀린다. 이 lane은 그 능력을 추가하지 않는다(새 adapter와 새 LSP 능력을 한 PR에
같이 넣으면 뭐가 뭘 깨는지 못 가린다는 commander의 판단) — 별도 lane으로 남긴다.

**미확인(원인 조사 안 함, v1에 불필요)**:
- `EventEmitter.on`이 `prepare()`로 확인 안 되는 이유. event subscription 패턴 자체는
  `addEventListener`로 layer 1에 남아 있으므로 v1 진행에 필요하지 않다.

**결정됨(§4, 이번 lane에 포함)**:
- `AdapterResult.mountUnresolved`를 optional로, `AdapterBudget`에 adapter별 override 추가.

**제외(story 자체가 이미 배제)**:
- 문자열 이름 기반 연결, reflection, framework DI(`IL-LIM-002` 소관).
- layer 2(관례 이름, `register`/사용자 정의 함수 등 — callee 쪽이 재확인 안 되는 것)는 이번 PR에
  넣지 않는다. 닫힌 축과 안 닫힌 축이 한 정확도 숫자에 섞이면 그 숫자의 의미를 아무도 못 말한다.

## commander/reviewer의 반박을 기다린다(다음 라운드가 있다면)

1. allowlist 항목별 1차 출처 확인 결과(구현 lane에서 채워짐).
2. 런타임 호출 방식 3분류(지연/예약, 이벤트 구동, 즉시 동기 순회) 자체 — 넷째 방식이 있는지.
3. `definition`/`reference` 능력 추가를 별도 lane으로 미루는 판단 자체.

## 구현 작업 로그

**산출물**:
- `cli/src/shared/adapters/types.ts`: `AdapterResult.mountUnresolved`를 optional로,
  `RegisteredAdapter`에 optional `budget`을 추가(§4 결정 실행).
- `cli/src/shared/adapters/index.ts`: `adapter.budget ?? DEFAULT_BUDGET`으로 per-adapter override 적용.
- `cli/src/shared/adapters/dynamicCallbackAdapter.ts`(신규) — `dynamic-callback-static-v1`.
  `CALLBACK_ARGUMENT_ALLOWLIST`(함수명+콜백 인자 위치+런타임 호출 방식 카테고리),
  `isTrustedStandardDeclaration()`(axis 1, export됨, 별도 유닛 테스트), 본문의 axis 2(handler
  재확인) + `findEnclosingFunction()`(caller 식별) + 본 adapter 함수.
- `cli/tsconfig.json`: 새 fixture 디렉터리를 CLI 자체 컴파일에서 제외(아래 "구현 중 발견한 문제" 1번).
- `cli/src/test/dynamicCallbackAdapterTrustedDeclaration.test.ts`(신규, 8 tests) — axis 1 유닛 테스트.
- `cli/src/test/dynamicCallbackIntegration.test.ts`(신규, 11 tests) — 실제 CLI 바이너리를 실제
  fixture workspace에 대해 spawn(pythonFastapiIntegration.test.ts와 같은 방식).
- `cli/src/test/fixtures/typescript-dynamic-callback/`(신규) — 13개 파일, positive 3 + negative 7 +
  baseline 1(직접 호출) + 지원 파일 2(handler, emitter).

**정확도 corpus 세는 기준 — 문서에 미리 적은 것과 실제 구현 사이의 차이를 명시한다**: 설계
문서는 "매 시나리오마다 별도 analyze 호출 + `augmentedEdges.length`를 0/1로 단정"을 전제로
기준을 적었다. 실제로는 **fixture 전부를 한 workspace에 두고 analyze를 한 번만 호출**했다(모든
fixture 파일이 같은 workspace에 있으므로 매 시나리오마다 CLI를 다시 spawn하면 tsserver를 그만큼
반복 기동하는 비용만 늘고 결과는 같다 — `pythonFastapiIntegration.test.ts`도 여러 fixture를
한 번의 spawn으로 같이 확인하는 자리가 있다). 그래서 각 테스트는 `augmentedEdges.length`
자체가 아니라 **특정 이름의 source가 있는지/없는지**를 확인한다 — 공유된 응답 안에서 "정확히
하나의 candidate만 이 시나리오에 해당한다"를 개별적으로 단정하는 것과 기계적으로 동등하다(다른
시나리오의 candidate와 섞이지 않는다는 걸 이름으로 구분하므로). **최종 개수**: positive 3(setTimeout/
forEach/addEventListener) + negative 7(register/push/handler-shadow/callee-shadow/onclick/
subscribe/fire) = **10건**, 전부 이 기준으로 셌다. budget/latency 테스트나 "known false negative"/
"accepted residual" 이름의 테스트는 없다(전부 명확히 참 또는 거짓인 shape이라 그런 딱지가 필요
없었다).

**구현 중 발견한 문제 — 전부 실행으로 확인, 뮤테이션으로 재확인**:

1. **fixture가 CLI 자체 빌드에 잡혔다.** `.ts` fixture가 `cli/tsconfig.json`의
   `include: ["src/**/*.ts"]`에 그대로 걸려, `HTMLButtonElement`(DOM lib, CLI 자신은
   `lib: ["ES2022"]`만 씀) 컴파일 에러가 났다. Python fixture(`.py`)는 애초에 이 문제가 없어서
   몰랐던 충돌 — `cli/tsconfig.json`에 이 fixture 디렉터리만 `exclude` 추가로 해결.
2. **정규식이 method call을 못 잡았다.** `(?:^|[^\w$.])` 형태로 "함수명 앞에 문자가 아니어야
   한다"를 짰는데, `.`도 배제 대상에 넣는 바람에 `arr.forEach(`처럼 점으로 시작하는 메서드 호출
   자체가 안 걸렸다 — `forEachCaller`/`listenerCaller`가 전혀 안 나와서 발견([실행], 첫
   end-to-end 확인에서 `timeoutCaller`(점 없는 bare 호출)만 나오는 걸 보고 알았다). lookbehind
   `(?<![\w$])`(점은 허용, 단어문자/`$`만 배제)로 교체해 해결.
3. **`isTrustedStandardDeclaration`이 pnpm 중첩 경로에서 잘못될 뻔했다.** 처음 구현은 "workspace
   기준 상대경로의 첫 두 세그먼트가 `node_modules`/`@types`인가"를 봤는데, 실제 pnpm 설치는
   `node_modules/.pnpm/@types+node@x/node_modules/@types/...`라 workspace 기준 상대경로의 첫
   두 세그먼트가 `node_modules`/`.pnpm`이지 `node_modules`/`@types`가 아니다 — `@types/node`가
   설치된 워크스페이스로 실제로 재확인하기 전에는 안 드러났을 결함. "절대경로 세그먼트 어디서든
   `node_modules` 바로 다음에 `typescript`+`lib` 또는 `@types`가 오는가"로 재작성 — flat/pnpm
   레이아웃 둘 다, 그리고 "워크스페이스 소스에 우연히 같은 이름의 디렉터리가 있는" 경우(반대
   방향 오탐)를 유닛 테스트로 고정.
4. **`findEnclosingFunction`이 중첩 함수에서 틀렸다** — 가장 심각한 결함, 뮤테이션 테스트로
   드러났다. `if (handlerId !== input.rootId) continue;`(axis 2)를 일부러 지워 "그 검사가 없으면
   shadowing 부정 fixture가 잘못 통과해야 한다"를 확인하려 했는데, **전체 테스트가 그대로
   초록이었다** — 그 자체가 그 negative 테스트가 공허하다는 신호였다. 원인: `shadowedTimeoutCallback.ts`
   에서 `setTimeout(handler, 0)` 바로 위에 **먼저 닫힌 중첩 함수** `function handler() {...}`가
   있는데, "가장 가까운 이전 function 선언"만 보는 첫 구현이 이미 닫힌 그 중첩 함수를 "감싸는
   함수"로 잘못 골랐다(진짜 감싸는 함수 `shadowedTimeoutCaller`가 아니라). axis 2가 살아있을
   때는 어차피 그 지점에서 먼저 걸러지니 겉으로는 안 보였을 결함이다. 중괄호 깊이를 거꾸로
   추적해(닫는 괄호로 깊이 증가, 여는 괄호로 감소) 깊이 0에서만 후보를 인정하도록 고쳤다 — 문자열/
   주석 안의 중괄호는 여전히 못 거른다(별도 한계로 명시, `stripCommentsAndStrings` 같은 전처리는
   이번엔 안 함). 고친 뒤 같은 뮤테이션을 다시 걸어 **정확히 그 테스트 1개만** 실패하는 걸
   재확인했다.

**전체 뮤테이션 목록(전부 재확인 완료, 원복 후 재통과)**:
- axis 1(callee trust)을 항상 true로 → `fakeTimeoutCaller` 테스트만 실패.
- axis 2(handler identity)를 제거 → (수정 전) 아무것도 안 잡힘(공허 발견) → (수정 후)
  `shadowedTimeoutCaller` 테스트만 실패.

**검증**(전부 `[실행]`, `rm -rf out cli/dist` 후):
- `npm run cli:test`: 429 tests, 426 pass, 0 fail, 3 skip(무관).
- `npm test`(Extension): 84 tests, 84 pass, 0 fail(이 lane은 Extension 쪽 코드를 안 건드렸지만
  shared adapter 등록 배열이 컴파일 산출물을 공유하므로 재확인).
- `npm run test:vsix-contents`: 통과, `cli/dist/shared/**` 5 → 6 파일, require-boundary 위반 없음.
- `npm run test:response-policy`: 34 checks 통과(무관, regression 없음).

**완료 기준 대조**: 위 "결정"·"범위 (최종)" 절의 모든 항목 구현·테스트 완료. 남은 것은 그대로
남긴다 — Type B, emit 연결, `EventEmitter.on` 조사, layer 2는 이번 PR 범위 밖(설계 문서가 이미
그렇게 정함).

## 2026-09-09 추가 5 — commander/reviewer의 PR #94 실행 검토, 결함 3건 수정

### 결함 1 — 정확도 corpus 기준이 스스로 0건을 세게 적혀 있었다(commander)

파일 상단 주석이 "`augmentedEdges.length`를 0/1로 단정하는 테스트가 기준"이라고 적었는데
`[실행]` grep 결과 그런 단정이 **한 건도 없었다** — 실제 단정은 `find()`/`!includes()` 형태였고,
이건 **여분의 오탐(false positive)을 하나도 못 잡는** 약한 형태다(positive 테스트는 다른 이름이
더 있어도 통과, negative 테스트는 그 이름 하나만 확인). 기계적 기준을 미리 적어 드리프트를
막으려던 바로 그 문장이 실제 코드와 안 맞는, 이 마일스톤이 반복해서 잡은 실패 모양이었다.

**고침**: `augmentedEdges`의 source 이름 전체 집합을 `assert.deepEqual`로 한 번에 단정하는 테스트
하나를 추가 — 여분 검출까지 포함하는 더 강한 형태(commander 제안 그대로). 기존 개별 테스트는
그 단정에 이미 함의되지만, 시나리오별로 읽기 쉬운 실패 메시지를 남기려고 그대로 뒀다(주석에
"함의됨, 재확인 아님"이라고 명시). 기준 문구도 "집합 전체를 단정하는 테스트"로 정정.

### 결함 2 — `findEnclosingFunction`이 문자열 안 중괄호에 속아 오귀속을 만들었다(reviewer)

reviewer가 실제로 재현: 이미 닫힌 중첩 함수 안에 `"shape: {"` 같은 문자열이 있으면, 그 안의 `{`가
중첩 함수의 진짜 `}`를 상쇄해 깊이가 그 함수의 선언 줄에서 우연히 0으로 떨어진다 — 결과: 진짜
감싸는 함수(`outerCaller`) 대신 **이미 끝난 안쪽 함수(`inner`)를 잘못 지목**한다. 기존 주석이
"false-negative/false-attribution 위험"이라고 이미 이름 댔었지만(comment-vs-code 불일치는 아니었다
— commander가 확인), **미탐과 오귀속은 이 adapter의 다른 모든 한계(전부 미탐 방향)와 성격이
다르다** — 사용자 코드에 대해 틀린 주장을 만드는 유일한 지점이었다.

**고침(commander 제안, `fastapiDependencyAdapter.ts`의 `stripCommentsAndStrings` 재사용은
기각)**: Python 전용 함수를 그대로 가져오면 TypeScript에서 새 오귀속을 만든다 — `//`/`/* */`를
전혀 안 지우고, backtick 템플릿 리터럴(TS에서 `{`가 가장 많이 숨는 자리)도 안 지우고,
`#`을 주석 시작으로 오인한다(TS의 `#`은 private class field, `this.#count` 줄의 나머지가
통째로 잘린다). 대신 **모호하면 기각**: 역방향 스캔 중 괄호와 따옴표/backtick/주석 기호가 같은
줄에 같이 있으면 그 지점에서 스캔을 포기(`undefined` 반환, 이 adapter의 다른 네 실패 경로와 같은
fold-to-abandonment 방향)한다. 오귀속이 미탐으로 바뀐다 — 비용이 몇 줄이고, 진짜 TS-aware
stripper는 별도 검증이 필요한 미래 작업으로 남긴다.

reviewer가 재현한 정확한 모양(`ambiguousBraceInString.ts`)을 negative fixture로 추가 —
`outerCaller`도 `inner`도 안 나오는지 둘 다 확인(둘 중 하나만 확인하면 "다른 이름으로 오귀속"
회귀를 놓친다).

### 결함 3 — trust tier 주석이 실제보다 강한 인상을 줬다(reviewer)

reviewer가 실측: `isTrustedStandardDeclaration`의 두 tier(bundled lib, `@types`) **둘 다 리터럴
세그먼트 이름 일치일 뿐, 진짜 패키지 매니저 출처 검증이 아니다** —
`src/node_modules/typescript/lib/fake.d.ts`(사용자가 직접 만든/커밋한 가짜 `node_modules`)도
`true`를 반환한다. 기존 주석은 "bundled lib이 더 강하다"는 인상을 줬는데 **집행 강도는 둘 다
같다** — 다른 건 그 경로가 진짜 툴체인에서 나왔을 때 무엇을 의미하는가일 뿐. **심각도는
commander/reviewer 둘 다 낮게 평가**(워크스페이스에 파일을 쓸 수 있어야 트리거되고, 이 도구가
이미 갖고 있는 "워크스페이스 코드는 신뢰한다"는 가정과 같은 급) — 기능적으로 막지 않고, 주석을
사실과 맞추고 KNOWN·ACCEPTED RESIDUAL 유닛 테스트 2개로 고정(gate 4의 잔여 pin 관례 그대로).

### 뮤테이션 재확인(전부 `[실행]`, 원복 후 재통과)

- `hasAmbiguousBrace()` 가드를 제거 → 정확히 2개 테스트만 실패(집합-단정 corpus 테스트, 새
  false-attribution 테스트) — 나머지 428개는 그대로 통과. 원복 후 430개 전부 재통과.

**검증 갱신**(전부 `[실행]`, `rm -rf out cli/dist` 후): `npm run cli:test` 433 tests, 430 pass,
0 fail, 3 skip. `npm test` 84/84. `test:vsix-contents`/`test:response-policy` 변동 없이 green.

## 2026-09-09 추가 6 — reviewer의 범위 확인이 commander의 recall 실측으로 이어졌다, 가드를 다시 고쳤다

reviewer가 결함 2 수정 뒤 "막을 필요는 없다"면서도 범위 확인차 남긴 관찰: `hasAmbiguousBrace`가
패턴 매칭보다 먼저 실행되니 **찾는 함수의 선언 줄 자체**가 중괄호+주석(`function outerCaller() {
// handles clicks`, 흔한 스타일)을 같이 가지면 그 줄도 통째로 미탐지된다.

commander가 이걸 "막을 필요 없는 관찰"에서 "정량화가 필요한 결함"으로 승격시켰다 — **이 저장소
자신의 `src/`·`cli/src/` 두 트리에서, allowlist API가 실제로 등장하는 모든 줄을 대상으로 가드
있는/없는 `findEnclosingFunction` 성공률을 직접 쟀다**:

```
src:      가드 없음(안전하지 않음) 55.8%  →  기존 가드(전부-아니면-전무) 28.3%  (해석 가능했던 것의 절반 손실)
cli/src:  가드 없음(안전하지 않음) 64.7%  →  기존 가드(전부-아니면-전무) 34.5%  (마찬가지로 절반 손실)
```

**손실의 원인은 조건이 지나치게 넓어서였다** — "중괄호와 따옴표/backtick/주석 기호가 같은 줄에
같이 있으면"이 전제였는데, 실제 코드에서 이 둘이 **무관하게** 공존하는 흔한 줄(`if (x) { log('a');
}`, 선언 줄 자체의 trailing comment)이 전체 손실의 대부분이었다. **precision corpus만 있고 recall
손실을 잡는 단정이 하나도 없어서, 이 숫자를 아무도 모른 채 merge될 뻔했다** — commander가 지적한
대로 fixture와 가드가 같이 작고 깨끗하게 자라, 가드의 커버리지가 자기 corpus와 정확히 같은
넓이였다(gate 4에서 이미 배운 함정과 같은 모양).

이 세션이 독립적으로 재현(같은 두 트리, 별도로 작성한 스크립트)해 같은 수치(±반올림)를 확인했다.

**고침(commander 제안 (b) 채택 — 조건을 좁힌다, 전체를 포기하지 않는다)**: `hasAmbiguousBrace`를
`stripSameLineCommentsAndStrings()`로 교체 — **중괄호가 실제로 따옴표/주석 *안에* 있을 때만**
무력화하고, 밖에 있으면 정상적으로 센다. 한 줄 안에서만 판단하는 스캐너(여러 줄에 걸칠 수 있는
경우 - 미종결 문자열/블록 주석/backtick, `${...}` 보간 포함 backtick - 는 여전히 안전하게
포기)로, `fastapiDependencyAdapter.ts`의 Python 전용 함수는 여전히 안 썼다.

**실제로 병합된(export된) 함수로 재측정**(프로토타입이 아니라 `cli/dist`에서 직접 import해 확인):

```
src:      가드 없음 55.8%  →  기존 가드 28.3%  →  새 가드 38.3%(해석 가능했던 것의 약 69%를 회복)
cli/src:  가드 없음 64.7%  →  기존 가드 34.5%  →  새 가드 47.8%(약 74%를 회복)
```

**남는 잔여(정직하게 명시)**: 새 가드도 "가드 없음"의 55.8%/64.7%에는 못 미친다 — 남는 손실은
주로 여러 줄에 걸치는 backtick 템플릿 리터럴(이 저장소 자신의 doc-comment 스타일이 즐겨 쓰는
형태)과 `${...}` 보간이다. 이걸 마저 회복하려면 진짜 여러 줄짜리 backtick 추적이 필요하고, 그건
commander가 이미 경고한 "검증이 필요한 별도 작업"의 영역이다 — 이번 lane에서는 안 한다.

`ambiguousBraceInString.ts` fixture는 이제 **정정된 정답**(`outerCaller`가 실제로 candidate로
나옴, `inner`는 여전히 안 나옴)을 고정하도록 갱신했다 — 이전 버전은 "가드가 통째로 포기해서 둘 다
안 나온다"를 고정했는데, 새 가드는 포기하지 않고 **올바르게 해석**하므로 그 기대값 자체가
바뀌었다.

### 뮤테이션 재확인(전부 `[실행]`, 원복 후 재통과)

- `stripSameLineCommentsAndStrings()`를 "아무 것도 안 지우고 원본 줄 그대로 반환"으로 무력화 →
  정확히 그 함수에 의존하는 11개 테스트만 실패(신규 유닛 테스트 9개 + integration 2개), 나머지
  430개는 그대로 통과. 원복 후 441개 전부 재통과.

**검증 갱신 2**(전부 `[실행]`, `rm -rf out cli/dist` 후): `npm run cli:test` 444 tests, 441 pass,
0 fail, 3 skip. `npm test` 84/84 그대로.
