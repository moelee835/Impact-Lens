# M4: fix `findEnclosingDef()`'s scope-blindness in `fastapi-static-v1`

- 상태: 설계 완료, 구현 중
- branch: `fix/fastapi-depends-enclosing-scope`
- 선행: `docs/work/task-m4-gate7-budget-and-real-code-measurement.md`의 산출물 3-2(FastAPI 실제
  프로젝트 측정)가 실행으로 찾은 결함. commander·reviewer와 실시간으로 원인 분류·범위 확정을
  진행했다.
- 근거: 처음엔 gate 4 취지 위반으로 의심했으나, **reviewer가 독립 재현 후 gate 4 재개방이
  아니라고 판정했다**(아래 "gate 영향" 절 참고) — gate 4의 다중-후보 방어(`enclosingResolved.
  items.length > 1`)는 정상 동작하며, 이 결함은 그 방어가 작동할 기회조차 없이 **잘못된 위치
  좌표가 provider에 넘어가는** 별개의 실패 모양이다. gate 3(alias·sub-dependency·cross-file
  대표 fixture) 대표성에도 영향.

## 목적과 사용자 가치

**`fastapi-static-v1`이 실제 프로덕션 코드의 첫 비자명 쿼리에서 틀린 답을 냈다.** 두 실제
오픈소스 프로젝트(`tiangolo/full-stack-fastapi-template`, `Netflix/dispatch`, 각각 commit
`cb740b656d7a0a6c5e12c7bf8e50343ec94ee9c7`/`dd2837e82a0bf5565b1b4b4b91ea30b7262d4061`로 pin)에서
실측: `get_current_active_superuser`를 쿼리하면 candidate 4개 중 **2개는 명백한 오탐**(관련
없는 이전 라우트 핸들러), **2개는 이름만 우연히 맞고 실제로는 다른 참조가 잘못 미끄러진 결과**,
**진짜 정답 3개는 전부 위음성**이었다. `get_db`(모듈 레벨 `Annotated[Type, Depends(fn)]` 관용구)
는 **자기 자신을 자기 candidate caller로 내는 자기 참조 edge**를 냈다.

이 adapter는 현재 기본값이 꺼져 있어 실사용자 피해는 없지만, gate 7(기본값 on 판단)이 정확히
이런 근거를 찾으려고 만들어졌다 — **이 lane은 그 판단을 막을 근거를 실측으로 찾은 성공 사례다.**

이 PR 이후: `Depends()`의 세 실사용 형태(함수 파라미터, module-level `Annotated` 별칭, route
decorator의 `dependencies=[]`) 전부에서 candidate caller가 정확해진다.

## 근본 원인

`findEnclosingDef(lines, fromLine)`가 `Depends()` 참조 줄에서 뒤로 스캔해 정규식
`DEF_PATTERN`(`^(\s*)(?:async\s+)?def\s+(\w+)\s*\(`)에 매치되는 **가장 가까운 `def`**를
찾는다 — **들여쓰기/scope 인식이 전혀 없다.** Python은 중괄호 대신 들여쓰기가 scope인데, 이
함수는 그 사실을 전혀 안 쓴다.

**실측으로 확인한 세 갈래**(전부 `[실행]`):

1. **함수 파라미터**(`def f(x = Depends(y))`) — **정상**. 참조가 그 함수 자신의 시그니처
   안에 있어서, 뒤로 스캔해도 다른 `def`를 안 만나고 자기 자신에 도달한다. 실측:
   `common_parameters`(dispatch `database/service.py:593`)가 `get_current_role`의 candidate
   caller로 정확히 나옴(반드시 `auth`+`database` 서브트리만 담은 176-파일 워크스페이스로
   trim해야 쿼리 가능했다 — 원본 655개 파일은 `maxFiles: 200` 초과로 결과가
   `augmentation_budget_exceeded`였다, 이것도 별도 gate 7 데이터로 기록).
2. **module-level `Annotated[T, Depends(y)]`**(함수 밖) — **깨짐**. 참조가 애초에 어떤 함수
   안에도 없는데, 뒤로 스캔이 "가장 가까운 def"를 무조건 반환한다 — 그게 우연히 target 함수
   자신이면 자기참조(`get_db`, template과 dispatch 둘 다 확인), 다른 함수면 그 함수가 틀린
   candidate caller로 나온다(합성 재현으로 확인: `def other(): ...` 뒤 `def get_db(): ...`
   뒤 `Depends(get_db)` → `other`가 나옴).
3. **route decorator**(`@router.get(..., dependencies=[Depends(y)])`, 자기가 장식하는 def
   **위**) — **깨짐**. decorator는 자기 def보다 위에 있으므로 뒤로 스캔하면 **이전 라우트
   핸들러**를 만난다. 실측(template `get_current_active_superuser`): 파일에 라우트가 2개
   이상이면 거의 항상 걸린다 — `read_user_by_id`/`reset_password` 오탐, `read_users`/
   `update_user`는 이름만 우연히 맞음, 진짜 정답(`create_user`/`delete_user`/
   `recover_password_html_content`) 전부 위음성.

## 설계(2차 정정, commander) — `findEnclosingDef`를 똑똑하게 만들지 않는다

**1차 설계(들여쓰기 floor 추적 하나로 세 형태를 다 처리)를 폐기한다.** 세 형태가 서로 다른
규칙을 요구하는데 하나의 스캐너를 계속 다듬는 방향으로 가면, TS adapter의 `findEnclosingFunction`
이 문자열 → 정규식 → method-opener → arrow 인자로 네 번 반복해서 겪은 것과 같은 모양(한 채널을
막으면 다음 채널이 나옴)을 반복할 위험이 크다. **대신 참조가 어느 형태인지 먼저 분류하고, 형태별로
다른 규칙을 적용한다:**

- **파라미터 형태**(`def f(x = Depends(y))`) → **지금 동작(뒤로 스캔) 그대로 둔다.** 이미 맞다
  (실측 확인 — `common_parameters`/`get_current_role`).
- **route decorator 형태**(`@router.get(..., dependencies=[Depends(y)])`) → **아래쪽(순방향)
  def를 찾는다.** decorator는 자기가 장식하는 def보다 **위**에 있으므로 방향이 반대다.
- **module-level 형태**(`XDep = Annotated[T, Depends(y)]`, 함수 밖) → **기각한다, 고치지
  않는다.** `SessionDep = Annotated[Session, Depends(get_db)]`에는 애초에 호출자 함수가
  없다 — 의존성은 `SessionDep`이 **쓰이는 곳**(다른 함수의 파라미터 타입으로)에서 발생하고,
  그걸 따라가려면 이 SPI에 없는 `reference` 능력이 필요하다. v1의 정답은 "기각하고 이유를
  적는다"다 — **이건 `reference` 부재를 가리키는 네 번째 항목이다**(PR #98이 `il-lim-002-
  framework-di-routing.md`의 "미해결 질문"에 이미 emit 페어링, Spring bean 해석을 적어
  뒀다 — Spring bean은 `implementation` 부재였고, emit 페어링과 이제 이 항목이 `reference`
  부재 쪽에 쌓인다). 이 항목도 그 목록에 추가한다.

### 분류 자체가 새 위험이다 — 확신 못 하면 기각한다

decorator인지 판정하는 게 항상 쉽지 않다. 여러 줄 decorator(`@router.get(\n    "/",\n
dependencies=[Depends(x)],\n)`)는 `Depends()` 줄 자체엔 `@`가 안 보인다. **분류를 확신 못 하면
기각한다** — 이 저장소가 이미 다섯 번 택한 방향(문자열/정규식/method-opener/arrow 채널,
gate 4의 fold-to-abandonment)과 같다.

**분류 방법**: `Depends(` 토큰 앞에서부터 뒤로 스캔하며 괄호 깊이를 센다(문자열/주석은
`stripCommentsAndStrings()`로 먼저 제거한 텍스트에 대해). depth가 0인 채로 만나는 첫
안 닫힌 `(` 바로 앞이 무엇인지로 분류한다:
- `def name(` 바로 뒤라면 **파라미터 형태**.
- `@decorator.chain(` 바로 뒤(체인 형태 `@router.get(`, `@app.post(` 등)라면 **decorator
  형태** — 그 decorator 줄부터 순방향으로 다음 `def`를 찾는다(중간에 다른 decorator만 있고
  일반 코드를 안 만나면 성공, 만나면 기각 — `findRouteDecorator`가 이미 쓰는 "decorator는
  자기 def 바로 위에 연속으로 붙는다"는 Python 문법 규칙의 순방향 버전).
- 그 외(안 닫힌 괄호가 전혀 없음 — module-level 문장, 또는 다른 종류의 호출/괄호) → **기각**.

## 검증 계획

- [실행 예정] unit test: 파라미터 형태(회귀 없음), decorator 형태(한 줄/여러 줄 둘 다, 파일에
  라우트 2개 이상 — 순방향으로 올바른 def를 찾는지), module-level 형태(self-ref/other-function
  둘 다 — 기각하는지), 분류 불가 형태(기각하는지).
- [실행 예정] 두 실제 프로젝트 재측정 — 고치기 전 결과(이 문서에 이미 기록: `get_db` 자기참조
  2건, `get_current_active_superuser` candidate 4개 중 오탐 2·이름만 맞음 2·위음성 3) vs 고친
  후 결과를 대조. **`get_current_active_superuser` 쿼리가 정답 5개(read_users, create_user,
  update_user, delete_user, recover_password_html_content)를 내는지가 이 수정의 판정 기준**
  (commander) — fixture 통과만으로 끝내지 않는다.
- [실행 예정] 뮤테이션: 분류/라우팅을 비활성화하면 정확히 위 실제 사례들이 재현되는지 확인 후
  원복.
- [실행 예정] 기존 corpus(38개, python-fastapi fixture) 전체 재실행 — 회귀 없음 확인.

## gate·마일스톤 영향

1. **gate 4 재개방 아님(reviewer 독립 재현 후 판정)**: reviewer가 별도 최소 fixture로 두
   결함을 독립 재현했다. 판정: gate 4의 다중-후보 방어(`enclosingResolved.items.length > 1`
   분기, PR #81에서 닫힘)는 **정상 동작한다** — 두 재현 모두 `enclosingResolved.items.length`
   가 정확히 1이었다. 틀린 건 provider의 응답이 아니라 `resolveEndpoint`에 넘긴 위치 좌표
   자체 — `findEnclosingDef`가 scope를 안 봐서 애초에 잘못된 줄/문자를 골라 넘겼고, provider는
   그 잘못된 좌표에서 정직하게(그리고 정확하게) 잘못된 함수를 돌려줬을 뿐이다. gate 4의 방어가
   막으려는 것("여러 후보 중 하나를 임의 승격")과 이 결함("애초에 잘못된 위치를 물어봄")은
   **다른 실패 모양**이라 gate 4를 "3차 재개방"으로 적으면 다음 사람이 이미 멀쩡한
   `length > 1` 분기를 또 감사하게 만든다 — **새 이름으로 별도 추적**한다(이 work document
   자체가 그 추적 기록).
2. **gate 3 fixture 대표성**: "alias·sub-dependency·cross-file 대표 fixture가 candidate와
   ambiguity를 재현한다"는 문자 그대로는 여전히 참이지만, **fixture가 전부 파일당 라우트
   1개라 이 결함(파일에 라우트 2개 이상일 때만 decorator 오귀속이 남)을 구조적으로 못
   담는다** — gate 3가 이미 한 번 겪은 "명명된 fixture 존재 ≠ 실제 코드 대표"와 같은 모양.
3. **gate 7 "38개, 오탐 0건"**: 숫자는 안 틀렸다 — **의미 범위가 fixture로 한정된다는 게
   이제 실측으로 증명됐다.** precision 19건 정정과 같은 처리(지우지 않고 범위 명시)를
   gate 7 문서에 이미 적용했다.
4. **gate 7 budget의 핵심 근거로 승격(commander)**: dispatch(655개 파일)를 원본 그대로
   쿼리하면 `maxFiles: 200` 초과로 `augmentation_budget_exceeded`만 돌아온다 — parameter
   형태 확인을 위해 `auth`+`database` 서브트리만 176개 파일로 잘라낸 워크스페이스를
   **직접 만들어야** 쿼리가 됐다. 사용자는 그렇게 못 한다. 이건 부차적 데이터가 아니라
   **"실제 규모 프로젝트에서 200이 맞는 숫자인가"에 대한 유일한 실측**이고, 정확도 결함과
   같은 급(어떤 의미로는 더 큼 — 틀린 답이 아니라 답 자체가 없는 문제, 실제 규모에서는
   기본값)이다. gate 7 budget 산정 문서(산출물 1)에 핵심 근거로 반영한다.

## 예상 변경 파일

- `cli/src/shared/adapters/fastapiDependencyAdapter.ts`: `findEnclosingDef()`를 분류 함수
  (`classifyDependsReferenceContext` 가칭) + 형태별 세 경로로 재작성. module-level 기각의
  이유를 doc comment에 명시(`reference` 능력 부재, `il-lim-002-framework-di-routing.md`
  참조).
- `docs/development-management/stories/il-lim-002-framework-di-routing.md`: "미해결 질문"의
  `reference` 능력 부재 그룹에 module-level Depends alias 항목 추가.
- `cli/src/test/fixtures/python-fastapi/`: 새 fixture(module-level self-ref, module-level
  other-function, decorator 오귀속 — 한 줄/여러 줄, 다중-라우트 파일).
- `cli/src/test/pythonFastapiIntegration.test.ts`: 새 시나리오 추가, 정확도 corpus 갱신.
- `docs/work/task-m4-gate7-budget-and-real-code-measurement.md`: budget 핵심 근거로 655-파일
  초과 사례 반영.
