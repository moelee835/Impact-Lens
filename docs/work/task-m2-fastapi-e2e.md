# M2 — IL-LIM-006 Python/FastAPI E2E

- 상태: Stage 1-3 전부 완료, commander에게 보고 후 검토 대기(PR은 아직 안 올림)
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

### 2026-09-03 — commander 지시: fastapi 설치 여부가 결과를 바꾸는가

**질문**: stage 1 측정은 fastapi가 설치된 venv에서 했다. 설치 자체가 관측에 필요한 조건인가, 아니면
fixture 파일만으로 같은 결과가 나오는가? 후자라면 CI에 Python venv 생성이 전혀 필요 없고, clangd
lane에서 겪은 것과 같은 3-OS venv 경로 문제(Windows `Scripts\python.exe` vs POSIX `bin/python`)를
통째로 피할 수 있다.

**측정 1 — fastapi 없는 시스템 python으로 동일 3케이스 재실행**: `/usr/bin/python3`(fastapi
미설치 확인 — `import fastapi` → `ModuleNotFoundError`)를 raw JSON-RPC 프로브의 `pythonPath`로 지정해
동일한 `prepareCallHierarchy`→`callHierarchy/incomingCalls` 왕복을 반복했다. **결과가 fastapi 설치
상태와 완전히 동일했다**: `normal_helper`는 여전히 배열(`regular_caller` 포함), `get_items`·`get_db`는
여전히 raw `null`.

**측정 1의 함정을 자체 발견하고 재검증**: 최초 재실행은 "diagnostics: []"(즉 import가 깨끗이
resolve된 것처럼 보임)까지 fastapi 설치 때와 똑같이 나왔는데, 이건 실제로 import가 resolve됐다는
뜻이 아니라 **probe가 진단 notification을 기다리지 않고 바로 질의해 timing 때문에 빈 배열을 본
것일 수 있다**는 걸 스스로 의심하고 재확인했다. 별도 프로브(`diag_probe.mjs`)로 `didOpen` 후 5초
기다리며 `textDocument/publishDiagnostics`를 직접 수신 — **fastapi 미설치 시 실제로
`reportMissingImports`("Import \"fastapi\" could not be resolved")가 발행됨을 확인**했고, fastapi
설치 시엔 같은 5초 대기 후에도 빈 diagnostics였다. 즉 "import가 정말 깨졌다"는 것과 "그런데도
incomingCalls 결과는 안 바뀐다"는것 둘 다 확인된 사실이지, timing 우연이 아니다.

**측정 2 — settings를 아예 안 준 완전 기본 상태**(실제 사용자가 오늘 아무 설정도 안 했을 때와 정확히
같은 조건 — `bundled-pyright`는 pythonPath를 자동 감지하지 않으므로 `pythonPath` 설정이 없으면
pyright 자신의 기본 interpreter 탐색에 맡겨진다)로 전체 CLI 경로(`analyze --stdin`, `settings` 필드
자체를 요청에서 제거)를 다시 돌렸다. **결과 동일**: `normal_helper`는 edge 발견,
`get_items`·`get_db`는 `provider_null_incoming_calls` 포함 3개 코드 그대로.

**결론 — fastapi 설치는 이 세 관측 어디에도 영향을 주지 않는다.** pyright의 Call Hierarchy는 구문
수준(호출 표현식을 찾는 것)에서 동작하므로 `Depends(get_db)`가 `get_db`를 "호출"이 아니라 "참조"로
남기는 것도, `@app.get(...)`으로 데코레이트된 함수가 이 파일 안에서 호출되지 않는 것도 `fastapi`
패키지 자체가 resolve됐는지와 무관하다. **CI는 Python venv 생성도, pip install도, `settings.
python.pythonPath` 주입도 필요 없다** — fixture 파일만 checked-in 상태로 있으면 되고, 이는 clangd
lane이 겪은 3-OS venv/경로 함정(Windows `Scripts\python.exe` vs POSIX `bin/python`)을 애초에
발생시키지 않는다.

**stage 2 설계에 반영**: 별도 CI job이나 Python/pip 설치 단계 없이, 기존 `unit`/`cli-tests-cross-os`
job이 이미 모든 push에서 3-OS 전부 실행하는 `contract.test.ts`류 무조건 실행 테스트로 충분하다 —
gopls·clangd처럼 외부 실행 파일 설치가 필요한 언어와 이 lane은 근본적으로 다른 모양이다(비교: Python
lane이 이미 "pyright는 pinned dependency라 별도 CI job 불필요"라고 결론 낸 것과 같은 이유가 여기도
적용된다). fastapi가 실제로 import되는지 여부와 무관한 결과이므로, "fastapi를 못 찾게 만들어 job이
실패하는지" 검증(commander의 stage 2 요구사항)도 **적용 대상이 없다** — 애초에 fastapi 설치가
결과에 영향을 주지 않으므로 "fastapi가 없어서 skip/실패"할 지점 자체가 설계에 없다. 대신 non-vacuity는
**fixture 파일 자체가 없거나 손상됐을 때** 테스트가 실패하는지로 확인해야 한다(다른 형태의 skip-as-
failure).

## Stage 2 — 통합 검사

**목적**: stage 1(+추가 측정)의 관측을 CI가 계속 지키게 한다.

**구현**: `cli/src/test/pythonFastapiIntegration.test.ts`(신규). `contract.test.ts`의 bundled-pyright
테스트와 같은 형태 — `spawnSync`로 실제 CLI(`index.js analyze --stdin`)를 실행하고, `provider` 필드
없이 순수 auto-discovery로 `bundled-pyright`가 선택되게 한다. skip 게이트 없음(추가 측정 결론대로
fastapi 설치 여부가 결과에 영향을 주지 않으므로 `IMPACT_LENS_REQUIRE_*`류 게이트 자체가 필요 없다).
fixture는 `cli/src/test/fixtures/python-fastapi/app.py`(stage 1의 checked-in 파일)를 그대로 분석
대상 workspace로 삼는다 — 별도 temp 디렉터리 복사 없음(pyright는 분석 대상 workspace에 아무것도 쓰지
않으므로 필요 없다). `__dirname`(빌드 후 `cli/dist/test/`)에서 `../../src/test/fixtures/...`로
되짚어 소스 트리의 `.py` 파일을 직접 가리킨다 — `buildInvocation.sources.test.ts`가 이미 쓰는
"tsc가 컴파일하지 않는 실제 소스 파일을 dist에서 되짚어 읽는다" 관례와 동일(첫 시도는 `__dirname`
기준 `fixtures/`로 잘못 짚어 `ENOENT`로 실패 — 발견 즉시 수정).

**테스트 3개**:
1. **대조군**(`normal_helper`, `regular_caller`가 실제 호출): `edges.length === 1`,
   `provider_null_incoming_calls` 없음을 단언. **같은 실행·같은 fixture**에서 이걸 먼저 증명해야
   아래 두 "안 찾아짐"이 의미를 갖는다(파이프라인이 전부 죽어도 "안 찾아짐"은 통과할 수 있으므로).
2. **route handler**(`get_items`): `edges.length === 0` **그리고**
   `limitationDetails`에 `provider_null_incoming_calls` 포함을 **함께** 단언 — "호출자가 없다"만
   단언하지 않는다(그러면 "빈 결과 = 정상"을 테스트가 승인하는 셈이 되어 IL-LIM-009가 막으려는 것과
   같아진다, commander 지적 그대로).
3. **`Depends()` 대상**(`get_db`): 같은 쌍(edges 비어있음 + `provider_null_incoming_calls`)을 단언.

`diagnostics` 필드는 **의도적으로 assert하지 않는다** — 로컬 관측(전체 CLI 경로, 정상 query
latency)에서는 fastapi 없이도 `reportMissingImports`가 세 node 어디에도 실리지 않았지만(pyright의
diagnostics publish가 CLI의 query 응답보다 늦게 도착 — 별도 5초 대기 프로브로만 확인 가능했다), CI
환경의 timing이 다르면 실릴 수도 있다는 걸 배제하지 않는다. commander 지적대로 이 사실 자체를 관측
기록으로 남긴다: **CI가 아닌 개발자 자신의 환경에서 이 기능을 쓸 때는 실제로 diagnostics가 보일 수
있다** — fastapi를 설치하지 않은 실제 사용자에게는 `reportMissingImports`가 나타나는 것이 정상이고,
이 lane의 테스트는 그 차이 자체를 검증 대상으로 삼지 않을 뿐이다.

**non-vacuity — 역방향 관측(commander 지시, "fixture 파일 존재"가 아니라 "메커니즘"에 묶기)**:
`cli/src/lspProvider.ts`의 `incoming()`에서 `if (calls === null) { this.nullIncomingCallsObserved =
true; }`를 `if (false && calls === null) { ... }`로 일시 변경 → 재빌드 → 재실행:
- 대조군(`normal_helper`)은 **그대로 통과**(애초에 이 코드 경로와 무관).
- route handler·`Depends()` 테스트 **둘 다 실제로 실패**(`provider_null_incoming_calls` 못 찾음 —
  `["dynamic_calls_not_inferred","unsaved_buffers_unavailable","no_incoming_callers",
  "index_state_unknown"]`만 남고 그 코드가 사라짐).
원상복구 후 `shasum -a 256`으로 원본과 **byte-identical** 복원 확인(`git diff`도 빈 결과). 이로써 이
테스트가 지키는 것이 "fixture 파일이 읽힌다"가 아니라 "`null`이 `[]`와 구별돼 신호로 살아남는 경로"
자체임을 직접 증명했다.

**검증**: `npm run cli:build` 클린. `node --test cli/dist/test/pythonFastapiIntegration.test.js` 3/3
pass(정상 상태). `npm run cli:test` 전체 327/329 pass, 2 skip(기존과 동일, gopls-required — 신규
3개 포함해 이전 324보다 3개 증가, 회귀 없음).

## Stage 3 — 문서와 수용 기준 정리

**`docs.limitations` 재작성** (`cli/src/providers/catalog.ts`, `bundledPyright`): 기존 문구가
`Depends()`만 이름 대서 특수 사례처럼 읽혔다. Stage 1의 발견(route handler와 `Depends()` 대상이
**같은 `null` 신호로 수렴**하되 이유는 다름 — 전자는 프레임워크가 실제로 호출하지만 그 호출이 코드
어디에도 call expression으로 없고, 후자는 애초에 호출된 적이 없음)을 반영해 두 사례를 함께 명시하는
문장으로 교체했다.

**사용자가 읽는 위치 갱신**(수용 기준 문구 "일반 호출, route와 dependency별 기대·미지원 결과"를 그대로
반영):
- `README.md`: "분석 경계" 절의 Python/FastAPI 한 줄, "complete: true가 증명하지 않는 것" 절의
  `provider_null_incoming_calls` 설명 — 둘 다 route handler를 `Depends()`와 나란히 명시하도록 교체.
- `cli/README.md`: `provider_null_incoming_calls` 설명에 두 메커니즘을 나란히.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`: 기존 문구가 사실 부정확했다
  — "the function is genuinely called, but not through a call expression"는 route handler에는 맞지만
  `Depends()` 대상(애초에 호출 안 됨)에는 틀린 서술이었다. 이번에 정확히 구분해 다시 썼다.
- `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`: 같은 방향으로 교체.
- `INSTALL.md`: FastAPI 관련 세부 동작을 서술하지 않으므로(Python provider 설치·검증 등급만 다룸)
  갱신 대상 없음 — 상충하는 문장이 있는지 직접 확인했다(없음).

**`il-lim-006-python-fastapi-e2e.md`의 수용 기준 6개**: 각각 근거(파일 경로·테스트 이름·PR 번호)를
달아 체크했다(`상태: Backlog` 필드는 건드리지 않음 — commander 지시대로 마일스톤 종료 커밋에서 일괄
처리). 앞 4개는 이 lane이 새로 충족, 뒤 2개(provider 없는 요청의 자동 선택/actionable error, Python
실패가 빈 그래프·TS 실패로 오인 안 됨)는 M2 Python preset lane(PR #64)이 이미 충족한 것을 재확인만
했다 — 이 lane이 새로 만든 게 아니므로 근거에 그 사실을 명시했다.

**검증**: `npm run test:response-policy` 27/27(SKILL.md/cli-contract.md 편집이 doc invariant나
`<!-- response-policy-example -->` 두 블록을 깨지 않았는지 확인 — 안 건드림). `npm run cli:test`
327/329(회귀 없음). `npm run test:plugin-artifact` 클린.

## Stage 3 addendum — commander가 사실 오류를 지적, 실측으로 확인 후 정정

**stage 3에서 쓴 문구가 틀렸다.** commander가 지적: cli-contract.md의 새 문구
"a dependency referenced only via `Depends()` is not called at all, only referenced by name"는
**FastAPI에 대해 사실이 아니다** — `Depends(get_db)`는 FastAPI가 요청 처리 시 `get_db()`를 **실제로
호출**하고 반환값을 handler에 주입하는 메커니즘이다(그게 dependency injection의 정의). 원래 있던
문구("the function is genuinely called, but not through a call expression")가 route handler와
`Depends()` 대상 **둘 다에 참**이었고, 그래서 하나의 문장으로 둘을 함께 덮을 수 있었다. 이 세션이
"둘 다 `null`로 수렴 → 서로 다른 이유로 수렴 → 하나는 호출되고 하나는 안 된다"로 추론한 마지막
걸음이 **측정되지 않은 추론**이었고, 그 추론이 틀렸다 — 정확히 이 lane이 반복해서 잡아 온 형태(측정된
사실 위에 검증 안 된 한 걸음을 이음매 표시 없이 얹는 것)를 이번엔 내가 직접 저질렀다(위 118-122행,
229행, 239행이 그 원문 — 원문은 보존하고 여기 추가로 정정한다).

**지적을 그대로 받아들이지 않고 직접 재현해 확인했다**: 실제 fastapi 설치된 venv에서 `get_db`에
side-effect(`call_log.append(...)`)를 추가한 변형 fixture를 만들고, `fastapi.testclient.TestClient`로
`/items`를 실제로 GET 요청했다. 결과: `call_log == ['get_db executed']` — **`get_db`가 실제로 호출됨을
직접 확인**했다. commander의 지적이 옳았다.

**고침**(원래 프레이밍으로 복원, route handler를 나란히 예시로 두는 개선은 유지):
`cli/src/providers/catalog.ts`(`bundledPyright.docs.limitations`), `README.md`(두 곳),
`cli/README.md`, `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`,
`plugins/impact-lens/skills/impact-lens-cli/SKILL.md` — 전부 "둘 다 FastAPI가 실제로 호출하지만, 그
호출이 분석 대상 코드의 call expression이 아니라 프레임워크 내부(route는 router dispatch, `Depends()`는
dependency resolver)에서 일어난다"는 정확한 서술로 교체했다. "호출되는가"가 아니라 "호출 지점이 어디
있는가"로 차이를 서술하라는 commander의 방향을 그대로 따랐다.

**검증**: `npm run cli:build` 클린(문서·주석만 변경). `npm run test:response-policy` 27/27(재확인).
`npm run cli:test` 327/329(회귀 없음, 재확인).

## 남은 작업

- **Stage 1-3 전부 완료. commander에게 보고 후 검토 대기 — PR은 올리지 않는다**(commander가 명시,
  "PR은 올리지 말고 먼저 보고하세요").
- 이 lane에서 코드로 남은 일은 없다. M2 마일스톤 종료 처리(사용자 테스트 명세 커밋, gate 근거 정리,
  story 상태 일괄 갱신)와 릴리스가 이 lane 다음 순서로 남아 있다(commander가 명시, 이 lane의 범위
  밖).
