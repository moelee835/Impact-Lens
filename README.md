<p align="center">
  <img src="media/impact-lens-readme-hero.png" alt="Impact Lens — code impact analysis" width="100%">
</p>

<p align="center">
  <strong>코드를 바꾸기 전에, 어디까지 영향을 받는지 먼저 확인하세요.</strong><br>
  함수의 직접·간접 호출자, 관련 테스트, 라이브 변경과 함수 노트를 하나의 영향 그래프로 연결합니다.
</p>

<p align="center">
  <a href="https://github.com/moelee835/Impact-Lens/releases/tag/v0.4.0"><img src="https://img.shields.io/badge/Release-v0.4.0-F5B942?style=for-the-badge" alt="Release v0.4.0"></a>
  <a href="INSTALL.md"><img src="https://img.shields.io/badge/VS_Code-1.96%2B-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white" alt="VS Code 1.96+"></a>
  <a href="INSTALL.md#3-agent-cli-설치"><img src="https://img.shields.io/badge/Agent_CLI-Node_22%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Agent CLI Node.js 22+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-2EA44F?style=for-the-badge" alt="MIT License"></a>
</p>

<p align="center">
  <a href="#빠른-설치">빠른 설치</a> ·
  <a href="#무엇을-확인할-수-있나요">주요 기능</a> ·
  <a href="#agent-cli와-codex">Agent & Codex</a> ·
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
</table>

## 빠른 설치

### VS Code Extension

[v0.4.0 VSIX](https://github.com/moelee835/Impact-Lens/releases/download/v0.4.0/impact-lens-0.4.0.vsix)를 내려받아 설치합니다.

```sh
code --install-extension ./impact-lens-0.4.0.vsix --force
```

VS Code를 reload한 뒤 함수 선언 위의 `Show impact`를 선택합니다.

### Agent CLI

```sh
npm install --global \
  https://github.com/moelee835/Impact-Lens/releases/download/v0.4.0/impact-lens-cli-0.4.0.tgz
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

로컬 checkout을 사용하려면 첫 번째 명령의 저장소 대신 `.`을 지정합니다. 요구 사항, checksum, 업데이트와 제거 방법은 **[설치 가이드](INSTALL.md)**에 정리되어 있습니다.

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

## Agent CLI와 Codex

Agent CLI는 사람용 table이나 interactive prompt 대신 stdout에 compact JSON 문서 하나를 반환합니다. 실패는 stderr의 JSON error와 non-zero exit code로 구분합니다.

```sh
impact-lens analyze --stdin < analyze-request.json
impact-lens note get --stdin < note-get-request.json
impact-lens note list --workspace /path/to/project --scope shared
impact-lens note set --stdin < note-set-request.json
impact-lens note delete --stdin < note-delete-request.json
```

`note set`과 `note delete`는 기본적으로 preview만 반환합니다. 실제 변경에는 직전 preview의 최신 `expectedToken`과 명시적인 `apply: true`가 필요합니다.

Codex plugin은 `plugins/impact-lens`에 있으며 다음 요청을 자동으로 Impact Lens CLI workflow에 연결합니다.

```text
Impact Lens로 이 함수의 변경 영향도를 분석해줘.
이 함수의 transitive caller와 관련 테스트를 확인해줘.
Impact Lens Shared 노트를 조회해줘.
이 함수에 Source note를 추가해줘.
```

plugin runner는 현재 checkout에서 빌드된 CLI, 전역 `impact-lens`, 고정된 v0.4.0 release package 순서로 실행 대상을 찾습니다. release fallback의 최초 실행에는 Node.js 22 이상, npm과 네트워크 접근이 필요합니다.

자세한 JSON schema, note CRUD와 exit code 계약은 **[Agent CLI 문서](cli/README.md)**를 참고하세요.

## 분석 경계

> [!IMPORTANT]
> Impact Lens가 보여주는 관계는 언어 서비스의 **정적 Call Hierarchy 결과**입니다. reflection, runtime dependency injection, decorator route, event bus, 문자열 기반 import와 동적 호출처럼 provider가 반환하지 않는 관계는 실제로 존재하더라도 그래프에 없을 수 있습니다.

- VS Code Extension은 대상 언어 확장이 제공하는 Call Hierarchy 범위에서 동작합니다.
- JavaScript/TypeScript CLI에는 `typescript-language-server`가 포함됩니다.
- 다른 언어의 CLI 분석은 표준 LSP Call Hierarchy server command와 `languageId` 설정이 필요합니다.
- Python/FastAPI의 일반 import 호출은 provider 지원 범위에서 나타날 수 있지만 `Depends()`와 decorator routing은 누락될 수 있습니다.
- `complete: true`는 요청한 provider 탐색이 완료되었다는 뜻이며, 런타임 호출이 없다는 보장이 아닙니다.
- 저장하지 않은 editor buffer는 Extension live analysis에는 반영되지만 독립 CLI에서는 사용할 수 없습니다.

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

### 프로젝트 구성

```text
src/                    VS Code Extension, graph와 note 구현
cli/                    독립 Agent CLI와 LSP provider
plugins/impact-lens/    Codex plugin, skill과 CLI runner
media/                  Extension icon과 README hero
docs/                   개발 가이드와 작업 기록
```

전체 개발·패키징 절차는 **[개발 가이드](docs/DEVELOPMENT.md)**를 참고하세요.

## License

Impact Lens는 [MIT License](LICENSE)로 배포됩니다.
