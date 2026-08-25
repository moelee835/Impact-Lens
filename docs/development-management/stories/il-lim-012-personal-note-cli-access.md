# IL-LIM-012 Personal note의 CLI 접근 전략

- 상태: Backlog
- 우선순위: P3
- 영향도: 낮음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

Personal note는 VS Code `workspaceState`에 저장되어 독립 CLI와 Plugin이 접근할 수 없다. 사용자는
Extension에서 보던 개인 문맥이 Agent workflow에서 사라진 이유를 알기 어렵고 scope 사이의 이동도 수동이다.

## 사용자 스토리

개인 노트를 사용하는 개발자로서 명시적으로 허용한 경우에만 Agent가 필요한 노트를 읽거나
공유 가능한 scope로 내보내도록 하고 싶다.

## 범위

- 직접 저장소 접근 대신 Extension-mediated export/import 또는 명시적 bridge를 설계한다.
- read/write 권한, workspace 경계, preview와 사용자 승인을 정의한다.
- unavailable 상태와 안전한 Shared/Local 대안을 Plugin에서 안내한다.

## 제외 범위

- VS Code 내부 storage 파일을 CLI가 직접 탐색·수정
- 사용자 승인 없는 Personal note 외부 전송 또는 scope 변경

## 수용 기준

- [ ] 위협 모델과 권한 경계가 문서화된다.
- [ ] export/import 또는 bridge 작업에 명시적 사용자 승인이 필요하다.
- [ ] workspace와 symbol identity 충돌이 안전하게 처리된다.
- [ ] bridge가 없어도 기존 `vscode_personal_notes_unavailable` 동작이 유지된다.

## 검증

- 승인·거부·충돌·다른 workspace 시나리오 테스트
- preview/apply 및 token conflict 회귀 테스트
- 로그와 JSON에 개인 노트가 불필요하게 노출되지 않는지 검사

## 의존성 및 위험

- VS Code API와 별도 통신 경로가 필요해 독립 CLI 원칙과 충돌할 수 있다.
- 개인정보 보호가 편의성보다 우선하며 안전한 설계가 없으면 미구현 상태를 유지한다.
