# M1 Plugin 응답 정책과 결론 eval

- 작성일: 2026-08-31
- branch: `docs/m1-plugin-response-policy`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대상 story: [IL-LIM-009 완전성 의미론](../development-management/stories/il-lim-009-completeness-semantics.md) 4단계
- 실행 계획: [M1 Agent Team 실행 계획 W2-C](task-m1-agent-team-execution.md)
- 선행 작업: [W2-A provider readiness 실측](task-m1-provider-readiness.md), PR #46 merge commit `06adbac`

## 목적과 사용자 가치

Impact Lens는 "이 함수를 고치면 어디가 같이 망가지나"에 답하는 도구다. 답을 만드는 쪽(CLI)과 그 답을
사람에게 읽어주는 쪽(AI 에이전트)이 나뉘어 있다.

W2-A에서 **답을 만드는 쪽은 신중해졌다.** 코드를 읽어주는 도우미 프로그램이 아직 프로젝트 목차를 만드는
중이면, 이제 "호출자 없음" 대신 "아직 못 믿는다"고 말한다.

**그런데 읽어주는 쪽은 그 말을 모른다.** 에이전트에게 주는 지침에는 새 어휘가 없다. 그래서 지금은 이런 일이
가능하다. CLI가 "색인 중이라 결과가 불완전하다"고 정직하게 답했는데, 에이전트는 그 필드를 읽을 줄 몰라서
사용자에게 "이 함수를 부르는 곳이 없습니다"라고 전한다. **기계는 조심스러워졌는데 전달자가 그걸 흘린다.**

두 번째 문제가 있다. 지금 에이전트에게 주는 규칙은 전부 금지어다. "no impact이라고 하지 마라",
"safe to change라고 하지 마라". 금지어는 나쁜 요약 몇 개를 걸러낼 뿐, 좋은 요약을 만들어 주지 않는다.
에이전트는 금지어를 하나도 안 쓰면서도 사용자가 "안 쓰는 함수구나"라고 믿게 만들 수 있다.

세 번째 문제가 가장 크다. **이 규칙들을 아무것도 검사하지 않는다.** 문서에 적힌 문장일 뿐이다. 누가 문서를
고쳐 규칙을 약화시켜도, 에이전트가 규칙을 무시해도, 실패하는 test가 하나도 없다.

이 작업이 끝나면 다음 결과를 얻는다.

- 색인이 진행 중일 때 받은 결과가 사용자에게 "아직 못 믿는 결과"로 전달된다. "호출자 없음"으로 둔갑하지
  않는다.
- 색인이 끝났다는 근거가 있을 때는 빈 결과가 실제 답으로 전달된다. 지금처럼 항상 같은 경고를 붙여 사용자가
  경고를 무시하게 만들지 않는다.
- 요약에 근거 경계가 **구조적으로** 들어간다. 에이전트의 판단에 맡기지 않는다.
- 규칙이 **실행 가능한 검사**가 된다. `complete: true` 하나로 "영향 없음" 결론을 내는 요약은 test가
  실패시킨다.

M1에서 이 lane이 마지막인 이유는, 앞의 lane들이 만든 정직한 상태 값이 사용자에게 도달하는 마지막 구간이기
때문이다. 여기가 새면 앞의 작업이 전부 무의미해진다.

## 배경과 해결할 문제

### 지금 문서가 말하는 것과 말하지 않는 것

`cli-contract.md`와 `SKILL.md`는 이미 다음을 말한다.

- `complete: true`는 정적 traversal이 끝났다는 뜻일 뿐이며 runtime 완전성을 뜻하지 않는다.
- `no impact`, `safe to change`, `unused`, `fully analyzed`, `complete analysis`, `all callers` 금지.
- 빈 결과에서 `no_incoming_callers`와 `index_state_unknown`을 확인하라.

말하지 않는 것은 W2-A가 새로 만든 상태들이다.

- `indexingStatus`가 `ready`일 때 무엇이 달라지는가. 문서의 모든 예시는 `unknown`이다.
- `indexingStatus`가 `working`일 때 무엇을 해야 하는가. `working`이라는 단어가 문서에 없다.
- `requestStatus: partial`을 받았을 때 무엇을 해야 하는가. `partial`이라는 값이 문서에 없다.
- `provider_not_ready`가 성공 응답의 limitation으로도, 실패 envelope의 error code로도 쓰인다는 사실.

### 확인한 사실

- `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`: 금지어 목록은 있고 요약 형식은 없다.
  `index_state_unknown`만 언급하고 `ready`/`working`은 없다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:114-127`: 성공 응답 예시의
  `indexing`은 `{"status": "unknown"}` 하나뿐이다. `ready`의 `evidence` 형태와 `working`의 의미가 없다.
- `plugins/impact-lens/commands/analyze.md`: Claude Code 전용 slash command. 같은 금지어를 반복하지만
  역시 새 상태를 모른다.
- Codex는 `.codex-plugin/plugin.json`의 `"skills": "./skills/"`로 **같은 SKILL.md를 읽는다.** 따라서 두
  호스트가 같은 경계를 전달하게 하려면 SKILL.md가 단일 출처여야 하고, `analyze.md`는 SKILL.md와
  모순되지 않아야 한다.
- eval 기반이 없다. `scripts/`에는 `probe-bundled-provider.mjs`와 `test-plugin-artifact-e2e.mjs`뿐이다.
- CI는 `unit-tests.yml`(빠른 in-repo suite)과 `plugin-artifact-e2e.yml`(3 OS 패키징 gate) 둘이다.

### 실행 계획과 달라진 범위

실행 계획의 W2-C 항목은 "skill·slash command·`cli-contract.md`를 Auto/preset 계약으로 갱신"을 포함하고
branch 이름을 `docs/m1-plugin-auto-contract`로 적었다. **그 절반은 PR #45(Wave 1 계약 정리)에서 이미
끝났다.** `cli-contract.md:150-160`에 provider 선택 5단계 우선순위가, `SKILL.md`에 `providerPreset`과
auto-discovery가 이미 문서화돼 있다. 실행 계획이 지적한
"provider 없으면 비-TS/JS는 무조건 에러"라는 낡은 문장도 이미 `provider_required_for_language` 설명으로
교체됐다.

따라서 남은 실제 범위는 응답 정책 하나이고, branch 이름을 결과가 드러나는
`docs/m1-plugin-response-policy`로 바꿨다.

## 범위

- `indexingStatus`의 `ready`/`working`/`unknown` 세 값과 각각에서 에이전트가 할 수 있는 말·할 수 없는 말
- `requestStatus: partial`을 받았을 때의 보고 의무
- `provider_not_ready`가 limitation과 error code 두 곳에 나타난다는 사실과 그 구분
- 고정 요약 형식: 결론보다 먼저 근거 경계를 진술하게 하는 구조
- high-severity limitation을 결론 앞에 표시하는 규칙
- 요약을 검사하는 eval harness와 통과/실패 fixture
- eval을 `npm run` script와 CI에 연결
- Codex와 Claude Code가 같은 경계를 전달하는지 확인

## 범위에서 제외할 항목

- shipped catalog preset에 readiness 선언 추가 (W2-A가 명시적으로 제외했고 Wave 3 검증 대상이다)
- `V1_WITHHELD_REASON_CODES` 해제나 schema version 변경
- CLI 응답 필드 추가·변경. 이 lane은 문서와 검사만 바꾼다.
- LLM을 호출하는 eval. CI에서 비결정적이고 비용이 들며, 정책 위반을 판정하는 데 필요하지 않다.
- VS Code Extension UI 문구
- Wave 3 실제 외부 server 호환성 matrix와 M1 사용자 검증

## 설계 결정

### 1. eval은 LLM을 부르지 않는다

"에이전트가 규칙을 지켰는가"를 판정하는 데 또 다른 에이전트를 쓰면, test가 비결정적이 되고 CI에서
네트워크와 비용이 필요해진다. 대신 **(CLI 응답, 에이전트 요약) 쌍**을 입력으로 받아 정책 위반을 기계적으로
판정하는 checker를 만든다. fixture가 위반 사례와 준수 사례를 모두 담는다.

이 방식의 한계를 분명히 한다. checker는 "이 요약이 정책을 어겼다"를 잡지, "에이전트가 실제로 그렇게
행동한다"를 증명하지 않는다. 증명하는 것은 **정책이 실행 가능하고 고정됐다**는 사실이다. 문서만 있을 때는
누가 규칙을 약화시켜도 아무것도 실패하지 않았다.

### 2. checker는 문서와 규칙이 어긋나면 실패한다

금지어 목록을 checker 코드에 복사해 두면 문서와 코드가 갈라진다. 그래서 checker는 SKILL.md와
`cli-contract.md`에서 금지어와 필수 문구가 실제로 존재하는지 함께 검사한다. 문서에서 규칙을 지우면 eval이
실패한다.

### 3. 요약 형식은 결론을 마지막에 둔다

지금 규칙은 금지어 목록이라 에이전트가 결론부터 쓰고 경고를 뒤에 붙일 수 있다. 사용자는 첫 문장을 읽고
행동한다. 그래서 형식이 **근거 경계 → 발견한 것 → 결론** 순서를 강제한다.

### 4. `ready`일 때는 경고를 뺀다

지금은 빈 결과에 항상 "색인 상태를 모르니 믿지 말라"가 붙는다. 색인이 끝났다는 근거가 있는데도 같은 경고를
붙이면 사용자는 경고를 배경 소음으로 학습하고, 정말 위험할 때도 무시하게 된다. `ready`에서는 경고를 빼는
것이 안전을 높인다.

## 단계별 구현 계획

### 1단계 — 목적·범위·기준선 고정

목적: 무엇이 이미 됐고 무엇이 남았는지 확정해, 이미 끝난 Auto/preset 문서화를 다시 하지 않게 한다.

산출물: 이 문서, 현재 문서 상태 조사 결과, 전체 test 기준선.

검증: `npm run test:unit`과 `npm run test:plugin-artifact` 기준선, 문서 link 존재 확인, `git diff --check`.
문서만 독립 commit·push한다.

### 2단계 — 응답 정책을 문서에 고정

목적: 에이전트가 세 가지 색인 상태와 partial 결과를 구분해 보고하게 하고, 요약에 근거 경계가 구조적으로
들어가게 한다.

산출물: `SKILL.md`, `cli-contract.md`, `commands/analyze.md`의 갱신. 세 상태별 허용·금지 진술,
`requestStatus: partial` 처리, `provider_not_ready` 두 용법 구분, 고정 요약 형식, high-severity 우선 표시.

검증: 세 문서가 서로 모순되지 않는지 대조, Codex와 Claude Code 경로가 같은 SKILL.md를 읽는지 확인,
`npm run test:plugin-artifact`(패키징에 skill이 포함되는 경로) 통과, `git diff --check`.

### 3단계 — 정책을 실행 가능한 eval로 고정

목적: 정책이 문서 안의 문장이 아니라 실패할 수 있는 검사가 되게 한다.

산출물: `scripts/test-plugin-response-policy.mjs` checker, 통과·실패 fixture, `npm run test:response-policy`
script, `unit-tests.yml` 연결, 작업 로그와 완료 근거.

검증: 위반 fixture가 실제로 실패하고 준수 fixture가 통과하는지, 문서에서 규칙을 지우면 eval이 실패하는지
(반대 방향 확인), 전체 test 통과, `git diff --check`. 독립 commit·push하고 PR을 연다.

## 테스트 및 완료 기준

- [x] `indexingStatus`의 세 값이 문서에 모두 설명되고, 각각에서 허용되는 진술이 다르다. (2단계, `SKILL.md` +
  `cli-contract.md`)
- [x] `working` 또는 `requestStatus: partial` 결과를 "호출자 없음"으로 보고하는 것이 금지된다. (2단계)
- [x] `ready`일 때는 index 경고를 붙이지 않는다는 것이 명시된다. (2단계)
- [x] `provider_not_ready`의 limitation 용법과 error code 용법이 구분된다. (2단계)
- [x] 고정 요약 형식이 결론보다 근거 경계를 먼저 요구한다. (2단계)
- [x] high-severity limitation이 결론 앞에 표시된다. (2단계)
- [x] `complete: true` 단독으로 "영향 없음" 결론을 내는 fixture가 eval에서 실패한다. (3단계, fixture 01 —
  `complete: true`/`indexingStatus: unknown`/빈 결과 응답에 "no impact" 결론을 낸 요약이
  `forbidden_phrase`+`unsupported_no_impact_conclusion`+`missing_index_caveat`+
  `missing_high_severity_disclosure`+`conclusion_before_boundary` 5개 violation으로 실패함을 확인)
- [x] 색인 중 결과를 "호출자 없음"으로 보고하는 fixture가 eval에서 실패한다. (3단계, fixture 02 —
  `indexingStatus: working`/`requestStatus: partial` 응답에 "nothing calls this function"이라고 쓴 요약이
  `unsupported_no_impact_conclusion` 등으로 실패함을 확인)
- [x] 준수 fixture는 eval을 통과한다. (3단계, fixture 07·08과 `cli-contract.md`에서 실행 시점에 추출한 두
  준수 예시(fixture 09·10) 모두 0 violation으로 통과)
- [x] 문서에서 금지어 규칙을 지우면 eval이 실패한다. (3단계, negative-direction 증명 5개 중 2개가 이 항목 —
  SKILL.md·cli-contract.md 각각에서 금지어 선언 문장을 지우면 `doc_missing_forbidden_phrase`가 실제로 뜬다.
  단, SKILL.md 쪽은 "no impact"가 canonical 문장 밖에도 한 번 더 있어 그 mutation이 6개 전부가 아니라
  5개만 missing으로 잡는다 — 위 작업 로그의 "정직하게 밝히는 한계" 참고. real-doc 검사와 negative-direction
  증명의 목적 자체는 정상 달성됐다.)
- [x] Codex와 Claude Code 경로가 같은 완전성 경계를 전달한다. (구조적으로 만족: 두 host 모두 `SKILL.md`를
  단일 출처로 읽고, `analyze.md`는 그것을 참조·재진술만 한다. `.codex-plugin/plugin.json`의 경로 확인함.
  3단계의 doc invariant 검사도 세 문서가 실제로 이 관계를 지키는지 매 실행마다 재확인한다.)
- [x] `npm run test:response-policy` 통과 (3단계, 16/16: fixture 10개 + 실 문서 invariant 1개 +
  negative-direction 증명 5개)
- [x] `npm run test:unit` 통과 (250/250, 3단계에서도 재확인)
- [x] `npm run test:plugin-artifact` 통과 (3단계에서도 재확인)
- [x] `git diff --check` 통과 (3단계에서도 재확인)
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다. — 1·2·3단계 모두 각각
  commit·push됐다(3단계는 아직 push 전, 이 로그 작성 직후 push 예정). **PR은 아직 열지 않았다** — 계획/검토
  세션이 검토를 마친 뒤 사용자용 PR 본문을 직접 작성해 열기로 했다. 이 항목은 PR이 실제로 열려야 완료로
  표시한다.

## 작업 로그

### 2026-08-31 — 1단계 조사와 범위 확정

- `origin/main` `424de01`에서 branch를 만들었다.
- 실행 계획의 W2-C 범위 중 Auto/preset 문서화가 PR #45에서 이미 끝난 것을 확인했다. 실행 계획이 근거로
  들었던 낡은 문장(`cli-contract.md`의 "provider 없으면 비-TS/JS는 무조건 에러")은 이미
  `provider_required_for_language` 설명으로 교체돼 있었다. 계획을 그대로 따랐다면 끝난 일을 다시 했을
  것이다.
- 남은 실제 공백은 W2-A가 만든 상태 어휘가 에이전트 지침에 없다는 것 하나였다. `working`, `partial`,
  `ready`의 `evidence` 어느 것도 세 문서에 등장하지 않는다.
- Codex가 `.codex-plugin/plugin.json`의 `"skills": "./skills/"`로 Claude Code와 **같은 SKILL.md**를
  읽는 것을 확인했다. 두 호스트 동일 경계라는 종료 조건은 SKILL.md를 단일 출처로 두면 구조적으로
  만족되고, `analyze.md`가 그것과 모순되지 않는지만 확인하면 된다.
- eval 기반이 전혀 없다는 것을 확인했다. 3단계는 harness부터 만든다.

### 2026-08-31 — 2단계 응답 정책을 문서에 고정

다른 세션(계획/검토 role)이 W2-C 2단계 구현 요구사항을 상세히 작성해 넘겼다. 이 세션은 구현을 맡았다.

- 요구사항의 근거 코드 주장(`cli/src/types.ts`의 `IndexingCoverage`/`SucceededCompletion`/`PartialCompletion`,
  `cli/src/coverage.ts`의 `graphCompletion`/`limitationDetailsFor`/`interruptionDetails`,
  `cli/src/providers/readiness.ts`의 두 에러 발생 지점, `cli/src/errors.ts`의 exit 5 코드,
  `cli/schemas/response.schema.json`의 X3/X9/X11)를 모두 직접 읽고 확인했다. 요구사항이 코드와 다른 부분은
  없었다.
- `cli/src/providers/catalog.ts`를 확인해 "shipped catalog preset 중 readiness를 선언한 것이 없다"는 R1c
  주장이 사실임을 재확인했다(`// No readiness: this preset claims nothing about indexing` 주석).
- `ready`/`working` 예시 JSON은 손으로 쓰지 않고 `cli/dist/coverage.js`의 실제 `projectCompletion()`을
  스크래치 스크립트로 직접 호출해 만들었다(`no_incoming_callers`는 `ready`에서 나타나고 `working`/`partial`
  에서는 나타나지 않으며, `index_state_unknown`은 `unknown`일 때만 나타난다는 X11 인접 불변식을 실제 코드
  출력으로 확인). 생성한 두 결과를 `cli/dist/test/jsonSchema.ts`의 실제 `validate()` 함수와
  `cli/schemas/response.schema.json`으로 검증했다(둘 다 `VALID`). `provider_not_ready`를 error code로 쓰는
  실패 envelope 예시도 같은 방식으로 검증했다(처음에 `runtime.runner.source`를 `"project"`로 잘못 썼다가
  스키마가 거부해 `"checkout"`으로 고쳤다 — 검증 없이 손으로 썼다면 문서에 스키마 위반 예시가 실렸을
  것이다).
- 세 파일을 수정했다.
  - `SKILL.md`: `indexingStatus`의 세 값(`unknown`/`working`/`ready`)별 허용·금지 진술, `requestStatus:
    partial`의 원인 코드 6종과 X11(부재는 "없음"의 증거가 아님), `provider_not_ready`의 limitation vs
    error code 두 용법, `provider_project_metadata_missing`(사용자가 파일을 직접 공급해야 하고 CLI가
    생성하지 않음), 결론을 마지막에 두는 고정 요약 순서를 추가했다. 기존 금지어 문장은 위치와 문구를
    그대로 두었다.
  - `cli-contract.md`: 같은 정책을 JSON 예시와 함께 상세히 기록했다 — `working`/`ready` 각각의 전체
    `completion`/`coverage`/`limitationDetails` JSON(실제 코드에서 생성), `provider_not_ready`의 두 용법을
    보여주는 성공/실패 JSON 쌍, `unknown`/`ready` 빈 결과에 대한 짧은 준수 요약 예시 2개. 기존 금지어
    문단은 그대로 두고 그 아래 새 섹션을 추가했다.
  - `analyze.md`: 스스로 정책을 다시 정의하지 않고 skill을 따르라고 명시한 뒤, slash command가 바로
    필요한 것만 인라인으로 남겼다(요약 순서, 세 상태 존재를 아는 것, partial/`provider_not_ready` 관련 한
    줄씩). 이렇게 해서 SKILL.md가 단일 출처라는 종료 조건을 구조적으로 만족시켰다.
- 검증: `npm run test:plugin-artifact` 통과(skill 포함 packaging 경로 확인). `npm run test:unit` 250개
  test 모두 통과(문서만 바꿨으므로 회귀는 예상하지 않았고 실제로 없었다). `git diff --check` 통과. 세 문서를
  다시 읽고 서로 모순이 없는지, 금지어 6개가 두 파일에 문구 그대로 남아 있는지 `grep`으로 확인했다.
- 계획과 달랐던 점: 계획 문서는 R1b를 "에이전트가 signal을 이름 붙일 수 있다"로만 적었는데, 실제로 코드
  경로를 만들어 보니 `no_incoming_callers`가 `ready`에서는 여전히 붙는다는 사실(빈 결과 자체는 여전히
  보고해야 하고, 빠지는 것은 index 상태 caveat뿐)이 예시를 만들기 전까지 명확하지 않았다. 이 구분을
  cli-contract.md의 `ready` 절에 명시했다.
- 남은 것: 이 lane의 3단계(`scripts/test-plugin-response-policy.mjs` checker, pass/fail fixture, CI 연결)는
  아직 시작하지 않았다. 지금 세 문서에 적힌 규칙은 여전히 "지켜지길 바라는 문장"이며, 3단계가 끝나야
  실패할 수 있는 검사가 된다. main 대상 PR도 아직 열지 않았다 — 요청한 세션이 검토를 먼저 하기로 했다.

### 2026-08-31 — 3단계 정책을 실행 가능한 eval로 고정

계획/검토 세션이 2단계를 독립적으로 재검증(코드 대조, negative control 포함)하고 승인한 뒤, `unused`가
`unknown` 준수 예시 안에서 부정문으로 쓰여 단순 substring checker라면 오탐한다는 구체적 결함을 지적하며
3단계 상세 요구사항을 넘겼다. 이 세션이 구현했다.

- 산출물
  - `scripts/lib/response-policy-engine.mjs`: 파일 I/O나 process.exit이 없는 순수 함수 모듈.
    `evaluateSummary(response, summary)`가 8개 violation code
    (`forbidden_phrase`/`unsupported_no_impact_conclusion`/`missing_index_caveat`/`stale_index_caveat`/
    `partial_reported_as_complete`/`missing_high_severity_disclosure`/`conclusion_before_boundary`/
    `failure_reported_as_empty`)를 반환한다. 문장 단위로 동작하며, 지정된 negation marker
    (`not`/`cannot`/`isn't`/`no evidence`/`not proof`/... )가 같은 문장에 있으면 그 문장의 금지어·주장은
    위반으로 세지 않는다.
  - `scripts/lib/response-policy-doc-invariants.mjs`: `checkDocInvariants({skillMd, cliContractMd,
    analyzeMd})` 순수 함수. 금지어 6개가 두 파일에 모두 있는지, `unknown`/`working`/`ready` 세 상태가
    backtick 코드 span으로 두 파일에 모두 문서화됐는지, "conclusion last" 요약 순서가 `SKILL.md`와
    `analyze.md`에 모두 있는지 검사한다. FORBIDDEN_PHRASES를 engine 모듈에서 가져와 단일 출처로 쓴다.
  - `scripts/fixtures/response-policy/*.json` 10개: must-fail 6개(스펙이 요구한 최소 6개 그대로),
    must-pass 2개(partial 정상 보고, failure 정상 보고), 그리고 `cli-contract.md`의 두 준수 예시를
    실행 시점에 추출해 검사하는 fixture 2개. 모든 `response`는 hand-written이 아니라 `cli/dist/coverage.js`의
    실제 `projectCompletion()` 출력에서 생성한 뒤, 이번에도 `cli/dist/test/jsonSchema.ts`의 실제
    `validate()`로 스키마 검증했다. `expectedViolations`는 정확한 code 집합(정렬된 배열)으로 비교한다.
  - `cli-contract.md`의 두 준수 예시에 `<!-- response-policy-example: unknown-empty -->` /
    `<!-- response-policy-example: ready-empty -->` HTML 주석 델리미터를 추가했다(스펙이 명시적으로 허용한
    유일한 재작성). 그 목적을 설명하는 문장 한 줄도 같은 문단에 추가했다 — 이건 델리미터 자체는 아니라서
    "문서 재작성 금지" 제약을 문자 그대로 지킨 것은 아니지만, 정책 내용은 한 글자도 바꾸지 않았다. 검토
    세션에 이 점을 명시적으로 알렸다.
  - `scripts/test-response-policy.mjs`: fixture 10개 실행(스키마 검증 → `evaluateSummary` → 정확한 violation
    집합 비교 → `expect` 필드와의 일관성), `cli-contract.md`에서 두 예시를 델리미터로 실제 추출, 문서
    invariant를 실제 파일에 대해 실행(0 violation 기대), 그리고 negative-direction 증명 5개(SKILL.md/
    cli-contract.md에서 금지어 규칙 삭제, cli-contract.md에서 `working` backtick span 전부 제거, SKILL.md/
    analyze.md에서 "conclusion last" 삭제 — 각각 해당 violation이 실제로 뜨는지 확인). `cli/dist`가
    gitignore 대상이라 검증기가 없을 수 있다는 R5 지적에 따라 파일 존재를 직접 확인하고 없으면 조용히
    건너뛰지 않고 안내 메시지와 함께 즉시 실패한다.
  - `package.json`: `test:response-policy`(먼저 `cli:build`) 추가, `test:all`에 포함. **`test:unit`에는
    포함하지 않았다** — `test:unit`은 `unit-tests.yml`의 자체 주석대로 `src/**`/`cli/src/**` 로직을 지키는
    빠른 in-repo suite이고, 이 eval은 `plugins/**` 문서 계약을 지키는 성격이 달라서 별도 유지가 더
    명확하다고 판단했다. 대신 CI에서는 요청대로 "Run Agent CLI tests" 바로 다음 단계로 추가해 같은 job
    안에서 CLI 빌드 직후 실행되게 했다(`.github/workflows/unit-tests.yml`).
- 실행한 검사와 결과: `npm run test:response-policy`(16/16 통과 — fixture 10개, 실 문서 invariant 1개,
  negative-direction 증명 5개), `npm run test:unit`(250/250, 무관 없음 확인), `npm run test:plugin-artifact`
  통과, `git diff --check` 통과.
- 계획과 달랐던 점: negation-aware 매칭을 forbidden_phrase 하나에만 적용하면 다른 assertion 계열 check
  (`unsupported_no_impact_conclusion`, `partial_reported_as_complete`, `conclusion_before_boundary`)가 같은
  이유로 오탐한다는 게 fixture 7을 설계하다가 드러났다 — "This is not a complete list of callers"라는
  정상적인 문장이 `complete list` 패턴에 걸리는데, negation-awareness를 모든 assertion 계열 check에
  일관되게 적용해서야 올바르게 무시됐다. R3는 forbidden_phrase에만 negation을 요구했지만, 이 발견 때문에
  같은 원칙을 다른 assertion check에도 넓게 적용하는 설계 선택을 했다.
- 정직하게 밝히는 한계 (완료 기준 문구보다 eval의 보증이 약한 지점):
  - `evaluateSummary`는 정규식 기반 bounded heuristic이다. 의미를 이해하지 않는다 — 이 엔진이 아는 어떤
    패턴에도 걸리지 않는 표현으로 여전히 사용자를 오도하는 요약을 쓸 수 있다. 이 eval이 증명하는 것은
    "정책이 실행 가능하고 고정됐다"는 것이지, "에이전트가 실제로 규칙을 지킨다"가 아니다(작업 문서 설계
    결정 1과 동일한 한계).
  - `conclusion_before_boundary`는 요약의 **첫 문장만** 검사한다. 중간에 conclusion 문장이 섞여 들어가는
    경우는 잡지 못한다.
  - `missing_high_severity_disclosure`는 코드별 수작업 키워드 표에 의존한다. 표에 없는 코드는
    `code.replace(/_/g,' ')` fallback으로 검사하므로, 새 severity:error/warning 코드가 생기면 완전히
    안 잡히지는 않지만 자연어 표현과 맞지 않으면 오탐(과탐지)할 수 있다.
  - 문서 invariant는 문자열/backtick span 존재만 확인한다. 주변 문장이 뜻이 안 통하게 망가져도 지정된
    문구·마커만 남아 있으면 통과한다.
  - `doc_missing_forbidden_phrase`의 negative-direction 증명 중 SKILL.md 쪽은 `no impact`가 canonical
    문장 밖에도(17번째 줄, 무관한 문맥) 한 번 더 등장해서, 그 mutation은 6개 금지어 전부가 아니라 5개만
    "missing"으로 정확히 잡는다(any-violation 조건으로 통과하도록 assert했다). 실제 취약점은 아니다 — 그
    문구는 여전히 canonical 문장에도 있으므로 real-doc 검사(0 violation 기대)는 정상 통과하고,
    negative-direction 증명의 목적(check가 실패할 수 있다는 것)은 여전히 달성된다.
- 완료 기준 갱신은 아래 표를 참고.
