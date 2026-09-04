# M3 Java 언어 지원 계획 반영

## 목적과 사용자 가치

- **누가 어떤 문제를 겪고 있는가?** Java 개발자는 Impact Lens를 전혀 쓸 수 없다. `.java`는
  `languageId()`에 case가 없어 `plaintext`로 떨어지고(직접 확인), preset catalog에도 Java가 없다.
  게다가 이 공백은 이미 다른 사용자에게도 영향을 준다 — M4의 Spring framework adapter가 "1차
  adapter"였다가 FastAPI로 바뀐 이유가 정확히 "Java/Kotlin 언어 지원이 없다"였다(`docs/development-
  management/milestones/m4-semantic-augmentation.md`의 2026-09-03 정정).
- **작업이 끝나면 무엇을 할 수 있게 되는가?** 이 작업 자체는 계획 문서만 바꾼다 — Java 개발자가 실제로
  이 도구를 쓸 수 있게 되는 것은 아니다. 하지만 "M3 이후"라는 지금까지의 막연한 표현이 실제 story
  (`IL-LIM-018`)로 구체화되어, 다음에 이 lane을 이어받는 세션이 무엇을 언제 구현해야 하는지 알 수
  있고, `IL-LIM-002`(Spring)의 5단계가 언제 시작 가능해지는지도 명확해진다.
- **상위 목표에서 어떤 역할을 맡는가?** M3(Swift·Kotlin 언어 확장 마일스톤)에 세 번째 언어를 추가하고,
  M4의 두 정정(M4 자신, `IL-LIM-002`)이 가리키던 미확정 참조를 실제 story로 연결한다.
- **왜 지금 하는가?** 사용자가 명시적으로 "진행 전 Java 언어 지원도 계획에 적절히 추가하라"고 지시했다
  (commander를 통해 전달, `scratchpad/java-language-support-planning.md` 요구사항). 진행 중이던 M4
  stage 3(`resolution: 'multiple'` 항목)보다 먼저 처리한다.

## 배경과 해결할 문제

- `m4-semantic-augmentation.md`와 `IL-LIM-002`(둘 다 2026-09-03 정정)가 "Spring adapter는 Java/Kotlin
  언어 지원이 생긴 뒤(M3 이후)에만 가능하다"고 이미 적어 뒀지만, 그 "M3 이후"가 가리키는 구체적인
  story가 없었다 — Kotlin(`IL-LIM-016`)은 있지만 Java는 없었다.
- `docs/development-management/milestones/README.md`의 "Story 소유권" 표는 `IL-LIM-002`의 비고에
  여전히 "Spring Java/Kotlin을 첫 framework adapter 후보로 사용"이라는, 이미 다른 두 문서에서 정정된
  내용을 그대로 갖고 있었다 — 한 곳만 고치고 나머지가 모순되는, 이 저장소가 반복해서 겪어 온 형태.

## 범위와 범위에서 제외할 항목

- **범위**: 계획 문서 5개 — 신규 story(`IL-LIM-018`), M3 마일스톤, milestones README, M4 정정 추가,
  `IL-LIM-002`의 Spring 관련 정정 추가.
- **제외**: Java preset 구현, jdtls 실제 동작 검증, `.java`를 `languageId()`에 추가하는 코드 변경 —
  전부 이 story의 구현 lane(향후) 몫이다. 이 lane은 계획만 바꾼다.

## 현재 구현 조사 결과

- **직접 확인**: `cli/src/providers/resolve.ts`의 `languageId()`에 `.java` case가 없어 `default:
  return 'plaintext'`로 떨어진다. `cli/src/providers/catalog.ts`의 `PROVIDER_CATALOG`은
  `bundledTypeScript`/`gopls`/`bundledPyright`/`clangd` 넷뿐, Java/Kotlin 없음.
- **직접 확인(범위를 좁히는 방향의 사실)**: `resolveProvider()`는 인식 못 하는 확장자를
  `languageMatch: 'unknown'`으로 처리하므로(`.h`, `notes.txt`와 같은 경로,
  `providers.test.ts`의 "an unrecognised extension asserts nothing about the language" 테스트로
  확인) raw custom provider 자체는 이론상 `.java`를 막지 않는다. 하지만 preset·문서·doctor 안내·
  Extension 노출이 전혀 없어 이 경로는 사용자가 발견할 수 없는 비공식 우회일 뿐이다 — "진입점이
  없다"는 문제의 본질은 그대로다.
- **문서 인용(실측 아님, 구현 lane에서 검증 필요)**: [Eclipse JDT Language Server](https://github.com/eclipse-jdtls/eclipse.jdt.ls)
  공식 저장소가 Call Hierarchy 지원, JDK 21+ runtime 요구, Maven/Gradle project 지원, standalone
  배포를 문서로 설명한다 — 실제 동작은 검증하지 않았다(clangd 사례처럼 문서 주장과 실제 동작이 다를
  수 있다는 것이 이미 이 저장소의 실측 결과).
- 아직 불가능한 사용자 결과: Java 개발자가 이 도구로 분석을 시작하는 것(이 lane이 메우지 않음, 구현
  lane의 몫). 이 lane이 메우는 공백: "M3 이후"라는 막연한 참조를 실제 추적 가능한 story로 만드는 것.

## 단계별 구현 계획

### 단계 1 — 신규 story와 4개 문서 정정

- 목적: Java 언어 지원의 문제·범위·조사·계획을 Kotlin story와 같은 수준으로 기록하고, 기존 4개 문서의
  미확정 참조를 이 story로 연결한다.
- 산출물:
  - `docs/development-management/stories/il-lim-018-java-language-support.md` 신규.
  - `docs/development-management/milestones/m3-p2-language-callables.md`: 제목·완료 소유·목표·포함
    범위·산출물·단계별 계획·종료 gate·제외 범위·주요 위험·다음 마일스톤 연결에 Java/`IL-LIM-018`
    반영. Swift 지연 시 Java를 떼어낼 수 있다는 조건을 명시(결정은 안 함).
  - `docs/development-management/milestones/README.md`: "전체 순서" 표의 M3 행, 의존 관계 다이어그램,
    "Story 소유권" 표에 `IL-LIM-018` 행 추가 + `IL-LIM-002` 행의 stale한 "Spring이 첫 adapter" 비고
    정정.
  - `docs/development-management/milestones/m4-semantic-augmentation.md`: 기존 2026-09-03 정정에
    새 날짜(2026-09-04) 추가 정정을 덧붙여 `IL-LIM-018`을 구체적으로 가리킨다(원문 보존, 원문
    인용 방식 — 이 정정 자신의 "줄 번호가 아니라 원문으로 인용한다" 규칙을 따름).
  - `docs/development-management/stories/il-lim-002-framework-di-routing.md`: 5단계의 2026-09-03
    정정에 같은 방식으로 추가 정정.
- 검증: 각 문서의 상호 참조(상대경로 링크)가 실제 파일을 가리키는지 확인. 5개 문서가 서로 모순되는
  숫자·표현을 갖지 않는지 재확인(Spring이 1차 adapter라는 stale한 표현이 다른 곳에 남아 있는지
  `grep`으로 재확인).

## 테스트 및 완료 기준

- 코드 변경이 없으므로 자동 테스트 대상은 아니다.
- 완료 기준: 5개 문서 모두 커밋되고, `grep -rn "Spring.*첫.*adapter\|Spring.*1차"`류 검색으로 stale한
  표현이 남아 있지 않음을 확인. commander에게 M3가 맞는 자리인지에 대한 독립적 판단(동의/이견)과
  근거를 보고.

## 작업 로그

- 2026-09-04: 5개 문서 작성/수정 완료(위 산출물 목록). `grep -rn "Spring Java/Kotlin을 첫"` 재확인 —
  README의 stale 표현 1건을 찾아 정정, 이후 0건. jdtls 관련 사실은 공식 GitHub 저장소 페이지를
  WebFetch로 확인해 인용(Call Hierarchy 지원 주장, JDK 21+ runtime, Maven/Gradle 지원, standalone
  배포 — 전부 "문서가 설명한다"로 표기, 실제 동작 검증이라고 표기하지 않음).
- M3가 맞는 자리인지 독립 판단: 대안(M2 재개, M4에 포함, 별도 M3.5)을 검토했다. M2는 이미 Done이고
  주제(P1 우선 언어)가 다르다. M4에 포함하면 "언어 지원과 framework 계층을 분리한다"는, M4 자신의
  정정이 방금 세운 원칙을 스스로 어긴다. 별도 milestone은 Kotlin과의 JVM readiness 공유 이점을 잃고
  가벼운 계획 변경치고 구조가 무거워진다. M3(Swift 지연 시 분리 가능하다는 조건 포함)가 가장 낫다는
  결론에 동의한다.
