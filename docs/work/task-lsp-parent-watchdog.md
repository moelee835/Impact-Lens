# 샌드박스 환경의 provider_initialize_failed — parent process watchdog 제거

## 배경과 해결할 문제

`v0.6.0` 배포 후, 전역 설치 CLI(`runner.source: global`, Node 24.19.0)를 사용하는 환경에서 다음 실패가
보고됐다.

```json
{"ok":false,"error":{"code":"provider_initialize_failed",
 "details":{"stage":"initialize","executable":"node","exitCode":1,"signal":null}}}
```

- `note list`와 `doctor bundled-typescript` preflight는 성공한다.
- `doctor bundled-typescript --smoke`와 실제 JS/TS 분석만 실패한다.
- 언어 서버는 stderr를 전혀 남기지 않고 exit code 1로 종료한다.
- 보고자는 syscall 추적으로 언어 서버가 `process.exit(_shutdownReceived ? 0 : 1)` 경로로 빠지는 것을
  확인했고, 원인을 stdin EOF로 추정했다.

이는 `IL-LIM-017`이 제거했다고 판단한 실패 유형(“initialize 전 exit 1, stderr 없음”)과 같은 증상이므로
M0의 핵심 약속을 위협한다.

## 범위

- 실제 원인 규명과 재현
- 원인 제거
- 회귀 테스트 추가
- 부모 프로세스 종료 시 언어 서버가 고아로 남지 않는지 확인

## 범위에서 제외할 항목

- 새 언어 preset, provider 설정 UX
- 언어 서버 자체(vscode-languageserver) 수정
- 샌드박스 정책 우회

## 조사 결과

### 재현 시도로 배제한 가설

| 가설 | 결과 |
| --- | --- |
| Node 24 고유 문제 | 배제. Node 24.19.0(공식 darwin-arm64 바이너리)에서 smoke 성공 |
| 전역 설치 형태의 문제 | 배제. 공개 `v0.6.0` tarball을 전역 prefix에 설치해 실행해도 성공 |
| CLI 자신의 stdin 상태 | 배제. 터미널 stdin, `/dev/null`, stdin 닫힘(`0<&-`) 모두 성공 |
| 패키지 누락·권한·Node 최소 버전 | 배제. 보고자 진단과 일치 |

### 확정된 원인

보고자가 인용한 `process.exit(_shutdownReceived ? 0 : 1)`은 stdin EOF 처리에만 있는 것이 아니다. 번들
언어 서버가 포함한 `vscode-languageserver`의 **부모 프로세스 watchdog**에도 같은 표현이 있다.

```js
const watchDog = {
  initialize: params => {
    const processId = params.processId;
    if (Is.number(processId) && exitTimer === undefined) {
      setInterval(() => {
        try { process.kill(processId, 0); }
        catch (ex) { process.exit(_shutdownReceived ? 0 : 1); }
      }, 3e3);
    }
  },
  ...
```

Impact Lens CLI는 `initialize`에 `processId: process.pid`를 보내고 있었다
(`cli/src/lspProvider.ts`). 따라서 언어 서버는 3초마다 `kill(부모PID, 0)`으로 부모 생존을 확인하고,
그 호출이 예외를 던지는 순간 **stderr 없이 exit 1**로 종료한다.

`kill(pid, 0)`은 부모가 살아 있어도 다음 환경에서 실패한다.

- 자식이 다른 PID namespace에 있는 경우(container, 일부 agent sandbox) → `ESRCH`
- seccomp/sandbox가 `kill` syscall을 차단하는 경우 → `EPERM`
- 프로세스 소유자가 달라 신호 권한이 없는 경우 → `EPERM`

이는 관측된 모든 증상과 일치한다. exit 1 / signal null / stderr 없음, 언어 서버를 쓰지 않는
`note list`와 preflight는 정상, stdin 상태와 무관, 일반 shell에서는 재현되지 않음.

### 실증

`processId`만 바꿔 실제 번들 언어 서버를 직접 구동했다.

| initialize의 processId | 결과 |
| --- | --- |
| 존재하지 않는 PID(프로브 실패 모사) | `initialize` 응답 후 `code=1 signal=null stderr=""`로 종료 |
| `null` | 10초 후에도 정상 동작 유지 |

### watchdog 제거의 안전성

watchdog을 없애면 부모가 비정상 종료했을 때 언어 서버가 남을 수 있는지 확인해야 한다. Impact Lens는
`stdio: ['pipe','pipe','pipe']`로 자식을 띄우므로 부모가 죽으면 stdin pipe가 닫히고, 언어 서버의
`inputStream.on('end')` 경로가 그때 동작한다. 부모를 `SIGKILL`한 실험에서 언어 서버가 즉시 종료되고 고아
프로세스가 남지 않는 것을 확인했다. `dispose()`의 명시적 `kill()`도 그대로 유지된다.

## 구현

- `cli/src/lspProvider.ts`의 initialize 파라미터를 `processId: null`로 바꾸고, 이유를 코드 주석으로 남겼다.
  LSP 사양상 `processId`는 `integer | null`이며 `null`은 부모 감시를 요청하지 않는다는 뜻이다.
- 회귀 테스트 fixture `cli/src/test/fixtures/parentWatchdogServer.ts`를 추가했다. 이 fixture는 실제
  watchdog과 같은 방식으로, `processId`가 숫자면 stderr 없이 exit 1로 종료한다.
- `cli/src/test/contract.test.ts`에 해당 fixture로 분석을 수행하는 테스트를 추가했다. initialize와
  capability 협상이 끝난 뒤에야 도달할 수 있는 `target_not_found`가 나오면 통과다.

## 테스트 및 완료 기준

- [x] 보고된 실패의 원인이 재현 가능한 형태로 규명된다.
- [x] `processId`가 숫자일 때 exit 1로 죽는 fixture에서 분석이 성공한다.
- [x] 실제 번들 언어 서버로 doctor smoke와 TS 분석이 성공한다.
- [x] 부모 프로세스를 `SIGKILL`해도 언어 서버가 고아로 남지 않는다.
- [x] `npm run test:all`과 `npm run test:plugin-artifact`가 통과한다.
- [x] 3-OS matrix가 통과하고 병합된다.
- [x] 수정이 공개 release로 사용자에게 도달한다.

## 작업 로그

### 2026-08-26 — 원인 규명과 수정

- 변경 파일: `cli/src/lspProvider.ts`, `cli/src/test/fixtures/parentWatchdogServer.ts` (신규),
  `cli/src/test/contract.test.ts`, `docs/work/task-lsp-parent-watchdog.md` (신규)
- 보고된 stdin EOF 가설은 증상 설명으로는 맞지만 원인 지목이 어긋나 있었다. 같은 exit 표현이 부모 감시
  watchdog에도 있고, 그쪽이 관측된 조건(stdin을 열어 두어도 실패, 3초 내외 종료, 샌드박스 한정)을 모두
  설명한다.
- Node 24.19.0 공식 바이너리, 공개 `v0.6.0` tarball 전역 설치, stdin 3가지 상태로 재현을 시도해 환경 축을
  하나씩 배제한 뒤 코드 경로에서 원인을 찾았다.
- fixture 초기 버전이 `shutdown`에 응답하지 않아 dispose가 timeout까지 30초를 기다렸다. fixture가
  `shutdown`/`exit`를 처리하도록 고쳐 143ms로 줄였다. 실제 서버는 shutdown에 응답하므로 제품 동작 문제는
  아니지만, 응답하지 않는 서버에서 종료가 지연되는 점은 후속 검토 대상으로 남긴다.
- 검증: Extension 34/34, CLI 45/45, packed Plugin E2E 통과. 실제 번들 언어 서버 smoke `ready`, TS 분석에서
  direct caller `run`과 transitive `main` 확인.

### 2026-08-26 — v0.6.1 release 준비

- 사용자 결정에 따라 이 수정을 `v0.6.1`로 발행한다. plugin runner의 fallback이 `v0.6.0` tarball에
  고정돼 있어 병합만으로는 전역 CLI와 release-fallback 사용자에게 도달하지 않기 때문이다.
- version 소유 위치(`package.json`, `cli/package.json`, runner pin, contract test, skill 계약 예시,
  `README.md`, `INSTALL.md`, `docs/DEVELOPMENT.md`)를 `0.6.1`로 맞추고 `CHANGELOG.md`의 `Unreleased`를
  `0.6.1` 절로 확정했다. Plugin payload manifest는 `0.2.2`다.
- M0 사용자 테스트 명세의 기준 release candidate도 `v0.6.1` / payload `0.2.2`로 갱신했다. 명세가 가리키는
  오류 문구 계층이 이번 수정으로 바뀌지는 않지만, 참여자가 설치할 대상이 달라지기 때문이다.
- 재검증: Extension 34/34, CLI 45/45, packed Plugin E2E 통과.

### 2026-08-26 — 병합과 v0.6.1 발행, 실제 검증

- [PR #20](https://github.com/moelee835/Impact-Lens/pull/20)이 Ubuntu 38초, macOS 36초, Windows 1분 21초로
  3-OS gate를 통과한 뒤 merge commit `0866aff`로 병합됐다.
- 같은 commit에 `v0.6.1` tag와 non-draft, non-prerelease release를 발행했다. 공개 asset digest는 local
  checksum과 일치한다.
  - `impact-lens-0.6.1.vsix` `084800be393b2e352385ea8ed9dae60a76b8b3b7b2e1ce7facad1773dc3c7dbf`
  - `impact-lens-cli-0.6.1.tgz` `19ec4497d32f0532d080831bcb8284c20d227087452769e60022acb24ce5ea11`
- VSIX는 28 files이고 `.claude`, `.github`, `scripts/`, `cli/`, `plugins/` 항목이 없다. CLI tarball은
  15 entries다.
- Codex와 Claude Code Plugin을 `0.2.2`로 갱신한 뒤 override 없이 두 cache runner에서 확인했다.
  doctor smoke `ready`, TypeScript 분석 성공, `runtime.cli.version` `0.6.1`,
  `runtime.runner.source` `release-fallback`.
- 이 세션에서는 보고자의 sandbox/container를 재현할 수 없어 `kill(pid, 0)` 프로브 실패를 모사한 fixture와
  실제 언어 서버 실증으로 검증했다.

### 2026-08-26 — 보고 환경에서 수정 확인

- 원래 실패하던 Linux 환경(Node 24.19.0)에서 전역 CLI를 `0.6.1`로 올린 뒤 같은 명령을 다시 실행해
  `doctor bundled-typescript --smoke`가 통과했다. `runner.source`는 `direct`이고 4개 check가 모두 `pass`,
  `initialize-capability-smoke`도 `pass`다.
- 이 결과는 우연한 회피가 아니다. watchdog은 3초 간격으로 프로브하므로 같은 환경에서 이전에 smoke가
  실패했다는 사실 자체가 초기화가 3초를 넘겼다는 뜻이다. 따라서 통과는 watchdog이 제거된 결과로 해석된다.
- 이로써 원인 규명이 실제 실패 환경에서 확인됐다. 남은 것은 원 보고의 사용자 시나리오(JavaScript 함수
  `formatDateOnly` 영향도 분석)를 같은 환경에서 재실행해 사용자 관점 결과까지 닫는 일이다.
