# Provider 실패 진단 정보 보강

## 배경과 해결할 문제

`v0.6.1`의 parent watchdog 수정 이후에도, 같은 환경에서 `provider_initialize_failed`
(`stage: initialize`, `exitCode: 1`, stderr 없음)가 다시 보고됐다. 같은 환경·같은 version에서 직전에는
`doctor bundled-typescript --smoke`가 통과했으므로 두 관측이 상충한다.

이때 현재 진단으로 좁힐 수 있는 것이 거의 없다는 점이 드러났다. 실패 응답은 다음까지만 알려준다.

```json
{"stage":"initialize","executable":"node","exitCode":1,"signal":null}
```

- 언어 서버가 프로토콜을 한 번이라도 말했는지(= 실행 환경 문제인지, 실행 후 동작 문제인지) 알 수 없다.
- 얼마나 살아 있었는지 알 수 없어, 즉시 죽었는지 초기화 도중 죽었는지 구분되지 않는다.
- 언어 서버가 stderr를 내지 않으면 그 이유를 물어볼 방법이 없다.

M0의 약속은 "실패하면 빈 graph가 아니라 단계와 해결 가능한 진단을 제공한다"이다. 지금 상태는 사용자가
syscall 추적까지 해야 원인에 접근할 수 있으므로 그 약속에 못 미친다.

## 범위

- 실패 envelope에 언어 서버의 활동량과 생존 시간을 추가한다.
- 침묵하는 언어 서버를 말하게 만드는 opt-in을 제공한다.
- Impact Lens를 거치지 않고 번들 서버만 확인하는 probe를 제공한다.
- 상충하는 관측을 만들지 않는 환경 초기화·구성 가이드를 작성한다.
- 회귀 테스트와 문서를 갱신한다.

## 범위에서 제외할 항목

- 상충하는 두 관측의 원인 규명 자체 (이 작업은 규명을 가능하게 만드는 도구다)
- 언어 서버 자체 수정, 재시도나 자동 우회
- 새 언어 preset

## 구현

### 실패 envelope에 추가한 field

| field | 뜻 | 해석 |
| --- | --- | --- |
| `msSinceSpawn` | 자식 생성부터 실패 확정까지 경과 시간 | 즉시 죽음과 초기화 중 죽음을 구분한다 |
| `bytesFromServer` | 언어 서버가 stdout으로 보낸 총 byte | `0`이면 프로토콜을 한 번도 말하지 못한 것이다 |
| `requestsSent` | 클라이언트가 보낸 요청 수 | 요청 자체가 나갔는지 확인한다 |

`bytesFromServer`가 `0`이고 stderr도 없으면 실행 환경(권한, 샌드박스, 인터프리터) 쪽이고,
응답을 보낸 뒤 죽었다면 서버가 응답 이후에 한 일 쪽이다. 두 경우의 후속 조치가 다르다.

stderr가 없을 때 field를 생략하는 기존 계약은 유지했다. 빈 문자열이나 `"none"` 같은 값을 만들어내면
`IL-LIM-017`에서 확정한 "없다는 사실을 값으로 위조하지 않는다" 원칙이 깨진다.

### 언어 서버 로그 opt-in

`IMPACT_LENS_PROVIDER_LOG_LEVEL`이 `1`~`4`이면 번들 provider에 `--log-level <n>`을 전달한다. 그 출력은
기존 stderr 캡처 경로를 그대로 타므로 redaction과 4000자 제한이 적용되고, 실패 시 `error.details.stderr`로
드러난다. 값이 허용 범위를 벗어나면 무시한다. 임의 문자열을 그대로 argv에 넣지 않기 위해 정규식으로
제한했고, 이를 테스트로 고정했다.

## 테스트 및 완료 기준

- [x] 침묵 종료 fixture에서 `bytesFromServer: 0`, `requestsSent: 1`, 숫자 `msSinceSpawn`이 나온다.
- [x] stderr가 없을 때 field가 생략되는 기존 계약이 유지된다.
- [x] 허용 값에서만 `--log-level`이 붙고, `0`/`5`/문자열/공백 포함 값은 무시된다.
- [x] 실제 번들 서버에서 opt-in을 켜도 stdout은 단일 JSON 한 줄을 유지한다.
- [x] `npm run test:all`이 통과한다.
- [ ] 3-OS matrix가 통과하고 병합된다.

## 작업 로그

### 2026-08-26 — 진단 field와 로그 opt-in 추가

- 변경 파일: `cli/src/jsonRpc.ts`, `cli/src/runtime.ts`, `cli/src/test/contract.test.ts`,
  `cli/src/test/runtime.test.ts`
- 처음에는 stderr가 없을 때 `stderr: 'none'`을 넣으려 했으나, 기존 테스트와 `IL-LIM-017`의 명시적 결정과
  충돌해 되돌렸다. 없음은 계속 생략으로 표현한다.
- 로그 opt-in 값 검증을 정규식 `^[1-4]$`로 좁혔다. 이 값은 argv로 들어가므로 자유 문자열을 허용하면
  provider 실행 인자를 외부에서 조작할 수 있다.
- 검증: CLI 46/46 통과. 실제 번들 서버에서 opt-in을 켠 smoke도 stdout 단일 JSON을 유지했다.

### 2026-08-26 — 환경 오염 대응: probe와 초기화 가이드

- 변경 파일: `scripts/probe-bundled-provider.mjs` (신규),
  `docs/development-management/user-tests/m0-environment-setup.md` (신규), `INSTALL.md`,
  `docs/development-management/user-tests/m0-user-test-spec.md`
- 상충하는 두 관측(같은 환경·같은 version에서 smoke 성공과 실패)의 가장 유력한 설명은 실행 경로 오염이다.
  runner는 `IMPACT_LENS_CLI_PATH` → checkout → 전역 → release fallback 순으로 CLI를 고르고, 마지막 경로는
  `npm exec`의 package cache에 버전별로 쌓인다. 개발 machine 한 대에서 `~/.npm/_npx` 아래 `0.4.0`, `0.5.0`,
  `0.6.0`, `0.6.1` 네 버전이 동시에 발견됐다. 사용자 shell에서는 전역 `0.6.1`이, agent 세션에서는 `PATH`
  차이로 release fallback의 구버전이 선택되면 정확히 관측된 모순이 만들어진다.
- 그래서 가이드의 핵심 규칙을 "실패 보고에 `runtime.cli.version`과 `runtime.runner.source`가 없으면 원인을
  확정할 수 없다"와 "시나리오 하나만 설치한다"로 잡았다. 전역 CLI와 Plugin을 동시에 설치하면 runner
  우선순위 때문에 무엇을 검증했는지 모호해진다.
- probe는 저장소 checkout, PATH의 전역 `impact-lens`, 전역 node_modules 순으로 서버를 찾고
  `IMPACT_LENS_LSP_ENTRY`로 직접 지정할 수 있다. checkout과 전역 설치 두 형태에서 동작을 확인했다.
- 초기화 절차에서 사용자 노트(`.impact-lens/notes.json`, `notes.local.json`) 삭제를 명시적으로 금지했다.
  테스트 편의로 사용자 데이터를 지우는 일이 없어야 한다. `sudo npm`과 홈 권한 변경도 금지 항목에 넣었다.
- `scripts/**`는 이미 `.vscodeignore`에 있어 probe가 VSIX에 포함되지 않는 것을 재패키징으로 확인했다
  (28 files 유지).
- 검증: Extension 34/34, CLI 46/46 통과.
