# M1 Wave 1 종료·재개 Handover

- 작성일: 2026-08-27
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 실행 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md)
- 직전 인계: [`task-m1-wave1-handover.md`](task-m1-wave1-handover.md)
- 이 문서의 branch: `docs/m1-wave1-resume-handover`
- 목적: Claude Code 세션이 중단된 뒤 복구한 상태를 고정하고, 다음 세션이 조사나 충돌 해소를 반복하지 않고
  바로 M1 구현을 이어가게 한다.

## 배경과 해결할 문제

직전 handover PR #40은 merge 대기 상태였고, 실제 저장소에는 문서에 기록되지 않은 중단 상태가 두 곳 더
있었다.

1. PR #39 worktree가 PR #38의 preset catalog를 merge하다 `cli/src/errors.ts` 충돌에서 멈춰 있었다.
2. `feat/m1-request-overrides`는 2단계까지 push됐지만 schema 계약 테스트와 계약 문서가 미커밋 상태였다.

이 세션은 두 상태를 보존해 복구하고, 이미 검토 완료된 PR을 merge하며, 남은 요청 override 계약을 원격 PR로
전환했다. 다음 세션이 읽어야 할 기준은 직전 handover가 아니라 이 문서다.

## 범위

- 원격 PR #40·#37·#39의 실제 head, CI와 merge 가능 상태 확인 및 승인된 순서대로 merge
- #39 중단 merge의 충돌 해소, preset/session 연결 보완과 회귀 테스트
- 요청 override 3단계 완성, 최신 main 통합, commit·push와 PR 생성
- 다음 작업 순서, 명시적인 제외 범위, 검증 근거와 worktree 상태 기록

## 범위에서 제외한 항목

- PR #41 merge: 새 PR이므로 다음 세션의 최종 diff 검토 뒤 lead가 결정한다.
- 요청 필드를 provider 선택과 LSP session에 실제로 소비시키는 runtime 배선
- preset/project/request 병합 뒤 D8 byte/key 예산을 다시 검사하는 로직
- F9 stage 계약 축소, Plugin CLI 계약 문서 일괄 갱신, W2-A readiness 구현
- milestone 상태와 gate 체크박스 갱신
- merge된 lane worktree의 강제 삭제. 두 worktree에 npm이 만든 미추적 lockfile이 있어 보존했다.

## 현재 구현 조사 결과

### Git과 원격 PR

- `origin/main`: `478fa71` — PR #39 merge commit
- 기본 worktree는 이 문서 branch를 만들기 직전 `main...origin/main` clean이었다.
- 요청 override worktree:
  `.claude/worktrees/agent-ad4f0910725e7f31b`, branch `feat/m1-request-overrides`, HEAD `63dd06b`,
  upstream과 일치하고 clean이다.
- 원격에서 열린 PR은 [#41](https://github.com/moelee835/Impact-Lens/pull/41) 하나다.
  head `63dd06b`, base `main`, `CLEAN`·`MERGEABLE`, draft가 아니다.

### 이 세션에서 merge한 PR

| PR | 내용 | merge commit |
| --- | --- | --- |
| [#40](https://github.com/moelee835/Impact-Lens/pull/40) | Wave 1 handover | `9ec2b93` |
| [#37](https://github.com/moelee835/Impact-Lens/pull/37) | Extension completeness UX와 doctor 보안 수정 | `061a647` |
| [#39](https://github.com/moelee835/Impact-Lens/pull/39) | 양방향 LSP, cancellation, settings 주입 경로 | `478fa71` |

### M1의 실제 진행 위치

- Wave 0: 완료·merge.
- Wave 1 W1-A/B/C: 모두 merge. 양방향 LSP, provider catalog/doctor, completeness 생산이 main에 있다.
- W2-B Extension UX: 파일 비중첩을 근거로 앞당겨 구현했고 PR #37로 merge됐다.
- W1-D 요청 override 계약: 구현·검증 완료, PR #41 review/merge 대기.
- W2-A provider readiness: 미착수.
- W2-C Plugin 문서/eval, Wave 3 compatibility/user-test/review: 미착수.

마일스톤 문서의 상태는 아직 `Planned`이고 실행 계획의 gate도 미체크다. 실제 코드는 Wave 1 후반이므로,
이 표시는 현황 문서 부채이지 구현이 시작되지 않았다는 뜻이 아니다.

## 복구 과정의 주요 결정

### #39 충돌과 W1-A/W1-B 연결

- `provider_protocol_incompatible`, `provider_executable_not_found`, `provider_selection_ambiguous`,
  `provider_config_invalid`는 모두 실제 throw 경로가 생겼으므로 `CLI_ERROR_CODES`에 남기고
  `CONTRACT_ONLY_ERROR_CODES`에서 제거했다.
- `LspCallHierarchyProvider`가 `resolveProvider(file, command, { workspace })`를 호출하게 해 trusted project
  선택 기준을 shell `cwd`가 아니라 분석 workspace에 고정했다.
- resolved preset/project session과 직접 session 값을 합치되 redaction 값은 합집합으로 보존했다.
- provider/protocol의 중복 `SETTINGS_DELIVERIES`는 계층 import 대신 parity test로 drift를 막았다.

관련 commit:

- `5efad04` — PR #38 preset catalog를 #39 branch에 merge하고 충돌·session 연결 해소
- `2d02943` — PR #40/#37이 포함된 최신 main 통합

### 요청 override 계약

- `providerPreset`, `initializationOptions`, `settings`는 schema v1 optional additive 필드다.
- 요청 경계에서 type/depth/64 KiB/1000 keys/prototype key 제한을 검사한다.
- request schema가 쓰는 키워드를 test checker가 실제로 이해하는지와 schema↔parser parity를 검증한다.
- provider field와 providerPreset의 동시 사용은 조용한 우선순위 적용 대신 `invalid_request`로 거부한다.
- 이 PR은 세 필드를 검증하고 `AnalyzeRequest`에 보존하는 계약 lane이다. 실제 provider 소비는 다음 별도
  단계다.

관련 commit:

- `317e204` — request schema 검증과 계약 문서 완성
- `63dd06b` — PR #39까지 포함한 최신 main을 요청 override branch에 통합

## 다음 세션의 정확한 작업 순서

### 1) PR #41 최종 검토와 merge 결정

먼저 `gh pr view 41`로 head가 `63dd06b`인지, check 4종이 계속 success인지 확인한다. diff 범위는 요청 schema,
validator, 타입, request schema test와 계약 문서다. head가 바뀌지 않았고 범위가 그대로면 merge 가능하다.

PR #41 검증 상태:

| check | 결과 |
| --- | --- |
| Unit tests / Ubuntu | success |
| Plugin artifact E2E / Ubuntu | success |
| Plugin artifact E2E / macOS | success |
| Plugin artifact E2E / Windows | success |

### 2) runtime 배선은 새 branch/PR로 분리

PR #41을 merge한 최신 `origin/main`에서 `feat/m1-request-overrides-runtime`을 만든다. 기존 #41에 추가 commit을
쌓지 않는다. 작업 전에 별도 작업 문서를 먼저 만든다.

구현 목표:

1. `AnalyzeRequest.providerPreset`을 `resolveProvider`의 `providerPreset` option으로 전달한다.
2. 요청의 `initializationOptions`·`settings`를 `resolveProvider`의 `override`로 전달해
   `preset < project < request` deep merge를 사용한다.
3. 직접 session 인자로 우회해 객체 전체를 교체하지 않는다. 요청 override는 provider lane의 merge와
   redaction 수집을 반드시 통과해야 한다.
4. merged initialization/settings에 D8 byte/key 예산을 다시 적용한다. 개별 입력은 유효해도 합이 한도를
   넘을 수 있다.
5. 실제 CLI stdin 요청으로 preset 선택(`selectedBy: preset`)과 settings fixture 수신을 증명한다.

### 3) Wave 1 잔여 계약·문서 정리

- F9: `provider_ipc_unavailable.details.stage`를 도달 가능한 `{launch, initialize}`로 좁힌다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`와 관련 `SKILL.md`의 낡은 provider,
  doctor, completeness 설명을 한 lane에서 갱신한다.
- 이 단계에서 M1 milestone 상태를 `In progress`로 맞추고, 실제로 충족된 Wave 1 gate만 근거와 함께 체크한다.

### 4) 이후 wave

1. W2-A `feat/m1-provider-readiness`
2. W2-C Plugin 문서/eval과 D6 `V1_WITHHELD_REASON_CODES` 해제의 연속 PR
3. Wave 3 compatibility matrix, M1 사용자 테스트 명세, 독립 검토

실제 사용자 검증은 별도 승인이 필요한 마지막 gate다. 자동 검증 통과를 사용자 검증 통과로 기록하지 않는다.

## 재개 시 주의사항

- `schemaVersion`은 M1 동안 1이다. additive만 허용한다.
- 검증되지 않은 언어를 `verified-external`로 문서화하지 않는다.
- byte 비교는 lane별 고정 workspace를 쓰고, baseline 자체를 두 번 비교한 뒤 기준으로 인정한다.
- scratchpad의 캡처 script를 재사용하지 말고 작업 문서 원문에서 다시 추출한다.
- `observed.diagnostics`의 과거 false→true 차이는 W1-A가 고정 100 ms 경쟁을 제거한 수정 결과다.
- `npm install`과 `npm --prefix cli install`은 package-lock을 만들 수 있다. 저장소가 lockfile을 추적하지
  않으므로 commit에 넣지 않는다.
- merge된 `feat/m1-bidirectional-lsp`와 `feat/m1-preset-catalog` worktree에는 생성된 미추적
  `package-lock.json`, `cli/package-lock.json`만 남아 있다. 강제 제거하지 않았다.
- GitHub Actions에는 `actions/checkout@v4`·`setup-node@v4`의 Node 20 deprecation warning이 있지만 현재
  check 실패는 아니다. 별도 CI 유지보수 과제로 처리한다.

## 이 handover 작업의 단계별 구현 계획

1. 최신 main과 PR #41의 head/CI/worktree 상태를 대조하고 이 문서에 재개 기준, 다음 순서와 검증 근거를
   기록한다. Markdown diff와 링크 경로를 검사한 뒤 문서만 독립 commit·push하고 PR을 연다.

## 테스트 및 완료 기준

- [x] 문서의 main/branch/PR commit이 실제 GitHub와 일치한다.
- [x] 다음 세션의 첫 branch와 구현 목표, 제외 범위가 명시돼 있다.
- [x] 로컬 Markdown link 대상이 모두 존재한다.
- [x] `git diff --check`가 통과한다.
- [x] handover 문서만 독립 commit으로 남고 동일 이름 원격 branch에 push된다.
- [x] main 대상 PR이 생성되고 local HEAD가 upstream과 일치한다.

## 작업 로그

### 2026-08-27 — 세션 종료 인계 작성

- 변경 파일: `docs/work/task-m1-wave1-resume-handover.md` 신규.
- `main` `478fa71`, 요청 override branch `63dd06b`, PR #41 head/CI/mergeability를 다시 조회했다.
- 새 기능을 구현하지 않고, 종료 시점의 관측 사실과 다음 세션 실행 순서만 기록했다.
- merge된 worktree의 미추적 lockfile은 사용자 데이터와 생성 산출물을 임의로 지우지 않기 위해 보존했다.
- 로컬 Markdown link 3개의 대상 존재와 `git diff --check` 통과를 확인했다.
- handover 본문을 `1a53ceb`(`Record the M1 Wave 1 resume state`)로 commit하고
  `origin/docs/m1-wave1-resume-handover`에 push했다.
- main 대상 PR [#42](https://github.com/moelee835/Impact-Lens/pull/42)를 열었다. 이 종료 로그 commit을 같은
  branch에 push한 뒤 local HEAD와 upstream 일치를 최종 확인한다.
