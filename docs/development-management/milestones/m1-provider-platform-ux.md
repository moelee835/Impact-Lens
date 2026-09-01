# M1 Provider 플랫폼과 무설정 UX 기반

- 상태: Done — v0.7.0으로 발행됨(2026-09-01, [`task-m1-release-0-7-0.md`](../../work/task-m1-release-0-7-0.md)).
  "Done"은 8개 종료 gate가 전부 이견 없이 충족됐다는 뜻이 아니다 — gate 3(doctor의 indexing 구분)의
  문구-구현 불일치는 아래에 그대로 열려 있고, 사용자 검증(gate 8)은 release decision으로 보류 종결됐다.
- 완료 소유: IL-LIM-005, IL-LIM-009
- 선행 기여: IL-LIM-004 1~2단계
- 릴리스 성격: provider platform minor release

## 실행 계획

Agent Team 기반 wave 분해, 파일 소유권과 wave별 종료 gate는
[`docs/work/task-m1-agent-team-execution.md`](../../work/task-m1-agent-team-execution.md)에 있다.
착수 전 결정이 필요한 항목(M0 사용자 검증 병행 여부, traversal/semantic 용어 확정과 schema version 정책)도
같은 문서에 정리했다.

## 목표

일반 사용자는 command/args/languageId를 작성하지 않고 `Auto`와 doctor로 provider 준비 상태를 이해한다.
고급 사용자는 custom provider를 유지할 수 있으며, 결과가 complete여도 static/indexing 한계를 과신하지 않는다.

## 포함 범위

- generic LSP의 server request, dynamic registration, progress, configuration과 initialization option 기반
- provider preset manifest, selection priority, executable/version discovery와 doctor operation
- `Auto → explicit preset → advanced custom`의 단계적 UX
- traversal/provider/indexing/semantic completeness와 partial/failed 결과의 공통 표시
- timeout, cancellation, stderr/output budget과 project readiness 상태

## 진입 조건

- M0의 packed bundled provider와 Plugin cache E2E가 통과한다.
- schema v1 provider/coverage field와 lifecycle error가 release artifact에 포함된다.

## 산출물

- 양방향 JSON-RPC/LSP session core와 bounded lifecycle
- `ProviderPreset` catalog schema 및 TypeScript reference preset
- machine-readable provider doctor 결과와 설치·준비 조치
- deterministic selection 순서: custom > explicit preset > trusted project > verified auto > unsupported
- CLI, Extension, Codex/Claude Plugin의 completeness 표현 지침

## 단계별 계획

1. **protocol·상태 계약**: 양방향 LSP lifecycle, preset manifest, doctor와 completeness 상태를 확정한다.
2. **Auto/doctor/custom 구현**: 안전한 선택 순서, discovery cache, advanced escape hatch와 UI/Plugin 표현을
   구현한다.
3. **자동 호환성 검증**: bundled/custom/mock provider로 capability, timeout, indexing unknown과 partial 결과
   matrix를 통과한다.
4. **사용자 테스트 명세 제안**: 동작과 문구가 고정되면 `user-tests/m1-user-test-spec.md`를 작성한다. 실제
   사용자가 provider 내부 지식 없이 Auto로 시작하고, doctor 안내만으로 missing/unsupported 상태를
   해결하며, 필요할 때 custom 설정으로 전환하고 `complete`의 정적 범위를 올바르게 해석하는지를 검증하도록
   설계한다. 지금은 세부 case와 합격 수치를 확정하거나 실행하지 않는다.
5. **사용자 검증과 UX 조정**: 별도 승인 후 초급/고급 사용자 집단이 과업을 수행하고, 설정 개입·복구율·
   과신 여부를 반영해 기본 UI와 문서를 조정한 뒤 release한다.

## 종료 gate

- [x] IL-LIM-005와 IL-LIM-009의 수용 기준이 모두 통과한다. 두 story 문서의 수용 기준 각 항목 참고.
- [x] TypeScript reference preset이 기존 bundled 동작과 결과 호환성을 유지한다. 근거:
  `cli/src/test/providers.test.ts:268,281`(IL-LIM-005 AC4와 동일).
- [ ] **[문구-구현 불일치]** missing executable, unsupported version, language mismatch, capability 없음,
  indexing unknown과 query 실패가 doctor에서 구분된다. `cli/src/test/doctor.test.ts`가 missing
  executable/unsupported version/language mismatch/missing capability/query 실패 5개 중 4개를 구분한다
  ("a missing executable is reported as its own failure...", "an unsupported version is reported
  separately...", "a language the preset does not serve is reported as a mismatch...", "a server without
  Call Hierarchy is reported as a missing capability", "a server that advertises Call Hierarchy but
  answers nothing fails the fixture"). **그러나 "indexing unknown"은 doctor의 어떤 check에도 없다** —
  `doctor.test.ts` 전체에 "indexing"이라는 단어가 0회 등장한다(직접 grep 확인). `coverage.indexing.status`는
  W2-A(PR #46)가 **analyze 시점** 개념으로 구현했고 doctor 명령과는 별개다. gate 문구를 쓴 시점에는 doctor가
  이 상태까지 구분할 것으로 예상했지만 실제 구현은 그렇지 않다 — gate 문구를 실제 구현(query 실패까지는
  doctor, indexing unknown은 analyze 응답)에 맞게 정정하거나 doctor에 indexing 관련 check를 추가하는 결정이
  필요하다. 이 판단은 M1 종료 판정 lane의 권한 밖이라 사용자에게 넘긴다. 상세:
  [`task-m1-gate-closure.md`](../../work/task-m1-gate-closure.md).
- [x] custom provider 요청과 기존 provider JSON은 하위 호환으로 동작한다. 근거: PR #54
  (`test/m1-compatibility-matrix`) merge `30c88f1` — `cli/src/test/contract.test.ts:283` "an old-style
  request with only provider command/args/languageId - no preset, no overrides - still completes a
  successful analysis". `main`에서 재확인(266/266).
- [x] Auto가 검증되지 않은 server를 임의 선택하거나 다른 언어 provider로 fallback하지 않는다. 근거:
  `cli/src/test/providers.test.ts`의 5개 test + `cli/src/test/contract.test.ts`의 2개 test +
  `scripts/test-plugin-artifact-e2e.mjs`의 `selectedBy`/`languageMatch` assert.
- [x] Plugin이 `complete: true`만으로 runtime 영향 없음이나 indexing 완료를 주장하지 않는 fixture가 통과한다.
  근거: `npm run test:response-policy` 16/16.
- [x] build/configure/sync는 사용자 승인 없이 실행되지 않는다. 근거: PR #54(`test/m1-compatibility-matrix`)
  merge `30c88f1` — production spawn 지점 4곳을 전수 조사해 `cli/src/test/buildInvocation.sources.test.ts:224`
  "every spawn-family call site in cli/src is inventoried, and none hardcodes a command outside the
  allowed list"로 고정. review에서 발견된 `exec`/`execFile`/`execSync`/`fork`와 namespace/default import
  누락 결함은 commit `c82e30b`로 수정되고 우회 패턴 3종으로 재검증됐다(reviewer 독립 재검증 완료).
- [x] `user-tests/m1-user-test-spec.md`가 release candidate 기준으로 검토됐으며, 실제 사용자 검증 결과 또는
  실행 보류 사유가 release decision에 기록된다. **release decision**: 명세는 작성 완료·검토 완료(작성자가
  아닌 세션의 독립 검토 1회, 2번째 독립 검토는 승인이 오지 않아 만료 — `docs/work/task-m1-user-test-spec.md`
  작업 로그 참고). 실제 참여자 모집과 환경 준비는 별도 승인 사항이며, **사용자가 이번 릴리스(v0.7.0)에서는
  실행을 보류하기로 명시적으로 결정했다**(M0와 동일한 방식). 상세:
  [`task-m1-gate-closure.md`](../../work/task-m1-gate-closure.md).

## 제외 범위

- Python/Go/C/C++/Swift/Kotlin을 verified support로 선언
- 모든 Language Server별 private extension 처리
- framework DI와 runtime evidence 생성

## 주요 위험과 대응

- LSP server별 protocol 편차: generic core와 preset adapter를 분리하고 capability/fixture로 승격한다.
- doctor가 startup latency를 늘릴 수 있다: cacheable preflight와 실제 query를 분리하고 cold/warm budget을 둔다.
- indexing unknown 경고가 과도할 수 있다: 기본 UI는 간결한 상태, 상세 정보는 tooltip/JSON으로 제공한다.

## 다음 마일스톤 연결

M2는 이 catalog/doctor/transport 위에서 Python, Go와 clangd를 독립적으로 검증하고 raw provider JSON 없는
경로를 완성한다.
