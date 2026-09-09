# M4 gate 7 — false-positive·latency budget 정의, 실제 코드 측정, extension host latency 조사

- 상태: 산출물 넷 모두 실행 완료(2026-09-09). budget 수치 확정(§4-이후), 두 실제 프로젝트
  precision/recall 전/후 census 완료(§3-3), `maxFiles` 세 숫자 실측 완료(§3-3), extension host
  harness는 여전히 미착수(4절). **이 lane의 최종 판단은 "아직 기본값 on을 권하지 않는다"(5절)** —
  `maxFiles` 조정과 extension host latency가 남은 선행 조건.
- branch: `docs/m4-gate7-budget-and-real-code-measurement`
- 선행: PR #98(Java/Kotlin/Spring 계획) merge 완료. gate 1(실패 격리 항목)·gate 2·gate 3·gate
  4·gate 5·gate 6 닫힘, 열림 2(gate 7, gate 8).
- 근거 문서: `docs/work/task-m4-milestone-closure-audit.md`의 **Gate 7** — "정해진 false-
  positive·latency budget 통과"가 열림으로 판정된 항목. PR #77이 measurement(+41ms)와 tripwire
  (5000ms)는 남겼지만 "얼마나 느리면 too slow인가", "몇 %까지 오탐이 허용인가"라는 **정해진 수치
  자체가 없다.**

## 목적과 사용자 가치

**이번 세션이 만든 두 adapter(`fastapi-static-v1`, `dynamic-callback-static-v1`)는 기본값이
꺼져 있다.** 사용자가 설정을 찾아 켜야만 candidate caller를 본다 — 지금 이 작업이 실제 사용자에게
닿는 유일한 경로는 **기본값 on 전환**이고, gate 7의 budget은 그 전환 결정의 전제 조건이다(종료
감사 문서 자신이 이미 "그 판단은 기본값 on 전환 시점에 나올 값일 수 있다"고 적어 뒀다 — 그 시점이
지금).

**이 lane은 기본값을 뒤집지 않는다.** budget을 정하고 실제로 재는 것까지가 범위다. 전환 자체는
사용자 결정이고, 이 lane은 그 결정에 필요한 근거를 만든다.

**이 lane이 존재하는 더 구체적인 이유**: 이번 세션 자체가 "fixture 통과 ≠ 실제 코드에서 안전함"의
실례를 만들었다. commander가 제안한 모호성 가드(`hasAmbiguousBrace`)는 이 저장소가 가진 fixture를
전부 통과했지만, 이 저장소 자신의 `src`/`cli/src`에서 **해석 가능했던 것의 절반을 잃고 있었다**
(55.8%→28.3%, 64.7%→34.5%, `docs/work/task-il-lim-001-stage3-callback-adapter-design.md`
"2026-09-09 추가 6"). fixture가 가드와 함께 자랐기 때문에 fixture만으로는 원리적으로 이 손실이
안 보였다. **38개 precision corpus 전체가 손으로 만든 fixture다** — 거기서 나온 "오탐 0건"은
"이 shape들에서 오탐 0"이지 "실제 코드에서 오탐 0"이 아니다. budget을 fixture 기준으로만 정하면
같은 함정을 gate 7 자신이 제도화한다.

## 산출물 넷

1. **latency budget 수치 + 근거 + 초과 시 결과**
2. **false-positive budget 수치 + 근거 + 초과 시 결과**
3. **실제 코드 측정** — 두 adapter를 fixture가 아닌 실제 코드베이스에 돌려 재측정
4. **extension host latency 조사(harness는 아직 안 만든다)** — 무엇이 필요하고 비용이 얼마인지
   파악해 보고, 그 정보로 harness를 지금 만들지 여부를 결정

---

## 1. Latency budget

### 지금 있는 것

- PR #77(`8c4c436`): worst-case(200 파일, `maxFiles: 200`) +41ms. `maxFiles`를 400으로 올렸을 때
  +75ms(파일당 약 0.2ms로 선형, `task-m4-stage3-accuracy-latency-gates.md` "2026-09-08" 절).
- latency 회귀 테스트의 tripwire: 5000ms. 이건 "적절한 상한"이 아니라 **무한대로 튀는 회귀**
  (예: `maxFiles` cap이 코드에서 실수로 빠지는 경우)를 잡기 위한 안전망이다 — 실측값(41ms)과
  tripwire(5000ms) 사이에 120배 간극이 있고, 그 사이 어딘가에 "이 정도부터 사용자가 체감한다"는
  실제 budget이 없다.

### `maxFiles: 200`이 실제 규모 프로젝트에서 3배 이상 초과된다(commander — 부차 데이터가 아니라
핵심 근거로 승격)

산출물 3-2(FastAPI 실제 프로젝트 측정, 아래 참고)를 진행하며 `Netflix/dispatch`(실제 프로덕션
코드, 655개 non-test `.py` 파일)를 원본 그대로 워크스페이스로 쿼리했더니 **`maxFiles: 200`
초과로 `augmentation_budget_exceeded`만 돌아오고 아무 candidate도 안 나왔다** — parameter 형태
검증을 위해 `auth`+`database` 서브트리만 176개 파일로 잘라낸 워크스페이스를 **직접 만들어야**
쿼리가 됐다. 사용자는 그렇게 못 한다.

**이건 latency 문제가 아니라 가용성 문제다** — 이 지점의 정확도 결함(§3-2)과 같은 급이고, 어떤
의미로는 더 크다: 정확도 결함은 틀린 답을 내지만 이건 **실제 규모 프로젝트에서 기본값으로 답
자체를 안 낸다.** `augmentation_budget_exceeded`로 정직하게 보고되니 조용히 틀리진 않지만,
사용자가 얻는 건 "예산 초과" 한 줄뿐이다. **"실제 프로젝트에서 200이 맞는 숫자인가"에 대해 지금
가진 유일한 실측이 "실제 프로젝트 하나가 3배 이상 초과한다"는 것이다** — latency budget(아래
제안)뿐 아니라 `maxFiles` 자체의 budget 재검토에도 이 수치를 핵심 근거로 쓴다.

### 제안 — 절대치와 비율 중 더 관대한 쪽(commander 반박으로 정정)

초안은 순수 비율(static traversal 대비 25%)만 제안했는데, **commander가 이 형태의 구조적 결함을
지적했다**: augmentation 비용은 파일 스캔이 지배하고(`maxFiles`/`maxMatchesPerFile`로 budget이
잡혀 있다), **이건 그래프 크기와 거의 무관하다** — 반면 static traversal 시간은 그래프 크기에
따라 수십 배 차이 난다. 그래서 순수 비율은 양쪽 끝에서 반대로 틀린다: **작은 그래프**(static
20ms → budget 5ms)에서는 사용자가 못 느끼는 +30ms를 "150% 초과"로 떨어뜨리고, **큰 그래프**
(static 4000ms → budget 1000ms)에서는 사용자가 체감할 900ms를 통과시킨다 — 사용자가 체감하는 건
비율이 아니라 **추가된 절대 시간**이고, 비율은 "이미 느린 환경을 부당하게 벌주지 않는다"는 데만
쓸모가 있다.

**"augmentation 비용이 그래프 크기와 무관하다"는 주장 자체를 코드를 읽어 확인했다** —
`fastapiDependencyAdapter.ts`/`dynamicCallbackAdapter.ts` 둘 다 `walkPythonFiles`/
`walkSourceFiles`로 **워크스페이스 디렉터리 트리 전체**를 `maxFiles` 상한까지 순회하고,
`existingNodeIds.has(id)`는 정적 traversal이 이미 계산해 둔 `Set`에 대한 O(1) 멤버십 확인일
뿐 반복 횟수를 늘리지 않는다 — 순회 대상이 정적 traversal의 결과(node/edge 개수)가 아니라
워크스페이스 자체의 파일 수라는 뜻이다. **다만 이건 코드 읽기이지 실측이 아니다** — 산출물 3
(실제 코드 측정)이 여러 크기의 실제 쿼리를 재는 과정에서 이 주장을 실측으로 검증하거나 반박한다.

> **제안: `budget = max(절대 허용치, static traversal latency × 비율)`** — 둘 중 더 관대한
> (더 큰) 쪽을 쓴다. 절대 허용치가 작은 그래프를 덮어 "못 느끼는 지연을 초과로 떨어뜨리는" 문제를
> 없애고, 비율이 큰 그래프에서 상한 역할을 한다(다만 augmentation 자체 비용이 구조적으로
> 거의 고정값이라면, 큰 그래프에서는 비율 쪽이 사실상 항상 이겨서 절대 허용치가 작은/중간
> 그래프의 실질적 기준이 되고 비율은 병리적 사례를 위한 안전판 역할만 할 가능성이 높다 — 이것도
> 산출물 3에서 실측으로 확인한다).
> - **절대 허용치 후보**: CLI 실측(+41ms, `maxFiles: 200`)에 여유를 더한 값 — 정확한 숫자는
>   산출물 3의 real-code 측정에서 나오는 실제 augmentation 비용 분포를 보고 정한다(예를
>   들어 관측된 worst-case의 2배 등, 지금 추측하지 않는다).
> - **비율 후보**: 25%(초안 그대로, 여전히 반박 대상 — commander/reviewer가 다른 근거를 제시하면
>   그걸 쓴다).
> - 두 값 모두 산출물 3의 실제 측정 결과로 확정한다.

### 초과 시 결과 — 세 후보 중 하나를 골라야 한다

1. **CI 실패**: 회귀 테스트가 이 budget을 tripwire로 승격해 PR을 막는다. 장점: 회귀를 병합
   전에 잡는다. 단점: CI 환경의 머신 성능 편차(이미 gopls CI job에서 겪은 15분 타임아웃
   flake가 실례)로 노이즈가 클 수 있다.
2. **기본값 off 유지**: budget을 넘는 adapter/시나리오가 있으면 그 adapter는 기본값 on 전환
   대상에서 빠진다 — 다른 adapter는 켜질 수 있다.
3. **adapter 개별 비활성화**: 특정 워크스페이스 크기·구성에서만 자동으로 꺼지는 동적 임계값
   (`maxFiles`류 budget이 이미 하는 것과 유사).

**제안: 지금은 2번(기본값 off 유지)만 채택하고 1번은 이 lane에서 결정하지 않는다.** CI가 절대
latency 임계값으로 PR을 막는 건 이미 있는 5000ms tripwire의 역할과 겹치고, 그 tripwire 자체가
"CI 머신에서 재현 가능한 회귀만 잡는다"는 좁은 목적으로 설계돼 있다(`task-m4-stage3-accuracy-
latency-gates.md`의 5000ms 절 참고, 이 lane이 다시 읽어 재확인함). 이 budget(25%)은 **기본값
on 전환 여부를 결정하는 게이트**이지 매 PR마다 강제하는 CI gate가 아니다 — 그 둘을 같은 숫자로
섞으면 "사용자에게 얼마나 느린가"와 "PR 사이에 얼마나 달라졌는가"라는 다른 질문에 같은 답을 강제
하게 된다. 3번(adapter 개별 비활성화)은 이 lane 범위 밖의 구현 작업이다 — 필요성만 기록한다.

## 2. False-positive budget

### 지금 있는 것

- 38개 corpus(진양성 15/진음성 23), precision 100%(오탐 0건). **이 숫자의 의미 범위가 이미
  두 번 좁혀졌다**(2026-09-07 추가/추가 2, closure audit) — corpus에 없는 shape의 오탐(mount
  오탐)이 실제로 존재했었고, corpus 크기 자체도 반복 재계산됐다.

### 제안 — "0%"를 budget으로 유지하되, 근거를 바꾼다

**정밀도 budget을 "0% 허용"으로 유지할 것을 제안한다** — 다만 그 근거는 "38개에서 0건 나왔으니
0%가 맞다"가 아니라 **이 adapter들의 설계 자체가 이미 "확정 못하면 후보를 안 만든다"는 원칙으로
정착됐기 때문이다**(gate 4의 완전성 논증 — "재확인 실패는 예외를 포함해 언제나 포기로 접힌다",
IL-LIM-001 stage 3의 `prepare()` 재확인 이중 축). **오탐 0%는 corpus 결과가 아니라 설계
불변식이어야 한다** — corpus는 그 불변식이 실제로 지켜지는지 확인하는 수단이지, 목표치를 정하는
수단이 아니다. 이 구분이 중요한 이유: "몇 % 오탐까지는 허용"이라는 숫자를 정하면, 그 숫자 아래로
떨어지는 새 오탐이 발견돼도 "budget 안에 있으니 안 고쳐도 된다"는 정당화가 생긴다 — 이 마일스톤이
gate 4에서 이미 오탐을 발견 즉시 재개방·수정해 온 것과 반대 방향이다.

### 초과 시 결과

**단 하나의 진오탐(corpus 기준이든 실제 코드 기준이든)이 발견되면 그 즉시 별도 lane으로
재개방한다** — gate 4가 이미 두 번 그렇게 처리했다(선례 그대로 따름). "budget을 넘었다"는 표현
자체가 이 gate에는 안 맞는다 — 오탐은 개수 문제가 아니라 발견 즉시 수정 대상이라는 것을
budget이라는 이름 아래 명시한다.

**commander 반박 — 숫자가 아니라 범위가 빠졌었다.** 위에서 미리 표시한 반박("0%는 사실상 budget
없음과 같아 보인다")이 정확했지만, **해법은 숫자를 바꾸는 게 아니라 범위를 붙이는 것**이다. 이
저장소가 이미 이 교훈을 갖고 있다 — "precision 19개 중 0건"은 숫자가 틀린 게 아니라 **의미
범위가 읽히는 것보다 좁았다**(gate 4 재개방 원인). 감사 문서 자신이 그때 "숫자를 지우지 않는다 —
측정의 의미 범위가 이 corpus가 담은 shape으로 한정된다는 것만 명시한다"로 정리했다.

**budget을 이렇게 확정한다: "구성이 명시된 corpus(손으로 만든 38개 fixture + 산출물 3의 실제
코드 corpus)에서 오탐 0건, 하나라도 발견되면 즉시 재개방한다."** corpus 구성이 명시되는 순간
"0%"는 "우리 의도"가 아니라 "이 범위에서 확인된, 반증 가능한 사실"이 된다 — 그 구성이 곧 산출물
3이다. 위 "설계 불변식" 근거(초과 시 결과 절)와 이 범위 명시를 하나로 잇는다: **불변식은
"확정 못하면 후보를 안 만든다"는 설계 자체가 지키는 것이고, 0%는 그 불변식이 명시된 corpus에서
실제로 지켜지는지 확인한 결과다.**

## 3. 실제 코드 측정 — 이 lane의 핵심

### 3-0. 판정 단위와 상한을 프로젝트 선정보다 먼저 정한다(commander 반박으로 추가)

**fixture에는 정답이 있다. 실제 코드에는 없다** — adapter가 낸 candidate 하나하나를 사람이
판정해야 한다는 게 산출물 3의 숨은 비용이라는 지적을 받아들인다. 그러면 **실제 코드 corpus의
크기는 "사람이 판정할 수 있는 개수"로 묶여야 한다** — 프로젝트를 먼저 고르고 나중에 후보가
300개 나오면 이 lane이 안 끝난다.

**상한: 사람이 직접 판정하는 candidate 최대 40개**(손으로 만든 기존 corpus 38개와 같은
자릿수 — 임의값이므로 이것도 반박 대상). TS/Python 각각 이 상한 안에서 측정한다. 실제 프로젝트
(3-2)를 고를 때 grep으로 "이 프로젝트에 존재하는 `Depends()`/`APIRouter`/`include_router`
호출부 개수"를 **먼저 세어**(코드를 열어 패턴을 확인하기 전에, `git clone --depth 1` 후 첫
번째로 하는 일), 40을 넘으면 프로젝트 전체가 아니라 특정 하위 모듈(예: 하나의 API 버전 디렉터리,
core router 모듈만)로 범위를 좁힌다 — 프로젝트를 바꾸는 게 아니라 같은 프로젝트 안에서 측정
범위를 좁히는 쪽을 기본으로 한다(더 작은 프로젝트로 바꾸면 "대표성 있는 실제 코드"라는 산출물
3의 목적 자체가 약해질 수 있어서다).

**측정 스크립트는 커밋한다(commander 반박 — 처음엔 "코드는 안 커밋"만 있었고 스크립트는
언급이 없었다).** 코드(대상 프로젝트 자체)를 안 커밋하는 판단은 유지하지만, **스크립트 없이
commit hash와 절차만 문서에 남기면 아무도 재현하지 않는 숫자가 된다** — 스크립트 + pin된
commit hash면 한 줄로 재현된다는 게 이 저장소가 계속 지켜 온 "숫자에는 재현 경로가 붙는다"는
원칙과 맞는다. 스크립트는 `scripts/` 또는 이 work document와 같은 디렉터리의 세션 스크립트가
아니라 **저장소에 커밋되는 위치**(예: `cli/scripts/measure-real-code-precision.mjs` 또는
동등한 자리, 정확한 위치는 실행 단계에서 정한다)에 둔다 — 대상 프로젝트의 clone 경로만 인자로
받고, 나머지(정답 집합 열거, CLI 호출, 대조)는 스크립트가 재현 가능하게 수행한다.

### 3-1. TypeScript(`dynamic-callback-static-v1`) — 이 저장소 자신

**방법**: 이 저장소의 `src/`와 `cli/src/`(테스트·fixture 제외) 안에서 allowlist가 다루는 표준
callback 위치(`setTimeout`/`setInterval`/`queueMicrotask`/`process.nextTick`/
`addEventListener`/`Array.prototype.forEach|map|filter|find|sort|reduce`)에 **이름 있는 함수가
전달되는 모든 실제 호출부**를 먼저 열거한다(정적으로, grep+수동 확인 — 이 자체가 "무엇이 정답
집합인가"를 정하는 재현 가능한 절차여야 한다). 그다음 CLI를 augmentation on으로 그 이름 있는
함수 각각에 대해 실행해, adapter가 만든 모든 `augmentedEdges` 항목을 **정답 집합과 대조**한다 —
진양성(정답 집합에 있고 adapter도 찾음), 위양성(adapter가 찾았지만 정답 집합에 없음), 위음성
(정답 집합에 있지만 adapter가 못 찾음) 셋으로 분류한다.

**왜 이게 fixture와 다른가**: fixture는 adapter가 다뤄야 한다고 이미 아는 shape만 담는다. 이
저장소 자신의 코드는 **이 adapter를 설계하지 않은 코드**라 shape이 우연히 분포한다 — 정확히
commander가 지적한 "fixture가 가드와 함께 자란다"는 함정을 피하는 유일한 방법이다.

**비용**: 낮다 — 이미 이 저장소 안에 있는 코드, 별도 프로젝트를 구하지 않아도 된다. `stage 3`
설계 과정에서 이미 부분적으로 한 것(recall 측정)을 정밀도 측정으로 확장하는 정도다.

### 3-1 실행 결과(2026-09-09, `[실행]`) — 심각한 결함 2건, 예산 위험 1건. budget 결정 전에
보고한다

`src/`·`cli/src/`에서 allowlist 표준 위치에 이름 있는 함수가 전달되는 실제 호출부 7개를
찾아 CLI를 실제로 실행해 대조했다(`node cli/dist/index.js analyze --stdin`, 각 대상 함수의
선언 위치를 쿼리, `augmentationEnabled: true`):

| 대상 함수 | 위치(호출부) | enclosing 형태 | 결과 |
| --- | --- | --- | --- |
| `finish` | `cli/src/lspProvider.ts:429`(class method `awaitPublishedDiagnostics` 안) | class method | **위음성** — `augmentedEdges: []`, budget 초과 아님 |
| `finish` | `cli/src/lspProvider.ts:601`(다른 class method) | class method | 같은 형태, 같은 결과로 추정(개별 재실행 안 함) |
| `finish` | `cli/src/providers/readiness.ts:211`(class method) | class method | 같은 형태, 같은 결과로 추정(개별 재실행 안 함) |
| `edgeKey` | `src/impactDelta.ts:27-28`(top-level function `computeImpactDelta` 안) | top-level function | **진양성** — `computeImpactDelta`를 정확히 찾음 |
| `diagnosticKey` | `src/impactDelta.ts:49`(top-level function `countAddedDiagnostics` 안) | top-level function | **진양성** — 이미 `existingNodeIds`에 있는 `countAddedDiagnostics`를 정확히 찾음(`kind: 'existing'`) |
| `isStoredNote` | `src/noteStore.ts:319`(class method `loadShared` 안) | class method | **위음성** — `augmentedEdges: []`, budget 초과 아님 |
| `toAdapterItem` | `src/adapterProviderShim.ts:39`(object-literal method `prepare` 안, cross-file) | object-literal method | **오귀속** — 실제로는 `prepare`가 부르는데 바깥의 `createAdapterProvider`(factory 함수)를 후보로 냄 |
| `isPlainCandidate` | `cli/src/providers/resolve.ts:327`(top-level function `executableNotFound` 안, 다만 호출이 `flatMap(preset => ...)`의 화살표 함수 본문 안) | 중첩 화살표(익명) 안의 top-level function | **위음성**, 원인 이 측정에서 완전히 규명 못함(class-method 패턴과 다른 경로로 보임 — 후속 조사 필요) |

**근본 원인 1(확정, 코드 읽기+실행 둘 다로 확인) — `ENCLOSING_FUNCTION_PATTERNS`가 class
method와 object-literal method shorthand를 아예 다루지 않는다.** 이 패턴은 정확히 셋뿐이다
(`function name(`, `const name = (...) =>`, `const name = function(`) — `methodName(...) {`
형태(class method든 object literal method든)는 어느 것도 안 걸린다. 이게 두 가지 다른 실패
모양을 만든다:
- **뒤로 스캔하다 아무 패턴도 못 만나면**: 위음성(`finish`, `isStoredNote`) — 후보를 아예 안 냄.
- **뒤로 스캔하다 안 맞는 scope를 건너뛰고 그 바깥의 맞는 scope에 도달하면**: **오귀속**
  (`toAdapterItem`) — `prepare`(실제로 호출하는 함수)를 건너뛰고 `createAdapterProvider`
  (그 함수를 반환할 뿐 자신은 `toAdapterItem`을 안 부르는 outer factory)를 후보로 낸다. **이건
  단순 위음성보다 나쁘다** — adapter가 "이 함수가 candidate caller다"라고 확신 있게 틀린 답을
  낸다. class method/object-literal method는 이 저장소를 포함해 실제 TypeScript 코드베이스에서
  극히 흔한 형태다 — 이 gap이 fixture corpus(위음성 0건, 오귀속 0건 보고)에 전혀 안 잡힌 이유는
  fixture 12개 중 어느 것도 class method나 object-literal method 안에 콜백을 두지 않았기
  때문이다(직접 확인, `cli/src/test/fixtures/typescript-dynamic-callback/*.ts` 재확인).

**근본 원인 2(확정, 실행으로 확인) — 워크스페이스 루트 자체가 크면 파일-walk budget이 실제
대상 파일에 도달하기 전에 소진될 수 있다.** `workspace: '/Users/woony6/dev/Impact-Lens'`(모노레포
루트, `IGNORED_DIRECTORIES`에 없는 `.claude/worktrees/agent-*`가 이 저장소 전체의 중첩 사본을
여럿 담고 있음)로 같은 `edgeKey` 쿼리를 실행하면 `augmentation_budget_exceeded`가 뜨고
`augmentedEdges: []`가 된다 — `workspace: '/Users/woony6/dev/Impact-Lens/src'`(범위를 좁힌 것)로
바꾸면 정확히 찾는다. **이건 fixture testing이 원리적으로 못 잡는 위험이다** — fixture
워크스페이스는 항상 작고 깨끗하다. 실사용자의 워크스페이스가 크거나(모노레포) 정리 안 된
디렉터리(빌드 산출물이 아닌, `IGNORED_DIRECTORIES`에 없는 큰 형제 디렉터리)를 포함하면 같은
일이 일어날 수 있다.

**표본 7개 중 진양성 2건, 위음성 3건(1건은 원인 미규명), 오귀속 1건 — "38개 corpus에서 오탐
0건"이 real-world reliability를 대표하지 않는다는 gate 7의 전제를, 이 lane 자신의 최소 표본이
그대로 실증했다.**

**이 발견이 budget 산정 순서에 미치는 영향(commander에게 별도 보고, 이 문서엔 판단만 기록)**:
근본 원인 1(class/object-literal method enclosing scope 미지원)은 **budget 수치를 정하는 것보다
먼저 고쳐야 할 수 있는 결함**이다 — 지금 recall/precision 위에 budget을 얹으면, 이미 이 세션이
한 번 겪은 "가드가 fixture를 다 통과하면서 실제 코드에서 절반을 잃고 있었다"는 것과 같은 모양의
실수를 gate 7 자신이 반복하게 된다. 이 work document는 이 판단을 내리지 않는다 — commander의
반박/지시를 기다린다.

### 3-1 결함 수정과 재측정(2026-09-09, `[실행]`) — commander 지시: (a), 별도 PR #99로 분리

commander 지시: 결함(근본 원인 1)을 먼저 고치고, 실제 코드에서 recall을 다시 재고, 고치기
전/후 숫자를 둘 다 보고한다. **근본 원인 2(workspace budget 소진)는 막지 않는다** — 이건
결함이 아니라 "모노레포/중첩 사본이 있는 실제 워크스페이스에서 `maxFiles: 200`이 맞는
숫자인가"라는 budget 산정 자신의 입력 데이터로 남긴다(`augmentation_budget_exceeded`로 이미
정직하게 드러나므로).

**수정 방향(reviewer의 문자열/정규식 채널 발견과 같은 패턴, "세 번째 채널"): 인식 범위를
넓히지 않고 기각(fold-to-abandonment)으로 접는다.** `findEnclosingFunction`이 역방향 스캔 중
depth 0에서 세 패턴 중 어느 것과도 안 맞으면서 "함수처럼 보이는"(식별자 + 괄호 + `{`로 끝남,
제어문 키워드 아님) 줄을 만나면 즉시 `undefined`를 반환하도록 고쳤다 — 오귀속을 위음성으로
바꾼다. `ENCLOSING_FUNCTION_PATTERNS`를 넓히는 대안은 채택하지 않았다(`name() {`가 평범한
호출과 구별이 안 돼 새 오귀속을 만들 위험, doc comment가 이미 지적해 뒀던 것과 같은 위험).
전체 diff와 근거는 PR #99(`fix/dynamic-callback-unrecognized-scope-fold`) 참고 — 이
work document(budget 산정)와 분리된 별도 PR이다(commander 지시: "코드와 판단이 섞이면 리뷰가
둘 다 흐려진다").

**재측정 결과(같은 7개 후보, 고치기 전/후)**:

| 대상 | enclosing 형태 | 고치기 전 | 고치기 후 |
| --- | --- | --- | --- |
| `finish`(lspProvider.ts) | class method | 위음성(빈 배열) | 위음성(빈 배열, 이제 명시적 기각) — **변화 없음** |
| `isStoredNote`(noteStore.ts) | class method | 위음성(빈 배열) | 위음성(빈 배열, 이제 명시적 기각) — **변화 없음** |
| `toAdapterItem`(adapterItemConversion.ts) | object-literal method | **오귀속**(`createAdapterProvider`) | 위음성(빈 배열) — **고쳐짐** |
| `edgeKey`(impactDelta.ts) | top-level function | 진양성(`computeImpactDelta`) | 진양성(`computeImpactDelta`) — 변화 없음(회귀 없음 확인) |
| `diagnosticKey`(impactDelta.ts) | top-level function | 진양성(`countAddedDiagnostics`) | 진양성(`countAddedDiagnostics`) — 변화 없음(회귀 없음 확인) |
| `isPlainCandidate`(resolve.ts) | 중첩 화살표(원인 미규명) | 위음성(빈 배열) | 위음성(빈 배열) — **변화 없음, 원인 여전히 미규명** |

**결과 요약**: 표본 7개 중 정확히 1건(`toAdapterItem`)이 오귀속→위음성으로 바뀌었고, 나머지
6건은 전/후 동일(기존 위음성 2건은 여전히 위음성, 기존 진양성 2건은 회귀 없이 그대로, 원인
미규명 위음성 1건은 이 수정의 대상이 아니므로 그대로). **이 표본에서 진양성 개수 자체는 늘지
않았다** — 이 수정은 recall을 올리는 수정이 아니라 precision을 지키는 수정이다(오귀속 제거).
class method/object-literal method 안의 콜백을 실제로 찾아내려면(recall을 올리려면)
`ENCLOSING_FUNCTION_PATTERNS` 확장이 필요하고, commander가 이미 그건 "별개 결정이고, 한다면
그 자체가 측정이 필요한 작업"이라고 명시했다 — 이 lane은 그 확장을 하지 않는다.

**`isPlainCandidate`의 미규명 원인은 이 lane에서 더 조사하지 않는다** — 근본 원인 1과 다른
경로로 보이고(중첩 화살표 함수 안의 호출), 새 fold 조건의 대상도 아니었다(값이 바뀌지 않은
것으로 확인). 후속 조사 대상으로만 기록한다.

### 네 번째 채널 — 인라인 arrow 인자(commander 발견, 측정만 하고 안 고침)

**PR #99 merge 전, commander가 자신의 probe workspace(이 저장소 코드 아님)로 네 번째 채널을
찾았다.** `items.forEach((i) => { setTimeout(handler, 0); })`처럼 콜백이 **인라인 arrow 함수
인자** 안에 있으면, 그 arrow는 named method처럼 앞에 식별자가 없어서
`ENCLOSING_FUNCTION_PATTERNS`도 새 `UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER` fold도 못 잡는다 —
스캔이 그 arrow를 그냥 지나쳐 바깥 named scope에 도달한다.

**이 세션이 재확인**: `outerSync`(`.forEach` 안의 arrow, sync 실행)와 `outerThen`(`.then()` 안의
arrow, 지연 실행) 둘 다 바깥 함수 이름을 candidate로 낸다는 것을 직접 재현했다. **다만
`createAdapterProvider` 케이스와 같지 않다** — commander의 구분: **동기 고차 순회**(`forEach`/
`map`/...)는 콜백이 바깥 함수의 실행 도중 **실제로 실행되므로** 바깥 함수를 후보로 내는 게
변호 가능하지만, **지연·이벤트 구동**(`then`/`setTimeout`/`addEventListener`)은 등록만 하고
반환하므로 바깥 함수가 그 호출을 직접 일으키지 않는다 — `createAdapterProvider`와 같은 종류의
틀린 답이다. 이 구분은 이 adapter가 이미 갖고 있는 `CallbackCategory`(`deferred`/`event`/
`sync-traversal`) 축과 정확히 겹친다.

**실제 코드 크기 실측(이 세션, 정확한 스크립트로 — `findCallSitesInLine`의 bare-identifier
인자 요구사항을 그대로 복제)**: `src`/`cli/src`의 실제 allowlist 호출부 **31개** 중
**3개**만 인식 못 하는 arrow를 지나며, 셋 다 이미 알려진 `setTimeout(finish, budgetMs)`(bare
`new Promise(resolve => {...})` executor 안)다 — **이 셋은 현재 오귀속을 안 낸다**, 더 바깥의
class method도 인식 못 해서 이번 PR의 fold가 먼저 잡기 때문이다. 즉 이 채널은 실재하지만 **이
저장소 자신의 코드에서는 지금 당장 살아있는 오귀속을 안 낸다** — commander의 재현은 이 채널이
**다른 코드 모양에서는** 오귀속을 낼 수 있다는 것을 보인 것이다.

**고치지 않는다(commander 명시적 지시) — 대신 fixture로 현재 동작을 고정하고 문서화한다.**
arrow opener까지 fold 대상에 넣으면 sync-traversal 케이스(더 흔하고 변호 가능한 쪽)의 recall도
함께 잃는데, 그 비용이 아직 측정 안 됐다 — 처음의 전부-아니면-전무 모호성 가드가 recall
절반을 잃었던 것과 같은 종류의 실수를 반복하지 않기 위해서다. `syncTraversalArrowWrapping.ts`
(변호 가능, "KNOWN, ACCEPTED RESIDUAL")와 `deferredArrowWrapping.ts`(변호 불가, 마찬가지로
"KNOWN, ACCEPTED RESIDUAL" — 다만 정확도 corpus엔 안 넣음, gate 4가 자신의 수용된 잔여를
corpus에서 뺀 것과 같은 이유) 두 fixture로 현재 동작을 고정했다. `findEnclosingFunction`의
doc comment에도 이 구분과 실측 숫자를 남겼다.

**이걸로 이 파일이 같은 결함 클래스(인식 못 하는 scope 경계에서 오귀속이 나는 것)를 네 개의
서로 다른 채널에서 찾은 것이 된다 — 문자열 → 정규식 리터럴 → method-opener → arrow 인자.**
매번 "이건 그냥 위음성"이라고 적어 뒀던 자리가 실측하면 오귀속이었다(또는 오귀속일 수 있었다) —
**방향을 측정하지 않은 "수용된 한계"는 수용된 한계가 아니라는 것**이 이 세션 전체가 반복해서
배운 교훈이다.

**추가(commander 지적) — 위 "3개는 지금 안전하다"는 빌린 안전이지 얻은 안전이 아니다.** 이
세 자리가 안전한 건 gap이 **두 겹으로 쌓여 있기 때문**이다 — class method가 인식 안 돼서
fold되고(1), 그 안의 arrow도 인식이 안 된다(2, 지금 채널). `ENCLOSING_FUNCTION_PATTERNS`에
class method를 추가하는 recall 개선(별개 결정으로 미뤄 둔 항목, 이 lane 앞부분 "결과 요약"
참고)을 하는 순간 (1)의 fold가 없어지고, 스캔이 arrow를 지나쳐 이제는 인식되는 class
method(`setTimeout`, 지연 호출 — 변호 불가 쪽)를 후보로 낸다. **두 미뤄 둔 결정이 커플링돼
있다** — arrow 채널을 먼저 닫는 게 `ENCLOSING_FUNCTION_PATTERNS` 확장의 전제 조건이지, 순서
상관없는 독립 후속 작업이 아니다. 반대 순서로 하면 정확도가 조용히 나빠지고, 그 회귀는
`dynamicCallbackIntegration.test.ts`의 fixture(전부 **현재** 동작을 고정해 둔 것이지 이
커플링이 깨지는 모양은 아니다)로는 안 잡히고 실제 코드에서만 보인다 — 이 lane이 이미 네 번
반복해서 겪은 "fixture는 통과하는데 실제 코드에서 깨진다"는 모양 그대로다.
`findEnclosingFunction`의 doc comment에도 이 커플링을 명시해 뒀다.

### 3-2. Python(`fastapi-static-v1`) — 실제 오픈소스 FastAPI 프로젝트가 필요하다

**이게 이 lane의 첫 판단이다.** 이 저장소엔 실제 크기의 Python/FastAPI 코드베이스가 없다 —
`fastapi-static-v1`을 실제 코드에서 재려면 외부 프로젝트가 필요하고, 구하는 방법에 세 갈래가
있다:

1. **저장소에 실제 프로젝트를 vendoring한다**: CI에서 항상 재현 가능하지만, 라이선스 고지·크기·
   버전 drift(vendored 사본이 업스트림과 갈라짐) 관리 부담이 생기고, pyright를 그 프로젝트
   전체에 대해 CI마다 돌리면 latency budget 측정 자체가 오염된다(측정하려는 대상과 측정 비용이
   섞인다).
2. **fixture를 훨씬 크게 키운다**: 이미 이 lane이 지적하는 함정과 같은 종류다 — 손으로 만든
   fixture가 아무리 커져도 "이 adapter를 의식하지 않고 쓰인 코드"의 대표성은 안 생긴다.
3. **한 번(또는 필요할 때마다) 로컬에서 실제 프로젝트를 clone해 측정하고, 결과와 재현 절차만
   문서에 남긴다 — 코드 자체는 저장소에 커밋하지 않는다.**

**선택: 3번.** 이유:
- 1번의 라이선스/drift/CI 오염 비용을 안 치른다.
- 2번의 "그래도 fixture일 뿐" 함정을 안 반복한다.
- **재현성은 커밋된 코드가 아니라 문서화된 절차(정확한 저장소 URL + commit hash + 실행 명령)로
  확보한다** — 누구든 같은 commit을 다시 clone해 같은 결과를 재현할 수 있다. 이게 "실제 프로젝트
  측정은 못 했다"를 명시적 한계로 남기는 것(세 번째로 commander가 제시한 선택지)보다 나은 이유는,
  실제로 측정을 **하고** 그 결과를 이 문서에 남기기 때문이다 — 완전히 안 재는 것보다 강한 근거를
  준다.
- **대상 프로젝트 후보**: `tiangolo/full-stack-fastapi-template` — FastAPI 제작자 자신이
  유지하는 공식 reference template, `Depends()`/`APIRouter`/`include_router`를 관용적으로
  쓴다(층 1, 아직 실제로 열어 확인 안 함 — commander 반박 전에 코드를 실제로 열어 patterns을
  확인하는 건 이 문서 다음 단계). 규모가 과도하게 크지 않아 pyright 실행 비용이 감당 가능할
  것으로 예상한다(확인 필요).

**방법**: 3-1과 대칭이다 — 실제 clone에서 `Depends()`/`APIRouter(...)`/`include_router(...)`가
쓰인 위치를 grep+수동으로 먼저 열거해 정답 집합을 만들고, `fastapi-static-v1`을 augmentation
on으로 돌려 대조한다.

**측정 결과는 이 저장소에 무엇으로 남기나**: 측정 스크립트(위 3-0 참고, 커밋됨), 이 work
document(또는 그 후속 실행 lane의 work document)에 정확한 commit hash·실행 명령·대조표(정답
집합 vs adapter 출력)를 남긴다 — 대상 프로젝트의 코드 자체만 커밋하지 않는다.

### 3-2 실행 결과(2026-09-09, `[실행]`) — 결함 발견 → 별도 fix lane → 재측정까지 완료

측정 도중 결함을 찾아 별도 fix lane(`docs/work/task-m4-fastapi-depends-enclosing-scope-fix.md`,
branch `fix/fastapi-depends-enclosing-scope`)으로 처리했다 — 전체 과정 요약, 세부 근거는 그
문서 참고:

- **결함**: `findEnclosingDef()`(Depends() 참조의 enclosing 함수를 찾는 함수)가 scope/들여쓰기
  인식이 전혀 없이 "가장 가까운 def"를 반환했다. `Depends()`의 세 실사용 형태 중 **파라미터
  형태만 정상**(실측 확인 — `common_parameters`/`get_current_role`, `Netflix/dispatch`),
  **module-level `Annotated[T, Depends(fn)]` 별칭과 route decorator `dependencies=[Depends(fn)]`
  둘 다 깨져 있었다.** 두 실제 프로젝트(`tiangolo/full-stack-fastapi-template`,
  `Netflix/dispatch`) 모두에서 자기참조·오귀속을 확인했다 — `get_current_active_superuser`
  쿼리는 candidate 4개 중 오탐 2·이름만 맞음 2·위음성 3이었다.
- **gate 4 재개방 아님**: reviewer가 독립 재현 후 판정 — gate 4의 다중-후보 방어는 정상 동작한다
  (두 재현 모두 `enclosingResolved.items.length === 1`). 틀린 건 provider 응답이 아니라
  `resolveEndpoint`에 넘긴 위치 좌표 자체라 다른 실패 모양이다. 별도 이름으로 추적한다(위 fix
  work document 자체가 그 기록).
- **수정**: 형태별 분류 후 형태별 규칙 적용(module-level은 `reference` 능력 부재로 기각,
  decorator는 순방향 탐색, parameter는 무변경) — `docs/development-management/stories/
  il-lim-002-framework-di-routing.md`의 "미해결 질문"에 `reference` 부재 네 번째 항목으로 추가.
- **재측정**: `get_current_active_superuser` 쿼리가 **정답 6개**(`create_user`, `delete_user`,
  `read_users`, `recover_password_html_content`, `test_email`, `update_user`)를 **전부, 그리고
  정확히** 낸다 — 오탐 0, 위음성 0. 자기참조·합성 오귀속 재현 케이스도 전부 기각(정답)으로
  바뀌었다. 새 fixture 4개(module-level self-ref/other-function, decorator 오귀속 한 줄/여러
  줄) 추가, 뮤테이션 검증(수정 비활성화 시 정확히 새 테스트 4개만 실패) 완료, 기존 corpus
  전체(48개) 회귀 없음 확인.
- **이 결함이 gate 7 결론에 미치는 영향**: budget 산정 전에 결함을 먼저 고쳤으므로, 이 corpus의
  "38개 + 실제 코드, 오탐 0건"이라는 최종 문장은 **이 수정이 반영된 상태 기준**이다 — 결함을 안은
  채로 budget을 정했다면 commander가 미리 경고한 순환(오늘 값에 맞춰 budget을 정하는 것)이
  그대로 실현됐을 것이다.

## 4. Extension host latency — 조사, 그리고 commander/reviewer가 이미 좁혀 둔 범위

### 지금 상태

`impactAnalyzer.ts`의 기존 주석이 이미 "CLI의 +41ms를 이 환경에 그대로 쓰면 안 된다"고 못박아
뒀다 — extension host 프로세스 안에서, 매 그래프 갱신마다, Remote-SSH/Container/WSL이면 파일
읽기가 네트워크 왕복이라는 이유다. **이걸 실제로 잰 적은 한 번도 없다.**

### 조사 결과(2026-09-09, `[층 2]` — 공식 문서·sample workflow 직접 확인, 이 저장소에서 실행은
안 함)

`@vscode/test-electron`(공식 VS Code extension 통합 테스트 도구, `il-lim-006-python-fastapi-
e2e.md`와 `task-m1-ci-safety-net.md`가 이미 이 도구를 미래 작업으로 지목해 뒀다)의 공식
저장소(`microsoft/vscode-test`)와 그 sample workflow를 직접 확인했다:

- **실제 VS Code 바이너리를 다운로드한다** — 버전을 지정할 수 있고(`'1.36.1'`, `'insiders'`
  등), `.vscode-test/vscode-{version}` 아래 캐시해 반복 실행 시 재다운로드를 피한다.
- **Linux는 `xvfb-run -a`로 가상 디스플레이가 필요하다** — 지금 이 저장소 CI엔 없다.
- **Windows/macOS는 별도 가상 디스플레이 없이 직접 실행한다.**
- **공식 sample은 3-OS matrix를 안 보여준다** — `ubuntu-latest` 하나만 기본이고, 3-OS로 넓히는
  건 이 저장소가 직접 만들어야 한다.
- **다운로드 크기·실행 시간 자체는 공식 문서에 숫자로 안 나와 있다** — 실제로 한 번 돌려 봐야
  아는 값이다(층 3, 아직 미확인).

### CI 비용 프레이밍 정정(commander가 reviewer 지적을 받아 스스로 정정, 그대로 반영)

최초 판단은 "harness를 만드는 비용이 gate 7과 gate 2의 남은 검증 공백을 동시에 닫을 수 있다"는
것이었는데, **reviewer가 실물 근거로 절반만 맞다고 답했다**: `@vscode/test-electron`은 extension
host 프로세스만 띄우고, **webview는 격리된 iframe이라 extension host 테스트 코드가 그 DOM에
접근할 수 없다.** 이 harness가 실제로 닫는 것은 latency 측정, 실행 기반 off/on 비교, 그리고
약한 의미의 "실제 렌더"(패널 생성이 진짜 VS Code 프로세스에서 예외 없이 되는가)뿐이다.
**marker 시각 구별·라벨 겹침(gate 2의 진짜 미검증 항목)은 이 harness로 안 닫힌다** — harness는
필요조건이지 충분조건이 아니다.

**CI 비용 자체는 이미 이 저장소가 받아들인 범주에 가깝다**: `unit-tests.yml`의 `clangd`
job(`timeout-minutes: 15`)이 이미 3-OS matrix로 매 push마다 LLVM 전체를 설치한다 — 무거운
외부 바이너리를 3-OS에 매번 설치하는 비용 자체는 새롭지 않다. **다른 건 둘뿐이다**: Linux에
가상 디스플레이(`xvfb-run`, 지금 CI에 없음)가 필요하다는 것, VS Code 바이너리 다운로드가 캐시
없이는 느릴 수 있다는 것 — 둘 다 숫자를 모르니 실측 대상으로 남긴다.

### 두 단계로 쪼갠다(commander 지시, 이 lane이 반영)

reviewer가 지적한 위험은 **"latency 재려고 만든 harness가 조용히 gate 2 시각 검증 프로젝트로
번지는" 것** — 이 세션이 이미 이 패턴(범위가 조용히 넓어지는 것)을 여러 번 겪었다. 그래서:

- **1단계 — latency만(이 lane의 범위).** harness를 최소로 띄워 augmentation on/off를 반복
  호출해 실제 extension host 환경에서의 latency 숫자만 낸다. **webview 코드는 전혀 안 건드린다.**
  이게 gate 7이 실제로 필요로 하는 것 전부다. 조사 대상: 다운로드/실행 시간 실측, `xvfb-run`
  setup 비용, 3-OS matrix 구성.
- **2단계 — 시각 검증(이 lane에서 하지 않는다, 별도 결정).** marker 시각 구별·라벨 겹침을
  자동화로 어떻게 닫을지는 여기서 정하지 않는다.

### 시각 항목의 진짜 답은 harness가 아닐 수 있다는 의견(commander, 반박 가능)

2단계로 흔히 나올 법한 안 — "webview 스크립트가 자기 marker의 stroke/bounding rect를 계산해
`postMessage`로 돌려주고 테스트가 단정한다" — 은 **페이지의 자기 보고를 검증하는 것이지 사용자가
보는 것을 검증하는 게 아니다.** 이 마일스톤이 이미 여러 번 만난 "기록됐다 ≠ 드러났다"와 같은
계열의 함정이다. "시각적으로 구별되는가"를 실제로 닫는 건 사람의 눈이고, 그건 **gate 8의 사용자
테스트 명세가 있을 자리**다 — 자동화 harness를 무한히 키우는 것보다 시각 항목을 명시적으로
사용자 테스트로 이관하는 게 정직하고 싸다는 것이 commander의 의견이다. 이 lane은 이 의견에
반박하지 않고 그대로 기록만 한다 — 결정은 gate 8 lane의 몫이다.

### 권고

1단계(latency-only harness)는 **별도의 작은 lane**으로 분리해 진행할 가치가 있어 보인다 —
CI 비용 범주 자체는 이미 받아들여져 있고, gate 7의 extension host 쪽 수치 공백을 직접 채운다.
**이 work document(gate 7 budget 정의)는 그 lane의 착수 여부를 결정하지 않는다** — 산출물
1·2·3(budget 수치, 실제 코드 측정)을 먼저 끝내고, 1단계 harness는 그 뒤 별도 지시로 진행한다.
지금 당장 gate 7의 latency budget(1절)은 CLI 레벨 measurement만으로 정한다 — extension host
쪽 수치가 없다는 것 자체를 gate 7의 명시적 잔여로 남긴다.

## 반박 반영 기록

commander의 1차 반박 셋을 전부 반영했다:

1. **비율 budget의 구조적 결함** — augmentation 비용(파일 스캔 지배, `maxFiles`로 상한)이
   그래프 크기와 거의 무관하다는 주장을 코드를 직접 읽어 확인(`walkPythonFiles`/
   `walkSourceFiles`가 워크스페이스 트리를 도는 것이지 정적 traversal의 node/edge 수를 도는
   게 아님). `max(절대 허용치, 비율 × static latency)`로 정정 — 두 값의 실제 확정은 산출물 3의
   실측으로 미룬다.
2. **"0%"에 범위가 안 붙어 있던 문제** — "구성이 명시된 corpus(38개 fixture + 실제 코드
   corpus)에서 0건, 발견 즉시 재개방"으로 확정. gate 4가 이미 겪은 "숫자는 안 틀렸다, 의미
   범위가 좁았다"는 교훈을 그대로 적용.
3. **실제 코드 corpus의 판정 비용** — 프로젝트 선정 전에 사람이 판정할 수 있는 상한(40개)을
   먼저 정하고, 넘으면 프로젝트를 안 바꾸고 같은 프로젝트 안에서 범위를 좁힌다. 측정 스크립트를
   커밋 대상에 추가(코드는 여전히 안 커밋, 절차만으로는 재현 안 된다는 지적 반영).

## 순서

이 work document를 commander(reviewer는 별도 각을 받았다고 함)에게 먼저 보였다. 반박 셋을
반영했으니 실행 순서:

1. 1·2절의 budget 수치는 3의 실측 결과로 최종 확정한다(현재는 형태·근거만 확정, 숫자는 실측
   후 채움).
2. 3-1(TS 실제 코드 측정)을 먼저 실행 — 비용이 낮고 이 저장소 안에서 끝난다.
3. 3-2(FastAPI 실제 프로젝트)의 대상 선정을 층 1에서 층 2로 올린다(실제로 clone해 코드
   패턴·candidate 개수 확인, 3-0의 40개 상한 적용) — 후보가 부적절하면 다른 후보로 교체.
4. 3-2 측정 실행, 측정 스크립트 커밋.
5. 4절의 조사 결과를 별도로 commander에게 전달 — harness 착수 여부는 별도 결정.

이 다섯 단계는 모두 끝났다. 아래 3-3·5·6절이 그 마지막 산출물이다 — PR #99/#100(둘 다 merge
완료, `f8bb0ff`)로 고친 두 adapter를, commander가 지적한 함정(잘린 워크스페이스에서 잰 latency를
"실제 프로젝트 latency"로 보고하는 것, budget에 갇힌 채 측정해 budget이 순환 근거가 되는 것)을
피해 다시 쟀다.

## 3-3. 최종 재측정(2026-09-09, `[실행]`) — `maxFiles` 실제 비용, precision/recall 전/후 전수 census

### 측정 스크립트를 커밋한다(3-0 결정 이행)

`scripts/gate7-measure-real-code.mjs` — `precision`(정의 위치를 쿼리해 `augmentedEdges` 출력),
`latency`(같은 쿼리를 augmentation on/off로 반복 실행해 중앙값 delta 계산 — CLI/pyright 기동
비용이 지배하는 총 소요시간에서 adapter 자신의 비용만 분리), `walk-order`(`walkPythonFiles()`의
순회 순서를 그대로 복제해, 주어진 파일이 몇 번째 `.py` 파일로 방문되는지 계산 — CLI를 전혀
안 부르는 순수 읽기 전용 스크립트) 세 하위 명령. 대상 프로젝트 자체는 여전히 커밋하지 않는다 —
아래 각 표에 pin된 commit hash로 재현한다.

### `maxFiles`를 실제로 올려서 쟀다(commander 지적 반영 — 잘린 워크스페이스 latency를 보고하지 않는다)

**방법**: 격리된 `git worktree`(공유 작업 트리를 건드리지 않음, 어디에도 push하지 않고 측정 후
바로 제거)에서 `cli/src/shared/adapters/index.ts`의 `DEFAULT_BUDGET.maxFiles`만 200→5000으로
**측정 목적으로만** 바꿔 재빌드했다 — 프로덕션 코드에는 이 변경이 없다(어느 branch에도 커밋
안 됨). `Netflix/dispatch`(`dd2837e82a0bf5565b1b4b4b91ea30b7262d4061`, `IGNORED_DIRECTORIES`
제외 후 717개 `.py` 파일 — `src/`만이 아니라 워크스페이스 루트 전체 기준, 이전 절의 "655"는
`src/` 서브트리만 센 값이었다)을 원본 그대로, 서브트리로 자르지 않고 썼다.

**세 숫자(commander가 요구한 형태 그대로)**:

| 쿼리 | 200 상한(현재 기본값) — 지금 사용자가 겪는 것 | 상한 없음(5000, 717개 파일 전체 스캔) — 상한을 올렸을 때의 비용 |
| --- | --- | --- |
| `get_current_role`(auth/service.py) | off 1145.5ms / on 1168.3ms / **delta 22.9ms**, `augmentation_budget_exceeded: true`, 정답(`common_parameters`) **못 찾음** | off 1149.3ms / on 1330.5ms / **delta 181.3ms**, 정답 정확히 찾음 |
| `get_body`(endpoints.py) | off 1159.3ms / on 1184.8ms / **delta 25.5ms**, budget 초과, 정답 4개(`slack_events`/`slack_commands`/`slack_actions`/`slack_menus`) **전부 못 찾음** | off 1162.1ms / on 1241.0ms / **delta 78.9ms**, 정답 4개 전부 찾음 |
| `get_organization_path`(api.py) | off 1113.0ms / on 1131.5ms / **delta 18.5ms**, budget 초과(다만 이 경우엔 정답이 0개라 우연히 결과는 맞음) | off 1102.6ms / on 1177.8ms / **delta 75.1ms**, 정답 0개(맞음, budget 무관) |

(각 median은 7회 반복, `scripts/gate7-measure-real-code.mjs latency`.)

**언제 상한이 걸리기 시작하는가** — `walk-order` 하위 명령으로 `walkPythonFiles()`의 정확한
순회 순서를 재현해 census 대상 8개 정의 파일이 몇 번째 `.py` 파일로 방문되는지 직접 셌다:

| 파일 | 방문 순서(717개 중) | 200 상한 안에 드는가 |
| --- | --- | --- |
| `api.py` | #15 | 예 |
| `auth/service.py` | #19 | 예 |
| `case/views.py` | #49 | 예 |
| `database/core.py` | #112 | 예 |
| `database/service.py` | **#281** | **아니오** |
| `incident/views.py` | #368 | 아니오 |
| `plugins/dispatch_slack/endpoints.py` | **#531** | **아니오** |

**결론**: `maxFiles: 200`은 717개 파일짜리 실제 프로젝트의 **39%(#281) 지점에서 이미 실패하기
시작한다** — `database/service.py`(`get_current_role`의 정답 `common_parameters`가 있는 파일)가
정확히 그 지점이다. 이 census 안의 worst case(`endpoints.py`, #531)는 전체의 74% 지점까지
가야 한다. **717개 파일 전체를 스캔하는 비용은 절대적으로도 작다**(가장 비싼 쿼리에서도
+181ms, CLI 총 소요시간 ~1.3초 중) — `maxFiles`를 올리는 데 드는 비용은 이미 감당 가능한
수준이라는 뜻이고, 지금 200이 막고 있는 건 "비용이 너무 커서"가 아니라 **숫자 자체가 실제
프로젝트 규모보다 작게 골라졌기 때문**이다.

### precision/recall 전/후 전수 census — 같은 쿼리 8개, 고치기 전(commit `61d055c`, PR #99만
반영·PR #100 이전)과 고친 후(`f8bb0ff`, 현재 `main`)를 나란히

**census 자체**: `Depends(bare_name)` 형태로 dispatch에 존재하는 참조는 전수 **14개**(grep
재확인, 위 walk-order와 같은 `IGNORED_DIRECTORIES` 기준 워크스페이스). 8개 서로 다른 대상
함수로 묶인다 — 사람이 먼저 각 참조의 형태(파라미터/모듈-레벨 별칭/route decorator, 그리고
**이번에 처음 본 네 번째 형태**: `APIRouter(..., dependencies=[Depends(x)])`나
`include_router(..., dependencies=[Depends(x)])`처럼 router 생성·등록 시점에 붙는 의존성 —
어느 def에도 안 속하고, 그 router 아래 모든 route에 걸리므로 module-level 별칭과 같은 이유로
"단일 확정 caller 없음"이 정답이다)를 읽어 사람이 정답을 미리 적었다:

| 쿼리(정의) | 실제 참조(형태) | 사람이 미리 적은 정답 |
| --- | --- | --- |
| `get_organization_path` | api.py:99, `APIRouter(dependencies=[])` | 0개(단일 확정 caller 없음) |
| `get_current_user` | api.py:263·268(router-level ×2), auth/service.py:280(모듈-레벨 별칭), auth/service.py:284(파라미터) | 1개: `get_current_role`만 |
| `get_current_role` | database/service.py:593(파라미터) | 1개: `common_parameters` |
| `common_parameters` | database/service.py:615(모듈-레벨 별칭) | 0개 |
| `get_db` | database/core.py:162(모듈-레벨 별칭) | 0개 |
| `get_body` | endpoints.py:82·107·133·142(파라미터 ×4) | 4개: `slack_events`/`slack_commands`/`slack_actions`/`slack_menus` |
| `get_current_case` | case/views.py:75(모듈-레벨 별칭) | 0개 |
| `get_current_incident` | incident/views.py:73(모듈-레벨 별칭) | 0개 |

정답 합계: 진양성이어야 할 edge 6개, 나머지 8개 참조는 전부 기각(0개)이 정답. **두 실행 모두
`maxFiles: 5000`(위와 같은 측정용 override, 상한에 안 걸리게)으로 실행해 정확도 결함과 가용성
결함(위 §3-3)을 분리했다** — 안 그러면 고치기 전 결과가 budget 초과로도 오염돼 "정확도가
나빠서"인지 "예산이 모자라서"인지 구분이 안 된다.

| 쿼리 | 고치기 전(`61d055c`) | 고친 후(`f8bb0ff`) |
| --- | --- | --- |
| `get_organization_path` | **1개**(자기 자신 — self-ref 오탐) | 0개 — **정답** |
| `get_current_user` | **3개**: `get_current_role`(정답), 자기 자신(self-ref 오탐), `healthcheck`(오귀속 — 순방향 미탐색 시절 이전 라우트 핸들러로 미끄러짐) | 1개(`get_current_role`만) — **정답** |
| `get_current_role` | 1개(`common_parameters`) — 이미 정답(파라미터 형태는 원래 정상이었음, 회귀 없음 재확인) | 1개(`common_parameters`) — 정답, 변화 없음 |
| `common_parameters` | **1개**(자기 자신 — self-ref 오탐) | 0개 — **정답** |
| `get_db` | **1개**(자기 자신 — self-ref 오탐) | 0개 — **정답** |
| `get_body` | 4개(전부 정답) — 이미 정답(파라미터 형태 회귀 없음) | 4개(전부 정답) — 변화 없음 |
| `get_current_case` | **1개**(자기 자신 — self-ref 오탐) | 0개 — **정답** |
| `get_current_incident` | **1개**(자기 자신 — self-ref 오탐) | 0개 — **정답** |

**요약**: 고치기 전 — 진양성 6개(정답 그대로 다 찾음, 파라미터 형태는 원래도 정상이었으므로)
+ **오탐 8개**(모듈-레벨 별칭 6곳 전부 자기참조, `get_current_user`의 router-level 참조 중
하나가 `healthcheck`로 오귀속, `get_organization_path`의 router-level 참조가 자기참조).
고친 후 — 진양성 6개(회귀 없음), **오탐 0개**, 위음성 0개. **네 번째 형태(router/
include_router-level `dependencies=[]`)는 이번 fix가 직접 겨냥한 적이 없는데도 이미 안전하게
기각되고 있었다** — `classifyDependsReferenceContext`의 "그 외는 전부 기각"이 이 형태도
덮는다(뒤로 스캔했을 때 만나는 첫 안 닫힌 괄호가 `def`도 `@decorator`도 아닌 `APIRouter(`/
`include_router(`이므로) — **새 결함이 아니라 기존 fix의 부산물로 이미 닫혀 있었다는 것을
이번에 실측으로 확인했다.**

`tiangolo/full-stack-fastapi-template`(43개 `.py` 파일, `maxFiles: 200`에 전혀 안 걸림 —
`get_current_active_superuser`/`get_db`도 같은 방식으로 고치기 전/후 대조):

| 쿼리 | 고치기 전 | 고친 후 |
| --- | --- | --- |
| `get_current_active_superuser` | **4개**: `read_users`(정답)·`update_user`(정답)·`read_user_by_id`(오탐)·`reset_password`(오탐); 정답 6개 중 **4개 위음성**(`create_user`/`delete_user`/`recover_password_html_content`/`test_email`) | **6개, 전부 정답**(`create_user`/`delete_user`/`read_users`/`recover_password_html_content`/`test_email`/`update_user`) — 오탐 0, 위음성 0 |
| `get_db` | **1개**(자기 자신 — self-ref 오탐) | 0개 — **정답**(`SessionDep = Annotated[Session, Depends(get_db)]`, 단일 확정 caller 없음) |

**두 프로젝트 합산(오늘 재측정)**: 참조 20개(dispatch 14 + template 6), 고치기 전 오탐 10건
(dispatch 8 + template 2)·위음성 4건(template만, dispatch는 0) → 고친 후 오탐 0건·위음성 0건,
진양성 12건(dispatch 6 + template 6) 전부 정확.

## 4-이후. 최종 budget 수치

### Latency budget — 확정

- **`maxFiles`(가용성 budget, 새로 분리해 명시)**: **200은 이 세션이 실측한 두 실제 프로젝트
  중 하나(dispatch, 717파일)에서 39% 지점(#281)에 이미 못 미친다** — 위 §3-3. 717파일 전체
  스캔 비용은 최악 케이스에서도 +181ms(총 소요시간의 14% 미만)로, 비용이 상한을 막는 이유가
  아니다. **이 lane의 권고: `maxFiles`를 최소 2000으로 올린다** — 실측한 두 프로젝트를
  전부 여유 있게 덮고(717×2.8배), 관측된 비용 분포(200파일당 ~20ms, 717파일당 ~80-180ms,
  거의 선형)를 그대로 외삽해도 2000파일에서 +250~500ms 수준으로 아래 절대 허용치 안에
  들어온다. **이 숫자는 이 lane의 제안이고 코드 변경은 하지 않았다** — 프로덕션 값 변경은
  별도 PR과 별도 승인이 필요하다(commander/reviewer 반박 대상).
- **절대 허용치**: 오늘 두 실제 프로젝트에서 관측한 worst-case delta(717파일 전체 스캔,
  `get_current_role` 쿼리) **181ms**의 2배 — **400ms**로 확정한다.
- **비율**: 25%(초안 그대로) — **오늘 실측으로는 검증도 반박도 못 했다**: "off" 측정치
  (~1100-1400ms)는 CLI 기동+pyright `prepare` 비용이 지배해서 순수 static traversal 시간만
  분리하지 못했다. 이 비율은 여전히 미확정 잔여로 남긴다(반박 대상, 이 lane 완료 기준을
  막지 않는다 — `max(400ms, 25%×static)`에서 절대 허용치가 이미 지금까지 관측된 모든 경우의
  실질적 기준이었다).
- **최종 공식**: `budget = max(400ms, 0.25 × static traversal latency)`.
- **초과 시 결과**: 1절의 제안(CI gate 아님, 기본값 on 전환 게이트로만 사용) 그대로 확정.

### False-positive budget — 확정

- **corpus 구성 최종본(각 숫자의 출처를 구분해서 적는다 — "숫자에는 재현 경로가 붙는다"는 이
  lane 자신의 원칙)**:
  - **TS fixture**: `dynamicCallbackIntegration.test.ts`, 오늘 직접 `test(` 재세어 확인한
    **18개**(정확도 corpus에서 뺀 `KNOWN_ACCEPTED_RESIDUAL_SOURCES` 2개 포함, 그 2개는
    "수용된 잔여"로 이미 별도 표시돼 있다 — §3-1의 "네 번째 채널" 참고).
  - **Python fixture**: gate 4 감사 시점에 이미 감사된 **38개**(진양성 15/진음성 23,
    `task-m4-stage3-accuracy-latency-gates.md` 정정 5·6) + PR #100이 추가한 새 fixture
    **4개**(module-level self-ref/other-function, decorator 오귀속 한 줄/여러 줄 — 오늘
    `git show f8bb0ff --stat`로 파일 4개 신규 추가를 직접 재확인). **정확한 새 합계(42로
    추정)는 정정 5·6의 감사 기준을 다시 기계적으로 적용해야 나온다 — 이 lane은 그 재적용을
    안 했다**(추정치를 확정치로 적지 않는다, 이것도 이 lane 자신이 반복해서 지적해 온
    함정이다). 다음에 Python corpus 숫자를 다시 인용할 때는 이 재적용부터 하고 인용한다.
  - **실제 코드 참조(오늘 새로 실측, 손으로 만든 게 아니다)**: dispatch 14 + template 6
    (§3-3, 전수 census) + TS 실제 코드 7(§3-1) = **27개**, 사람이 미리 정답을 적어 둔 뒤
    adapter 출력과 대조 — **이 27개 전체에서 오탐 0건**(고친 후 기준).
  - 이 27개가 이번 lane이 새로 보탠, 손으로 안 만든 유일한 부분이다 — 위 Python 정확한
    합계가 아직 미확정이어도 **27개 실제 코드 corpus의 오탐 0건은 오늘 직접 재확인한
    사실**이라 budget 확정을 막지 않는다.
- **budget**: 2절의 제안("구성이 명시된 corpus에서 0건, 발견 즉시 재개방") 그대로 확정 — 위
  세 구성(TS fixture 18, Python fixture 38+4, 실제 코드 참조 27)이 그 "명시된 corpus"다.

## 5. 이 lane의 판단 — "이 숫자로 기본값 on을 권할 수 있는가"

**아직 아니다.** commander가 측정 전에 미리 표시한 판단과 같은 결론에 도달했다 — 다만 지금은
추측이 아니라 오늘의 실측이 근거다:

1. **정확도 결함은 닫혔다**: PR #99·#100이 오탐 10건(오늘 재측정 기준)을 전부 없앴고, 오늘 새로
   실측한 실제 코드 corpus 27개(§4-이후 위 항목) 전체에서 오탐 0건을 확인했다. 이 축만 보면
   기본값 on을 막을 이유가 없다.
2. **가용성 결함은 진단만 됐고 고쳐지지 않았다**: `maxFiles: 200`은 오늘 실측한 실제 프로젝트
   (dispatch, 717파일) 쿼리 8개 중 **7개에서 예산 초과로 부분/빈 결과를 낸다** — 정확도가
   아니라 "답 자체가 없다"는 문제이고, §3-3이 보였듯 프로덕션 코드는 전혀 안 바꿨다(측정만
   했다). **이 상태로 기본값을 켜면, 정확도는 완벽해진 adapter가 실제 규모 프로젝트 대부분에서
   아무 답도 못 낸다** — 사용자가 얻는 이득이 사실상 없다.
3. **extension host latency는 오늘도 안 쟀다**(4절, 1단계 harness는 별도 결정 사항으로
   남아 있다) — CLI 수치만으로 기본값 on을 결정하면 실제 사용 환경(특히 Remote-SSH/Container/
   WSL)의 체감 비용을 모른 채 켜는 것이다.
4. **오탐 corpus는 여전히 프로젝트 2개뿐**이다 — 실제 코드 참조가 오늘 27개로 늘었지만, "실제
   프로덕션 코드베이스에서 오탐 0"이라는 문장의 대표성은 여전히 좁다.

**다음으로 필요한 것(이 lane의 범위 밖, 별도 lane)**: (a) `maxFiles`를 실제로 올리는 PR(이
문서가 제안한 2000, commander/reviewer 반박 대상) — 정확도 fix가 무의미해지지 않으려면 이게
정확도 fix보다 먼저 또는 함께 가야 한다. (b) extension host 1단계 harness(4절 권고, 아직
미착수). 이 두 가지가 닫히기 전까지 이 lane은 기본값 on을 권하지 않는다 — 뒤집힐 수 있는 잠정
판단이고, 뒤집는 근거는 실측이어야 한다(이 lane 전체가 그래왔듯).
