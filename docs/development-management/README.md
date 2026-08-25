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

## 상세 계획 읽는 법

각 스토리의 초기 문제 정의 뒤에는 현재 코드 기준선, 공식 표준·도구 조사, 대안 비교와 권장 대응이
이어진다. `단계별 계획`의 각 단계는 별도 GitHub Issue로 분리할 수 있는 크기를 목표로 하며,
단계의 종료 조건을 충족하기 전에는 다음 단계의 지원을 공식화하지 않는다.

공통 설계 원칙은 다음과 같다.

- **근거 우선**: Language Server, 정적 추론과 runtime 관측 결과의 출처를 섞지 않는다.
- **안전 기본값**: 모호한 관계나 주석 문법을 추측하지 않고 limitation 또는 unsupported로 반환한다.
- **host 경계 유지**: VS Code 전용 API·Pylance와 독립 CLI에서 실행 가능한 LSP를 구분한다.
- **점진적 계약 변경**: CLI JSON은 optional field를 먼저 추가하고 schema 제거·이름 변경은 version을 올린다.
- **검증 후 지원 선언**: 실제 provider/version fixture가 없는 언어·pattern은 verified support로 표시하지 않는다.
- **사용자 실행권 보존**: 프로그램, test와 framework app을 자동 실행하지 않고 명시적 입력·승인을 요구한다.
- **무설정 기본 경험**: 일반 사용자는 provider command·args·languageId를 작성하지 않으며 Auto가 실패하면
  raw 설정 대신 먼저 설치·호환·준비 상태와 해결 방법을 받는다.
- **언어 불일치 금지**: 호환 provider가 없을 때 다른 언어의 bundled provider로 fallback하지 않는다.
- **배포 artifact 우선 검증**: source test뿐 아니라 실제 CLI tarball과 Plugin cache 설치 형태에서 bundled
  provider를 검증한다.

## 관측된 실패와 해결 스토리

| 관측 사례 | 실패 분류 | 주 해결 스토리 | 구현 후 기대 결과 |
| --- | --- | --- | --- |
| provider 없는 Python 요청이 TypeScript server exit로 종료 | 잘못된 provider 선택·Python 미검증 | IL-LIM-003, 004, 006 | Python Auto preset 또는 Python 전용 actionable error, 타 언어 fallback 금지 |
| JavaScript/JSX 요청에서 bundled TypeScript server가 code 1·빈 stderr로 종료 | Plugin/CLI/runtime/artifact 신뢰성 | IL-LIM-017, 003, 005 | clean-install release E2E, startup preflight와 단계·stderr 진단 |
| provider는 정상이나 DI·동적 호출 caller가 없음 | 의미적 coverage 한계 | IL-LIM-001, 002, 009 | 확정·추론·runtime-only 관계와 불완전성 분리 |

첫 번째와 두 번째 사례는 모두 `provider_unavailable`처럼 보였지만 원인과 해결책이 다르다. 두 번째 사례는
`IL-LIM-003/005`만으로 진단은 개선돼도 정상 실행을 보장하지 않으므로 `IL-LIM-017`의 packed artifact와
Plugin cache E2E까지 완료해야 해결된 것으로 본다.

구조화된 상태의 공통 의미와 오류 단계는 [Provider와 coverage 계약](provider-coverage-contract.md)을 따른다.

## 한계점 백로그

| 순위 | ID | 우선순위 | 스토리 | 주요 적용 영역 | 상태 |
| ---: | --- | --- | --- | --- | --- |
| 1 | IL-LIM-001 | P0 | [동적·런타임 호출 관계 보완](stories/il-lim-001-dynamic-runtime-calls.md) | Extension, CLI, Plugin | Backlog |
| 2 | IL-LIM-002 | P0 | [프레임워크 DI·라우팅 관계 보완](stories/il-lim-002-framework-di-routing.md) | Extension, CLI, Plugin | Backlog |
| 3 | IL-LIM-003 | P0 | [Language Server 분석 범위 투명성](stories/il-lim-003-provider-coverage-transparency.md) | Extension, CLI, Plugin | In progress |
| 4 | IL-LIM-017 | P0 | [Plugin provider 실행·배포 신뢰성](stories/il-lim-017-plugin-provider-runtime-reliability.md) | CLI, Plugin, Release | Backlog |
| 5 | IL-LIM-004 | P1 | [주요 언어용 기본 provider preset](stories/il-lim-004-first-class-language-presets.md) | CLI, Plugin | Backlog |
| 6 | IL-LIM-005 | P1 | [사용자 지정 LSP 호환성 확장](stories/il-lim-005-custom-lsp-compatibility.md) | CLI, Plugin | Backlog |
| 7 | IL-LIM-006 | P1 | [Python·FastAPI E2E 검증](stories/il-lim-006-python-fastapi-e2e.md) | Extension, CLI, Plugin | Backlog |
| 8 | IL-LIM-014 | P1 | [C/C++ clangd 지원 검증](stories/il-lim-014-c-cpp-clangd-support.md) | Extension, CLI, Plugin | Backlog |
| 9 | IL-LIM-015 | P2 | [Swift SourceKit-LSP 지원 검증](stories/il-lim-015-swift-sourcekit-lsp-support.md) | Extension, CLI, Plugin | Backlog |
| 10 | IL-LIM-016 | P2 | [Kotlin LSP 지원 검증](stories/il-lim-016-kotlin-lsp-support.md) | Extension, CLI, Plugin | Backlog |
| 11 | IL-LIM-007 | P2 | [CLI의 저장하지 않은 buffer 분석](stories/il-lim-007-cli-unsaved-buffers.md) | CLI, Plugin | Backlog |
| 12 | IL-LIM-008 | P2 | [대규모 호출 그래프 제한 개선](stories/il-lim-008-large-graph-traversal-limits.md) | Extension, CLI | Backlog |
| 13 | IL-LIM-009 | P2 | [분석 완료 의미와 불완전성 전달](stories/il-lim-009-completeness-semantics.md) | Extension, CLI, Plugin | Backlog |
| 14 | IL-LIM-010 | P2 | [관련 테스트 탐지 정확도 개선](stories/il-lim-010-test-impact-discovery.md) | Extension, CLI, Plugin | Backlog |
| 15 | IL-LIM-011 | P3 | [호출 가능한 symbol 종류 확장](stories/il-lim-011-callable-symbol-coverage.md) | Extension, CLI | Backlog |
| 16 | IL-LIM-012 | P3 | [Personal note의 CLI 접근 전략](stories/il-lim-012-personal-note-cli-access.md) | CLI, Plugin | Backlog |
| 17 | IL-LIM-013 | P3 | [Source note 주석 문법 확장](stories/il-lim-013-source-note-syntax.md) | Extension, CLI | Backlog |

## 마일스톤 실행 순서

기존 실행 wave는 사용자 산출물과 종료 gate가 있는 [M0~M6 마일스톤](milestones/README.md)으로
구체화했다. bundled provider와 실제 Plugin artifact가 안정적이지 않으면 external preset 결과도 신뢰할 수
없고, provider/coverage 의미가 안정되기 전에 동적·DI edge를 추가하면 사용자가 추론 결과를 확정 관계로
오해할 수 있으므로 다음 순서를 사용한다.

각 마일스톤의 자동 E2E 이후에는 [사용자 테스트 명세 계획](milestones/user-validation-planning.md)에 따라
실제 사용자가 수행할 과업·환경·기대 결과·관측 지표와 판정 기준을 별도 제안한다. 현재 milestone 계획
단계에서는 상세 test case를 작성하거나 실행하지 않는다.

| 순서 | 마일스톤 | 핵심 완료 story | 종료 결과 |
| ---: | --- | --- | --- |
| M0 | [Provider 실행 신뢰성](milestones/m0-provider-runtime-trust.md) | IL-LIM-003, 017 | packed CLI와 Plugin cache에서 JS/TS provider 신뢰성 확보 |
| M1 | [Provider 플랫폼·무설정 UX](milestones/m1-provider-platform-ux.md) | IL-LIM-005, 009 | Auto/doctor/custom과 completeness 기반 확립 |
| M2 | [Python·Go·C/C++ 지원](milestones/m2-p1-language-support.md) | IL-LIM-004, 006, 014 | 우선 언어 verified preset과 readiness 안내 |
| M3 | [Swift·Kotlin·callable](milestones/m3-p2-language-callables.md) | IL-LIM-015, 016, 011 | toolchain 언어와 검증 callable 확장 |
| M4 | [동적·DI·테스트 의미 보완](milestones/m4-semantic-augmentation.md) | IL-LIM-001, 002, 010 | provenance가 있는 semantic evidence graph |
| M5 | [편집·대규모 workspace](milestones/m5-workspace-workflow.md) | IL-LIM-007, 008 | unsaved overlay와 bounded/resumable graph |
| M6 | [Note·언어별 마무리](milestones/m6-notes-language-polish.md) | IL-LIM-012, 013 | Personal note 전략과 안전한 source note 문법 |

`IL-LIM-004`는 M1에서 preset/doctor 기반을 만들고 M2의 실제 언어 fixture로 완료한다. `IL-LIM-006`은
M0에서 관측 실패 baseline을 고정하고 M2에서 Python 지원 gate를 완료한다. 나머지 story는 하나의 완료
마일스톤만 가진다.

## 디렉터리 구조

```text
docs/development-management/
├── README.md       전체 우선순위, 상태와 운영 규칙
├── milestones/     M0~M6 산출물, 진입 조건과 종료 gate
└── stories/        한계점·언어·배포 신뢰성별 문제 정의와 수용 기준(현재 17개)
```
