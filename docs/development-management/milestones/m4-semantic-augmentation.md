# M4 동적 호출·DI·테스트 의미 보완

- 상태: Planned
- 완료 소유: IL-LIM-001, IL-LIM-002, IL-LIM-010
- 릴리스 성격: semantic evidence preview/minor release

> **2026-09-03 정정(M4 stage 2, `docs/work/task-m4-stage2-fastapi-adapter.md`)**: 아래 "포함 범위"와
> "종료 gate"가 **Spring Java/Kotlin을 1차 adapter로 전제**한다. 이건 지금 불가능하다 — 직접
> 확인했다: `cli/src/providers/resolve.ts`의 `languageId()`에 `.java` case가 아예 없고(`.kt`/
> `.kts`는 `'kotlin'`으로 감지되지만), `PROVIDER_CATALOG`(`cli/src/providers/catalog.ts`)에는
> Java나 Kotlin preset이 하나도 없다(`bundledTypeScript`/`gopls`/`bundledPyright`/`clangd`
> 넷뿐). **Spring adapter를 만들려면 Java/Kotlin 언어 지원이 먼저 필요하고, 그건 M3 이후의
> 일이다.** 이건 임의 범위 변경이 아니라 이 저장소가 이미 갖춘 것과 안 갖춘 것이 강제하는
> 사실이다. **FastAPI가 이 마일스톤에서 실제로 가능한 유일한 framework adapter다** — Python
> preset이 이미 shipped됐고, `IL-LIM-002` 자신의 "권장 대응"도 이미 "첫 adapter를
> `fastapi-static-v1`로 한정"하고 Spring을 "후속 adapter"로 적어 뒀다(이 문서만 Spring을 1차로
> 잘못 적어 뒀다). **Spring은 이 마일스톤에서 만들지 않는다** — Java/Kotlin 언어 지원이 생긴
> 뒤(M3 이후)로 미룬다. 원문은 보존하고, 아래 해당 항목마다 정정을 남긴다.

> **2026-09-04 추가**: 위 정정의 "그건 M3 이후의 일이다"와 "Java/Kotlin 언어 지원이 생긴 뒤(M3
> 이후)로 미룬다"가 가리키던 자리가 이제 구체적인 story를 갖는다 — Java는
> [`IL-LIM-018`](../stories/il-lim-018-java-language-support.md)(M3 신규), Kotlin은 이미 있던
> [`IL-LIM-016`](../stories/il-lim-016-kotlin-lsp-support.md)이다. "M3 이후"는 여전히 맞는
> 표현이지만 이제 "M3의 두 특정 story가 닫힌 뒤"로 더 정확히 읽을 수 있다.

## 목표

LSP가 놓치는 동적 호출, dependency injection, routing과 테스트 관련성을 근거 없이 확정하지 않으면서
보조 evidence로 표시한다. 정적 확정 edge, 후보 edge와 runtime-only 관계를 provenance/confidence로 구분한다.

## 포함 범위

- 공통 evidence graph와 `confirmed/candidate/runtime-only` 또는 동등 confidence 계약
- function pointer, virtual/interface dispatch, closure/lambda와 reflection 후보 보완
- ~~framework adapter registry와 Spring Java/Kotlin bean/context resolution 1차 adapter~~
  (정정됨, 위 참고 — **FastAPI가 1차**, Spring은 Java/Kotlin 언어 지원 이후로 연기)
- ~~FastAPI/Koin/Dagger/Hilt/Swift DI 등 후속 adapter SPI 및 unsupported 표시~~ (정정됨 — FastAPI는
  후속이 아니라 1차. Koin/Dagger/Hilt/Swift DI는 원문 그대로 후속 후보)
- test candidate evidence, include/exclude convention과 실제 실행 상태 분리
- LSP-only와 augmented 결과의 비교·rollback·성능 budget

## 진입 조건

- M0/M1 provider/coverage/completeness 계약이 release되어 evidence source를 구분할 수 있다.
- 최소 M2의 Python/Go/C/C++ fixture가 semantic regression 기준선으로 존재한다.
- 사용자 승인 없는 runtime app/test 실행 금지 원칙이 API 계약에 반영된다.

## 산출물

- provenance/confidence가 포함된 augmented edge schema와 UI/Plugin 표현
- 언어별 제한된 정적 추론 adapter와 false-positive corpus
- ~~Spring bean definition/injection candidate graph와 unresolved bean 설명~~ (정정됨, 위 참고 —
  Java/Kotlin 언어 지원 이후로 연기. 이 자리를 FastAPI dependency/route candidate graph가 대신한다)
- test evidence classifier, rule ID와 freshness/run-state model
- adapter별 precision/recall proxy, latency와 disable/rollback switch

## 단계별 계획

1. **evidence 계약·corpus**: confirmed/candidate/runtime-only provenance와 false-positive corpus를 확정한다.
2. **언어·framework adapter 구현**: 제한된 dynamic 추론, ~~Spring bean/context~~(정정됨, 위 참고 —
   **FastAPI** dependency/route adapter)와 test evidence adapter를 kill switch와 함께 구현한다.
3. **자동 정확도·성능 gate**: LSP-only 비교, ambiguity, false-positive, latency와 rollback fixture를 통과한다.
4. **사용자 테스트 명세 제안**: evidence UI가 안정되면 `user-tests/m4-user-test-spec.md`를 작성한다. Spring/
   FastAPI 및 동적 dispatch를 사용하는 실제 사용자가 변경 영향 검토에서 confirmed와 candidate를 구분하고,
   누락·오탐을 발견하며, 관련 테스트 후보를 실제 통과로 오해하지 않는지를 blind review 과업으로 정의한다.
   지금은 실제 codebase나 참여자를 모집하고 평가하지 않는다.
5. **사용자 검증과 adapter rollout**: 별도 승인 후 framework/언어 경험자가 명세를 수행하고, adapter별
   유용성·오탐·이해도를 근거로 default/opt-in/disabled 상태를 결정한다.

## 종료 gate

- [ ] IL-LIM-001, IL-LIM-002, IL-LIM-010의 수용 기준이 통과한다.
- [ ] LSP 확정 edge와 추론/framework/runtime evidence가 JSON과 UI에서 구분된다.
- [ ] ~~Spring constructor/field/method injection의 대표 fixture가 bean candidate와 ambiguity를
  재현한다.~~ **2026-09-03 정정**: Java/Kotlin 언어 지원이 없어 이 마일스톤에서 이 gate를 이
  형태로 통과시킬 수 없다 — Spring은 M3 이후로 연기됐다(위 참고). **이 마일스톤의 실제 종료
  gate로 대신 쓴다**: FastAPI **import alias, sub-dependency(중첩 dependency)와 cross-file
  dependency/router include**의 대표 fixture가 candidate(단일/복수 후보)와 ambiguity를
  재현한다(2026-09-03 보강 — 원래 gate가 Spring injection 모양 셋을 이름 댄 것과 같은 무게로,
  세 모양을 명시했다. `IL-LIM-002` 자신의 수용 기준 "alias, 중첩 dependency와 cross-file
  사례가 테스트된다"와 권장 대응(`import alias 추적`/`sub-dependency 재귀`/`다른 module의
  dependency와 router include`)에서 그대로 가져왔다 — 새로 만든 기준이 아니다). Spring 버전
  fixture는 Java/Kotlin 언어 지원이 생긴 뒤 별도 milestone/story의 gate로 이어받는다 —
  `IL-LIM-002`의 stage 5(Spring feasibility spike)가 이미 "정확도·성능이 승인된 경우에만 독립
  구현 Issue로 승격"이라고 조건부로 적어 둔 것과 일치한다.

  > **2026-09-04 추가 정정(M4 stage 3, `docs/work/task-m4-stage3-accuracy-latency-gates.md`
  > "단계 3")**: 바로 위 문장의 "candidate(**단일/복수 후보**)"가 요구하는 복수 후보 실증을
  > **서로 다른 두 자연스러운 구성으로 직접 시도했으나 만들지 못했다** — (1) 조건부 재정의
  > (`if cond: def f(): ... else: def f(): ...`, stage 2), (2) try/except import fallback
  > (`try: from module_a import get_db` / `except ImportError: from module_b import get_db`,
  > stage 3, 각 module이 서로 다른 실제 함수를 정의). 둘 다 pyright의 `prepareCallHierarchy`가
  > 참조 지점에서 **정확히 1개** 항목만 반환했다(조건절과 무관하게 텍스트상 마지막 binding으로
  > 수렴 — Python 정적 스코프 규칙과 일치하는 결과로 보인다). **"어떤 구성으로도 불가능하다"는
  > 전수 조사가 아니다** — 시도한 두 구성 모두에서 못 찾았다는 것만 실측했다. 이 마일스톤의 실제
  > 종료 gate에서 "복수 후보" 요구는 제거한다: **단일 후보**(이미 fixture로 충족:
  > `alias_target.py` 등)와 **ambiguity**(이미 별도 fixture로 충족: mount name-collision 계열)만
  > 만족하면 된다. `resolution: 'multiple'`이라는 코드 분기 자체(`resolutionCandidateCount > 1
  > ? 'multiple' : 'single'`)는 그대로 둔다 — 언젠가 실제로 트리거하는 구성이 발견되면 fixture로
  > 추가하되, 지금 이 gate를 통과시키는 조건은 아니다.
- [ ] 모호한 DI/dynamic target은 하나의 확정 caller로 임의 승격되지 않는다.
- [ ] path convention만으로 가짜 call edge나 test passed 상태를 만들지 않는다.
- [ ] augmentation을 끄면 기존 LSP-only graph로 안전하게 rollback된다.
- [ ] 지원 언어 fixture에서 정해진 false-positive와 latency budget을 통과한다.
- [ ] `user-tests/m4-user-test-spec.md`가 evidence 이해도와 실제 누락·오탐 검토를 포함해 승인됐으며,
  사용자 결과 또는 보류 사유가 adapter rollout 결정에 연결된다.

## 제외 범위

- 임의 application/test 자동 실행
- 모든 framework 및 runtime reflection 완전 지원
- 실제 runtime trace 없이 runtime-only target을 확정하는 동작

## 주요 위험과 대응

- false positive가 신뢰를 훼손할 수 있다: source/confidence를 필수화하고 adapter별 opt-in/kill switch를 둔다.
- framework version별 metadata가 다르다: adapter와 fixture를 framework/version profile로 격리한다.
- graph가 복잡해질 수 있다: 기본 뷰는 confirmed 중심, candidate/runtime evidence는 filter와 설명으로 제공한다.

## 다음 마일스톤 연결

M5는 evidence가 늘어난 graph에서도 규모와 freshness를 제어하고, M6는 language/profile 정보를 source note
문법과 note 접근 전략에 재사용한다.
