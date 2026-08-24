# VSIX 개발 문서 제외

- 상태: 구현 및 검증 완료
- 작성일: 2026-08-24

## 배경과 해결할 문제

v0.3.1 VSIX에 `docs/DEVELOPMENT.md`, `docs/work/**`와 `AGENTS.md`가 포함됐다. 이 파일은 저장소 개발자와 작업 에이전트를 위한 자료이며 Extension runtime이나 사용자 상세 화면에 필요하지 않다. 불필요한 내부 문서를 배포 artifact에서 제외해야 한다.

## 범위

- `.vscodeignore`에 `docs/**`와 `AGENTS.md` 추가
- VSIX에 runtime, manifest, README, CHANGELOG, LICENSE와 media만 포함되는지 확인
- patch version 0.3.2와 CHANGELOG 갱신
- test, compile, VSIX 목록 및 checksum 검증

## 범위 제외

- 저장소에서 개발 가이드 또는 작업 문서 삭제
- README, CHANGELOG 및 LICENSE 제외
- Extension 기능 변경

## 현재 구현 조사

- `.vscodeignore`는 `src/**`, test output, lockfile 등을 제외하지만 `docs/**`와 `AGENTS.md`는 제외하지 않는다.
- v0.3.1 VSIX는 총 27개 파일이며 개발 문서와 작업 문서를 포함한다.
- `README.md`와 `CHANGELOG.md`는 VS Code Extension Details 및 변경 내역에 사용되므로 유지해야 한다.

## 구현 계획

1. 개발 전용 문서를 `.vscodeignore`로 제외한다.
2. version과 CHANGELOG를 v0.3.2로 갱신한다.
3. 전체 테스트와 compile을 실행한다.
4. VSIX를 생성하고 file list에서 개발 문서가 없고 필수 runtime 파일이 있는지 검사한다.
5. 작업 로그를 갱신하고 커밋, PR, merge 및 patch release를 진행한다.

## 테스트 및 완료 기준

- VSIX에 `docs/**`와 `AGENTS.md`가 없다.
- VSIX에 `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `media/**`, `out/extension.js`가 있다.
- 자동 테스트와 compile, package가 성공한다.
- v0.3.2 release asset이 수정된 file list를 가진다.

## 작업 로그

### 2026-08-24 — 원인 확인

- 개발 가이드 추가 작업에서 VSIX 포함 여부를 성공 기준으로 잡은 판단이 잘못됐음을 확인했다.
- 개발 문서는 저장소에는 유지하되 `.vscodeignore`로 배포 경계만 바로잡기로 했다.

### 2026-08-24 — 구현 및 검증

- `.vscodeignore`에 `AGENTS.md`와 `docs/**`를 추가했다.
- `package.json`, `CHANGELOG.md`, README 기능 제목과 package 예시를 v0.3.2로 갱신했다.
- `npx --yes pnpm@10 test`: 23개 테스트 통과, 실패 0.
- `npx --yes pnpm@10 run compile`: 성공.
- `git diff --check`: 성공.
- `npx --yes pnpm@10 exec vsce package --out /tmp/impact-lens-0.3.2.vsix`: 성공, 23 files, 121.83 KB.
- `unzip -Z1` 결과에 `extension/docs/` 또는 `extension/AGENTS.md`가 있으면 실패하도록 awk 검사했으며 정상 통과했다.
- 필수 파일 6개를 대소문자 무시 exact path로 검사했다.
  - `extension/package.json`
  - `extension/readme.md`
  - `extension/changelog.md`
  - `extension/LICENSE.txt`
  - `extension/media/impact-lens.png`
  - `extension/out/extension.js`
- 최종 VSIX SHA-256은 `173388f3efe3ca8ce8fbc60bcda32e5c5d3ec9c3f953d8194cfcbfa79a8f3f66`이다. 작업 문서는 VSIX에서 제외되므로 이 로그 갱신이 artifact checksum을 바꾸지 않는다.
- `vsce` prepublish가 기존 npm script를 실행할 때 pnpm 환경 변수 관련 npm deprecation warning이 출력되지만 compile/package 결과는 성공했다.
