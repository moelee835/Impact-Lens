# M1 W2-B — Extension completeness UX

- 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 대응 스토리: `IL-LIM-009` 3단계
- lane: W2-B (`il-host-ux`), branch `feat/m1-extension-completeness-ux`, base `origin/main` `924da5f`
- 선행 문서: [`task-m1-state-truth-table.md`](task-m1-state-truth-table.md),
  [`task-m1-wave0-handover.md`](task-m1-wave0-handover.md) 5절,
  [`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md),
  [`provider-coverage-contract.md`](../development-management/provider-coverage-contract.md)

## 배경과 해결할 문제

Extension은 CLI를 호출하지 않는 병렬 구현이고, 분석 경로는 `vscode.prepareCallHierarchy` →
`vscode.provideIncomingCalls`뿐이다. 그런데 그 결과의 **완전성을 사용자에게 설명하는 층이 없다.**

W0 조사(handover 5절 Extension)가 확인한 결함을 그대로 옮기면 다음과 같다.

| # | 결함 | 근거 심볼 |
| --- | --- | --- |
| 1 | `stateLabel()`이 두 곳에 중복 구현 | `src/impactTreeProvider.ts:stateLabel`, `src/graphPanel.ts` webview 인라인 `stateLabel` |
| 2 | provider 부재 메시지 중복, doctor로 이어지는 경로 없음 | `src/controller.ts:analyze`의 `unavailableMessage`, `src/impactTreeProvider.ts:setResult`의 기본 `status` |
| 3 | "caller 없음 / provider 없음 / 부분 결과"가 문구로 구분되지 않음 | 아래 "세 empty state" 절 |
| 4 | `semantic`을 노출하는 지점이 graph state pill `title` 하나뿐 | `src/graphPanel.ts` `state.title` |
| 5 | CodeLens가 provider·범위 상태를 전혀 표시하지 않음 | `src/codeLensProvider.ts:provideCodeLenses` |
| 6 | `GraphPayload`가 coverage를 문자열 3개로 평탄화 | `src/graphPanel.ts:GraphPayload.coverage` |
| 7 | `.state.partial` CSS 규칙 없음 | `src/graphPanel.ts` `<style>` |
| 8 | `contributes.configuration`에 provider 관련 항목 0개 | `package.json` |

가장 위험한 것은 3번이다. 지금 caller 0건이면 Explorer 트리에 root 하나만 남고 **아무 설명도 없다.**
StatusBar는 `0 affected`라고 적는데 이것은 금지 문구 `no impact`와 사실상 같은 주장이다.

## 범위

### 이 lane이 하는 것 — 표현 계층 한정

`main`에 **이미 존재하는** 상태 어휘(`src/types.ts`의 `TRAVERSAL_STATUSES`, `SEMANTIC_STATUSES`,
`INDEXING_STATUSES`, `PROVIDER_LIFECYCLE_*`)를 UI에 드러내고, truth table 2.3절의 문구를 그대로 쓴다.

### 범위에서 제외

- **`data.completion` 미러링 금지.** W1-C가 CLI에 만드는 중이며 계약이 확정되지 않았다. Extension에
  `completion` 필드를 만들지 않는다. 새 상태는 `계약 문서 → 타입 → 두 구현` 순서로만 반영한다.
- `src/types.ts`, `src/coverage.ts`의 계약 상수 신설·변경 금지 (`il-contract-architect` 소유). 읽기만 한다.
- `cli/**`, `plugins/**`, `docs/development-management/provider-coverage-contract.md` 수정 금지.
- truth table의 `provider-static` / `static-plus-inference` / `static-plus-observation` 어휘는
  **아직 `src/types.ts`에 없다.** 임의로 넣지 않고 현재 `SEMANTIC_STATUSES`(`static-only`, `augmented`)만
  매핑한다.

## 현재 구현 조사 결과

handover 5절은 재조사하지 않고 전제한다. 이 lane이 **추가로** 확인해야 했던 것만 적는다.

### 세 empty state가 Extension에서 실제로 구별되는 방법

지시가 준 CLI 쪽 사실("`entries`가 root로 seed되므로 caller 0건은 `nodes.length === 1` + `edges.length === 0`")이
Extension에서도 성립하는지 확인했다. **성립한다.**

`src/callGraph.ts:traverseIncoming`이 `entries`를 `[{ value: root, depth: 0 }]`로 seed하고,
`src/impactAnalyzer.ts:analyzeItem`이 `nodes[0]`을 root로 쓴다. 따라서 성공 결과의 `nodes`는 비어 있을 수 없다.

| empty state | Extension에서의 판별식 | 근거 |
| --- | --- | --- |
| **provider 없음** | `ImpactResult` 자체가 존재하지 않는다. `ImpactAnalyzer.prepare`가 `undefined`를 반환해 `controller.analyze`가 `tree.setResult(undefined, …)`로 빠진다 | `src/impactAnalyzer.ts:prepare`는 `items?.[0]`을 반환하고, 실패 시 `analyzeItem`이 호출되지 않는다 |
| **caller 없음** | `result.nodes.length === 1 && result.edges.length === 0 && !result.truncated` | 위 seed 규칙 |
| **부분 결과** | `result.truncated === true`(= `traversalLimits`가 비어 있지 않다) 또는 `coverage.traversal.status !== 'complete'` 또는 `analysisState === 'partial' \| 'failed'` | `src/controller.ts:applyLiveMetadata`가 `analysisState = result.truncated ? 'partial' : 'current'`로 설정한다 |

**중요한 한계 하나.** VS Code API에는 "이 언어에 Call Hierarchy provider가 등록돼 있는가"를 조회하는
프로그래밍 인터페이스가 없다(`editorHasCallHierarchyProvider`는 when-clause context key 전용이다).
그래서 Extension은 truth table **F1(provider 없음)과 F19(위치에 callable symbol 없음)를 구분할 수 없다.**
문구를 하나로 지어내지 않고, 두 가능성을 모두 적고 doctor로 넘긴다. 아래 "문구 매핑"의 `no-provider` 행이다.

### `analysisState = 'partial'`은 실제로 도달 가능하다

`src/controller.ts:applyLiveMetadata`와 `clearLiveChanges`가 `truncated`일 때 `'partial'`을 설정한다.
`applyLiveMetadata`는 모든 성공 분석 경로에서 호출된다. 즉 `.state.partial` CSS 부재는 이론적 결함이 아니라
**실제로 보이는 결함**이다. `partial`은 `.state`의 기본 회색으로 렌더되어 `current`와 구별되지 않는다.

### `src/impactAnalyzer.ts:analyzeItem`은 `analysisState: 'current'`를 무조건 넣는다

`truncated`여도 `'current'`다. 실제 화면에서 `'partial'`로 바뀌는 것은 controller가
`applyLiveMetadata`를 부른 뒤다. 표현 계층은 `analysisState` 하나만 믿으면 안 되고 `coverage`·`truncated`를
함께 봐야 한다. `stateBadge()`가 그 역할을 한다.

### 테스트 실행 환경 제약

`npm test`는 `tsc -p ./ && node --test out/test/*.test.js`다. `vscode` 모듈은 런타임에 존재하지 않는다.
기존 테스트가 `../types`를 import 할 수 있는 이유는 `types.ts`가 `vscode`를 **타입 위치에서만** 쓰고 tsc가
그 import를 제거하기 때문이다. 따라서 새 모듈은 **런타임에 `vscode`를 쓰지 않아야** 단위 테스트가 가능하다.
`src/completeness.ts`와 `src/providerDoctor.ts`는 평문 데이터만 받는 순수 모듈로 만들고, vscode 배관은
`controller.ts`에 남긴다.

## 문구 매핑 — truth table → Extension

truth table 2.3절 문구를 **그대로** 쓴다. 아래 표에서 "변형"이 적힌 행만 예외이며 이유를 함께 적는다.

| 상태 | Extension 판별식 | truth table | 변형 |
| --- | --- | --- | --- |
| caller 1건 이상 | `callerCount > 0`, 경계 없음, `indexing != working` | S1 | 없음 |
| caller 0건 + index 근거 있음 | `callerCount === 0`, `indexing === 'ready'` | S2 | 없음 (오늘 도달 불가. W2-A가 `indexing`을 실측하면 자동으로 켜진다) |
| caller 0건 + index 근거 없음 | `callerCount === 0`, `indexing === 'unknown'` | S3 | 없음. **오늘 Extension의 기본 caller-0 경로다** (`src/coverage.ts`가 `indexing.status`를 `'unknown'` 고정) |
| depth limit | `traversalLimits`에 `depth`만 | S4 | 없음 |
| node limit | `traversalLimits`에 `nodes`만 | S5 | 없음 |
| depth+node | 둘 다 | S6 | 없음 |
| 준비 중 + 부분 결과 | `indexing === 'working'`, `callerCount > 0` | S7 | 없음 |
| 준비 중 + 0건 | `indexing === 'working'`, `callerCount === 0` | S8 | 없음. X11에 따라 `no_incoming_callers` 계열 문구를 쓰지 않는다 |
| timeout | `coverage.traversal.status === 'timeout'` | S9 | **변형**: `{timeoutMs}`를 Extension이 갖고 있지 않다. 숫자 없는 문장으로 쓴다 |
| 탐색 중 실패 | `coverage.traversal.status === 'failed'` | S11 | 없음 |
| provider 없음 | `ImpactResult` 부재 | F1 + F19 | **변형**: 두 행을 하나로 합친다. VS Code API로 구분 불가(위 조사 결과). 두 가능성을 모두 적고 doctor를 action으로 준다 |

Extension에만 있는 상태 3개(truth table에 대응 행이 없다. live 편집 세션은 CLI에 없는 개념이다).

| 상태 | 문구 | severity |
| --- | --- | --- |
| `analyzing` | `Analyzing…` | info |
| `stale` | `The graph is stale after unsaved edits and will update after you pause typing.` | warning |
| `failed`(이전 그래프 유지) | `The last analysis attempt failed. The previous graph is retained and is not current.` | error |

### 금지 문구

`no impact`, `safe to change`, `unused`, `fully analyzed`, `complete analysis`, `all callers`와 한국어
등가 표현을 어떤 상태에서도 생성하지 않는다. `complete: true`만으로 "영향 없음"이나 "indexing 완료"를
주장하지 않는다.

**기존 문구 중 하나가 이미 이 규칙에 걸린다.** StatusBar의 `${potential} affected`는 caller 0건에서
`0 affected`가 되고 이것은 `no impact`와 같은 주장이다. `no callers returned`로 바꾼다.

## 헤더 재구성 — 결과 수 → traversal → semantic scope → action

graph 헤더 summary와 tooltip 계열이 공통으로 쓰는 segment 순서를 고정한다.

1. **결과 수**: `12 callers` / `no callers returned`
2. **traversal**: `traversal complete · depth 3/5 · node budget 120` (값은 `coverage.traversal.status` 원문)
3. **semantic scope**: `semantic scope: static call hierarchy only`
4. **action**: 해당 상태의 action 문자열. 없으면 생략

`traversal complete`의 `complete`는 `coverage.traversal.status`의 계약 값이다. 앞에 `traversal`을 붙이고
바로 뒤에 semantic scope를 두는 것이 "runtime 완전성이 아니다"를 문구만으로 전달하는 방법이다. 단독
`Complete`는 쓰지 않는다.

## 어느 UI 지점에 무엇을 넣고 무엇을 뺐는가

M1 위험 대응 "기본 UI는 간결한 상태, 상세 정보는 tooltip/JSON으로 제공한다"를 배치 규칙으로 쓴다.
**high severity(= `error`)만 기본 노출**하고 나머지는 tooltip으로 내린다.

| 지점 | 넣는 것 | 빼는 것 | 근거 |
| --- | --- | --- | --- |
| Explorer root description | state badge + note/location | coverage 상세 | 한 줄이고 폭이 좁다 |
| Explorer root tooltip | provider, language, traversal, **semantic**, indexing, headline, action, reason code 전체 | — | 상세는 tooltip이라는 규칙의 1차 착지점 |
| Explorer 알림 항목(root의 첫 자식) | severity가 `info`가 아니거나 caller 0건일 때만 headline 1줄 | 정상(S1) 상태에서는 항목 자체를 만들지 않는다 | high severity 우선 노출 |
| Explorer empty(결과 없음) | provider 없음 문구 + doctor 실행 command | — | 결함 2·3 |
| StatusBar text | caller 수, `partial` 접미사, severity 아이콘 | provider 이름, semantic | 가장 좁은 표면 |
| StatusBar tooltip | 기존 항목 + **semantic scope** + index state + headline + action | reason code 전체 | reason은 Explorer tooltip과 graph pill title에 있다. 세 곳에 같은 목록을 쏟지 않는다 |
| Graph header summary | 결과 수 → traversal → semantic scope → action | provider 이름 | provider는 pill title에 유지 |
| Graph state pill | badge label + `.state.partial` 포함 상태 class | — | 결함 7 |
| Graph pill title | provider host/name, selectedBy, lifecycle, advertised/observed, reason 전체 | — | 결함 6의 착지점 |
| CodeLens title | 변경 없음 | coverage 일체 | 파일 전체에 반복 렌더되는 가장 ambient한 표면. 여기에 상태를 넣으면 "간결한 기본 UI" 규칙이 깨진다 |
| CodeLens tooltip | 정적 범위 한 문장 | 결과 의존 상태 | CodeLensProvider는 분석 결과에 접근하지 않는다. 결과에 의존하지 않는 **항상 참인 경계**만 넣는다 (severity `info` 규칙) |

## provider 설정 항목과 doctor 명령

### 추가하는 것

| id | 종류 | 기본값 | 목적 |
| --- | --- | --- | --- |
| `impactLens.provider.detailLevel` | enum `summary` / `verbose` | `summary` | 기본 UI에 coverage 상세를 얼마나 올릴지. M1 위험 대응 "indexing unknown 경고가 과도할 수 있다"의 조절 손잡이 |
| `impactLens.provider.doctorCommandLine` | string | `""` | `Impact Lens: Run Provider Doctor`가 **터미널에서 실행할지 물어볼** 전체 명령줄. 비우면 host 측 점검만 한다 |
| `impactLens.runProviderDoctor` | command | — | doctor 실행 |

`enumDescriptions` 패턴은 `impactLens.defaultNoteStorage`를 따른다.

### W1-B와 충돌하지 않게 하는 방법

- `doctorCommandLine`은 **전체 명령줄 문자열**이다. Extension은 preset id를 조립하지 않고
  `doctor <preset>`이라는 서브커맨드 형태를 가정하지 않는다. W1-B가 preset id 체계를 바꿔도 영향이 없다.
- Extension은 그 명령의 **출력을 파싱하지 않는다.** VS Code 터미널에 그대로 띄우고 사람이 읽는다.
  CLI doctor의 JSON 형태에 결합하지 않는다.
- `ProviderOverride`(D9)의 `presetId` / `command` / `args` / `languageId`에 대응하는 설정 항목은
  **일부러 만들지 않았다.** Extension은 Language Server를 실행하지 않으므로 그 값들이 아무 동작도 하지
  않는다. 동작하지 않는 설정을 노출하는 것은 "command·args·languageId를 UI 기본 경로에서 요구하지 않는다"
  원칙에도 어긋난다. → **W1-B 확정 후 조정 필요**: Extension이 CLI 분석 경로를 갖게 되는 시점(M1 이후)에
  `ProviderOverride` 필드명을 그대로 쓰는 설정 항목을 추가한다.
- host 측 check의 상태 어휘는 `pass` / `warn` / `fail`을 쓴다. W1-B가 CLI check에 도입 중인 어휘와 같은
  단어지만, 이것은 **출력 형태 결합이 아니라 어휘 일치**다. → **W1-B 확정 후 조정 필요**: 세 값이 아니게
  되면 Extension 쪽도 맞춘다.

### 자동 실행 금지

doctor는 command 실행으로만 동작한다. 설정된 명령줄은 사용자가 quick pick에서 명시적으로 고를 때만
터미널로 보낸다. build·configure·sync를 승인 없이 실행하는 경로를 만들지 않는다 (M1 종료 gate).

## 단계별 구현 계획

각 단계는 독립적으로 `npm test` + `npm run compile`을 통과하고 단독 commit·push 가능하다.

### 1단계 — 작업 문서 (이 문서)

### 2단계 — `src/completeness.ts` 신설과 `stateLabel` 중복 제거

- `analysisStateLabel`, `stateBadge`, `summarizeCompleteness`, `headerSegments`, `semanticScopeLabel`,
  `indexingLabel`을 순수 함수로 구현한다. 런타임 `vscode` 의존 없음.
- `src/impactTreeProvider.ts`와 `src/graphPanel.ts`의 `stateLabel` 두 벌을 제거하고 이 모듈로 대체한다.
  webview는 label을 payload로 받는다(인라인 함수 자체를 없앤다).
- 테스트: `src/test/completeness.test.ts`(세 empty state 구분 포함),
  `src/test/forbiddenPhrases.test.ts`.

### 3단계 — provider 설정 항목과 doctor 명령

- `src/providerDoctor.ts`(순수 포맷터) + `controller.ts` 배관 + `package.json` 기여 항목.
- 테스트: `src/test/providerDoctor.test.ts`.

### 4단계 — Explorer / StatusBar / CodeLens 재구성

- provider 부재 메시지 단일화(`src/completeness.ts`) + Explorer empty 항목에서 doctor로 연결.
- Explorer 알림 항목, root tooltip에 semantic 추가, StatusBar text·tooltip 개편, CodeLens tooltip.

### 5단계 — Graph payload 확장, header 재구성, `.state.partial`

- `GraphPayload`에 coverage 전체(advertised/observed/lifecycle/reasons) + completeness 요약을 싣는다.
- header를 결과 수 → traversal → semantic scope → action 순으로 다시 만든다.
- `.state.partial` CSS 규칙 추가.

### 6단계 — 최종 검증과 문서 정리

- `npm test`, `npm run compile`, `npm run cli:test`.
- 중복 제거를 grep 결과로 증명한다.
- 자동 테스트로 덮이지 않은 항목(실제 VS Code 렌더링)을 미확인으로 명시한다.

## 테스트 및 완료 기준

- [x] `npm test` 통과 — **55 pass / 0 fail** (기준선 35 + 신규 20)
- [x] `npm run compile` 통과
- [x] `npm run cli:test` 통과 — **63 pass / 0 fail**. `cli/**` diff 0건
- [x] 세 empty state가 각각 다른 문구를 만들고, 테스트가 셋의 상호 구별을 증명한다
      (`src/test/completeness.test.ts`의 `tells the three empty states apart by wording alone`)
- [x] 금지 문구 검사 테스트가 존재하고 통과한다 (생성 문자열 매트릭스 720건 + 소스 스캔)
- [x] `stateLabel` 중복과 provider 부재 메시지 중복이 grep으로 0건임을 보인다
- [x] 실제 VS Code 렌더링 확인 불가 항목을 작업 로그에 명시한다 (아래 "확인하지 못한 것")

### 검증 명령과 결과

| 명령 | 결과 |
| --- | --- |
| `npm test` | 55 pass / 0 fail |
| `npm run compile` | 성공 (출력 없음) |
| `npm run cli:test` | 63 pass / 0 fail |
| `npm run test:plugin-artifact` | **실행하지 않았다.** 네트워크가 필요하고(handover 10절) 이 lane은 `cli/**`·`plugins/**`·`scripts/**`를 수정하지 않았다 |

`npm run cli:test`는 **처음에 9건 실패했다.** 원인은 이 lane의 변경이 아니라 새 worktree에
`cli/node_modules`가 없어서 bundled TypeScript artifact를 찾지 못한 것이었다(`git diff origin/main...HEAD -- cli/`가
0건임을 먼저 확인했다). `npm --prefix cli install` 후 63건 전부 통과했다. **worktree 기반 lane은
`npm install`과 `npm --prefix cli install`을 둘 다 해야 한다**는 것이 다음 lane에 유용한 사실이다.

### 확인하지 못한 것 — 성공으로 간주하지 않는다

VS Code UI는 자동 테스트로 덮이지 않는다. 아래는 **코드 수준으로만 확인했고 실제 렌더링을 보지 못했다.**

| 항목 | 확인한 방법 | 확인하지 못한 것 |
| --- | --- | --- |
| `.state.partial`의 실제 색·dashed border | 소스에 규칙이 존재함을 테스트로 검사 | 실제 테마에서 `current`와 시각적으로 구별되는지 |
| Explorer `NoticeItem` 행 | 코드 경로 | 긴 headline이 트리 폭에서 어떻게 잘리는지, 아이콘이 의도대로 나오는지 |
| Explorer empty 항목 클릭 → doctor | command id를 `package.json`과 대조 | 실제 클릭 동작 |
| StatusBar `$(error)` / `$(warning)` 아이콘과 `· partial` 접미사 | 문자열 조립 | 실제 폭에서 잘리는지 |
| doctor OutputChannel 출력과 터미널 실행 확인 대화상자 | 순수 포맷터를 테스트 | 실제 채널·터미널 동작 |
| graph header 재구성 결과와 pill title 줄바꿈 | payload 조립과 소스 텍스트 검사 | webview에서의 실제 배치와 `title` 속성의 개행 처리 |
| MarkdownString tooltip 렌더링 | 문자열 조립 | 실제 markdown 렌더 결과 |

이 항목들은 W3-B의 `user-tests/m1-user-test-spec.md`에서 실제 사용자 검증 대상으로 다뤄야 한다.

### 금지 문구 테스트의 한계

소스 스캔은 `src/test/**`를 제외한다. 검사기 자신이 금지 목록을 문자열로 갖고 있어야 하기 때문이다.
현재 `src/test/graphLayout.test.ts`의 테스트 제목에 `unused`가 한 번 나오지만 테스트 제목은 사용자
표면이 아니다. **사용자에게 도달하는 문자열은 반드시 비-테스트 소스에 있어야 한다**는 것이 이 경계의
근거다.

## 작업 로그

### 2026-08-27 — 1단계: 조사와 계획

- `origin/main` `924da5f`에서 `feat/m1-extension-completeness-ux`를 만들었다.
- handover 5절 Extension 항목을 심볼 이름으로 재확인했다(라인 번호는 이동했으나 결함 8건 모두 그대로 존재).
- 추가 조사로 확인한 것 3가지를 "현재 구현 조사 결과"에 적었다. 특히 **F1과 F19를 Extension에서 구분할 수
  없다**는 사실이 문구 설계를 바꿨다.

### 2026-08-27 — 2단계: `src/completeness.ts`와 `stateLabel` 중복 제거

- 신규 `src/completeness.ts`. 런타임 `vscode` 의존 없음(그래서 `node --test`로 직접 검증된다).
  - `analysisStateLabel` — 다섯 상태의 유일한 철자.
  - `stateBadge` — `analysisState`와 coverage를 대조한다. `src/impactAnalyzer.ts:analyzeItem`이 truncated
    결과에도 `'current'`를 쓰기 때문에 필드만 믿으면 경계 있는 결과가 `Current`로 렌더된다.
    `stateBadge`는 그 경우 `Partial result` + class `partial`을 돌려준다.
  - `summarizeCompleteness` — truth table S1~S9·S11 + Extension 전용 3상태.
  - `noProviderSummary` — F1+F19 합본.
  - `headerSegments` — 결과 수 → traversal → semantic scope → action.
- `src/impactTreeProvider.ts`: 지역 `stateLabel` 삭제, `analysisStateLabel` 사용.
- `src/graphPanel.ts`: webview 인라인 `stateLabel` **함수 자체를 삭제**하고 payload가 `state {label, className}`을
  실어 보낸다. label 계산이 Extension 쪽에서만 일어나므로 두 벌이 다시 생길 자리가 없다.
- 중복 제거 검증:

  ```
  $ grep -rni "statelabel" src/
  src/completeness.ts:93:export function analysisStateLabel(...)   # 유일한 정의
  src/completeness.ts:122,124                                       # 자기 호출
  src/impactTreeProvider.ts:2,62                                    # import + 호출
  src/test/*                                                        # 테스트
  ```

  `graphPanel.ts`에는 한 건도 남지 않았다.
- 신규 테스트 11개. `npm test` 46 pass / 0 fail (기준선 35 + 11).
- 설계 결정 하나: `traversalLabel`에 "limits가 있는데 status가 complete"인 모순을 방어하는 코드를 넣지
  **않았다.** `src/coverage.ts:vscodeCoverage`가 두 값을 같은 `limits` 배열에서 파생시키므로 producer가
  만들 수 없는 상태다. 방어 코드를 넣으면 producer 결함을 표현 계층이 숨기게 된다(truth table X1의 취지).
  대신 그 사실을 테스트 주석으로 고정했다.

### 2026-08-27 — 3단계: provider 설정 항목과 doctor 명령

- 신규 `src/providerDoctor.ts`(순수, 런타임 `vscode` 의존 없음)와 `src/test/providerDoctor.test.ts`.
- check 5개: `language`, `documentSymbols`, `callHierarchy`, `coverage`, `agentCli`. 상태는 `pass`/`warn`/`fail`.
- **`documentSymbols` check가 실제 진단 가치를 만든다.** VS Code는 "이 언어에 Call Hierarchy provider가
  있는가"를 묻는 API를 주지 않지만, document symbol provider가 응답하는지는 물을 수 있다. 둘 다 실패하면
  "언어 확장 자체가 없다"(fail), symbol만 성공하면 "위치 문제이거나 그 확장이 Call Hierarchy를 구현하지
  않는다"(warn)로 갈린다. **어느 쪽인지 단정하지 않는다** — 단정하면 그것은 추측이다.
- `package.json` 기여 항목:
  - command `impactLens.runProviderDoctor` (`Impact Lens: Run Provider Doctor`), `activationEvents`에 추가.
  - `impactLens.provider.detailLevel` (`summary` | `verbose`, 기본 `summary`).
  - `impactLens.provider.doctorCommandLine` (string, 기본 `""`).
  - `enumDescriptions` 형식은 `impactLens.defaultNoteStorage`를 그대로 따랐다.
- `controller.runProviderDoctor()`는 report를 전용 OutputChannel에 쓰고, `doctorCommandLine`이 설정돼 있을
  때만 "Run in terminal" 선택지를 **한 번 더 물어본 뒤** 터미널로 보낸다. 출력을 읽지 않는다.
  자동 실행 경로는 없다.
- view/title 메뉴에는 넣지 않았다. Explorer 아이콘이 이미 3개이고, "provider 없음" 진입점은 4단계의
  empty state 항목이 command로 직접 연결한다.
- `npm test` 52 pass / 0 fail.

### 2026-08-27 — 4단계: Explorer / StatusBar / CodeLens 재구성

- **provider 부재 메시지 단일화.** `src/controller.ts`의 하드코딩 문자열과 `src/impactTreeProvider.ts`의
  기본 `status` 문자열을 모두 제거하고 `noProviderSummary(languageId)` 하나로 모았다.

  ```
  $ grep -rn "No Call Hierarchy root was returned" src/
  (0건)
  ```

  알림에는 `Run Provider Doctor` 버튼이 붙고, Explorer empty 항목은 클릭하면 같은 command로 간다.
  이전에는 "확인하라"로 끝나고 다음 행동이 없었다.
- **Explorer.** `EmptyItem`이 `{message, action, offerDoctor}`를 받는다. root 자식 맨 앞에 `NoticeItem`을
  넣되 severity가 `info`가 아닐 때만이다. `stale`/`analyzing`은 root description에 이미 같은 말이 있으므로
  제외했다(편집 중 행이 계속 나타났다 사라지는 것을 막는다). root description은 `analysisState` 원본이
  아니라 `stateBadge()`를 쓴다.
- **root tooltip에 semantic scope와 reason 전체를 넣었다.** 결함 4의 주된 착지점이다.
- **StatusBar.** text에서 `${potential} affected`를 `resultCountLabel()`로 바꿨다. caller 0건이면
  `no callers returned`다. severity에 따라 아이콘이 `$(references)`/`$(warning)`/`$(error)`로 갈리고,
  경계가 있으면 `· partial`이 붙는다. tooltip은 MarkdownString으로 headline → action → 사실 목록
  (direct/test/traversal/semantic/index/provider) 순이다.
- **CodeLens.** title은 그대로 두고 tooltip에만 `STATIC_SCOPE_NOTICE`를 더했다. CodeLens는 파일의 모든
  함수마다 렌더되고 `ImpactCodeLensProvider`는 분석 결과를 아예 보지 못한다. 결과 의존 상태를 넣을 수도
  없고 넣어서도 안 되는 표면이므로, **항상 참인 경계 한 문장**만 넣었다.
- **금지 문구 테스트가 실제로 작동함을 확인했다.** 4단계 중 StatusBar 주석에 `no impact`라는 표현을 썼다가
  소스 스캔 테스트에서 걸렸다. 주석까지 스캔하는 것이 과하지 않다는 증거다 — 스캐너는 주석과 문자열을
  구분할 수 없고, 문구가 소스에 존재하면 복사되어 UI로 나갈 수 있다.
- `npm test` 52 pass / 0 fail.

### 2026-08-27 — 5단계: Graph payload 확장, header 재구성, `.state.partial`

- `GraphPayload.coverage`가 문자열 3개에서 **`ImpactCoverage` 전체**로 바뀌었다(`coverage: result.coverage`).
  `provider`도 `advertised` / `observed` / `lifecycle` / `selectedBy` / `languageMatch` / `version`을 모두
  싣는다. state pill `title`이 이것들을 전부 보여준다.
- `completeness` 블록(headline/action/severity/segments/providerLabel)을 payload에 추가했다.
  **문구 생성은 Extension 쪽 `src/completeness.ts`에서만 일어난다.** webview는 조립된 문자열을 받는다.
  이렇게 해야 webview에 두 번째 문구 사본이 생기지 않는다.
- header 순서: `결과 수 → (delta·diagnostics) → traversal → semantic scope → (verbose면 provider·lifecycle·reasons) → action`.
  delta와 diagnostics를 결과 수 옆에 둔 이유는 둘 다 "무엇이 돌아왔는가"에 대한 사실이고,
  **traversal과 semantic scope 사이에 끼면 안 되기 때문**이다. 그 둘은 붙어 읽혀야 한다.
- 제거한 문구: `'call hierarchy completed'`. `complete`를 runtime 완전성으로 읽히게 하는 정확히 그 형태다.
  `'N symbols'`도 제거했다(root 포함 수라 caller 수와 혼동된다). `resultCountLabel()`로 대체했다.
- `.state.partial` 규칙을 추가했다(경고색 + dashed border). `.state.failed`에 border 색을 더했다.
- payload에서 `truncated` / `traversalLimits` / `requestedDepth` / `reachedDepth`를 **삭제**했다.
  `coverage.traversal`에 같은 사실이 이미 있었고, 같은 사실의 두 표현이 이 lane이 없애려는 드리프트의
  축소판이기 때문이다. webview는 `graph.coverage.traversal.requestedDepth`를 읽는다.
- 신규 `src/test/graphPanel.test.ts` 3개. webview는 template string이라 import·호출이 불가능하므로
  **소스 텍스트를 읽어 검사한다.** 두 결함 모두 눈에 띄지 않는 종류였기 때문이다 — 규칙 없는 state class는
  기본색으로 렌더돼 "정상"처럼 보이고, label 함수 사본은 둘이 어긋날 때까지 발견되지 않는다.
- `npm test` 55 pass / 0 fail.

### 2026-08-27 — 6단계: 최종 검증

- 실패 경로 하나를 마저 정리했다. `analyze()`의 catch에서 StatusBar를 직접 `$(warning) Impact Lens` +
  raw message로 덮어쓰던 코드를, 이전 그래프가 남아 있으면 `updateStatus()`를 태우고 raw message를
  tooltip 마지막 블록으로 덧붙이도록 바꿨다. 상태 어휘가 한 곳에서만 만들어진다.
- 전체 검증 결과는 위 "검증 명령과 결과" 표에 있다.

## 지시에 대한 반박·이견

지시가 틀렸다고 판단한 것은 없다. 다만 지시의 전제 하나를 **좁혀서** 구현했고 근거를 남긴다.

- 지시는 "`semantic`을 Explorer 툴팁·StatusBar 툴팁·CodeLens에 노출"을 요구했다. CodeLens에는 넣지
  않았다. `ImpactCodeLensProvider`는 `NoteStore`만 갖고 있고 `ImpactResult`에 접근할 수 없어서
  **결과별 semantic 값을 알 수 없다.** 접근하게 만들려면 controller와의 결합을 새로 만들어야 하고, 그것은
  파일마다 모든 함수에 렌더되는 표면에 결과 의존 상태를 넣는 일이라 "기본 UI는 간결하게"와 정면으로
  충돌한다. 대신 결과와 무관하게 항상 참인 정적 범위 문장(`STATIC_SCOPE_NOTICE`)을 tooltip에 넣었다.
  지시 자체가 "모든 지점에 전부 쏟아붓지 마라"고 했고, 이것이 그 판단의 적용이다.

## W1-B 확정 후 조정이 필요한 항목

| # | 항목 | 지금 상태 | 조정 조건 |
| --- | --- | --- | --- |
| 1 | host 측 check 상태 어휘 `pass`/`warn`/`fail` | 세 값 고정 | W1-B가 CLI check 상태를 다른 집합으로 확정하면 맞춘다 |
| 2 | `ProviderOverride`(D9) 대응 설정 항목 | **만들지 않았다** | Extension이 CLI 분석 경로를 갖는 시점(M1 이후)에 `presetId`/`command`/`args`/`languageId` 이름 그대로 추가 |
| 3 | `impactLens.provider.doctorCommandLine` | 전체 명령줄 문자열 | W1-B가 preset id를 확정해도 변경 불필요. Extension이 preset id를 조립하는 순간 이 판단이 깨지므로 그때 재검토 |
| 4 | semantic 어휘 `provider-static` / `static-plus-inference` / `static-plus-observation` | 매핑하지 않음 | W1-C가 `src/types.ts:SEMANTIC_STATUSES`를 넓히면 `semanticScopeLabel()`에 행을 추가한다 |
| 5 | `data.completion` | **미러링하지 않음** | W1-C merge 후 별도 후속 lane |
