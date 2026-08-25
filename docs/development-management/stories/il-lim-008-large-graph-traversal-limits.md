# IL-LIM-008 대규모 호출 그래프 제한 개선

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간
- 적용 영역: VS Code Extension, Agent CLI

## 문제

분석은 기본 depth 5·node 120, 최대 depth 20·node 1,000으로 제한된다. 대규모 graph에서는 중요한
상위 caller가 잘릴 수 있고, 제한을 단순히 높이면 Language Server 부하와 UI 가독성이 악화될 수 있다.

## 사용자 스토리

대규모 프로젝트를 분석하는 개발자로서 전체 graph를 한 번에 요청하지 않고도 잘린 branch를 선택적으로
확장하고 중요한 caller를 놓치지 않으며 분석 비용을 통제하고 싶다.

## 범위

- branch 단위 추가 탐색 또는 pagination 모델을 설계한다.
- 제한에 걸린 frontier와 추가 탐색 비용을 UI·JSON에 표시한다.
- 취소, timeout, cache와 중복 요청 처리를 정의한다.

## 제외 범위

- 무제한 graph를 한 화면에 렌더링
- 모든 프로젝트 규모에 동일한 성능 SLA 보장

## 수용 기준

- [ ] 잘린 frontier에서 추가 탐색을 요청할 수 있다.
- [ ] 추가 결과가 기존 node/edge identity를 깨지 않고 병합된다.
- [ ] 취소와 timeout 후에도 기존 부분 결과가 보존된다.
- [ ] 대형 fixture에서 메모리·시간 측정값과 권장 제한이 기록된다.

## 검증

- depth/node frontier, cycle과 diamond graph 단위 테스트
- 반복 확장 시 중복·dangling edge 회귀 테스트
- cold/warm provider benchmark

## 의존성 및 위험

- `IL-LIM-003`과 `IL-LIM-009`의 부분 결과 의미를 재사용해야 한다.
- provider 요청 수 증가가 editor responsiveness를 해치지 않도록 예산이 필요하다.
