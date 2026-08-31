# Impact Lens 개발 가이드

이 문서는 Impact Lens 코드를 수정하고 자동 테스트, Extension Development Host 확인, VSIX 패키징 및 로컬 설치까지 수행하는 절차를 설명한다.

## 1. 개발 환경

필수 환경:

- Node.js 22 LTS 이상
- VS Code 1.96 이상
- Corepack과 pnpm 10
- Git

확장 자체의 최소 VS Code 버전은 `package.json`의 `engines.vscode`가 결정한다. Node.js 22는 TypeScript 컴파일과 `vsce` 등 현재 개발 의존성을 실행하기 위한 기준이다.

pnpm을 준비하고 버전을 확인한다.

```sh
corepack enable
corepack prepare pnpm@10 --activate
pnpm --version
```

## 2. 저장소 준비

```sh
git clone https://github.com/moelee835/Impact-Lens.git
cd Impact-Lens
pnpm install --frozen-lockfile
```

이 저장소는 `pnpm-lock.yaml`을 사용한다. 일반 개발 과정에서 `npm install`을 실행해 별도의 `package-lock.json`을 만들지 않는다. 의존성을 변경해야 한다면 pnpm으로 변경하고 lockfile을 함께 검토한다.

이미 clone한 저장소에서는 작업 시작 전에 다음을 확인한다.

```sh
git status --short --branch
git fetch origin
git switch -c <branch-name> origin/main
```

`main`/`master`에서는 파일 변경, commit과 push를 하지 않는다. `feat/`, `fix/`, `docs/`, `refactor/`,
`test/`, `chore/` 또는 `release/` 전용 branch를 사용하고 main 반영은 Pull Request로만 진행한다.

`AGENTS.md`의 저장소 규칙에 따라 코드 또는 설정을 바꾸기 전에 `docs/work/<task-name>.md`에 계획과 완료 기준을 작성한다. 구현 중에는 같은 문서에 변경 파일, 설계 결정, 테스트 결과와 제한 사항을 계속 기록한다. 장기 개선 후보와 알려진 한계는 [`docs/development-management/`](development-management/README.md)에서 우선순위와 개별 스토리로 관리한다.

작업 문서의 각 최상위 구현 단계는 독립적으로 검증 가능한 commit 단위다. 단계마다 다음 cycle을 완료한다.

```sh
# 단계 구현과 문서 로그 갱신 후
pnpm run test:all              # 변경 범위에 맞는 실제 검증으로 대체 가능
git diff --check
git status --short --branch
git add <stage-files>
git diff --cached --check
git commit -m "<imperative stage summary>"
git push -u origin <branch-name>  # 첫 단계
git push                         # 이후 단계
```

push가 성공하기 전에는 다음 단계로 넘어가지 않는다. 검증 실패나 미완료 단계는 commit/push하지 않고 작업
로그에 원인과 위험을 남긴다. force push와 main 직접 push는 이 workflow에 포함되지 않는다.

## 3. 주요 코드 위치

- `src/extension.ts`: Extension 활성화와 provider 등록
- `src/controller.ts`: 명령, 자동 분석, live update 및 Graph 동작 조정
- `src/codeLensProvider.ts`: 함수 선언 위 CodeLens 생성
- `src/declarationAnchor.ts`: 잘못된 provider selection을 함수 선언으로 보정
- `src/impactAnalyzer.ts`: VS Code Call Hierarchy 요청과 결과 모델 변환
- `src/callGraph.ts`: incoming caller 역방향 BFS
- `src/graphPanel.ts`: Graph Webview HTML, 선택, depth 및 viewport 동작
- `src/impactTreeProvider.ts`: Impact Explorer 트리
- `src/noteStore.ts`: Personal, Shared 및 source comment 노트 저장
- `src/test/*.test.ts`: Node test runner 기반 자동 테스트
- `cli/`: Extension과 격리된 Agent CLI package, LSP provider, note adapter 및 CLI 테스트
- `plugins/impact-lens/`: Codex와 Claude Code가 공유하는 plugin payload
  - `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`: host별 manifest
  - `skills/impact-lens-cli/`: 두 host가 공유하는 skill과 CLI 계약 문서
  - `commands/`: Claude Code slash command
  - `scripts/run-impact-lens`: 셸 평가 없이 CLI를 찾아 실행하는 runner
- `.agents/plugins/marketplace.json`: Codex marketplace 정의
- `.claude-plugin/marketplace.json`: Claude Code marketplace 정의
- `docs/development-management/`: 알려진 한계, 우선순위와 개별 개발 스토리
- `package.json`: 명령, 설정, 버전, Extension manifest
- `CHANGELOG.md`: 버전별 사용자 변경 내역

## 4. 컴파일과 개발 실행

한 번 컴파일한다.

```sh
pnpm run compile
```

TypeScript 결과는 `out/`에 생성된다. 개발 중 파일 변경을 계속 감시하려면 다음을 실행한다.

```sh
pnpm run watch
```

VS Code에서 저장소를 연 다음 `F5`를 누르면 Extension Development Host가 열린다. 새 창에서 분석 대상 프로젝트를 열고 기능을 확인한다.

권장 smoke test:

1. 함수 선언 바로 위에 `Show impact` CodeLens가 표시되는지 확인한다.
2. CodeLens를 눌렀을 때 해당 함수가 분석 root인지 확인한다.
3. 같은 파일과 다른 파일의 direct/transitive caller가 올바른 depth로 표시되는지 확인한다.
4. Graph 노드 single click은 선택만 하고 double click 또는 Enter만 코드를 여는지 확인한다.
5. 코드를 연 뒤 기존 Graph root가 유지되는지 확인한다.
6. Analysis/Visible depth, zoom, fit/reset 및 drag pan을 확인한다.
7. source edit 후 stale/analyzing/current 상태와 diagnostics가 갱신되는지 확인한다.
8. Graph summary와 Explorer root tooltip이 `static Call Hierarchy`, provider host/language,
   traversal/indexing 상태를 표시하는지 확인한다.
9. light/dark/high contrast theme에서 선택과 diagnostic 표시를 확인한다.

Python/FastAPI는 설치된 Python extension과 language server가 제공하는 Call Hierarchy 범위 안에서 확인한다. `Depends()`, decorator route 및 런타임 연결이 provider 결과에 없으면 Impact Lens에도 표시되지 않을 수 있다.

## 5. 자동 테스트

전체 테스트를 실행한다.

```sh
pnpm test
```

Agent CLI까지 포함한 전체 검증은 다음과 같다.

```sh
pnpm run test:all
```

CLI만 반복 개발할 때는 별도 package 명령을 사용한다.

```sh
pnpm run cli:build
pnpm run cli:test
node cli/dist/index.js analyze --workspace . --file src/callGraph.ts --line 12 --column 23
```

CLI 테스트에는 compact JSON stdout/stderr 계약, BFS와 제한 처리, note preview/apply/conflict/delete 및 실제 TypeScript Language Server cross-file fixture가 포함된다. CLI는 기존 `src/**` runtime을 import하지 않으며 VSIX에서 제외되어야 한다.

plugin payload를 변경했다면 manifest, marketplace, skill과 command를 검증한다.

```sh
sh -n plugins/impact-lens/scripts/run-impact-lens
claude plugin validate plugins/impact-lens --strict
claude plugin validate plugins/impact-lens/commands --strict
claude plugin validate plugins/impact-lens/skills --strict
claude plugin validate .claude-plugin/marketplace.json --strict
```

runner가 실제로 CLI를 찾아 실행하는지도 확인한다.

```sh
./plugins/impact-lens/scripts/run-impact-lens note list --workspace "$(pwd)"
```

`plugins/impact-lens`는 Codex와 Claude Code가 공유하므로 skill 또는 runner를 바꾸면 두 host 문서를 함께 갱신한다.

이 script는 TypeScript를 먼저 컴파일한 후 `out/test/*.test.js`를 Node test runner로 실행한다. 성공 결과에서 `fail 0`을 확인한다.

호출 그래프나 live state처럼 순서와 상태에 민감한 변경은 여러 번 반복한다.

```sh
for run_number in 1 2 3; do
  echo "test run ${run_number}"
  pnpm test || exit 1
done
```

커밋 전 공백 오류도 검사한다.

```sh
git diff --check
```

테스트를 추가할 때는 `src/test/<feature>.test.ts`에 작성한다. `tsconfig.json`이 `src/**/*.ts`를 컴파일하므로 테스트도 자동으로 `out/test/`에 생성된다.

## 6. 버전과 변경 내역

배포할 VSIX를 만들기 전 `package.json`의 `version`을 변경하고 `CHANGELOG.md`에 같은 버전의 사용자 변경 내역을 작성한다.

예시:

```json
{
  "version": "0.7.0"
}
```

```md
## 0.7.0

- Fix or feature summary.
```

일반적으로 bug fix는 patch, 하위 호환 기능 추가는 minor, 호환성이 깨지는 변경은 major 버전을 올린다. 버전만 올리기 위해 다른 package manager의 lockfile을 새로 생성하지 않는다.

## 7. VSIX 빌드

최종 테스트 후 저장소 밖의 임시 경로에 패키징한다.

```sh
pnpm test
pnpm run compile
git diff --check
pnpm exec vsce package --out /tmp/impact-lens-0.7.0.vsix
```

`vsce package`는 `vscode:prepublish` script를 실행한 뒤 VSIX에 포함된 파일 목록을 출력한다. 최소한 다음 항목을 확인한다.

- `extension/package.json`
- `extension/out/extension.js`
- `extension/out/`의 변경된 runtime 모듈
- `extension/media/impact-lens.png`
- `extension/README.md`와 `extension/CHANGELOG.md`

다음 항목은 포함되지 않아야 한다.

- `src/`, `cli/`, `docs/`, `out/test/`
- `plugins/`, `.agents/`, `.claude-plugin/`

필요하면 압축 파일 목록을 직접 확인한다.

```sh
unzip -l /tmp/impact-lens-0.7.0.vsix
```

artifact checksum을 생성한다.

```sh
shasum -a 256 /tmp/impact-lens-0.7.0.vsix
```

릴리스에 첨부한 파일의 digest와 이 값을 비교한다.

## 8. VSIX 로컬 설치

`code` CLI가 PATH에 있다면 기존 설치를 덮어쓴다.

```sh
code --install-extension /tmp/impact-lens-0.7.0.vsix --force
```

설치 후 VS Code에서 `Developer: Reload Window`를 실행한다.

`code` CLI가 없다면 다음 순서로 설치한다.

1. VS Code의 Extensions 화면을 연다.
2. 우측 상단 `…` 메뉴에서 `Install from VSIX...`를 선택한다.
3. 생성한 VSIX를 선택한다.
4. 창을 reload한 뒤 Impact Lens 상세 화면에서 설치 버전을 확인한다.

이전 버전 동작이 계속 보이면 Extension 상세 화면의 버전, 현재 열린 Extension Development Host와 일반 VS Code 창을 구분하고 reload 여부를 확인한다.

## 9. 커밋과 릴리스 전 확인

```sh
git status --short --branch
git diff --check
pnpm test
pnpm exec vsce package --out /tmp/impact-lens-<version>.vsix
git diff --stat
```

작업 문서에 실제 결과와 수행하지 못한 수동 검증을 기록한다. 관련 테스트가 모두 통과하면 구현, 테스트, CHANGELOG와 작업 문서를 함께 커밋한다.

Pull Request를 병합한 뒤 최종 `main`에서 VSIX를 다시 생성한다. GitHub Release를 발행할 때는 tag가 해당 `main` merge commit을 가리키는지, release가 draft/prerelease가 아닌지, VSIX asset의 digest가 로컬 checksum과 같은지 확인한다.

CLI release artifact도 함께 만들 때는 다음을 실행한다.

```sh
pnpm --dir cli pack --pack-destination /tmp
```

생성된 CLI tarball의 파일 목록에 `dist/**`, `README.md`, `schemas/**`만 포함되는지 확인한다. CLI package는 VSIX에 포함하지 않고 GitHub Release asset으로 별도 배포한다.

## 문제 해결

### `tsc: command not found`

의존성이 설치되지 않은 상태다.

```sh
pnpm install --frozen-lockfile
pnpm run compile
```

### `code: command not found`

VS Code의 명령 팔레트에서 `Shell Command: Install 'code' command in PATH`를 실행하거나 `Install from VSIX...` UI를 사용한다.

### 호출 관계 일부가 보이지 않음

대상 언어 extension이 Call Hierarchy를 제공하는지 먼저 확인한다. Impact Lens는 provider가 반환한 incoming call을 프로젝트 URI 제한 없이 수집하지만 런타임 DI, reflection, event 및 framework 연결을 임의로 추론하지 않는다. Graph header의 requested/reached depth, `static Call Hierarchy`와 depth/node limit 표시도 함께 확인한다. CLI에서는 `provider`와 `coverage`를 확인하고 `complete: true`만으로 runtime 영향이 없다고 판단하지 않는다.
