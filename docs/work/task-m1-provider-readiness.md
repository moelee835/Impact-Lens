# M1 provider readiness 실측

- 작성일: 2026-08-28
- branch: `feat/m1-provider-readiness`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대상 story: [IL-LIM-005 사용자 지정 LSP 호환성 확장](../development-management/stories/il-lim-005-custom-lsp-compatibility.md)
- 실행 계획: [M1 Agent Team 실행 계획 W2-A](task-m1-agent-team-execution.md)
- 선행 작업: [Wave 1 계약·문서 정리](task-m1-wave1-contract-cleanup.md), PR #45 merge commit `c61dd86`

## 목적과 사용자 가치

현재 CLI는 Language Server가 indexing 중인지, 준비됐는지 관측하지 않은 채 항상
`coverage.indexing.status: unknown`을 반환한다. 이 보수적 기본값은 거짓 확신을 막지만, readiness 신호를
명시적으로 제공하는 provider에서도 사용자가 준비 완료를 확인할 수 없고, 준비 중에 받은 empty graph와 실제
empty graph를 구분할 수 없다.

이 작업이 끝나면 다음 결과를 얻는다.

- server가 정적으로 또는 동적으로 등록한 Call Hierarchy capability를 하나의 상태로 확인한다.
- preset이 선언한 progress, notification 또는 capability registration만 readiness 근거로 해석한다.
- 명시적 ready 신호가 있으면 `indexing.status: ready`와 비시각 evidence를 반환한다.
- budget 안에 ready가 오지 않고 partial 진행이 허용되면 결과를 `partial/working`으로 표시해 premature empty를
  caller 부재로 확정하지 않는다.
- fail 정책이나 필수 project metadata 부재면 query를 실행하지 않고 복구 가능한 stage/code로 실패한다.

M1의 목표는 “시간이 충분히 지났으니 준비됐을 것”이라고 추측하는 것이 아니라, provider별로 선언된 신호가
있을 때만 신뢰 수준을 올리는 것이다. bundled TypeScript preset은 readiness를 선언하지 않으므로 기존
`unknown` 응답과 handshake를 그대로 유지한다.

## 배경과 해결할 문제

Wave 1은 readiness manifest 어휘와 protocol 관측 지점만 만들었다.

- `ProviderReadinessProfile`은 required files, 세 신호 종류, budget과 budget 초과 정책을 정의한다.
- `LspCallHierarchyProvider`는 dynamic registrations, work-done token과 progress state를 기록한다.
- `AnalysisObservations.indexing`과 `IndexingCoverage`는 ready/working/unknown을 받을 수 있다.
- `coverage.ts`는 working이면 partial/unknown과 `provider_not_ready`, ready면 evidence를 요구하도록 이미
  projection한다.

하지만 production 경로는 이들을 연결하지 않는다. provider resolution의 `readiness`가 생성자에서 버려지고,
progress/dynamic registration은 transcript에만 남으며, `analyzeImpact()`는 production provider의 indexing
관측을 받지 않는다.

## 범위

- static initialize capability와 `client/registerCapability`/unregister를 Call Hierarchy 상태로 병합
- client의 `textDocument.callHierarchy.dynamicRegistration` 지원 선언
- readiness profile을 resolved provider에서 LSP session으로 전달
- work-done progress, notification path match와 capability registration 신호 평가
- readiness budget, ready evidence와 late signal freeze
- required project file 존재 여부의 read-only 확인과 workspace escape 방지
- `provider_not_ready`, `provider_project_metadata_missing` 실제 error envelope 생산
- provider indexing observation을 `analyzeImpact` completion/coverage에 연결
- delayed-index, fail, metadata, dynamic capability mock/integration test
- readiness 미선언 bundled 경로의 기존 응답 byte 동일성 확인

## 범위에서 제외할 항목

- elapsed time만으로 ready 판정
- empty query 재시도로 ready 추론
- build, configure, dependency resolve, sync 또는 metadata 자동 생성
- bundled TypeScript preset에 readiness profile 추가
- 타 언어 preset을 verified catalog에 추가
- W2-C Plugin summary/eval과 `V1_WITHHELD_REASON_CODES` 해제
- Wave 3 실제 외부 server compatibility matrix와 M1 사용자 검증
- schema version 변경 또는 절대 시각 evidence

## 현재 구현 조사 결과

### Merge 기준과 진행 위치

- PR #45는 CI 4종 통과 후 merge commit `c61dd86`으로 main에 반영됐다.
- 이 branch는 최신 `origin/main` `c61dd86`에서 생성했다.
- 실행 계획상 W2-B는 선행 완료됐고 현재 정확한 다음 lane은 W2-A다. W2-C는 readiness 사용자 노출 문구가
  고정된 뒤 진행한다.

### 이미 존재하는 계약과 관측 지점

- `cli/src/providers/preset.ts`의 `ProviderReadinessProfile`은 `requiredProjectFiles`, `signals`, `budgetMs`,
  `onBudgetExceeded`를 갖는다.
- 신호는 `work-done-progress`, `notification`, `capability-registered` 세 종류로 닫혀 있다. notification match는
  path 하나와 scalar equality만 지원한다.
- `resolveSessionValues()`와 `ResolvedProviderSession`은 preset readiness를 보존한다.
- `LspCallHierarchyProvider`는 registration map, server-created progress token set과 begin/report/end state를
  기록하지만 readiness로 해석하지 않는다.
- initialize client capability는 아직 `callHierarchy.dynamicRegistration: false`이고 static
  `callHierarchyProvider`만 검사한다.
- `graphCompletion()`은 indexing working을 partial/unknown으로, ready/unknown을 완료 가능한 상태로 이미
  투영한다. `ready`는 `{signal, detail?}` evidence 없이는 타입과 schema를 통과할 수 없다.

### 끊어진 production 경로

- 생성자는 `resolved.readiness`를 저장하지 않는다.
- `prepare()`는 initialize 직후 document/query를 실행하며 project metadata나 readiness budget을 확인하지 않는다.
- `CallHierarchyProvider`에는 provider 관측을 `analyzeImpact()`로 반환하는 seam이 없다.
- `provider_not_ready`와 `provider_project_metadata_missing`은 계약 전용 code라 실제 `CliError` producer가 없다.
- 동적 capability registration은 transcript에만 나오며 `capabilities.callHierarchy`와 advertised state를 바꾸지
  않는다.

### 영향 범위 근거

Impact Lens CLI로 `recordProgress`와 `analyzeImpact`의 incoming caller를 depth 5로 분석했다.

- `recordProgress`는 `LspCallHierarchyProvider` 내부 notification handler가 직접 호출한다. 전이 caller에는 CLI
  analyze/note, doctor capability/fixture와 `lsp.integration.test.ts`, `doctor.test.ts`가 포함됐다.
- `analyzeImpact`의 production caller는 CLI `run`이고 직접 test caller는 `impact.test.ts`,
  `completion.test.ts`, `lsp.integration.test.ts`다.
- 두 traversal은 complete였지만 semantic은 `static-only`, indexing은 `unknown`이므로 reflection, event 또는
  runtime-only 경로까지 완전하다는 근거는 아니다. `rg`로 provider error와 registration/progress 소비처를
  추가 확인했다.

## 설계 결정

### 1. readiness는 preset 선언이 있을 때만 평가한다

readiness가 없는 provider는 기존처럼 즉시 query하고 indexing unknown을 유지한다. progress end나 capability
registration을 전역 규칙으로 ready에 승격하지 않는다. 같은 protocol event라도 preset이 의미를 선언한 경우에만
근거가 된다.

### 2. readiness tracker는 ready 신호 또는 budget으로 한 번만 확정한다

working 신호는 상태를 기록하지만 query 시작을 허용하지 않는다. ready 신호가 오면 즉시 ready evidence로
확정한다. budget을 넘기면 정책에 따라 working partial로 진행하거나 `provider_not_ready`로 실패한다.
partial 진행 뒤 늦게 온 ready 신호는 그보다 먼저 실행된 query의 완전성을 소급해 올리지 않는다.

Evidence에는 절대 시각과 server-authored 원문을 넣지 않는다. `signal`은 안정된 kind, `detail`은 manifest가
선언한 method/title pattern만 사용해 byte 결정성과 secret 경계를 지킨다.

### 3. project metadata는 query 전에 read-only로 확인한다

required path는 workspace-relative로만 해석하고 escape를 거부한다. 하나라도 없으면 build나 파일 생성을 하지
않고 `provider_project_metadata_missing`, stage `indexing`으로 실패한다. error details에는 상대 path만 넣는다.

### 4. dynamic Call Hierarchy는 static capability와 합친다

client는 dynamic registration 지원을 선언하고 static initialize 결과와 현재 registration map의
`textDocument/callHierarchy`를 OR로 합친다. static capability가 없으면 `initialized` 뒤의 immediate registration을
bounded하게 기다린 뒤 최종 capability를 판정한다. unregister는 static capability가 없는 경우 다시 false로
반영한다.

### 5. provider 관측은 optional interface seam으로 completion에 전달한다

`CallHierarchyProvider`에 optional `analysisObservations()`를 추가한다. 기존 mock/provider 구현은 변경 없이
unknown 기본값을 유지한다. `analyzeImpact`의 명시 observations는 테스트·상위 caller가 의도적으로 준 값이므로
provider 관측보다 우선한다.

## 단계별 구현 계획

### 1단계 — 목적·계약·무변경 기준선 고정

목적: readiness를 올릴 수 있는 근거와 올릴 수 없는 사건, 구현 seam, 영향 caller와 기존 bundled 응답을
재현 가능하게 고정한다.

산출물: 이 작업 문서, Impact Lens 근거, 전체 test 기준선과 고정 workspace 29개 시나리오 baseline.

검증: baseline을 두 번 캡처해 `diff -r`가 비는지, 문서 link와 `git diff --check`를 확인한 뒤 문서만 독립
commit·push한다.

### 2단계 — readiness·dynamic capability·coverage 연결

목적: 선언된 신호만으로 query 전 readiness를 결정하고 그 관측이 최종 completion에 정확히 반영되게 한다.

산출물: readiness tracker, LSP dynamic/metadata/budget 처리, provider observation seam, live error code,
mock fixture와 unit/integration/contract test, 작업 로그와 완료 근거.

검증: targeted readiness/LSP/completion/error tests, 전체 CLI·Extension test, Plugin artifact E2E, readiness
미선언 고정 workspace 캡처의 byte 동일성과 `git diff --check`를 확인한 뒤 독립 commit·push하고 PR을 연다.

## 테스트 및 완료 기준

- [ ] readiness 미선언 provider는 indexing unknown과 기존 handshake를 유지한다.
- [ ] static 또는 dynamic Call Hierarchy capability가 하나의 advertised/capability 상태로 합쳐진다.
- [ ] 미선언 progress/capability/notification은 ready로 승격되지 않는다.
- [ ] 선언된 work-done progress end, notification match와 capability registration이 ready evidence를 만든다.
- [ ] ready evidence에는 절대 시각이나 server-authored 원문이 없다.
- [ ] proceed-partial budget 초과 결과는 partial/working이고 `provider_not_ready` limitation을 갖는다.
- [ ] proceed-partial empty에는 `no_incoming_callers`와 `index_state_unknown`이 붙지 않는다.
- [ ] fail budget 초과는 query 전에 `provider_not_ready`, stage `indexing`으로 실패한다.
- [ ] required project file 부재는 생성/build 없이 `provider_project_metadata_missing`으로 실패한다.
- [ ] workspace 밖 required path는 읽지 않는다.
- [ ] `npm run cli:build` 통과
- [ ] targeted readiness/LSP/completion/error test 통과
- [ ] `npm run cli:test` 통과
- [ ] `npm test` 통과
- [ ] `npm run test:plugin-artifact` 통과
- [ ] readiness 미선언 29개 시나리오가 변경 전후 byte 동일하다.
- [ ] 변경된 Markdown link 대상이 모두 존재한다.
- [ ] `git diff --check`가 통과한다.
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다.

## 작업 로그

### 2026-08-28 — W2-A 조사와 구현 경계 확정

- PR #45 merge commit `c61dd86`을 확인하고 최신 `origin/main`에서 branch를 만들었다.
- preset readiness 계약, resolved provider seam, registration/progress 관측, coverage projection과 production
  analyze 경로를 대조해 “선언은 있으나 소비되지 않는” 정확한 단절 지점을 기록했다.
- Impact Lens 분석으로 protocol, CLI, doctor와 관련 test caller를 확인하고 정적·indexing 한계를 함께
  기록했다.
- W2-C summary/eval, Wave 3 외부 server matrix와 실제 사용자 검증은 이 lane에서 시작하지 않았다.

### 2026-08-28 — 1단계 기준선 고정

- 조사 문서의 단절 지점을 코드에서 다시 대조했다. `ProviderReadinessProfile`(`cli/src/providers/preset.ts:105`)
  과 `ResolvedProviderSession.readiness`(`cli/src/providers/resolve.ts:449`)는 존재하지만, `provider_not_ready`
  와 `provider_project_metadata_missing`은 여전히 `CONTRACT_ONLY_ERROR_CODES`(`cli/src/errors.ts:94`)에만
  있고 실제 `CliError` producer가 없다. `cli/src/test/errors.test.ts:52`가 이 사실을 강제하므로 2단계에서
  live producer를 추가할 때 두 code를 `CLI_ERROR_CODES`로 옮겨야 한다.
- 변경 전 기준선 검증을 모두 실행했다.

  | 검증 | 결과 |
  | --- | --- |
  | `npm run cli:build` | 통과 |
  | `npm run cli:test` | 218 pass / 0 fail |
  | `npm test` | 58 pass / 0 fail |
  | `npm run test:plugin-artifact` | 통과 (clean install, Codex/Claude TS·TSX·JS·JSX fallback) |

- 고정 workspace 캡처의 결정성을 먼저 확인했다. W0-4 부록 A의 캡처 스크립트를
  [`task-m1-provider-seam.md`](task-m1-provider-seam.md) 원문에서 다시 추출해 코드를 바꾸지 않은 채 두 번
  실행했고, 29개 시나리오가 `diff -r` 기준 byte 동일했다. workspace는 스크립트가 고정한
  `$TMPDIR/il-provider-seam-capture-fixed`를 그대로 사용해 symbolId와 note conflictToken을 안정화했다.
  이 baseline이 2단계의 “readiness 미선언 경로 무변경” 판정 기준이다.
- 이 시점의 저장소 상태: `origin/main` `c61dd86`, branch `feat/m1-provider-readiness`는 그 commit에서
  분기했으며 열린 PR은 없다. 코드는 아직 한 줄도 바꾸지 않았고 이 단계의 산출물은 문서와 기준선뿐이다.
- 남은 사용자 결과: readiness 실측은 아직 동작하지 않는다. 사용자는 여전히 준비 중 empty와 실제 empty를
  구분할 수 없다. 다음 순서는 2단계 구현이다.
