# `serverInfo.version` 무제한 통과 — 계약 구멍 수정

- 상태: In progress — 구현·검증 완료, PR 준비 중
- branch: `fix/provider-version-bound`
- 관련: M2 gopls lane(PR #58~#61) 종료 후 계획 세션이 1순위로 확정한 후속 과제.
  `docs/work/task-m2-gopls-ci-verification.md`에 근본 원인이 이미 기록돼 있다.

## 목적과 사용자 가치

`gopls`가 shipped catalog에 들어오며 처음으로 실사용자 응답에서 드러난 문제다: `analyze` 응답의
`capabilities.version`/`data.provider.version`(같은 값이 두 위치에 실림)이 gopls의 `initialize`
`serverInfo.version`을 그대로 통과시키는데, 이 값이 3,062 byte짜리 JSON blob(의존성 목록·빌드 설정
포함)이라 **응답 전체(11,219 byte)의 54.6%를 이 하나의 중복 필드가 차지한다.** 이 응답을 주로 읽는
건 사람이 아니라 에이전트고, **매 분석 요청마다 그 절반이 쓸모없는 blob을 위해 토큰을 낸다.**

이 lane이 끝나면 gopls를 포함한 모든 provider의 `serverInfo.version`이 합리적인 크기로 제한되고,
잘렸다는 사실이 응답 자체에 드러나 에이전트가 잘린 값을 온전한 값으로 오인하지 않는다.

## 배경과 해결할 문제

`cli/src/lspProvider.ts:460`(현재 라인 기준으로는 이동)이 `result.serverInfo?.version`을
`this._capabilities.version`에 **아무 제한 없이** 대입한다. 이 값은 M1의 v1 호환 projection에 의해
`data.provider.version`과 top-level `capabilities.version` 두 곳에 실린다(둘 다 같은 `_capabilities`
객체를 읽음 — `response.schema.json`의 `$defs/provider`를 두 곳에서 `$ref`).

**이건 gopls만의 문제가 아니라 계약의 구멍이다.** `serverInfo.version`은 provider(서버)가 통제하는
문자열이고 CLI는 그 크기를 검증하지 않는다. 이 저장소는 이미 다른 provider 출력 경로에는 예산을
건다 — `cli/src/providers/discovery.ts`의 `probeVersion()`이 `truncate(text, maxBytes)`로 spawn한
프로세스의 stdout/stderr를 `maxOutputBytes`(gopls preset 자신이 `4096`으로 선언, `catalog.ts`)로
자른다. 즉 **`gopls version` 프로세스 출력은 이미 4096 byte로 잘리는데, 같은 정보를 담을 수 있는
`initialize`의 `serverInfo.version`은 무제한이었다** — 같은 정보의 두 경로 중 하나만 보호돼 있던 것.

## 범위와 범위에서 제외할 항목

**포함**: `serverInfo.version`을 유입 지점 한 곳(`lspProvider.ts`)에서 bound, 잘린 사실을 값 자체에
표시, `response.schema.json`에 `maxLength` 선언, 실측 기반 한도 결정.

**범위 밖(계획 문서가 명시)**: `data.provider`와 top-level `capabilities`에 같은 값이 두 번 실리는
v1 호환 projection의 구조 자체는 M1의 설계이고 이번 범위가 아니다. bound만으로 이 필드의 비용이
이미 크게 줄어들므로(아래 실측 참고), 중복 자체를 없앨지는 별도 판단으로 남긴다.

## 현재 구현 조사 결과 — 재검증한 것과 새로 발견한 것

### 소비자 조사 — commander의 "소비자 없음" 결과를 직접 재확인

commander가 "test/schema/scripts/plugins 전수 훑었고 `capabilities.version`/`provider.version`을
파싱·assert하는 소비자가 0건"이라고 먼저 보고했다. 그대로 믿지 않고 직접 재확인했다:

```
grep -rn "capabilities\.version\|provider\.version" cli/src/test/*.ts scripts/*.mjs plugins/
```

결과 0건 — commander의 결과와 일치한다. `response.schema.json`도 `"version": {"type": "string"}`뿐
제약이 없었다는 것도 확인. **이 변경이 유입 지점 한 곳에 갇힌다는 전제는 맞다.**

### `truncate()`가 잘림을 표시한다는 전제는 틀렸다 — 직접 확인하고 다르게 설계함

commander는 "기존 `truncate()`가 어떻게 표시하는지 확인하고 같은 방식을 쓰라"고 했다. 코드를 직접
읽어보니 **`discovery.ts`의 `truncate()`는 잘림을 전혀 표시하지 않는다** — byte 경계에서 조용히
자를 뿐이고, `VersionProbeOutcome`에도 "잘렸다"는 플래그가 없다. 이건 이 함수가 보호하는 대상의
성질이 다르기 때문이라고 판단했다: `probeVersion()`의 budget은 오작동하는 provider가 이 프로세스에
메모리를 무한히 버퍼링하지 못하게 막는 **안전 상한**이고, 그 결과를 읽는 건 `doctor --smoke`를 돌리는
사람이 원시 로그를 보는 상황이라 "잘렸을 수 있다"는 걸 알고 읽는다. 반면 `serverInfo.version`은
**에이전트가 데이터로 신뢰하고 읽는 필드**다 — 조용히 자르면 "이게 전체 버전 문자열이다"라고
잘못 믿게 만든다. 그래서 **`truncate()`의 byte-cut 로직은 그대로 재사용하되(export해서 가져다 씀),
그 위에 새 마커(`…[truncated]`)를 추가했다** — "같은 메커니즘 재사용"과 "같은 표시 관행을 따른다"는
서로 다른 요구였고, 후자는 존재하지 않는 관행이라 새로 만들었다. 이 판단 근거를
`lspProvider.ts`의 주석과 `discovery.ts`의 `truncate()` 주석 양쪽에 남겼다.

### 한도 4096은 실측 결과 이 문제를 전혀 해결하지 못한다 — 더 작은 값으로 결정

commander는 "4096(기존 선례)이 자연스럽지만 실측하고 정하라"고 했다. **실측한 결과 4096은 쓸 수
없다**: gopls의 실제 `serverInfo.version`은 3,062 byte로, **4096보다 작다.** 한도를 4096으로 정하면
gopls의 값은 **전혀 잘리지 않고** 지금 이 lane이 고치려는 문제(응답의 54.6%를 이 필드가 차지)가
그대로 남는다. `4096`은 "spawn한 프로세스 stdout이 무한히 자라지 않게" 막는 안전 상한으로는 자연스러운
값이지만, "정상적인 버전 문자열이 얼마나 되는가"라는 이번 질문에는 맞지 않는 값이었다.

실제로 정상적인 버전 문자열이 얼마나 되는지 측정했다:
- `gopls version`(plain, provider가 실제로 쓰는 형태)의 출력: **32 byte**.
- 매우 관대하게 만든 합성 예시(`v0.19.1-<40자리 커밋 해시>-linux-amd64-go1.26.1`): **69 byte**.
- `typescript-language-server`는 `serverInfo.version` 자체를 보고하지 않는다(`undefined`) — 이번
  변경으로 영향받는 게 전혀 없다.

**결정: 256 byte.** 실측한 가장 관대한 정상 사례(69 byte)의 3.7배 여유를 두면서, gopls의 3,062 byte
blob은 확실히 자른다. commander가 요청한 "실측 근거"는 만족하되, "4096이 자연스럽다"는 전제는
근거로 확인되지 않아 폐기했다.

## 단계별 구현 계획

### 1단계 — 유입 지점 bound, schema 선언, test (하나의 commit)

- 목적: `serverInfo.version`을 한 곳에서 제한하고, 그 제한을 schema 계약으로도 선언해 코드와 문서가
  어긋나지 않게 한다.
- 산출물:
  - `cli/src/providers/discovery.ts`: `truncate()`를 `export`(재사용을 위해서만 — 동작은 그대로).
  - `cli/src/lspProvider.ts`: `SERVER_VERSION_MAX_BYTES = 256`, `VERSION_TRUNCATION_MARKER`,
    `boundServerVersion()` 추가. `_capabilities.version` 대입 지점 한 곳(`version:
    result.serverInfo?.version` → `version: boundServerVersion(result.serverInfo?.version)`)만 수정.
  - `cli/schemas/response.schema.json`: `$defs/provider.version`에 `maxLength: 256` 추가(한 곳 —
    `data.provider`와 top-level `capabilities`가 둘 다 이 `$defs`를 참조하므로 자동으로 양쪽에
    적용됨). `schemaVersion`은 그대로 `1` 유지(producer 측 강화, 기존 소비자를 깨지 않음).
  - `cli/src/test/fixtures/hugeServerVersionServer.ts`(신규): `serverInfo.version`에 4000자짜리
    문자열을 보고하는 mock server.
  - `cli/src/test/contract.test.ts`: 새 test — 이 fixture로 실제 CLI를 왕복시켜
    `data.provider.version === capabilities.version`(같은 유입 지점에서 나온 값임을 증명),
    256 byte 이하, 마커로 끝남을 확인.
- 검증: 아래 "테스트 및 완료 기준" 참고.

## 테스트 및 완료 기준

- [x] 소비자 조사를 직접 재확인(commander 결과와 일치, 위 "현재 구현 조사 결과" 참고).
- [x] 유입 지점 한 곳(`lspProvider.ts`)에서만 수정 — `data.provider`/top-level `capabilities` 두 출력
  지점은 건드리지 않음(같은 `_capabilities` 객체를 읽으므로 자동으로 함께 적용됨, 신규 test로 증명).
- [x] 잘린 사실이 값 자체에 보인다(`…[truncated]` 마커) — 기존 `truncate()`는 표시하지 않는다는 것을
  직접 확인하고 새로 설계, 판단 근거를 코드 주석에 기록.
- [x] 한도를 실측으로 결정(256 byte) — 4096은 문제를 해결 못 한다는 것을 실측으로 확인하고 폐기.
- [x] `response.schema.json`에 `maxLength: 256` 선언, `schemaVersion` 유지.
- [x] v1 projection 중복 제거는 범위 밖이라고 명시(위 "범위와 범위에서 제외할 항목").
- [x] 실제 gopls 응답으로 전후 측정: `capabilities.version` 3,062 byte → **256 byte**(정확히 한도).
  응답 전체 11,219 byte → **4,957 byte**(55.8% 감소, 기존에 보고된 54.6%보다 더 큰 폭 — 중복된 두
  값이 각각 256으로 줄었기 때문).
- [x] TypeScript 응답이 바뀌지 않았는지 확인 — `capabilities.version`이 애초에 `undefined`라 영향 자체가
  없다(실측으로 확인, `typescript-language-server`가 `serverInfo.version`을 보고하지 않음).
- [x] 신규 fixture(`hugeServerVersionServer.ts`)와 test(`contract.test.ts`)로 회귀 방지 — 4000자
  `serverInfo.version`이 정확히 256 byte로 잘리고 두 응답 위치가 같은 값을 갖는지 실제 CLI 왕복으로
  확인.
- [x] `npm run test:all` 전체 통과(274개 CLI test, response-policy 16, plugin-artifact e2e) — 실제
  gopls PATH에 두고 확인.
- [x] `truncate()`가 multi-byte 문자 경계에서 byte 예산을 초과하지 않는다 — 실제 재현(한국어·이모지로
  offset 1~300 스윕) 후 수정, guard가 실제로 결함을 잡는지 되돌려서 확인.
- [x] byte 기준 상수와 schema의 codepoint 기준 `maxLength`가 "같은 단위"라는 잘못된 주석을 정정 —
  왜 지금 안전한지(구조적 성질)와 무엇이 그 안전을 깨는지를 명시.
- [x] populated된 `version` 필드가 실제 `validate()`(schema checker)를 거치는 test 추가(ASCII·
  multi-byte 둘 다), 그리고 그 양성 test가 공허하지 않다는 것을 증명하는 음성 test 추가.
- [x] `npm run test:all` 재검증(279개 CLI test 포함) 전체 통과.

## 소유 경로 확인 (commander 요청)

이 작업은 `cli/src/lspProvider.ts`(`il-lsp-protocol` 소유)와 `cli/schemas/**`(`il-contract-architect`
소유) 양쪽에 걸친다. 이번엔 gopls lane과 동일하게 **역할 sub-agent 없이 직접** 구현했다 — M1에서
소유 경로 확인 없이 sub-agent를 배정했다가 정당하게 거부돼 막힌 전례가 있어, 두 경로에 걸친 작은
변경은 직접 하는 쪽이 안전하다고 판단했다.

## 작업 로그

### 2026-09-02 — 착수와 구현

- commander 승인 후 `main`(`a27b0c6`, M2 gopls lane 종료 시점)에서 branch 분리.
- commander가 미리 확인해 준 두 사실(소비자 없음, schema에 한도 없음)을 그대로 믿지 않고 직접
  재확인 — 둘 다 일치했다.
- 구현 중 commander의 전제 두 가지가 실제와 다르다는 것을 발견하고 다르게 설계했다(위 "현재 구현
  조사 결과" 참고): (1) `truncate()`는 잘림을 표시하지 않는다 — 새 마커를 추가. (2) 4096은 gopls의
  3,062 byte 값보다 커서 문제를 해결 못 한다 — 실측 기반으로 256 byte로 결정.
- 로컬 검증: `npm run cli:build`, 신규 test 단독 실행 확인, 실제 gopls로 전후 byte 수 실측
  (11,219→4,957), 실제 TypeScript 분석으로 무영향 확인, `PATH`+`IMPACT_LENS_REQUIRE_GOPLS=1`로
  `npm run test:all` 전체(274 CLI test 포함) 통과.
- PR #62를 열고 CI 대기 중 commander에게 이 시점까지의 설계·전제 차이를 보고했다.

### 2026-09-02 — reviewer가 발견한 실제 결함 셋과 반영

commander가 reviewer의 재검토 결과를 전달했다. **push 전에(같은 세션에서 이미) 직접 재현해 확인한
것과 그렇지 않은 것을 구분해 기록한다.**

**1) multi-byte 경계에서 `truncate()`가 byte 예산을 초과할 수 있다.** commander가 먼저 지적했고,
**push하기 전에 이미 직접 재현해 고쳐 놓은 상태였다** — `Buffer.subarray(0,
n).toString('utf8')`가 불완전한 trailing UTF-8 sequence를 U+FFFD(재인코딩 시 3 byte)로 치환하면서
1~2 byte를 초과할 수 있다는 것을 한국어·이모지 문자로 실제 스윕(offset 1~300)해 확인했고,
`truncate()`가 잘린 결과의 trailing U+FFFD를 제거하도록 고쳤다(`discovery.ts`). 고치기 전 상태로
되돌려 새 test가 실제로 실패하는지도 확인한 뒤 복원했다. **이 수정은 `reviewer`가 실제 CI에서
관측한 "258 byte" 결과보다 먼저 로컬에 반영돼 있었다** — reviewer가 본 것은 이 fix가 아직 push되지
않은 이전 commit(`003df7f`)의 CI 결과였을 것이다.

**2) `SERVER_VERSION_MAX_BYTES`(byte)와 schema `maxLength`(codepoint)가 "정확히 일치"한다는 주석의
주장이 틀렸다.** `cli/src/test/jsonSchema.ts:110`을 직접 읽어 `const length = [...value].length`가
**codepoint를 센다**는 것을 확인했다(JSON Schema 스펙을 따른 정확한 설계). **다만 이게 "우연히 같은
숫자를 쓴 취약한 설계"라는 지적에는 부분적으로만 동의한다** — UTF-8에서 모든 codepoint는 최소 1
byte를 쓰므로 **문자열의 byte 길이는 항상 codepoint 수 이상**이다. 즉 `truncate()`가 실제로
"최대 N byte"를 보장하기만 하면(위 1번 수정으로 지금 보장된다), 그 결과의 codepoint 수는 **항상**
N 이하다 — 이건 우연이 아니라 UTF-8의 구조적 성질이다. 다만 **원래 주석이 "두 값이 같은 단위를
측정한다"고 잘못 말한 것은 사실**이라 그 부분을 정정했다: 단위가 다르다는 것, 왜 지금 안전한지(byte
bound가 codepoint bound를 항상 만족시키는 방향), 무엇이 그 안전을 깨는지(`truncate()`가 정확한
byte 상한을 보장하지 못하게 되는 경우 — 1번이 고친 바로 그 문제)를 명시했다.

**3) populated된 `version` 필드가 실제 `validate()`(schema checker)를 거치는 test가 하나도 없었다.**
TypeScript는 이 필드를 아예 안 보내고, 새로 추가했던 두 test(`contract.test.ts`)는 수동 byte 길이
assertion만 했지 `response.schema.json`에 대조하지 않았다. `cli/src/test/schema.test.ts`에 세 개
추가: (1)(2) `hugeServerVersionServer.js` fixture(ASCII/multi-byte 버전 모두)로 실제 CLI를 왕복시킨
응답을 `validate(schema(), response)`로 검증 — `[]`(오류 없음)을 확인. (3) **양성 test들이 공허하지
않다는 것을 증명**하기 위해, 실제 유효한 envelope의 `version` 필드를 257 codepoint로 강제 조작해
`validate()`가 실제로 거부하는지 확인(`assert.notDeepEqual(..., [])`).

로컬 재검증: `npm run cli:build`, 신규 test 단독 실행 3/3 통과, `PATH`+`IMPACT_LENS_REQUIRE_GOPLS=1`로
`npm run test:all` 전체(279 CLI test 포함) 통과.

### 2026-09-02 — commander 독립 재검증, 관계 서술 정밀화, 인식 정정

commander가 fix를 독립적으로 재구현해 한글·이모지·중국어·é·국기 이모지 5종 × offset 101개로 재스윕
— 최대 256 byte, 254 codepoint, 초과 0건으로 확인했다.

**관계 서술을 더 정밀하게 고쳤다.** commander가 지적한 대로, 안전의 진짜 조건은 "두 상수가 같다"가
아니라 **"byte 상수가 정확히 지켜지고, 그 값이 schema `maxLength` 이하다"**이다. 우연히 두 값이
같아서가 아니라 `SERVER_VERSION_MAX_BYTES <= maxLength`이기만 하면 되는 것 — `lspProvider.ts`의
주석을 이 조건으로 다시 썼다(`truncate()`가 정확한 byte 상한을 보장하는 한, byte bound가 그 값
이하인 codepoint bound를 구조적으로 만족시킨다는 것).

commander의 사소한 관찰(`cut.replace(...)`가 원본에 이미 있던 trailing U+FFFD도 지울 수 있다 —
무해하지만)도 `truncate()` 주석에 반영했다.

**인식 정정 — 그대로 기록한다.** "reviewer가 본 258 byte는 push 안 된 이전 commit의 결과였을
것"이라고 보고했는데, commander가 정확히 지적했다: **리뷰어는 공개된(push된) 상태를 검토하는 게
맞는 절차이고, 그 시점 PR head가 `003df7f`였으니 리뷰어가 본 것이 맞다.** "검토자가 낡은 코드를
봤다"는 프레이밍은 로컬에 fix가 있었다는 사실과 무관하게 부정확했다 — 검토 요청 전에 push했어야
했다. 그리고 그 라운드의 나머지 발견(주석의 단위 불일치, ASCII fixture 때문에 발동 안 하는
assertion, `validate()` 미사용)은 byte 초과 fix의 push 여부와 무관하게 전부 유효했다는 것도
그대로 인정한다.
