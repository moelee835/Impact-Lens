# IL-LIM-005 사용자 지정 LSP 호환성 확장

- 상태: Backlog
- 우선순위: P1
- 영향도: 높음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

현재 generic adapter는 command, args, languageId와 빈 `initializationOptions`를 사용한다.
서버별 초기화 옵션, workspace settings, configuration 요청, indexing 대기가 필요하면 표준 Call Hierarchy를
지원하는 서버도 초기화에 실패하거나 불완전한 결과를 반환할 수 있다.

## 사용자 스토리

사용자 지정 Language Server를 연결하는 개발자로서 서버가 요구하는 안전한 초기화 설정을 제공하고,
indexing 완료 후 안정적으로 분석하고 싶다.

## 범위

- JSON schema에 제한된 initialization options와 settings 전달 계약을 설계한다.
- `workspace/configuration`과 필요한 표준 lifecycle 요청을 지원한다.
- indexing 준비 전략과 timeout/실패 상태를 명확히 보고한다.

## 제외 범위

- 임의 shell command 평가
- 비표준 protocol 전체를 자동으로 추론하는 범용 adapter

## 수용 기준

- [ ] 설정 값이 schema 검증을 거쳐 Language Server에 전달된다.
- [ ] configuration 요청 및 준비 대기가 필요한 fixture가 통과한다.
- [ ] 민감한 설정 값이 stdout·stderr에 임의 노출되지 않는다.
- [ ] 기존 TypeScript 기본 provider 계약과 결과가 유지된다.

## 검증

- mock LSP lifecycle/설정 contract 테스트
- 실제 서버 최소 2종의 initialization 및 Call Hierarchy 통합 테스트
- timeout, 잘못된 옵션과 server crash 회귀 테스트

## 의존성 및 위험

- `IL-LIM-003`의 provider 상태 모델과 함께 설계하는 것이 좋다.
- 자유 형식 설정은 재현성과 보안 위험을 높이므로 허용 범위를 문서화해야 한다.
