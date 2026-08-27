# M1 Wave 1 세션 Handover

- 작성일: 2026-08-27
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 실행 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md)
- 직전 인계: [`task-m1-wave0-handover.md`](task-m1-wave0-handover.md)
- 이 문서의 목적: Wave 0 종료 후 Wave 1을 진행한 세션의 상태를 인계한다. **직전 handover의 5절
  "재조사 불필요한 사실" 중 상당수가 이미 해소됐다.** 어느 것이 남았는지 6절에 적었다.

## 1. 한 문단 요약

Wave 0이 끝났고 Wave 1의 3개 lane 중 2개(`data.completion` 생산, preset catalog·doctor)와 manifest 필드
계약이 merge됐다. 양방향 LSP lane은 PR이 열려 CI 대기 중이고, 요청 override lane은 아직 실행 중이다.
Extension UX lane(Wave 2 소속)은 파일이 겹치지 않아 앞당겨 실행했고 보안 수정 1건을 요청한 상태다.
lead 결정 7건이 전부 확정됐다 — 마지막까지 미결이던 L2는 W1-A가 관측으로 닫았다. 대신 관측에서 나온
새 미결 1건(F9 stage 범위)이 생겼다.

## 2. 현재 상태

### Git

- 저장소: `~/dev/Impact-Lens`
- `main` HEAD (이 문서 작성 시점): `b914395` — `Merge pull request #38`
- 이 문서의 branch: `docs/m1-wave1-handover`

### merge 완료 (이 세션)

| PR | 내용 | merge commit |
| --- | --- | --- |
| [#34](https://github.com/moelee835/Impact-Lens/pull/34) | W0-4 provider 선택 seam 추출 (순수 이동) | `dbc6c9b` |
| [#35](https://github.com/moelee835/Impact-Lens/pull/35) | preset manifest 필드 계약 + lead 결정 7건 | `924da5f` |
| [#36](https://github.com/moelee835/Impact-Lens/pull/36) | W1-C `data.completion` 생산, 미결 1·2·3·5 종료 | `f0cb40e` |
| [#38](https://github.com/moelee835/Impact-Lens/pull/38) | W1-B preset catalog, 선택 우선순위, doctor 일반화 | `b914395` |

직전 세션이 남긴 #31·#32·#33도 모두 merge됐다.

### 진행 중 (다음 세션이 가장 먼저 확인할 것)

| lane | branch | PR | 상태 |
| --- | --- | --- | --- |
| W2-B Extension UX | `feat/m1-extension-completeness-ux` | [#37](https://github.com/moelee835/Impact-Lens/pull/37) | **보안 수정 1건 요청함** (아래 3절) |
| W1-A 양방향 LSP | `feat/m1-bidirectional-lsp` | [#39](https://github.com/moelee835/Impact-Lens/pull/39) | **검토 완료, Windows CI 대기 후 merge 가능** |
| L6 요청 override 계약 | `feat/m1-request-overrides` | 미개설 | 실행 중 |

에이전트 worktree가 `.claude/worktrees/` 아래 남아 있을 수 있다. 각 branch가 merge된 뒤 제거해도 된다.

### merge 권한

**이 세션에서 `gh pr merge`가 허용됐다.** 직전 handover는 분류기가 차단한다고 적었는데, 사용자가
`/auto-mode-setup`으로 권한을 열었다. `.claude/settings.local.json`은 gitignore 대상이라 커밋되지 않으므로,
다음 세션에서 다시 막히면 사용자에게 `/permissions`로 `Bash(gh pr merge:*)` 추가를 요청하라.
**에이전트에게는 여전히 merge를 시키지 않는다. lead가 결정한다.**

## 3. PR #37에 요청한 수정 (merge 전 필수)

`impactLens.provider.doctorCommandLine` 설정에 **`"scope": "machine"`이 빠졌다.**

VS Code에서 `scope`를 생략하면 기본이 `window`이고, `window` scope는 workspace의 `.vscode/settings.json`이
덮어쓸 수 있다. 이 값은 `src/controller.ts:runProviderDoctor`에서 `terminal.sendText()`로 셸에 그대로
들어간다. 즉 **저장소를 clone해서 여는 것만으로 그 저장소가 사용자에게 실행 명령줄을 주입할 수 있다.**

에이전트가 넣어둔 방어(명시적 command 실행 필요, 전체 명령줄을 보여주는 확인 프롬프트, 보이는 터미널,
출력 미파싱)는 전부 옳지만 **"사용자가 설정한 명령"이라는 전제 위에서만** 방어다. 프롬프트는 "내가 설정한
것"과 "저장소가 설정한 것"을 구분해주지 못한다. 신뢰 경계를 닫는 것이 프롬프트보다 앞선다.

`machine-overridable`은 안 된다 — remote/workspace 덮어쓰기를 다시 허용한다.

## 4. 승인된 lead 결정 (재논의 불필요)

전문과 근거는 [`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md)의 "lead 결정" 절에 있다.
2026-08-27 결정.

| # | 결정 |
| --- | --- |
| L1 | 신규 error code `provider_config_invalid`. `invalid_request` 재사용 기각 — 설정 파일이 잘못됐는데 "요청이 잘못됐다"고 하면 고칠 파일을 잘못 지목한다 |
| L2 | 관측 전에는 미결로 뒀고, **W1-A가 측정해 닫았다 — 차이 없음** (5절) |
| L3 | 미처리 server request는 doctor JSON + debug transcript까지만. D10의 MethodNotFound 응답이 "조용한 불완전" 경로를 닫는다는 전제이며, 깨지면 reason code 추가로 뒤집는다 |
| L4 | `coverage.indexing.evidence`는 `{ signal, detail }`. **`observedAtMs` 제외** — 응답에 벽시계 값이 들어가면 이 저장소가 의존하는 바이트 비교 검증이 무력화된다. 필요하면 요청 시작 기준 경과 시간으로 재제안 |
| L5 | D8 제한 수치 승인: depth 16 / 트리당 64 KiB / 1000키 / prototype key 전 depth 거부. 완화는 호환·강화는 파괴적이라는 비대칭 때문에 좁게 시작 |
| L6 | 요청 스키마 3필드(`providerPreset`/`initializationOptions`/`settings`)는 별도 lane. **이름은 확정** |
| L7 | `provider_ipc_unavailable` stage — 문서를 코드에 맞춤. **handover 6절 미결 4번 종료** |

W1-C가 직전 handover 6절의 미결 1·2·3·5도 닫았다. 결론은 [`task-m1-completeness-emit.md`](task-m1-completeness-emit.md)에 있다.

## 5. 미결 항목

| # | 항목 | 누가 닫는가 |
| --- | --- | --- |
| 1 | **F9 stage 범위가 한 값 넓다** — W1-A 관측 | 계약 lane (`il-contract-architect`) |
| 2 | **D6** — `V1_WITHHELD_REASON_CODES`를 언제 비우는가 | W2-C와 연속 PR |
| 3 | `cli-contract.md`·`SKILL.md` 낡은 서술 일괄 갱신 | 별도 lane (6절) |
| 4 | trusted project tier의 workspace 인자 전달 | W1-A merge 후 1줄 (6절) |

**L2는 닫혔다.** W1-A가 격리 측정했고 **차이가 없다.** step 3 직전·직후 캡처가 29개 시나리오 전부
바이트 동일이다. `workspace.configuration` 선언은 bundled TypeScript 동작을 바꾸지 않는다.
"bundled 동작 무변경" 제약은 완화할 필요가 없었다.

### 1번 — F9 stage 범위

L7로 `provider_ipc_unavailable`의 stage를 `{launch, initialize, query}`로 넓혔는데, W1-A가
**`query`는 도달 불가능**함을 확인했다.

`looksLikeSilentProviderFailure`는 `bytesFromServer === 0`을 요구한다. 그런데 query 단계에 도달하려면
initialize 응답을 받아야 하고 그러면 그 카운트가 0이 아니다 — `queryExitServer` fixture가 164 bytes다.
따라서 실제로 나올 수 있는 값은 `launch`와 `initialize` 둘뿐이다.

**계약 표를 `{launch, initialize}`로 좁혀야 한다.** 미결 4번을 닫은 것과 같은 이유다 — 아무도 관측할 수
없는 값을 계약에 적으면 그 값은 추측이 된다. W1-A는 `provider-coverage-contract.md`와 `childIpc.ts`를
건드리지 않았다(소유 밖).

### 2번 — D6

W1-C가 `no_incoming_callers`와 `index_state_unknown`을 `data.limitationDetails`에는 넣고 v1
`coverage.reasons`/`limitations`에서는 **보류**했다. caller 0건은 오늘도 이미 일어나므로, 지금 넣으면
배포된 필드의 값이 바뀐다.

**이것은 "0건인데 `complete: true`, `reasons: []`"라는, 정확히 M1이 없애려는 오해를 v1 소비자에게 당분간
남긴다는 뜻이다. 잊히면 안 된다.**

`cli/src/coverage.ts`의 `V1_WITHHELD_REASON_CODES` 상수 하나로 격리돼 있고 **이 집합을 비우는 것이 변경
전부**다. plugin 문서·summary template·eval(W2-C)과 **같은 릴리스로** 푼다. 소유가 갈리는 파일이므로
(상수는 CLI = `il-contract-architect`, eval은 `plugins/**` = `il-plugin-docs`) **연속 PR로 묶어** CI가
빨간 상태로 머물지 않게 한다.

## 6. 다음 세션의 작업 순서

### 1) PR #38 — merge 완료 (`b914395`). 참고용 기록

merge 전에 확인한 것:

- `scripts/test-plugin-artifact-e2e.mjs`의 assert가 **느슨해지지 않았다.** `selectedBy === 'bundled'`를
  근거 주석과 함께 정확히 유지하고, `detectedLanguageId`/`requestedLanguageId`/`languageMatch`와 doctor
  check 전수 `pass`를 **추가**했다. 이전에는 `mode`만 봤기 때문에 모든 check가 실패해도 통과했다.
- `cli/package.json`의 `files`에 `"dist/doctor/*.js"`가 들어갔다. 빠지면 릴리스 설치본이 **모든 명령에서**
  `MODULE_NOT_FOUND`로 죽는데 단위 테스트 194개는 전부 green이다. `test:plugin-artifact`만 잡는다.

### 2) PR #37 merge (3절 수정 확인 후)

### 3) PR #39(W1-A) merge, 이어서 L6 merge

W1-A 검토는 끝났다. 확인한 것:

- **L2 관측 완료, 차이 없음.**
- `data.provider.observed.diagnostics`가 8개 성공 시나리오에서 `false → true`로 바뀐다. **회귀가 아니라
  수정이다.** 변경 전 build의 baseline이 `true`를 낸 적이 있어 옛 `false`가 경쟁 결과였음이 드러났고,
  transcript상 bundled TypeScript는 열린 문서 4개 모두에 대해 publish한다. 에이전트는 캡처를 맞추려고
  코드를 고치지 않았다 — 옳은 처리다.
- 새 테스트가 vacuous하지 않음을 증명했다: `classifyIncoming`을 id 우선 순서로 되돌리면 6개 중 4개가
  실패한다.
- **pushed branch를 rebase하지 않고 merge했다.** rebase는 published history를 다시 쓰고 force push가
  필요한데 `AGENTS.md`가 금지한다. 옳은 판단이다.

**W1-A가 의도적으로 남긴 것 3건** (근거는 작업 문서에):
세션 전체 분석 예산(현재 성공하는 분석에 새 실패 모드를 더하는데 수치를 정당화할 관측이 없다. cancellation이
생겼으므로 Wave 2의 readiness budget과 함께 넣는다), D8 크기·depth 검증(실패 code가 W1-C 소유이고 검증
지점이 W1-B의 `providers/`다), 요청 수준 필드 배선(L6 후속 lane).

L6은 `cli/src/index.ts`에서 W1-B와 블록이 다르지만 rebase가 필요할 수 있다.

### 4) W1-A merge 직후 — 1줄 후속

W1-B의 반박 6번이다. **trusted project tier가 `cwd` fallback 없이 명시적 workspace를 받아야 한다.**
호출부가 `lspProvider.ts`(W1-A 소유 파일)라 W1-B가 넣지 못했다.

```
resolveProvider(file, command, { workspace: this.workspace })
```

### 5) `cli-contract.md` 일괄 갱신 lane

**두 lane의 변경이 한 파일에 쌓였다. 하나의 후속 lane이 전부 가져가야 한다.**

W1-C가 남긴 7건 (`task-m1-completeness-emit.md` Appendix B):
"traversal·semantic·indexing coverage를 확인하라" 문단, `complete` 정의 문장, metadata JSON 예시
(`completion` 누락), 같은 예시의 `reasons` (`limitationDetails` 누락), "`complete: true`가 무효화하지
않는다" 문장(금지 문구 목록 필요), caller 0건 보고 규칙 누락, 그리고 7번은 W1-B발이다.

W1-B가 남긴 것: `cli-contract.md`의 "provider 없으면 비-TS/JS는 무조건 에러"(Auto 도입으로 **정반대
명제가 됐다**), `doctor bundled-typescript` 고정 형태와 예시 응답, `SKILL.md`의 doctor 안내,
`provider-coverage-contract.md`의 fixture 표가 doctor가 그 code들을 **던진다**고 읽히는 부분(실제로는
check `code`이지 throw가 아니다).

### 6) W2-A 착수

**W1-A와 W1-B가 둘 다 merge된 뒤에만 가능하다.** 파일이 W1-A와 정면으로 겹치고(`jsonRpc.ts`, `lsp/**`,
`lspProvider.ts`), 내용상 W1-B의 `ProviderReadinessProfile` 위에서만 구현된다.

- branch: `feat/m1-provider-readiness`, 역할 `il-lsp-protocol`
- static/dynamic registration을 단일 observed state로 병합, `$/progress` token 추적, preset별 readiness
  probe와 max wait budget, `not_ready`와 실제 empty graph 구분, `coverage.indexing.status` 실측화
- 값을 받을 경로는 W1-C가 이미 열어뒀다

### 7) W2-C + D6 연속 PR

W2-A와 W1-B의 사용자 노출 문구가 고정된 뒤. 5절 2번과 함께 처리한다.

### 8) Wave 3

W3-A(호환성 matrix), W3-B(사용자 테스트 명세), W3-C(`il-reviewer` 명세 검토).

**M1 종료 gate의 마지막 항목은 에이전트가 닫을 수 없다** — 실제 사용자 검증은 별도 승인이 필요한
트랙이다. 보류로 가더라도 사유를 release decision에 기록하면 gate는 닫힌다. M0가 지금 같은 지점에 있다.

## 7. 캡처 비교 함정 — 5건으로 늘었다

이 저장소의 리팩터링 검증은 **응답 바이트 비교**에 의존한다. 직전 handover는 함정 1건만 적었다.
**지금은 5건이고, 각각 실제로 어떤 lane의 증명을 무효화했다.**

| # | 함정 | 발견 |
| --- | --- | --- |
| 1 | `mkdtemp`를 쓰면 비결정적. `symbolId`가 파일 URI를 해싱하고 note conflict token이 workspace 경로를 담는다 | W0-4 |
| 2 | **baseline과 after가 같은 고정값을 써야 한다.** 직전 handover의 "workspace 경로를 고정하라"는 부정확했다. W1-B가 양쪽에 서로 다른 고정 경로를 주자 29개 중 11개가 달라졌다 | W1-B |
| 3 | `os.tmpdir()`이 프로세스 간 불안정하고 scratchpad가 **병렬 lane과 공유된다.** W1-C의 첫 baseline이 다른 lane에 덮어써졌다 | W1-C |
| 4 | **W0-4의 캡처 스크립트가 workspace를 `os.tmpdir()/il-provider-seam-capture-fixed`로 lane 이름 없이 하드코딩했다.** 그 스크립트를 재사용하는 모든 lane이 한 디렉터리를 공유한다 | W1-B |
| 4b | **더 나쁜 경우: 공유 scratchpad의 캡처 스크립트 자체가 다른 lane에 의해 편집됐다.** W1-A가 자기 사본에서 workspace 기본값이 `il-m1-preset-catalog-capture-fixed`로 바뀌고 `VOLATILE_PATHS` 마스킹이 추가된 것을 발견했다. 작업 문서의 원문과 diff해서 찾았다 | W1-A |
| 5 | `provider.observed.diagnostics`가 **비결정적**이다. 고정 100ms `publishDiagnostics` 대기가 부하 상황에서 경쟁에 진다. 기존 결함이고 W1-A가 2단계에서 고친다 | W1-C |

**규칙:**

- 캡처 경로에 lane 이름을 포함해 고유하게 지정한다.
- **baseline을 두 번 떠서 `diff -r`이 비는지 확인한 뒤에야 기준선으로 인정한다.** 이 확인 없이 "바이트
  동일"을 보고받으면 근거로 인정하지 마라.
- **캡처 스크립트를 공유 scratchpad에서 재사용하지 말고, 작업 문서의 원문에서 다시 추출하라.** 사본이
  다른 lane에 편집돼 있을 수 있다.
- 비교 base는 **현재 `origin/main`** 이어야 한다. W1-B는 `dbc6c9b`로 시작했다가 W1-C의 `completion`
  필드가 자기 변경으로 읽히는 것을 발견하고 `f0cb40e`로 올렸다.
- 차이가 `observed.diagnostics`에만 있으면 그 lane의 회귀가 아니다. **그 필드를 동일하게 만들려고 코드를
  고치면 안 된다.**

## 8. 운영에서 새로 확인된 것

직전 handover 9절에 더한다.

- **worktree lane은 `npm install`과 `npm --prefix cli install`을 둘 다 해야 한다.** 새 worktree에
  `cli/node_modules`가 없어 `cli:test`가 9건 실패한 사례가 있었다. `git diff origin/main...HEAD -- cli/`가
  0건인지 먼저 확인하면 자기 변경과 환경 문제를 구분할 수 있다.
- **"결론과 근거를 작업 문서에 적어라"가 계속 효과를 냈다.** 이 세션에서만 지시의 오류 여러 건이
  에이전트 반박으로 잡혔다: 릴리스 tarball을 깨뜨리는 `files` 누락(W0-4, W1-B), 계약 문서가 코드보다
  틀렸다는 판정(W1-C의 `internal_error`), 타입으로 표현할 수 없는 금지 조합(W1-C의 X1/X7/X10),
  접근 자체가 불가능한 UI 요구(W2-B의 CodeLens), server request id 진단의 오류(manifest lane의 D12).
- **직전 handover의 진단이 틀린 경우가 있었다.** D12가 "server request id 네임스페이스 충돌"을
  "디스패치 버그"로 정정했다. 5절을 "재조사 불필요한 사실"로 넘길 때 **진단과 관측을 구분해서** 넘겨라.
- 리팩터링·계약 lane에는 "테스트 통과"가 아니라 **"변경 전후 바이트 비교"** 를 완료 조건으로 준다.
  이 세션의 lane들은 각각 29건 규모로 비교했고 전부 이 과정에서 함정을 발견했다.

## 9. 주의사항

직전 handover 10절이 대부분 유효하다. 갱신된 것만 적는다.

- **`scripts/test-plugin-artifact-e2e.mjs`의 assert는 W1-B가 이미 갱신했다.** 직전 handover가 "Wave 3에서
  갱신한다"고 적은 것은 더 이상 맞지 않다. W3-A는 갱신이 아니라 **matrix 확장**을 한다.
- `npm run test:all`은 네트워크를 요구한다. 오프라인 경로는 `npm run test:unit`이다.
- `main`/`master`에서 파일을 변경하거나 push하지 않는다. `AGENTS.md` 0절.
- 검증되지 않은 언어를 `verified-external`로 문서화하지 않는다. M1은 TypeScript reference preset까지다.
- `schemaVersion`을 2로 올리지 않는다. M1은 additive만 한다.

## 작업 로그

### 2026-08-27 — Wave 1 세션 인계

- Wave 0 종료 후 Wave 1을 착수한 세션의 상태를 인계하기 위해 작성했다.
- merge: #34(W0-4), #35(manifest 계약), #36(W1-C). `main`이 `84188ea`에서 `f0cb40e`로 이동했다.
- lead 결정 7건 중 6건 확정, L2만 미결로 남겼다. 관측 전 결정은 추측이라는 이유다.
- Wave 2의 W2-B를 사용자 지시로 앞당겨 병렬 실행했다. 파일이 겹치지 않아 가능했고, 계약 미러링을
  금지해 드리프트 위험을 범위로 통제했다.
- 라인 번호를 본문에 적지 않았다. 직전 handover에서 라인 번호가 merge로 전부 이동해 쓸모가 없어졌기
  때문이다. 심볼 이름과 파일 경로로만 참조한다.
