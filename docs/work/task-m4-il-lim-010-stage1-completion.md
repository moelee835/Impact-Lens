# IL-LIM-010 1단계 완결 — 분류 근거 노출과 사용자 pattern (branch `feat/il-lim-010-stage1-evidence-and-patterns`)

- 상태: 설계 (구현 전 — commander 지시대로 사전 작업 문서·계약 설계안까지만 하고 보고)
- **2026-09-10 범위 축소 — reviewer의 gate 1 전수 감사 반영**: 원래 지시의 4개 항목(근거 노출,
  사용자 pattern precedence, 언어 matrix, 미실행-테스트-성공-아님)에서 reviewer 독립 감사가 2개를
  이미 통과로 판정했다. **언어 matrix(구 3번)**는 PR #91이 JS/TS/Python/Go/Java/Ruby 규칙과 30개
  경로 corpus로 이미 닫았다 — 새 fixture를 대량 생산하지 않고, 이번 PR이 추가하는 사용자 pattern
  축이 그 기존 corpus 결과를 바꾸지 않는지만 확인한다(진짜 회귀 위험이 여기 있다). **미실행-테스트-
  성공-아님(구 4번)**은 "공백에 의한 통과"로 판정됐다 — 아래 별도 절에서 그 판정의 성격 자체를
  기록하고, 새 상태·모델은 만들지 않는다. **이 lane의 실질 범위는 이제 둘이다: `ruleId`를 출력
  계약에 노출하는 것(구 1번), 그리고 사용자 include/exclude pattern과 그 precedence(구 2번).**
  아래 두 절(언어 matrix, 미실행-테스트-성공-아님)은 원 지시의 흔적으로 그대로 두되 위 축소를
  반영해 갱신했다 — 원문을 지우지 않는 이 저장소의 정정 관례.
- 선행: `docs/work/task-m4-il-lim-010-test-classifier.md`(PR #91 merge — 공통 classifier 통합,
  `ruleId` 계산은 이미 있음). 이 문서는 그 PR이 "이번 PR에서 JSON 계약을 안 건드리는 이유"로
  명시적으로 미룬 항목(rule ID를 사용자에게 노출)과, story 1단계 3번(사용자 pattern precedence)을
  마저 닫는다.
- 상위 story: `docs/development-management/stories/il-lim-010-test-impact-discovery.md`
  ("IL-LIM-010 관련 테스트 탐지 정확도 개선") 1단계.
- 상위 gate: `docs/work/task-m4-milestone-closure-audit.md`의 gate 1(IL-LIM-001·002·010 수용 기준
  14개) — M4 8개 gate 중 열려 있는 두 gate(1·8) 중 하나. gate 8(사용자 테스트 명세)은 사용자 지시로
  후속으로 미뤄졌고, 지금은 gate 1이 유일한 대상.

## 목적과 사용자 가치

**사용자가 겪는 문제.** 지금 사용자는 "관련 테스트" 목록을 받지만 어떤 파일이 왜 테스트로 분류됐는지
알 방법이 없다. `classifyTestFile()`(`cli/src/shared/testFileClassifier.ts`)은 이미 `ruleId`를
계산해 반환하지만, 두 호출부(`cli/src/impact.ts`, `src/impactAnalyzer.ts`) 중 어디도 그 값을
바깥으로 내보내지 않는다(`grep -rn "ruleId" cli/src src` 재확인 — 소비자 0건, 계산만 되고 버려짐).
그 결과 사용자는 "관련 테스트" 목록이 짧게 나와도 그게 "정말 테스트가 없다"인지 "우리 프로젝트의
관례가 기본 규칙과 달라서 못 찾았다"인지 구분할 수 없고, 후자라 해도 지금은 고칠 방법(사용자 지정
pattern)이 아예 없다. 이건 이 milestone이 반복해서 막아 온 실패 모양(조용한 기각 — `augmentation_
budget_exceeded`/`framework_route_mount_unresolved`가 같은 이유로 `limitationDetails`에 등록된
전례)과 정확히 같다.

**이 작업 완료 후 가능해지는 것**:
1. 사용자가 "관련 테스트"로 분류된 각 노드에서 "왜"(어느 규칙 또는 자신이 설정한 어느 pattern이
   맞았는지)를 본다.
2. 사용자가 자기 프로젝트의 test 파일 명명 관례가 기본 5개 규칙과 다를 때, include pattern으로
   누락을 직접 메우고 exclude pattern으로 오탐을 직접 뺄 수 있다 — 지금은 이 통로 자체가 없다.
3. 오타 낸 pattern이 조용히 무시되지 않고 분석 실패로 보여, "규칙을 넣었는데 왜 안 되지"라는 혼란을
   막는다.
4. TS/JS·Go·Python·C/C++(CLI가 실제 도달 가능한 4개 언어) 표준·비표준 test 경로가 fixture로 고정돼,
   다음에 규칙을 건드리는 변경이 이 4개 언어에서 회귀하면 즉시 잡힌다.

**상위 목표와의 관계**: story 1단계 종료 조건("Extension과 CLI가 같은 path matrix에 동일 결과·근거를
반환한다")의 "근거" 절반은 PR #91이 아직 못 채웠다 — 그 문서 자신의 "제외" 절이 "rule ID는 있지만
JSON 계약에는 아직 안 싣는다"고 명시했다. 이번 lane이 그 약속을 갚는다. gate 1은 이 story 하나만이
아니라 IL-LIM-001·002도 포함하지만, 이 문서는 IL-LIM-010 몫만 다룬다.

**왜 지금**: 사용자가 gate 8(사용자 테스트 명세)을 후속으로 미루고 남은 gate를 닫으라고 지시했고,
M4는 8개 중 6개가 닫혀 열린 건 gate 1·8뿐이다. gate 1의 세 story 중 `IL-LIM-010`은 통째로
미착수(1단계 일부만 PR #91로 진행)로 기록돼 있어, 지금 대상이다.

## 배경과 해결할 문제 — 지금 코드가 실제로 하는 일

- `classifyTestFile(filePath)`는 `{ isTest: boolean, ruleId: string | null }`를 반환한다
  (`cli/src/shared/testFileClassifier.ts:124-140`). `ruleId`는 5개 규칙(`test-directory`,
  `dot-suffix`, `underscore-prefix`, `underscore-suffix`, `pascal-suffix`) 중 어느 것이 맞았는지의
  stable id다.
- `cli/src/impact.ts:67`(`classifyRelation(entry.depth, relativeItemFile)`)와
  `src/impactAnalyzer.ts:105`(`classifyImpactRelation(depth, path)`)는 이 값에서 **`isTest`만
  뽑아 `ImpactRelation`(`'root'|'direct'|'transitive'|'test'`) 하나로 뭉갠다** — `ruleId`는 두
  얇은 어댑터(`cli/src/testFile.ts`의 `classifyRelation()`, `src/testFile.ts`의
  `classifyImpactRelation()`) 안에서 계산됐다가 반환값에서 버려진다.
- 사용자 pattern을 위한 설정 표면은 CLI·Extension 어디에도 없다. Extension은
  `impactLens.*` workspace 설정(`package.json`의 `contributes.configuration`)을 이미 쓰고 있고,
  CLI는 워크스페이스가 신뢰하는 committed 설정 파일 관례(`.impact-lens/provider.json`,
  `cli/src/providers/projectConfig.ts`)를 이미 갖고 있다 — 이번 lane은 새 메커니즘을 발명하지 않고
  이 두 기존 관례를 그대로 재사용한다.
- invalid 설정을 "에러로 보이게" 만드는 전례도 이미 있다: `readProjectProviderChoice()`는 committed
  `.impact-lens/provider.json`이 이해 불가능하면 `provider_config_invalid`(`invalid_request`와는
  다른, 파일이 원인임을 명시하는 code)를 던진다(`cli/src/providers/manifest.ts:63`,
  `cli/src/errors.ts:43`). 이번 lane은 같은 모양의 code를 test pattern 설정에도 만든다.
- `cli/src` 전체(런타임 의존성: `typescript`, `typescript-language-server`, `pyright` — 전부 provider
  실행 파일이지 코드에서 import하는 라이브러리가 아님)와 특히 `cli/src/shared/**`(Extension VSIX에
  그대로 번들되는 경로, `.vscodeignore`의 negation과 `scripts/test-vsix-contents.mjs`의 require-
  boundary 검사가 강제)에는 **glob 매칭 라이브러리를 포함해 어떤 npm 런타임 의존성도 없다**
  (`cli/package.json` 확인 — `dependencies`엔 provider 바이너리 3개뿐). 이번 lane에서 사용자 pattern
  매칭에 `minimatch`/`micromatch` 같은 라이브러리를 새로 추가하면 이 경계를 깨므로, **직접 구현한
  아주 좁은 glob 부분집합**을 쓴다(아래 "glob 문법" 절).

## 범위와 범위에서 제외할 항목

- **포함(2026-09-10 축소 후 실질 범위)**: 아래 계약 설계안 두 개(분류 근거 노출 `testRule`/
  `ruleId`, 사용자 pattern precedence) 확정 → 구현 → 기존 corpus로 회귀 없음 확인 → 공백-통과
  판정을 문서·주석에 기록.
- **제외(story 2단계)**: `TestEvidence`(`call-hierarchy`/`path-convention`/`framework-adapter`/
  `coverage-observation`) 전체 모델링, symbol kind 기반 test-case vs helper 구분, adapter SPI. 이번
  lane이 만드는 필드는 그 네 종류 중 `path-convention` 하나만 담당하고, 이름도 일부러 다르게
  지어(`testRule`, 아래 참고) 나중에 `TestEvidence.pathConvention`으로 흡수될 여지를 남긴다.
- **제외(story 3단계)**: test 실행 결과 import(artifact 신뢰 경계 설계가 딸린 별도 분량).
- **제외(이번 PR)**: Java — `cli/src/providers/catalog.ts` 기준 CLI가 실제 도달 가능한 언어가
  아니다(IL-LIM-018/M3 미구현, provider 자체가 없음). story의 테스트 계획 표는 Java도 이름을
  대지만, **명시적으로 범위 밖으로 남기고 M3(Java provider 착수) 이후로 이월한다** — 조용히 빼지
  않고 아래 "언어 목록과 이월 목록" 절에 남긴다.
- **제외(이번 PR)**: `TestFileClassification`의 `source`/`suppressedRuleId` 내부 필드 중
  `user-exclude` 경우의 "어떤 기본 규칙이 억제됐는지"를 사용자에게 보이는 JSON에까지 노출하는 것 —
  내부적으로는 계산하지만(디버깅·후속 stage 2 근거로 남김), 이번 PR이 노출하는 건 `relation ===
  'test'`인 노드의 근거뿐이다(아래 계약 설계안 참고). 조용히 버리는 게 아니라 명시적으로 이번 PR
  범위 밖으로 남긴다.

## 1번 계약 설계안 — 분류 근거를 어디에, 어떤 모양으로 노출하는가

### 왜 `relation` 필드를 건드리지 않는가

`relation: ImpactRelation`(`'root'|'direct'|'transitive'|'test'`)은 이미 존재하는 필드고, 오늘
그 값을 전수로 읽는 소비자가 있을 수 있다(Extension UI 색상 판단 — gate 5,
`docs/work/task-m4-gate5-test-color.md` — 가 `relation === 'test'`를 직접 근거로 쓴다). 이
저장소는 같은 문제("기존 필드에 새 정보를 얹고 싶다")를 이미 두 번 풀었고 두 번 다 답이 같았다:
**기존 필드의 의미는 그대로 두고, 새 필드를 따로 만든다** — `data.edges`(확인된 caller) 옆에
`data.augmentedEdges`(후보 caller)를 신설(M4 stage 1), `limitations`(string 배열) 옆에
`limitationDetails`(구조화 객체 배열)를 신설(X3, `LimitationDetail` 인터페이스 자체가 그 설계).
이번 lane도 같은 규칙을 따른다: `relation`은 오늘과 똑같이 계산되고 똑같은 값을 낸다. **새 필드
하나를 추가할 뿐, 기존 필드의 계산이나 의미를 바꾸지 않는다.**

### 새 필드: `testRule`

`cli/src/impact.ts`의 node 객체 리터럴(68~85행)과 `src/impactAnalyzer.ts`의 `ImpactNode` 생성
지점(108~120행) 양쪽에, `relation`/`testDistance`와 나란히 다음 필드를 추가한다:

```ts
// cli/src/types.ts (신규 export)
export interface TestClassificationRule {
  /**
   * 기본 규칙이 맞았으면 그 규칙의 stable id(`dot-suffix` 등, `testFileClassifier.ts`의 `RULES`
   * 배열과 동일 문자열). 사용자 include pattern이 맞았으면 그 pattern 문자열 그대로(예:
   * `"e2e/**/*.spec.ts"`) - 사용자 자신이 설정 파일에 쓴 값이라 그 자체가 가장 설명력 있는 id다.
   */
  readonly id: string;
  readonly source: 'default-convention' | 'user-include';
}
```

```ts
// node 객체에 추가되는 필드
testRule: relation === 'test' ? TestClassificationRule : null,
```

- `relation !== 'test'`이면 항상 `null`(오늘 `testDistance`가 이미 쓰는 것과 같은 관례 — 새 개념을
  발명하지 않는다).
- `relation === 'test'`이면 반드시 non-null이다 — "테스트로 분류됐는데 근거가 없다"는 상태 자체를
  타입으로 배제한다. 이번 lane이 만드는 유일한 두 근거(default 규칙, 사용자 include pattern)만
  `relation`을 `'test'`로 뒤집을 수 있으므로 이 불변조건은 항상 지킬 수 있다(사용자 exclude
  pattern은 반대 방향으로만 작동한다 - 아래 precedence 참고).
- **이름을 `testEvidence`로 짓지 않는 이유**: story(`il-lim-010-test-impact-discovery.md`
  "권장 대응" 절)가 그 이름을 이미 stage 2/3용 더 큰 개념(`call-hierarchy`/`path-convention`/
  `framework-adapter`/`coverage-observation` 네 종류의 합집합)으로 예약해 놓았다. 지금 좁은
  개념에 그 이름을 먼저 쓰면 stage 2에서 실제 `TestEvidence`를 도입할 때 또 한 번 필드 rename이
  필요해진다(그 자체가 "기존 필드 의미가 조용히 바뀐다" 위험). `testRule`은 stage 2에서
  `TestEvidence.pathConvention`으로 그대로 흡수될 수 있는 좁은 이름이다.

### `classifyTestFile()`의 반환 타입 확장 — 기존 소비자에게 무엇이 안 바뀌는가

```ts
// cli/src/shared/testFileClassifier.ts
export interface TestFileClassification {
  readonly isTest: boolean;
  /** 안 바뀜: 기본 규칙이 맞았을 때만 그 규칙의 stable id, 그 외엔 null. 사용자 include pattern이
   * 맞은 경우도 null이다 - "규칙을 재배포해도 안 바뀌는 안정적 식별자"라는 이 필드의 기존 계약을
   * 사용자가 언제든 바꿀 수 있는 자기 pattern 문자열로 흐리지 않는다. */
  readonly ruleId: string | null;
  /** 신규. 어떤 채널이 최종 `isTest` 값을 결정했는지. */
  readonly source: 'default-convention' | 'user-include' | 'user-exclude' | 'none';
  /** 신규. `source`가 `user-include`/`user-exclude`일 때만 non-null - 실제로 매치한 사용자 pattern
   * 문자열 원문. */
  readonly matchedPattern: string | null;
  /** 신규. `source === 'user-exclude'`일 때만 의미 있음 - 이 pattern이 아니었다면 어느 기본
   * 규칙이 맞았을지(있었다면). 이번 PR은 이 필드를 계산은 하지만 JSON 응답에는 아직 안 싣는다
   * (위 "범위에서 제외" 참고) - 내부 디버깅과 stage 2 근거로만 쓴다. */
  readonly suppressedRuleId: string | null;
}
```

`isTest`/`ruleId` **두 필드만 읽는 기존 코드**(오늘의 `classifyRelation`/`classifyImpactRelation`
자체가 그 소비자다)는 사용자 pattern이 하나도 설정되지 않은 워크스페이스에서 정확히 오늘과 같은
값을 계속 받는다 - `source`는 항상 `'default-convention'`(isTest true) 또는 `'none'`(isTest
false)이 되고, 이는 오늘 `ruleId !== null`/`ruleId === null`과 논리적으로 동치다. 사용자가 pattern을
설정한 워크스페이스에서만 `source`가 `'user-include'`/`'user-exclude'`를 낼 수 있다.

`classifyTestFile()`의 시그니처는 세 번째(선택) 인자로 컴파일된 사용자 pattern을 받는다:

```ts
export function classifyTestFile(
  filePath: string,
  userPatterns?: CompiledTestPatterns, // 아래 precedence 절 참고
): TestFileClassification
```

인자를 생략하면(오늘의 모든 호출부가 그렇다) 사용자 pattern이 아예 없는 것과 동일하게 동작한다 -
기존 계약("경로 문자열만 받는다")의 확장이지 위반이 아니다. `filePath` 하나만 받는다는 계약의
핵심(워크스페이스·파일시스템 접근 없음)은 그대로 유지된다 - `userPatterns`는 호출부가 이미 읽어
컴파일해 놓은 순수 데이터일 뿐이다.

### JSON 응답 스키마 영향

`cli/schemas/response.schema.json`의 `nodes`는 `{"type": "array"}`로 항목 형태를 제약하지 않으므로
스키마 자체는 깨지지 않는다. 다만 사용자·agent 대상 문서(`plugins/impact-lens/skills/impact-lens-
cli/references/cli-contract.md`)에는 새 필드를 설명하는 절을 추가해야 한다(`data.augmentedEdges`
절과 같은 자리) - 구현 단계 산출물로 넣는다.

### `il-contract-architect` 경계

이 저장소는 "상태 어휘나 응답 필드를 바꾸는 작업"을 `il-contract-architect` 전담으로 명시한다.
commander가 이 lane을 이 세션에 직접 배정했지만, `types.ts`/`errors.ts`/JSON schema 변경은 그
경계를 건드리는 작업이다 - 구현 PR에서 이 설계안을 그대로 반영하되, reviewer의 gate 1 감사에 이
경계 문제를 명시적으로 노출한다(아래 "reviewer 감사와의 정합" 참고).

## 2번 precedence 규칙 초안

### 기본 방향 — 어느 framework 관례를 재현하는가

**exclude가 항상 include(기본 규칙이든 사용자 include든)를 이긴다.** 1차 출처: **Jest의
`testPathIgnorePatterns`**(Jest 공식 문서) - Jest는 `testMatch`/`testRegex`로 후보를 찾은 *다음*
`testPathIgnorePatterns`를 적용해 최종 목록에서 제거하고, 이 순서를 뒤집을 옵션이 없다(exclude를
다시 exclude하는 "un-ignore" 메커니즘이 없다). `testPathIgnorePatterns`의 기본값(`["/node_modules/
"]`)도 같은 방향으로 실증한다 - "찾았어도 특정 경로 아래면 무조건 뺀다"가 Jest의 기본 동작
자체다. `testFileClassifier.ts`의 `dot-suffix` 규칙이 이미 이 framework를 1차 출처로 쓰고 있으므로
(위 규칙 테이블 참고), 같은 코드베이스 안에서 규칙 판정과 precedence 판정이 서로 다른 framework를
근거로 삼지 않는다는 일관성도 얻는다.

**우선순위(높은 순)**:
1. **사용자 exclude pattern** - 매치하면 그 파일은 절대 `'test'`가 아니다. 기본 규칙이 맞았든,
   사용자 include pattern이 맞았든 상관없이 마지막에 적용돼 뒤집는다.
2. **기본 규칙 5개 + 사용자 include pattern** - 이 둘 사이에는 서로를 이기는 관계가 없다(둘 중
   하나라도 맞으면 후보). 기본 규칙과 사용자 include pattern이 동시에 같은 파일에 맞아도 결과는
   똑같이 `isTest: true`이므로 층 사이 순서를 정의할 필요가 없다 - `source`는 이 경우
   `'default-convention'`을 우선 보고한다(둘 다 이유가 있을 때 이미 stable id가 있는 쪽을
   보여주는 게, 사용자가 "이 정도면 내 pattern 없이도 됐겠구나"를 아는 데 더 유용하다).
3. **아무것도 안 맞음** - `isTest: false`, `source: 'none'`.

이 세 단계는 정확히 Jest의 "먼저 넓게 모으고(`testMatch`), 나중에 무조건 뺀다
(`testPathIgnorePatterns`)" 2단 모델을 그대로 재현한 것이다 - 기본 규칙과 사용자 include를 같은
"모으는 단계"로 합치고, 사용자 exclude만 "빼는 단계"로 분리했다.

### invalid pattern — 조용히 무시하지 않는다

**"invalid"의 정의** (직접 구현하는 좁은 glob 부분집합에 맞춘 기준):

- 빈 문자열.
- 백슬래시(`\`) 포함 - Windows 경로 구분자인지 이스케이프 문자인지 모호하고, 이 저장소의 기존
  분류기(`testFileClassifier.ts`)도 입력을 항상 `/`로 정규화해 받으므로, 사용자 pattern에 `\`가
  있으면 어느 쪽으로도 추측하지 않고 에러로 만든다.
- `*`, `**`, `/` 이외의 glob 메타문자(`?`, `[`, `]`, `{`, `}`, `!`) 포함 - 이번 PR이 지원하는 문법이
  `*`/`**`뿐이므로, 이런 문자가 있으면 "사용자가 더 풍부한 문법(부정 pattern 등)을 기대했는데
  글자 그대로 매치되는" 조용한 오작동이 나기 쉽다. 지원하지 않는 문자는 리터럴로 받아주지 않고
  명시적으로 거부한다.
- (include/exclude 배열 자체의 타입 오류 - 문자열 배열이 아님, 등) `.impact-lens/provider.json`의
  기존 검증 방식(`optionalStringArray`, `cli/src/providers/projectConfig.ts:113`)을 그대로 재사용.

**glob 문법 (이번 PR이 지원하는 부분집합)**:
- `*` - `/`를 제외한 임의 문자열(0개 이상).
- `**` - `/`를 포함한 임의 문자열(0개 이상), 디렉터리 경계 없이 매치.
- 그 외 모든 문자는 리터럴.
- 패턴은 항상 전체 workspace-relative 경로(POSIX 구분자로 정규화된, `classifyTestFile()`이 이미
  받는 것과 동일한 형태)에 **완전히** 매치해야 한다(부분 매치 없음 - 암묵적 `^...$`). `.gitignore`
  스타일의 "디렉터리 이름 하나만 써도 어디서든 매치"는 지원하지 않는다 - 그 확장은 필요성이
  확인되면 후속.

**에러로 보이게 하는 경로 (두 host 대칭)**:
- **CLI**: `.impact-lens/test-patterns.json`(`.impact-lens/provider.json`과 나란한 새 파일,
  `{"include": [...], "exclude": [...]}`)을 읽는 시점에 즉시 컴파일을 시도하고, invalid pattern이
  하나라도 있으면 새 error code `test_pattern_config_invalid`를 던진다(`cli/src/errors.ts`의
  `CLI_ERROR_CODES`에 추가 - `provider_config_invalid`와 같은 "설정 파일이 원인" 계열이지만
  provider 전용 exit 5 그룹과는 다른 관심사이므로 별도 code로 유지, exit 코드 배정은
  `il-contract-architect` 확인 필요). `origin`/`field`/`reason` 상세를 `provider_config_invalid`와
  같은 모양으로 담는다 - **`limitationDetails`가 아니라 최상위 `ok: false` 에러**로 만든다(분석이
  잘못된 pattern으로 계속 진행되는 것 자체가 이 항목이 막으려는 "조용한 무시"이기 때문에,
  경고가 아니라 요청 실패가 맞다).
- **Extension**: workspace 설정 `impactLens.testPatterns.include`/`impactLens.testPatterns.exclude`
  (`string[]`, 기본값 `[]`)를 읽어 같은 컴파일 함수에 넣는다. invalid pattern이 있으면 분석 시작
  시점에 예외를 던지고, 이미 있는 실패 경로(`controller.ts:440`/`486`의
  `vscode.window.showErrorMessage`)를 그대로 태워 보낸다 - 새 UI 컴포넌트를 만들지 않는다.
- 두 경로 모두 **컴파일 함수 자체는 공유 모듈**(`cli/src/shared/testFileClassifier.ts`에 추가할
  `compileTestPatterns(include, exclude): CompiledTestPatterns`, 실패 시 `throw`)에 있다 - "invalid를
  무엇으로 보이게 할지"만 host별로 다르고(CLI는 CliError, Extension은 기존 에러 표시 경로), "무엇이
  invalid인지" 판정은 한 곳에서만 한다. 두 host가 다시 갈라지는 재발을 이 lane 자체가 막아야 한다는
  PR #91의 교훈을 그대로 잇는다.

### `LIMITATION_SURFACE_PATTERNS` 등록 필요 여부

이번 설계는 새 `limitationDetails` code를 만들지 않는다(invalid pattern은 위에서 결정한 대로
최상위 에러) - 그래서 `scripts/lib/response-policy-engine.mjs`의 `LIMITATION_SURFACE_PATTERNS`에
새로 등록할 항목이 없다. 다만 구현 중 "사용자 pattern이 실제로 결과를 바꿨다"는 사실 자체를
`limitationDetails`로도 공개할지(예: `test_pattern_applied`, info severity)는 이번 commander
지시의 4개 항목에는 없는 확장이라 **이번 PR에서 만들지 않고 후보로만 기록한다** - 만든다면 그때
반드시 `LIMITATION_SURFACE_PATTERNS`에 등록해야 한다는 걸 후속 작업자를 위해 여기 남긴다.

## 3번(구) 언어 matrix — 이미 통과, 새 fixture 안 만듦

**2026-09-10 갱신**: reviewer의 gate 1 감사가 이 항목을 이미 통과로 판정했다 — PR #91이
JS/TS/Python/Go/Java/Ruby 각각의 표준·비표준 경로를 1차 출처(pytest/Jest/`go test`/Surefire/RSpec
공식 문서) 기준 규칙과 30개 경로 corpus(및 후속 2808행 cartesian corpus)로 이미 검증·고정했다
(`docs/work/task-m4-il-lim-010-test-classifier.md`의 "최종 규칙 테이블", `cli/src/test/
testFileClassifier.test.ts`, `src/test/testFileClassifierMatrix.test.ts`). **이번 PR은 새 언어
fixture를 추가하지 않는다** — commander 지적대로 대량 생산은 낭비고, 진짜 위험은 다른 곳(아래)에
있다.

**이번 PR이 대신 확인하는 것 — 사용자 pattern 축이 기존 corpus를 회귀시키지 않는가.** 사용자
include/exclude pattern은 `classifyTestFile()`의 세 번째 인자로만 개입하고(위 "1번 계약 설계안"
절), 그 인자가 없거나 빈 배열이면 기존 5개 규칙 경로는 코드 흐름상 전혀 안 건드린다 - 그래도
"안 건드릴 것"이라는 주장과 "실제로 안 건드렸다"는 관측은 다르므로, 구현 단계에서 다음을 실행으로
확인한다:
1. 사용자 pattern을 전혀 안 준 상태로 기존 `cli/src/test/testFileClassifier.test.ts`/`src/test/
   testFileClassifierMatrix.test.ts` 전체가 그대로 green(회귀 0건).
2. 사용자 pattern이 **매치하지 않는** 임의 경로에 대해 `classifyTestFile(path, somePatterns)`와
   `classifyTestFile(path)`(인자 생략)가 완전히 같은 `{isTest, ruleId}`를 낸다는 걸 기존 30개 경로
   corpus에 대해 재실행(새 fixture 추가가 아니라 기존 corpus의 재사용).

### 언어 목록과 이월 목록 (원 지시 참고용으로 보존)

| 언어 | CLI preset | 표준 경로 예시 | 비표준(부정) 경로 예시 |
| --- | --- | --- | --- |
| TypeScript/JavaScript | `bundled-typescript` | `order.test.ts`, `order.spec.tsx`, `__tests__/order.ts` | `tester.ts`, `contest.ts`, `test-utils.ts`(hyphen, 기각됨), `a.test.d.ts`(제외) |
| Go | `gopls`(verified-external) | `order_test.go` | `order-test.go`(hyphen, `.go`엔 규칙 자체가 underscore-suffix뿐이라 애초에 무관), `testorder.go` |
| Python | `bundled-pyright` | `test_order.py`, `order_test.py` | `tester.py`, `contest.py`, `test-order.py`(hyphen, 기각됨) |
| C/C++ | `clangd`(verified-external) | (파일명 관례 없음 - `test-directory`만 적용) `tests/order.cpp` | `order_test.cpp`(오늘도 `false` - 의도된 결과, 회귀 아님) |

각 언어에 **사용자 include/exclude pattern이 기본 규칙과 상호작용하는 fixture**도 최소 1쌍씩
추가한다(예: Python에서 `spec_*.py`처럼 기본 규칙이 안 잡는 관례를 include pattern으로 잡는 경우,
TS에서 `**/*.integration.test.ts`처럼 기본 규칙은 잡지만 실제로는 통합 테스트라 이 프로젝트에선
"관련 단위 테스트" 취급을 원치 않는 경우를 exclude pattern으로 빼는 경우).

Ruby(`.rb`, `underscore-suffix` 규칙 보유)는 CLI에 provider가 없어 이 표에서 제외한다 - Extension
쪽에서는 사용자가 임의 LSP를 설치하면 규칙 자체는 이미 도달 가능하지만(PR #91 문서의 "언어 스코프의
근거는 catalog.ts가 아니다" 절 참고), **CLI fixture matrix**는 catalog가 실제로 인덱싱하는 언어로
한정한다는 게 이번 lane의 스코프 결정이다(story의 테스트 계획 표가 언어를 나열하는 방식과 다르게,
"CLI가 실제로 도달하는가"로 좁힌다 - Java와 같은 이유).

### 명시적으로 이월하는 목록 (조용히 빼지 않음)

| 언어/항목 | 이월 사유 | 재개 조건 |
| --- | --- | --- |
| Java | `catalog.ts`에 provider가 없다(IL-LIM-018, M3 계획됨, 미구현) - CLI fixture matrix에 넣어도 실제 입력이 절대 오지 않는 죽은 케이스가 된다 | M3 Java/Spring provider 착수 시 |
| Ruby | 같은 이유(CLI provider 없음) - `pascal-suffix`/`underscore-suffix` 규칙 자체는 이미 있고 정확하므로 규칙을 새로 만들 필요는 없다, CLI fixture만 없음 | CLI에 Ruby LSP preset이 생기면 |
| Kotlin | 1차 출처(공식 discovery 관례 문서)를 PR #91 조사에서 못 찾았다 - 규칙 자체가 아직 없어 fixture를 만들 대상도 없다 | 1차 출처가 확인되면(Java/Kotlin/Spring 계획 lane이 조사 중 - `java-kotlin-spring-plan-before-m4-close` 메모리 참고) |
| C#(`.cs`) | 파일명 기반 기본 discovery가 없다는 게 이미 PR #91이 확인한 결론(`Microsoft.NET.Test.Sdk` 패키지 참조 기반) - `test-directory`만 적용되는 게 최종 상태이지 미완성이 아니다 | 없음(의도된 최종 상태) |
| Surefire 구분자 없는 prefix(`TestForm.java`) | PR #91이 이미 "검증·구현 비용 대비 범위 밖"으로 명시 이월 | 필요성이 재확인되면 |
| `.pyi` typeshed root | PR #91이 이미 조사·문서화, 코드 동작 변경 없음 | 없음(현재 상태가 의도된 결과로 보임) |

## 4번 항목 — "실행하지 않은 테스트를 성공으로 표시하지 않는다": 이미 통과, 그러나 공백에 의한 통과

**2026-09-10 reviewer 판정 반영 — 이 항목을 위해 새 상태·모델을 만들지 않는다.**
`TestFreshness`(Extension, `src/types.ts:11`)는 `'notRun' | 'outdated'` 둘뿐이고, `'passed'`/
`'failed'` 계열 - 즉 "실행해서 성공/실패했다"를 뜻하는 값 자체가 **타입에 존재하지 않는다**.
`src/impactAnalyzer.ts:119`도 `isTest ? 'notRun' : undefined`로, test 후보는 항상 `notRun`이다.
CLI JSON 쪽은 `testFreshness`에 대응하는 필드 자체가 없다.

**이 판정의 성격을 정확히 기록한다**: 이 acceptance criterion은 오늘 위반되지 않지만, 그 이유는
"위반을 막는 안전장치가 검증됐다"가 아니라 **"위반할 수 있는 기능 자체가 없다"**이다 - `'passed'`라고
잘못 표시할 코드 경로가 존재하지 않으므로 위반이 구조적으로 불가능할 뿐이다. 이 둘은 완전히 다른
주장이고, 후자를 전자처럼 보고하면 이 milestone이 반복해서 경계해 온 "테스트 통과를 사용자 목표
달성과 같은 뜻으로 쓰지 않는다"(CLAUDE.md)는 원칙을 안전장치 자체에 대해서도 어기는 셈이 된다.

**이 판정은 유효기간이 있다**: `IL-LIM-010` 3단계(테스트 실행 결과 import, 이번 lane 범위 밖)가
`'passed'`/`'failed'`류 상태를 도입하는 순간, "위반이 구조적으로 불가능하다"는 근거 자체가
사라진다 - 그때는 이 acceptance criterion을 **다시 판정해야 한다**(partial coverage를 전체 성공으로
해석하지 않는지, stale/failed 상태가 실제 실행 metadata로 구분되는지 - story의 3단계 종료 조건이
이미 이 내용이다). 지금 "통과"로 닫아 놓고 3단계 담당자가 그 이력을 못 보면, 이 gate가 이미 닫혔다는
이유로 진짜 위험(3단계에서 처음 생기는 위반 가능성)을 그냥 지나칠 수 있다.

**산출물**: 새 코드는 만들지 않는다. 대신
1. 이 문서에 위 판정(공백에 의한 통과 + 3단계 도래 시 재판정 필요)을 남긴다(지금 이 절).
2. `src/types.ts`의 `TestFreshness` 타입 선언 바로 옆에 같은 취지의 주석을 추가한다 - "이 타입에
   `'passed'`/`'failed'`가 없는 것은 지금은 우연히 안전장치 역할도 하지만(실행 결과를 표시할 방법이
   없으므로 실행 안 한 걸 성공으로 잘못 표시할 수도 없다), 3단계가 그 값을 추가하는 순간 이 안전은
   사라지므로 그때 별도로 재검증해야 한다"는 내용. 코드 동작은 안 바꾼다 - 순수 주석 추가.
3. closure audit(`task-m4-milestone-closure-audit.md`)의 gate 1 항목에도 "구 4번은 공백에 의한
   통과"라는 같은 문장을 남겨, gate 1 전체를 나중에 다시 읽는 사람이 같은 오해를 하지 않게 한다.

## reviewer 감사와의 정합

commander가 reviewer에게 별도로 gate 1 전체(14개 수용 기준) 독립 감사를 의뢰했고, 그 결과가 이
lane의 범위를 바꿀 수 있다고 명시했다. 이 설계안은 그 감사 결과가 도착하기 전에 작성됐으므로,
구현 착수 전에 commander가 두 결과를 맞춰본 뒤 범위 확정을 다시 받는다 - 특히 `il-contract-architect`
경계(위 "1번 계약 설계안" 절 마지막)와 `test_pattern_config_invalid`의 exit code 배정은 reviewer
감사에서 다른 관점이 나올 수 있는 지점으로 미리 표시해 둔다.

## 다음 단계

이 문서는 설계 단계에서 멈춘다. 구현은 commander의 확인(및 reviewer 감사와의 대조) 이후, 이 문서의
"단계별 구현 계획"을 아래처럼 채워 시작한다(지금은 목차만):

1. **공유 모듈 확장**: `classifyTestFile()` 시그니처 확장, `compileTestPatterns()` 신규, glob
   매칭 순수 함수, 단위 테스트(패턴 없음 = 기존 30개 경로 corpus 전부 회귀 없음 포함).
2. **두 host 배선**: `cli/src/impact.ts`/`src/impactAnalyzer.ts`에 `testRule` 필드 추가,
   `.impact-lens/test-patterns.json` 읽기(CLI), `impactLens.testPatterns.*` 설정 읽기(Extension),
   invalid pattern 에러 경로 양쪽 배선.
3. **공백-통과 판정 기록**: `src/types.ts`의 `TestFreshness` 옆 주석 + closure audit 갱신(코드
   동작 변경 없음).
4. 문서(`cli-contract.md`, story rollout 절, closure audit) 갱신.

각 단계는 AGENTS.md 2절 기준대로 독립 commit 가능 단위인지 구현 착수 시점에 재확인한다(1·2번은
컴파일 의존성이 있어 합칠 가능성이 높다 - PR #91의 선례와 같은 이유).
