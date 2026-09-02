# M2 — gopls verified-external preset

- 상태: 1단계·2단계 완료 — **통과.** `cli/src/providers/catalog.ts`에 `gopls` preset이 shipped catalog에
  들어갔고, `npm run test:all` 전체가 통과한다. 3단계(CI에 gopls 설치)와 4단계(사용자 문서 갱신, M1 gate 3
  재검토)는 이 PR 범위 밖 — 이 PR merge 후 별도로 진행한다.
- branch: `feat/m2-gopls-preset`
- 상위 문서: [M2 요구사항](/private/tmp/claude-503/-Users-woony6-dev-Impact-Lens/a1b3df98-1132-476d-abd0-e925cedac750/scratchpad/m2-gopls-plan.md)
  (계획 세션이 작성, 저장소 밖 scratchpad — 이 문서에 핵심 판단 근거를 옮겨 적는다)
- 기준 `main`: `58d6f09`(v0.7.0 발행 완료)

## 목적과 사용자 가치

v0.7.0을 설치한 Go 개발자는 함수 영향도를 보려면 `provider.command`/`args`를 직접 써야 한다. shipped
catalog에 `bundled-typescript` 하나뿐이라 Go 파일은 `provider_required_for_language`로 끝난다. M1이 만든
Auto 선택 계층은 동작하지만 고를 대상이 없다.

이 lane이 끝나면 `gopls`만 설치돼 있는 Go 개발자가 아무 설정 없이 분석을 시작한다. 없으면 doctor가 설치
방법을 알려준다. 이건 Go 지원 자체보다 두 가지가 더 크다: (a) M1이 만든 5단계 선택 우선순위 중 4번째
tier(`verified-external`)를 shipped preset이 실제 제품에서 처음 밟는다. (b) `readiness`를 선언한 preset이
catalog에 처음 들어가, W2-A(PR #46)가 구현했지만 아무도 켜지 못했던 `coverage.indexing.status`의
`working`/`ready`가 처음으로 실사용자에게 도달 가능해진다.

## 배경과 해결할 문제

M2는 Python·Go·C/C++를 묶지만 세 개를 동시에 시작하지 않는다. `cli/src/providers/catalog.ts`가 이미
"gopls is the first external candidate"라고 주석에 적어 뒀고, Python은 Pylance 라이선스 문제로 대체
후보의 Call Hierarchy 지원 여부부터 확인해야 하는 **조사** 문제이며, clangd는
`compile_commands.json`의 유무·경로·staleness를 구분해야 해 readiness 표면이 훨씬 크다. gopls가 가장
깨끗하다: 단일 바이너리, `go install`, BSD-3, `go.mod`라는 명확한 project file, 색인 중
work-done-progress를 실제로 보낸다.

## 범위와 범위에서 제외할 항목

**이번 단계(1단계) 포함**: gopls 기준선을 실제로 실행해 조사만 한다. 코드 변경 없음.

**제외(2단계 이후)**: catalog preset 추가, fixture 작성, doctor 통합, CI 설치, 문서 갱신, M1 gate 3
재검토 — 전부 1단계 승인 후.

## 1단계 조사 결과 — 실제 실행 근거

이 machine 기준: Go 1.26.1(darwin/arm64) 있음, gopls 없음(투자 시작 시점). 아래 전부 직접 설치·실행한
결과이며, 문서만 읽고 적지 않았다.

### (1) Call Hierarchy 지원 — 통과, 이게 gate였다

`go install golang.org/x/tools/gopls@latest` → v0.23.0 설치. 실제 Go module fixture(`go.mod` +
`target.go`/`caller.go`, `FixtureCaller`가 `FixtureTarget`을 호출)를 만들고, Node.js로 직접 작성한 LSP
클라이언트(`lsp-probe.mjs`, 이 작업 문서와 함께 branch에 보존하지 않고 scratchpad에만 둠 — 산출물이
아니라 조사 도구)로 `gopls -mode=stdio`와 raw JSON-RPC를 주고받았다.

- `initialize` 응답: `"callHierarchyProvider": true`.
- `textDocument/prepareCallHierarchy`(target.go:3:6, `FixtureTarget` 선언): `FixtureTarget` 심볼을
  정확히 반환.
- `callHierarchy/incomingCalls`: `FixtureCaller`를 `from`으로, `fromRanges`에 실제 호출 지점(caller.go:4:9)을
  정확히 반환.

**결론: gopls는 Call Hierarchy를 완전히 지원한다.** 나머지 조사를 진행할 근거가 확인됐다.

### (2) 버전 정책 — 검증된 하한만 적는다

- **테스트한 버전**: v0.23.0(`@latest`, 이 조사 시점), v0.19.1(2025년 릴리스). **둘 다 위 (1)의 전체
  결과가 동일**했다 — capability, prepareCallHierarchy, incomingCalls, readiness 신호 모양 전부 일치.
- v0.16.2는 이 machine의 Go 1.26.1 toolchain으로 **source build 자체가 실패**했다
  (`internal/tokeninternal: invalid array length -delta * delta`) — gopls의 LSP 동작 문제가 아니라, 오래된
  gopls 소스가 훨씬 새로운 Go 컴파일러의 더 엄격해진 상수 검사와 맞지 않아 생기는 toolchain 호환성
  문제다. `go install pkg@version`은 로컬 Go toolchain으로 컴파일하므로, 오래된 gopls를 오래된 것 그대로
  쓰려면 그에 맞는 Go toolchain이 함께 필요하다 — **이건 CI 설치 전략에 직접 영향을 준다(아래 (3) 참고)**.
- **검증된 하한: v0.19.1.** 그보다 낮은 버전은 이 조사에서 테스트하지 못했으므로 하한을 더 낮게 적지
  않는다. `ProviderVersionRange.minimum`은 `"0.19.1"`로 시작하고, 필요하면 후속 조사로 낮춘다.
- **version probe args — 반드시 `['version']`만 쓴다, `-json`을 쓰지 않는다.** `gopls version`(plain)
  출력은 `"golang.org/x/tools/gopls v0.19.1"` 한 줄이라 `parseVersion()`의 정규식
  (`(?<![\d.])(\d+(?:\.\d+){1,3})(?![\d.])`)이 `0.19.1`을 정확히 뽑는다. **`gopls version -json`은 쓰면
  안 된다** — JSON 출력 맨 앞에 `"GoVersion": "go1.26.1"`이 나오는데, `parseVersion()`은 문자열에서 첫
  번째로 매치되는 dotted number를 그대로 쓰므로 **gopls 버전이 아니라 Go 컴파일러 버전(`1.26.1`)을
  gopls 버전으로 잘못 파싱한다.** 실제로 두 출력을 나란히 실행해 이 차이를 확인했다. 이 발견이 없었으면
  2단계에서 조용히 틀린 버전 판정이 들어갈 뻔했다.
- exit code: `gopls version`은 0.

### (3) 라이선스와 배포 — 통과

- `go.mod`/`go env GOPATH`의 module cache에서 `LICENSE` 직접 확인: BSD-3-Clause("Copyright 2009 The Go
  Authors... Redistribution and use in source and binary forms")다. Go 프로젝트 표준 라이선스이고
  Impact Lens의 기존 배포 방식(GitHub Release, npm 미배포)과 충돌 없음.
- `go install golang.org/x/tools/gopls@<version>`이 **이 machine(darwin/arm64)에서는** v0.19.1·v0.23.0
  둘 다 성공했다. **linux/windows CI runner에서는 이번 조사에서 검증하지 못했다** — 3단계 CI 작업에서
  실제로 확인해야 한다. 참고 신호: 빌드 설정에 `CGO_ENABLED: 1`이 찍혔는데(`gopls version -json`의
  `Settings`), 이게 필수 조건인지 최적화 옵션인지는 이번 조사로 확인하지 않았다. GitHub Actions의
  `ubuntu-latest`/`windows-latest`는 기본 C 컴파일러가 있어 위험이 낮다고 판단하지만, **가정이지 검증이
  아니다** — 3단계에서 실제로 확인한다.

### (4) readiness 신호의 실제 모양 — 통과, 정확한 값 확보

fixture workspace(`go.mod` 있음)를 열었을 때 gopls가 실제로 보낸 순서:

1. `window/workDoneProgress/create`(server→client request, token 발급) — M1의 W1-A(PR #39)가 이미
   처리하는 표준 handler.
2. `$/progress` `{"kind":"begin","title":"Setting up workspace","message":"Loading packages..."}`
3. (내부적으로 `go/packages.Load` 완료)
4. `$/progress` `{"kind":"end","message":"Finished loading packages."}`

`cli/src/providers/preset.ts`의 `ReadinessSignal`(`kind: 'work-done-progress'`)과
`cli/src/providers/readiness.ts`의 `ReadinessTracker.noteProgress()`를 직접 읽어 매칭 규칙을 확인했다:
`begin`의 `title`을 token별로 기억해 뒀다가, 같은 token의 `end`가 오면 그 기억된 title이
`titlePattern`을 포함하는지 검사한다. 즉 올바른 선언은:

```
{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Setting up workspace' }
```

**두 버전(v0.19.1, v0.23.0) 모두 정확히 같은 title/message 문자열**을 냈다 — 우연이 아니라 gopls가
"Setting up workspace"를 안정적인 UI 문자열로 오래 유지해 온 것으로 보인다(다른 LSP 클라이언트들도 이
문자열에 의존하는 것으로 알려져 있다). 그래도 이건 서버가 선택한 문자열이므로 **버전이 바뀌면 달라질
수 있다는 전제로 doctor `--smoke`에서 매 릴리스마다 재확인해야 한다**(2단계 fixture 설계에 반영할 점).

### (5) `requiredProjectFiles`(`go.mod` 부재) — 통과, 단 계획 문서의 가정과 다르다

**계획 문서는 "go.mod가 없으면 gopls가 어떻게 실패하는가"를 물었는데, 실제로는 실패하지 않는다.** `go.mod`
없는 디렉터리에 같은 두 파일(`target.go`/`caller.go`)만 두고 열었더니:

- `window/logMessage`: `view_type="AdHoc"`(정상 모듈이면 `view_type="GoMod"`) — gopls는 조용히 "ad-hoc"
  모드로 전환한다, 에러를 내지 않는다.
- `prepareCallHierarchy`/`incomingCalls`는 **이 트리비얼한 같은-디렉터리-두-파일 경우엔 여전히 성공**했다
  (`FixtureCaller`를 정확히 찾음). 다만 `detail` 필드가 `fixture • target.go`(module 이름)가 아니라
  `_/private/tmp/.../gopls-no-gomod • target.go`(synthetic import path)로 나와, 진짜 module로 인식되지
  않았다는 게 드러난다.
- **결론**: `go.mod` 부재는 gopls를 실패시키지 않고 **조용히 저하된 모드로 전환**시킨다. AdHoc 모드는
  외부 의존성 해석이나 여러 패키지 간 참조를 신뢰성 있게 못 할 가능성이 높다(이번엔 단일 디렉터리
  트리비얼 케이스라 우연히 통과했을 뿐, 여러 패키지·의존성이 있는 실제 프로젝트에서는 검증하지 않았다).
  **`requiredProjectFiles: ['go.mod']`를 그대로 유지하는 게 맞다** — gopls 자체가 에러를 안 내더라도,
  "AdHoc 모드에서 나온 결과는 완전하지 않을 수 있다"는 것이 이 CLI가 게이트를 걸어야 할 이유다. 다만
  `provider_project_metadata_missing`이 표현하는 문구("이 provider가 필요로 하는 project 파일이
  없다")를 "gopls가 실패한다"가 아니라 **"gopls가 신뢰할 수 있는 결과를 낸다고 보장할 수 없는 모드로
  전환한다"**로 정확히 써야 한다 — 계획 문서가 암묵적으로 가정한 "실패"라는 틀은 사실과 다르다.

**2단계 review에서 추가로 확인된 것 (reviewer 세션이 제기, 이 lane이 검증하지 않고 그대로 기록):**
readiness의 `work-done-progress`("Setting up workspace" → 종료) 신호는 `go.mod`가 있든 없든 동일하게
발생한다 — 즉 **readiness만으로는 module view와 AdHoc view를 구분할 수 없다.** 둘 다 결국 `ready`가
된다. 이건 `requiredProjectFiles`가 readiness가 못 하는 일을 하고 있고 서로 대체할 수 없다는 뜻이다.
`readiness`가 있으니 `requiredProjectFiles`가 중복이라며 나중에 지우면 **AdHoc 결과가 `ready` 딱지를
달고 통과하게 된다.** 이 사실은 `catalog.ts`의 `requiredProjectFiles` 주석에 반영했다.

## 판정

**1단계 통과.** (1)이 확인돼 나머지 조사를 계속할 근거가 있었고, (2)~(5) 전부 실행 근거를 확보했다.
유일하게 계획과 다르게 나온 지점은 (5)(go.mod 부재가 실패가 아니라 저하)이며, 이는 gate를 흔들지 않고
2단계 구현의 세부(에러 메시지 문구, doctor 진단 문구)에 반영할 사항이다.

**2단계는 계획 세션의 승인을 받고 착수했다.** 아래는 실제로 구현되고 검증된 결과다.

## 2단계 — preset 구현 결과

`cli/src/providers/catalog.ts`에 `gopls` preset을 추가했다(`GOPLS_PRESET_ID`로 id export).

- `tier: 'verified-external'`, `command.candidates: ['gopls']`, `args: ['-mode=stdio']`(PATH 탐색, shell
  미사용 — `discovery.ts`의 기존 실행 경로 그대로 재사용).
- `version.args: ['version']`(`-json` 금지 — 아래 versionProbe.test.ts가 이유를 실행으로 고정한다),
  `supported.minimum: '0.19.1'`.
- `readiness.signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Setting up workspace' }]`,
  `requiredProjectFiles: ['go.mod']`, `onBudgetExceeded: 'proceed-partial'`(budgetMs 10000 — 실측
  프로덕션 상한이 아니라 판단값이라고 주석에 명시).
- fixture: 1단계 조사에 쓴 `go.mod`+`target.go`+`caller.go` 2-파일 구조를 `ProviderFixture` 형식으로
  재구성(`FixtureCaller`→`FixtureTarget` 관계 그대로 유지).
- `docs.limitations`: 정적 Call Hierarchy의 보편적 한계(reflection, `go:generate` 산출물 미생성 시)와
  `go.mod` 부재 시 AdHoc 저하. **interface 디스패치 결과는 1단계 결정 사항 문서가 "아직 관측하지 않았다"고
  적어 2단계에서 별도로 실행해 확인했다** — 아래 "2단계 중 새로 확인한 것" 참고.
- `lastVerified`: `{ date: '2026-09-01', versions: ['0.19.1', '0.23.0'] }`, darwin/arm64 한정이라고
  주석에 명시(linux/windows는 3단계 CI에서 확인 전까지 주장하지 않는다).

### 2단계 중 새로 확인한 것 — interface 디스패치 (1단계가 미룬 항목)

1단계 결정 사항 문서는 "interface 디스패치는 아직 관측하지 않았으니 2단계에서 별도로 테스트 후 적는다"고
명시했다. 이번 커밋에 포함된 코드 주석 초안이 이걸 건너뛰고 "stage 1이 검증했다"고 잘못 적어 놨던 것을
작업 문서와 대조해 발견하고, `~/go/bin/gopls`(1단계가 설치한 바이너리, 새로 설치하지 않음)로 직접
실행해 검증했다:

```go
type Doer interface { Do(value int) int }
type ConcreteDoer struct{}
func (c ConcreteDoer) Do(value int) int { return value + 1 }
func CallThroughInterface(d Doer, value int) int { return d.Do(value) }
```

`ConcreteDoer.Do`의 선언 위치에서 `prepareCallHierarchy` → `incomingCalls`를 호출한 결과,
`CallThroughInterface`의 `d.Do(value)` 호출이 정확히 incoming call로 반환됐다. **결론 자체(interface
파라미터를 통한 호출이 구체 구현으로 정확히 연결된다)는 맞았지만, 주석의 "stage 1이 검증했다"는 귀속이
틀렸다** — 실제로는 stage 2 연속 세션이 검증했다. 코드 주석을 "stage 2에서 직접 검증" 문구로 정정했다.
검증되지 않은 주장을 검증된 것처럼 적어두면 다음 사람이 그대로 믿는다는 것이 이 저장소가 반복해서
경계해 온 실패 모드이므로, 결과가 우연히 맞았더라도 귀속 오류는 정정해야 한다고 판단했다.

### 2단계 test 정합성 — 실패한 2건을 "통과시키려고" 고치지 않은 이유

`npm run cli:test`가 264/266으로 실패한 상태에서 이어받았다. 둘 다 "catalog엔 `bundled-typescript` 하나
뿐"이라는 가정을 못박은 guard였다:

- `providers.test.ts`의 "the shipped catalog only claims languages that have been verified" — 이 test
  이름 자체가 "검증된 언어만 주장한다"는 것이고, 1단계가 그 검증(Call Hierarchy 실제 왕복, 버전 하한
  실측)을 만들었으므로 `gopls`를 `deepEqual` 목록에 추가하는 것이 정당하다. **이 test를 gopls 없이
  그대로 두는 것이 아니라, "gopls는 이제 이 검증을 통과했다"는 사실을 반영한 것.**
- `doctor.test.ts`의 "the doctor subcommand accepts any preset name and rejects a missing one" —
  이 test는 `'gopls'`를 "catalog에 없는 preset 이름"의 자리표시자로 썼던 것이다. gopls가 진짜 preset이
  된 지금 그 자리에 `'no-such-preset'`(이미 `providers.test.ts`가 쓰는 관례적 문자열)을 넣어 "존재하지
  않는 preset은 거부된다"는 원래 의도를 유지했다.

### 새로 발견한 문서 정합성 문제 — `stateReachability.integration.test.ts`

다른 세션(reviewer 역할)이 2단계 진행 중 알려온 내용을 확인해 같은 커밋에 반영했다: 이 test 파일의
주석과 test 제목 일부가 "readiness는 test 전용 API로만 도달 가능하고 실사용자는 도달 못 한다"고
적어 놨는데, `gopls`가 shipped catalog에 readiness를 선언하며 들어가는 순간 이게 거짓이 된다 — 실사용자가
`gopls`만 설치돼 있으면 `resolution.catalog` 같은 test 전용 옵션 없이 `ready`/`working`에 도달한다.
CI에 `gopls`가 없어 test 자체는 계속 mock 경로로 통과하므로 **주석만 조용히 썩고 test는 초록으로
남는** 실패 모드였다. 원문을 지우지 않고 2026-09-02 날짜의 정정 주석을 덧붙였다 — "상태 자체는 이제
실사용자가 도달 가능하지만, 이 test가 그 상태를 만드는 경로는 여전히(그리고 의도적으로) mock이다. CI가
gopls를 설치하지 않으므로(3단계 범위) 이 저장소의 어떤 자동 test도 아직 실제 gopls로 이 상태 도달을
독립 관측하지 않았다"는 구분을 명시했다. `assertReachableSetMatches`가 검증하는 실제 tuple 집합은
바뀌지 않았다 — 문서 정확성 문제였지 로직 문제가 아니었다.

### 신규 test — `versionProbe.test.ts`

catalog.ts 주석이 "versionProbe.test.ts guards this specific misparse"라고 참조하는데 파일이 없었다.
`~/go/bin/gopls version -json`과 `gopls version`을 실제로 실행해 캡처한 출력(2026-09-02,
darwin/arm64, v0.23.0)을 fixture로 고정해 다음을 검증한다:
- `-json` 출력을 `parseVersion()`에 넣으면 `GoVersion`의 `"go1.26.1"`이 gopls 버전(`"0.23.0"`이어야
  할 값)으로 잘못 파싱된다는 것을 실행으로 증명(위험이 실재함을 보여줌).
- plain 출력은 올바르게 `0.23.0`을 반환한다는 것.
- `probeVersion()`(실제 spawn 경로)로도 같은 결과가 재현된다는 것.
- 실제 shipped `gopls` preset의 `version.args`가 정확히 `['version']`이고 `-json`을 포함하지 않는다는
  정적 guard.

## 테스트 및 완료 기준 (1단계)

- [x] Call Hierarchy 실제 지원 확인(`initialize` capability + 실제 prepareCallHierarchy/incomingCalls 왕복).
- [x] 버전 정책: 테스트한 두 버전 모두 동일 동작, 하한은 테스트한 값만 기록, probe args의 함정(`-json`)
  발견.
- [x] 라이선스 확인(BSD-3). 3-OS 설치는 darwin만 확인, linux/windows는 3단계로 이월.
- [x] readiness 신호의 실제 관측값 확보, `ReadinessTracker` 매칭 규칙과 대조해 올바른 선언 형태 확정.
- [x] `go.mod` 부재 시 실제 동작 확인 — 계획의 "실패" 가정이 틀렸음을 실행으로 확인하고 정정.

## 테스트 및 완료 기준 (2단계)

- [x] `cli/src/providers/catalog.ts`에 `gopls` preset 추가, `npm run cli:build` 통과.
- [x] `npm run cli:test` 270/270 통과(신규 `versionProbe.test.ts` 4건 포함, 기존 실패 2건은 원래 의도에
  맞게 수정).
- [x] `npm run test:all` 전체 통과 — `test:response-policy`(16 checks)와 `test:plugin-artifact`(TypeScript
  fixture가 여전히 `selectedBy: 'bundled'`) 포함, gopls 추가로 인한 선택 로직 회귀 없음을 확인.
- [x] interface 디스패치를 2단계에서 직접 실행해 검증하고, 잘못된 귀속("stage 1이 검증")을 정정.
- [x] `stateReachability.integration.test.ts`의 "test-only, 실사용자 도달 불가" 서술을 gopls 도입 이후의
  사실로 정정(원문 유지, 정정 주석 추가).
- [ ] 3단계(CI에 Go/gopls 설치, 3-OS 검증) — 범위 밖, 이 PR 이후.
- [ ] 4단계(README/cli-contract.md/user-test-spec 등 "하나뿐"/"도달 불가" 서술 갱신, M1 gate 3 재검토) —
  범위 밖, 3단계 이후.

## 작업 로그

### 2026-09-01 — 1단계 조사

- `go install golang.org/x/tools/gopls@latest`(v0.23.0), 이후 `@v0.19.1`, `@v0.16.2`(빌드 실패) 순으로
  설치해 비교했다.
- 최소 Go module fixture(`go.mod`+`target.go`+`caller.go`)와 `go.mod` 없는 대조군을 각각 만들었다.
- Node.js로 직접 LSP client(`lsp-probe.mjs`)를 작성해 `gopls -mode=stdio`와 raw stdio JSON-RPC로
  통신했다 — CLI에 아직 gopls preset이 없어 기존 CLI 진입점을 쓸 수 없었기 때문에, capability와 실제
  Call Hierarchy 왕복을 프로토콜 수준에서 직접 확인하는 방법을 택했다. server→client
  `window/workDoneProgress/create` 요청에 응답하는 최소 handler도 포함시켰다(안 하면 gopls가 그 자리에서
  막힐 수 있어서).
- `cli/src/providers/preset.ts`(`ReadinessSignal`, `ProviderVersionProbe`)와
  `cli/src/providers/readiness.ts`(`ReadinessTracker.noteProgress`), `cli/src/providers/discovery.ts`
  (`parseVersion`, PATH 탐색)를 직접 읽어 관측값을 기존 계약의 정확한 형태로 번역했다.
- **가장 중요한 발견 두 가지**: (a) `gopls version -json`을 쓰면 출력 앞부분의 `GoVersion` 필드 때문에
  `parseVersion()`이 Go 컴파일러 버전을 gopls 버전으로 잘못 읽는다 — plain `gopls version`만 안전하다.
  (b) `go.mod` 부재는 gopls를 실패시키지 않고 AdHoc 모드로 조용히 저하시킨다 — 계획 문서의 "실패" 가정과
  다르다.
- 이 조사에 쓴 fixture와 `lsp-probe.mjs`는 scratchpad에만 있고 이 branch에 commit하지 않았다 — 조사
  도구이지 2단계 산출물이 아니다. 2단계에서 fixture는 catalog preset의 `ProviderFixture` 형식으로
  다시 만든다.
