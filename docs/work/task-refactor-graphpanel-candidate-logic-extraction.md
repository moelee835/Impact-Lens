# Candidate-caller 렌더링 순수 로직을 `getHtml()` 밖으로 (branch `refactor/graphpanel-candidate-logic-extraction`)

**절차상 벗어난 점을 먼저 밝힌다**: AGENTS.md §2는 코드 변경 전에 이 문서를 먼저 쓰라고 한다. 이번엔
commander의 요구사항 4개를 확인·구현하며 거의 동시에 이 문서를 쓰기 시작했다 — 순서를 어겼다.
남은 절차(단계별 커밋, 검증, 완료 기준)는 그대로 따른다.

## 목적과 사용자 가치

**이건 리팩터링이 아니라, 이 저장소에 UI 로직을 실행으로 검증할 방법을 처음 만드는 작업이다.**

**사용자 문제**: gate 2(JSON·UI에서 확정/추론 구분)를 닫을 때 "실제 webview 렌더·marker 시각
구별·라벨 겹침·실행 기반 off/on 비교는 미검증"을 명시적으로 안고 닫았다. 그 이유는
`src/graphPanel.ts`의 `getHtml()`이 반환하는 거대한 템플릿 문자열 **안에** candidate-caller
렌더링 로직(`resolveCandidateEdgeEndpoints`/`resolveSyntheticNode`)이 리터럴 텍스트로만 존재해서다
— reviewer가 `target-synthetic` 분기(target이 synthetic인 경우, 지금 어댑터는 안 내지만 타입상
가능한 경로)를 확인하려면 그 텍스트를 `eval`로 꺼내 돌려야 했고, 그 방법은 템플릿 문자열의 정확한
서식에 묶인 취약한 확인이지 재실행 가능한 테스트가 아니다.

**사용자에게 무슨 뜻이냐면**: 지금 candidate 후보 호출자가 그래프에 잘못 그려져도(예: 엉뚱한 depth에
붙는다, 같은 synthetic node가 중복 생성된다) CI가 자동으로 잡지 못한다. 이번 작업이 그 경로에 처음
실행 가능한 단위 테스트를 단다.

**상위 목표와의 관계**: `docs/work/task-m4-gate2-shared-adapter.md`가 "Backlog — target-synthetic
분기, 테스트 없음"으로 이미 기록해 둔, 이 저장소 스스로가 정의한 선행 조건이다. IL-LIM-001 3단계
(제한된 callback/event 추론, 두 번째 adapter)가 이 UI 경로를 다시 거쳐 갈 것이므로, 그 전에 검증
가능한 형태로 만들어 둔다.

**왜 지금**: IL-LIM-010 1단계(PR #91) 직후 commander가 배정한 다음 lane.

## 배경과 범위

**대상**: `src/graphPanel.ts` 862~893행 부근(구 line 번호, 실제로는 텍스트로 식별)의
`resolveCandidateEdgeEndpoints`/`resolveSyntheticNode`/`CANDIDATE_LABEL_TEXT` — 전부 순수 함수/상수,
DOM을 건드리지 않는다.

**포함**:
- 위 로직을 `src/candidateGraphResolution.ts`(신규, 순수 TypeScript, `vscode` import 없음)로 옮긴다.
- 두 함수/상수를 `getHtml()`이 이미 `calculateGraphLayout`/`calculateFitZoom`/
  `calculateViewportSurface`/`shouldRestoreViewport`(`src/graphLayout.ts`)에 쓰는 것과 **똑같은 방식**
  (`${fn.toString()}`을 같은 nonce `<script>` 블록 안에 인라인)으로 다시 붙인다.
- `target-synthetic` 분기를 포함해 `node --test`로 직접 고정하는 단위 테스트.
- 옮기기 전후 `getHtml()` 실제 출력이 (nonce 제외) 동일함을 실행으로 증명.

**제외**: 렌더 경로(edge/노드를 실제로 그리는 루프, CSS, 이벤트 리스너) 자체는 손대지 않는다 —
gate 2가 `graphPanel.ts` 변경을 작게 유지했던 이유(확정 edge classing, `.edge-test` 극성 정규식이
그 경로에 걸려 있음)가 그대로 유효하다.

## 조사 결과 — commander가 예상한 위험은 이미 이 파일에서 해소되어 있었다

commander는 "지금 `getHtml()`이 문자열로 인라인하니 로딩 문제가 없었다. 모듈로 분리하면 vsix에
실려야 하고 CSP를 통과해야 한다"고 우려했다 — **모듈로 분리하되 별도 `<script src="...">`로 Webview에
새로 로드하는 설계라면 맞는 우려다.** 하지만 이 파일은 이미 그 문제를 안 만드는 메커니즘을 4개
함수(`calculateGraphLayout` 등, `src/graphLayout.ts`)로 실증하고 있었다 `[읽음]`, `src/graphPanel.ts`
370행 부근: `const calculateGraphLayout = ${calculateGraphLayout.toString()};` — 컴파일된 함수 소스를
**같은, 이미 CSP를 통과한 nonce `<script>` 블록 안에 텍스트로 인라인**한다. Webview는 별도 리소스를
전혀 요청하지 않는다 — Extension Host 쪽(Node.js 컨텍스트)에서 `.toString()`으로 함수 본문을 문자열로
뽑아 HTML 문자열에 끼워 넣을 뿐이다. 그래서:
- **새 CSP 허용이 필요 없다** — `<script src>`를 추가하는 게 아니다.
- **vsix에는 그냥 평범한 Extension 쪽 컴파일 산출물**(`out/candidateGraphResolution.js`)로 실린다 —
  `.vscodeignore`가 `out/**`를 특별 취급하지 않으므로(제외되는 건 `out/test/**`뿐) 자동으로 포함된다.
  `test:vsix-contents`의 "out/**/*.js count floor" 양성 검사가 이미 이걸 잡는다(아래 검증 참고).

그래서 이번 lane의 실제 위험은 "새 로딩 경로를 만드는 것"이 아니라 **"기존에 이미 검증된 메커니즘을
정확히 재현하는 것"**으로 좁아졌다 — commander의 우려 자체는 유효한 일반론이지만, 이 파일이 이미
그 우려를 해소하는 선례를 갖고 있었다.

## 단계별 구현 (하나의 독립 commit)

- **목적**: candidate-caller 로직을 실행 가능한 형태로 옮기면서 렌더 출력은 그대로 유지한다.
- **산출물**:
  1. `src/candidateGraphResolution.ts`(신규) — `CANDIDATE_LABEL_TEXT`,
     `resolveCandidateEdgeEndpoints()`, `resolveSyntheticNode()`. 순도 제약(어떤 클로저도 없이
     자기 매개변수만으로 완결)을 파일 맨 위에 명시.
  2. `src/graphPanel.ts` — 위 세 개를 import하고, `calculateGraphLayout` 등을 embed하는 바로 옆에
     같은 방식으로 embed. 옛 리터럴 정의(하단, `render()` 직전)는 제거.
  3. `src/test/candidateGraphResolution.test.ts`(신규) — 9개 테스트: existing/existing,
     existing 누락(source·target 각각), synthetic source(현재 adapter가 실제로 내는 모양),
     **synthetic target(target-synthetic 분기, 이번에 처음 고정)**, 양쪽 다 synthetic(anchor 없음,
     전체 스킵), anchor 없이 `resolveSyntheticNode` 직접 호출, 같은 키 재사용, 다른 column은
     별개 키로 구분.
  4. `src/test/graphPanelAugmentedEdges.test.ts` 갱신 — `CANDIDATE_LABEL_TEXT` 비교를 진짜 import로
     교체(더 이상 `graphPanel.ts` 소스 텍스트에서 정규식으로 뽑지 않는다 — 그 값 자체가 이제 진짜
     모듈에 있다), `getHtml()`이 import를 실제로 embed하는지 확인하는 구조 테스트 추가.

## 검증

**non-vacuity(뮤테이션)** `[실행]`:
- `resolveSyntheticNode`의 `depth: anchor.depth + 1`을 `+ 2`로 바꿔 재실행 → depth를 확인하는 테스트
  정확히 1개만 실패, 나머지 81개 그대로 통과. 원복 후 82개 전부 재통과.
- synthetic 키 계산에서 `column`을 빼서 재실행 → "다른 column은 별개로 구분" 테스트 정확히 1개만
  실패. 원복 후 재통과.

**동작 무변경(getHtml() 출력 diff)** `[실행]`: OLD(`git show HEAD:src/graphPanel.ts`)와
NEW(이 branch) 버전을 각각 `getHtml`/`toPayload`를 export하도록 임시로 수정한 사본으로 따로
컴파일하고, `vscode` 모듈을 최소 stub(Proxy 대신 실제 호출부만 맞춘 stub — `workspace.
getConfiguration().get()`, `workspace.asRelativePath()`)으로 대체해 같은 `ImpactResult` 픽스처(root
1개, direct caller 1개, augmentedEdge 1개 — synthetic source·existing target 모양, 오늘 실제
adapter가 내는 모양)로 두 버전의 `getHtml()`을 직접 호출·diff했다. **결과: nonce(호출마다 무작위,
무관)와 로직이 옮겨간 자리(문법만 `var`→`const`/함수 선언→함수 표현식으로 바뀜, 조건·리턴값
전부 동일) 외에는 43568바이트(OLD) vs 42315바이트(NEW) 중 단 한 글자도 다르지 않다.** 스크립트와
산출물은 `/tmp`(세션 scratchpad)에 있었고 검증 후 삭제했다 — 재현하려면 이 문서의 방법을 그대로
따르면 된다(임시 export 추가 → `vscode` stub → 같은 픽스처로 두 버전 호출 → diff).

**전체 테스트** `[실행]`, `rm -rf out cli/dist` 후:
- `npm test`(Extension): 82 tests, 82 pass(이전 73 + 신규 9).
- `npm run cli:test`: 407 pass, 0 fail, 3 skip(무관, IL-LIM-010 lane과 동일).
- `npm run test:vsix-contents`: 통과 — vsix 파일 수 36 → 37(신규 `out/candidateGraphResolution.js`
  1개 늘어남), `cli/dist/shared/**` 5개 그대로(이 lane은 CLI를 안 건드림), require-boundary 위반 없음.

## 완료 기준 대조

- [x] 순수 로직만 옮기고 렌더 경로는 안 건드림 — `git diff`로 렌더 루프(edge/노드 그리기, CSS,
  이벤트 리스너)에 변경 없음을 확인.
- [x] 옮긴 모듈의 webview 도달 방식이 새 위험을 안 만듦 — 기존 `.toString()`-embed 메커니즘 재사용,
  `test:vsix-contents`로 실행 확인.
- [x] `target-synthetic` 분기를 `node --test`로 직접 고정 — 위 9개 테스트 중 하나.
- [x] 동작 무변경을 실행으로 증명 — 위 getHtml() diff.

## 2026-09-09 추가 — commander가 찾은 구멍: import 기반 테스트로는 못 잡는 결함 하나

**결함**: `.toString()`은 함수 자신의 소스 텍스트만 옮기고 모듈 스코프는 안 따라간다.
`candidateGraphResolution.ts`에 이제 헬퍼 상수/함수를 하나 추가해 `resolveSyntheticNode`가 그걸
부르게 만드는 건(모듈이니까) 아주 자연스러운 다음 수정인데, 그러면 그 식별자는 `graphPanel.ts`의
주입 3줄에 없으니 **실제 Webview에서 `ReferenceError`로 조용히 죽는다.** 그런데 9개 테스트는 전부
`import`로 이 모듈을 가져오므로 모듈 스코프가 살아 있어 **이 결함을 원리적으로 못 잡는다** — 이
lane의 목적("실행으로 검증 못 하던 걸 검증 가능하게 만든다")이 정확히 못 미치는 지점이었다.
commander가 직접 `.toString()` 텍스트를 뽑아 주입 스코프만 있는 `new Function`으로 재구성해
module 형태와 3가지 shape(source-synthetic/target-synthetic/both-synthetic) 전부 일치함을 확인해
찾았다.

**고침**: 두 테스트 추가.
1. `graphPanel.ts`가 정확히 `CANDIDATE_LABEL_TEXT`/`resolveCandidateEdgeEndpoints`/
   `resolveSyntheticNode` 순서로 주입하는지 구조로 고정(주입 형태가 바뀌면 아래 샌드박스 재구성이
   실제 주입과 어긋난다는 걸 알리기 위해).
2. 그 정확히 세 줄로 `new Function`을 만들어(모듈 스코프에 접근 불가 — Webview `<script>`와
   동일 조건) 세 가지 shape 전부에서 import한 실제 함수와 같은 결과를 내는지 대조.

**non-vacuity(뮤테이션)** `[실행]`: `candidateGraphResolution.ts`에 실제로 새 모듈-스코프 상수
(`SYNTHETIC_ID_PREFIX`)를 추가하고 `resolveSyntheticNode` 안에서만 참조하도록 바꿔 재실행 →
**새로 추가한 샌드박스 테스트만 실패**(`ReferenceError`), 기존 9개 import 기반 테스트는 전부
그대로 통과 — commander가 지적한 정확히 그 격차(“9개는 초록, webview는 조용히 죽는다”)를 이
테스트가 재현·차단함을 확인했다. 원복 후 84개 전부 재통과.

## 남은 것 / 다음

- `CANDIDATE_LABEL_TEXT`/`resolveCandidateEdgeEndpoints`/`resolveSyntheticNode`는 여전히 실제
  webview(브라우저 DOM)에서 실행 검증된 적이 없다 — 이번 lane이 닫은 건 "순수 로직의 실행 가능한
  단위 테스트"이지 "실제 VS Code에서 렌더된다"가 아니다. vscode-host harness 부재는 gate 2 판정문이
  이미 명시한 그대로, 이번 lane으로도 안 바뀐다.
- 다음 candidate-caller 관련 작업(두 번째 framework adapter, `IL-LIM-001` 3단계)이 실제로
  `target-synthetic` 분기를 발화시키는 첫 사례가 될 수 있다 — 그때 이 테스트가 그 adapter의 실제
  출력과 맞는지 다시 확인해야 한다(오늘은 합성 픽스처로만 확인).
