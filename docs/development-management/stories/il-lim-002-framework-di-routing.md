# IL-LIM-002 프레임워크 DI·라우팅 관계 보완

- 상태: Backlog
- 우선순위: P0
- 영향도: 매우 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

FastAPI `Depends()`와 decorator route, Spring/Guice 계열 DI처럼 프레임워크가 런타임에 연결하는
관계는 일반 Call Hierarchy에서 누락될 수 있다. 프레임워크 중심 프로젝트에서는 진입점과 서비스
의존성이 보이지 않아 분석 가치가 크게 낮아진다.

## 사용자 스토리

프레임워크 기반 서비스를 변경하는 개발자로서 route·DI 관계를 추론 관계로 확인하여,
변경된 서비스가 어떤 endpoint와 component에 영향을 줄 수 있는지 알고 싶다.

## 범위

- 첫 대상 프레임워크와 지원할 관계를 명시적으로 선정한다.
- framework adapter가 만든 edge에 adapter 이름, 근거 위치와 추론 상태를 기록한다.
- 일반 호출 관계와 프레임워크 관계를 함께 탐색하되 필터링할 수 있게 한다.

## 제외 범위

- 여러 프레임워크를 한 번에 지원
- 애플리케이션 실행 없이 런타임 구성을 완전하게 확정

## 수용 기준

- [ ] 선정한 프레임워크의 DI와 route fixture에서 기대 관계가 탐지된다.
- [ ] 추론 관계가 정적 확정 관계와 UI·JSON에서 구분된다.
- [ ] alias, 중첩 dependency와 cross-file 사례가 테스트된다.
- [ ] 모호한 관계는 확정 edge로 생성되지 않고 limitation으로 보고된다.

## 검증

- 최소 FastAPI fixture의 route → handler → dependency 관계 통합 테스트
- provider 원본과 adapter 보완 결과 비교
- false-positive fixture 및 adapter 비활성화 회귀 테스트

## 의존성 및 위험

- `IL-LIM-003`과 `IL-LIM-006`이 선행되어야 하며 관계 모델은 `IL-LIM-001`과 공유할 수 있다.
- 프레임워크 버전과 coding pattern에 따라 추론 정확도가 크게 달라질 수 있다.
