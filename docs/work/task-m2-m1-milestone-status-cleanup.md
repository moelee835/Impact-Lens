# M1·M2 상태 표기 정리 (docs/주석만, 코드 동작 변경 없음)

- 상태: 완료.
- branch: `docs/m2-m1-milestone-status-cleanup`
- 선행: PR #70(M2 v0.8.0 릴리스 검증 기록) merge(`1bcccb6`) 후, 사용자가 다음 마일스톤으로 M4를
  선택하는 동안 commander가 지시한 작은 정리 lane.

## 목적과 사용자 가치

M1·M2가 실제로는 끝났는데(v0.7.0/v0.8.0 발행 완료) `docs/development-management/milestones/README.md`의
로드맵 표는 둘 다 아직 `Planned`로 표시돼 있었다. 이 표를 훑는 사람(다음 마일스톤을 고르는 사용자,
다른 세션)이 M1·M2가 안 끝났다고 오독할 수 있다. Python `bundled-pyright`의 `lastVerified` 주석도
이미 닫힌 gap을 "닫힐 예정"이라고 미래형으로 말해 같은 종류의 오독을 코드 내부 독자에게 일으킨다.
셋 다 사실 자체는 바뀌지 않고, **기록이 사실을 따라가지 못한 것**을 고친다.

## 범위

1. `milestones/README.md`의 순서 표 상태 열 — M1·M2만 갱신, M0/M3~M6는 이미 맞으므로 건드리지 않는다.
2. `cli/src/providers/catalog.ts`의 `bundledPyright.lastVerified` 근거 주석 — clangd의 정정된
   주석을 형태의 본으로 삼는다(어느 job이 무엇을 검증하는지, OS별 차이가 있는지/없는지 명시).
3. reviewer가 발견한 stale worktree 2개 — 저장소 추적 대상인지 먼저 확인 후 판단.

**코드 동작 변경 없음** — 셋 다 문서/주석/코멘트이고 런타임 로직을 건드리지 않는다.

## 작업 로그

### 2026-09-03 — 조사와 구현

**1. `milestones/README.md` 표**: M1 자신의 문서(`m1-provider-platform-ux.md:2`)는 `상태: Done —
v0.7.0으로 발행됨`이다. M2 자신의 문서(`m2-p1-language-support.md:3`)는 `**8개 종료 gate 전부
닫힘**`으로 시작하지만, **그 문단이 v0.8.0 발행 이전에 쓰인 채로 남아 있었다** — "이 PR 이후에
남는 것은 릴리스"라고 아직 발행되지 않은 것처럼 말한다. 그런데 v0.8.0은 이미 발행됐다(PR #69/#70,
tag `v0.8.0`). **표 갱신과 같은 종류의 staleness를 M2 문서 자신에서도 발견했다** — commander가
지시한 범위(표만 갱신)를 넘지만, 표를 정확하게 갱신하려면 먼저 고쳐야 하는 같은 카테고리의 사실
정정이라 함께 처리한다(코드 아님, 문서 상태 문구뿐):

- `m2-p1-language-support.md`의 상태 문단에 발행 완료를 반영하는 갱신 문장을 추가했다(원문 보존,
  append-correction).
- `milestones/README.md`의 표: M1 → `Done`, M2 → `Done`(두 문서 자신의 리딩 상태 단어와 일치).
  M0(`In progress`)·M3~M6(`Planned`)는 각 문서와 이미 일치해 그대로 뒀다.

**2. `catalog.ts`의 Python `lastVerified` 주석**: clangd의 정정된 주석(`lastVerified` 위,
"Evidence for the verified-external tier... Stage 5 closed the OS gap the same way go-provider does
for gopls... Unlike gopls, the CI-verified version is NOT the same on all three OSes...")을 형태의
본으로 삼아 다시 썼다. Python은 clangd·gopls와 달리 **pinned npm dependency**라 OS별 버전 차이
자체가 없다는 것을 대비해서 명시했다 — `.github/workflows/unit-tests.yml`의 "No `python-provider`
job here on purpose" 주석(어느 job이 무엇을 검증하는지, "moving cli/node_modules/pyright aside"
실측까지)을 그대로 인용해 근거로 삼았다. `npx tsc --noEmit`으로 컴파일 확인.

**3. stale worktree**: `git worktree list`로 먼저 다른 세션이 쓰고 있는지 확인 — 이 세션의 작업
디렉터리(`/Users/woony6/dev/Impact-Lens`)와 두 개의 scratchpad 전용 worktree(다른 세션 용도로
보임, 건드리지 않음) 외에, `.claude/worktrees/agent-*` 아래 M1 시절 branch를 가리키는 worktree가
**6개**(reviewer가 지목한 2개 포함) 있었다. `git check-ignore -v`로 확인한 결과 `.claude/worktrees/`
전체가 `.gitignore:10`에 있고, `git ls-files .claude/worktrees/`가 0건 — **저장소가 추적하는 대상이
아니다.** commander 지시대로 "정리 대상이 아니라 로컬 정리"로 판단하고 **PR에 포함하지 않는다.**
`docs/work/task-m2-release-0-8-0.md`의 backlog 항목 2번을 이 결론으로 갱신했다(원문 보존,
append-correction) — 남은 4개(reviewer가 지목하지 않은 것들)도 같은 판단이 적용된다는 것을 기록만
해 뒀다. 로컬 디스크에서 실제로 지울지는 이 lane의 권한 밖(사용자 판단)이라 삭제하지 않았다.

### 검증

- `npx tsc --noEmit -p cli`: 클린.
- `grep -n "^| M[0-6] " docs/development-management/milestones/README.md`로 표 전체 재확인 — M0
  `In progress`, M1 `Done`, M2 `Done`, M3~M6 `Planned`, 각 마일스톤 문서 자신의 리딩 상태 단어와
  전부 일치.
- `git worktree list` / `git check-ignore -v` / `git ls-files` 출력을 이 로그의 근거로 직접
  인용했다(추측 없음).
- 코드 동작 변경 없음 — `npm run cli:test` 재실행으로 회귀 없음 재확인(문서·주석만 바뀌었으므로
  결과 불변 예상, 실측으로 확인).
