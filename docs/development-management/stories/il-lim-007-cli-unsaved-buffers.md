# IL-LIM-007 CLI의 저장하지 않은 buffer 분석

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

독립 CLI는 디스크 파일을 읽어 `didOpen`하므로 저장하지 않은 editor buffer를 알 수 없다.
Agent나 사용자가 편집 내용을 저장하기 전에 분석하면 최신 코드와 다른 결과가 반환될 수 있다.

## 사용자 스토리

코드를 수정 중인 Agent로서 아직 저장되지 않은 내용을 명시적으로 분석 요청에 전달하여,
현재 변경 상태에 맞는 영향 범위를 확인하고 싶다.

## 범위

- 요청에 대상 파일 또는 제한된 overlay 문서를 전달하는 계약을 설계한다.
- overlay가 있는 문서는 디스크보다 우선해 Language Server에 전달한다.
- 결과에 overlay 사용 여부와 대상 파일을 표시한다.

## 제외 범위

- CLI가 VS Code process의 열린 buffer를 임의로 읽는 기능
- 전체 workspace를 무제한으로 stdin에 복제

## 수용 기준

- [ ] overlay 적용 전후의 symbol과 caller 차이가 통합 테스트로 검증된다.
- [ ] workspace 밖 경로와 중복·과대 payload가 안전하게 거부된다.
- [ ] overlay 미제공 시 기존 디스크 분석 동작이 유지된다.
- [ ] 결과 metadata에서 저장되지 않은 입력 사용 여부를 확인할 수 있다.

## 검증

- overlay root/caller 파일의 LSP 통합 테스트
- 경로 탈출, 크기 제한과 잘못된 encoding contract 테스트
- Plugin의 stdin JSON 전달 회귀 테스트

## 의존성 및 위험

- Language Server별 변경 문서 처리 차이를 검증해야 한다.
- 민감한 source가 로그나 오류 메시지에 포함되지 않도록 해야 한다.
