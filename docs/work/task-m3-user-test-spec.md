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

- [ ] `m3-user-test-spec.md`가 생성되고 Java 중심 과업 + Kotlin/Swift 보류 사유를 포함한다.
- [ ] 명세가 유도 금지(M1/M2가 세운 자유서술→확인, 금지 단어) 규칙을 승계한다.
- [ ] reviewer 세션이 명세를 검토하고 판정·발견을 기록한다.
- [ ] 실행 경계가 명시된다: 이 작업은 **명세 작성 + 검토**까지이며, 실제 VS Code 실행은 JDK/jdtls/
  fixture 준비와 별도 승인이 필요하다(현재 이 환경에 toolchain 부재).

## 작업 로그

- 2026-09-22: branch `test/m3-user-test-spec`를 main에서 분기. Java 코드 현황(languageId 연결됨,
  `java-jdtls` = unsupported tier, fixture 없음)과 toolchain 부재(JDK/jdtls 없음)를 직접 확인.
  사전 작업 문서 작성. 다음: 명세 본문 작성 → reviewer 검토 배정(§7.1).
