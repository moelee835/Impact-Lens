# M1 종료 gate 판정과 근거 연결 (lane R3)

- 상태: 진행 중 — PR #54(R1) merge 대기 중인 gate 2개만 미판정
- branch: `docs/m1-gate-closure`
- 상위 문서: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md),
  [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md)
- 선행 lane: R1([`task-m1-compatibility-matrix.md`](task-m1-compatibility-matrix.md), PR #54, merge 대기),
  R2([`task-m1-user-facing-docs.md`](task-m1-user-facing-docs.md), PR #53, merge 완료 `dac76ba`)

## 목적과 사용자 가치

M1의 구현(양방향 LSP, provider preset catalog, `doctor <preset>`, indexing readiness, 요청 단위 provider
override, Extension의 empty/incomplete 구분, plugin 응답 정책)은 이미 전부 `main`에 merge됐고 test는
녹색이다. 그런데 **지금까지는 아무도 "M1이 끝났다"고 문서로 판정할 수 없었다.** `IL-LIM-005`(6개),
`IL-LIM-009`(4개) 수용 기준 체크박스가 전부 `[ ]`였고, milestone 종료 gate 8개와 Wave 2/3 gate도 대부분
미체크였다. 근거 없이 "test가 녹색이니 끝났다"고 판정하면, 실제로는 gate 문구와 구현이 어긋나는 지점
(예: doctor가 "indexing unknown"을 구분한다는 gate 문구와 실제 doctor 구현의 불일치)을 아무도 알아채지
못한 채 v0.7.0을 릴리스하게 된다.

이 lane이 끝나면:
- M1이 실제로 끝났는지, 어느 항목이 왜 아직 끝나지 않았는지를 근거(test 이름, PR 번호, 파일 경로)와 함께
  누구나 확인할 수 있다.
- gate 문구와 구현이 어긋나는 지점(doctor의 indexing 구분)이 숨겨지지 않고 정직하게 기록되며, 어느
  마일스톤이 그 간극을 메울지 명시된다.
- 여러 문서가 PR #49를 서로 다른 lane 이름(W3-A)으로 부르던 혼란이 정리되어, 나중에 읽는 사람이 각 PR이
  실제로 무엇을 증명했는지 재구성할 수 있다.
- M1 종료 gate의 마지막 항목(실제 사용자 검증)에 대한 release decision이 기록되어, R4가 v0.7.0을
  발행할 근거를 갖는다.

## 배경과 해결할 문제

이 작업은 4-lane 병렬 실행(R1~R4) 중 R3다. 원래 계획은 R1·R2가 merge된 뒤 착수하는 것이었지만, 조정
세션(이 작업의 실행 주체)과 계획 세션이 상의해 **R1(PR #54)의 merge를 기다리지 않고 착수**하기로
했다 — 판정 근거 대부분이 이미 `main`(IL-LIM-005 6개 전부, IL-LIM-009 AC1~3)이나 R2(PR #53, merge 완료)에
있고, R1에만 의존하는 gate 2개는 PR #54 인용을 비워두거나 "merge 대기"로 표시하면 되기 때문이다.

**전문 역할(il-*) sub-agent를 쓰지 않는다.** 계획 세션이 7개 agent 역할 정의의 소유 경로를 R3 대상 파일과
대조한 결과, R3의 대상 5개 파일(`stories/**`, `milestones/**`, `docs/work/**`) 중 **어느 것도 어떤 역할의
소유 경로에도 없다.** 소유권 표는 `task-m1-agent-team-execution.md`가 병렬 feature lane의 파일 충돌을
피하려고 만든 장치이고, R3처럼 여러 문서를 가로지르는 단일 스레드 판정 작업에는 애초에 적용 대상이
아니다(Wave 0~2의 어떤 lane도 stories/milestones/docs-work를 건드리지 않았으므로 표에 없는 게 당연하다).
그래서 이 lane은 조정 세션이 직접 수행한다.

## 범위와 범위에서 제외할 항목

**포함**:
- `docs/development-management/stories/il-lim-005-custom-lsp-compatibility.md`의 수용 기준 6개 판정.
- `docs/development-management/stories/il-lim-009-completeness-semantics.md`의 수용 기준 4개 판정.
- `docs/development-management/milestones/m1-provider-platform-ux.md`의 종료 gate 8개 판정.
- `docs/work/task-m1-agent-team-execution.md`의 Wave 2 gate 미체크 3개, Wave 3 표와 gate 판정, 상태 줄 갱신.
- PR #49의 W3-A 자기 표기 정정(이 lane의 owned path 안에서).
- 사용자 검증 보류의 release decision 기록.

**제외(하지 않음)**:
- `docs/work/task-m1-state-reachability.md`, `task-m1-user-test-spec.md`, `task-m1-wave0-handover.md`,
  `task-m1-wave1-handover.md`, `docs/development-management/user-tests/m1-user-test-spec.md` — 이 문서들도
  PR #49를 "W3-A"로 부르지만 R3의 owned path 밖이고 각각 다른 lane의 작업 산출물이다. 임의로 다시 쓰지
  않는다. 아래 "조사 결과"에 위치를 기록해 후속 과제로 남긴다.
- PR #49 자체의 GitHub PR 본문 수정 — 이미 merge된 PR 설명을 사후 편집하는 것은 이 lane의 권한 밖이고,
  이 작업 문서와 `task-m1-agent-team-execution.md`에 정정을 기록하는 것으로 충분하다.
- 코드 변경. 문서·판정 전용 lane이다.
- `docs/development-management/user-tests/m0-user-test-spec.md`의 stale 문구 정정 — 다른 마일스톤 소관,
  후속 과제로만 기록한다.

## 현재 구현 조사 결과

### IL-LIM-005 수용 기준 6개 — 판정 근거

| # | 수용 기준 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 설정 값이 schema 검증을 거쳐 Language Server에 전달된다 | 충족 | `cli/schemas/request.schema.json`의 `initializationOptions`/`settings`(`$defs/configObject`) + `cli/src/test/requestOverrides.test.ts` "a normal provider settings tree is accepted", "the CLI sends request initialization options and settings to the selected provider" |
| 2 | configuration 요청 및 준비 대기가 필요한 fixture가 통과한다 | 충족 | `cli/src/test/bidirectional.test.ts` "answers workspace/configuration asked before/after the initialize result" + `cli/src/test/readiness.integration.test.ts` "a declared progress end reports ready with evidence...", "a proceed-partial budget overrun...", "a fail budget overrun..." |
| 3 | 민감한 설정 값이 stdout·stderr에 임의 노출되지 않는다 | 충족 | `cli/src/test/requestOverrides.test.ts:303` "request-level secrets are redacted from provider failures" |
| 4 | 기존 TypeScript 기본 provider 계약과 결과가 유지된다 | 충족 | `cli/src/test/providers.test.ts:268` "the TypeScript reference preset produces the command the bundled path produced before"(catalog 기반 명령이 preset 이전 하드코딩 명령과 바이트 단위 동일), `:281` "the reference preset claims nothing it cannot prove" |
| 5 | initialize 전후 process crash가 단계·exit/signal·redacted stderr와 함께 재현 가능하게 보고된다 | 충족 | `cli/src/test/contract.test.ts` "preserves initialize exit diagnostics after stderr closes and redacts secrets", "preserves lifecycle and runtime provenance when the provider exits silently", "separates a query-stage provider exit from initialization failure" |
| 6 | build/index 준비가 필요한 provider가 `not_ready`와 실제 empty graph를 구분한다 | 충족 | `cli/src/test/readiness.test.ts:170` "an exceeded fail budget raises provider_not_ready at the indexing stage" + `completion.test.ts` S7/S8("an index that is still working reaches partial/unknown", "an empty result while indexing is never reported as no callers") |

**6개 전부 충족.** story의 "범위" 4단계(실제 외부 server 최소 2종 호환)는 수용 기준 6개 어디에도 없다 —
story 본문이 명시적으로 "M1 이후 후속 milestone에서 다룰 phase"로 분리해 뒀고(4단계의 종료 조건 "최소 2종
외부 server가 별도 client patch 없이 통과"), milestone 문서의 M1 포함 범위도 "generic LSP" 계층만
언급한다. gopls 등 실제 외부 server 검증은 `IL-LIM-004`(M2)의 몫이다. 이 경계를 혼동하지 않는다.

### IL-LIM-009 수용 기준 4개 — 판정 근거

| # | 수용 기준 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 완전 종료, depth/node 제한, provider 미지원과 동적 미추론 상태가 구분된다 | 충족 | `cli/src/test/completion.test.ts` S1(exhausted), S4/S5(depth/node-limited) + `cli/src/test/providers.test.ts:187` "an unsupported language never falls back..."(`provider_required_for_language`) + `completion.test.ts`가 모든 성공 상태에 `dynamic_calls_not_inferred`를 포함함을 assert(예: 151행, 170행) |
| 2 | `complete` 하위 호환 또는 schema migration 전략이 문서화된다 | 충족 | (OR 조건, 두 근거 모두 있음) `docs/development-management/provider-coverage-contract.md:86-94`(`complete: true` ↔ `completion.traversalStatus: "exhausted"` 매핑, 전방 마이그레이션 지침, `schemaVersion: 1` 유지 정책과 v2 승격 조건 — 후보 목록은 `task-m1-state-truth-table.md` §4.3) + `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:117`(같은 매핑을 agent 어휘로, plugin payload로 실제 배포됨). `complete`의 소비자는 README 독자가 아니라 JSON 소비자(agent/plugin/Extension)이므로 사용자 문서에 별도 마이그레이션 서사가 없는 것은 갭이 아니다 |
| 3 | Agent가 limitation을 실제 부재로 요약하지 않도록 contract fixture가 존재한다 | 충족 | `npm run test:response-policy` 16/16(10개 fixture + doc invariant 6개, negative-direction 포함) — 이 문서 작성 시점 `main`(`dac76ba`)에서 직접 재실행해 확인 |
| 4 | README, UI와 CLI schema의 용어가 일치한다 | 충족 | PR #53(merge `dac76ba`) — `README.md`/`INSTALL.md`/`cli/README.md`가 provider 선택 계층·`doctor <preset>`·`.impact-lens/provider.json`·완전성 어휘를 코드와 일치하게 문서화했고, reviewer 검토에서 발견된 `cli/README.md`↔`README.md` 모순(readiness 도달 가능성)도 같은 PR에서 정정해 세 문서(`README.md`/`cli/README.md`/`cli-contract.md`)가 지금 한 목소리를 낸다 |

**4개 전부 충족.**

### milestone 종료 gate 8개 — 판정 근거

| # | gate | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | IL-LIM-005·IL-LIM-009 수용 기준이 모두 통과한다 | 충족 | 위 두 표 |
| 2 | TypeScript reference preset이 기존 bundled 동작과 결과 호환성을 유지한다 | 충족 | IL-LIM-005 AC4와 동일 근거 |
| 3 | missing executable, unsupported version, language mismatch, capability 없음, indexing unknown과 query 실패가 doctor에서 구분된다 | **부분 충족 — gate 문구와 구현이 어긋남** | `cli/src/test/doctor.test.ts`에 missing executable("a missing executable is reported as its own failure with what to install"), unsupported version("an unsupported version is reported separately from an unreadable one"), language mismatch("a language the preset does not serve is reported as a mismatch, not as an empty result"), missing capability("a server without Call Hierarchy is reported as a missing capability"), query 실패("a server that advertises Call Hierarchy but answers nothing fails the fixture") 5개 중 4개는 있다. **그러나 "indexing unknown"은 doctor의 어떤 check에도 없다** — `doctor.test.ts` 전체에 "indexing"이라는 단어가 0회 등장한다(직접 grep 확인). doctor의 check 목록(`node-engine`/`cli-package`/`bundled-provider-artifact`/`provider-executable`/`provider-version`/`language-support`/`settings-keys`/`project-config`, `--smoke`/`--fixture`의 capability·fixture check)에 indexing 관련 항목이 없다. `coverage.indexing.status`(`unknown`/`working`/`ready`)는 W2-A(PR #46)가 **analyze 시점** 개념으로 구현했고 doctor 명령과는 별개다. gate 문구를 쓴 시점에는 doctor가 "indexing unknown"까지 구분할 것으로 예상했지만, 실제 구현은 그 구분을 doctor가 아니라 analyze 응답의 `coverage.indexing`으로 냈다 — **숨기지 않고 있는 그대로 적는다.** 이 gate는 "query 실패"까지는 doctor에서 구분되지만 "indexing unknown"은 구분되지 않으므로 **문자 그대로는 미충족**이다. gate 문구를 실제 구현에 맞게 정정하거나(doctor는 query 실패까지, indexing unknown은 analyze 응답이 구분), doctor에 indexing 관련 check를 추가하는 후속 결정이 필요하다 — 이 판단은 이 lane의 권한 밖이므로 사용자에게 넘긴다 |
| 4 | custom provider 요청과 기존 provider JSON은 하위 호환으로 동작한다 | **PR #54 merge 대기 — merge 후 판정** | R1이 이 gate를 좁게 남아 있던 실제 갭까지 채웠다: `contract.test.ts`의 새 test "an old-style request with only provider command/args/languageId - no preset, no overrides - still completes a successful analysis". 이 test는 아직 `main`에 없다(PR #54 미merge). merge 후 이 표를 갱신한다 |
| 5 | Auto가 검증되지 않은 server를 임의 선택하거나 다른 언어 provider로 fallback하지 않는다 | 충족 | `cli/src/test/providers.test.ts`의 5개 test("an unsupported language never falls back to another language provider" 외 4개) + `cli/src/test/contract.test.ts`의 2개 test("does not launch the bundled TypeScript provider for Python", "rejects an explicit languageId mismatch before launching the provider") + `scripts/test-plugin-artifact-e2e.mjs`의 `selectedBy`/`languageMatch` assert. 전부 이미 `main`에 있다(PR #54와 무관) |
| 6 | Plugin이 `complete: true`만으로 runtime 영향 없음이나 indexing 완료를 주장하지 않는 fixture가 통과한다 | 충족 | `npm run test:response-policy` 16/16(`main` `dac76ba`에서 재실행 확인) |
| 7 | build/configure/sync는 사용자 승인 없이 실행되지 않는다 | **PR #54 merge 대기 — merge 후 판정** | R1이 production spawn 지점 4곳(`jsonRpc.ts:63`, `notes.ts:188`, `childIpc.ts:31`, `discovery.ts:121`)을 전수 조사해 build/install/sync류가 없음을 확인하고 `buildInvocation.sources.test.ts`(신규 4개 test)로 고정했다. 이 파일은 아직 `main`에 없다(PR #54 미merge). **review에서 이 guard의 정규식이 `exec`/`execFile`/`execSync`/`fork`와 namespace/default `child_process` import를 놓친다는 결함이 발견됐다** — `import * as cp from 'node:child_process'; cp.exec('npm install')`가 두 test를 모두 통과한다. R1이 수정 중이며, 수정·재검증 후 이 표를 갱신한다 |
| 8 | `user-tests/m1-user-test-spec.md`가 release candidate 기준으로 검토됐으며, 실제 사용자 검증 결과 또는 실행 보류 사유가 release decision에 기록된다 | 충족(보류 결정으로 종결) | 아래 "release decision" 절 참고 |

**8개 중 5개(gate 1,2,5,6,8) 충족, 1개(gate 3)는 문구-구현 불일치로 부분 충족·정정 필요, 2개(gate 4, 7)는
PR #54 merge 대기.** M0가 같은 방식(사용자 검증 보류)으로 gate를 닫은 전례가 있다(gate 8).

### PR #49의 W3-A 자기 표기 — 무엇을 실제로 닫았는가

PR #49("Prove which result states a real run can actually produce")는 본문에 스스로 `"상위 목표: M1 /
IL-LIM-005 3단계 검증 (실행 계획 W3-A)"`라고 적었다(`gh pr view 49`로 직접 확인). 그러나 실행 계획
(`task-m1-agent-team-execution.md`의 Wave 3 표)이 W3-A에 배정한 산출물은 **bundled/custom/mock provider의
capability·timeout·indexing unknown·partial 결과 matrix**(CLI 진입점 수준)와 `scripts/test-plugin-artifact-e2e.mjs`
assert 갱신이다. PR #49가 실제로 한 일은 **"shipped catalog로 오늘 실제 도달 가능한 completion 상태가
무엇인가"를 실행으로 증명**하는 것(`stateReachability.integration.test.ts`)이고, 이것은 W3-B(사용자 테스트
명세)의 입력 자료이지 W3-A가 배정한 CLI 진입점 matrix 그 자체가 아니다.

**정정**: PR #49는 W3-A가 아니라 상태 도달 가능성 검증이며, W3-B(PR #50, 사용자 테스트 명세)의 선행 조사
역할을 했다. 실행 계획이 W3-A에 배정한 CLI 진입점 provider matrix는 **R1(PR #54)**이 `providerMatrix.test.ts`로
채웠다. 이 정정은 이 lane의 owned path인 `task-m1-agent-team-execution.md`에 반영한다.

**owned path 밖의 잔존 참조 (후속 과제로만 기록, 이번에 고치지 않음)**: `docs/work/task-m1-state-reachability.md`
(PR #49 자신의 작업 문서, 표제 자체가 "W3-A"), `docs/work/task-m1-user-test-spec.md`, `docs/work/task-m1-wave0-handover.md:209`,
`docs/work/task-m1-wave1-handover.md:199,251`, `docs/development-management/user-tests/m1-user-test-spec.md:11,26`
전부 PR #49를 "W3-A"로 부른다. 이 문서들은 R3의 owned path 밖이고 각각 다른 lane의 산출물이라 이 lane이
임의로 다시 쓰지 않는다 — 필요하면 별도 작업으로 각 문서에 "2026-08-31 정정" 표시를 붙여야 한다.

### PR #51의 정정이 놓친 자리 (R2가 발견, 이 lane이 기록)

PR #51("Rename USER_CONFIGURED_ADDITIONAL_REACHABLE to stop overstating reachability")은
`USER_CONFIGURED_ADDITIONAL_REACHABLE`이라는 이름이 "사용자 설정으로 readiness 상태(`working`/`ready`)에
도달 가능하다"는 인상을 준다는 이유로 개명했다. 그러나 실제로 변경한 파일은
`cli/src/test/stateReachability.integration.test.ts`, `cli/src/test/stateReachability.sources.test.ts`,
작업 문서 3개뿐이었다. **`plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`는 손대지
않았고**, 이 파일이 같은 거짓 인상("A user-configured provider with its own `readiness` profile can still
produce `ready` or `working`")을 그대로 담은 채 shipped plugin payload로 계속 배포됐다. R2가 PR #53 review
과정에서 발견해 commit `3a65b55`로 정정했다(같은 PR #53에 포함, `test:response-policy` 16/16 재확인).
**PR #51의 정정 범위가 자신이 개명한 상수의 test 파일에만 그쳤고, 같은 오해를 담은 shipped 문서까지
확장되지 않았던 것이 원인**이다 — 이 저장소가 정정 경위를 기록해 온 관행에 따라 여기 남긴다.

### Wave 2 gate 미체크 3개 — 판정

| gate | 판정 | 근거 |
| --- | --- | --- |
| Extension에서 empty와 incomplete가 문구만으로 구분된다 | 충족 | PR #37(merge). `src/impactTreeProvider.ts:15-36`에 `EmptyItem`(그래프 자체가 없는 최초 상태)과 `NoticeItem`(그래프는 있지만 완전성 caveat이 있는 상태)이 타입 수준으로 분리돼 있고, `src/completeness.ts:128`의 `noProviderSummary()`가 "caller 없음"과 "provider 없음"을 구분한다 |
| Codex와 Claude Code 대표 prompt가 동일한 completeness 경계를 전달한다 | 충족 | PR #48(merge). 두 host(`plugins/impact-lens/.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`)가 같은 `plugins/impact-lens/skills/` 디렉터리를 가리킨다(직접 diff 확인 — manifest 메타데이터만 다르고 skill payload 경로는 동일). `npm run test:response-policy`가 이 공유 payload에 대해 16/16 통과 |
| `complete: true`만으로 runtime 영향 없음이나 indexing 완료를 주장하지 않는 fixture가 통과한다 | 충족 | PR #48(merge). `scripts/fixtures/response-policy/`의 fixture 01·02·06(각각 "unknown empty result reported as no impact", "working/partial result reported as no callers", "conclusion stated before the evidence boundary")이 정확히 이 실패 유형을 잡아낸다. `test:response-policy` 16/16 |

## 판정 출처와 검토 범위 (2026-08-31 추가)

이 문서의 판정 중 일부는 이 lane이 처음부터 독립적으로 도출한 것이 아니라, 계획 세션(`main`)이 `reviewer`
세션에 위임해 나온 결론을 relay 받은 것이다. 나중에 "누가 무엇을 독립적으로 검증했는가"를 재구성할 수
있도록 있는 그대로 적는다 — 이 저장소가 W3-C의 2차 독립 검토 무산을 "대기 중"과 "무산"으로 구분하느라
여러 라운드를 쓴 전례가 있어, 그 재구성 비용을 지금 줄여 둔다.

- **`reviewer`가 원 판정을 만든 항목**: IL-LIM-009 AC2 충족 판정, milestone gate 3(doctor
  indexing/query 구분)의 문구-구현 불일치 판정, PR #54 제목의 "2 of 3" 프레이밍 기각. 계획 세션이 이
  판정을 relay하면서 **원문 인용을 직접 다시 읽어 독립 확인**했다(`provider-coverage-contract.md:86-94`,
  `cli-contract.md:117`, `doctor.test.ts`의 `indexing` 0회 등장을 계획 세션도 별도로 grep). 이 lane(R3,
  이 세션)은 그 결론을 받아 위 표에 옮기면서 인용된 test 이름·파일 경로가 실재하는지 다시 한 번 직접
  재확인했다(아래 작업 로그).
- **IL-LIM-005 6개 AC**: `reviewer`의 1차 검토 라운드(5-fork 병렬 검토, 이 라운드에서 근거 오류 2건이
  나와 정정된 이력이 있다 — 정정 경위는 `reviewer` 세션 자체 기록에 있고 이 lane은 재론하지 않는다) 판정을
  계획 세션이 relay했고, 계획 세션이 인용 실재를 독립 확인했다. 이 lane도 별도로 6개 test 이름 전부를
  `grep`으로 재확인했다.
- **이 lane(R3)이 처음부터 직접 도출한 항목**: Wave 2 gate 3개의 근거(PR #37/#48 확인, `plugin.json` diff),
  PR #49의 W3-A 자기 표기 정정 문구, release decision 기록, owned path 밖 잔존 참조 목록, milestone
  gate·Wave 3 gate 전체 표의 구성과 문구.

**따라서 `reviewer`가 PR #55를 검토하더라도, 위 첫 두 항목(IL-LIM-009 AC2, doctor gate 3, IL-LIM-005 6개
AC)에 대해서는 자신이 이미 내린 결론을 다시 읽는 것이지 독립 검토가 아니다.** `reviewer`의 PR #55 검토는
**자신이 만들지 않은 부분** — Wave 2 gate 근거, PR #49 정정 문구, release decision 기록, owned path 밖
잔존 참조 목록의 완전성, 그리고 이 문서 전체의 전사 충실도(relay 과정에서 원 판정이 왜곡되지 않았는지) —
에 집중해야 실질적인 독립 검토가 된다.

## 사용자 검증 보류 — release decision

M1 종료 gate의 마지막 항목(milestone gate 8, Wave 3 gate 5)인 **실제 사용자 검증은 이번 릴리스에서 실행하지
않고, 보류 사유를 이 문서와 R4의 릴리스 기록에 남긴다.** M0가 같은 방식으로 이 gate를 닫은 전례가 있다.
확인된 사실만 적는다(추측 없음):

- 명세(`docs/development-management/user-tests/m1-user-test-spec.md`)는 **작성 완료·검토 완료** 상태다.
  검토는 작성자가 아닌 세션이 1회 수행했다. W3-C가 의도했던 2번째 독립 검토는 승인이 오지 않아
  **만료**됐다(경위는 `docs/work/task-m1-user-test-spec.md` 작업 로그에 기록돼 있고, main 커밋
  `54518c9`, `8b6ddfd`가 이 상태 문구를 "검토 대기"에서 "만료"로 정정한 이력이다).
- 실제 참여자 모집과 테스트 환경 준비는 명세와 별도의 승인 사항이다(`user-validation-planning.md` 규칙).
- 사용자가 이번 릴리스에서는 이 실행을 보류하기로 명시적으로 결정했다. M1 milestone 문서와 R4의 릴리스
  기록 양쪽에서 이 결정을 참조할 수 있도록 아래 "단계별 구현 계획"에서 두 문서에 같은 문장을 기록한다.

## 단계별 구현 계획

### 1단계 — story 수용 기준 판정

- 목적: `IL-LIM-005`(6개), `IL-LIM-009`(4개) 수용 기준을 근거와 함께 판정해, M1의 두 완료 소유 story가
  실제로 끝났는지 확인 가능하게 한다.
- 산출물: 두 story 파일의 체크박스와 근거 갱신.
- 검증: 위 "현재 구현 조사 결과" 표의 근거 test/파일이 실재하는지 재확인, `git diff --check`.

### 2단계 — milestone 종료 gate 판정과 release decision

- 목적: milestone 종료 gate 8개를 판정하고, gate 3의 문구-구현 불일치를 숨기지 않고 기록하며, 사용자
  검증 보류 release decision을 milestone 문서에 남긴다.
- 산출물: `m1-provider-platform-ux.md`의 종료 gate 갱신.
- 검증: 위 표와 동일 근거 재확인.

### 3단계 — Wave 2/3 gate와 W3-A 정정

- 목적: `task-m1-agent-team-execution.md`의 Wave 2 미체크 3개를 판정하고, Wave 3 표를 실제 결과로
  갱신하며, PR #49의 W3-A 자기 표기를 정정한다.
- 산출물: 해당 문서의 Wave 2/3 표, 상태 줄, 작업 로그 갱신.
- 검증: `gh pr view`로 PR 번호·상태 재확인, `git diff --check`.

세 단계는 서로 다른 파일이지만 같은 판정 근거 조사에 기반하므로 하나의 commit으로 묶는다(이 lane이
실제로 조사해 확인한 M1 종료 gate 판정이라는 하나의 의미를 갖게 하기 위함).

### 4단계 — PR #54 merge 후 후속 갱신 (별도 commit, merge 확인 후 수행)

- 목적: PR #54 merge로 milestone gate 4·7과 Wave 3 gate의 "하위 호환"·"build 미실행" 항목을 최종
  충족으로 닫는다.
- 산출물: 위 두 gate의 판정을 "PR #54 merge 대기"에서 "충족"으로 갱신, PR #54의 실제 merge commit 인용.
- 검증: `main`에서 `buildInvocation.sources.test.ts`, `providerMatrix.test.ts`, 하위 호환 test가 실재하는지
  확인.

## 테스트 및 완료 기준

- 문서·판정 전용 lane이므로 코드 test 재실행은 필수가 아니지만, 인용한 test 이름이 실재하는지, 인용한
  PR 번호와 상태가 정확한지는 전부 직접 재확인한다(아래 작업 로그).
- `npm run test:response-policy`는 인용 근거이므로 이 문서 작성 시점의 `main`에서 재실행해 확인한다.
- `git diff --check`로 공백 오류가 없는지 확인한다.
- 완료 기준: story 수용 기준 10개, milestone 종료 gate 8개, Wave 2 gate 3개가 전부 근거와 함께 판정되고,
  gate 3의 불일치와 gate 4·7의 PR #54 대기 상태가 숨겨지지 않고 명시된다. PR #54 merge 후 4단계로 마무리.

## 작업 로그

### 2026-08-31 — 판정 근거 조사

- IL-LIM-005, IL-LIM-009 story 원문, milestone 문서, `task-m1-agent-team-execution.md`를 전체 읽고 각
  수용 기준·gate의 정확한 문구를 확인했다.
- `cli/src/test/*.test.ts` 전체에서 위 표에 인용한 모든 test 이름을 `grep`/직접 열람으로 재확인했다
  (계획 세션의 사전 조사를 그대로 신뢰하지 않고 독립 재확인).
- `doctor.test.ts`에 "indexing" 문자열이 0회 등장함을 `grep -c`로 직접 확인해 gate 3의 문구-구현 불일치를
  확정했다. "query 실패" 구분 자체는 `doctor.test.ts:200`("a server that advertises Call Hierarchy but
  answers nothing fails the fixture")로 실재함을 확인했다.
- `gh pr view 49`로 PR 본문의 "실행 계획 W3-A" 자기 표기 문구를 직접 확인했다.
- `gh pr view 37`, `gh pr view 48`로 Wave 2 gate의 근거 PR이 실제로 merge 상태이고 내용이 일치하는지
  확인했다.
- `diff`로 `.claude-plugin/plugin.json`과 `.codex-plugin/plugin.json`이 같은 `skills/` 경로를 가리키는
  것을 확인했다.
- `npm test`(58/58), `npm run cli:test`(258/258 — PR #54 미merge라 아직 258), `npm run test:response-policy`
  (16/16)를 이 문서 작성 시점의 `main`(`dac76ba`, PR #53 merge 직후)에서 재실행해 확인했다.
- `docs/development-management/user-tests/m1-user-test-spec.md`의 현재 상태 줄("작성 완료, 검토 완료...
  아직 실행하지 않았다")을 직접 읽어 release decision 절의 근거로 인용했다.
