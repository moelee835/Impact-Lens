# IL-LIM-013 Source note 주석 문법 확장

- 상태: Backlog
- 우선순위: P3
- 영향도: 낮음
- 적용 영역: VS Code Extension, Agent CLI

## 문제

CLI Source note 쓰기는 등록된 파일 확장자와 `//`, `#`, `--` line comment만 지원한다.
알 수 없는 언어는 안전하게 거부되며 block comment만 사용하거나 확장자가 다른 언어에서는 Source note를
쓸 수 없다. Extension과 CLI의 미등록 언어 처리도 완전히 동일하지 않다.

## 사용자 스토리

추가 언어를 사용하는 개발자로서 해당 언어의 유효한 주석 문법으로 Source note를 안전하게 관리하고,
지원하지 않으면 Shared/Local 대안을 명확히 안내받고 싶다.

## 범위

- Extension과 CLI가 공유할 comment syntax registry를 설계한다.
- 필요한 언어의 line/block comment formatting과 parsing을 명시적으로 추가한다.
- 미지원 언어에서는 임의 문법을 쓰지 않고 대체 scope를 안내한다.

## 제외 범위

- 언어 parser 없이 복잡한 전처리기·문서 주석 문법 전체 지원
- 기존 사용자 주석의 자동 변환

## 수용 기준

- [ ] Extension과 CLI가 동일한 언어·주석 mapping을 사용한다.
- [ ] 추가 언어별 set/get/delete와 indentation/newline 보존이 검증된다.
- [ ] 미지원 언어는 파일을 변경하지 않고 명시적 오류와 대안을 반환한다.
- [ ] 기존 `//`, `#`, `--` 언어 동작이 유지된다.

## 검증

- 언어·확장자별 formatting/parsing matrix 테스트
- CRLF/LF, indentation, shebang과 기존 주석 보존 회귀 테스트
- preview/apply conflict 및 미지원 파일 무변경 검사

## 의존성 및 위험

- `IL-LIM-004`의 지원 언어 선정과 함께 우선순위를 정할 수 있다.
- block comment 편집은 line comment보다 파일 손상 위험이 커 preview 검증이 필수다.
