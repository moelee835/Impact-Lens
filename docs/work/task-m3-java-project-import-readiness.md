# M3 Java 3단계: project import와 readiness — 사전 작업 문서 (초안)

- 상태: 구현 완료, PR 올림, reviewer 검토 대기(commander 지시 — 검토 전 merge 금지) — 아래
  "구현 진행 상황" 참고
- 관련 스토리: [`IL-LIM-018`](../development-management/stories/il-lim-018-java-language-support.md) 3단계
- 선행 lane: [Lane I(2단계, discovery/JDK compatibility)](task-m3-java-discovery-jdk.md), PR #122(`7349b60`)

## 구현 진행 상황(2026-09-10)

완료(전부 테스트 통과, `feat/m3-java-project-import-readiness` 브랜치):
1. `workspaceRoot` $ref 추가, `-data` 인자에 연결 — `-data` 충돌 실제로 고쳐짐(`7dd84c6`).
2. `autoDiscover()`에서 `tier: 'unsupported'` 배제 — Auto 비선택이 실행 테스트로 pin됨(`7dd84c6`).
3. `java.jdtls` catalog 등재(`tier: 'unsupported'`, readiness, docs.limitations) + `.java` →
   `'java'` languageId 매핑 추가(`f9fdd26`).
4. doctor의 "검증되지 않음" 보고 확인(`f9fdd26`) — 실행 테스트로 pin됨.
5. README 갱신(`b44458d`).

**추가로, 실제 jdtls 바이너리(v1.61.0)와 JDK 21로 `analyze` 전체 경로를 실제 실행했다(계획에
없었지만, 등재한 메커니즘이 진짜로 동작하는지 실행 없이는 알 수 없어서 직접 확인함):**
- `providerPreset: "java.jdtls"`로 실제 jdtls를 기동, `-data` 인자를 실제로 받아들였다(PATH의
  `jdtls` 래퍼가 정상 실행됨).
- 응답의 `coverage.indexing`이 `{"status":"ready","evidence":{"signal":"notification","detail":
  "language/status"}}`로 나왔다 — `language/status`→`ServiceReady` readiness 신호가 실제
  jdtls 프로세스에서 정확히 매치됐다는 뜻이다(추측이 아니라 실행 확인).
- `lifecycle.status: "ready"`, `provider.selectedBy: "preset"` — Auto가 아니라 명시적 선택
  경로로만 접근됨도 같은 실행에서 확인됐다.

**다만 이 실행에서 발견한 것 하나, 고치지 않고 기록만 한다**: standalone(빌드 시스템 없는)
**여러 파일**로 구성한 fixture(`Target.java`+`Caller.java`, 서로 다른 파일)에서 `incomingCalls`가
**빈 배열**로 나왔다 — `no_incoming_callers` limitation으로 정직하게 보고됐지만(침묵하는 빈 결과는
아니다), 실제로는 `Caller.java`가 `Target.fixtureTarget`을 호출한다. entry gate lane의 "standalone"
검증(`task-m3-java-entry-gate.md:68`)은 **단일 파일**(`Fixture.java` 하나)이었다고 적혀 있어 -
**여러 파일로 구성된, 빌드 시스템이 없는 standalone Java 프로젝트의 cross-file 해석**은 entry gate가
실제로 검증한 것과 다른 경우일 수 있다. 이게 jdtls 자체의 한계인지(빌드 시스템 없이는 여러 파일을
하나의 classpath로 못 묶는다), 이 lane의 fixture 설정 문제인지(예: 더 긴 색인 시간이 필요했거나,
`-data` 디렉터리가 매 실행마다 새로 만들어져 warm 색인이 아니었을 가능성) **원인을 이 lane이
분리하지 않았다** — `unsupported` tier가 정확히 이런 경우를 위해 존재한다(정확도를 주장하지
않는다)는 점에서 이 lane의 범위를 벗어나는 조사이지만, 다음에 이 preset의 정확도를 실제로 검증하는
lane(스토리 4단계, "verified scope에서 반복 가능한 Plugin 결과")이 있다면 이 관찰을 재현 대상
목록에 넣어야 한다.

**2026-09-10 정정 — 항목 1은 "진단 편의"가 아니었다(commander 지적, 반영 완료).** 위에서 "진단
편의 기능에 가까워졌다"고 판단한 게 틀렸다: 빌드 시스템 없는 multi-file standalone에서
`incomingCalls`가 빈 배열로 나온 발견 자체가 정확히 그 반례다 — jdtls는 `ready`를 보고했지만
(readiness는 뒤의 셋만 구분), project 모델이 있는지는 readiness가 못 보는 축이라 "project not
imported"가 구분 안 됐다. `jvm_project_model_missing`(`coverage.ts`, `V1_WITHHELD_REASON_CODES`)을
새 코드로 추가해 구현 완료 — `compileDatabase.ts`와 완전히 같은 모양(read-only, caller count와
무관, `no_incoming_callers`/`index_state_unknown`과 동시 발생 가능)으로 워크스페이스 루트의
Gradle/Maven marker를 확인하고, 마커 없이 `.java` 파일이 2개 이상이면(entry gate가 실제로
검증한 건 단일 파일뿐이므로) 경고를 붙인다. `requiredProjectFiles`(gopls의 all-or-nothing 게이트)는
의도적으로 재사용하지 않았다 — Gradle **or** Maven **or** 단일 파일 standalone 중 하나면 되는
OR 조건이라 안 맞는다는 판단을 코드로 확인했다. 실제 jdtls로 재실행해 정확히 재현했던 케이스에서
`jvm_project_model_missing`이 `no_incoming_callers`와 함께 뜨는 것도 확인했다(`f24afac`).
`cli-contract.md`와 `response-policy-engine.mjs`(+eval fixture 2개)도 같이 갱신했고,
fixture 32를 만들다가 `response-policy-engine.mjs` 자신의 독립된 결함도 하나 찾아 고쳤다 —
`unsupported_no_impact_conclusion` 체크가 `indexingStatus: ready`만으로 "no impact" 결론을
통과시켜 왔는데, `jvm_project_model_missing`이 있으면 그것도 결론을 뒷받침 못 한다는 걸
놓치고 있었다(`provider_null_incoming_calls`는 이미 고려돼 있었다 — 같은 종류를 하나 더 놓친
것).

**2026-09-10 timeout 항목 — 실행으로 확인 완료, commander outcome 1(이미 다른 code/문구).**
commander 지시대로 추측하지 않고 둘 다 직접 실행했다:
- **(a) readiness가 timeout 안에 안 옴**: 실제 jdtls 바이너리 + 새 `GRADLE_USER_HOME`(entry
  gate가 ~19초로 잰 것과 같은 Spring Boot fixture, 진짜 cold dependency 해석 강제) +
  `--timeout-ms 3000`으로 실행 — `error.code: "provider_not_ready"`가 나왔다, raw LSP timeout
  메시지가 아니다. `awaitReadiness()`의 `onBudgetExceeded: 'fail'` 경로(`readiness.ts`)가
  쿼리 전에 이미 던지고 있었다.
- **(b) ready가 된 뒤 쿼리 자체가 timeout**: 실제 jdtls로는 쿼리 자체가 timeout보다 느리게
  만들기 어려워(타이밍이 결정적이지 않음), 통제된 mock server 통합 테스트로 확인 —
  `readinessServer.ts`에 `IMPACT_LENS_MOCK_HANG_ON_QUERY`를 추가해 readiness는 즉시 정상
  settle되게 하고 `prepareCallHierarchy`만 응답을 영원히 안 하게 만들었다. 결과:
  `error.code: "timeout"`, raw 메서드 이름이 메시지에 그대로 나옴, `details.stage: "query"` —
  구조적으로 다른 실패. 영구 회귀 테스트로 남겼다("readiness settling is a different failure
  than a query that times out afterward").

**결론(commander의 셋 중 1번)**: 이미 다른 code/문구다 — stage 3의 이 항목은 새 설계가
필요 없다. `cli-contract.md`에 `timeout` error code 자체가 전혀 문서화 안 돼 있던 걸 발견해
새 문단으로 추가했다(`provider_not_ready`와 명확히 구분).

**부수적으로 찾아 고친 독립 결함**: (a)를 실제로 돌리다가 `readiness.ts`의 `settle()`이
실제 적용된 budget(`min(profile.budgetMs, capMs)`)을 대기에는 올바르게 쓰면서, 에러
메시지/`details`에는 `this.profile.budgetMs`(preset이 선언한 원래 값)를 그대로 썼다는 걸
발견했다 — `java.jdtls`는 `budgetMs: 45000`을 선언하는데 `--timeout-ms 3000`으로 실행하면
실제로는 ~3초만 기다렸으면서 메시지는 "45000ms 기다렸다"고 거짓을 말하고 있었다. 실제
적용된 값을 보고하도록 고치고, 실제 jdtls 재실행으로 확인(이제 정확히 "3000ms" 보고), 그리고
`capMs`가 실제로 binding constraint가 되는 케이스를 도는 회귀 테스트를 새로 추가했다(기존
테스트는 `capMs`가 항상 `budgetMs`보다 커서 이 경로를 한 번도 타지 않았다).

## 목적과 사용자 가치

Java 사용자가 실제 dependency가 있는 프로젝트에서 call hierarchy를 조회하면, jdtls는 색인이 끝날 때까지
응답을 미룬다(blocking). 지금은 이게 CLI 기본 timeout(30초)에 먼저 잘려 `code: "timeout"`과 raw LSP
메서드 이름(`textDocument/prepareCallHierarchy`)을 그대로 노출하는 일반 오류로 사용자에게 나간다 —
"이 도구가 Java에서 안 된다"로 오독할 수 있는 실패다. 3단계가 끝나면 사용자는 "아직 project를
import/색인 중"과 "실제로 caller가 없음"과 "질의 자체가 실패함"을 구분해서 볼 수 있게 된다. 이건 이
마일스톤이 이미 언어마다 반복해서 닫아 온 것과 같은 축의 문제다(M2의 "빈 결과가 framework gap인데
no-caller로 오독" 실패, `IL-LIM-016` Kotlin의 동일 수용 기준).

스토리 3단계 원문(수용 기준과 동일):
1. Gradle/Maven marker와 module state를 read-only로 조사한다.
2. LSP configuration/progress를 `IL-LIM-005` core로 처리한다.
3. import/indexing 중 empty result를 실제 no-caller와 분리한다.
4. Gradle/Maven sync·build·dependency download는 workspace trust와 명시 승인 없이는 실행하지 않는다.

종료 조건: project not imported, indexing, ready와 query failure가 구분된다.

commander 지시대로 이 세 개는 "먼저 정리할 잡일"이 아니라 위 네 항목 그 자체다: readiness 배선이
2번, timeout 문구가 3번, jdtls `-data` 충돌(아래 참고)이 1번의 project identity 정합성 문제.

## 선행 질문 조사 결과 (commander의 블로킹 질문)

commander 질문 원문: "readiness 프로필이 preset에만 붙는지, 아니면 raw custom command에도 붙일 수
있는지. `-data` 같은 launch 인자를 preset 없이 지정할 방법이 있는지(우리가 계산해 주는 경로로)."
추측하지 않고 코드로 확인했다.

### 1) readiness

`ProviderReadinessProfile`은 `ProviderPreset.readiness`(`cli/src/providers/preset.ts:244`)에만
선언되는 필드다. 소비 경로는 정확히 한 곳 — `resolveSessionValues()`
(`cli/src/providers/resolve.ts:618`)의 `...(preset?.readiness === undefined ? {} : { readiness:
preset.readiness })`뿐이고, 다른 어떤 소스(project config, request override, raw command)에서도
읽지 않는다. `cli/src/lspProvider.ts:208-209,270,615,622`는 전부 이 값의 소비자(다운스트림)이지
대체 출처가 아니다.

`ProviderOverride`(project config·request가 실제로 말할 수 있는 것, `preset.ts:269-276`)에는
`readiness` 필드 자체가 타입에 없다 — "선언은 됐는데 안 쓰인다"가 아니라 **타입에 아예 없다.**

`resolveSessionValues()`는 이미 `preset: ProviderPreset | undefined`를 받아 preset 없이도(raw
command에도) 동작하도록 설계돼 있다("doctor needs the merged trees even when the command cannot be
resolved") — 그런데 `readiness`만 이 nullable 설계의 혜택을 못 받고 preset 전용으로 남아 있다.

### 2) `-data`(CLI가 계산하는 launch 인자)

`ProviderCommandTemplate.args`(preset 전용, `preset.ts:144`)만 `ManifestValue`를 허용하고, 그 안에서
CLI가 실제로 계산해 주는 건 `$ref` 두 개뿐이다:

```
MANIFEST_REF_SOURCES = ['nodeExecutable', 'bundledModuleEntry']  // preset.ts:43
CATALOG_ONLY_REF_SOURCES = MANIFEST_REF_SOURCES                   // preset.ts:57, 완전히 동일
```

두 `$ref`는 명시적으로 catalog 전용이다(`preset.ts:52-56`의 자체 주석: "overrides는 신뢰되지 않으므로
override에서 이걸 허용하면 설치 경로 노출이 된다"). `ProviderOverride.args`는 `readonly string[]` —
평문 문자열뿐이고 `$ref`가 타입 자체에서 배제된다(`preset.ts:264`의 자체 주석: "Plain JSON only: no
`$ref`").

결정적으로, **워크스페이스 경로에서 파생된 값을 CLI가 계산해 args에 넣는 기존 사례가 지금 하나도
없다** — `resolve.ts` 전체에 `workspaceRoot`/`cwd` 기반 인자 계산이 없다(직접 grep 확인,
`resolve.ts:84`의 `process.cwd()` 관련 주석 하나뿐이고 이것도 args 계산이 아니다). 그리고 이건
설계가 빠뜨린 게 아니라 **미리 표시해 둔 확장점**이다 — `preset.ts:36-41`의 자체 주석:

> `workspaceRoot`, `detectedLanguageId`, `discoveredExecutablePath`와 path-`join` 노드는 모두
> 검토됐지만 뺐다: 이 catalog의 어떤 preset도 이걸 안 쓴다... **이걸 처음 필요로 하는 변경이 추가한다.**

`-data`가 바로 그 "처음 필요로 하는 변경"이다. 지금은 preset 경로에도 `-data`를 만들 방법이 없다 —
`workspaceRoot` 같은 새 `$ref` source를 추가해야 한다(catalog 전용으로, 위 설계 원칙 그대로).

### 판단 — commander의 세 branch 중 2번, 2026-09-10 승인됨

> "2. preset이 필요하다 → 제가 '등재하되 등급은 안 준다'를 허용할지 판단합니다."

readiness도 `-data`도 지금 코드에는 preset 없이 붙일 경로가 **전혀 없다.** 이건 우연한 공백이
아니라 두 메커니즘(`readiness`, `$ref` 계산)이 처음부터 "catalog는 신뢰되고 override는 신뢰되지
않는다"는 이 저장소의 보안 경계(`preset.ts:52-56`) 위에 설계돼 있기 때문이다. 둘 다 "raw command에도
붙일 수 있게 살짝 넓히면 되는" 얕은 제약이 아니라, 이 두 메커니즘이 **왜 preset 전용으로 설계됐는지의
근거 그 자체**와 맞닿아 있다는 판단을 commander가 그대로 승인했다.

**commander 결정(2026-09-10): catalog 등재를 허용한다. 절대 조건 하나 — Auto가 이 preset을 절대
고르지 않는다.**

이유: README의 Auto 규칙(190-225줄)은 "감지된 언어를 지원한다고 catalog에 선언된 preset이 정확히
하나뿐이고 그 실행 파일을 찾을 수 있을 때만 선택된다"이다. jdtls를 그냥 등재하면 jdtls가 설치된
사용자에게 Java 분석이 **자동으로** 켜진다 — 이건 "등재하되 등급은 안 준다"가 아니라 그냥 Java 지원
출하다. 오늘 실측한 건 "incoming이 method reference에서 맞다"는 것뿐이지 전반적 정확도(gate
3·5단계 분량)가 아니다.

**`'unsupported'` tier의 확정된 의미**(commander 원문): "catalog가 이 provider를 올바르게 기동하는
법(경로·인자·readiness)을 안다. 그러나 그 답의 품질에 대해 아무것도 주장하지 않는다. Auto는 절대
고르지 않으며, 사용자가 명시적으로 요청해야만 선택된다." — 신뢰되는 건 manifest 데이터(어떻게
띄우는가)이고 tier가 말하는 건 우리가 얼마나 주장하는가, 두 축이라 "catalog는 신뢰된다"는 경계와
모순되지 않는다.

**네 조건(전부 이 lane의 구현 범위에 들어간다)**:
1. Auto 비선택을 실행 테스트로 pin한다 — "jdtls가 PATH에 있고 Java 파일을 분석할 때 Auto가 그것을
   고르지 않는다"를 주장이 아니라 실행으로 증명. Lane I의 `jdk-buildtool` 빈 PATH 비-vacuous 증명과
   같은 급.
2. doctor는 보고해도 되지만 "검증되지 않았다"를 항상 함께 말한다.
3. Extension에 "사용 가능"으로 노출하지 않는다.
4. README·문서에 "Java를 지원한다"고 쓰지 않는다.

tier 의미를 실제 코드 계약(배제 지점·테스트 형태·doctor 필드·README 문구)으로 옮기는 작업은
`il-contract-architect`에 위임했다 — 아래 "tier 계약 설계"에 그 결과를 넣는다.

`workspaceRoot` `$ref` source 추가도 승인됐다 — 위 "-data 충돌" 절의 재현 실측이 그 근거다.

이 lane이 실제로 하는 것(승인 반영):
- preset을 catalog에 `tier: 'unsupported'`로 추가하되 `lastVerified`는 채우지 않는다(그건
  `verified-external`만의 요건).
- `readiness`를 이 preset에 선언한다(아래 "설계" 참고, gopls와 같은 패턴).
- `workspaceRoot` `$ref` source를 하나 추가해 `-data <workspaceRoot 기반 경로>`를 계산한다.
- Auto가 `unsupported` tier를 절대 고르지 않도록 `autoDiscover()`(아래 tier 계약 설계 참고)를
  수정하고 그 property를 실행 테스트로 pin한다.
- doctor 보고에 "검증되지 않음"을 추가한다.
- README에 `unsupported` tier 설명 문단을 추가하되 "지원한다"는 단정을 쓰지 않는다.

## tier 계약 설계 (`il-contract-architect` 위임 결과, 2026-09-10)

**1. 배제 지점**: `cli/src/providers/resolve.ts:271` `autoDiscover()`의 `matching` 정의 직후에
`.filter(p => p.tier !== 'unsupported')`를 추가한다. `presetsForLanguage`(`catalog.ts:526`)의
호출자는 `resolve.ts:271` 단 한 곳뿐(grep 확인)이라 여기서 걸러도 다른 소비자에 영향이 없다. bundled
필터(285줄)는 그대로 둔다(unsupported는 bundled일 수 없음). `available` 필터(292줄)가 실제로
unsupported preset을 집어드는 지점이지만, `matching` 단계에서 먼저 걷어내는 게 한 곳만 고치는 최소
수정이다. **명시적 선택 경로(`requirePreset`+`assertPresetSpeaksLanguage`, `providerPreset`/project
override)는 tier를 전혀 안 봐서 그대로 둔다** — 사용자가 명시적으로 unsupported preset을 지정하는 게
이 tier의 존재 이유이므로 거기는 막지 않는다.

**2. Auto 비선택 테스트**: 기존 `fixtureUnclaimedLanguagePreset()` 헬퍼(`providers.test.ts:65`)와
`writeExecutable`+synthetic PATH 패턴을 재사용한다.
`fixtureUnclaimedLanguagePreset({ tier: 'unsupported' })`로 실행 파일을 실제로 PATH에 써 두고
`resolveProvider`가 `provider_required_for_language`로 **실패**함을 확인한다 — 180번째 줄의 기존
"verified-external은 Auto가 고른다" 테스트와 PATH·실행파일 조건이 완전히 동일한데 tier 한 값만 바꿔서
결과가 반대로 나오므로, Lane I의 `jdk-buildtool` 빈 PATH 증명과 같은 급의 비-vacuous 테스트다(조건을
충족시켜 놓고 실패를 관찰하는 것이지, 애초에 조건 미충족으로 통과하는 게 아니다).

**3. doctor의 "검증되지 않음" 표시 — 스키마 변경 없이 간다**: `doctor/index.ts:174-181`의 preset
보고 블록을 직접 읽은 결과, `docs?.limitations`는 **executable이 없을 때만이 아니라 doctor가 이
preset을 보고할 때마다 무조건 포함된다**(`...(preset.docs?.limitations === undefined ? {} : {
limitations: preset.docs.limitations })`, 조건은 필드 존재 여부일 뿐 실행파일 탐색 결과와 무관).
`preset.ts:248-252`의 "Shown to the user when the executable is missing"라는 doc-comment는 이
필드가 만들어진 원래 의도를 적은 것이지 실제 노출 조건이 아니다 — **코드를 직접 읽어 확인**했다.
그래서 새 필드를 추가하지 않고, `java.jdtls` catalog 항목의 `docs.limitations`에 "정확도는 아직
검증되지 않았다. Auto는 이 preset을 선택하지 않으며 `providerPreset`으로 명시해야 쓸 수 있다"는
문장을 넣는 쪽을 택한다 — 계약 변경 없이 기존 필드를 있는 그대로 쓴다는 점에서 이 저장소의 "새 필드는
그걸 처음 필요로 하는 변경에서만 추가한다"(`preset.ts:36-41`과 같은 원칙) 규율과 맞는다.

> **기록(commander 지시, 고치지 않고 적기만 함) — `docs.limitations`가 서로 다른 두 종류의
> 진술을 담게 된다.** 지금 이 필드는 provider가 **무엇을 못 찾는가**(reflection, function
> pointer 등, capability gap)를 담는다. 여기에 "이 preset은 정확도가 검증되지 않았고 Auto가
> 안 고른다"를 넣으면 그건 provider의 능력이 아니라 **우리 쪽의 등급 주장**이다 — 다른 종류의
> 진술이다. 막지 않는다 — 계약 변경 없이 정직한 문장이 사용자에게 실제로 도달하는 게 지금 더
> 중요하다. 다만 이 저장소가 같은 범주 문제를 이미 한 번 만났다 — M4 gate 1 lane D에서
> gopls/clangd의 과다 보고 사실(관계는 실재하지만 "호출" 라벨이 실제보다 넓게 약속)을 어디
> 적을지 고민했을 때, `docs.limitations`가 "부재 목록"이라 반대 방향 서술이 범주에 안 맞는다고
> 기록하고 임시로 넣었다(`docs/work/task-m4-gate1-lane-d-language-limitations.md` 276-292줄).
> **이번이 두 번째다.** 이 필드가 서로 다른 두 종류의 진술을 담고 있고, 그렇게 된 것이 두
> 번째라는 사실 자체를 여기 남긴다 — **세 번째가 오면 그때는 필드를 나눌 신호**다.

**4. README**: 190-225줄 단락에 `unsupported` tier 설명을 추가한다 — "catalog가 기동 방법(경로·
인자·readiness)은 알지만 결과 품질은 검증하지 않았다. Auto는 절대 고르지 않으며 `providerPreset`으로
명시해야만 쓸 수 있다." `verified-external`이 이미 쓰는 "experimental"(사용자 검증 미실행) prose와는
다른 축임을 명확히 구분해 쓴다 — `verified-external`은 "우리가 기동은 검증했고 사람이 결과를 아직
확인 안 했다", `unsupported`는 "결과 품질에 대해 아무 주장도 안 한다"로 더 약하다.

**5. Extension**: `src/extension.ts`를 grep한 결과 tier/preset/provider/doctor 참조가 0건 —
같은 monorepo지만 Extension이 이 계약을 아직 전혀 소비하지 않는다. **지금 고칠 지점이 없다.** 나중에
Extension이 provider 상태를 노출하는 코드를 추가할 때 `tier === 'unsupported'`를 "사용 가능"으로
표시하면 안 된다는 요구사항만 기록해 둔다(commander의 조건 3).

## 이미 확보된 실측 위에 설계 (재측정하지 않음, commander 지시)

1. **jdtls는 색인 중 빈 결과 대신 응답을 미룬다(blocking)** — `IL-LIM-018` entry gate 실측
   (`task-m3-java-entry-gate.md`). 즉 "빈 caller"와 "아직 색인 중"을 구분하는 문제는 jdtls 쪽에서
   이미 정직하게 막혀 있다(빈 배열을 잘못 반환하는 게 아니라 안 돌려주는 것) — 우리 쪽이 이 대기를
   readiness 신호로 먼저 감지해서 사용자에게 설명하기만 하면 된다.
2. **실제 dependency가 있는 project의 import는 약 19초** — file 수가 아니라 dependency 수가 위험
   축이다. CLI 기본 timeout 30초에 근접하지만 아직 넘지는 않는 값으로 실측됨 — 이게 지금 timeout
   문구가 노출되는 것도, dependency가 조금만 더 많은 프로젝트에서 실제로 timeout이 발생할 수 있다는
   것도 함께 말해 준다.
3. **`language/status` 알림 스트림(`Starting` → `Started: Ready` → `ServiceReady`)은 기존
   `notification` readiness 신호 종류로 표현 가능** — 새 신호 종류나 새 프로토콜이 필요 없다. gopls가
   `work-done-progress`로 같은 문제를 이미 풀어 둔 것과 동일한 패턴, 신호 종류만 다르다.

### 설계 — 4개 항목별

**1. `-data` 충돌(project identity 정합성 위험) — 2026-09-10 commander 지시로 재현 완료**

jdtls의 기본 workspace-metadata 디렉터리는 cwd의 basename SHA1 해시로만 결정된다
(`jdtls.py:83,98-99`). **재현했다** — 실제 `/private/tmp/jdtls-1.61.0/bin/jdtls`(shipped 진입점,
`jdtls.py`는 `__main__` guard가 없어 직접 실행되지 않고 이 wrapper가 `importlib`으로 불러 `main()`을
호출하는 구조임을 실행 중 확인) 를 basename이 둘 다 `api`인 서로 다른 절대 경로
(`…/data-collision-repro/siteA/api`, `…/data-collision-repro/siteB/api`)에서 각각 실행해 `-data`
기본값을 비교했다. `--java-executable`에 실제 java 대신 argv를 기록만 하는 fake 스크립트를 지정해
jdtls 자신의 실제 실행 로직(`get_java_executable`→`get_java_major_version`→`main`의 cachedir/sha1
계산)을 그대로 태웠다(직접 값을 재계산해 흉내 낸 게 아니라 배포된 스크립트를 실행했다). 결과:

```
siteA/api → -data /Users/woony6/Library/Caches/jdtls/jdtls-a033a528b603fed46f861d4b3542c417b99d41c8
siteB/api → -data /Users/woony6/Library/Caches/jdtls/jdtls-a033a528b603fed46f861d4b3542c417b99d41c8
```

바이트 단위로 동일하다 — 서로 다른 두 프로젝트가 기본 설정에서 같은 workspace-metadata 디렉터리를
쓰게 된다는 것이 이제 소스 추론이 아니라 실측이다. 이게 이 `$ref`의 존재 이유를 확정한다. 해법은
`workspaceRoot`(절대 경로) 기반으로 `-data` 값을 CLI가 계산해 매 세션 고유한 디렉터리를 지정하는
것 — 새 `$ref` source(`workspaceRoot`, 위 "선행 질문 조사 결과" 참고)로 preset의
`ProviderCommandTemplate.args`에 주입한다. `-data` 디렉터리 자체는 read-only 조사가 아니라 jdtls가
쓰는 캐시이므로, 세션 종료 후 정리 정책(무기한 보존 vs TTL)은 별도 판단이 필요 — 이 lane은 계산과
주입까지만 하고 보존 정책은 미해결로 남긴다.

**2. readiness 배선(LSP configuration/progress를 `IL-LIM-005` core로 처리)**

이미 확보된 실측 3번 그대로: `language/status`를 `notification` 종류 readiness 신호로 선언한다.
gopls preset의 `work-done-progress` 선언과 같은 자리(`catalog.ts`)에, 같은 형태로 추가한다 —
`means: 'ready'`를 `ServiceReady`(또는 관측된 정확한 payload 값, 구현 lane에서 정확한 문자열을
재확인)에 매칭한다. `budgetMs`는 실측 3번(~19초)에 여유를 더한 값으로 시작하고, `onBudgetExceeded:
'proceed-partial'`은 이 언어에서 의미가 있는지(빈 결과가 진짜 부분 결과인지, jdtls는 애초에 응답을
안 주므로 partial이 성립하지 않을 수 있음) 구현 시 확인이 필요 — 현재는 미해결로 남긴다.

**3. timeout 문구(import/indexing 중 empty result를 실제 no-caller와 분리)**

readiness 배선이 끝나면 이 항목의 상당 부분이 부산물로 해결된다 — readiness가 아직 `ready`가 아닌
상태에서 요청이 timeout에 걸리면, 지금처럼 raw LSP 메서드 이름을 노출하는 일반 오류 대신 "project가
아직 import/색인 중"이라는 구분된 상태를 반환할 수 있다. 다만 readiness가 `ready`로 넘어간 **이후**
발생하는 진짜 timeout(색인은 끝났는데 질의 자체가 느리거나 실패하는 경우)은 여전히 구분해야 한다 —
이건 readiness 유무와 무관하게 이미 있는 timeout 오류 경로이므로, 이 항목의 신규 범위는 "색인 중
timeout"과 "색인 후 timeout"을 가르는 조건문 하나로 좁다.

**4. Gradle/Maven marker read-only 조사 + sync/build 미실행**

Lane I(2단계)의 `jdk-buildtool` 체크가 이미 같은 원칙(`gradle-wrapper.properties`의 `distributionUrl`
문자열만 읽고 절대 Gradle을 spawn하지 않음)으로 구현돼 있다 — 3단계는 이 패턴을 project import
readiness 판단에도 그대로 반복한다(Gradle daemon 기동 여부와 무관하게 `build.gradle(.kts)`/`pom.xml`
존재 여부, `settings.gradle`의 모듈 목록 등 read-only 정보만 사용). 새 원칙이 필요하지 않다.

## 범위 밖(이 lane이 하지 않는 것)

- Gradle/Maven sync·build·dependency download 실행(스토리 제외 범위, 명시적 승인 메커니즘은
  Kotlin story와 공유하는 미해결 질문으로 남음).
- `readiness`/`-data`를 raw custom command 사용자에게 열어 주는 것 — 위 판단대로 이번엔 preset
  경로로만 간다.
- `-data` 디렉터리의 보존/정리 정책 확정(위 1번 항목 참고, 별도 판단 필요).

## 다음 단계

이 문서는 초안이며 착수하지 않는다. commander의 preset 등재 승인(및 `unsupported` tier의 실제 의미
정의) 응답을 기다린 뒤 작업 로그와 branch를 연다.
