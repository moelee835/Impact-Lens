# Agent용 CLI 개발 목표 및 상세 명세

- Issue: [#11 Add an agent-oriented Impact Lens CLI](https://github.com/moelee835/Impact-Lens/issues/11)
- 상태: 구현 및 자동 검증 완료, PR·merge·release 대기
- 최초 작성일: 2026-08-24
- 구현 착수일: 2026-08-25
- 대상 독자: Impact Lens CLI 구현자, 검토자, CLI를 호출하는 코드 에이전트
- 기준 버전: Impact Lens v0.3.3

## 1. 배경과 해결할 문제

Impact Lens v0.3.3은 VS Code Extension 안에서 현재 함수의 incoming call hierarchy를 수집하고 Direct, Transitive, Test 영향 범위를 Graph와 Explorer로 보여준다. 코드 에이전트가 같은 정보를 사용하려면 현재는 VS Code UI를 간접적으로 조작하거나 소스 코드를 다시 분석해야 한다. 이는 자동화하기 어렵고 결과 형식도 안정적이지 않다.

CLI의 사용자는 사람이 아니라 코드 에이전트다. 따라서 사람이 읽기 좋은 표, 색상, 대화형 프롬프트보다 다음 특성이 중요하다.

- 기계가 안정적으로 파싱할 수 있는 버전 고정 JSON 계약
- 함수와 호출 관계를 다시 찾을 수 있는 정확한 파일 및 위치 정보
- 수집한 데이터의 출처, 완전성, 제한 사항을 명시하는 메타데이터
- 함수 노트의 조회, 입력, 수정, 삭제를 위한 비대화형 CRUD
- stdout, stderr 및 종료 코드의 결정적인 동작
- 기존 VS Code Extension 실행 경로와 패키지에 장애를 전파하지 않는 격리

현재 Extension의 `ImpactAnalyzer`는 VS Code 명령인 `vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls`, diagnostics 및 workspace configuration에 결합되어 있다. 반면 `callGraph.ts`의 incoming caller BFS 개념과 `noteModel.ts`의 Shared note 문서 형식 및 노트 우선순위는 CLI 설계에 참고할 수 있다.

## 2. 핵심 결정 요약

1. CLI는 사람용 pretty output을 제공하지 않고 compact JSON만 출력한다.
2. CLI는 기존 Extension에 명령을 전달하는 wrapper가 아니라 독립 실행 프로세스다.
3. 초기 릴리스에서는 기존 `src/**` Extension 구현과 Personal note 저장소를 변경하지 않는다.
4. CLI 코드는 별도 디렉터리와 별도 package로 격리하고 VSIX에서 제외한다.
5. 영향 분석은 독립 Language Server의 표준 LSP Call Hierarchy를 provider 경계 뒤에서 사용한다.
6. 노트는 Shared, Source comment 및 CLI Local 범위에서 CRUD를 제공한다.
7. 기존 VS Code `workspaceState` Personal note는 초기 CLI에서 읽거나 변경하지 않는다.
8. 모든 변경 명령은 기본적으로 preview이며 명시적인 `--apply`가 있을 때만 파일을 변경한다.
9. 분석 결과에는 `capabilities`, `limitations`, provider 정보 및 truncation 상태를 항상 포함한다.
10. Extension과 공통 코어를 추출하는 리팩터링은 CLI가 검증된 뒤 별도 작업으로만 진행한다.

## 3. 목표

### 3.1 영향 분석

- 파일과 위치로 분석 root 함수를 찾는다.
- root의 직접 caller와 간접 caller를 configurable depth까지 역방향으로 탐색한다.
- caller와 callee의 edge 및 실제 call-site range를 반환한다.
- node를 Root, Direct, Transitive, Test로 분류한다.
- Test node에도 direct caller인지 몇 hop 떨어졌는지 보존한다.
- 프로젝트 경계를 넘는 결과를 provider가 반환하면 해당 관계를 숨기지 않는다.
- depth 또는 node 제한으로 결과가 잘리면 이유와 실제 도달 깊이를 반환한다.
- 동일 symbol, cycle, overload 및 다른 파일의 동명 symbol을 구분한다.
- 요청하면 선언부, 함수 본문 또는 call-site 주변 source를 결과에 포함한다.
- provider가 반환하는 범위에서 error와 warning diagnostics를 포함한다.

### 3.2 Agent용 데이터 계약

- 모든 성공 결과는 stdout에 정확히 하나의 compact JSON document로 출력한다.
- 정상 로그, progress, spinner, ANSI color를 stdout에 출력하지 않는다.
- 실패 결과는 stderr에 정확히 하나의 compact JSON error document로 출력한다.
- 모든 응답에 `schemaVersion`과 operation 이름을 포함한다.
- 좌표 기준, 문자 encoding, provider 및 분석 시각을 명시한다.
- 일부 데이터만 수집된 경우에도 추정하지 않고 `complete: false`와 원인을 반환한다.
- 필드가 지원되지 않는 경우 값의 부재와 provider 미지원 상태를 구분한다.

### 3.3 함수 노트 CRUD

- 분석 결과의 모든 node에 effective note와 사용 가능한 note layer를 포함한다.
- 특정 symbol의 노트를 조회한다.
- workspace의 노트를 조건에 따라 목록화한다.
- 노트를 입력하거나 수정하는 upsert를 제공한다.
- 특정 storage scope의 노트를 삭제한다.
- Shared 또는 Source note를 변경한 뒤 기존 Extension이 다음 refresh에서 같은 결과를 읽을 수 있어야 한다.
- 동시 수정과 오래된 Agent 입력으로 발생하는 lost update를 감지한다.
- Source comment 변경 전후를 preview할 수 있어야 한다.

### 3.4 기존 기능 보호

- CLI 설치나 실행 여부가 Extension activation, live analysis, CodeLens, Explorer 및 Graph에 영향을 주지 않아야 한다.
- CLI Language Server의 실패나 종료가 VS Code Extension process에 전파되지 않아야 한다.
- 기존 Personal note가 삭제, 이동 또는 자동 변환되지 않아야 한다.
- CLI 파일과 무거운 Language Server 의존성이 VSIX에 포함되지 않아야 한다.
- CLI 구현 때문에 Extension 분석 결과의 symbol ID, relation, depth 및 edge 방향이 달라지지 않아야 한다.

## 4. 범위에서 제외하는 항목

초기 CLI 릴리스에서는 다음을 구현하지 않는다.

- 사람용 table, tree, color 또는 interactive terminal UI
- 브라우저나 Graph Webview 렌더링
- VS Code가 실행 중이어야 하는 extension-command wrapper
- 기존 VS Code `workspaceState` Personal note 직접 접근
- VS Code 내부 SQLite/state database 탐색 또는 수정
- 저장되지 않은 editor buffer 자동 수집
- VS Code에서만 제공되는 proprietary language extension API 자동 호출
- reflection, runtime dependency injection, event bus, decorator route, 문자열 import 등의 동적 관계 추론
- 테스트 실행 및 pass/fail 결과 수집
- AI 기반 관계 추정
- CLI 실행 시 source나 note의 암묵적 변경
- 검증되지 않은 Extension/CLI 공통 코어 리팩터링
- 모든 언어에 대한 동시 지원 보장

## 5. 사용자와 주요 사용 사례

CLI의 직접 사용자는 코드 에이전트 또는 이를 orchestration하는 자동화다.

### 5.1 수정 전 영향 조회

1. Agent가 수정 대상 파일과 함수 위치를 전달한다.
2. CLI가 symbol을 준비하고 incoming callers를 탐색한다.
3. Agent는 node, edge, call site, diagnostics, note 및 completeness를 사용해 수정 계획을 세운다.

### 5.2 수정 후 재조회

1. Agent가 소스 파일을 수정하고 저장한다.
2. 같은 root로 CLI를 다시 실행한다.
3. Agent는 이전 JSON과 새 JSON의 node/edge/diagnostic 차이를 비교한다.

초기 CLI가 live session을 유지하거나 delta를 직접 계산할 필요는 없다. 대신 결과가 결정적으로 정렬되어 외부 Agent가 안정적으로 비교할 수 있어야 한다.

### 5.3 노트 관리

1. Agent가 분석 결과에서 target의 파일, 위치 및 예상 symbol identity를 얻는다.
2. `note.get`으로 현재 effective note와 각 layer를 확인한다.
3. `note.set`을 preview해 대상과 변경 내용을 확인한다.
4. 충돌 token이 유효한 상태에서 `--apply`로 반영한다.
5. 다시 조회해 변경 결과와 effective layer를 확인한다.

## 6. 안전 우선 아키텍처

### 6.1 초기 디렉터리 경계

계획하는 경계는 다음과 같다. 실제 이름은 구현 전 별도 Issue의 작업 문서에서 확정한다.

```text
src/                       기존 VS Code Extension
cli/                       독립 CLI package
cli/src/commands/          analyze 및 note 명령
cli/src/providers/         LSP provider와 테스트 provider
cli/src/notes/             Shared, Source, Local note adapter
cli/src/contracts/         JSON request/response schema
cli/src/test/              CLI 단위·통합 테스트
```

- 초기 단계에서는 기존 `src/**`를 수정하지 않는 것을 원칙으로 한다.
- CLI는 `vscode` module을 runtime dependency로 사용하지 않는다.
- 기존 순회 코드와 일시적인 중복이 생겨도 격리를 우선한다.
- 공통 코어 추출은 CLI와 Extension fixture parity가 입증된 후 별도 PR로 다룬다.
- `.vscodeignore`에 CLI 디렉터리를 명시적으로 제외한다.
- CLI package와 Language Server 의존성은 Extension package manifest와 분리한다.

### 6.2 논리 계층

```text
Agent
  -> CLI command/parser
  -> request validation
  -> impact or note service
  -> provider/storage adapter
  -> compact JSON response
```

Impact service는 provider의 구체 구현을 알지 않는다.

```ts
interface CallHierarchyProvider {
  capabilities(): Promise<ProviderCapabilities>;
  prepare(target: SourceTarget): Promise<PreparedSymbol[]>;
  incoming(symbol: ProviderSymbol): Promise<IncomingCall[]>;
  diagnostics?(files: readonly string[]): Promise<Diagnostic[]>;
  source?(symbol: ProviderSymbol, mode: SourceMode): Promise<SourceFragment | undefined>;
}
```

Provider가 여러 root 후보를 반환하면 CLI가 임의로 첫 항목을 고르지 않는다. 예상 symbol 정보로 유일하게 판별할 수 없으면 ambiguous target 오류와 후보 목록을 반환한다.

### 6.3 Language Server provider

- 표준 LSP `textDocument/prepareCallHierarchy` 및 `callHierarchy/incomingCalls`를 우선 사용한다.
- Language Server initialize 결과의 capability를 확인한 뒤 분석한다.
- workspace root, initialization options, executable 및 timeout을 명시적으로 설정할 수 있어야 한다.
- 초기 reference provider는 TypeScript/JavaScript를 목표로 하되 정확한 server 선택과 지원 버전은 구현 Issue에서 고정한다.
- 다른 언어는 provider 설정 또는 별도 adapter를 통해 추가한다.
- Language Server가 Call Hierarchy를 지원하지 않으면 빈 graph가 아니라 `provider_capability_missing` 오류를 반환한다.
- cold start와 indexing 시간을 `timings`에 분리해 기록한다.
- 초기 버전은 숨은 daemon을 자동 시작하지 않는다. persistent cache/daemon은 측정 후 별도 기능으로 검토한다.

## 7. 명령 인터페이스

CLI executable의 작업명은 `impact-lens`로 한다. 최종 npm package 이름은 구현 시 registry 충돌 여부를 확인한 뒤 결정한다.

### 7.1 영향 분석

```sh
impact-lens analyze --workspace <path> --file <path> --line <n> --column <n>
impact-lens analyze --workspace <path> --file <path> --line <n> --column <n> --depth 5 --max-nodes 120
impact-lens analyze --stdin
```

주요 옵션:

- `--workspace`: 분석 workspace의 절대 또는 현재 디렉터리 기준 경로
- `--file`: workspace 상대 경로 또는 명시적인 절대 경로
- `--line`, `--column`: 1-based 위치
- `--depth`: incoming traversal 최대 깊이, 기본 5
- `--max-nodes`: 최대 node 수, 기본 120
- `--include-source none|declaration|body|callsites`: source 포함 수준, 기본 `none`
- `--provider-config`: Language Server 실행 설정 JSON 파일
- `--timeout-ms`: 전체 분석 제한 시간
- `--stdin`: canonical JSON request를 stdin으로 수신

Shell option은 편의를 위한 표면이고, Agent 통합의 canonical 입력은 stdin JSON이다. JSON 입력은 note text의 줄바꿈, 따옴표 및 shell escaping 문제를 피한다.

### 7.2 노트 조회와 목록

```sh
impact-lens note get --workspace <path> --file <path> --line <n> --column <n>
impact-lens note list --workspace <path>
impact-lens note list --workspace <path> --scope shared
impact-lens note get --stdin
```

`note.get`은 effective note뿐 아니라 읽을 수 있는 모든 layer와 resolution priority를 반환한다. `note.list`는 기본적으로 Shared와 CLI Local stored note를 반환하고, source tree 전체 scan은 `--scope source`를 명시했을 때만 수행한다.

### 7.3 노트 입력과 수정

```sh
impact-lens note set --workspace <path> --file <path> --line <n> --column <n> --scope shared --text <text>
impact-lens note set --scope source --stdin
impact-lens note set --scope shared --apply --stdin
```

- `set`은 create와 update를 합친 idempotent upsert다.
- 빈 문자열을 삭제 의미로 사용하지 않는다. 삭제는 반드시 `note delete`를 사용한다.
- text는 command option 또는 stdin JSON으로 전달하되 둘을 동시에 사용하면 validation error다.
- target에는 선택적으로 expected symbol name, kind, detail 및 conflict token을 포함한다.
- `--apply`가 없으면 실제 파일을 변경하지 않고 preview를 반환한다.

### 7.4 노트 삭제

```sh
impact-lens note delete --workspace <path> --file <path> --line <n> --column <n> --scope shared
impact-lens note delete --scope source --apply --stdin
```

- 지정한 scope만 삭제한다.
- 삭제 대상이 없으면 성공 응답과 `changed: false`를 반환한다.
- 다른 layer로 fallback된 effective note를 함께 반환한다.
- 모든 layer를 한 번에 삭제하는 암묵적인 옵션은 초기 버전에 제공하지 않는다.

## 8. 좌표와 symbol identity

- 외부 JSON의 line과 column은 모두 1-based다.
- `positionEncoding`은 provider가 사용하는 값을 결과에 기록하며 기본 기대값은 `utf-16`이다.
- 내부 LSP 0-based 좌표 변환은 adapter 경계에서만 수행한다.
- file은 workspace-relative POSIX separator 경로를 canonical 값으로 사용한다.
- workspace 외부 symbol은 canonical absolute URI와 `outsideWorkspace: true`를 사용한다.
- node `id`는 한 분석 결과 안에서 edge 연결과 deduplication에 사용하는 결정적 ID다.
- line 이동에 영구적으로 안전한 ID라고 주장하지 않는다.
- note mutation target은 ID 단독이 아니라 file, declaration position 및 expected symbol identity를 사용한다.
- target 위치의 symbol이 expected identity와 다르면 수정하지 않고 conflict 또는 target mismatch를 반환한다.

권장 target 형태:

```json
{"file":"src/order.ts","position":{"line":42,"column":17},"expectedSymbol":{"name":"calculateTotal","kind":"function","detail":"(items: LineItem[]) => Money"}}
```

## 9. JSON 응답 계약

### 9.1 공통 envelope

모든 성공 응답은 다음 공통 필드를 가진다.

```json
{"schemaVersion":1,"operation":"impact.analyze","ok":true,"data":{},"capabilities":{},"limitations":[],"timings":{}}
```

- `schemaVersion`: breaking contract 변경 시 증가
- `operation`: 실행된 명령
- `ok`: 성공 여부
- `data`: operation별 payload
- `capabilities`: 실제 provider와 storage가 제공한 기능
- `limitations`: 결과 해석에 영향을 주는 누락 또는 경계
- `timings`: initialize, indexing, traversal 및 total 시간

JSON object key와 array 순서는 테스트에서 결정적으로 유지한다. node는 depth, file, declaration position, symbol name 순으로 정렬하고 edge는 source/target/call-site 순으로 정렬한다.

### 9.2 분석 결과의 최소 node

```json
{
  "id": "symbol-id",
  "name": "calculateTotal",
  "kind": "function",
  "detail": "(items: LineItem[]) => Money",
  "file": "src/order.ts",
  "uri": "file:///workspace/src/order.ts",
  "outsideWorkspace": false,
  "declarationRange": {
    "start": {"line": 42, "column": 1},
    "end": {"line": 48, "column": 2}
  },
  "selectionRange": {
    "start": {"line": 42, "column": 17},
    "end": {"line": 42, "column": 31}
  },
  "depth": 0,
  "relation": "root",
  "testDistance": null,
  "note": {
    "effective": "세금을 포함한 결제 금액 계산",
    "effectiveSource": "shared",
    "layers": {
      "local": null,
      "shared": "세금을 포함한 결제 금액 계산",
      "sourceComment": null,
      "personal": {"available": false,"reason": "vscode_workspace_state_unavailable"}
    }
  },
  "diagnostics": [],
  "source": null
}
```

### 9.3 edge

```json
{"source":"caller-id","target":"callee-id","callSites":[{"file":"src/caller.ts","range":{"start":{"line":10,"column":3},"end":{"line":10,"column":19}}}]}
```

Edge 방향은 현재 Extension과 동일하게 caller에서 callee로 고정한다. cycle 또는 이미 본 node와 연결되는 edge도 제거하지 않는다.

### 9.4 completeness와 제한

분석 payload에는 최소 다음을 포함한다.

```json
{
  "requestedDepth": 5,
  "reachedDepth": 3,
  "maxNodes": 120,
  "truncated": false,
  "traversalLimits": [],
  "complete": true,
  "provider": {
    "name": "typescript-language-server",
    "version": "...",
    "callHierarchy": true,
    "diagnostics": true
  }
}
```

`complete: true`는 configured provider가 요청 범위의 traversal을 끝냈다는 의미일 뿐 runtime 호출이 없다는 보장이 아니다. 이 의미를 `limitations`에도 기계 판독 가능한 code로 제공한다.

## 10. 오류와 종료 코드

오류 JSON 예시:

```json
{"schemaVersion":1,"operation":"note.set","ok":false,"error":{"code":"conflict","message":"Target changed after it was read","retryable":true,"details":{}}}
```

초기 종료 코드 계약:

- `0`: 성공. partial analysis는 payload에 표시하고 사용할 수 있는 결과가 있으면 성공으로 처리
- `2`: request 또는 option validation 오류
- `3`: target 없음 또는 여러 symbol로 모호함
- `4`: note/file conflict 또는 expected identity 불일치
- `5`: provider 실행 실패 또는 필수 capability 없음
- `6`: timeout 또는 취소
- `10`: 분류되지 않은 내부 오류

stack trace와 debug log는 기본 출력하지 않는다. 별도 `--debug-log <path>`가 있을 때만 기록하며 stdout 계약을 오염시키지 않는다.

## 11. 노트 저장소와 우선순위

### 11.1 Shared

- 기존 `.impact-lens/notes.json` version 1 형식을 호환한다.
- 기존 Extension이 만든 entry를 보존하고 알 수 없는 필드를 임의로 제거하지 않는다.
- workspace 상대 POSIX file 경로를 사용한다.
- 저장은 같은 디렉터리의 temporary file에 쓴 뒤 atomic rename하는 방식을 우선한다.
- 쓰기 전에 읽었던 document hash 또는 `updatedAt` conflict token을 확인한다.
- JSON formatting은 기존 repository file style을 유지한다. CLI stdout의 compact 정책과 저장 파일 형식은 별개다.

### 11.2 Source comment

- 기존 `@impact-note` 문법과 declaration 위 최대 탐색 거리를 유지한다.
- 언어별 line comment prefix를 명시적으로 지원하며 알 수 없는 언어에 임의로 `//`를 쓰지 않는다.
- preview 응답에는 before hash, after hash, 변경 range 및 replacement text를 포함한다.
- `--apply` 시 preview에 사용한 expected file hash가 현재 hash와 다르면 중단한다.
- 기존 note가 여러 개이거나 target declaration이 모호하면 수정하지 않는다.
- source file의 newline 방식과 마지막 newline을 보존한다.

### 11.3 CLI Local

- 작업명은 `.impact-lens/notes.local.json`이며 구현 전 `.gitignore` 정책을 확정한다.
- CLI만 사용하는 비공개 layer로 시작하며 Extension Personal과 동일하다고 표현하지 않는다.
- Extension이 Local note를 자동으로 표시하거나 동기화하지 않는다.
- 파일이 Git에 stage되어 있거나 ignore되지 않은 경우 warning limitation을 반환하는 방안을 검토한다.
- Local과 Shared가 모두 있으면 초기 CLI effective 우선순위는 `local -> shared -> sourceComment`로 한다.

### 11.4 기존 VS Code Personal

- Personal note는 ExtensionContext의 `workspaceState` key `impactLens.personalNotes.v1`에 저장된다.
- 저장 위치와 내부 database는 VS Code 구현 세부사항이므로 standalone CLI가 직접 읽거나 수정하지 않는다.
- CLI는 Personal layer를 `available: false`로 명시해 노트가 없다는 의미와 구분한다.
- 기존 Personal note의 자동 migration은 하지 않는다.
- 향후 필요하면 사용자가 명시적으로 실행하는 읽기 전용 Extension export/bridge를 별도 Issue로 설계한다.
- bridge 도입 전에는 CLI와 Extension 사이 Personal/Local parity를 완료 조건으로 주장하지 않는다.

## 12. 노트 변경 안전성과 동시성

- 모든 mutation은 preview가 기본이고 `--apply`가 필요하다.
- Shared/Local은 document hash와 target `updatedAt`을 conflict token으로 사용한다.
- Source comment는 전체 source file hash와 expected symbol identity를 확인한다.
- token이 없을 때 강제 덮어쓰지 않고 최신 상태를 다시 조회하도록 오류를 반환하는 strict mode를 기본으로 한다.
- 동일 내용 upsert는 성공하되 `changed: false`를 반환한다.
- 삭제는 idempotent다.
- 임시 파일 생성, fsync 가능 여부, rename 실패 시 원본 보존을 테스트한다.
- mutation 결과에는 `applied`, `changed`, target, 이전/새 effective note 및 새 conflict token을 포함한다.
- CLI는 workspace 밖 경로, symlink로 탈출하는 경로 및 예상 workspace가 아닌 파일을 기본적으로 수정하지 않는다.

## 13. Agent가 얻는 데이터와 의도적 제한

CLI를 Extension과 격리하는 것 자체가 다음 코드 데이터의 수집을 제한하지는 않는다.

- symbol 이름, 종류, detail/signature
- 선언 및 selection range
- direct/transitive/test caller
- edge와 call-site range
- 요청/도달 depth와 truncation
- Shared, Source, CLI Local note
- provider가 제공하는 diagnostics
- 명시적으로 요청한 source fragment

초기 standalone CLI에서 얻을 수 없는 데이터:

- 저장되지 않은 VS Code editor buffer
- VS Code `workspaceState` Personal note
- VS Code process 안에서만 유지되는 diagnostics
- standalone 형태가 없는 proprietary extension provider 결과
- Language Server가 모델링하지 않는 runtime/dynamic 관계

응답은 반드시 다음을 구분한다.

- 데이터가 실제로 없었음
- provider가 해당 기능을 지원하지 않음
- 권한 또는 격리 정책 때문에 조회하지 않음
- timeout이나 node/depth 제한 때문에 조회를 완료하지 못함

Agent가 누락을 실제 부재로 오판하지 않도록 문자열 설명만이 아니라 stable limitation code를 제공한다. 예:

- `unsaved_buffers_unavailable`
- `vscode_personal_notes_unavailable`
- `provider_diagnostics_unsupported`
- `dynamic_calls_not_inferred`
- `depth_limit_reached`
- `node_limit_reached`

## 14. 성능 목표와 수명주기

- CLI timing을 process start, server initialize, workspace indexing, root prepare, traversal, note resolution 및 serialization로 나눠 기록한다.
- 기본 실행에는 progress text를 출력하지 않는다.
- timeout 시 Language Server child process를 종료하고 임시 파일을 정리한다.
- fresh process 방식의 cold start 비용을 먼저 측정한다.
- daemon 또는 server reuse는 측정 결과가 실제 병목을 증명할 때 별도 opt-in 기능으로 추가한다.
- node/depth 제한은 Extension 기본값과 같은 120/5에서 시작하되 CLI option으로 변경 가능하게 한다.
- source 본문은 응답 크기와 민감 정보 노출을 줄이기 위해 기본적으로 포함하지 않는다.
- 같은 파일을 여러 node가 참조해도 source fragment를 중복 출력하지 않는 참조 구조를 검토한다.

구체적인 시간 SLA는 언어, 프로젝트 크기 및 Language Server indexing 차이가 크므로 측정 전 임의로 정하지 않는다. 대신 모든 benchmark에 cold/warm 조건과 fixture 크기를 기록한다.

## 15. 보안 및 저장소 경계

- CLI는 local process이며 source나 note를 외부 서비스로 전송하지 않는다.
- provider executable과 arguments는 명시적인 설정 또는 지원 목록에서만 가져온다.
- shell string을 조립해 Language Server를 실행하지 않고 executable/argument array를 사용한다.
- stdout source 포함은 명시적인 `--include-source`가 있을 때만 허용한다.
- workspace 밖 파일은 읽기 결과에 포함할 수 있지만 mutation은 별도 명시적 허용 없이는 거부한다.
- symlink와 path normalization 뒤 workspace 경계를 다시 확인한다.
- note text를 명령이나 error log에 불필요하게 복제하지 않는다.
- debug log에는 source 본문과 note text를 기본적으로 기록하지 않는다.

## 16. 단계별 개발 계획과 출시 게이트

각 단계는 별도 구현 Issue와 작업 문서를 만들고 이전 단계의 완료 기준을 통과한 뒤 시작한다.

### 단계 0: 기준선 고정

- v0.3.3 Extension의 현재 unit test 결과를 기록한다.
- fixture별 node, edge, depth, relation 및 test 분류 golden 결과를 만든다.
- 현재 VSIX file list와 runtime file hash 기준을 기록한다.
- CLI JSON schema 초안을 executable validation schema로 고정한다.

완료 게이트: 기존 Extension 코드 변경 없이 기준선과 contract test가 재현된다.

### 단계 1: 읽기 전용 CLI와 테스트 provider

- 독립 package, argument/JSON request parsing, compact response와 error envelope를 구현한다.
- deterministic in-memory provider로 BFS, cycle, limit, ambiguity 및 ordering을 검증한다.
- 실제 Language Server 없이 전체 contract test가 가능해야 한다.

완료 게이트: `src/**` 변경 없이 CLI test가 통과하고 VSIX 내용이 기준선과 동일하다.

### 단계 2: 첫 Language Server provider

- TypeScript/JavaScript reference provider를 구현한다.
- 작은 단일 파일, cross-file, cycle, test caller fixture를 실제 LSP로 검증한다.
- provider capability, timeout, child process cleanup 및 cold-start timing을 기록한다.

완료 게이트: fixture의 핵심 graph가 Extension 기준 결과와 의미상 일치하고 provider 미지원/실패를 명확히 보고한다.

### 단계 3: 노트 read와 Shared CRUD

- Shared note read/list/get/set/delete 및 effective resolution을 구현한다.
- preview, `--apply`, atomic write, optimistic conflict와 idempotency를 구현한다.
- 기존 Extension이 수정된 Shared note를 정상적으로 다시 읽는지 확인한다.

완료 게이트: concurrent/stale update가 원본을 덮어쓰지 않고 Extension note 기능이 회귀하지 않는다.

### 단계 4: Source comment CRUD

- 지원 언어별 note 탐색, preview diff, hash 검증 및 apply를 구현한다.
- newline, indentation, annotation/comment 사이 위치와 deletion 경계를 fixture로 검증한다.
- 알 수 없는 언어와 모호한 declaration은 안전하게 거부한다.

완료 게이트: source fixture 전체가 byte-level 기대 결과와 일치하고 conflict 시 원본이 보존된다.

### 단계 5: CLI Local note

- 비공개 local store와 ignore 확인을 구현한다.
- CLI의 local/shared/source resolution을 검증한다.
- Extension Personal과 다른 저장소임을 응답과 문서에 명시한다.

완료 게이트: 기존 Personal note에 어떤 write도 발생하지 않고 local file이 실수로 배포 artifact에 포함되지 않는다.

### 단계 6: 검증 후 통합 여부 판단

- 코드 중복, 유지보수 비용, parity test 결과를 검토한다.
- 공통 symbol/note/traversal model 추출이 실제로 필요한지 결정한다.
- 필요하면 별도 Issue, 별도 branch, 별도 migration/rollback 계획으로 수행한다.

완료 게이트: 공통화가 Extension 회귀 위험보다 명확한 이득이 있을 때만 승인한다.

## 17. 테스트 전략

### 17.1 Contract 및 단위 테스트

- JSON schema validation과 unknown/required field 처리
- stdout 단일 JSON, stderr 단일 error JSON, ANSI/log 오염 없음
- 1-based 외부 좌표와 0-based LSP 좌표 변환
- symbol identity, overload, duplicate name 및 위치 이동
- BFS direct/transitive, cycle, diamond graph, cross-file edge
- depth/node truncation과 deterministic ordering
- test file 분류의 기존 양성/음성 사례
- provider capability와 partial result 표현

### 17.2 Note 테스트

- Personal/Shared/Source와 같은 기존 resolution 의미 비교
- Shared version 1 read/write 호환
- create, update, delete, no-op 및 fallback
- stale hash, stale updatedAt 및 동시 write conflict
- invalid JSON일 때 원본 보존
- Source comment insertion, replacement, deletion, indentation 및 newline 보존
- preview와 apply 결과의 일치
- workspace escape 및 symlink mutation 거부

### 17.3 Language Server 통합 테스트

- 단일 파일 direct call
- cross-file direct/transitive call
- cycle과 duplicate edge
- test caller와 다양한 test naming convention
- overload 및 method/constructor
- provider가 Call Hierarchy를 지원하지 않는 경우
- initialize 실패, timeout, crash 및 process cleanup

### 17.4 Extension 회귀 테스트

- 현재 전체 `pnpm test`
- TypeScript compile
- CodeLens 선언 anchor, Graph relation/layout, root history 및 notes 기존 test
- VSIX packaging과 file list 검사
- CLI directory, test, provider executable 및 CLI dependencies가 VSIX에 없는지 검사
- 가능한 환경에서는 Extension Development Host smoke test

단계 1의 격리 목표를 검증할 때는 v0.3.3 VSIX runtime 파일별 hash를 비교한다. ZIP timestamp 때문에 전체 archive hash만 비교하지 않고 내부 runtime 내용과 목록을 비교한다.

## 18. 초기 완료 기준

CLI 첫 정식 릴리스는 다음 조건을 모두 만족해야 한다.

- compact JSON analyze 명령이 문서화된 schema로 동작한다.
- stdout/stderr와 종료 코드 계약이 자동 테스트로 고정된다.
- direct/transitive/test node, edge, call site, depth 및 truncation이 반환된다.
- capabilities와 limitations가 항상 포함된다.
- Shared note get/list/set/delete가 preview와 apply를 지원한다.
- Source note get/set/delete가 hash conflict 보호와 preview를 지원한다.
- CLI Local note의 범위가 Extension Personal과 명확히 구분된다.
- 기존 Personal note를 읽거나 쓰거나 migration하지 않는다.
- 기존 Extension 자동 테스트가 모두 통과한다.
- VSIX에서 CLI 및 CLI dependency가 제외된다.
- CLI 실패가 Extension process에 영향을 주지 않는다.
- 지원 언어와 provider version, 설치 조건 및 알려진 한계가 문서화된다.
- 실제로 수행하지 못한 수동 검증은 성공으로 표시하지 않고 작업 로그에 남긴다.

## 19. 롤백 전략

- CLI는 별도 package이므로 문제가 있으면 CLI package 배포만 중단한다.
- Extension VSIX와 release channel은 CLI rollout과 분리한다.
- Shared/Source mutation은 적용 전 preview와 conflict token으로 원본 손상 가능성을 줄인다.
- write 실패 시 기존 파일을 보존하며 자동 복구 명목으로 빈 문서를 덮어쓰지 않는다.
- Personal migration이 없으므로 CLI 제거 후에도 기존 Extension Personal note는 그대로 남는다.
- 향후 공통 코어 작업에서 회귀가 발생하면 공통화 PR만 revert할 수 있어야 하며 CLI 초기 격리 구조로 돌아갈 수 있어야 한다.

## 20. 후속 결정이 필요한 항목

다음 항목은 목표를 바꾸지 않지만 구현 Issue에서 근거와 함께 확정해야 한다.

- TypeScript/JavaScript reference Language Server와 지원 version
- CLI npm package 이름과 배포 채널
- provider executable 자동 탐색 허용 범위
- `.impact-lens/notes.local.json`의 정확한 ignore 관리 방식
- Shared note의 unknown field 보존을 위한 parser/serializer 방식
- source fragment 최대 크기와 중복 제거 구조
- timeout 기본값과 child process 종료 grace period
- 향후 read-only VS Code bridge 필요 여부
- 여러 workspace folder를 가진 repository의 target 표현

이 항목들은 임의의 기본값으로 기존 저장소나 Extension 동작을 변경해서는 안 된다.

## 21. 작업 로그

### 2026-08-24 — 현재 구현 조사 및 목표 정리

- `AGENTS.md`, `package.json`, README, 개발 가이드와 기존 작업 문서 형식을 확인했다.
- `src/impactAnalyzer.ts`가 VS Code Call Hierarchy, diagnostics 및 configuration에 결합되어 있음을 확인했다.
- `src/callGraph.ts`의 BFS 개념은 재사용 가능하지만 `types.ts`가 VS Code 타입을 포함하므로 초기 CLI에서 무리하게 공통 모듈로 추출하지 않기로 했다.
- `src/noteStore.ts`에서 Personal은 VS Code `workspaceState`, Shared는 `.impact-lens/notes.json`, Source는 `@impact-note` comment로 저장됨을 확인했다.
- Personal storage에 standalone CLI가 안정적으로 접근할 공개 계약이 없으므로 직접 database 접근과 자동 migration을 범위에서 제외했다.
- Agent 전용 compact JSON, note CRUD, completeness/limitations, mutation preview 및 conflict 보호 요구를 본 문서에 반영했다.
- 기존 Extension 장애 우려를 반영해 별도 package, VSIX 제외, 단계별 gate 및 후속 공통화 원칙을 명시했다.
- 먼저 개발 목표 문서를 독립 커밋으로 원격 브랜치에 게시하고, 사용자의 후속 요청에 따라 같은 기능 브랜치에서 구현과 릴리스 작업을 계속한다.

### 2026-08-24 — 문서 검증

- 배경, 범위, 안전 아키텍처, 명령과 JSON 계약, note CRUD, 제한 사항, 단계별 계획, 테스트, 완료 기준 및 롤백 전략이 포함됐는지 검토했다.
- `git diff --check`: 공백 오류 없음.
- 이 시점에는 문서 외 코드, 설정, version 및 package artifact를 변경하지 않았다.
- 사용자가 문서 완료 후 실제 구현, push, PR, merge 및 release까지 진행하도록 범위를 확대했다. 구현 결과와 계획 차이는 이후 로그에 계속 기록한다.

### 2026-08-25 — 구현 범위 확정 및 Issue 등록

- 구현과 릴리스 추적을 위해 GitHub Issue #11을 등록했다.
- Issue가 생성됨에 따라 저장소 규칙에 맞게 문서 경로를 `docs/work/issue-11-agent-cli.md`로 변경했다.
- 첫 정식 CLI와 Extension release version은 하위 호환 기능 추가에 해당하므로 v0.4.0을 목표로 한다.
- TypeScript/JavaScript reference provider는 표준 LSP Call Hierarchy를 사용하는 독립 process로 구현한다.
- 구현은 `cli/` package, root workspace/build scripts, VSIX 제외 설정, Agent CLI 문서와 release metadata로 한정한다. 기존 `src/**` Extension runtime과 Personal note storage는 변경하지 않는다.

### 2026-08-25 — 독립 CLI와 LSP 분석 구현

- `cli/`에 별도 package, TypeScript config, MIT license, README 및 version 1 request/response JSON Schema를 추가했다.
- `cli/src/jsonRpc.ts`에 stdio `Content-Length` framing, request timeout, notification 수신, stderr 격리 및 graceful shutdown을 포함한 JSON-RPC client를 구현했다.
- `cli/src/lspProvider.ts`가 독립 `typescript-language-server` process를 실행하고 LSP initialize, didOpen, prepareCallHierarchy, incomingCalls 및 publishDiagnostics를 처리하도록 구현했다.
- 기본 provider는 TypeScript/JavaScript를 지원하고 custom provider 설정은 shell 평가 없이 executable, argument array 및 languageId를 받는다.
- `cli/src/impact.ts`에 caller-to-callee 역방향 BFS, cycle/deduplication, depth/node truncation, call-site, 1-based range, deterministic symbol ID/order, source fragment, diagnostics 및 limitation metadata를 구현했다.
- root target이 여러 개인 경우 첫 후보를 임의 선택하지 않고 expected symbol과 비교하며, 여전히 모호하면 candidate를 포함한 `target_ambiguous` 오류를 반환한다.
- macOS의 `/var`와 `/private/var`처럼 lexical path와 realpath가 다른 경우를 발견해 workspace와 target을 realpath로 canonicalize했다. 이 보정 전에는 실제 caller가 workspace 밖으로 잘못 표시되는 통합 테스트 실패가 있었다.
- `src/**`를 import하거나 수정하지 않았으며 CLI traversal과 test-path 판별은 초기 격리 원칙에 따라 독립 구현했다.

### 2026-08-25 — Note CRUD와 mutation 안전장치 구현

- `cli/src/notes.ts`에 Shared, Source comment 및 CLI Local note의 get/list/set/delete를 구현했다.
- Shared는 기존 `.impact-lens/notes.json` version 1 identity와 fuzzy match 의미를 유지하고, 알 수 없는 top-level 및 entry field를 보존한다.
- CLI Local은 `.impact-lens/notes.local.json`을 사용한다. 현재 저장소 `.gitignore`에 이를 추가했고, 대상 저장소에서 ignore되지 않았으면 `local_note_file_not_git_ignored` warning을 반환한다.
- Source comment는 지원 확장자별 `//`, `#`, `--` prefix, declaration 위 5줄 탐색, indentation, CRLF/LF 및 마지막 newline을 보존한다.
- mutation은 preview가 기본이며 apply에는 직전 preview/get의 SHA-256 conflict token이 필요하다. create/update는 upsert, delete는 별도 idempotent 명령으로 분리했다.
- Shared/Local은 temporary file과 rename, Source는 전체 file replacement를 사용하며 기존 file mode를 보존한다.
- file/document가 조회 후 바뀌었거나 expected symbol이 달라지면 overwrite하지 않고 conflict를 반환한다.
- realpath 기준 workspace 밖으로 이어지는 symlink source mutation을 거부한다.
- 결과에 before/after, applied/changed, effective note 전후, 새 conflict token 및 warning을 포함한다.
- 기존 VS Code Personal note는 읽거나 쓰거나 migration하지 않고 모든 note 응답에서 `vscode_personal_notes_unavailable`을 명시한다.
- 분석 중 같은 Shared/Local document를 node마다 다시 읽지 않도록 per-analysis cache를 추가하고 mutation 적용 후 invalidate한다.

### 2026-08-25 — 명령, 문서, version 및 package 구성

- `cli/src/index.ts`에 `analyze`, `note get`, `note list`, `note set`, `note delete`와 option/stdin JSON parsing을 구현했다.
- 성공은 stdout compact JSON 하나, 실패는 stderr compact JSON 하나로 제한하고 exit code 0/2/3/4/5/6/10 계약을 적용했다.
- root pnpm workspace에 `cli`를 추가하고 `cli:build`, `cli:test`, `test:all` script를 추가했다. script 내부 package 실행은 직접 pnpm binary가 없는 환경도 지원하도록 npm lifecycle을 사용한다.
- root/CLI package version, CHANGELOG 및 문서를 v0.4.0으로 갱신했다.
- README와 `docs/DEVELOPMENT.md`에 Agent CLI 명령, stdin JSON, note scope, conflict token, build/test/package 절차 및 제한을 반영했다.
- CLI release tarball은 runtime `dist/*.js`, README, schema와 license만 포함하고 source/test output은 포함하지 않도록 package `files`를 제한했다.

### 2026-08-25 — 테스트 및 회귀 검증

- CLI test 16개를 구현했다.
  - compact stdout/stderr, validation error, unknown field/option 및 provider failure contract 4개
  - direct/transitive/test, cycle, depth/node limit, dangling edge 방지 및 ambiguity graph contract 4개
  - 실제 TypeScript Language Server cross-file incoming-call integration 1개
  - Shared CRUD/unknown field/conflict, Local, symlink, Source CRUD 및 source list 7개
- CLI 13개 시점의 전체 테스트를 실제 Language Server integration을 포함해 3회 연속 실행했고 모두 통과했다. 이후 final audit에서 추가한 3개 회귀 테스트까지 포함한 최종 CLI 16개도 모두 통과했다.
- `npm run test:all`: Extension 32개와 CLI 16개, 총 48개 테스트 모두 통과.
- 최종 감사에서 node 제한 때문에 수집하지 않은 caller의 edge가 먼저 추가돼 dangling edge가 될 수 있는 순서 문제를 발견했다. unseen node는 node cap을 통과한 뒤에만 edge와 node를 함께 추가하도록 수정하고 전용 테스트를 추가했다.
- Agent option과 stdin JSON의 unknown/duplicate field를 무시하면 오타가 잘못된 기본 동작으로 이어질 수 있어 operation별 allowlist validation을 추가했다.
- Language Server executable이 없거나 initialize에 실패한 경우 stdin error나 장시간 dispose 대기 없이 `provider_unavailable`, exit 5를 반환하도록 JSON-RPC child lifecycle을 보강했다.
- `git diff --check`: 공백 오류 없음.
- JSON request/response schema를 Node JSON parser로 검증했다.
- 실제 CLI로 `src/callGraph.ts`의 `traverseIncoming`을 depth 2로 분석해 cross-file Direct/Transitive/Test node, caller-to-callee edge, call-site, source declaration, note layer와 depth truncation을 compact JSON으로 확인했다.
- 실제 CLI로 같은 symbol의 `note get`과 Shared `note set` preview를 실행해 1-based target identity, conflict token, effectiveBefore/effectiveAfter를 확인했으며 apply하지 않아 repository note file은 생성되지 않았다.
- 첫 VSIX package에는 pnpm workspace의 CLI production dependency가 잘못 따라 들어가 9,105 files, 23.69MB가 포함됐다. `node_modules/**`와 `cli/**`를 `.vscodeignore`에서 명시적으로 제외한 뒤 재패키징했다.
- 최종 `/tmp/impact-lens-0.4.0.vsix`: 25 files, 126.13KB. CLI, node_modules, docs, source 및 test output이 포함되지 않았다.
- v0.3.3과 v0.4.0 VSIX의 `extension/out` 디렉터리를 파일별 비교했고 차이가 없었다. CLI 추가로 기존 Extension runtime JavaScript가 변경되지 않았음을 확인했다.
- 최종 `/tmp/impact-lens-cli-0.4.0.tgz`: 12 files, 17.9KB. CLI test와 TypeScript source는 포함되지 않았다.
- CLI tarball을 새 `/tmp` prefix에 실제 설치했고 설치된 `impact-lens` binary로 `traverseIncoming` 분석에 성공했다. package dependency와 bin entry가 실제 artifact에서도 동작함을 확인했다.
- root workspace에서 `pnpm audit --prod`를 실행하면 workspace directory key `cli`를 2016년의 별도 npm package `cli <1.0.0`으로 오인해 GHSA-6cpc-mj5c-m9rq를 보고했다. lockfile과 dependency graph에는 해당 package가 없다.
- 실제 release tarball을 새 prefix에 설치해 생성된 production dependency tree를 `npm audit --omit=dev`로 검사했으며 `found 0 vulnerabilities`를 확인했다. 따라서 workspace audit 1건은 `@impact-lens/cli` dependency의 취약점이 아닌 importer path false positive로 기록한다.
- 최종 VSIX SHA-256: `8ff88d9c9618b29092b91c5f8570fc8343e224f89a4d427721ce6ba4d9f65d6d`.
- 최종 CLI tarball SHA-256: `34e8e945e55ca935b180fcd9f9a37311e87fb10a9cb9b54283dc57bb37cf5e39`.

### 2026-08-25 — 계획과 실제 구현 차이 및 제한

- 초기 reference provider를 조사 단계에서 미확정으로 두었으나 구현에서는 `typescript-language-server` 6.0.0과 TypeScript 5.9.x를 선택했다. 실제 표준 Call Hierarchy integration test가 가능하고 별도 VS Code process가 필요 없기 때문이다.
- 상세 명세의 분리된 initialize/index/traversal timing 대신 첫 릴리스에서는 정확히 측정 가능한 total timing만 제공한다. Language Server별 indexing completion 신호가 표준화되지 않아 허위 세부 timing을 만들지 않기 위함이며 후속 측정 항목으로 남긴다.
- Source `note list`는 명시적 source scan에서 file, line, text를 반환하지만 모든 언어의 declaration symbol과 자동 연결하지 않는다. 특정 Source note CRUD는 provider로 target symbol을 다시 확인한다.
- CLI Local은 Extension Personal과 통합하지 않는다. CLI Local을 Extension Graph에 표시하는 기능도 이번 범위가 아니다.
- custom LSP는 command/args/languageId를 지원하지만 server-specific initialization options와 settings adapter는 제공하지 않는다.
- 현재 환경에는 `code` CLI가 없어 새 VSIX를 Extension Development Host에서 수동 실행하지 못했다. 이 항목은 성공으로 간주하지 않는다. 대신 기존 Extension source 무변경, 32개 회귀 테스트, v0.3.3/v0.4.0 runtime byte comparison과 VSIX content 검증으로 자동 근거를 확보했다.
