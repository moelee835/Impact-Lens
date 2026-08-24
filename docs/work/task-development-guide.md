# 개발 가이드 및 README 최신화

- 상태: 완료
- 작성일: 2026-08-24

## 배경과 해결할 문제

코드 수정 후 컴파일, 테스트, Extension Development Host 실행, VSIX 패키징 및 로컬 설치 방법을 저장소 안에서 다시 확인할 수 있는 개발 가이드가 필요하다. 현재 README는 v0.3.0으로 표기되어 있고 `npm install`과 간단한 검증 명령만 제공해 현재 v0.3.1, `pnpm-lock.yaml`, 패키징 및 릴리스 검증 절차를 충분히 설명하지 않는다.

## 범위

- `docs/DEVELOPMENT.md` 개발 가이드 추가
- 환경 준비, 변경 위치, compile/watch/test, 반복 테스트, F5 수동 검증 설명
- 버전 및 CHANGELOG 갱신, VSIX 생성·설치·checksum·Git 검증 설명
- README 버전과 실행/개발 검증 안내 최신화 및 상세 가이드 링크 추가
- 문서의 명령을 실제 실행해 검증

## 범위 제외

- 소스 코드 또는 Extension 기능 변경
- CI/CD workflow 추가
- 새 버전 릴리스 발행

## 현재 구현 조사

- 현재 package version은 0.3.1이며 VS Code engine은 1.96 이상이다.
- `pnpm-lock.yaml` lockfileVersion은 9.0이고 `pnpm-workspace.yaml`의 `allowBuilds` 설정은 pnpm 10 형식이다. 일부 빌드 의존성은 Node.js 22 이상을 요구한다.
- 제공 script는 `compile`, `watch`, `test`, `vscode:prepublish`이다.
- `@vscode/vsce`가 devDependency에 포함되어 있어 `pnpm exec vsce package`로 VSIX를 만들 수 있다.
- README 기능 제목과 실행/개발 명령은 현재 상태보다 오래됐다.

## 구현 계획

1. `docs/DEVELOPMENT.md`에 저장소 규칙부터 설치, 개발, 테스트, 패키징, 로컬 설치, 릴리스 전 확인 순서를 작성한다.
2. README의 버전 제목과 환경 준비를 v0.3.1/pnpm 기준으로 변경한다.
3. README의 개발 검증 섹션은 빠른 명령과 상세 가이드 링크를 제공하도록 확장한다.
4. compile, test, diff check, VSIX package 명령을 실행한다.
5. 작업 로그와 완료 상태를 갱신하고 커밋한다.

## 테스트 및 완료 기준

- 처음 참여한 개발자가 가이드만으로 의존성 설치부터 VSIX 설치까지 수행할 수 있다.
- README의 버전, 패키지 관리자, 테스트 및 패키징 명령이 현재 저장소와 일치한다.
- 내부 링크가 실제 파일을 가리킨다.
- compile, test, diff check 및 VSIX packaging이 성공한다.

## 작업 로그

### 2026-08-24 — 현황 조사 및 계획

- `package.json`, `pnpm-lock.yaml`, README와 저장소 작업 규칙을 확인했다.
- npm과 pnpm 명령을 섞어 새 `package-lock.json`을 만들지 않도록 설치와 직접 실행은 pnpm 기준으로 통일하고, `vsce` 내부의 기존 `vscode:prepublish` script는 현재 package 설정 그대로 설명하기로 했다.

### 2026-08-24 — package manager 버전 정정

- 처음에는 lockfileVersion 9.0을 pnpm major 9와 동일하다고 보고 pnpm 9를 계획했으나, 실제 `npx --yes pnpm@9 test`는 `packages field missing or empty`로 실행되지 않았다.
- `pnpm-workspace.yaml`의 `allowBuilds` 구성을 확인하고 pnpm 10.34.5로 같은 명령을 실행해 23개 테스트가 통과하는 것을 확인했다.
- 이에 따라 구현을 계속하기 전에 README와 개발 가이드의 기준을 pnpm 10으로 정정했다. 저장소 설정을 불필요하게 바꾸지 않고 현재 구성과 호환되는 도구 버전을 문서화한다.

### 2026-08-24 — 문서 작성 및 검증

- `docs/DEVELOPMENT.md`를 추가했다.
  - Node.js 22 LTS, Corepack/pnpm 10 환경 준비
  - 저장소 작업 문서 규칙과 주요 코드 위치
  - compile/watch/test 및 3회 반복 테스트
  - F5 Extension Development Host와 기능별 smoke checklist
  - version/CHANGELOG 변경, VSIX 패키징과 내용 확인
  - checksum, CLI/UI 로컬 설치, 커밋 및 릴리스 전 확인
  - `tsc`, `code` CLI, 호출 관계 누락 문제 해결
- `README.md`를 v0.3.1로 바꾸고 CodeLens declaration anchoring을 기능 목록에 반영했다. 실행 환경은 Node.js 22 LTS와 pnpm 10으로 수정하고 compile/test/diff/package 빠른 명령 및 상세 개발 가이드 링크를 추가했다.
- `npx --yes pnpm@10 run compile`: 성공.
- `npx --yes pnpm@10 test`: 23개 테스트 통과, 실패 0.
- `git diff --check`: 성공.
- README가 참조하는 `docs/DEVELOPMENT.md`, `AGENTS.md`, `CHANGELOG.md`의 존재를 shell 검사로 확인했다.
- `npx --yes pnpm@10 exec vsce package --out /tmp/impact-lens-development-guide-check.vsix`: 성공, 29 files, 141.65 KB.
- VSIX 목록에서 `extension/docs/DEVELOPMENT.md`가 7.67 KB로 포함된 것을 확인했다.
- `vsce`가 기존 `vscode:prepublish`의 `npm run compile`을 실행할 때 pnpm이 전달한 `verify-deps-before-run` 환경 설정을 다음 npm major가 지원하지 않을 것이라는 경고가 출력됐다. 현재 npm에서는 compile/package가 성공했으며 기능 실패는 아니다. 향후 npm major 변경 시 prepublish script를 `tsc -p ./`처럼 package-manager 중립 명령으로 바꾸는 후속 개선을 고려할 수 있다.
- 소스 코드, Extension 동작 및 release version은 변경하지 않았다.
