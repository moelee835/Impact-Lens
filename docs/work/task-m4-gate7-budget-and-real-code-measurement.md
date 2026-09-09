# M4 gate 7 — false-positive·latency budget 정의, 실제 코드 측정, extension host latency 조사

- 상태: commander 반박 1라운드 반영 완료, 실행 중(산출물 3-1부터)
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
