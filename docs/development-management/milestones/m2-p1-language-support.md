# M2 Python·Go·C/C++ verified support

- 상태: Planned
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

- [ ] IL-LIM-004, IL-LIM-006, IL-LIM-014의 수용 기준이 통과한다.
- [ ] Python, Go, C와 C++의 single/cross-file fixture가 선언된 OS/provider matrix에서 반복 통과한다.
- [ ] 검증된 언어는 provider JSON 없이 Auto 또는 explicit preset으로 분석을 시작한다.
- [ ] Python DI/decorator, C function pointer, C++ virtual dispatch와 macro 한계가 결과/문서에 표시된다.
- [ ] compile database나 Python environment 문제는 zero callers가 아니라 readiness error/limitation이다.
- [ ] CMake configure, package install, virtualenv 생성과 dependency sync를 자동 실행하지 않는다.
- [ ] 기존 bundled TS/JS 및 custom provider 회귀가 없다.
- [ ] `user-tests/m2-user-test-spec.md`가 언어별 환경·과업·판정 기준을 포함해 검토됐으며, 실행 결과 또는
  보류 사유가 각 preset 지원 등급 결정에 연결된다.

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
