# M2 마일스톤 종료 처리 (A)

- 상태: 판정 완료, commander 승인 완료 — PR 올리고 CI 대기
- branch: `feat/m2-closure-a`
- 선행: PR #66(`feat/m2-fastapi-e2e`, IL-LIM-006) merge 완료(squash `76aae08`) 후 착수. M2의 세 언어
  (Python·Go·C/C++) 코드 작업 전부 완료.
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m2-closure-release.md`(commander scratchpad) — **A절만
  수행한다.** B(릴리스)는 A가 merge된 뒤 별도 PR.
- 성격: **코드 변경 없음.** 문서와 상태 기록만.

## 목적과 사용자 가치

**지금 M2의 실제 상태는 "코드는 다 들어갔는데 무엇이 증명됐는지는 아무도 정리하지 않은" 것이다.** 세
스토리(IL-LIM-004/006/014)의 수용 기준 17개 중 IL-LIM-006의 6개만 PR #66이 체크했고 나머지 11개가
`[ ]`이며, 마일스톤은 `상태: Planned`다. 이 상태로 릴리스하면 사용자에게 무엇을 약속하는 릴리스인지
우리도 말할 수 없다.

**이 작업이 끝나면** 각 언어가 어느 수준까지 검증됐고 무엇이 안 됐는지가 근거와 함께 남는다 — 그리고
**이번 판정 과정에서 실제로 미충족인 항목 2개를 코드가 아니라 이 종료 처리 자체가 찾아냈다**(아래
"핵심 발견" 참고). 다음 마일스톤(그리고 B. 릴리스)이 이 기록 위에 선다.

## 핵심 발견 — 판정 중에 새로 찾은, 아직 못 닫는 항목 2개

수용 기준을 하나씩 근거와 대조하는 과정에서(A-2), **코드가 실제로 무엇을 증명하는지 재확인**하다가
이전 lane들이 언급하지 않은 gap 2개를 발견했다. 둘 다 **기능이 없는 게 아니라 반복 가능한 CI 증거가
없는 것**이다 — 즉 이 종료 처리(문서·상태 lane)가 아니라 후속 코드 lane이 닫아야 한다.

1. **Go의 single-file 케이스가 repeating fixture로 증명된 적이 없다.** `catalog.ts`의 gopls
   `fixture`(`target.go`/`caller.go`)는 순수 cross-file이다 — `target.go`에는 `FixtureTarget` 정의만
   있고 같은 파일 안에서 그것을 부르는 코드가 없다. Python(`bundled-pyright`)은 same-file 대조군을
   `pythonFastapiIntegration.test.ts`(`normal_helper`/`regular_caller`, 같은 파일)로, clangd는 preset
   자신의 single-file fixture(`CLANGD_FIXTURE_C`, 저하 경로 증명용)로 각각 same-file 케이스를 갖고
   있는데, gopls만 없다. `cli/src/test/stateReachability.integration.test.ts`의 "the real shipped
   gopls preset..." 테스트도 이 같은 cross-file fixture를 그대로 쓴다 — 직접 grep으로 확인(`target.go`/
   `caller.go`를 쓰는 파일이 `catalog.ts` 자신뿐임을 확인).
2. **C++ method/overload가 repeating fixture로 증명된 적이 없다.** `catalog.ts`의 clangd
   `docs.limitations`에 있는 virtual dispatch 항목(*"a virtual method Derived::target overriding
   Base::target..."*)은 stage 4의 **한 번의 수동 probe**로 얻은 서술이다 — `class`/`virtual`/`::`를
   포함하는 `.cpp` 테스트 fixture가 저장소 어디에도 없다(직접 grep 확인,
   `cli/src/test/clangdIntegration.test.ts`는 `.c` 파일 두 개뿐). `docs.limitations`에 기록하는 것과
   `verified-external` 승격 근거로 반복 통과하는 것은 다른 요구이고, IL-LIM-014 수용 기준 3번은
   명시적으로 후자("반복 통과한다")를 요구한다.

**이 종료 처리의 범위 밖**(코드 변경 금지)이므로 두 gap을 닫지 않고, IL-LIM-004/IL-LIM-014의 해당
수용 기준과 마일스톤 gate 1·2를 열어 둔 채 이유를 적었다(A-2·A-4). 후속 코드 lane 후보로 각 스토리
문서에 기록했다.

## A-1. 사용자 테스트 명세 커밋

`m2-user-test-spec.md`(commander scratchpad, 계획 세션 작성·reviewer 검토 — T4 유도 편향 결함 1건
발견·정정 완료)를 **내용 변경 없이** `docs/development-management/user-tests/m2-user-test-spec.md`로
그대로 옮겼다. 바꿔야 할 이유는 찾지 못했다.

## A-2. 수용 기준 17개 판정

아래 표에 요약, 각 스토리 문서 자체에 근거와 함께 체크(또는 미체크+사유)했다.

### IL-LIM-004 (6개 — 이 lane이 판정)

| # | 문구 | 판정 | 근거/사유 |
| --- | --- | --- | --- |
| 1 | 지원 버전·설치 조건 문서화 | ✅ | `catalog.ts`의 `docs.install`/`lastVerified` 4개 preset 전부 + README/INSTALL/cli-README |
| 2 | single-file·cross-file fixture 통과 | ⚠️ 부분 | TS(기존)·Python·clangd는 둘 다 있음. **Go는 cross-file만**(위 "핵심 발견" 1번) — 미체크 |
| 3 | 감지 실패가 후보·해결법과 함께 보고 | ✅ | `resolve.ts:316`(`executableNotFound`) — `candidates`+`install` 필드, `doctor.test.ts:117`/`providers.test.ts:227` |
| 4 | 수동 provider 설정 하위 호환 | ✅ | raw custom이 여전히 최우선(`resolve.ts`), `providers.test.ts` 우선순위 테스트 |
| 5 | 검증 언어는 provider JSON 없이 Plugin 분석 시작 | ✅(추론 포함, 아래 참고) | CLI 레벨 auto-discovery는 4개 preset 전부 실측; Plugin runner(`plugins/impact-lens/scripts/run-impact-lens`)는 "language"/"provider" 문자열이 사실상 없는 순수 CLI 해석 스크립트(직접 grep 확인)라 요청 내용에 관여하지 않음 — **CLI 증거가 Plugin에도 적용된다는 것은 이 무관여성에서 나온 추론이고, Plugin 자신을 통한 Python/Go/clangd 전용 E2E는 없다**(`scripts/test-plugin-artifact-e2e.mjs`는 TS/TSX/JS/JSX만 — 자기 출력 문구로 확인). 이 seam을 표시해 둔다. |
| 6 | 미지원 확장자 TS silent fallback 금지 | ✅ | `providers.test.ts`/`contract.test.ts`의 "unclaimed language"(현재 `.swift`) 테스트 |

### IL-LIM-006 (6개 — PR #66이 이미 체크, 이 lane은 근거 유효성만 확인)

재작업하지 않았다. 6개 항목 전부 실측 근거(테스트 이름, `docs/work/task-m2-fastapi-e2e.md` 위치)가
붙어 있고, 6개 중 4개는 이 branch가 merge된 `main`에서 직접 실행해 재확인했다(`npm run cli:test`
327/329, `provider_null_incoming_calls` 두 테스트 pass). 근거 유효 — 변경 없음.

### IL-LIM-014 (5개 — 이 lane이 판정, macro 항목은 A-3 정정 기준으로)

| # | 문구 | 판정 | 근거/사유 |
| --- | --- | --- | --- |
| 1 | provider JSON 없이 `.c`/`.cpp` 자동 선택 | ✅ | `clangdIntegration.test.ts`의 두 테스트, `provider` 필드 없음, `selectedBy: 'auto'` 단언 |
| 2 | compile database 유무·경로·staleness·capability가 doctor에서 구분 | ✅ | `doctor/checks.ts:312`(`compileDatabaseCheck`) — missing/ambiguous/stale/present 4상태 |
| 3 | direct·cross-file·method·overload가 반복 통과 | ⚠️ 부분 | direct·cross-file은 `clangdIntegration.test.ts`로 반복 증명. **method·overload는 없음**(위 "핵심 발견" 2번) — 미체크 |
| 4 | function pointer·virtual dispatch·macro·조건부 컴파일 한계가 기록 | ✅(A-3 정정 반영) | `catalog.ts`의 `bundledClangd... docs.limitations` 4항목 전부(macro는 정정된 문구 — "simple macro는 정확히 잡힘, 복잡한 패턴은 미검증") |
| 5 | metadata 없을 때 configure/build 미실행, 안내만 | ✅ | `compile_database_missing.action`은 안내 문구뿐(`coverage.ts:404`), 자동 실행 코드 경로 없음(전 lane에서 확인) |

## A-3. macro 문구 정정 — 두 곳

**작성 시점 가정이 stage 4 실측으로 반증됐다.** `docs/work/task-m2-clangd-preset.md` stage 4와
`catalog.ts`의 clangd `docs.limitations`(*"A simple macro that expands directly to a function call is
resolved correctly (verified); more complex macro patterns generating calls (token-pasting, X-macros)
have not been tested."*)가 근거다 — simple macro는 clangd가 post-preprocessor AST로 동작하기 때문에
정확히 잡힌다. 아래 두 문구를 **원문을 지우지 않고 정정 주석**으로 고쳤다(이 저장소 관행):

1. `m2-p1-language-support.md` 종료 gate 4번.
2. `il-lim-014-c-cpp-clangd-support.md` 수용 기준 4번(위 표에도 반영).

## A-4. 마일스톤 종료 gate 8개 판정

| # | 문구 | 판정 | 근거/사유 |
| --- | --- | --- | --- |
| 1 | 세 스토리 수용 기준 통과 | ⚠️ 열림 | IL-LIM-004 #2, IL-LIM-014 #3 미충족(위 A-2) |
| 2 | single/cross-file fixture가 OS/provider matrix에서 반복 통과 | ⚠️ 열림 | 같은 근본 원인(Go single-file, C++ method/overload) |
| 3 | 검증 언어는 provider JSON 없이 분석 시작 | ✅ | IL-LIM-004 #5와 동일 근거 |
| 4 | DI/decorator·function pointer·virtual dispatch·macro 한계 표시 | ✅(A-3 정정 반영) | IL-LIM-014 #4와 동일 근거 + Python `provider_null_incoming_calls`/`docs.limitations` |
| 5 | compile database·Python environment 문제는 zero callers 아닌 readiness error/limitation | ✅ | `compile_database_missing/_stale/_ambiguous`, Python `reportMissingImports`가 diagnostic으로 가시화(silent 아님) |
| 6 | CMake configure·package install·virtualenv 생성·dependency sync 자동 실행 금지 | ✅ | 세 lane 전부 명시적 설계 결정으로 확인(작업 로그), `buildInvocation.sources.test.ts`의 spawn-site 전수조사가 여전히 유효(새 spawn 지점 없음) |
| 7 | 기존 bundled TS/JS·custom provider 회귀 없음 | ✅ | `npm run cli:test` 세 lane 전체에 걸쳐 지속 통과, TS 회귀 테스트 불변 |
| 8 | user-test 명세가 검토됐고, 실행 결과 또는 보류 사유가 지원 등급 결정에 연결 | ✅(보류 사유로 닫음) | 아래 참고 |

**gate 8 상세**: 명세는 작성 완료·검토 완료(reviewer가 T4 유도 편향 결함 1건 발견·정정, A-1).
**실행은 하지 않았다** — 마일스톤 4단계가 "지금은 project나 참여자를 선정하고 실행하지 않는다"고
명시했고, 실행(5단계)은 이 종료 처리(4단계 산출물 정리)와 다른, 별도 승인이 필요한 작업이다. **M1이
같은 형태의 gate를 같은 방식으로 닫은 선례가 있다**(`m1-provider-platform-ux.md` 종료 gate 마지막
항목 — "실제 사용자 검증 결과 또는 실행 보류 사유가 release decision에 기록된다"를 `[x]`로 체크하고
보류 사유를 적음).

**지원 등급 — tier와 승격 등급을 구분**: 이 저장소의 `tier`(`bundled`/`verified-external`)는 **배포
형태**다 — Python은 CLI에 번들, Go·C/C++는 사용자가 직접 설치. 마일스톤 5단계가 말하는
`verified`/`experimental`/`unsupported`는 **별개 축**(사용자 검증 승격 등급)이다. **사용자 검증
(m2-user-test-spec.md 실행)이 아직 없으므로, 세 preset 전부 지금은 `experimental`이다** — 이는
추측이 아니라 각 스토리 자신의 rollout 절이 이미 명시한 원칙이다: IL-LIM-006 "Python CLI preset은
모든 gate 통과 전 `experimental` 또는 `custom` 상태를 유지한다", IL-LIM-014 "첫 release는 doctor와
experimental preset으로 시작하고 기본 Auto 실행은 pinned matrix 통과 후 켠다". `verified` 승격은
마일스톤 5단계(사용자 검증) 실행 이후에만, 언어별로 독립적으로 결정된다(평균 내지 않음,
`m2-user-test-spec.md` §10).

## A-5. 상태 필드 갱신 — commander 결정 반영

**관찰(전례 조사)**: M1이 완전히 닫힌 뒤에도 IL-LIM-005·IL-LIM-009(둘 다 M1의 gate 1이 "수용 기준
모두 통과"라고 확인한 스토리)의 `상태`는 지금도 `Backlog`로 남아 있다(직접 확인). 이 저장소는 스토리
`상태`를 마일스톤 종료와 함께 갱신해 온 전례가 없다 — 마일스톤 자신의 `상태`만 갱신됐다
(`m1-provider-platform-ux.md`: `Done — v0.7.0으로 발행됨`).

**commander 결정**: 이 전례 조사가 정확하다고 확인받았고, 그대로 따르기로 결정됐다.

- **스토리(`IL-LIM-004`/`006`/`014`)의 `상태`는 건드리지 않는다.** M2 것만 바꾸면 M1이 상대적으로
  덜 완료된 것처럼 보이는 거짓 대비가 생긴다 — 지금 안 건드리는 것이 전례와 일관되고, 다음 사람이
  "왜 안 고쳤지"를 재조사하지 않도록 이 절에 이유를 남긴다.
- **마일스톤(`m2-p1-language-support.md`)의 `상태`는 갱신한다 — `완료`가 아니다.** 같은 문서의 gate
  표가 2건(gate 1·2)이 열려 있다고 말하는데 `완료`로 적으면 자기 문서와 모순된다. 실제 값:
  `종료 처리 완료(task-m2-closure.md) — gate 1·2 미충족(Go same-file fixture, C++ method/overload
  반복 검증 없음). 세 preset은 사용자 검증 미실행으로 지금은 experimental.` — 무엇이 남았는지가
  상태 값 자체에서 읽히게 썼다.

## Go/C++ gap 2건 — 후속 lane으로 미루지 않고 별도 lane에서 바로 닫는다

commander 결정: **미루지 않는다.** 둘 다 작다(Go는 same-file fixture 하나, C++은 method/overload
반복 검증). 미루면 M2가 영원히 gate 2건이 열린 채로 남는다. **다만 이 PR(A)에는 넣지 않는다** — A는
코드 변경 없는 판정 기록이고, 그 성격을 유지한다. **A merge 후 별도 lane**에서 처리하고, **그 lane이
근거를 만들면서 해당 수용 기준을 스스로 체크한다**(증거를 만든 lane이 체크하는 것이 자연스럽다).

**C++ 쪽이 우선순위가 높다** — `docs.limitations`의 virtual dispatch 주장이 **한 번의 수동 probe**에
기대고 있다는 것이 이번 종료 처리의 핵심 발견이었다. 사용자가 그 문장을 읽고 행동하는데 반복 검증이
없다 — 지금은 clangd나 컴파일러가 바뀌면 그 문서가 조용히 낡는다. 반복 fixture가 생기면 그 주장이
CI가 지키는 사실이 된다.

## 검증

- 체크한 모든 항목에 근거가 달려 있는가 — 위 표 전부 파일 경로/테스트 이름/PR 번호로 근거를 달았다.
- 열어 둔 항목마다 이유가 적혀 있는가 — IL-LIM-004 #2, IL-LIM-014 #3, gate 1·2 전부 구체적 gap을 적었다.
- 상태 필드가 실제 판정과 모순되지 않는가 — 마일스톤 `상태`가 gate 1·2 미충족과 experimental 등급을
  값 자체에 담고 있어 모순되지 않는다. 스토리 `상태`는 의도적으로 안 바꿨다(위 참고).
- 코드 변경 없음 — `git diff --stat`으로 문서 파일만 변경됐는지 확인.

## 남은 작업

- **A 전체 완료. commander 승인 받고 PR 올림 — CI 통과 확인 후 보고, reviewer에게 넘어간다.**
- **B(릴리스)는 A merge 후 착수**(commander 지시, 요구사항 문서의 B절).
- **후속 lane**: Go same-file fixture(IL-LIM-004 #2), C++ method/overload 반복 검증(IL-LIM-014 #3,
  우선순위 높음) — 각 lane이 만든 근거로 해당 수용 기준과 마일스톤 gate 1·2를 스스로 체크한다.
