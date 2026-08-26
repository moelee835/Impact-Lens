# 단계별 commit·push 및 branch 분리 정책

## 배경과 해결할 문제

현재 `AGENTS.md`는 작업 전체가 완료된 뒤 commit하도록 요구하지만, 여러 단계로 진행되는 장기 작업에서
중간 단계가 로컬에만 남거나 다음 단계 변경과 섞일 수 있다. 또한 개발 변경이 `main`에서 직접 수행되는
것을 명시적으로 금지하지 않아 개발 branch와 통합 branch의 경계가 충분히 강하지 않다.

사용자 요구에 따라 작업 문서의 각 최상위 구현 단계가 끝날 때 검증·로그·commit·원격 push를 의무화하고,
`main`/`master`와 개발 branch를 반드시 분리한다.

## 범위

- `AGENTS.md`에 전용 개발 branch 강제, main 직접 변경/commit/push 금지 규칙을 추가한다.
- 단계의 정의와 단계 종료 순서: 검증 → 작업 로그 → diff 확인 → commit → push를 명시한다.
- push가 성공하기 전에는 단계를 완료 처리하거나 다음 단계로 진행하지 못하게 한다.
- push 실패, 검증 실패, 사용자 변경 혼재 시의 중단·보고 규칙을 정한다.
- `docs/DEVELOPMENT.md`와 milestone 운영 규칙을 같은 정책으로 동기화한다.
- 현재 개발 branch에서 이번 정책 변경을 commit하고 origin의 동일 이름 branch로 push한다.

## 범위에서 제외할 항목

- `main`에 직접 merge 또는 push
- Pull Request 생성·병합
- force push, history rewrite 또는 기존 commit 재작성
- branch protection 같은 GitHub 원격 설정 변경
- 기존 6개 commit을 분할하거나 재작성

## 현재 구현 조사 결과

- 현재 branch는 `docs/limitations-story-backlog`이며 `main`/`master`가 아니므로 개발 branch 분리 조건을
  충족한다.
- 현재 worktree는 clean이고 이 branch는 `origin/main`보다 6 commit 앞서지만 아직 동일 이름의 upstream
  branch가 없다.
- local `main`은 `origin/main`보다 뒤에 있어 이번 작업에서 switch하거나 갱신하지 않는다.
- 기존 `AGENTS.md` 4절은 전체 작업 완료 시 commit만 요구하며 단계별 push, push 실패 처리와 main 보호를
  규정하지 않는다.
- `docs/DEVELOPMENT.md`는 작업 시작 때 branch 생성을 권장하지만 main 직접 변경 금지와 단계별 push gate가
  없다.

## 단계별 구현 계획

### 1단계 — 정책 정의·검증·commit·push

1. 개발 branch 허용 이름과 main/master 금지 동작을 정의한다.
2. 작업 문서의 최상위 번호/제목 단계를 commit 가능한 단위로 계획하도록 요구한다.
3. 각 단계 종료 절차와 push 성공 전 다음 단계 금지 규칙을 `AGENTS.md`에 추가한다.
4. 검증/commit/push 불가 시 incomplete 상태 유지와 사용자 보고 규칙을 추가한다.
5. 개발 가이드와 milestone 운영 규칙을 동기화한다.
6. main/master 금지, 단계별 commit/push, push 실패 처리 문구와 Markdown link를 정적 검사한다.
7. 작업 로그를 갱신하고 정책 변경만 commit한다.
8. `docs/limitations-story-backlog`을 origin의 동일 이름 branch로 push하고 upstream을 설정한다.

종료 조건: 중앙 규칙과 보조 문서가 동일한 workflow를 설명하고, commit hash와 원격 tracking branch가
확인되며 worktree가 clean하다. 정책 도입 자체가 원격 보존 전에는 독립적으로 완료될 수 없으므로 이번
작업은 위 항목 전체를 하나의 최상위 stage로 묶는다.

## 테스트 및 완료 기준

- `AGENTS.md`가 main/master에서 파일 변경, commit과 push를 명시적으로 금지한다.
- 모든 작업은 main/master가 아닌 전용 branch에서만 시작하도록 규정한다.
- 최상위 구현 단계마다 검증·로그·commit·push가 의무이며 push 전 다음 단계 진행이 금지된다.
- 불완전하거나 검증 실패한 단계는 commit/push하지 않고 상태와 이유를 보고하도록 기존 안전 규칙을
  유지한다.
- force push와 main 직접 통합이 허용되지 않고 PR을 통합 경로로 명시한다.
- `docs/DEVELOPMENT.md`와 milestone 운영 규칙이 중앙 정책을 참조한다.
- 정적 검사, `git diff --check`, commit과 개발 branch push가 성공한다.

## 작업 로그

### 2026-08-25 — 착수와 branch 확인

- 현재 branch `docs/limitations-story-backlog`, clean worktree, `origin/main` 대비 6 commit ahead를 확인했다.
- local main이 뒤처져 있지만 현재 branch를 유지하고, main에는 어떤 변경도 적용하지 않기로 했다.
- 기존 branch에 upstream이 없으므로 정책 변경 commit 후 `git push -u origin docs/limitations-story-backlog`로
  동일 이름의 원격 개발 branch를 만들 계획이다.

### 2026-08-25 — 정책 구현

- `AGENTS.md`에 0절을 추가해 main/master에서 모든 파일 변경·commit·push를 금지하고, 허용하는 개발
  branch prefix와 PR 전용 통합, no-force-push 원칙을 정의했다.
- 작업 문서의 최상위 구현 단계를 독립 검증·commit·push 단위로 정의했다. 독립적으로 정상 상태가 될 수
  없는 단계는 구현 전에 합치도록 해 깨진 중간 commit을 강제하지 않는다.
- 각 단계 종료 순서를 필수 검증 → 작업 로그 → status/diff → 독립 commit → 동일 이름 원격 branch push →
  upstream/worktree 확인으로 고정했다. push 실패 시 `In progress` 유지와 다음 단계 금지를 명시했다.
- 검증 실패, 미완료 또는 사용자 변경 혼재 시 commit/push하지 않는 기존 보호 규칙을 유지했다.
- `docs/DEVELOPMENT.md`의 저장소 준비 명령을 최신 `origin/main`에서 개발 branch를 직접 만드는 방식으로
  바꾸고, 단계별 command cycle과 main/force push 금지를 추가했다.
- `docs/development-management/milestones/README.md`에도 각 milestone 최상위 단계가 같은 stage gate를
  따르도록 연결했다.
- 초기 계획은 정책 작성과 commit/push를 두 단계로 나눴지만, 첫 단계 자체가 push되기 전에는 새 정책상
  완료될 수 없어 순환이 생긴다. 따라서 정책 정의·검증·commit·push 전체를 하나의 독립 stage로 합쳤다.

### 2026-08-25 — 검증 결과

- 현재 branch가 `docs/limitations-story-backlog`이며 main/master가 아니고 허용 prefix `docs/`를 사용하는지
  확인했다.
- main/master 변경 금지, push 전 다음 단계 금지, push 실패 시 In progress, 동일 이름 원격 branch와 PR
  통합의 필수 조항 5/5를 정적 검사했다.
- 첫 조항 검사에서 shell 이중 인용 안의 Markdown 백틱이 명령 치환돼 `master`, `In` 실행을 시도했다.
  두 명령 모두 존재하지 않아 종료됐고 파일 변경은 없었다. JavaScript 전체를 shell 단일 인용으로 바꿔
  다시 실행해 5/5 통과를 확인했다.
- 관련 문서 3개의 Markdown 상대 링크를 검사해 누락 0건을 확인했다.
- `git diff --check`: 통과.
- 문서 정책만 변경했으므로 compile/runtime test는 실행하지 않았다.

### 남은 제한

- 문서 규칙은 agent workflow를 강제하지만 GitHub server-side branch protection을 설정한 것은 아니다.
  main direct push를 원격에서도 기술적으로 차단하려면 별도 권한으로 GitHub branch protection/ruleset을
  구성해야 한다.
- 이번 stage commit과 원격 push 결과는 commit 후 최종 보고에서 hash와 tracking branch로 확인한다.
