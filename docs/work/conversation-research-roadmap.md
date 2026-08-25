# 대화 기반 한계 연구의 개발 로드맵 반영

## 배경과 해결할 문제

Impact Lens의 Language Server 의존성, DI·동적 호출 한계와 다중 언어 지원을 검토하는 과정에서
현재 스토리 백로그가 공통 아키텍처는 설명하지만 실제 사용자 경험과 언어별 완료 조건을 충분히
고정하지 못한다는 점이 확인됐다.

특히 Python 파일을 Plugin에서 분석하면서 provider를 생략했을 때 Python provider 부재를 설명하지 않고
기본 TypeScript Language Server를 실행한 뒤 `provider_unavailable`로 종료되는 사례가 있었다. 이는 다음
문제를 동시에 드러낸다.

- 사용자가 Language Server command, args와 languageId를 알아야 하는 저수준 설정 노출
- 대상 언어와 기본 provider가 맞지 않아도 실행하는 fallback
- child process exit의 stderr와 단계 정보가 부족한 진단
- 언어별 build metadata, indexing과 toolchain 준비 상태를 구분하지 못하는 계약
- provider가 정상이어도 DI, reflection, function pointer와 dynamic dispatch가 남는 의미적 한계
- C/C++, Swift와 Kotlin을 지원 후보로 검토했지만 독립된 수용 기준과 E2E story가 없는 상태
- 기본 지원 대상인 JavaScript/JSX에서도 packaged TypeScript Language Server가 Linux Plugin 환경에서
  `Language Server exited (1):`로 종료되어 runner·artifact·runtime 조합의 release 검증이 부족한 상태

## 범위

- 대화에서 확인된 우려와 연구 결과를 기존 limitation story에 연결한다.
- provider 선택 UX, 언어 불일치 방지와 process 진단 요구를 `IL-LIM-003`~`006`에 구체화한다.
- C/C++ clangd, Swift SourceKit-LSP와 Kotlin LSP 지원을 독립 story로 추가한다.
- Plugin runner, CLI artifact, Node runtime과 bundled provider launch 신뢰성을 독립 P0 story로 추가한다.
- 언어별 동적 dispatch, framework DI, callable과 Source note 요구를 기존 story의 fixture와 의존성에 연결한다.
- 개발 관리 인덱스의 영향도 순위, 실행 wave와 디렉터리 구조를 갱신한다.

## 범위에서 제외할 항목

- 이번 작업에서 provider preset, adapter 또는 runtime inference를 구현하지 않는다.
- 실제 외부 Language Server를 설치하거나 E2E를 실행하지 않는다.
- 아직 검증하지 않은 언어를 공식 지원 또는 `verified-external`로 승격하지 않는다.
- 사용자 동의 없이 compiler, build, package sync나 application을 실행하는 계획을 채택하지 않는다.

## 현재 구현 및 문서 조사 결과

- CLI는 provider가 없으면 대상 확장자와 무관하게 packaged `typescript-language-server`를 선택한다.
- custom provider 계약은 `command`, `args`, `languageId`만 허용하며 project-level preset이나 자동 discovery가 없다.
- `JsonRpcClient`는 server→client request를 처리하지 못하고 child의 `exit` 이벤트 시점에 stderr를 읽기 때문에
  stream drain 전 오류 상세가 유실될 가능성이 있다.
- `IL-LIM-004`는 Python·Java·Go·Rust와 다음 후보인 clangd를 언급하지만 Swift와 Kotlin은 없고,
  언어별 build/index readiness 및 zero-config acceptance가 없다.
- `IL-LIM-005`는 양방향 LSP와 settings/readiness를 계획하지만 process launch 진단과 언어별 실제 matrix가 부족하다.
- `IL-LIM-006`은 Python/FastAPI E2E를 계획하지만 “provider 없는 Python 요청이 TypeScript로 fallback하지
  않는다”는 회귀 조건이 없다.
- Plugin cache의 runner로 올바른 `.jsx` symbol을 요청해도 bundled TypeScript Language Server가 code 1과
  빈 stderr로 종료된 사례가 있다. 이는 언어 preset 확대 이전에 현재 bundled 지원의 release artifact와
  runtime resolution을 실제 설치 형태로 검증해야 함을 보여준다.
- 동적 호출과 framework story는 일반 provenance 및 FastAPI 1차 adapter를 잘 정의했으나 C/C++ function
  pointer·virtual dispatch, Swift protocol/closure·Objective-C runtime, Kotlin interface/lambda와 Spring/Koin
  같은 구체적인 후속 fixture가 없다.
- LLVM clangd는 표준 Call Hierarchy를 구현하고, SourceKit-LSP는 Swift toolchain/Xcode에 포함되며 build/index
  상태에 영향을 받고, JetBrains Kotlin LSP는 Call Hierarchy를 제공하지만 현재 Alpha 상태다. 따라서 세 언어는
  동일 preset 하나가 아니라 독립 검증 story가 필요하다.

## 단계별 구현 계획

1. 기존 story와 대화 우려의 coverage matrix를 만들고 누락 사항을 확정한다.
2. `IL-LIM-003`에 provider 선택 근거, 언어 일치와 실패 단계 진단을 추가한다.
3. `IL-LIM-004`에 Auto 기본 UX, preset/custom escape hatch와 no-silent-fallback 계약을 추가한다.
4. `IL-LIM-005`에 process lifecycle/stderr 진단, build readiness와 실제 provider profile 요구를 추가한다.
5. `IL-LIM-006`에 관측된 Python 실패를 회귀 fixture와 Plugin zero-config 수용 기준으로 추가한다.
6. `IL-LIM-001`, `002`, `011`, `013`에 새 언어의 동적 호출·DI·callable·note fixture 의존성을 연결한다.
7. C/C++, Swift와 Kotlin을 각각 독립 story로 작성하고 공통 preset/LSP story에 의존시킨다.
8. Plugin runner·artifact·Node·bundled provider 실행 신뢰성을 독립 P0 story로 작성한다.
9. 개발관리 README의 영향도 순위, 실행 wave, story 수와 구조를 갱신한다.
10. 필수 section, 링크, 우선순위, 의존성과 Markdown diff를 검사한다.

## 테스트 및 완료 기준

- 신규 언어 story 3개가 각각 문제, 범위/제외, 수용 기준, 조사, 결정, 단계별 계획, 테스트,
  rollout과 미해결 질문을 포함한다.
- Python provider 실패 사례가 `IL-LIM-003`, `004`, `005`, `006`에서 서로 모순 없이 역할별로 연결된다.
- C/C++·Swift·Kotlin의 build metadata, indexing, dynamic/DI 한계와 안전한 자동화 경계가 명시된다.
- Python의 wrong-provider 사례와 JavaScript의 bundled-provider crash 사례가 서로 다른 회귀 조건으로 기록된다.
- 인덱스의 모든 story 링크가 존재하고 순위와 실행 wave가 갱신된다.
- `git diff --check`와 문서 구조 검사가 통과한다.
- 문서 전용 변경임을 작업 로그에 기록하고 변경을 독립 커밋으로 남긴다.

## 작업 로그

- 2026-08-25: 기존 13개 story와 개발관리 인덱스를 재검토했다. 공통 provider/LSP 설계는 있으나
  C/C++은 후보 언급뿐이고 Swift·Kotlin은 명시되지 않았으며, 관측된 Python fallback/빈 stderr 실패가
  수용 기준에 없음을 확인했다.
- 2026-08-25: 이번 작업은 코드 구현이 아니라 연구·계획 문서 보강으로 한정했다. 실제 지원 선언은
  언어별 provider/version E2E evidence가 확보된 이후로 미뤘다.
- 2026-08-25: 대화 중 Linux Plugin 환경에서 `.jsx`의 `formatDate` 분석도 bundled TypeScript Language
  Server exit code 1과 빈 stderr로 실패한 두 번째 사례를 확인했다. provider 선택만 고쳐서는 해결되지
  않으므로 설치된 Plugin runner와 release tarball을 대상으로 하는 별도 신뢰성 story가 필요하다고 결정했다.
- 2026-08-25: `IL-LIM-003`에는 requested/detected language, `selectedBy`, lifecycle stage와 stderr 진단을,
  `IL-LIM-004`에는 Auto → preset → advanced custom UX와 타 언어 fallback 금지를 추가했다. `IL-LIM-005`에는
  양방향 LSP뿐 아니라 spawn/exit/close, build metadata readiness와 사용자 승인 경계를 추가했고,
  `IL-LIM-006`에는 provider 없는 Python 요청을 실제 회귀 조건으로 고정했다.
- 2026-08-25: `IL-LIM-014` C/C++ clangd, `IL-LIM-015` Swift SourceKit-LSP, `IL-LIM-016` Kotlin LSP를
  독립 story로 추가했다. 각 story는 5개 수용 기준, 5단계 계획, 실제 provider E2E, build/index 조건,
  dynamic/framework gap, 안전한 rollout과 rollback을 포함한다.
- 2026-08-25: 기본 JS/JSX 실패는 external language 확대와 다른 release-blocking 결함으로 판단하여
  `IL-LIM-017`을 P0로 추가했다. runner resolution provenance, 모든 경로의 Node preflight, stderr drain,
  clean tarball/Plugin cache E2E와 OS·TS/TSX/JS/JSX release gate를 요구한다.
- 2026-08-25: `IL-LIM-001`에 C/C++ function pointer·virtual dispatch, Swift protocol/closure, Kotlin
  interface/lambda fixture를 연결했다. `IL-LIM-002`에는 Spring bean resolution을 confirmed/candidate/
  runtime-only로 분류하는 후속 feasibility 단계를 추가하고 Koin, Dagger/Hilt와 Swift DI는 별도 adapter로
  다루기로 했다. `IL-LIM-011/013`에는 새 언어의 callable과 명시 comment syntax fixture를 연결했다.
- 2026-08-25: 개발관리 README를 17개 backlog로 갱신하고 실행 순서를 `003 → 017 → Python baseline →
  005 → 004 → 언어별 E2E → 009 → 의미 보완`으로 재정렬했다. provider 명시를 일반 사용자 UX에서
  제거하고 자동 설치·configure·Gradle sync·Swift build는 하지 않는 것을 공통 원칙으로 확정했다.
- 2026-08-25: 문서 구조 검사 결과 17/17 story가 문제, 사용자 story, 범위/제외, 수용 기준, 현재 기준선,
  조사, 대안, 권장 대응, 단계별 계획, 테스트, rollout과 미해결 질문을 모두 포함했다. 인덱스 17개 링크는
  누락 0개였고 신규 4개 story는 각각 수용 기준 5개, 구현 단계 5개와 공식/1차 출처 링크를 포함했다.
- 2026-08-25: `git diff --check`가 통과했다. 첫 링크 검사에서 zsh 특수 변수 `path`를 임시 변수로 사용해
  해당 검사 process의 PATH가 덮였으나 파일 변경은 없었고, 안전한 변수명으로 다시 실행해 17개 링크와
  section 검사를 통과했다.
- 2026-08-25: 변경은 계획 문서 전용이므로 compile/runtime test는 실행하지 않았다. Linux의 두
  `Language Server exited (1)` 사례는 원격 환경 metadata가 없어 root cause를 확정하거나 해결하지 않았으며,
  구현 시 `IL-LIM-017` 1단계의 재현/doctor artifact로 확인해야 한다.
- 2026-08-25: 첫 staged `git diff --cached --check`에서 신규 언어 story 3개의 EOF 여분 빈 줄을 발견해
  제거했다. 내용 변경 없이 Markdown whitespace를 정리한 뒤 전체 staged 검사를 다시 수행한다.
