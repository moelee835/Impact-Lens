# v0.9.1 release — B-4 공개 default-path 사후 검증 (verification record)

- 상태: **완료.** `v0.9.1` 태그·GitHub Release 발행(commander 세션) 완료 후, 발행된 아티팩트를
  대상으로 수행.
  release: https://github.com/moelee835/Impact-Lens/releases/tag/v0.9.1
- 선행: `docs/work/task-release-0-9-1.md`(B-1~B-3, 아티팩트 빌드),
  `docs/work/task-m4-release-0-9-0-verification.md`(B-4 방법론 전례 — 이 문서는 그 방법을 그대로
  재사용한다).

## 목적과 사용자 가치

이번 검증이 특히 명확한 이유가 있다 — `plugins/impact-lens/scripts/run-impact-lens`의 pin된
release fallback URL이 이제 `v0.9.1` 자산을 가리키고, **그 자산은 태그 발행 전까지 존재하지
않았다.** 검증할 질문은 정확히 하나다: **그 pin이 실제로 동작하는가.** 이게 동작해야
Codex/Claude Code plugin을 쓰는 사용자가 아무 설정 없이 v0.9.1의 Call Graph 수정을 받을 수 있다.

## 왜 이 검증이 CI로 대체되지 않는가

CI는 checkout된 저장소를 검증하지, **발행본을 처음 받는 사용자의 경로**를 검증하지 않는다.
`test-plugin-artifact-e2e.mjs`가 `IMPACT_LENS_CLI_PACKAGE`로 로컬 tarball을 주입하므로, PR
#113/114/115의 CI가 전부 green이었어도 **방금 발행한 실제 `v0.9.1` Release URL은 한 번도 타지
않았다.**

## 상위 선택 경로 4개를 전부 명시적으로 막고 실행

`run-impact-lens`는 explicit path → checkout → global → release-fallback 순으로 시도한다.

1. **checkout 경로 차단**: `plugins/impact-lens/scripts/run-impact-lens`를 저장소 밖
   (`/tmp/b4-verify-091/plugin-dir/scripts/run-impact-lens`)에 **파일 하나만** 복사해 실행했다.
   스크립트와 같은 상대 경로 계산(`CDPATH= cd -- ".." && pwd` → `/tmp/b4-verify-091/plugin-dir`,
   `.../plugin-dir/../../cli/dist/index.js`)을 직접 재현해 그 경로에 파일이 없음을 먼저
   확인했다(`ls` → No such file or directory).
2. **global 경로 차단**: `command -v impact-lens` → exit 1, 이 머신에 전역 설치 없음.
3. **override 환경변수 차단**: `env -u IMPACT_LENS_CLI_PATH -u IMPACT_LENS_CLI_PACKAGE`로 두
   변수 모두 명시적으로 unset(원래도 미설정이었지만 `env | grep IMPACT_LENS`로 먼저 확인 후
   이중으로 unset).
4. **fresh npm cache**: `/tmp/b4-fresh-npm-cache-091`, `/tmp/b4-fresh-npm-cache-091b` — 이
   세션이 이전에 쓴 적 없는 새 디렉터리(v0.9.0 검증 때 쓴 `/tmp/b4-fresh-npm-cache`와도 다른
   경로, 재사용 아님).

**빌드 경로 함정(위 "UUID 경로" 발견)과의 관계**: 이 검증 자체는 `/tmp/b4-verify-091`(UUID 없는
경로)에서 수행해 그 함정을 안 밟았다 — 이건 빌드가 아니라 이미 발행된 tgz를 npm이 원격에서 받아
쓰는 것이라 `vsce`가 아예 관여하지 않는다.

## 실행 결과 — release-fallback, v0.9.1 실제 도달 확인

- `doctor bundled-pyright --smoke`: `runtime.cli.version: "0.9.1"`, `runtime.runner.source:
  "release-fallback"`, `status: "ready"`, 7개 check 전부 `pass`(`bundled-provider-artifact`가
  실제로 `pyright 1.1.413`를 읽어 들였고 `initialize-capability-smoke`가 실제 Language Server를
  띄워 `callHierarchy: true`를 확인).
- **실제 `.py` 2-파일 fixture**(`target.py`의 `fixture_target`, `caller.py`의 `fixture_caller`가
  이를 호출)로 `analyze --workspace . --file target.py --line 1 --column 5` 실행: `ok: true`,
  `runtime.cli.version: "0.9.1"`, `runtime.runner.source: "release-fallback"`,
  `provider.selectedBy: "bundled"`. `fixture_caller`가 `relation: "direct"`로 `fixture_target`의
  direct caller로 정확히 검출됐고 `edges`에 정확한 `callSites`(`caller.py`의 4번째 줄)가 잡혔다.
- **실제 네트워크 fetch(cache miss)를 npm verbose 로그로 직접 확인**:
  ```
  npm http fetch GET 200 https://release-assets.githubusercontent.com/.../impact-lens-cli-0.9.1.tgz...
    (cache miss)
  ```
  URL의 `filename%3Dimpact-lens-cli-0.9.1.tgz` 쿼리 파라미터로 정확히 이 릴리스의 자산임을
  확인. 또한 fresh cache 안에 실제로 생성된
  `_npx/0aaf43459d9e10da/node_modules/@impact-lens/cli/package.json`을 직접 열어
  `"version": "0.9.1"`임을 확인 - 가정이 아니라 이 검증이 만든 파일을 직접 읽었다.

## 이 검증이 확인하지 않는 것 — 경계를 명시한다(commander 지시)

**B-4는 CLI 경로를 본다.** 이번 릴리스는 VS Code Extension의 webview 렌더링 결함을 고친
것인데, **B-4는 VS Code Extension을 전혀 실행하지 않는다** — `run-impact-lens`가 부르는 건
CLI(`impact-lens` 커맨드)이지 webview가 아니다. 이 문서가 확인한 것은:

- release-fallback 경로가 v0.9.1 CLI 자산에 실제로 도달하고, 그 CLI로 실제 분석이 동작한다는 것.

이 문서가 **확인하지 않는 것**:

- **Call Graph 패널이 실제 VS Code에서 화면에 그려지는지.** 이건 이 저장소에 extension-host
  harness가 없어서 자동 검증 자체가 불가능하고(gate 2의 기존 잔여, PR #112/#115도 같은 경계를
  적었다), B-4의 검증 대상(CLI 경로)과도 애초에 무관하다 — VSIX를 설치하는 것과 CLI tgz를
  npx로 받는 것은 완전히 다른 두 배포 경로다.
- 이 결함의 **진짜 닫힘은 사용자가 실제로 VS Code에서 패널을 열어 그래프를 보는 것**이고, 그건
  이 lane도, B-4도 대신할 수 없다. 다음 사람이 "B-4가 끝났으니 결함이 완전히 닫혔다"고 오독하지
  않도록 여기 명시해 둔다.

## 검증

- 위 4개 상위-경로 차단 항목 전부 명령 출력으로 직접 확인(추측 없음).
- doctor·analyze 응답 JSON 원문을 이 로그의 근거로 인용했다(요약이 아니라 실제 필드값).
- 네트워크 fetch가 실제 cache miss였음을 npm verbose 로그로 직접 확인(추정이 아니라 로그 인용).
- fresh cache 안에 실제로 설치된 `package.json`을 직접 읽어 버전 확인(가정 아님).
- 이 검증의 확인 범위와 확인하지 않는 범위(화면 렌더링)를 명시적으로 구분해 기록.
