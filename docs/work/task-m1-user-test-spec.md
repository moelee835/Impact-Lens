# M1 사용자 테스트 명세 작성과 검토

- 작성일: 2026-08-31
- branch: `docs/m1-user-test-spec`
- 대상 마일스톤: [M1 Provider 플랫폼과 무설정 UX 기반](../development-management/milestones/m1-provider-platform-ux.md) 4단계
- 실행 계획: [M1 Agent Team 실행 계획 W3-B·W3-C](task-m1-agent-team-execution.md)
- 선행 작업: [W2-A readiness 실측](task-m1-provider-readiness.md) PR #46,
  [W2-C 응답 정책](task-m1-plugin-response-policy.md) PR #48,
  [W3-A 상태 도달 가능성](task-m1-state-reachability.md) PR #49

## 목적과 사용자 가치

M1을 release로 확정하려면 **실제 사람이 도구를 써 보고 오해하지 않는지** 확인해야 한다. 지금까지 만든 것은
전부 자동 검사다. 자동 검사는 "도구가 정확한 값을 반환하는가"를 증명하지, **"사람이 그 값을 올바르게
읽는가"는 증명하지 못한다.**

이 마일스톤이 막으려는 사고가 정확히 후자다. 도구가 `complete: true`를 정직하게 반환해도, 사용자가 그걸
"안전하게 지워도 된다"로 읽으면 함수를 지우고 서비스가 깨진다. 값이 맞는 것과 전달이 되는 것은 다른
문제다.

이 작업은 **그 확인 절차서를 쓰는 것**이다. 실행은 아니다. 실행은 별도 승인 사항이며, M1 종료 gate도
"실제 사용자 검증 결과 **또는 실행 보류 사유**가 release decision에 기록된다"로 두 갈래를 허용한다.

이 작업이 끝나면 다음 결과를 얻는다.

- 사람을 앉혀 놓고 무엇을 시킬지, 무엇을 관측할지, 무엇을 통과로 볼지가 확정된다.
- 명세가 **오늘 실제로 되는 것만** 검증한다. 안 되는 것을 시키면 참여자 시간을 버리고, 알려진 의도된 실패를
  발견인 것처럼 기록하게 된다.
- 검토를 거쳐 재현 가능성·안전성·유도 편향 결함이 실행 전에 걸러진다. 사람을 부른 뒤에 명세가 틀린 것을
  알면 그 라운드는 통째로 버려진다.

## 배경과 해결할 문제

### 명세가 반드시 반영해야 할 두 가지 사실

이 lane이 앞선 작업과 다른 점은, **무엇을 검증할 수 없는지가 이미 증명돼 있다**는 것이다.

**사실 1 — shipped catalog에는 preset이 하나뿐이다.**
`cli/src/providers/catalog.ts`에 있는 것은 bundled TypeScript 하나(`typescript`, `typescriptreact`,
`javascript`, `javascriptreact`)뿐이고 tier는 `bundled`다. `verified-external` preset이 하나도 없으므로
**auto-discovery가 발견할 대상이 존재하지 않는다.** 다른 언어에서는 `provider_required_for_language`로
끝나고 사용자는 custom 설정으로 가야 한다.

즉 마일스톤이 약속한 "일반 사용자가 command/args 없이 Auto로 시작한다"는 오늘 **TypeScript/JavaScript에서만
현실**이다.

**사실 2 — shipped catalog에서 색인 상태는 항상 `unknown`이다.**
W3-A(PR #49)가 실행으로 증명했다. shipped catalog로 도달 가능한 완료 상태는 3개이고 전부
`indexingStatus: unknown`이다. `ready`와 `working`은 사용자가 readiness를 선언한 provider를 **직접
설정해야** 나온다.

따라서 "색인이 진행 중임을 도구가 알려주는가"는 기본 설정만으로는 **검증 불가능한 과업**이다.

### 이 두 사실을 무시하면 생기는 일

명세를 마일스톤 문구만 보고 쓰면 이런 과업이 들어간다.

- "Python 프로젝트에서 Auto로 시작해 보세요" → 오늘 반드시 실패한다. 참여자는 도구가 고장 났다고 판단하고,
  기록에는 알려진 의도된 동작이 결함으로 남는다.
- "색인 중이라는 안내를 이해했는지 답해 주세요" → 그 안내가 뜨지 않는다.

**참여자 시간은 이 프로젝트에서 가장 비싼 자원이다.** 되지 않는 것을 시키는 과업은 그것을 낭비하면서
아무것도 알려주지 않는다.

### 가장 값진 과업

`complete: true`의 해석이다. IL-LIM-009 전체가 이것 하나를 막으려고 존재하고, W2-C가 에이전트 지침을 고쳐
전달 경로를 손봤다. 하지만 **그 문구가 실제 사람에게 통하는지는 아직 아무도 확인하지 않았다.** 자동 검사는
금지어가 안 나오는 것까지만 증명한다.

### 기존 자산

`m0-user-test-spec.md`가 14개 절 구조와 품질 기준을 이미 세워 놨다. 특히 두 가지를 그대로 따른다.

- **수치 기준을 추측하지 않는다.** pilot으로 baseline을 만든 뒤 확정한다.
- **수집 금지 항목을 명시한다.** 절대 경로, 사용자명, source 본문, credential.

`m0-environment-setup.md`가 환경 준비 절차를 따로 분리해 둔 것도 그대로 따른다.

## 범위

- `docs/development-management/user-tests/m1-user-test-spec.md` 작성
- 과업을 오늘 도달 가능한 상태에만 대응시키고, 도달 불가능한 것은 제외 사유와 함께 기록
- Auto 시작, doctor 안내만으로 복구, custom 전환, `complete` 정적 범위 해석의 네 축 설계
- 관측 지표, 통과·보류 기준, privacy 규칙, 증거 형식
- 작성자가 아닌 별도 세션의 적대적 검토(W3-C)와 그 결과 반영

## 범위에서 제외할 항목

- **명세 실행.** 참여자 모집, 세션 진행, 결과 수집은 별도 승인 사항이다.
- 수치 합격선 확정. pilot 전에는 추측하지 않는다(M0와 동일).
- 코드·schema·CLI 동작 변경. 이 lane은 문서만 만든다.
- shipped catalog에 preset 추가
- M0 사용자 검증 실행
- 실제 외부 Language Server 호환 검증(IL-LIM-005 4단계, M2 이후)

## 설계 결정

### 1. 과업은 도달 가능한 상태에서만 만든다

W3-A가 만든 재고 목록이 이 명세의 입력이다. 과업마다 "이 과업이 기대하는 상태가 shipped catalog에서
도달 가능한가"를 확인하고, 아니면 과업을 빼거나 **사용자가 직접 provider를 설정하는 고급 과업으로 분리**한다.

### 2. 검증할 수 없는 것은 숨기지 않고 적는다

"색인 진행 중 표시"처럼 오늘 검증 불가능한 항목은 명세에서 조용히 빼지 않고, **제외 항목으로 사유와 함께
남긴다.** 나중에 preset이 readiness를 선언하면 그때 무엇을 추가해야 하는지가 이 문서에 이미 적혀 있어야
한다.

### 3. 검토자는 작성자가 아니다

실행 계획이 W3-C에 `il-reviewer` 규칙을 지정한 이유가 있다. 명세를 쓴 쪽은 자기가 의도한 해석을 알기 때문에
유도 질문과 모호한 지시를 못 본다. 그래서 **작성 세션과 다른 세션이 검토**하고, 검토자는 구현하지 않고
결함만 보고한다.

### 4. 유도 편향을 결함으로 취급한다

"이 결과가 안전하다고 보이나요?"는 답을 심는 질문이다. 사용자가 `complete: true`를 어떻게 읽는지 알고
싶으면 **먼저 자유 서술로 묻고**, 선택지는 나중에 준다. 이 규칙 위반은 검토에서 결함으로 처리한다.

## 단계별 구현 계획

### 1단계 — 목적·제약 고정

목적: 명세가 오늘 되는 것만 검증하도록, 검증 불가능한 영역을 근거와 함께 미리 확정한다.

산출물: 이 문서, 카탈로그·도달 가능성 조사 근거.

검증: 카탈로그와 W3-A 결과를 코드·test에서 재확인, 문서 link 존재, `git diff --check`. 문서만 독립
commit·push.

### 2단계 — 명세 초안 작성 (W3-B)

목적: 사람을 앉혀 놓고 실행할 수 있는 절차서를 만든다.

산출물: `m1-user-test-spec.md`, 과업별 도달 가능성 근거, 제외 항목과 사유.

검증: 모든 과업이 도달 가능한 상태에 대응하는지 대조, 문서 link, `git diff --check`. 독립 commit·push.

### 3단계 — 적대적 검토와 반영 (W3-C)

목적: 사람을 부르기 전에 재현 불가·안전 위반·유도 편향을 걸러낸다.

산출물: 검토 결함 목록과 처리 결과, 반영된 명세, 작업 로그.

검증: 각 결함의 반영 또는 반영하지 않은 사유 기록, 전체 문서 정합성, `git diff --check`.
독립 commit·push하고 PR을 연다.

## 테스트 및 완료 기준

- [x] 모든 과업이 shipped catalog 또는 명시된 사용자 설정으로 도달 가능한 상태에 대응한다. (2단계 —
  T1/T4는 W3-A `SHIPPED_CATALOG_REACHABLE`의 succeeded/exhausted/unknown 상태, T2/T3는 코드에서 직접
  확인한 `provider_config_invalid`/`provider_required_for_language` 오류 경로에 대응한다.)
- [x] 도달 불가능해서 제외한 항목이 사유와 함께 기록된다. (§2, 표 4행 — 근거 코드 인용 포함)
- [x] Auto 시작 과업이 TypeScript/JavaScript에 한정된다는 사실이 명시된다. (§1-1, §2)
- [x] 비-TS 언어 과업은 custom 설정 경로로 설계되고 `provider_required_for_language`가 기대 결과다.
  (§6 T3, §7)
- [x] `complete: true` 해석 과업이 자유 서술을 먼저 요구한다. (§6 T4 절차 1번, 유도 질문 명시적 금지)
- [x] 수치 합격선을 pilot 전에 확정하지 않는다. (§10, M0와 동일 규칙 명시)
- [x] 수집 금지 항목(절대 경로, 사용자명, source 본문, credential)이 명시된다. (§11)
- [x] 도구가 참여자 프로젝트를 build·install·sync하지 않는다는 것이 관측 항목에 포함된다. (§8 "안전
  불변식")
- [ ] 작성 세션과 다른 세션이 검토하고, 각 결함의 처리 결과가 기록된다. — 3단계(W3-C) 대상, 아직 검토
  전이다.
- [x] 문서 link 대상이 모두 존재한다. (10개 링크 전부 파일 존재 확인, 아래 로그)
- [x] `git diff --check` 통과
- [ ] 각 단계가 독립 commit으로 동일 이름 원격 branch에 push되고 main 대상 PR이 열린다. — 1·2단계는
  각각 commit·push됐다. PR은 3단계(검토) 이후 연다.

## 작업 로그

### 2026-08-31 — 1단계 조사와 제약 확정

- `origin/main` `91a8136`에서 branch를 만들었다.
- `cli/src/providers/catalog.ts`에 preset이 bundled TypeScript 하나뿐이고 `verified-external`이 없음을
  확인했다. auto-discovery가 발견할 대상이 없으므로 "Auto로 시작"은 TS/JS 한정이다.
- W3-A의 `SHIPPED_CATALOG_REACHABLE`이 3개이고 전부 `indexingStatus: unknown`임을 확인했다. 색인 진행 중
  표시는 기본 설정으로 검증 불가능하다.
- 이 두 제약을 명세 설계의 입력으로 고정했다. 마일스톤 문구만 보고 명세를 쓰면 반드시 실패하는 과업이
  들어간다.
- 실행은 이 lane의 범위가 아니다. M1 종료 gate가 "검증 결과 또는 보류 사유" 두 갈래를 허용한다는 것을
  확인했다.

### 2026-08-31 — 2단계 명세 초안 작성

계획/검토 세션이 1단계를 승인하고 2단계 요구사항(R1~R6)을 넘겼다. 이 세션이 구현했다.

- 요청이 준 두 제약(shipped catalog는 bundled TypeScript 하나, 도달 가능 상태는 전부
  `indexingStatus: unknown`)을 코드에서 다시 확인했다 — 둘 다 정확했다.
- **요청이 주지 않은 세 번째 제약을 발견했다.** `ready`/`working`뿐 아니라 `provider_project_metadata_missing`도
  오늘은 **어떤 실제 사용자도 만들 수 없다.** 둘 다 preset의 `readiness` 하위 필드
  (`requiredProjectFiles`/`signals`)에서만 나오는데, `readiness`는 `ProviderPreset`(catalog 항목)에만
  존재하고(`cli/src/providers/preset.ts:105-110`), 요청 JSON도 `.impact-lens/provider.json`도 그 필드를
  받지 않는다(`ALLOWED_FIELDS`, `cli/src/providers/projectConfig.ts:17` — `presetId`/`command`/`args`/
  `languageId`/`initializationOptions`/`settings`뿐). 이 둘을 만드는 유일한 경로는
  `LspCallHierarchyProvider` 생성자의 `resolution.catalog` override인데, 이는 `stateReachability.
  integration.test.ts`·`readiness.integration.test.ts`가 쓰는 test 전용 TypeScript API이고 CLI의 stdin
  JSON·CLI 인자 어디에도 노출되지 않는다. 요청은 R5에서 "`provider_project_metadata_missing`을 관측
  항목으로 만들라"고 했지만, 이 오류 자체를 과업으로 발생시킬 방법이 없다는 뜻이므로 R5의 구체적
  메커니즘(누락 파일로 유도) 그대로는 쓸 수 없었다. 대신 R5의 **취지**(도구가 프로젝트를 대신
  만들지 않는다는 안전 불변식)를 모든 과업에 걸친 관측 항목으로 살리고, `provider_project_metadata_missing`
  자체는 §2 제외 표에 `ready`/`working`과 같은 행 옆에 같은 근거로 추가했다.
- **또 하나 발견**: `doctor <preset>`는 catalog preset id만 받는다(`cli/src/doctor/index.ts:68-75`,
  일치하는 preset이 없으면 무조건 `invalid_command`). T3(custom provider)에서 참여자가 구성한 raw
  command는 doctor로 점검할 방법이 없다 — 그래서 "doctor 안내만으로 복구"(축 2)는 T3가 아니라 별도
  과업(T2)으로, bundled-typescript preset 자체를 대상으로 설계했다. `.impact-lens/provider.json`이
  M0 이후 새로 생긴 계층이라는 점에 착안해, 허용되지 않은 필드를 하나 심어 `provider_config_invalid`를
  일으키고 오류 메시지/`doctor`의 `project-config` check만으로 복구하게 했다. M0가 이미 검증한
  Node/CLI artifact/release fallback 복구는 반복하지 않고 M0 문서를 그대로 인용했다.
- R1(M0 구조 준수)대로 M0의 14개 절 구조를 그대로 따랐다. 편차는 §2(제외 항목에 "왜"·"무엇이 바뀌어야
  하는지" 두 열을 표로 추가 — M0는 글머리표뿐이었다)와 §11(T4 발화 인용에 별도 동의를 요구하는 문장
  추가) 두 곳뿐이다.
- 문서에 인용한 코드 줄 번호를 전부 `sed -n`으로 재확인했다(로그 작성 시점 기준). 두 곳이 살짝 어긋나
  있어(`projectConfig.ts:19`→`17`, `lspProvider.ts:537-545`→`537-544`) 고쳤다.
- 문서 내 markdown 링크 10개를 전부 추출해 상대경로가 실제 파일로 해석되는지 스크립트로 확인했다 — 전부
  존재.
- `git diff --check` 통과.

### 2026-08-31 — 검토 1라운드 반영

계획/검토 세션이 3단계(W3-C) 검토 1라운드에서 5개 결함(F1~F5)을 보고했다. 세 번째 제약(readiness는
catalog preset 전용) 발견은 독립적으로 재검증해 확정했고, R2/R5 원안이 틀렸다고 인정했다. 아래는 각
결함의 처리 결과다. 전부 반영했고, 반려한 항목은 없다.

- **F1 (안전, 최고 심각도) — S3가 참여자 소유 저장소에 원복 없이 파일을 심었다.** 지적이 정확했다.
  §5 S3의 진행자 지시가 "참여자 워크스페이스"라고만 돼 있어 §4의 "참여자 본인의 실제 저장소" 배정과
  합쳐지면 실제 소유 저장소를 건드릴 수 있었다. §4를 고쳐 T2·T4는 **공통 sample 저장소만** 쓰게 하고
  (T1만 참여자 본인 저장소 + sample), §5 S3은 그 sample 저장소의 **별도 임시 checkout**에서만 손상을
  만들도록 다시 썼다. §13에 "T2 teardown" 항목을 새로 추가해 과업 종료 즉시 그 checkout 전체를 삭제하고
  참여자에게 삭제를 보여주는 절차를 넣었고, §12 증거 형식에 `teardown confirmed` 필드를, §14 체크리스트에
  검증 항목을 추가했다. "시스템 상태에 영향 없다"던 §5의 근거 문장도 "참여자 프로젝트 상태에도 영향
  없다"로 고쳐, 지적받은 대로 틀린 축(시스템 vs 프로젝트)을 바로잡았다.
- **F2 (재현성) — T4 자극이 고정돼 있지 않았다(원문 JSON 대 host 렌더링 화면).** 검토자의 판단(host가
  실제로 렌더링하는 응답이 정직한 자극이다 — 실제 사용자가 결과를 만나는 방식이 그것이므로)을 그대로
  받아들였다. §5 S4와 §6 절차 1번을 다시 써서, 진행자가 JSON을 손으로 보여주는 경로를 완전히 없애고
  참여자가 T1과 같은 문구로 직접 실행해 host가 보여주는 그대로를 쓰도록 고정했다. §4의 Host 축(Codex
  CLI, Claude Code)이 이미 두 경로를 모두 조합별로 커버하므로 별도 축을 추가할 필요는 없었다.
- **F3 (재현성) — 진행자 대사가 T4에만 verbatim이었고, T2의 doctor 실행 위치가 안 적혀 있었다.** 둘 다
  받아들였다. §6 도입부에 T1~T3 전체에 적용되는 고정 유도 회피 문장("문서와 도구 출력에서
  찾아보시면 됩니다.")을 추가하고, T2의 중단 조건(§7)을 "그 문장 밖의 답을 줌"으로 다시 썼다.
  `doctor`의 `project-config` check가 `options.workspace ?? process.cwd()`(`doctor/index.ts:79`,
  검토자 인용과 재확인 결과 정확)를 읽는다는 사실을 §5에 근거와 함께 적고, 진행자 준비 자료가 참여자의
  실행 위치를 임시 checkout 안으로 맞춰 둬야 한다고 못박았다. §7 T2 행의 doctor 명령 예시에도
  `--workspace <임시 checkout 경로>`를 넣었다.
- **F4 (정확성) — §1이 자동 검사 범위를 과장했다.** 정확한 지적이었다 — 축 4의 자동 절반은 W1~W3-A가
  아니라 W2-C의 response-policy eval이고, 그것도 "CLI가 정확한 값을 반환하는가"가 아니라 "에이전트
  요약이 정책을 지키는가"를 증명한다는 점에서 축 1~3과 증명 대상 자체가 다르다. §1 도입부를 다시 써서
  두 종류의 자동 검사를 구분해 인용했다.
- **F5 — §10의 T4 행이 "본 라운드에서 확정 전에도 적용"이라는 절 제목과 맞지 않는 선호를 적용 기준인
  것처럼 적어 놓았다.** 정확했다. "비율이 낮을수록 좋다"는 문장을 정성 통과 기준에서 빼 baseline 측정
  항목으로 옮기고, 정성 통과 기준에는 지금 바로 평가 가능한 "0명 언급 시 보류"만 남겼다.
- 반려한 항목: 없다. F2의 자극 고정 방식(원문 JSON vs host 렌더링)이 유일하게 판단이 갈릴 수 있는
  지점이었는데, 검토자의 근거(실제 사용자가 결과를 만나는 방식)가 이 문서 §1이 이미 세운 목적("사람이
  실제로 그렇게 읽는지")과 정확히 들어맞아 그대로 받아들였다.
- 반영 후 markdown 링크 10개를 다시 추출해 재확인했다(변화 없음, 전부 존재). `git diff --check` 통과.
- 남은 것: 2라운드 검토(`impact-lens-69`, 사용자 승인 대기 중)가 아직이다. 도착하면 계획/검토 세션이
  전달하기로 했다.
