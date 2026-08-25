# M1 Provider 플랫폼과 무설정 UX 기반

- 상태: Planned
- 완료 소유: IL-LIM-005, IL-LIM-009
- 선행 기여: IL-LIM-004 1~2단계
- 릴리스 성격: provider platform minor release

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

## 종료 gate

- [ ] IL-LIM-005와 IL-LIM-009의 수용 기준이 모두 통과한다.
- [ ] TypeScript reference preset이 기존 bundled 동작과 결과 호환성을 유지한다.
- [ ] missing executable, unsupported version, language mismatch, capability 없음, indexing unknown과 query
  실패가 doctor에서 구분된다.
- [ ] custom provider 요청과 기존 provider JSON은 하위 호환으로 동작한다.
- [ ] Auto가 검증되지 않은 server를 임의 선택하거나 다른 언어 provider로 fallback하지 않는다.
- [ ] Plugin이 `complete: true`만으로 runtime 영향 없음이나 indexing 완료를 주장하지 않는 fixture가 통과한다.
- [ ] build/configure/sync는 사용자 승인 없이 실행되지 않는다.

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
