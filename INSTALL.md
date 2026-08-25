# Impact Lens 설치 가이드

Impact Lens는 다음 세 구성 요소를 제공합니다. 필요한 것만 설치하거나 함께 사용할 수 있습니다.

- **VS Code Extension**: CodeLens, Impact Explorer와 Graph UI를 사용하는 `.vsix`
- **Agent CLI**: 코드 Agent가 compact JSON으로 영향 범위를 조회하고 노트를 관리하는 `.tgz`
- **Codex Plugin**: Codex가 Agent CLI를 발견하고 안전한 분석·노트 workflow로 사용하는 repository plugin

최신 배포 파일은 [GitHub Releases](https://github.com/moelee835/Impact-Lens/releases/latest)에서 받습니다. 아래 예시는 현재 안정 버전인 v0.5.0을 기준으로 합니다.

## 1. 요구 사항

### VS Code Extension

- VS Code 1.96 이상
- 분석할 언어의 Call Hierarchy를 지원하는 VS Code 언어 확장

### Agent CLI

- Node.js 22 이상
- npm
- 기본 TypeScript/JavaScript 분석에는 별도 언어 서버 설치가 필요하지 않습니다. CLI dependency로 TypeScript 5.9.3과 `typescript-language-server` 6.0.0이 함께 설치됩니다.

버전을 확인합니다.

```sh
node --version
npm --version
```

### Codex Plugin

- plugin 명령을 지원하는 Codex CLI
- Agent CLI와 동일하게 Node.js 22 이상 및 npm. Plugin runner가 전역 CLI나 source build를 찾지 못하면 GitHub Release tarball을 사용합니다.

현재 Codex CLI에서 plugin 명령을 확인합니다.

```sh
codex plugin --help
```

## 2. VS Code Extension 설치

v0.5.0 VSIX를 [직접 다운로드](https://github.com/moelee835/Impact-Lens/releases/download/v0.5.0/impact-lens-0.5.0.vsix)하거나 Release의 `impact-lens-0.5.0.vsix` asset을 받습니다.

### `code` CLI로 설치

다운로드한 디렉터리에서 다음을 실행합니다.

```sh
code --install-extension ./impact-lens-0.5.0.vsix --force
```

설치 후 VS Code에서 `Developer: Reload Window`를 실행합니다.

### VS Code UI로 설치

1. VS Code의 Extensions 화면을 엽니다.
2. 우측 상단 `…` 메뉴에서 `Install from VSIX...`를 선택합니다.
3. 다운로드한 `impact-lens-0.5.0.vsix`를 선택합니다.
4. 설치가 끝나면 VS Code 창을 reload합니다.

### 설치 확인

명령줄에서는 설치된 확장 목록을 확인합니다.

```sh
code --list-extensions --show-versions
```

목록에 `local.impact-lens@0.5.0`이 있어야 합니다. VS Code UI에서는 Extensions의 Impact Lens 상세 화면에서 버전을 확인합니다.

함수가 있는 파일을 열었을 때 선언 위에 `Show impact` CodeLens가 표시되는지 확인합니다. CodeLens가 없다면 해당 언어 확장이 Call Hierarchy를 지원하는지와 `impactLens.showCodeLens` 설정을 확인합니다.

## 3. Agent CLI 설치

### Release URL에서 전역 설치

```sh
npm install --global https://github.com/moelee835/Impact-Lens/releases/download/v0.5.0/impact-lens-cli-0.5.0.tgz
```

### tarball을 받은 뒤 전역 설치

CLI tarball을 [직접 다운로드](https://github.com/moelee835/Impact-Lens/releases/download/v0.5.0/impact-lens-cli-0.5.0.tgz)하거나 다음 명령으로 받습니다.

```sh
curl --location --remote-name \
  https://github.com/moelee835/Impact-Lens/releases/download/v0.5.0/impact-lens-cli-0.5.0.tgz
npm install --global ./impact-lens-cli-0.5.0.tgz
```

### 전역 설치 없이 실행

일회성 사용이나 Agent 환경에서는 `npm exec`로 release tarball을 직접 실행할 수 있습니다.

```sh
npm exec --yes \
  --package=https://github.com/moelee835/Impact-Lens/releases/download/v0.5.0/impact-lens-cli-0.5.0.tgz \
  -- impact-lens analyze \
  --workspace /path/to/project \
  --file src/order.ts \
  --line 42 \
  --column 17
```

### 설치 확인

전역 package와 실행 경로를 확인합니다.

```sh
npm list --global @impact-lens/cli --depth=0
impact-lens note list --workspace /path/to/project
```

두 번째 명령은 stdout에 `schemaVersion`, `operation`, `ok`, `data`를 포함한 compact JSON 한 줄을 출력해야 합니다.

기본 분석 예시:

```sh
impact-lens analyze \
  --workspace /path/to/project \
  --file src/order.ts \
  --line 42 \
  --column 17 \
  --depth 5 \
  --max-nodes 120
```

좌표는 1-based UTF-16입니다. Agent용 stdin JSON, note CRUD와 종료 코드 계약은 [CLI README](cli/README.md)를 참고하세요.

## 4. Codex Plugin 설치

GitHub repository를 Codex marketplace로 등록하고 plugin을 설치합니다.

```sh
codex plugin marketplace add moelee835/Impact-Lens --ref main
codex plugin add impact-lens@personal
```

현재 checkout에서 테스트하거나 개발 중인 branch를 사용하려면 repository root에서 로컬 marketplace를 등록합니다.

```sh
codex plugin marketplace add .
codex plugin add impact-lens@personal
```

설치 결과를 확인합니다.

```sh
codex plugin list --json
```

목록에서 `impact-lens` plugin이 설치 상태인지 확인합니다. 새 대화에서 "Impact Lens로 이 함수의 변경 영향도를 분석해줘"처럼 요청합니다. 기존 대화는 설치 전에 구성된 plugin snapshot을 유지할 수 있으므로 설치 직후에는 새 대화를 사용합니다.

plugin runner는 source checkout의 `cli/dist/index.js`, 전역 `impact-lens`, v0.5.0 Release tarball 순서로 CLI를 찾습니다. 마지막 fallback은 최초 실행 시 GitHub와 npm 네트워크 접근이 필요할 수 있습니다.

## 5. 다운로드 파일 검증

다운로드한 파일의 SHA-256을 계산하고 [v0.5.0 Release](https://github.com/moelee835/Impact-Lens/releases/tag/v0.5.0)의 각 asset에 표시된 digest와 비교합니다. Release 페이지의 digest를 기준값으로 사용하므로 문서에 복사된 값이 새 artifact와 달라지는 문제를 피할 수 있습니다.

macOS:

```sh
shasum -a 256 impact-lens-0.5.0.vsix impact-lens-cli-0.5.0.tgz
```

Linux:

```sh
sha256sum impact-lens-0.5.0.vsix impact-lens-cli-0.5.0.tgz
```

Windows PowerShell:

```powershell
Get-FileHash .\impact-lens-0.5.0.vsix -Algorithm SHA256
Get-FileHash .\impact-lens-cli-0.5.0.tgz -Algorithm SHA256
```

계산 결과가 GitHub Release asset의 digest와 다르면 설치하지 말고 파일을 다시 다운로드합니다.

## 6. 업데이트

### Extension 업데이트

새 Release의 VSIX를 다운로드하고 같은 명령으로 덮어씁니다.

```sh
code --install-extension ./impact-lens-<version>.vsix --force
```

설치 후 VS Code를 reload하고 Extensions 상세 화면에서 새 버전을 확인합니다.

### CLI 업데이트

새 Release URL로 다시 전역 설치합니다.

```sh
npm install --global \
  https://github.com/moelee835/Impact-Lens/releases/download/v<version>/impact-lens-cli-<version>.tgz
```

기존 global package를 먼저 제거할 필요는 없습니다. 업데이트 후 `npm list --global @impact-lens/cli --depth=0`으로 버전을 확인합니다.

### Codex Plugin 업데이트

GitHub marketplace snapshot을 갱신하고 plugin을 다시 설치합니다.

```sh
codex plugin marketplace upgrade personal
codex plugin remove impact-lens@personal
codex plugin add impact-lens@personal
```

업데이트 후 새 대화를 열어 변경된 skill을 사용합니다. 로컬 marketplace는 checkout을 직접 가리키므로 branch를 갱신한 뒤 plugin을 다시 설치합니다.

## 7. 제거와 노트 데이터

### Extension 제거

```sh
code --uninstall-extension local.impact-lens
```

또는 VS Code Extensions 화면에서 Impact Lens의 `Uninstall`을 선택합니다.

보존할 Personal note가 있다면 제거 전에 `Impact Lens: Manage Function Note`에서 Shared로 게시하는 것을 권장합니다. Personal note는 VS Code가 관리하는 workspaceState에 있으므로 Extension 제거 이후 보존 여부를 파일 기반 데이터처럼 보장할 수 없습니다.

### CLI 제거

```sh
npm uninstall --global @impact-lens/cli
```

### Codex Plugin 제거

```sh
codex plugin remove impact-lens@personal
```

Plugin 제거는 Impact Lens workspace note를 삭제하지 않습니다.

Extension이나 CLI package를 제거해도 다음 workspace 데이터는 자동으로 삭제하지 않습니다.

- Shared note: `.impact-lens/notes.json`
- CLI Local note: `.impact-lens/notes.local.json`
- Source note: 소스 파일의 `@impact-note` comment

이 데이터까지 제거하려면 내용을 먼저 검토하고 각 파일 또는 comment를 별도로 정리합니다. Shared와 Local 파일을 무조건 삭제하면 다른 함수의 노트도 함께 사라질 수 있습니다.

## 8. 문제 해결

### `code: command not found`

VS Code UI의 `Install from VSIX...`를 사용합니다. macOS에서는 VS Code 명령 팔레트의 `Shell Command: Install 'code' command in PATH`로 CLI를 등록할 수도 있습니다.

### `impact-lens: command not found`

터미널을 새로 열고 global npm prefix를 확인합니다.

```sh
npm prefix --global
npm list --global @impact-lens/cli --depth=0
```

global executable 디렉터리가 `PATH`에 포함돼 있어야 합니다. 권한 문제를 피하기 위해 `sudo npm install --global` 대신 Node version manager를 사용하거나 위의 `npm exec` 방식을 사용합니다.

### `codex plugin` 명령을 사용할 수 없음

설치된 Codex CLI가 plugin 명령을 지원하는지 `codex plugin --help`로 확인합니다. 명령이 없다면 Codex를 업데이트한 뒤 다시 시도합니다.

### Codex가 `impact-lens-cli` skill을 사용하지 않음

`codex plugin list --json`에서 `impact-lens`가 설치 상태인지 확인합니다. marketplace를 갱신하고 plugin을 다시 설치한 뒤 새 대화를 엽니다.

### Node.js version 오류

CLI는 Node.js 22 이상이 필요합니다. `node --version`을 확인하고 오래된 Node.js를 업그레이드합니다.

### Extension에서 caller가 나타나지 않음

대상 언어 확장의 Call Hierarchy 지원 여부를 확인합니다. Impact Lens는 provider가 반환하지 않은 reflection, runtime dependency injection, decorator route 및 동적 호출을 추정하지 않습니다.

### CLI에서 `provider_capability_missing` 또는 `provider_unavailable`

기본 provider는 TypeScript/JavaScript용입니다. 다른 언어는 표준 LSP Call Hierarchy를 제공하는 language server command, argument와 `languageId`를 CLI request에 명시해야 합니다. server별 initialization option이 필요한 경우 현재 generic adapter로 동작하지 않을 수 있습니다.

### 이전 Extension 동작이 계속 보임

Extensions 상세 화면에서 설치 버전을 확인하고 `Developer: Reload Window`를 실행합니다. 일반 VS Code 창과 Extension Development Host를 혼동하지 않았는지도 확인합니다.

## 9. 소스에서 개발 실행

release artifact 설치가 아니라 저장소를 clone해 빌드·테스트하거나 VSIX와 CLI tarball을 직접 만들려면 [Impact Lens 개발 가이드](docs/DEVELOPMENT.md)를 참고하세요.
