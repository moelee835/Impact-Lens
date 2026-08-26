# 자식 프로세스 stdio가 동작하지 않는 환경 식별

## 배경과 해결할 문제

`v0.6.2`까지의 진단 강화 끝에, 보고 환경(WSL2 + Codex `workspace-write` 샌드박스)의 실패 원인이
드러났다. Impact Lens 결함이 아니라 **환경이 자식 프로세스의 stdio를 전달하지 못하는 것**이다.

언어 서버를 완전히 배제한 최소 테스트로 확정했다. 부모가 자식을 `stdio: ['pipe','pipe','pipe']`로 띄우고
`hello`를 쓴 뒤, 자식은 받은 데이터와 생존 신호를 stdout으로 쓰게 했다.

```text
STDIO-TEST: exit=0 signal=null ms=2043
  자식 stdout: ""
  => stdin 비정상: 자식이 데이터를 받지 못함
```

자식은 2043ms 동안 정상 실행되고 자기 타이머로 `exit 0` 했다. 그런데 부모가 받은 stdout은 **완전히 비어
있다.** 자식이 종료 직전에 쓴 `ALIVE`조차 오지 않았다. 즉 pipe가 양방향 모두 데이터를 나르지 못한다.

이것이 관측된 모든 증상을 설명한다.

- 언어 서버가 우리 요청을 받지 못해 stdin EOF로 `process.exit(1)` — 조용한 exit 1, 100~200ms
- 서버가 쓴 것이 오지 않음 — `bytesFromServer: 0`, stderr 없음, `providerLog` 없음
- 자식 프로세스를 쓰지 않는 `note list`와 doctor preflight만 정상
- 같은 명령이 사용자 shell에서는 성공

## 범위

- 이 환경을 CLI가 스스로 식별하고 사용자에게 정확히 알린다.
- 진짜 provider 결함과 혼동하지 않는다.
- 설치·환경 문서에 제약과 대안을 기록한다.

## 범위에서 제외할 항목

- 샌드박스 정책 우회
- stdio 대신 socket 전송 도입 (별도 검토 과제)
- 실패한 분석의 자동 재시도

## 구현

실패 경로에서만 동작하는 self-check를 추가했다. 정상 경로에는 비용이 없다.

1. provider lifecycle 실패(`provider_launch_failed|initialize|query`)이고,
2. `bytesFromServer === 0`이며 `stderr`와 `providerLog`가 모두 없을 때,
3. 아무 일도 하지 않고 토큰만 출력하는 자식을 2초 제한으로 띄워 본다.
4. 그 토큰조차 오지 않으면 오류를 `provider_ipc_unavailable`로 바꾸고 원래 진단은 그대로 보존한다.

`bytesFromServer > 0`이거나 서버가 stderr/로그를 남겼다면 서버는 도달 가능했던 것이므로 그 오류를 건드리지
않는다. 환경 탓으로 실제 결함을 덮지 않기 위한 조건이다.

## 테스트 및 완료 기준

- [x] 정상 환경에서 self-check가 `ok`를 반환한다.
- [x] 제한 시간 안에 끝나지 못하면 hang 없이 `unavailable`을 반환한다.
- [x] 응답·로그·stderr가 있는 실패는 `provider_ipc_unavailable`로 바뀌지 않는다.
- [x] 치환된 오류가 원래 `stage`, `exitCode`, `msSinceSpawn`을 보존하고 non-retryable이다.
- [x] 기존 silent-exit 계약 테스트가 정상 환경에서 `provider_initialize_failed`를 그대로 유지한다.
- [x] `npm run test:all`과 `npm run test:plugin-artifact`가 통과한다.
- [ ] 3-OS matrix 통과와 병합.
- [ ] 보고 환경에서 새 오류 문구가 실제로 나오는지 확인.

## 작업 로그

### 2026-08-26 — 환경 식별 구현

- 변경 파일: `cli/src/childIpc.ts` (신규), `cli/src/index.ts`, `cli/src/test/childIpc.test.ts` (신규),
  계약·설치·환경 문서, version 정합성(`0.6.3`, payload `0.2.4`)
- 진단 순서가 원인을 좁힌 과정을 남긴다. 각 단계는 실측으로 배제했고 추측으로 넘어가지 않았다.
  1. Node 24 고유 문제 — 공식 24.19.0 바이너리에서 정상, 배제
  2. 전역 설치 형태, npx 캐시 오염, 환경변수 — 배제
  3. parent process watchdog — 실제 결함이었고 `v0.6.1`에서 수정, 보고 환경에서 통과 확인
  4. 네트워크 — 실제 원인은 `EROFS`, `v0.6.2`에서 분리 분류
  5. 부모 stdin 상태 — `/dev/null`, 닫힘, 기본 모두 동일 실패, 배제
  6. 자식 fd 0 종류 — 정상 socket, 배제
  7. CLI 고유 문제 — 같은 자리에서 직접 spawn한 probe도 동일 실패, 배제
  8. 자식 stdio 전달 — **확정**
- self-check는 `stdio: ['ignore','pipe','ignore']`로 최소 자식만 띄운다. 자식이 stdin을 필요로 하지 않게
  해서, stdin 방향 제약과 무관하게 stdout 전달만 검사한다.
- `looksLikeSilentProviderFailure`를 별도 함수로 분리해 순수 판정만 단위 테스트했다. self-check 자체는
  실제 spawn으로 확인한다.
- 검증: Extension 34/34, CLI 51/51 통과.
