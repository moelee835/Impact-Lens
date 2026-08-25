# IL-LIM-003 Language Server 분석 범위 투명성

- 상태: Backlog
- 우선순위: P0
- 영향도: 매우 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

Impact Lens는 Language Server가 반환한 Call Hierarchy에 의존하지만 사용자는 누락이 코드상 부재인지,
provider의 미지원·indexing·설정 문제인지 구분하기 어렵다. 현재 `complete`도 provider가 제공한 범위의
탐색 완료만 의미하므로 결과를 전체 런타임 관계의 완전성으로 오해할 수 있다.

## 사용자 스토리

분석 결과를 의사결정에 사용하는 개발자로서 어떤 provider와 capability가 결과를 만들었고
어떤 범위가 보장되지 않는지 즉시 확인하고 싶다.

## 범위

- provider 이름·버전·capability·indexing 상태와 결과 출처를 공통 metadata로 정리한다.
- provider 미지원, 탐색 제한, 동적 관계 미추론을 서로 다른 limitation으로 유지한다.
- Extension과 CLI에서 동일한 의미의 completeness 요약을 제공한다.

## 제외 범위

- Language Server 자체의 분석 정확도 수정
- 지원하지 않는 관계를 근거 없이 생성

## 수용 기준

- [ ] 모든 분석 결과에 provider identity와 Call Hierarchy capability가 포함된다.
- [ ] provider 누락과 실제 caller 없음이 사용자 메시지와 JSON에서 구분된다.
- [ ] Extension과 CLI의 completeness 용어 및 limitation code가 문서화된다.
- [ ] 대표 provider별 기준 fixture와 기대 coverage가 기록된다.

## 검증

- capability 없음, provider 실패, 빈 결과와 정상 완료 contract 테스트
- Extension/CLI 결과 의미 비교 테스트 또는 공통 fixture
- 문서 용어와 JSON schema 일치 검사

## 의존성 및 위험

- 다른 분석 정확도 스토리의 공통 기반이다.
- 일부 서버는 표준화된 indexing 완료 신호를 제공하지 않으므로 `unknown` 상태가 필요할 수 있다.
