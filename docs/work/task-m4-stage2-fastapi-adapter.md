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
