# 남은 한계점 마일스톤 구조화

## 배경과 해결할 문제

개발 관리 문서에는 17개 한계점 스토리와 권장 실행 wave가 있지만, wave는 목적·산출물·진입 조건·종료
gate가 부족해 실제 릴리스와 진행률을 관리하기 어렵다. `IL-LIM-003` 구현 이후 남은 작업을 의존성에 맞는
마일스톤으로 나누고, 각 스토리가 어느 결과물에 기여하는지 명확히 해야 한다.

## 범위

- 남은 스토리를 선행 관계와 사용자 가치 기준으로 7개 마일스톤에 배치한다.
- 각 마일스톤에 목표, 포함 스토리/단계, 진입 조건, 산출물, 종료 gate, 주요 위험과 제외 범위를 기록한다.
- 모든 스토리에 소유 마일스톤을 연결한다.
- 구현이 일부 끝난 `IL-LIM-003`의 PR/릴리스 마감, `IL-LIM-004`의 provider 기반/언어 preset 검증과
  `IL-LIM-006`의 baseline/언어 지원 단계를 별도로 표현한다.
- 개발 관리 README의 기존 wave를 새 마일스톤 인덱스로 대체한다.
- 각 마일스톤 구현 후 실제 사용자 테스트 명세를 별도 문서로 제안하는 단계를 예약한다.

## 범위에서 제외할 항목

- 각 스토리의 코드 구현
- GitHub milestone/issue/PR 생성 또는 원격 저장소 변경
- 달력 날짜나 인력 투입을 전제로 한 일정 확정
- 아직 측정하지 않은 공수의 숫자 추정
- 현재 시점의 구체적인 사용자 테스트 case 작성, 참여자 모집 또는 테스트 실행

## 현재 구현 조사 결과

- `IL-LIM-003`은 수용 기준과 로컬 검증을 충족했지만 PR이 없어 `In progress`이다.
- 실행상 다음 차단 요소는 JS/JSX bundled provider의 실제 artifact/runtime 신뢰성을 다루는 `IL-LIM-017`이다.
- provider core와 Auto/preset보다 언어 E2E를 먼저 확대하면 사용자 설정과 오류 의미가 언어마다 달라질 수 있다.
- 동적 호출과 DI edge는 provider/coverage provenance 및 incomplete 의미가 안정된 뒤 도입해야 결과 과신을 막을 수 있다.
- 저장하지 않은 buffer, 대규모 graph, 테스트 후보, callable/note 확장은 핵심 신뢰성·언어 기반과 독립성이
  높아 뒤 마일스톤에서 개별 release할 수 있다.
- 기존 wave는 위 선행 관계를 대략 표현하지만, gate와 release 가능한 사용자 결과가 정의되지 않았다.

## 단계별 구현 계획

1. 모든 스토리를 단일 완료 마일스톤에 배치하고, 필요한 경우 단계 단위 선행 마일스톤을 명시한다.
2. `milestones/README.md`에 전체 순서, 의존성, 진행률 계산과 release 원칙을 정의한다.
3. 7개 마일스톤 문서에 목표·범위·산출물·진입/종료 gate·위험·후속 연결을 기록한다.
4. 각 스토리 header에 마일스톤을 추가하고 개발 관리 README의 wave 표를 새 구조로 교체한다.
5. story 17개가 모두 매핑되고 링크·상태·중복 소유가 일관적인지 정적 검사한다.
6. 공통 사용자 테스트 명세 작성 규칙과 M0~M6별 검증 초점을 단계별 계획에 추가한다. 실제 명세는 각
   마일스톤의 기능·UI가 안정된 release candidate 시점에 별도 작업 문서로 작성한다.

## 테스트 및 완료 기준

- 17개 스토리 모두 completion milestone이 있고 누락이나 의도하지 않은 중복 완료 소유가 없다.
- `IL-LIM-004`와 `IL-LIM-006`의 기반/baseline 단계와 completion milestone 경계가 명시된다.
- 각 마일스톤에 진입 조건, 종료 gate, 사용자 산출물, 제외 범위와 다음 의존성이 있다.
- M0부터 M6까지 순서가 provider 신뢰성 → UX/core → P1 언어 → P2 언어 → 의미 보완 → workflow → 장기 기능의
  선행 관계를 위반하지 않는다.
- 개발 관리 README와 milestone index의 링크 및 story 상태가 일치한다.
- Markdown 링크 검사와 `git diff --check`가 통과한다.
- 각 마일스톤에 사용자 테스트 명세 작성 단계, 예정 문서 경로, 작성 시점과 실제 실행을 현재 하지
  않는다는 경계가 명시된다.

## 작업 로그

### 2026-08-25 — 착수 및 구조 결정

- clean worktree와 현재 17개 story 상태를 확인했다. `IL-LIM-003`만 `In progress`, 나머지는 Backlog이다.
- 기존 6개 wave를 그대로 이름만 바꾸지 않고, 릴리스 가능한 사용자 결과와 gate가 있는 M0~M6로
  재정의하기로 했다.
- story의 completion ownership은 하나로 유지하되 `IL-LIM-004`는 M1 provider 기반 후 M2 preset 검증,
  `IL-LIM-006`은 M0 실패 baseline 후 M2 Python 지원 완료로 명시적 단계 분할한다.
- 초기에는 모든 언어를 M2 하나로 묶는 6개 구조를 고려했지만, Swift/Kotlin의 toolchain·Alpha 위험이
  Python/C/C++ P1 지원을 지연시킬 수 있어 P1 언어 M2와 P2 언어 M3으로 분리했다.

### 2026-08-25 — 마일스톤 문서와 story 연결

- `docs/development-management/milestones/README.md`에 M0~M6 순서, 의존 graph, story completion ownership,
  단계 분할과 진행률 규칙을 추가했다.
- `milestones/m0-provider-runtime-trust.md`부터 `m6-notes-language-polish.md`까지 7개 문서를 만들고 각각
  목표, 포함 범위, 진입 조건, 산출물, 종료 gate, 제외 범위, 위험과 다음 연결을 기록했다.
- M0은 현재 진행 중인 IL-LIM-003 PR 마감, IL-LIM-017 packed artifact/Plugin cache 신뢰성 및 IL-LIM-006
  실패 baseline을 묶었다. 관측된 JS/JSX code 1 문제를 해결하기 전에는 새 언어를 verified로 승격하지
  않도록 gate를 설정했다.
- M1은 IL-LIM-005/009를 완료 소유하고 IL-LIM-004의 catalog/doctor 기반을 선행 구현한다. raw custom
  provider 호환성과 Auto 안전 기본값을 동시에 유지하도록 했다.
- M2는 P1 사용자 가치를 먼저 전달하기 위해 Python·Go·C/C++를 묶고, Swift/Kotlin은 toolchain 및 Alpha
  위험을 격리한 M3으로 분리했다. IL-LIM-011은 M2/M3 실제 provider matrix가 있어야 안전하게 callable을
  넓힐 수 있으므로 M3에서 완료한다.
- M4는 IL-LIM-001/002/010을 provenance가 있는 semantic evidence 단위로 묶었다. 동적/DI/test 후보를
  확정 LSP edge와 섞지 않고, Spring Java/Kotlin을 첫 framework adapter 후보로 명시했다.
- M5는 unsaved overlay와 대형 graph budget/resume을, M6는 Personal note host 경계와 검증 언어 source
  comment를 묶었다. M5/M6는 M4 이후 필요하면 병렬 진행할 수 있음을 기록했다.
- 17개 story header에 클릭 가능한 완료 마일스톤 링크를 추가했다. IL-LIM-004에는 M1 선행 기여,
  IL-LIM-006에는 M0 선행 기여를 별도로 연결했다.
- `docs/development-management/README.md`의 기존 wave 표를 마일스톤 표와 단계 분할 설명으로 교체하고
  디렉터리 구조에 `milestones/`를 추가했다.

### 2026-08-25 — 검증 결과

- story 수 17, 완료 마일스톤 header 17, 상세 milestone 문서 7을 확인했다.
- 상세 milestone의 `완료 소유`에서 IL-LIM-001~017이 정확히 한 번씩 등장하며 누락 0, 중복 0임을
  Node 정적 검사로 확인했다.
- 개발 관리 아래 Markdown 27개를 재귀 검사해 상대 링크 누락 0건을 확인했다.
- M0~M6 각 문서에 목표, 진입 조건, 산출물, 종료 gate, 제외 범위와 주요 위험 섹션이 모두 있음을
  검사했다.
- `git diff --check`: 통과.
- 문서 전용 변경이므로 compile/runtime test는 실행하지 않았다. 기존 제품 동작에는 변경이 없다.

### 남은 제한 및 후속 작업

- GitHub milestone, issue, PR과 실제 release version/date는 생성하거나 확정하지 않았다. 원격 변경은 이번
  요청 범위가 아니며 team capacity 정보도 없기 때문이다.
- 각 milestone의 정량 latency/precision budget은 해당 구현 착수 시 baseline 측정 후 work 문서에서
  수치화해야 한다. 현재 문서는 gate의 종류만 정의한다.
- M3 전체가 지연될 때 M4 spike를 앞당길 수 있지만, 공식 semantic augmentation release는 지원 언어에서
  안전한 degrade와 provenance를 검증해야 한다.

### 2026-08-25 — 사용자 테스트 명세 계획 추가

- 사용자는 각 마일스톤마다 실제 사용자가 수행할 테스트 명세를 제안하되 지금 작성·실행하지 말고
  단계별 계획으로 예정하도록 요청했다.
- 기능이 확정되기 전에 상세 과업과 기대 결과를 고정하면 구현 변경으로 명세가 즉시 낡을 수 있으므로,
  공통 템플릿만 지금 정의하고 실제 명세는 각 마일스톤의 자동 E2E 통과 후 release candidate 단계에서
  작성하도록 결정했다.
- `milestones/user-validation-planning.md`에 명세 작성/검토/실행 시점, 필수 구성, outcome 중심 과업 원칙,
  privacy와 공통 증거 형식을 기록했다. 명세 작성과 실제 사용자 검증 통과를 별개 상태로 관리한다.
- M0~M6 각 문서에 `단계별 계획`을 추가해 기준선 → 구현 → 자동 gate → 사용자 테스트 명세 제안 → 별도
  사용자 검증/release 결정 순서를 명시했다.
- 마일스톤별 예정 명세 경로는 `user-tests/m0-user-test-spec.md`부터
  `user-tests/m6-user-test-spec.md`까지 예약했다. 아직 디렉터리나 placeholder 명세는 만들지 않았다.
- 각 마일스톤의 검증 초점을 실행 설치/복구(M0), Auto·doctor·completeness 이해(M1), 언어별 zero-config와
  readiness(M2), toolchain·callable(M3), evidence·오탐 이해(M4), unsaved·partial/resume workflow(M5),
  note scope·privacy·round-trip(M6)로 구분했다.
- 각 종료 gate에 release candidate 기준의 사용자 명세 검토와 실제 결과 또는 실행 보류 사유 기록을
  추가했다. 사용자 테스트 실행은 별도 승인 후 수행한다.

### 2026-08-25 — 사용자 테스트 계획 검증

- M0~M6 7개 문서 모두 `단계별 계획`, 해당 `user-tests/mX-user-test-spec.md` 예정 경로와 “지금은 작성·
  실행하지 않는다”는 경계를 포함함을 shell 정적 검사로 확인했다.
- 개발 관리 Markdown 28개를 재귀 검사해 상대 링크 누락 0건을 확인했다.
- 17개 story의 기존 완료 마일스톤 연결이 그대로 유지됨을 확인했다.
- `git diff --check`: 통과.
- 문서 계획만 변경했으므로 compile/runtime test와 실제 사용자 테스트는 실행하지 않았다.
