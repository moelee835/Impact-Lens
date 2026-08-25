# IL-LIM-011 호출 가능한 symbol 종류 확장

- 상태: Backlog
- 우선순위: P3
- 완료 마일스톤: [M3 — Swift·Kotlin 및 callable 확장](../milestones/m3-p2-language-callables.md)
- 영향도: 낮음~중간
- 적용 영역: VS Code Extension, Agent CLI

## 문제

Extension CodeLens는 Function, Method와 Constructor symbol을 중심으로 제공된다. callable property,
operator, macro 또는 언어 서버가 다른 kind로 표현하는 함수형 선언은 분석 가능하더라도 진입점이
표시되지 않을 수 있다.

## 사용자 스토리

다양한 언어의 callable 선언을 사용하는 개발자로서 provider가 제공하는 유효한 Call Hierarchy 대상이라면
일관된 CodeLens와 분석 명령을 사용하고 싶다.

## 범위

- provider·언어별 callable symbol kind와 prepare 성공 여부를 조사한다.
- 안전한 추가 kind 또는 capability probe 전략을 도입한다.
- declaration anchor가 지원하지 못한 문법은 provider selection을 보존하며 명시적으로 fallback한다.

## 제외 범위

- 모든 언어 문법을 직접 파싱하는 범용 parser
- Call Hierarchy를 준비할 수 없는 일반 변수·필드 전체에 CodeLens 표시

## 수용 기준

- [ ] 추가 대상 symbol kind와 언어별 근거가 문서화된다.
- [ ] 지원 kind에서 CodeLens 위치와 Call Hierarchy 준비가 검증된다.
- [ ] 호출 불가능 symbol에 잘못된 CodeLens가 증가하지 않는다.
- [ ] 기존 function/method/constructor 동작이 유지된다.

## 검증

- symbol kind와 declaration 문법 fixture 단위 테스트
- 실제 provider prepareCallHierarchy 통합 검사
- decorator, typed method와 arrow function 회귀 테스트

## 의존성 및 위험

- `IL-LIM-004`의 언어별 검증 결과가 대상 kind 선정에 도움이 된다.
- `IL-LIM-014`~`016`에서 C/C++ operator·function object, Swift property/subscript/operator와 Kotlin
  property accessor·operator가 실제 Call Hierarchy item으로 준비되는지 evidence를 제공해야 한다.
- symbol kind 의미가 Language Server마다 달라 allowlist만 넓히면 오탐이 생길 수 있다.

## 현재 기준선

- `src/codeLensProvider.ts`와 `src/impactAnalyzer.ts`의 enclosing-symbol fallback은 Function, Method,
  Constructor만 허용한다.
- `src/declarationAnchor.ts`는 `def/function/func/fn/fun/sub/procedure`, typed method와 JS/TS arrow assignment를
  보정하지만 symbol kind filter를 통과한 뒤에만 사용된다.
- CLI는 provider가 `prepareCallHierarchy`에서 반환한 item을 kind와 무관하게 받을 수 있지만
  expectedSymbol kind 검증과 문서 표현은 일반 symbol kind 이름에 의존한다.
- 언어/provider별 DocumentSymbol kind와 prepare 성공 조합을 기록한 matrix가 없다.

## 조사 결과

- [VS Code DocumentSymbol](https://code.visualstudio.com/api/references/vscode-api#DocumentSymbol)은 variable,
  class, interface 등 넓은 선언을 표현하며 symbol kind 자체가 callable 여부를 보장하지 않는다.
- [VS Code CallHierarchyItem](https://code.visualstudio.com/api/references/vscode-api#CallHierarchyItem)은 함수나
  constructor 같은 호출 graph의 programming construct를 표현하지만 특정 SymbolKind allowlist를 요구하지 않는다.
- 따라서 DocumentSymbol kind를 넓히는 것보다 해당 selection에서 `prepareCallHierarchy`가 실제 item을
  반환하는지가 최종 capability 판단이다.
- 모든 DocumentSymbol을 eager probe하면 파일당 provider request 수가 크게 증가할 수 있어 CodeLens 성능을 해친다.

## 대안 검토와 결정

1. **모든 symbol kind에 CodeLens 표시**: 오탐과 provider request 실패가 많아 제외한다.
2. **전역 allowlist에 Property/Field/Operator 추가**: provider별 의미 차이를 숨기므로 단독 적용하지 않는다.
3. **언어/provider profile + 제한된 capability probe**: 검증된 후보만 넓히고 실제 prepare 결과로 확인할 수 있어 권장한다.
4. **범용 parser 도입**: callable 판단을 위해 전체 언어 문법을 소유하는 것은 범위를 벗어난다.

## 권장 대응

- `CallableSymbolPolicy`를 languageId/preset별로 정의한다.
  - 기본 kinds: Function, Method, Constructor
  - 추가 candidate kinds와 declaration anchor strategy
  - provider/version fixture 근거와 최대 probe budget
- 사용자 명령으로 cursor 분석을 실행할 때는 kind allowlist보다 `prepareCallHierarchy` 성공을 우선한다.
- CodeLens는 검증된 candidate kind만 표시하고, 필요하면 문서당 제한된 probe cache를 사용한다.
- prepare가 반환한 실제 `CallHierarchyItem.kind`를 graph identity에 사용하고 원본 DocumentSymbol kind와 다르면
  provider normalization evidence를 기록한다.
- language profile이 없는 경우 기존 allowlist를 유지한다.

## 단계별 계획

### 1단계 — 관측 matrix

1. 지원·후보 언어 fixture에 function, method, constructor, property/getter, operator, callable variable를 만든다.
   C/C++·Swift·Kotlin fixture는 각 언어 story가 소유하고 이 story는 공통 matrix 형식만 정의한다.
2. DocumentSymbol kind/selection과 prepareCallHierarchy 응답을 provider/version별로 capture한다.
3. 실제 callable과 false candidate를 matrix로 분류한다.

종료 조건: 추가 kind마다 최소 하나의 실제 provider 근거와 negative fixture가 있다.

### 2단계 — policy와 anchor

1. languageId별 candidate kind와 anchor strategy를 data-driven policy로 만든다.
2. 기존 declaration anchor fallback을 strategy interface로 분리한다.
3. 지원하지 않는 syntax는 symbol start로 조용히 오인하지 않고 reason을 debug detail에 남긴다.

종료 조건: 기존 Python/TS fixture와 새 candidate fixture가 policy를 통해 통과한다.

### 3단계 — bounded CodeLens probe

1. 문서 version별 prepare result cache와 최대 probe 수를 정의한다.
2. candidate kind에서만 cancellation 가능한 probe를 수행한다.
3. timeout/실패는 CodeLens 하나를 생략하되 다른 symbol 처리를 막지 않는다.

종료 조건: 큰 symbol 문서에서도 provider request와 응답 시간이 budget을 넘지 않는다.

### 4단계 — CLI/문서 정합성

1. CLI kind name과 expectedSymbol validation이 추가 provider kind를 보존하는지 확인한다.
2. 언어별 공식 callable 범위와 검증 version을 문서화한다.
3. provider가 prepare하지 못하는 kind는 지원 목록에 포함하지 않는다.

종료 조건: Extension 진입점과 CLI 직접 위치 분석의 지원 범위 차이가 설명된다.

## 예상 변경 영역

- `src/codeLensProvider.ts`, `src/impactAnalyzer.ts`: policy와 bounded probe
- `src/declarationAnchor.ts`: 언어별 anchor strategy
- 신규 `src/callableSymbolPolicy.ts`와 tests
- `cli/src/impact.ts`: kind normalization/validation 회귀
- 언어/provider fixture와 benchmark
- README/DEVELOPMENT: 검증된 callable 종류

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| matrix | kind별 document/CallHierarchy item | provider별 실제 지원 결과가 기록됨 |
| 단위 | 기본·언어별 policy | 미등록 언어는 기존 3개 kind만 허용 |
| anchor | getter/operator/callable declaration | 선택 range가 실제 이름에 위치 |
| 부정 | 일반 property/field/variable | prepare 불가 시 CodeLens 미표시 |
| 성능 | symbol이 많은 문서 | probe 수와 총 시간이 설정 budget 안 |
| 회귀 | function/method/constructor | 기존 CodeLens와 graph 동작 유지 |

## rollout과 관측

- policy infrastructure만 먼저 도입하고 추가 kind는 언어별 opt-in commit으로 분리한다.
- local debug mode에서 candidate, prepare success/failure와 cache hit 수만 기록한다.
- 특정 provider version에서 실패가 늘면 해당 profile의 추가 kind만 비활성화한다.
- CodeLens가 없어도 command 기반 cursor 분석은 유지해 사용자가 provider capability를 직접 시도할 수 있게 한다.
- 지원 문서에는 “symbol kind”가 아니라 실제 검증된 callable syntax를 사용자 관점으로 표시한다.

## 미해결 질문

- CodeLens 생성 시 provider probe 비용을 허용할지, profile allowlist만 사용할지 benchmark가 필요하다.
- getter/setter를 하나의 property node로 볼지 개별 callable로 볼지 provider 결과를 기준으로 정해야 한다.
- macro/operator 같은 언어 고유 symbol을 graph relation 이름에 어떻게 표현할지 UX 결정이 필요하다.
