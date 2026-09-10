# M3 Java 3단계: project import와 readiness — 사전 작업 문서 (초안)

- 상태: 초안, commander 결정 대기(아래 "선행 질문 조사 결과" 참고 — 구현 착수 전 필수)
- 관련 스토리: [`IL-LIM-018`](../development-management/stories/il-lim-018-java-language-support.md) 3단계
- 선행 lane: [Lane I(2단계, discovery/JDK compatibility)](task-m3-java-discovery-jdk.md), PR #122(`7349b60`)

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

### 판단 — commander의 세 branch 중 2번

> "2. preset이 필요하다 → 제가 '등재하되 등급은 안 준다'를 허용할지 판단합니다."

readiness도 `-data`도 지금 코드에는 preset 없이 붙일 경로가 **전혀 없다.** 이건 우연한 공백이
아니라 두 메커니즘(`readiness`, `$ref` 계산)이 처음부터 "catalog는 신뢰되고 override는 신뢰되지
않는다"는 이 저장소의 보안 경계(`preset.ts:52-56`) 위에 설계돼 있기 때문이다 — readiness는 서버별
LSP 프로토콜 지식(어떤 notification method가 뭘 의미하는지)을 사용자가 raw command로 직접 선언하게
허용하면 검증 안 된 주장을 신뢰 계층에 넣는 것과 같고, `$ref`는 override에서 풀면 설치 경로가 샌다는
게 이미 문서화된 이유다. 둘 다 "raw command에도 붙일 수 있게 살짝 넓히면 되는" 얕은 제약이 아니라,
이 두 메커니즘이 **왜 preset 전용으로 설계됐는지의 근거 그 자체**와 맞닿아 있다.

참고로 `ProviderTier`에는 `'unsupported'`가 이미 값으로 존재한다(`preset.ts:175`) — 하지만
**어디에서도 소비되지 않는다**(catalog 항목 4개는 전부 `'bundled'` 아니면 `'verified-external'`뿐,
`'custom'`/`'unsupported'`를 쓰는 코드 경로가 전무함을 grep으로 확인). "등재하되 등급은 안 준다"의
그릇은 타입에 이미 있지만, 그게 doctor 보고·Auto 선택·Extension 노출에서 실제로 뭘 뜻하는지는 지금
전혀 정의돼 있지 않다 — commander가 이 tier를 승인한다면 그 의미(예: doctor는 여전히 진단하되 "이
preset은 검증되지 않았다"를 항상 앞세운다, Auto 선택은 여전히 기본으로 고르지 않는다, Extension은
"experimental"로 표시)도 같이 정해야 사용된다.

**요청**: `java.jdtls` preset을 `tier: 'unsupported'`(또는 동등한 새 값)로 등재하되, "discovery되는
것과 '지원한다'고 말하는 것은 다르다"는 구분을 doctor/Auto-selection/Extension 세 표면 모두에서
유지하는 걸 허용해 주시겠습니까? 승인되면 이 lane은:
- preset을 catalog에 추가하되 `lastVerified`는 채우지 않는다(그건 `verified-external`만의 요건).
- `readiness`를 이 preset에 선언한다(아래 "설계" 참고, gopls와 같은 패턴).
- `workspaceRoot` `$ref` source를 하나 추가해 `-data <workspaceRoot 기반 경로>`를 계산한다.
- doctor/Auto-selection이 `unsupported` tier를 `verified-external`과 절대 같은 취급을 하지 않도록
  각 소비 지점(현재 `tier === 'bundled'` 분기 3곳, `resolve.ts:251,285,461`, `checks.ts:88`)을 감사한다.

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

**1. `-data` 충돌(project identity 정합성 위험)**

jdtls의 기본 workspace-metadata 디렉터리는 cwd의 basename SHA1 해시로만 결정된다(`jdtls.py:83,98-99`,
Lane I 설계 문서에서 읽어서 확인, 아직 재현 실측은 아님). 이름이 같은 두 프로젝트(`api`, `backend`
등)가 다른 위치에 있어도 같은 인덱스를 공유해 잘못된 프로젝트의 답을 낼 위험이 있다. 해법은
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
