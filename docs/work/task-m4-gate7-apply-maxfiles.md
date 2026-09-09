# M4 gate 7: 유도된 `maxFiles`(1500)를 실제로 적용

- 상태: 완료
- branch: `fix/gate7-apply-maxfiles-1500`
- 선행: `docs/work/task-m4-gate7-budget-and-real-code-measurement.md`(PR #101, gate 7 budget 수치
  확정 — `maxFiles = latency budget ÷ 파일당 비용`으로 1500을 유도). 전체 근거·유도 과정은 그
  문서를 따른다 — 이 문서는 그 값을 실제 코드에 적용하고 재검증한 기록만 남긴다.

## 목적과 사용자 가치

gate7 문서가 유도한 `maxFiles: 1500`은 권고일 뿐이었다 — 코드는 여전히 200을 썼다.
commander의 지적대로 **적용 안 된 budget은 budget이 아니다**: "정해진 budget이 통과한다"는
문장이 문서에만 있고 실행되는 코드는 그 budget을 위반하는 채로 남아 있으면, 이 milestone이
반복해서 고쳐 온 "문서가 주장하는 것과 코드가 하는 것이 다른" 바로 그 모양이다.

이 PR은 `DEFAULT_BUDGET.maxFiles`를 실제로 1500으로 올려서, `Netflix/dispatch`(717개 `.py`
파일) 같은 실제 규모 프로젝트에서 `fastapi-static-v1`이 기본 budget 아래서도 답을 낼 수 있게
한다 — gate7 문서가 진단만 하고 안 고친 가용성 결함(717파일 프로젝트에서 쿼리 8개 중 7개가
`augmentation_budget_exceeded`)을 실제로 닫는다.

## 산출물

1. `fastapi-static-v1`에 `budget: { maxFiles: 1500, maxMatchesPerFile: 20 }` override 추가
   (`cli/src/shared/adapters/index.ts`, `ADAPTERS` 등록의 `budget` 필드 — **`DEFAULT_BUDGET` 자체는
   200 그대로**). `isRouterMounted()`의 doc comment(`fastapiDependencyAdapter.ts`)에 2026-09-09
   정정 추가 — "real FastAPI workspaces commonly exceed 200 files인지"가 미확인 열린 질문이었는데,
   gate 7이 그 질문에 실측으로 답했다는 것을 기록.
2. **reviewer가 잡은 결함(2026-09-09) — 첫 시도는 `DEFAULT_BUDGET.maxFiles`를 직접 200→1500으로
   바꿨는데, 그러면 `dynamic-callback-static-v1`(TS/JS 콜백 adapter, 완전히 다른 코드
   `walkSourceFiles()`)도 조용히 같이 1500을 물려받는다.** gate 7의 근거 사슬(717개 Python 파일,
   0.253ms/file, 400ms budget)은 전부 `fastapi-static-v1`의 Python 파일 순회 비용만 측정한
   것이라 TS/JS 쪽엔 안 맞는다 — TS/JS 저장소는 흔히 파일 수가 더 많아, 1500까지 올라간 상태에서
   실제 latency가 400ms를 넘을 가능성을 이 lane은 한 번도 확인하지 않았다. **수정: `DEFAULT_BUDGET`은
   200으로 되돌리고, `fastapi-static-v1` 등록에만 `budget: FASTAPI_BUDGET`(1500)을 얹었다** —
   `RegisteredAdapter.budget?`이 정확히 이 용도로 이미 있던 메커니즘(`./types.ts`, IL-LIM-001
   stage 3)이라 최소 변경이다. `dynamic-callback-static-v1`은 자기 몫의 gate 7이 따로 실측되기
   전까지 200 그대로다.
3. **`budgetExceeded`가 REAL adapter의 REAL truncation 코드 경로를 실행으로 트리거해 최종
   limitation까지 도달하는 경로를 처음으로 pin하는 테스트를 추가했다**(commander 지적 — 기존
   테스트는 전부 stub adapter가 `budgetExceeded: false`를 반환하거나, 손으로 쓴 응답 JSON이 문구만
   검증했다. 상한을 7.5배 올리면 이 경로가 실사용에서 더 드물게 밟히는데 테스트가 없으면 언제
   깨졌는지 아무도 모른다). `cli/src/test/augmentationBudgetExceededEndToEnd.test.ts` — 실제
   `fastapiDependencyAdapter`를 `runAugmentation`의 기존 테스트 주입 지점(`adapters` 마지막
   파라미터, augmentation-failure-isolation lane이 이미 열어 둔 것)으로 주입하되 `budget: {
   maxFiles: 1, ... }`를 직접 얹어, 진짜 2-파일 워크스페이스에서 진짜 파일 walk가 truncate되고
   `analyzeImpact()`의 최종 응답까지 `augmentation_budget_exceeded` limitation이 나오는지
   end-to-end로 확인한다. 같은 워크스페이스에 관대한 budget(1500, 실제 프로덕션 기본값)을 주는
   두 번째 테스트로 non-vacuity 증명(첫 테스트가 뭘 해도 통과하는 게 아니라는 것).
4. 전체 test suite 재실행(회귀 확인) + dispatch를 **실제 1500 값**(측정용 override가 아니라
   진짜 빌드)으로 재쿼리해 8개 전부 답을 내는지 재확인.

## 검증

- [실행] `rm -rf out cli/dist && npm run cli:test` — 458/461 pass(3 skip, 기존과 동일 — 새 테스트
  2개 포함해 456→458). 두 테스트 모두 최초 실행에서 green을 확인한 뒤, `if (walkState.truncated)`를
  `if (false && walkState.truncated)`로 뮤테이션해 재빌드·재실행 — **정확히 새 테스트 1개만
  실패**(non-vacuity 테스트는 그대로 통과, budget을 안 건드리는 시나리오라 뮤테이션과 무관함을
  확인), 원복 후 재통과 확인.
- [실행] `npm test` — 84/84 pass.
- [실행] `npm run test:response-policy` — 36/36 pass.
- **DEFAULT_BUDGET의 실제 값(200)에 의존해 budget 초과를 실제로 트리거하는 committed 테스트는
  이전엔 없었다**(직접 grep 확인, reviewer가 독립 재현으로 재확인 — `fastapiDependencyAdapterMultiple
  Candidate.test.ts`의 `maxFiles: 200`은 `AdapterInput.budget`에 직접 override로 넘긴 값이라
  `DEFAULT_BUDGET` 경로를 안 탄다는 것도 reviewer가 확인). fixture 워크스페이스도 가장 큰 것이
  69개 파일(python-fastapi)/19개(typescript-dynamic-callback)로 200에도 1500에도 못 미친다.
  **이 공백을 산출물 3의 새 테스트가 닫았다.**
- [실행] **"상한 없음"이 아니라 실제 1500 값으로 다시 확인**(commander 지적 — "717 < 1500이라
  통과할 것 같다"는 추론이지 실측이 아니다): `npm run cli:build` 후 실제 `cli/dist`로
  `Netflix/dispatch`(717개 파일, 원본 그대로) 8개 census 쿼리 전부 재실행(reviewer가 독립
  재현·재확인, candidate 개수까지 정확히 일치) —

  | 쿼리 | `augmentedEdges` | `augmentation_budget_exceeded` |
  | --- | --- | --- |
  | `get_organization_path` | 0 | false |
  | `get_current_user` | 1 | false |
  | `get_current_role` | 1 | false |
  | `common_parameters` | 0 | false |
  | `get_db` | 0 | false |
  | `get_body` | 4 | false |
  | `get_current_case` | 0 | false |
  | `get_current_incident` | 0 | false |

  gate7 문서의 census 정답(6개 진양성, 8개 안전한 기각)과 정확히 일치하고, `augmentation_
  budget_exceeded`가 8개 전부에서 `false`다 — 200 상한에서 7/8이 초과로 실패했던 것과 대조.

## 병합 순서

이 branch는 PR #101(`docs/m4-gate7-budget-and-real-code-measurement`) merge 전의 `main`
(`f8bb0ff`) 위에 있다 — reviewer가 재현 과정에서 PR #101의 스크립트·문서가 이 worktree에 없다는
것을 지적했다(기능 결함은 아니지만, PR #101 → #102 순서로 merge하는 게 안전하다).

## 이 PR 이후에도 남는 것

gate7 문서의 잔여(extension host latency 미측정이라 400ms·1500 둘 다 잠정, 실제 참조 기준
recall 약 57%, 지원 안 되는 형태의 조용한 기각에 limitation 없음, corpus 프로젝트 둘,
`Security()` 미인식, 그리고 `dynamic-callback-static-v1`의 own budget이 아직 실측 안 됨 — 이번
수정으로 200에 남아 있지만 그 값 자체도 gate 7과 같은 방식으로 다시 재보지는 않았다)는 이 PR로
안 바뀐다 — 이 PR은 그 잔여 중 "가용성 결함"(진단만 되고 안 고쳐졌던 부분)만 닫는다.
`maxFiles`가 latency budget에서 유도된 값이라, 그 budget(400ms) 자체가 extension host 측정으로
갱신되면 이 값도 다시 계산해야 한다는 결합은 gate7 문서에 이미 명시돼 있다.
