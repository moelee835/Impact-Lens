# v0.9.1 릴리스 정합성

- 상태: 진행 중 — B-1(버전 소유 위치 재조사)·B-2(버전 선택 재확인)·CHANGELOG 사실 대조·B-3(실제
  반영) 완료. **B-4(공개 default-path 사후 검증)는 발행 후**(commander가 태그·Release를 발행한
  다음). **태그 발행·GitHub Release 생성은 이 lane의 범위 밖**(commander 지시) — PR merge까지만
  하고 발행은 commander가 진행한다.
- branch: `release/v0.9.1`
- 선행: `docs/work/task-m4-release-0-9-0.md`(B-1~B-4 방법론의 직전 전례), PR #112(`0d5b5e7`,
  Call Graph webview `SyntaxError` 수정 — 이 릴리스의 유일한 코드 변경).

## 목적과 사용자 가치

PR #112가 고친 것(Call Graph 패널이 `v0.7.0`부터 세 릴리스 동안 한 번도 렌더링되지 않은 결함)을
실제로 설치 가능한 v0.9.1로 사용자에게 전달한다. 이 lane이 끝나면 사용자는 발행된 CLI/Extension을
업데이트해 Call Graph 패널을 실제로 볼 수 있게 된다. 왜 지금인가 — 발행된 세 릴리스 전부가 깨진
채였던 간판 기능이고, 원인이 이미 확정·수정·독립 검토까지 끝나 재작업 위험이 낮다.

## commander의 CHANGELOG 초안 사실 대조 — 완료, 결함 0건

`release/v0.9.1`(`d7cd303`)에 이미 올라와 있는 CHANGELOG `## 0.9.1` 절과 README 추가 문단을
문장 단위로 재확인했다. **v0.9.0 때(commander 초안에서 4건 발견)와 달리, 이번엔 재확인 없이 그대로
믿지 않는다는 같은 원칙을 적용했지만 결함을 찾지 못했다** — 모든 주장이 실행 검증 또는 직접 재확인과
일치했다:

- **"`v0.7.0`·`v0.8.0`·`v0.9.0` 전부"**: `git tag --contains f0d086f` 독립 재실행 →
  `v0.7.0`/`v0.8.0`/`v0.9.0` 정확히 일치. 도입 커밋 시각(`2026-08-27 16:08:05 +0900`)도 확인.
- **원인 서술**("바깥 template literal이 `\n`을 조기 해석 → 안쪽 single-quoted 문자열의 raw
  개행 → 파서가 토큰화 단계에서 `SyntaxError`")과 **"두 곳 중 두 번째는 첫 번째를 고친 뒤에야
  보인다"**: PR #112 검토 때 이미 실행으로 재확인(별도 scratch worktree에서 445번째 줄만 고치고
  재컴파일 → 여전히 10개 전부 실패, 467번째 줄까지 고친 뒤에야 10개 전부 통과 — PR #112 리뷰
  코멘트 참고).
- **"10개 payload"·"되돌리면 열 개 다 실패"**: 이 문서 작성 시점에 **이 lane 자신의 worktree에서
  다시** 독립 재현 — `grep -c "^test("` src/test/graphPanelHtmlParses.test.ts → **10**(눈으로
  세지 않고 grep 카운트). 445/467번째 줄만 정밀하게(다른 자리를 안 건드리는 최소 패치로) 되돌리고
  재컴파일 → `node --test` 결과 `tests 10, pass 0, fail 10`. 원복 후 재컴파일 → `tests 10,
  pass 10, fail 0`.
- **M4 gate 2 문단**("JSON 절반은 실행으로 검증돼 유효/시각 절반은 검증된 적 없다"): `cli/src/
  test/`(`dynamicCallbackIntegration.test.ts`/`pythonFastapiIntegration.test.ts` 등)는
  `require('vscode')` 제약이 없는 순수 Node 모듈이라 실제로 실행되며 `data.augmentedEdges`
  JSON 구조를 실제 코드 corpus로 검증한다 — "JSON 절반은 실행 검증됨"이 정확하다. 반대로
  `graphPanel.ts`의 시각적 렌더링(dashed stroke 등 candidate edge 스타일)은 PR #112 이전엔
  정규식 검사만 있었고, PR #112 이후에도 "파싱 가능"까지만 검증됐지 "브라우저에서 실제로 원하는
  모양으로 그려지는가"는 여전히 미검증 — 문단 그대로 정확하다.
- **README 추가 문단**("Extension은 자기 언어 엔진이 없고 VS Code에 등록된 언어 서비스에
  위임한다, `bundled-pyright`를 쓰지 않는다"): `src/impactAnalyzer.ts`에서 `vscode.commands.
  executeCommand('vscode.prepareCallHierarchy', ...)`를 쓰는 것을 직접 확인(VS Code 내장
  명령 — 현재 편집기에 등록된 언어 서비스로 위임, CLI 전용 코드 경로가 아니다). `grep -rln
  "bundled-pyright" src/`(테스트 제외) → **0건** — Extension 소스 어디에도 `bundled-pyright`
  참조가 없다는 것도 확인.

## B-1. 버전 소유 위치 재조사 — 오늘, `grep -rln`으로 직접 전수(이전 표를 신뢰하지 않음)

`grep -rln "0\.9\.0"` 전체 재실행(`node_modules`/`.git`/`.claude`/`dist`/`out`/`.agents` 제외).
`task-m4-release-0-9-0.md`의 표를 재사용하지 않고 이 결과만 근거로 썼다.

**기능적·사용자 대상 — v0.9.0 감사와 완전히 같은 위치, 줄 번호까지 동일**

| 위치 | 확인 |
| --- | --- |
| `package.json:6` | 동일 위치 |
| `cli/package.json:3` | 동일 위치 |
| `cli/src/test/contract.test.ts:31` | 동일 위치 |
| `plugins/impact-lens/scripts/run-impact-lens:11` | 동일 위치 — release fallback tarball URL 핀. **v0.9.1 태그가 아직 발행되지 않았으므로 이 URL은 commander가 발행할 때까지 404다** — v0.9.0 lane과 같은 순서(발행 3단계와 함께 묶는다). |
| `plugins/impact-lens/.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | `0.5.0` 그대로(아래 B-2 참고) — `0.9.0` 패턴에 안 걸림, 별도 확인 |
| `README.md`(5줄: 11, 52, 55, 64, 290) | v0.9.0 감사 때는 `README.md:280`였다 — **10줄 밀림**, 이유는 이번 lane 자신이 이미 추가한 Python-provider 안내 문단(commander가 `release/v0.9.1`에 먼저 커밋) 때문. 그 외 4곳은 동일 위치. |
| `INSTALL.md`(17줄: 10,56,63,72,83,92,97,101,102,111,187,229,233,238,244,250,251) | v0.9.0 감사와 **완전히 동일한 줄 번호** — 이 lane의 어떤 변경도 INSTALL.md 구조를 안 건드렸다. |
| `docs/DEVELOPMENT.md`(6줄: 188,193,208,227,233,243) | **완전히 동일한 줄 번호**. |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`(3줄: 29,35,290) | **완전히 동일한 줄 번호**. |
| `CHANGELOG.md` | `## Unreleased`(빈 채로 유지) 아래 `## 0.9.1` 확정 — commander가 이미 작성해 둠, 위 사실 대조로 검증 완료. |

**불활성이지만 일관성을 위해 함께 올리는 위치**

| 위치 | 확인 |
| --- | --- |
| `scripts/fixtures/response-policy/*.json`(**30개**) | grep 카운트로 확인: `grep -l '"0.9.0"' ... \| wc -l` → **30**, 전체 파일 수(`ls ... \| wc -l`)도 **30** — v0.9.0 lane이 이미 30개 전부를 `0.9.0`으로 통일해 둬서 이번엔 깨진 것 없이 시작했다. `test-response-policy.mjs`/`response-policy-engine.mjs` 둘 다 여전히 `version` 필드를 안 읽는다(`grep -n "version"` 0건, 오늘 재확인). |

**새로 나타난 위치 — 없음.** `.github/workflows/`를 다시 `grep -rn "0\.9\.0"`으로 훑었지만 0건
(v0.9.0 감사와 동일). `graphPanel.test.ts`/`graphPanelHtmlParses.test.ts`의 `0.9.0` 언급 2건은
**"이 버그가 세 릴리스에 있었다"는 역사적 서술**이지 버전 위치가 아니다 — v0.9.1이 나가도 그
문장은 여전히 사실이므로 안 건드린다.

**바꾸지 않는다 — 역사적 기록**: `CHANGELOG.md`의 `0.9.0`/`0.8.0`/... 과거 절, `docs/work/
task-m4-release-0-9-0*.md`·`task-m4-gate7-*.md`·`task-m4-milestone-closure-audit.md`·
`task-fix-graphpanel-webview-syntax-error.md` 등 이미 완료된 작업 로그(전부 `0.9.0`을 그 자체로
언급할 이유가 있는 문서), `docs/development-management/user-tests/m4-user-test-spec.md`(v0.9.0
발행 시점을 서술하는 3곳).

## B-2. 버전 선택

### CLI/Extension: `0.9.1`

PR #112는 버그 수정(webview `SyntaxError`)과 문서 추가(README) 뿐이다 — 새 필드, 새
`limitationDetails` code, 스키마 변경 **전혀 없음**. `cli/schemas/`는 v0.9.0 이후 무변경
(`git diff v0.9.0..HEAD --stat -- cli/schemas/` → 출력 없음, 오늘 재확인). **patch가 맞다** —
M2/M4가 세운 같은 규칙(제거·재정의 없는 추가는 minor, 순수 버그 수정은 patch)을 그대로 적용.

### Plugin payload: `0.5.0` 유지 (commander 판단 확인)

commander가 "이번 변경이 `src/graphPanel.ts`와 테스트·문서뿐이라 plugin 내용은 안 바뀌었다"고
판단한 것을 **직접 검증**: `git diff v0.9.0..HEAD --stat -- plugins/` → **출력 없음(빈 diff)**.
plugin manifest 2개(`0.5.0`) 그대로 유지, plugin 관련 파일 0개 변경 확인 — commander 판단이
맞다.

## B-3. 실제 반영 — 완료

Python 스크립트로 위 표의 모든 위치에서 `0.9.0` → `0.9.1` 일괄 치환(response-policy fixture
30개 포함), 치환 후 각 파일에 `0.9.0` 잔존 0건을 `grep -c`로 재확인. `plugin.json` 2개는 변경
없음(B-2 판단대로 `0.5.0` 유지).

## 검증

- `npm test`(Extension) → `tests 94, pass 94, fail 0`.
- `npm run cli:test` → `tests 516, pass 511, fail 0, skipped 5`(provider 미설치로 건너뛰는
  기존 조건부 테스트, 이 lane과 무관).
- `npm run test:response-policy` → `38 checks` 전부 통과(30 fixture + doc invariant + 음의
  방향 증명).
- `npm run test:vsix-contents` — **이 worktree(로컬 macOS 머신, 중첩된 scratchpad 경로)에서
  재현 안 됨**: `npm install`/`pnpm install --frozen-lockfile`(CI와 동일 버전, `pnpm@10.34.5`)
  둘 다 시도했지만 `pnpm exec vsce ls`가 매번 빈 목록을 반환한다(`vsce ls --tree`는 vsix 파일명만
  찍고 파일 트리가 없음, `vsce ls` 단독은 exit 0에 출력 0줄). `out/extension.js`를 포함해
  컴파일 산출물은 실제로 존재하는 것을 확인했고(`ls out/extension.js` 성공), `.vscodeignore`
  구조·`package.json`의 `publisher`/`repository`/`engines`/`main` 필드도 정상이다 — **근본
  원인을 이 lane에서 완전히 규명하지 못했다.** 이전 v0.9.0 release lane에서 비슷한 로컬 packaging
  문제가 있었다고 들었지만 그 진단이 작업 문서에 남아 있지 않아 재사용할 수 없었다.
  **commander가 요청한 것(5번)에 따라 로컬 재현 대신 CI를 근거로 삼는다**: PR #112의 실제 CI
  로그를 직접 확인(`gh run view ... --log`)해 `macos-latest / Node 22`/`ubuntu-latest / Node
  22`/`windows-latest / Node 22` 세 job이 **각각 `npm run test:vsix-contents`를 실제로
  실행하고 통과**한 것을 원문 로그로 확인했다(`.github/workflows/plugin-artifact-e2e.yml`의
  job 이름이 `${{ matrix.os }} / Node 22`라 `gh pr checks`에서 다른 workflow와 이름이 겹쳐
  보인다 — 혼동하기 쉬운 지점이라 기록해 둔다). **이번 PR(v0.9.1)에서도 같은 job이 통과하는지
  merge 전에 반드시 다시 확인한다** — 로컬 실패를 이유로 건너뛰지 않는다.

## 다음 단계

1. 이 문서·CHANGELOG·README·버전 파일들을 commit, push.
2. PR 생성 → CI 확인(특히 `test:vsix-contents`가 실제로 실행·통과하는지 로그로 직접 확인,
   로컬 재현 실패와 무관하게).
3. **B-4(공개 default-path 사후 검증)는 여기서 하지 않는다** — 발행된 태그/Release가 아직 없다.
   commander가 발행한 뒤 별도로 수행한다.
4. **태그 발행·GitHub Release 생성은 하지 않는다** — commander가 진행.
