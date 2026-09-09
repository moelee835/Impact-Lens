# IL-LIM-010 1단계 — 공통 test classifier와 분류 근거 (branch `feat/il-lim-010-shared-test-classifier`)

## 목적과 사용자 가치

**가장 큰 사용자 문제(2026-09-09 추가로 발견, 아래 "절대경로 결함" 절 참고)**: **사용자명이나
프로젝트 경로에 `test`/`spec`이 들어가면(예: macOS 계정명이 `test`인 사람, 체크아웃 경로가
`.../spec/my-app`인 사람) 그 저장소의 사실상 모든 파일이 "관련 테스트"로 잘못 분류된다.** 두 host
모두 분류 직전에 경로를 workspace 기준으로 상대화하지 않고 절대경로를 그대로 넘기기 때문이다 —
실측(2808행 cartesian corpus): 이런 사용자명 아래에서는 468행 중 468행(100%) 전부 "테스트"로
잘못 분류됐다. 이번 lane이 이걸 닫는다.

**그다음 사용자 문제**: 같은 저장소를 VS Code Extension으로 열어서 보는 "관련 테스트" 목록과,
CLI/Plugin으로 같은 저장소를 분석해서 얻는 "관련 테스트" 목록이 다르다 — 두 host가 파일명·경로 규칙을
각자 다른 정규식(`src/testFile.ts`의 `isTestFilePath()` vs `cli/src/testFile.ts`의
`isTestFilePath()`)으로 구현하고 있고, 실제로 답이 갈라진다. 어느 쪽이 맞는지 사용자가 알 방법도,
왜 그 파일이 테스트로(또는 테스트가 아니라고) 분류됐는지 근거를 볼 방법도 없다.

**이 작업 완료 후 가능해지는 것**: 두 host가 같은 입력에 항상 같은 분류 결과를 낸다. 분류 로직이 하나의
순수 모듈(`cli/src/shared/testFileClassifier.ts`)에만 있어, 다음에 규칙을 하나 고치면 두 host가
동시에 고쳐진다(지금처럼 한쪽만 고치고 다른 쪽을 잊는 방식의 재발을 막는다).

**상위 목표와의 관계**: `docs/development-management/stories/il-lim-010-test-impact-discovery.md`
("IL-LIM-010 관련 테스트 탐지 정확도 개선") 1단계 — M4 마일스톤 종료 gate 8개 중 **gate 1**(closure
audit `docs/work/task-m4-milestone-closure-audit.md` 번호 기준 — IL-LIM-001·002·010 수용 기준,
지금 열림)의 첫 하위 작업. story의 1단계 종료 조건이 정확히 이것이다: "Extension과 CLI가 같은 path
matrix에 동일 결과·근거를 반환한다."

**왜 지금**: commander가 두 원본을 그대로 실행해 30개 경로 중 10개에서 답이 갈라지는 걸 실측해
전달했고, 이 세션이 독립적으로 재현해(아래 "조사 결과") 같은 10건을 확인했다. gate 2·4가 막 닫힌
직후, 사용자가 "handover 필요 없다, 실제 개발 작업에 착수하라"고 지시해 배정된 다음 lane이다.

## 배경과 해결할 문제

- `src/testFile.ts`(Extension)와 `cli/src/testFile.ts`(CLI)는 같은 의도("경로가 흔한 테스트
  디렉터리/파일명 규칙을 따르는가")를 각자 재구현한 별도 코드다.
- gate 5(`docs/work/task-m4-gate5-test-color.md`) work에서 이미 "분류는 filename-only heuristic이고
  Impact Lens는 테스트를 실행하지 않는다"는 사실이 UI 색상 판단의 근거로 쓰였다 — 그 heuristic 자체가
  host마다 다른 답을 내는 건 그 work가 몰랐던 사실이다.
- CLI 쪽에는 이 분류 로직을 고정하는 테스트가 **아예 없다**(`grep -rl isTestFilePath cli/src` →
  `cli/src/impact.ts`, `cli/src/testFile.ts` 둘뿐, `cli/src/test/`에 대응 테스트 없음. Extension만
  `src/test/testFile.test.ts`를 갖고 있다) — 이번 lane에서 처음으로 CLI 쪽도 고정한다.

## 조사 결과 — 직접 재현 (commander 수치를 근거로 안 씀)

commander가 준 재현 스크립트 경로는 다른 세션의 임시 scratchpad라 열어보지 않았다. 대신 이 세션이
독립적으로 두 원본을 읽고 타입 구문만 제거한 순수 JS로 옮겨 직접 실행했다
(`/private/tmp/.../scratchpad/classifier-probe/probe.mjs`, 30개 경로). 결과: **정확히 같은 10건이
갈라진다.**

```
DIFFER  ext=true  cli=false   src/test-utils.ts
DIFFER  ext=true  cli=false   src/test-helpers.js
DIFFER  ext=true  cli=false   src/spec-runner.ts
DIFFER  ext=true  cli=false   src/my-test.js
DIFFER  ext=true  cli=false   src/e2e-spec.ts
DIFFER  ext=true  cli=false   src/a.test.d.ts
DIFFER  ext=true  cli=false   src/a.spec.d.ts
DIFFER  ext=false cli=true    scripts/test
DIFFER  ext=false cli=true    scripts/spec
DIFFER  ext=false cli=true    src/foo_test
```

세 근본 원인도 코드를 직접 대조해 확인했다:

1. **디렉터리 검사 범위**: Extension은 `segments.slice(0, -1)`(파일명 제외, 조상 디렉터리만)를 검사한다.
   CLI는 `segments`(파일명 포함) 전체를 검사한다 — 그래서 파일명 자체가 정확히 `test`/`spec`인
   확장자 없는 파일(`scripts/test`)이 CLI에서는 "디렉터리가 test"로 오판된다. 이건 host 취향 차이가
   아니라 **CLI 쪽의 순수한 버그**다: 디렉터리 이름 규칙이 파일 자신의 basename을 검사 대상에 넣을
   이유가 없다.
2. **hyphen 지원**: Extension은 prefix(`^(?:test|spec)[_-]`)와 suffix(`[_-](?:test|spec)\.`) 둘 다
   hyphen을 인정한다. CLI는 둘 다 underscore만 인정한다.
3. **확장자 처리**: Extension은 파일명 전체 문자열에 정규식을 건다. CLI는 `path.extname()`으로 확장자
   하나만 떼어낸 뒤 그 나머지(base)에 정규식을 건다 — `path.extname()`은 **마지막 점 하나만** 확장자로
   본다. 그래서 `a.test.d.ts`처럼 점이 여러 개인 파일명에서 CLI의 `base`는 `a.test.d`가 되고, suffix
   정규식이 요구하는 `.test$`/`.spec$` 끝맺음이 아니라 `.d`로 끝나 매치가 깨진다. 또한 `foo_test`처럼
   확장자가 아예 없는 이름은 `extname`이 빈 문자열이라 `base`가 원본 그대로 남고, Extension의
   정규식(끝에 점+확장자를 요구)은 안 걸리는데 CLI의 정규식(점 요구 없음)은 걸린다 — 두 원인(1과
   겹치는 `scripts/test`류, 그리고 이 3번)이 함께 `foo_test`류를 만든다.

## 범위

- **포함**: 공통 순수 classifier 모듈, rule ID가 붙은 규칙 테이블, 두 host를 그 모듈 호출로 교체,
  path matrix 테스트(두 host가 같은 결과+같은 rule ID를 내는지), 10건 갈라짐 각각의 채택/기각 판정과
  근거 기록(아래), CLI 쪽에 이번에 처음 생기는 고정 테스트.
- **제외(후속 PR)**: 사용자 지정 include/exclude glob pattern과 그 우선순위(story 1단계 3번) — 규칙
  테이블과 rule ID가 먼저 안정적이어야 precedence를 정의할 수 있고, 지금 같이 하면 PR 하나가 "동작이
  갈라지는 기존 규칙 통합"과 "새 설정 표면 추가"라는 서로 다른 두 위험을 동시에 진다.
- **제외(2단계 이후)**: `TestEvidence`(`call-hierarchy`/`path-convention`/`framework-adapter`/
  `coverage-observation`) 모델링, symbol kind 기반 test-case vs helper 구분, 실행 결과 import 전부
  story의 2~4단계 소관.
- **제외(이번 PR에서 JSON 계약을 안 건드리는 이유)**: rule ID는 shared classifier 함수의 반환값에는
  있지만, `ImpactRelation`/응답 JSON에는 아직 안 싣는다. story의 1단계 항목 2번("분류 결과에 matched
  rule ID와 evidence를 추가한다")은 최종적으로는 JSON까지 닿아야 하지만, 그건 `il-contract-architect`
  소관의 계약 변경(`types.ts`, JSON schema)이라 범위를 분리했다 — 이번 PR은 "두 host가 내부적으로
  같은 rule ID를 계산한다"까지만 만들고, 그 rule ID를 사용자에게 보여주는 건 별도 후속 작업이다.

## 10건 갈라짐 각각의 채택/기각 — 임의로 한쪽 host를 고르지 않는다

기본 방향(반박 가능): **오탐(false positive)이 미탐(false negative)보다 나쁘다** — "관련 테스트"
목록이 부풀면 사용자가 목록 전체를 신뢰하지 않게 되고, 그건 규칙 하나를 놓치는 것보다 회복이 어렵다.
그래서 애매한 경우 기본 규칙에서 뺀다. 이 기준으로 아래 10건을 규칙 단위로 판정했다 — "Extension을
따른다"/"CLI를 따른다"가 아니라 각 규칙이 왜 남거나 빠지는지가 근거다.

| # | 예시 경로 | 지금 ext | 지금 cli | 판정 | 새 ext | 새 cli | 근거 |
| - | - | - | - | - | - | - | - |
| 1 | `src/test-utils.ts` | true | false | **채택 안 함**(hyphen-prefix) | false | false | `test-`/`spec-` 접두 + hyphen은 "테스트를 돕는 헬퍼"(fixture, 공용 유틸)에 흔한 이름이지, 그 자신이 테스트 케이스인 경우가 드물다. underscore 접두(`test_order.py`, pytest 표준)는 기존 규칙으로 유지 — 이번에 빠지는 건 hyphen 접두뿐이다. |
| 2 | `src/test-helpers.js` | true | false | 위와 동일 | false | false | 위와 동일 |
| 3 | `src/spec-runner.ts` | true | false | 위와 동일(spec- 접두) | false | false | "spec runner"는 spec을 실행하는 인프라 코드지 spec 자신이 아니다 |
| 4 | `src/my-test.js` | true | false | **채택**(hyphen-suffix, 신규) | true | true | 접미 `-test`/`-spec`은 mocha/jasmine류에서 실제 테스트 파일 명명 관례다 — underscore 접미(`order_test.go`)와 성격이 같다. 접두와 달리 접미는 "이 파일 자신이 테스트"라는 신호가 강하다. |
| 5 | `src/e2e-spec.ts` | true | false | 위와 동일 | true | true | 위와 동일 |
| 6 | `src/a.test.d.ts` | true | false | **CLI 버그 수정**(확장자 처리) | true | true | `.test.`/`.spec.` 접미는 그 뒤에 확장자가 몇 개든(`d.ts`처럼 복합이어도) 유효한 신호다. `path.extname()`으로 마지막 점만 떼는 CLI 방식이 원인이므로 host 취향이 아니라 버그. |
| 7 | `src/a.spec.d.ts` | true | false | 위와 동일 | true | true | 위와 동일 |
| 8 | `scripts/test` | false | true | **CLI 버그 수정**(디렉터리 검사 범위) | false | false | 파일 자신의 basename을 "디렉터리 이름" 규칙에 넣는 것 자체가 잘못이다 — Extension처럼 조상 디렉터리만 검사하도록 통일. |
| 9 | `scripts/spec` | false | true | 위와 동일 | false | false | 위와 동일 |
| 10 | `src/foo_test` | false | true | **CLI 버그 수정**(확장자 없는 이름에 접미 규칙 적용) | false | false | Extension의 접미 규칙은 항상 "점+확장자"로 끝나길 요구한다 — 확장자 없는 이름까지 접미 규칙에 걸리는 건 CLI만의 관대함이고, 좁은 기본값 방향과도 맞지 않는다. |

**reachability에 대한 메모**: 8~10번은 "call hierarchy가 실제로 이런 경로를 반환할 수 있는가"를
근거로 규칙에서 뺀 게 아니다 — 확장자 없는 파일이 어느 provider의 call hierarchy에 실제로 등장할 수
있는지는 조사하지 않았다(조사하지 않았다고 명시한다, 하지 않고 넘어간 게 아니라). 대신 이 세 건은 "더
좁은 쪽(Extension) 동작으로 수렴시키는 버그 수정"이라는, reachability와 무관한 별개 근거로 결정했다
— 그래서 reachability를 따로 증명할 필요가 없었다.

**결과로 남는 사용자 동작 변화**:
- Extension: `test-utils.ts`, `test-helpers.js`, `spec-runner.ts`류(hyphen 접두) 파일이 이제
  "관련 테스트"에서 빠진다 — 지금까지 `true`였던 게 `false`가 된다.
- CLI: `scripts/test`, `scripts/spec`, `foo_test`류(확장자 없는 이름)가 이제 "관련 테스트"에서
  빠지고, `my-test.js`/`e2e-spec.ts`류(hyphen 접미)와 `a.test.d.ts`류(복합 확장자)가 새로 "관련
  테스트"에 들어온다.

**story의 1단계 rollout 문구와의 충돌 — 발견 즉시 기록**: story(`il-lim-010-test-impact-discovery.md`)
의 "rollout과 관측" 절은 "1차에서는 classifier 공유와 evidence만 추가해 relation 수 변화 없이
출시한다"고 적어 뒀다. 이 문구는 두 host가 이미 일치한다는 가정 위에 쓰인 것으로 보인다 — 실측 결과
(위 10건)는 그 가정이 틀렸다는 걸 보여준다. "공유 모듈로 합친다"만 하고 갈라짐을 그대로 두면(예:
"둘 다 true면 true, 아니면 CLI를 따른다"처럼 기계적으로 합집합/여집합을 취하면) relation 수는 안
바뀌지만 버그(8~10번)가 그대로 남고 근거 없는 임의 선택이 된다. commander의 지시("이건 리팩터링이
아니라 동작 변경입니다")와 이 표를 근거로, "relation 수 무변경"보다 "규칙별로 근거 있는 판정"을
우선했다 — 이 판단은 구현 전에 commander/reviewer에게 보고했다(교차 세션 메시지로 이 문서 링크 전달).

## 2026-09-09 재판정 — framework 1차 출처 기준으로 위 표를 대체한다

위 "10건 갈라짐" 판정표는 폐기하지 않고 그대로 둔다(이 저장소의 정정 관례) — 아래가 최종 채택안이다.
reviewer/commander가 실행으로 두 가지를 반증했다:

1. **"헬퍼 파일 성격" 기각 근거가 자기모순이었다.** `test_utils.py`/`test_helpers.py`(둘 다 헬퍼
   성격, underscore 접두)는 오늘 두 host가 이미 `true`로 **일치**한다(`[실행]`, 직접 재확인) — 헬퍼냐
   아니냐가 아니라 "hyphen이냐 underscore냐"가 실제로 판정을 갈랐을 뿐이다. 근거를 사후에 갖다 붙인
   꼴이라 기각하고, **"실제 test framework의 기본 discovery 패턴이 이 파일을 수집하는가"**로 교체했다
   — 취향이 아니라 각 framework 1차 문서를 열면 확인되는 외부 기준이다.
2. **"CLI 버그"라고 부른 것 중 다수가 사실은 host 취향이 아니라 미검증 판정이었다.** 위 표의 6/7/10번을
   "버그"라고 부른 건 어느 쪽이 옳은지 안 묻고 더 넓은 쪽(Extension)을 기준으로 삼은 것이었다.

### framework 1차 출처 확인 (전부 `[실행]` — WebFetch/WebSearch로 각 프로젝트 공식 문서 직접 확인)

| 언어/framework | 기본 discovery 패턴 | 출처 |
| --- | --- | --- |
| pytest (Python) | `test_*.py` 또는 `*_test.py` (prefix/suffix, underscore만) | pytest 공식 문서 |
| Jest/Vitest (JS/TS) | `**/?(*.)+(spec\|test).?([mc])[jt]s?(x)` (suffix만, dot 구분자, 확장자는 js/jsx/ts/tsx(+m/c 변형)로 한정) | Jest 공식 문서 |
| `go test` (Go) | `_test.go` (suffix, 컴파일러 강제, 확장자 필수) | Go 공식 문서(`pkg.go.dev/cmd/go`) |
| Maven Surefire (Java) | `**/Test*.java`, `**/*Test.java`, `**/*Tests.java`, `**/*TestCase.java` | Surefire 공식 문서 |
| RSpec (Ruby) | `**/*_spec.rb` (suffix만 — prefix 없음) | RSpec 공식 문서 |
| `dotnet test`/MSTest·xUnit·NUnit (C#) | **파일명 기반 기본 discovery가 아예 없음** — `Microsoft.NET.Test.Sdk` 패키지 참조로 프로젝트 단위 discovery | Microsoft 공식 문서 |

**다섯 framework 어디도 hyphen을 안 쓴다** — 접두·접미 hyphen(`test-utils.ts`, `my-test.js`,
`e2e-spec.ts` 전부) 기각. C#은 파일명 기반 discovery 자체가 없으므로 pascal-suffix 규칙에서 `.cs`도
뺀다. Kotlin은 1차 출처를 찾지 못해(검색 시도, 확정적 답 없음) 추측으로 넣지 않는다.

### 정정 — 언어 스코프의 근거는 `catalog.ts`가 아니다

첫 시도는 규칙별 적용 확장자를 `cli/src/providers/catalog.ts`의 preset `extensions`(4개 언어)로
제한했다. **틀렸다** — `catalog.ts`는 CLI 전용이고 Extension은 참조하지 않는다. 직접 확인
(`[실행]`):
- `package.json:94`의 `"when": "editorHasCallHierarchyProvider"`는 VS Code **내장** context key다
  — `git grep editorHasCallHierarchyProvider` → 정의 0건, 사용 1건.
- `activationEvents`는 `onStartupFinished` + 명령/뷰 트리거뿐, 언어 제한이 없다.
- `src/impactAnalyzer.ts`의 `languageId`는 payload(약 174행)와 provider 메타데이터(약 199행)에만
  쓰이고 분석을 막는 gate가 없다.

즉 Java(redhat.java)나 Ruby(Ruby LSP) 확장을 설치한 사용자는 Extension으로 그 언어 파일을 그대로
분석할 수 있다. **언어 스코프의 근거는 각 규칙이 재현하는 framework의 1차 문서이지, CLI가 실제로
도달 가능한 언어 목록이 아니다** — `catalog.ts`는 "CLI에서 이 규칙에 입력이 실제로 오는가"를 말해주는
별개의 증거로만 쓴다(예: `.rb`는 CLI 쪽에서는 catalog에 provider가 없어 도달 불가하지만, 규칙
자체는 Extension 쪽 실제 도달 가능성 때문에 여전히 만들 가치가 있다).

### 최종 규칙 테이블 (`cli/src/shared/testFileClassifier.ts`, 구현됨)

| rule id | 적용 확장자 | 근거 |
| --- | --- | --- |
| `test-directory` | 전체(언어 무관) | 디렉터리 관례는 특정 framework의 파일명 discovery가 아니라 더 일반적인 프로젝트 레이아웃 관례라 스코프하지 않는다 |
| `dot-suffix` | `.ts/.mts/.cts/.tsx/.js/.jsx/.mjs/.cjs` (단, `.d.ts`/`.spec.d.ts`는 제외) | Jest/Vitest. `.d.ts`는 타입 선언 파일이라 실행 가능한 코드가 없어 어떤 framework 기준으로도 테스트일 수 없다 — first-principles 근거로 별도 제외 |
| `underscore-prefix` | `.py` | pytest. RSpec은 prefix 관례가 없어 `.rb` 제외 |
| `underscore-suffix` | `.go`, `.py`, `.rb` | `go test`, pytest, RSpec |
| `pascal-suffix` | `.java` | Surefire. `.cs`(파일명 기반 discovery 없음), `.kt`(1차 출처 미확인) 제외 |

C/C++(`.c/.cc/.cpp/.cxx/.h/.hh/.hpp/.hxx`)은 CMake/CTest/GoogleTest/Catch2 사이에 단일 기본
파일명 관례가 없어 어떤 naming rule도 안 걸고 `test-directory`만 적용된다 — 의도된 결과다.

**범위 밖으로 명시적으로 남긴 것** (틀렸다고 판단한 게 아니라, 검증·구현 비용 대비 이 lane
범위 밖이라 안 한 것):
- Surefire의 구분자 없는 prefix 관례(`Test*.java`, 예: `TestForm.java`) — 지금 pascal-suffix
  정규식(`(?:Test|Tests)\.[^/]+$`)은 우연히 `Test.foo.java`(prefix+dot) 형태는 잡지만 구분자가
  아예 없는 `TestForm.java`는 안 잡는다. 원래 두 host 모두 이 shape를 처음부터 지원한 적이 없어
  regression이 아니다.
- Kotlin 확장자(`.kt`/`.kts`) — 1차 출처를 못 찾아 추측하지 않고 뺐다. 확실한 근거가 생기면 추가.
- `.pyi`(typeshed stub root) — commander/reviewer가 낮은 우선순위로 요청한 건 주석뿐이었다.
  `cli/src/testFile.ts`/`src/testFile.ts`의 `if (depth === 0) return 'root';` 분기에 "이 분기가
  의도치 않게 `.pyi` root를 분류기 도달 전에 차단한다"는 근거(reviewer의 실제 pyright 실행 확인)를
  남겼다 — 코드 동작은 안 바꿨다.

### 절대경로 결함 — 이 lane에서 가장 큰 사용자 영향 (사용자 가치 섹션에 반영)

reviewer가 226×2808 규모 corpus로 실측했고, 이 세션이 별도로(같은 스크립트를 안 열어보고) 독립
구성한 cartesian corpus(구분자 4 × 위치 3 × marker 4 × 확장자 13 × 디렉터리 6, 중복 제거 후 2808행)
로 재현했다: **정확히 2808행, OLD 두 host 간 갈라짐 226건 — reviewer의 수치와 정확히 일치.**
`/Users/test/...`(사용자명이 `test`) 아래에서는 **468행 중 468행 전부**(100%) `true`, 같은 상대경로가
`/Users/dev/...` 아래에서는 이 세션 corpus 기준 **468행 중 192행**(reviewer 수치는 468행 중 163행 —
corpus 생성 방식이 달라 정확한 수는 다르지만, "사용자명/디렉터리 이름만으로 분류가 뒤집힌다"는
질적 결론은 두 독립 측정이 같다). **사용자명이나 프로젝트 경로에 `test`/`spec`이 들어가면 그
저장소의 사실상 모든 파일이 관련 테스트로 잘못 분류된다** — 이번 lane에서 고치는 것 중 규칙 통일
자체보다 사용자에게 미치는 영향이 크다.

**고침**: 두 호출부(`cli/src/impact.ts`, `src/impactAnalyzer.ts`)가 분류 직전에 이미 있는
상대화 유틸(`relativeFile`/`asRelativePath(uri, false)`)을 적용하도록 바꿨다(구현은 아래 절 참고,
이미 반영됨) — 이 corpus의 `abs-*` 두 디렉터리 축 자체가 상대화 후에는 "workspace 밖 파일"이라는
별도(잔여) 케이스로 좁아진다.

### 검산 — 두 종류의 변경 목록을 분리해서 적는다 (섞으면 등식이 안 맞는다)

**(A) 사람이 고른 10건(원래 판정표)의 XOR 검산**: 이 10건은 정의상 한쪽만 `true`였다. 최종 규칙
적용 결과 **10건 전부 "양쪽 다 false"로 수렴**한다(hyphen 전부 기각 + `.d.ts` 제외 + 확장자 스코프가
겹쳐서 나온 결과) — 즉 ext 변경 7건(1~7번) + cli 변경 3건(8~10번) = 10, 등식 성립(`[실행]`, 위
표의 "새 ext"/"새 cli" 열이 전부 `false`인 것으로 확인).

**(B) 이 10건 밖에서, 오늘 두 host가 이미 일치하던 경로인데 규칙 재정의로 답이 바뀌는 목록** — XOR
검산 대상이 아니다(원래 어느 쪽 오탐도 아니었고, 새 규칙이 둘 다 동시에 바꾼다). `[실행]`으로 확인한
대표 사례:
- `FooTest.ts`/`FooTest.go`/`FooTest.py`(오늘 두 host `true`, 새 규칙 `false`) — pascal-suffix가
  `.java`로 스코프되며 사라짐.
- `order_test.js`/`test_order.ts`/`order_test.cpp`/`test_order.c`(오늘 두 host `true`, 새 규칙
  `false`) — underscore 규칙이 go/py/rb로 스코프되며 사라짐.
- `OrderServiceTests.cs`(오늘 두 host `true`, 새 규칙 `false`) — `.cs`에 파일명 기반 discovery
  자체가 없어 제외.
- `test_order.d.ts`(오늘 두 host `true`, 새 규칙 `false`) — `.d.ts` 제외.
- `Test.foo.ts`류(prefix+dot camel — 아무도 원래 목록에 안 올렸다, 오늘 두 host `true`, 새 규칙은
  `.java`에서만 `true`, 그 외 언어는 `false`) — 언어 스코프가 정확히 옳은 방향으로 작동한 사례.

이 세션이 독립 구성한 226건 cartesian corpus 기준 전체 집계: **ext 쪽 변경 514건, cli 쪽 변경
356건**(중복 집계 없이 각 host별로 OLD와 NEW가 다른 행 수) — 226보다 훨씬 크다. 이건 (A)의 XOR
등식이 깨진 게 아니라애초에 다른 질문이다: 226은 "OLD ext와 OLD cli가 서로 다른 행 수"이고
514/356은 "OLD와 NEW가 다른 행 수"(둘 다 바뀌는 행도 각각 카운트되므로 226보다 클 수 있고, 실제로
크다).

### `src/test/testFile.test.ts` 핵심 pin 변경 — 사용자 동작 변경 목록

기존 pin 중 두 개가 이 기준으로 다시 보면 원래도 틀렸었다(정직하게 "CLI 버그"가 아니라 "재판정"으로
기록한다):
- `spec_order.rb`(prefix) — RSpec 기본 관례에 prefix 형태가 없어 `false`로 이동(부정 fixture로).
- `OrderServiceTests.cs`(pascal suffix) — `.cs`에 파일명 기반 discovery가 없어 `false`로 이동.

`order_spec.rb`(suffix, RSpec 실제 관례)와 `OrderServiceTest.java`(pascal, Surefire 실제 관례)는
그대로 `true` 유지.

## 현재 구현 조사 결과

- `src/testFile.ts`: `isTestFilePath()` + `classifyImpactRelation()`. `src/impactAnalyzer.ts`가
  둘 다 쓴다. `src/test/testFile.test.ts`가 고정.
- `cli/src/testFile.ts`: `isTestFilePath()` + `classifyRelation()`(`ImpactRelation` 반환). `cli/src/
  impact.ts`가 `classifyRelation()`만 쓴다. **고정 테스트 없음.**
- `src/test/graphPanel.test.ts` 40~93행(gate 5)이 `cli/src/testFile.ts`의 `isTestFilePath()`를
  주석으로 인용한다 — 실제 로직이 `cli/src/shared/testFileClassifier.ts`로 옮겨가면 이 인용도 갱신
  대상이다(코드 동작에는 영향 없음, 주석 정확성 문제).
- `cli/src/shared/`는 PR #87이 만든 경로다 — `impactHelpers.ts`, `adapters/`가 이미 있다.
  `.vscodeignore`의 `!cli/dist/shared/**/*.js` negation과 `scripts/test-vsix-contents.mjs`의
  require-boundary 검사가 이미 이 경계(shared 바깥을 requre하면 안 됨, npm 의존성 없어야 함)를
  강제한다 — 새 파일을 추가하면 자동으로 그 검사 대상이 된다. 새 인프라는 필요 없고, 통과하는지만
  확인하면 된다.

## 단계별 구현 계획 (하나의 독립 commit)

이 lane은 하나의 최상위 단계로 합친다 — classifier 모듈, 두 host 교체, 매트릭스 테스트가 서로 의존해
쪼개면 중간 상태가 컴파일되지 않는다(AGENTS.md §2: "독립적으로 정상 상태를 만들 수 없는 단계들은
하나로 합친다").

- **목적**: 두 host가 같은 rule 근거로 같은 답을 내게 한다.
- **산출물**:
  1. `cli/src/shared/testFileClassifier.ts` — 위 표대로 확정한 규칙 테이블(각 규칙에 stable rule
     ID), `classifyTestFile(path): { isTest, ruleId }`.
  2. `cli/src/testFile.ts`, `src/testFile.ts` — 얇은 어댑터로 축소, shared 모듈을 호출해 기존
     함수 시그니처(`isTestFilePath`, `classifyRelation`/`classifyImpactRelation`)를 그대로 유지
     (호출부 변경 없음).
  3. `cli/src/test/testFileClassifier.test.ts`(신규, CLI 쪽 첫 고정 테스트) — path matrix: 30개
     경로 + story의 부정 fixture(`contest.java`, `tester.ts`, `specification.ts`) 전부에서 두 host
     어댑터가 정확히 같은 결과, 그리고 shared 함수가 같은 rule ID를 내는지 확인.
  4. `src/test/testFile.test.ts` 갱신 — hyphen-prefix가 빠지면서 깨지는 기존 pin 없는지 확인(있으면
     그 목록 자체가 사용자 동작 변경 목록이므로 지우지 않고 기대값을 갱신하며 이유를 남긴다).
  5. `src/test/graphPanel.test.ts` 40~42행 주석의 경로 인용 갱신.
- **검증**: `npm run cli:build && node --test cli/dist/test/*.test.js`(또는 저장소 표준 스크립트),
  `npm test`(Extension), `npm run test:vsix-contents`(새 shared 파일이 require-boundary를 실제로
  통과하는지 `[실행]` 확인 — 통과를 가정하지 않는다).

## 범위 추가 — 절대경로 입력 결함 (reviewer 실측, corpus 밖)

**결함**: 두 host 모두 workspace 상대화 없이 절대경로를 분류기에 넘긴다. 직접 대조로 확인
(`[실행]`이 아니라 `[읽음]` — grep/코드 대조로 확인, 별도 재현 스크립트는 안 돌렸다. commander가
제시한 4개 예시 경로는 재현할 필요가 없다고 판단했다 — 이유는 아래):

- `cli/src/impact.ts`: `itemFile = uriFile(itemUri(entry.item))`(절대 fs 경로)를 `file:
  relativeFile(workspace, itemFile)`(사용자에게 보이는 값, 상대화됨)와
  `relation: classifyRelation(entry.depth, itemFile)`(분류에 쓰는 값, **상대화 안 됨**)에 각각
  다르게 쓴다 — 두 줄 간격.
- `src/impactAnalyzer.ts:94`: `classifyImpactRelation(entry.depth, entry.value.item.uri.path)` —
  `uri.path`는 절대경로 문자열이다. 같은 파일 안에 상대화 유틸이 없는 게 아니라, `graphPanel.ts:255`
  등 세 곳(`impactTreeProvider.ts:267`, `controller.ts:672`)이 이미
  `vscode.workspace.asRelativePath(uri, false)`를 쓰고 있다(`[실행]`, grep으로 세 줄 다 확인) — CLI와
  같은 결함 모양이 파일이 갈라져 있어 덜 보였을 뿐이다.

**commander가 준 4개 예시(`/Users/test/project/src/realFeature.ts` 등)를 그대로 재현하지 않은 이유**:
그 경로들은 전부 workspace **내부** 파일의 절대경로 표현이다 — 상대화(`relativeFile`/
`asRelativePath`)를 분류 직전에 넣으면 `src/realFeature.ts`가 되어 `/Users/test/...` 조상 segment
자체가 사라진다. 그러므로 이 4건은 "상대화를 빠뜨렸다"는 같은 결함의 결과물이지, 상대화를 넣은
뒤에도 남는 별도 사례가 아니다 — 재현은 결함의 존재를 다시 보여줄 뿐 판정에 새 정보를 안 준다.

**상대화 방식**: 새로 정하지 않고 이 저장소의 기존 관례를 그대로 썼다.
- CLI: 이미 있는 `relativeFile(workspace, file)`(`cli/src/shared/impactHelpers.ts`)를 분류 직전에도
  적용 — `file:`/`relation:`/`testDistance:` 세 곳 모두 같은 상대화 결과를 쓰도록 통합(기존에
  `classifyRelation`을 두 번 부르던 것도 한 번으로 합침, 순수 드라이브바이).
- Extension: `entry.value.item.uri.path`(문자열) 대신 `vscode.workspace.asRelativePath(entry.value
  .item.uri, false)`(Uri 객체를 직접 전달)로 교체. `false`를 반드시 유지 — `true`면 multi-root에서
  workspace 폴더 이름이 앞에 붙어, 폴더 이름이 `test`/`spec`이면 그 안의 모든 파일이 디렉터리
  규칙에 걸린다(지금 고치려는 결함을 다른 문으로 재도입). 문자열 `.path`가 아니라 `Uri`를 넘기는
  이유: 문자열을 넘기면 Windows에서 `/c:/...` 형태가 그대로 들어가 `asRelativePath` 내부 처리에
  결과가 좌우된다 — `Uri`를 넘기면 그 문제 자체가 없다.

**분류기 계약**: `classifyTestFile()`/`isTestFilePath()`는 여전히 경로 문자열 하나만 받는 순수
함수로 남긴다. workspace를 shared 모듈에 넘겨 내부에서 상대화하지 않는다 — 상대화 책임은 두
호출부(`impact.ts`, `impactAnalyzer.ts`)에 둔다. 대신 두 함수의 doc comment에 "workspace-relative
경로(또는 workspace 밖이면 원래 절대경로)를 받는다"는 계약을 명시한다.

**outside-workspace 잔여 — (a) 채택**: `relativeFile()`은 `isOutside`면 절대경로를 그대로
반환한다(기존 동작, 안 바꿈). `asRelativePath(uri, false)`도 어느 workspace 폴더에도 안 속하면
입력을 그대로 반환한다(VS Code 공식 문서: "the input path if the file is not in a workspace") —
**두 host가 이미 같은 철학("workspace 밖이면 안 숨기고 원래 경로를 그대로 보여준다")을 채택하고
있다.** 그 값을 분류에도 그대로 쓰는 (a)가 이 기존 철학을 그대로 연장하는 것이고, (b)("workspace
밖 노드는 디렉터리 규칙 자체를 안 건다")는 지금 없는 새 특례를 발명하는 것이라 판단해 (a)를 골랐다.

reachability 확인(`[읽음]`, 실행 재현 아님): CLI에 `outsideWorkspace` 필드를 직접 고정하는 테스트는
없다(`grep -rn outsideWorkspace cli/src/test` → 0건) — 그러나 `isOutside(workspace, itemFile)`은
모든 node에 조건 없이 호출되는 production 코드이고, dead code가 아니다. clangd(C-family)는
workspace 밖의 vendored/system include를 인덱싱할 수 있고, pyright도 site-packages/venv 안의
심볼을 반환할 수 있다 — 즉 "왜 이 필드가 존재하는가"에 대한 답이 이미 코드 구조에 있다. 이 이상의
직접 재현(예: 실제 clangd로 workspace 밖 파일을 caller로 만드는 fixture)은 이번 lane 범위 밖이라
안 했다 — outside-workspace 자체의 reachability 증명은 이 필드를 원래 도입한 lane의 책임이지 이
lane이 새로 질 책임이 아니라고 판단했다. 대신 "그런 노드가 오면 이렇게 분류된다"를 명시적 잔여로
문서화하고 단위 테스트로 고정한다(입력을 직접 만들어 테스트하므로 이 부분은 `[실행]`).

**matrix에 넣는 실제 URI 파생 모양** (reviewer 지적 반영 — 예쁜 POSIX 문자열만 먹이면 이 불변
조건이 깨져도 초록으로 통과한다): `fileURLToPath` Windows 네이티브 형태(`C:\proj\src\a.test.ts`,
백슬래시), `Uri.path` 스타일 드라이브 문자(`/c:/proj/tests/a.ts`), 공백 포함 경로, 유니코드 파일명,
리터럴 `%20`/`%25` 3글자(디코딩된 것처럼 보이면 안 됨 — 그 자체가 세그먼트 이름의 일부일 뿐 별도
디렉터리 구분자가 아님을 확인).

## 2026-09-09 추가 — reachability로 좁힌 corpus에서 최종 구현을 재검산

commander/reviewer가 226건 갈라짐에 도달 가능성 필터(R1: depth≥1 caller는 body가 있어야 하므로
`.pyi`/`.d.ts`처럼 선언 전용 확장자는 depth 0에서만 나타나고 거기서 분류기 도달 전에 이미
`return 'root'`로 단락됨 — R3: 확장자 없는 이름은 어떤 CLI preset도 인덱싱하지 않음)를 적용해
**226 → 140**으로 좁혔고, 남는 140건이 hyphen 5종 shape(`test-foo.*`/`spec-foo.*`/`Test-foo.*`/
`foo-test.*`/`foo-spec.*`)과 `Test.foo.*`/`Tests.foo.*`(camel prefix-dot, Surefire의 `Test*.java`
prefix가 우연히 이 shape를 실제로 수집) 두 종류로 수렴한다고 보고했다.

이 세션이 독립 구성한(같은 스크립트를 열지 않은) 2808행 corpus에 같은 두 필터를 적용해 재현했다:
**226 → 140, 정확히 일치.** 그 140건 전부에 이번 PR의 **이미 구현·push된** 최종 규칙을 적용해
재검산했다: **ext 쪽 136건 변경 + cli 쪽 4건 변경 = 140, 미해결(양쪽 다 그대로인 행) 0건.** 즉
"도달 가능한 갈라짐 140건을 규칙 언어 스코프가 100% 해소한다"는 주장이 이 PR이 이미 커밋한
코드로 실측 확인된다 — 추가 코드 변경 불필요.

**정직하게 남기는 한계(commander가 먼저 지적)**: R2(Extension은 사용자가 설치한 임의 LSP로 어떤
확장자든 도달 가능)를 "확장자가 있으면 도달 가능"으로 느슨하게 잡았다 — `.rb`/`.java`는 사용자가
그 언어 확장을 실제로 설치했을 때만 도달한다. 그러므로 140은 상한이지 정확한 도달 보장 수가
아니다. `.pyi`/`.d.ts`/확장자-없음이 "구현은 이제 통일되지만 사용자 영향은 0(도달 불가)"이라는
점도 그대로 남긴다 — 판정표에서 이 셋을 "CLI 버그"라고 부른 무게는 실제보다 과했다(결과는 맞았지만
이유가 사용자 영향이 아니라 구현 일관성이었다).

## 작업 로그

**변경 파일**:
- `cli/src/shared/testFileClassifier.ts`(신규) — 규칙 테이블, `classifyTestFile()`/`isTestFilePath()`.
- `cli/src/testFile.ts`, `src/testFile.ts` — shared 모듈을 호출하는 얇은 어댑터로 축소. 기존
  `classifyRelation`/`classifyImpactRelation` 시그니처는 안 바꿨다(호출부 변경 없음). `depth === 0`
  분기에 `.pyi` typeshed root를 우연히 막고 있다는 주석 추가(reviewer의 실제 pyright 실행 확인,
  코드 동작은 안 바꿈).
- `cli/src/impact.ts` — `relativeFile(workspace, itemFile)`을 한 번만 계산해 `file`/`relation`/
  `testDistance` 세 곳에 재사용(절대경로 결함 수정 + 중복 호출 제거).
- `src/impactAnalyzer.ts` — `entry.value.item.uri.path` 대신
  `vscode.workspace.asRelativePath(entry.value.item.uri, false)`(절대경로 결함 수정).
- `cli/src/test/testFileClassifier.test.ts`(신규, CLI 쪽 첫 고정 테스트).
- `src/test/testFileClassifierMatrix.test.ts`(신규) — 두 host 어댑터 + shared 함수를 모두 import해
  같은 corpus에서 결과·rule ID·depth별 relation이 일치하는지 확인. story 1단계 종료 조건을 직접
  테스트로 고정.
- `src/test/testFile.test.ts` — `spec_order.rb`/`OrderServiceTests.cs`를 긍정에서 부정 목록으로 이동
  (근거는 위 "핵심 pin 변경" 절).
- `src/test/graphPanel.test.ts` — 로직 위치 인용을 `cli/src/shared/testFileClassifier.ts`로 갱신.
- `docs/development-management/stories/il-lim-010-test-impact-discovery.md` — rollout 절에
  2026-09-09 정정 블록 추가(원문은 안 지움).
- `docs/work/task-m4-gate5-test-color.md` — `isTestFilePath()` 위치 인용에 정정 추가.

**검증**(전부 `[실행]`, `rm -rf out cli/dist` 후):
- `npm run cli:test` — 410 tests, 407 pass, 0 fail, 3 skip(사전 존재하는 gopls 실환경 skip, 무관).
- `npm test`(Extension) — 72 tests, 72 pass, 0 fail. 신규 matrix 테스트 3개 포함.
- `npm run test:vsix-contents` — 통과, `cli/dist/shared/**/*.js` 5개 파일 포함, require-boundary
  위반 없음, 1.14MB(< 5MB tripwire).
- `npm run test:response-policy` — 34 checks 통과(무관 영역, regression 없음 확인).

**사용자 결과 vs 남은 것**: 절대경로 결함(가장 큰 사용자 영향)과 두 host의 규칙 불일치(다수 축,
1차 출처 검증됨) 모두 이번 PR로 닫힌다. **아직 안 되는 것**: rule ID가 JSON 응답에 아직 안 실린다
(범위에서 명시적으로 제외, `il-contract-architect` 소관 후속 작업), include/exclude 사용자 pattern
(story 1단계 3번, 후속 PR), Kotlin/`.pyi`/Surefire 구분자 없는 prefix 등 검증 안 된 확장은 추가
안 했다(추측 대신 배제, 근거가 생기면 후속).
