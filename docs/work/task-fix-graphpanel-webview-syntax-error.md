# Call Graph webview가 세 릴리스 동안 한 번도 렌더링되지 않은 결함 수정

- 상태: 구현 완료, **coder 검토 대기**
- branch: `fix/webview-script-syntax-error`
- 선행: reviewer(이 세션)가 발행된 `v0.9.0` VSIX의 실제 컴파일 코드로 독립 재현·근본 원인 확정.
  commander가 `f0d086f`(2026-08-27, `v0.7.0`/`v0.8.0`/`v0.9.0` 전부 포함)를 도입 커밋으로 확인.
- 요구사항: commander 승인. **자기 수정을 자기가 승인하지 않는 규율에 따라, 이 수정 자체의 검토는
  coder에게 별도로 요청한다** — 이 문서와 커밋은 reviewer가 작성하지만 merge 전 독립 검토가 필요하다.

## 목적과 사용자 가치

- **누가 어떤 문제를 겪고 있는가**: VS Code Extension으로 Impact Lens를 쓰는 모든 사용자. `Show impact`로
  Call Graph 패널을 열면 브라우저(webview)가 우리가 주입한 `<script>` 내용을 파싱하다가 즉시
  `Uncaught SyntaxError`로 죽는다 — 분석 자체(`analyze`)는 성공하지만 그 결과를 보여주는 그래프 화면이
  단 한 번도 그려지지 않는다.
- **작업이 끝나면 무엇이 가능해지는가**: 사용자가 Call Graph 패널을 열면 실제로 그래프가 렌더링된다 —
  M4가 추가한 candidate edge 구분, gate 5의 test 색상 정정 등 이 패널에 쌓인 기능이 처음으로 실제
  화면에 나타난다.
- **상위 목표와의 관계**: `v0.7.0`부터 `v0.9.0`까지 세 릴리스의 간판 기능(Call Graph 시각화)이 실질적으로
  죽어 있었다. `v0.9.1` 패치 릴리스로 별도 발행 예정(이 작업 문서의 범위 밖 — commander가 진행).
- **왜 지금인가**: 발행된 제품의 활성 결함이고, 원인이 이미 확정돼 재작업 위험이 낮다. 미루면 다음
  사용자도 같은 화면을 본다.

## 배경과 해결할 문제

`src/graphPanel.ts`의 `getHtml()`은 webview에 주입할 HTML 전체를 하나의 TypeScript template literal로
만든다. 그 안에는 다시 브라우저 쪽 `<script>` 태그의 JS 소스가 **텍스트로** 들어있다. 두 군데에서
바깥 template literal에 이스케이프 없는 `\n`을 직접 썼다:

- `graphPanel.ts:445` — `(graph.completeness.action ? '\n\n-> ' + graph.completeness.action : '')`
- `graphPanel.ts:467` — `].join('\n');`

바깥 template literal은 `getHtml()`이 **실행되는 시점에** `\n`을 실제 개행 문자(0x0A)로 해석한다. 이
결과 문자열이 다시 **안쪽 브라우저 스크립트의 작은따옴표 문자열 리터럴 내부**에 놓이는데, JS 문자열
리터럴은 이스케이프 없는 raw 개행을 담을 수 없다 — 그래서 브라우저가 이 `<script>`를 **파싱하는
시점에**(값이 무엇이든, 삼항연산자의 어느 branch가 실행되든 상관없이) 무조건 `SyntaxError`가 난다.
파서는 토큰화 단계에서 이미 실패하므로 스크립트 전체가 실행되지 않는다.

reviewer가 발행된 `v0.9.0` VSIX의 실제 컴파일 코드(`out/graphPanel.js`)를 격리 환경에서 직접
`require()`하고 `getHtml()`을 다양한 payload(빈 값, `</script>`, backtick, U+2028/U+2029 포함)로
호출해 **전부** 동일한 `SyntaxError`가 남을 확인했다 — 가장 단순한 payload까지 깨진다는 것이 "데이터
문제가 아니라 정적 결함"이라는 결정적 증거였다. `node --check`로 정확한 실패 지점(위 445번째 줄)을
확인했다.

**기존 `graphPanel.test.ts`/`graphPanelAugmentedEdges.test.ts`가 왜 못 잡았는가**: 두 파일 모두 자기
주석에 이유를 이미 적어 두고 있다 — `graphPanel.ts`가 최상단에서 `import * as vscode from 'vscode'`를
하기 때문에 **"nothing in it, including toPayload()/getHtml(), can be required() from a plain node
test"**라고 스스로 명시하고, 그 대신 **소스 텍스트에 대한 정규식 assertion**만 수행한다. 즉 이
결함은 "놓친 것"이 아니라 **이 테스트 스위트가 구조적으로 실행-검증을 할 수 없다고 스스로 기록해 둔
자리**에서 났다 — M4 gate 2가 "candidate edge가 시각적으로 구분된다"를 닫을 때 쓴 근거(소스 구조
assertion과 뮤테이션)도 같은 한계를 물려받는다: **소스에 대한 증거였지, 사용자가 실제로 보는 것에
대한 증거가 아니었다.**

## 범위와 범위에서 제외할 항목

**포함**:
1. `getHtml()`의 출력에서 `<script>` 내용을 뽑아 실제로 파싱 가능한지 검사하는 테스트를 **먼저**
   만든다(고치기 전에 — 이 테스트가 없으면 "다 고쳤다"를 주장할 근거가 없다).
2. 그 테스트로 고치고-재실행하고-다음 실패를 찾는 것을 **테스트가 깨끗해질 때까지** 반복한다(파서는
   첫 오류에서 멈추므로 지금 아는 두 곳이 전부라는 보장이 없다).
3. 같은 위험 형태(바깥 template literal 안에서 안쪽 문자열 리터럴로 새는 이스케이프 — `\n`뿐 아니라
   `\t`, `\r`, `\'`, `\\`)를 소스에서 전수로 훑어, 지금 당장 어떤 payload로도 안 깨지지만 잠재적으로
   같은 경로를 가진 곳이 더 있는지 확인하고 있으면 같이 고친다.
4. 파싱 검사에 payload 다양성을 반영한다: 빈 값, 긴 diagnostics, `augmentedEdges` 있음/없음,
   `</script>`·backtick·U+2028/U+2029 포함 — reviewer가 재현에 쓴 목록 그대로.
5. 기존 `graphPanel.test.ts`가 이 결함을 왜 못 잡았는지 한 줄 기록(이 문서의 "배경과 해결할 문제"
   절 — 실제 코드에는 테스트 파일 자체의 주석으로 남긴다).

**제외(범위 밖, 다른 사람/다른 lane 몫)**:
- `v0.9.1` 릴리스(버전 bump, CHANGELOG, 태그·Release 발행) — commander가 진행, CHANGELOG 문구도
  commander가 작성.
- 이 수정 자체의 merge 승인/검토 — coder에게 별도 요청(자기 수정 자기 승인 금지).
- Kotlin LSP 층 3 실측(다른 병렬 작업, 이 lane 완료 후 재개).
- 진짜 실제 VS Code webview에서 실행으로 렌더 확인(extension-host harness가 이 저장소에 없다는
  gate 2의 기존 잔여 — 이 lane이 만드는 파싱 검사는 "파싱 가능한가"까지이지 "실제로 원하는 그래프가
  그려지는가"까지는 아니다. 이 구분을 테스트 자신의 주석에도 남긴다).

## 현재 구현 조사 결과

- `getHtml(webview, payload)`는 `graphPanel.ts`의 top-level 비-export 함수. `webview` 인자는 함수
  안에서 `webview.cspSource`만 읽는다(CSP meta 태그 한 곳).
- `toPayload()`는 `vscode.workspace.getConfiguration(...)`/`vscode.workspace.asRelativePath(...)`를
  실제로 호출하므로 순수 함수가 아니다 — 테스트에서는 `toPayload()`를 거치지 않고 `GraphPayload` 셰이프를
  직접 구성해 `getHtml()`에 넘기는 쪽이 맞다(reviewer가 재현할 때 쓴 방법과 동일).
- reviewer가 이미 검증한 사실: `graphPanel.js`(컴파일본)를 최소 `vscode` stub(빈 객체 또는
  `cspSource`만 있는 객체)과 함께 `require()`하면 `getHtml()`을 실제로 호출할 수 있다 — 파일 자체의
  "require 불가능" 주석은 **모듈 최상단의 `require('vscode')` 때문**이지 `getHtml()` 자신의 로직
  때문이 아니다. 이 lane은 `getHtml`을 `export`로 바꾸고, 테스트 파일에서 `Module.prototype.require`
  또는 `Module._load`를 이 테스트 파일의 require 체인에만 한정해 몽키패치하는 방식으로 최소
  `vscode` stub을 주입한다 — 이 저장소의 다른 파일을 건드리지 않는, 테스트 파일 국소적인 기법이다.

## 단계별 구현 계획

### 1단계 — getHtml을 테스트 가능하게 export하고, 파싱 검사 테스트를 먼저 작성한다

- 목적: "고쳤다"를 주장하기 전에 그 주장을 검증할 도구부터 만든다.
- 산출물:
  - `src/graphPanel.ts`의 `function getHtml(...)` → `export function getHtml(...)`(순수 함수라 이
    변경만으로 동작 변화 없음).
  - 새 테스트 `src/test/graphPanelHtmlParses.test.ts`: 컴파일된 `../graphPanel`을 최소 `vscode`
    stub과 함께 require, 여러 `GraphPayload`(빈 값/긴 diagnostics/augmentedEdges 있음·없음/
    `</script>`·backtick·U+2028·U+2029 포함 문자열)로 `getHtml()`을 호출, 각 출력에서 `<script
    nonce="...">`와 `</script>\n</body>` 사이 내용을 추출해 `new Function(scriptContent)`로 파싱
    가능한지 확인.
  - 이 테스트가 이 lane이 시작될 때 **반드시 먼저 실패**해야 한다(현재 소스가 깨져 있으므로) — 그
    실패를 캡처해 이 문서에 남긴다.
- 검증: 테스트를 고치기 전 상태(`git stash` 없이, 수정 전 커밋)에서 실행해 정확히 445번째 줄 근방에서
  실패하는지 확인. 통과 상태로 조작된 vacuous 테스트가 아님을 실제 실패로 증명한다.

### 2단계 — 실패가 사라질 때까지 고치고-재실행을 반복한다

- 목적: 파서가 첫 오류에서 멈추므로, 지금 아는 두 곳이 전부라는 보장이 없다 — 테스트가 다음 실패를
  직접 알려주게 한다.
- 산출물: `graphPanel.ts`의 두 지점(445, 467번째 줄)과 테스트가 추가로 찾아내는 지점 전부 수정.
  수정 방향은 바깥 template literal이 `\n`을 조기 해석하지 못하게 이스케이프를 이중으로 하거나(
  `\\n`), 해당 조각을 별도 상수로 빼 `JSON.stringify()`로 안전하게 보간한다 — 어느 쪽을 쓸지는 각
  자리의 문맥(문자열 리터럴 안 vs 밖)을 보고 정한다.
- 검증: 매 수정 후 테스트 재실행, 실패 위치가 바뀌거나 사라지는지 직접 확인. 테스트가 완전히 초록이
  될 때까지 반복.

### 3단계 — 같은 위험 형태를 소스에서 전수로 훑는다

- 목적: 파싱 검사는 "지금 이 payload로 깨지는 것"만 잡는다. `\t`/`\r`/`\'`/`\\`처럼 같은 경로를 가졌지만
  지금 당장의 payload로는 안 깨지는 자리가 더 있을 수 있다.
- 산출물: `getHtml()`의 `<script>` 텍스트 구간 전체에서 바깥 template literal의 이스케이프 시퀀스
  중 안쪽 JS 문자열 리터럴 안에 놓인 것을 전수 점검한 기록(이 문서의 작업 로그). 발견되면 2단계와
  같은 방식으로 수정.
- 검증: 점검에 쓴 방법(어떤 정규식/절차로 훑었는지)과 발견한 건수를 작업 로그에 남긴다 — "다 봤다"를
  주장 가능하게.

### 4단계 — 회귀 방지와 기존 테스트 설명

- 목적: 다음 사람이 `graphPanel.test.ts` 계열을 보고 "이미 검증됐다"고 오인하지 않게 한다.
- 산출물: `graphPanel.test.ts` 또는 새 테스트 파일 상단에, 왜 기존 정규식 기반 테스트들이 이 결함을
  못 잡았는지(모듈이 require 불가능해서 소스 텍스트만 검사했다는 것), 그리고 이번에 추가된 파싱
  검사가 그 공백의 일부(파싱 가능 여부)만 메우고 실제 렌더 확인(extension-host harness 부재)은 여전히
  남는다는 것을 명시.
- 검증: `npm test`(Extension 전체 스위트) 회귀 없음, `npm run compile` 통과.

## 테스트 및 완료 기준

- [x] 새 파싱 검사 테스트가 수정 전 실패 → 수정 후 통과로 바뀌는 것을 직접 실행으로 확인(non-vacuity).
  수정 전: `tests 10, pass 0, fail 10`(전부 같은 위치에서 실패). 445번째 줄 수정 후: 여전히
  `fail 10`이지만 `node --check`로 실패 위치가 467번째 줄로 옮겨간 것을 직접 확인. 467번째 줄까지
  수정 후: `tests 10, pass 10, fail 0`.
- [x] 기존 Extension 테스트 스위트 전체 회귀 없음. `npm test` → `tests 94, pass 94, fail 0`(기존 84 +
  새 10). `npm run test:response-policy` → 38 checks 전부 통과, 회귀 없음.
  (`npm run test:vsix-contents`는 이 worktree가 main 트리의 node_modules를 symlink해서 쓰는
  환경상의 npm/pnpm 트리 모양 불일치로 실행 자체가 안 됐다 — 이 수정과 무관한 기존 환경 제약이고,
  실제 PR CI는 독립 `npm install`을 하므로 이 제약을 안 받는다.)
- [x] 3단계의 전수 점검 기록이 남아 있음 — 위 "3단계" 항목, 정규식 자체의 sanity check와 원본
  소스 재확인 포함.
- [x] 이 문서의 "배경과 해결할 문제" 절이 기존 테스트가 왜 못 잡았는지 답하고 있음. `graphPanel.
  test.ts` 자신의 상단 주석에도 같은 설명과 새 테스트 파일로의 포인터를 추가했다.

## 작업 로그

**1단계**: `src/graphPanel.ts`의 `function getHtml` → `export function getHtml`(순수 함수, 동작
변화 없음 — `webview.cspSource` 한 곳만 읽는다). 새 테스트
`src/test/graphPanelHtmlParses.test.ts`(10개 케이스: 빈 값, `completeness.action` 설정, 긴
diagnostics, `augmentedEdges` 있음/없음, `</script>` 포함, backtick/`${}` 포함, U+2028, U+2029,
WSL 형태 경로) 작성. `Module._load`를 이 테스트 파일 require 체인에만 한정해 몽키패치해 `vscode`를
빈 객체로 stub — `graphPanel.js`(컴파일본) 최상단의 `require('vscode')`만 우회한다.
**수정 전 실행(non-vacuity 확인)**: 10개 테스트 전부 실패(`tests 10, pass 0, fail 10`), 전부 같은
에러(`Invalid or unexpected token`) — 어떤 payload를 넣어도 깨진다는 증거를 실행으로 재확인.

**2단계**: `node --check`로 정확한 실패 위치를 매 반복 확인.
1. 1차 실행 → `graphPanel.ts:445`(`summary.title`의 `'\n\n-> '`)에서 실패. `'\n\n-> '` →
   `'\\n\\n-> '`로 수정(바깥 template literal이 조기에 개행으로 풀어버리지 못하게 백슬래시를
   이중으로). 재컴파일·재실행 → **여전히 10개 전부 실패**(파서가 다음 오류로 넘어갔을 뿐).
2. 2차 실행 → `node --check`로 실패 위치가 `graphPanel.ts:467`(`state.title`을 만드는
   `].join('\n')`)로 옮겨간 것을 직접 확인. `'\n'` → `'\\n'`로 동일하게 수정.
3. 3차 실행 → **10개 전부 통과**(`tests 10, pass 10, fail 0`). 더 이상 실패가 없다.

**3단계**: 파싱 검사 하나만으로 "이 두 곳이 전부"를 주장할 수 없다는 지적에 따라 별도 정적 전수
점검을 수행했다. 방법: `getHtml()`의 `<script>` 본문(소스 375~864번째 줄)을 대상으로, `'`/`"`/`n`/
`t`/`r`/`\`  중 하나 앞에 **홀수 개의 연속 백슬래시**가 오는 자리를 전부 찾는 정규식(`(\\+)(['"ntr\\])`,
매칭된 백슬래시 그룹 길이의 홀짝 판정)으로 스캔했다. 이 판정 기준을 고른 이유: 짝수 개의 백슬래시는
바깥 template literal 평가를 거치며 그대로 "이스케이프된 백슬래시 N/2개"로 안전하게 살아남지만,
홀수 개는 마지막 백슬래시가 그 다음 문자(`n`/`t`/`r`/`'`/`\`)와 짝을 이뤄 **조기에 해석**되므로
같은 결함 계열이다.
- **먼저 이 정규식 자체를 검증**: 알려진 나쁜 패턴(`'\n\n-> '`, `can\'t`)에 대해 ODD로, 안전한
  패턴(`'\\n\\n-> '`, 문자 앞의 이중 백슬래시)에 대해 no-match로 정확히 판정하는지 별도 스크립트로
  확인.
- **같은 정규식을 수정 전 원본 소스**(`git show origin/main:src/graphPanel.ts`)에 돌려 정확히
  이미 알고 있는 두 줄(445번째 줄에서 2건, 467번째 줄에서 1건)만 ODD로 잡는지 확인 — 정규식이
  실제로 동작한다는 것을 알려진 결함으로 재확인(sanity check on the sweep itself).
- **수정 후 소스에 같은 정규식 실행 → 0건.** `\t`/`\r`/`\'`/`\\` 전부 포함해 스캔했지만 남은 홀수
  백슬래시 자리가 없다.
- **추가로 실행 기반 근거**: 이 결함 계열(`\n`/`\r`/U+2028/U+2029류가 문자열 리터럴 안에서 원시
  개행으로 새는 것)은 **payload와 무관하게 항상 같은 위치에서 실패한다** — client script의 소스
  구조 자체가 고정돼 있고 `${...}` 보간값만 payload에 따라 바뀌기 때문이다. 그래서 1단계의 파싱
  검사가 10개 payload 전부에서 초록이 됐다는 것 자체가 이미 "정적 소스 전체에 이 결함 계열이
  더는 없다"는 것의 실행 증거다(JS 파서는 파일 전체를 먼저 토큰화해야 어떤 코드든 실행하므로,
  실행되지 않는 branch에 있어도 파싱 단계에서 걸린다). 정적 정규식 스캔은 이 실행 증거로는 못 잡는
  종류(`\'`/`\\`처럼 조기에 풀려도 즉시 SyntaxError가 아니라 조용히 다른 의미로 파싱될 수 있는
  경우)까지 마저 덮기 위해 별도로 수행했다.

**4단계**: `npm test`(Extension 전체 스위트) 실행 — 아래 "테스트 및 완료 기준" 참고. 기존
`graphPanel.test.ts`/`graphPanelAugmentedEdges.test.ts`가 왜 못 잡았는지는 이 문서 "배경과 해결할
문제" 절, 그리고 새 테스트 파일 자신의 상단 주석에 동일하게 기록했다(다음 사람이 소스만 읽어도
바로 알 수 있게).
