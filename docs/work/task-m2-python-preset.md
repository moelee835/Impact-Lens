# M2 — Python provider preset 구현

- 상태: Stage 1~6 구현 완료(preset shipped, `.py` 실제 동작 확인, CI 커버리지 확인, 사용자 문서 갱신
  + response-policy eval fixture 추가). **readiness cross-cutting 재설계는 commander 결정으로 이
  lane에서 하지 않음** — readiness 없이(indexingStatus: unknown) 유지, 후속 lane 목록(`il-lim-014`)에
  일반화해 등록 완료. PR 생성 및 CI 실행 로그 확인 대기 중
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

- [x] Stage 1: install closure 증가분 실측 완료(`bundled` 결정, 근거는 위 작업 로그), commander 승인.
- [x] Stage 2: `pyright` 선택, 탈락 사유(basedpyright의 자체 문서상 npm 2급 채널 표시) 기록,
      fixture 재현 통과.
- [x] Stage 3: 방향 (나) 구현(`provider_null_incoming_calls`), `nullIncomingCallsServer.ts` fixture로
      `?? []` 경로를 실제로 밟는 e2e 테스트 + 음성 대조군 통과, 사용자 문서 3곳 갱신. eval fixture
      추가는 stage 6로 flagging.
- [x] Stage 4: preset + fixture, `doctor --smoke --fixture` 통과, 실제 `.py` E2E 통과. doctor 버그
      수정(회귀 테스트 포함), allowlist 확장, 버전 고정, catalog 주석 교정 모두 완료. readiness는
      실측 결과 지금 구조에서 도달 불가능함을 확인해 뺐다 — cross-cutting 재설계 여부 commander
      결정 대기.
- [x] Stage 5: 3-OS 실측 커버리지 확인(새 job 없이 기존 `unit`+`cli-tests-cross-os`가 담당),
      서버 부재 시 실패(스킵 아님) 로컬 재현으로 확인.
- [x] Stage 6: 식별자 기반 grep + 전체 파일 read로 문서 갱신 완료, response-policy eval fixture
      2개(+ 그 과정에서 발견한 engine 결함 2건 수정) 추가.
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
| npm cache 디렉터리 바이트 | 22,397,253 | 28,145,296 | 32,535,149 |
| `node_modules` 바이트(unpacked) | 26,051,044 | 45,396,550 | 53,667,877 |

**증가분(후보 하나만 추가했을 때)**:

| 후보 | wall-clock 증가 | npm cache 증가 | unpacked 증가 |
| --- | --- | --- | --- |
| `pyright` | +1.56s | +5,748,043 bytes(≈5.5 MB) | +19,345,506 bytes(≈18.4 MB) |
| `basedpyright` | +1.67s | +10,137,896 bytes(≈9.7 MB) | +27,616,833 bytes(≈26.3 MB) |

**정정(commander 재검토, 2026-09-02) — "다운로드 증가"라는 이름이 틀렸다.** npm cache 디렉터리
증가분을 전송 바이트로 읽으면 안 된다 — cacache의 index·메타데이터 오버헤드가 섞여 있다. commander가
각 패키지의 **실제 packed tarball**을 직접 받아 쟀고, 이 lane도 `npm view <pkg> dist.tarball`이
가리키는 URL을 `curl`로 받아 바이트 수를 독립 재확인했다:

| 패키지 | packed tarball(실측, 바이트) |
| --- | --- |
| `typescript@5.9.3` | 4,377,468 |
| `typescript-language-server@6.0.0` | 515,598 |
| `pyright@1.1.413` | 4,155,725 |
| `basedpyright@1.39.10` | 6,156,337 |

pyright의 실제 전송 바이트는 **약 4.2 MB**로, 위 "npm cache 증가분"(5.5 MB)보다 작다 — cache
디렉터리 쪽이 오히려 보수적으로(더 크게) 잰 값이었다. **tier 결정은 바뀌지 않는다**(실제 비용이 더
작다는 쪽으로만 정정된다). 위 표의 열 이름에서 "근사"를 지우고 "npm cache 디렉터리 바이트"로만
표기해 다음 사람이 전송 바이트로 잘못 읽지 않게 했다 — 전송 바이트는 이 표가 아니라 위 packed
tarball 표를 본다.

**교차 검증**: 이 실측의 unpacked 증가분(pyright +19,345,506 / basedpyright +27,616,833)이 조사
lane·계획 세션이 registry에서 조회한 `dist.unpackedSize` ballpark(pyright 19,344,986 /
basedpyright 27,616,199)와 오차 범위 내로 거의 정확히 일치한다 — 서로 다른 두 방법(registry 메타데이터
조회 vs 실제 설치 후 디스크 실측)이 같은 답을 내, 두 수치 모두에 대한 신뢰도가 올라간다.

**한계**: (1) 이건 pyright *또는* basedpyright 하나만 추가했을 때다 — 두 후보를 같이 더한 값이 아니다
(stage 2에서 어차피 하나만 고른다). (2) npm cache 디렉터리 바이트는 전송 바이트가 아니다 — 압축
tarball과 npm의 관련 메타데이터를 합친 값이라 실제 전송 바이트(위 packed tarball 표)보다 크다. 그래도
baseline·후보 측정을 같은 방법으로 재서 증가분끼리 비교하는 것은 공정하다. (3) `npm install`로 쟀고
실제 first-run 경로인 `npm exec` 자체로 재지 않았다
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

**이 결정이 누구에게 비용을 지우는가(commander 지적, 위 근거에 빠져 있던 것).** 위 근거는 전부
"비용이 작다"고만 말하고 **누가 그 비용을 내는지**는 말하지 않았다 — `bundled`는 **Python을 한 번도
쓰지 않는 TypeScript 전용 사용자도 pyright를 함께 받는다**(+4.2MB 전송, +18.4MB 디스크). 이게 이
결정의 실제 거래이고, `verified-external`을 고를 정당한 이유이기도 하다. 그럼에도 `bundled`가
맞다고 보는 이유: 이 저장소에는 **지연 설치(사용자 승인 없는 자동 설치)** 라는 제3의 선택지가 없다
(`IL-LIM-004`: "자동 설치는 하지 않는다. executable이 없으면 platform별 공식 설치 문서와 선택
가능한 custom provider를 안내한다" — `docs/development-management/stories/il-lim-004-first-class-language-presets.md:103`,
이 lane이 직접 재확인했다). 그러니 실질 선택지는 "전원이 부담 + 무설정" 또는 "Python 사용자만 직접
설치" 둘뿐이고, pyright가 이미 전원이 부담 중인 typescript보다 작다는 점이 전자를 지지한다. custom
provider 경로는 그대로 살아 있어, 자기 pyright를 따로 관리하고 싶은 사용자는 여전히 그렇게 할 수
있다.

**검증**: 선택한 tier(`bundled`)로 실제 first-run 재현은 stage 4(preset이 실제로 존재해야 `npm exec`
경로를 진짜로 태울 수 있다)에서 수행한다 — 이 시점에는 아직 preset이 없어 "선택 후 재현"을 이 stage
안에서 닫을 수 없다. 이 순서 자체를 다음 보고에서 commander에게 명시한다.
- **commander 승인**: tier=`bundled` 승인 완료(2026-09-02). stage 2(pyright vs basedpyright)로
  진행한다.

**`bundled`가 바꾸는 downstream 두 항목(commander 지적)**:
- **버전 하한이 거의 의미를 잃는다.** `bundled-typescript`에 `version` 필드가 없는 이유를 catalog가
  이미 적어 뒀다 — "the server ships inside the tarball, so its version is read from package metadata
  by the bundled artifact check rather than by starting a process"(`catalog.ts` 확인). Python도
  `bundled`를 택했으므로 정확히 한 버전을 고정해 배포한다 — "어느 하한까지 동작하는가"라는 질문이
  사용자에게 의미를 잃는다(사용자는 다른 버전을 설치할 수 없다). stage 4의 "버전 하한" 항목은
  삭제하지 않고, `bundled`에서 왜 이 질문의 성격이 달라지는지를 그 자리에 적는다.
- **라이선스 의무가 가벼워진다 — 확인이 필요 없다는 뜻은 아니다.** release tarball에 pyright
  파일이 안 들어간다(31 entries, node_modules 0개 — 조사 lane이 이미 확인). npm이 각자의 registry
  entry에서 자체 `LICENSE`와 함께 받아 가므로, 이건 **재배포(vendoring)가 아니라 의존성 선언**이다
  — vendoring보다 의무가 가볍다. 그래도 stage 2에서 하위 라이선스(typeshed 등)가 이 저장소의 MIT
  선언과 충돌하지 않는지는 그대로 확인하고 기록한다 — "가벼워졌다"와 "확인할 필요가 없다"는 다르다.

**stage 4에서 부딪힐 구현 제약(commander가 미리 알림, 지금 코드는 안 건드림)**: `cli/src/runtime.ts:133-150`의
`bundledModuleEntryPath()`를 이 lane이 직접 읽어 확인했다 — 허용 목록이 정확히 한 항목이고, 그게
의도된 설계다("The allowlist is one entry long on purpose. Resolving an arbitrary specifier inside
this package's dependency tree is a way to learn where the package is installed..."). bundled Python
preset은 이 목록에 두 번째 항목을 **명시적으로** 추가해야 한다 — 패턴이나 동적 해석으로 일반화하지
않는다. 그 좁음 자체가 이 경로의 방어이기 때문이다. stage 4에서 왜 두 개가 됐는지 주석으로 남긴다.

**stage 4를 위해 남겨 두는 확인되지 않은 위험(지금 검증하지 않음 — commander가 지적, 측정은 안 함)**:
pyright가 third-party import를 해석하려면 보통 Python 환경(venv/site-packages)을 찾는다. 없으면
typeshed stub만으로 동작할 수 있는데, 그 경우 **동작은 하지만 결과가 불완전한** 상태가 될 수 있다 —
gopls의 AdHoc 모드와 같은 모양이다. 조사 lane은 같은 디렉터리 2-파일 fixture만 봐서 이 경로를 보지
못했다. 사실이면 `requiredProjectFiles`와 limitations가 이 한계를 반영해야 한다 — stage 4에서
실제로 확인한다.

**stage 4 지시(commander, 지금 확정 — 코드는 stage 4에서 반영)**: `cli/package.json`을 직접 읽어
확인했다 — `dependencies.typescript`는 `"5.9.3"`(caret 없음, 정확히 고정)인데 `devDependencies.
typescript`는 `"^5.9.3"`이다. 이 비대칭은 의도적이다 — bundled preset이 `version` 필드를 두지 않는
설계(위 참고) 자체가 "우리가 정확히 한 버전을 배송한다"는 전제 위에 서 있다. **stage 4에서
`pyright`를 추가할 때 같은 방식으로 정확히 고정한다(caret 금지)** — caret을 쓰면 사용자마다 다른
pyright가 설치될 수 있고, `doctor`가 보고하는 버전과 실제 동작이 갈릴 위험이 생긴다.

**참고**: 위에서 인용한 `IL-LIM-004`의 "자동 설치를 하지 않는다"는 commander의 원래 메시지가
`AGENTS.md`를 근거로 들었으나, 이 lane이 직접 확인한 결과 `AGENTS.md`에는 설치 관련 조항이 없다(grep
결과 0건) — 실제 근거는 `il-lim-004-first-class-language-presets.md:103`이다. 주장 자체는 맞고
출처만 다른 파일이라, 이 문서에는 올바른 출처로 적었다.

### 2026-09-02 — Stage 2: 서버 선택(bundled 확정으로 pyright vs basedpyright 2자)

**측정 주체: 이 lane, 2026-09-02.** Stage 1에서 실제로 설치된 `with-pyright`/`with-basedpyright`
scratch node_modules를 그대로 재사용해 세 기준을 직접 확인했다(재설치하지 않음).

**1) 유지보수 주체·릴리스 주기** — `npm view <pkg> maintainers/repository/time`으로 직접 조회:
- `pyright`: registry 소유자가 `microsoft1es`/`microsoft-oss-releases` 공식 계정 + 원저자
  `erictraut` 포함 5인, `repository: github.com/Microsoft/pyright`. 총 497개 버전 발행, `latest`
  기준 최근 릴리스 간격은 대체로 월 단위이나 2025-10-22→2026-01-08처럼 2.5개월 간격도 있었다.
- `basedpyright`: registry 소유자가 `detachhead` 1인(fork 관리자). 총 1613개 버전 중 대부분이
  `canary` dist-tag의 git-hash suffix 버전(거의 매일, upstream을 계속 rebase)이고, `latest`
  dist-tag는 별도로 안정 버전만 가리킨다(`basedpyright@1.39.10` 자체가 `latest`임을 `npm view
  basedpyright dist-tags`로 확인) — canary 개수만 보고 "불안정하다"로 오판하지 않도록 이 구분을
  분명히 남긴다.
- **정직하게 남긴다: "릴리스 주기"는 메인테이너 수·버전 개수·dist-tag 구조만 확인했고, `latest`
  태그의 실제 배포 간격 분포(중앙값, 최대 공백 등)를 통계적으로 분석하지는 않았다** — 요구사항이
  "유지보수 주체와 릴리스 주기"를 함께 확인하라고 했는데 후자는 이 표면 수준까지만 봤다. 아래 결정을
  뒤집을 요소로 보이지 않아(npm 채널 우선순위 신호 하나로 이미 결정이 선다) 더 깊이 파지 않았지만,
  "확인했다"로 뭉뚱그리지 않고 어디까지 봤는지를 그대로 적는다.
- **공급망 관점(commander 지적)**: `bundled`를 택한 순간 이 저장소가 "사용자 머신에 이 패키지를
  설치하는 주체"가 된다 — `verified-external`이었다면 사용자가 자기가 설치한 것에 스스로 책임을
  졌겠지만, 지금은 우리가 그 선택을 대신 한다. 그래서 `repository.url =
  git+https://github.com/Microsoft/pyright.git`와 `maintainers`에 `microsoft1es`/
  `microsoft-oss-releases`(공식 조직 계정) + 원저자 `erictraut`가 포함돼 있다는 것을 "정품 확인"으로
  이 기록에 명시한다 — 번들 이전에는 하지 않아도 됐을 확인이다.
- **basedpyright 자신의 README가 npm을 2순위 채널이라고 명시한다**: `node_modules/basedpyright/
  README.md`(설치된 실제 파일에서 직접 인용) — "it's recommended to install basedpyright via
  pypi rather than npm... the basedpyright npm package is intended for users who are unable to use
  the pypi package for some reason." **pyright의 같은 위치 README에는 이런 문구가 없다** — 대칭
  확인을 위해 pyright README도 직접 읽었다. 우리가 번들하는 건 정확히 npm 채널이므로, 이건
  basedpyright 쪽에 실질적으로 불리한 신호다 — upstream(pyright)이 자기 npm 패키지를 1급으로 다루고,
  fork는 자기 npm 패키지를 스스로 2급으로 표시한다.
- 두 패키지의 `package.json` 모두 `optionalDependencies: {fsevents}` 하나뿐이고 `os`/`cpu` 제약이나
  네이티브 바이너리가 없다 — README의 "pypi 권장" 문구는 npm 패키지 자체의 기술적 결함이 아니라
  basedpyright 메인테이너의 채널 우선순위 선언이다(PyPI 배포는 `nodejs-wheel`로 Node를 함께
  묶는 별도 방식이라 npm 패키지와 무관).

**2) 라이선스(번들 대상이므로 하위 라이선스까지 직접 확인)** — 두 scratch install의 실제 파일을
직접 비교했다: 최상위 `LICENSE.txt`는 둘 다 "MIT License / Pyright ... Copyright (c) Microsoft
Corporation"으로 시작한다(basedpyright도 원저작권 표시를 그대로 유지). `dist/typeshed-fallback/
LICENSE`는 `diff`로 바이트 단위 **동일**함을 확인했다(Apache-2.0 본문 + 일부 MIT 조각, 조사
lane에서 이미 읽은 내용과 같다). 그 외 라이선스 파일은 두 패키지 모두 이 두 개뿐이다(`find
-iname "*licen*"`). Impact Lens는 이 저장소 자체가 MIT(`LICENSE`, `cli/LICENSE` 확인)이고, npm
`dependencies`로 선언하는 것은 재배포(vendoring)가 아니라 의존성 선언이므로 각 패키지가 자기
LICENSE를 자기 디렉터리에 유지한 채 설치된다 — MIT와 Apache-2.0 모두 permissive이고 우리 MIT
선언과 충돌하지 않는다. **두 후보 모두 라이선스 측면에서 동등하게 깨끗하다** — 이 기준은
차별점이 아니다.

**3) Call Hierarchy에 영향 있는 기능 차이** — basedpyright의 `package.json` description(
"a fork of pyright with various type checking improvements, pylance features and more")과
번들된 `README.md` 전체를 직접 읽었다. **"call hierarchy"/"hierarchy" 문자열이 한 번도 나오지
않는다** — basedpyright가 광고하는 개선 사항 중 Call Hierarchy를 특정해 언급하는 것이 없다. 조사
lane이 이미 같은 fixture에서 두 provider의 결과가 byte-identical이라고 관측한 것과 합치한다.
**차이가 없다는 것을 이 lane이 직접 (README 전문 검색으로) 재확인했다** — "전체 목록은 필요
없다"는 요구사항대로 Call Hierarchy 관련 여부만 좁혀서 봤다.

**결정: `pyright`.** 근거:
- 유지보수 주체가 canonical upstream(Microsoft, 원저자 포함)이고, 우리가 실제로 번들하는 채널(npm)을
  1급으로 취급한다 — basedpyright는 같은 채널을 스스로 2급이라고 명시한다. `bundled`는 이 채널의
  안정성에 직접 의존하므로 이 차이가 실질적이다.
- Call Hierarchy 자체는 두 후보가 기능적으로 동일하다(조사 lane 실측 + 이 lane의 README 재확인) —
  basedpyright를 선택할 만한 capability상의 이유가 없다.
- 라이선스는 동률이라 결정 요인이 아니다.
- 부차적으로 stage 1 실측치(pyright unpacked +18.4MB / basedpyright +26.3MB, packed 4.16MB /
  6.16MB)도 pyright 쪽이 가볍다 — 이미 있는 근거를 다시 쓰는 것이지 이번에 새로 만든 근거는 아니다.

**탈락 사유 기록**: `basedpyright`는 (A)·(B) 모두 통과하지만, `bundled` 채널에서 upstream보다
못한 유지보수 우선순위(자기 공식 문서가 명시)와 더 큰 설치 크기를 상쇄할 만한 Call Hierarchy상의
이점이 없어 탈락시킨다. `Pyrefly`는 stage 1(`bundled`)에서 이미 구조적으로 탈락했다(npm 미배포).

**검증**: 이 scratch에 이미 설치된 pyright로 `lsp-probe.mjs`를 다시 실행해 Call Hierarchy 왕복을
재확인했다(`fixture_caller found as incoming call? true`, 이 lane이 2026-09-02에 직접 재현) — 조사
lane의 결과를 그대로 믿지 않고 이 lane에서 다시 왕복시켰다.

### 2026-09-02 — Stage 3: `null`/`[]` 처리 방향 결정 및 구현

**목표를 다시 명확히 한다(commander 지적)**: `null`과 `[]`를 구분하는 것 자체가 목표가 아니다. 목표는
FastAPI 사용자가 `Depends()`로만 불리는 함수를 조회했을 때 `complete: true` + 빈 결과를 "아무도 안
부른다"로 잘못 읽지 않게 하는 것이다.

**선례 확인(구현 전에 필수로 읽음)**: `cli/src/types.ts:201`의 `languageMatch: boolean | 'unknown'`과
`:204-212`의 `advertised`/`observed` capability 분리를 다시 읽었다. 둘 다 같은 패턴이다 — **provider
편차를 억지로 하나의 값으로 밀어 넣지 않고, "모른다"를 표현하는 세 번째 값(또는 별도 필드)을 만든다.**

**선택한 방향: (나) — 구분하지 않되 "구분할 수 없다는 사실 자체"를 한계로 표면화한다.** (가)(provider별
`null` 의미 선언)와 (다)(관측된 provider 한정 구분)를 고르지 않은 이유:
- (가)는 pyright의 `null`이 "답할 수 없음"과 "0건 계산함" 중 무엇인지 이 lane도, 조사 lane도 확인하지
  못한 채로 특정 의미를 선언하는 것이 된다 — 확인하지 못한 것을 확인한 것처럼 적는 것과 같다.
- (다)는 "관측된 provider"가 지금은 pyright 하나뿐이라 (가)와 사실상 같은 문제를 가지면서, 나중에
  `verified-external`/custom provider가 추가될 때마다 이 목록을 유지보수해야 하는 부담이 더 생긴다.
- (나)는 pyright에 대해서든 앞으로 추가될 어떤 provider에 대해서든 똑같이 적용된다 — "이 provider가
  `null`로 무엇을 의미하는지 모른다"는 사실만 그대로 전달하고, 그 사실 자체를 프로덕션이 아는 척하지
  않는다. `languageMatch: 'unknown'`이 정확히 같은 형태의 결정이다(감지 불가능한 언어를 `false`도
  `true`도 아닌 별도 값으로 표현).

**구현(코드 변경, 4곳)**:
1. `cli/src/types.ts` — `AnalysisObservations`에 `nullIncomingCallsObserved?: boolean`을 추가.
   `null`과 `[]`의 구분이 사실이지 해석이 아님을 doc comment에 명시(LSP가 이 메서드의 `null`에
   단일 의미를 주지 않는다는 점 포함).
2. `cli/src/lspProvider.ts` — `incoming()`이 여전히 `calls ?? []`로 반환하지만(호출부 타입은 안
   바꿈), raw 응답이 `null`이었는지를 세션 단위 private 필드(`nullIncomingCallsObserved`)에 남기고
   `analysisObservations()`가 항상 이 필드를 포함해 반환한다(`indexing`과 같은 패턴 — 조건부로
   생략하면 아래 3번 guard test가 요구하는 "has-producer 필드는 항상 key로 존재" 불변식이 깨진다는
   것을 `stateReachability.integration.test.ts`가 실제로 잡아냈다).
3. `cli/src/coverage.ts` — `limitationDetailsFor`가 `observations`를 세 번째 인자로 받도록 확장(기존
   호출부 1곳만 수정). `completion.requestStatus === 'succeeded' && facts.incomingCallerCount === 0`
   분기 안에서 `observations.nullIncomingCallsObserved`가 참이면 새 코드
   `provider_null_incoming_calls`(severity: warning, scope: provider)를 추가. **범위를 root 질의로
   제한**했다 — 이 분기 자체가 "전체 traversal이 root 하나뿐"인 경우에만 참이므로(callers가 하나라도
   있으면 이 분기에 안 들어옴), 세션 단위 플래그를 여기서 쓰는 것이 root 질의만을 정확히 가리킨다.
   `V1_WITHHELD_REASON_CODES`에도 추가해 `no_incoming_callers`/`index_state_unknown`과 같은 방식으로
   레거시 `limitations`/`coverage.reasons` 배열에는 노출하지 않는다(schemaVersion을 additive로 유지하는
   기존 메커니즘 그대로 재사용 — 새 메커니즘을 발명하지 않았다).
4. `cli/src/test/stateReachabilityClassification.ts` — `nullIncomingCallsObserved: 'has-producer'`로
   분류(빌드 중 `stateReachability.sources.test.ts`가 "분류 안 된 새 필드"로 실제로 실패시켜 이 갱신을
   강제했다 — guard가 설계대로 작동함을 확인).

**schemaVersion 확인**: 올리지 않았다. `code`는 `response.schema.json`에서 plain string이라 enum
제약이 없고(`grep`으로 직접 확인), `limitationDetails`는 이미 배열이라 새 코드 추가는 순수 additive다.

**테스트(vacuous pass 방지가 핵심 요구사항이었다)**:
- `cli/src/test/coverage.test.ts`에 truth-table 스타일 신규 테스트 4개 추가: `S3-null`(index unknown +
  null), `S2-null`(index ready + null — `index_state_unknown`과 독립임을 확인), 그리고 두 개의 **부정
  guard**: "plain `[]`는 새 코드를 절대 얻지 않는다"(가장 중요 — 이게 없으면 "0건이면 항상 이 코드"로
  vacuous하게 통과할 수 있었다), "callers가 있으면 세션에 null 관측이 있어도 새 코드가 새지 않는다."
- **`?? []` 라인 자체를 실제로 밟는 e2e 테스트**: `cli/src/test/fixtures/nullIncomingCallsServer.ts`를
  새로 만들었다 — `callHierarchy/incomingCalls`에 실제 JSON-RPC `null`을 응답하는 진짜 stdio LSP mock
  서버(기존 `dynamicCallHierarchyServer.ts`/`hugeServerVersionServer.ts`와 같은 패턴). `contract.test.ts`
  에 이 서버를 실제 CLI 바이너리로 구동하는 테스트를 추가해 `limitationDetails`에 코드가 있고
  `limitations`/`coverage.reasons`에는 없음을 확인했다. **음성 대조군**도 같은 테스트 구조로
  추가했다 — 같은 fixture 모양이지만 `[]`를 답하는 기존 `dynamicCallHierarchyServer.ts`를 재사용해
  새 코드가 나타나지 않음을 확인했다. Mock을 `CallHierarchyProvider` 인터페이스 층위가 아니라
  `lspProvider.ts`가 실제로 말을 거는 자식 프로세스 층위에 둬서, `incoming()`의 `?? []` 줄 자체가
  실행되는 경로를 증명한다.
- `npm run test` 전체 286개 중 284 통과·2 skip(기존에 `IMPACT_LENS_REQUIRE_GOPLS` 필요라 skip이던
  것, 이 변경과 무관)으로 회귀 없음을 확인했다.

**사용자 문서 갱신(이 코드가 실제로 읽히게 하기 위해 stage 3에서 함께 처리 — stage 6로 미루지 않음)**:
새 신호를 만들어도 그걸 읽는 쪽(Codex/Claude Code plugin agent)의 지침이 그대로면 무시된다고 판단해
세 파일을 직접 갱신했다: `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`(코드
설명과 `ready` 상태에서도 사라지지 않는다는 점 — `index_state_unknown`과의 차이 — 을 명시),
`plugins/impact-lens/skills/impact-lens-cli/SKILL.md`와
`plugins/impact-lens/commands/analyze.md`(에이전트가 0-caller 결과를 볼 때 이 코드도 확인하도록
지시 추가).

**남겨 둔 것(stage 6로 미룸, 지금 하지 않음)**: `scripts/fixtures/response-policy/`의 eval fixture
세트(`scripts/test-response-policy.mjs`가 채점)에 이 시나리오(`Depends()` 모양 + `ready` 상태에서
`provider_null_incoming_calls`가 나타나는 경우, 에이전트가 여전히 "안 불림"이라고 결론 내리면
fail)를 추가하지 않았다 — 채점 스크립트의 `expectedViolations` 어휘를 먼저 이해해야 하는 별도
단위 작업이라 이 stage의 범위를 넘는다고 판단했다. **"확인했다"고 적지 않고 이 목록에 남긴다.**

### 2026-09-02 — Stage 3 보완 2건(commander 검토)

**보완 1 — 세션 플래그가 왜 "정확히 root 질의 한 번"에 대응하는지가 코드에 없었다.** commander가
`impact.ts:99,136`을 직접 읽고 "`incomingCallerCount === 0` ⟺ `incoming()` 질의가 정확히 한 번"이라는
불변식을 도출해 지적했다 — `entries`는 root로 시작하고, 두 번째 질의가 일어나려면 `entries.push`가
선행해야 하는데 그러면 count가 이미 0이 아니게 된다는 논증이다. 재귀(root가 자기를 호출)도 `seen`에
걸려 edge만 남고 entry도 질의도 하나뿐이라는 것까지 포함해 이 lane이 직접 다시 따라가 확인했다 —
정확했다. 반영:
- `impact.ts`의 `incomingCallerCount: traversal.entries.length - 1` 옆에 이 불변식과, 이게 깨지면
  무엇이 틀려지는지(다른 질의에서 관측된 `null`이 `[]`로 증명된 0-caller 결과에 잘못 붙는다)를
  명시하는 주석을 추가했다 — gopls preset의 `requiredProjectFiles` 주석이 미래의 편집을 지목한 것과
  같은 형식.
- `coverage.ts`의 `nullIncomingCallsObserved` 소비 지점에 위 불변식을 역참조하는 주석을 추가했다.
- **guard test 추가(`cli/src/test/impact.test.ts`)**: `FakeProvider`에 `incomingCallCount` 카운터를
  붙이고, (1) 기존 "callers 없음" 테스트에 `incomingCallCount === 1` 단언을 추가, (2) 새 테스트
  "a self-recursive root still queries incoming() exactly once"를 추가해 재귀 케이스에서도 질의가
  정확히 1회임을 확인했다. 이 테스트들은 `null` 자체가 아니라 **"질의 횟수" 구조적 불변식**을
  증명한다 — `null`이 실제로 플래그로 이어지는지는 이미 stage 3 본문의 e2e fixture 테스트가 증명한다.
  둘이 합쳐야 전체 주장(불변식이 성립하고, 성립한 그 지점에서 null이 정확히 관측된다)이 닫힌다.

**보완 2 — 이미 shipped된 `bundled-typescript` 경로에 대한 실측이 없었다(commander 핵심 지적).**
새 코드는 provider를 안 가리므로 TS 사용자도 대상이다. 그런데 지금까지의 음성 대조군은 mock
(`dynamicCallHierarchyServer.ts`)뿐이었다 — **실제 `typescript-language-server`가 caller 0인 심볼에
`null`을 주는지 `[]`를 주는지 아무도 실측하지 않았다.** 이 lane이 직접 쟀다:

- session scratchpad에 실제 TS 프로젝트(`tsconfig.json` + caller가 전혀 없는 `export function
  neverCalled(...)`)를 만들었다.
- 빌드된 CLI(`cli/dist/index.js`)로 `providerPreset: "bundled-typescript"`를 통해 이 심볼을 실제로
  분석했다(mock이 아니라 shipped된 진짜 `typescript-language-server@6.0.0` 경로).
- 3회 반복 실행 — 매번 `limitationDetails`에 `no_incoming_callers`, `index_state_unknown`은 있고
  **`provider_null_incoming_calls`는 없었다.**

**결론: `typescript-language-server@6.0.0`은 caller가 없는 심볼에 `[]`를 반환한다, `null`이
아니다.** commander가 예상한 "영향 없음, 오히려 설계가 의도대로 작동한다는 강한 증거" 쪽으로
확인됐다 — 오늘 TS 사용자가 caller 없는 심볼을 조회해도 이 새 경고를 받지 않는다. 방향 (나)를
재논의할 필요가 없다.

**한계**: 이 실측은 `typescript-language-server@6.0.0`(이 저장소가 실제로 번들한 버전) 하나에
대한 것이다. 다른 버전이나 다른 TS 파일 모양(메서드, private 함수 등)까지 전부 확인하지는 않았다 —
"caller 없는 심볼 하나면 된다"는 commander의 요청 범위 그대로다.

### 2026-09-02 — Stage 4: preset 작성

**pyright 의존성 추가**: `cli/package.json`의 `dependencies`에 `"pyright": "1.1.413"`를 caret 없이
정확히 고정했다(`typescript`와 같은 방식). 이 저장소가 실제로 pnpm workspace(`pnpm-workspace.yaml`:
`packages: [., cli]`, root `package.json`의 `packageManager: pnpm@10.34.5`)라는 것을 이 lane에서
처음 확인했다 — `cli/`에서 맨 `npm install`을 돌리면 workspace 밖 postinstall hook(`husky`)이 깨진다.
`npm install -g pnpm@10.34.5`(root가 고정한 버전과 동일)로 pnpm을 설치하고 `pnpm install --filter
cli`로 반영했다 — `cli/package.json`과 `pnpm-lock.yaml` 둘 다 갱신됐다. 설치된 실물로 `require.resolve
('pyright/langserver.index.js', {paths: ['cli']})`가 정확히 해석되는 것도 직접 확인했다.

**1) `runtime.ts:133-150` 허용 목록 확장**: `bundledModuleEntryPath()`에 `pyright/langserver.index.js`를
가리키는 두 번째 `if` 분기를 명시적으로 추가했다(패턴·동적 조회로 일반화하지 않음). `inspectBundled
PyrightArtifact()`를 새로 작성 — `BundledTypeScriptArtifact`와 같은 형태이지만 `typescriptVersion`
필드가 없다(pyright는 그 자체가 checker이자 language server라 별도로 보고할 컴파일러 패키지가 없다).

**doctor 버그 수정(commander가 미리 찾아 둔 것, 착수 전 직접 재확인 후 수정)**:
`cli/src/doctor/checks.ts`의 `executableCheck`가 `tier === 'bundled'`이면 preset과 무관하게
`inspectBundledTypeScriptArtifact()`를 무조건 호출하고 있었다 — 직접 코드를 읽어 확인했다. 고쳤다:
`inspectBundledArtifact(preset.id)`라는 dispatcher를 새로 만들어 `preset.id`로 명시적으로 분기하고,
**인식하지 못하는 bundled preset id는 조용히 TypeScript로 fallback하지 않고 `internal_error`를
던진다** — 미래에 세 번째 bundled preset이 추가되고 이 dispatcher 갱신을 잊으면, 잘못된 정보를
`pass`로 보고하는 대신 시끄럽게 실패하도록 만들었다. 실측으로 재현·확인:
- `node dist/index.js doctor bundled-pyright` → `bundled-provider-artifact` 체크가
  `package: "pyright", version: "1.1.413", entry: "langserver.index.js"`를 정확히 보고(수정 전이라면
  `typescript-language-server`/`6.0.0`을 잘못 보고했을 것).
- 회귀 방지 테스트를 `contract.test.ts`에 추가(아래 "테스트" 참고).

**2) 버전 고정**: 위 pyright 의존성 추가에서 이미 반영(caret 없이 `1.1.413`).

**5) preset id**: `bundled-pyright` — `^[a-z0-9]+(?:-[a-z0-9]+)*$` 관례를 따르고 `bundled-typescript`와
대칭.

**6) `catalog.ts`의 Python 주석 교정**: 파일 최상단 주석에서 (A) 라이선스·배포와 (B) capability를
뭉쳐 놓았던 원래 문장을 지우고, 조사 lane이 그 둘을 분리해 답했다는 것과 stage 2의 pyright 선택
근거를 새 주석으로 남겼다.

**3) readiness — 검증 먼저, 그리고 검증이 설계를 뒤집었다.** 계획대로 "pyright가 인덱싱 외 목적으로도
work-done-progress를 보내는가"부터 확인했다: 8초로 늘린 관측 창에서도 사이클은 하나뿐이었다(이전
투자 lane 결과와 일치) — 여기까지는 "titlePattern 생략으로 충분하다"는 기존 결론을 재확인하는
정상적인 경로였다.

**그런데 실제 preset을 붙여 실측하자 전혀 다른 문제가 나왔다** — commander에게 바로 보고할 만큼 결과가
예상과 달랐다. `readiness.signals: [{kind: 'work-done-progress', means: 'ready'}]`(titlePattern 생략)를
넣고 실제 `.py` 파일을 provider 없이 분석시켰더니, **매번 정확히 ~10330ms**가 걸렸다(`budgetMs: 10000`
+ 오버헤드) — 그리고 결과의 `completion.indexingStatus`는 항상 `working`, `requestStatus`는 항상
`partial`이었다. 그래프 자체(`fixture_caller`가 `fixture_target`을 부른다는 관계)는 **정확했다** — 다만
매번 예산을 전부 태우고 `onBudgetExceeded: proceed-partial`로 넘어간 뒤였다.

**원인을 `IMPACT_LENS_LSP_TRANSCRIPT=1`(기존에 이미 있던 opt-in 디버그 메커니즘)로 직접 추적했다**:
실제 세션의 transcript가 `"progress":[]`, `"workDoneProgressTokens":[]` — **pyright가 진행 알림을
단 하나도 보내지 않았다.** 별도 raw probe로 재현: `didOpen`을 한 번도 안 보내고 6초를 기다리면
pyright는 진행 알림을 정말 하나도 안 보낸다. 즉 **pyright의 진행 신호는 workspace 초기화가 아니라
`didOpen`이 트리거한다**(관측했던 `report.message`가 "N file to analyze"였던 것과도 합치한다). 그런데
`cli/src/lspProvider.ts`의 `awaitReadiness()`는 `doInitialize()` 안에서, **어떤 파일도 열리기 전에**
호출된다(`open()`은 이후 `prepare()`에서 처음 호출됨) — 그래서 pyright가 신호를 보낼 시점이 되기도
전에 대기가 이미 시작돼 있고, 신호는 구조적으로 결코 시간 안에 도착할 수 없다. gopls의 readiness
패턴("Setting up workspace" — workspace 단위, 파일을 열지 않아도 발생)이 pyright에는 그대로
이식되지 않는다는 것이 이 실측의 결론이다.

**즉시 취한 조치(안전한 쪽으로, 구조 변경은 하지 않음)**: `readiness`를 preset에서 **뺐다.**
"신호가 없어서 생략"이 아니라 "신호는 실재하지만 지금 아키텍처에서 절대 도착할 수 없어서, 선언해
두면 모든 Python 분석에 순수 지연(10초)만 추가하고 아무 이득도 없기 때문에 뺐다"는 것을 catalog.ts
주석에 그대로 적었다. 반영 후 재측정: 같은 요청이 `444ms`로 끝나고, `completion.requestStatus:
succeeded`, `indexingStatus: unknown`(`bundled-typescript`와 동일한 "주장하지 않음" 기본값 — 지금
가능한 것보다 못한 상태로 퇴보한 게 아니라, `bundled-typescript`가 이미 쓰던 정직한 기본값이다).
그래프 결과는 그대로 정확했다.

**commander에게 지금 알려야 할 open question**: `readiness`를 이 preset에 다시 넣으려면
`awaitReadiness()`를 `open()`(적어도 root 파일)보다 뒤로 옮기는 순서 변경이 필요한데, 이건 이
preset만의 문제가 아니라 **모든 provider(TS, gopls, custom)가 공유하는 코드 경로**를 건드리는
cross-cutting 변경이다. 이 lane에서 임의로 진행하지 않고 결정을 미룬다.

**4) `requiredProjectFiles`와 조용한 저하 — 두 가지를 직접 실측했다.**
- **cross-package import 해석**: `pyproject.toml`/`setup.py`/`__init__.py`가 전혀 없는 순수
  다중 디렉터리 구조(`pkg_a/target.py`, `pkg_b/caller.py`, `from pkg_a.target import
  fixture_target`)에서도 cross-directory import가 정상 해석됐다(`fixture_caller`를 incoming call로
  정확히 찾음) — pyright의 implicit namespace package 해석이 workspace root를 암묵적 검색 경로로
  삼기 때문. gopls의 AdHoc 같은 fallback이 애초에 없다.
- **third-party import(venv) 위험 — 실재하지만 침묵하지 않는다**: `attrs`(실제 venv에 설치된
  third-party 패키지, 시스템 `python3`에는 없음)를 import하는 fixture로 4가지 시나리오를 비교했다.
  (a) 아무 설정 없음 → `reportMissingImports`(severity 1) 명시적 진단 발생. (b) `pyrightconfig.json`에
  `venvPath`/`venv`를 명시 → 진단 0건, 완전 해결. (c) 관례적인 `.venv/` 디렉터리만 두고(명시 config
  없음) → 여전히 `reportMissingImports` — **bare `.venv/`는 자동 인식되지 않는다.** (d)
  `workspace/configuration`에서 `pythonPath`만 응답(프로젝트 파일 전혀 없음) → 진단 0건, 완전 해결.
  결론: gopls의 AdHoc과 달리 이 gap은 **소리 없이 저하되지 않는다** — 항상 눈에 보이는 diagnostic으로
  나타나고, Impact Lens는 이미 `collectDiagnostics`로 노드별 diagnostic을 응답에 포함한다. 또한
  `requiredProjectFiles`로 게이트해도 (c)가 보여주듯 문제가 안 풀린다 — 실제로 필요한 건 venv
  auto-detection(예: `.venv`/`venv` 폴더를 찾아 `pythonPath`를 자동으로 넘기는 것) 같은 별도 기능이지,
  "project 파일이 있는지" 확인이 아니다. **`requiredProjectFiles`는 넣지 않았다** — gopls류
  silent-completeness 위험이 없고, project 파일 존재만으로는 이 gap이 풀리지도 않기 때문이다. 대신
  `docs.limitations`에 이 gap을 명시했다. venv auto-detection은 이 lane이 구현하지 않은 실제
  옵션으로 기록만 해 둔다(추측성 구현 금지).

**7) 실제 `.py` 파일로 auto-discovery end-to-end**: provider 필드를 아예 생략한 실제 `.py` 파일
분석이 `bundled-pyright`에 정확히 도달하고(`selectedBy: "bundled"`), 올바른 그래프
(`fixture_caller` → `fixture_target`)를 반환하는 것을 수동으로, 그리고
`contract.test.ts`(아래)에도 재현 가능한 형태로 확인했다. `providers.test.ts:734`의 교차 검사는
선언 일치만 보장한다는 지적 그대로, 이건 별개의 실제 동작 증거다.

**catalog.ts fixture**: 조사 lane의 실측 fixture(`target.py`/`caller.py`, `from target import
fixture_target`)를 그대로 재사용 — 새로 만들지 않고 이미 검증된 내용을 썼다.

**테스트**:
- `contract.test.ts`에 4개 추가: bundled-pyright preflight(수정된 doctor 버그의 회귀 방지 —
  `package: "pyright"`이고 `typescriptVersion`이 없음을 직접 단언), `--smoke`, `--fixture`(실제
  `fixture_caller` 발견 확인), 그리고 provider 필드 없는 실제 `.py` 파일 auto-discovery e2e(임시
  workspace에 실제 파일 작성 후 실행).
- `providers.test.ts`의 기존 테스트 5개가 Python을 "커버리지 없는 언어"의 대역으로 쓰고 있어서
  깨졌다 — `fixturePythonPreset()`을 `fixtureUnclaimedLanguagePreset()`으로 이름과 대상 언어를
  `c`(clangd가 아직 없어 실제로 커버되지 않는 언어)로 바꿔 재사용했다. 하드코딩된 catalog id
  목록과 `bundledLanguageIds()` 기대값도 갱신했다.
- `npm run test` 전체 291개 중 289 pass, 2 skip(기존 gopls-required, 무관), 회귀 없음.

**아직 남은 항목(stage 4 내에서 계속)**: stage 5(CI), 실제 사용 문서 갱신은 stage 6와 겹치는 부분
정리. readiness의 cross-cutting 재설계 여부는 commander 결정 대기 — 그 결정 전까지는 현재 상태
(readiness 없음, `indexingStatus: unknown`)로 유지한다.

### 2026-09-02 — commander 결정: readiness 없이 진행, 아키텍처 발견 독립 기록

**commander 결정(2026-09-02)**: readiness 재설계는 이 lane에서 하지 않는다. 현재 상태
(readiness 없음, `indexingStatus: unknown`)로 stage 5에 진행한다. 근거 3가지 — (1) `unknown`은
`bundled-typescript`가 오늘 이미 보고하는 정직한 기본값이고 퇴보가 아니다. (2) readiness를 넣으면
10330ms 대 444ms로 순수 손해이고 그 대가로 얻는 정보가 0이다. (3) 고치려면 `awaitReadiness()`를
`open()` 뒤로 옮겨야 하는데 이건 TS·gopls·custom이 전부 공유하는 경로라 gopls readiness의 3-OS
재검증이 필요한 **lane 규모** 작업이다. 이 lane이 진단을 직접 재확인했다(아래 "제약" 참고) — stage 4
로그의 코드 직독 결과와 일치한다.

**아래는 commander가 요구한 두 가지 기록 — stage 4 로그 안에 섞여 있던 발견을 독립 항목으로 분리하고,
다음 사람이 "간단한 순서 변경"으로 오인해 손대는 것을 막기 위한 관측·원인·제약·재검증 비용이다.**

**관측**:
- 실제 `.py` 분석 세션의 transcript(`IMPACT_LENS_LSP_TRANSCRIPT=1`)가 `"progress":[]`,
  `"workDoneProgressTokens":[]` — pyright가 진행 알림을 단 하나도 보내지 않았다.
- 별도 raw probe: `textDocument/didOpen`을 한 번도 보내지 않고 6초를 기다리면 pyright는 진행 알림을
  정말 0건 보낸다.
- `report.message`가 관측될 때는 내용이 "N file to analyze"였다 — workspace 초기화 메시지가 아니라
  분석 대상 파일 수를 세는 메시지.

**원인**: pyright의 work-done-progress 사이클은 workspace 초기화가 아니라
`textDocument/didOpen`이 트리거한다.

**제약(코드 직독, 정확한 줄 번호 — 이 항목에서 다시 확인)**:
- `cli/src/lspProvider.ts`의 `doInitialize()`(486~586행)가 **585행**에서 `awaitReadiness()`를
  호출한다 — `initialized = true`를 설정하는 584행 직후, 어떤 파일도 열리기 전이다.
  (`awaitReadiness()` 자신의 정의는 614행.)
- 같은 파일의 `prepare()`(358~367행)가 **361행**에서 최초로 `open()`을 호출한다
  (`open()`의 정의는 651행) — `prepare()`의 359행 `await this.initialize()`가 끝난 뒤에만 도달하는
  경로다.
- 즉 `awaitReadiness()`가 응답을 기다리는 시점에 pyright에게는 아직 열린 파일이 없다 — 신호를 보낼
  조건 자체가 아직 성립하지 않은 상태에서 대기가 이미 끝나 있다.

**재검증 비용(고치려면 무엇을 다시 검증해야 하는가)**:
- `awaitReadiness()`를 `open()`(최소 root 파일)보다 뒤로 옮기는 순서 변경은 `LspCallHierarchyProvider`를
  쓰는 **모든** provider(TS, gopls, custom)가 공유하는 코드 경로를 건드린다.
- gopls의 readiness가 오늘 동작하는 이유가 정확히 "Setting up workspace" 신호가 workspace 단위이고
  파일을 열지 않아도 오기 때문이다(`catalog.ts`의 gopls readiness 주석, 145~148행 부근). 호출 순서를
  바꾸면 이 전제가 재검증되지 않은 채로 남는다 — `go-provider` CI job(3-OS, `IMPACT_LENS_REQUIRE_GOPLS=1`)을
  다시 통과시켜 gopls가 여전히 정상 동작함을 확인해야 한다.
- 즉 이건 이 preset 하나의 버그 수정이 아니라 별도 lane 규모의 작업이다.

**후속 lane 목록에 등록**: 이 문제는 Python 하나의 각주가 아니라 **"파일이 열려야만 신호를 보내는
provider 전체"**의 문제다 — 다음 후보는 `clangd`(C/C++, background index를 씀)다.
`docs/development-management/stories/il-lim-014-c-cpp-clangd-support.md`의 "미해결 질문"에 이
lane을 가리키는 항목을 추가했다(아래 별도 기록).

**부가 실측 — commander의 남은 위험 질문에 답한다.** "pyright가 준비 전 요청을 큐에 넣고 기다리는지,
즉시 빈 답을 주는지 확인했습니까?"에 실측으로 답한다(측정 주체: 이 lane, 2026-09-02, session
scratchpad `pyright-readiness-race/`, 저장소 밖 — 실제 fixture가 아니라 일회성 raw JSON-RPC probe).

- **방법**: 3,000개 파일로 구성된 synthetic Python workspace를 만들었다. 각 filler 파일은 stdlib
  모듈 10개를 import하고 `target.fixture_target`을 호출하는 메서드 8개를 가진 클래스를 정의한다
  (실제 계산 부하를 만들기 위함). `target.py`(질의 대상)를 열자마자(추가 대기 없이) `prepare
  CallHierarchy` + `incomingCalls`를 곧바로 쐈다("EARLY") — 그리고 같은 질의를 15초 뒤에 다시
  쐈다("LATE", 인덱싱이 확실히 끝난 뒤).
- **결과**: EARLY는 `didOpen` 직후 158ms에 발사돼 1877ms에 응답이 왔고(왕복 계산에 실측 1.7초가
  걸림 — 공짜 답이 아니다), **24001개 caller**를 정확히 반환했다 — 마지막으로 정렬되는
  `zzz_caller.py`의 `fixture_caller`까지 포함해서. LATE(15초 뒤)는 정확히 같은 24001개, 같은
  `fixture_caller` 포함. **두 응답이 바이트 단위로 동일했다.**
- 이 실행 동안 `$/progress`·`window/workDoneProgress/create`는 **0건**이었다 — 실제 계산이 1.7초
  걸렸는데도 진행 신호가 전혀 없었다는 뜻이다. 이건 이 항목의 "관측"과 별개의 새 사실이라, 신호
  자체가 이 lane이 다룬 workload 형태에서는 안정적인 관측 채널이 아니라는 부가 증거로만 남긴다 —
  원인은 조사하지 않았다(범위 밖).
- **판단**: pyright의 request handler는 (적어도 이 규모·형태에서는) 배경 인덱스가 완성되기를
  기다리지 않고, 질의에 필요한 분석을 그 자리에서 강제로 수행해 답하는 것으로 보인다 — "완성 전
  캐시를 읽어 불완전한 답을 준다"는 패턴이 아니라 "질의당 필요한 만큼 동기적으로 계산한다"는 패턴에
  가깝다.
- **`docs.limitations`에 새 항목을 추가하지 않는다** — 실측이 정확히 commander가 우려한 시나리오
  (인덱싱 완료 전 질의 도착)를 재현했고, 그 안에서 불완전한 응답을 관측하지 못했다.
- **이 실측의 한계(확인 안 한 것을 그대로 적는다)**: (1) synthetic 파일은 전부 stdlib import뿐이고
  실제 third-party 패키지(venv/site-packages)를 갖는 워크스페이스가 아니다 — third-party 해석
  경로는 stage 4에서 이미 별도로 다뤘고(venv 미설정 시 `reportMissingImports`) 이 실측과는 다른
  질문이다. (2) 최대 3,000 파일까지만 봤다 — 이보다 훨씬 큰 실제 monorepo(수만 파일)에서 같은
  결론인지는 검증하지 않았다. (3) darwin/arm64 1개 머신에서만 쟀다. 이 세 가지는 "불완전 응답
  위험이 없다"는 결론을 뒤집을 수 있는 조건이라, 다음 사람이 대규모 실제 프로젝트에서 다르게
  관측하면 이 판단을 다시 열어야 한다.

### 2026-09-02 — Stage 5: CI

**목적**: "3-OS에서 동작한다"는 주장을 실제 실행으로 뒷받침한다. `go-provider`와 같은 규칙(**skip은
실패로 취급**)을 지키되, bundled tier는 "설치가 아니라 의존성 해석이 검증 대상"이라는 stage 1의
사전 결론대로 형태가 달라진다.

**직접 확인한 사실 — 새 job이 필요 없는 이유**:
- `.github/workflows/unit-tests.yml`의 `unit`(ubuntu-latest)과 `cli-tests-cross-os`
  (windows-latest, macos-latest) 두 job이 이미 3개 OS 전부에서 `pnpm install --frozen-lockfile` →
  `npm run cli:test`를 돈다.
- `pyright`는 `gopls`와 달리 별도 설치 단계가 필요한 external tool이 아니라 `cli/package.json`의
  `dependencies`에 정확히 고정된 패키지다 — 그래서 이 두 job의 기존 `pnpm install` 단계가 세 OS
  모두에서 이미 pyright를 동일하게 설치한다. gopls가 `go-provider`라는 별도 job과
  `IMPACT_LENS_REQUIRE_GOPLS=1` 게이트가 필요했던 이유(외부 설치 단계가 Extension/CLI 결과를
  가리거나 지연시킬 위험)가 애초에 성립하지 않는다.
- `contract.test.ts`의 bundled-pyright 테스트 4개(preflight, `--smoke`, `--fixture`, 실제 `.py`
  auto-discovery e2e)는 **어떤 skip 게이트도 없다** — 코드를 직접 읽어 확인했다(위 테스트 목록,
  `IMPACT_LENS_REQUIRE_` 패턴으로 grep해도 0건). 즉 이미 두 기존 job에서 무조건 실행된다.

**검증 — "서버 부재 시 job이 실제로 실패하는지" 로컬로 재현**(측정 주체: 이 lane, 2026-09-02):
`cli/node_modules/pyright`(pnpm이 만든 심볼릭 링크)를 일시적으로 옮겨 `require.resolve`가 실패하는
상태를 만들고 `npm run cli:test`를 돌렸다. 결과: bundled-pyright 관련 4개 테스트 전부 **명시적으로
실패**했다 — `doctor` preflight는 `status: 'blocked'`, `--smoke`/`--fixture`는 각각 기대와 다른
값으로 assertion 실패, e2e는 `analyze`가 `ok: false`와
`error.code: 'bundled_provider_artifact_missing'`("Reinstall the Impact Lens CLI or Plugin.")을
반환해 exit code 5로 끝났다 — **스킵이 아니라 시끄러운 실패**였다. 심볼릭 링크를 원복한 뒤
`require.resolve`가 다시 정상 해석됨을 확인하고, `npm run cli:test` 전체(291개, 289 pass/2 skip
— 기존 gopls-required 스킵만 남음)를 재실행해 회귀가 없음을 확인했다.

**결정**: `bundled-pyright`를 위한 새 CI job을 추가하지 않는다. 위 검증이 증명하는 것은 "3개 OS
전부에서 이미 실제로 실패할 수 있는 경로가 존재한다"이지, "지금은 통과한다"가 아니다 — 새 job을
만들어도 똑같은 명령(`npm run cli:test`)을 똑같은 matrix(ubuntu/macos/windows)에서 다시 도는 것
말고는 추가되는 신호가 없다. `unit-tests.yml`의 `go-provider` job 바로 뒤에 이 결정과 근거를 그대로
남겨, 다음 사람이 "python-provider job이 왜 없지"라고 의아해하지 않도록 했다.

**산출물**: 새 workflow job 없음(의도적) — `.github/workflows/unit-tests.yml`에 결정 근거 주석
추가. 코드 변경 없음(pyright는 이미 stage 4에서 `cli/package.json`에 반영됨).

**남은 한계**: 이건 로컬 재현이지 실제 GitHub Actions runner에서 세 OS 모두를 돌려 확인한 것이
아니다 — `unit`/`cli-tests-cross-os` 자체는 이미 이 저장소의 기존 CI로 계속 돌고 있으므로(push/PR마다)
이 lane의 커밋이 push된 뒤 실제 CI 실행 결과로 재확인할 수 있다. 로컬 재현은 "그 CI가 실패할 능력이
있는가"를 증명하고, 실제 CI 실행은 "지금 그 CI가 통과하는가"를 증명한다 — 후자는 이 커밋이 push된
뒤의 CI 로그로 확인한다.

### 2026-09-02 — Stage 6: 사용자 문서

**목적**: 사용자가 Python을 쓸 수 있다는 것과 그 결과의 한계를 알게 한다.

**commander 지시**: `bundled-typescript`/`gopls`를 식별자로 grep하되 **부분 파일 grep 금지** — 전체
파일을 읽는다. 대상: README, INSTALL, cli-contract, CHANGELOG, SKILL.md, `.claude/agents/*.md`. 반드시
들어가야 할 것 둘: (1) Python이 이제 설정 없이 동작한다는 것(gopls의 `verified-external`과 대비),
(2) `provider_null_incoming_calls`가 모든 provider에 걸리는 응답 계약이라는 것. stage 3에서 미룬
`scripts/fixtures/response-policy/` eval fixture도 이 stage 범위 — 채점 스크립트의 violation 어휘를
먼저 파악하고 넣는다.

**grep + 전체 read 방법**: `grep -rn "bundled-typescript"`/`"gopls"`/`"bundled-pyright"`를 저장소
전체에 먼저 돌려 후보 파일을 추린 뒤, `docs/work/**`(작업 기록, "정정 표시·원문 유지" 관례상 소급
수정 대상 아님)와 `docs/development-management/{stories,milestones,user-tests}/**`(이 lane이 만든
변경과 무관한 별도 스토리/기록)를 범위에서 제외하고, commander가 지정한 6곳
(`README.md`, `INSTALL.md`, `CHANGELOG.md`, `cli/README.md`, `plugins/impact-lens/skills/impact-lens-cli/
{SKILL.md,references/cli-contract.md}`, `.claude/agents/*.md` 7개, 총 2,246줄)을 전부 `Read`로
전체 읽었다 — grep 스니펫만으로는 "shipped catalog에 preset이 N개"류 문장이 식별자 없이도 존재할 수
있어서다(실제로 SKILL.md의 결함이 이 방식으로만 잡혔다, 아래 참고).

**preset 개수(2→3) 갱신**: `README.md`(Auto 설정 없이 동작하는 언어 목록에 Python 추가, C/C++만
"다음 후보"로 남김), `INSTALL.md`, `cli/README.md`의 `### Shipped catalog` 절과 `doctor` 예시·
`knownPresetIds` 오류 예시(실제로는 `presetIds(catalog)`가 동적으로 만드는데 예시가
`["bundled-typescript"]`로 하드코딩돼 실제보다 적게 보여주고 있었다 — `cli/src/providers/resolve.ts:321,326`
직독으로 확인). `CHANGELOG.md`의 `## Unreleased`에 gopls 항목과 같은 형식으로 Python bundled
항목과 `provider_null_incoming_calls` 항목을 추가했다 — `## 0.7.0`(이미 배포된 버전) 절의 "catalog가
`bundled-typescript` 하나뿐"이라는 서술은 그 시점의 사실이므로 소급 수정하지 않았다("정정 표시,
원문 유지").

**필수 항목 2건**:
1. Python 무설정 동작 vs gopls: `README.md`·`INSTALL.md`·`cli/README.md`(`### Shipped catalog`)에
   "`bundled-typescript`·`bundled-pyright`는 CLI 자체에 포함돼 사용자가 아무것도 설치하지 않아도
   동작하고, `gopls`는 `verified-external`이라 사용자가 직접 설치해야 Auto가 찾는다"는 대비를 명시했다.
2. `provider_null_incoming_calls`의 일반성: `provider_null_incoming_calls`는 이미 SKILL.md·
   cli-contract.md·analyze.md(stage 3, "3곳")에 잘 문서화돼 있었지만, **CLI 자체의 정식 계약 문서인
   `cli/README.md`의 `## Contract` 절에는 전혀 언급이 없었다** — agent 대상 plugin 문서에만 있고
   사람이 읽는 CLI README에는 없는 공백이었다. `cli/README.md`와 `README.md`(`complete: true`가
   증명하지 않는 것 절), `cli-contract.md`(`unknown` 절에 `bundled-pyright` 추가)에 "특정 provider
   하나의 한계가 아니라 모든 provider에 적용되는 응답 계약"이라는 문장과 함께 추가했다.

**전체 read로만 잡은 진짜 결함 2건(grep만으로는 못 잡음, commander의 "부분 파일 grep 금지"가 정확히
막으려던 것)**:
- **`SKILL.md:30`이 사실과 다른 주장을 하고 있었다**: "`unknown`(indexingStatus)은 오늘 모든 shipped
  catalog provider가 만드는 값이다"라고 적혀 있었는데, 이건 gopls가 `readiness`를 선언해
  `working`/`ready`를 실제로 만드는 M2 gopls lane 이후로 **거짓**이 됐다(gopls lane이 이 문장을
  갱신하지 않고 지나감 — Python lane이 처음 발견). `bundled-typescript`/`bundled-pyright`(readiness
  없음)와 `gopls`(readiness 있음)를 구분하는 문장으로 고쳤다.
- **`.claude/agents/il-provider-platform.md`의 "알려진 결함" 절 전체가 stale였다**(commander가 예시로
  지목한 바로 그 파일): "doctor 서브커맨드가 `bundled-typescript` 하나뿐"·"모든 check의 status가
  `'pass'` 리터럴 고정"·"provider 선택이 삼항 연산자 두 줄"이라고 적혀 있었는데, 인용된 파일 경로
  (`cli/src/doctor.ts`, `cli/src/index.ts:202-204`)조차 지금 존재하지 않는다 — M1 doctor 일반화
  때 이미 고쳐진 상태를 한 번도 반영하지 않은 것이다(M2보다 훨씬 이전부터 stale였다). 현재 실제
  코드 위치(`cli/src/providers/resolve.ts`의 `resolveProvider()`, `cli/src/doctor/{checks,index}.ts`)와
  3-preset 상태로 다시 썼다.

**의도적으로 손대지 않은 것(범위 확인 필요, commander에게 보고)**: `.claude/agents/*.md` 나머지
4개(`il-lsp-protocol.md`의 "알려진 결함", `il-plugin-docs.md`의 "현재 문서 상태",
`il-test-release.md`의 "알려진 공백", `il-host-ux.md`의 "알려진 구조")도 전체를 읽었고 **모두
stale였다**(예: `il-test-release.md`가 "워크플로가 `plugin-artifact-e2e.yml` 하나뿐"이라고 적는데
지금 `unit-tests.yml`에 3개 job이 있다) — 그런데 이 staleness는 preset 개수나 Python과 무관하고
M2보다 훨씬 이전부터, 이 lane과 관계없는 이유로 낡아 있었다. `il-provider-platform.md`만 고치고
나머지 넷은 그대로 뒀다 — 이 lane의 범위(Python preset)를 벗어나는 별도 정리이기 때문이다. commander
확인이 필요하면 별도 lane으로 제안한다.

**response-policy eval fixture — commander 경고("채점 스크립트의 violation 어휘를 먼저 파악하고
넣으세요") 그대로 따름, 그 결과 fixture 추가 전에 engine 결함 2건을 실측으로 발견·수정**:

1. `scripts/lib/response-policy-engine.mjs`를 먼저 읽었다. `LIMITATION_SURFACE_PATTERNS`가
   `no_incoming_callers`/`provider_not_ready` 등은 자연어 패턴을 갖고 있는데
   `provider_null_incoming_calls`는 **항목이 아예 없어서** 코드명을 밑줄→공백으로 바꾼
   `/\bprovider null incoming calls\b/i` fallback으로 떨어졌다 — 어떤 자연스러운 영어 문장도 이
   구문을 그대로 쓰지 않으므로, `provider_null_incoming_calls`가 있는 어떤 응답이든 실질적으로
   **항상** `missing_high_severity_disclosure`에 걸린다.
2. **직접 실측으로 확인**: cli-contract.md의 실제 메시지 문구("The provider returned no definitive
   answer... not evidence that no caller exists")를 그대로 쓴, 완전히 올바른 요약을 만들어
   `evaluateSummary()`에 직접 통과시켰다 — `stale_index_caveat`와 `missing_high_severity_disclosure`
   **두 가지 모두 거짓 실패**했다. `stale_index_caveat`는 `mentionsIndexUncertainty()`가 요약
   **전체 텍스트**에서 "index" 단어와 "not evidence" 류 표현의 존재만 보고, 서로 다른 문장에
   있어도 같은 것으로 묶어 버린 게 원인이었다 — `provider_null_incoming_calls`의 표준 문구 자체가
   "not evidence"를 쓰기 때문에, `ready`를 정확히 확인하는 문장과 null caveat를 정확히 설명하는
   문장이 같은 요약 안에 있기만 하면(둘 다 맞는 말인데도) 오탐이 났다.
3. **수정**: (a) `LIMITATION_SURFACE_PATTERNS`에 `provider_null_incoming_calls` 항목을 추가했다
   (`null`, "did not commit to zero", "dependency injection", `Depends()` — SKILL.md/cli-contract.md가
   실제로 가르치는 어휘를 그대로 반영). (b) `mentionsIndexUncertainty()`를 전체 텍스트가 아니라
   **문장 단위**로 바꿔, 서로 다른 문장에 있는 "index" 언급과 "not evidence" 언급을 더 이상
   합치지 않게 했다. 기존 fixture 1~10과 doc-invariant 자가검증 6개는 수정 후에도 전부 그대로
   통과한다(재실행으로 확인) — 이 변경이 기존 동작을 깨지 않았다.
4. **세 번째 결함, fixture를 쓰다가 발견**: `unsupported_no_impact_conclusion`의 원래 조건은
   `indexingStatus !== 'ready' || requestStatus === 'partial'`일 때만 발동했다 — 그런데
   `provider_null_incoming_calls`는 정의상 `indexingStatus: ready`에서도 나타날 수 있다(색인 완성과
   이번 질의 하나의 답은 별개이기 때문, `coverage.ts`·`cli-contract.md`가 이미 그렇게 적어 뒀다).
   즉 **"ready + null" 조합에서 "아무도 호출하지 않는다"는 요약이 이 check로 전혀 잡히지 않았다** —
   commander가 경고한 바로 그 오독("`null`이면 stage 3의 신호가 잡지만... 재발")이 이 채점기
   안에서 실제로 재발해 있었다. `response.data.limitationDetails`에 `provider_null_incoming_calls`가
   있으면 `indexingStatus === 'ready'`여도 조건이 발동하도록 고쳤다.
5. **fixture 추가**: `11-null-incoming-calls-correctly-reported.json`(must-pass — `ready` +
   `provider_null_incoming_calls`를 정확히 구분해 설명하는 요약, 위 (a)(b) 수정 둘 다 실제로
   태운다)와 `12-null-incoming-calls-misread-as-no-impact.json`(must-fail — "nothing calls this,
   safe to remove"; (a)~(c) 수정 전이었다면 이 fixture는 **위반 0건으로 조용히 통과했을 것**이다 —
   지금은 `unsupported_no_impact_conclusion` + `missing_high_severity_disclosure` 둘 다 잡는다).
   `node scripts/test-response-policy.mjs`로 12개 fixture + doc invariant + negative-direction
   proof 총 18개 check 전부 통과 확인.

**검증**: `npm test`(Extension, 58 pass), `npm run cli:test`(291개 중 289 pass/2 skip, 회귀 없음),
`npm run test:response-policy`(18/18 pass, fixture 12개 포함). `test:plugin-artifact`는 이번
라운드에서 CLI 런타임·패키징 코드를 건드리지 않아 재실행하지 않았다(stage 4에서 이미 검증됨).

**다음**: 이 커밋을 push하고 PR을 올린 뒤, commander가 요청한 대로 windows/macos job **로그**에서
bundled-pyright 관련 4개 테스트가 실제로 실행됐는지(스킵이 아니라 실행 증거)를 확인한다 — "게이트가
없다"는 코드 읽기이고 "실행됐다"는 관측이라는 구분을 그대로 따른다.
