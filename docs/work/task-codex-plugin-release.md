# Codex 플러그인 v0.5.0 릴리즈 계획

## 상태

- PR #14 merge 완료
- 병합된 main 최종 artifact 검증 완료
- v0.5.0 Release 게시 준비 완료

## 배경과 해결할 문제

`feat/codex-plugin` 브랜치에는 Impact Lens CLI를 사용하는 Codex plugin, repo marketplace manifest, 설치 가이드, 상용 서비스형 README와 새 hero가 구현·검증되어 있다. 사용자의 요청에 따라 이 변경을 Pull Request로 병합하고 공식 GitHub Release로 배포한다.

Codex plugin은 하위 호환 신규 사용자 기능이므로 기존 v0.4.0 다음 minor version인 v0.5.0으로 릴리즈한다. Extension과 CLI runtime 기능은 변경하지 않지만 저장소의 세 사용 경로(Extension, Agent CLI, Codex plugin)를 하나의 release 기준으로 맞춘다.

## 현재 상태 조사 결과

- `feat/codex-plugin`은 `origin/main`보다 설치 가이드, Codex plugin, README/hero 커밋이 앞서 있고 worktree는 clean하다.
- 해당 head의 기존 PR은 없다.
- 최신 공개 release는 v0.4.0이며 v0.5.0 tag/release는 없다.
- 열린 GitHub Issue는 없어 이번 release에서 닫을 Issue는 없다.
- GitHub CLI는 외부 credential 환경에서 `repo`, `workflow` scope로 인증되어 있다.
- root Extension과 CLI package version은 모두 0.4.0이다.
- README, INSTALL과 plugin runner의 기본 release URL이 v0.4.0을 가리킨다.
- `.vscodeignore`가 `.agents/**`와 `plugins/**`를 제외하지 않으므로 현재 상태로 VSIX를 만들면 Codex plugin 파일이 Extension package에 포함될 수 있다.
- README hero는 Extension 상세 페이지에서도 사용하는 마케팅 자산이므로 VSIX에 포함하고, Codex plugin과 marketplace manifest만 제외한다.

## 범위

- root Extension과 CLI package version을 v0.5.0으로 맞춘다.
- CHANGELOG, README, INSTALL, plugin runner의 현재 release 표기를 v0.5.0으로 갱신한다.
- `.vscodeignore`에 `.agents/**`와 `plugins/**`를 추가해 Codex plugin을 VSIX에서 격리한다.
- 정적 checksum 값이 새 artifact 생성 때마다 문서와 어긋나지 않도록 INSTALL은 GitHub Release asset digest와 로컬 계산값을 비교하는 절차를 기준으로 정리한다.
- Extension/CLI/Plugin 검증과 VSIX/CLI tarball 패키징을 수행한다.
- 기능 브랜치를 push하고 PR을 생성·병합한다.
- 병합된 `main`에서 테스트와 artifact를 다시 생성하고 최종 checksum을 계산한다.
- tag가 merge commit을 가리키도록 공개 v0.5.0 Release를 만들고 VSIX와 CLI tarball을 첨부한다.
- release, asset, digest, tag, main 상태를 최종 확인한다.

## 범위에서 제외할 항목

- Extension 또는 CLI runtime 기능 변경
- Codex plugin의 marketplace 자동 설치나 사용자 Codex 설정 변경
- npm registry 또는 VS Code Marketplace 게시
- 별도 GitHub Issue 생성·종료

## 단계별 구현 계획

1. v0.5.0 version, changelog, 설치/README URL과 runner fallback을 갱신한다.
2. VSIX에서 `.agents/**`, `plugins/**`를 제외한다.
3. 전체 테스트, plugin/skill validator, runner 통합 분석을 다시 실행한다.
4. branch에서 VSIX와 CLI tarball을 사전 패키징해 파일 목록과 설치 가능성을 검증한다.
5. 릴리즈 준비 변경과 작업 문서를 커밋하고 branch를 push한다.
6. PR을 생성하고 checks를 확인한 뒤 merge한다.
7. 최신 `main`에서 전체 테스트와 두 artifact를 다시 생성한다.
8. checksum, package contents, 설치된 CLI smoke test와 production audit을 확인한다.
9. v0.5.0 GitHub Release를 merge commit 대상으로 게시한다.
10. tag, release 공개 상태, asset 이름·크기·digest와 clean main을 확인한다.

## 테스트 및 완료 기준

- `npm run test:all`에서 Extension 32개와 CLI 16개 테스트가 모두 통과한다.
- plugin-creator validator, skill-creator quick validator와 runner 영향 분석이 통과한다.
- `pnpm exec vsce package`가 성공하고 VSIX에 `.agents`, `plugins`, `cli`, `docs`, test output 또는 source가 포함되지 않는다.
- README hero와 Extension runtime/icon/changelog는 VSIX에 포함된다.
- `pnpm --dir cli pack`이 성공하고 tarball에 runtime dist, schema, README와 license만 포함된다.
- 새 prefix에 CLI tarball을 설치해 `impact-lens` 분석이 성공하고 production audit에서 실제 취약점이 없다.
- root/CLI/README/INSTALL/runner/CHANGELOG의 v0.5.0 표기가 일치한다.
- PR이 merge되고 원격 main이 merge commit을 포함한다.
- 공개 v0.5.0 release의 tag가 최종 main commit을 가리킨다.
- release에 `impact-lens-0.5.0.vsix`와 `impact-lens-cli-0.5.0.tgz`가 첨부된다.
- 로컬 checksum과 GitHub asset digest가 일치한다.
- `git diff --check`가 통과하고 최종 worktree가 clean하다.

## 롤백 전략

- PR merge 전 검증 실패 시 merge하지 않고 브랜치에서 수정한다.
- merge 후 artifact 검증 실패 시 release를 만들지 않고 main 수정 PR을 준비한다.
- release 게시 후 digest 또는 artifact가 잘못되면 기존 asset을 조용히 교체하지 않고 release를 중단하고 수정 버전을 준비한다.

## 작업 로그

- 2026-08-25: 최신 release v0.4.0, 관련 기존 PR 없음, 열린 Issue 없음, GitHub CLI 인증과 현재 버전 참조를 확인했다.
- 2026-08-25: `.vscodeignore`에 Codex plugin 경로가 없어 VSIX package 경계 보완이 필요함을 발견했다.
- 2026-08-25: root Extension과 CLI package version을 0.5.0으로 변경하고 CHANGELOG에 Codex plugin, 안전한 runner, marketplace, README hero와 VSIX 격리 내용을 추가했다.
- 2026-08-25: README, INSTALL, 개발 가이드와 plugin runner의 기본 release URL을 v0.5.0으로 갱신했다. INSTALL의 고정 checksum은 GitHub Release asset digest와 로컬 계산값을 직접 비교하는 절차로 변경했다.
- 2026-08-25: `.vscodeignore`에 `.agents/**`, `plugins/**`를 추가했다. README가 참조하는 `media/impact-lens-readme-hero.png`는 Extension 상세 페이지에서 사용하도록 유지했다.
- 2026-08-25: `npm run test:all`을 실행해 Extension 32개와 CLI 16개 테스트가 모두 통과했다.
- 2026-08-25: plugin validator와 skill quick validator가 통과했고 runner의 note list가 `ok: true`와 Personal unavailable limitation을 반환했다. runner shell syntax 검사도 통과했다.
- 2026-08-25: README와 INSTALL을 MarkdownIt으로 변환하고 모든 로컬 link target을 확인했다. `git diff --check`가 통과했다.
- 2026-08-25: 전역 pnpm이 없어 repository packageManager major와 같은 `npx --yes pnpm@10`으로 패키징했다.
- 2026-08-25: INSTALL에 Codex plugin의 요구 사항, GitHub/로컬 marketplace 설치, 확인, 업데이트, 제거와 문제 해결 절차를 추가했다. 공식 OpenAI 문서 검색에서는 plugin 설치 페이지를 확인하지 못해 설치된 Codex CLI의 `--help`로 검증한 명령만 사용했다.
- 2026-08-25: INSTALL 변경 후 브랜치 VSIX `/tmp/impact-lens-0.5.0-branch.vsix`를 다시 생성했다. 27 files, 1.07MB이며 SHA-256은 `9b77c59cfa13753a5b226af4006dcb3e8207f8a42ba7564b64ad889029537bf3`이다.
- 2026-08-25: VSIX에 Extension manifest/runtime, README, INSTALL, CHANGELOG, 기존 icon과 README hero가 포함되고 `.agents`, `plugins`, `cli`, `docs`, `src`, `node_modules`, test output은 포함되지 않음을 자동 검사했다.
- 2026-08-25: CLI tarball `/tmp/impact-lens-cli-0.5.0.tgz`를 생성했다. 12 files이며 SHA-256은 `29e87440a6c06189ac2d3309033b151526c86c57288bf2441ee905180d5807f0`이다. runtime JS 7개, schema 2개, package manifest, README와 LICENSE만 포함했다.
- 2026-08-25: CLI tarball을 새 `/tmp/impact-lens-cli-install.pLgzDV` prefix에 설치했다. 설치된 binary로 `cli/src/index.ts`의 `run`을 depth 2로 분석해 3 nodes, 2 edges, `complete: true`, `truncated: false`를 확인했다.
- 2026-08-25: 설치된 production dependency tree를 `npm audit --omit=dev`로 검사해 `found 0 vulnerabilities`를 확인했다. sandbox DNS 제한으로 첫 audit가 실패했으며 외부 네트워크 승인 환경에서 동일 검사를 재실행해 통과했다.
- 2026-08-25: 릴리즈 준비 커밋 `bcb4f10`을 `feat/codex-plugin`에 push하고 [PR #14](https://github.com/moelee835/Impact-Lens/pull/14)를 생성했다. GitHub는 `MERGEABLE`, `CLEAN`을 반환했고 등록된 자동 check는 없었다.
- 2026-08-25: PR #14를 merge commit 방식으로 병합했다. merge commit은 `befd0a291392c3bd91aa4a83ca4a9f91a46b582e`이며 로컬 `main`과 `origin/main`이 일치함을 확인했다. 열린 Issue가 없어 close 대상은 없었다.
- 2026-08-25: 병합된 main에서 `npm run test:all`을 다시 실행해 Extension 32개와 CLI 16개 테스트가 모두 통과했다. plugin/skill validator, runner shell syntax와 `git diff --check`도 다시 통과했다.
- 2026-08-25: 병합된 main에서 최종 `/tmp/impact-lens-0.5.0.vsix`를 생성했다. 27 files, 1.07MB이며 SHA-256은 `014849bfb37b51b810f18526b9d13703ed20af4304155379ccd320d51887d7e8`이다.
- 2026-08-25: 최종 VSIX에 manifest, README, INSTALL, CHANGELOG, README hero, Extension icon/runtime이 포함되고 `.agents`, `plugins`, `cli`, `docs`, `src`, `node_modules`, test output이 포함되지 않음을 확인했다.
- 2026-08-25: 병합된 main에서 최종 `/tmp/impact-lens-cli-0.5.0.tgz`를 생성했다. 12 files이며 SHA-256은 `29e87440a6c06189ac2d3309033b151526c86c57288bf2441ee905180d5807f0`이다.
- 2026-08-25: 최종 CLI tarball을 새 `/tmp/impact-lens-cli-release.A9kKH4` prefix에 설치했다. 설치된 binary의 depth 2 분석이 3 nodes, 2 edges, `complete: true`, `truncated: false`를 반환했고 production audit는 `found 0 vulnerabilities`였다.
- 2026-08-25: 현재 환경에는 `code` CLI가 없어 최종 VSIX를 로컬 VS Code에 설치하는 smoke test는 실행하지 못했다. package manifest, 포함 파일, compile/test로 검증했지만 실제 Extension Development Host의 pointer/theme 수동 검증은 이번 release 환경의 제한으로 남는다.
- 2026-08-25: 이 최종 기록 변경은 `docs/work/**`에만 있으며 VSIX와 CLI tarball에서 모두 제외된다. 따라서 기록 커밋 전 생성한 최종 artifact의 package payload는 release target tree의 배포 대상 파일과 동일하다.
