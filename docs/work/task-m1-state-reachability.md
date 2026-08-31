# M1 결과 상태 도달 가능성 검증

- 작성일: 2026-08-31
- branch: `test/m1-state-reachability`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대상 story: [IL-LIM-005 사용자 지정 LSP 호환성 확장](../development-management/stories/il-lim-005-custom-lsp-compatibility.md) 3단계 검증
- 실행 계획: [M1 Agent Team 실행 계획 W3-A](task-m1-agent-team-execution.md)
- 선행 작업: [W2-A readiness 실측](task-m1-provider-readiness.md) PR #46,
  [W2-C 응답 정책](task-m1-plugin-response-policy.md) PR #48

## 목적과 사용자 가치

Impact Lens는 답을 줄 때마다 그 답이 **어떤 상태에서 나온 것인지**를 함께 보고한다. 탐색이 끝까지 갔는지,
색인이 준비됐는지, 근거가 어떤 종류인지. 이 상태 조합이 13가지 있고 전부 test가 있다.

**그런데 그 test들은 검사 대상에게 답을 미리 쥐여준다.** "도구가 X를 관측했다고 치면 Y라고 보고하는가"를
검증할 뿐, **"도구가 X를 실제로 관측할 수 있는가"는 검증하지 않는다.**

조사 결과 **13가지 중 5가지는 실제 실행에서 절대 일어날 수 없다.** 그 상태를 만들어 내는 코드가 제품에
없다. timeout으로 중단된 부분 결과, 취소된 부분 결과, provider 실패 후의 부분 결과, 그리고 추론·관측 근거를
포함한 두 상태다.

이건 버그가 아니다. 그 다섯은 뒤 마일스톤(M4 의미 보강, M5 대규모 workspace) 소관이다. **버그는 그 사실을
아무 데도 적어두지 않았다는 것이다.** test 목록만 보면 13가지가 전부 똑같이 실재하는 것처럼 보인다.

여기서 두 가지 사고가 난다.

1. 누군가 **일어나지 않는 상태를 전제로 기능을 만든다.** UI가 "timeout이라 일부만 보여줍니다"를 그리는데
   그 상태가 오지 않아 죽은 코드가 된다.
2. 반대로 **어떤 상태의 유일한 생산자를 지우는데 아무 test도 실패하지 않는다.** 관측을 넘기는 코드를
   지워도, 상태를 합성해 넣는 test는 여전히 통과한다.

이 작업이 끝나면 다음 결과를 얻는다.

- **실행 가능한 재고 목록**이 생긴다. 실제 provider를 돌려서 나온 상태 조합만 "도달 가능"으로 기록하고,
  선언한 목록과 다르면 test가 실패한다.
- 도달 불가능한 다섯 상태가 **명시적으로 선언**된다. 누군가 그중 하나를 실제로 만들어 내는 순간 test가
  실패하고, 목록을 옮기기 전에는 통과하지 못한다. 저장소가 error code에 이미 쓰고 있는 방식과 같다.
  그 장치는 W2-A에서 실제로 작동해 build를 막았다.
- 사용자 질문 하나에 근거를 갖고 답할 수 있게 된다. **"내가 지금 실제로 보는 상태는 무엇인가?"**

## 배경과 해결할 문제

### 확인한 사실

`observations.interruption`과 `observations.semantic`을 **production에서 넘기는 코드가 없다.**

- `interruption`: `cli/src/coverage.ts:120,123,126`이 읽고 `cli/src/types.ts:327`이 선언한다. 쓰는 곳은
  test뿐이다.
- `semantic`: `cli/src/types.ts`가 선언하고 `coverage.ts`가 읽는다. 쓰는 곳은 test뿐이다.
- `LspCallHierarchyProvider.analysisObservations()`는 `{ indexing }` 하나만 반환한다
  (`cli/src/lspProvider.ts:279-281`).

즉 `completion.test.ts`와 `coverage.test.ts`의 S9~S13은 **합성 관측으로만 도달한다.**

### 이미 되어 있어서 다시 하지 않을 것

실행 계획의 W3-A 항목 중 두 가지는 이미 끝났다.

- **`scripts/test-plugin-artifact-e2e.mjs`의 `selectedBy`·`complete` assert 갱신.** 계획은 W1-B가
  Auto/preset을 도입하는 순간 이 assert가 깨진다고 경고했지만, 깨지지 않았다.
  `scripts/test-plugin-artifact-e2e.mjs:137-142`에 그 이유가 주석으로 남아 있다. 카탈로그의 TypeScript
  preset은 tarball 안에 들어 있어 PATH에서 발견되는 것이 아니므로 `bundled`가 맞고, 여기서 `auto`가 나오면
  릴리스가 사용자 기계에 설치된 것에 의존하기 시작했다는 뜻이다. assert는 의도적으로 정확한 값을 유지한다.
- **CI에 mock provider case 추가.** `unit-tests.yml`이 `npm run cli:test`를 돌리고, 여기에
  `readiness.integration.test.ts`(mock server 12건)와 `lsp.integration.test.ts`가 이미 포함된다.

### 기존 test가 이미 덮는 축

| 축 | 덮는 곳 |
| --- | --- |
| capability 없음 / 동적 등록 | `contract.test.ts`, `readiness.integration.test.ts`, `doctor.test.ts` |
| 색인 unknown / ready / working | `readiness.integration.test.ts` |
| readiness budget 초과 partial·실패 | `readiness.integration.test.ts` |
| depth·node 제한 partial | `impact.test.ts`, `completion.test.ts` |
| 상태 조합 → v1 투영 | `coverage.test.ts`, `completion.test.ts`, `forbidden.test.ts` |

**빠진 것은 단 하나다.** 위 test들은 각 상태의 *투영*이 옳다는 것을 증명하지만, 어느 상태가 *production에서
실제로 발생하는지*는 아무도 기록하지 않는다.

### 범위 밖임을 확인한 것

timeout·취소 후 부분 결과 보존은 [IL-LIM-008](../development-management/stories/il-lim-008-large-graph-traversal-limits.md)의
수용 기준이고 그 story의 완료 마일스톤은 **M5**다. 따라서 이 lane은 그 상태를 **구현하지 않는다.**
도달 불가능하다는 사실을 고정할 뿐이다.

## 범위

- 실제 provider(bundled TypeScript, mock server)를 돌려 도달 가능한 completion 상태 조합을 수집
- 도달 가능 집합이 선언된 목록과 정확히 일치하는지 검사
- 도달 불가능한 상태를 선언하고, 생산자가 생기면 실패하는 역방향 검사
- shipped catalog에서 도달 가능한 것과 사용자 설정 provider가 있어야 도달 가능한 것의 구분
- `AnalysisObservations`의 각 필드에 production 생산자가 있는지 확인하는 검사

## 범위에서 제외할 항목

- timeout·취소·provider 실패 시 부분 결과 보존 구현 (IL-LIM-008, M5)
- 추론·관측 edge 생산 구현 (IL-LIM-001/002, M4)
- 실제 외부 Language Server(gopls, pyright 등) 호환 검증 (IL-LIM-005 4단계, M2 이후)
- shipped catalog preset에 readiness 선언 추가
- CLI 응답 필드·schema 변경. 이 lane은 test만 추가한다.
- `scripts/test-plugin-artifact-e2e.mjs`의 assert 변경 (위 조사대로 이미 올바르다)

## 설계 결정

### 1. 도달 가능성은 합성 관측이 아니라 실행으로 판정한다

`analyzeImpact()`에 관측을 직접 넘기면 어떤 상태든 만들 수 있다. 그건 이미 `completion.test.ts`가 하는
일이고, 이 lane이 답하려는 질문이 아니다. 여기서는 **관측 인자를 넘기지 않고** provider를 실제로 돌려서
나온 결과만 도달 가능으로 센다.

### 2. 도달 불가능 목록은 error code와 같은 방식으로 강제한다

`CONTRACT_ONLY_ERROR_CODES`는 선언과 구현이 갈라지는 것을 막는 장치이고, W2-A에서 실제로 작동해
`provider_not_ready`를 던지기 시작한 순간 build를 막았다. 상태에도 같은 장치를 둔다. 두 방향 모두 검사한다.

- 도달 불가능으로 선언한 상태가 실행에서 나오면 실패한다.
- 도달 가능으로 선언한 상태가 실행에서 안 나오면 실패한다.

### 3. shipped catalog와 사용자 설정을 분리해 기록한다

`indexingStatus: ready`와 `working`은 readiness를 선언한 preset이 있어야 나온다. shipped catalog에는
그런 preset이 없다. 두 경우를 한 칸에 뭉치면 "오늘 사용자가 실제로 보는 것"이라는 질문에 답할 수 없다.

## 단계별 구현 계획

### 1단계 — 목적·조사·범위 고정

목적: 이미 끝난 항목을 다시 하지 않게 하고, 도달 불가능 상태 5개를 근거와 함께 확정한다.

산출물: 이 문서, 기존 test 범위 조사, `interruption`·`semantic` 생산자 부재 근거, 기준선.

검증: 조사 주장을 코드에서 재확인, 문서 link 존재, `git diff --check`. 문서만 독립 commit·push.

### 2단계 — 도달 가능성 matrix test

목적: 어느 상태가 실제로 발생하는지를 실행으로 증명하고, 발생하지 않는 상태를 실패 가능한 형태로 고정한다.

산출물: 도달 가능 상태를 실행으로 수집하는 test, 도달 가능·불가능 선언 목록, 양방향 검사,
`AnalysisObservations` 필드별 생산자 검사, 작업 로그와 완료 근거.

검증: 전체 CLI·Extension test, response policy eval, plugin artifact E2E, `git diff --check`.
독립 commit·push하고 PR을 연다.

## 테스트 및 완료 기준

- [ ] 관측 인자를 넘기지 않고 실행해 도달한 상태만 도달 가능으로 집계된다.
- [ ] 도달 가능 집합이 선언 목록과 정확히 일치한다(양방향).
- [ ] `timeout`, `cancelled`, `failed` traversal 상태가 도달 불가능으로 선언되고 근거가 기록된다.
- [ ] `static-plus-inference`, `static-plus-observation`이 도달 불가능으로 선언된다.
- [ ] 도달 불가능 상태에 생산자가 생기면 test가 실패한다(역방향 확인).
- [ ] `interruption`과 `semantic`에 production 생산자가 없다는 사실이 검사로 고정된다.
- [ ] shipped catalog 도달 가능 집합과 사용자 설정 도달 가능 집합이 구분된다.
- [ ] `npm run cli:test` 통과
- [ ] `npm test` 통과
- [ ] `npm run test:response-policy` 통과
- [ ] `npm run test:plugin-artifact` 통과
- [ ] `git diff --check` 통과
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다.

## 작업 로그

### 2026-08-31 — 1단계 조사와 범위 확정

- `origin/main` `3cabdd8`에서 branch를 만들었다.
- 실행 계획 W3-A의 두 항목(E2E assert 갱신, CI mock provider case)이 이미 충족된 것을 코드에서 확인했다.
  실행 계획이 stale한 세 번째 사례다. 앞선 두 번은 W2-C의 Auto/preset 문서화와 그 근거로 인용된 낡은 문장이었다.
- `interruption`과 `semantic`을 production에서 넘기는 코드가 없음을 확인했다. `analysisObservations()`는
  `{ indexing }`만 반환한다.
- 그 결과 `completion.test.ts`/`coverage.test.ts`의 S9~S13이 합성 관측 전용임을 확인했다. 이것이 이 lane이
  메울 실제 공백이다.
- timeout·취소 후 부분 결과 보존이 IL-LIM-008(M5) 수용 기준임을 확인하고 구현을 범위에서 제외했다.
- branch 이름을 계획의 `test/m1-compatibility-matrix`에서 `test/m1-state-reachability`로 바꿨다.
  "compatibility matrix"는 IL-LIM-005 **4단계**의 제목(실제 서버 호환 matrix)과 같아 혼동을 부른다.
  그 작업은 실제 외부 server가 필요하고 M2 이후다.
