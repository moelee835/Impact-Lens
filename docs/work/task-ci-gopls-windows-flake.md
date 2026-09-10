# CI flake 관측: Windows job 둘이 오늘 각자 다른 이유로 불안정했다

- 상태: **관측 기록.** 오늘 windows-latest에서 **서로 다른 두 job이, 서로 다른 이유로** 불안정
  했다 - **뭉뚱그리지 않는다.** 뭉뚱그리면 "Windows CI가 불안정하다"가 되고, 그건 둘 중 어느
  쪽에 대해서도 행동으로 이어지지 않는다(commander 지적).
  - **`gopls / windows-latest`**: **원인 미상인 우리 쪽 hang.** 이봉(bimodal) 분포, 재실행이
    대체로(항상은 아니게) 통한다. 아래 "1. gopls/windows-latest" 절.
  - **`clangd / windows-latest`**: **외부 패키지 피드(Chocolatey) 장애.** 원인이 로그에
    명시적으로 찍혀 있다(`503 Service Unavailable`) - 추측할 게 없다. 아래 "2. clangd/windows-
    latest" 절.

## 목적과 사용자 가치

이 저장소는 여러 판정(gate 닫힘, 릴리스 준비)을 **CI green을 근거로** 내려 왔다. 같은 job이
간헐적으로 제한에 걸리는 일이 반복되면, "CI green"이 재실행 횟수에 달린 상태가 되고, 그 순간
CI 결과는 증거로서의 값을 잃는다. 지금 원인을 모른 채로도, **패턴이 있다는 사실 자체를 기록해
두는 것**이 다음에 이 job을 보는 사람(원인을 조사할 사람)의 출발점이 된다.

---

# 1. `gopls / windows-latest` — 원인 미상, 우리 쪽 hang

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
- **재실행(attempt 2)**: commander가 트리거, `10:03:54` 시작 `10:08:20` 완료(4분 26초) -
  **`success`**. PR #111과 같은 패턴(같은 코드, 재실행만으로 정상 시간 통과) - 이걸로 표본이
  둘로 늘었다.

### PR #121 (이 문서를 채워 넣는 PR 자신) — 이 관측을 기록하는 도중에 연속 두 번 재현됐다

- run: `34464841285`("Unit tests" workflow) - PR #117 재실행 결과를 채운 첫 push(`f614ad9`).
  - attempt 1: `10:12:40` 시작, `10:27:46`에 **`cancelled`**(경과 15분 6초) - setup 전부
    통과, 같은 step에서 멈춤.
  - 같은 attempt에 별개의 실패가 하나 더 있었다(아래 "별개로 관측한 것" 참고) -
    `cli:test / macos-latest`가 assertion 실패. **다른 현상**이라 섞지 않는다.
  - 재실행(attempt 2): `10:28:08` 시작 `10:32:43` 완료(4분 35초) - **`success`**. 같은
    attempt의 `cli:test / macos-latest`도 재실행에서 `success`(1분 7초).
- run: `34466751903`("Unit tests" workflow) - 위 세 번째 재현을 문서에 채운 두 번째 push
  (`74f0f1c`).
  - attempt 1: `10:34:20` 시작, `10:49:25`에 **`cancelled`**(경과 15분 5초) - 네 번째 재현.
  - **재실행(attempt 2)도 `cancelled`**: `10:49:56` 시작 `11:05:02` 완료(경과 15분 6초) -
    **다섯 번째 재현, 그리고 처음으로 "재실행 한 번이면 끝난다"는 전제가 깨진 사례**(다른
    OS·job은 이 attempt 2에서도 전부 정상이었다 - `gopls / windows-latest` 하나만 다시 걸림).
  - 재실행(attempt 3): `11:05:29` 시작 `11:10:06` 완료(4분 37초) - **`success`**.

## 관측한 패턴 (추정 아님)

- 다섯 번 모두 **assertion 실패가 아니라 `timeout-minutes: 15` 제한 초과**(`cancelled`, 에러
  메시지 없음).
- 다섯 번 모두 **setup 단계는 전부 통과**하고 실제 테스트 실행 step(`Run Agent CLI tests
  (gopls required, not optional)`) 하나에서만 멈춘다.
- 다섯 번 모두 **다른 OS(`macos-latest`/`ubuntu-latest`)의 같은 job, 그리고 `clangd`/`cli:test`
  등 다른 provider job들은 같은 attempt에서 정상**이었다 - `windows-latest` × `gopls` 조합에서만
  재현됐다.
- **통과한 attempt들의 소요시간이 이봉(bimodal) 분포다 - 그 사이가 없다(commander 관측,
  진단 신호로 여기 그대로 남긴다).** 성공한 모든 `gopls / windows-latest` run이 **4~5분대**에
  몰려 있다 - 이 문서가 직접 기록한 것만도 4분 6초(PR #111)·4분 26초(PR #117)·4분 35초·4분
  37초(PR #121의 두 재실행)이고, commander가 오늘의 다른 성공 run들(`09:30`·`09:35`·`09:42`·
  `09:44`·`09:48`·`09:53`·`09:58`·`10:03`·`10:06`·`10:11`·`10:28` 부근 시각대)을 따로 확인한
  결과도 전부 같은 자릿수였다고 전달했다. **실패한 run은 전부 정확히 15분 근방(15분 5~9초)에서
  잘린다** - 8분·11분·13분처럼 그 사이 어딘가에서 끝나는 run이 없다. **이건 점진적으로
  느려지는 것(부하 증가)이 아니라 어딘가에서 간헐적으로 완전히 멈추는 것**을 가리킨다 - 느려지는
  거라면 소요시간이 기어올라야 하는데 그런 흔적이 없다. **다음에 원인을 조사할 사람은 이
  이봉성 때문에 "점진적 부하 증가" 가설을 먼저 배제할 수 있다.**
- **PR #121에서 두 번 연속 실패한 것을 "간헐적 사건이 우연히 뭉친 것"과 "원인이 바뀐 것" 중
  어느 쪽으로도 이 데이터만으로는 가르지 못한다.** PR #117은 재실행 한 번(4분 26초)으로
  끝났고 merge됐다(`0ebfb5b`) - 그러니 "재실행이 더는 안 통한다"고 결론 내리기엔 아직 이르다.
  **이건 "회귀라는 증거가 없다"는 뜻이지 "회귀가 아니다"라는 뜻이 아니다** - 이 구분을 그대로
  남긴다.

## 별개로 관측한 것 — `cli:test / macos-latest` assertion 실패 (PR #121, 섞지 않는다)

이 문서의 패턴(15분 제한 초과)과 **다른 현상**이라 별도 절로 남긴다 - 원인 조사도 이 패턴에
합치지 않는다.

- PR #121 attempt 1에서 `cli:test / macos-latest`가 `preserves lifecycle and runtime
  provenance when the provider exits silently`(`cli/src/test/contract.test.ts:253`)에서
  **실패**했다 - `provider_launch_failed`를 받았는데 기대값은 `provider_initialize_failed`.
  **`AssertionError`, 제한 초과 아님.**
- 이 테스트는 자식 프로세스(`silentExitServer.js`)를 스폰해 **launch 단계와 initialize 단계
  중 어느 쪽에서 조용히 죽었는지**를 구분하는 코드를 검증한다 - 그 구분 자체가 프로세스 종료
  타이밍에 의존하므로, CI runner 부하에 따라 race가 날 수 있는 모양이라는 것은 **코드를 읽고
  세운 가설**이다(확인 안 함).
- 재실행(attempt 2)에서 **`success`**(1분 7초) - 코드 변경 없이 통과.
- **PR #121은 순수 문서 변경**(`docs/work/task-ci-gopls-windows-flake.md`만 건드림)이라 이
  PR이 원인일 수 없다. 표본 1번 - 별도 문서로 옮길지는 두 번째 재현이 나온 뒤 판단한다. 지금은
  이 문서에 기록만 남긴다.

## 명시적으로 하지 않은 것 (추측하지 않는다)

- **원인 조사를 안 했다** - windows runner 자체의 문제인지, gopls 설치·기동 특유의 문제인지,
  테스트 스위트 안의 특정 케이스가 windows에서만 오래 걸리는지 확인하지 않았다.
- 재실행 시 실제로 어느 지점이 빨라졌는지(로그 비교)도 안 봤다 - "재실행하면 통과한다"는 사실만
  확인했다.
- 표본이 **다섯 번**(PR 3개에 걸쳐)이다 - 빈도·재현율을 정밀하게 말할 만큼의 표본은 아니지만,
  우연으로 치부하기엔 충분히 반복됐고, **왜 PR #121에서만 연속 두 번이었는지는 모른다**(다른
  PR들과 다른 시각대·다른 CI 부하 상태였을 수도, 우연히 뭉친 것일 수도 있다 - 조사 안 함).

## 다음에 이 job을 보는 사람에게

- **여섯 번째 재현이 나오면** 이 문서에 같은 형식으로 추가한다(run ID, attempt별 시간, step별
  상태) - **다만 매번 이 문서 자체를 고치는 PR의 CI에서 또 재현될 위험이 있다는 걸 감안한다**
  (이번 lane에서 실제로 두 번 그랬다) - 발견 즉시 계속 추가하지 말고 한 번에 정리해서 넣는다.
- 원인 조사를 시작한다면 `Run Agent CLI tests (gopls required, not optional)` step의 windows
  전용 동작(gopls 프로세스 기동·LSP handshake 타이밍)부터 볼 후보로 남긴다 - **후보일 뿐 확인된
  원인은 아니다.**

---

# 2. `clangd / windows-latest` — 외부 패키지 피드(Chocolatey) 장애

**위 1번과 완전히 별개 현상이다 - 섞지 않는다.** 원인이 로그에 명시적으로 찍혀 있어 추정할 게
없다("추정하지 마라"는 원인이 안 보일 때의 규율이지, 로그가 원인을 말해 주는데도 모른 척하라는
뜻이 아니다).

## 관측한 것 (PR #121, run `34470023604`)

- attempt 1(`11:11:58`→`11:12:55`, 57초): `clangd / windows-latest` **`failure`**(`cancelled`
  아님 - 제한 초과가 아니라 실제 실패). setup step(`checkout`/`setup-node`/`pnpm`/`install
  dependencies`)은 전부 `success`, 멈춘 곳은 `Install clangd 22 (Windows, via Chocolatey...)`
  step 자체가 **에러로 실패**(뒤 step들은 `skipped`).
- 원문 로그: `Unable to connect to source 'https://community.chocolatey.org/api/v2/': Failed
  to fetch results from V2 feed at '...Packages(Id='llvm',Version='22.1.7')' with following
  message : Response status code does not indicate success: **503 (Service Unavailable)**.`
- attempt 2(재실행, `11:17:39` 근방): **같은 `503`으로 다시 실패** - 즉시 재시도로는 안 풀렸다.
- attempt 3(몇 분 더 기다린 뒤 재실행, `11:20:40`): **또 같은 `503`으로 실패** - 세 번 다
  정확히 같은 메시지, 같은 패키지(`llvm` `22.1.7`). **몇 분 단위 대기로는 아직 안 풀린다** -
  이 시점부터는 hammering을 멈추고 더 길게 기다린다(commander 지시대로 대안 설치 경로는
  설계하지 않는다).

## 이 저장소가 같은 피드를 이미 한 번 겪었다 — M2 clangd lane과의 연결

`docs/work/task-m2-clangd-preset.md`(stage 5)가 이미 Chocolatey의 `llvm` 패키지 문제를
실측으로 확인해 뒀다 - **그때는 지연(버전), 이번엔 가용성(장애)**, 같은 외부 피드가 두 가지
다른 방식으로 문제를 낸 것:

- **그때(M2)**: `choco install llvm --version=23.1.0`이 실패 - Chocolatey의 `llvm` 패키지가
  **upstream LLVM보다 메이저 하나 뒤처져 있어서**(`23.x`를 아예 배포하지 않음, 당시 최신이
  `22.1.7`) 어떤 `23.x` 버전 핀도 통하지 않았다. 고침: Windows만 `22.1.7`로 pin(Linux·macOS는
  `23.x` 유지) - 지금 워크플로가 `choco install llvm --version=22.1.7`을 쓰는 이유가 이것이다.
- **이번(오늘)**: 버전 문자열은 맞다(`22.1.7`) - 피드 자체가 `503`으로 응답하지 않는다.
- **패턴**: 이 job은 Chocolatey라는 외부 피드에 **버전 지연·가용성 두 축 모두로 노출돼 있다**
  - 하나를 고쳐도 다른 하나가 남는다는 뜻이다. **그 이상 파지 않는다** - 지금 필요한 건 관측
  기록이지 대안 설치 경로(예: 다른 패키지 매니저, 직접 다운로드) 설계가 아니다(commander 지시).

## 명시적으로 하지 않은 것

- 대안 설치 경로를 설계하지 않았다 - Chocolatey를 계속 쓸지, 다른 경로로 바꿀지는 이 문서의
  판단 범위 밖이다.
- Chocolatey 자체의 장애 이력·SLA를 조사하지 않았다 - 이번 `503`이 얼마나 자주 있는 일인지는
  모른다.
