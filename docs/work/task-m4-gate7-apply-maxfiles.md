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

1. `DEFAULT_BUDGET.maxFiles`를 200 → 1500으로 변경(`cli/src/shared/adapters/index.ts`).
2. `isRouterMounted()`의 doc comment(`fastapiDependencyAdapter.ts`)에 2026-09-09 정정 추가 —
   "real FastAPI workspaces commonly exceed 200 files인지"가 미확인 열린 질문이었는데, gate 7이
   그 질문에 실측으로 답했다는 것을 기록.
3. 전체 test suite 재실행(회귀 확인) + dispatch를 **실제 1500 값**(측정용 override가 아니라
   진짜 빌드)으로 재쿼리해 8개 전부 답을 내는지 재확인.

## 검증

- [실행] `rm -rf out cli/dist && npm run cli:test` — 456/456 pass(3 skip, 기존과 동일, `maxFiles`
  변경과 무관).
- [실행] `npm test` — 84/84 pass.
- [실행] `npm run test:response-policy` — 36/36 pass.
- **DEFAULT_BUDGET의 실제 값(200)에 의존해 budget 초과를 실제로 트리거하는 committed 테스트는
  이 저장소에 없었다**(직접 grep 확인 — `augmentation_budget_exceeded`/`budgetExceeded`를
  참조하는 파일은 `augmentationFailureIsolation.test.ts`(mock adapter 주입, `DEFAULT_BUDGET`
  무관)와 `fastapiDependencyAdapterMultipleCandidate.test.ts`(직접 만든 작은 `budget: {maxFiles:
  200, ...}` 객체를 어댑터 함수에 직접 주입, `DEFAULT_BUDGET`을 거치지 않음)뿐이다 — 둘 다
  파일 개수로 실제 상한을 트리거하지 않는다). fixture 워크스페이스도 가장 큰 것이 69개 파일
  (python-fastapi)/19개(typescript-dynamic-callback)로 200에도 1500에도 못 미친다.
  **그러므로 이 값 변경으로 사라지는 committed 커버리지는 없다** — 다만 이건 "실제 상한
  자체를 실행으로 검증하는 committed 테스트가 원래 없었다"는 별개의 공백이기도 하다(gate 7
  문서의 잔여 항목에 추가하지 않는다 — 이 PR의 범위 밖).
- [실행] **"상한 없음"이 아니라 실제 1500 값으로 다시 확인**(commander 지적 — "717 < 1500이라
  통과할 것 같다"는 추론이지 실측이 아니다): `npm run cli:build` 후 실제 `cli/dist`로
  `Netflix/dispatch`(717개 파일, 원본 그대로) 8개 census 쿼리 전부 재실행 —

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

## 이 PR 이후에도 남는 것

gate7 문서의 잔여 4가지(extension host latency 미측정이라 400ms·1500 둘 다 잠정, 실제 참조
기준 recall 60%, 지원 안 되는 형태의 조용한 기각에 limitation 없음, corpus 프로젝트 둘)는 이
PR로 안 바뀐다 — 이 PR은 그 잔여 중 "가용성 결함"(진단만 되고 안 고쳐졌던 부분)만 닫는다.
`maxFiles`가 latency budget에서 유도된 값이라, 그 budget(400ms) 자체가 extension host 측정으로
갱신되면 이 값도 다시 계산해야 한다는 결합은 gate7 문서에 이미 명시돼 있다.
