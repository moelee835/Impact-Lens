# M4 v0.9.0 release 정합성

- 상태: 진행 중 — B-1(버전 소유 위치 재조사)·B-2(버전 선택)·CHANGELOG 사실 대조 완료, B-3(실제
  반영)·B-4(공개 default-path 사후 검증) 진행 예정. **태그 발행·GitHub Release 생성은 이 lane의
  범위 밖**(commander 지시) — PR merge까지만 하고 발행은 사용자 확인 후 commander가 진행한다.
- branch: `release/v0.9.0`
- 선행: `docs/work/task-m2-release-0-8-0.md`(B-1/B-2/B-4 방법론의 전례), M4 gate 1~8 전부 닫힘
  (PR #109가 M4 종료 처리를 reviewer 재확인 중).
- 사용자 결정 셋(재확인): 버전 `v0.9.0`, augmentation 기본값 off로 출하, 사용자 테스트 가이드는
  작성만 하고 실행은 후속.

## 목적과 사용자 가치

M4가 만든 기능(augmentation candidate caller, evidence 어휘, `IL-LIM-010` test 분류 설정,
언어별 한계 문서 정정)을 실제로 설치 가능한 v0.9.0으로 사용자에게 전달한다. 이 lane이 끝나면
사용자는 발행된 CLI/Extension/Plugin에서 이 기능들을 실제로 쓸 수 있게 된다 — 다만 augmentation
자체는 기본값 꺼짐으로 남아, "쓸 수 있다"가 "기본으로 켜져 있다"를 뜻하지 않는다.

## commander의 CHANGELOG 초안 사실 대조 — 완료, 결함 4건 발견·수정

commander가 `release/v0.9.0`(`5c7bb8b`)에 올린 CHANGELOG 0.9.0 초안을 문장 하나하나 근거 문서·
코드와 대조했다. **인용을 세 번 틀렸다는 경고를 받아, 모든 수치를 재확인 없이 그대로 옮기지
않았다.**

**검증 통과(그대로 유지)**: recall "약 57%"(gate7 §3-3 정정, `12/21`) 일치. "잔여 7건" 개수
gate7 §6 최종 판정 목록과 일치. `717`파일/`8개 중 7개` gate7 §3-3 일치. "468 of 468" IL-LIM-010
분류기 corpus 실측과 일치. `test_pattern_config_invalid` exit code 8 — `cli/src/errors.ts`
직접 확인. `gopls v0.19.1`/`clangd 17.0.0`/`typescript-language-server 6.0.0`/`pyright 1.1.413`
— `catalog.ts`/`cli/package.json` 직접 대조, 전부 일치. `impactLens.augmentationEnabled`(기본
`false`) — `package.json`/`src/impactAnalyzer.ts` 확인. **CLI의 `--augmentation` 플래그도 실재
확인**(`cli/src/index.ts`의 `allowedOptions`/`options.get('augmentation') === true` — 처음엔
`--stdin` JSON 필드만 있는 줄 알았으나 위치 인자 플래그도 따로 있다는 걸 코드에서 직접 확인).
Jest `testPathIgnorePatterns` exclude-always-wins 모델 — IL-LIM-010 stage 1 설계 문서와 일치.
`data.edges` byte-for-byte 무변경, `evidenceSource`(초안엔 `source`로 오기, 아래 참고)/
`resolution` 두 값(`single`/`multiple`)에 `confirmed` 값 없음 — `cli/src/types.ts` 직접 확인.
vue-core `onUpdated` 한 곳에서 거부 3건 — IL-LIM-001/002 설계 문서 일치. 6종 mount 오탐 형태 —
gate4 문서 일치. VS Code test 색상 제거 — gate5 문서 일치. TS/JS·Python·Go·C 4개 언어 반복 fixture
— `gate1LanguageLimitations.test.ts` 실재 확인.

**결함 4건, 수정함**:

1. **필드명 오기**: "in two independent axes: `source` (`static-inference`) and `resolution`"
   — `AugmentedEdge`에는 이미 `source`(caller 자신을 가리키는 `AugmentedEndpoint` 필드)가 있고,
   static-inference/runtime-observation 값을 담는 필드는 **`evidenceSource`**다(`cli/src/
   types.ts:568-572`). `source`로 쓰면 이미 존재하는 다른 필드와 이름이 충돌해 사용자가 스키마를
   더 헷갈리게 된다. `evidenceSource`로 정정.
2. **두 실측을 하나로 합성**: "The same eight real-project queries went from 2 clear false
   positives and 3 misses to 6 of 6 correct." — **8-query census(`Netflix/dispatch`)와 단일
   쿼리 실측(`tiangolo/full-stack-fastapi-template`의 `get_current_active_superuser`)을 하나의
   문장으로 합쳤다.** 실제로는 서로 다른 두 프로젝트, 다른 쿼리 수의 별개 실측이다(gate7 §3-3,
   task-m4-fastapi-depends-enclosing-scope-fix.md, milestone-closure-audit의 4차 정정으로 최종
   수치 확정: template은 6개 정답 중 전에 4개 위음성+2개 오탐이었다가 고친 후 6/6·오탐 0, dispatch
   8-query는 오탐 8건(6개 쿼리에 걸쳐)이 고친 후 0건, recall-target 6개는 이미 정답이었거나
   그대로 유지). 두 문장으로 나눠 각자의 프로젝트·수치를 정확히 적었다.
3. **"수정됨"과 "측정 후 미수정으로 남김"을 합성**: "a callback registered inside a method
   written in shorthand form, or inside an inline arrow function, was attributed to the wrong
   enclosing scope rather than being abandoned." — PR #99(`61d055c`)의 커밋 로그를 다시 읽으면
   **method shorthand(object-literal/class)는 이 PR이 실제로 고쳤지만, inline arrow 채널은
   commander가 명시적으로 "여기서 안 고친다"고 지시한 항목**이다(측정 결과 지금 31개 실제
   호출 지점 중 오귀속 0건이지만, 두 인식 공백이 우연히 겹쳐 있는 "빌려온 안전"이라 별도 미해결
   잔여로 남겼다). 초안대로 두면 아직 안 고친 걸 고친 것처럼 읽는다 — method shorthand는 "고침",
   arrow는 "측정하고 이름 붙인 미해결 잔여"로 분리해 적었다.
4. (경미) 6종 mount 오탐 목록에서 "dict value" 한 항목이 원문의 "dict·attr 대입"(dict/attribute
   대입) 중 attribute를 빠뜨렸다 — "dict or attribute value"로 보강.

## B-1. version 소유 위치 재조사 — 오늘, `git grep`으로 직접 전수

`grep -rn "0\.8\.0"`으로 저장소 전체를 다시 훑었다(`node_modules/`·`.git/`·`.claude/`·`dist/`·
`out/`·`.agents/` 제외). M2 문서의 표를 신뢰하지 않고 이 결과만 근거로 쓴다.

**기능적 — 안 바꾸면 깨진다**

| 위치 | 역할 | M2 문서 대비 |
| --- | --- | --- |
| `package.json:6` | Extension/VSIX version | 동일 위치 |
| `cli/package.json:3` | CLI package version, tarball 파일명 결정 | 동일 위치 |
| `cli/src/test/contract.test.ts:31` | `runtime.cli.version` 계약 assertion | 동일 위치(줄 번호도 그대로 — M4는 이 파일을 안 건드렸다) |
| `plugins/impact-lens/scripts/run-impact-lens:11` | release fallback tarball URL pin — Release 실재 후에만 유효, 발행 3단계와 함께 묶는다 | 동일 위치 |
| `plugins/impact-lens/.claude-plugin/plugin.json:4` | plugin payload version, 현재 `0.4.0` | 동일 위치 |
| `plugins/impact-lens/.codex-plugin/plugin.json:3` | plugin payload version, 현재 `0.4.0` | 동일 위치 |

**사용자 대상 — 낡으면 링크·명령이 깨진다**

| 위치 | 역할 | M2 문서 대비 |
| --- | --- | --- |
| `README.md:11,52,55,64,280` | badge, VSIX/CLI 설치 명령, runner fallback 설명 | 4곳 동일, 276→280(M4가 그 사이 "augmentation" 절을 추가해 4줄 밀림) |
| `INSTALL.md`(17개 행: 10,56,63,72,83,92,97,101,102,111,187,229,233,238,244,250,251) | 다운로드 URL, 설치·확인·digest 명령 | **완전히 동일** — 개수·줄 번호 둘 다 M2 시점과 같다. M4의 어떤 lane도 INSTALL.md를 건드리지 않았다. |
| `docs/DEVELOPMENT.md:188,193,208,227,233,243` | VSIX 파일명·release 절 예시 | **완전히 동일**, 줄 번호도 그대로 |
| `CHANGELOG.md` | `Unreleased` → `0.9.0` 절 확정 | 동일(historical `0.8.0` 이하 절은 안 건드린다) |

**표에 없던 새 위치 — 불활성이지만 일관성을 위해 함께 올린다**

| 위치 | 역할 | 확인 |
| --- | --- | --- |
| `scripts/fixtures/response-policy/01~30-*.json`(**30개**, M2 시점 21개에서 **9개 늘었다** — M4가 27~30번 추가) | `test-response-policy.mjs`/`response-policy-engine.mjs` 둘 다 여전히 fixture의 `version` 필드를 안 읽는다(`grep -n "version"` 0건, 오늘 재확인) | 불활성 확인. **다만 이미 어긋나 있다** — 26개는 `"0.8.0"`, M4가 새로 쓴 27~30번은 이미 `"0.9.0"`으로 앞서가 있다. B-3에서 30개 전부 `0.9.0`으로 통일한다. |
| `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:29,35,290` | 계약 예시 응답 | M2 시점과 완전히 동일한 줄 번호(M4가 이 파일에 132줄을 추가했지만 예시 응답이 있는 세 줄 자체는 안 옮겨졌다) |

**바꾸지 않는다 — 역사적 기록**: `CHANGELOG.md`의 `0.8.0`/`0.7.0`/... 과거 절, `docs/work/task-m2-*.md`
등 이미 완료된 작업 로그, `docs/development-management/milestones/m2-p1-language-support.md`같은
이전 마일스톤 상태 기록. `pnpm-lock.yaml`의 `0.8.0`은 무관한 npm dependency의 `engines` 필드
(`grep -n "impact-lens" pnpm-lock.yaml` 0건으로 재확인).

**확인했지만 위치가 아닌 것**: `.github/workflows/**`를 `0.8.0`으로 다시 grep — **0건**, M2
시점과 동일하게 어떤 workflow도 버전을 하드코딩하지 않는다.

**M2 문서와의 차이 요약**: 새 기능적/사용자 대상 위치는 **없다**. README.md만 4줄 밀렸고
(M4의 새 augmentation 절), INSTALL.md·docs/DEVELOPMENT.md·cli-contract.md는 줄 번호까지
완전히 그대로다. 유일한 실질 차이는 response-policy fixture가 21→30개로 늘고 그중 4개가 이미
`0.9.0`으로 미리 나가 있어 지금 내부적으로 불일치 상태라는 것.

## B-2. 버전 선택

### CLI/Extension: `0.9.0`

M4는 **augmentation candidate caller + evidence 어휘 + test 분류 설정**을 추가하는 additive
릴리스다 — 기존 필드 제거·재정의 없음. `cli/schemas/` 아래 스키마 파일 자체는 v0.8.0 이후
**한 줄도 안 바뀌었다**(`git diff v0.8.0..HEAD --stat -- cli/schemas/` — 출력 없음),
`response.schema.json`의 `required`(`schemaVersion`/`operation`/`ok`/`runtime`)도 그대로다.
**`schemaVersion`은 1을 유지한다.**

- **무엇이 추가됐는가**: `data.augmentedEdges`(신규 최상위 필드, `augmentationEnabled: true`일
  때만 채워짐), 5개 신규 `limitationDetails` code(`augmentation_budget_exceeded`/`framework_
  route_mount_unresolved`/`augmentation_adapter_failed`/`augmentation_internal_error`/
  `augmentation_inference_unresolved`), node별 `testRule`/`testRuleSuppressed` 신규 필드,
  `.impact-lens/test-patterns.json`/`.local.json` 신규 설정 파일과 그 오류 code
  `test_pattern_config_invalid`(exit 8), CLI의 `--augmentation`/`augmentationEnabled` 요청
  필드.
- **무엇이 안 깨졌는가**: `data.edges`/`data.nodes`는 augmentation on/off와 무관하게 byte-for-
  byte 그대로(A1에서 직접 실측 확인, `docs/development-management/user-tests/
  m4-user-test-spec.md` §6). 기존 5개 언어 preset의 `docs.limitations` 문장 변경(Go 세 문장으로
  분리, C 문장 보강)은 **문서 변경이지 응답 스키마 변경이 아니다** — 어떤 필드도 이름·타입이
  바뀌지 않았다.
- **`0.9.0`이 자연스럽다**: minor다. patch가 아닌 이유는 새 필드·새 code 여러 개가 patch 범위
  (버그 수정)를 넘는 신규 기능이기 때문이고, major가 아닌 이유는 기존 소비자를 깨는 제거·재정의가
  없기 때문이다 — M2의 `0.8.0` 판단과 정확히 같은 논리.

### Plugin payload: `0.4.0` → `0.5.0`

M2의 판단 기준(“agent 지침의 상태 어휘·판정 규칙이 바뀌면 patch가 아니다”)을 그대로 적용한다.
`git diff v0.8.0..HEAD --stat -- plugins/impact-lens/`로 직접 확인: `SKILL.md`(+7줄),
`references/cli-contract.md`(+132줄)가 실제로 바뀌었다. `commands/analyze.md`는 **안 바뀌었다**
(M2 때와 달리 이번엔 세 파일이 아니라 두 파일만 변경 — 확인 없이 셋 다 바뀌었다고 가정하지
않았다). 내용은 agent가 반드시 따라야 할 새 판정 규칙이다: `augmentedEdges` 항목을 "candidate
caller"로만 부르고 `edges`와 같은 문장에서 "caller"로 섞어 쓰지 말 것, 5개 augmentation
limitation code를 각각 어떻게 요약할지, **Go/C에서 `data.edges`의 "confirmed" 단언이 약하다는
각주**(이번 M4 gate 1 lane D 발견의 직접 반영) — 전부 agent 응답의 정확성에 직접 영향을 주는
신규 지침이므로 patch가 아니라 minor다. 필드 제거·재정의는 없다(두 diff 모두 순수 추가,
`+139 -0`).

## 다음 단계 (commander 확인 대기, 착수 안 함)

1. B-1/B-2 확인 후 실제 반영: 위 표의 모든 위치를 `0.9.0`으로, plugin manifest 2개를
   `0.5.0`으로, response-policy fixture 30개 전부(이미 앞서간 4개 포함) `0.9.0`으로 통일.
2. CHANGELOG의 `## Unreleased`를 `## 0.9.0`으로 확정(이미 이 문서 상단 절에서 사실 대조·수정
   완료).
3. B-4(공개 default-path 사후 검증) — `task-m2-release-0-8-0.md`의 B-4와 같은 방법으로, 상위
   우선순위 경로(explicit path, checkout, global 설치)를 전부 명시적으로 막고 `runner.source`가
   실제로 `release-fallback`으로 떨어지는지 확인. **발행된 아티팩트가 아직 없으므로, 태그·Release
   발행 후에만 실행 가능** — 이 lane은 PR merge까지만 하므로, B-4는 발행 후 별도로 수행하거나
   commander가 발행 시점에 직접 수행한다(아래 "범위" 참고).
4. 전체 재검증(`cli:test`/`test`/`test:response-policy`), commit, push, PR — **태그 발행·GitHub
   Release 생성은 하지 않는다.**
