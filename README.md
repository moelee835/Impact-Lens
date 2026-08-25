# Impact Lens

Impact Lens는 현재 수정하려는 함수의 호출자와 잠재 영향 범위를 VS Code 안에서 탐색하는 로컬 확장 프로그램입니다. 별도 AI 에이전트나 클라우드 분석 없이, 현재 언어 확장이 제공하는 Call Hierarchy를 사용합니다.

Extension과 Agent CLI의 요구 사항, 다운로드, 설치, 업데이트, 제거 및 checksum 확인은 [Impact Lens 설치 가이드](INSTALL.md)를 참고하세요.

## v0.4.0 기능

- 커서가 위치한 함수의 직접 호출자와 간접 호출자 탐색
- 프로젝트 범위 cross-file 호출 탐색과 기본 분석 depth 5(최대 20)
- 요청한 분석 깊이, 실제 도달 깊이, depth/node 제한 사유 구분
- 테스트 파일에서 발견된 호출자를 별도 분류하고 direct/transitive 호출 거리 유지
- Impact Explorer 트리에서 호출자와 소스 위치 탐색
- 함수 중심 호출 그래프와 분석 깊이/표시 깊이 분리
- 노드 단일 클릭 선택 및 연결 강조, 더블클릭·Enter 코드 이동
- 50%~250% 확대/축소, 화면 맞춤, 초기화 및 드래그 이동
- 실제 표시 노드 기준 compact layout, 최초·root 변경 시 자동 Fit과 중앙 정렬
- Direct·Transitive·Test 노드 표식, 호출 거리 및 현재 표시 개수
- 코드 이동 시 Graph root 유지, 명시적 root 전환 및 이전 root 복귀
- 모든 그래프 노드 아래에 함수 역할 노트 표시
- 코드에 노출되지 않는 Personal 함수 노트
- `.impact-lens/notes.json`을 통한 Shared 함수 노트
- 기존 `@impact-note` 주석 읽기·추가·수정·삭제 호환
- 언어 서버가 본문 위치를 반환해도 함수 선언 위에 고정되는 CodeLens
- 커서 이동 및 문서 저장 시 증분 재분석
- 저장하지 않은 코드 편집 감지와 debounce 기반 라이브 재분석
- `Editing → Analyzing → Current/Partial/Failed` 분석 상태 표시
- 변경 전후 호출 그래프의 추가·제거 영향 비교
- 영향 함수에 발생한 오류·경고 진단 표시
- 코드 변경 후 관련 테스트 결과를 `Outdated`로 표시
- 그래프 노드별 수동 검토 상태
- 동적 호출처럼 언어 서버가 확인하지 못하는 관계는 결과에 포함되지 않는 정적 분석 방식
- 코드 Agent를 위한 독립 `impact-lens` CLI와 compact JSON 응답
- CLI의 TypeScript/JavaScript incoming-call 분석, call-site, source 및 completeness 출력
- Shared·Source comment·CLI Local 함수 노트의 조회, 목록, 입력, 수정 및 삭제
- preview, conflict token 및 명시적 apply로 보호되는 CLI note mutation

## 라이브 변경 영향

소스 문서를 편집하면 기존 그래프는 즉시 `Editing · stale` 상태가 되고, 기본 600ms 동안 추가 입력이 없으면 Call Hierarchy를 다시 요청합니다. 분석 중 문서가 다시 바뀌면 오래된 결과를 폐기하고 최신 문서 버전으로 다시 분석합니다.

그래프와 Impact Explorer에서는 다음 근거를 구분합니다.

- `Changed`: 현재 라이브 세션에서 수정된 함수
- `New impact`: 이전 그래프에는 없었던 호출자
- `Diagnostic`: 영향 함수 범위에 포함된 오류 또는 경고
- `Test verification required`: 코드 변경 이후 현재 실행 결과가 확인되지 않은 관련 테스트
- `Reviewed`: 사용자가 현재 세션에서 수동 검토한 노드

이 정보는 실제 장애 확률이 아니라 검토가 필요한 잠재 영향과 검증 근거입니다. 테스트를 실행하지 않은 상태를 통과로 추정하지 않으며, reflection·동적 호출·이벤트·런타임 의존성 주입처럼 언어 서버가 제공하지 않는 관계는 분석하지 않습니다.

## Graph 사용법

- 노드를 한 번 클릭하거나 Space를 누르면 노드와 직접 연결된 edge가 강조됩니다.
- 노드를 더블클릭하거나 Enter를 누르면 코드로 이동합니다. 이 이동만으로 현재 Graph root는 바뀌지 않습니다.
- 선택한 노드를 새 분석 기준으로 삼으려면 `Set selected as root`를 누릅니다. `Previous root`로 이전 관점에 복귀할 수 있습니다.
- `Analysis`는 언어 서비스에 요청할 탐색 깊이이며 변경 시 재분석합니다. `Visible`은 이미 수집한 결과의 표시 깊이만 즉시 바꿉니다.
- `+`, `−`, `Ctrl/Cmd + wheel`로 확대·축소하고, 빈 공간을 드래그해 이동합니다. `Fit`은 실제 표시 노드의 경계를 화면 중앙에 맞추고 `Reset`은 100%로 되돌립니다.
- 처음 열거나 root를 명시적으로 바꾸면 자동으로 Fit합니다. 같은 root의 live analysis 갱신에서는 선택, 확대 배율, 스크롤 위치를 가능한 범위에서 유지합니다.
- 노드 안의 색상 표식과 `Direct caller`, `Transitive · N hops`, `Test · direct caller/N hops` 문구로 관계를 구분합니다. 좌측 아래 범례는 현재 Visible depth에 실제 표시된 범주별 개수입니다.

## 함수 역할 노트

함수 노트는 세 가지 저장 범위를 함께 사용할 수 있습니다.

1. **Personal**: VS Code 워크스페이스 저장소에 보관되며 프로젝트 파일을 변경하지 않습니다.
2. **Shared**: 프로젝트의 `.impact-lens/notes.json`에 보관되어 Git으로 공유할 수 있습니다.
3. **Source comment**: 기존 `@impact-note` 주석 형식을 유지합니다.

같은 함수에 여러 노트가 있으면 `Personal → Shared → Source comment` 순서로 표시합니다. `Impact Lens: Manage Function Note`에서 개인 재정의, Shared 게시, 기존 주석 편집과 Personal 되돌리기를 선택할 수 있습니다. Personal 노트를 Shared로 게시하면 Shared 파일에 저장한 뒤 Personal 복사본을 제거합니다. Shared 노트를 바탕으로 Personal 노트를 만들 때는 Shared 원본을 유지합니다.

### 기존 소스 주석

기존 노트는 함수 선언 바로 위의 줄 주석으로 작성할 수 있습니다.

```ts
// @impact-note 주문 항목과 세율을 합산해 최종 결제 금액을 계산
export function calculateTotal(items: LineItem[]): Money {
  // ...
}
```

Python에서는 `# @impact-note`, SQL과 Lua에서는 `-- @impact-note`를 사용합니다. 그래프에서는 태그를 제외한 설명만 모든 함수 노드 아래에 표시됩니다. 기존 주석은 자동으로 삭제되거나 변환되지 않으며, 새 노트의 기본 저장 위치는 Personal입니다.

## 설치

v0.4.0은 VS Code Extension용 VSIX와 Agent CLI용 tarball을 별도로 제공합니다.

- [v0.4.0 Release](https://github.com/moelee835/Impact-Lens/releases/tag/v0.4.0)
- [VSIX 다운로드](https://github.com/moelee835/Impact-Lens/releases/download/v0.4.0/impact-lens-0.4.0.vsix)
- [Agent CLI 다운로드](https://github.com/moelee835/Impact-Lens/releases/download/v0.4.0/impact-lens-cli-0.4.0.tgz)

설치 방법과 검증·업데이트·제거 절차는 [INSTALL.md](INSTALL.md)에 정리되어 있습니다.

## 소스에서 개발 실행

1. Node.js 22 LTS 이상을 준비합니다.
2. Corepack으로 pnpm 10을 활성화하고 `pnpm install --frozen-lockfile`을 실행합니다.
3. VS Code에서 이 폴더를 열고 `F5`를 누릅니다.
4. 새 Extension Development Host에서 분석할 프로젝트를 엽니다.
5. 함수에 커서를 두거나 함수 위 CodeLens를 클릭합니다.

사용 가능한 주요 명령:

- `Impact Lens: Show Impact for Current Function`
- `Impact Lens: Open Call Graph`
- `Impact Lens: Manage Function Note`
- `Impact Lens: Refresh`
- `Impact Lens: Clear Live Change Session`

## Agent CLI

CLI는 VS Code Extension process와 분리되어 동작하며 사람용 table이나 interactive prompt를 출력하지 않습니다. 성공 시 stdout에 compact JSON document 하나를 출력하고, 실패 시 stderr에 JSON error 하나와 non-zero exit code를 반환합니다.

Release tarball 설치와 전역 설치 없는 실행 방법은 [설치 가이드](INSTALL.md#3-agent-cli-설치)를 참고하세요. 소스 checkout에서 빌드하고 전체 CLI 테스트를 실행하려면 다음 명령을 사용합니다.

```sh
pnpm run cli:build
pnpm run cli:test
```

TypeScript 또는 JavaScript 함수의 incoming-call 영향을 조회합니다. 모든 외부 좌표는 1-based입니다.

```sh
node cli/dist/index.js analyze \
  --workspace /path/to/project \
  --file src/order.ts \
  --line 42 \
  --column 17 \
  --depth 5 \
  --max-nodes 120
```

Agent 통합에서는 shell escaping을 피할 수 있도록 stdin JSON을 canonical 입력으로 사용합니다.

```sh
node cli/dist/index.js analyze --stdin < analyze-request.json
node cli/dist/index.js note get --stdin < note-get-request.json
node cli/dist/index.js note list --workspace /path/to/project --scope shared
node cli/dist/index.js note set --stdin < note-set-request.json
node cli/dist/index.js note delete --stdin < note-delete-request.json
```

`note set`과 `note delete`는 기본적으로 preview만 반환합니다. 실제 변경에는 `apply: true`와 직전 get/preview가 반환한 `expectedToken`이 모두 필요합니다.

- `shared`: `.impact-lens/notes.json`을 사용하며 Extension과 공유
- `source`: 함수 선언 위 `@impact-note`를 변경
- `local`: Git에서 제외되는 `.impact-lens/notes.local.json`을 사용하며 CLI에서만 조회

기존 Personal note는 VS Code `workspaceState`에 그대로 유지됩니다. standalone CLI는 이를 읽거나 수정하지 않으며 응답의 `capabilities`와 `limitations`에 이 사실을 표시합니다. 저장하지 않은 editor buffer와 동적 호출도 CLI가 실제 부재로 추정하지 않습니다.

CLI 명령, JSON 예제, note scope 및 build 방법은 [CLI README](cli/README.md), 전체 안전 경계와 단계별 목표는 [Issue #11 작업 문서](docs/work/issue-11-agent-cli.md)를 참고하세요.

## 요구 사항

대상 언어의 VS Code 확장이 Call Hierarchy를 제공해야 합니다. Impact Lens는 URI로 파일을 제한하지 않으므로 언어 서비스가 제공한 cross-file 호출자는 프로젝트 전체에서 수집합니다. JavaScript/TypeScript, Java, C/C++, C#, Go, Rust 등은 각 언어 확장의 지원 범위에 따라 동작합니다.

Python/FastAPI에서는 일반 함수의 직접 import 호출은 Python 언어 서버가 Call Hierarchy로 반환하는 범위에서 표시됩니다. 반면 `Depends()`, decorator route 등록, reflection, 문자열 기반 import처럼 런타임 또는 프레임워크가 연결하는 관계는 Call Hierarchy에 없을 수 있으며, Impact Lens가 이를 실제 호출로 추정해 추가하지 않습니다. Graph의 `call hierarchy completed` 표시는 제공자가 반환한 관계가 끝났다는 뜻이지 런타임 호출이 없다는 보장은 아닙니다.

Test 분류는 `test`, `tests`, `spec`, `specs`, `__tests__` 디렉터리와 `.test`/`.spec`, `test_*`/`spec_*`, `*_test`/`*_spec`, `*Test`/`*Tests` 파일 이름 관례를 인식합니다. 다만 테스트 함수가 Graph에 나타나려면 해당 언어 확장이 그 호출을 Call Hierarchy caller로 반환해야 합니다.

## 설정

- `impactLens.maxDepth`: 역방향 호출 분석 깊이, 기본값 5, 범위 1~20
- `impactLens.maxNodes`: 한 번에 표시할 최대 심볼 수, 기본값 120
- `impactLens.autoAnalyzeOnCursorChange`: 커서 이동 시 자동 분석, 기본값 true
- `impactLens.liveAnalysisEnabled`: 저장하지 않은 편집의 라이브 영향 분석, 기본값 true
- `impactLens.liveAnalysisDebounceMs`: 마지막 편집 후 분석 시작 지연, 기본값 600ms
- `impactLens.showCodeLens`: 함수 위 Impact Lens 표시, 기본값 true
- `impactLens.defaultNoteStorage`: 노트 관리 화면에서 먼저 표시할 저장 위치, 기본값 `personal`

## 구조

- `ImpactAnalyzer`: VS Code Call Hierarchy를 이용한 역방향 BFS
- `NoteStore`: Personal·Shared·Source comment 노트의 우선순위, 저장과 편집
- `ImpactTreeProvider`: 사이드바 영향 트리
- `GraphPanel`: 함수 노트가 포함된 로컬 Webview 그래프
- `ImpactCodeLensProvider`: 함수 선언 위 인라인 진입점
- `cli/`: Agent용 독립 JSON CLI, LSP provider 및 note adapter

## 개발 검증

```sh
pnpm run compile
pnpm test
pnpm run cli:test
pnpm run test:all
git diff --check
pnpm exec vsce package --out /tmp/impact-lens-0.4.0.vsix
```

환경 준비, 코드 구조, 반복 테스트, Extension Development Host smoke test, 버전 변경, VSIX 설치 및 릴리스 전 점검은 [Impact Lens 개발 가이드](docs/DEVELOPMENT.md)를 참고하세요.

현재 버전은 함수 호출 관계, 라이브 편집, 언어 진단을 기반으로 잠재 영향 범위를 제공합니다. 데이터 흐름, 런타임 의존성 주입, reflection, 이벤트·라우트 연결과 범용 테스트 결과 수집은 후속 범위입니다.
