# 설치 가이드 문서화 계획

- 상태: 구현 및 검증 완료
- 작성일: 2026-08-25

## 배경과 해결할 문제

Impact Lens v0.4.0은 VS Code Extension용 VSIX와 Agent CLI용 tarball을 별도 artifact로 배포한다. 현재 README와 개발 가이드에 설치 관련 내용이 일부 있지만, 일반 사용자가 release artifact를 설치·업데이트·검증·제거하는 절차는 한 곳에 정리되어 있지 않다.

루트 `INSTALL.md`를 사용자 설치 가이드의 기준 문서로 추가하고 README에서 쉽게 찾을 수 있도록 안내한다.

## 범위

### 포함

- 지원 환경과 Extension/CLI 선택 기준
- GitHub Release에서 VSIX와 CLI tarball을 설치하는 절차
- `code` CLI가 있는 경우와 없는 경우의 VSIX 설치 방법
- CLI global 설치와 설치하지 않는 일회성 실행 방법
- Extension과 CLI 설치 확인
- 새 release로 업데이트하는 방법
- checksum 검증
- Extension과 CLI 제거
- Personal, Shared, Source, CLI Local note가 제거 시 어떻게 처리되는지 설명
- 흔한 설치 오류와 해결 방법
- README의 설치 가이드 링크 및 간단한 진입 안내

### 제외

- 소스 빌드, 테스트, VSIX/CLI package 생성과 release 발행 절차
- OS별 package manager 설치 자체의 상세 안내
- Marketplace 자동 게시
- CLI의 전체 JSON 계약과 note CRUD 사용법 복제
- 제품 코드, 설정, version 또는 release artifact 변경

## 현재 구현 조사 결과

- v0.4.0 Release에는 `impact-lens-0.4.0.vsix`와 `impact-lens-cli-0.4.0.tgz`가 함께 게시되어 있다.
- Extension은 VS Code 1.96 이상이 필요하다.
- CLI는 Node.js 22 이상이 필요하며 설치 시 `typescript` 5.9.3과 `typescript-language-server` 6.0.0 dependency가 함께 설치된다.
- CLI package는 npm registry가 아니라 GitHub Release tarball로 배포된다.
- README의 `실행`은 소스 checkout과 개발 실행에 가깝고 일반 설치 흐름과 구분이 필요하다.
- `docs/DEVELOPMENT.md`의 VSIX 설치는 개발자가 로컬 build artifact를 확인하는 절차이므로 사용자 설치 문서를 대체하지 않는다.
- Extension Personal note는 VS Code workspaceState에 남고, Shared/Local note는 workspace 파일이며, Source note는 source comment다. 제거 명령이 이 데이터를 자동 삭제하지 않는다는 점을 명시해야 한다.

## 단계별 구현 계획

1. 루트 `INSTALL.md`에 Extension과 CLI 설치 경로를 구분한다.
2. 공식 v0.4.0 Release 및 두 direct-download URL을 제공한다.
3. CLI 설치 명령은 URL 직접 설치와 tarball 다운로드 후 설치를 모두 설명한다.
4. 설치 확인, 업데이트, checksum, 제거 및 troubleshooting을 문서화한다.
5. README 상단과 실행/Agent CLI 섹션에 설치 가이드 링크를 추가하고 소스 개발 실행과 사용자 설치를 구분한다.
6. Markdown link target, version, artifact 이름, 명령 및 whitespace를 검증한다.

## 테스트 및 완료 기준

- 루트 `INSTALL.md`가 생성되고 README에서 상대 링크로 접근할 수 있다.
- Extension과 CLI artifact 이름 및 v0.4.0 URL이 실제 release 이름과 일치한다.
- VSIX 설치의 CLI/UI 두 경로가 모두 설명된다.
- CLI 설치·확인·업데이트·제거 명령이 서로 일관된다.
- checksum과 note 보존 범위가 명시된다.
- 개발 빌드 절차는 `docs/DEVELOPMENT.md`로 안내하고 사용자 설치 절차와 혼동되지 않는다.
- Markdown local link target이 모두 존재한다.
- `git diff --check`가 성공한다.
- 문서 외 runtime, package version 및 release artifact가 변경되지 않는다.

## 작업 로그

### 2026-08-25 — 조사 및 계획 수립

- README, CLI README와 개발 가이드의 설치·실행 관련 섹션을 조사했다.
- Extension과 CLI가 서로 다른 artifact와 runtime 요구 사항을 가진다는 점을 설치 문서 구조의 기준으로 정했다.
- 일반 설치와 소스 개발 실행을 분리하고, 제거 시 note data가 자동 삭제되지 않는다는 점을 포함하기로 했다.
- `docs/install-guide` 브랜치를 생성했다. INSTALL.md와 README 수정은 이 계획 작성 후 시작한다.

### 2026-08-25 — INSTALL.md 및 README 작성

- 루트 `INSTALL.md`를 추가했다.
- Extension과 Agent CLI가 별도 artifact이며 필요한 구성만 설치할 수 있다는 선택 기준을 문서 첫 부분에 배치했다.
- Extension은 `code --install-extension`과 VS Code `Install from VSIX...` 두 설치 경로, reload 및 설치 버전 확인을 설명했다.
- CLI는 release URL global 설치, tarball 다운로드 후 global 설치와 `npm exec --package=<release-url>` 일회성 실행을 설명했다.
- v0.4.0 VSIX/CLI direct URL과 release SHA-256을 기록하고 macOS, Linux, Windows PowerShell 검증 명령을 추가했다.
- Extension/CLI 업데이트 및 제거 명령을 추가했다.
- Extension 제거 전 Personal note를 Shared로 게시하도록 안내하고 Shared, CLI Local, Source note가 package 제거로 자동 삭제되지 않는다는 데이터 경계를 명시했다.
- `code`, `impact-lens`, Node version, provider 및 stale Extension 관련 문제 해결 절차를 추가했다.
- README 도입부와 새 `설치` 섹션에서 INSTALL.md, Release와 두 artifact로 연결했다.
- 기존 `실행` 제목을 `소스에서 개발 실행`으로 바꿔 일반 사용자 설치와 repository checkout 개발 흐름을 구분했다.
- Agent CLI 섹션에서도 release 설치는 INSTALL.md로 안내하고 기존 build 명령은 source checkout용임을 명확히 했다.
- 개발 build와 release 발행 상세는 복제하지 않고 기존 `docs/DEVELOPMENT.md`로 연결했다.

### 2026-08-25 — 검증

- 로컬 Markdown link 검사: README.md와 INSTALL.md의 모든 상대 링크 target이 존재함을 확인했다.
- `git diff --check`: 공백 오류 없음.
- v0.4.0 Release page, VSIX direct URL, CLI tarball direct URL을 HEAD request로 검사했고 모두 HTTP 200이었다.
- `npm exec --yes --package=/tmp/impact-lens-cli-0.4.0.tgz -- impact-lens analyze ...`를 실제 실행해 전역 설치 없는 구문이 compact JSON 성공 결과와 3개 node, 2개 edge를 반환함을 확인했다.
- README와 INSTALL.md의 version, artifact 이름 및 direct URL 표기가 일치함을 `rg`로 확인했다.
- 변경 파일은 `INSTALL.md`, `README.md`와 이 작업 문서뿐이다. runtime code, package/configuration, version과 release artifact는 변경하지 않았다.
- 문서 전용 변경이므로 제품 compile/test는 재실행하지 않았다. 명령 실행, link, URL 및 diff 검증을 변경 위험에 맞게 수행했다.
