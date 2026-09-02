# M2 — Python provider preset 구현

- 상태: Stage 1 실측 완료(`bundled` 결정) — commander 확인 대기, Stage 2 착수 보류
- branch: `feat/m2-python-preset`
- 선행: `docs/m2-python-investigation`(PR #63, merged `f872074`) — "Call Hierarchy를 실제로 구현한
  OSS Python Language Server가 있는가"에 실행으로 답한 조사 lane. 이 문서는 그 결론을 preset으로
  바꾸는 구현 lane이다.
- 요구사항 원본: 계획 세션(commander)이 작성한
  `m2-python-preset.md`(저장소 밖 scratchpad, 이 문서에 전문을 옮겨 실행 가능한 계획으로 재작성했다).

## 목적과 사용자 가치

**지금 Python 사용자는 Impact Lens를 쓸 수 없다.** `.py` 파일에 `impact-lens impact`를 실행하면
provider가 없어 `unsupported`로 끝난다. TypeScript/JavaScript 사용자는 설정 없이 즉시 쓰고, Go
사용자는 gopls를 설치하면 쓴다. Python 사용자만 아무 경로도 없다.

**이 lane이 끝나면 Python 사용자가 자기 프로젝트에서 "이 함수를 누가 부르는가"에 답을 받는다.** 그리고
그 답이 불완전할 때 — FastAPI `Depends()`처럼 정적 분석이 볼 수 없는 호출 경로가 있을 때 — 완전한
답인 척하지 않는다. 후자가 전자만큼 중요하다. `IL-LIM-009`(분석 완전성 오판 방지)가 존재하는 이유가
그것이다.

**상위 목표와의 관계**: M2 milestone은 Python·Go·C/C++ 세 언어를 verified-external 또는 bundled
preset으로 지원하는 것이다. Go(`gopls`)는 이미 shipped. 이 lane이 Python을 닫으면 M2에 남는 것은
`clangd`(C/C++) 하나다.

**왜 지금인가**: 조사 lane이 "Call Hierarchy를 실제로 구현하는 후보가 있는가"라는 질문을 실행으로
닫았다(`pyright`/`basedpyright`/`Pyrefly` 모두 실제 왕복 성공). 그 답을 문서에만 두면 Python 사용자
경험은 아무것도 달라지지 않는다 — preset으로 만들어야 실제로 쓸 수 있다.

## 배경과 해결할 문제

`cli/src/providers/catalog.ts`의 기존 주석은 "Python은 IL-LIM-006 때문에 대기 중"이라고만 적고,
그 이유를 "Pylance 라이선스 문제"와 "대안이 Call Hierarchy를 지원하는지 미확인"이라는 서로 다른 두
질문에 뭉쳐 놓았다. 조사 lane이 그 둘을 분리해 (A) 라이선스·배포는 Pylance만 막혀 있고 pyright/
basedpyright/Pyrefly는 막혀 있지 않으며, (B) capability는 이 셋 모두 실제로 통과한다는 것을 실행으로
확인했다. 이 lane은 그 결론 위에서 실제 preset을 만든다.

## 범위와 범위에서 제외할 항목

**범위**: tier(bundled/verified-external) 결정, provider 선택(pyright/basedpyright/Pyrefly 중),
`null`/`[]` 처리 방향 결정과 구현, Python preset 작성(catalog.ts, fixture, readiness,
`requiredProjectFiles`, 버전 하한), CI(3-OS 실제 Call Hierarchy 왕복), 사용자 문서 갱신.

**제외**:
- `clangd`(C/C++) — 다음 lane.
- `IL-LIM-006`의 전체 FastAPI fixture 작업 — 이 lane은 `Depends()` **모양**만 재현한다(진짜 FastAPI
  프로젝트로 하는 전체 E2E는 별도 스토리 범위).
- `schemaVersion` 상승 — 이 lane의 응답 스키마 변경은 전부 additive여야 한다.
- `pylsp`/`jedi-language-server` 재조사 — 조사 lane의 2026-09-02 시점 판정(Call Hierarchy 미구현)을
  뒤집을 새 근거가 없다.

## 현재 구현 조사 결과

**이미 실행으로 확인됐고 이 lane이 재조사하지 않는 사실**(출처: 조사 lane, 검토 세션, 계획 세션 —
표에 측정 주체를 남긴다):

| 사실 | 근거 | 측정 주체 |
| --- | --- | --- |
| `pyright` 1.1.413 — Call Hierarchy 실제 왕복 성공 | raw JSON-RPC probe | 조사 lane, 검토 세션 각각 |
| `basedpyright` 1.39.10 — 동일 | 동일 | 동일 |
| `pylsp` 1.15.0 / `jedi-language-server` 0.47.0 — Call Hierarchy 미구현(`Method Not Found`) | 동일 | 동일 |
| `Pyrefly` 1.2.0 — 왕복 성공, 단 **PyPI 전용**(npm 미배포) | probe + `npm view`/`npm search` + 대안 이름 6종 404 | 검토 세션 + 계획 세션 |
| 참조만 하는 함수(`Depends()` 모양)에서 pyright는 `null`, Pyrefly는 `[]` | 격리 fixture, control 케이스 동반 | 검토 세션 |
| `lspProvider.ts:364,371`의 `?? []`가 그 차이를 즉시 지움 | 코드 직독 | 조사 lane, 검토 세션, 계획 세션 |
| release tarball = 75,059 bytes / 31 entries / node_modules 0개 | 실제 다운로드 후 `tar tzf` | 계획 세션 |
| first-run 비용은 `run-impact-lens:133`의 `npm exec --package=<tgz-url>`가 해석하는 install closure | 스크립트 직독 | 계획 세션 |
| `.py` → `python` 매핑 이미 존재 | 이 lane이 `resolve.ts:594` 직독으로 재확인 | 계획 세션 → 이 lane 재확인 |
| preset `extensions` ↔ `languageId()` 교차 검사 guard 이미 존재 | 이 lane이 `providers.test.ts:734` 직독으로 재확인 | 계획 세션 → 이 lane 재확인 |
| `titlePattern`은 optional, 생략 시 모든 token 통과 | `preset.ts:91`, `readiness.ts:151` | 계획 세션(조사 lane 검토 라운드에서 확인) |

**아직 불가능한 사용자 결과(이 lane이 메우는 공백)**:
- `.py` 파일에 대한 auto-discovery가 어떤 provider에도 도달하지 않는다 — catalog에 Python 항목이
  없기 때문이다.
- provider의 `null`/`[]` 차이가 응답에서 사라져, FastAPI `Depends()`류 함수를 조회하면 "호출하는 곳이
  없다"로 잘못 읽힐 위험이 있다(코드는 조사 lane에서 고치지 않았다).
- 3개 OS에서 Python provider가 실제로 동작하는지 확인된 바 없다(조사 lane은 darwin/arm64만 봤다).

**`.go`에서 겪은 재발 위험 없음**: gopls lane에서 "preset은 있는데 auto-discovery가 도달하지 못한다"는
실제 결함(`languageId()`에 `.go` case 누락)을 겪었다. Python은 `.py` → `'python'` 매핑이 이미 있고,
그 lane에서 추가한 교차 검사 guard(`providers.test.ts:734`)가 이후 모든 preset에 대해 이 클래스의
결함을 자동으로 막는다 — 위 표에서 둘 다 직접 재확인했다. 다만 guard는 "선언이 일치한다"만 보장하고
"그 경로가 실제로 동작한다"는 보장하지 않으므로, stage 4에서 실제 `.py` fixture로 end-to-end 확인은
그대로 한다.

## 단계별 구현 계획

### Stage 1 — tier 결정(bundled vs verified-external)

**목적**: Python 사용자가 설정 없이 쓸 수 있는지, 아니면 provider를 직접 설치해야 하는지를 실측 근거로
정한다. 이 lane에서 사용자 경험을 가장 크게 가르는 결정이다.

**측정 대상**: release tarball 크기가 아니라 **release-fallback 첫 실행이 `npm exec`로 해석·다운로드
하는 install closure의 증가분**(다운로드 바이트, 소요 시간) — 조사 lane 문서가 앞서 tarball 크기로
잘못 짚었던 것을 정정한 대상 그대로.

**방법**: clean npm cache 상태에서 (a) 현재 `cli/package.json`의 runtime dependencies만 설치, (b)
거기에 후보(pyright/basedpyright)를 추가해 설치 — 각각 다운로드 바이트와 소요 시간을 실측한다.
`dist.unpackedSize` 같은 registry 메타데이터는 참고용 ballpark일 뿐 대체하지 않는다.

**산출물**: 실측 수치와 함께 tier를 명시한 결정 기록(사용자가 지불하는 것 — 첫 실행 지연 — 과 얻는
것 — 설정 없이 동작 — 을 양쪽 다 수치로).

**검증**: 선택한 tier로 실제 first-run을 재현해 잰 시간이 결정 근거로 쓴 수치와 맞는지 확인.

**commander에게 먼저 보고한다** — tier 결정이 stage 2 이후 전부의 형태를 바꾸므로, 실측값 없이 다음
단계로 진행하지 않는다.

### Stage 2 — 서버 선택(pyright/basedpyright/Pyrefly 중)

**목적**: 세 후보 중 하나를 기준을 밝혀 고른다. stage 1의 tier 결정이 후보군을 먼저 자른다 —
`Pyrefly`는 npm에 배포되지 않으므로 bundled를 택하면 그 시점에 자동 탈락한다.

**기준**: 유지보수 주체·릴리스 주기, 라이선스(번들한다면 typeshed 등 하위 라이선스까지 직접 확인),
`basedpyright`가 Call Hierarchy 동작에 영향을 주는 기능 차이가 있는지. 3-OS 설치 가능성은 stage 5의
CI가 실제로 답하므로 여기서 문서만 읽고 판정하지 않는다.

**산출물**: 선택과 근거, 탈락시킨 후보를 왜 탈락시켰는지.

**검증**: 선택한 서버로 preset fixture가 실제로 통과.

### Stage 3 — `null`/`[]` 처리 방향 결정

**목적**: FastAPI 사용자가 "이 함수를 부르는 곳이 없다"는 틀린 결론을 내리지 않게 한다.

**세 방향 중 하나를 명시적으로 고른다**(저장소 선례 — `languageMatch: boolean | 'unknown'`
(`types.ts:201`, `resolve.ts:130-134`)과 `advertised`/`observed` capability 분리(`types.ts:204-212`)
— 를 먼저 읽고 참고한다. 둘 다 "모르는 것을 모른다고 말하는 세 번째 값"을 만드는 방식이다):
- (가) preset이 provider별로 `null`의 의미를 선언한다.
- (나) 구분하지 않되 "구분할 수 없다는 사실 자체"를 한계로 표면화한다.
- (다) 실제로 관측된 provider에 한해서만 구분한다.

**제약**: `schemaVersion`을 올리지 않는다. additive만 한다.

**산출물**: 선택한 방향의 구현 + 그 선택의 근거.

**검증**: `Depends()` 모양 fixture로 end-to-end. 응답이 "이 결과는 불완전할 수 있다"를 사용자가 읽을
수 있는 형태로 전달하는지 확인하고, 테스트가 `?? []` 경로를 실제로 밟는지 반드시 확인한다(vacuous
pass 방지).

### Stage 4 — preset 작성

**목적**: catalog에 Python 항목을 넣어 auto-discovery가 `.py`에서 실제로 동작하게 한다.

**readiness**: 검증 먼저, 설계 확장은 조건부. (1) pyright가 인덱싱 외 목적으로도
work-done-progress를 보내는지 확인 — 이게 진짜 미결이다. (2) 안 보낸다면 `titlePattern` 생략(코드
변경 없음). (3) 보낸다면 그때 `report.message` 매칭 확장을 설계한다.

**`requiredProjectFiles`**: 조사 lane의 2-파일 fixture 관측("`pyproject.toml` 유무가 결과를 안
바꿨다")은 "필요 없다"는 결론이 아니었다. 여러 패키지로 나뉜 프로젝트에서 cross-package import가
해석되는지 재검증한다 — gopls의 AdHoc 모드처럼 조용히 저하되면서 완전한 답처럼 보이는 것이
`IL-LIM-009`가 막으려는 실패다.

**버전 하한**: 테스트하지 않은 하한을 추측하지 않는다. 낮은 버전을 실제로 돌려 정하거나, 테스트한
버전을 그대로 하한으로 둔다(gopls preset의 `supported.minimum` 주석과 같은 규칙).

**`catalog.ts`의 Python 주석 교정**: 지금 주석이 (A) 라이선스·배포와 (B) capability를 한 문장에
뭉쳐 놓았다 — 조사 lane이 밝힌 대로 분리해 다시 쓴다.

**산출물**: preset + fixture + 그 안의 결정 주석(gopls preset의 `version.args` 주석과 같은 수준 —
왜 이렇게 했는지가 없으면 다음 사람이 되돌린다).

**검증**: `doctor <preset-id>`, `--smoke`, `--fixture` 전부 + 실제 `.py` 파일로 auto-discovery
end-to-end.

### Stage 5 — CI

**목적**: "3-OS에서 동작한다"는 주장을 실제 실행으로 뒷받침한다.

`go-provider` job과 같은 구조로 만들고 그 lane이 정한 규칙을 그대로 지킨다 — **skip은 실패로
취급한다.** bundled를 택했다면 CI 형태가 달라진다(설치가 아니라 의존성 해석이 검증 대상).

**산출물**: 3-OS에서 실제 Call Hierarchy 왕복을 도는 job.

**검증**: 서버를 일부러 못 찾게 만들었을 때 job이 실제로 실패하는지 확인한다.

### Stage 6 — 사용자 문서

**목적**: 사용자가 Python을 쓸 수 있다는 것과 그 결과의 한계를 알게 한다.

`bundled-typescript`, `gopls` 같은 **식별자로** grep해서 나오는 모든 위치(README, INSTALL,
cli-contract, CHANGELOG, skill 문서)를 갱신한다. 문장·번역 표현으로 찾지 않는다 — M1 문서 lane에서
같은 원인으로 세 번 놓쳤다. limitations에 `Depends()`류 한계를 stage 3의 결정과 일치하는 문장으로
적는다.

**산출물**: 갱신된 문서 + 갱신 대상 목록과 도출 방법(사용한 grep 명령 포함).

**검증**: 갱신 후 같은 식별자로 다시 grep해 남은 위치가 없는지 확인.

## 테스트 및 완료 기준

- [x] Stage 1: install closure 증가분 실측 완료(`bundled` 결정, 근거는 위 작업 로그) — commander
      보고 및 진행 승인 대기.
- [ ] Stage 2: 서버 선택과 탈락 사유 기록, fixture 통과.
- [ ] Stage 3: `null`/`[]` 방향 구현, `Depends()` 모양 fixture가 `?? []` 경로를 실제로 밟는 것을 확인.
- [ ] Stage 4: preset + fixture, `doctor --smoke --fixture` 통과, 실제 `.py` E2E 통과.
- [ ] Stage 5: 3-OS CI job, 서버 부재 시 실패 확인.
- [ ] Stage 6: 식별자 기반 grep으로 문서 갱신 완료 확인.
- [ ] 전체: `npm run cli:test` 통과, README/INSTALL/CHANGELOG/cli-contract가 실제 catalog와 일치.

## 작업 로그

### 2026-09-02 — lane 시작

- PR #63 merge(`f872074`) 확인, local `main` fast-forward 확인(작업 diff 없음, 다른 세션이 이미
  fast-forward해 둔 상태를 그대로 확인만 함). `feat/m2-python-preset`을 `main`에서 분리.
- commander가 작성한 요구사항 문서를 이 저장소 work 문서로 재작성 — "이미 확정된 입력" 표의
  `.py` 매핑과 교차 검사 guard 존재를 이 lane이 직접 코드로 재확인(`resolve.ts:594`,
  `providers.test.ts:734`) — 표에 재확인 주체를 추가했다.

### 2026-09-02 — Stage 1 실측: install closure 증가분

**측정 방법**(측정 주체: 이 lane, 2026-09-02): session scratchpad에 3개 격리 npm 프로젝트를 만들었다
— (a) `baseline`: 현재 `cli/package.json`의 runtime dependencies만(`typescript@5.9.3`,
`typescript-language-server@6.0.0`), (b) `with-pyright`: 위에 `pyright@1.1.413` 추가, (c)
`with-basedpyright`: 위에 `basedpyright@1.39.10` 추가. 각각 **별도의 빈 `--cache` 디렉터리**로
`npm install --no-audit --no-fund`를 실행해 실제 시스템 npm cache를 건드리지 않으면서 매번 진짜
"clean cache" 상태에서 다운로드하게 했다. `time`으로 wall-clock을, `find ... stat -f%z`로 cache
디렉터리(다운로드 바이트 근사치 — 압축된 tarball + 메타데이터)와 `node_modules`(unpacked 크기)의
정확한 바이트 합을 쟀다.

| 측정 | baseline | +pyright | +basedpyright |
| --- | --- | --- | --- |
| wall-clock (clean cache) | 0.80s | 2.36s | 2.47s |
| cache 디렉터리 바이트(다운로드 근사) | 22,397,253 | 28,145,296 | 32,535,149 |
| `node_modules` 바이트(unpacked) | 26,051,044 | 45,396,550 | 53,667,877 |

**증가분(후보 하나만 추가했을 때)**:

| 후보 | wall-clock 증가 | 다운로드 증가(근사) | unpacked 증가 |
| --- | --- | --- | --- |
| `pyright` | +1.56s | +5,748,043 bytes(≈5.5 MB) | +19,345,506 bytes(≈18.4 MB) |
| `basedpyright` | +1.67s | +10,137,896 bytes(≈9.7 MB) | +27,616,833 bytes(≈26.3 MB) |

**교차 검증**: 이 실측의 unpacked 증가분(pyright +19,345,506 / basedpyright +27,616,833)이 조사
lane·계획 세션이 registry에서 조회한 `dist.unpackedSize` ballpark(pyright 19,344,986 /
basedpyright 27,616,199)와 오차 범위 내로 거의 정확히 일치한다 — 서로 다른 두 방법(registry 메타데이터
조회 vs 실제 설치 후 디스크 실측)이 같은 답을 내, 두 수치 모두에 대한 신뢰도가 올라간다.

**한계**: (1) 이건 pyright *또는* basedpyright 하나만 추가했을 때다 — 두 후보를 같이 더한 값이 아니다
(stage 2에서 어차피 하나만 고른다). (2) cache 디렉터리 바이트는 압축 tarball과 npm의 관련 메타데이터를
합친 것이라 "순수 다운로드 바이트"보다 약간 크다 — 그래도 baseline·후보 측정을 같은 방법으로 재서
증가분 비교는 공정하다. (3) `npm install`로 쟀고 실제 first-run 경로인 `npm exec` 자체로 재지 않았다
— 다만 두 경로 모두 같은 npm 패키지 fetch·추출 메커니즘을 쓰므로 지배적 비용(네트워크 다운로드)은
같다. (4) wall-clock은 이 machine·네트워크 조건에 의존한다 — 절대값이 아니라 baseline 대비 상대
증가로 읽는다. (5) `Pyrefly`는 애초에 npm에 배포되지 않아 bundled 후보가 아니므로 이 실측 대상이
아니다(이미 확정된 제약, 위 표 참고) — 측정하지 않았다.

**tier 결정**: **`bundled`.** 근거:
- 비용은 **1회성**이다 — `npm exec`는 받은 패키지를 npx cache에 남기므로(조사 lane이 `--offline`
  재현으로 확인) 이 증가분은 딱 첫 실행에만 발생한다.
- 절대 크기가 **이미 번들 중인 typescript보다 작다** — pyright(unpacked +18.4 MB)는 이미 bundled인
  `typescript`(23.6 MB) 하나보다도 작다. Python 지원을 위해 새로 감수하는 무게가 기존에 이미 감수하고
  있는 무게의 범위 안에 있다.
- 1회성 지연도 절대값으로 작다 — baseline 0.8s에서 2.4s 안팎으로, **추가되는 시간은 채 2초가 안
  된다.**
- `verified-external`을 택하면 Python 사용자는 gopls처럼 별도 설치가 필요하다 — 그런데 gopls는
  Go 바이너리라 npm 배포가 애초에 불가능했던 경우이고, pyright/basedpyright는 npm 패키지라 그 제약이
  없다. 이 lane의 목적 자체가 "Python 사용자가 설정 없이 쓴다"(TS/JS와 동등한 경험)이므로, 배포
  형태가 허용하는데도 사용자에게 설치를 요구할 이유가 약하다.
- **이 결정이 stage 2를 제약한다**: `bundled`를 택했으므로 `Pyrefly`는 이 시점에 자동으로 후보에서
  빠진다. stage 2는 `pyright` vs `basedpyright` 2자 선택으로 좁혀진다.

**검증**: 선택한 tier(`bundled`)로 실제 first-run 재현은 stage 4(preset이 실제로 존재해야 `npm exec`
경로를 진짜로 태울 수 있다)에서 수행한다 — 이 시점에는 아직 preset이 없어 "선택 후 재현"을 이 stage
안에서 닫을 수 없다. 이 순서 자체를 다음 보고에서 commander에게 명시한다.
- **commander 확인 대기**: 이 tier 결정과 실측값을 보고하고, stage 2로 진행하기 전 확인을 받는다
  (계획 세션이 명시적으로 요구한 게이트).
