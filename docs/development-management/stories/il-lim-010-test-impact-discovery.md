# IL-LIM-010 관련 테스트 탐지 정확도 개선

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

관련 테스트 분류는 Call Hierarchy에 포함된 caller와 파일명·경로 convention에 의존한다. 간접 fixture,
parameterized test, 동적 test registration과 비표준 디렉터리는 누락되며 Impact Lens가 테스트를 실행해
실제 검증 여부를 확인하지도 않는다.

## 사용자 스토리

변경 영향을 검토하는 개발자로서 관련 테스트 후보의 근거와 탐지 한계를 확인하고,
프로젝트 고유 convention을 설정해 누락을 줄이고 싶다.

## 범위

- test file/symbol 분류 근거를 결과에 포함한다.
- 사용자 지정 include/exclude pattern과 언어별 대표 convention을 지원한다.
- 정적 관련 테스트와 실제 실행·통과 여부를 명확히 분리한다.

## 제외 범위

- 모든 test runner를 직접 실행하는 범용 CI 기능
- Call Hierarchy에 없는 동적 test 관계를 무조건 확정

## 수용 기준

- [ ] 기본 convention과 사용자 pattern의 우선순위가 정의된다.
- [ ] 주요 언어의 표준·비표준 test 경로 fixture가 분류된다.
- [ ] 각 test 후보에 분류 근거가 제공된다.
- [ ] 실행하지 않은 테스트를 성공으로 표시하지 않는다.

## 검증

- 경로·symbol convention matrix 단위 테스트
- cross-file test caller 통합 테스트
- false-positive include/exclude 회귀 테스트

## 의존성 및 위험

- 동적 test registration은 `IL-LIM-001`의 범위와 겹칠 수 있다.
- 지나치게 넓은 pattern은 관련 테스트 수를 폭증시킬 수 있다.
