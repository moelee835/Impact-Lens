# M1 요청 수준 provider override 계약 (W1-D)

- 작성일: 2026-08-27
- 작성 lane: W1-D `il-contract-architect` (L6 후속)
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 관련 story: [`IL-LIM-004`](../development-management/stories/il-lim-004-first-class-language-presets.md) 1단계 3·4항,
  [`IL-LIM-005`](../development-management/stories/il-lim-005-custom-lsp-compatibility.md)
- 입력 결정: [`task-m1-preset-manifest-contract.md`](task-m1-preset-manifest-contract.md) D3·D5·D8·D9와 lead 결정 L1·L5·L6
- 선행 lane: W1-C [`task-m1-completeness-emit.md`](task-m1-completeness-emit.md) (merge 완료, `origin/main` `f0cb40e`)
- branch: `feat/m1-request-overrides`

## 배경과 해결할 문제

lead 결정 **L6**이다. W1-A(프로토콜)와 W1-B(preset platform)는 preset 기본값을 요청 단위로 덮는 경로를
구현하지만, 요청 스키마에 그 필드가 없으면 override 경로를 end-to-end로 검증할 수 없다. 그렇다고 W1-C에
요청 계약까지 얹으면 **한 PR이 응답 계약과 요청 계약을 동시에 바꿔** 무변경 증명의 기준선이 흐려진다.
그래서 lead는 D9에서 **이름만 먼저 고정**(`providerPreset` / `initializationOptions` / `settings`)하고
스키마 추가를 이 별도 lane으로 분리했다. **Wave 1 종료 gate 이전에 끝나야 한다.**

필드를 스키마에 적는 것 자체는 쉽다. 이 lane이 실제로 정해야 하는 것은 넷이다.

1. D8의 제한(depth 16 / 트리당 64 KiB / 1000키 / prototype key 전 depth 거부)을 **어디서** 강제하는가.
   JSON Schema로 표현되는 것과 코드로만 되는 것이 갈린다.
2. 제한 위반의 error code가 **출처별로** 갈리는가. L1은 *project 설정 파일*의 실패에 대해
   `provider_config_invalid`를 정했다. 요청 최상위 필드의 실패는 출처가 다르다.
3. `providerPreset`을 어디까지 검증하는가. **catalog는 아직 `main`에 없다**(W1-B가 만드는 중).
4. D8이 병합 **전**에 걸리는가 **후**에 걸리는가. 병합 구현은 이 lane이 하지 않지만(D2/W1-B),
   "언제 검사되는가"는 구현이 아니라 계약이다.

## 범위

- `cli/schemas/request.schema.json`에 optional 최상위 필드 3개를 **additive**로 추가한다.
  `schemaVersion`은 1을 유지한다.
- `cli/src/types.ts`의 요청 타입과 요청 파싱·검증 코드에 같은 필드를 추가하고 D8 제한을 강제한다.
- D8 제한을 스키마와 코드 양쪽에서 **같은 값**으로 유지하는 계약 테스트를 만든다.
- prototype pollution 거부를 테스트로 증명한다.
- 기존 요청의 응답이 **바이트 동일**함을 캡처 비교로 증명한다.
- `provider-coverage-contract.md`에 요청 override 계약 절을 추가한다.

## 범위에서 제외할 항목

- **병합 구현.** D9의 `preset < project < request` deep merge는 `providers/`가 소유한다(D2, W1-B).
  이 lane은 요청을 받아들이고 검증하는 데까지다.
- **preset 존재 검증.** catalog가 `main`에 없다. 형태(shape)만 검증한다. 근거는 R5.
- **project 설정 파일 파싱**과 `provider_config_invalid`를 던지는 코드. W1-B 소유이며,
  `CONTRACT_ONLY_ERROR_CODES` 불변식상 이 lane이 던지면 W1-C가 세운 검사가 깨진다.
- 다른 lane의 파일: `cli/src/jsonRpc.ts`·`cli/src/lsp/**`·`cli/src/lspProvider.ts`·
  `cli/src/test/fixtures/mockServer.ts`(W1-A), `cli/src/providers/**`·`cli/src/doctor*`·
  `cli/src/runtime.ts`(W1-B), `src/**`·루트 `package.json`(W2-B),
  `plugins/**/cli-contract.md`(W2-C가 W1-C 부록 B와 함께 일괄 처리).
- `cli/src/index.ts`는 **요청 파싱·검증에 필요한 최소 범위**로만 손댄다. W1-B가 같은 파일의 doctor
  dispatch를 동시에 고치고 있다. 실제로 바꾼 줄은 작업 로그에 남긴다.

## 현재 구현 조사 결과

### C1. 요청 스키마는 지금 아무도 검증하지 않는다 (신규 발견)

`cli/schemas/request.schema.json`은 npm tarball의 `files`에 포함돼 배포되지만, 저장소 어디에서도
읽히지 않는다. `cli/src/test/schema.test.ts`는 **응답** 스키마만 검사하고,
`cli/src/test/jsonSchema.ts`의 `assertSupportedKeywords`도 응답 스키마에만 적용된다.

그 결과 두 가지가 이미 성립한다.

- 요청 스키마는 `minLength`를 쓰는데 `jsonSchema.ts`의 `SUPPORTED_KEYWORDS`에 `minLength`가 **없다.**
  즉 지금 상태로 요청 스키마를 그 체커에 넣으면 곧바로 실패한다.
- 파서(`cli/src/index.ts`)와 스키마가 갈라져도 아무 검사도 실패하지 않는다. 실제로 갈라진 예가 있다:
  스키마는 `depth`에 `maximum: 20`을 선언하지만 파서의 `optionalPositiveInteger`는 상한이 없다.
  (범위 강제는 `cli/src/impact.ts:43`의 `integerInRange`가 하므로 **결과적으로는 일치**한다. 강제 지점이
  다를 뿐 계약 위반은 아니다. 그러나 그것을 확인해 주는 검사는 없었다.)

W0-3이 응답 쪽에서 확인한 명제 — "응답을 스키마에 대조하는 검증만으로는 enum 드리프트를 못 잡는다" —
의 요청 쪽 짝이 이것이다. 이 lane은 필드를 추가하면서 **요청 스키마에 대한 검사 자체를 처음 만든다.**

### C2. 요청 파싱 구조

`cli/src/index.ts`는 stdin JSON과 CLI 옵션을 같은 validator로 보낸다.
`validateAnalyzeObject`가 `rejectUnknown`으로 허용 필드를 화이트리스트로 잡고, 필드별 helper
(`requiredString` / `optionalPositiveInteger` / `providerObject` / `expectedSymbolObject`)가 형태를 본다.
실패는 전부 `new CliError('invalid_request', ..., 2)`이며 `details`는 붙이지 않는다.

`AnalyzeRequest`는 `readonly` 필드만 가진 순수 데이터이고 `analyzeImpact`와
`LspCallHierarchyProvider` 생성자로 흘러간다. 생성자는 `(workspace, file, provider, timeoutMs)` 4인자이며
`cli/src/lspProvider.ts`에 있다 — **W1-A 소유라 이 lane이 인자를 늘릴 수 없다.**

### C3. error code 불변식

`cli/src/errors.ts`는 W1-C가 `CLI_ERROR_CODES`(실제로 던지는 것)와
`CONTRACT_ONLY_ERROR_CODES`(계약에만 있는 것)로 쪼갰고, `cli/src/test/errors.test.ts`가
두 배열이 서로소이며 contract-only code가 `new CliError('<code>'`로 등장하지 않음을 강제한다.
`provider_config_invalid`는 contract-only 쪽에 있다. **이 lane이 그것을 던지면 그 검사가 깨진다.**

### C4. 캡처 결정성

W1-C가 보고한 `provider.observed.diagnostics` 비결정성을 이 lane에서도 재현했다. 코드를 한 줄도 바꾸지 않고
34 시나리오를 두 번 떴을 때 `ok-ts.txt`만 2줄 달랐고, 두 줄 모두 `observed.diagnostics`였다
(`data.provider`와 그 사본인 `capabilities`). W1-C는 top-level `provider.diagnostics`가 안정적이라고 적었고
이번 관측도 같다 — 뒤집힌 것은 `observed` 하위 필드뿐이다. 정규화 후 두 벌이 완전 동일했다.

## 결정

### R1. 세 필드는 `impact.analyze` 요청에만 추가한다

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | `impact.analyze` 요청에만 추가 | **채택** |
| b | note 계열 요청(`note.get`/`set`/`delete`)에도 함께 추가 | 기각(지금은) |

note 계열도 `LspCallHierarchyProvider`를 띄우므로 언젠가 같은 필드가 필요해질 수 있다. 그럼에도 (b)를
지금 하지 않는 이유는 **받아들이고 무시하는 필드를 만들지 않기 위해서**다. analyze 경로는 W1-B가 preset
선택을 붙일 자리가 확정돼 있지만(`selectedBy`가 `preset`/`project`로 바뀌는 그 경로), note 경로는 그렇지
않다. 스키마가 받아들이는데 런타임이 조용히 버리는 필드는 이 계약이 없애려는 바로 그 종류의 거짓말이다.

note 경로 추가는 나중에도 **additive**이므로 v1 안에서 언제든 가능하다. 좁게 시작하는 쪽이 안전하다는
D8의 비대칭 논리가 여기에도 그대로 적용된다. W1-B 인계 사항에 남긴다.

### R2. D8은 코드가 강제하고 스키마는 선언하며, 둘의 일치는 테스트가 강제한다

가장 먼저 분명히 할 사실: **CLI는 런타임에 `request.schema.json`을 실행하지 않는다.** 스키마는 tarball에
실려 나가는 *공표된 계약*이고, 실제 관문은 `cli/src/index.ts`의 파서다. 따라서 "스키마에서 강제한다"는
표현은 정확히는 "스키마가 그 규칙을 표현하고, 파서가 같은 규칙을 실행하며, 테스트가 둘이 같은 답을 내는지
확인한다"는 뜻이다.

그 위에서 D8 항목별로 표현 가능성이 갈린다.

| D8 항목 | JSON Schema로 표현 | 파서(코드) | 비고 |
| --- | --- | --- | --- |
| 허용 타입(string/number/boolean/null/배열/객체) | **가능** — 재귀 `$defs/jsonValue` | 강제 | |
| 금지 키 `__proto__`/`constructor`/`prototype` (전 depth) | **가능** — `propertyNames: { not: { enum: [...] } }` | 강제 | R4 |
| 금지 값 `NaN`/`Infinity` | 표현 불필요 | 강제 | JSON 문법에 없으므로 stdin으로는 들어올 수 없다. 그러나 이 validator는 W1-B가 코드에서 만든 트리에도 쓰이므로 코드에서는 검사한다 |
| 최대 depth 16 | **불가능** | 강제 | 16겹 중첩 스키마를 손으로 쓰는 것은 표현이 아니라 복사다 |
| 트리당 직렬화 64 KiB | **불가능** | 강제 | JSON Schema에 바이트 길이 키워드가 없다 |
| 총 키 1000 | **불가능** | 강제 | `maxProperties`는 객체 하나의 키 수이지 트리 전체가 아니다 |

표현 불가능한 셋을 그냥 코드에만 두면 **공표된 계약에서 사라진다.** 그래서 스키마에 참조되지 않는
`$defs/configTreeLimits`를 두어 세 수치를 `const`로 선언하고, 그 값이 `cli/src/configTree.ts`의 상수와
같은지 테스트가 비교한다. 검증에 참여하지 않는 `$defs`는 어떤 요청의 판정도 바꾸지 않으므로 additive이며,
소비자는 이 값을 읽어 자기 쪽에서 미리 거를 수 있다.

**메시지 요구**: 제한 위반은 `invalid`만으로 끝나지 않는다. 위반 규칙, 필드 경로, 한도, 관측값을 문장과
`error.details` 양쪽에 싣는다. `details`는 실패 envelope에서 이미 허용된 자리이며
(`response.schema.json`의 `error.properties.details`), 새 실패 경로에만 붙으므로 기존 응답 바이트를
바꾸지 않는다.

### R3. 요청 출처의 위반은 `invalid_request`다. 새 code를 만들지 않는다

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | 출처와 무관하게 `provider_config_invalid` 하나로 | 기각 |
| b | 요청 출처 전용 신규 code(`request_config_invalid` 등) | 기각 |
| c | 요청 출처는 기존 `invalid_request`, 설정 파일 출처는 `provider_config_invalid` | **채택** |

L1의 결정 근거를 그대로 뒤집어 적용하면 답이 나온다. L1이 `invalid_request` 재사용을 기각한 이유는
"요청은 멀쩡한데 요청이 잘못됐다고 보고하게 되어 **사용자가 고쳐야 할 파일을 잘못 지목**한다"였다.
요청 최상위의 `settings`가 64 KiB를 넘겼다면 **잘못된 것은 정확히 요청이다.** 사용자가 고쳐야 할 것도
요청을 만든 쪽이다. 여기서 `provider_config_invalid`를 던지면 L1이 막으려던 오지목이 반대 방향으로
발생한다 — 멀쩡한 설정 파일을 뒤지게 만든다.

(b)를 기각하는 이유: `invalid_request`가 이미 "요청 본문이 계약을 위반했다"를 정확히 뜻하고 exit 2를
가진다. 같은 뜻의 code를 하나 더 만들면 소비자의 분기만 늘고 구분되는 정보는 없다. 승인된 신규 11종에
요청 출처용 code가 없다는 사실도 이 방향과 모순되지 않는다 — 필요가 없어서 없는 것이다.

**따라서 이 lane은 error code를 하나도 추가하지 않는다.** `CLI_ERROR_CODES`도 `CONTRACT_ONLY_ERROR_CODES`도
그대로다. 출처 구분은 code로 하고, 어느 필드가 왜 걸렸는지는 message와 `details`로 한다.

| 출처 | code | 던지는 lane |
| --- | --- | --- |
| 요청 최상위 `initializationOptions`/`settings`/`providerPreset` | `invalid_request` (exit 2) | 이 lane |
| project 설정 파일의 provider 설정 | `provider_config_invalid` (exit 5, discovery) | W1-B |
| preset catalog 자체 | catalog는 우리 산출물이므로 사용자 오류가 아니다. 로드 시 실패는 W1-B가 정한다 | W1-B |

### R4. prototype key 거부는 병합 **전**, validator 안에서, 전 depth로 한다

`__proto__`/`constructor`/`prototype`은 D9의 deep merge 경로로 들어간다. 즉 **병합 구현 자체가 공격
대상**이며, 병합기가 스스로를 방어하는지 여부에 안전을 걸 수 없다. 방어선은 값이 병합기에 도달하기 전,
요청·설정 파일 파싱 단계여야 한다.

- 어느 depth에서든 위 세 키가 객체 키로 나타나면 거부한다. 값 안쪽도 예외가 없다.
- 배열 원소 안의 객체도 같다.
- 거부는 sanitize(키 삭제)가 아니라 **요청 거부**다. 조용히 지우면 작성자가 의도한 설정과 실제로 전송된
  설정이 달라지고, 그 차이는 어디에도 보고되지 않는다.
- D3-1이 `settings` 값 안의 dot 포함 키를 정상으로 인정한 것과 충돌하지 않는다. dot 키는 정상 설정에
  실재하지만(`files.exclude`의 glob), 위 세 키가 LSP 설정 값으로 필요한 사례는 알려진 바 없다.

`constructor` 금지가 정상 설정을 막을 위험은 인정하고 기록한다. 완화는 additive(허용 확대)이므로 나중에
가능하고, 강화는 파괴적이다. D8/L5가 승인한 값이므로 좁은 쪽으로 시작한다.

### R5. `providerPreset`은 **형태만** 검증한다. 존재 검증은 하지 않는다

catalog가 `main`에 없다. 없는 catalog에 대해 존재 검증을 흉내 내면 (1) 지금은 항상 통과하거나 항상
실패하는 무의미한 검사가 되고, (2) W1-B가 진짜 catalog를 붙일 때 두 개의 검증 지점이 생긴다.

형태 검증은 다음 셋이다.

| 규칙 | 값 | 근거 |
| --- | --- | --- |
| 타입 | 비어 있지 않은 문자열 | D9 |
| 길이 | ≤ 64 | 무한 길이 식별자를 로그·에러 메시지에 싣지 않는다 |
| 문자 | `^[a-z0-9]+(?:-[a-z0-9]+)*$` (소문자 kebab) | **경로 주입 방지.** preset id는 catalog 조회 키이고 파일 이름으로 쓰일 수 있다. `../`, 절대 경로, NUL, 공백이 애초에 통과하지 못하게 한다. 알려진 후보 id(`bundled-typescript`, `go-gopls`, `rust-analyzer`)가 모두 이 형태다 |

문자 제한은 **좁게 시작한다**. 넓히는 것은 additive이고 좁히는 것은 파괴적이다. catalog가 다른 문자를
필요로 하면 W1-B가 근거와 함께 완화를 요청한다.

존재하지 않는 preset id에 대한 error code는 W1-B가 정한다. 승인된 11종 중
`provider_executable_not_found`는 "실행 파일이 없다"이지 "그런 preset이 없다"가 아니므로, 후보는
`provider_config_invalid`(요청이 존재하지 않는 preset을 지목했다면 이는 요청 오류이므로 오히려
`invalid_request`)다. **이 판단은 인계 사항으로 넘긴다.**

### R6. `provider`와 `providerPreset`은 동시에 지정할 수 없다

IL-LIM-004의 선택 우선순위 `raw custom > explicit preset > trusted project > verified auto`는
**서로 다른 출처** 사이의 순서다(요청의 custom, 요청의 preset 지정, 설정 파일의 선택, 자동 탐색).
한 요청 안에서 두 필드를 동시에 쓰면 우선순위 규칙은 "custom이 이기고 preset은 버려진다"로 해석되는데,
그것은 **명시적으로 지정된 preset을 조용히 무시**하는 동작이다. 금지 조합은 문서 경고가 아니라 스키마로
만들 수 없게 한다는 이 lane의 원칙이 정확히 이 경우다.

스키마에서는 analyze 분기에 `"not": { "required": ["provider", "providerPreset"] }`로 표현하고, 파서는
같은 조건에서 `invalid_request`로 거부한다. IL-LIM-004 1단계 3항("`providerPreset`과 기존 `provider`
우선순위를 정의한다")이 "둘 다 허용하고 custom이 이긴다"로 결론 나면 **완화**하면 되며 그것은 additive다.
반대 방향(먼저 허용했다가 나중에 금지)은 파괴적이다.

### R7. D8은 병합 **전** 출처별로 걸리고, 병합 **후** 한 번 더 걸린다

- **병합 전(출처별)**: 각 입력 트리(요청 override, 설정 파일 override, preset 기본값)가 각각 D8을
  만족해야 한다. 이 시점에만 위반을 **하나의 출처에 귀속**시킬 수 있고, 따라서 이 시점에만
  "무엇을 고쳐야 하는지" 말할 수 있다. prototype key와 타입 위반은 여기서 끝나야 한다(R4).
- **병합 후(유효 트리)**: 64 KiB와 1000키는 **wire 예산**이다. 각각 64 KiB인 세 트리를 deep merge하면
  합이 그것을 넘을 수 있고, 실제로 initialize 프레임에 실리는 것은 병합 결과다. 따라서 병합 후 검사가
  없으면 D8의 목적("initialize 프레임이 비정상적으로 커지는 것을 막는다")이 달성되지 않는다.
- **병합 후 위반의 code는 `provider_config_invalid`다.** 요청은 자기 계약을 이미 통과했으므로 그 시점에
  `invalid_request`(exit 2, "요청이 잘못됐다")를 던지면 거짓이다. 잘못된 것은 어느 한 입력이 아니라
  **설정의 조합**이다. 메시지에는 출처별 바이트·키 기여량을 실어 사용자가 어느 쪽을 줄일지 고를 수 있게
  한다. 구현은 W1-B(D2)이며 인계 사항에 넣는다.

이 lane은 병합을 구현하지 않는다. 위 규칙 중 **병합 전 요청 출처**만 이 lane의 코드가 된다.

### R8. 스키마와 파서의 일치는 새 계약 테스트가 강제한다

C1이 드러낸 공백을 이 lane에서 메운다. `cli/src/test/requestSchema.test.ts`를 새로 만들어 다음 넷을
검사한다.

1. `assertSupportedKeywords(requestSchema)` — 요청 스키마가 체커가 이해하지 못하는 키워드로 자라지 못하게
   한다. 이를 위해 `cli/src/test/jsonSchema.ts`에 `minLength`/`maxLength`/`maximum`/`pattern`/
   `propertyNames`를 구현한다(요청 스키마가 이미 쓰거나 이 lane이 쓰는 것들이다).
2. **파서 ↔ 스키마 parity**: 같은 요청 본문 목록을 (a) 스키마 검증과 (b) 실제 CLI 파서에 각각 넣어
   수용/거부가 일치하는지 본다. 한쪽만 통과하는 본문이 있으면 실패다.
3. **enum ↔ union parity**: 요청 스키마의 `includeSource`/`scope` enum과 `SOURCE_MODES`/`NOTE_SCOPES`,
   그리고 `$defs/configTreeLimits`·금지 키·preset id 제한과 `configTree.ts` 상수를 비교한다.
   W0-3이 실험으로 확인했듯 **응답(또는 요청)을 스키마에 대조하는 검증만으로는 enum 드리프트를 못 잡는다.**
4. 실제 CLI를 실행해 새 필드를 담은 요청이 통과하고 위반 요청이 거부되는지 확인한다.

### R9. 필드가 아직 소비되지 않는 구간을 어떻게 다루는가

이 PR이 merge된 뒤 W1-B가 preset 선택을 붙이기 전까지, `providerPreset`을 담은 요청은 **파싱은 되지만
아무 provider 선택도 바꾸지 않는다.** 이것이 "받아들이고 조용히 무시하는 필드"인가?

아니다. 근거는 응답에 이미 있다. 성공 응답의 `data.provider`는 실제로 실행된 provider의 `name`과
`selectedBy`를 싣는다. preset이 반영되지 않았다면 `selectedBy`는 `preset`이 아니라 `bundled`로 나오고,
소비자는 그 차이를 기계적으로 볼 수 있다. 즉 무시가 **관측 가능**하다. `selectedBy` 값 자체는 이 lane이
바꾸지 않는다.

그럼에도 이 구간은 짧아야 하며, Wave 1 종료 gate가 그 마감이다. gate 시점에 W1-B의 선택 경로가 붙지
않으면 그 사실 자체를 lead에 보고해야 한다. 인계 사항에 넣는다.

## 단계별 구현 계획

각 단계는 독립적으로 검증·commit·push 가능하다.

1. **작업 문서와 무변경 기준선.** 이 문서 작성, 캡처 스크립트 준비, 코드 변경 전 baseline 2벌을 떠
   `diff -r`가 비는지 확인. (문서만 commit)
2. **요청 계약 추가.** `cli/schemas/request.schema.json`에 세 필드와 `$defs`(jsonValue/configObject/
   configTreeLimits), `cli/src/configTree.ts` 신설, `cli/src/types.ts`의 `AnalyzeRequest` 확장,
   `cli/src/index.ts` 최소 배선, 단위 테스트(수용·거부·prototype pollution).
3. **스키마 계약 테스트와 무변경 증명.** `jsonSchema.ts` 키워드 확장,
   `requestSchema.test.ts`(키워드·parity·enum parity), 캡처 재실행과 `diff -r`,
   `provider-coverage-contract.md`에 요청 override 절 추가, 인계 사항 정리.

## 테스트 및 완료 기준

- [ ] `npm run cli:build` 통과
- [ ] `npm run cli:test` 통과
- [ ] `npm test`(루트) 통과
- [ ] `npm run test:plugin-artifact` 통과 — 네트워크 필요. 실패·미실행이면 사유를 로그에 남긴다
- [ ] 기존 요청 34 시나리오(성공·부분·provider 실패·요청 표면 실패·doctor·note)의 응답이 **바이트 동일**
- [ ] 새 필드를 담은 요청이 실제 CLI에서 통과한다
- [ ] D8의 네 제한(타입/depth/바이트/키 수)을 각각 위반하는 요청이 실제 CLI에서 거부된다
- [ ] `__proto__`/`constructor`/`prototype`이 **중첩 depth에서도** 거부된다
- [ ] 요청 스키마 enum ↔ TS union parity 테스트가 새 필드를 덮는다
- [ ] `stdout`은 여전히 JSON 한 줄이다
- [ ] `schemaVersion`은 1이다. 필드 제거·이름 변경 없음
- [ ] `V1_WITHHELD_REASON_CODES`를 비우지 않았다

## 작업 로그

### 2026-08-27 — 1단계: 작업 문서와 무변경 기준선

**수행**

- 입력 문서를 읽었다: `AGENTS.md`, `task-m1-preset-manifest-contract.md`(D3·D5·D8·D9, lead 결정 L1~L7),
  `task-m1-completeness-emit.md`(D9의 `CONTRACT_ONLY_ERROR_CODES`, 부록 A의 캡처 delta, 캡처 함정 2건),
  `task-m1-wave0-handover.md` 5절, `provider-coverage-contract.md`, `task-m1-provider-seam.md` 부록 A.
- `feat/m1-request-overrides`를 `origin/main` `f0cb40e`(W1-C merge 완료)에서 만들었다.
- `npm install`, `npm --prefix cli install`, `npm run cli:build` 성공.
- 조사 결과 C1(요청 스키마 무검증)과 C2·C3·C4를 기록했다. C1은 예상 밖의 발견이라 3단계 범위가
  "필드 추가"에서 "요청 스키마 검사 신설"로 넓어졌다. 계획을 그에 맞게 적었다.

**캡처 결정성 검증 (코드 변경 전)**

캡처 경로에 lane 이름을 넣어 병렬 lane과 충돌하지 않게 했다. workspace는
`/private/tmp/il-m1-request-overrides-ws`로 고정했다 — `os.tmpdir()`은 macOS에서 프로세스마다 갈릴 수
있고 scratchpad는 공유될 수 있다.

| 회차 | 결과 |
| --- | --- |
| raw1 vs raw2 (정규화 전) | `ok-ts.txt` 2줄 차이 — 둘 다 `observed.diagnostics` (`data.provider`와 사본 `capabilities`) |
| base1 vs base2 (정규화 후) | **완전 동일** |

`observed.diagnostics`는 W1-C가 보고한 기존 결함이며 W1-A가 고친다. 이 lane의 변경과 무관하므로
`timings`와 같은 이유로 정규화하고 기준선으로 인정했다. 캡처 시나리오는 34건이며 W0-4의 29건에
요청 파서 표면 5건(`err-unknown-field`, `err-bad-include-source`, `err-bad-provider-args`,
`err-not-json`, `note-unknown-field`)을 더한 것이다. 이 lane이 손대는 경로가 정확히 그 파서이므로,
파서 실패 메시지가 한 글자라도 바뀌면 캡처가 잡는다.

### 2026-08-27 — 2단계: 요청 계약 추가

(작성 예정)

### 2026-08-27 — 3단계: 스키마 계약 테스트와 무변경 증명

(작성 예정)

## W1-B 인계 사항

(3단계에서 확정해 정리한다)
