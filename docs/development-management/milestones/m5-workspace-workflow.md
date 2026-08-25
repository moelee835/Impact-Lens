# M5 편집 중 분석과 대규모 workspace

- 상태: Planned
- 완료 소유: IL-LIM-007, IL-LIM-008
- 릴리스 성격: workflow/performance minor release

## 목표

CLI/Plugin이 저장하지 않은 변경을 명시적 overlay로 분석하고, 큰 호출 graph에서도 timeout이나 잘린 결과를
예측 가능한 budget·resume workflow로 다룬다.

## 포함 범위

- request의 in-memory document overlay, version/hash와 content provenance
- provider didOpen/didChange 동기화 및 saved/unsaved 혼합 상태
- traversal time/node/depth budget, cancellation과 partial-result contract
- pagination/resume token 또는 대안적 graph expansion 검증
- large fixture benchmark, memory/latency budget과 UI progressive rendering

## 진입 조건

- M1 provider lifecycle/cancellation과 completeness 계약이 안정적이다.
- M4의 evidence source가 traversal budget에 포함될 때의 우선순위가 정의된다.

## 산출물

- 안전한 unsaved overlay request/schema와 Plugin 사용 규칙
- stale file/hash mismatch와 overlay 적용 여부 진단
- large graph benchmark corpus 및 cold/warm 성능 기준
- partial graph의 resume/expand UX와 deterministic ordering
- source/evidence별 budget 소비와 truncation reason

## 단계별 계획

1. **overlay·규모 기준선**: content provenance, version conflict와 large-workspace latency/memory baseline을
   확정한다.
2. **overlay·bounded traversal 구현**: didOpen/didChange, cancellation, partial result와 resume/expand UX를
   구현한다.
3. **자동 stress·안전 gate**: unsaved fixture, stale token, deterministic resume, memory/latency와 no-write를
   검증한다.
4. **사용자 테스트 명세 제안**: workflow가 안정되면 `user-tests/m5-user-test-spec.md`를 작성한다. 대규모
   repository에서 일하는 실제 사용자가 저장 전 변경을 분석하고, partial/truncated graph를 인지해 확장·
   재개하며, 기다림·취소·stale 결과를 혼동하지 않는지를 실제 편집 흐름 중심으로 정의한다. 지금은 repo
   선정, 상세 과업과 성능 합격치를 확정하거나 실행하지 않는다.
5. **사용자 검증과 budget 조정**: 별도 승인 후 규모가 다른 project 사용자가 수행하고, time-to-useful-result,
   취소/재개 성공과 과신 여부를 근거로 default budget을 조정한다.

## 종료 gate

- [ ] IL-LIM-007과 IL-LIM-008의 수용 기준이 통과한다.
- [ ] overlay가 있는 요청은 disk file과 섞인 상태를 명시하고 실제 unsaved symbol 분석 fixture가 통과한다.
- [ ] 승인되지 않은 workspace 파일 write 없이 provider document state를 구성한다.
- [ ] timeout/node/depth/cancellation이 서로 다른 partial reason으로 반환된다.
- [ ] benchmark workspace에서 memory/latency budget과 deterministic resume 결과를 충족한다.
- [ ] Extension live analysis와 CLI overlay의 completeness 용어가 일치한다.
- [ ] `user-tests/m5-user-test-spec.md`가 실제 편집·partial/resume 과업과 privacy 규칙을 포함해 검토됐으며,
  사용자 결과 또는 보류 사유가 default budget 결정에 기록된다.

## 제외 범위

- editor host 전체 state의 자동 수집
- 무제한 graph materialization
- background daemon을 필수로 요구하는 architecture

## 주요 위험과 대응

- source 내용이 Agent request/log에 노출될 수 있다: 최소 document 범위, size limit와 log redaction을 적용한다.
- resume token이 stale graph를 이어갈 수 있다: workspace/file version과 provider identity에 token을 결속한다.
- augmentation edge가 graph를 폭증시킬 수 있다: evidence source별 budget과 기본 filter를 둔다.

## 다음 마일스톤 연결

M6는 안정화된 language/profile 및 overlay 경계를 활용해 note를 다루되, note 접근을 위해 editor state 전체를
암묵적으로 복제하지 않는다.
