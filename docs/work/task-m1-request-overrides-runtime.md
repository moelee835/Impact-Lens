# M1 요청별 provider 설정 runtime 연결

- 작성일: 2026-08-28
- branch: `feat/m1-request-overrides-runtime`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 선행 작업: [요청 override 계약](task-m1-request-overrides.md),
  [M1 Wave 1 재개 handover](task-m1-wave1-resume-handover.md)
- 관련 story: [`IL-LIM-004`](../development-management/stories/il-lim-004-first-class-language-presets.md),
  [`IL-LIM-005`](../development-management/stories/il-lim-005-custom-lsp-compatibility.md)

## 목적과 사용자 가치

에이전트는 현재 분석 요청에 `providerPreset`, `initializationOptions`, `settings`를 적을 수 있지만 실제
Language Server 선택과 초기화에는 그 값이 사용되지 않는다. 입력이 유효하다는 응답을 받은 사용자는 자신이
지정한 provider와 설정으로 분석됐다고 믿을 수 있으므로, 이 상태는 단순한 미구현보다 위험하다.

이 작업이 끝나면 사용자는 다음을 할 수 있다.

- 요청 하나에서 catalog preset을 명시하고, 응답의 `selectedBy: preset`으로 실제 선택을 확인한다.
- 저장소 설정을 바꾸지 않고 해당 분석에만 initialization option과 workspace setting을 전달한다.
- preset·project·request 설정이 합쳐져 Language Server에 보내기 지나치게 커지면 실행 전에 구체적인
  `provider_config_invalid` 진단을 받는다.

M1의 최종 목표는 raw command와 provider 내부 지식 없이도 분석을 시작하고 결과의 신뢰 범위를 이해하게 하는
것이다. 요청 계약만 merge된 지금은 “필드를 받을 수 있음”과 “실제로 적용함” 사이가 끊겨 있으므로,
readiness나 추가 UX보다 이 공백을 먼저 닫아야 한다.

## 배경과 해결할 문제

PR #41은 schema v1에 세 optional 필드를 추가하고 요청 경계의 타입·depth·64 KiB·1000 keys·prototype key
제한을 검증한다. 그러나 구현 범위를 의도적으로 파싱과 보존까지로 제한했다.

현재 analyze 경로는 `AnalyzeRequest`에 보존된 세 값을 `LspCallHierarchyProvider`에 전달하지 않는다. provider
생성자는 `resolveProvider(file, command, { workspace })`만 호출한다. 반면 provider 계층에는 이미 명시 preset과
request override를 받아 `preset < project < request`로 병합하는 seam이 있다.

또한 각 입력이 개별 64 KiB/1000-key 제한을 만족해도 합쳐진 최종 설정이 제한을 넘을 수 있다. 실제 wire에
실리는 것은 병합 결과이므로, 병합 뒤 예산 검사가 없으면 요청 경계 검증만으로 D8의 목적을 달성하지 못한다.

## 범위

- analyze 요청의 `providerPreset`을 provider 선택에 전달한다.
- analyze 요청의 `initializationOptions`와 `settings`를 request override tier로 전달한다.
- 직접 session 값으로 객체 전체를 교체하지 않고 provider 계층의 deep merge와 redaction 수집을 통과시킨다.
- 병합된 initialization/settings의 byte·key 예산을 다시 검사한다.
- 병합 후 실패는 어느 한 입력을 잘못 지목하지 않는 `provider_config_invalid`로 보고하고 preset/project/request
  각각의 byte·key 기여량을 값 노출 없이 제공한다.
- 실제 CLI stdin 요청으로 preset 선택과 설정 수신을 검증한다.
- 기존 override 없는 요청의 응답이 바뀌지 않았음을 회귀 테스트와 고정 workspace 캡처로 확인한다.

## 범위에서 제외할 항목

- note 요청에 세 override 필드 추가
- provider readiness, dynamic registration과 indexing 상태 실측(W2-A)
- Plugin 계약 문서·summary eval과 withheld reason code 해제(W2-C)
- F9 `provider_ipc_unavailable` stage 축소
- M1 milestone/story 상태 정리
- schema version 변경 또는 새 request field 추가
- 자동 provider 설치, build, configure 또는 sync

## 현재 구현 조사 결과

### Merge 기준

- PR #43 목적 중심 작업 규칙: merge commit `1a5e414`
- PR #42 M1 재개 handover: merge commit `ffea2c9`
- PR #41 요청 override 계약: merge commit `210c7b4`
- 이 branch는 최신 `origin/main` `210c7b4`에서 생성했다.

### 끊어진 runtime 경로

- `cli/src/index.ts`의 analyze 경로는 request를 파싱해 세 필드를 보존하지만 provider 생성자에는 기존 네 인자만
  전달한다.
- `cli/src/lspProvider.ts` 생성자는 provider를 `{ workspace }`만으로 resolve한다. 다섯 번째 인자는 test와
  doctor가 이미 resolve된 session 값을 직접 주입하는 통로라서, 요청 값을 여기에 넣으면 provider 계층의
  deep merge와 secret 수집을 우회한다.
- `cli/src/providers/resolve.ts`의 `ProviderResolutionOptions`는 이미 `providerPreset`과 `override`를 받으며,
  `resolveSessionValues`는 `preset < project < request` 순서로 두 설정 트리를 독립 병합한다.
- `resolveSessionValues`는 입력별 검증 뒤 병합 결과의 byte/key 예산을 다시 검사하지 않는다.
- `requestOverrides.test.ts`의 실제 CLI 검사는 `provider.selectedBy`가 문자열인지만 확인하므로, 요청 preset이
  무시되는 현재 동작도 통과한다.

### 영향 범위 근거

Impact Lens CLI로 `resolveSessionValues`의 incoming caller를 depth 4로 분석했다. 직접 caller는
`resolveProvider`와 doctor의 `resolveSession`이며, 전이 경로에는 `LspCallHierarchyProvider`, CLI `run`, doctor
smoke/fixture가 있었다. 관련 test로 `providers.test.ts`, `doctor.test.ts`, `lsp.integration.test.ts`가 식별됐다.

분석은 `coverage.traversal.status: depth-limited`, `semantic.status: static-only`,
`indexing.status: unknown`이므로 runtime·동적 호출까지 완전하다는 근거는 아니다. constructor 좌표는 callable을
찾지 못해 `target_not_found`였으며, class caller는 `resolveSessionValues` 전이 결과와 `rg`로 보완했다.
최초 runner fallback은 npm cache 권한 오류로 실패했고, 기존 local CLI `0.6.3`을 명시해 분석을 성립시켰다.

## 설계 결정

### 1. provider 생성자의 마지막 인자는 resolution과 direct session을 구분하는 options 객체로 바꾼다

요청 override는 provider 선택 전에 필요하고 direct session은 선택 뒤 test/doctor가 쓰는 escape hatch다.
둘을 같은 객체나 우선순위로 취급하면 request가 preset/project merge를 우회한다. 생성자 options에 두 통로를
명시적으로 분리하고, analyze 경로는 resolution만 사용한다. 기존 direct-session test는 session 하위에 값을
옮겨 의미를 유지한다.

### 2. 병합 후에는 byte와 key 예산을 검사하고 출처별 수치만 보고한다

병합은 한 입력보다 depth를 깊게 만들지 않지만 서로 다른 branch를 합쳐 byte와 key 수를 늘릴 수 있다. 따라서
병합 뒤에는 두 예산만 다시 검사한다. 오류 details에는 preset/project/request별 serialized byte와 key 수만
담고 실제 설정 값이나 경로·secret은 담지 않는다.

### 3. preset 선택과 설정 전달을 서로 다른 실제 CLI case로 증명한다

`provider`와 `providerPreset`은 한 요청에 같이 쓸 수 없다. 따라서 bundled preset 요청으로
`selectedBy: preset`을 증명하고, custom fixture 요청으로 initialization option과 workspace configuration 수신을
증명한다. 두 case를 억지로 하나로 합쳐 상호 배타 계약을 약화하지 않는다.

## 단계별 구현 계획

### 1단계 — 목적·설계·기준선 고정

목적: 구현 전에 사용자 결과, 변경 경계, 영향 caller와 기존 동작 기준을 재현 가능하게 고정한다.

산출물: 이 작업 문서, Impact Lens 영향 근거, override 없는 요청의 고정 workspace 기준 캡처와 baseline test
결과.

검증: 문서 링크, `git diff --check`, CLI build/test와 기준 캡처 자체의 반복 결정성을 확인한다. 문서와
기준선만 독립 commit·push한다.

### 2단계 — 요청 설정 적용과 병합 예산 보호

목적: 사용자가 요청에 지정한 provider와 설정이 실제 분석 session에 적용되며, 합쳐진 설정이 안전한 wire
예산을 넘지 않게 한다.

산출물: analyze→provider resolution 연결, 병합 후 byte/key 검사와 출처별 진단, preset/settings CLI E2E,
기존 direct-session test의 명시적 options 전환, 작업 로그와 완료 근거.

검증: targeted tests, 전체 CLI·Extension unit tests, Plugin artifact E2E, override 없는 기준 캡처의 byte 동일성,
`git diff --check`를 확인한 뒤 구현·test·문서를 하나의 독립 commit으로 push하고 PR을 연다.

## 테스트 및 완료 기준

- [ ] `npm run cli:build` 통과
- [ ] `npm run cli:test` 통과
- [ ] `npm test` 통과
- [ ] `npm run test:plugin-artifact` 통과
- [ ] 실제 stdin preset 요청이 `selectedBy: preset`을 반환한다.
- [ ] 실제 stdin custom-provider 요청의 initialization option과 settings를 fixture가 수신한다.
- [ ] preset < project < request deep merge가 유지되고 요청 leaf가 최종값이 된다.
- [ ] 개별 입력은 유효하지만 병합 key 또는 byte 예산을 넘는 두 case가 `provider_config_invalid`로 실패한다.
- [ ] 병합 예산 오류가 값 대신 preset/project/request별 byte·key 수만 보고한다.
- [ ] 요청에 없는 기존 분석·doctor·note 응답 캡처가 변경 전후 byte 동일하다.
- [ ] secret sentinel이 provider message, stderr와 error details에 노출되지 않는다.
- [ ] `schemaVersion`은 1이고 note request 계약은 변하지 않는다.
- [ ] `git diff --check`가 통과한다.
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다.

## 작업 로그

### 2026-08-28 — merge와 구현 전 조사

- 사용자 승인에 따라 PR #43, #42, #41을 차례로 merge하고 각 merge commit을 확인했다.
- 최신 `origin/main` `210c7b4`에서 `feat/m1-request-overrides-runtime` branch를 만들었다.
- Impact Lens 분석이 지목한 provider/doctor/CLI/test 경로와 실제 source의 constructor 호출 지점을 대조했다.
- 요청을 direct session으로 넣지 않고 resolution options로 전달해야 기존 merge/redaction 경계를 지킨다는 설계
  결정을 기록했다.

### 2026-08-28 — 1단계: 목적·설계·기준선 고정

- 변경 전 `npm run cli:test`가 213/213, `npm test`가 58/58로 통과했다.
- `task-m1-provider-seam.md` 부록의 원문 캡처 script를 파일로 복사하지 않고 stdin으로 실행했다. 고정
  workspace에서 분석 성공 9, provider/target 실패 13, doctor/CLI 표면 4, note 3의 총 29개 시나리오를 두 번
  캡처했다.
- `/private/tmp/il-m1-runtime-base1`과 `base2`의 `diff -r`가 비어 기준선 자체가 결정적임을 확인했다. 캡처의
  `note-set` status 4는 apply token 없이 mutation을 시도하는 기존 시나리오의 의도된 결과다.
- 이 단계에서는 제품 code와 test를 변경하지 않았다. 작업 목적, runtime 공백, 영향 범위, 설계 결정과
  검증 기준만 이 문서에 고정했다.
