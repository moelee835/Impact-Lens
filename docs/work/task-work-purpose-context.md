# 작업 목적·사용자 가치 기록 규칙 보강

- 작성일: 2026-08-28
- branch: `docs/work-purpose-context`
- 이 작업의 PR: [#43](https://github.com/moelee835/Impact-Lens/pull/43)
- 관련 원격 작업: [PR #41](https://github.com/moelee835/Impact-Lens/pull/41),
  [PR #42](https://github.com/moelee835/Impact-Lens/pull/42)

## 목적과 사용자 가치

지금까지의 작업 문서는 구현 방식, branch, commit과 gate를 자세히 기록했지만, 저장소 소유자가 문서를 처음
읽었을 때 “이 작업이 어떤 사용자 문제를 해결하고 최종적으로 무엇을 가능하게 하는가”를 빠르게 파악하기
어렵다. 앞으로는 모든 작업이 기술 수단보다 목적과 사용자 결과를 먼저 설명하게 해, 작업 우선순위와 중단·
재개 판단을 저장소 소유자가 직접 검토할 수 있도록 한다.

이 변경은 제품 동작을 바꾸지 않는다. 대신 Claude Code를 포함한 후속 에이전트가 계획, 중간 보고, handover와
완료 보고에서 다음 내용을 빠뜨리지 않도록 저장소 수준 규칙을 만든다.

- 누가 어떤 문제를 겪고 있는가
- 작업이 끝나면 사용자나 운영자가 무엇을 할 수 있게 되는가
- 상위 story·milestone·release에서 이 작업이 맡는 역할은 무엇인가
- 왜 지금 이 작업이 다음 순서이며, 남은 작업과 어떻게 이어지는가

## 배경과 해결할 문제

현재 `AGENTS.md`는 branch 분리, 사전 계획, 작업 로그, 검증, commit·push와 완료 보고의 증거를 강하게
규정한다. 하지만 작업 문서의 필수 항목에 사용자 목적과 상위 계획 연결이 독립 항목으로 없고, handover가
commit·PR 상태 위주로 작성돼도 규칙을 위반하지 않는다. 저장소에는 `CLAUDE.md`가 없어 Claude Code가
저장소 고유의 목적 중심 보고 규칙을 직접 발견할 진입점도 없다.

## 범위

- `AGENTS.md`에 목적·사용자 가치 우선 원칙을 추가한다.
- 작업 문서, 단계별 계획, 작업 로그, handover와 최종 보고가 목적을 설명하도록 필수 항목을 구체화한다.
- `CLAUDE.md`를 새로 만들고 Claude Code가 `AGENTS.md`를 따르면서 목적 중심으로 계획·보고하도록 명시한다.
- 현재 M0/M1 작업을 사용자 목적 중심으로 재구성해 이 문서와 최종 보고에 기록한다.

## 범위에서 제외할 항목

- 제품 코드, schema, CLI, Extension 또는 Plugin 동작 변경
- 열린 PR #41·#42의 merge 또는 수정
- 기존 작업 문서 전체의 소급 재작성
- milestone·story 상태 변경
- 새 GitHub Issue 생성이나 release 수행

## 현재 구현 조사 결과

- 최신 공개 release는 `v0.6.3`이다.
- `origin/main`은 `478fa71`이며, M1 양방향 LSP PR #39까지 포함한다.
- M0는 배포 환경에서 bundled provider가 실행되고 실패 원인을 구분하게 만드는 자동 gate를 끝냈다. 독립
  사용자 테스트 검토와 실행 또는 보류 결정이 남아 `In progress`다.
- M1의 목적은 일반 사용자가 raw Language Server 명령을 작성하지 않고 Auto/preset/doctor로 provider를
  선택·복구하고, 분석 결과의 불완전성을 과신하지 않게 하는 것이다.
- M1 Wave 0과 W1-A/B/C, 앞당겨 수행한 W2-B는 merge됐다. 요청 override 계약은 PR #41, 재개 handover는
  PR #42에서 merge를 기다린다.
- `AGENTS.md`의 작업 문서 필수 항목에는 사용자 가치, 상위 목표 연결, 지금 수행하는 이유가 명시돼 있지 않다.
- 저장소 root에 `CLAUDE.md`가 없다.

## 단계별 구현 계획

### 1단계 — 목적 중심 저장소 규칙과 현황 설명 추가

목적: 이후 에이전트가 기술 작업 목록만 남기지 않고 사용자 문제, 기대 결과, 상위 계획과 다음 순서를 함께
설명하도록 한다.

산출물:

1. `AGENTS.md`에 목적 우선 원칙과 작업 문서·handover·완료 보고의 필수 목적 항목을 추가한다.
2. `CLAUDE.md`를 만들어 Claude Code용 진입점과 목적 중심 계획·보고 규칙을 기록한다.
3. 이 문서의 작업 로그에 변경·검증 근거와 현재 M0/M1의 사용자 관점 현황을 기록한다.

검증: Markdown 구조와 두 문서의 핵심 규칙 포함 여부를 정적으로 검사하고 `git diff --check`를 통과한다.
문서 전용 변경이므로 compile/runtime test는 실행하지 않는다.

## 테스트 및 완료 기준

- [x] `AGENTS.md`가 모든 작업 문서에 목적, 사용자 가치, 상위 계획 연결과 현재 순서의 이유를 요구한다.
- [x] 각 최상위 구현 단계가 목적, 산출물과 검증 방법을 설명하도록 요구한다.
- [x] handover가 사용자 관점의 완료 효과, 남은 공백과 다음 작업 이유를 먼저 요약하도록 요구한다.
- [x] 완료 보고가 commit·test뿐 아니라 달성한 사용자/운영 결과를 포함하도록 요구한다.
- [x] `CLAUDE.md`가 `AGENTS.md`를 단일 상세 절차로 참조하고 같은 목적 중심 원칙을 강화한다.
- [x] 현재 작업 현황이 기술 구성요소가 아니라 M0/M1의 사용자 결과와 남은 공백으로 설명된다.
- [x] `git diff --check`가 통과한다.
- [x] 변경이 독립 commit으로 남고 `origin/docs/work-purpose-context`에 push된다.

## 작업 로그

### 2026-08-28 — 조사와 계획 작성

- `docs/m1-wave1-resume-handover`가 upstream과 일치하고 clean한 것을 확인했다.
- 새 작업을 기존 handover branch에 섞지 않고 `origin/main` `478fa71`에서
  `docs/work-purpose-context`를 생성했다.
- root에 `CLAUDE.md`가 없고, `AGENTS.md`가 실행 증거는 상세히 요구하지만 사용자 목적과 상위 목표 연결을
  독립 필수 항목으로 요구하지 않는다는 공백을 확인했다.
- 제품 동작과 열린 PR을 건드리지 않는 문서 규칙 변경 하나로 범위를 고정했다.

### 2026-08-28 — 목적 중심 규칙 반영과 검증

- `AGENTS.md`에 목적 우선 원칙을 새 0절로 추가했다. 모든 작업 문서가 사용자 문제, 기대 결과, 상위 목표,
  현재 순서의 이유를 기록하고, 각 최상위 단계가 목적·산출물·검증을 설명하도록 강화했다.
- handover에는 `사용자 관점 요약`을 기술 상태보다 먼저 두고, PR 본문과 완료 보고도 test·commit 목록보다
  목적과 아직 달성되지 않은 결과를 먼저 설명하도록 규정했다.
- root에 `CLAUDE.md`를 추가했다. 상세 branch·commit 절차는 `AGENTS.md`를 단일 기준으로 참조하고, Claude
  Code가 계획·중간 보고·PR·handover에서 기술 용어를 사용자 결과로 번역하도록 명시했다.
- `rg`로 목적, 현재 순서, handover와 완료 보고 핵심 문구가 두 지침과 작업 문서에 존재하는지 확인했다.
- 세 변경 파일의 존재와 `CLAUDE.md`의 `AGENTS.md` 링크 대상을 확인했다.
- `git diff --check`가 통과했다. 문서 전용 변경이므로 compile/runtime test는 실행하지 않았다.
- 단계 변경을 `cbf8395`(`Explain the purpose behind repository work`)로 commit하고
  `origin/docs/work-purpose-context`에 push했다. push 직후 local HEAD와 upstream이 일치했다.
- 완료 로그를 `c0973c5`(`Close the purpose guidance work log`)로 commit·push하고, 목적과 사용자 결과를
  본문 첫 부분에 설명한 main 대상 [PR #43](https://github.com/moelee835/Impact-Lens/pull/43)을 열었다.
- PR #43에서 Unit tests / Ubuntu와 Plugin artifact E2E / Ubuntu·macOS·Windows가 모두 성공했다. 기존
  `actions/checkout@v4`·`actions/setup-node@v4`의 Node 20 deprecation warning은 실패가 아니며 이번 문서
  변경에서 새로 만든 경고가 아니다.
