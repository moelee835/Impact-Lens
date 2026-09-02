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
