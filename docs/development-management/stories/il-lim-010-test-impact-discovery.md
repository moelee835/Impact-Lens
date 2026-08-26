# IL-LIM-010 관련 테스트 탐지 정확도 개선

- 상태: Backlog
- 우선순위: P2
- 완료 마일스톤: [M4 — 동적 호출·DI·테스트 의미 보완](../milestones/m4-semantic-augmentation.md)
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

## 현재 기준선

- Extension `src/testFile.ts`와 CLI `cli/src/testFile.ts`가 유사하지만 별도 구현된 경로·파일명 regex로
  test caller를 분류한다.
- graph에 들어온 Call Hierarchy node만 분류하므로 provider가 반환하지 않은 test 관계는 후보에도 없다.
- `TestFreshness`는 `notRun | outdated`뿐이며 실제 test run result와 연결되지 않는다.
- 사용자 지정 include/exclude convention과 분류 근거 필드는 없다.

## 조사 결과

- [VS Code Testing API](https://code.visualstudio.com/api/extension-guides/testing)는 test extension이
  `TestController`와 `TestItem`으로 자체 test를 발견·게시하는 구조다. 공개 문서상 Impact Lens가 다른
  extension의 controller 전체를 열거해 공통 test inventory로 쓰는 API는 제공되지 않는다.
- test discovery와 test execution은 별도 단계이며, VS Code Testing API도 lazy discovery와 run profile을
  구분한다. Impact Lens 역시 “관련 후보”와 “실행 결과”를 분리해야 한다.
- CLI에는 언어 중립적인 표준 test discovery protocol이 없으므로 filename heuristic을 완전히 제거할 수 없다.
- coverage 결과는 실제 실행된 file/line 근거를 줄 수 있지만 특정 변경 symbol과 test의 인과관계를
  자동으로 보장하지 않는다.

## 대안 검토와 결정

1. **regex만 계속 확장**: 유지 비용과 오탐이 증가하고 근거를 설명하기 어렵다.
2. **모든 test runner 직접 통합**: 범위가 과도하고 임의 실행 위험이 있어 제외한다.
3. **evidence 기반 후보 분류 + 설정 가능한 convention + optional adapter/import**: 단계적으로 정확도를
   높일 수 있어 권장한다.
4. **VS Code의 다른 test extension 내부 API 사용**: 공개 API 안정성이 없어 채택하지 않는다.

## 권장 대응

- `TestEvidence`를 도입한다.
  - `call-hierarchy`: test symbol이 실제 incoming graph에 있음
  - `path-convention`: default 또는 user pattern에 일치
  - `framework-adapter`: pytest/Jest 등 정적 discovery adapter 근거
  - `coverage-observation`: 사용자가 제공한 run artifact에 해당 code range가 있음
- relation 자체는 caller graph를 기반으로 유지하고 path-only match가 새 call edge를 만들지는 않게 한다.
- Extension과 CLI의 convention 구현을 공유 모듈로 합치고 include/exclude pattern, case sensitivity와
  language preset defaults를 정의한다.
- 실제 run 상태는 `not-run | stale | passed | failed | skipped | unknown`으로 별도 모델링하며
  실행 source, run ID/time과 analyzed change time을 함께 비교한다.
- test 실행은 자동으로 시작하지 않고 사용자 action 또는 외부 artifact import만 지원한다.

## 단계별 계획

### 1단계 — 공통 classifier와 evidence

1. 두 host의 regex를 공통 순수 모듈 또는 동일 fixture contract로 통합한다.
2. 분류 결과에 matched rule ID와 evidence를 추가한다.
3. include/exclude glob schema, precedence와 invalid pattern error를 정의한다.
4. 기존 convention을 stable default rule ID로 보존한다.

종료 조건: Extension과 CLI가 같은 path matrix에 동일 결과·근거를 반환한다.

### 2단계 — test symbol 품질

1. file path뿐 아니라 symbol kind/name과 provider detail을 수집한다.
2. test file 안 helper와 실제 test case를 구분할 수 있는 adapter SPI를 설계한다.
3. 첫 adapter 후보는 현재 주력 언어의 Jest/Vitest 또는 pytest 중 fixture가 안정적인 하나로 제한한다.

종료 조건: adapter 미사용 결과가 회귀하지 않고 adapter evidence를 별도 표시한다.

### 3단계 — 실행 결과 import

1. test run summary/coverage artifact의 지원 format과 trust 경계를 정한다.
2. artifact의 workspace revision, path mapping과 run time을 검증한다.
3. current change 이후 run만 fresh로 표시하고 부분 coverage를 전체 성공으로 해석하지 않는다.

종료 조건: stale, partial, failed와 passed 결과가 실제 artifact metadata로 구분된다.

### 4단계 — UX와 Agent action

1. 관련 테스트마다 candidate 근거와 freshness를 표시한다.
2. pattern 오탐을 제외하거나 project setting에 추가하는 action을 제공한다.
3. Plugin은 “관련 테스트 후보”와 “실행 확인”을 별도 문장·field로 반환한다.

종료 조건: 테스트를 실행하지 않은 분석이 통과로 표시되는 경로가 없다.

## 예상 변경 영역

- `src/testFile.ts`, `cli/src/testFile.ts`: 공유 classifier/evidence 계약
- `src/types.ts`, `cli/src/types.ts`: TestEvidence와 run status
- `src/impactAnalyzer.ts`, `cli/src/impact.ts`: 근거 생성
- `src/impactTreeProvider.ts`, `src/graphPanel.ts`: 근거·freshness UI
- package configuration과 CLI schema: include/exclude rules
- optional test artifact adapter 및 fixture matrix

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| matrix | JS/TS/Python/Go/Java 기본 convention | 두 host 결과와 rule ID가 동일 |
| 설정 | include/exclude 충돌 | 문서화된 precedence로 결정 |
| 부정 | `contest.java`, `tester.ts`, helper file | test case로 잘못 승격되지 않음 |
| graph | provider가 test caller를 누락 | path scan만으로 가짜 call edge를 만들지 않음 |
| artifact | stale/partial/current run | freshness와 상태가 metadata에 맞음 |
| Plugin | 미실행 관련 테스트 | 후보와 실행 필요성을 분리해 보고 |

## rollout과 관측

- 1차에서는 classifier 공유와 evidence만 추가해 relation 수 변화 없이 출시한다.
- 사용자 pattern은 workspace setting opt-in으로 추가하고 invalid pattern을 조용히 무시하지 않는다.
- adapter/import 기능은 framework별 experimental 상태에서 fixture precision을 기록한다.
- UI에 default/user/adapter별 후보 수를 표시해 예상 밖 증가를 진단한다.
- 오탐 증가 시 해당 rule/adapter만 비활성화하고 기존 call-hierarchy evidence는 유지한다.

## 미해결 질문

- 공유 classifier를 root package로 옮길지 동일 generated source를 사용할지 package 경계를 정해야 한다.
- 첫 framework adapter를 Jest/Vitest와 pytest 중 어디서 시작할지 사용자 기반 자료가 필요하다.
- VS Code test run 결과를 공개 API만으로 안전하게 연결할 수 있는 범위를 별도 spike로 확인해야 한다.
