# Impact Lens 개발 관리

이 디렉터리는 제품의 알려진 한계, 개선 스토리, 우선순위와 의존성을 장기적으로 관리한다.
개별 구현을 시작할 때는 해당 스토리를 근거로 GitHub Issue를 만들고, 저장소 규칙에 따라
`docs/work/<issue-or-task>-<short-name>.md`에 구체적인 구현 계획과 작업 로그를 작성한다.

## 관리 규칙

- 상태는 `Backlog`, `Ready`, `In progress`, `Blocked`, `Done` 중 하나를 사용한다.
- 우선순위는 사용자 결과의 정확성과 지원 범위에 미치는 영향으로 정한다.
  - `P0`: 결과의 중대한 미탐 또는 신뢰성 문제
  - `P1`: 주요 언어·환경의 사용 가능성을 제한하는 문제
  - `P2`: 결과 해석, 규모 대응 또는 workflow를 제한하는 문제
  - `P3`: 특정 기능이나 언어에서 우회 가능한 제약
- 영향도 순위와 실행 순서는 다를 수 있다. 선행 조사나 공통 기반 작업은 낮은 순위라도 먼저 진행한다.
- 스토리 상태와 수용 기준이 바뀌면 해당 파일과 이 인덱스를 함께 갱신한다.
- `Done`으로 변경할 때 구현 PR, 검증 결과와 남은 제한 사항을 스토리에 연결한다.

## 한계점 백로그

| 순위 | ID | 우선순위 | 스토리 | 주요 적용 영역 | 상태 |
| ---: | --- | --- | --- | --- | --- |
| 1 | IL-LIM-001 | P0 | [동적·런타임 호출 관계 보완](stories/il-lim-001-dynamic-runtime-calls.md) | Extension, CLI, Plugin | Backlog |
| 2 | IL-LIM-002 | P0 | [프레임워크 DI·라우팅 관계 보완](stories/il-lim-002-framework-di-routing.md) | Extension, CLI, Plugin | Backlog |
| 3 | IL-LIM-003 | P0 | [Language Server 분석 범위 투명성](stories/il-lim-003-provider-coverage-transparency.md) | Extension, CLI, Plugin | Backlog |
| 4 | IL-LIM-004 | P1 | [주요 언어용 기본 provider preset](stories/il-lim-004-first-class-language-presets.md) | CLI, Plugin | Backlog |
| 5 | IL-LIM-005 | P1 | [사용자 지정 LSP 호환성 확장](stories/il-lim-005-custom-lsp-compatibility.md) | CLI, Plugin | Backlog |
| 6 | IL-LIM-006 | P1 | [Python·FastAPI E2E 검증](stories/il-lim-006-python-fastapi-e2e.md) | Extension, CLI, Plugin | Backlog |
| 7 | IL-LIM-007 | P2 | [CLI의 저장하지 않은 buffer 분석](stories/il-lim-007-cli-unsaved-buffers.md) | CLI, Plugin | Backlog |
| 8 | IL-LIM-008 | P2 | [대규모 호출 그래프 제한 개선](stories/il-lim-008-large-graph-traversal-limits.md) | Extension, CLI | Backlog |
| 9 | IL-LIM-009 | P2 | [분석 완료 의미와 불완전성 전달](stories/il-lim-009-completeness-semantics.md) | Extension, CLI, Plugin | Backlog |
| 10 | IL-LIM-010 | P2 | [관련 테스트 탐지 정확도 개선](stories/il-lim-010-test-impact-discovery.md) | Extension, CLI, Plugin | Backlog |
| 11 | IL-LIM-011 | P3 | [호출 가능한 symbol 종류 확장](stories/il-lim-011-callable-symbol-coverage.md) | Extension, CLI | Backlog |
| 12 | IL-LIM-012 | P3 | [Personal note의 CLI 접근 전략](stories/il-lim-012-personal-note-cli-access.md) | CLI, Plugin | Backlog |
| 13 | IL-LIM-013 | P3 | [Source note 주석 문법 확장](stories/il-lim-013-source-note-syntax.md) | Extension, CLI | Backlog |

## 권장 실행 순서

1. `IL-LIM-003`으로 provider 정보, 결과 출처와 불완전성 표현의 공통 기준을 확립한다.
2. `IL-LIM-006`으로 Python/FastAPI 실제 기준선을 만들고 `IL-LIM-005`의 LSP 호환 요구를 구체화한다.
3. `IL-LIM-005`와 `IL-LIM-004`로 CLI/Plugin의 언어 지원 기반과 검증된 preset을 확장한다.
4. `IL-LIM-009`로 사용자가 결과를 과신하지 않도록 완료·부분 결과 의미를 정리한다.
5. `IL-LIM-001`, `IL-LIM-002`에서 provenance가 표시된 보조 관계를 단계적으로 도입한다.
6. `IL-LIM-007`부터 `IL-LIM-013`까지 규모, workflow와 기능별 제약을 독립적으로 개선한다.

## 디렉터리 구조

```text
docs/development-management/
├── README.md       전체 우선순위, 상태와 운영 규칙
└── stories/        한계점별 문제 정의와 수용 기준
```
