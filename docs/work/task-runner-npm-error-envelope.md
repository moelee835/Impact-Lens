# Plugin runner npm 실패의 단일 JSON envelope 정규화

## 배경과 해결할 문제

`IL-LIM-017` 구현으로 runner는 Node preflight, CLI resolution provenance와 CLI 실행 후의 provider lifecycle
실패를 모두 하나의 JSON envelope로 보고한다. 그러나 release fallback 경로에서 **CLI가 시작되기 전에 npm이
실패하는 구간**만 예외로 남아 있다.

```sh
exec npm exec --yes --package="$impact_lens_release_package" -- impact-lens "$@"
```

`exec`로 npm에 프로세스를 넘기므로 network 차단, npm cache 권한 문제, release asset 부재 같은 실패는 npm의
사람용 stderr와 npm의 exit code로 그대로 노출된다. 이 구간의 결과는 다음 성질을 가진다.

- stdout/stderr가 schema v1 envelope가 아니므로 agent가 구조적으로 해석할 수 없다.
- `error.code`가 없어 network 문제인지, 권한 문제인지, artifact 부재인지 자동으로 구분되지 않는다.
- runner가 이미 갖고 있는 `runtime`(Node version, runner source) 정보가 실패 응답에 실리지 않는다.

`IL-LIM-017` story의 `미해결 질문`과 [M0 handover](task-m0-provider-runtime-handover.md)가 이 항목을 후속
runner UX 과제로 남겨 두었다. 이 작업은 그 구간을 나머지 실패 경로와 같은 계약으로 맞춘다.

## 범위

- release fallback의 npm 실행 실패를 단일 compact JSON envelope로 정규화한다.
- npm stderr 내용으로 network, 권한, release asset 부재, 그 외 실패를 구분되는 `error.code`로 분류한다.
- CLI가 이미 시작돼 자체 JSON 오류를 낸 경우에는 이중 wrapping 없이 그대로 통과시키고 exit code를 보존한다.
- 사람이 원본 npm 출력을 봐야 할 때를 위한 명시적 opt-in 경로를 제공한다.
- runner 단위 테스트, skill 계약 문서와 설치 문제 해결 문서를 갱신한다.

## 범위에서 제외할 항목

- CLI(`@impact-lens/cli`)의 코드나 응답 schema 변경
- 새 CLI/Extension release 발행 또는 version bump (`0.6.0` 유지)
- runner의 resolution 순서(`explicit → checkout → global → release-fallback`) 변경
- npm 실패의 자동 재시도나 대체 registry 탐색
- Python/외부 provider preset 등 M1 이후 범위

## 현재 구현 조사 결과

- runner의 오류 emitter `impact_lens_error`는 code/message/details를 받아 `{"schemaVersion":1,...}` 한 줄을
  stderr로 쓰고 exit code 127로 종료한다. `retryable`은 현재 항상 `false`로 고정돼 있다.
- 이미 정규화된 실패: `node_runtime_unavailable`, `node_version_unreadable`, `node_version_unsupported`,
  `cli_artifact_missing`, `cli_artifact_not_executable`, `npm_runtime_unavailable`.
- 정규화되지 않은 유일한 구간은 마지막 줄의 `exec npm exec ...`이다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`는 실패 시 stderr에 compact JSON
  한 건이라고 명시한다. 현재 npm 실패는 이 계약을 지키지 못한다.
- `cli/src/test/runner.test.ts`에 POSIX 전용 harness가 있고 `PATH`를 임시 `bin`으로 바꿔 `node`, `npm`,
  `impact-lens`를 stub으로 대체한다. 새 실패 경로 테스트를 여기에 추가할 수 있다.
- `scripts/test-plugin-artifact-e2e.mjs`는 Windows에서 Git Bash로 runner를 실행한다. 따라서 runner는 POSIX
  sh 범위를 유지해야 하고 GNU 전용 도구에 의존할 수 없다.

### 설계 결정

1. **temp file 없이 stderr만 캡처한다.** `{ npm ... 2>&1 1>&3 3>&-; printf '\n%s' "$?"; } 3>&1` 형태로
   stdout은 그대로 흘려보내고 stderr와 exit status만 변수에 담는다. `mktemp` 의존과 정리 실패 위험을 없앤다.
2. **CLI가 낸 JSON은 그대로 통과시킨다.** 캡처한 stderr에 `{"schemaVersion":`가 포함되면 CLI가 이미 시작돼
   자체 계약으로 실패한 것이므로 원문을 그대로 다시 쓰고 npm의 exit code를 보존한다. npm 경고가 앞에 붙는
   경우를 고려해 접두사 일치가 아니라 포함 여부로 판정한다.
3. **원본 npm 텍스트는 envelope에 담지 않는다.** npm stderr에는 release package URL, 절대 경로, proxy나
   registry credential이 섞일 수 있다. runtime redaction 원칙과 충돌하므로 분류 결과와 exit code만 싣는다.
4. **사람용 원문은 opt-in으로 남긴다.** `IMPACT_LENS_RUNNER_NPM_OUTPUT=passthrough`이면 기존처럼 npm에
   `exec`으로 넘겨 원본 출력과 exit code를 그대로 보여준다. 기본값은 정규화다.
5. **`retryable`을 실패 성격에 맞춘다.** network 계열만 `true`로 두고 나머지는 `false`를 유지한다.

### 오류 code 분류

| 조건 | code | retryable | recovery |
| --- | --- | --- | --- |
| `ENOTFOUND`, `EAI_AGAIN`, `ETIMEDOUT`, `ECONNREFUSED`, `ECONNRESET`, `ERR_SOCKET_TIMEOUT` | `npm_network_unreachable` | true | `check_network_or_install_cli` |
| `E404`, `404 Not Found` | `cli_release_unavailable` | false | `verify_release_or_set_cli_path` |
| `EACCES`, `EPERM` | `npm_permission_denied` | false | `fix_npm_cache_permissions_or_install_cli` |
| `ENOSPC` | `npm_disk_space_unavailable` | false | `free_disk_space_and_retry` |
| 그 외 비정상 종료 | `npm_release_fallback_failed` | false | `inspect_npm_output_or_install_cli` |

모든 경우 `error.details`는 `stage: resolution`, `component: npm`, `source: release-fallback`,
`exitCode`, `recovery`, `npmOutput: suppressed`를 포함한다.

## 단계별 구현 계획

### 1단계 — 계획 문서화

이 문서를 작성하고 독립 commit으로 push한다.

완료 조건: 설계 결정, 오류 분류표와 검증 계획이 구현 전에 기록된다.

### 2단계 — runner 정규화 구현과 검증

1. `impact_lens_error`에 retryable 값을 주입할 수 있게 하고 npm 실행 결과 처리 로직을 추가한다.
2. `cli/src/test/runner.test.ts`에 통과 경로, 분류 경로, CLI JSON 통과 경로와 passthrough 경로 테스트를
   추가한다.
3. skill 계약 문서와 `INSTALL.md` 문제 해결 절차에 새 code와 opt-in 환경 변수를 반영한다.
4. Plugin payload manifest version을 `0.2.1`로 올려 host가 새 runner를 update로 인식하게 한다.
5. `npm run test:all`과 `npm run test:plugin-artifact`를 실행한다.
6. 독립 commit 후 같은 개발 branch에 push하고 3-OS matrix를 확인한다.

완료 조건: 새 실패 경로가 단일 JSON으로 보고되고 기존 성공/실패 계약이 회귀하지 않는다.

### 3단계 — PR과 병합

1. PR을 만들고 3-OS matrix 통과를 확인한다.
2. 병합 후 `IL-LIM-017` story의 후속 과제 상태를 갱신한다.

완료 조건: 변경이 `main`에 병합되고 story 기록이 실제 상태와 일치한다.

## 테스트 및 완료 기준

- [ ] 1단계: 설계 결정과 분류표가 구현 전에 문서화된다.
- [ ] 2단계: npm 실패가 stdout 없이 exit 127과 단일 JSON envelope로 보고된다.
- [ ] 2단계: network/권한/404/기타 실패가 서로 다른 `error.code`로 분류된다.
- [ ] 2단계: CLI가 낸 JSON 오류는 이중 wrapping 없이 원문과 exit code가 보존된다.
- [ ] 2단계: 성공 경로의 stdout과 exit code가 변하지 않는다.
- [ ] 2단계: `IMPACT_LENS_RUNNER_NPM_OUTPUT=passthrough`가 원본 npm 출력과 exit code를 유지한다.
- [ ] 2단계: envelope에 release package URL, 절대 경로, credential이 포함되지 않는다.
- [ ] 2단계: `npm run test:all`과 `npm run test:plugin-artifact`가 통과한다.
- [ ] 3단계: PR의 Ubuntu/macOS/Windows Node 22 check가 모두 성공하고 병합된다.

## 작업 로그

### 2026-08-26 — 1단계 계획 수립

- 변경 파일: `docs/work/task-runner-npm-error-envelope.md` (신규)
- runner에서 유일하게 정규화되지 않은 구간이 마지막 `exec npm exec ...` 한 줄임을 확인했다.
- temp file 대신 file descriptor 교환으로 stderr만 캡처하기로 했다. Windows E2E가 Git Bash로 runner를
  실행하므로 POSIX sh 범위와 GNU 비의존을 유지해야 한다는 제약을 먼저 고정했다.
- npm stderr 원문을 envelope에 담지 않기로 했다. redaction이 불완전할 수 있는 credential/URL 노출 위험이
  진단 편의보다 크다고 판단했고, 대신 opt-in passthrough를 제공한다.
