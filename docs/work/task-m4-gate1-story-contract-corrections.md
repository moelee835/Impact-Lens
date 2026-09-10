# M4 gate 1 — story 계약 정정 (문서 전용 lane)

- 상태: 정정 4건 적용, reviewer 검토 대기 (계획 문서 lane — 코드 변경 없음)
- branch: `docs/m4-gate1-story-contract-corrections`
- 선행: PR #101·#102 merge(gate 7 닫힘). M4는 8개 gate 중 6개 닫힘, 열린 것은 gate 1과 gate 8.
- 요구사항: 사용자가 gate 8(사용자 테스트 명세)을 후속으로 미루고 **남은 gate를 닫으라**고 지시했다.
  남은 것은 gate 1뿐이다.

## 목적과 사용자 가치

**gate 1은 다른 gate와 성격이 다르다.** 나머지 일곱은 각각 검증 가능한 문장 하나였지만, gate 1은
`IL-LIM-001`·`IL-LIM-002`·`IL-LIM-010` **세 story의 수용 기준 14개 전부**를 가리킨다. 그래서 "무엇을
하면 닫히는가"를 판정하는 쪽이 혼자 정하면 그 행위 자체가 **gate를 자기 편의대로 다시 쓰는 것**이 된다.

이 lane은 아무것도 구현하지 않는다. **판정 전에, 기준 문장 자신이 이 저장소의 실제 상태와 어긋난 곳
네 군데를 고친다.** 어긋난 기준 위에서 내린 판정은 통과로 적든 미통과로 적든 둘 다 사실과 다르다.

사용자에게 이것이 왜 중요한가: **M4가 "닫혔다"고 적히는 순간, 그 문장을 읽는 사람은 이 마일스톤이
약속한 것이 전부 됐다고 믿는다.** 실제로는 두 항목이 M4의 노력과 무관하게 불가능하고(provider 부재),
한 항목은 설계상 미뤄져 있으며, 한 항목은 "통과"의 근거가 안전장치가 아니라 기능의 부재다. 이 넷을
기준 문서 자신에 적어 두지 않으면, 나중에 이 저장소에 들어오는 사람이 **없는 보장을 있다고 읽는다.**

## 검증 층위 — 이 문서 전체에 적용

reviewer의 tier 형식을 그대로 쓴다. **이 lane은 전부 층 2다.**

- **층 1(문서 서술)**: 이 저장소의 문서가 하는 주장. 실제 코드가 그런지는 별도.
- **층 2(소스 코드 직접 확인)**: 해당 파일을 직접 열어 확인. 이 문서의 모든 사실 주장이 여기 속한다.
- **층 3(실제 기동)**: 서버를 띄워 응답을 관찰. **이 lane은 층 3을 수행하지 않는다** — 다만 인용하는
  실측 사실(clangd 버전별 동작 차이, `prepare()`의 `emitter` 빈 배열)은 **다른 lane이 층 3으로 이미
  수행한 것**이고, 그 출처를 각각 명시한다.

---

## 정정 1 — `runtime-observation`은 예약된 값이다 (`IL-LIM-001` 수용 기준 1)

**사실** `[층 2]`: `cli/src/types.ts`의 `AUGMENTED_EDGE_SOURCES`에 `runtime-observation`이 선언돼
있지만, 저장소 전체에서 이 값을 **만들어 내는 코드가 없다** — 선언 한 줄 외에 producer·consumer·test
0건.

**판정**: 미통과가 아니다. 유일한 producer는 `IL-LIM-001` **4단계(trace import)**이고, 4단계는 자기
종료 조건에 "보안 검토와 실제 수요가 확인된 경우에만 별도 구현 Issue로 승격"이라고 적어 **설계상
미뤄** 뒀다. **M4가 못 한 일이 아니라 하지 않기로 정해 둔 일이다.**

**결정**: 계약에서 값을 빼지 않는다. 근거 둘 —
1. JSON enum에서 값을 제거하는 것이 나중에 값을 추가하는 것보다 소비자에게 더 큰 사건이다. 그 값을
   이미 옵션으로 다루던 코드는 값이 사라질 때 깨지지만, 새 값이 생기는 건 대부분의 소비자에게 무해하다.
2. 이 저장소가 같은 모양의 문제를 이미 같은 방향으로 풀었다 — `resolution: 'multiple'`을 2026-09-04
   정정이 "코드는 유지하되 gate 대상에서 뺀다"로 처리했다.

**대신 필요한 것**: "지금 어떤 경로도 이 값을 생산하지 않는다"를 **실행으로 지키는 장치.**
`stateReachability*.test.ts`가 이미 `AnalysisObservations`의 각 필드에 대해 정확히 같은 감사를 하고
있으므로 **새 harness를 만들지 말고 그것을 `AugmentedEdgeSource`까지 확장한다**(reviewer 제안 —
같은 패턴을 두 번 발명하지 않는 것이 이 저장소 관례). 4단계가 언젠가 producer를 만들면 그 테스트가
먼저 깨져서 문서가 조용히 낡지 않는다. **이 확장은 코드 변경이라 이 lane 범위 밖이다** — gate 1
판정 lane이 가져간다.

## 정정 2 — event subscription은 구현돼 있다 (`IL-LIM-001` 3단계·수용 기준 2)

**이 lane이 처음에 틀리게 적으려다 reviewer 반박으로 바로잡은 항목이다.** 초안은 "event subscription은
실측으로 불가능 판정됐다"였다. 그대로 나갔다면 **이미 고쳐진 것을 다시 결함으로 기록하는 역행**이었다.

**사실** `[층 2]`: `dynamic-callback-static-v1`이 `addEventListener`(DOM)를 `reasonCode:
event-subscription`으로 실제로 만들고, 통과하는 통합 테스트가 있다
(`cli/src/test/dynamicCallbackIntegration.test.ts`). 빠진 것은 **패턴이 아니라 구현체 하나** — Node
`EventEmitter`의 `emitter.on(...)`.

**그 하나의 상태** `[다른 lane의 층 3 인용]`: `prepare()`가 `emitter` 변수 위에서 빈 배열을 돌려줘
재확인 축이 성립하지 않는다. 세 위치에서 실측했고 대조군까지 확인했지만 **원인은 못 밝혔다.**
추정하지 않는다 — 같은 테스트 파일이 이 사실을 테스트 이름에 그대로 적어 뒀다("unexplored why, not
needed for v1").

**판정**: 수용 기준 2번은 **충족**. 남는 `EventEmitter.on()`은 미충족 사유가 아니라 원인 미확인
상태로 기록된 구현체 공백이다.

## 정정 3 — 언어 matrix 행이 두 방향으로 어긋난다 (`IL-LIM-001` 수용 기준 5)

원래 표의 행은 "C pointer, C++ virtual, Swift protocol/closure, Kotlin interface/lambda"다.

**(1) 이름 댄 넷 중 둘은 M4 안에서 원리적으로 불가능하다** `[층 2]`. `cli/src/providers/catalog.ts`의
preset은 TS/JS·Go·Python·C/C++ 넷뿐 — **Swift와 Kotlin은 분석할 provider 자체가 없다.** 노력으로
좁힐 공백이 아니라 `IL-LIM-002` 5단계와 **같은 구조의 이월**이고, `IL-LIM-015`/`IL-LIM-016`이 닫힐 때
그 story의 gate로 이어받는다.

**(2) 표가 이름조차 대지 않은 둘이 M4 안에서 도달 가능하다 — Go와 Python** `[층 2]`. 표에 없어서
**표만 보고 판정하면 이 둘의 상태가 보이지 않는다.** Swift/Kotlin만 이월로 적으면 "이름 댄 넷 중 둘만
못 했다"로 읽히고 실제로 할 수 있는 쪽이 조용히 빠진다.

**(3) 그리고 실제 공백은 "있다/없다"가 아니라 근거의 층이다** `[층 2, 다섯 preset 전부 직접 확인]`.
다섯 언어 **전부** `docs.limitations`에 gap이 문장으로 적혀 있다. 갈라지는 건 문장 뒤에 무엇이
있느냐다.

| 언어 | gap 문서화 | 근거 인용 | 반복 검증 fixture |
| --- | --- | --- | --- |
| C — function pointer | 있음 | 직접 probe(Apple clangd 17.0.0), 1회성 | **없음** |
| C++ — virtual dispatch | 있음 | 직접 probe, 버전 3종 교차 | **있음**, 버전 분기까지 |
| Go — reflection·runtime dispatch | 있음 | stage 2 직접 probe, 1회성 | **없음** |
| Python — reflection·runtime dispatch | 있음 | **없음** | **없음** |
| TS/JS — dynamic dispatch·reflection | 있음(한 줄) | **없음** | **없음** |

**이 표의 첫 두 행은 초안에서 "C" 한 행으로 뭉쳐 "fixture 있음"이라고 적혀 있었다 — reviewer가 그것이
틀렸다고 잡았고 직접 재확인했다.** `clangdIntegration.test.ts`가 덮는 것은 method/overload/
virtual-dispatch뿐이고 **function pointer는 그 lane의 범위 밖이라고 그 파일 자신이 적어 뒀다.** C의
function pointer는 Go와 **증거 강도가 완전히 같다.** 뭉쳐 적은 표는 같은 기준을 C에는 관대하게, Go에는
엄격하게 적용하고 있었다 — 표가 스스로 세운 기준을 표 자신이 어긴 것이다.

**그 과정에서 새 사례가 하나 더 나왔다** `[층 2]`: `clangdIntegration.test.ts`의 주석은 function pointer가
"already fixture-backed differently, see the story doc"이라고 적지만, `IL-LIM-014`가 실제로 대는 근거는
**fixture가 아니라 1회성 probe**다. 이 저장소가 `task-m4-milestone-closure-audit.md`에 이미 세 건 기록해
둔 **"주석이 주장하는 보장과 코드가 실제로 하는 일이 어긋난 사례"의 네 번째**이고, 앞의 셋과 마찬가지로
**읽기가 아니라 대조로** 발견됐다.

Python 칸에 주석이 필요하다: **같은 preset의 framework gap 줄(route handler/`Depends()`)은 실제
계측까지 돼 있다** — 실제 `fastapi==0.128.8`에 계측을 걸어 확인하고 wire 수준까지 확인한 기록이 주석에
남아 있다. 근거가 없는 것은 **reflection/runtime dispatch 줄** 하나다. "Python은 근거가 없다"로
뭉뚱그리면 이 차이가 지워진다.

**왜 이 차이가 중요한가** `[다른 lane의 층 3 인용]`: clangd의 derived-override virtual dispatch는
**버전에 따라 동작이 바뀌었다** — Apple clangd 17.0.0에서는 caller가 안 잡혔지만 upstream
22.1.7/23.1.0/23.1.1에서는 잡힌다. 반복 fixture가 없었다면 "안 잡힌다"는 문장이 문서에 **영원히 참인
것처럼 남았을 것이다.** 반복 검증 없는 gap 문서화는 **썩는 메커니즘이 이 저장소에서 실제로 관측된**
주장이다.

**가장 약한 칸이 TS/JS라는 것이 이 표의 가장 불편한 부분이다** — 이 마일스톤이 두 번째 adapter를 실제로
만든, 가장 많이 작업한 언어인데 gap 근거가 다섯 중 가장 얇다.

**정확히 세면, 다섯 언어의 다섯 gap 줄 중 반복 검증되는 것은 C++ virtual dispatch 하나뿐이다.**

**그리고 그 하나는, 반복 검증으로 바꾸는 순간 주장이 틀렸다는 게 드러난 바로 그 줄이다** `[다른 lane의
층 3 인용]`. 원래 문구는 derived override에 caller가 **`never`** 붙지 않는다고 단언했는데, 1회성 probe를
반복 fixture로 바꾸자 **첫 3-OS CI 실행이 세 OS에서 동일하게 실패했다** — upstream clangd
22.1.7/23.1.0/23.1.1은 붙인다. Apple clangd 17.0.0을 잰 probe가 틀린 게 아니라 **버전을 안 밝힌
`never`가 과장이었다.**

이 사실이 나머지 네 줄에 대해 말하는 바는 분명하다: **반복 검증으로 바꿔 본 표본이 1건이고, 그 1건이
곧바로 뒤집혔다.** 검증되지 않은 네 줄이 지금 참이라고 믿을 근거는 없다.

**따라서 이 기준은 문서만 고쳐서 닫을 수 없다.** 이 문서의 초안은 "fixture 대량 생산이 아니라 약한 층을
올린다"고 적었다 — 위 재계산 뒤에는 그 표현이 헐겁다. 다섯 중 넷이 fixture가 없는 상태에서 "층을 올린다"는
사실상 "fixture를 만든다"와 같은 말이고, 방치하면 다음 사람이 "문서만 고치면 된다"로 읽는다(reviewer
지적). 요구를 명시적으로 적는다: **각 언어의 대표 gap 줄 최소 하나를 `C++ virtual dispatch`가 이미 도달한
수준(직접 probe + 자동 재검증되는 fixture)까지 끌어올린다.** 어느 gap을 대표로 삼을지와 순서는 gate 1
판정 lane이 정하되, **문구만 손보고 닫는 것은 이 기준을 충족하지 않는다.**

## 정정 4 — "미실행 테스트를 성공으로 표시 안 함"은 부재에 의한 통과다 (`IL-LIM-010` 수용 기준 4)

**사실** `[층 2, 두 host 모두 직접 확인]`: Extension `src/types.ts`의 `TestFreshness`는
`'notRun' | 'outdated'` 둘뿐이고, Agent CLI `cli/src/types.ts`에는 테스트 실행 어휘가 **한 개도 없다.**

**판정**: 통과. 단 **통과의 근거가 안전장치가 아니라 기능의 부재다** — 위반할 기능 자체가 없어서
위반이 구조적으로 불가능하다.

**따라서 이 기준을 위해 새 상태나 새 모델을 만들지 않는다.** 지금 없는 위험을 스스로 만든 다음 그것을
막는 장치를 만드는 일이 된다.

**그리고 `IL-LIM-010` 3단계(실행 결과 import)가 도래하는 순간 이 판정은 재실행되어야 한다.** 3단계는
정의상 stale/partial/failed/passed 어휘를 도입하므로, 그 시점에 근거가 "부재"에서 "장치"로 바뀌고 그
장치는 실제로 검증돼야 한다. **gate가 이미 닫혔다는 이유로 3단계에서 이 항목을 건너뛰지 않는다.**

---

## 이 lane이 하지 않는 것

- **아무 코드도 바꾸지 않는다.** 정정 1이 요구하는 `stateReachability*.test.ts` 확장, 정정 3이 요구하는
  약한 층 보강, `IL-LIM-010`의 미통과 항목(사용자 pattern, 분류 근거 노출) 전부 다른 lane이다.
- **gate 1을 판정하지 않는다.** 이 lane은 판정의 **전제**를 고칠 뿐이다. "gate 1을 닫는다"고 쓰면 이
  문서와 어긋난다 — PR #97이 "gate 1의 실패 격리 항목을 닫는다"로 정확히 인용한 것과 같은 규율이다.
- **story의 `상태:` 필드를 바꾸지 않는다.** 세 story 모두 `Backlog`로 남는다.

## gate 1 판정에 미치는 영향

이 정정 넷을 반영하면 gate 1은 **"전부 통과"로는 닫히지 않는다.** 닫는다면 형태는
**"이월 항목을 이름 대고 닫는다"**이고, 그 이월 목록의 정확성이 곧 판정의 정직성이다. 현재까지
확정된 이월은 셋이며 **성격이 서로 다르다** — 뭉치면 안 된다:

1. **`IL-LIM-002` 5단계(Spring adapter)** — Java/Kotlin 언어 지원(`IL-LIM-018`/`IL-LIM-016`, 둘 다
   M3 소유) 없이는 분석할 provider가 없다. **M4 안에서 착수 불가.**
2. **`IL-LIM-001` 4단계(trace import) = `runtime-observation`** — 설계상 별도 승인 사항.
   **두 항목이 아니라 같은 이월의 두 표현이므로 판정문에서 따로 세지 않는다**(reviewer 지적).
3. **`IL-LIM-001` 수용 기준 5의 Swift·Kotlin 칸** — 1번과 같은 구조(provider 부재).

**반대로, 이월이 아니라 "할 수 있는데 아직 안 한 것"은 이월로 적으면 안 된다.** 현재 그 목록은
`IL-LIM-010`의 사용자 pattern·분류 근거 노출, `IL-LIM-002`의 runtime-only binding fixture,
`IL-LIM-001`·`002`의 조용한 기각(limitation 부재), 그리고 정정 3의 약한 층들이다. 이것들을 이월로
적는 것은 정직하지 않다.
