# M1 사용자 테스트 명세 — Provider 플랫폼과 무설정 UX 기반

- 대상 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../milestones/m1-provider-platform-ux.md) 4단계
- 작성 기준 release candidate: CLI/Extension `0.6.3`, Plugin payload `0.2.5` (원문 그대로. **2026-08-31
  정정**: 이 문구는 작성 시점에 이미 부정확했다 — 이 명세는 M1이 merge된 미발행 `main`을 기준으로 썼는데
  마지막으로 "발행"된 버전인 `0.6.3`을 적었다. 이 명세는 v0.7.0으로 발행된 코드 상태를 기준으로 작성됐다.
  경위: [`task-m1-release-0-7-0.md`](../../work/task-m1-release-0-7-0.md) 작업 로그)
- 상태: 작성 완료, 검토 완료(작성자가 아닌 세션의 검토 1회 — W3-C가 의도한 두 번째 독립 검토는 승인이
  오지 않아 만료됨. 경위는 [task-m1-user-test-spec.md](../../work/task-m1-user-test-spec.md) 작업 로그
  참고). **아직 실행하지 않았다.**
- 작성 규칙: [마일스톤별 사용자 테스트 명세 계획](../milestones/user-validation-planning.md)
- 근거: [IL-LIM-009 완전성 의미론](../stories/il-lim-009-completeness-semantics.md),
  [IL-LIM-005 사용자 지정 LSP 호환성 확장](../stories/il-lim-005-custom-lsp-compatibility.md),
  [W3-A 상태 도달 가능성 검증](../../work/task-m1-state-reachability.md) (PR #49),
  [W2-C plugin 응답 정책](../../work/task-m1-plugin-response-policy.md) (PR #48),
  이 작업의 작업 문서: [task-m1-user-test-spec.md](../../work/task-m1-user-test-spec.md)

이 문서는 명세일 뿐이며, 존재만으로 사용자 검증을 통과한 것으로 표시하지 않는다. 실행은 별도 승인,
참여자 모집과 환경 준비 후에 수행한다.

설치·초기화·runner 우선순위 절차는 M0 이후 바뀌지 않았으므로 [M0 테스트 환경 구성과 초기화
가이드](m0-environment-setup.md)를 그대로 따른다. 이 문서를 다시 쓰지 않고, M1에서만 필요한 준비는
§5에서 그 위에 더한다.

## 1. 검증 목적

M1의 종료 gate는 "[m1-provider-platform-ux.md](../milestones/m1-provider-platform-ux.md) 4단계"가 요구하는
네 가지를, **실제 사람이 provider 내부 지식 없이** 달성하는지를 본다. 자동 검사는 이미 각 축의 *기계 쪽
절반*을 증명했다 — 축 1~3은 W1~W3-A가 provider 선택·discovery·완료 상태가 정확한 값을 반환하는지
증명했고, 축 4는 W2-C의 response-policy eval(`scripts/test-response-policy.mjs`)이 **에이전트 요약이
정책을 지키는지**(예: `complete: true`만으로 "영향 없음"을 결론짓는 요약을 fixture가 실패시키는지)를
증명했다 — CLI가 정확한 값을 반환하는지가 아니라, 그 값을 옮기는 문구가 규칙을 지키는지를 본다는 점에서
축 1~3과 증명 대상이 다르다. 이 테스트는 두 경우 모두 나머지 절반, 즉 **사람이 실제로 그렇게 읽는지**를
본다.

1. **Auto로 시작한다.** provider command/args를 알지 못한 채 TypeScript 또는 JavaScript 프로젝트에서
   함수 변경 영향을 확인할 수 있는가. (§6 T1, §2에서 범위를 TS/JS로 명시적으로 한정하는 이유 참고)
2. **doctor 안내만으로 missing/unsupported를 해결한다.** 진행자가 답을 알려주지 않고, 도구 자신의 출력만
   보고 복구할 수 있는가. (§6 T2)
3. **필요할 때 custom 설정으로 전환한다.** provider가 없는 언어에서 `provider_required_for_language`를
   고장이 아니라 "이 언어는 아직 preset이 없다"로 해석하고, custom provider로 넘어갈 수 있는가. (§6 T3)
4. **`complete`의 정적 범위를 올바르게 해석한다.** `complete: true`인 빈 결과를 보고 "안전하게 지워도
   된다"로 결론짓지 않는가. IL-LIM-009가 막으려는 사고이자, 이 문서에서 가장 값진 과업이다. (§6 T4, §7의
   유도 편향 금지 규칙 참고)

## 2. 이번 테스트로 판단하지 않을 항목

M0와 마찬가지로 정적 Call Hierarchy의 절대 정확도, 대규모 workspace 성능(M5), Note 사용성(M6), graph
시각 디자인 선호도, 성공률·지연 시간의 합격 수치(§10에서 baseline만 잰다)는 판단하지 않는다. Node
버전·CLI artifact·release fallback 복구는 M0가 이미 검증했고 이 계층은 M1에서 바뀌지 않았으므로
반복하지 않는다 — 필요하면 [M0 명세](m0-user-test-spec.md) T4~T6을 그대로 재사용한다.

다음은 M1이 새로 마주치는, **오늘 코드로는 검증할 수 없는** 항목이다. 조용히 빼지 않고 사유와 함께
남긴다. 사유는 모두 코드에서 직접 확인했다 — milestone 문구가 아니라 코드가 근거다.

| 항목 | 왜 지금 검증 불가능한가 | 무엇이 바뀌어야 검증 가능해지는가 |
| --- | --- | --- |
| 색인 진행 중(`working`) 안내 이해 | shipped catalog의 유일한 preset(`bundled-typescript`, `cli/src/providers/catalog.ts:36`)이 `readiness`를 선언하지 않는다. `readiness`는 `ProviderPreset`(catalog 항목)에만 존재하는 필드이고(`cli/src/providers/preset.ts:105-110`), 요청 JSON·`.impact-lens/provider.json`(`cli/src/providers/projectConfig.ts:17`, 허용 필드에 `readiness` 없음) 그 무엇으로도 사용자가 추가할 수 없다. `ready`/`working`을 만드는 유일한 경로는 `LspCallHierarchyProvider` 생성자의 `resolution.catalog` override인데, 이는 `stateReachability.integration.test.ts`·`readiness.integration.test.ts` 같은 test 코드 전용 TypeScript API이며 CLI의 stdin JSON이나 CLI 인자 어디에도 노출되지 않는다. W3-A가 이 세 상태(`unknown`만)를 shipped catalog 도달 가능 집합으로 확정했다(PR #49). | catalog에 `readiness`를 선언한 `verified-external` preset이 추가돼야 한다. gopls가 첫 후보([IL-LIM-004](../stories/il-lim-004-first-class-language-presets.md), M2). |
| `provider_project_metadata_missing` 안내로 누락 파일을 스스로 채우기 | 이 오류는 preset의 `readiness.requiredProjectFiles`가 선언돼 있을 때만 발생한다(`cli/src/providers/readiness.ts:69-109`, `assertProjectMetadata`는 `this.readiness`가 있을 때만 호출됨 — `cli/src/lspProvider.ts:537-544`). `requiredProjectFiles`도 `readiness`의 하위 필드이므로 위 항목과 같은 이유로 오늘은 어떤 preset도 선언하지 않았고 사용자가 선언할 수도 없다. | 위와 동일 — `readiness.requiredProjectFiles`를 선언한 preset이 필요하다. |
| 비-TypeScript/JavaScript 언어에서 Auto 성공 | `verified-external` tier preset이 catalog에 하나도 없다(`cli/src/providers/catalog.ts`: `PROVIDER_CATALOG`는 `bundled-typescript` 하나뿐). auto-discovery는 catalog에서 언어가 일치하는 preset을 찾는 절차이므로, 후보가 없으면 항상 `provider_required_for_language`로 끝난다. | 해당 언어의 `verified-external` preset이 catalog에 들어와야 한다. |
| `doctor`로 custom(비-preset) provider 진단 | `doctor <id>`는 `id`가 catalog preset id일 때만 동작한다. 일치하는 preset이 없으면 provider를 진단하지 않고 `invalid_command`("Unknown provider preset")로 즉시 끝난다(`cli/src/doctor/index.ts:68-75`). raw `command`/`args`로 지정한 custom provider(§6 T3)를 doctor로 점검하는 경로는 없다. | doctor가 raw command를 직접 받는 모드가 추가되거나, 해당 provider가 catalog에 preset으로 들어와야 한다. |

이 표의 각 행은 "언젠가 preset이 readiness/verified-external로 등록되면" 무엇을 이 문서에 추가해야 하는지
이미 말해 준다 — 그 preset을 붙이는 사람이 이 gap을 다시 발견할 필요가 없게 하는 것이 이 표의 목적이다.

> **2026-09-02 정정(M2 stage 1-3, `docs/work/task-m2-gopls-preset.md`/`task-m2-gopls-ci-verification.md`)**:
> 이 표의 예고가 실현됐다 — `gopls`가 `readiness`를 선언한 첫 `verified-external` preset으로 catalog에
> 들어왔고, CI가 3개 OS에서 실제로 검증했다. 위 세 행의 원문은 M1 시점의 정확한 기록으로 남기되, 지금은
> **Go에 한해** 다음과 같이 갱신됐다는 것을 밝힌다: (58행) Go 프로젝트를 `gopls`로 분석하면 `working`
> 안내가 실제로 도달한다. (59행) `gopls`의 `readiness.requiredProjectFiles: ['go.mod']`가 선언돼 있어
> `go.mod` 없는 Go 프로젝트에서 `provider_project_metadata_missing`이 실제로 발생한다. (60행)
> `verified-external` tier preset이 이제 catalog에 하나 있다(`gopls`) — 비-TypeScript/JavaScript
> 언어에서 Auto 성공은 **Go만** 검증 가능해졌고, 다른 언어(Python, C/C++)는 원문 그대로 검증 불가능한
> 상태다.

## 3. 참여자

- 인원: pilot 2명 + 본 라운드 4~6명. M0 참여자와 겹쳐도 된다.
- 요구 경험: TypeScript 또는 JavaScript 프로젝트에서 함수 단위 변경을 실제로 수행해 본 개발자. Codex CLI
  또는 Claude Code 중 하나를 평소 사용한다.
- 최소 2명은 TypeScript/JavaScript **외** 언어(Python 권장)로 개발해 본 경험이 있어야 한다 — T3(custom
  provider 전환)를 수행할 사람이다.
- 최소 1명은 Impact Lens Plugin을 한 번도 설치해 본 적이 없어야 한다.
- **제외**: Impact Lens 구현, 문서 작성, 이 명세 작성에 참여한 사람은 참여자가 될 수 없다. 명세 검토자도
  참여자로 겸하지 않는다.
- 참여자는 anonymized ID(`M1-P1` …)로만 기록한다. M0 참여자와 겹치는 경우 새 ID를 부여하고 M0 ID는
  기록하지 않는다.

## 4. 환경 matrix

각 조합은 최소 1명이 수행한다. 결과는 조합별로 분리 기록하며 하나의 평균으로 합산하지 않는다.

| 축 | 값 |
| --- | --- |
| OS | macOS, Windows, Linux |
| Host | Codex CLI, Claude Code |
| Node.js | 22 LTS 이상 (M1은 runtime 계층을 다시 검증하지 않으므로 M0처럼 버전 폭을 넓히지 않는다) |
| Project (T1용) | 참여자 본인의 실제 TS 또는 JS 저장소 1개 + 공통 sample 저장소 1개 |
| Project (T2·T4용) | **공통 sample 저장소만.** 참여자 본인의 저장소는 쓰지 않는다 — 이유는 §5 S3 참고 |
| Project (T3용) | 참여자 본인의 실제 비-TS/JS 저장소, 없으면 공통 sample의 Python 파일 1건 |
| Language | `.ts`/`.tsx` 1건 이상, `.js`/`.jsx` 1건 이상, custom provider 과업용 비-TS 파일 1건 |

공통 sample 저장소는 M0의 것을 그대로 쓰되, T4(§6)를 위해 **직접 caller가 하나도 없는 export
함수**(예: 더 이상 쓰이지 않게 된 계산 helper 하나)를 포함하도록 준비한다. 그 함수의 파일 경로와
위치(line/column)는 진행자 간에 동일하게 고정해, 모든 참여자가 같은 시작 응답을 본다(§6, §7 R6 재현성
요구사항).

## 5. 시작 상태와 사전조건

| ID | 시작 상태 | 준비 방법 |
| --- | --- | --- |
| S1 | clean install, TS/JS 프로젝트 | [M0 환경 가이드](m0-environment-setup.md) 1~3단계와 동일. 전역 CLI 미설치 또는 시나리오 B로 통일 |
| S2 | 비-TS/JS 언어 프로젝트, provider 미설정 | 참여자의 Python(또는 기타 비-TS/JS) 저장소, 또는 공통 sample의 Python 파일. `.impact-lens/provider.json` 없음 |
| S3 | 손상된 `.impact-lens/provider.json` | 공통 sample 저장소를 **별도의 임시 복사본으로 checkout**한다(T1/T4가 쓰는 복사본과 별개 — 참여자 본인 소유 저장소는 쓰지 않는다). 그 임시 복사본에 진행자가 세션 시작 **전에** `.impact-lens/provider.json`을 미리 만들어 두되, 허용되지 않은 필드를 하나 포함시켜 둔다(예: `{"presetId": "bundled-typescript", "typo": true}` — `ALLOWED_FIELDS`는 `presetId`/`command`/`args`/`languageId`/`initializationOptions`/`settings`뿐이다, `cli/src/providers/projectConfig.ts:17`). 참여자에게는 무엇을 손상시켰는지 알려주지 않는다. **과업이 끝나면 이 임시 복사본 전체를 그 자리에서 삭제하고, 삭제됐음을 참여자에게 보여준다**(§13 teardown) — 참여자가 소유하거나 계속 작업할 저장소에는 애초에 아무것도 쓰지 않는다 |
| S4 | `complete: true` 빈 결과 대상 | 별도로 준비하는 상태가 아니다. §4에서 이미 고정한, 직접 caller가 없는 sample 함수를 그대로 T4의 대상으로 쓴다 |

준비 원칙은 M0와 같다. 깨진 상태는 세션 범위로만 만들고, 시스템·source·사용자 홈을 손상시키지 않는다.
S3는 참여자 소유 저장소가 아니라 진행자가 만든 임시 checkout 안에서만 파일을 추가하므로, 시스템 상태는
물론 **참여자의 실제 프로젝트 상태에도** 영향이 없다 — 참여자가 계속 갖고 있을 어떤 저장소에도 손대지
않는다는 뜻이다. 임시 checkout은 과업 종료 즉시 삭제한다(§13).

`doctor <preset>`의 `project-config` check는 `--workspace`로 명시하지 않으면 실행 시점의 현재
디렉터리(`process.cwd()`)를 읽는다(`cli/src/doctor/index.ts:79`, `cli/src/doctor/checks.ts:234`). 참여자가
임시 checkout 밖의 디렉터리에서 `doctor`를 실행하면 엉뚱한(또는 존재하지 않는) `.impact-lens/provider.json`을
검사해 다른 결과가 나온다. 그래서 진행자용 준비 자료에는 참여자가 `doctor`를 실행할 것으로 예상되는
위치가 임시 checkout **안**이 되도록 세션을 준비하라고 명시한다(예: 참여자의 shell/agent 작업 디렉터리를
그 checkout으로 맞춰 둔다). 참여자가 그럼에도 다른 위치에서 `doctor`를 실행하면 그 사실과 실행 위치를
증거(§12 notes)에 기록한다 — 결과가 갈렸을 때 원인을 추적할 수 있어야 한다.

## 6. 과업

과업은 outcome으로 제시한다. 진행자는 내부 provider command, args, `languageId`, preset id, 오류 code
목록을 **사전에 설명하지 않는다.** T1~T3에서 참여자가 무엇이 문제인지 직접 물으면 진행자는 정확히 이
문장만 답한다: "**문서와 도구 출력에서 찾아보시면 됩니다.**" 그 이상 힌트를 주지 않는다. 이 문장을
고정하는 이유는 T2의 중단 조건("진행자가 유출했다고 느껴 중단", §7)이 판정자마다 다르게 적용되면 안
되기 때문이다 — 진행자가 이 한 문장 밖으로 나가는 순간이 유출이다. T4는 이 절차와 다른, 별도 규칙이
있다 — 아래 참고.

| ID | 시작 상태 | 검증 목적(§1) | 사용자에게 주는 과업 |
| --- | --- | --- | --- |
| T1 | S1 | 1 | "이 함수를 바꾸면 어떤 코드가 영향을 받는지 확인해 주세요." (TS 대상, 이어서 JS 대상으로 반복) |
| T2 | S3 | 2 | "이 함수를 바꾸면 어떤 코드가 영향을 받는지 확인해 주세요." 실패하면 "무엇이 문제인지, 어떻게 고칠 수 있는지 직접 알아내서 고쳐 주세요." |
| T3 | S2 | 3 | "이 Python 함수를 바꾸면 어떤 코드가 영향을 받는지 확인해 주세요." 진행 중 막히면 "이 언어를 분석하려면 무엇이 필요한지 도구 출력에서 찾아 주세요." |
| T4 | S4 | 4 | 아래 별도 절차 |

**T4 (`complete`의 정적 범위 해석) 진행 절차 — 유도 금지가 이 과업의 핵심이다.**

1. **참여자가 직접 실행하고, 그 host가 실제로 보여주는 화면을 그대로 쓴다.** 진행자가 JSON을 손으로
   보여주지 않는다. T1과 똑같은 문구("이 함수를 바꾸면 어떤 코드가 영향을 받는지 확인해 주세요.")로
   과업을 주되, 대상은 §4에서 고정한 sample 함수다. 참여자가 평소 쓰는 host(Codex CLI 또는 Claude
   Code)가 응답을 어떻게 요약하든 — 그 host가 실제 사용자가 결과를 만나는 방식이고, W2-C 응답 정책이
   실제로 통하는지는 그 경로로만 검증된다. 참여자가 결과를 본 직후 정확히 이렇게만 묻는다:
   "**이 결과를 보고, 이 함수에 대해 다음에 무엇을 하시겠습니까?**" 선택지를 주지 않는다. `complete`,
   `caveat`, `안전` 같은 단어를 진행자가 먼저 꺼내지 않는다. "이 결과가 안전해 보이나요?" 같은 질문은
   답을 심는 질문이므로 **금지**한다(§7 유도 편향 규칙).
2. 참여자가 자유 서술로 답한 뒤에만, 구조화된 후속 질문으로 좁힌다(§9의 사후 질문 1~2번을 이 시점에
   바로 사용해도 된다).
3. 참여자가 함수를 지우거나 "안 쓰인다"고 결론짓겠다고 답하면, 정적 범위(동적 호출·DI·reflection이
   빠질 수 있음)를 스스로 언급했는지 여부와 관계없이 **그 발화를 검열 없이 원문에 가깝게 기록한다**(§11
   privacy 규칙 안에서). 단순 성공/실패가 아니라 판단 근거 자체가 이 과업의 관측 대상이다.

T1~T3는 M0의 표현 방식(과업 문구는 outcome, 세부는 사전 설명 없음)을 그대로 따른다. T2/T3에서
`provider_required_for_language`, `provider_config_invalid` 같은 오류가 나오는 것은 **기대한 결과**이지
결함이 아니다 — §2와 §7에서 이미 그렇게 명시한다.

## 7. 과업별 기대 결과와 중단 조건

| ID | 기대 결과 | 허용 가능한 대안 경로 | 중단 조건 |
| --- | --- | --- | --- |
| T1 | provider 설정 없이 direct caller를 확인 (TS, JS 각각) | slash command, skill 호출, runner 직접 실행 중 무엇이든 | 15분 초과, 또는 provider command/args 입력을 요구받았다고 느껴 중단 |
| T2 | `.impact-lens/provider.json`이 원인임을 스스로 지목하고, 오류 메시지 또는 `doctor` 출력만으로 파일을 고쳐 복구 | 오류 메시지를 읽고 직접 수정 / `doctor bundled-typescript --workspace <임시 checkout 경로>` 실행 후 `project-config` check를 읽고 수정, 무엇이든 | 20분 초과, 또는 진행자가 §6의 고정 문장("문서와 도구 출력에서 찾아보시면 됩니다.") 밖의 답을 줌(그 순간 "진행자가 유출"로 기록하고 중단) |
| T3 | `provider_required_for_language`를 "이 언어는 아직 preset이 없다"로 해석하고, custom `provider`(command/args/languageId)를 직접 구성해 재시도 | `.impact-lens/provider.json`에 `command`를 적는 경로, 요청 JSON에 `provider`를 직접 넣는 경로 중 무엇이든. 참여자에게 해당 언어의 Language Server가 로컬에 없어 설치까지 필요하면 그것도 과업의 일부로 기록 | 30분 초과, 또는 참여자가 "이 언어는 지원되지 않는다"를 도구 고장으로 결론짓고 재설치를 시작 |
| T4 | 1단계 자유 서술에서 "확실히 안 쓰인다" 같은 단정적 결론을 내리지 않거나, 내리더라도 정적 분석의 한계(동적 호출·DI·reflection 등)를 스스로 언급 | — | 자유 서술 단계가 끝나기 전에 진행자가 먼저 `complete`의 의미나 캐치어를 언급 — 그 순간 "진행자 유도"로 기록하고 그 참여자의 T4는 무효 처리 |

중단된 과업은 실패가 아니라 `중단`으로 기록하고 사유를 남긴다. T4가 "진행자 유도"로 무효 처리된
경우에도 그 발화 내용은 버리지 않고 "무효(유도)"로 별도 보관한다 — 명세 결함(질문 설계가 여전히
새는 지점)을 찾는 데 쓴다.

## 8. 관측 지표

과업별로 다음을 기록한다. 값은 조합(OS × Host × Language)별로 분리한다.

- time-to-first-success: 과업 시작부터 첫 성공 응답까지의 경과 시간
- 수동 설정 개입 수: provider command/args/`languageId`/`presetId`를 직접 지정하려 시도한 횟수
- 결과 판정: 성공 / 부분 성공 / 실패 / 중단
- T2: 원인을 `.impact-lens/provider.json`으로 올바르게 지목했는가, 복구까지의 시도 수, `doctor` 출력을
  실제로 읽었는가
- T3: `provider_required_for_language`를 설치 손상이 아니라 "preset 없음"으로 해석했는가, custom
  provider 구성에 성공했는가, Language Server 자체 설치가 필요했는가
- T4: 참여자가 본 host 요약 **원문**(성공·실패 판정과 무관하게 매번 기록 — §11 redaction 규칙 적용,
  §12), 참여자의 자유 서술 원문(§11 규칙 안에서), 정적 범위 한계를 자발적으로 언급했는가, 언급했다면
  자유 서술 단계였는가 후속 질문 단계였는가, 최종적으로 "지운다/안 쓴다"고 판단했는가
- 참조한 정보원: 오류 메시지, `doctor` 출력, README/INSTALL 문서, host UI, 외부 검색
- **안전 불변식(관측 항목, 가정하지 않는다)**: 어떤 과업에서도 도구가 참여자 프로젝트를 스스로 build,
  install, 동기화, 파일 생성/수정하지 않았는가. T2에서 손상된 `provider.json`을 도구가 대신 고치거나
  지우지 않고 참여자가 직접 고쳤는가. T3에서 language server 실행 파일을 도구가 대신 설치하지 않았는가.
  (M0 §8의 "예상하지 못한 side effect" 관측을 M1의 provider-metadata 처리에 맞춰 구체화한 것. §2 표의
  `provider_project_metadata_missing` 자체는 오늘 발생시킬 수 없지만, "도구가 아무것도 대신 만들지
  않는다"는 원칙은 모든 과업에서 매번 관측 가능하고 M1에서도 반드시 지켜야 한다.)
- 오해 발생: `complete: true`를 런타임 완전성으로 해석, preset 부재를 설치 손상으로 해석,
  `.impact-lens/provider.json` 오류를 도구 버그로 해석

## 9. 사후 질문

과업 종료 후 다음을 묻는다. 유도 없이 개방형으로 먼저 묻고, 필요한 경우에만 항목을 제시한다. 1~2번은
T4 진행 중(§6 절차 2단계)에 앞당겨 물어도 된다.

1. (T4 직후) 방금 본 결과를 보고 무엇을 하겠다고 답했는지, 그렇게 판단한 근거는 무엇이었는가.
2. `complete`, `coverage`, `limitations` 표기를 각각 어떤 뜻으로 읽었는가.
3. T2에서 무엇이 문제인지 어떻게 알아냈는가. 오류 메시지와 `doctor` 출력 중 무엇이 더 도움이 됐는가.
4. T3에서 "이 언어는 지원되지 않는다"는 것을 어떻게 알았는가. 그것이 도구의 결함처럼 느껴졌는가, 아니면
   설정으로 해결할 수 있는 문제로 느껴졌는가.
5. 이 도구가 내 코드나 프로젝트를 자동으로 빌드·설치·수정했다고 느낀 순간이 있었는가.
6. Auto로 시작하는 것이 TypeScript/JavaScript 외의 언어에서도 될 거라고 예상했는가. 예상과 실제가
   다르다면 그 차이를 어떻게 알게 됐는가.
7. 지금 상태에서 동료에게 권할 수 있는가. 아니라면 무엇이 막고 있는가.

## 10. 통과·보류 기준

수치 기준은 지금 추측하지 않는다. pilot 2명의 결과로 baseline을 만든 뒤 본 라운드 기준을 확정한다 —
M0와 같은 규칙이다.

**baseline 측정 항목**: T1의 time-to-first-success 중앙값, T2의 복구 시도 수, T3의 custom provider
구성 성공까지의 시도 수, T4의 자유 서술 단계에서 함수를 지우거나 안 쓴다고 판단한 참여자 중 정적 범위의
한계를 스스로 언급하지 **않은** 비율(이 비율의 구체적 임계값은 baseline 이후 정한다 — 낮을수록 좋다는
방향만 지금 확정한다).

**정성 통과 기준** (본 라운드에서 확정 전에도 적용):

- 모든 OS × Host 조합에서 T1이 provider 설정 없이 성공한다.
- T2에서 참여자 과반이 `.impact-lens/provider.json`을 원인으로 스스로 지목하고, 진행자의 직접 답변 없이
  복구한다.
- T3에서 아무도 `provider_required_for_language`를 설치 손상이나 도구 고장으로 결론짓지 않는다.
- T4의 자유 서술 단계에서, 함수를 지우거나 안 쓴다고 판단한 참여자 **전원**이 정적 범위의 한계를 스스로
  언급하지 않으면(0명 언급) 그 자체로 release를 보류한다. 이것은 baseline 없이도 지금 바로 적용되는
  유일한 T4 기준이다 — 정확한 비율 임계값은 위 baseline 측정 후 정한다.
- 어떤 과업에서도 도구가 참여자 프로젝트를 자동으로 build·install·수정하지 않는다(§8 안전 불변식).
- T4에서 진행자 유도로 무효 처리된 세션의 비율이 0이다 — 0이 아니면 §6의 절차 자체를 결함으로 보고
  수정한 뒤 재시험한다.

**보류 기준**: 위 항목 중 하나라도 미달하면 M1을 안정화 release로 확정하지 않고 원인 수정 후 재시험한다.
T4가 미달하면 코드가 아니라 **문구**(W2-C의 응답 정책, Extension/Plugin UI 표기)를 먼저 의심한다 — 이
과업이 검증하는 것이 바로 그 문구가 실제 사람에게 통하는지이기 때문이다. 그 문구를 실제로 의심하려면
어떤 참여자가 어떤 문구를 봤는지가 남아 있어야 하므로, T4의 host 요약 원문을 §8·§12에 따라 매번
기록한다.

T4의 자극은 §6에서 의도적으로 host의 실시간 요약으로 고정했다 — 같은 응답이라도 host가 그때그때 다시
문장을 생성하므로, **참여자마다 정확한 문구가 다를 수 있다.** 두 참여자가 같은 대상 함수에서 다른
결론에 도달했다고 해서 그 자체를 참여자 편차로 단정하지 않는다. 먼저 두 사람이 본 요약 원문(§12)을
나란히 놓고 실제로 다른 문구를 봤는지부터 확인한다 — 문구가 갈렸다면 그것이 원인일 수 있고, 문구가
같았다면 그때 참여자 편차로 본다.

## 11. Privacy와 동의

- 참여자 동의 없이는 어떤 기록도 수집하지 않는다. 동의 범위를 과업 시작 전에 문서로 확인한다.
- 수집 금지: 절대 경로, 사용자명이 포함된 경로, source 본문, registry token, proxy credential, 사내
  저장소 식별자. T3에서 참여자가 직접 작성한 `.impact-lens/provider.json`의 `command`/`args`도
  마찬가지로, 로컬 절대 경로가 포함돼 있으면 저장 전에 제거한다.
- 수집 허용: redacted 오류 JSON의 `error.code`, `error.details.stage`, `runtime.runner.source`,
  `runtime.node.major`, `data.completion`(정적 상태 4개 필드), `data.limitationDetails[].code`, 조합
  정보, 시각과 판정, T4의 host 요약 원문과 참여자 발화 요약(동의 범위 안에서 원문 인용 포함).
- 진단 JSON을 그대로 붙여넣을 때는 진행자가 먼저 경로·URL·credential을 제거한다. 제거할 수 없으면 해당
  증거를 버린다.
- **T4에서 host가 보여준 요약 원문은 참여자 발화가 아니라 도구 출력이다.** 아래 "참여자 발화" 동의
  규칙이 아니라 **위 "진단 JSON을 그대로 붙여넣을 때"와 같은 redaction 규칙**을 적용한다 — 대상
  함수·파일 이름이 요약 문장 안에 그대로 인용되므로 경로·식별자를 제거하고, 제거할 수 없으면(예:
  경로가 문장 구조에 녹아 있어 분리할 수 없는 경우) 그 증거를 버린다. 참여자 동의를 요구하지 않는다는
  뜻이 아니라, 어떤 동의 트랙을 타는지가 다르다는 뜻이다.
- 화면 녹화는 동의한 참여자에 한해, 도구 출력 영역만 부분 녹화한다.
- 참여자 발화는 요약으로만 남기고 원문 인용은 동의한 문장에 한한다. T4의 발화는 이 명세의 핵심
  관측 대상이므로(§6) 원문 인용 동의를 과업 시작 전에 별도로 확인한다 — 다른 과업보다 엄격하게
  둔다. (이 규칙은 참여자 **발화**에 대한 것이며, 바로 위 항목의 host **요약**에는 적용되지 않는다.)

## 12. 증거 형식

각 과업 실행은 다음 한 행으로 남긴다.

| 필드 | 예 |
| --- | --- |
| participant | `M1-P3` |
| environment | `macOS / Claude Code / Node 22 / ts` |
| task | `T4` |
| start / end | `10:04` / `10:11` |
| verdict | `성공` |
| interventions | `0` |
| host summary (redacted) | 참여자가 실제로 본 응답 원문, 경로·식별자 redaction 후 (T4 전용, 성공·실패
  무관하게 매번 기록 — §8, §11) |
| static-scope mentioned | `자유 서술 단계에서 언급` / `후속 질문에서만 언급` / `언급 안 함` (T4 전용) |
| error evidence | `provider_config_invalid / discovery / project-config` (T2 전용) |
| teardown confirmed | `예 (10:19)` (T2 전용, §13 — 임시 checkout 삭제를 참여자에게 보여준 시각) |
| notes | 요약 1~2문장 |

## 13. 실패 처리와 재시험

- 결함은 발견 즉시 issue로 등록하고 참여자 ID, 조합, 과업 ID와 redacted 증거를 연결한다. T4에서 발견된
  결함은 우선적으로 [IL-LIM-009](../stories/il-lim-009-completeness-semantics.md)에 연결한다.
- 수정 commit은 해당 issue를 참조하고, 수정 후 **같은 조합**에서 재시험한다. 재시험은 원 참여자 또는
  동등 경험의 새 참여자 중 하나로 하되 어느 쪽인지 기록한다.
- 재시험 전에는 통과로 표시하지 않는다.
- **T2 teardown(우리가 의도적으로 만든 손상의 원복).** T2가 끝나면(성공·실패·중단 무엇이든) 진행자는
  §5 S3에서 만든 임시 checkout 전체를 그 자리에서 삭제하고, 삭제됐음을 참여자에게 화면으로 보여준다.
  이 확인 없이는 그 참여자의 세션을 종료로 표시하지 않는다. 증거 행(§12)에 삭제 확인 여부를 남긴다.
  이것은 §13의 다음 항목("세션 중 참여자 환경이 손상되면")과 다르다 — 그것은 사고로 생긴 손상을 다루고,
  이것은 우리가 **의도적으로** 만든 손상을 되돌리는 절차다.
- 세션 중 참여자 환경이 손상되면 즉시 중단하고 원상 복구를 우선한다. 복구 절차는 진행자가 수행한다.
- release decision에는 통과 항목, 미달 항목, 미실행 항목과 그 사유를 모두 기록한다. 미실행을 통과로
  간주하지 않는다. §2의 제외 항목은 "미실행"이 아니라 "이번 release에서 검증 대상이 아님"으로 별도
  구분해 기록한다.

## 14. 검토 체크리스트

이 명세는 구현자가 아닌 검토자가 다음을 확인한 뒤에만 실행 단계로 넘어간다.

- [ ] 과업 문구가 특정 UI 조작이 아니라 사용자 outcome으로 쓰였다.
- [ ] 내부 provider 설정과 오류 code를 사전에 노출하지 않는다.
- [ ] 모든 과업이 shipped catalog 또는 이 문서가 명시한 준비(§5)로 오늘 실제로 도달 가능한 상태에
      대응한다. `ready`/`working`/`provider_project_metadata_missing`을 전제하는 과업이 없다.
- [ ] Auto 시작 과업이 TypeScript/JavaScript에 한정된다는 사실이 §1·§2에 명시된다.
- [ ] 비-TS/JS 언어 과업(T3)은 custom 설정 경로로 설계되고 `provider_required_for_language`가 기대
      결과로 명시된다.
- [ ] T4가 자유 서술을 먼저 요구하고, "안전해 보이나요" 형태의 유도 질문이 어디에도 없다.
- [ ] T4에서 참여자가 본 host 요약 원문이 성공·실패와 무관하게 매번 기록되고(§8·§12), 그 redaction
      규칙이 참여자 발화 동의 규칙과 구분돼 §11에 명시되며, 참여자 간 문구 차이가 자동으로 편차가
      아니라는 점이 §10에 적혀 있다.
- [ ] 깨진 상태 준비(S3)가 시스템·source·사용자 홈은 물론 **참여자 소유 저장소**도 손상시키지 않고
      (임시 checkout만 사용), 과업 종료 시 그 checkout을 삭제·확인하는 teardown 단계가 있다(§13).
- [ ] privacy 규칙이 수집 항목과 제거 절차를 모두 지정하고, T4 발화 인용에 별도 동의를 요구한다.
- [ ] 합격 수치를 추측으로 고정하지 않고 baseline 측정 절차를 둔다.
- [ ] 언어·OS·host별 결과가 분리 기록된다.
- [ ] 참여자에서 구현·문서 작성자가 제외된다.
- [ ] 도구가 참여자 프로젝트를 build·install·수정하지 않는다는 것이 가정이 아니라 매 과업의 관측
      항목으로 명시된다.
- [ ] T4의 자극(참여자가 보는 결과)이 진행자의 선택에 맡겨져 있지 않고 하나의 경로(host가 실제로
      렌더링하는 응답)로 고정된다.
- [ ] T1~T3에서 참여자가 직접 물었을 때 진행자가 답하는 문장이 고정돼 있고, T2의 `doctor` 실행 위치가
      명시된다.
