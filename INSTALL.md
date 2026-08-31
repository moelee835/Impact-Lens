# Impact Lens 설치 가이드

Impact Lens는 다음 네 구성 요소를 제공합니다. 필요한 것만 설치하거나 함께 사용할 수 있습니다.

- **VS Code Extension**: CodeLens, Impact Explorer와 Graph UI를 사용하는 `.vsix`
- **Agent CLI**: 코드 Agent가 compact JSON으로 영향 범위를 조회하고 노트를 관리하는 `.tgz`
- **Codex Plugin**: Codex가 Agent CLI를 발견하고 안전한 분석·노트 workflow로 사용하는 repository plugin
- **Claude Code Plugin**: Claude Code가 같은 skill과 CLI runner를 slash command와 함께 사용하는 repository plugin

최신 배포 파일은 [GitHub Releases](https://github.com/moelee835/Impact-Lens/releases/latest)에서 받습니다. 아래 예시는 현재 안정 버전인 v0.7.0을 기준으로 합니다.

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

### Claude Code Plugin

- plugin 명령을 지원하는 Claude Code
- Agent CLI와 동일하게 Node.js 22 이상 및 npm. Plugin runner가 전역 CLI나 source build를 찾지 못하면 GitHub Release tarball을 사용합니다.

현재 Claude Code에서 plugin 명령을 확인합니다.

```sh
claude plugin --help
```

## 2. VS Code Extension 설치

v0.7.0 VSIX를 [직접 다운로드](https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-0.7.0.vsix)하거나 Release의 `impact-lens-0.7.0.vsix` asset을 받습니다.

### `code` CLI로 설치

다운로드한 디렉터리에서 다음을 실행합니다.

```sh
code --install-extension ./impact-lens-0.7.0.vsix --force
```

설치 후 VS Code에서 `Developer: Reload Window`를 실행합니다.

### VS Code UI로 설치

1. VS Code의 Extensions 화면을 엽니다.
2. 우측 상단 `…` 메뉴에서 `Install from VSIX...`를 선택합니다.
3. 다운로드한 `impact-lens-0.7.0.vsix`를 선택합니다.
4. 설치가 끝나면 VS Code 창을 reload합니다.

### 설치 확인

명령줄에서는 설치된 확장 목록을 확인합니다.

```sh
code --list-extensions --show-versions
```

목록에 `local.impact-lens@0.7.0`이 있어야 합니다. VS Code UI에서는 Extensions의 Impact Lens 상세 화면에서 버전을 확인합니다.

함수가 있는 파일을 열었을 때 선언 위에 `Show impact` CodeLens가 표시되는지 확인합니다. CodeLens가 없다면 해당 언어 확장이 Call Hierarchy를 지원하는지와 `impactLens.showCodeLens` 설정을 확인합니다.

## 3. Agent CLI 설치

### Release URL에서 전역 설치

```sh
npm install --global https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-cli-0.7.0.tgz
```

### tarball을 받은 뒤 전역 설치

CLI tarball을 [직접 다운로드](https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-cli-0.7.0.tgz)하거나 다음 명령으로 받습니다.

```sh
curl --location --remote-name \
  https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-cli-0.7.0.tgz
npm install --global ./impact-lens-cli-0.7.0.tgz
```

### 전역 설치 없이 실행

일회성 사용이나 Agent 환경에서는 `npm exec`로 release tarball을 직접 실행할 수 있습니다.

```sh
npm exec --yes \
  --package=https://github.com/moelee835/Impact-Lens/releases/download/v0.7.0/impact-lens-cli-0.7.0.tgz \
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

기본 TypeScript/JavaScript provider까지 점검합니다. `doctor`는 `bundled-typescript`뿐 아니라 provider
catalog의 어떤 preset id도 받는 일반 명령이지만, 오늘 shipped catalog에는 `bundled-typescript` 하나만
있습니다.

```sh
impact-lens doctor bundled-typescript
impact-lens doctor bundled-typescript --smoke
```

기본(`preflight`) 실행은 Node 엔진, CLI package, provider package/version, entry 접근, 언어 일치,
`.impact-lens/provider.json` 유효성을 check 단위로 빠르게 확인합니다. `--smoke`는 실제 Language Server를
시작해 initialize와 Call Hierarchy capability까지 추가로 확인하므로 설치 검증이나 장애 진단 때만
실행합니다. 일반 분석마다 별도 설정하거나 실행할 필요는 없습니다. 각 check는 `pass`/`warn`/`fail`을
독립적으로 보고하며 하나가 실패해도 나머지 check를 계속 실행합니다. `doctor`는 catalog에 등록된 preset만
진단할 수 있고, 요청의 raw `provider`처럼 preset이 아닌 custom provider는 점검할 방법이 없습니다.

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

plugin runner는 source checkout의 `cli/dist/index.js`, 전역 `impact-lens`, v0.7.0 Release tarball 순서로 CLI를 찾습니다. 마지막 fallback은 최초 실행 시 GitHub와 npm 네트워크 접근이 필요할 수 있습니다.

## 5. Claude Code Plugin 설치

GitHub repository를 Claude Code marketplace로 등록하고 plugin을 설치합니다.

```sh
claude plugin marketplace add moelee835/Impact-Lens
claude plugin install impact-lens@impact-lens
```

Claude Code 대화 안에서는 같은 작업을 slash command로 수행할 수 있습니다.

```text
/plugin marketplace add moelee835/Impact-Lens
/plugin install impact-lens@impact-lens
```

현재 checkout에서 테스트하거나 개발 중인 branch를 사용하려면 repository root에서 로컬 marketplace를 등록합니다.

```sh
claude plugin marketplace add ./
claude plugin install impact-lens@impact-lens
```

설치 결과와 구성 요소를 확인합니다.

```sh
claude plugin list
claude plugin details impact-lens
```

`impact-lens` plugin이 enabled 상태이고 `impact-lens-cli` skill과 `analyze`, `notes` command가 inventory에 나타나는지 확인합니다. 적용하려면 Claude Code를 다시 시작합니다.

이후 새 세션에서 다음처럼 요청하거나 slash command를 사용합니다.

```text
Impact Lens로 이 함수의 변경 영향도를 분석해줘.
/impact-lens:analyze calculateTotal
/impact-lens:notes list
```

plugin runner는 Codex plugin과 동일하게 source checkout의 `cli/dist/index.js`, 전역 `impact-lens`, v0.7.0 Release tarball 순서로 CLI를 찾습니다. 마지막 fallback은 최초 실행 시 GitHub와 npm 네트워크 접근이 필요할 수 있습니다.

## 6. 다운로드 파일 검증

다운로드한 파일의 SHA-256을 계산하고 [v0.7.0 Release](https://github.com/moelee835/Impact-Lens/releases/tag/v0.7.0)의 각 asset에 표시된 digest와 비교합니다. Release 페이지의 digest를 기준값으로 사용하므로 문서에 복사된 값이 새 artifact와 달라지는 문제를 피할 수 있습니다.

macOS:

```sh
shasum -a 256 impact-lens-0.7.0.vsix impact-lens-cli-0.7.0.tgz
```

Linux:

```sh
sha256sum impact-lens-0.7.0.vsix impact-lens-cli-0.7.0.tgz
```

Windows PowerShell:

```powershell
Get-FileHash .\impact-lens-0.7.0.vsix -Algorithm SHA256
Get-FileHash .\impact-lens-cli-0.7.0.tgz -Algorithm SHA256
```

계산 결과가 GitHub Release asset의 digest와 다르면 설치하지 말고 파일을 다시 다운로드합니다.

## 7. 업데이트

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

### Claude Code Plugin 업데이트

marketplace snapshot을 갱신하고 plugin을 업데이트합니다.

```sh
claude plugin marketplace update impact-lens
claude plugin update impact-lens
```

업데이트를 적용하려면 Claude Code를 다시 시작합니다. 로컬 marketplace는 checkout을 직접 가리키므로 branch를 갱신한 뒤 다시 업데이트합니다.

## 8. 제거와 노트 데이터

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

### Claude Code Plugin 제거

```sh
claude plugin uninstall impact-lens@impact-lens
claude plugin marketplace remove impact-lens
```

로컬 marketplace로 설치했다면 설치 scope에 맞춰 `--scope local`을 함께 지정합니다.

Plugin 제거는 Impact Lens workspace note를 삭제하지 않습니다.

Extension이나 CLI package를 제거해도 다음 workspace 데이터는 자동으로 삭제하지 않습니다.

- Shared note: `.impact-lens/notes.json`
- CLI Local note: `.impact-lens/notes.local.json`
- Source note: 소스 파일의 `@impact-note` comment

이 데이터까지 제거하려면 내용을 먼저 검토하고 각 파일 또는 comment를 별도로 정리합니다. Shared와 Local 파일을 무조건 삭제하면 다른 함수의 노트도 함께 사라질 수 있습니다.

## 9. 문제 해결

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

### `claude plugin` 명령을 사용할 수 없음

설치된 Claude Code가 plugin 명령을 지원하는지 `claude plugin --help`로 확인합니다. 명령이 없다면 Claude Code를 업데이트한 뒤 다시 시도합니다.

### Claude Code가 Impact Lens plugin을 사용하지 않음

`claude plugin list`에서 `impact-lens`가 enabled 상태인지 확인하고 `claude plugin details impact-lens`로 skill과 command가 등록되었는지 확인합니다. 설치 또는 업데이트 직후에는 Claude Code를 다시 시작해야 변경이 적용됩니다.

### Node.js version 오류

CLI는 Node.js 22 이상이 필요합니다. `node --version`을 확인하고 오래된 Node.js를 업그레이드합니다.
runner는 모든 CLI 선택 경로 전에 이 조건을 검사하며 `node_runtime_unavailable`,
`node_version_unreadable`, `node_version_unsupported`를 구분합니다.

### Plugin의 JavaScript/TypeScript provider가 시작되지 않음

TypeScript/JavaScript에는 provider command, args 또는 `languageId`를 직접 설정하지 마세요. 먼저 실패 JSON의
`runtime`과 `error.details`를 확인합니다.

1. `runtime.cli.version`, `runtime.node.version`과 `runtime.runner.source`를 확인합니다.
2. 같은 runner 또는 설치된 CLI로 `doctor bundled-typescript --smoke`를 실행합니다.
3. `bundled_provider_artifact_missing|unreadable|corrupt`이면 CLI 또는 Plugin을 다시 설치합니다. permission만
   임의로 넓히기 전에 package가 정상 release에서 왔는지 확인합니다.
4. source가 `checkout`이면 저장소 root에서 `npm run cli:build` 후 다시 검사합니다.
5. source가 `global`이면 `npm list --global @impact-lens/cli --depth=0`으로 version을 확인하고 최신 release로
   다시 설치합니다.
6. source가 `release-fallback`이고 npm download 자체가 실패하면 runner가 npm 원본 출력 대신 단일 JSON
   오류를 반환합니다. `npm_network_unreachable`은 GitHub/npm 접근, proxy와 certificate를,
   `npm_permission_denied`는 npm cache 소유권을, `cli_release_unavailable`은 plugin 재설치를,
   `npm_disk_space_unavailable`은 디스크 여유 공간을 확인하라는 뜻입니다. 분류되지 않은 실패는
   `npm_release_fallback_failed`입니다. 어느 경우든 CLI가 시작되기 전 단계이므로 설치된 provider의
   initialize/query 실패와는 다른 문제입니다.
7. 위 오류의 원본 npm 출력을 사람이 직접 봐야 하면 `IMPACT_LENS_RUNNER_NPM_OUTPUT=passthrough`로 다시
   실행합니다. 이 모드는 npm의 출력과 exit code를 그대로 보여 주며 JSON envelope를 만들지 않습니다.
   진단 JSON이 npm 원본 텍스트를 담지 않는 이유는 그 안에 절대 경로, release package URL과 registry/proxy
   credential이 섞일 수 있기 때문입니다.

runner source는 `explicit`, `checkout`, `global`, `release-fallback` 중 하나입니다. 전체 executable path,
registry URL, credential과 argv는 진단 JSON에 포함되지 않습니다. stale source를 발견해도 runner가 조용히
다음 후보로 넘어가지 않으므로, 선택된 설치를 수정하거나 explicit override를 제거한 뒤 재시도합니다.

### Extension에서 caller가 나타나지 않음

대상 언어 확장의 Call Hierarchy 지원 여부를 확인합니다. Impact Lens는 provider가 반환하지 않은 reflection, runtime dependency injection, decorator route 및 동적 호출을 추정하지 않습니다. `Impact Lens: Run Provider
Doctor` 명령을 실행하면 호스트가 관측한 사실(Call Hierarchy root를 찾았는지, document symbol이 있는지)을
Output 채널에서 확인할 수 있습니다. VS Code 공개 API는 "이 언어에 Call Hierarchy provider가 없음"과 "그
위치에 분석할 symbol이 없음"을 구분해서 알려주지 않으므로, Impact Lens도 이 두 원인을 하나의 안내로
병합해서 보여줍니다.

### CLI에서 provider 오류

CLI는 provider를 고정된 순서로 선택합니다: 요청의 raw `provider` > 요청의 `providerPreset` > 워크스페이스의
`.impact-lens/provider.json` > 검증된 auto-discovery. 이 중 먼저 조건을 만족하는 하나만 쓰이고, 그중
어디에도 해당하지 않으면 다른 언어의 provider로 자동 fallback하지 않습니다.

`provider_required_for_language`이면 해당 언어의 표준 LSP Call Hierarchy server command, argument와
`languageId`를 CLI request에 명시합니다. `provider_language_mismatch`이면 파일과 `languageId`를 맞춥니다.
`provider_selection_ambiguous`는 검증된 provider 후보가 둘 이상이라 `providerPreset`으로 하나를 직접
지정해야 한다는 뜻입니다. `provider_config_invalid`는 `.impact-lens/provider.json`이 허용 필드
(`presetId`, `command`, `args`, `languageId`, `initializationOptions`, `settings`) 밖의 값을 담고 있거나
JSON으로 파싱되지 않는다는 뜻이므로, 요청이 아니라 그 파일을 고칩니다. `provider_launch_failed`,
`provider_initialize_failed`, `provider_capability_missing`, `provider_query_failed`는 각각 process 실행,
initialize, Call Hierarchy capability와 실제 query 단계를 가리킵니다. `error.details`의 stage, exit
code/signal과 redacted stderr를 확인합니다. server별 initialization option이 필요한 경우 현재 generic
adapter로 동작하지 않을 수 있습니다.

Bundled TypeScript/JavaScript 오류라면 위 doctor 절차를 먼저 사용합니다. `doctor <preset>`은 catalog에
등록된 preset만 진단하므로, `provider` 필드로 직접 지정한 custom provider는 doctor로 점검할 수 없고 위
`error.details`를 직접 읽어야 합니다. Python/C/C++/Swift/Kotlin 등은 **아직 검증된 preset이 없어서** 오늘은
항상 provider를 직접 지정해야 하는 상태입니다 — 이는 곧 지원 예정이라는 뜻이 아니라,
`provider_required_for_language`가 provider artifact 손상을 뜻하지 않는다는 뜻입니다.

### `provider_ipc_unavailable`: 샌드박스 안에서 분석이 동작하지 않음

일부 agent 샌드박스와 컨테이너는 자식 프로세스를 실행은 시키지만 그 stdio를 전달하지 않습니다. 이 경우
Language Server는 요청을 받지 못해 조용히 종료하고, 서버가 쓴 내용도 도착하지 않습니다. CLI는 이 상태를
자체 점검으로 식별해 `provider_ipc_unavailable`로 알립니다.

이것은 설치나 provider 문제가 아니므로 재설치로 해결되지 않습니다. 다음 중 하나를 선택합니다.

- 샌드박스 밖의 터미널에서 Impact Lens를 실행합니다.
- agent 설정에서 해당 workspace의 실행 권한을 올립니다. Codex는 `~/.codex/config.toml`의 `sandbox_mode`와
  관련 설정을 사용합니다.
- 같은 분석을 VS Code Extension에서 수행합니다. Extension은 자식 CLI 프로세스를 쓰지 않습니다.

`note` 조회·수정과 `doctor bundled-typescript`(preflight)는 자식 프로세스를 쓰지 않으므로 이 환경에서도
정상 동작합니다. 따라서 "노트는 되는데 분석만 안 된다"는 증상은 이 상황과 일치합니다.

### 실행된 CLI가 예상과 다름, 또는 결과가 실행할 때마다 다름

Impact Lens는 실행 경로가 여러 개입니다. plugin runner는 `IMPACT_LENS_CLI_PATH` → source checkout → 전역
`impact-lens` → 고정 release tarball 순으로 CLI를 고르고, 마지막 경로는 `npm exec`의 package cache에
버전별로 따로 쌓입니다. 그래서 사용자 shell에서는 전역 CLI가, agent 세션에서는 `PATH` 차이로 release
fallback의 구버전이 선택되는 일이 생깁니다.

먼저 **실제로 무엇이 실행됐는지** 확인합니다. 요약이 아니라 응답 JSON의 다음 두 값을 봅니다.

- `runtime.cli.version`: 실제로 실행된 CLI 버전
- `runtime.runner.source`: `explicit` / `checkout` / `global` / `release-fallback`

남아 있는 설치와 cache는 다음으로 확인합니다.

```sh
env | grep -i IMPACT_LENS || echo "(환경변수 없음)"
command -v impact-lens || echo "(전역 CLI 없음)"
for f in $(grep -rl "@impact-lens/cli" ~/.npm/_npx/*/package.json 2>/dev/null); do
  d=$(dirname "$f"); printf '%s -> ' "$(basename "$d")"
  node -p "require('$d/node_modules/@impact-lens/cli/package.json').version" 2>/dev/null || echo '?'
done
```

구버전이 섞여 있으면 아래로 정리한 뒤 필요한 경로 하나만 다시 설치합니다. `sudo npm`은 사용하지 않습니다.

```sh
unset IMPACT_LENS_CLI_PATH IMPACT_LENS_CLI_PACKAGE
npm uninstall --global @impact-lens/cli
for f in $(grep -rl "@impact-lens/cli" ~/.npm/_npx/*/package.json 2>/dev/null); do rm -rf "$(dirname "$f")"; done
```

Plugin과 Extension까지 포함한 전체 초기화, 시나리오별 재설치와 증거 수집 절차는
[M0 테스트 환경 구성과 초기화 가이드](docs/development-management/user-tests/m0-environment-setup.md)를
참고하세요.

### 이전 Extension 동작이 계속 보임

Extensions 상세 화면에서 설치 버전을 확인하고 `Developer: Reload Window`를 실행합니다. 일반 VS Code 창과 Extension Development Host를 혼동하지 않았는지도 확인합니다.

## 10. 소스에서 개발 실행

release artifact 설치가 아니라 저장소를 clone해 빌드·테스트하거나 VSIX와 CLI tarball을 직접 만들려면 [Impact Lens 개발 가이드](docs/DEVELOPMENT.md)를 참고하세요.
