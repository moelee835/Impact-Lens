<p align="center">
  <img src="media/impact-lens-readme-hero.png" alt="Impact Lens — code impact analysis" width="100%">
</p>

<p align="center">
  <strong>코드를 바꾸기 전에, 어디까지 영향을 받는지 먼저 확인하세요.</strong><br>
  함수의 직접·간접 호출자, 관련 테스트, 라이브 변경과 함수 노트를 하나의 영향 그래프로 연결합니다.
</p>

<p align="center">
  <a href="https://github.com/moelee835/Impact-Lens/releases/tag/v0.7.0"><img src="https://img.shields.io/badge/Release-v0.7.0-F5B942?style=for-the-badge" alt="Release v0.7.0"></a>
  <a href="INSTALL.md"><img src="https://img.shields.io/badge/VS_Code-1.96%2B-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="VS Code 1.96+"></a>
  <a href="INSTALL.md#3-agent-cli-설치"><img src="https://img.shields.io/badge/Agent_CLI-Node_22%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Agent CLI Node.js 22+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2EA44F?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#빠른-설치">빠른 설치</a> ·
  <a href="#무엇을-확인할-수-있나요">주요 기능</a> ·
  <a href="#agent-cli와-plugin">Agent & Plugin</a> ·
  <a href="#분석-경계">분석 경계</a> ·
  <a href="#문서">문서</a>
</p>

---

Impact Lens는 함수 변경의 잠재 영향 범위를 탐색하는 **local-first 코드 리뷰 도구**입니다. VS Code의 Call Hierarchy 또는 독립 Language Server를 사용하며, 소스 코드를 별도 클라우드 분석 서비스로 전송하지 않습니다.

<table>
  <tr>
    <td><strong>🔭 VS Code Extension</strong></td>
    <td>CodeLens, Impact Explorer와 상호작용형 Graph UI에서 변경 영향을 탐색합니다.</td>
  </tr>
  <tr>
    <td><strong>⌘ Agent CLI</strong></td>
    <td>호출 관계와 함수 노트를 compact JSON으로 조회하고 자동화합니다.</td>
  </tr>
  <tr>
    <td><strong>✦ Codex Plugin</strong></td>
    <td>Codex가 Impact Lens CLI를 발견하고 안전한 note preview/apply 절차로 사용합니다.</td>
  </tr>
  <tr>
    <td><strong>◇ Claude Code Plugin</strong></td>
    <td>Claude Code에서 skill과 <code>/impact-lens:analyze</code>, <code>/impact-lens:notes</code> 명령으로 같은 CLI를 사용합니다.</td>
  </tr>
</table>

## 빠른 설치

### VS Code Extension

[v0.7.0 VSIX](https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-0.7.0.vsix)를 내려받아 설치합니다.

```sh
code --install-extension ./impact-lens-0.7.0.vsix --force
```

VS Code를 reload한 뒤 함수 선언 위의 `Show impact`를 선택합니다.

### Agent CLI

```sh
npm install --global \
  https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-cli-0.7.0.tgz
```

```sh
impact-lens analyze \
  --workspace /path/to/project \
  --file src/order.ts \
  --line 42 \
  --column 17
```

### Codex Plugin

GitHub 저장소를 marketplace로 등록한 뒤 Impact Lens plugin을 설치합니다.

```sh
codex plugin marketplace add moelee835/Impact-Lens --ref main
codex plugin add impact-lens@personal
```

로컬 checkout을 사용하려면 첫 번째 명령의 저장소 대신 `.`을 지정합니다.

### Claude Code Plugin

GitHub 저장소를 marketplace로 등록한 뒤 Impact Lens plugin을 설치합니다.

```sh
claude plugin marketplace add moelee835/Impact-Lens
claude plugin install impact-lens@impact-lens
```

Claude Code 안에서는 `/plugin marketplace add moelee835/Impact-Lens`와 `/plugin install impact-lens@impact-lens`를 사용할 수 있습니다. 로컬 checkout을 사용하려면 저장소 대신 `./`을 지정합니다.

요구 사항, checksum, 업데이트와 제거 방법은 **[설치 가이드](INSTALL.md)**에 정리되어 있습니다.

## 무엇을 확인할 수 있나요?

| 기능 | 제공하는 정보 |
| --- | --- |
| **변경 영향 그래프** | 프로젝트 전체의 direct·transitive caller, call site와 hop distance |
| **관련 테스트 식별** | 일반 호출자와 Test caller를 구분하고 direct/transitive test distance 유지 |
| **라이브 변경 추적** | 저장하지 않은 편집을 감지해 `Editing → Analyzing → Current/Partial/Failed` 상태 표시 |
| **변경 전후 비교** | 새로 추가되거나 제거된 caller와 edge를 `New impact` 등으로 구분 |
| **검증 근거** | 영향 함수의 새 오류·경고, 실행 이후 오래된 테스트, 수동 `Reviewed` 상태 |
| **함수 역할 노트** | Personal, Shared, Source comment와 CLI Local note를 목적에 맞게 관리 |
| **에이전트 자동화** | 안정된 JSON envelope, 결정적 node/edge 순서, capability와 limitation 출력 |
| **Provider 선택과 진단** | custom > preset > project > Auto 순서의 provider 선택, `doctor <preset>`의 check별 pass/warn/fail |

### 코드에서 그래프까지

```text
함수 선택
   ↓
Call Hierarchy로 incoming caller 수집
   ↓
Direct · Transitive · Test 관계 분류
   ↓
Graph / Explorer / JSON으로 검토
   ↓
진단 · 테스트 · 노트와 함께 변경 계획 수립
```

Impact Lens는 기본 depth 5, 최대 depth 20까지 역방향 호출 관계를 탐색합니다. 요청 깊이, 실제 도달 깊이, node/depth 제한을 별도로 표시하므로 “분석 완료”와 “제한 때문에 중단”을 구분할 수 있습니다.

## 리뷰를 위한 Graph UI

- 노드를 한 번 클릭하면 해당 노드와 직접 연결된 edge가 강조됩니다.
- 노드를 더블클릭하거나 Enter를 누르면 코드로 이동하지만 현재 Graph root는 유지됩니다.
- `Set selected as root`로 분석 관점을 명시적으로 바꾸고 `Previous root`로 이전 관점에 복귀합니다.
- `Analysis` depth는 언어 서비스 탐색 범위, `Visible` depth는 이미 수집한 결과의 표시 범위를 제어합니다.
- 확대·축소, `Ctrl/Cmd + wheel`, drag pan, `Fit`, `Reset`을 지원합니다.
- 최초 열기와 root 변경 시 그래프를 자동으로 fit하고 중앙에 배치합니다. 같은 root의 live update에서는 선택과 viewport를 가능한 범위에서 유지합니다.
- 모든 노드에 Direct·Transitive·Test 관계, hop count, 함수 노트와 새 diagnostic을 함께 표시합니다.

## 라이브 변경 영향

소스 편집이 시작되면 기존 그래프는 즉시 `Editing · stale`로 표시됩니다. 기본 600ms 동안 추가 입력이 없으면 다시 분석하며, 분석 도중 문서가 변경되면 오래된 결과를 버리고 최신 버전으로 재시도합니다.

| 표시 | 의미 |
| --- | --- |
| `Changed` | 현재 라이브 세션에서 수정된 함수 |
| `New impact` | 이전 snapshot에는 없었던 호출자 또는 edge |
| `Diagnostic` | 영향 함수에 새로 발생한 오류 또는 경고 |
| `Test verification required` | 코드 변경 이후 현재 실행 결과가 확인되지 않은 관련 테스트 |
| `Reviewed` | 현재 분석 root에서 사용자가 검토 완료로 표시한 노드 |

이 정보는 실제 장애 확률이 아니라 **검토와 검증이 필요한 잠재 영향의 근거**입니다. Impact Lens는 테스트를 실행하지 않은 상태를 성공으로 추정하지 않습니다.

## 함수 노트

| Scope | 저장 위치 | 공유 | Extension | CLI |
| --- | --- | --- | --- | --- |
| **Personal** | VS Code `workspaceState` | 개인 | 읽기·쓰기 | 접근 불가 |
| **Shared** | `.impact-lens/notes.json` | Git 공유 | 읽기·쓰기 | 읽기·쓰기 |
| **Source comment** | 선언 위 `@impact-note` | 소스와 공유 | 읽기·쓰기 | 읽기·쓰기 |
| **Local** | `.impact-lens/notes.local.json` | Git 제외 | 접근 불가 | 읽기·쓰기 |

같은 함수에 여러 노트가 있으면 Extension은 `Personal → Shared → Source comment` 순서로 표시합니다. 기존 주석도 그대로 사용할 수 있습니다.

```ts
// @impact-note 주문 항목과 세율을 합산해 최종 결제 금액을 계산
export function calculateTotal(items: LineItem[]): Money {
  // ...
}
```

Python은 `# @impact-note`, SQL과 Lua는 `-- @impact-note`를 지원합니다. 기존 주석은 자동으로 삭제하거나 다른 저장 방식으로 변환하지 않습니다.

## Agent CLI와 Plugin

Agent CLI는 사람용 table이나 interactive prompt 대신 stdout에 compact JSON 문서 하나를 반환합니다. 실패는 stderr의 JSON error와 non-zero exit code로 구분합니다.

```sh
impact-lens analyze --stdin < analyze-request.json
impact-lens doctor bundled-typescript --smoke
impact-lens note get --stdin < note-get-request.json
impact-lens note list --workspace /path/to/project --scope shared
impact-lens note set --stdin < note-set-request.json
impact-lens note delete --stdin < note-delete-request.json
```

`note set`과 `note delete`는 기본적으로 preview만 반환합니다. 실제 변경에는 직전 preview의 최신 `expectedToken`과 명시적인 `apply: true`가 필요합니다.

### Provider 선택 순서

CLI는 아무것도 설정하지 않아도 TypeScript/JavaScript 파일에서는 요청마다 provider를 자동으로 고릅니다
(Auto). provider를 고르는 순서는 매 요청 고정돼 있고, 이 순서 중 먼저 조건을 만족하는 하나만 쓰입니다. 이
순서를 벗어나 다른 언어의 provider로 조용히 대체되는 경우는 없습니다.

1. 요청의 raw `provider`(`command`/`args`/`languageId`) — 가장 구체적인 지정이 항상 이깁니다.
2. 요청의 `providerPreset` — catalog에 있는 preset id를 이름으로 지정합니다.
3. 워크스페이스의 `.impact-lens/provider.json` — 프로젝트가 커밋해 공유하는 선택입니다.
4. 검증된 auto-discovery — 감지된 언어를 지원한다고 catalog에 선언된 preset이 정확히 하나뿐이고 그 실행
   파일을 찾을 수 있을 때만 선택됩니다.
5. 위 네 단계 모두 실패하면 다른 언어의 provider로 대체하지 않고 `provider_required_for_language`로
   실패합니다.

**오늘 shipped catalog에는 preset이 세 개입니다: `bundled-typescript`, `gopls`, `bundled-pyright`.**
Auto가 설정 없이 동작하는 언어는 TypeScript/JavaScript(`.ts`, `.tsx`, `.js`, `.jsx` 등)와
Python(`.py`)이고, `gopls`가 PATH에 설치돼 있는 경우의 Go(`.go`)도 여기 더해집니다. `bundled-typescript`와
`bundled-pyright`는 CLI 자체에 포함돼 있어(`bundled` tier) 사용자가 아무것도 설치하지 않아도 동작하고,
`gopls`는 `verified-external` tier라 사용자가 gopls를 직접 설치해야 Auto가 그 실행 파일을 찾습니다. 그
외 언어는 "곧 지원 예정"이 아니라 **오늘 검증된 preset이 없어서 항상 provider를 직접 설정해야 하는
상태**입니다. C/C++가 다음 preset 후보이고, 실제 fixture 검증을 통과해 catalog에 들어오기 전까지는 그
언어가 `verified-external`로 표시되지 않습니다. 지원되지 않는 언어에서는 아래처럼 표준 LSP Call
Hierarchy provider를 요청에 직접 지정합니다.

```json
{
  "provider": {
    "command": "/absolute/path/to/language-server",
    "args": ["--stdio"],
    "languageId": "python"
  }
}
```

### `doctor <preset>`로 provider 진단

`doctor`는 이제 `bundled-typescript`뿐 아니라 catalog의 어떤 preset id도 받는 일반 명령입니다.

```sh
impact-lens doctor bundled-typescript
impact-lens doctor bundled-typescript --smoke
impact-lens doctor bundled-typescript --fixture
```

`preflight`(기본)는 Node 엔진, CLI package, provider 실행 파일/artifact, 버전, 언어 일치, settings 키,
`.impact-lens/provider.json` 유효성을 확인합니다. `--smoke`는 실제로 서버를 시작해 initialize와 advertised
capability를 추가로 확인하고, `--fixture`는 preset이 선언한 fixture로 실제 Call Hierarchy 결과까지
검증합니다. 각 check는 `pass`/`warn`/`fail`을 독립적으로 보고하며 **첫 실패에서 멈추지 않으므로** 실행 파일
누락, 지원하지 않는 버전, 언어 불일치, capability 부재, fixture 실패를 한 응답에서 모두 구분할 수 있습니다.

**doctor로 진단할 수 있는 대상은 catalog에 등록된 preset뿐입니다.** 요청의 raw `provider`처럼 preset이 아닌
custom provider는 `doctor`로 점검할 수 없고, catalog에 없는 id를 주면 provider를 전혀 진단하지 않고
`invalid_command`로 즉시 끝납니다.

### `.impact-lens/provider.json`과 요청 단위 override

워크스페이스에 `.impact-lens/provider.json`을 커밋하면 그 프로젝트를 여는 모든 요청이 매번 provider를
반복해서 지정하지 않아도 됩니다. 허용 필드는 다음 6개뿐이며 그 밖의 필드가 있으면 파일 전체가
`provider_config_invalid`로 거부됩니다.

| 필드 | 의미 |
| --- | --- |
| `presetId` | catalog preset id 이름 지정 |
| `command` / `args` | custom provider의 실행 파일과 인자(상대 경로만 허용) |
| `languageId` | provider에 알릴 languageId 강제 지정 |
| `initializationOptions` / `settings` | preset보다 우선 적용되는 초기화 옵션·설정 |

요청 JSON도 같은 두 필드(`initializationOptions`, `settings`)를 받아 `preset < project < request` 순서로
병합합니다. `token`, `secret`, `password`, `credential`, `api key`, `auth`가 key 이름에 포함된 값(4자 이상)과
preset이 직접 지정한 민감 경로는 로그와 실패 요약에서 자동으로 가려집니다.

Codex plugin과 Claude Code plugin은 같은 `plugins/impact-lens` payload를 공유합니다. 두 plugin 모두 `impact-lens-cli` skill과 안전한 CLI runner를 사용하므로 다음 요청이 자동으로 Impact Lens CLI workflow에 연결됩니다.

```text
Impact Lens로 이 함수의 변경 영향도를 분석해줘.
이 함수의 transitive caller와 관련 테스트를 확인해줘.
Impact Lens Shared 노트를 조회해줘.
이 함수에 Source note를 추가해줘.
```

Claude Code에서는 slash command로도 직접 실행할 수 있습니다.

```text
/impact-lens:analyze calculateTotal
/impact-lens:notes list
```

plugin runner는 현재 checkout에서 빌드된 CLI, 전역 `impact-lens`, 고정된 v0.7.0 release package 순서로 실행 대상을 찾습니다. 응답의 `runtime.runner.source`로 실제 선택 경로를 확인할 수 있고, bundled TypeScript/JavaScript는 `doctor bundled-typescript --smoke`로 별도 provider 설정 없이 점검합니다. release fallback의 최초 실행에는 Node.js 22 이상, npm과 네트워크 접근이 필요하며, 이 단계의 실패도 raw npm 출력이 아니라 단일 JSON 오류로 보고됩니다.

| Host | Manifest | Marketplace |
| --- | --- | --- |
| Codex | `plugins/impact-lens/.codex-plugin/plugin.json` | `.agents/plugins/marketplace.json` |
| Claude Code | `plugins/impact-lens/.claude-plugin/plugin.json` | `.claude-plugin/marketplace.json` |

자세한 JSON schema, note CRUD와 exit code 계약은 **[Agent CLI 문서](cli/README.md)**를 참고하세요.

## 분석 경계

> [!IMPORTANT]
> Impact Lens가 보여주는 관계는 언어 서비스의 **정적 Call Hierarchy 결과**입니다. reflection, runtime dependency injection, decorator route, event bus, 문자열 기반 import와 동적 호출처럼 provider가 반환하지 않는 관계는 실제로 존재하더라도 그래프에 없을 수 있습니다.

- VS Code Extension은 대상 언어 확장이 제공하는 Call Hierarchy 범위에서 동작합니다.
- JavaScript/TypeScript CLI에는 `typescript-language-server`가 포함됩니다.
- 다른 언어의 CLI 분석은 표준 LSP Call Hierarchy server command와 `languageId` 설정이 필요합니다.
- CLI는 대상 파일 언어와 맞지 않는 bundled provider를 실행하지 않으며, provider의 discovery/launch/
  initialize/capability/query 실패를 서로 다른 오류로 반환합니다.
- Python/FastAPI의 일반 import 호출은 provider 지원 범위에서 나타날 수 있지만 `Depends()`와 decorator routing은 누락될 수 있습니다.
- `provider`에는 선택 근거와 advertised/observed capability가, `coverage`에는 traversal/semantic/indexing
  범위가 기록됩니다. Extension은 VS Code 공개 API가 실제 provider identity를 노출하지 않으므로 이름을
  `unknown`으로 표시합니다.
- CLI/Plugin 응답의 `runtime`은 CLI·Node version과 runner 선택 source를 경로·credential 없이 기록합니다.
- 저장하지 않은 editor buffer는 Extension live analysis에는 반영되지만 독립 CLI에서는 사용할 수 없습니다.

### `complete: true`가 증명하지 않는 것

`complete: true`는 **요청한 정적 traversal이 depth/node 제한 없이 끝났다**는 뜻만 담습니다(schema v1에서
`coverage.traversal.status: "complete"`와 `completion.traversalStatus: "exhausted"`의 하위 호환
표현입니다). 이것이 무효화하지 않는 두 가지가 있습니다.

- `coverage.semantic.status`: 오늘 유일하게 가능한 값은 `static-only`입니다. reflection, runtime
  dependency injection, decorator routing, event bus, 문자열 기반 import처럼 provider가 정적으로 추론하지
  못하는 관계는 `complete: true`여도 그래프에 없을 수 있습니다.
- `coverage.indexing.status`: `unknown` / `working` / `ready` 셋 중 하나입니다. `bundled-typescript`와
  `bundled-pyright`는 색인 상태를 선언하지 않으므로 TypeScript/JavaScript·Python 분석에서는 여전히
  `unknown`만 나옵니다(pyright는 색인 진행 신호를 실제로 보내지만 지금 CLI 호출 순서에서는 그 신호가
  구조적으로 도착할 수 없다는 것을 실측으로 확인했습니다 — 신호가 없어서가 아니라 도달 불가능해서
  뺐습니다) — `unknown`은 "provider가 색인이 끝났다고 증명하지 않았다"는 뜻이라 caller 0개인 결과가
  "callee 없음"의 증거가 되지 못합니다. `gopls`는 `readiness`를 선언하므로, Go 프로젝트를 gopls로
  분석하면 `working`/`ready`가 실제로 나타납니다 — 사용자가 요청 JSON이나 `.impact-lens/provider.json`을
  직접 건드릴 필요 없이, gopls가 설치돼 있고 색인이 끝났는지 여부만으로 결정됩니다.
- `limitationDetails`의 `provider_null_incoming_calls`: 특정 provider 하나의 한계가 아니라 **모든
  provider**에 적용되는 응답 계약입니다. LSP `callHierarchy/incomingCalls`는 명시적 빈 배열 `[]`과
  `null`을 구분해 반환할 수 있는데, `null`은 "호출자가 없다고 확정한다"는 뜻이 아닙니다. Impact Lens는
  이 차이를 응답에서 지우지 않고 `provider_null_incoming_calls`로 남깁니다 — `indexingStatus: ready`
  아래에서도 사라지지 않습니다(색인 완성 여부와 이 질의 하나의 답은 별개이기 때문입니다). caller
  0개인 결과에 이 코드가 있으면 "이 함수를 아무도 호출하지 않는다"로 요약하지 마세요 — FastAPI의
  `Depends()`처럼 정적 Call Hierarchy가 볼 수 없는 경로로 실제로 호출되고 있을 수 있습니다.

`complete: true`인 빈 결과(caller 0개)를 보고 **"안전하게 지워도 된다", "영향 없음", "완전히 분석됨", "모든
호출자를 확인함"**으로 결론짓지 마세요. 정적 Call Hierarchy 근거는 그 결론이 요구하는 runtime/색인
완전성을 증명하지 않습니다. 이 어휘는 Codex/Claude Code plugin의 응답 정책과 동일하며(plugin 쪽 근거는
[`cli-contract.md`](plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md) 참고), plugin은
같은 결론을 내는 응답이 eval에서 실패하도록 고정돼 있습니다.

## 설정

| 설정 | 기본값 | 범위 / 설명 |
| --- | --- | --- |
| `impactLens.maxDepth` | `5` | incoming-call 분석 깊이, 1-20 |
| `impactLens.maxNodes` | `120` | 한 분석의 최대 symbol 수, 10-1000 |
| `impactLens.autoAnalyzeOnCursorChange` | `true` | 커서가 다른 함수로 이동하면 자동 분석 |
| `impactLens.liveAnalysisEnabled` | `true` | 저장하지 않은 편집의 영향 재분석 |
| `impactLens.liveAnalysisDebounceMs` | `600` | 마지막 편집 후 분석 대기 시간, 150-3000ms |
| `impactLens.showCodeLens` | `true` | 함수 선언 위 note와 `Show impact` 표시 |
| `impactLens.defaultNoteStorage` | `personal` | 새 노트 관리 화면의 기본 저장 위치 |
| `impactLens.provider.detailLevel` | `summary` | `summary`는 결과 수·traversal 상태·semantic scope만, `verbose`는 provider 이름·lifecycle stage·전체 reason code까지 표시 |
| `impactLens.provider.doctorCommandLine` | (빈 문자열) | `Impact Lens: Run Provider Doctor`가 확인 후 터미널에서 제안할 Agent CLI 점검 명령. User 설정 전용(machine scope)이라 워크스페이스가 대신 채울 수 없고, Impact Lens는 이 명령을 자동으로 실행하거나 출력을 읽지 않습니다 |

`Impact Lens: Run Provider Doctor` 명령은 호스트가 직접 관측한 사실(현재 커서 위치에서 Call Hierarchy root를
찾았는지, document symbol이 있는지, 마지막 분석의 provider/coverage)을 Output 채널에 출력합니다. "caller가
없음"과 "provider 자체가 없음"은 VS Code 공개 API로 구분할 방법이 없어 하나의 안내로 병합되고, "그래프가
아예 없음"과 "그래프는 있지만 일부 결과"는 서로 다른 안내로 구분됩니다.

## 문서

| 문서 | 내용 |
| --- | --- |
| **[설치 가이드](INSTALL.md)** | VSIX·CLI 요구 사항, 설치, checksum, 업데이트, 제거, 문제 해결 |
| **[Agent CLI Reference](cli/README.md)** | 분석 요청, note CRUD, JSON contract, provider와 exit code |
| **[개발 가이드](docs/DEVELOPMENT.md)** | 환경 구성, 빌드, 테스트, VSIX·CLI package, release 점검 |
| **[Changelog](CHANGELOG.md)** | 버전별 변경 사항 |
| **[Releases](https://github.com/moelee835/Impact-Lens/releases)** | VSIX와 Agent CLI 배포 artifact |
| **[Issues](https://github.com/moelee835/Impact-Lens/issues)** | 버그, 개선 제안과 계획 |

## 개발

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run test:all
```

VS Code에서 저장소를 열고 `F5`를 누르면 Extension Development Host가 시작됩니다. 주요 명령은 다음과 같습니다.

- `Impact Lens: Show Impact for Current Function`
- `Impact Lens: Open Call Graph`
- `Impact Lens: Manage Function Note`
- `Impact Lens: Refresh`
- `Impact Lens: Clear Live Change Session`
- `Impact Lens: Run Provider Doctor`

### 프로젝트 구성

```text
src/                    VS Code Extension, graph와 note 구현
cli/                    독립 Agent CLI와 LSP provider
plugins/impact-lens/    Codex·Claude Code plugin, skill, command와 CLI runner
.agents/                Codex marketplace 정의
.claude-plugin/         Claude Code marketplace 정의
media/                  Extension icon과 README hero
docs/                   개발 가이드와 작업 기록
```

전체 개발·패키징 절차는 **[개발 가이드](docs/DEVELOPMENT.md)**를 참고하세요.

## License

Impact Lens는 [MIT License](LICENSE)로 배포됩니다.
