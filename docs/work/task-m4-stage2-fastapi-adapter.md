# M4 stage 2 — 첫 adapter 구현 (FastAPI)

- 상태: 순서 변경(Spring→FastAPI) 보고 대기 — 구현 착수 전.
- branch: `feat/m4-stage2-fastapi-adapter`
- 마일스톤: [M4 동적 호출·DI·테스트 의미 보완](../development-management/milestones/m4-semantic-augmentation.md)
- 선행: PR #72(M4 stage 1, evidence 계약 확정) merge(`3c13580`) 후 착수.
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m4-stage2-first-adapter.md`(commander scratchpad)

## 목적과 사용자 가치

stage 1이 확정한 evidence 계약(`docs/work/task-m4-stage1-evidence-contract.md`)을 처음으로 코드로
만든다. **계약이 실제로 안전한지는 첫 구현이 그 계약 위에서 실제로 동작해야 증명된다.**

## 순서 변경 보고 — Spring이 아니라 FastAPI가 1차 adapter다 (commander가 먼저 확인)

마일스톤 문서(`m4-semantic-augmentation.md`)는 "Spring Java/Kotlin bean/context resolution
1차 adapter"라고 적고 있다. **이건 지금 불가능하다** — 직접 확인했다:

- `cli/src/providers/resolve.ts`의 `languageId()`에 `.java` case가 아예 없다(`default: return
  'plaintext'`로 떨어진다). `.kt`/`.kts`는 `'kotlin'`으로 감지는 되지만,
- `PROVIDER_CATALOG`(`cli/src/providers/catalog.ts:516`)에 Java나 Kotlin preset이 없다 —
  `[bundledTypeScript, gopls, bundledPyright, clangd]` 넷뿐이다.

**Spring adapter를 만들려면 Java/Kotlin 언어 지원부터 필요하고, 그건 M3 이후의 일이다.** 이건
임의 변경이 아니라 이 저장소가 지금 갖춘 것과 안 갖춘 것이 강제하는 사실이다.

**FastAPI가 유일하게 지금 가능한 1차 adapter다.** Python preset(`bundled-pyright`)이 이미
shipped됐고, `pythonFastapiIntegration.test.ts`에 **진짜 FastAPI fixture와 실측 관측이 이미
있다** — 직접 재확인: route handler(`get_items`)와 `Depends()` target(`get_db`) 둘 다
`provider_null_incoming_calls`와 함께 "호출자 없음"을 단언하는 테스트 3개가 존재한다. **M4가
해결하려는 그 gap이 이미 재현 가능한 상태로 저장소에 있다.**

**흥미롭게도 `IL-LIM-002` 자신은 이미 FastAPI를 1차로 적어 뒀다** — "권장 대응"이 "첫 adapter를
`fastapi-static-v1`로 한정"하고 Spring을 "후속 adapter"라고 명시한다. **틀린 건 마일스톤 문서
하나뿐이었다.**

### 문서 정정 (원문 보존)

- `m4-semantic-augmentation.md`: 최상단에 이 발견을 정리한 정정 blockquote를 추가하고, "포함
  범위"·"산출물"·"단계별 계획"의 Spring 관련 문구에 취소선 + 정정을 달았다. **가장 중요한 것**:
  종료 gate의 "Spring constructor/field/method injection의 대표 fixture가 bean candidate와
  ambiguity를 재현한다"를 **이 마일스톤에서 통과 불가능한 형태**로 판단하고, **FastAPI
  `Depends()`/route dependency의 대표 fixture로 대체**했다 — Spring 버전은 Java/Kotlin 언어
  지원이 생긴 뒤 별도 milestone/story로 이어받는다.
- `il-lim-002-framework-di-routing.md`: 5단계(Spring feasibility) 앞에 "이건 '후속'이 아니라
  '착수 불가'다 — Java/Kotlin 언어 지원이 먼저 필요하다"는 사실을 추가했다(스토리 자신은 이미
  순서를 맞게 적어 뒀으므로 반전이 아니라 보강).

### 검증

- `grep -n "'.java'" cli/src/providers/resolve.ts` — 0건.
- `cli/src/providers/catalog.ts:516`의 `PROVIDER_CATALOG` 배열 직접 확인 — Java/Kotlin preset
  없음.
- `cli/src/test/pythonFastapiIntegration.test.ts`의 `provider_null_incoming_calls` 관련 assertion
  3건 직접 확인 — route handler·Depends() target 둘 다 존재.

## 다음 (commander 확인 후)

구현 범위는 요구사항 문서(`m4-stage2-first-adapter.md`)를 따른다 — FastAPI adapter 하나, 지금
필요 없는 일반화 금지, kill switch 기본값 결정과 근거, corpus 4건(stage 1의 4a/4b 중 4a만, 4b는
stage 2 결정 항목이 아니라 열어 둔 채로) 기반 fixture.

**가장 중요한 검증**: `pythonFastapiIntegration.test.ts`가 지금 route handler와 `Depends()`에
대해 단언하는 "호출자 없음 + `provider_null_incoming_calls`"가, adapter가 켜져 `augmentedEdges`가
생겨도 **그대로 참이어야 한다** — stage 1 계약의 실증이다.

이 문서는 순서 변경 보고 이후, commander 확인을 받고 나서 구현 단계별 작업 로그를 이어서
기록한다.

## Backlog — flaky 테스트 기록 (조사만, 수정 안 함)

**테스트**: `cli/src/test/contract.test.ts`의 `'preserves initialize exit diagnostics after
stderr closes and redacts secrets'`(`exitingServer.js` fixture를 실제로 spawn해 stderr가 닫힌
뒤에도 진단이 보존되고 secret이 redact되는지 검증).

**어디서**: PR #72(`docs/m4-stage1-evidence-contract`)의 `workflow_dispatch`/`pull_request` CI,
run `33731679960`의 `gopls / macos-latest` job(1차 시도)에서 실패 — `not ok 57`,
`AssertionError`. 이 PR은 `.md` 파일 3개만 바꿔 코드 변경이 0건이었으므로 원인이 될 수 없음을
`git diff --stat`으로 먼저 확인했다.

**무엇이 타이밍에 민감한가**: 이 테스트는 실제 자식 프로세스(`spawnSync`로 fixture 서버)를 띄우고
그 프로세스가 **stderr를 닫는 시점**과 **진단이 캡처되는 시점**의 상대적 순서에 의존한다 — 실제
OS 프로세스 스케줄링/스트림 flush 타이밍이 관여하는 종류의 테스트라 CI runner 부하에 따라
간헐적으로 순서가 달라질 수 있다.

**재실행으로 통과 확인**: `gh run rerun 33731679960 --failed`로 그 job만 재실행 → 통과(`gopls /
macos-latest`, 2m23s). 재실행 전 코드 diff가 0이었다는 것과 재실행 후 통과했다는 것 둘 다
직접 확인했다(추측 아님).

**최근 발생 빈도(직접 조사)**: 오늘 이 세션이 트리거한 최근 workflow 실행 14개
(`gh run list --workflow=unit-tests.yml --limit 15`, 이 backlog 기록 시점 기준)의
`run_attempt`를 `gh api`로 전부 확인 — **`33731679960` 하나만 `attempt=2`이고 나머지 13개는
전부 `attempt=1`**(첫 시도에 성공, 재실행 없음). 즉 **최근 14회 실행 중 1회, 그 1회도
`gopls / macos-latest`에서만** 발생했다 — 상시 flaky는 아니지만 실재하는 간헐적 실패다.
(주의: `gh api .../jobs`는 기본적으로 최신 attempt의 job만 보여줘서, 재실행되지 않은 실행에
같은 테스트가 실패했다가 같은 attempt 안에서 다시 통과했을 가능성까지는 이 조사로 배제하지
못한다 — `run_attempt` 카운트로 확인 가능한 것은 "재실행이 필요했던 횟수"까지다.)

**원인 조사·수정은 하지 않는다** — 범위 밖(commander 지시). 다음에 이 테스트가 실패하면 이 기록을
참고해 "알려진 flaky"로 넘기기 전에 실제 회귀인지부터 확인한다.
