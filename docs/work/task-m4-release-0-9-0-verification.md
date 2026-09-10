# M4 v0.9.0 release — B-4 공개 default-path 사후 검증 (verification record)

- 상태: **완료.** `v0.9.0` 태그·GitHub Release 발행(commander 세션, 직접 사용자 승인 후) 완료 후,
  발행된 아티팩트를 대상으로 수행.
  release: https://github.com/moelee835/Impact-Lens/releases/tag/v0.9.0
- 선행: `docs/work/task-m4-release-0-9-0.md`(B-1/B-2/B-3), `docs/work/task-m2-release-0-8-0.md`의
  B-4(방법론 전례).
- 이 문서는 v0.8.0의 PR #70과 같은 형태 — 발행 이후에만 가능한 검증을 별도로 기록한다.

## 왜 이 검증이 CI로 대체되지 않는가

CI는 checkout된 저장소를 검증하지, **발행본을 처음 받는 사용자의 경로**를 검증하지 않는다.
`test-plugin-artifact-e2e.mjs`가 `IMPACT_LENS_CLI_PACKAGE`로 로컬 tarball을 주입하므로, PR
#110의 CI 12개 job이 전부 green이었어도 **방금 발행한 실제 `v0.9.0` Release URL은 한 번도 타지
않았다.**

## 상위 선택 경로 4개를 전부 명시적으로 막고 실행

`run-impact-lens`는 explicit path → checkout → global → release-fallback 순으로 시도한다. 하나라도
안 막으면 그 경로가 우연히 성공한 것을 "release-fallback이 동작한다"로 오독한다.

1. **checkout 경로 차단**: `plugins/impact-lens/scripts/run-impact-lens`를 저장소 밖
   (`/tmp/b4-verify/plugin-dir/scripts/run-impact-lens`)에 **파일 하나만** 복사해 실행했다 — 원본
   경로는 스크립트 기준 상대 경로(`plugin_dir/../../cli/dist/index.js`)가 정확히 저장소 root의
   `cli/dist/index.js`를 가리키도록 설계돼 있으므로, `scripts/`라는 중첩 구조만 옮기고 그 조상
   디렉터리 둘을 실제 checkout과 무관하게 만들면 그 상대 경로가 존재하지 않는 곳을 가리킨다.
   **가리키는 곳에 실제로 `cli/dist/index.js`가 없음을 스크립트와 동일한 경로 계산 로직을 직접
   재현해 먼저 확인**했다: `CDPATH= cd -- ".." && pwd` → `/tmp/b4-verify/plugin-dir`,
   `.../plugin-dir/../../cli/dist/index.js` = `/tmp/cli/dist/index.js`, `[ -f ... ]` 결과 부재
   확인(`ls /tmp/cli` → No such file or directory).
2. **global 경로 차단**: `command -v impact-lens` — 빈 결과(exit 1), 이 머신에 전역 설치 없음.
3. **override 환경변수 차단**: `env -u IMPACT_LENS_CLI_PATH -u IMPACT_LENS_CLI_PACKAGE`로 두
   변수 모두 명시적으로 unset한 상태에서 실행(원래도 미설정이었지만 이중으로 확인 - 셸에 직접
   echo해 `unset`임을 먼저 확인).
4. **fresh npm cache**: 이 검증 전용으로 새로 만든 `/tmp/b4-fresh-npm-cache`(이 세션이 다른 어떤
   작업에서도 쓴 적 없는 새 디렉터리) - 이전 실행이 실제 release URL을 이미 캐시해 둔 것을
   재사용하는 착시를 배제한다.

## 실행 결과 — release-fallback, v0.9.0 실제 도달 확인

- `doctor bundled-pyright --smoke`: `runtime.cli.version: "0.9.0"`, `runtime.runner.source:
  "release-fallback"`, `status: "ready"`, 7개 check 전부 `pass`(`bundled-provider-artifact`가
  실제로 `pyright 1.1.413`를 읽어 들였고 `initialize-capability-smoke`가 실제 Language Server를
  띄워 `callHierarchy: true`를 확인).
- 실제 `.py` 2-파일 fixture(`target.py`/`caller.py`, `fixture_caller`가 `fixture_target`을 호출)로
  `analyze` 실행: `ok: true`, `runtime.cli.version: "0.9.0"`, `runtime.runner.source:
  "release-fallback"`, `provider.selectedBy: "bundled"`, `fixture_caller`가 `fixture_target`의
  direct caller로 정확히 검출됨.
- **실제 네트워크 fetch(cache miss)를 npm verbose 로그로 직접 확인** - v0.8.0 때 reviewer가
  추가한 더 강한 증거를 이번엔 처음부터 직접 재현했다:
  ```
  npm http fetch GET 200 https://release-assets.githubusercontent.com/.../impact-lens-cli-0.9.0.tgz ... (cache miss)
  ```
  또한 fresh cache 안에 실제로 생성된 `_npx/.../node_modules/@impact-lens/cli/package.json`을
  직접 열어 `"version": "0.9.0"`임을 확인 - 가정이 아니라 이 검증이 만든 파일을 직접 읽었다.

## M4 고유 추가 검증 — "패키지에 들어간 것"과 "동작하는 것"은 다르다(commander 지시)

패키징 검증(release 빌드 시 unzip/tar로 공유 모듈 7개가 실제로 들어있음을 이미 확인)과 별개로,
**발행된 tgz로 실제 동작하는지**를 release-fallback 경로로 직접 확인했다.

**augmentation이 켜진 분석이 발행본으로 동작하는가**: FastAPI `Depends()` fixture
(`get_db`/`read_items`)를 `/tmp/b4-verify/augmentation-fixture`(저장소 밖)에 새로 작성하고,
`augmentationEnabled: true`로 release-fallback 경로에 요청했다. **결과**: `data.augmentedEdges`에
`adapterId: "fastapi-static-v1"`, `reasonCode: "fastapi-depends"` 항목이 정확히 생성됨 -
`fastapiDependencyAdapter.js`가 발행된 tgz 안에서 실제로 로드되고 실행된다는 뜻이다.

**`.impact-lens/test-patterns.json`이 발행본에서도 읽히는가**: `/tmp/b4-verify/
testpatterns-fixture`(저장소 밖)에 내장 규칙이 안 잡는 `e2e/checkout.flow.py`를 새로 작성하고,
패턴 파일 추가 전/후로 같은 쿼리를 두 번 실행했다.
- 패턴 파일 추가 **전**: `checkout_flow`의 `relation: "direct"`, `testRule: null`.
- `.impact-lens/test-patterns.json`에 `{"include": ["e2e/**/*.flow.py"]}` 추가 **후**:
  `checkout_flow`의 `relation`이 `"test"`로 바뀌고 `testRule: {"id": "e2e/**/*.flow.py",
  "source": "user-include"}` - `testPatternsDocument.js`/`testFileClassifier.js`가 발행된 tgz
  안에서 실제로 읽히고 반영된다는 뜻이다.

**결론**: override 없이 checkout·global 경로를 명시적으로 막은 상태에서, release-fallback으로
`0.9.0`이 실제로 도달 가능함을 doctor·analyze 양쪽에서 확인했고, M4가 새로 넣은 두 기능
(augmentation candidate caller, IL-LIM-010 test-patterns.json)이 **패키지에 들어있을 뿐 아니라
발행본 경로에서 실제로 동작함**을 직접 확인했다.

## UUID 경로 함정 — 다음 릴리스 빌드를 위한 기록

**증상**: 세션 scratchpad 경로(예: `.../15cedb14-6b5e-4225-9205-2e78be9a385d/scratchpad/...`,
UUID 형태의 세션 ID를 경로 세그먼트로 포함)에서 `vsce package`를 실행하면 "Extension
entrypoint(s) missing: extension/out/extension.js"로 항상 실패했다 - `out/extension.js`가 실제로
존재하는데도.

**원인(끝까지 추적, 가설 아님)**: `@vscode/vsce`는 파일 목록을 만들 때 `npm list --production
--parseable --depth=99999 --loglevel=error`를 내부적으로 호출해 그 stdout에서 절대경로를 파싱한다
(`node_modules/@vscode/vsce/out/npm.js`의 `getNpmDependencies`). **`npm` 자신이 이 출력에서 UUID
형태(36자, 하이픈 포함 16진수 그룹)로 보이는 경로 세그먼트를 `***`로 마스킹한다** - 토큰처럼 보이는
문자열을 로그에서 가리는 npm 자체의 동작으로 보인다. 직접 대조로 확인: `pwd`나 `node -e
"console.log(process.cwd())"`는 같은 경로를 마스킹 없이 그대로 출력하지만, **`npm list` 명령만
그 경로의 세션-ID 세그먼트를 `***`로 바꿔 출력한다.** vsce는 이 마스킹된(존재하지 않는) 경로 문자열을
그대로 `glob()`의 `cwd`로 넘기므로, 존재하지 않는 디렉터리를 훑어 파일 0개를 얻고 - 그 결과가
"entrypoint missing"으로 나타난다. **이건 이전에 기록된 "pnpm vs npm 트리 모양 불일치"([[m4-il-lim-010-shared-classifier-lane]] 메모리, `docs/work/task-m4-il-lim-010-stage1-completion.md`)와
다른, npm 자체의 새 증상이다** - 이번엔 `npm list`가 정상 종료(`exit 0`, extraneous 0건)했는데도
출력 문자열 자체가 손상돼 있었다.

**해결**: UUID가 경로에 없는 위치(`/tmp/impact-lens-v090-release`)에서 다시 빌드하니 즉시
해결됐다 - `npm list`가 온전한 경로를 출력했고 `vsce package`가 정상 작동했다.

**다음 릴리스 빌드자에게**: **release 아티팩트를 빌드할 때는 세션 scratchpad(어떤 형태로든 세션 ID를
경로에 포함하는 위치)를 피하고, UUID 없는 임시 경로(`/tmp/<plain-name>`)에서 빌드하라.** 원인은
pnpm 관련이 아니라 **npm 자신이 `npm list`의 로그 출력에서 토큰처럼 보이는 경로 세그먼트를
마스킹하는 동작**이고, `vsce`가 그 마스킹된 문자열을 그대로 파일시스템 경로로 신뢰하는 것이 실제
결함이다(vsce 자신의 버그로 볼 수도 있다 - 이 저장소가 고칠 수 있는 부분은 아니고, 빌드 위치를
피하는 것이 유일한 실용적 대응이다).

> **2026-09-10 v0.9.1 lane에서 재확인·조건 하나 추가 (`docs/work/task-release-0-9-1.md`
> 참고).** 이 진단은 **틀리지 않았다** — v0.9.1 릴리스 빌드에서 같은 증상을 다시 만나 이 문서와
> 같은 방식(같은 UUID 경로에서 `npm list --production --parseable --depth=0 --loglevel=error`를
> 직접 실행)으로 재확인했고, 정확히 여기 적힌 대로 경로가 `***`로 마스킹되는 것을 다시 봤다.
> **새로 밝힌 조건 하나**: 이 마스킹 동작은 **npm 메이저 버전에 달려 있다** — 같은 UUID 경로에서
> `npm 11.11.0`(Node 25가 번들)은 마스킹하고 `npm 10.9.3`(Node 22가 번들)은 마스킹하지
> 않는다(양쪽 바이너리로 직접 대조 실행해 확인). 즉 "UUID 없는 경로에서 빌드하라"는 이 문서의
> 권고 외에, **"Node 22(그 npm 10.x)로 빌드하면 UUID 경로에서도 문제가 없다"는 두 번째 실용적
> 우회로가 하나 더 있다** — 이번 v0.9.1 아티팩트는 실제로 이 두 번째 방법(UUID 경로 그대로, Node
> 22로 전환)으로 빌드했다.

## 검증

- 위 4개 상위-경로 차단 항목 전부 명령 출력으로 직접 확인(추측 없음).
- doctor·analyze 응답 JSON 원문을 이 로그의 근거로 인용했다(요약이 아니라 실제 필드값).
- augmentation·test-patterns.json 검증 모두 패턴 추가 전/후 대조로 확인(하나의 상태만 보고
  "동작한다"고 결론 내리지 않았다).
- 네트워크 fetch가 실제 cache miss였음을 npm verbose 로그로 직접 확인(추정이 아니라 로그 인용).

reviewer의 독립 재현을 commander가 별도로 요청했다 - 결과는 이 문서에 추가로 기록될 예정이다.
