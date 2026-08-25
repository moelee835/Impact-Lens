# IL-LIM-001 동적·런타임 호출 관계 보완

- 상태: Backlog
- 우선순위: P0
- 영향도: 매우 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

현재 분석은 정적 Call Hierarchy만 사용한다. reflection, 문자열 기반 import·호출, callback 등록,
event bus와 런타임 dispatch가 provider 결과에 없으면 실제 caller가 그래프에서 누락되어 영향 범위를
과소평가할 수 있다.

## 사용자 스토리

코드 변경을 검토하는 개발자로서 정적 분석 밖의 호출 가능성을 별도 근거와 함께 확인하여,
그래프에 보이지 않는 런타임 관계를 실제 부재로 오판하지 않고 싶다.

## 범위

- 확정된 Call Hierarchy edge와 추론·외부 제공 edge를 구분하는 provenance 모델을 설계한다.
- 우선 지원할 동적 관계 유형과 언어별 탐지 전략을 조사하고 오탐·미탐 기준을 정의한다.
- 보조 관계를 명시적으로 켜고 끌 수 있으며 UI와 JSON에서 출처와 신뢰도를 표시한다.

## 제외 범위

- 모든 언어의 런타임 실행을 완전히 재현하는 범용 분석기
- 근거가 없는 관계를 확정 호출로 표시하는 동작

## 수용 기준

- [ ] 정적, 추론, 외부 관측 관계가 모델과 출력에서 구별된다.
- [ ] 최소 2개 동적 호출 유형의 fixture에 대해 탐지 결과와 오탐 기준이 검증된다.
- [ ] 보조 분석 실패가 기존 정적 그래프를 실패시키지 않는다.
- [ ] 미지원 동적 관계가 limitation과 사용자 문서에 명시된다.

## 검증

- 확정 edge와 추론 edge가 혼합된 graph/JSON contract 테스트
- 기능 비활성화 시 기존 결과가 보존되는 회귀 테스트
- 대표 fixture의 precision·recall 결과 기록

## 의존성 및 위험

- `IL-LIM-003`의 provider/provenance 표현을 선행하는 것이 좋다.
- 오탐은 잘못된 영향 범위를 만들 수 있으므로 추론 결과를 확정 관계와 시각적으로 분리해야 한다.
