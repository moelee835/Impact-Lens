# 마일스톤별 사용자 테스트 명세 계획

이 문서는 M0~M6에서 실제 사용자가 수행할 acceptance/usability test 명세를 언제, 어떤 형식으로 제안할지
정한다. 현재는 테스트 case를 확정하거나 참여자를 모집·실행하지 않는다. 실제 기능과 UI가 자동 E2E를
통과해 release candidate가 만들어진 뒤 각 마일스톤의 별도 명세를 작성한다.

## 작성 시점과 산출물

각 마일스톤은 다음 순서를 따른다.

1. contract와 구현 범위를 확정한다.
2. 단위·통합·artifact 자동 검증을 통과한다.
3. 실제 CLI/Extension/Plugin UI와 오류 문구가 안정되면 `user-tests/mX-user-test-spec.md`를 작성한다.
4. 구현자가 아닌 검토자가 명세의 재현성, 안전성과 편향을 검토한다.
5. 사용자 테스트 실행은 별도 승인·참여자 모집·환경 준비 후 수행한다.
6. 관측 결과와 미충족 기준을 story/work 문서에 반영한 뒤 release 여부를 결정한다.

명세 작성과 실제 실행은 별개 작업이다. 명세 파일이 존재한다는 이유만으로 사용자 검증을 통과한 것으로
표시하지 않는다.

## 실제 명세의 필수 구성

각 `mX-user-test-spec.md`는 최소한 다음 항목을 포함해야 한다.

- 검증 목적과 이번 테스트로 판단하지 않을 항목
- 참여자 프로필, 요구 경험 수준과 구현 참여자 제외 여부
- OS, editor/agent host, runtime, language/toolchain과 project 형태
- clean install/update/broken-state 등 시작 상태와 사전조건
- 사용자가 달성해야 할 outcome 중심 과업과 금지된 사전 설명
- 과업별 기대 결과, 허용 가능한 대안 경로와 중단 조건
- time-to-first-success, 수동 설정 개입 수, 성공/복구 여부 등 관측 지표
- 오해·과신·불명확한 오류·예상하지 못한 build/test 실행 여부를 확인하는 질문
- log/source/경로에 대한 privacy·redaction 규칙과 참여자 동의
- 실패 증거 수집 방법, issue 연결, rollback과 재시험 기준
- milestone 통과/보류 기준과 미결정 수치의 baseline 측정 방법

## 과업 작성 원칙

- “특정 버튼을 누르라”보다 “이 함수의 변경 영향을 확인하라”처럼 사용자 outcome으로 작성한다.
- 일반 경로는 내부 provider command·args·languageId를 알려주지 않은 상태에서 시작한다.
- 복구 과업은 일부러 준비되지 않은 환경을 제공하되 시스템을 손상시키거나 실제 source를 잃게 하지 않는다.
- 자동 build, dependency 설치, test 실행이 발생하지 않아야 하는 과업을 포함한다.
- 정적 `complete`를 runtime complete로 오해하는지, candidate edge를 confirmed로 오해하는지 확인한다.
- 성공률이나 latency threshold는 지금 추측하지 않고 구현 시점의 자동 benchmark와 pilot 결과로 정한다.
- 언어/toolchain별 결과를 합산해 하나의 평균으로 숨기지 않고 독립적으로 기록한다.

## 공통 증거 형식

- 환경 matrix와 anonymized participant ID
- 과업 시작/종료 시각과 성공·부분 성공·실패
- 사용자가 입력한 설정의 종류와 횟수. secret/절대 개인 경로는 저장하지 않는다.
- CLI error code/details stage 또는 Extension/Plugin에 표시된 사용자 메시지
- 기대 graph와 실제 graph의 차이 및 사용자의 confidence 해석
- 사용자 발화는 동의 범위에서 요약하며 불필요한 source content를 수집하지 않는다.
- 발견 issue, 수정 commit, 재시험 결과와 release decision

## 현재 단계의 완료 조건

- M0~M6 상세 문서에 `사용자 테스트 명세 제안` 단계가 있다.
- 각 단계가 예정 파일 경로, 작성 시점과 마일스톤별 검증 초점을 지정한다.
- 실제 테스트 case, 참여자, 일정과 합격 수치는 아직 확정하지 않는다.
