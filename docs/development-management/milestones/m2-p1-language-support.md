# M2 Python·Go·C/C++ verified support

- 상태: gate 1·2 공백 닫힘(`docs/work/task-m2-gate-gaps.md`) — Go same-file, C++ method/overload/
  virtual dispatch 반복 검증 추가. 3-OS CI 확인 대기 중(아래 gate 1·2 참고). 세 preset
  (bundled-pyright/gopls/clangd)은 사용자 검증 미실행으로 지금도 `experimental`.
- 완료 소유: IL-LIM-004, IL-LIM-006, IL-LIM-014
- 릴리스 성격: 우선 언어 지원 minor release

## 목표

수요와 영향도가 높은 Python, Go, C/C++에서 사용자가 raw provider command를 작성하지 않고 분석을
시작할 수 있게 한다. 설치되지 않았거나 project metadata가 준비되지 않은 경우 자동 build 대신 정확한
준비 조치를 제공한다.

## 포함 범위

- Python provider 후보의 license/capability/version 평가와 FastAPI static E2E
- gopls verified preset과 self-contained Go module fixture
- clangd preset, compile flags와 `compile_commands.json` readiness
- Windows/macOS/Linux executable discovery와 version policy
- 언어별 direct/transitive/test caller, empty/partial/failure fixture
- Auto/preset/doctor Plugin E2E와 지원 등급 문서

## 진입 조건

- M1 provider catalog, doctor, custom fallback과 completeness 의미가 안정화된다.
- 각 external provider를 CI에 설치할 수 있는 공식 배포·라이선스 경로가 확인된다.

## 산출물

- Python, gopls, clangd preset과 지원 version/OS matrix
- FastAPI route/Depends 누락을 static limitation으로 보여주는 baseline
- compile database 없음·stale·invalid 상태를 구분하는 clangd readiness
- 설치 안내, custom fallback과 project preparation guide
- verified/experimental/unsupported를 구분한 language support table

## 단계별 계획

1. **provider·project 기준선**: Python 후보, gopls, clangd version과 project readiness matrix를 확정한다.
2. **언어별 preset 구현**: discovery, initialization, FastAPI/Go module/compile database profile과 설치 안내를
   독립적으로 구현한다.
3. **언어별 자동 E2E**: Python·Go·C·C++의 single/cross-file, missing metadata와 no-auto-build fixture를 OS별로
   통과한다.
4. **사용자 테스트 명세 제안**: 각 언어 구현이 안정되면 `user-tests/m2-user-test-spec.md`를 작성한다.
   Python·Go·C/C++ 실제 사용자가 raw provider JSON 없이 자신의 대표 project를 분석하고, virtualenv/module/
   compile database 준비 문제를 이해하며, DI/function pointer/virtual dispatch 누락을 과신하지 않는지를
   언어별 독립 과업과 결과로 정의한다. 지금은 project나 참여자를 선정하고 실행하지 않는다.
5. **언어별 사용자 검증과 승격 결정**: 별도 승인 후 언어별 참여자가 과업을 수행한다. 한 언어 실패를
   전체 평균으로 숨기지 않고 preset별 verified/experimental/unsupported 승격을 독립 결정한다.

## 종료 gate

> **2026-09-03 갱신(마일스톤 종료 처리 A, `docs/work/task-m2-closure.md`)**: 아래 8개를 근거와 함께
> 판정했다. 1·2번은 **열어 둔다** — IL-LIM-004의 Go single-file, IL-LIM-014의 C++ method/overload가
> repeating fixture로 증명된 적이 없다(각 스토리 문서 참고, 코드 lane이 아닌 이 종료 처리의 권한
> 밖이라 닫지 않는다). 4번은 **macro 관련 정정**을 반영해 판정했다(아래).
>
> **2026-09-03 후속 갱신(M2 gate-gaps lane, `docs/work/task-m2-gate-gaps.md`)**: 1·2번의 공백을
> 코드로 닫아 체크했다. **주의**: C++ 쪽 실측은 이 판정 시점에 darwin/arm64(Apple clangd 17.0.0)
> 하나뿐이다 — clangd major가 다른 3-OS CI(Ubuntu 23.1.1/macOS 23.1.0/Windows 22.1.7)에서 같은
> 결과인지가 이 lane의 핵심 위험이라, push 후 실제 CI 로그로 재확인이 필요하다.

- [x] IL-LIM-004, IL-LIM-006, IL-LIM-014의 수용 기준이 통과한다. — 6/6, 6/6, 5/5. 각 스토리
  문서에 항목별 근거가 있다.
- [x] Python, Go, C와 C++의 single/cross-file fixture가 선언된 OS/provider matrix에서 반복
  통과한다. — Go same-file은 `stateReachability.integration.test.ts`의 새 테스트, C++
  method/overload/virtual dispatch는 `clangdIntegration.test.ts`의 새 테스트(둘 다
  `docs/work/task-m2-gate-gaps.md` stage 1·2). 그 외 조합은 기존대로 3-OS CI에서 반복 통과한다
  (`go-provider`/`clangd-provider` job, `unit`/`cli-tests-cross-os` job). **3-OS CI에서 새 테스트
  결과가 로컬(darwin, gopls 0.19.1/clangd 17.0.0)과 같은지는 push 후 확인 대기 중.**
- [x] 검증된 언어는 provider JSON 없이 Auto 또는 explicit preset으로 분석을 시작한다. — 4개 preset
  전부 auto-discovery 실측(IL-LIM-004 수용 기준 5번과 동일 근거, 그 문서의 seam 표시도 함께 적용된다).
- [x] Python DI/decorator, C function pointer, C++ virtual dispatch와 macro 한계가 결과/문서에
  표시된다. — Python: `provider_null_incoming_calls` + `docs.limitations`(bundled-pyright), 실제
  FastAPI로 측정(`cli/src/test/pythonFastapiIntegration.test.ts`). C/C++: `docs.limitations`(clangd)의
  function pointer·virtual dispatch 항목. **macro는 정정된 형태로 판정**: 원래 가정("macro 한계가
  표시된다")은 stage 4 실측(`docs/work/task-m2-clangd-preset.md`)이 반증했다 — simple macro는 clangd가
  post-preprocessor AST로 동작하기 때문에 **정확히 잡히고, 한계가 아니다.** 복잡한 macro 패턴
  (token-pasting, X-macro)만 미검증으로 `docs.limitations`에 정확히 그렇게 기록돼 있다. 이 gate는
  "macro가 무조건 한계로 표시된다"가 아니라 **"macro에 대한 실제 측정 범위가 결과/문서에 정확히
  표시된다"**로 읽어야 통과한다 — 그 형태로는 통과한다.
- [x] compile database나 Python environment 문제는 zero callers가 아니라 readiness error/limitation
  이다. — clangd의 `compile_database_missing`/`_stale`/`_ambiguous`(`limitationDetails`, severity
  `warning`), Python의 `reportMissingImports`가 diagnostic으로 가시화됨(silent 저하 아님, M2 Python
  preset lane stage 4 실측).
- [x] CMake configure, package install, virtualenv 생성과 dependency sync를 자동 실행하지 않는다. —
  세 lane 전부 명시적 설계 결정으로 확인(각 작업 로그). `cli/src/test/buildInvocation.sources.test.ts`의
  production spawn-site 전수조사가 여전히 유효하다 — M2에서 새로 추가된 spawn 지점 없음.
- [x] 기존 bundled TS/JS 및 custom provider 회귀가 없다. — `npm run cli:test`가 세 lane 전체에 걸쳐
  지속 통과(가장 최근 327/329, 2 skip은 로컬에 gopls 없음), TypeScript 회귀 테스트와 custom provider
  우선순위 테스트 불변.
- [x] `user-tests/m2-user-test-spec.md`가 언어별 환경·과업·판정 기준을 포함해 검토됐으며, 실행 결과 또는
  보류 사유가 각 preset 지원 등급 결정에 연결된다. — 명세는 작성·검토 완료(reviewer가 T4 유도 편향
  결함 1건 발견·정정, `docs/development-management/user-tests/m2-user-test-spec.md`). **실행은
  보류한다** — 이 마일스톤의 4단계가 "지금은 project나 참여자를 선정하고 실행하지 않는다"고 이미
  명시했고, 실행(5단계)은 별도 승인이 필요한 작업이다. M1이 같은 형태의 gate를 같은 방식(보류 사유
  기록)으로 닫은 선례가 있다(`m1-provider-platform-ux.md` 종료 gate 마지막 항목). **지원 등급**: 이
  저장소의 `tier`(`bundled`/`verified-external`)는 배포 형태이지 사용자 검증 등급이 아니다. 사용자
  검증이 아직 실행되지 않았으므로, 세 preset(bundled-pyright, gopls, clangd) 전부 지금은
  `experimental`이다 — 이는 IL-LIM-006/IL-LIM-014의 rollout 절이 이미 명시한 원칙("모든 gate 통과
  전 experimental 또는 custom 상태를 유지한다", "첫 release는 doctor와 experimental preset으로
  시작한다")을 그대로 적용한 것이다. `verified` 승격은 5단계(사용자 검증) 실행 이후에만, 언어별로
  독립적으로 결정된다.

## 제외 범위

- FastAPI runtime route/Depends edge 생성
- C/C++ function pointer와 virtual target의 완전한 정적 추론
- Swift, Kotlin 및 Android/Xcode project 지원

## 주요 위험과 대응

- Python의 독립 CLI provider 후보가 기준을 충족하지 못할 수 있다: 억지로 verified 선언하지 않고
  Extension-only/custom/unsupported 등급과 원인을 공개한다.
- clangd 정확도가 build metadata에 크게 의존한다: metadata readiness를 분석 성공과 분리하고 자동 build를
  금지한다.
- CI 외부 toolchain 비용: 언어별 job/cache를 분리하고 한 언어 실패가 다른 지원 근거를 숨기지 않게 한다.

## 다음 마일스톤 연결

M3는 같은 preset/doctor gate를 Swift와 Kotlin toolchain에 적용하고, M2/M3 fixture를 이용해 callable symbol
정책을 완성한다.
