# gopls preset이 실사용자 경로로 도달 불가능한 결함 수정

- 상태: In progress
- branch: `fix/go-language-detection`
- 관련: PR #58(merge `13378e1`, M2 gopls preset stage 1·2), `docs/work/task-m2-gopls-preset.md`,
  `docs/work/task-m2-gopls-ci-verification.md`(M2 stage 3, 이 결함을 발견한 작업)

## 목적과 사용자 가치

PR #58은 "`gopls`만 PATH에 설치돼 있으면 Go 개발자가 아무 설정 없이 함수 영향도 분석을 시작한다"고
주장하며 merge됐다. **이 주장은 사실이 아니다.** `.go` 파일을 인자로 준 실제 요청은 언어를 `plaintext`로
잘못 감지해 `provider_required_for_language`로 끝난다 — `gopls`가 설치돼 있어도, catalog에 preset이
있어도 도달하지 못한다. 유일한 우회로는 `providerPreset: 'gopls'`를 사용자가 직접 명시하는 것인데, 이건
PR #58이 없애겠다고 약속한 바로 그 수고("`provider.command`/`args`를 직접 써야 한다")와 본질적으로
같다.

이 수정이 끝나면 `.go` 파일을 대상으로 한 요청이 실제로 `gopls`에 도달한다 — merge된 기능이 처음으로
약속한 대로 동작한다. 그리고 같은 결함이 M2의 나머지 lane(Python, C/C++)에서 재발하지 않도록, "catalog가
선언한 확장자가 실제 언어 감지 경로에서도 도달 가능한가"를 검증하는 test를 추가한다 — 지금은 이 둘이
서로 다른 두 곳(`catalog.ts`의 선언적 `extensions` 필드, `resolve.ts`의 하드코딩된 switch문)에
독립적으로 존재해 하나만 갱신해도 아무 test도 실패하지 않는다.

## 배경과 해결할 문제

`cli/src/providers/resolve.ts`의 `languageId(file)`(585줄)은 확장자→언어 id 정적 switch문이고,
`resolveProvider()`가 실제 요청마다 이걸로 `detectedLanguageId`를 만든다. `cli/src/providers/catalog.ts`의
`gopls` preset은 `extensions: ['.go']`, `languageIds: ['go']`를 선언하지만, **`extensions` 필드는
doctor의 fixture 파일명 생성(`doctor/index.ts:170,211`)과 doctor check 보고(`doctor/checks.ts:188`)에만
쓰이고, 실제 언어 감지에는 전혀 반영되지 않는다.** `languageId()`의 switch문에 `.go` case가 없어
`.go` 파일은 `'plaintext'`로 떨어진다.

**발견 경위**: M2 stage 1(`task-m2-gopls-preset.md`)의 조사는 손으로 짠 Node.js LSP client로 gopls와
직접 stdio JSON-RPC를 주고받았다 — `resolveProvider`/`languageId()`를 전혀 거치지 않았다. stage 2는
catalog 구조, version probe, readiness 신호를 각각 단위로 검증했지만, **실제 `.go` 파일로
`LspCallHierarchyProvider`를 (test 전용 옵션 없이) 생성해 auto-discovery 전체 경로를 왕복시키는 test가
없었다.** M2 stage 3(`task-m2-gopls-ci-verification.md`)가 그 test를 처음 작성해 실행한 순간 이
결함이 드러났다. `providers.test.ts:688-695`의 `languageId()` 단위 test도 `.go`를 다루지 않았다 —
gopls가 catalog에 들어오기 전에 작성된 test라 다룰 이유가 없었다.

## 범위와 범위에서 제외할 항목

**포함**: `languageId()`에 `.go` → `'go'` 추가, 회귀 재발 방지 test(catalog의 모든 preset extensions가
`languageId()`로 실제 도달 가능한지 교차 검증), 관련 기존 test 통과 확인.

**제외**: M2 stage 3(CI job, real-gopls reachability test)은 별도 branch/PR
(`test/m2-gopls-ci-verification`)에서 이 수정이 merge된 뒤 이어간다. Python/C/C++ 확장자 추가는 그
lane들의 몫이다.

## 현재 구현 조사 결과

- `resolve.ts:585-608`의 `languageId()` switch문에 지원 언어: typescript(+variants), javascript(+variants),
  python, c, cpp(+variants), swift, kotlin. **go 없음.**
- `catalog.ts`의 `gopls`가 `extensions: ['.go']`를 선언한 유일한 non-TypeScript preset이므로, 지금
  이 격차의 유일한 피해자다.
- `discoverExecutable`/`autoDiscover`(resolve.ts:234-268)는 `detectedLanguageId`가 `'go'`가 아니라
  `'plaintext'`로 들어오면 `presetsForLanguage(catalog, 'plaintext')`가 빈 배열을 반환해
  `provider_required_for_language`로 끝난다 — `gopls`가 설치돼 있는지조차 확인하지 않고 실패한다.
  (직접 재현: `node -e "console.log(require('./cli/dist/providers/resolve.js').languageId('a.go'))"` →
  `plaintext`.)

## 단계별 구현 계획

### 1단계 — `.go` 언어 감지 추가와 재발 방지 test (하나의 commit)

- 목적: 이미 merge된 gopls preset이 실제로 도달 가능하게 만들고, 같은 결함 유형이 다시 조용히
  재발하지 않게 한다.
- 산출물: `resolve.ts`에 `.go` case 추가. `providers.test.ts`에 `languageId('a.go') === 'go'` 단위
  test 추가. 새 교차 검증 test: `PROVIDER_CATALOG`의 모든 preset에 대해 선언된 `extensions` 각각이
  `languageId()`를 통해 그 preset의 `languageIds` 중 하나로 감지되는지 확인.
- 검증: `npm run cli:build`, `npm run cli:test`, `npm run test:all` 전체 통과. 새 교차 검증 test를
  일부러 깨서(예: gopls의 `.go`를 임시로 제거) 실제로 실패하는지 음의 방향 확인 후 원복.

## 이 발견의 성질 — "버그를 찾았다"가 아니라 "검증 없이 주장했다"

commander가 지적한 대로, 이건 단순 버그 발견이 아니다. PR #58의 `stateReachability.integration.test.ts`
정정 주석은 "a real user with `gopls` on PATH analyzing a real Go project reaches these same two
completion tuples through ordinary auto-discovery — no `resolution.catalog` override needed, and no
test-only API involved"라고 적었다. **이 문장은 merge된 시점의 `main`에서 거짓이었다.** 이 문장을 쓴
세션(이 lane을 이어받은 나 자신), 그걸 "모범적"이라고 승인한 계획 세션, 검토를 통과시킨 reviewer 세션
**셋 다 놓쳤고, 이유는 같다 — 아무도 `.go` 파일로 auto-discovery를 실제로 왕복시키지 않았다.** 1단계는
손으로 짠 LSP client로 gopls와 직접 통신해 `resolveProvider`를 거치지 않았고, 2단계는 catalog 구조·
version probe·readiness 신호를 각각 단위로만 검증했다. "실행해서 확인하고, 읽은 것과 검증한 것을 섞지
않는다"는 이 저장소의 원칙을, 그 원칙을 지킨다고 적은 정정 주석 자체가 어겼다.

`verified-external` tier 주장도 같은 성질이다. `catalog.ts` 주석은 "a claim users act on: point this
at your project and the answer will be trustworthy"라고 적지만, 실제로 `.go` 프로젝트를 가리킨
사용자는 `provider_required_for_language`를 받았다 — tier 주장이 근거보다 앞섰다.

## 실사용자 경로 전수 확인 (commander 요청)

gopls preset에 사용자가 실제로 닿는 경로를 전부 실행해 확인했다(`~/go/bin`을 PATH에 넣고 실제
`cli/dist/index.js`를 실행 — test harness가 아니라 진짜 CLI 바이너리):

1. **`analyze`(핵심 경로) — 수정 전 실패, 수정 후 통과.** go.mod+target.go+caller.go 3-파일 fixture로
   `node cli/dist/index.js analyze --workspace <dir> --file target.go --line 3 --column 6`을 실행.
   수정 후 응답: `provider.selectedBy: "auto"`, `provider.name: "gopls"`, `detectedLanguageId: "go"`,
   `completion.indexingStatus: "ready"`, `FixtureCaller`가 `FixtureTarget`의 caller로 정확히 보고됨.
   **이게 이 문서 전체가 고치려는 그 경로다.**
2. **`doctor gopls`(preset id만, `--file` 없음) — 애초에 이 버그의 영향을 받지 않았다.** gopls가
   PATH에 있든 없든 preset id로 직접 찾으므로 `languageId()`를 거치지 않는다(`status: ready`/`blocked`가
   gopls 유무만 반영, 수정 전후 동일하게 정확).
3. **`doctor gopls --file <x>`(language-support check) — 이건 영향을 받았었다.** `checks.ts`가
   `--file`이 주어지면 `languageId()`로 `detectedLanguageId`를 계산해 preset의 `languageIds`와
   대조한다. 수정 후 확인: `--file service.go` → `language-support` check `status: "pass"`,
   `detectedLanguageId: "go"`; `--file service.py` → `status: "fail"`, `code:
  "provider_language_mismatch"`, `detectedLanguageId: "python"`. 둘 다 기대한 대로 정확히 구분된다.

**부수 관찰(이 수정 범위 밖, 조치 안 함)**: `analyze` 응답의 `capabilities.version` 필드가 gopls의
`initialize` 응답 `serverInfo.version`을 그대로 통과시키는데, 이 machine의 gopls는 그 필드 자체에
`gopls version -json`과 같은 형태의 거대한 JSON 문자열을 담아 보낸다(`lspProvider.ts:459-460`,
`result.serverInfo?.version`을 그대로 사용). 이건 gopls 자신의 프로토콜 레벨 선택이고 Impact Lens가
계산하는 값이 아니며, `versionProbe.test.ts`가 지키는 `doctor`의 버전 지원 판정(별도의 `gopls version`
프로세스 실행)과는 무관하다.

**실측(commander 요청)**: 위 fixture로 `analyze`를 1회 실행한 실제 응답에서 이 문자열은 **3,062
byte(UTF-8)**이고, **응답 안에 `data.provider.version`과 top-level `capabilities.version` 두 곳에
byte-identical하게 중복**돼 총 **6,124 byte**를 차지한다. 이 응답 전체는 11,219 byte이므로 **응답의
54.6%가 이 하나의(중복된) 필드**다. 이 응답을 주로 소비하는 게 에이전트(토큰 과금)라는 점에서 무시할
크기는 아니다. 정확성 결함은 아니므로 이번 hotfix에서 고치지 않지만, 이 수치는 이후 별도 판단(예:
`serverInfo.version`을 자체 `version` probe 결과로 대체하거나 길이 상한을 두는 것, 그리고 애초에 왜
같은 값이 응답에 두 번 들어가는지)의 근거로 기록해 둔다.

## 테스트 및 완료 기준

- [x] `languageId('a.go')`가 `'go'`를 반환한다.
- [x] 새 교차 검증 test가 `PROVIDER_CATALOG`의 모든 preset extension에 대해 통과한다.
- [x] 이 교차 검증 test가 실제로 결함을 잡는지 음의 방향으로 확인했다(`.go` case를 임시로 제거해
  재현 → 두 test 모두 실패 → 원복 → 통과 재확인).
- [x] `npm run test:all` 전체 통과(271 CLI test + response-policy 16 + plugin-artifact e2e).
- [x] 실제 gopls를 PATH에 두고 실제 `cli/dist/index.js analyze`로 `.go` fixture를 왕복시켜
  `selectedBy: "auto"`, `indexingStatus: "ready"`를 직접 확인(위 "실사용자 경로 전수 확인" 1번).
- [x] `doctor gopls`(전수 확인 2, 3번)도 같은 방식으로 검증 — 하나는 원래 영향 없었고 하나는 이 수정으로
  같이 고쳐졌음을 확인.

## 작업 로그

### 2026-09-02 — 발견과 착수

- M2 stage 3(`test/m2-gopls-ci-verification` branch) 작업 중 real gopls를 PATH에 놓고
  `LspCallHierarchyProvider(workspace, 'target.go', undefined, ...)`를 test 전용 옵션 없이 생성하는
  test를 처음 실행했더니 `provider_required_for_language`(`detectedLanguageId: 'plaintext'`)로 실패해
  발견했다.
- commander에게 즉시 보고(발견 경위, 재현 근거, 계획 포함) — PR #58이 이미 merge된 상태에서 핵심 약속이
  지켜지지 않고 있었기 때문에 별도 긴급 수정으로 분리하기로 했다.
- stage 3 branch의 변경은 `git stash`로 보존하고(`stage3 wip: CI job + reachability tests (blocked on
  languageId .go bug)`), `main`에서 이 branch를 새로 분리했다.
