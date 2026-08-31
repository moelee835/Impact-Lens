# IL-LIM-009 분석 완료 의미와 불완전성 전달

- 상태: Backlog
- 우선순위: P2
- 완료 마일스톤: [M1 — Provider 플랫폼과 무설정 UX 기반](../milestones/m1-provider-platform-ux.md)
- 영향도: 중간
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

`complete: true`는 구성된 provider 탐색이 제한 없이 끝났다는 뜻이지만 사용자는 전체 런타임 호출 관계가
완전하다는 뜻으로 오해할 수 있다. limitation code가 있어도 UI와 Agent 응답에서 충분히 강조되지 않으면
미탐 가능성이 의사결정에서 사라진다.

## 사용자 스토리

분석 결과를 검토하는 사용자로서 수집 완료, 부분 결과와 의미적 불완전성을 한눈에 구분하고 싶다.

## 범위

- traversal completion과 semantic coverage를 별도 필드·용어로 정의한다.
- UI header, CLI JSON과 Plugin 지침에서 같은 표현과 우선순위를 사용한다.
- high-impact limitation이 있으면 요약과 후속 조치를 제공한다.

## 제외 범위

- 측정 근거 없이 coverage 백분율 제공
- provider가 보장하지 않는 완전성을 주장

## 수용 기준

- [x] 완전 종료, depth/node 제한, provider 미지원과 동적 미추론 상태가 구분된다. 근거:
  `cli/src/test/completion.test.ts` S1(exhausted), S4/S5(depth/node-limited) +
  `cli/src/test/providers.test.ts:187` "an unsupported language never falls back..."
  (`provider_required_for_language`) + `completion.test.ts`가 모든 성공 상태에
  `dynamic_calls_not_inferred`를 포함함을 assert(예: 151, 170행).
- [x] `complete` 하위 호환 또는 schema migration 전략이 문서화된다. 근거(OR 조건, 둘 다 있음):
  `docs/development-management/provider-coverage-contract.md:86-94`(`complete: true` ↔
  `completion.traversalStatus: "exhausted"` 매핑, 전방 마이그레이션 지침, `schemaVersion: 1` 유지 정책과
  v2 승격 조건) + `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md:117`(같은 매핑을
  agent 어휘로, plugin payload로 실제 배포됨). `complete`의 소비자는 README 독자가 아니라 JSON 소비자
  (agent/plugin/Extension)이므로 사용자 문서에 별도 마이그레이션 서사가 없는 것은 갭이 아니다.
- [x] Agent가 limitation을 실제 부재로 요약하지 않도록 contract fixture가 존재한다. 근거:
  `npm run test:response-policy` 16/16(10개 fixture + doc invariant 6개, negative-direction 포함).
- [x] README, UI와 CLI schema의 용어가 일치한다. 근거: PR #53(merge `dac76ba`) — `README.md`/
  `INSTALL.md`/`cli/README.md`가 provider 선택 계층·`doctor <preset>`·`.impact-lens/provider.json`·
  완전성 어휘를 코드와 일치하게 문서화했고, review에서 발견된 `cli/README.md`↔`README.md` 모순(readiness
  도달 가능성)도 같은 PR에서 정정해 세 문서(`README.md`/`cli/README.md`/`cli-contract.md`)가 지금 한
  목소리를 낸다.

**2026-08-31 판정**: 4개 전부 충족. 판정 근거 전체는
[`task-m1-gate-closure.md`](../../work/task-m1-gate-closure.md)에 있다.

## 검증

- 상태 조합별 JSON snapshot과 UI summary 테스트
- Plugin skill의 limitation 해석 시나리오 검증
- 기존 schema 소비자 호환 테스트

## 의존성 및 위험

- `IL-LIM-003`의 provider 상태와 함께 설계해야 한다.
- 필드 이름 변경은 기존 Agent 통합을 깨뜨릴 수 있어 schema version 정책이 필요하다.

## 현재 기준선

- CLI는 depth/node 제한이 없으면 `complete: true`를 반환한다.
- 동시에 `dynamic_calls_not_inferred`와 `unsaved_buffers_unavailable`을 반환하므로 traversal 완료와
  semantic 완전성이 한 응답에 혼재한다.
- Extension Graph는 truncated가 아니고 reachedDepth가 requestedDepth보다 작으면
  `call hierarchy completed`라고 표시하며 정적 분석 경계는 title tooltip에만 있다.
- Plugin skill은 limitation 해석을 지시하지만 사용자 응답 형식을 강제하는 구조화된 severity/action은 없다.

## 조사 결과

- [LSP Call Hierarchy](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#callHierarchy)는
  provider가 계산한 관계를 반환할 뿐 전체 runtime call graph 완전성을 선언하는 protocol field가 없다.
- `IL-LIM-003` 조사대로 provider capability, traversal 종료와 semantic coverage는 독립 축이다.
- depth/node 제한 없는 empty result와 provider capability 없음은 기술적으로 다른 상태이며 UI와 Agent가
  둘을 같은 “영향 없음”으로 요약하면 가장 위험한 false-negative 경험이 된다.
- percentage coverage는 denominator를 알 수 없어 근거 없이 제공할 수 없다.

## 대안 검토와 결정

1. **`complete` 문구만 변경**: UI 오해는 줄지만 Agent contract의 모호성은 남는다.
2. **boolean을 삭제**: 명확하지만 기존 integration을 깨뜨린다.
3. **다축 completion model + 기존 boolean deprecation**: 정확성과 migration을 함께 확보해 권장한다.

## 권장 대응

- 사용자와 Agent에게 다음 세 축을 항상 함께 제공한다.
  - `requestStatus`: `succeeded | partial | failed`
  - `traversalStatus`: `exhausted | depth-limited | node-limited | cancelled | unknown`
  - `semanticScope`: `provider-static | static-plus-inference | static-plus-observation`
- structured limitation에 `code`, `severity`, `scope`, `message`, `action`을 둔다.
- “No callers returned”는 사실만 말하고 `semanticScope`가 runtime-complete가 아님을 바로 이어서 표시한다.
- Agent summary template은 결과 수, traversal 상태, provider/scope와 high-severity limitation 순서를 고정한다.
- 기존 `complete`는 “traversal exhausted” projection으로 정의를 강화하고 schema v2에서 이름 변경을 검토한다.

## 단계별 계획

### 1단계 — 상태 truth table

1. provider unavailable, prepare empty, natural exhaustion, depth/node limit, timeout과 adapter failure 조합을 열거한다.
2. 각 조합의 세 축, limitation severity와 사용자 문구를 확정한다.
3. 모순 조합을 type/schema validation으로 금지한다.

종료 조건: 구현자가 boolean 추론 없이 table만으로 결과 상태를 만들 수 있다.

### 2단계 — additive contract

1. CLI response에 `completion`과 structured `limitationDetails`를 optional 추가한다.
2. 기존 `complete`, `truncated`, `limitations`를 새 모델에서 projection한다.
3. schema version 정책과 v2 migration guide 초안을 만든다.

종료 조건: 기존 JSON fixture와 새 상태 fixture가 동시에 통과한다.

### 3단계 — Extension UX

1. Graph header를 결과 수 → traversal → semantic scope → action 순서로 재구성한다.
2. Explorer empty state를 “caller 없음”, “provider 없음”, “부분 결과”로 분리한다.
3. limitation details를 펼쳐볼 수 있고 high severity만 기본 노출한다.

종료 조건: 사용자 테스트에서 empty와 incomplete를 문구만으로 구분할 수 있다.

### 4단계 — Plugin response policy

1. skill에 고정 summary template과 금지 문구를 추가한다.
2. high-severity limitation이 있으면 결론 전에 표시하도록 example/eval을 만든다.
3. `complete: true` 단독으로 안전·영향 없음 결론을 내리는 응답을 실패시키는 eval을 추가한다.

종료 조건: Codex/Claude Code 대표 prompt가 동일한 completeness 경계를 전달한다.

## 예상 변경 영역

- `src/types.ts`, `src/impactAnalyzer.ts`, `src/controller.ts`: completion 상태 생성
- `src/graphPanel.ts`, `src/impactTreeProvider.ts`: 상태·action UI
- `cli/src/impact.ts`, `cli/src/index.ts`, response schema: additive contract
- Plugin skill과 reference contract: summary policy
- README/INSTALL: `complete` 의미와 예시
- 상태 matrix unit/snapshot/eval tests

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| 모델 | truth table 전체 조합 | 기대 세 축과 limitation severity 생성 |
| schema | 기존/new response | v1 소비자 호환과 새 필드 validation 모두 통과 |
| UI | empty, natural complete, partial, failed | 제목·아이콘·action이 서로 구분됨 |
| Plugin eval | empty static result | “runtime 영향 없음”을 주장하지 않음 |
| Plugin eval | depth limit + callers | 부분 결과와 재분석 action을 먼저 제시 |
| 접근성 | warning/error 상태 | 색상 외 text와 icon으로도 구분 가능 |

## rollout과 관측

- additive JSON과 문서 변경을 먼저 release하고 v2 제거는 최소 한 minor release 이후 검토한다.
- UI wording은 feature flag보다 기존 header 교체로 제공하되 이전 raw fields는 detail에 남긴다.
- local debug log에 최종 상태 code와 limitation code만 기록해 실제 표시와 계산 차이를 진단한다.
- Plugin eval이 안정될 때까지 skill version을 올리고 두 host에서 같은 fixture를 실행한다.
- 오해가 발견되면 문구만 rollback할 수 있지만 구조화된 상태 필드는 유지한다.

## 미해결 질문

- limitation severity를 product가 고정할지 host/사용자가 조정할 수 있게 할지 결정이 필요하다.
- `complete` deprecation 기간과 schema v2 출시 조건을 정의해야 한다.
- Graph header에 항상 semantic warning을 보이면 피로도가 높은지 사용자 검증이 필요하다.
