# 한계점별 대응 연구와 상세 계획

## 배경과 해결할 문제

`docs/development-management/stories/`에는 Impact Lens의 한계점 13개가 영향도 순으로 분리되어 있지만,
각 문서는 아직 문제·범위·수용 기준 중심의 초기 백로그다. 실제 구현 착수에 필요한 현재 코드 접점,
표준과 공식 도구의 지원 범위, 대안 비교, 단계별 변경 계획, 테스트 matrix와 rollout 기준이 충분히
구체화되어 있지 않다.

각 스토리를 P0, P1, P2, P3 순서로 조사하고, 구현자가 추가적인 기초 조사 없이 설계 작업을 시작할 수
있도록 대응 전략과 상세 실행 계획을 해당 스토리 파일에 기록한다.

## 범위

- 13개 스토리를 높은 우선순위부터 차례로 조사한다.
- 저장소 구현과 테스트에서 스토리별 현재 기준선과 변경 접점을 확인한다.
- 관련 LSP·VS Code·언어 서버·프레임워크의 공식 문서와 표준을 우선 조사한다.
- 각 스토리에 조사 결과, 대안과 결정, 단계별 대응 계획, 예상 변경 영역, 테스트 matrix,
  rollout·관측 기준과 미해결 질문을 추가한다.
- 공통 인덱스에 상세 계획의 읽는 순서와 공통 설계 원칙을 반영한다.

## 범위에서 제외할 항목

- 스토리의 제품 코드 구현
- GitHub Issue, milestone 또는 프로젝트 보드 생성
- 외부 서비스·사용자 설정 변경
- 조사 근거 없이 일정, 담당자 또는 출시 버전 확정

## 현재 구현 조사 결과

- 현재 브랜치 `docs/limitations-story-backlog`은 `origin/main`보다 문서 커밋 1개 앞서 있고 worktree는 clean하다.
- 각 스토리는 공통 필수 섹션과 수용 기준을 갖지만 구체적인 코드 변경 순서와 외부 표준 근거가 없다.
- 분석 경로는 Extension의 VS Code Call Hierarchy와 CLI의 `LspCallHierarchyProvider`로 분리되어 있다.
- graph, limitation, note와 provider 관련 구현이 `src/`와 `cli/src/`에 각각 존재하므로 스토리별로
  공통 모델 변경과 host별 adapter 변경을 구분해야 한다.

## 단계별 구현 계획

1. P0(`IL-LIM-001`~`003`)의 분석 정확성·provider 투명성 대응을 조사하고 상세화한다.
2. P1(`IL-LIM-004`~`006`)의 언어 preset·LSP 호환성·Python/FastAPI 검증 계획을 상세화한다.
3. P2(`IL-LIM-007`~`010`)의 overlay, 확장 탐색, completeness와 테스트 탐지 계획을 상세화한다.
4. P3(`IL-LIM-011`~`013`)의 symbol, Personal note bridge와 주석 문법 계획을 상세화한다.
5. 스토리 간 공통 모델, 선행 관계와 중복 작업을 교차 검토하고 인덱스를 갱신한다.
6. 필수 상세 섹션, 링크, Markdown diff를 검증하고 작업 로그를 갱신한다.
7. 관련 문서만 독립 커밋으로 남긴다.

## 테스트 및 완료 기준

- 13개 스토리 모두 `현재 기준선`, `조사 결과`, `권장 대응`, `단계별 계획`, `예상 변경 영역`,
  `테스트 계획`, `rollout과 관측`, `미해결 질문`을 포함한다.
- 조사 내용은 가능한 경우 공식 표준·제품 문서를 직접 연결하고, 저장소 근거는 실제 파일과 일치한다.
- 각 단계는 선행 조건과 종료 조건이 있어 독립 Issue로 더 분할할 수 있다.
- 공통 인덱스에서 우선순위 순서와 권장 실행 순서의 차이를 이해할 수 있다.
- 모든 새 로컬 Markdown 링크와 외부 참고 링크 형식이 유효하다.
- `git diff --check`가 통과한다.
- 제품 코드를 변경하지 않았음을 확인하고 문서 변경만 커밋한다.

## 작업 로그

- 2026-08-25: 사용자 요청에 따라 기존 초기 백로그와 분리된 상세 연구 작업 문서를 만들었다.
- 2026-08-25: 작업 시작 시 branch는 `docs/limitations-story-backlog`, worktree는 clean,
  HEAD는 초기 스토리 백로그 커밋 `3565e66`임을 확인했다.
- 2026-08-25: P0 `IL-LIM-001`~`003`을 먼저 조사했다. LSP 3.17 Call Hierarchy/initialize,
  VS Code CallHierarchyProvider, gopls의 정적 graph 경계, Python AST와 FastAPI dependency 공식 문서를
  근거로 edge provenance와 structured coverage를 공통 선행 기반으로 결정했다. 동적·framework 관계를
  기존 Language Server edge와 동일한 확정 관계로 섞지 않고 adapter별 evidence로 표시한다.
- 2026-08-25: P1 `IL-LIM-004`~`006`을 조사했다. typescript-language-server와 gopls 공식 설정,
  Python server 설정, Pylance FAQ와 Python LSP 비교 도구를 검토했다. Pylance는 공식 VS Code와
  GitHub Codespaces 안에서만 사용할 수 있으므로 Extension E2E lane과 독립 CLI provider lane을
  분리하고, CLI preset은 license·capability·실제 fixture를 통과한 external server만 승격하기로 했다.
- 2026-08-25: P2 `IL-LIM-007`~`010`을 조사했다. LSP document synchronization, request cancellation과
  VS Code Testing API를 바탕으로 CLI overlay는 bounded full-text didOpen, 대형 graph는 Extension session
  frontier와 CLI reprepare continuation, 완료 표시는 다축 상태, 테스트 탐지는 evidence 기반 후보와
  실제 실행 결과 분리 방식으로 계획했다.
- 2026-08-25: P3 `IL-LIM-011`~`013`을 조사했다. VS Code DocumentSymbol/CallHierarchyItem,
  ExtensionContext workspaceState와 Language Configuration 문서를 근거로 callable은 provider별 policy와
  bounded probe로 확장하고, Personal note는 storage 직접 접근 대신 명시적 Personal↔Local 복사,
  Source note는 공유 registry와 unknown-language fail-closed로 대응하기로 했다.
- 2026-08-25: 13개 스토리 각각에 현재 기준선, 조사 결과, 대안 검토와 결정, 권장 대응, 4~5단계 계획,
  예상 변경 영역, 테스트 matrix, rollout·관측과 미해결 질문을 추가했다. 총 21개의 중복 제거된 공식
  참고 URL을 사용했고 구현 파일 경로는 현재 source와 대조했다.
- 2026-08-25: `docs/development-management/README.md`에 근거 우선, 안전 기본값, host 경계,
  점진적 계약 변경, 검증 후 지원 선언과 사용자 실행권 보존 원칙을 추가했다. 영향도 순위와 별도로
  `003/006` 기반선부터 시작하는 5개 실행 wave를 기록했다.
- 2026-08-25: 구조 검사를 실행해 상세 필수 섹션 9종이 각각 13/13, P0/P1/P2/P3 분포가 3/3/4/3,
  스토리별 단계가 4개 이상이고 각 스토리에 외부 조사 링크가 최소 1개 있음을 확인했다.
- 2026-08-25: 이번 작업은 연구와 구현 계획을 기록하는 문서 전용 변경이다. 제품 코드, schema와 설정은
  변경하지 않았으므로 compile/runtime test는 실행하지 않고 구조, 링크, Markdown diff를 완료 검증으로 사용한다.
- 2026-08-25: 최종 staging 범위가 관리 인덱스, 스토리 13개와 본 작업 문서 총 15개뿐임을 확인했고
  `git diff --cached --check`가 통과했다. 기존 초기 백로그 커밋이나 제품 파일의 미반영 변경은 없다.
