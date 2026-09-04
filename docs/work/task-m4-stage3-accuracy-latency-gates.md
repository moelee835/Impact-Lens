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

## 남은 단계 (미착수)

- **정확도 gate**: fixture corpus 기준임을 측정값과 같은 자리에 명시, corpus 편향 명시, stage 2가
  놓친 미탐(모듈 속성 mount, alias 변수 mount, 괄호 여러 줄 import, 첫 자리 아닌 alias)을 corpus에
  포함, recall은 ground truth 없이 못 재면 못 잰다고 기록(억지 숫자 금지).
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
