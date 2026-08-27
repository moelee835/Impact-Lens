# M1 preset manifest ↔ 프로토콜 계층 필드 계약 (W1-A 제안서)

- 작성일: 2026-08-27
- 작성 lane: W1-A `il-lsp-protocol`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md)
- 관련 story: [`IL-LIM-005`](../development-management/stories/il-lim-005-custom-lsp-compatibility.md) 1~3단계,
  [`IL-LIM-004`](../development-management/stories/il-lim-004-first-class-language-presets.md) 1단계
- 실행 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md) Wave 1 "교차 의존 처리"
- 상태: **lead 결정 반영 완료 (2026-08-27).** 아래 "lead 결정" 표의 7건 중 6건이 확정됐고 **L2 하나만
  미결**이다. L2는 관측 전에 정할 수 없는 항목이며, 그때까지 "bundled 동작 무변경" 제약이 그대로 유지된다.

## 배경과 해결할 문제

Wave 1의 W1-A(프로토콜)와 W1-B(preset platform)는 `initializationOptions`/`settings`/readiness 필드에서
상호 의존한다. 실행 계획은 두 lane이 **착수 전에 필드 형태를 먼저 합의**하도록 못박았다. 이 문서는 그 합의의
W1-A 측 제안서다.

W1-A가 이 합의를 필요로 하는 이유는 단순히 "타입이 필요해서"가 아니다. 지금
`cli/src/lspProvider.ts:LspCallHierarchyProvider.doInitialize`는 `initializationOptions: {}`를 하드코딩하고
client capability에 `workspace.configuration`을 선언하지 않는다. 선언하지 않은 capability에 대해
spec을 지키는 server는 `workspace/configuration`을 **애초에 보내지 않으므로**, 응답 경로만 구현하고
capability 선언을 빼면 그 코드는 mock fixture에서만 실행되고 실제 server에서는 죽은 코드가 된다.
반대로 capability를 선언하면 server가 실제로 물어보기 시작하므로 "무엇을 답할 것인가"가 그 순간부터 필요하다.
즉 **선언·응답·값의 출처 세 가지는 같은 변경에 묶여 있고, 값의 출처가 preset manifest다.**

## 범위

- manifest가 프로토콜 계층에 넘겨야 하는 필드의 **형태와 의미**를 결정한다.
- server→client request 각각에 대한 **응답 전송 계약**(무엇을 돌려주는가)을 확정한다.
- readiness 선언 형태와 `coverage.indexing.status` 3값의 대응을 확정한다.
- secret redaction의 선언 지점과 강제 지점을 확정한다.
- server request id 네임스페이스 분리 방식을 확정한다.
- W1-B가 그대로 옮겨 적을 수 있는 `ProviderPreset` 타입 스케치를 제공한다.

## 범위에서 제외할 항목

- **구현.** 이 문서는 코드·스키마·타입을 단 한 줄도 바꾸지 않는다. `cli/src/**`, `src/**`, `cli/schemas/**`,
  `package.json`은 이 branch에서 수정 대상이 아니다.
- preset **선택 우선순위**와 PATH discovery, version probe, doctor 출력 형식 (W1-B 소유).
- `data.completion` 생산과 `coverage.*` projection (W1-C 소유). 이 문서는 값을 **받을 수 있는 경로**만 정의한다.
- TypeScript 외 언어 preset의 실제 값. M1은 TypeScript reference preset까지다. 검증되지 않은 언어를
  `verified-external`로 선언하지 않는다.

## 현재 구현 조사 결과

라인 번호가 곧 이동하므로 `파일:심볼` 형태로 적는다. **`main`(`dbc6c9b`, W0-4 merge 직후) 기준**이며,
[`task-m1-wave0-handover.md`](task-m1-wave0-handover.md) 5절의 조사 결과를 재조사하지 않고 그대로 전제한다.
handover가 `lspProvider.ts`에 있다고 적은 provider 선택 로직은 W0-4(PR #34)가
`cli/src/providers/resolve.ts:resolveProvider`로 옮겼다. 아래 표는 그 이후 상태다.

| 사실 | 근거 |
| --- | --- |
| server→client request가 pending 테이블 조회로 빠져 폐기되고, 응답 전송 함수 자체가 없다 | `cli/src/jsonRpc.ts:JsonRpcClient.handle`이 `message.id !== undefined`를 **먼저** 검사한다 |
| server request id가 client id와 같은 네임스페이스에서 조회된다 | `cli/src/jsonRpc.ts:JsonRpcClient.nextId`와 위 분기 |
| `initializationOptions`가 `{}` 하드코딩이고 `workspace.configuration` capability 미선언 | `cli/src/lspProvider.ts:LspCallHierarchyProvider.doInitialize` |
| timeout 시 pending만 지우고 `$/cancelRequest`를 보내지 않는다 | `cli/src/jsonRpc.ts:JsonRpcClient.request`의 `setTimeout` 콜백 |
| 진단 수집 대기가 고정 100ms | `cli/src/lspProvider.ts:LspCallHierarchyProvider.collectDiagnostics` |
| redaction이 stderr/logMessage 문자열에만, 패턴 기반으로 걸려 있다 | `cli/src/jsonRpc.ts:redactProviderText` |
| bundled TypeScript의 command·args가 **런타임 계산값**이다 | `cli/src/runtime.ts:bundledTypeScriptCommand`가 `process.execPath`와 `inspectBundledTypeScriptArtifact().entryPath`를 조합한다 |
| bundled provider의 `--log-level` 인자가 환경변수 조건부다 | `cli/src/runtime.ts:bundledProviderLogArgs` |
| server request를 실제로 보내는 fixture가 이미 2종 있다 | `cli/src/test/fixtures/configurationRequestServer.ts`, `registerCapabilityServer.ts` |
| fixture의 server request id가 1000부터 시작한다 | `cli/src/test/fixtures/mockServer.ts:SERVER_REQUEST_ID_BASE` |
| `provider_ipc_unavailable`이 원래 오류의 `details.stage`를 그대로 유지한다 | `cli/src/childIpc.ts:childIpcUnavailableError`가 `...details`를 펼친다 |
| **선택 결과를 담는 seam 타입이 이미 있다** | W0-4가 만든 `cli/src/providers/resolve.ts:ResolvedProvider`. `LspCallHierarchyProvider` 생성자가 `resolveProvider(file, command)`를 호출해 이 값을 받는다 |

마지막 항목은 handover 6절 미결 4번의 답이다. "handover 미결 4번에 대한 조사 결과" 절에서 다룬다.

## 결정

각 결정은 선택지 → 채택 → 기각 사유 순서로 적는다. W1-A가 단독으로 정할 수 없는 것은 아래 "lead 결정"
표로 올렸고, 그 표는 2026-08-27 lead 결정으로 **L2 하나를 제외하고 전부 닫혔다.**

### D1. `initializationOptions`는 정적 리터럴만으로 표현할 수 없다

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | manifest에 정적 JSON 리터럴만 허용 | 기각 |
| b | 자유 형식 문자열 template (`${...}` + 표현식 평가) | 기각 |
| c | 닫힌 토큰 치환 (`${workspaceRoot}` 등 열거된 토큰만 문자열 안에서 치환) | 기각 |
| d | **선언적 참조 노드** (`{ "$ref": "nodeExecutable" }` 형태의 tagged object) | **채택** |

**(a) 기각 근거는 추측이 아니라 기존 코드다.** IL-LIM-004 1단계의 종료 조건은 "TypeScript 기본 provider를
기존 동작 변경 없이 manifest로 표현할 수 있다"인데, `cli/src/runtime.ts:bundledTypeScriptCommand`가 만드는
값은 `process.execPath`와 `require.resolve('typescript-language-server/lib/cli.mjs')`의 결과다. 둘 다 설치
경로·Node 설치 위치에 따라 달라지므로 catalog 파일에 리터럴로 적을 수 없다. 정적 리터럴만 허용하면
**첫 preset부터 표현 불가**다.

**(b) 기각 근거는 story의 명시적 제외 범위다.** `IL-LIM-005`의 "대안 검토와 결정" 4번이 "자유 형식 환경
변수·명령 template 허용"을 secret 노출과 shell 위험 때문에 제외했다. 표현식 평가기를 넣으면 manifest가
코드가 되고, catalog 검토가 코드 리뷰가 된다.

**(c)와 (d)의 비교가 실질적인 선택이다.**

- (c)는 VS Code의 `${workspaceFolder}` 관습과 같아 익숙하고, `--dir=${workspaceRoot}/build`처럼 **부분 보간**이
  가능하다.
- (c)의 비용: 모든 문자열 leaf를 정규식으로 훑어야 하고, escape 규칙이 필요하며, 값이 문자열로만
  나온다. 숫자·boolean 설정을 참조로 채울 수 없다. 그리고 리터럴로 `${...}`를 담고 싶은 설정값
  (glob, shell 예시 문자열)이 우연히 치환되는 사고 경로가 생긴다.
- (d)의 비용은 verbosity 하나다. 이득은 세 가지다.
  1. **타입 보존.** ref가 문자열이 아닌 값으로 해석될 수 있다.
  2. **escape 문제 없음.** 문자열 안의 어떤 내용도 해석되지 않는다. 치환은 오직 `$ref` 키를 가진 객체에서만
     일어난다.
  3. **추가 순회가 필요 없다.** manifest 값 트리는 어차피 depth/size/prototype key 검증을 위해 한 번 걸어야
     한다(D8). ref 해석은 그 순회에 case 하나를 더하는 것이고, (c)는 그 순회에 **더해서** 문자열 스캔을
     따로 해야 한다.

**M1의 ref 집합은 실제로 필요한 2개로 시작한다.** "실제로 필요한 최소 형태"라는 원칙을 지키기 위해
쓰이지 않는 ref를 union에 미리 넣지 않는다. 선언만 하고 생산하지 않는 값은 W0-3이 `cli/src/errors.ts`
주석에서 거부한 것과 같은 종류의 드리프트다.

| ref | 해석 결과 | M1 사용처 | 신뢰 등급 |
| --- | --- | --- | --- |
| `nodeExecutable` | `process.execPath` | bundled TypeScript preset의 `command` | catalog 전용 |
| `bundledModuleEntry` | `inspectBundledTypeScriptArtifact()`가 검증한 entry 절대경로. `module` 필드 필수 | bundled TypeScript preset의 첫 번째 arg | catalog 전용 |

`workspaceRoot`, `workspaceRootUri`, `detectedLanguageId`, `discoveredExecutablePath`는 **M1에서 구현하지
않는다.** clangd의 `compile_commands.json` 경로처럼 근거가 확인된 사용처가 생기는 preset과 같은 변경에서
additive로 추가한다. `join`(경로 결합) 필드도 같은 이유로 M1에서 빼고, 그 시점에 함께 넣는다. 문자열 연결로
경로를 만들면 결과를 다시 workspace escape 검사에 태워야 하지만(`workspace_escape` code가 이미 있다),
`join` 노드는 결합 시점에 검사할 수 있다는 것이 그때의 선택 근거가 된다.

**catalog 전용 ref는 사용자가 제공한 manifest/override에서 거부한다.** `bundledModuleEntry`는 임의
specifier를 CLI package의 의존성 트리에서 resolve하므로, 사용자 입력에서 허용하면 설치 경로 노출 수단이
된다. catalog manifest는 CLI tarball에 함께 배포되는 신뢰 자산이고, override는 아니다.

### D2. ref 해석은 W1-B가 하고, 프로토콜 계층은 해석된 평문 JSON만 받는다

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | `LspCallHierarchyProvider`가 `ProviderPreset`을 통째로 받아 직접 ref를 해석한다 | 기각 |
| b | W0-4의 `ResolvedProvider`를 확장해 해석된 값만 넘기고, 프로토콜 계층은 `$ref`를 모른다 | **채택** |

(a)를 기각하는 이유는 소유권과 seam이다. ref 어휘(`nodeExecutable`, `bundledModuleEntry`)는 discovery 계층의
지식이고 그 해석에 필요한 함수(`inspectBundledTypeScriptArtifact`)는 `cli/src/runtime.ts`(W1-B 소유)에
이미 있다.

**그리고 이 seam은 이미 존재한다.** W0-4가 `cli/src/providers/resolve.ts:ResolvedProvider`를 만들었고,
그 파일의 헤더 주석이 경계를 이렇게 적었다.

> Selection is deliberately separate from the LSP session in `lspProvider.ts`: the session owns the
> protocol, this module owns which executable answers for which language.

이 문서의 제안은 그 경계를 그대로 두고 **같은 타입에 필드를 더하는 것**이다. 즉
`ResolvedProviderSession`은 새 seam이 아니라 `ResolvedProvider`의 확대이며,
`cli/src/lspProvider.ts:LspCallHierarchyProvider` 생성자의 `resolveProvider(file, command)` 호출 지점은
그대로 남는다. 프로토콜 계층은 `$ref`도 `ProviderPreset`도 import 하지 않는다.

주의할 점 하나: `resolveProvider`는 지금 동기 함수이고 파일을 읽지 않는다. project 설정 파일 병합(D9)이
들어가면 그 성질이 깨진다. **동기 유지 여부는 W1-B의 설계 재량**이며, 이 계약이 요구하는 것은 "ref 해석과
병합이 `providers/` 안에서 끝난다"는 것뿐이다.

부수 효과로 W1-A의 테스트가 manifest 없이 평문 객체만으로 작성 가능해진다.

### D3. `settings` 조회 규칙 — 중첩 walk 전용, `scopeUri` 무시, 미보유 section은 `null`

`workspace/configuration`의 `params`는 `ConfigurationParams { items: ConfigurationItem[] }`이고 각 item은
optional `scopeUri`와 optional `section`을 가진다. 응답은 `LSPAny[]`이며 **items와 같은 길이·같은 순서**여야
한다. 이 길이·순서 규칙은 협상 대상이 아니라 spec 요구사항이고, client 구현에서 가장 흔한 버그다.

#### D3-1. 점 표기 section의 해석

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | 중첩 walk 전용: `typescript.preferences.x`를 `settings.typescript.preferences.x`로 내려간다 | **채택** |
| b | 평면 키 전용: `settings["typescript.preferences.x"]` 정확 일치 | 기각 |
| c | 중첩 walk 후 평면 키 fallback | 기각 |

(b)를 기각하는 이유: server가 section 없이 물어보면(전체 트리 요청) 평면 키 트리를 그대로 주게 되는데,
그 형태는 대부분의 server가 기대하는 중첩 형태가 아니다. 두 요청 형태에 서로 다른 모양을 줄 수 없다.

(c)를 기각하는 이유: 두 해석이 동시에 성립하는 manifest에서 어느 쪽이 이기는지 규칙을 하나 더 만들어야
한다. 모호함은 조회 시점에 해소하는 것보다 **작성 시점에 성립 불가능하게** 만드는 편이 낫다.

(a)를 채택하되 키 문자 제한은 두지 **않는다.** 처음에는 "manifest 키에 `.` 금지"를 검토했으나,
`files.exclude` 같은 설정의 값 안에는 `**/*.ts` 같은 dot 포함 glob 키가 정상적으로 존재한다. 값 내부 키와
section 경로 키를 구문만으로 구분할 수 없으므로 전면 금지는 정상적인 설정을 막는다. 대신 규칙을 문장으로
고정한다.

> `settings` 안에서 `.`을 포함한 키는 점 표기 section 조회로 **도달할 수 없고**, 부모 객체 전체가 반환될 때
> 그 값의 일부로만 전달된다.

그리고 doctor가 `settings`에 있는 dot 포함 키를 전부 `warn`으로 나열한다. 대부분 작성자의 실수이고,
값 내부의 정상 glob이면 작성자가 무시하면 된다. 강제 실패로 만들면 정상 설정을 막는다.

#### D3-2. `scopeUri`

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | `scopeUri`를 무시하고 모든 item에 같은 트리로 답한다 | **채택** |
| b | workspace root 밖의 `scopeUri`에는 `null`을 준다 | 기각 |
| c | scope별 설정을 manifest에 둔다 | 기각 |

CLI는 workspace folder가 정확히 하나다(`doInitialize`의 `workspaceFolders`가 단일 항목). 구분할 설정이
애초에 없다.

(b)를 기각한 이유가 중요하다. workspace root 밖 파일은 예외가 아니라 **정상 경로**다. 의존성 소스가
module cache나 toolchain 경로에 있으면 server는 그 scope로 물어본다. 여기에 `null`을 주면 같은 세션 안에서
파일 위치에 따라 server 동작이 갈리고, 그 차이는 사용자가 예측할 수 없다. "이 세션의 설정은 하나다"가
우리가 실제로 가진 모델이므로 모든 scope에 같은 답을 준다.

(c)는 multi-root workspace가 생기는 M5 이전에는 채울 값이 없다.

`scopeUri` 값은 **어떤 출력에도 그대로 싣지 않는다.** 절대 경로이므로 D6의 경로 redaction 대상이다.

#### D3-3. 없는 section의 반환값 — `null`

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | `null` | **채택** |
| b | `{}` | 기각 |

근거 1 (spec): LSP 3.17 `workspace/configuration`은 "client가 주어진 scope의 설정을 제공할 수 없으면 반환
배열에 `null`이 있어야 한다"고 명시한다. `null`이 spec이 정한 "없음"의 표현이다.

근거 2 (의미): `{}`는 "설정이 있고, 그 내용이 비었다"는 **주장**이다. 자신의 기본값을 명시적 빈 설정으로
덮는 server가 있으면 `{}`는 기본값 파괴로 작동한다. `null`의 위험은 반대 방향인데(널 역참조), spec이
`null`을 요구하므로 server 쪽이 `null`을 처리하도록 되어 있는 것이 정상이다.

근거 3 (노출량): reference client 구현인 `vscode-languageclient`는 알 수 없는 section에 대해 값 없음을
그대로 배열에 넣고, JSON 직렬화에서 `null`이 된다. 즉 실제 server들이 지금까지 훨씬 많이 마주친 값이 `null`
쪽이다.

**section이 아예 없는 item은 예외다.** "전부 달라"는 요청이므로 유효 settings 트리의 root 객체를 그대로
준다. 트리가 비었으면 `{}`다. 두 규칙이 모순되지 않는 이유: `null`은 "그 설정을 우리가 가지고 있지 않다"는
뜻이고, 전체 트리는 비어 있더라도 우리가 **알고 있는 전부**다.

정리하면 응답 규칙은 다음 셋이다.

1. `items.length === result.length`이고 순서가 같다. 예외 없다.
2. `section` 없음 → 유효 settings 트리 root(비었으면 `{}`).
3. `section` 있음 → `.`로 분해해 중첩 walk. 도달하면 그 값(깊은 복사), 못 하면 `null`.

**검증 가능한 예측**: `cli/src/test/fixtures/configurationRequestServer.ts`는
`{ items: [{ section: 'impactLens' }] }`를 보낸다. 어떤 preset도 `impactLens` section을 정의하지 않으므로
이 계약을 구현한 client의 응답은 `[null]`이고, fixture의 `window/logMessage`는
`workspace/configuration answered with [null]`이 된다. 이것이 W1-A 통합 테스트의 기대값이다.

### D4. `settings` 전달 시점 — 요청 응답이 기본, push는 manifest가 명시할 때만

server마다 설정을 읽는 경로가 다르다. `initializationOptions`만 읽는 server, `didChangeConfiguration`만 읽는
server, `workspace/configuration`으로 물어보는 server가 모두 있다.

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | 항상 세 경로 모두로 보낸다 | 기각 |
| b | manifest가 전달 경로를 명시한다. 기본값은 `['on-request']` | **채택** |

(a)는 편하지만 bundled TypeScript 경로의 wire 동작을 바꾼다. 지금 CLI는 `didChangeConfiguration`을 한 번도
보내지 않는다. 무조건 push는 "기존 bundled provider의 동작과 응답은 바뀌지 않아야 한다"는 제약을 위반할
위험을 근거 없이 떠안는 것이다.

(b)의 안전 장치를 하나 더 둔다. **유효 settings 트리가 비어 있으면 어떤 push도 보내지 않는다.**
TypeScript reference preset은 `settings`를 갖지 않으므로 이 규칙만으로 bundled 경로의 송신 프레임이
그대로 유지된다.

**순서 제약 두 가지가 구현 계약이다.**

1. `didChangeConfiguration` push는 `initialized` notification **이후에** 보낸다.
2. **유효 settings 트리는 `initialize` request를 write 하기 전에 이미 해석이 끝나 있어야 한다.**
   server가 initialize 응답을 주기 **전에** 설정을 물어볼 수 있기 때문이다.
   `configurationRequestServer.ts`의 기본 phase(`before-initialize-response`)가 정확히 이 순서를 재현한다.
   settings를 게으르게 계산하면 그 지점에서 교착한다.

### D5. `settings`와 `initializationOptions`의 관계 — 서로 파생시키지 않는다

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | 하나의 트리에서 둘을 파생 | 기각 |
| b | 둘을 독립 필드로 두고 자동 복사를 하지 않는다 | **채택** |
| c | `initializationOptions` 미지정 시 `settings`를 대신 보낸다 | 기각 |

(a)를 기각하는 근거: 두 전송 경로의 **스키마가 다르다.** typescript-language-server의
`initializationOptions`는 `tsserver`, `preferences`, `plugins` 같은 자체 키를 갖고, workspace settings는
`typescript.*`/`javascript.*` 네임스페이스다. 같은 트리에서 기계적으로 파생시킬 대응 관계가 없다.

(c)를 기각하는 근거: 작성자가 건드리지 않은 필드가 wire 내용을 바꾼다. 나중에 어떤 preset에 `settings`를
추가하는 순간 그 preset의 initialize 프레임이 조용히 달라진다.

**"겹칠 때의 우선순위" 질문에 대한 답**: 두 필드는 우선순위 관계가 아니다. 서로 다른 전송 경로이고,
같은 논리적 설정을 두 경로에서 읽는 server가 있다면 **양쪽에 모두 적는 것이 manifest 작성자의 책임**이다.
런타임에 둘을 화해시키지 않는다. 자동 일관성 검사도 넣지 않는다. 두 스키마 간 경로 대응을 모르는 상태에서
"같은 설정"을 판정할 방법이 없고, 없는 지식을 가정한 검사는 오탐만 만든다. 대신 doctor의 transcript가
두 트리를 모두 보여줘서 작성자가 눈으로 대조할 수 있게 한다.

**우선순위가 실제로 존재하는 축은 tier다.** 아래 D9에서 정의한다.

### D6. secret redaction — 선언은 preset이, 강제는 세션 redaction 표가

**어디로 샐 수 있는가**를 먼저 고정한다.

| 경로 | 위험 | 현재 방어 |
| --- | --- | --- |
| stdout | envelope에 설정값을 싣는 코드 경로 | 없음(오늘은 실을 코드 자체가 없음) |
| stderr — CLI 자신의 오류 `details` | 검증 실패 메시지가 값을 인용 | 없음 |
| stderr — server가 되돌려 뱉는 로그 | server가 받은 설정을 자기 로그에 출력 | `redactProviderText`의 패턴 매칭뿐 |

세 번째가 핵심이다. `cli/src/runtime.ts:bundledProviderLogArgs`는 환경변수로 server의 로그 레벨을 **올릴 수
있게** 되어 있고, 로그 레벨이 높은 server는 자기가 받은 초기화 옵션을 그대로 출력한다. 이때 값은 우리가 만든
문자열이 아니라 server가 재구성한 문자열이므로 `token=...` 같은 패턴을 벗어날 수 있다.

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | 키 이름 휴리스틱만 (`token`/`secret`/`password`/`api_key` 류) | 백스톱으로만 유지 |
| b | preset이 민감 경로를 명시 (`sensitive.settings: string[]`) | **채택** |
| c | 값에 인라인 태그 (`{ "$secret": true, "value": ... }`) | 기각 |

(c)를 기각하는 이유: 태그가 값과 함께 있으려면 **값이 manifest 안에 있어야 한다.** 그런데 credential은
catalog manifest에 들어가면 안 되는 값이고, 실제로는 사용자 override로 들어온다. 태그는 값이 아니라
**슬롯**에 붙어야 하고, 슬롯을 아는 것은 preset이다.

(a)를 단독으로 쓰지 않는 이유: `licenseServer.credential`처럼 이름 규칙을 벗어난 키를 놓친다. 다만 preset
작성자가 선언을 빠뜨린 경우를 위해 **항상 켜져 있는 백스톱으로는 유지**한다. 둘은 배타가 아니다.

**강제 지점은 하나다.** 유효 설정 트리에서 (b)의 선언 경로 + (a)의 휴리스틱에 걸린 **문자열 값들을 모아
세션 redaction 표**를 만들고, `cli/src/jsonRpc.ts:redactProviderText`가 그 표의 리터럴을 치환하도록 확장한다.
이 함수는 이미 `finalizeProcessFailure`의 stderr와 providerLog가 모두 통과하는 유일한 통로다.
**값 기반 치환이 패턴 기반 치환이 잡을 수 없는 echo-back을 잡는 유일한 방법**이다.

세부 규칙:

- 표에는 문자열만 넣는다. 숫자·boolean은 값 자체로는 식별력이 없고, 표에 넣으면 `1`이나 `true` 같은
  값이 로그 전체를 파괴한다.
- 길이 4 미만 문자열은 넣지 않는다. 같은 이유다.
- 오류 `details`에는 **설정 값을 절대 넣지 않고 키 경로만 넣는다.** 경로 자체는 비밀이 아니다.
- 절대 경로는 기존 `redactProviderText`의 homedir → `~` 치환을 그대로 받는다. `scopeUri`도 여기 해당한다.
- stdout은 "구조적으로 불가능"을 유지한다. envelope 직렬화 경로에 설정 트리를 전달하는 인자를 만들지 않는다.

**Wave 1 gate 검증 방법**: sentinel 문자열(예: `IL-SENTINEL-<random>`)을 민감 경로에 넣고 분석을 실행한 뒤,
stdout 전체와 stderr 전체에서 그 문자열을 grep 해 0건임을 확인한다. 로그 레벨을 올린 상태에서도 반복한다.

### D7. readiness — manifest가 신호를 선언하고, 선언이 없으면 `unknown`을 유지한다

지금 `collectDiagnostics`의 고정 100ms는 "느린 server의 진단이 통째로 누락"되는 원인이지만, 그 수치를
manifest 필드로 올리는 것은 **문제를 옮기기만 한다.** 고정 대기의 결함은 값이 작다는 것이 아니라
**끝났다는 신호가 아니라 시간을 기준으로 판단한다**는 것이다.

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | manifest에 대기 시간(ms) 하나만 둔다 | 기각 |
| b | `$/progress` 종료를 범용 readiness 신호로 쓴다 | 단독 기각, 신호 종류로는 채택 |
| c | 첫 질의 결과가 빌 때 재시도하며 수렴을 본다 | 단독 기각 |
| d | **신호 목록 + budget + budget 초과 시 행동**을 manifest가 선언한다 | **채택** |

(a) 기각: 위와 같다. budget은 **상한**으로만 존재해야 하고 판정 기준이 되면 안 된다.

(b) 단독 기각: `$/progress`의 종료는 "그 token이 나타내는 작업이 끝났다"는 뜻일 뿐이고, 그것이 indexing
전체인지 파일 하나의 분석인지는 token을 만든 server만 안다. 이것을 범용 readiness로 승격하면
"`$/progress`나 capability 선언을 indexing 완료로 과해석하지 않는다"는 원칙을 정면으로 위반한다.
그래서 progress는 **manifest가 "이 preset에서는 이 progress가 readiness를 뜻한다"고 선언할 때만**
readiness 신호가 된다.

(c) 단독 기각: 빈 결과를 재시도해서 계속 비면 그것이 "준비 안 됨"인지 "정말 caller가 없음"인지 구분이
안 된다. 이것이 truth table S2/S3와 S8이 분리된 이유 자체다. 재시도는 확신을 **올릴** 수는 있어도
`ready`를 **증명**하지 못한다. 따라서 재시도는 M1 manifest 어휘에 넣지 않는다.

(d)의 형태:

```
readiness: {
  requiredProjectFiles?: string[]   // 존재 여부만 읽는다. 생성·build·configure·sync 금지
  signals: ReadinessSignal[]        // 각 신호가 'ready'를 뜻하는지 'working'을 뜻하는지 명시
  budgetMs: number
  onBudgetExceeded: 'proceed-partial' | 'fail'
}
```

신호 종류는 셋으로 닫는다.

| kind | 관측 대상 | 비고 |
| --- | --- | --- |
| `work-done-progress` | `window/workDoneProgress/create`로 만든 token의 `$/progress` begin/end | `titlePattern`으로 token 구분 |
| `notification` | server 고유 notification (`method` + 선택적 `match`) | server별 확장이 여기로 격리된다 |
| `capability-registered` | `client/registerCapability`의 특정 method | capability 등장이지 index 완료가 아니다 |

`match`는 `{ path: string[], equals: JsonScalar }` 하나로 제한한다. 표현식 언어가 아니다. 경로 하나와 값
하나로 표현되지 않는 조건이 필요한 server가 나오면 그때 근거와 함께 확장한다.

#### D7-1. `coverage.indexing.status` 대응

| 상황 | `indexingStatus` | 후속 |
| --- | --- | --- |
| `readiness` 미선언 (M1의 TypeScript preset 포함) | `unknown` | 오늘과 동일. caller 0건이면 reason에 `index_state_unknown` (truth table S3) |
| `means: 'ready'` 신호 관측 | `ready` + evidence | evidence 없이는 `ready`를 만들 수 없다 (X3) |
| `means: 'working'` 신호 관측 후 budget 안에 ready 없음, `onBudgetExceeded: 'proceed-partial'` | `working` | `requestStatus: partial`, reason `provider_not_ready` (S7/S8) |
| budget 초과, `onBudgetExceeded: 'fail'`, 질의 미수행 | `working` | `ok: false`, `provider_not_ready`, stage `indexing` (F14) |
| `requiredProjectFiles` 부재 | `unknown` | `ok: false`, `provider_project_metadata_missing`, stage `indexing` (F15) |

**W1-C 제약과의 정합**: Wave 1에서 실제로 생산되는 값은 `unknown` 하나다. 위 표의 나머지 행은 Wave 2
(W2-A)에서 채워진다. 이 문서가 여는 것은 **경로**이지 값이 아니다. 그래서 M1 TypeScript reference preset은
`readiness`를 아예 갖지 않고, 그 결과 bundled 경로의 `indexing.status`는 오늘과 같은 `unknown`으로 남는다.

#### D7-2. 필요한 error code가 이미 있는가

`provider-coverage-contract.md`에 W0-1이 추가한 신규 code 11종을 대조했다.

| 필요 상황 | code | 계약에 있는가 |
| --- | --- | --- |
| readiness budget 내 미준비 | `provider_not_ready` | **있다** |
| build metadata 부재 | `provider_project_metadata_missing` | **있다** |
| 미지원 server request로 세션이 진행 불가 | `provider_protocol_incompatible` (`details.method` 포함) | **있다** |
| capability probe가 결론 못 냄 | `provider_capability_probe_failed` | **있다** |
| timeout 후 취소 | `timeout` / `request_cancelled` | **있다** |

**readiness와 프로토콜 계약에 필요한 code는 전부 이미 계약에 있다. 새 code 요청은 없다.**
단, 설정 검증 실패에 쓸 code는 없다. lead가 **신규 code `provider_config_invalid` 추가**로 결정했다(L1).
추가 자체는 `il-contract-architect`가 `provider-coverage-contract.md`와 `cli/src/errors.ts`에 넣는다.

### D8. 설정 값의 크기·형태 제한 (IL-LIM-005 미해결 질문에 대한 제안)

story의 미해결 질문 "범용 JSON 설정의 최대 byte/depth와 허용 scalar type"에 대한 답이다.
**아래 수치는 제안 그대로 lead 승인됐다(L5).**

| 항목 | 제안값 | 근거 |
| --- | --- | --- |
| 허용 타입 | `string`, `number`, `boolean`, `null`, 배열, 평범한 객체 | 배열은 실제로 필요하다(`plugins`, `watchers` 같은 목록형 설정) |
| 최대 depth | 16 | 알려진 실제 server 설정에서 6단계를 넘는 예를 찾지 못했다. 재귀 순회의 상한을 명시적으로 두기 위한 값 |
| 트리당 직렬화 크기 | 64 KiB | 알려진 실제 설정은 수 KiB 규모다. 여유를 크게 두되 initialize 프레임이 비정상적으로 커지는 것을 막는다 |
| 총 키 개수 | 1000 | depth·byte만으로는 넓고 얕은 폭발을 막지 못한다 |
| 금지 키 | `__proto__`, `constructor`, `prototype` (모든 depth) | prototype pollution. story의 명시 요구사항 |
| 금지 값 | `NaN`, `Infinity` | JSON 왕복에서 보존되지 않는다 |

수치를 이 정도로 **좁게** 잡은 근거는 비대칭성이다. 스키마 제한은 나중에 **완화**하는 것이 호환 변경이고
**강화**가 파괴적 변경이다. 그래서 처음에는 좁은 쪽이 안전하며, 위 값은 알려진 정상 preset을 막을 만큼
좁지 않다.

`null`의 의미는 **"값이 `null`이다"**이며, 상위 tier가 하위 tier의 키를 **삭제하는 수단은 M1에 없다.**
삭제 sentinel(`"$unset"` 등)을 만들면 어휘가 하나 더 늘고, 지금 그것을 필요로 하는 preset이 없다.
알려진 제한으로 기록한다.

### D9. 병합 우선순위

**선택 우선순위**(어느 provider를 쓸 것인가)는 IL-LIM-004가 이미 고정했다:
`raw custom > explicit preset > trusted project > verified auto > unsupported`.

**값 병합 우선순위**(고른 preset의 설정을 어떻게 덮을 것인가)는 별개이며 다음으로 제안한다.

```
preset catalog 기본값  <  project 설정 파일 override  <  요청(one-shot) override
```

뒤가 이긴다. 병합 규칙:

| 값 종류 | 규칙 | 이유 |
| --- | --- | --- |
| 객체 | 키 단위 deep merge | 하나의 키를 바꾸려고 트리 전체를 다시 쓰게 하면 preset 갱신이 override에 반영되지 않는다 |
| 배열 | **통째로 교체** | LSP 설정의 배열은 대개 전체 목록이 하나의 값이다. 원소 단위 병합에는 합의된 의미가 없다 |
| scalar | 교체 | |

override에는 `$ref`를 쓸 수 없다(D1). override는 평문 JSON만이다.

**요청 수준 override의 필드 이름은 lead 결정으로 지금 고정됐다(L6).** 스키마 추가는 나중이지만 이름을
지금 못박아서 W1-A와 W1-B가 서로 다른 이름을 가정하는 것을 막는다.

| 요청 최상위 필드 | 값 |
| --- | --- |
| `providerPreset` | preset id 문자열 |
| `initializationOptions` | 평문 JSON 객체 |
| `settings` | 평문 JSON 객체 |

W1-A와 W1-B는 이 이름에 맞춰 배관을 만들되 **스키마에 필드가 아직 없다는 전제로** 작업한다.
`cli/schemas/request.schema.json` 추가는 W1-C merge 직후 별도 contract lane이 하며, **Wave 1 종료 gate를
닫기 전에** 처리한다.

### D10. server→client 응답 전송 계약

manifest로 설정할 수 없는, 프로토콜 계층이 고정으로 소유하는 표다. 처리하지 못한 request를 조용히 버리지
않는다는 원칙의 구체형이다.

| server request | client 응답 | 근거 |
| --- | --- | --- |
| `workspace/configuration` | D3의 규칙으로 만든 배열 | |
| `workspace/workspaceFolders` | 단일 folder 배열 | 이미 `workspaceFolders: true`를 선언 중 |
| `client/registerCapability` | `null` | 등록을 기록하고 Wave 2에서 observed capability에 병합 |
| `client/unregisterCapability` | `null` | 위와 동일 |
| `window/workDoneProgress/create` | `null` | token 등록. **완료 신호로 해석하지 않는다** |
| `window/showMessageRequest` | `null` | 물어볼 사용자가 없다. spec상 `null`은 "선택 없이 닫힘" |
| `window/showDocument` | `{ "success": false }` | 문서를 띄울 host가 없다. 거짓 성공을 반환하지 않는다 |
| `workspace/applyEdit` | `{ "applied": false }` | **CLI는 workspace를 변경하지 않는다.** 무단 변경 금지 원칙의 프로토콜 표현 |
| `workspace/*/refresh` (semanticTokens, codeLens, inlayHint, diagnostic) | `null` | 새로 고칠 UI가 없다 |
| 그 외 전부 | JSON-RPC error `-32601` MethodNotFound + method 이름 기록 | 침묵하지 않는다 |

**MethodNotFound와 `provider_protocol_incompatible`의 관계**를 정한다.

| # | 안 | 채택 |
| --- | --- | --- |
| a | 모르는 request가 오면 즉시 `provider_protocol_incompatible`로 실패 | 기각 |
| b | MethodNotFound로 답하고 기록만 하며, 절대 실패시키지 않는다 | 기각 |
| c | MethodNotFound로 답하고 기록하되, **이후 같은 stage가 실패하면 그 실패의 code를 `provider_protocol_incompatible`로 승격**하고 `details.method`에 첫 미처리 method를 싣는다 | **채택** |

(a)를 기각: 선택적 server request는 무시해도 분석이 정상 완료된다. 이것으로 분석을 죽이면
지금보다 견고성이 낮아진다.

(b)를 기각: "프로토콜 위반을 타임아웃으로 위장하지 않는다"는 원칙을 못 지킨다. 지금 결함의 관측 형태가
정확히 그것이다 — `configurationRequestServer`에 붙이면 `provider_initialize_failed` +
`bytesFromServer: 131` + stderr의 "no client answer ... within 1500ms"가 나온다. 실제 원인은 타임아웃이
아니라 우리가 답을 안 한 것이다.

(c)는 원인이 실제로 결과에 영향을 준 경우에만 code를 바꾸므로 두 실패를 다 피한다. 이 승격은 truth table
F11(stage `initialize`, code `provider_protocol_incompatible`)과 그대로 일치한다.

성공한 분석에서 미처리 request가 있었던 경우의 노출은 **doctor JSON과 debug transcript로만 한다**(L3 결정).
근거는 이 절의 (c) 자체다. 미지원 method에 MethodNotFound로 **답을 하므로** server가 침묵 속에 매달리지
않고, 그 뒤 server가 실패하면 provider error로 드러난다. 즉 이 사건이 "조용한 불완전"으로 빠지는 경로가
(c) 아래에서는 닫혀 있다.

**조건부다.** (c)의 code 승격이 실제로 모든 경우를 덮는지는 W1-A 구현으로 확인돼야 한다. 덮지 못하는
경우가 **하나라도 관측되면** 성공 envelope에 reason code(`unhandled_server_request`)를 추가하는 쪽으로
뒤집는다. 그때는 reason code 추가라 `il-contract-architect` lane과 truth table 갱신이 필요하다.

### D11. client capability 선언은 코드가 소유한다

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | manifest가 client capability를 넓힐 수 있다 | 기각 |
| b | 코드가 고정 선언하고 manifest는 손대지 못한다 | **채택(단서 있음)** |

(a) 기각 근거: capability 선언은 "우리가 실제로 할 수 있는 것"의 약속이다. manifest가 코드에 없는 기능을
선언하면 server가 그것에 의존하고 우리는 프로토콜 위반을 만든다. 선언은 구현과 같은 파일에서 움직여야 한다.

Wave 1에서 추가할 선언은 다음과 같다.

| capability | Wave 1 | 이유 |
| --- | --- | --- |
| `workspace.configuration: true` | **추가** | 선언하지 않으면 spec을 지키는 server는 `workspace/configuration`을 보내지 않는다. 응답 구현이 죽은 코드가 된다 |
| `window.workDoneProgress: true` | **추가** | `window/workDoneProgress/create`를 받을 수 있음을 알린다 |
| `workspace.didChangeConfiguration.dynamicRegistration` | 추가하지 않음 | 동적 등록 병합은 Wave 2다 |
| `textDocument.callHierarchy.dynamicRegistration` | **false 유지** | 지금 true로 바꾸면 server가 정적 광고 대신 동적 등록을 택할 수 있고, `doInitialize`의 `callHierarchyProvider` 검사가 `provider_capability_missing`으로 오탐한다. static/dynamic 병합(Wave 2 W2-A)이 끝난 뒤에 켠다 |

**이 결정에는 실증이 필요한 위험이 하나 있다.** `workspace.configuration: true`를 선언하면
typescript-language-server가 지금은 하지 않는 `workspace/configuration` 요청을 시작할 수 있다. 우리는
`[null]`을 답하고 server는 기본값을 쓰므로 결과는 같아야 하지만, **같아야 한다는 것은 가정이지 사실이
아니다.** W1-A는 이 변경 전후로 W0-3이 쓴 응답 캡처 바이트 비교를 실행해야 하며, workspace 경로를
고정해서 캡처의 비결정성(symbolId 해싱, note conflict token)을 제거해야 한다.

**L2는 이 문서에서 유일하게 열려 있는 항목이고, 규칙만 확정됐다.** "bundled 동작 무변경" 제약은 지금
그대로 유지한다. W1-A가 캡처 차이를 실제로 관측하면 **기대값을 임의로 갱신하지 말고 차이의 정확한 내용을
보고**해야 하며, 대응은 그 관측 뒤에 결정한다. 관측 전에 정하는 것은 추측이다.

### D12. server request id 네임스페이스

fixture가 server id를 1000부터 매기는 것은 **테스트 편의이지 계약이 아니다.**
`cli/src/test/fixtures/mockServer.ts:SERVER_REQUEST_ID_BASE`의 주석이 그 의도를 적어두었다: 1부터 매기면
지금의 client가 자기 pending `initialize`를 잘못 resolve해서, 테스트가 진짜 결함이 아니라 id 충돌을
재현하게 된다. **적합한 client는 server가 1부터 시작해도 정상 동작해야 한다.**

**선택지**

| # | 안 | 채택 |
| --- | --- | --- |
| a | client 자신의 id를 큰 수(예: 100000)부터 매겨 server와 안 겹치게 한다 | 기각 |
| b | client id를 문자열(`"il-1"`)로 바꾼다 | 기각 |
| c | **모양(shape)으로 방향을 판정하고, 두 개의 분리된 표를 쓴다** | **채택** |

(a)를 기각하는 이유가 이 결정의 핵심이다. **id 충돌은 애초에 존재하지 않는 문제이고, 지금 것은 디스패치
버그다.** JSON-RPC에서 id는 요청을 보낸 쪽이 자기 공간에서 매기고, 응답의 id는 그 요청과만 대응한다.
양방향 연결에서 두 방향의 id 공간은 원래 독립이다. 큰 수로 피하는 것은 겹쳐도 되는 것을 안 겹치게 만들어
**증상만 가리는 것**이고, server가 어떤 번호를 쓸지 우리가 통제할 수 없으므로 보장도 되지 않는다.

(b)를 기각: LSP의 request id는 `integer | string`이라 허용되긴 하지만, 로그 가독성 하나를 얻자고 bundled
경로의 wire 표현을 바꾼다. 얻는 것이 correctness가 아니다.

(c)의 규칙:

| 수신 메시지 | 판정 | 처리 |
| --- | --- | --- |
| `method` 있음 + `id` 있음 | **server → client request** | 핸들러 실행 후 같은 id로 응답 |
| `method` 있음 + `id` 없음 | server notification | 기존 notification 핸들러 |
| `method` 없음 + `id` 있음 | client request에 대한 response | **client가 발급한 id 표**에서만 조회 |
| 그 외 | 프로토콜 위반 | 기록 |

**`method` 검사가 `id` 검사보다 먼저 온다.** 이 한 줄이 결함의 실제 수정이다.

부속 규칙 셋:

1. 표를 둘로 나눈다. `pendingOutbound`(우리가 발급한 numeric id)와 `inflightInbound`(server가 발급한 id).
   서로 조회하지 않는다.
2. **server의 id는 타입까지 그대로 되돌려준다.** 지금 `JsonRpcResponse.id`가 `number`로 선언돼 있지만
   spec은 문자열을 허용한다. 숫자로 강제 변환하면 문자열 id를 쓰는 server의 응답을 잃는다.
3. 알 수 없는 id의 response는 조용히 버리지 않고 카운트해서 `details`에 남긴다. `$/cancelRequest` 이후
   늦게 도착하는 응답(spec상 server는 취소된 요청에도 응답한다)이 여기로 들어오므로, 이 값이 0이 아닌 것은
   정상일 수 있다. 판단 재료로 남기는 것이지 실패 조건이 아니다.

**W1-A가 필요로 하는 fixture**: `mockServer.ts`에 server id 시작값을 환경변수로 바꾸는 옵션을 추가하고
(`IMPACT_LENS_MOCK_SERVER_ID_BASE=1`), id 1로 request를 보내는 시나리오에서 client의 `initialize`가
잘못 resolve되지 않음을 검증한다. `cli/src/test/fixtures/**`는 `il-test-release` 소유이므로 이 fixture
변경은 W1-A가 임의로 하지 않고 lead를 경유한다.

### D13. `$/cancelRequest`

manifest와 무관하지만 응답 전송 계약과 같은 파일에서 움직이므로 함께 적는다.

`cli/src/jsonRpc.ts:JsonRpcClient.request`의 timeout 콜백은 pending에서 지우고 reject만 한다. server는
그 요청을 계속 계산한다. 계약:

1. timeout 시 `$/cancelRequest` notification(`params: { id }`)을 먼저 보낸다.
2. pending 항목을 **즉시 지우지 않고** 취소 상태로 표시한 뒤 짧은 grace 후 정리한다. 그래야 뒤늦은 응답이
   D12-3의 "알 수 없는 id"로 잘못 집계되지 않는다.
3. dispose는 bounded로 유지한다. orphan process를 남기지 않는다.

## lead 결정

2026-08-27 lead 결정이다. "파급" 열은 결정의 근거이므로 그대로 남겼다.
**7건 중 6건이 확정됐고 미결은 L2 하나뿐이다.**

| # | 항목 | 선택지 | 파급(결정 근거) | **결정** |
| --- | --- | --- | --- | --- |
| L1 | project 설정 파일의 provider 설정이 스키마 검증에 실패했을 때의 error code | (a) 기존 `invalid_request` 재사용 (b) 신규 code(`provider_config_invalid` 등) | (a)는 code 추가가 없지만 "요청은 멀쩡한데 요청이 잘못됐다"고 보고하게 된다. (b)는 `provider-coverage-contract.md`와 `cli/src/errors.ts` 변경이므로 `il-contract-architect` lane이 필요하다. 승인된 신규 11종에 이 상황을 덮는 code가 **없다**는 것은 확인했다 | **(b) 신규 code `provider_config_invalid`.** `invalid_request` 재사용은 사용자가 고쳐야 할 파일을 잘못 지목한다. 상태를 정확히 보고하는 것이 이 도구의 존재 이유인데 진단 자체가 틀린 곳을 가리켜서는 안 된다. 추가는 W1-C |
| L2 | D11의 `workspace.configuration: true` 선언이 bundled TypeScript 캡처를 바꾸는 경우의 대응 | (a) 캡처 기대값을 갱신하고 진행 (b) manifest에 client capability opt-out 필드를 추가해 TS preset만 끈다 | (a)는 "bundled 동작 무변경" 제약을 명시적으로 완화하는 결정이라 lead 승인이 필요하다. (b)는 D11에서 기각한 "manifest가 capability를 건드린다"를 좁은 형태로 다시 여는 것이므로, 실제 차이가 관측된 뒤에만 검토할 가치가 있다 | **미결. 이 문서에서 유일하다.** 캡처가 실제로 바뀌는지 아직 아무도 관측하지 않았고 관측 전 결정은 추측이다. 그때까지 "bundled 동작 무변경" 제약을 그대로 유지하고, 차이가 나오면 W1-A는 기대값을 갱신하지 말고 차이의 정확한 내용을 보고한다 |
| L3 | 성공 envelope이 미처리 server request를 machine-readable로 알려야 하는가 | (a) doctor JSON + debug transcript만 (b) 신규 reason code(`unhandled_server_request`) 추가 | (b)는 reason code 추가라 `il-contract-architect` lane과 truth table 갱신이 필요하다. (a)는 Plugin이 이 사실을 볼 수 없다 | **(a) doctor JSON + debug transcript만.** D10이 MethodNotFound로 답하므로 이 사건이 "조용한 불완전"으로 빠지는 경로가 닫혀 있다. **조건부**: D10의 code 승격이 덮지 못하는 경우가 하나라도 관측되면 (b)로 뒤집는다 |
| L4 | `coverage.indexing`의 `evidence` 필드 형태 | 이 문서의 제안: `{ signal, detail, observedAtMs }` | truth table 3절 X3이 "`ready`는 evidence 동반 필수"를 이미 고정했고 형태는 `IL-LIM-005` 3단계로 미뤘다. 필드가 사는 파일(`cli/src/types.ts`, `cli/schemas/**`)은 `il-contract-architect` 소유이므로 W1-A가 직접 추가하지 않는다. Wave 2 착수 전에 확정이 필요하다 | **`{ signal, detail }` 승인. `observedAtMs`는 제외.** 이 저장소의 리팩터링 검증은 전부 응답 바이트 비교에 의존한다(W0-2 16건, W0-3 16건, W0-4 29건). 응답에 벽시계 시각이 들어가면 그 수단이 통째로 무력화된다 — `mkdtemp` 함정과 같은 종류의 비결정성이고 이건 우리가 스스로 만드는 쪽이다. 시간이 정말 필요하면 **요청 시작 기준 경과 시간**으로 다시 제안한다. 절대 시각은 안 된다 |
| L5 | D8의 제한 수치(depth 16 / 64 KiB / 1000키) | 제안값 확인 또는 조정 | 값이 너무 크면 초기화 프레임이 커지고, 너무 작으면 정상 preset이 막힌다. 스키마에 들어가면 완화만 가능하고 강화는 v2 변경이 된다 | **제안값 그대로 승인.** 완화가 호환 변경이고 강화가 파괴적 변경이라는 비대칭 때문에 처음에는 좁은 쪽이 안전하며, 제안값은 정상 preset을 막을 만큼 좁지 않다 |
| L6 | 요청·스키마 변경(`providerPreset`, 요청 수준 `initializationOptions`/`settings`)을 어느 lane이 어느 wave에 넣는가 | (a) W1-C가 Wave 1에 함께 (b) Wave 2로 미룸 | `cli/schemas/request.schema.json`은 `il-contract-architect` 소유다. W1-A와 W1-B 모두 이 필드가 없으면 override 경로를 end-to-end로 검증할 수 없다. 순서를 정하지 않으면 두 lane이 각자 "곧 생길 필드"를 가정하게 된다 | **(b) Wave 1 후속 lane. 단 필드 이름은 지금 고정한다.** W1-C에 요청 스키마까지 얹으면 한 PR이 응답 계약과 요청 계약을 동시에 바꿔 무변경 증명의 기준선이 흐려진다. 이름(`providerPreset`/`initializationOptions`/`settings`)을 D9에 못박아 "곧 생길 필드" 가정 문제를 대신 해소했다. 스키마 추가는 W1-C merge 직후, Wave 1 종료 gate 이전 |
| L7 | handover 6절 미결 4번(`provider_ipc_unavailable`의 stage) | (a) 계약 문서를 코드에 맞춘다 (b) 코드를 문서에 맞춘다 | 아래 절에 조사 결과와 권고를 적었다. 계약 문서 수정은 `il-contract-architect` lane이다 | **(a) 문서를 코드에 맞춘다. W1-A 권고 채택.** 결정적 근거는 두 번째다 — 관측 불가능한 값을 계약에 적으면 그 값은 추측이 되고, 이 저장소가 없애려는 것이 정확히 그런 거짓 확신이다. 수정은 W1-C. **이것으로 handover 6절 미결 4번이 닫힌다** |

## handover 미결 4번에 대한 조사 결과

`provider-coverage-contract.md`는 `provider_ipc_unavailable`의 stage를 `launch`로 적었다. 코드는 다르다.
`cli/src/childIpc.ts:childIpcUnavailableError`가 원래 오류의 `details`를 그대로 펼치므로 `details.stage`는
원래 값(`launch` | `initialize` | `query`)을 유지하고,
`cli/src/childIpc.ts:looksLikeSilentProviderFailure`가 세 code를 모두 받아들인다.

문서와 코드 중 어느 쪽이 틀렸는지는 stage의 의미가 "IPC가 죽은 시점"인지 "우리가 알아챈 시점"인지에 달렸다.
**W1-A의 권고는 (a), 즉 문서를 코드에 맞추는 쪽이다.** 근거:

- `details.stage`는 다른 모든 code에서 "마지막으로 도달한 lifecycle 단계"로 쓰인다(truth table 1.1절의
  보조 축 정의). 한 code에서만 의미를 "원인의 시점"으로 바꾸면 축의 정의가 code마다 달라진다.
- stdio가 전달되지 않는 환경에서 "IPC가 죽은 시점"은 관측 불가능하다. child는 정상적으로 spawn 되고
  실패는 언제나 그 다음 상호작용에서 드러난다. 관측할 수 없는 값을 계약에 적으면 그 값은 추측이 된다.
- `initialize`에서 알아챈 것과 `query`에서 알아챈 것은 사용자에게 실제로 다른 정보다. `launch`로 뭉개면
  "server가 한 번 답한 뒤 stdio가 끊겼다"는 사례를 표현할 수 없다.

따라서 계약 표를 `launch` 고정에서 `details.stage ∈ {launch, initialize, query}`로 고치고, code의 의미를
"stage와 무관하게, 환경이 stdio를 전달하지 않았다"로 적는다.

**lead가 이 권고를 채택했다(L7).** 두 번째 근거가 결정적이었다. 문서 수정은
`provider-coverage-contract.md`를 잡고 있는 `il-contract-architect`가 수행하며, 이 문서에는 결정과 근거만
남긴다. **이것으로 handover 6절 미결 4번이 닫힌다.**

## `ProviderPreset` 타입 스케치

W1-B가 그대로 옮겨 적을 수 있는 형태다. 파일 위치는 `cli/src/providers/preset.ts`를 상정한다(W1-B 소유).
`ProviderSelectedBy`는 `cli/src/types.ts`의 기존 정의를, `ResolvedProvider`는 W0-4가 만든
`cli/src/providers/resolve.ts`의 정의를 그대로 재사용한다.

```ts
// ---------- JSON 값 ----------

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

// ---------- manifest 안에서만 존재하는, 아직 해석되지 않은 값 (D1) ----------

export type ManifestValue =
  | JsonScalar
  | ManifestRef
  | readonly ManifestValue[]
  | { readonly [key: string]: ManifestValue };

export type ManifestObject = { readonly [key: string]: ManifestValue };

/**
 * M1이 실제로 해석하는 ref는 이 둘뿐이다. 쓰이지 않는 값을 미리 넣지 않는다.
 * 추가는 그 값을 실제로 소비하는 preset과 같은 변경에서 한다.
 */
export const MANIFEST_REF_SOURCES = ['nodeExecutable', 'bundledModuleEntry'] as const;
export type ManifestRefSource = (typeof MANIFEST_REF_SOURCES)[number];

export interface ManifestRef {
  readonly $ref: ManifestRefSource;
  /** `bundledModuleEntry` 전용·필수. CLI package 의존성 안의 specifier만 허용한다. */
  readonly module?: string;
}

/** 두 ref 모두 catalog manifest에서만 허용하고 사용자 override에서는 거부한다. */
export const CATALOG_ONLY_REF_SOURCES: readonly ManifestRefSource[] = ['nodeExecutable', 'bundledModuleEntry'];

// ---------- 설정 전달 (D4) ----------

export const SETTINGS_DELIVERIES = ['on-request', 'did-change-configuration'] as const;
export type SettingsDelivery = (typeof SETTINGS_DELIVERIES)[number];

// ---------- readiness (D7) ----------

export const READINESS_SIGNAL_KINDS = ['work-done-progress', 'notification', 'capability-registered'] as const;
export type ReadinessSignalKind = (typeof READINESS_SIGNAL_KINDS)[number];

/** 이 신호가 준비 완료를 뜻하는지, 진행 중을 뜻하는지. `ready`만 evidence를 만든다. */
export type ReadinessMeaning = 'ready' | 'working';

export interface ReadinessMatch {
  readonly path: readonly string[];
  readonly equals: JsonScalar;
}

export type ReadinessSignal =
  | {
      readonly kind: 'work-done-progress';
      readonly means: ReadinessMeaning;
      /** WorkDoneProgressBegin.title에 대한 부분 일치. 없으면 모든 token이 대상이다. */
      readonly titlePattern?: string;
    }
  | {
      readonly kind: 'notification';
      readonly means: ReadinessMeaning;
      readonly method: string;
      readonly match?: ReadinessMatch;
    }
  | {
      readonly kind: 'capability-registered';
      readonly means: ReadinessMeaning;
      readonly method: string;
    };

export interface ProviderReadinessProfile {
  /**
   * 존재 여부만 읽는다. 생성·build·configure·sync는 하지 않는다.
   * workspace 상대 경로만 허용한다.
   */
  readonly requiredProjectFiles?: readonly string[];
  readonly signals: readonly ReadinessSignal[];
  /** 상한이지 판정 기준이 아니다. */
  readonly budgetMs: number;
  readonly onBudgetExceeded: 'proceed-partial' | 'fail';
}

// ---------- version probe (W1-B 소유. 형태만 자리를 잡아둔다) ----------

export interface ProviderVersionProbe {
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  /** 지원 범위. 벗어나면 `provider_version_unsupported`, 해석 실패는 `provider_version_unreadable`. */
  readonly supported: string;
}

// ---------- 실행 파일 (D1) ----------

export interface ProviderCommandTemplate {
  /** 앞에서부터 시도한다. 문자열은 PATH 탐색 대상, ManifestRef는 절대 경로로 해석된다. */
  readonly candidates: readonly (string | ManifestRef)[];
  readonly args: readonly ManifestValue[];
  /** 'detected'는 파일 확장자에서 판별한 값을 쓴다. 그 외 문자열이면 그 값으로 고정한다. */
  readonly languageIdFrom: 'detected' | (string & {});
}

// ---------- preset ----------

export const PROVIDER_TIERS = ['bundled', 'verified-external', 'custom', 'unsupported'] as const;
export type ProviderTier = (typeof PROVIDER_TIERS)[number];

export interface ProviderPreset {
  /** catalog 안에서 유일한 안정 식별자. 요청의 `providerPreset`이 이 값을 참조한다. */
  readonly id: string;
  readonly displayName: string;
  readonly tier: ProviderTier;

  /** 이 preset이 처리할 수 있는 languageId와 확장자. */
  readonly languageIds: readonly string[];
  readonly extensions: readonly string[];

  readonly command: ProviderCommandTemplate;
  readonly version?: ProviderVersionProbe;

  /** initialize에 실리는 값. 없으면 `{}`. (D1, D5) */
  readonly initializationOptions?: ManifestObject;

  /** workspace/configuration과 didChangeConfiguration에 쓰이는 트리. 없으면 빈 트리. (D3, D5) */
  readonly settings?: ManifestObject;

  /** 기본 ['on-request']. 유효 settings 트리가 비면 어떤 push도 보내지 않는다. (D4) */
  readonly settingsDelivery?: readonly SettingsDelivery[];

  /**
   * 민감 값이 놓이는 슬롯. 각 트리 루트 기준 dot 경로다. (D6)
   * 여기 선언된 경로의 문자열 값은 세션 redaction 표에 들어간다.
   * 키 이름 휴리스틱은 이 선언과 무관하게 항상 함께 동작한다.
   */
  readonly sensitive?: {
    readonly initializationOptions?: readonly string[];
    readonly settings?: readonly string[];
  };

  /** 없으면 이 preset은 readiness를 주장하지 않고 indexingStatus는 `unknown`으로 남는다. (D7) */
  readonly readiness?: ProviderReadinessProfile;

  /** 사용자에게 보여줄 설치 안내와 알려진 한계. 자동 설치는 하지 않는다. */
  readonly docs?: {
    readonly install: string;
    readonly limitations?: readonly string[];
  };

  /** `verified-external` 승격 근거. tier가 verified-external이면 필수. */
  readonly lastVerified?: {
    readonly date: string;
    readonly versions: readonly string[];
  };
}

// ---------- override (project 설정 파일 / 요청) (D9) ----------

/** override에는 ManifestRef를 쓸 수 없다. 평문 JSON만이다. */
export interface ProviderOverride {
  readonly presetId?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly languageId?: string;
  readonly initializationOptions?: JsonObject;
  readonly settings?: JsonObject;
}

// ---------- W1-B → W1-A seam (D2) ----------

/**
 * W0-4가 만든 `cli/src/providers/resolve.ts:ResolvedProvider`의 확대다. 새 seam이 아니다.
 * 기존 필드(`command`, `selectedBy`, `requestedLanguageId`, `detectedLanguageId`, `languageMatch`)는
 * 그대로 두고 세션 필드만 더한다. 여기에는 ManifestRef가 남아 있지 않다.
 */
export interface ResolvedProviderSession extends ResolvedProvider {
  /** custom command 경로에는 preset이 없으므로 optional이다. */
  readonly presetId?: string;
  readonly initializationOptions: JsonObject;
  readonly settings: JsonObject;
  readonly settingsDelivery: readonly SettingsDelivery[];
  readonly readiness?: ProviderReadinessProfile;
  /** 세션 동안 stderr·providerLog에서 치환할 리터럴 문자열. (D6) */
  readonly redactionValues: readonly string[];
}

// ---------- coverage.indexing.evidence (L4 승인. 추가는 il-contract-architect가 한다) ----------

/**
 * 시각 필드를 의도적으로 두지 않는다. 이 저장소의 무변경 증명이 응답 바이트 비교에 의존하므로,
 * 응답에 벽시계 시각이 들어가면 그 검증 수단이 무력화된다. 시간이 필요해지면 절대 시각이 아니라
 * 요청 시작 기준 경과 시간으로 다시 제안한다.
 */
export interface IndexingReadinessEvidence {
  readonly signal: ReadinessSignalKind;
  /** redaction을 통과한 짧은 식별 문자열(method 이름 또는 progress title). */
  readonly detail: string;
}
```

### bundled TypeScript preset을 이 타입으로 표현하면

IL-LIM-004 1단계 종료 조건("기존 동작 변경 없이 manifest로 표현")의 확인이다.

```ts
const bundledTypeScript: ProviderPreset = {
  id: 'bundled-typescript',
  displayName: 'Bundled TypeScript Language Server',
  tier: 'bundled',
  languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
  extensions: ['.ts', '.mts', '.cts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  command: {
    candidates: [{ $ref: 'nodeExecutable' }],
    args: [{ $ref: 'bundledModuleEntry', module: 'typescript-language-server/lib/cli.mjs' }, '--stdio'],
    languageIdFrom: 'detected',
  },
  // initializationOptions 없음 -> {} 로 해석되어 오늘과 동일한 initialize 프레임이 된다.
  // settings 없음 -> 빈 트리 -> push 없음. workspace/configuration에는 규칙대로 응답만 한다.
  // readiness 없음 -> indexingStatus는 오늘과 같은 'unknown'.
};
```

**표현되지 않는 것이 하나 있고, 그것은 의도된 것이다.** `cli/src/runtime.ts:bundledProviderLogArgs`는
`IMPACT_LENS_PROVIDER_LOG_LEVEL` 환경변수가 있을 때만 `--log-level N`을 덧붙인다. manifest 어휘에는
조건부 인자가 없고, 넣지 않는다. 조건부를 넣는 순간 manifest에 표현식이 생기고 D1(b)에서 기각한 방향으로
간다. 이 한 건은 W1-B의 bundled resolver 코드에 남기고, manifest 해석 결과에 debug 인자를 덧붙이는 형태로
유지한다. 이것이 M1 manifest의 알려진 표현 한계다.

## 단계별 구현 계획

이 문서 자체는 단일 단계다. 아래는 W1-A가 착수할 단계이며, 각각 독립 검증·commit·push가 가능한 단위로
쪼갠 것이다. 이 branch에서는 수행하지 않는다.

1. **양방향 디스패치와 응답 전송** — D12의 shape 기반 판정, 두 개의 분리된 표, D10의 응답 표,
   MethodNotFound 기록. server id를 1부터 매기는 fixture 시나리오로 검증.
2. **설정 주입** — D11의 capability 선언, D2의 seam 확장, D3의 조회 규칙, D4의 순서 제약.
   bundled 응답 캡처 바이트 비교가 이 단계의 완료 조건이며, 차이가 나오면 기대값을 갱신하지 않고
   차이 내용을 보고한다(L2).
3. **redaction과 cancellation** — D6의 세션 redaction 표, sentinel grep 검증, D13.

**lane 순서 제약(L6)**: 위 세 단계는 요청 스키마에 `providerPreset`/`initializationOptions`/`settings`가
**아직 없다는 전제로** 진행한다. 필드 이름은 D9에서 고정됐으므로 배관은 그 이름으로 만든다.
`cli/schemas/request.schema.json` 추가는 W1-C merge 직후 별도 contract lane이 **Wave 1 종료 gate 이전에**
처리한다. W1-A가 스키마를 직접 건드리지 않는다.

readiness(D7)의 실제 관측은 Wave 2 W2-A다. Wave 1은 필드를 받는 자리만 만든다. `coverage.indexing`의
`evidence` 필드(`{ signal, detail }`, L4) 추가는 Wave 2 착수 전 `il-contract-architect`가 한다.

## 테스트 및 완료 기준

이 문서(문서 전용 단계)의 완료 기준이다.

- [x] `initializationOptions`의 표현 형식이 선택지 비교와 함께 결정됐다 — D1
- [x] `settings`의 `scopeUri`/`section` 조회 규칙과 미보유 section 반환값이 근거와 함께 결정됐다 — D3
- [x] `settings`와 `initializationOptions`의 관계가 결정됐다 — D5
- [x] readiness 선언 형태와 `coverage.indexing.status` 3값의 대응이 결정됐다 — D7
- [x] readiness 실패에 필요한 error code가 승인된 신규 11종 안에 모두 있음을 확인했다 — D7-2
- [x] secret 선언 지점과 강제 지점이 결정됐다 — D6
- [x] server request id 네임스페이스 분리 방식이 결정되고, fixture의 1000 base가 계약이 아님을 명시했다 — D12
- [x] `ProviderPreset` 타입 스케치가 있고 bundled TypeScript preset으로 표현 가능함을 확인했다
- [x] W1-A가 단독으로 정할 수 없는 항목이 "lead 결정" 표에 파급과 함께 올라갔다 — L1~L7
- [x] lead 결정 7건이 표에 근거와 함께 기록됐고, 미결이 L2 하나뿐임이 문서에서 분명하다
- [x] 구현 파일을 하나도 변경하지 않았다

문서 전용 변경이므로 컴파일·테스트는 이 단계의 검증 대상이 아니다. `git diff --check`만 실행한다.
**W1-A 구현 단계의 검증은 `npm run cli:test`와 `npm run test:plugin-artifact`이며, 특히
"server request를 실제로 보내는 mock fixture 없이 이 계층의 변경을 완료로 표시하지 않는다"를 유지한다.**

## 주요 위험과 대응

| 위험 | 대응 |
| --- | --- |
| `workspace.configuration: true` 선언이 bundled TypeScript의 동작을 바꾼다 | 응답 캡처 바이트 비교를 D11의 완료 조건으로 둔다. "bundled 동작 무변경" 제약은 유지하고, 차이가 나오면 기대값을 갱신하지 말고 차이 내용을 보고한다(L2 미결) |
| 캡처 비교가 코드 무변경에서도 diff를 낸다 | workspace 경로를 고정한다. `mkdtemp`를 쓰면 symbolId 해싱과 note conflict token이 경로를 담아 비결정적이 된다 (handover 8절) |
| manifest 어휘가 조금씩 늘어 표현식 언어가 된다 | ref 집합을 실제 소비처가 생길 때만 additive로 늘린다. `join`·조건부 인자·재시도 전략을 M1에서 의도적으로 뺐다 |
| readiness 필드만 만들고 Wave 2에서 채우지 않아 문서가 다시 코드를 앞선다 | handover 7절 "문서가 구현보다 앞선 구간" 표에 D7 행을 추가하고 W2-A를 닫는 lane으로 지정한다 |
| W1-B가 이 문서를 타입으로 옮기는 동안 W1-A가 다른 형태로 구현한다 | `ResolvedProviderSession`(= W0-4의 `ResolvedProvider` 확대)이 유일한 seam이다. W1-A는 `ProviderPreset`을 직접 읽지 않는다 (D2) |

## 작업 로그

### 2026-08-27 — 제안서 작성

**변경한 파일**

- `docs/work/task-m1-preset-manifest-contract.md` 신규. 구현 파일 변경 0건.

**설계 결정과 이유**

- **`initializationOptions`에 런타임 값이 필요하다는 결론은 추측이 아니라 기존 코드에서 나왔다.**
  `cli/src/runtime.ts:bundledTypeScriptCommand`가 `process.execPath`와 resolve된 module entry를 조합하므로,
  정적 리터럴 manifest로는 M1의 유일한 reference preset조차 표현할 수 없다. 이 사실이 D1의 (a) 기각 근거다.
- **토큰 치환(c) 대신 선언적 참조(d)를 고른 결정적 이유는 "이미 걸어야 하는 순회"였다.** 크기·depth·
  prototype key 검증을 위해 값 트리를 한 번 걸어야 하고, 참조 노드 해석은 그 순회의 case 하나다.
  토큰 치환은 그 순회에 **더해** 문자열 스캔과 escape 규칙을 요구한다.
- **ref 집합을 2개로 줄였다.** 처음에는 `workspaceRoot`/`detectedLanguageId`/`join`까지 넣었으나,
  M1에서 소비처가 없는 값은 W0-3이 `cli/src/errors.ts`에서 거부한 "선언만 하고 생산하지 않는 값"과
  같은 드리프트다.
- **`settings` 키에 `.` 금지를 검토했다가 철회했다.** `files.exclude` 같은 설정의 **값 안**에는
  `**/*.ts` 같은 dot 포함 glob 키가 정상적으로 존재한다. 값 내부 키와 section 경로 키를 구문만으로
  구분할 수 없으므로 전면 금지는 정상 설정을 막는다. 대신 도달 불가 규칙을 문장으로 고정하고
  doctor `warn`으로 내렸다.
- **`scopeUri`에 대해 "workspace 밖이면 null"을 검토했다가 철회했다.** 의존성 소스가 workspace root 밖에
  있는 것은 예외가 아니라 정상이다. 그 경우 server 동작이 파일 위치에 따라 갈리고 사용자가 예측할 수 없다.
- **미보유 section에 `null`을 고른 것은 spec 문언과 노출량 양쪽 근거를 함께 본 결과다.** `{}`는
  "설정이 있고 비었다"는 주장이라 server 기본값을 덮을 수 있다.
- **id 네임스페이스는 "분리"가 아니라 "디스패치 순서"가 실제 수정이라고 판단했다.** JSON-RPC에서 두 방향의
  id 공간은 원래 독립이고, 우리 client가 `method` 검사보다 `id` 검사를 먼저 하는 것이 결함이다. client id를
  큰 수로 올리는 안은 증상만 가리고 server의 번호를 통제할 수 없어 보장도 되지 않는다.
- **MethodNotFound를 즉시 실패로 만들지 않았다.** 선택적 server request를 무시해도 분석은 정상 완료되므로,
  즉시 실패는 지금보다 견고성을 낮춘다. 대신 같은 stage가 실제로 실패하면 code를 승격해 원인을 잃지 않게 했다.
- **`textDocument.callHierarchy.dynamicRegistration`을 Wave 1에서 켜지 않기로 했다.** 지금 켜면 server가
  정적 광고 대신 동적 등록을 택할 수 있고, `doInitialize`의 `callHierarchyProvider` 검사가
  `provider_capability_missing`으로 오탐한다. static/dynamic 병합이 끝난 Wave 2에서 켠다.

- **작성 중 W0-4(PR #34)가 merge돼 seam 설계를 다시 맞췄다.** 처음에는 `ResolvedProviderSession`을 새 타입
  으로 제안했으나, W0-4가 `cli/src/providers/resolve.ts:ResolvedProvider`로 같은 경계를 이미 만들었다.
  새 seam을 하나 더 만들면 같은 역할의 타입이 둘이 되므로, 기존 타입을 `extends`로 확대하는 형태로 바꿨다.
  기준 commit도 `4e998a8`에서 `dbc6c9b`로 올렸다.

**실행한 검사**

- `git diff --check`: 통과.
- `git rebase origin/main`(`dbc6c9b`): 충돌 없음. 이 문서 외 파일을 건드리지 않으므로 W0-4와 겹치지 않는다.
- `git status`: 이 문서 외 변경 없음. 구현 파일 무변경을 확인했다.
- 문서 전용 변경이므로 컴파일·테스트는 이 단계의 검증 대상이 아니다.

**발견 사항**

- `provider-coverage-contract.md`의 신규 11종에 **설정 검증 실패용 code가 없다.** L1로 올렸고,
  lead가 신규 code `provider_config_invalid` 추가로 결정했다.
- `cli/src/childIpc.ts:childIpcUnavailableError`가 원래 `details`를 펼치므로 계약 표의
  "`provider_ipc_unavailable` = stage `launch`"는 코드와 어긋난다. handover 미결 4번의 답이며 권고를 적었다.
- `cli/src/test/fixtures/configurationRequestServer.ts`가 요청하는 section은 `impactLens`이고 어떤 preset도
  이를 정의하지 않으므로, 이 계약을 구현한 client의 응답은 `[null]`이다. W1-A 통합 테스트의 기대값이다.

**남은 작업**

- lead 승인. 승인 전에는 W1-B가 이 형태를 타입으로 확정하지 않는다.
- L1~L7 결정. 특히 L6(요청 스키마 변경의 lane과 wave)은 W1-A·W1-B 착수 전에 정해야 한다.
- `cli/src/test/fixtures/mockServer.ts`의 server id base 옵션 추가는 `il-test-release` 소유다.
  lead 경유로 요청한다.

### 2026-08-27 — lead 결정 반영

**변경한 파일**

- `docs/work/task-m1-preset-manifest-contract.md`만. 구현 파일 변경은 여전히 0건이다.

**정해진 것**

"lead 결정 필요" 절을 "lead 결정" 절로 바꾸고 표에 **결정** 열을 추가했다. "파급" 열은 결정 근거이므로
지우지 않고 그대로 뒀다. **7건 중 6건 확정, 미결은 L2 하나다.**

- **L1**: 신규 code `provider_config_invalid`. `invalid_request` 재사용은 사용자가 고쳐야 할 파일을
  잘못 지목한다. 계약·`errors.ts` 반영은 W1-C.
- **L2**: 유일한 미결. 캡처가 실제로 바뀌는지 관측되지 않았으므로 결정하지 않는다. "bundled 동작 무변경"
  제약을 유지하고, 차이가 관측되면 W1-A는 기대값을 갱신하지 말고 차이의 정확한 내용을 보고한다.
- **L3**: doctor JSON + debug transcript만. D10이 MethodNotFound로 답하므로 조용한 불완전 경로가 닫혀
  있다. D10의 code 승격이 덮지 못하는 경우가 하나라도 관측되면 뒤집는 조건부다.
- **L4**: `{ signal, detail }` 승인, `observedAtMs` 제외. 타입 스케치에서 필드를 지우고 이유를 주석으로
  남겼다. 응답 바이트 비교가 이 저장소의 무변경 증명 수단이므로 벽시계 시각을 응답에 넣지 않는다.
- **L5**: 제안값 그대로 승인. 완화는 호환, 강화는 파괴적이라는 비대칭을 D8에 근거로 적었다.
- **L6**: 스키마 추가는 Wave 1 후속 lane. 대신 요청 최상위 필드 이름
  (`providerPreset`/`initializationOptions`/`settings`)을 D9에 못박아, 두 lane이 서로 다른 이름을
  가정하는 문제를 이름 고정으로 해소했다. 스키마 추가는 W1-C merge 직후, Wave 1 종료 gate 이전.
- **L7**: 문서를 코드에 맞춘다. **handover 6절 미결 4번이 닫혔다.** 수정은 W1-C.

**함께 갱신한 절**

- D7-2(L1), D8(L5 근거 문단), D9(L6 필드 이름 표), D10(L3 조건부), D11(L2 규칙), 타입 스케치(L4),
  단계별 구현 계획(L6 순서와 L4 반영), 테스트 및 완료 기준, 주요 위험과 대응.

**실행한 검사**

- `git diff --check`: 통과.
- `git status`: 이 문서 외 변경 없음. 구현 파일 무변경을 다시 확인했다.
- 문서 전용 변경이므로 컴파일·테스트는 이 단계의 검증 대상이 아니다.

**남은 작업**

- L2는 W1-A 구현 중 캡처 비교로 관측한 뒤 lead가 닫는다. W1-A가 임의로 닫지 않는다.
- L1·L4·L7의 계약 파일 반영은 `il-contract-architect`가 한다. W1-A는 하지 않는다.
- 요청 스키마 필드 3종 추가는 W1-C merge 직후 contract lane이 Wave 1 종료 gate 이전에 처리한다.
