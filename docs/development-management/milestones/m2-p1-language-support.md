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

## 종료 gate

- [ ] IL-LIM-004, IL-LIM-006, IL-LIM-014의 수용 기준이 통과한다.
- [ ] Python, Go, C와 C++의 single/cross-file fixture가 선언된 OS/provider matrix에서 반복 통과한다.
- [ ] 검증된 언어는 provider JSON 없이 Auto 또는 explicit preset으로 분석을 시작한다.
- [ ] Python DI/decorator, C function pointer, C++ virtual dispatch와 macro 한계가 결과/문서에 표시된다.
- [ ] compile database나 Python environment 문제는 zero callers가 아니라 readiness error/limitation이다.
- [ ] CMake configure, package install, virtualenv 생성과 dependency sync를 자동 실행하지 않는다.
- [ ] 기존 bundled TS/JS 및 custom provider 회귀가 없다.

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
