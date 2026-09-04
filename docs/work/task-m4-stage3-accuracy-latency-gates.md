# M4 stage 3 — 정확도·성능 gate

- 선행: PR #73(stage 2, `9afd560`) merge 완료.
- 마일스톤 단계 3: "LSP-only 비교, ambiguity, false-positive, latency와 rollback fixture를 통과한다."
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m4-stage3-accuracy-latency-gates.md`(commander scratchpad)

## 목적과 사용자 가치

stage 2가 추론 edge를 만들 수 있게 했다. augmentation은 지금 기본 off다 — 안전하지만 아무에게도 도움이
안 된다. 켜려면 두 가지 근거가 필요하다: **틀린 edge를 얼마나 내는지**, 그리고 **얼마나 느려지는지**.
이 lane이 끝나면 그 두 숫자와 **그 숫자가 무엇에 대한 것인지**가 정해진다. 기본값 전환 결정은 그 위에서만
한다 — 이 lane이 결정하지 않는다.

## 순서 — 첫 항목은 gate가 아니다

`plugins/impact-lens/skills/impact-lens-cli/SKILL.md`와 `references/cli-contract.md`가
`augmentedEdges`를 몰랐다(stage 2가 `grep` 0건으로 확인·기록). `maxFiles: 200`은 안 고쳐도 결과가
정직하다(보수적일 뿐, 경고가 같이 나감). 이건 안 고치고 augmentation을 켜면 **정직하지 않은 응답**이
나간다 — agent가 `augmentedEdges`를 배운 적 없이 응답을 읽는다. 그래서 gate보다 먼저 닫는다.

## 단계 1 — plugin skill·cli-contract.md 문서화 (완료)

### 목적과 사용자 가치

agent가 `data.augmentedEdges`(candidate caller)와 `data.edges`(confirmed caller)를 같은 단어로 불러
추측을 확정처럼 전달하는 것을 막는다 — 이 마일스톤 전체가 막으려는 실패를 응답 필드에서 agent의 문장으로
옮겨서 재현하지 않기 위해서다.

### 조사 — 어려운 부분은 필드 목록이 아니라 서술 방식이었다

commander가 지적한 대로, index caveat과 이번 구분은 성격이 다르다. index caveat은 "index"라는 단어
하나를 걸면 됐다. `edges`/`augmentedEdges`의 구분은 **단어가 아니라 서술 방식**이다 — "caller"는 정당한
문맥에서도 쓰이는 단어라 어휘 매칭이 위험하다는 게 commander의 가설이었다.

**직접 측정으로 확인**: `response-policy-engine.mjs`의 `evaluateSummary()`에 (a) `data.edges` 1건 +
`data.augmentedEdges` 1건을 가진 실제 스키마 통과 응답, (b) 둘을 구별 없이 "callers"라고 부르는 요약을
넣고 실행 — **위반 0건**(기존의 무관한 `missing_high_severity_disclosure`만 우연히 걸렸는데, 그마저
"inferred edges"를 언급하지 않아서였다 — 그 문구를 넣자 그것도 사라져 순수하게 0건이 됐다). **이게 이
항목의 진짜 산출물**(commander 예측대로): 이 구분을 어기는 응답이 지금 안 걸린다.

**generic 불확실성 어휘의 위험도 직접 확인**: "not confirmed" 같은 index caveat과 같은 계열의 단어로
구별하려 하면, `stale_index_caveat`이 오작동한다 — 그 체크가 요약 **전체**에서 "index"와 불확실성
단어를 따로따로 찾기 때문에, "provider index is ready"(index 관련, 정상)와 "not confirmed by the
provider"(augmentedEdges 관련, 무관)가 서로 다른 문장인데도 같은 요약 안에 있다는 이유만으로
`stale_index_caveat`이 잘못 발동했다. `response-policy-engine.mjs:136`의 `KNOWN LIMITATION` 절이
경고한 정확히 그 위험(gap 3, 문장 경계로도 못 막는 무관 unrelated 절)을 새 맥락에서 재현한 것이다.

### 결정 — eval 확장은 하되, 좁고 새로운 방식으로

generic 어휘 목록이 아니라 **하나의 필수 고정 문구**("candidate caller")를 채택했다. 이유:
1. 기존 `stale_index_caveat`의 실패 원인(공유 어휘를 여러 체크가 재사용해서 서로 다른 주제를 오인)을
   피한다 — "candidate caller"는 이 새 체크 하나만 쓰는 전용 어휘라 다른 패턴과 절대 안 겹친다.
2. `missing_high_severity_disclosure`가 이미 쓰는 "존재 여부 기반" 패턴(전체 요약에서 특정 문구가
   있는지만 본다, 문장 순서나 귀속을 파싱하지 않는다)과 같은 종류라 이 파일의 기존 정밀도 수준과
   맞는다.
3. **알려진 한계를 그대로 인정한다**: 존재 여부만 보므로, "get_db has two callers: A and B. B is a
   candidate caller."처럼 **먼저 구별 없이 나열하고 나중에 고백하는** 요약은 여전히 안 걸린다 — 직접
   fixture로 확인(0건). `stale_index_caveat`의 기존 5개 미해결 gap과 같은 처리: 지금 당장의 실제
   위험(문서가 이 어휘를 아예 안 가르쳐서 생기는 완전 누락)만 닫고, 정밀도를 더 쫓지 않는다.

### 구현

- `scripts/lib/response-policy-engine.mjs`: `VIOLATION_CODES`에 `augmented_edges_not_distinguished`
  추가. `CANDIDATE_CALLER_PATTERN`(전용 정규식, 다른 패턴과 어휘 공유 없음) 신설. `evaluateSummary()`에
  `data.augmentedEdges`가 비어 있지 않은데 요약에 그 문구가 한 번도 없으면 위반을 내는 검사 추가 —
  `data.augmentedEdges`가 비어 있으면(증거 자체가 없으면) 검사하지 않는다(반대 방향도 확인).
- `scripts/lib/response-policy-doc-invariants.mjs`: `doc_missing_candidate_caller_vocabulary` 신설 —
  SKILL.md·cli-contract.md 둘 다 "candidate caller" 문구를 실제로 담고 있는지 확인(코드가 요구하는
  어휘를 문서가 실제로 가르치는지 고정).
- `scripts/test-response-policy.mjs`: 기존 4개 negative-direction 증명과 같은 방식으로 2개 추가
  (SKILL.md·cli-contract.md 각각에서 "candidate caller" 문구를 지우면 `doc_missing_candidate_caller_vocabulary`가
  실제로 뜨는지). SKILL.md는 "candidate caller"/"candidate callers" 두 문장에 나뉘어 있어 **둘 다**
  지워야 마커가 실제로 사라진다는 것까지 확인(`assert.ok(!/candidate caller/i.test(...))`로 직접 검증).
- `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`: "## Augmented (candidate) edges" 절 신설 —
  kill switch 기본값, "candidate caller" 필수 어휘, `data.edges`/`data.nodes` 불변, 신규 limitation
  코드 2개.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`: 같은 이름의 절 — request/
  response 필드 전체 shape(JSON 예시 포함: `source`/`target`의 `existing`/`synthetic`, `resolution`,
  `evidenceSource`, `reasonCode`), "candidate caller" 규칙 재확인, 두 limitation 코드의 정확한 의미
  (특히 `framework_route_mount_unresolved`가 "mount가 없다"가 아니라 "이 스캔이 확인 못 했다"라는
  구분).
- 신규 fixture 3개(`22`~`24`): 대화 충돌(fail), 올바른 구별(pass), augmentation은 켰지만 candidate가
  없는 경우(pass — 검사가 존재 여부에 게이트돼 있다는 반대 방향 확인).

### 검증

- `npm run test:response-policy`: **32개 체크 전부 pass**(fixture 24개 + doc invariant 1 + negative-
  direction 6). **기존 21개 fixture 전부 무변경**(전수 확인: 새 검사는 `augmentedEdges.length > 0`에
  게이트돼 있고, 기존 fixture 21개 중 `augmentedEdges`를 가진 게 하나도 없다는 것을 `grep`으로 먼저
  확인한 뒤 실행 — commander가 요구한 "새 케이스 통과만 보지 말고 넓힌 패턴이 기존 케이스를 어떻게
  바꾸는지" 확인).
- **non-vacuity, 되돌려서 확인**: `evaluateSummary()`의 새 검사 블록만 임시로 제거 → 재실행 →
  **fixture 22(대화 충돌)만 실패**, 23·24는 그대로 통과(관련 없다는 것 확인) → 원본과 byte-identical
  복원 → 재실행 32/32.
- `npm run test:all`(unit + response-policy + plugin-artifact): 전부 pass.

### 리뷰 후속 (merge 전, 같은 commit 계열)

리뷰어가 PR #75 검토 중 두 가지를 더 찾았다:

1. **반대 방향(과소 주장) 미기록** — `data.augmentedEdges`가 비어 있는데 확정 caller를 "candidate
   caller"라고 낮춰 부르는 경우는 검사도 없고 어디에도 기록이 없었다. 다른 gap들(먼저 나열하고 나중에
   고백하는 경우 등)은 전부 명시적으로 기록돼 있었는데 이 방향만 없어서, "안전해서 안 본다"가 아니라
   "그냥 안 본 것"으로 보일 위험이 있었다. **고치지 않고, `CANDIDATE_CALLER_PATTERN` 주석에 다른 gap과
   같은 자리로 추가**했다 — 과소 주장(안전한 방향)이라 지금 검사하지 않는다는 것을 명시.
2. **정규식과 문서-검사 문구의 결합이 구조적이지 않았음** — `doc_missing_candidate_caller_vocabulary`는
   문서가 "candidate caller" 문구를 담고 있는지만 봤고, `CANDIDATE_CALLER_PATTERN` 정규식이 실제로
   그 문구와 일치하는지는 별개 리터럴("candidate caller")로 따로 유지되고 있었다 — 정규식만 바뀌면
   문서·invariant는 계속 통과하는데 실질 검사는 무력화되는 경로가 있었다. **비용을 먼저 재 보니 쌌다**
   (이미 `FORBIDDEN_PHRASES`가 같은 방식으로 결합돼 있어 그대로 따라가면 됐다): `CANDIDATE_CALLER_PHRASE`
   상수를 `response-policy-engine.mjs`에서 export하고 정규식을 그 상수로부터 생성, `response-policy-
   doc-invariants.mjs`는 그 상수를 import해서 쓰도록 변경 — 한쪽만 바꾸는 게 구조적으로 불가능해졌다.

**검증**: `npm run test:response-policy` 재실행 — **32/32 그대로**(리팩터링이 매칭 동작을 안 바꿨다는
것 확인 — `escapeRegExp('candidate caller')`는 특수 정규식 문자가 없어 원래 정규식 리터럴과 동일한
패턴 문자열을 만든다).

## 단계 2 — 정확도 gate (완료, fixture corpus 기준)

### 목적과 사용자 가치

마일스톤 산출물의 "adapter별 precision/recall **proxy**"에서 `proxy`라는 단어가 핵심이다. 우리가 가진
corpus는 우리가 만든 fixture뿐이라, 그것으로 잰 값은 "우리가 생각해 낸 경우들"에 대한 값이지 실제
FastAPI 코드에 대한 값이 아니다 — 이 구분을 숫자 옆에 안 붙이면 숫자가 거짓말이 된다. 이 마일스톤은
이미 "shipped된 문서가 실제와 다른" 사례를 두 번(clangd `docs.limitations`, CI 버전 pin) 찾아 고쳤다
— "정확도 N%" 같은 숫자는 그 세 번째 사례가 되기 가장 쉬운 형태다.

### 측정 — precision (**이 fixture corpus 기준**, 인용 시 이 문장째로)

**이 fixture corpus 중 precision 판정이 가능한 19개 쿼리(candidate edge를 내야 하거나 내면 안 되는
쿼리)에서 precision은 100%(오탐 0건)다 — 단, 이 값은 이 저장소가 스스로 만든 fixture corpus를 기준으로
한 것이지 실제 FastAPI 코드베이스에 대한 측정이 아니다.** (`npm test` 내
`pythonFastapiIntegration.test.ts`, 2026-09-04 기준 실행 결과로 직접 확인.) **19는 corpus 전체 크기가
아니다** — corpus에는 이 19개 외에 아래 "측정 — 미탐 범위" 절의 미탐(false negative) fixture 4개가 더
있고, 그것들은 "틀린 답"이 아니라 "애초에 판정할 답이 없는 쿼리"라 이 precision 분모에 들어가지
않는다(제외가 숨긴 것이 아니라 분모의 정의상 옳다는 뜻). 근거:

- **candidate edge를 내야 하는 쿼리 6개, 전부 정확히 냈다**(진양성, false positive 0): `Depends()`
  직접 import 참조(alias 없음) 2건(`app.py:get_db`, `real_module.py:get_db`), `app = FastAPI()` 위의
  route handler 2건(`app.py:get_items`, 회귀 고정용 중복 쿼리), 첫 자리·단일 줄 import alias를 통한
  `Depends()` 참조 1건(`alias_target.py`), 순수 `APIRouter()` + bare `include_router(name)`로 실제
  mount된 route handler 1건(`mounted_router.py`).
- **candidate edge를 내면 안 되는 쿼리 13개, 전부 정확히 안 냈다**(진음성/오탐 방지, false positive
  0건): 무관한 일반 호출(`normal_helper`), 이름만 같고 무관한 심볼(`decoy_module.py`), 미mount
  router(`orphan_router.py`), 동적 등록으로만 mount(`dynamic_mount_router.py`), 주석 처리된 mount
  호출, docstring 안 언급, 문자열 리터럴 안 언급, 그리고 이름 충돌(bare/타입 주석/모듈 경유 세
  형태 × 각 2방향 = 6건).

**corpus 편향을 명시한다**: 위 fixture들은 **우리가 실제 버그를 찾은 자리**에서 자랐다 — 이름 충돌,
주석, alias identity 불일치. 이건 실제 FastAPI 코드베이스의 실패 분포 표본이 아니라, **우리가 이미
알고 고친 위험을 다시 안 만드는지 확인하는 회귀 corpus**다. "실제 코드에서 100% 정확하다"고 읽으면
안 된다.

### 측정 — 미탐 범위(precision과 같은 자리에 둔다: "정확한데 거의 안 도는" 기능을 정확하다고만
보고하지 않기 위해)

precision 100%는 "만들어 낸 edge가 전부 옳다"는 것이지 "이 기능이 실제 코드에서 얼마나 자주 도는가"와는
다른 질문이다. **알려진 미탐 4가지를 corpus에 직접 넣어 CLI로 실측했다** — 전부 false negative
방향(엣지를 못 만들 뿐, 틀린 엣지를 만들지 않음)이라 "틀린 답"은 아니지만, 이 기능이 실제 FastAPI
코드베이스에서 얼마나 자주 발동하는지에 대한 실측 증거다:

1. **모듈 속성 mount** — `app.include_router(users.router)`처럼 모듈 경유 접근으로만 mount되면
   `isRouterMounted()`의 bare-identifier 정규식이 못 잡는다(`attr_mount_router.py`/`attr_mount_app.py`
   fixture로 확인 — `augmentedEdges: []`, `framework_route_mount_unresolved` 발생, 거짓 주장 없음).
2. **alias 변수 mount** — router를 다른 파일에서 다른 이름으로 import해 그 별명으로 mount하면
   (`from x import router as users_router`, `include_router(users_router)`) 마찬가지로 못 잡는다
   (`alias_mount_router.py`/`alias_mount_app.py`로 확인).
3. **괄호 여러 줄 import의 alias**(black/isort 기본 출력 형태) — `Depends()` alias 추적 정규식이 한
   줄짜리만 보므로 못 잡는다(`parenthesized_import_target.py`/`parenthesized_import_consumer.py`로
   확인).
4. **import 목록 첫 자리가 아닌 alias** — stage 2가 이미 만든 `alias_uncaught_consumer.py`로 기존에
   확인됨(같은 쿼리가 caught/uncaught 두 alias를 동시에 검증).

**즉 이 기능이 신뢰성 있게 발동하는 조건은 사실상 "bare identifier 단일 mount"와 "첫 자리·한 줄
alias"뿐이다** — 알려진 shape 카테고리 4개 중 절반(2/4: 직접 import, 첫 자리 alias)만 통과한다. 이
비율(아래 "coverage of known shapes")도 fixture corpus 기준 proxy이지 실제 recall이 아니다.

### 측정 — recall (측정 불가, proxy로 무엇을 쓰는지와 그 한계)

**recall은 ground truth 없이 못 잰다 — 못 재면 못 잰다고 쓴다** (`resolution: 'multiple'` gate 항목과
같은 판단). 실제 FastAPI 코드베이스에 이 adapter가 놓친 관계가 총 몇 개인지 알 방법이 없다.

**대신 쓰는 proxy: "known shape coverage" = 이미 카탈로그화된 shape 카테고리 중 탐지되는 것의 비율.**
위에서 확인한 대로 **4개 중 2개(50%)**다(직접 import·첫 자리 alias는 탐지, 모듈 속성·alias 변수
mount·괄호 여러 줄 import·비-첫자리 alias는 미탐). **이 proxy가 대신하지 못하는 것**: 실제 recall은
"실제 코드에 존재하는 모든 관계 중 몇 %를 찾는가"인데, 이 proxy는 "우리가 이미 알고 있는 4가지
shape 중 몇 개를 찾는가"일 뿐이다 — **우리가 아직 카탈로그화하지 못한 shape**(decorator-level
`dependencies=[Depends(target)]`, router-level `APIRouter(..., dependencies=[...])` 등 stage 2가
의도적으로 범위 제외한 것들, 또는 아직 발견 못 한 형태)은 이 proxy에 전혀 반영되지 않는다. 억지로
recall 숫자를 만들지 않았다.

**이 50%가 실제보다 낙관적인지 비관적인지는 우리는 모른다.** 카탈로그화 안 된 shape은 아무도 찔러
보지 않은 것이므로, 이 adapter가 좁은 정규식 기반이라는 점에서 미탐 쪽(50%가 낙관적)일 가능성이
있다고 볼 수는 있지만, 안 찔러 본 shape이 우연히 탐지될 수도 있어 이는 증명되지 않는다. 따라서
**"50%는 상한이다" 같은 방향성 주장은 하지 않는다** — 실제 값이 이보다 나은지 나쁜지 모른다는 사실
자체를 명시할 뿐이다.

### 검증

- fixture 3쌍(파일 6개) 신규 추가(`attr_mount_router.py`/`attr_mount_app.py`,
  `alias_mount_router.py`/`alias_mount_app.py`, `parenthesized_import_target.py`/
  `parenthesized_import_consumer.py`) — 4번째 shape(비-첫자리 alias)는 stage 2의
  `alias_uncaught_consumer.py`를 재사용해 새 fixture를 안 만들었다. 각각 실제 빌드된 CLI
  (`node dist/index.js analyze --stdin`)로 **먼저 직접 실행해 예상된 미탐을 실측 확인한 뒤** 테스트
  단언을 작성(추론으로 끝내지 않음).
- `pythonFastapiIntegration.test.ts`에 "accuracy corpus, known false negative" 절 신규(테스트 3개) —
  각각 `augmentedEdges.length === 0`을 확인하고, mount 관련 2건은 `framework_route_mount_unresolved`가
  (거짓 침묵이 아니라) 실제로 뜨는지까지 확인.
- 전체 스위트: **351 pass, 3 skip(실제 gopls 필요, 기존과 동일), 0 fail.**

## 남은 단계 (미착수)

- **latency**: 무엇을 재는지 먼저 정의. `maxFiles` 값 재검토는 **바꾸기 전에 보고**, 근거를 값 옆에
  기록.
- **`resolution: 'multiple'` gate 문구**: 실증할 구성을 찾거나, 못 찾았다는 근거와 함께 마일스톤 문서
  정정(Spring→FastAPI 방식) — **정정이 필요하다는 결론이 나오면 보고**.
- **rollback**: 켠 상태에서 `nodes`/`edges`·completeness 다섯 필드 불변을 회귀 테스트로 고정(지금은
  구조로만 보장, 테스트로 고정되지 않음).
- corpus 2(`resolution: 'multiple'`)·4a(dedupe)·중첩 dependency fixture — stage 2가 남긴 항목, 각각
  어떻게 할지 이 lane에서 결정.
- 이 lane이 하지 않는 것: 기본값 on 전환(결정은 보고만), 사용자 테스트 명세, 새 adapter, corpus 4b(있으면
  좋지만 필수 아님).
