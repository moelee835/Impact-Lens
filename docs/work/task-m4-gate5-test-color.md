# M4 gate 5 — UI가 빌려 쓰는 "통과" 색

- 상태: 완료
- branch: `fix/m4-gate5-test-color`
- 선행: closure audit(PR #80)이 찾고, commander가 v0.8.0에 이미 나가 있다고 확인한 항목.
- 성격: **이미 배포된 UI 동작을 바꾼다** — 마일스톤 장부 정정이 아니라 실제 사용자가 지금 보는 색을
  바꾸는 작업이다.

## 목적과 사용자 가치

Impact Lens는 테스트를 실행하지 않는다. `test` 분류는 `cli/src/testFile.ts`의
`isTestFilePath()` — 파일 이름 규칙 하나뿐이다. 데이터 모델도 통과 상태를 표현할 값이 없다
(`src/types.ts:6`, `TestFreshness = 'notRun' | 'outdated'`). 그런데 `src/graphPanel.ts`는 `test`로
분류된 node/edge에 VS Code의 **testing 팔레트**, 그중에서도 **`testing.iconPassed`**(테스트 통과를
뜻하는 토큰)를 색으로 썼다 — `direct`/`transitive`는 중립적인 `charts` 팔레트를 쓰는데 `test`만
다르다. 모델이 의도적으로 거부한 주장("이 테스트가 통과했다")을 화면이 색으로 하고 있었다 — 이미
발행된 v0.8.0에 들어 있어(`git show v0.8.0:src/graphPanel.ts`로 확인), 지금 사용자가 보고 있다.

이 작업이 끝나면 그 오독의 소지가 사라진다 — "test로 분류된 함수"와 "통과한 테스트"를 색으로
구분 못 하던 것이, 파일 이름으로 추측한 것 이상을 주장하지 않는 중립 색으로 바뀐다.

## 확인 — commander·리뷰어 인용 재확인

- `src/graphPanel.ts`의 5곳(275/283/295/301/307행) 전부 `--vscode-testing-iconPassed` 사용 —
  직접 재확인.
- 대조군 `direct`/`transitive`는 `--vscode-charts-blue`/`--vscode-charts-purple`(중립 차트 팔레트) —
  비대칭이 실재함을 확인.
- `isTestFilePath()`가 순수 파일명 휴리스틱이라는 것, `TestFreshness`에 'passed'류 값이 없다는 것
  둘 다 재확인.

## 색 결정 — `--vscode-charts-orange`, fallback은 판단이 필요했다

commander 권고(주황, blue/purple과 구별되고 pass/fail 의미가 없음)에 동의해 그대로 썼다.
**fallback hex는 새로 조사해야 했다** — 기존 규칙(`charts-blue, #3794ff` / `charts-purple,
#b180d7`)이 각각 그 토큰의 VS Code 기본 dark 테마 값을 그대로 쓰고 있어서, 같은 원칙을 따르려면
`charts.orange`의 실제 기본값이 필요했다.

**VS Code 소스를 직접 추적**(`chartsColors.ts` → `chartsOrange`는 고정 hex가 아니라
`minimapFindMatch`의 별칭 → `minimapColors.ts`의 `minimapFindMatch`는 다시
`editorFindMatchHighlight`의 별칭 → `editorColors.ts`에서 `editorFindMatchHighlight`의 실제 값을
확인): **`#EA5C0055`**(dark/light 공통) — 마지막 두 자리 `55`는 알파(약 33% 불투명도)다. 이 색은
원래 에디터에서 검색 결과를 반투명하게 겹쳐 칠하는 용도로 설계된 값이라, 그 알파를 그대로 SVG
`stroke`/`fill`에 쓰면 이미 이 파일에 있는 `#3794ff`/`#b180d7`(둘 다 불투명) 같은 다른 solid color
규칙과 시각적으로 다르게(흐릿하게) 보일 것으로 판단했다.

**판단**: 알파를 떼고 **`#ea5c00`**(불투명)를 fallback으로 썼다 — 같은 색상(hue)을 유지하면서 이
파일의 다른 규칙들과 같은 "불투명 solid stroke" 관례를 맞췄다. **이건 제 판단이고 화면을 실제로
보고 확인한 것은 아니다** — commander가 화면을 못 본다고 명시했으므로, 이 판단 근거를 여기 남긴다.
다르게 보이면 fallback 값만 바꾸면 된다(토큰 자체는 `--vscode-charts-orange`로 정확함).

## 무엇이 바뀌었나

- `src/graphPanel.ts`: 5곳 전부 `--vscode-testing-iconPassed`(fallback 있는 곳은 `#73c991`도 같이)
  → `--vscode-charts-orange, #ea5c00`로 교체.
- `src/test/graphPanel.test.ts`: 회귀 테스트 1개 신규 — 소스 전체에 `vscode-testing-` 패턴이 없음을
  단언, 실패 메시지에 "왜 안 되는지"(테스트를 실행하지 않고 분류가 파일명 규칙뿐이라 testing 팔레트를
  빌리면 실행한 적 없는 결과를 주장하게 된다)를 그대로 적어 다음 사람이 "초록이 예쁜데"로 되돌리지
  않게 했다.

## 다른 표면 확인 (요청 3번) — 못 찾았다, 근거와 함께

`controller.ts`의 `node.relation === 'test'` 네 지점(267/572/596/740행)과 그 주변 텍스트를 직접
읽었다:

- 267/572/596행: `node.testFreshness`를 `'outdated'`/`'notRun'`으로 설정만 함 — 텍스트 생성 없음.
- 740행 이후 상태 표시줄 tooltip: `` `${tests} related test symbols` ``와
  `` outdatedTests ? `${outdatedTests} test verifications required` : '' ``만 씀 — **둘 다 중립
  이거나 오히려 "검증 필요"(실행 안 됐다는 정확한 방향)를 명시한다.** 통과·성공을 주장하는 문구
  없음.

`impactTreeProvider.ts`도 같이 확인(요청엔 없었지만 같은 `node.relation === 'test'` 소비처라 함께
봤다):

- `ThemeIcon`이 `'beaker'`(VS Code의 일반 "테스트" 아이콘) — `testing-passed-icon`류가 아님.
- tooltip에 `testFreshness === 'outdated'`일 때 **"No current test result is available after code
  changes"**를 이미 표시 중 — 오히려 이 lane이 원하는 방향(실행 안 됐음을 명시)과 일치.

`grep -rn "iconPassed" src/*.ts`로 저장소 전체를 재확인 — **graphPanel.ts의 원래 5곳이 전부였다.**
다른 표면에 통과/실행을 암시하는 텍스트나 아이콘은 없다.

## 검증

- non-vacuity: 5곳을 다시 `--vscode-testing-iconPassed`로 임시 되돌려 재컴파일 → 신규 회귀 테스트만
  실패(`AssertionError`, 메시지 그대로 출력) → 원복 → 재컴파일 → 4개 전부 통과.
- 전체 스위트: extension 59 pass(신규 1건 포함)/CLI 360 pass/3 skip(기존과 동일)/0 fail.

## 이 lane이 하지 않는 것

- **`augmentedEdges`의 UI 표현(gate 2)** — 별개, 더 큰 설계 판단.
- **분류 정확도 개선(`IL-LIM-010`, gate B)** — 이 lane은 "이름으로 추측한 것"을 "실행해서 확인한
  것"처럼 안 보이게만 했다. 분류 자체(파일명 휴리스틱)의 정확도는 손대지 않았다.
- **분류 근거를 사용자에게 보여주는 것**(예: "파일명 규칙으로 분류됨"을 tooltip에 명시) — 더 깊은
  문제이고 `IL-LIM-010`에 속한다고 판단해서 여기서 안 했다. 이 판단 자체를 기록한다.

## 2026-09-04 정정 — 리뷰어가 회귀 테스트를 실행으로 뚫었다

PR #82 리뷰에서 리뷰어가 원래 테스트를 실제로 무력화했다. 원래 코드는 이랬다(원문 그대로 인용, 이후
줄 번호가 바뀔 수 있어 줄 번호 대신 문구로 인용한다):

> `assert.doesNotMatch(source, /vscode-testing-/, ...)`

다섯 곳을 전부 `--vscode-charts-green`(과 raw hex `#73c991`)으로 바꾸고 재빌드해도 **네 테스트가 전부
통과했다** — `/vscode-testing-/`는 **금지 목록(deny-list)**이라 그 문자열이 없는 다른 어떤 색으로
바꿔도 못 잡는다. 그런데 `charts-green`은 시각적으로 원래 문제(초록 = "통과"로 읽히는 test 노드)와
**같다** — 이 lane이 막으려던 바로 그것이 안 걸린 것이다.

**정정**: 금지 목록을 **허용 목록(allow-list)**으로 뒤집었다 — 다섯 규칙 각각이 정확히
`var(--vscode-charts-orange, #ea5c00)`를 쓰는지 개별 정규식으로 파싱해 값 자체를 비교한다. 이제
`charts-green`이든 raw hex든 그 값이 아닌 다른 어떤 것으로 바꿔도 테스트가 실패한다 — 색을 바꾸려면
테스트도 같이 고쳐야 하고, 그게 목적이다(의도적이고 눈에 보이는 변경만 통과시킨다). 이 극성은 PR #79
rollback 테스트("바뀌어도 되는 필드만 지우고 나머지 전부 비교")와 같은 원리다.

**non-vacuity(리뷰어가 쓴 방법 그대로 재확인)**: 다섯 곳을 전부 `--vscode-charts-green, #73c991`로
바꾸고 재빌드 → 새 테스트가 **이번엔 실패**(`actual 'var(--vscode-charts-green, #73c991)' vs expected
'var(--vscode-charts-orange, #ea5c00)'`) → `cp`로 원본 복구 → `git diff --stat src/graphPanel.ts`
출력 없음(완전 원복 확인) → 재컴파일 → 4개 전부 통과. 전체 스위트도 재확인: extension 59 pass(신규
포함, 0 fail)/CLI 360 pass/3 skip(기존과 동일)/0 fail — 이 정정은 `src/`만 건드렸지만, 이 lane의
관례대로 CLI 스위트도 다시 돌려 무관함을 실측으로 확인했다.

## 2026-09-04 정정 2 — 허용 목록만으로는 부족했다, 금지 목록을 되살렸다

commander가 위 정정 자체의 허점을 지적했다: **허용 목록은 자신이 아는 다섯 규칙에 대해서만
함의를 갖는다** — 파일 전체에 대한 함의가 아니다. 누군가 **여섯 번째 규칙**(예:
`.node.test .node-name { fill: var(--vscode-testing-iconPassed); }`)을 새로 추가하면, 허용 목록은
그 규칙을 아예 모르므로 통과하고, 제거했던 금지 목록(`doesNotMatch(source, /vscode-testing-/)`)만
그걸 잡을 수 있었다. 둘은 서로 다른 구멍을 막는 것이었지 중복이 아니었다.

**정정**: `doesNotMatch(source, /vscode-testing-/)` 검사를 별도 테스트로 되살렸다 — 허용 목록
테스트와 나란히 둔다. 각 테스트 주석에 **서로 무엇을 막고 왜 하나로는 부족한지**를 명시했다(허용
목록은 알려진 다섯 규칙의 값 변경을 막고, 금지 목록은 새 규칙이 그 토큰을 다시 들여오는 것을 막는다).

**non-vacuity(되살린 금지 목록 쪽)**: `.node.test .node-name { fill:
var(--vscode-testing-iconPassed, #73c991); }`를 여섯 번째 규칙으로 임시 추가(허용 목록이 모르는
새 selector) → 재빌드 → **금지 목록 테스트만 실패**, 허용 목록 테스트는 그대로 통과(허용 목록이 이
구멍을 못 막는다는 것 자체를 실측으로 재현) → `cp`로 원본 복구, `git diff --stat` 출력 없음(완전
원복 확인) → 재컴파일 → 5개(테스트 1건 추가) 전부 통과.

## 리뷰어 확인 3번(정규식 비대칭) — 뮤테이션으로 확인, 약화 없음

리뷰어가 `40c8f19`를 검토하며 세 항목 중 두 개(`charts-green` 재시도, 선택자 이름 변경)는 확인했지만
세 번째를 **추측으로 채우지 않고 미완으로 남겼다**: 허용 목록의 다섯 패턴 중 `.edge-test`만 다르다 —

```
.edge-test (stroke):        /\.edge-test\s*\{\s*stroke:\s*([^;]+);/
.node.test rect (stroke):   /\.node\.test rect\s*\{\s*stroke:\s*([^;]+);\s*\}/
```

`.edge-test`는 뒤에 `\s*\}` 앵커가 없다 — 실제 CSS 규칙이 `stroke`와 `stroke-dasharray` 두 선언을
가져서(`.edge-test { stroke: ...; stroke-dasharray: 4 3; }`), 닫는 `}` 바로 앞에 값이 오는 다른 넷과
달리 앵커를 걸 수 없기 때문이다. 리뷰어의 질문: **이 비대칭이 `.edge-test`의 값 비교 자체를
약화시키는가?**

**뮤테이션으로 직접 확인**: `.edge-test`만 `--vscode-charts-green, #73c991`로 바꾸고(다른 넷은 그대로)
재빌드 → **`.edge-test (stroke)` 항목에서 정확히 실패**(`actual 'var(--vscode-charts-green,
#73c991)'` vs `expected 'var(--vscode-charts-orange, #ea5c00)'`) → `cp`로 원본 복구, `git diff --stat`
출력 없음(완전 원복 확인) → 재컴파일 → 5개 전부 통과.

**결론: 약화 없음.** `[^;]+`는 `stroke:` 다음 첫 `;`에서 멈추므로 캡처되는 값은 앵커 유무와
무관하게 정확히 그 선언의 값이다. `\s*\}` 앵커가 다른 넷에 하는 일은 값 비교를 더 정확하게 만드는
게 아니라 **"이 선언이 규칙의 마지막(유일한) 선언이어야 한다"는 별개의 구조 조건**을 부수적으로
강제하는 것뿐이다(그 넷은 실제로 단일 선언 규칙이라 우연히 성립). `.edge-test`는 애초에 선언이
두 개라 그 구조 조건이 성립할 수 없으므로 앵커를 뺀 것이고, 이건 결함이 아니라 필연이다 — 이
차이를 위 테스트 주석에도 짧게 추가했다.

## 알려진 고려사항 — 지금 고치지 않음, 화면 실측이 필요한 영역

리뷰어가 VS Code 소스에서 실제 값을 확인: 이 파일은 이미 `--vscode-editorWarning-foreground`를
`.node.changed`/`.warning`/`.state.stale`/`.state.analyzing`/`.state.partial`에 쓴다(284/308/310/311행
부근). 실제 기본값은 dark `#CCA700`, light `#BF8803` — **amber 계열**이다.

이번에 고른 주황(`#ea5c00`)과 hex 값은 다르지만, 둘 다 **warm 계열**이라 1.5~2px 정도의 얇은 stroke로
그려지면 "주의가 필요한 상태"(changed/stale/warning)와 "test로 분류됨"이 화면에서 뭉뚱그려 보일 약한
위험이 있다. 이건 gate 5가 막으려던 종류("실행하지 않은 결과를 주장")가 아니라 **다른 두 의미(경고 vs.
분류)가 서로 혼동될 위험**이라 성격이 다르다. 화면을 실제로 보고 판단해야 하는 영역이라 **지금 색을
바꾸지 않는다** — 나중에 실제 화면을 보는 사람(commander는 화면을 못 본다고 명시)이 판단할 근거로
여기 기록만 남긴다.

## 참고 — 검토 중 기각된 우려 하나

commander가 "`.edge-test`가 blue/purple edge와 구별되는가"를 물었으나, 확인 결과 direct/transitive는
**edge 레벨에 색이 아예 없다**(공통 `.edge`가 중립 회색; blue/purple은 node에만 쓰인다). `.edge-test`가
색+점선이 붙은 유일한 edge라 비교 대상이 없다 — 질문의 전제 자체가 성립하지 않았다.
