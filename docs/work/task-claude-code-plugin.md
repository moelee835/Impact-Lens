# Claude Code Plugin 추가

## 배경과 해결할 문제

v0.5.0에서 Codex용 plugin(`plugins/impact-lens`)을 추가해 Codex가 Impact Lens Agent CLI를
발견하고 안전한 분석·노트 workflow로 사용할 수 있게 했다. 같은 CLI를 Claude Code에서도
사용할 수 있지만 현재는 plugin 형태의 진입점이 없어 사용자가 매번 runner 경로와 JSON 계약을
직접 설명해야 한다.

Claude Code는 `.claude-plugin/plugin.json` manifest와 repository root의
`.claude-plugin/marketplace.json`을 사용하며 plugin의 `skills/`와 `commands/` 디렉터리를
자동으로 발견한다. Codex는 `.codex-plugin/plugin.json`과 `.agents/plugins/marketplace.json`을
사용하고 `commands/`를 읽지 않는다. 두 host의 manifest 경로가 서로 겹치지 않으므로 하나의
plugin payload를 공유할 수 있다.

## 범위

- `plugins/impact-lens`에 Claude Code manifest(`.claude-plugin/plugin.json`)를 추가한다.
- Claude Code 전용 slash command 2개(`analyze`, `notes`)를 `plugins/impact-lens/commands/`에 추가한다.
- repository root에 Claude Code marketplace(`.claude-plugin/marketplace.json`)를 추가한다.
- 기존 `skills/impact-lens-cli`와 `scripts/run-impact-lens`를 두 host가 공유하도록 유지한다.
- `.vscodeignore`에 `.claude-plugin/**`를 추가해 VSIX 경계를 유지한다.
- README, INSTALL, CHANGELOG, 개발 가이드에 Claude Code plugin을 반영한다.
- `claude plugin validate --strict`로 plugin과 marketplace를 검증한다.
- 기능 브랜치를 push하고 PR을 생성·병합한다.

## 범위에서 제외할 항목

- Extension 또는 CLI runtime 기능 변경
- Extension/CLI package version 변경과 새 GitHub Release 생성
- plugin runner의 pinned release fallback(v0.5.0) 변경
- 기존 Codex plugin의 manifest, skill 또는 runner 동작 변경
- npm registry 또는 VS Code Marketplace 게시
- 사용자 환경의 Claude Code 설정 변경 또는 plugin 자동 설치

## 현재 구현 조사 결과

- `plugins/impact-lens/.codex-plugin/plugin.json`은 `"skills": "./skills/"`로 skill 경로를
  명시하며 `commands/`를 참조하지 않는다. 따라서 `commands/` 추가는 Codex에 영향이 없다.
- `plugins/impact-lens/scripts/run-impact-lens`는 인자를 셸 평가 없이 전달하고
  `IMPACT_LENS_CLI_PATH` → `<repo>/cli/dist/index.js` → 전역 `impact-lens` →
  pinned v0.5.0 release 순서로 CLI를 찾는다. host에 독립적이므로 그대로 공유한다.
- `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`의 frontmatter는 `name`과
  `description`만 사용하며 두 host 모두에서 유효하다. 본문도 host 중립적으로 작성되어 있다.
- 설치된 Claude Code 2.1.243의 `claude plugin validate <path> --strict`로 plugin과
  marketplace를 검증할 수 있다.
- 공식 marketplace(`anthropics/claude-plugins-official`) 예시는 plugin entry에
  `name`, `description`, `source`, `category`, `author`, `homepage`를 사용한다.
  `category`는 `development`가 가장 일반적이다.
- `.vscodeignore`는 이미 `plugins/**`와 `.agents/**`를 제외하지만 root `.claude-plugin/**`는
  제외 목록에 없다.

## 단계별 구현 계획

1. `plugins/impact-lens/.claude-plugin/plugin.json`을 추가한다.
2. `plugins/impact-lens/commands/analyze.md`와 `notes.md`를 추가한다.
3. root `.claude-plugin/marketplace.json`을 추가한다.
4. `.vscodeignore`에 `.claude-plugin/**`를 추가한다.
5. `claude plugin validate`를 plugin 경로와 marketplace 경로에 대해 `--strict`로 실행한다.
6. runner를 실제 호출해 command 문서의 명령이 동작하는지 확인한다.
7. README, INSTALL, CHANGELOG, 개발 가이드를 갱신한다.
8. Extension과 CLI 테스트를 실행해 회귀가 없음을 확인한다.
9. VSIX를 패키징해 plugin과 marketplace 파일이 포함되지 않음을 확인한다.
10. 커밋 후 branch를 push하고 PR을 생성·병합한다.

## 테스트 및 완료 기준

- `claude plugin validate plugins/impact-lens --strict`가 통과한다.
- `claude plugin validate .claude-plugin/marketplace.json --strict`가 통과한다.
- Codex plugin validator 대상 파일(`.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json`)이
  변경되지 않는다.
- `sh -n plugins/impact-lens/scripts/run-impact-lens`가 통과하고 runner의 `note list`가
  `ok: true`를 반환한다.
- `npm run test:all`에서 Extension 32개와 CLI 16개 테스트가 통과한다.
- VSIX에 `.claude-plugin`, `plugins`, `.agents`가 포함되지 않는다.
- README, INSTALL, CHANGELOG, 개발 가이드가 Claude Code plugin 설치·업데이트·제거를 설명한다.
- 문서의 모든 로컬 link target이 존재한다.
- PR이 merge되고 원격 main이 merge commit을 포함한다.

## 롤백 전략

- validate 또는 runner 검증 실패 시 merge하지 않고 branch에서 수정한다.
- Claude Code manifest가 Codex plugin 동작에 영향을 주는 것이 확인되면 공유 디렉터리 대신
  별도 plugin 디렉터리로 분리한다.

## 작업 로그

- 2026-08-25: 저장소가 clean한 `main`(9ac3e8e)임을 확인하고 `feat/claude-code-plugin` branch를 만들었다.
- 2026-08-25: 설치된 Claude Code 2.1.243의 plugin 명령과 공식 marketplace 예시로 manifest,
  marketplace, command frontmatter 규격을 확인했다.
- 2026-08-25: 공유 payload 구조를 선택했다. Codex는 `.codex-plugin/plugin.json`과 `"skills": "./skills/"`만
  참조하고 `commands/`를 읽지 않으므로, 하나의 `plugins/impact-lens` 디렉터리에 host별 manifest만 추가하면
  skill과 runner의 이중화를 피할 수 있다. 별도 plugin 디렉터리로 복제하면 CLI 계약 문서가 host별로 갈라질
  위험이 있어 채택하지 않았다.
- 2026-08-25: `plugins/impact-lens/.claude-plugin/plugin.json`(version 0.1.0)과 root
  `.claude-plugin/marketplace.json`(marketplace name `impact-lens`)을 추가했다.
- 2026-08-25: `commands/analyze.md`와 `commands/notes.md`를 추가했다. 두 command 모두 skill과
  `references/cli-contract.md`를 따르도록 지시하고 `${CLAUDE_PLUGIN_ROOT}/scripts/run-impact-lens`를
  stdin JSON으로 호출한다. `notes.md`는 preview 우선, 최신 `expectedToken`을 사용한 명시적 apply,
  Personal note 미접근을 삭제로 보고하지 않는 제약을 그대로 유지한다.
- 2026-08-25: `claude plugin validate`를 plugin manifest, `commands`, `skills`, marketplace에 대해
  `--strict`로 실행해 모두 통과했다.
- 2026-08-25: end-to-end 설치를 검증했다. `claude plugin marketplace add ./ --scope local`과
  `claude plugin install impact-lens@impact-lens --scope local -y`가 성공했고,
  `claude plugin details impact-lens`가 version 0.1.0과 component 3개(`impact-lens-cli`, `analyze`,
  `notes`), always-on ~179 token을 보고했다. 검증 후 plugin과 marketplace를 제거하고 생성된
  `.claude/settings.local.json`을 삭제해 환경을 원복했다. 이 파일은 사용자 전역 gitignore로 제외되어
  저장소에 영향이 없음을 `git check-ignore`로 확인했다.
- 2026-08-25: runner를 직접 실행해 검증했다. `note list`가 `ok: true`와 `personalNotes: false`,
  `vscode_personal_notes_unavailable` limitation을 반환했다. `analyze --stdin`으로 `cli/src/index.ts`의
  `run`을 depth 2로 분석해 root와 direct caller `main`을 포함한 `ok: true` 응답을 받았다.
- 2026-08-25: `.vscodeignore`에 `.claude-plugin/**`를 추가했다. `plugins/**`는 이미 제외되어 있어
  plugin 본체와 command는 기존 규칙으로 격리된다.
- 2026-08-25: README에 Claude Code Plugin 구성 요소, 빠른 설치, slash command 예시, host별 manifest와
  marketplace 표, 프로젝트 구성 항목을 추가하고 `Agent CLI와 Codex` 섹션을 `Agent CLI와 Plugin`으로
  변경했다. nav anchor도 함께 갱신했다.
- 2026-08-25: INSTALL에 요구 사항, `## 5. Claude Code Plugin 설치`, 업데이트, 제거, 문제 해결 항목을
  추가하고 이후 섹션 번호를 5-9에서 6-10으로 조정했다. README의 `INSTALL.md#3-agent-cli-설치` badge
  링크가 가리키는 3번 섹션은 변경되지 않았다.
- 2026-08-25: CHANGELOG에 `Unreleased` 섹션을 추가했다. Extension과 CLI runtime이 바뀌지 않았고
  runner의 pinned fallback이 실제 존재하는 v0.5.0 tarball을 가리켜야 하므로 package version은
  올리지 않았다. version bump와 새 Release는 별도 작업으로 남긴다.
- 2026-08-25: 개발 가이드에 plugin payload 코드 위치, plugin/marketplace/skill/command 검증 명령,
  runner 실행 확인, VSIX 제외 항목을 추가했다.
- 2026-08-25: `npm run test:all`을 실행해 Extension 32개와 CLI 16개 테스트가 모두 통과했다.
  `git diff --check`도 통과했다.
- 2026-08-25: `vsce package`로 VSIX를 생성해 27 files, 1.07MB를 확인했다. 포함 목록에
  `.claude-plugin`, `plugins/`, `.agents`, `src/`, `cli/`, `docs/`, `out/test/`가 없음을 확인했다.
  (`extension/out/testFile.js`는 test output이 아니라 test 파일 판별 runtime 모듈이다.)
- 2026-08-25: README, INSTALL, 개발 가이드, CLI README의 로컬 link target 12개가 모두 존재함을 확인했다.
- 2026-08-25: Codex plugin manifest, marketplace, skill, runner는 변경하지 않았음을 `git diff`로 확인했다.
- 2026-08-25: 완료 요청에 따라 독립 감사를 다시 수행했다. Claude Code 2.1.241에서 plugin manifest,
  `commands`, `skills`, marketplace의 strict validation을 모두 재실행해 통과했고, runner의 `sh -n`과
  `note list`도 `ok: true`를 반환했다.
- 2026-08-25: `npm run test:all`을 재실행해 Extension 32개와 CLI 16개 테스트가 모두 통과했으며,
  `/tmp/impact-lens-claude-audit.vsix`를 다시 패키징해 27 files, 1.07MB와 plugin·marketplace 제외를
  확인했다. `git diff --check`와 기존 Codex plugin 파일 불변 조건도 다시 통과했다.
- 2026-08-25: 원격 기능 branch가 commit `7fc9ce8`까지 push되어 있고 PR #15가 열려 있음을 확인했다.
  GitHub API는 PR을 `mergeable: true`, `mergeable_state: clean`으로 보고했으며 등록된 status/check run은
  없었다. 이번 감사 기록을 추가 커밋으로 push한 뒤 PR을 병합한다.

## 남은 제한 사항

- Claude Code plugin의 실제 사용 검증은 CLI 수준(설치, inventory, runner 실행)까지 수행했다.
  실행 중인 Claude Code 세션에서 `/impact-lens:analyze`와 `/impact-lens:notes`를 호출하는 대화형
  확인은 새 세션 재시작이 필요해 이번 작업에서는 수행하지 않았다.
- GitHub marketplace 경로(`claude plugin marketplace add moelee835/Impact-Lens`)는 변경이 main에
  병합된 이후에만 동작한다. 이번 검증은 로컬 디렉터리 marketplace로 수행했다.
