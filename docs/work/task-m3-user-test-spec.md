# M3 사용자 테스트 명세 작성

## 목적과 사용자 가치

- **누가 어떤 문제를 겪는가:** M3(Swift·Kotlin·Java 및 callable 확장)의 종료 gate는
  `user-tests/m3-user-test-spec.md`가 "toolchain별 환경과 callable 오탐 확인을 포함해 검토됐으며,
  사용자 결과 또는 보류 사유가 지원 등급 결정에 기록될" 것을 요구한다. 그런데 이 명세 문서가 **아직
  존재하지 않는다**(M0·M1·M2·M4에는 있음). 즉 M3는 "Java가 실제 사용자에게 어떤 조건에서 어떻게
  보이는지"를 판정할 기준 문서가 비어 있는 상태다.
- **끝나면 무엇이 가능해지는가:** 저장소 소유자와 검토자가 "Java(jdtls) preset을 verified/experimental
  중 어느 등급으로 낼지"를 정할 때, 어떤 과업으로 무엇을 관측해 판정할지를 문서 하나로 합의할 수 있게
  된다. 특히 M3 실측이 이미 찾아 둔 위험(느린 첫 import가 raw LSP timeout으로 노출되는 것, lambda
  caller가 합성 이름으로 나오는 것 등)을 실제 사람이 어떻게 읽는지 재는 과업이 명문화된다.
- **상위 목표와의 관계:** M3 milestone 4단계("사용자 테스트 명세 제안")의 산출물이자 종료 gate 항목.
  M2가 세운 언어 지원 사용자 검증 패턴(`m2-user-test-spec.md`)을 M3의 JVM 상황에 맞게 잇는다.
- **왜 지금인가:** 사용자가 "개발 마일스톤에서 놓친 테스트"를 진행하라고 지시했고, 조사 결과 M3의
  놓친 산출물이 바로 이 명세임이 확인됐다. 실행(참여자 모집·환경 준비)은 milestone이 별도 승인으로
  분리해 뒀으므로, 지금 할 수 있고 해야 하는 것은 **명세 작성과 검토**다.

## 배경과 해결할 문제

- M3 실측 결과(milestone 문서, `task-m3-java-entry-gate.md`): **Java만 진입 gate 통과**, **Kotlin은
  upstream 문제로 막힘**, **Swift는 순서 뒤로**. 따라서 지금 실효 대상은 Java(jdtls)뿐이다.
- 코드 현황(직접 확인): `.java`는 languageId `java`로 연결됨. `java-jdtls` preset은 catalog에 있으나
  **`tier: 'unsupported'`** — Auto로 선택되지 않고 `providerPreset: 'java-jdtls'`를 명시해야만 쓰이며
  displayName이 "…- unverified"다. Java fixture 디렉터리는 없다.
- 이 명세는 "존재만으로 검증 통과"가 아니다(M2 명세와 같은 규칙). 실행은 참여자·환경·승인이 갖춰진
  뒤에 별도로 한다.

## 범위와 범위에서 제외할 항목

- **범위:** `docs/development-management/user-tests/m3-user-test-spec.md`를 작성한다. M2 명세의 구조
  (검증 목적 / 비판정 항목 / 참여자 / 환경 matrix / 시작 상태 / 과업 / 기대·중단 / 지표 / 사후질문 /
  통과·보류 / privacy / 증거 / 실패처리 / 검토 체크리스트)를 재사용하되, M3의 JVM 위험에 맞춘 과업을
  정의한다. Java를 중심에 두고 Kotlin/Swift는 보류 사유를 명시한다.
- **제외:** 실제 참여자 모집·세부 case 확정·실행(milestone이 별도 승인으로 분리). Java preset을
  verified/experimental로 실제 승격하는 결정. JDK/jdtls 설치나 fixture 구현(별도 작업). 이 명세
  작성 자체는 코드/preset을 바꾸지 않는다.

## 현재 구현 조사 결과

- 이미 달성된 사용자 결과: Java 파일에서 `providerPreset: 'java-jdtls'`를 명시하고 JDK 21+/jdtls/
  build가 준비된 환경이면 incoming call hierarchy를 얻을 수 있다(entry gate 실측). readiness·timeout·
  lambda caller 이름 등의 동작이 실측으로 관측돼 있다.
- 아직 불가능한/오해 소지 있는 결과: Java는 Auto로 선택되지 않는다(unsupported tier, 명시 opt-in).
  느린 첫 import가 raw LSP timeout 메시지로 노출돼 "Java에선 안 된다"로 오독될 수 있다. Kotlin은
  top-level 함수 incoming이 provider에서 막혀 오늘 지원 불가. Swift는 preset 미구현.
- 이번 작업이 메우는 공백: "이 동작들을 실제 사람이 어떻게 읽는지" 판정할 사용자 테스트 명세의 부재.

## 단계별 구현 계획

### 1단계: m3-user-test-spec.md 작성

- **목적:** M3 종료 gate가 요구하는 사용자 테스트 명세를, 실제 M3 상태(Java 중심, Kotlin 보류,
  Swift 지연)에 정직하게 맞춰 세운다.
- **산출물:** `user-tests/m3-user-test-spec.md`가 생성되고, Java의 (a) 명시 opt-in/unverified tier
  이해, (b) readiness/timeout 오독, (c) 빈 결과 vs 진짜 no-caller, (d) lambda 합성 caller 이름,
  (e) Spring/DI gap 과신, (f) build trust·JDK 호환을 재는 과업이 유도 금지 규칙과 함께 정의된다.
  Kotlin/Swift의 보류 사유가 기록된다.
- **검증:** 명세가 M2 형식의 필수 절을 모두 갖추고, milestone 종료 gate 문장("toolchain별 환경과
  callable 오탐 확인을 포함")과 IL-LIM-018 수용 기준을 실제로 가리킨다. reviewer 세션의 적대적 검토를
  거친다(§7.3). 검토 지적은 이 문서 로그에 반영한다.

## 테스트 및 완료 기준

- [x] `m3-user-test-spec.md`가 생성되고 Java 중심 과업 + Kotlin/Swift 보류 사유를 포함한다.
- [x] 명세가 유도 금지(M1/M2가 세운 자유서술→확인, 금지 단어) 규칙을 승계한다.
- [x] reviewer 세션이 명세를 검토하고 판정·발견을 기록한다(1차 완료, 지적 전부 반영). **재검토 권장.**
- [x] 실행 경계가 명시된다: 이 작업은 **명세 작성 + 검토**까지이며, 실제 VS Code 실행은 JDK/jdtls/
  fixture 준비와 별도 승인이 필요하다(현재 이 환경에 toolchain 부재).

## reviewer 배정 (§7.1, 지시 전 문서화)

- **대상:** reviewer 세션(cmux surface 8A480F34…).
- **목적:** M3 사용자 테스트 명세의 결함·유도 질문·검증 공백·milestone/story 불일치를 적대적으로
  찾는다(il-reviewer 역할).
- **산출물:** 발견(결함/공백/유도 위험)과 최종 판정을 텍스트로 보고. §15 검토 체크리스트 각 항목에
  대한 통과/미통과 근거.
- **검증:** lead가 발견을 이 문서 로그에 반영하고 명세를 수정한다.
- **제약(공유 worktree 보호):** 읽기전용. `git` 실행·branch 전환·파일 생성/수정 금지. 두 파일
  (`user-tests/m3-user-test-spec.md`, 이 문서)과 milestone/IL-LIM-018만 읽고 보고한다.

### reviewer 2차 재검토 배정 (§7.1)

- **목적:** 1차 검토 지적(결정적 A·B, 중요 C·D·F, 보통 E·G, 경미 H)이 수정본에서 실제로 해소됐는지,
  그리고 수정으로 새로 생긴 문제가 없는지 확인한다.
- **산출물:** 각 지적의 해소/미해소 판정과 최종 판정(승인 / 추가 수정 필요). 새 결함이 있으면 지적.
- **검증:** lead가 결과를 이 문서 로그에 반영. 승인이면 명세를 "검토 완료"로, 추가 수정이면 반영 후
  재차 확인.
- **제약:** 읽기전용(1차와 동일). 파일 수정·git 금지.

### reviewer 3차 닫힘 검증 배정 (§7.1)

- **목적:** 2차 검토 지적 4건(신규1~4)이 수정본에서 실제로 해소됐는지, 그리고 수정으로 새로 생긴 문제가
  없는지 확인한다. "다음: reviewer 3차 확인(닫힘 검증)"으로 기록된 유일한 잔여 검토 단계다.
- **산출물:** 신규1~4 각 지적의 해소/미해소 판정과 최종 판정(승인 / 추가 수정 필요).
- **검증:** lead가 결과를 작업 로그에 반영. 승인이면 명세 상태 줄을 "reviewer 2차 검토 반영 완료"로
  갱신하고 PR 준비. 추가 수정이면 반영 후 재차 확인.
- **제약:** 읽기전용(1·2차와 동일). 파일 수정·git 명령 금지.

## 작업 로그

- 2026-09-22: branch `test/m3-user-test-spec`를 main에서 분기. Java 코드 현황(languageId 연결됨,
  `java-jdtls` = unsupported tier, fixture 없음)과 toolchain 부재(JDK/jdtls 없음)를 직접 확인.
  사전 작업 문서 작성. 명세 본문 작성·커밋(16433da). 공유 worktree 제약 확인(단일 worktree,
  reviewer/tester 같은 branch 공유). reviewer 검토 dispatch(§7.1 배정 문서화 완료).
- 2026-09-22: **reviewer 1차 적대적 검토 수신(판정: 수정 필요).** cmux로 dispatch, reviewer가 3개
  문서를 Read하고 §15 체크리스트 10항목 판정 + 추가 결함 8건 보고. 결정적 2건:
  (A) T4 "indexing 중 빈 결과"가 jdtls 실측(indexing 중 블로킹→Ready)과 모순 →
  (B) milestone gate의 callable 오탐 과업 부재. 중요 3건(C: T3 timeout 환경 의존/무효세션,
  D: 참여자 패턴 적합성, F: T4-DI 금지단어 우회), 보통 2건(E: §9 폐쇄형 유도, G: build-없는
  cross-file 원인 미분리), 경미 1건(H: jdtls 캐시 OS별).
  **반영:** T6(callable 오탐) 신설, T4를 2출처로 재설계+indexing 제거, T3 재현 조건(자연/강제 형태
  +무효세션) 추가, §3 패턴 적합성 fallback, T4-DI 진행자 중립 제시 절차, §9 개방형화, build-없는
  cross-file 불확실성 명시, §5 jdtls `-data` OS별 처리, §8·§10·§15 갱신. 변경 파일:
  `user-tests/m3-user-test-spec.md`. **재검토 권장(2차 검토는 이후 배정).**
  검증 경계: 명세·검토 반영까지 완료. 실제 사용자 실행은 toolchain/참여자/승인 필요(미충족).
- 2026-09-22: **reviewer 2차 재검토 수신(판정: 추가 수정 필요).** 1차 8건은 전부 해소 확인. 단
  수정이 만든 내부 불일치 4건 지적: (신규1 결정적) §8·§10이 아직 "세 출처(indexing/cross-file/DI)",
  (신규2 중요) §1 목적 4항에 indexing 잔존, (신규3 중요) T6 관측 전제(도구가 getter를 callable
  진입점으로 제시하는지) 미확인, (신규4 보통) §3 fallback에 T4 build-없는 cross-file 누락. 잔여
  약점(§9 T4 "못 보는 호출이 있다면" 전제)도 지적.
  **반영:** §1·§8·§10을 두 출처로 통일, §8 T3 자연/강제 형태 구분, T6 수행 전제(도구 callable 진입점
  사전 확인) 추가, §3 fallback에 T4 cross-file 포함(항상 별도 non-build 구성), §9 T4 개방형 재작성,
  §15에 T6 전제·내부 일관성 항목 추가. grep으로 "세 출처/세 가지" 잔존 0 확인. 변경 파일:
  `user-tests/m3-user-test-spec.md`. 다음: reviewer 3차 확인(닫힘 검증).
- 2026-09-22: **reviewer 3차 닫힘 검증 수신(판정: 승인).** 신규1~4 4건 전부 해소 확인. 새 결함 없음.
  §15 체크리스트 전 항목이 본문과 대응 확인. 잔여 indexing 언급 전부 T3 timeout 경로 설명·금지 단어
  목록 등 정당한 문맥. §3 신규4("언제나 별도 non-build 구성")와 §6 T4 재현 판정은 층위가 달라 모순
  아님. 미확인 영역: IL-LIM-018 실측 수치 대조와 실제 실행(범위 밖).
  **검토 완료 처리:** 명세 상태 줄 갱신. 다음: PR 준비.
