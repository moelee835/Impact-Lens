# Impact Lens 한계 개선 마일스톤

이 디렉터리는 개별 한계점 story를 사용자가 검증할 수 있는 릴리스 단위로 묶는다. 날짜나 version을 먼저
고정하지 않고, 앞 마일스톤의 종료 gate를 다음 마일스톤의 진입 조건으로 사용한다.

각 마일스톤의 기능과 UI가 자동 E2E를 통과하면 실제 사용자가 수행할 테스트를 별도 명세로 제안한다.
현재는 case를 작성하거나 실행하지 않으며, 작성 시점·필수 항목과 증거 규칙은
[마일스톤별 사용자 테스트 명세 계획](user-validation-planning.md)을 따른다.

## 전체 순서

| 순서 | 마일스톤 | 완료 소유 story | 선행 기여 story | 사용자 결과 | 상태 |
| ---: | --- | --- | --- | --- | --- |
| M0 | [Provider 실행 신뢰성](m0-provider-runtime-trust.md) | IL-LIM-003, 017 | IL-LIM-006 1~2단계 | JS/TS Plugin 분석이 배포 환경에서 재현 가능하고 실패 원인이 구분됨 | In progress |
| M1 | [Provider 플랫폼과 무설정 UX 기반](m1-provider-platform-ux.md) | IL-LIM-005, 009 | IL-LIM-004 1~2단계 | Auto/doctor/custom의 일관된 계약과 과신하지 않는 결과 의미 | Planned |
| M2 | [Python·Go·C/C++ verified support](m2-p1-language-support.md) | IL-LIM-004, 006, 014 | 없음 | 우선 언어를 raw provider JSON 없이 분석하고 준비 문제를 안내 | Planned |
| M3 | [Swift·Kotlin 및 callable 확장](m3-p2-language-callables.md) | IL-LIM-015, 016, 011 | 없음 | toolchain 기반 언어와 검증된 callable syntax 지원 | Planned |
| M4 | [동적 호출·DI·테스트 의미 보완](m4-semantic-augmentation.md) | IL-LIM-001, 002, 010 | 없음 | provenance가 있는 동적/framework/test evidence로 주요 미탐 감소 | Planned |
| M5 | [편집 중 분석과 대규모 workspace](m5-workspace-workflow.md) | IL-LIM-007, 008 | 없음 | 저장 전 변경과 큰 graph에서도 제한이 예측 가능한 workflow | Planned |
| M6 | [Note 접근성과 언어별 마무리](m6-notes-language-polish.md) | IL-LIM-012, 013 | 없음 | CLI note 접근 전략과 안전한 언어별 source note 문법 | Planned |

## 의존 관계

```text
M0 실행 신뢰성
 └─ M1 provider 플랫폼·UX
     └─ M2 Python·Go·C/C++
         └─ M3 Swift·Kotlin·callable
             └─ M4 동적·DI·test evidence
                 ├─ M5 편집·대규모 workflow
                 └─ M6 note·언어별 마무리
```

M5와 M6는 M4 종료 후 병렬 착수할 수 있지만, 기본 실행 순서는 사용자 영향이 더 큰 M5를 먼저 둔다.
M4는 M3의 모든 언어 지원이 필수라서 늦는 것이 아니라, 최소 M2의 안정된 provider/coverage contract와
대표 언어 fixture가 필요하다. Swift/Kotlin 일정이 길어지면 M4 spike는 먼저 수행할 수 있으나 semantic
augmentation의 공식 release gate는 evidence schema가 모든 검증 언어에서 유지되는지 확인한다.

## Story 소유권

| Story | 완료 마일스톤 | 선행 단계 | 비고 |
| --- | --- | --- | --- |
| IL-LIM-001 | M4 | M0~M2 | 동적 edge는 evidence/provenance 계약 후 추가 |
| IL-LIM-002 | M4 | M0~M2 | Spring Java/Kotlin을 첫 framework adapter 후보로 사용 |
| IL-LIM-003 | M0 | 구현 완료 | PR·release 검증 후 Done 전환 |
| IL-LIM-004 | M2 | M1 1~2단계 | M1에서 catalog/doctor 기반, M2에서 verified preset으로 완료 |
| IL-LIM-005 | M1 | M0 | generic LSP lifecycle·transport·compatibility 기반 |
| IL-LIM-006 | M2 | M0 1~2단계 | M0에서 실패 baseline, M2에서 Python support gate 완료 |
| IL-LIM-007 | M5 | M1 | saved/unsaved overlay와 content provenance |
| IL-LIM-008 | M5 | M1 | budget·pagination·resume 가능성 검증 |
| IL-LIM-009 | M1 | M0 | partial/incomplete 사용자 의미 확정 |
| IL-LIM-010 | M4 | M2 | test evidence와 실행 상태 분리 |
| IL-LIM-011 | M3 | M2, M3 언어 fixture | 언어별 callable matrix가 준비된 뒤 완료 |
| IL-LIM-012 | M6 | M1 | Personal note host 경계 또는 bridge 결정 |
| IL-LIM-013 | M6 | M2, M3 | 검증된 언어 문법만 opt-in |
| IL-LIM-014 | M2 | M1 | clangd와 compile database readiness |
| IL-LIM-015 | M3 | M1 | SourceKit-LSP와 SwiftPM/Xcode 경계 |
| IL-LIM-016 | M3 | M1 | Kotlin LSP Alpha와 Gradle/Maven readiness |
| IL-LIM-017 | M0 | IL-LIM-003 구현 | packed artifact와 Plugin cache 실행 신뢰성 |

## 운영 규칙

- Story 상태는 실제 구현 상태를 나타내고, milestone 상태는 소속 story와 종료 gate를 함께 반영한다.
- 완료 소유 story는 하나만 둔다. 앞 마일스톤에서 수행하는 일부 단계는 `선행 기여`로 표시한다.
- milestone을 `Done`으로 바꾸려면 모든 완료 소유 story가 Done이고 공통 종료 gate가 통과해야 한다.
- 각 milestone의 release candidate 단계에서 사용자 테스트 명세를 작성하고 별도 실행 여부를 결정한다.
  명세 작성이나 자동 테스트를 실제 사용자 검증 통과로 대체하지 않는다.
- 한 언어나 provider가 실패해도 다른 독립 언어의 검증 결과를 숨기지 않는다. 단, milestone 완료 여부는
  문서에 명시한 필수/experimental 범위를 따른다.
- 자동 설치, build, sync, test 실행은 별도 사용자 승인 없이는 milestone 완료 수단으로 사용하지 않는다.
- 날짜와 version은 team capacity와 release 결정이 생길 때 별도 issue에 지정한다. 이 문서는 의존성과
  완료 조건을 관리한다.
- 각 상세 문서의 최상위 구현 단계는 `AGENTS.md`의 stage gate를 따른다. 검증·작업 로그·독립 commit·동일
  이름의 원격 개발 branch push가 끝나기 전에는 다음 단계로 진행하거나 milestone 진행률에 반영하지 않는다.
- milestone 작업을 `main`/`master`에서 직접 수행하거나 push하지 않는다. 전용 개발 branch에서 단계별로
  push하고 Pull Request를 통해서만 통합한다.

## 진행률 계산

- Story checklist 개수 대신 완료 소유 story와 milestone 공통 gate를 각각 확인한다.
- `IL-LIM-004`, `IL-LIM-006`의 선행 단계가 끝나도 completion milestone 전에는 story를 Done으로 세지 않는다.
- experimental 언어는 지원 등급과 검증 version을 명시하면 milestone gate에 포함할 수 있지만,
  `verified-external`과 같은 표현을 사용하려면 해당 OS/provider fixture를 모두 통과해야 한다.
