# v0.9.1 릴리스 정합성

- 상태: **PR #113 생성·CI 전체 green, merge 대기.** B-1(버전 소유 위치 재조사)·B-2(버전 선택
  재확인)·CHANGELOG 사실 대조·B-3(실제 반영)·`test:vsix-contents`가 이 PR의 CI에서 실제로
  실행·통과했는지 원문 로그로 재확인까지 완료. **B-4(공개 default-path 사후 검증)는 발행
  후**(commander가 태그·Release를 발행한 다음). **태그 발행·GitHub Release 생성은 이 lane의
  범위 밖**(commander 지시) — PR merge까지만 하고 발행은 commander가 진행한다.
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

> **2026-09-10 정정 (reviewer가 사후 검증에서 발견, commander가 전달).** 위 "출력 없음(빈
> diff)"은 **틀렸다.** `git diff v0.9.0..origin/main --stat -- plugins/`를 다시 돌리면
> **2개 파일이 실제로 바뀌어 있다**:
> - `plugins/impact-lens/scripts/run-impact-lens` — pin된 release fallback tarball URL이
>   `v0.9.0` → `v0.9.1`(1줄).
> - `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md` — 예시 응답의
>   `"version"` 필드 3곳이 `"0.9.0"` → `"0.9.1"`.
>
> 이 두 변경은 **이 문서 자신의 B-3 커밋이 만든 것**이다(위 B-1 표에 "동일 위치"로 이미 기록해
> 둔 항목들) — B-2를 쓸 당시엔 아직 B-3을 실행하기 전이라 diff가 실제로 비어 있었지만, 이 문서를
> 최종 정리하면서(B-3 이후) 이 문장을 재확인하지 않고 그대로 남겨 **stale한 근거를 인용**했다.
> **결론(plugin payload 자체 버전은 `0.5.0` 유지) 자체는 여전히 맞다** — 바뀐 두 곳은 plugin의
> agent-facing 판정 규칙이 아니라 **CLI 버전 문자열을 가리키는 기계적 참조**이고, `plugin.json`
> 두 파일의 `version` 필드는 실제로 `0.5.0` 그대로다. 정확한 서술은: **"plugin payload 자체
> 버전(`plugin.json`)은 안 바뀌었고, pin된 CLI 버전을 가리키는 참조 2곳은 정상적으로 v0.9.1로
> 바뀌었다."**
>
> **이게 B-4와 바로 연결된다**: `run-impact-lens`가 이제 가리키는
> `impact-lens-cli-0.9.1.tgz` release 자산은 **commander가 태그·Release를 발행하기 전에는
> 존재하지 않는다** — 즉 이 pin이 정확히 B-4가 검증해야 할 대상이고, 발행 전에는 원리적으로
> 검증이 불가능하다는 게 다시 확인된다.
>
> **오늘 이 lane 자신이 다른 사람의 인용 오류를 잡으려고 세운 규율("인용은 열어 보기 전까지
> 근거가 아니다")을 자기 자신의 이전 문장에 적용하지 못한 사례** — PR 본문 작성 시점에 이미 한 번
> 확인했다는 사실이 그 뒤에 같은 worktree에서 만든 변경을 재확인해야 할 필요를 없애주지 않는다.

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
  **PR #113 자체의 CI로 재확인 완료**: `gh run view ... --log`로 `ubuntu-latest / Node 22`
  job의 원문 로그를 직접 확인 — `npm run test:vsix-contents`가 `impact-lens@0.9.1`로 실제
  실행됐고 "What this proves: the packaged vsix's file list and size are what this lane
  intends." 출력과 함께 통과했다. 세 OS(`macos-latest`/`ubuntu-latest`/`windows-latest`) 모두
  `pass`. 로컬 재현 실패의 근본 원인은 여전히 미규명이지만, 패키징 검사 자체는 이 릴리스 대상
  커밋에서 실제로 돌고 통과한다는 것이 원문 로그로 확인됐다.

## 다음 단계

1. 이 문서·CHANGELOG·README·버전 파일들을 commit, push.
2. PR 생성 → CI 확인(특히 `test:vsix-contents`가 실제로 실행·통과하는지 로그로 직접 확인,
   로컬 재현 실패와 무관하게).
3. **B-4(공개 default-path 사후 검증)는 여기서 하지 않는다** — 발행된 태그/Release가 아직 없다.
   commander가 발행한 뒤 별도로 수행한다.
4. **태그 발행·GitHub Release 생성은 하지 않는다** — commander가 진행.

## 릴리스 아티팩트 빌드 (`origin/main`(`35f0376`) 기준, commander 요청)

**로컬 `vsce` 패키징 실패의 근본 원인 규명 — 이전 lane에서 "npm UUID-path-masking bug"라고만
불렸던 것의 정확한 정체.** 이 머신의 기본 Node(`v25.8.1`, Homebrew 설치)에서는 `pnpm exec vsce
ls --no-yarn`/`vsce package`가 매번 파일을 **0개** 찾는다(`.vscodeignore`·`package.json`의
`publisher`/`repository`/`engines`/`main` 필드 전부 정상, `out/extension.js`도 실제로 존재하는데도).
플레인 `git clone`(worktree 아님)에서도 동일하게 재현돼 **worktree 구조 문제가 아님을 배제**했다.
`@vscode/vsce@3.9.2`가 CI가 고정한 **Node 22**가 아니라 이 머신의 **Node 25**에서 내부 파일
탐색이 깨지는 것으로 보인다 — Adoptium/nodejs.org에서 self-contained Node 22.19.0 tarball을
`/tmp`에 내려받아(sudo 없음, 시스템 Node 안 건드림) `PATH`에 앞세워 재시도하니 **정확히 같은
명령이 정상 동작**했다(`vsce ls --no-yarn` → 40개 파일 나열, `out/extension.js`·`out/graphPanel.js`
포함). **이걸로 결론**: 로컬 실패는 이 머신의 기본 Node 버전과 vsce의 호환성 문제이지, 코드나
패키징 설정의 결함이 아니다. 다음 릴리스부터는 로컬에서 vsce를 돌릴 때 Node 22를 먼저 확인한다.

### 산출물

| 파일 | 경로 | 바이트 수(`ls -l`) | sha256 |
| --- | --- | --- | --- |
| VSIX | `/tmp/impact-lens-0.9.1.vsix` | `1229940` | `4fca9118f0373c025f5dab22617c9cb5f7703b702bfabf1d11073e9419e1d94f` |
| CLI tarball | `/tmp/impact-lens-cli-0.9.1.tgz` | `159845` | `8800ea183aa5cd1e15b630045e4f24a58b5b7ab4866a675ab0fbd5610c716d35` |

빌드 명령(둘 다 Node 22.19.0, `origin/main`(`35f0376`)을 가리키는 격리 worktree, `pnpm install
--frozen-lockfile`로 CI와 동일한 의존성 트리 재현):
- VSIX: `pnpm test && pnpm run compile && git diff --check && npx --yes @vscode/vsce package
  --no-yarn --out /tmp/impact-lens-0.9.1.vsix` → `42 files, 1.17 MB`(vsce 자체 보고, 위 표의
  바이트 수가 근거).
- CLI tarball: `cli/` 안에서 `npm pack --pack-destination /tmp` → `39 files`, vsce와 무관하게
  npm의 표준 tarball 생성이라 이 머신에서 처음부터 문제 없이 동작했다.

### 패키지 내용 확인 — 눈으로 안 넘기고 직접 풀어서 확인

**VSIX**: `unzip`으로 풀어 42개 파일 전체 목록을 직접 나열 — `src/`·`docs/`·`cli/dist/index.js`·
`cli/node_modules/**` **전부 없음**, `cli/dist/shared/**/*.js`(FastAPI adapter 전용, 7개
파일)만 재포함돼 있다 — `.vscodeignore`가 의도한 모양 그대로. `extension/package.json`의
`version`이 `0.9.1`인 것도 확인.

**`out/graphPanel.js`에 수정이 실제로 들어갔는지 — 이 릴리스의 존재 이유**: 압축을 푼
`extension/out/graphPanel.js`에서 이 PR #112의 두 수정 지점을 직접 문자열로 확인 — `'\\n\\n->
'`와 `.join('\\n')` 둘 다 **있음**(안전한 이중 백슬래시 형태). 이전 lane들이 쓴 odd-backslash
정규식 스윕을 이 컴파일된 파일 전체에 스코프 없이 돌려 봤더니 1건이 잡혔는데, 확인해 보니
**오탐**이었다 — `const serialized = JSON.stringify(payload).replace(/</g, '\\u003c')`(이건
`<script>` 밖의 평범한 TS 코드, `</script>` 주입 방지용 기존 안전 패턴)를 정규식이 "백슬래시 1개
+ 백슬래시 1개"로 잘못 쪼갠 것 — 실제로는 이중 백슬래시 통째로 안전하다. PR #112 검토·이전
lane들의 정규식 스윕은 소스의 375~864번째 줄로 정확히 범위를 좁혀서 돌렸기 때문에 이 자리를
애초에 스캔하지 않았다 — 이번에 범위 없이 컴파일본 전체를 훑다가 처음 마주친 이 정규식의
한계이지, 코드의 결함이 아니다.

**PACKAGED 아티팩트에서 직접 `getHtml()`을 호출해 실행으로 확인(commander 추가 요청)**:
reviewer가 PR #112 재현에 쓴 것과 같은 기법(`Module._load`를 `vscode` 하나만 stub하도록
패치)을 **소스가 아니라 압축을 푼 VSIX 안의 `extension/out/graphPanel.js` 파일에** 그대로
적용 — `require()`로 실제로 로드하고 `getHtml()`을 실제 payload로 호출해 `<script>` 내용을
추출한 뒤 `new Function()`으로 파싱했다. **파싱 성공**(`script body length: 33643 bytes`).
추가로 payload의 `completeness.action`(원래 결함이 심었던 바로 그 필드) 텍스트가 렌더링된
스크립트 출력에 그대로 나타나는 것까지 확인 — "빌드됐으니 고쳐졌겠지"가 아니라 **발행 예정
아티팩트 자체가 실행으로 확인됐다.**
