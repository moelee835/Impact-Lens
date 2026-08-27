# M1 Wave 0 세션 Handover

- 작성일: 2026-08-27
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 실행 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md)
- 이 문서의 목적: M1 Wave 0을 진행한 세션의 상태를 다음 세션에 인계한다. 끝난 조사를 반복하지 않고
  다음 단계부터 이어가는 것이 목표다.

## 1. 한 문단 요약

M1은 Agent Team 기반 wave 실행으로 계획됐고 Wave 0(계약 확정과 안전망) 4개 lane 중 3개가 끝났다.
W0-1(상태 truth table과 용어 결정)은 승인·merge까지 완료됐고, W0-2(CI 안전망)와 W0-3(타입·스키마
드리프트 해소)은 구현과 CI 통과를 마쳤으나 **PR이 열려 있다**. 남은 것은 W0-4(provider 선택 로직 seam
추출) 하나이며, 그것이 끝나면 Wave 1의 3개 lane을 병렬로 착수할 수 있다.

## 2. 현재 상태

### Git

- 저장소: `~/dev/Impact-Lens`
- `main` HEAD (handover 작성 시점): `84188ea` — `Merge pull request #30`
- 이 문서의 branch: `docs/m1-wave0-handover`

### merge 완료

| PR | 내용 | merge commit |
| --- | --- | --- |
| [#29](https://github.com/moelee835/Impact-Lens/pull/29) | M1 Agent Team 실행 계획, `.claude/agents/` 7개 역할 정의 | `2f9f980` |
| [#30](https://github.com/moelee835/Impact-Lens/pull/30) | 상태 truth table, 승인된 어휘 결정, `provider-coverage-contract.md` 개정 적용 | `84188ea` |

### merge 대기 (다음 세션이 가장 먼저 확인할 것)

| PR | branch | 상태 | 파일 겹침 |
| --- | --- | --- | --- |
| [#31](https://github.com/moelee835/Impact-Lens/pull/31) | `test/m1-ci-safety-net` | CI 4종 통과, MERGEABLE | #32와 겹침 0건 |
| [#32](https://github.com/moelee835/Impact-Lens/pull/32) | `refactor/m1-contract-types` | CI 3종 통과, MERGEABLE | #31과 겹침 0건 |

두 PR은 파일이 전혀 겹치지 않으므로 merge 순서는 상관없다.

### 정리 대상

이전 세션의 agent worktree 3개가 남아 있을 수 있다. 각 branch가 merge된 뒤에는 제거해도 된다.

```
.claude/worktrees/agent-a2b2b6d7a2245d9d6   refactor/m1-contract-types
.claude/worktrees/agent-a6d1355a0c50a6164   docs/m1-state-truth-table   (merge 완료)
.claude/worktrees/agent-aa80670f6a16191b2   test/m1-ci-safety-net
```

## 3. 승인된 결정 (재논의 불필요)

2026-08-27 사용자 승인.

- **traversal·semantic 어휘와 schema version 정책을 하나의 묶음으로 (c) additive 채택.**
  - `data.completion`이 상태의 단일 출처가 되고 `complete`/`truncated`/`traversalLimits`/`coverage.*`는
    거기서 파생되는 v1 projection이다.
  - `schemaVersion: 1`을 유지한다. v2 승격은 필드 제거 또는 기존 필드 의미 변경이 필요할 때만 한다.
  - 근거와 선택지 비교는 [`task-m1-state-truth-table.md`](task-m1-state-truth-table.md) 4절에 있다.
- **M0의 남은 gate(실제 사용자 검증)는 M1 개발과 병행한다.** M1 진입 조건은 이미 충족돼 기술적 제약이 없다.
  M0 사용자 검증은 별도 트랙이며 별도 승인이 필요하다.

## 4. Wave 0 진행 상황

계획 원문은 [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md) "단계별 구현 계획"에 있다.

| lane | 내용 | 상태 | 산출물 |
| --- | --- | --- | --- |
| W0-1 | 상태 truth table, 용어 결정, 계약 문서 반영 | **완료·merge** | [`task-m1-state-truth-table.md`](task-m1-state-truth-table.md), `provider-coverage-contract.md` |
| W0-2 | CI 안전망, mock fixture 공용 헬퍼 | **완료·PR #31** | [`task-m1-ci-safety-net.md`](task-m1-ci-safety-net.md) |
| W0-3 | 드리프트 3건 해소, `errors.ts`, schemaVersion 상수, parity 테스트 | **완료·PR #32** | [`task-m1-contract-types.md`](task-m1-contract-types.md) |
| W0-4 | provider 선택 로직 seam 추출 | **미착수** | — |

### W0-1이 만든 것

- 성공·부분 13행(S1~S13), 실패 22행(F1~F22)의 상태 truth table. 각 행에 3축, v1 projection 4필드,
  필수 reason, severity, 사용자 노출 문구, action.
- 금지 조합 11건(X1~X11)과 각각을 타입 union·JSON Schema `allOf`로 표현 불가능하게 만드는 방법.
- 신규 error code 11종을 `provider-coverage-contract.md`에 추가.
- 금지 문구 목록: `no impact`, `safe to change`, `unused`, `fully analyzed`, `complete analysis`,
  `all callers`는 어떤 상태에서도 생성하지 않는다.

### W0-2가 만든 것

- `.github/workflows/unit-tests.yml` 신설. `npm test`(Extension 34개)와 `npm run cli:test`(CLI 51개)가
  CI에서 실제로 실행되는 것을 run log로 확인했다.
- **워크플로를 분리한 이유**: 워크플로 이름이 PR check 이름의 접두사가 되므로, E2E 워크플로에 job을 넣으면
  로직 회귀가 `Plugin artifact E2E / …`로 표시돼 패키징 회귀와 구분되지 않는다.
- 단위 job에만 `main` push 트리거를 추가했다. 여러 lane이 각자 PR을 merge할 때 **독립적으로 green이던 두
  PR이 main에서 처음 만나는 순간**이 지금까지 무검증이었다.
- `cli/src/test/fixtures/mockServer.ts` 공용 헬퍼와 server→client request를 보내는 fixture 2종
  (`configurationRequestServer`, `registerCapabilityServer`).

### W0-3이 만든 것

- 드리프트 3건 해소: `selectedBy` 2→6, `traversal.status` 3→5, `host` 1→2. **타입을 스키마에 맞췄고
  스키마는 건드리지 않았다.** `schemas/**`는 이미 tarball로 배포됐으므로 enum을 좁히는 것은 producer 계약을
  줄이는 v2 전용 변경이다.
- `cli/src/errors.ts` — 실제로 던져지는 24개 code만 union으로 중앙화. 계약에만 있고 던져지지 않는 10개는
  제외하고 그것을 테스트로 강제한다. reason code는 의도적으로 union에 넣지 않았다.
- `schemaVersion` 리터럴 2개를 단일 상수로 추출.
- CLI와 Extension 양쪽에 **스키마 enum ↔ TS union parity 테스트** 추가.

## 5. 재조사 불필요한 사실

세 개의 조사 lane이 확인한 코드 기준선이다. 라인 번호는 `main` `84188ea` 기준이며, PR #31·#32가 merge되면
일부가 이동한다.

### CLI protocol 계층

- `cli/src/jsonRpc.ts:179`의 `handle()`이 `id` 유무로만 분기한다. `id`와 `method`가 함께 오는
  server→client request는 pending 테이블 조회로 빠지거나 조용히 폐기되고, **응답을 보내는 함수 자체가 없다.**
- server request의 id가 client `nextId`(`cli/src/jsonRpc.ts:26`)와 같은 네임스페이스라, 서버가 `id: 1`
  request를 보내면 client의 `initialize` pending을 잘못 resolve할 수 있다.
- `dynamicRegistration: false`(`cli/src/lspProvider.ts:187`), `$/progress` 미구현,
  `initializationOptions`는 `{}` 하드코딩(`cli/src/lspProvider.ts:192`), `workspace/configuration` 응답 불가.
- `$/cancelRequest` 미전송. per-request 타임아웃(`cli/src/jsonRpc.ts:92-101`)만 있고 분석 전체 예산은 없다.
- 진단 수집 대기가 고정 100ms(`cli/src/lspProvider.ts:147`)라 느린 서버의 진단은 통째로 누락된다.
- **W0-2가 이 결함의 재현 수단을 만들어뒀다.** 빌드한 CLI를 `configurationRequestServer`에 물리면
  `provider_initialize_failed` + `bytesFromServer: 131`(request는 client에 도달) +
  `stderr: "no client answer to workspace/configuration within 1500ms"`가 나온다. 이것이 고쳐야 할 회귀의
  정확한 모양이다.
- fixture의 server request id는 **1000부터** 시작한다. 1부터 매기면 client가 자기 pending `initialize`를
  잘못 resolve해서, 테스트가 진짜 결함이 아니라 id 충돌을 재현하게 된다.

### CLI provider 선택·doctor

- provider 선택은 `cli/src/lspProvider.ts:63-64`의 삼항 연산자 두 줄이다. preset catalog, PATH 탐색,
  설정 파일 병합이 전부 없다.
- bundled은 TS 계열 4종만 허용하고 그 외는 `provider_required_for_language`
  (`cli/src/lspProvider.ts:312-327`)로 즉시 종료한다. **타 언어 fallback 금지 규칙 자체는 이미 지켜지고 있다.**
- doctor 서브커맨드는 `doctor bundled-typescript` 하나뿐이고(`cli/src/index.ts:202-204`), 모든 check의
  `status`가 `'pass'` 리터럴 고정(`cli/src/doctor.ts:4-47`)이라 부분 실패를 보고할 수 없다. 첫 실패는
  예외로 전체를 중단시킨다.
- 언어 판별은 `cli/src/lspProvider.ts:329-352`의 확장자 switch다. python/c/cpp/swift/kotlin 매핑은 있으나
  provider가 없어 매핑만 존재한다.

### 상태 계약과 coverage

- `coverage.semantic.status`는 `'static-only'`, `coverage.indexing.status`는 `'unknown'` 하드코딩이다
  (`cli/src/coverage.ts:17-18`). 실측되는 값은 `traversal.status` 하나뿐이다.
- `cli/src/impact.ts:129`에서 `entries`가 root로 seed되므로 **성공 응답의 `nodes`는 비어 있을 수 없다.**
  실제 caller 0건은 `nodes.length === 1`과 `edges.length === 0`으로 나타난다. schema `minItems: 1`로
  "provider 실패를 성공한 empty graph로 반환"을 validation에서 막을 수 있다.
- **응답을 스키마에 대조하는 검증만으로는 enum 드리프트를 잡을 수 없다.** CLI가 실제로 내보내는 값은
  전부 스키마의 넓은 enum 안에 들어있기 때문이다. W0-3이 옛 좁은 union을 되돌려 실험으로 확인했다.
  그래서 스키마 enum과 TS union을 직접 대조하는 parity 테스트가 따로 필요했다.

### Extension

- Extension은 CLI를 호출하지 않는다. 분석 경로는 `vscode.prepareCallHierarchy` →
  `vscode.provideIncomingCalls`(`src/impactAnalyzer.ts:22,64`) 하나뿐이며 **CLI와 코드를 공유하지 않는
  병렬 구현**이다. coverage 계약은 `src/coverage.ts`와 `cli/src/coverage.ts`에 손으로 맞춰둔 두 벌의 상수다.
- `stateLabel()`이 `src/impactTreeProvider.ts:176-190`과 `src/graphPanel.ts:588-594`에 중복 구현돼 있다.
- `semantic`을 노출하는 UI 지점은 graph state pill의 `title`(`src/graphPanel.ts:297-303`) 하나뿐이다.
  Explorer 툴팁(`src/impactTreeProvider.ts:67-78`)과 StatusBar 툴팁(`src/controller.ts:610-622`)에는 없다.
- CodeLens(`src/codeLensProvider.ts:65-72`)는 provider 상태를 전혀 표시하지 않는다.
- provider 부재 메시지가 `src/controller.ts:344`와 `src/impactTreeProvider.ts:44`에 중복돼 있고 doctor로
  이어지는 경로가 없다.
- `package.json:113-167`에 provider 관련 설정 항목이 하나도 없다.
- `GraphPayload`(`src/graphPanel.ts:19-27`)가 coverage를 문자열 3개로 평탄화해 advertised/observed/
  lifecycle/reasons가 webview에 도달하지 않는다.
- `.state.partial` CSS 규칙이 없다(`src/graphPanel.ts:236-238`).

### Plugin·릴리스

- Plugin 문서는 `bundled | custom` 이분법만 설명한다. `Auto`, preset, 언어별 설치 안내가 없다.
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:126-128`의 "provider 없으면
  비-TS/JS는 무조건 에러"는 Auto 도입 시 정반대 명제가 된다.
- **`scripts/test-plugin-artifact-e2e.mjs:125-126`이 `provider.selectedBy === 'bundled'`와
  `complete === true`를 하드 assert한다. Auto/preset 도입 즉시 실패한다.**
- `scripts/test-plugin-artifact-e2e.mjs:157-161`의 "stdout은 정확히 JSON 한 줄" 불변식은 계약의 핵심이다.
- `plugins/impact-lens/scripts/run-impact-lens:11`에 release tarball URL이 하드코딩돼 있고 plugin manifest
  버전(0.2.x)은 root 버전(0.6.x)과 독립적으로 관리된다.
- `cli/package.json`의 `files`는 `dist/*.js`, `README.md`, `schemas/**`다. `dist/*.js`가 한 단계만
  매칭하므로 `dist/test/*.js`는 tarball에서 빠진다. devDependency도 tarball에 들어가지 않는다.

## 6. 미결 항목

다음 세션이 결정하거나 닫아야 한다.

| # | 항목 | 누가 닫는가 | 비고 |
| --- | --- | --- | --- |
| 1 | `data.completion.stage`와 실패 envelope의 `error.details.stage`가 같은 필드인지 별도인지 | W1-C | 중복 저장하면 모순 조합이 하나 더 생긴다 |
| 2 | reason code `no_incoming_callers`, `index_state_unknown`을 계약에 별도 표로 둘지 | W1-C | 대응 error code가 없다 |
| 3 | reason `traversal_timeout`/`traversal_cancelled`와 error code `timeout`/`request_cancelled`의 이름 통일 여부 | W1-C | 같은 사건의 두 표현 |
| 4 | `provider_ipc_unavailable`의 stage가 `launch`인지 | W1-A + 계약 lane | 아래 상세 |
| 5 | `internal_error`에 `details.stage`가 없다 | W1-C | 계약 표의 stage 열과 `cli/src/index.ts:97`이 어긋난다 |
| 6 | 단위 워크플로를 OS matrix로 넓힐지 | W0-2 후속 | 현재 ubuntu 단일. Windows에서만 깨지는 단위 테스트가 생기면 필요 |

### 4번 상세

계약 표는 `provider_ipc_unavailable`을 `launch` stage로 적었다. 그런데 `cli/src/childIpc.ts:68-80`이 원래
오류의 `details`를 그대로 펼치고 `looksLikeSilentProviderFailure`가 `provider_initialize_failed`와
`provider_query_failed`도 받아들이므로, `details.stage`가 실제로는 `initialize`나 `query`로 나갈 수 있다.

문서가 틀렸는지 코드가 틀렸는지는 **stage의 의미가 "IPC가 죽은 시점"인지 "우리가 알아챈 시점"인지**에
달렸다. 임의로 정하지 말고 Wave 1의 protocol lane이 실제 동작을 확인한 뒤 결정한다.

## 7. 문서가 구현보다 앞선 구간

`provider-coverage-contract.md`가 지금 코드보다 앞서 있다. 이것은 우리가 없애려는 드리프트와 같은 모양이므로
**방치되지 않게 추적해야 한다.**

| 문서가 선언한 것 | 코드의 현재 상태 | 닫는 lane |
| --- | --- | --- |
| `data.completion`이 상태의 단일 출처 | 필드를 생산하지 않는다 | W1-C |
| `coverage.traversal.status` 5값 생산 | `cli/src/coverage.ts`가 3값만 만든다 | W1-C |
| 신규 error code 11종 | 던져지지 않는다. `errors.ts` union에서도 제외 | W1-A, W1-B |
| 기준 fixture 7종 추가 | 존재하지 않는다 | W1-A, W3-A |

`cli-contract.md`(Plugin reference)는 **의도적으로 갱신하지 않았다.** 실제 응답 예시를 담는 문서라
`data.completion`을 생산하기 전에 예시를 넣으면 문서가 출력과 어긋난다. W1-C와 함께 갱신한다.

## 8. 다음 세션의 작업 순서

### 1) PR #31·#32 merge 확인

merge되지 않았다면 먼저 처리한다. **merge는 auto mode 분류기가 차단하므로 에이전트가 수행할 수 없다.**
사용자가 직접 merge하거나, `.claude/settings.local.json`의 `permissions.allow`에
`"Bash(gh pr merge:*)"`를 추가해야 한다. 이 파일은 gitignore 대상이라 커밋되지 않는다.

### 2) W0-4 착수 — provider 선택 seam 추출

- branch: `refactor/m1-provider-seam`
- 역할: `il-provider-platform`
- 내용: `cli/src/lspProvider.ts:63-64`의 선택 로직을 `cli/src/providers/resolve.ts`로 **순수 이동**.
  `cli/src/coverage.ts`의 상수 3개를 인자로 파라미터화(값은 동일).
- **동작·응답 무변경이 완료 조건이다.** W0-3이 쓴 응답 캡처 비교 방법을 재사용한다.
  주의: `mkdtemp`를 쓰면 캡처가 비결정적이다. `symbolId`가 파일 URI를 해싱하고 note conflict token이
  workspace 경로를 담기 때문에 코드를 하나도 안 바꿔도 diff가 난다. workspace 경로를 고정해야 한다.
- 이 lane이 끝나야 Wave 1의 `il-lsp-protocol`(`lspProvider.ts`)과 `il-provider-platform`(`providers/`)이
  파일 단위로 완전히 분리된다.

### 3) Wave 1 착수 — 3 lane 병렬

| lane | 역할 | branch | 소유 파일 |
| --- | --- | --- | --- |
| W1-A | `il-lsp-protocol` | `feat/m1-bidirectional-lsp` | `jsonRpc.ts`, `lsp/**`, `lspProvider.ts` |
| W1-B | `il-provider-platform` | `feat/m1-preset-catalog` | `providers/**`, `doctor/**`, `runtime.ts` |
| W1-C | `il-contract-architect` | `feat/m1-completeness-emit` | `coverage.ts`, `impact.ts`, 스키마 |

**착수 전에 반드시 할 것**: W1-A와 W1-B는 preset manifest의 `initializationOptions`/`settings`/readiness
필드 형태가 상호 의존한다. lead 주재로 필드 형태를 먼저 합의하고 W1-B가 manifest 타입으로 확정한 뒤
착수한다. 합의 없이 병렬로 시작하면 재작업이 발생한다.

W1-C는 6절 미결 1·2·3·5번을 함께 닫고, 7절의 "문서가 앞선 구간" 중 `completion`과 traversal 5값을 닫는다.

## 9. Agent Team 운영

역할 정의는 `.claude/agents/`에 7개가 있다(`il-contract-architect`, `il-lsp-protocol`,
`il-provider-platform`, `il-host-ux`, `il-plugin-docs`, `il-test-release`, `il-reviewer`).
각 파일에 소유 경로와 어겨서는 안 될 계약 규칙이 함께 들어 있다.

지금까지 실제로 통한 운영 방식:

- 구현 에이전트는 `isolation: "worktree"`로 띄운다. 서로의 working tree를 침범하지 않는다.
- **한 wave 안에서 두 에이전트가 같은 파일을 수정하지 않는다.** 겹치면 wave를 나눠 직렬화한다.
- 에이전트에게 "결정하라"고 시킬 때는 **"결론과 근거를 작업 문서에 적어라"를 함께 지시한다.** 이렇게
  했더니 지시가 틀린 지점을 에이전트가 근거를 들어 반박해 왔고(W0-3의 `selectedBy` 판단), 그 반박이 옳았다.
- 리팩터링 lane에는 "테스트 통과"가 아니라 **"변경 전후 산출물 바이트 비교"를 완료 조건으로 준다.**
  W0-2는 16개 시나리오, W0-3은 16개 CLI 호출을 비교했고 둘 다 이 과정에서 함정을 하나씩 발견했다.
- merge는 lead가 결정한다. 에이전트에게 `gh pr merge`를 시키지 않는다.
- `il-reviewer`는 수정 도구를 주지 않아 구현이 불가능하다. 사용자 테스트 명세 검토처럼
  "구현자가 아닌 검토자"가 필요한 곳에 쓴다.

## 10. 주의사항

- **`npm run test:all`이 이제 네트워크를 요구한다** (PR #31). `test:plugin-artifact`가 포함됐고, 그것이
  fresh npm cache로 tarball 의존성을 내려받는다. 오프라인 경로는 `npm run test:unit`이다.
- `main`/`master`에서 파일을 변경하거나 push하지 않는다. `AGENTS.md` 0절.
- `scripts/test-plugin-artifact-e2e.mjs:125-126`의 assert는 Wave 3에서 갱신한다. Wave 1의 W1-B가
  Auto/preset을 도입하는 순간 깨지므로, **W1-B PR과 assert 갱신 PR을 연속으로 처리해** CI가 빨간 상태로
  머물지 않게 한다.
- 검증되지 않은 언어를 `verified-external`로 문서화하지 않는다. M1은 TypeScript reference preset까지다.

## 작업 로그

### 2026-08-27 — handover 작성

- Wave 0의 3개 lane 완료 시점에 세션 인계를 위해 작성했다.
- 라인 번호는 `main` `84188ea` 기준이다. PR #31·#32가 merge되면 `cli/src/index.ts`,
  `cli/src/types.ts`, `src/types.ts`의 라인 번호가 이동한다. 5절을 참조할 때는 심볼 이름으로 먼저 찾는다.
