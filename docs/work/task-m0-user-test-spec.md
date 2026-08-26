# M0 사용자 테스트 명세 작성

## 배경과 해결할 문제

M0 마일스톤의 자동 gate는 [v0.6.0 release 검증](task-m0-release-0-6-0.md)으로 모두 충족됐다. 남은 종료
gate는 하나다.

> `user-tests/m0-user-test-spec.md`가 release candidate 기준으로 검토됐으며, 실제 사용자 검증 결과 또는
> 실행 보류 사유가 release decision에 기록된다.

[마일스톤별 사용자 테스트 명세 계획](../development-management/milestones/user-validation-planning.md)은
"실제 CLI/Extension/Plugin UI와 오류 문구가 안정되면" 명세를 작성하라고 정한다. `v0.6.0` release와
[runner npm 오류 정규화](task-runner-npm-error-envelope.md)로 M0 범위의 사용자 노출 오류 문구가 모두
확정됐으므로 이제 명세를 작성할 수 있다.

## 범위

- `docs/development-management/user-tests/m0-user-test-spec.md` 작성
- 계획 문서가 요구하는 필수 구성 항목 충족
- M0 마일스톤과 `IL-LIM-017` story의 상태를 실제 진행 상황에 맞게 갱신
- `IL-LIM-017`의 후속 과제였던 npm envelope 정규화 완료 사실 반영

## 범위에서 제외할 항목

- 실제 사용자 테스트 실행, 참여자 모집, 일정 확정
- 합격 수치(성공률, latency threshold) 확정
- M1~M6 명세 작성
- sample 저장소 실제 구축
- M0 종료 gate를 통과로 표시하는 행위

## 현재 구현 조사 결과

- `user-validation-planning.md`는 명세 필수 구성 12개 항목, 과업 작성 원칙 7개, 공통 증거 형식 7개를
  지정한다. 명세는 이 세 목록을 모두 만족해야 한다.
- 같은 문서가 "명세 파일이 존재한다는 이유만으로 사용자 검증을 통과한 것으로 표시하지 않는다"와
  "구현자가 아닌 검토자가 명세를 검토한다"를 명시한다. 따라서 이번 작업으로 M0 gate를 체크할 수 없다.
- M0 종료 gate 9개 중 8개는 충족 상태이고, 남은 하나가 이 명세와 실제 검증이다.
- `user-tests/` 디렉터리는 아직 없었다. M0 명세가 첫 파일이다.
- M0에서 사용자에게 노출되는 실패 문구는 다음 계층으로 고정됐다. 명세의 복구 과업은 이 계층을 그대로
  사용한다.
  - Node: `node_runtime_unavailable`, `node_version_unreadable`, `node_version_unsupported`
  - CLI artifact: `cli_artifact_missing`, `cli_artifact_not_executable`
  - npm 다운로드: `npm_runtime_unavailable`, `npm_network_unreachable`, `cli_release_unavailable`,
    `npm_permission_denied`, `npm_disk_space_unavailable`, `npm_release_fallback_failed`
  - provider lifecycle: `provider_launch_failed`, `provider_initialize_failed`,
    `provider_capability_missing`, `provider_query_failed`
  - 언어 preset 부재: `provider_required_for_language`

## 단계별 구현 계획

### 1단계 — 명세 작성과 관리 문서 갱신

1. `user-tests/m0-user-test-spec.md`를 계획 문서의 필수 항목 기준으로 작성한다.
2. M0 마일스톤과 `IL-LIM-017` story에 명세 작성 사실과 남은 조건을 기록한다.
3. `IL-LIM-017`의 npm envelope 후속 과제 완료를 반영한다.
4. 독립 commit 후 push하고 PR로 반영한다.

완료 조건: 명세가 필수 항목을 모두 포함하고, 관리 문서가 "명세 작성 완료, 검토·실행 미수행" 상태를 정확히
표현한다.

## 테스트 및 완료 기준

- [ ] 명세가 계획 문서의 필수 구성 12개 항목을 모두 포함한다.
- [ ] 과업이 UI 조작이 아니라 사용자 outcome으로 작성됐다.
- [ ] 내부 provider command/args/`languageId`와 오류 code를 사전에 노출하지 않는다.
- [ ] 깨진 상태 준비 절차가 시스템·source·사용자 홈을 손상시키지 않는다.
- [ ] 합격 수치를 추측으로 고정하지 않고 baseline 측정 절차를 둔다.
- [ ] privacy 수집 금지·허용 항목과 redaction 절차가 명시된다.
- [ ] M0 gate가 통과로 표시되지 않고 검토·실행이 남았다는 사실이 기록된다.
- [ ] `IL-LIM-017`의 npm envelope 후속 과제 상태가 실제 구현과 일치한다.

## 작업 로그

### 2026-08-26 — 명세 작성

- 변경 파일: `docs/development-management/user-tests/m0-user-test-spec.md` (신규),
  `docs/development-management/milestones/m0-provider-runtime-trust.md`,
  `docs/development-management/stories/il-lim-017-plugin-provider-runtime-reliability.md`,
  `docs/development-management/milestones/README.md`,
  `docs/work/task-m0-user-test-spec.md` (신규)
- 명세는 14개 절로 구성했다. 목적/비목적, 참여자, 환경 matrix, 시작 상태 6종, 과업 8건, 기대 결과와 중단
  조건, 관측 지표, 사후 질문, 통과·보류 기준, privacy, 증거 형식, 실패 처리, 검토 체크리스트다.
- 과업은 "이 함수를 바꾸면 어떤 코드가 영향을 받는지 확인해 주세요" 같은 outcome 문구로 작성하고, 진행자가
  provider 설정과 오류 code를 사전에 설명하지 않도록 명시했다.
- 복구 과업(T4~T6)은 실제 구현된 실패 계층(Node / CLI artifact / npm 다운로드)에 1:1로 대응시켰다.
  참여자가 "어느 계층인지" 지목할 수 있는지를 지표로 삼는다.
- 깨진 상태는 모두 세션 범위로 한정했다. 특히 npm 실패 상태는 사용자 `~/.npm`을 건드리지 않고 task 전용
  cache로 구성하도록 못박았다. 이는 이번 마일스톤 작업 중 실제로 겪은 root 소유 npm cache 문제에서 얻은
  제약이다.
- 합격 수치는 확정하지 않고 pilot 2명으로 baseline을 측정하도록 했다. 대신 수치 없이도 적용 가능한 정성
  통과 기준 5개를 두었다.
- `complete`/coverage 과신 여부를 T8과 사후 질문 1~2로 이중 확인하도록 배치했다. 자동 build·test 미발생
  확인은 관측 지표와 사후 질문 5에 함께 넣어, 진행자가 미리 언급하지 않아도 검출되게 했다.
- M0 gate는 체크하지 않았다. 계획 문서 규칙상 명세 작성만으로는 통과가 아니며 구현자가 아닌 검토자의 검토와
  실제 실행이 남아 있다.
