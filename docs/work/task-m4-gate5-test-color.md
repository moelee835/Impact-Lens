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
