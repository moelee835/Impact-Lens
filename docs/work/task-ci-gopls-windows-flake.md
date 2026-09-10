# CI flake: `gopls / windows-latest`가 간헐적으로 15분 job 제한에 걸린다

- 상태: **관측 기록 — 원인 조사 안 함.** 오늘 두 번 재현됐다(PR #111, PR #117). 둘 다 재실행으로
  통과했다. 이 문서는 **관측 사실만** 적는다 - 원인은 안 봤다.

## 목적과 사용자 가치

이 저장소는 여러 판정(gate 닫힘, 릴리스 준비)을 **CI green을 근거로** 내려 왔다. 같은 job이
간헐적으로 제한에 걸리는 일이 반복되면, "CI green"이 재실행 횟수에 달린 상태가 되고, 그 순간
CI 결과는 증거로서의 값을 잃는다. 지금 원인을 모른 채로도, **패턴이 있다는 사실 자체를 기록해
두는 것**이 다음에 이 job을 보는 사람(원인을 조사할 사람)의 출발점이 된다.

## 관측한 것

### PR #111 (`v0.9.0` B-4 검증 기록, `80fe06f`)

- run: `34447472012`("Unit tests" workflow), attempt 1.
- `gopls / windows-latest`: `06:55:58` 시작, `07:11:03`에 **`cancelled`**(경과 15분 5초) -
  `.github/workflows/*.yml`의 `timeout-minutes: 15` 제한.
- 같은 attempt에서 `gopls / macos-latest`(`06:56:03`→`06:58:51`, 2분 48초)·`gopls /
  ubuntu-latest`(`06:55:58`→`06:58:18`, 2분 20초)는 **정상**.
- step별로 보면 `Set up job`부터 `Log installed gopls version`까지(checkout, node/go
  setup, pnpm, dependency 설치, gopls 설치) **전부 `success`** - 멈춘 곳은 `Run Agent CLI
  tests (gopls required, not optional)` 한 step, 그 step 자체가 `cancelled`(제한 초과로 잘림).
- **재실행(attempt 2)**: `07:11:43` 시작, `07:15:49`에 **`success`**(4분 6초) - 같은 코드,
  같은 커�밋, 재실행만으로 정상 시간에 통과.

### PR #117 (M3 계획 갱신, `5c7c2c3`)

- run: `34462613412`("Unit tests" workflow), attempt 1.
- `gopls / windows-latest`: `09:47:51` 시작, `10:03:00`에 **`cancelled`**(경과 15분 9초) -
  PR #111과 **같은 패턴**(같은 step에서 멈춤: `Run Agent CLI tests (gopls required, not
  optional)`, 그 앞 setup step들은 전부 `success`).
- 같은 attempt에서 `gopls / macos-latest`(3분 22초)·`gopls / ubuntu-latest`(2분 29초)는 정상.
- **재실행(attempt 2)**: commander가 트리거, 이 문서 작성 시점 기준 진행 중 - 결과는 확인되는
  대로 이 절에 추가한다.

## 관측한 패턴 (추정 아님)

- 두 번 모두 **assertion 실패가 아니라 `timeout-minutes: 15` 제한 초과**(`cancelled`, 에러
  메시지 없음).
- 두 번 모두 **setup 단계는 전부 통과**하고 실제 테스트 실행 step(`Run Agent CLI tests
  (gopls required, not optional)`) 하나에서만 멈춘다.
- 두 번 모두 **다른 OS(`macos-latest`/`ubuntu-latest`)의 같은 job, 그리고 `clangd`/`cli:test`
  등 다른 provider job들은 같은 attempt에서 정상**이었다 - `windows-latest` × `gopls` 조합에서만
  재현됐다.
- 두 번 모두 **재실행만으로(코드 변경 없이) 정상 시간 안에 통과**했다(PR #111: 4분 6초).

## 명시적으로 하지 않은 것 (추측하지 않는다)

- **원인 조사를 안 했다** - windows runner 자체의 문제인지, gopls 설치·기동 특유의 문제인지,
  테스트 스위트 안의 특정 케이스가 windows에서만 오래 걸리는지 확인하지 않았다.
- 재실행 시 실제로 어느 지점이 빨라졌는지(로그 비교)도 안 봤다 - "재실행하면 통과한다"는 사실만
  확인했다.
- 표본이 **두 번**이다 - 빈도·재현율을 말할 만큼의 표본이 아니다.

## 다음에 이 job을 보는 사람에게

- 세 번째 재현이 나오면 이 문서에 같은 형식으로 추가한다(run ID, attempt별 시간, step별 상태).
- 원인 조사를 시작한다면 `Run Agent CLI tests (gopls required, not optional)` step의 windows
  전용 동작(gopls 프로세스 기동·LSP handshake 타이밍)부터 볼 후보로 남긴다 - **후보일 뿐 확인된
  원인은 아니다.**
