# IL-LIM-006 Python·FastAPI E2E 검증

- 상태: Backlog
- 우선순위: P1
- 영향도: 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

Python 선언 anchor 단위 테스트는 있지만 실제 Python Language Server와 FastAPI workspace를 사용한
end-to-end 기준선이 없다. 일반 cross-file 호출과 `Depends()`·decorator 관계 중 무엇이 provider에서
제공되는지 검증 근거가 부족하다.

## 사용자 스토리

Python/FastAPI 사용 개발자로서 설치 조합별로 검증된 지원 범위와 재현 가능한 한계를 확인하고 싶다.

## 범위

- 고정된 Python, FastAPI와 Language Server 버전의 최소 workspace fixture를 만든다.
- same-file, cross-file, async, route decorator와 dependency 관계의 원본 Call Hierarchy를 기록한다.
- Extension과 CLI에서 가능한 범위의 결과를 비교하고 문서화한다.

## 제외 범위

- 이 스토리에서 FastAPI 전용 추론 기능 구현
- 모든 Python Language Server 조합 검증

## 수용 기준

- [ ] 재현 가능한 Python/FastAPI fixture와 실행 절차가 존재한다.
- [ ] 일반 호출, route와 dependency별 기대·미지원 결과가 명시된다.
- [ ] 실제 Language Server 기반 자동 또는 반복 가능한 통합 검사가 수행된다.
- [ ] 검증된 지원 범위가 README/INSTALL과 일치한다.

## 검증

- cold/warm indexing 조건을 구분한 E2E 실행
- provider 원본 Call Hierarchy와 Impact Lens 결과 비교
- Plugin runner를 통한 동일 fixture 분석

## 의존성 및 위험

- `IL-LIM-003`의 provider/version 기록 방식이 필요하다.
- CI 환경의 Python과 Language Server 설치 비용 때문에 별도 integration job이 필요할 수 있다.
