# IL-LIM-009 분석 완료 의미와 불완전성 전달

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

`complete: true`는 구성된 provider 탐색이 제한 없이 끝났다는 뜻이지만 사용자는 전체 런타임 호출 관계가
완전하다는 뜻으로 오해할 수 있다. limitation code가 있어도 UI와 Agent 응답에서 충분히 강조되지 않으면
미탐 가능성이 의사결정에서 사라진다.

## 사용자 스토리

분석 결과를 검토하는 사용자로서 수집 완료, 부분 결과와 의미적 불완전성을 한눈에 구분하고 싶다.

## 범위

- traversal completion과 semantic coverage를 별도 필드·용어로 정의한다.
- UI header, CLI JSON과 Plugin 지침에서 같은 표현과 우선순위를 사용한다.
- high-impact limitation이 있으면 요약과 후속 조치를 제공한다.

## 제외 범위

- 측정 근거 없이 coverage 백분율 제공
- provider가 보장하지 않는 완전성을 주장

## 수용 기준

- [ ] 완전 종료, depth/node 제한, provider 미지원과 동적 미추론 상태가 구분된다.
- [ ] `complete` 하위 호환 또는 schema migration 전략이 문서화된다.
- [ ] Agent가 limitation을 실제 부재로 요약하지 않도록 contract fixture가 존재한다.
- [ ] README, UI와 CLI schema의 용어가 일치한다.

## 검증

- 상태 조합별 JSON snapshot과 UI summary 테스트
- Plugin skill의 limitation 해석 시나리오 검증
- 기존 schema 소비자 호환 테스트

## 의존성 및 위험

- `IL-LIM-003`의 provider 상태와 함께 설계해야 한다.
- 필드 이름 변경은 기존 Agent 통합을 깨뜨릴 수 있어 schema version 정책이 필요하다.
