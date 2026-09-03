# M2 — IL-LIM-006 Python/FastAPI E2E

- 상태: Stage 1 완료(fixture + 실측 관측), commander 보고 후 stage 2 승인 대기
- branch: `feat/m2-fastapi-e2e`
- 선행: PR #65(`feat/m2-clangd-preset`, M2 clangd lane) merge 완료(squash `97a3ee0`) 후 착수.
- 스토리: `docs/development-management/stories/il-lim-006-python-fastapi-e2e.md`
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m2-fastapi-e2e.md`(commander scratchpad)

## 목적과 사용자 가치

**FastAPI 사용자가 이 도구의 답을 어디까지 믿어도 되는지가 지금까지 문서에만 있고 실행으로 고정돼
있지 않았다.** M2 Python preset lane(`bundled-pyright`)은 `Depends()`와 **같은 모양**(함수를 호출하지
않고 값으로만 참조하는 구조)을 합성해서 pyright가 `null`을 반환하는 것을 확인했다. 그건 메커니즘
증명이지 **실제 FastAPI 코드에서 그렇다는 증명이 아니다.**

**이 lane이 끝나면**: 실제 FastAPI 앱에서 일반 호출·route handler·`Depends()` 의존성이 Call Hierarchy에
어떻게 나타나는지가 CI가 매번 검증하는 사실이 된다. 프레임워크가 바뀌어 동작이 달라지면 문서가 조용히
낡는 대신 테스트가 깨진다.

**상위 목표와의 관계**: M2(Python·Go·C/C++)는 코드로는 이미 셋 다 닫혔다(PR #64, gopls는 이전 lane,
PR #65). 그러나 마일스톤 종료 gate 1이 IL-LIM-004·006·014의 수용 기준 통과를 요구하는데, **IL-LIM-006의
수용 기준 6개 중 2개가 실제로 미충족**이다:

- `- [ ] 재현 가능한 Python/FastAPI fixture와 실행 절차가 존재한다.`
- `- [ ] 일반 호출, route와 dependency별 기대·미지원 결과가 명시된다.`

계획 세션이 저장소 전체를 grep해 확인했다 — **실제 FastAPI 코드로 된 fixture가 저장소에 하나도
없었다.** 나오는 건 전부 주석·메시지·정규식이고, response-policy fixture는 에이전트 요약 JSON이다.
Python preset lane이 이걸 명시적으로 범위 밖으로 남겼다. 이 lane 없이는 M2 마일스톤을 닫을 수 없다.

## 설계 결정 — 진짜 FastAPI를 쓴다, stub을 만들지 않는다

commander가 명시: **최소 `fastapi` stub으로 import만 해결하는 길을 택하지 않는다.** 그건 Python preset
lane이 이미 한 합성 재현을 반복하는 것이고, stub이 실제 FastAPI와 갈라지면 테스트가 통과하면서 사실과
달라진다. 이 스토리의 가치가 정확히 "진짜 프레임워크에서 그런가"이다.

pinned 버전의 `fastapi`를 실행 시점(로컬 검증·CI)에 설치한다. 이는 저장소가 금지하는 "자동 설치"가
아니다 — 금지 대상은 *도구가 사용자 머신에서* build/install/sync를 몰래 실행하는 것이고, gopls·clangd를
CI에서 설치하는 것과 같은 명시적 테스트 준비다.

## 범위

- 실제 FastAPI 코드로 된 fixture 하나(일반 호출, route handler, `Depends()` 의존성 셋을 담음).
- 그 fixture를 실제 pyright(`bundled-pyright`가 사용하는 것과 동일한 npm dependency)로 질의해 얻은
  실측 관측(짐작 아님).
- (stage 2) 그 관측을 skip 게이트 없이 지키는 CI 통합 검사.
- (stage 3) README/INSTALL/cli-contract의 Python 절과 `docs.limitations`를 실측과 대조해 필요하면 수정.

## 범위에서 제외한 것

- FastAPI 외 프레임워크(Flask, Django) — 스토리 범위가 아니다.
- `Depends()`를 실제로 추적하는 기능 구현 — 이건 정적 Call Hierarchy의 한계이지 고칠 결함이 아니고,
  스토리가 "한계로 기록할 것"이라고 이미 정했다.
- `schemaVersion` 상승.

## 단계별 계획

### Stage 1 — fixture와 관측

- 목적: 실제 FastAPI 앱에서 세 가지 호출 모양이 각각 어떻게 나오는지 실행으로 확정한다.
- 산출물: `cli/src/test/fixtures/python-fastapi/app.py` + 세 경우의 관측 기록(이 문서).
- 검증: 같은 fixture를 두 번 이상 돌려 같은 결과가 나오는지(반복 가능성은 수용 기준이다).

### Stage 2 — 통합 검사 (승인 대기)

- 목적: stage 1의 관측을 CI가 계속 지키게 한다. 문서만으로는 프레임워크가 바뀌면 조용히 낡는다.
- 산출물: `contract.test.ts`의 bundled-pyright 테스트와 같은 형태의 무조건 실행 통합 테스트, `fastapi`를
  설치하는 CI job(또는 기존 job 확장), skip이 아니라 실패로 취급되는 게이트.
- 검증: fastapi를 일부러 못 찾게 만들었을 때 job이 실제로 실패하는지 확인.

### Stage 3 — 문서와 수용 기준 정리 (승인 대기)

- 목적: "일반 호출, route와 dependency별 기대·미지원 결과"를 사용자가 읽는 위치에 명시하고,
  `docs.limitations`가 실측과 일치하는지 확정한다.
- 산출물: README/INSTALL/cli-contract 갱신(필요하면), `il-lim-006-python-fastapi-e2e.md`의 수용 기준
  6개에 근거 기록.
- 검증: 수용 기준 각 항목에 근거(파일/커밋/테스트) 링크.

## 작업 로그

### 2026-09-03 — Stage 1 착수·완료

**환경 준비**: 이 개발 머신(darwin/arm64)의 `/usr/bin/python3`(3.9.6, Xcode Command Line Tools)로 venv를
만들고 `pip index versions fastapi`로 실제 최신 버전을 확인(0.128.8, 2026-09-03 기준) — 추측하지 않고
확인 후 그 버전을 pin했다. `pip install fastapi==0.128.8`로 실제 설치(venv 안, 시스템 python 오염 없음).

**fixture**: `cli/src/test/fixtures/python-fastapi/app.py`. 세 함수:
- `normal_helper`(6행 5열) ← `regular_caller`가 평범하게 호출.
- `get_items`(19행 5열) — `@app.get("/items")`로 데코레이트된 route handler.
- `get_db`(14행 5열) — `get_items`의 파라미터 기본값 `Depends(get_db)`로만 참조됨.

**측정 방법**: 두 층에서 측정해 서로 대조했다.
1. **CLI 전체 경로**(`cli/dist/index.js analyze --stdin`, `provider.command`를
   `cli/node_modules/.bin/pyright-langserver`로 직접 지정, `settings.python.pythonPath`를 venv의
   실제 python 절대 경로로 지정) — 이 CLI가 실제로 만드는 최종 JSON 응답을 확인.
2. **원본 JSON-RPC 프로브**(`raw_probe.mjs`, 이 세션 scratchpad, 저장소에 커밋 안 함) — pyright에
   직접 `initialize`→`didOpen`→`prepareCallHierarchy`→`callHierarchy/incomingCalls`를 보내 **wire
   레벨의 raw 응답**을 확인. CLI 레이어가 뭔가를 가리거나 바꾸지 않았는지 교차 검증하기 위함.

두 층 모두 `settings.python.pythonPath`(또는 raw 프로브의 `workspace/configuration` 직접 응답)로 venv
경로를 알려줬고, 결과 모든 node의 `diagnostics: []` — `reportMissingImports` 없음, 즉 fastapi import가
완전히 resolve된 상태에서 측정했다(unresolved import로 인한 혼입 변수를 배제).

**실측 결과**(2회 반복, 완전히 동일):

| 케이스 | 대상 | `incomingCalls` raw 응답 | CLI `limitationDetails` | Python lane의 합성 관측과 일치? |
| --- | --- | --- | --- | --- |
| 1. 일반 호출 | `normal_helper` | `[{"from":{"name":"regular_caller",...},...}]` (배열, 길이 1) | 없음(정상 caller 발견) | 해당 없음(합성 관측이 다루지 않은 케이스) |
| 2. route handler | `get_items` | **`null`**(JSON literal null, `[]` 아님) | `no_incoming_callers`, `index_state_unknown`, **`provider_null_incoming_calls`** | **일치** |
| 3. `Depends()` 대상 | `get_db` | **`null`**(JSON literal null) | `no_incoming_callers`, `index_state_unknown`, **`provider_null_incoming_calls`** | **일치** |

**결론 — Python lane의 합성 관측과 다르지 않다.** 진짜 FastAPI 0.128.8 + 실제 pyright 1.1.413(현재
`cli/package.json`에 pinned된 버전과 동일)에서 route handler와 `Depends()` 대상 둘 다 `incomingCalls`가
`null`을 반환하는 것을 wire 레벨로 확인했다. `provider_null_incoming_calls`의 전제와
`docs.limitations`의 "FastAPI's Depends()는 Call Hierarchy에 안 나타난다"는 기존 서술이 **실측으로
뒷받침된다** — 고칠 필요가 없다. commander의 "다르면 즉시 보고" 조건은 발동하지 않았다.

**부가 확인**: route handler(`get_items`)와 `Depends()` 대상(`get_db`)이 **같은 신호**(`null`)로 수렴한다
— 프레임워크가 함수를 호출하는 경우(route)와 참조만 하는 경우(`Depends`) 둘 다 정적 Call Hierarchy
관점에서는 구분되지 않는다는 뜻이다. 이 구분(왜 둘 다 `null`인가: route는 프레임워크가 실제로 호출하지만
그 호출 지점이 이 파일에 없고, `Depends`는애초에 호출이 아니라 참조라서)은 stage 3 문서화에서 명시할
가치가 있다 — 지금 `docs.limitations` 문구는 이 둘을 구분하지 않고 뭉뚱그린다.

**반복성 검증**: 원본 프로브를 각 케이스 2회씩 재실행 — 세 케이스 모두 완전히 동일한 raw 응답(배열
내용, `null` 여부)을 반복해서 얻었다.

**검증**: `npm run cli:build` 클린(코드 변경 없음, fixture 파일 하나만 추가). 이 단계는 코드 변경이
없으므로 `cli:test` 재실행은 불필요(fixture는 아직 어떤 테스트에서도 참조되지 않음 — stage 2가 연결).

## 남은 작업

- **Stage 1 완료. commander에게 관측 결과 보고 후 stage 2·3 승인 대기** — commander가 명시(stage 1
  관측이 stage 2·3의 형태를 정한다).
- Stage 2: CI 통합 검사 — `fastapi` 설치 job/step, skip-as-failure 게이트, non-vacuity 검증(fastapi
  없을 때 job이 실제로 실패하는지).
- Stage 3: 문서·수용 기준 정리.
