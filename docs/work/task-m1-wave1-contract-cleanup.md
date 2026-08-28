# M1 Wave 1 계약·문서 정리

- 작성일: 2026-08-28
- branch: `fix/m1-wave1-contract-cleanup`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 실행 기준: [M1 Wave 1 종료·재개 handover](task-m1-wave1-resume-handover.md)
- 선행 작업: [요청별 provider 설정 runtime 연결](task-m1-request-overrides-runtime.md), PR #44 merge commit
  `f75cdb8`

## 목적과 사용자 가치

Wave 1과 요청별 provider 설정은 실제 코드에 반영됐지만, 일부 공개 계약과 Plugin 지침은 구현 전 설명을
그대로 유지하고 있다. 이 상태에서는 Agent가 새 `completion`을 읽지 않거나 Auto/preset 선택을 무시하고,
마일스톤 문서만 본 작업자는 M1이 아직 시작되지 않았다고 오해할 수 있다.

또한 `provider_ipc_unavailable`은 initialize를 통과한 뒤의 query 실패까지 변환 대상으로 선언돼 있다. 하지만
query에 도달하려면 initialize 응답을 이미 받아 누적 `bytesFromServer`가 0보다 커야 하므로, “서버가 한 byte도
말하지 않은 환경”을 뜻하는 이 오류가 query에서 성립할 수 없다. 도달 불가능한 stage를 공개 계약에 남기면
소비자와 테스트가 존재하지 않는 상태를 처리하게 된다.

이 작업이 끝나면 다음 결과를 얻는다.

- F9 오류는 실제로 가능한 launch/initialize stage만 보고한다.
- Codex/Claude Plugin은 `data.completion`과 `limitationDetails`를 우선 읽고, 정적·indexing 경계를 넘는 결론을
  만들지 않는다.
- Auto, explicit preset, trusted project, custom provider와 일반화된 doctor 사용법이 현재 CLI와 일치한다.
- M1 문서는 Wave 1 완료와 W2-B 선행 완료, 다음 순서가 W2-A임을 보여준다.

## 배경과 해결할 문제

handover의 정확한 순서 3번은 W2-A 전에 다음 세 가지를 한 lane에서 정리하도록 요구한다.

1. F9 `provider_ipc_unavailable.details.stage`를 도달 가능한 `{launch, initialize}`로 축소한다.
2. Plugin의 provider, doctor, completeness 설명을 현재 계약으로 갱신한다.
3. M1 milestone을 `In progress`로 바꾸고 실제로 충족된 Wave 1 gate만 근거와 함께 표시한다.

PR #44가 merge되면서 요청별 preset과 설정도 실제 session에 연결됐으므로, 이 문서 정리는 더 이상 미래
기능을 미리 설명하는 작업이 아니라 이미 배포 가능한 동작과 소비 지침을 맞추는 작업이다.

## 범위

- silent provider failure 변환 대상에서 `provider_query_failed` 제거
- child IPC unit test와 provider coverage/truth table의 F9 stage 축소
- Plugin skill, analyze command와 CLI contract를 completion·limitation·Auto/preset·doctor 현재 동작으로 갱신
- M1 milestone 상태와 실행 계획의 실제 Wave 0/1 진행 상태 갱신
- 변경 범위에 맞는 CLI 전체 test와 Plugin artifact E2E 검증

## 범위에서 제외할 항목

- W2-A dynamic registration, progress readiness probe, indexing 실측
- W2-C 고정 summary template, 금지 문구 eval과 `V1_WITHHELD_REASON_CODES` 해제
- Wave 3 compatibility matrix와 M1 사용자 테스트 명세
- story 완료 처리 또는 M1 종료 gate 완료 처리
- 실제 사용자 검증

## 현재 구현 조사 결과

### Merge 기준과 다음 순서

- PR #44는 CI 4종 통과 후 merge commit `f75cdb8`로 main에 반영됐다.
- 이 branch는 최신 `origin/main` `f75cdb8`에서 생성했다.
- handover는 runtime 연결 다음에 이 잔여 정리를 두고, 그 뒤 W2-A → W2-C → Wave 3 순서를 명시한다.

### F9가 query stage에서 성립하지 않는 이유

- `looksLikeSilentProviderFailure()`는 launch/initialize/query 오류를 모두 후보로 받지만 최종 조건은 누적
  `bytesFromServer === 0`이다.
- query에 도달하려면 initialize request의 JSON-RPC 응답과 capability를 이미 받아야 한다. 따라서 정상적인
  query stage에서 누적 server byte가 0일 수 없다.
- `childIpcUnavailableError()`는 원래 details를 보존하므로 후보 집합을 줄이면 공개 stage도 자연스럽게
  launch/initialize로 좁아진다. 새 error code나 schema version 변경은 필요 없다.

### Plugin 문서와 구현의 차이

- skill과 analyze command는 `coverage`, `complete`, `limitations`를 중심으로 설명하고 상태의 단일 출처인
  `data.completion`과 structured `limitationDetails`를 안내하지 않는다.
- CLI contract의 성공 예시에는 `completion`과 `limitationDetails`가 없고 caller 0건 처리 및 금지 결론이 없다.
- 비 TypeScript/JavaScript는 명시 provider가 없으면 항상 실패한다고 적혀 있어 verified Auto와 explicit
  `providerPreset`, trusted project 선택을 설명하지 못한다.
- doctor 절은 bundled TypeScript 전용 복구만 설명하고 일반 `doctor <preset>` preflight/smoke 계약과 check별
  pass/warn/fail을 충분히 안내하지 않는다.

### 영향 범위 근거

Impact Lens CLI로 `looksLikeSilentProviderFailure`의 incoming caller를 depth 5로 분석했다. 직접 production
caller는 CLI `main`, 직접 test caller는 `childIpc.test.ts`이며 전이는 `cli/src/index.ts` entry까지 이어졌다.
traversal은 complete였지만 semantic은 `static-only`, indexing은 `unknown`이므로 runtime-only 경로까지 완전한
영향 증거로 해석하지 않는다. `rg`로 error producer와 계약 문서 소비 지점을 추가 확인했다.

## 설계 결정

### 1. query를 stage 값에서 사후 치환하지 않고 후보 error code에서 제거한다

stage를 강제로 바꾸면 실제 오류가 발생한 위치를 거짓으로 기록한다. query 오류는 silent-IPC 후보 자체가 될 수
없으므로 `SILENT_PROVIDER_CODES`에서 제외하고 원래 `provider_query_failed`를 보존하는 것이 맞다.

### 2. Plugin은 completion을 1차 상태로, v1 필드를 projection으로 설명한다

Agent는 먼저 `data.completion`과 `data.limitationDetails`를 읽고, `coverage`, `complete`, `truncated`,
`limitations`는 호환 projection으로 다룬다. caller 0건도 `index_state_unknown` 여부를 함께 읽게 해 “영향 없음”
결론을 막는다.

### 3. 현황 문서는 완료를 앞당겨 주장하지 않는다

M1 상태는 `In progress`로 바꾸되 milestone 종료 gate와 story는 완료 처리하지 않는다. 실행 계획에서는 merge와
자동 테스트 근거가 있는 Wave 0/1 gate만 체크하고, W2-A/W2-C/Wave 3 및 사용자 검증은 남겨둔다.

## 단계별 구현 계획

### 1단계 — 목적·영향·현재 계약 기준선 고정

목적: 다음 구현이 해결할 사용자 혼동, 실제 도달 stage와 문서 차이를 재현 가능한 근거로 고정한다.

산출물: 이 작업 문서, PR #44 merge 기준, Impact Lens caller 근거와 완료 기준.

검증: 문서 link 대상, `git diff --check`, 현재 branch/upstream 상태를 확인한 뒤 문서만 독립 commit·push한다.

### 2단계 — F9와 공개 Plugin/M1 문서를 실제 구현에 정렬

목적: 공개 오류·Agent 소비·프로젝트 현황이 현재 코드가 생산하는 사실만 말하게 한다.

산출물: F9 후보 축소와 unit test, provider/truth-table 계약, Plugin skill/command/contract, milestone/실행 계획,
작업 로그와 완료 근거.

검증: targeted child IPC test, 전체 CLI·Extension test, Plugin artifact E2E, 문서 link 검사와
`git diff --check`를 통과한 뒤 독립 commit·push하고 main 대상 PR을 연다.

## 테스트 및 완료 기준

- [ ] query의 zero-byte 오류는 `provider_query_failed`로 유지되고 child IPC 오류로 바뀌지 않는다.
- [ ] F9 문서의 stage가 `{launch, initialize}`로 일치한다.
- [ ] Plugin 지침이 completion·limitationDetails·caller 0건·금지 결론을 설명한다.
- [ ] Plugin 지침이 Auto/preset/project/custom 선택과 일반 doctor를 설명한다.
- [ ] M1 상태는 `In progress`이고 완료되지 않은 W2/W3/사용자 검증을 완료로 표시하지 않는다.
- [ ] `npm run cli:build` 통과
- [ ] targeted child IPC test 통과
- [ ] `npm run cli:test` 통과
- [ ] `npm test` 통과
- [ ] `npm run test:plugin-artifact` 통과
- [ ] 변경된 Markdown link 대상이 모두 존재한다.
- [ ] `git diff --check`가 통과한다.
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다.

## 작업 로그

### 2026-08-28 — 재개 기준과 다음 순서 확인

- PR #44 head `801626c`, CI 4종 success와 `CLEAN`/`MERGEABLE`을 확인한 뒤 merge했다.
- GitHub에서 merge commit `f75cdb8`을 확인하고 최신 `origin/main`을 fetch했다.
- handover, M1 milestone, 실행 계획, IL-LIM-005와 preset manifest의 readiness 결정을 다시 읽어 W2-A 전에 이
  정리 lane이 남아 있음을 확인했다.
- Impact Lens 분석으로 runtime caller가 CLI `main`, 관련 test가 `childIpc.test.ts`임을 확인했다. 정적 분석의
  semantic/indexing 한계도 이 문서에 함께 기록했다.
- 이 문서가 참조하는 로컬 Markdown 대상 3개가 존재하고 `git diff --check`가 통과함을 확인했다. 1단계는
  제품 code와 공개 계약을 변경하지 않고 목적·범위·검증 기준만 고정했다.
