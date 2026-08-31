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

- [ ] `indexingStatus`의 세 값이 문서에 모두 설명되고, 각각에서 허용되는 진술이 다르다.
- [ ] `working` 또는 `requestStatus: partial` 결과를 "호출자 없음"으로 보고하는 것이 금지된다.
- [ ] `ready`일 때는 index 경고를 붙이지 않는다는 것이 명시된다.
- [ ] `provider_not_ready`의 limitation 용법과 error code 용법이 구분된다.
- [ ] 고정 요약 형식이 결론보다 근거 경계를 먼저 요구한다.
- [ ] high-severity limitation이 결론 앞에 표시된다.
- [ ] `complete: true` 단독으로 "영향 없음" 결론을 내는 fixture가 eval에서 실패한다.
- [ ] 색인 중 결과를 "호출자 없음"으로 보고하는 fixture가 eval에서 실패한다.
- [ ] 준수 fixture는 eval을 통과한다.
- [ ] 문서에서 금지어 규칙을 지우면 eval이 실패한다.
- [ ] Codex와 Claude Code 경로가 같은 완전성 경계를 전달한다.
- [ ] `npm run test:response-policy` 통과
- [ ] `npm run test:unit` 통과
- [ ] `npm run test:plugin-artifact` 통과
- [ ] `git diff --check` 통과
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다.

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
