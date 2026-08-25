# Codex 플러그인 추가 계획

## 상태

- 구현 및 검증 완료

## 배경과 해결할 문제

Impact Lens에는 에이전트가 호출 영향도와 함수 노트를 기계 판독 가능한 JSON으로 조회·관리할 수 있는 CLI가 있지만, Codex가 이 기능의 존재와 안전한 사용 절차를 자동으로 발견할 수 있는 플러그인이 없다. 저장소 하위에 Codex 플러그인을 추가하여 Codex가 Impact Lens CLI를 선택하고 일관된 계약으로 실행할 수 있게 한다.

## 범위

- 저장소 하위 `plugins/impact-lens`에 Codex 플러그인을 만든다.
- 필수 `.codex-plugin/plugin.json`과 Impact Lens CLI 스킬을 제공한다.
- 로컬 소스 빌드, 전역 설치, 공식 릴리즈 패키지 순서로 CLI를 찾는 실행 래퍼를 제공한다.
- 영향도 분석과 노트 조회·목록·추가·수정·삭제 절차를 스킬에 명시한다.
- 노트 변경은 preview와 `expectedToken`을 거치는 기존 CLI의 낙관적 동시성 계약을 보존한다.
- 저장소를 Codex marketplace로 등록해 플러그인을 설치하는 방법을 README에 안내한다.

## 범위에서 제외할 항목

- Impact Lens CLI 또는 VS Code Extension 자체의 기능과 응답 스키마 변경
- 별도의 MCP 서버나 Codex App 구현
- 사용자 Codex 설정 또는 marketplace에 플러그인을 자동 설치
- GitHub push, PR, merge, release

## 현재 구현 조사 결과

- CLI 진입점은 `impact-lens analyze`와 `impact-lens note get|list|set|delete`를 제공한다.
- CLI의 표준 에이전트 인터페이스는 stdin JSON 요청과 stdout/stderr 단일 JSON 응답이다.
- 좌표는 1-based UTF-16이며, 노트 쓰기/삭제는 기본적으로 preview이고 실제 반영에는 `apply: true`와 최신 `expectedToken`이 필요하다.
- CLI 패키지는 아직 npm 공개 패키지가 아니라 GitHub v0.4.0 릴리즈 tarball로 배포된다.
- Codex CLI는 marketplace를 먼저 등록한 후 `codex plugin add <plugin>@<marketplace>`로 플러그인을 설치한다.
- 플러그인은 `.codex-plugin/plugin.json`을 필수로 하고, `skills`와 `scripts`를 선택적으로 포함할 수 있다.

## 설계 결정

- 플러그인 이름은 폴더명과 manifest 이름을 동일하게 `impact-lens`로 사용한다.
- CLI 자체를 플러그인에 복제하지 않는다. 실행 래퍼가 다음 순서로 실행 대상을 선택한다.
  1. `IMPACT_LENS_CLI_PATH`로 지정한 실행 파일 또는 JavaScript 진입점
  2. 같은 저장소 checkout의 `cli/dist/index.js`
  3. PATH의 전역 `impact-lens`
  4. Node.js 22+와 npm을 사용한 GitHub v0.4.0 CLI tarball
- 스킬 본문은 의사결정과 안전 규칙 중심으로 유지하고, 요청 형식·출력 해석·exit code는 별도 reference로 분리한다.
- 노트 변경은 사용자가 변경을 요청한 경우에만 preview 후 apply하도록 하며, preview 결과의 토큰을 그대로 사용한다.

## 단계별 구현 계획

1. plugin-creator 스캐폴드로 manifest 기본 구조를 생성하고 저장소 경로에 맞게 적용한다.
2. `impact-lens-cli` 스킬과 CLI 계약 reference를 작성한다.
3. 실행 대상 탐색과 인자 전달을 담당하는 래퍼 스크립트를 작성한다.
4. README에 Codex marketplace 등록, 플러그인 설치, 사용 예시를 추가한다.
5. plugin/skill validator, 래퍼 통합 실행, 기존 전체 테스트와 diff 검사를 수행한다.
6. 작업 로그를 갱신하고 독립 커밋으로 남긴다.

## 테스트 및 완료 기준

- plugin-creator validator가 오류 없이 통과한다.
- skill-creator quick validator가 오류 없이 통과한다.
- 래퍼가 현재 저장소의 로컬 CLI를 선택하여 JSON 결과를 반환한다.
- 래퍼를 통한 영향도 분석과 최소 하나의 노트 읽기 작업이 성공한다.
- 노트 변경 절차가 preview/apply 및 `expectedToken` 계약을 정확히 설명한다.
- README의 설치 명령과 모든 로컬 Markdown 링크가 유효하다.
- 기존 Extension/CLI 전체 테스트가 통과한다.
- `git diff --check`가 통과하고 변경 사항이 별도 커밋으로 남는다.

## 작업 로그

- 2026-08-25: `AGENTS.md`, CLI README/manifest/schema/argument parser, Codex plugin/skill 작성 규격을 조사했다.
- 2026-08-25: 로컬 Codex CLI 도움말에서 marketplace 등록은 `codex plugin marketplace add`, 설치는 `codex plugin add`를 사용하는 현재 명령 계약을 확인했다.
- 2026-08-25: 공식 OpenAI 문서 검색에서는 현재 플러그인 설치 페이지를 확인하지 못해, 이 저장소의 설치 안내는 설치된 Codex CLI의 도움말에서 검증한 명령을 기준으로 작성하기로 했다.
- 2026-08-25: plugin-creator 스캐폴드를 임시 디렉터리에서 생성해 manifest와 repo marketplace 기본 구조를 확인했다. 저장소 파일은 `apply_patch`로 작성했으며 scaffold placeholder는 포함하지 않았다.
- 2026-08-25: `.agents/plugins/marketplace.json`을 추가했다. marketplace 이름은 generator 기본값인 `personal`을 유지하고 `plugins/impact-lens`를 `AVAILABLE`, `ON_INSTALL`, `Productivity` 항목으로 등록했다.
- 2026-08-25: `plugins/impact-lens/.codex-plugin/plugin.json`에 제품 설명, 저장소, 라이선스, 검색 키워드, Read/Write capability와 기본 prompt를 정의했다. MCP/App 없이 CLI 사용 지침만 필요하므로 `mcpServers`와 `apps`는 추가하지 않았다.
- 2026-08-25: `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`를 추가했다. 영향도 분석의 정적 분석 경계, incomplete/limitation 해석, Personal note 비지원, note mutation의 사용자 승인·preview·최신 token 규칙을 핵심 지침으로 작성했다.
- 2026-08-25: 상세 JSON 요청, provider 설정, 응답 envelope, note CRUD와 exit status를 `references/cli-contract.md`로 분리했다. 스킬 본문은 실제 작업 시 필요한 reference만 읽도록 연결했다.
- 2026-08-25: `plugins/impact-lens/scripts/run-impact-lens` 실행 래퍼를 추가했다. 임의 command string을 평가하지 않고 filesystem path 또는 고정된 실행 경로만 사용하며, local source → global CLI → pinned v0.4.0 release 순서로 탐색한다. 설치 환경의 버전 전환을 위해 `IMPACT_LENS_CLI_PATH`와 `IMPACT_LENS_CLI_PACKAGE` override를 제공한다.
- 2026-08-25: README에 로컬/GitHub marketplace 등록, plugin 설치, 자연어 사용 예, runner 탐색 순서와 note 안전 경계를 추가했다.
- 2026-08-25: plugin validator가 `Plugin validation passed`, skill quick validator가 `Skill is valid!`로 통과했다. marketplace name validator는 `personal`을 반환했다.
- 2026-08-25: `sh -n plugins/impact-lens/scripts/run-impact-lens`가 통과했고 runner를 통해 이 저장소의 note 목록을 조회했다. `ok: true`, Shared/Local 빈 목록, Personal unavailable limitation을 포함한 JSON을 확인했다.
- 2026-08-25: runner로 `cli/src/index.ts`의 `run` 함수를 depth 2로 실제 분석했다. 3개 node와 2개 edge, `complete: true`, `truncated: false`를 반환했다.
- 2026-08-25: `npm run test:all`을 실행해 Extension 테스트 32개와 CLI 테스트 16개가 모두 통과했다.
- 2026-08-25: README와 plugin skill의 로컬 Markdown 링크 검사, `git diff --check`가 통과했다.

## 제한 사항과 후속 과제

- 플러그인 설치 자체는 사용자 Codex 설정을 변경하므로 이 작업에서는 자동 실행하지 않았다. README에 검증된 현재 Codex CLI 명령을 제공했다.
- checkout에 `cli/dist/index.js`가 없고 global CLI도 없으면 runner가 고정된 v0.4.0 GitHub release package를 npm으로 내려받는다. 최초 실행에는 Node.js 22 이상, npm, 네트워크 접근과 실행 환경의 승인이 필요하다.
- CLI release 버전이 변경되면 plugin manifest 버전과 별개로 runner의 기본 release URL을 갱신해야 한다. 환경 변수 override는 새 버전 검증이나 전환을 위한 탈출구로만 제공한다.
