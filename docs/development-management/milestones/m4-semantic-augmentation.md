# M4 동적 호출·DI·테스트 의미 보완

- 상태: Planned
- 완료 소유: IL-LIM-001, IL-LIM-002, IL-LIM-010
- 릴리스 성격: semantic evidence preview/minor release

## 목표

LSP가 놓치는 동적 호출, dependency injection, routing과 테스트 관련성을 근거 없이 확정하지 않으면서
보조 evidence로 표시한다. 정적 확정 edge, 후보 edge와 runtime-only 관계를 provenance/confidence로 구분한다.

## 포함 범위

- 공통 evidence graph와 `confirmed/candidate/runtime-only` 또는 동등 confidence 계약
- function pointer, virtual/interface dispatch, closure/lambda와 reflection 후보 보완
- framework adapter registry와 Spring Java/Kotlin bean/context resolution 1차 adapter
- FastAPI/Koin/Dagger/Hilt/Swift DI 등 후속 adapter SPI 및 unsupported 표시
- test candidate evidence, include/exclude convention과 실제 실행 상태 분리
- LSP-only와 augmented 결과의 비교·rollback·성능 budget

## 진입 조건

- M0/M1 provider/coverage/completeness 계약이 release되어 evidence source를 구분할 수 있다.
- 최소 M2의 Python/Go/C/C++ fixture가 semantic regression 기준선으로 존재한다.
- 사용자 승인 없는 runtime app/test 실행 금지 원칙이 API 계약에 반영된다.

## 산출물

- provenance/confidence가 포함된 augmented edge schema와 UI/Plugin 표현
- 언어별 제한된 정적 추론 adapter와 false-positive corpus
- Spring bean definition/injection candidate graph와 unresolved bean 설명
- test evidence classifier, rule ID와 freshness/run-state model
- adapter별 precision/recall proxy, latency와 disable/rollback switch

## 종료 gate

- [ ] IL-LIM-001, IL-LIM-002, IL-LIM-010의 수용 기준이 통과한다.
- [ ] LSP 확정 edge와 추론/framework/runtime evidence가 JSON과 UI에서 구분된다.
- [ ] Spring constructor/field/method injection의 대표 fixture가 bean candidate와 ambiguity를 재현한다.
- [ ] 모호한 DI/dynamic target은 하나의 확정 caller로 임의 승격되지 않는다.
- [ ] path convention만으로 가짜 call edge나 test passed 상태를 만들지 않는다.
- [ ] augmentation을 끄면 기존 LSP-only graph로 안전하게 rollback된다.
- [ ] 지원 언어 fixture에서 정해진 false-positive와 latency budget을 통과한다.

## 제외 범위

- 임의 application/test 자동 실행
- 모든 framework 및 runtime reflection 완전 지원
- 실제 runtime trace 없이 runtime-only target을 확정하는 동작

## 주요 위험과 대응

- false positive가 신뢰를 훼손할 수 있다: source/confidence를 필수화하고 adapter별 opt-in/kill switch를 둔다.
- framework version별 metadata가 다르다: adapter와 fixture를 framework/version profile로 격리한다.
- graph가 복잡해질 수 있다: 기본 뷰는 confirmed 중심, candidate/runtime evidence는 filter와 설명으로 제공한다.

## 다음 마일스톤 연결

M5는 evidence가 늘어난 graph에서도 규모와 freshness를 제어하고, M6는 language/profile 정보를 source note
문법과 note 접근 전략에 재사용한다.
