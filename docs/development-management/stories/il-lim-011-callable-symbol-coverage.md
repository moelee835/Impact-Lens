# IL-LIM-011 호출 가능한 symbol 종류 확장

- 상태: Backlog
- 우선순위: P3
- 영향도: 낮음~중간
- 적용 영역: VS Code Extension, Agent CLI

## 문제

Extension CodeLens는 Function, Method와 Constructor symbol을 중심으로 제공된다. callable property,
operator, macro 또는 언어 서버가 다른 kind로 표현하는 함수형 선언은 분석 가능하더라도 진입점이
표시되지 않을 수 있다.

## 사용자 스토리

다양한 언어의 callable 선언을 사용하는 개발자로서 provider가 제공하는 유효한 Call Hierarchy 대상이라면
일관된 CodeLens와 분석 명령을 사용하고 싶다.

## 범위

- provider·언어별 callable symbol kind와 prepare 성공 여부를 조사한다.
- 안전한 추가 kind 또는 capability probe 전략을 도입한다.
- declaration anchor가 지원하지 못한 문법은 provider selection을 보존하며 명시적으로 fallback한다.

## 제외 범위

- 모든 언어 문법을 직접 파싱하는 범용 parser
- Call Hierarchy를 준비할 수 없는 일반 변수·필드 전체에 CodeLens 표시

## 수용 기준

- [ ] 추가 대상 symbol kind와 언어별 근거가 문서화된다.
- [ ] 지원 kind에서 CodeLens 위치와 Call Hierarchy 준비가 검증된다.
- [ ] 호출 불가능 symbol에 잘못된 CodeLens가 증가하지 않는다.
- [ ] 기존 function/method/constructor 동작이 유지된다.

## 검증

- symbol kind와 declaration 문법 fixture 단위 테스트
- 실제 provider prepareCallHierarchy 통합 검사
- decorator, typed method와 arrow function 회귀 테스트

## 의존성 및 위험

- `IL-LIM-004`의 언어별 검증 결과가 대상 kind 선정에 도움이 된다.
- symbol kind 의미가 Language Server마다 달라 allowlist만 넓히면 오탐이 생길 수 있다.
