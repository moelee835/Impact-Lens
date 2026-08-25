# IL-LIM-004 주요 언어용 기본 provider preset

- 상태: Backlog
- 우선순위: P1
- 영향도: 높음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

CLI와 Plugin은 TypeScript·JavaScript만 즉시 분석할 수 있다. 다른 언어는 사용자가 Language Server의
실행 파일, 인자와 `languageId`를 직접 알아내야 하므로 설치 성공률과 재현성이 낮다.

## 사용자 스토리

Python·Java·Go·Rust 등의 프로젝트에서 Plugin을 사용하는 개발자로서 검증된 provider preset을 선택해
서버별 세부 실행 계약을 직접 구성하지 않고 분석을 시작하고 싶다.

## 범위

- 대상 언어 선정 기준과 지원 등급을 정의한다.
- 언어별 executable 탐색, 기본 인자, languageId와 최소 지원 버전을 preset으로 제공한다.
- provider 부재 시 설치 방법과 진단 가능한 오류를 제공한다.

## 제외 범위

- 모든 Language Server를 CLI package에 번들
- 실제 통합 테스트 없이 공식 지원 언어로 표기

## 수용 기준

- [ ] 우선 대상 언어마다 지원 버전과 설치 조건이 문서화된다.
- [ ] preset으로 single-file 및 cross-file incoming call fixture가 통과한다.
- [ ] preset 감지 실패가 실행 후보와 해결 방법을 포함해 보고된다.
- [ ] 수동 provider 설정은 하위 호환으로 유지된다.

## 검증

- OS별 command discovery 단위 테스트
- 언어별 실제 LSP 통합 테스트와 버전 기록
- Plugin runner를 통한 end-to-end 분석

## 의존성 및 위험

- `IL-LIM-003`, `IL-LIM-005` 및 첫 Python preset의 경우 `IL-LIM-006`에 의존한다.
- 서버 라이선스, 배포 크기와 플랫폼별 설치 방식이 preset 범위를 제한할 수 있다.
