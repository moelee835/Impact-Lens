# IL-LIM-006 Python·FastAPI E2E 검증

- 상태: Backlog
- 우선순위: P1
- 완료 마일스톤: [M2 — Python·Go·C/C++ verified support](../milestones/m2-p1-language-support.md)
- 선행 기여: [M0 — 관측 실패와 FastAPI coverage baseline](../milestones/m0-provider-runtime-trust.md)
- 영향도: 높음
- 적용 영역: VS Code Extension, Agent CLI, Codex/Claude Code Plugin

## 문제

Python 선언 anchor 단위 테스트는 있지만 실제 Python Language Server와 FastAPI workspace를 사용한
end-to-end 기준선이 없다. 일반 cross-file 호출과 `Depends()`·decorator 관계 중 무엇이 provider에서
제공되는지 검증 근거가 부족하다. 또한 Plugin의 provider 없는 `.py` 요청이 Python 지원 부족을 알리지 않고
기본 TypeScript server를 실행한 뒤 빈 stderr의 `provider_unavailable`로 끝나는 실제 실패가 회귀 fixture로 없다.

## 사용자 스토리

Python/FastAPI 사용 개발자로서 설치 조합별로 검증된 지원 범위와 재현 가능한 한계를 확인하고 싶다.

## 범위

- 고정된 Python, FastAPI와 Language Server 버전의 최소 workspace fixture를 만든다.
- same-file, cross-file, async, route decorator와 dependency 관계의 원본 Call Hierarchy를 기록한다.
- Extension과 CLI에서 가능한 범위의 결과를 비교하고 문서화한다.
- provider를 생략한 Plugin 요청의 Auto 선택·실패 UX와 잘못된 provider fallback을 검증한다.

## 제외 범위

- 이 스토리에서 FastAPI 전용 추론 기능 구현
- 모든 Python Language Server 조합 검증

## 수용 기준

- [ ] 재현 가능한 Python/FastAPI fixture와 실행 절차가 존재한다.
- [ ] 일반 호출, route와 dependency별 기대·미지원 결과가 명시된다.
- [ ] 실제 Language Server 기반 자동 또는 반복 가능한 통합 검사가 수행된다.
- [ ] 검증된 지원 범위가 README/INSTALL과 일치한다.
- [ ] provider가 없는 Python 요청은 검증 preset을 자동 선택하거나 Python 전용 actionable error를 반환한다.
- [ ] Python 분석 실패가 빈 그래프 또는 TypeScript provider 실패로 오인되지 않는다.

## 검증

- cold/warm indexing 조건을 구분한 E2E 실행
- provider 원본 Call Hierarchy와 Impact Lens 결과 비교
- Plugin runner를 통한 동일 fixture 분석

## 의존성 및 위험

- `IL-LIM-003`의 provider/version 기록 방식이 필요하다.
- bundled/reference runtime 기준은 `IL-LIM-017`, Auto 선택 계약은 `IL-LIM-004`에 의존한다.
- CI 환경의 Python과 Language Server 설치 비용 때문에 별도 integration job이 필요할 수 있다.

## 현재 기준선

- Python 관련 자동 검증은 `declarationAnchor`와 test-file convention 같은 순수 단위 테스트뿐이다.
- `docs/work/issue-3-hierarchy-graph-usability.md`는 Python extension과 Pylance를 사용할 수 없는 환경 때문에
  실제 FastAPI Call Hierarchy 수동 검증을 완료하지 못했다고 기록한다.
- CLI 실제 LSP integration은 TypeScript fixture 하나뿐이며 Python provider dependency가 없다.
- 따라서 Python의 일반 cross-file caller, provider capability, FastAPI dependency 누락을 분리할 기준선이 없다.
- 관측 사례에서 `offer_mail_states`가 있는 `.py` 파일을 provider field 없이 Plugin runner로 요청했고,
  CLI는 기본 TypeScript Language Server를 실행한 뒤 `Language Server exited (1):`로 실패했다. 이는 Python
  Call Hierarchy 품질을 시험한 결과가 아니라 provider selection 이전 단계의 실패다.

## 조사 결과

- [FastAPI dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)는 handler가 dependency를 직접
  호출하지 않고 framework가 실행한다고 설명하므로 일반 Call Hierarchy에 나타나지 않는 것이 합리적이다.
- [Pylance Call Hierarchy 요청](https://github.com/microsoft/pylance-release/issues/109)은 Python provider의
  기능 지원을 문서나 가정으로 확정하지 말고 실제 capability와 결과를 검증해야 함을 보여준다.
- [Pylance FAQ](https://github.com/microsoft/pylance-release/blob/main/FAQ.md)에 따라 Pylance는 독립 CLI
  integration test server로 재사용할 수 없다. 공식 VS Code 안의 Extension lane에서만 검증한다.
- Microsoft의 [python-lsp-compare](https://github.com/microsoft/python-lsp-compare)는 같은 scenario를
  여러 Python server에서 반복하는 방식의 선례를 제공한다. Impact Lens도 provider별 결과를 golden truth가
  아니라 관측 baseline으로 저장해야 한다.

## 대안 검토와 결정

1. **Pylance 결과만 공식 Python 지원으로 간주**: CLI에서 재사용할 수 없고 host 간 결과 비교가 불가능하다.
2. **아무 Python server나 하나 선택해 expected graph를 고정**: capability 차이를 숨기므로 제외한다.
3. **Extension lane과 standalone LSP lane을 분리한 matrix**: 라이선스와 실제 배포 구조를 반영하므로 권장한다.
4. **FastAPI adapter 구현과 동시에 검증**: provider baseline과 보완 효과를 구분할 수 없어 먼저 E2E 기준선을 만든다.

## 권장 대응

- fixture는 하나의 작은 FastAPI project로 고정하고 다음 symbol 관계를 포함한다.
  - same-file 및 cross-file direct/transitive 호출
  - sync/async 함수와 method
  - parameter `Depends`, `Annotated`, decorator dependency와 sub-dependency
  - `APIRouter`, `include_router`, import alias와 동명 함수
  - pytest caller와 intentionally dynamic negative case
- 두 test lane을 운영한다.
  - **Extension lane**: 공식 VS Code + Python extension/Pylance, 공개 command 결과 capture
  - **CLI lane**: 재배포·실행 가능한 후보 server를 `--stdio`로 capability probe 후 실행
- provider가 Call Hierarchy를 지원하지 않으면 실패가 아니라 명시적 `unsupported` baseline으로 기록한다.
- provider 없는 요청, 명시 preset 요청과 raw custom 요청을 같은 fixture에서 비교하고 `selectedBy`를 기록한다.
- 호환 Python provider가 없으면 TypeScript fallback 없이 `no_compatible_provider` 계열 상태와 설치/선택
  안내를 반환한다. 최종 error code 이름은 `IL-LIM-003/004` 계약에서 확정한다.
- 기대 결과를 `required static edges`, `framework-only expected gaps`, `provider-variable edges`로 분리한다.
- Python preset 승격은 cross-file required edge, 안정성, license와 설정 재현성을 모두 통과해야 한다.

## 단계별 계획

### 1단계 — fixture와 oracle

1. pinned Python/FastAPI/pytest project와 lockfile을 별도 integration fixture로 만든다.
2. source 자체에서 관계 ID와 기대 분류를 machine-readable manifest로 작성한다.
3. 일반 호출과 framework 호출을 분리하고 negative fixture를 포함한다.
4. fixture import만으로 side effect가 발생하지 않게 구성한다.

종료 조건: provider 없이도 expected relationship categories를 검토할 수 있다.

### 2단계 — capability probe harness

1. provider command/version과 initialize capabilities를 JSON artifact로 저장한다.
2. prepare/incoming request 원본 응답과 Impact Lens 정규화 결과를 함께 capture한다.
3. cold/warm run, timeout, process exit와 repeatability를 측정한다.
4. source path·version 같은 비결정 값을 normalization한다.
5. stderr-only crash와 provider 없는 `.py` 요청을 regression transcript로 고정한다.

종료 조건: 같은 provider/version 3회 결과 차이를 자동 비교할 수 있다.

### 3단계 — Extension lane

1. `@vscode/test-electron` 또는 현재 호환 test harness에서 공식 VS Code를 실행한다.
2. Python extension/Pylance 설치·license 조건을 CI 문서와 workflow에 명시한다.
3. `vscode.prepareCallHierarchy`와 `provideIncomingCalls` 원본 및 Impact Lens 결과를 capture한다.
4. 자동화가 불가능한 조건은 version·환경을 기록한 반복 가능한 수동 checklist로 남긴다.

종료 조건: Pylance 지원/미지원 상태와 일반 호출 coverage가 버전과 함께 기록된다.

### 4단계 — standalone 후보 matrix

1. Pyright 계열, Jedi/pylsp 계열 후보를 license와 capability probe로 먼저 거른다.
2. Call Hierarchy가 없는 후보는 preset 대상에서 제외하되 결과를 문서화한다.
3. 통과 후보에 `IL-LIM-005` 설정 profile을 적용하고 fixture를 실행한다.
4. 최소 하나도 기준을 통과하지 못하면 Python CLI를 custom/unsupported로 유지한다.

종료 조건: Python CLI 지원 문구가 실제 matrix 결과와 일치한다.

### 5단계 — FastAPI adapter 전후 비교

1. `IL-LIM-002` 구현 전 baseline을 고정한다.
2. adapter 적용 후 framework-only expected gap이 얼마나 보완되는지 측정한다.
3. provider edge와 inferred edge provenance가 섞이지 않는지 검증한다.

종료 조건: 지원 문법별 precision·recall과 남은 gap이 release evidence로 남는다.

## 예상 변경 영역

- 신규 `fixtures/python-fastapi/` 또는 test 전용 workspace와 expectation manifest
- `cli/src/test/`의 provider capability/capture harness
- Extension integration test harness와 CI workflow
- `docs/development-management/evidence/` 후보: provider/version별 baseline artifact 요약
- README/INSTALL: Extension과 CLI Python 지원 수준 분리
- `IL-LIM-002`, `004`, `005` 문서의 승격 근거

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| fixture | locked environment 재생성 | 동일 source·dependency version으로 설치 가능 |
| provider | initialize capability probe | supported/unsupported/failure가 구분됨 |
| 반복성 | cold/warm 각 3회 | required edge와 symbol identity가 안정적 |
| Extension | Pylance 일반 cross-file 호출 | 원본 provider와 Impact Lens 차이가 설명됨 |
| FastAPI | Depends/decorator/sub-dependency | 원본 gap이 framework-only로 분류됨 |
| Plugin | runner를 통한 Python analyze | 지원이면 graph, 미지원이면 actionable error 반환 |
| Plugin | provider 없는 `.py` 요청 | Auto 선택 또는 Python provider 안내이며 TypeScript process는 실행되지 않음 |
| 진단 | Python provider initialize crash | 선택 provider·실패 단계·exit와 redacted stderr가 보존됨 |

## rollout과 관측

- 첫 결과는 “지원 선언”이 아니라 provider/version baseline 보고서로 공개한다.
- Python CLI preset은 모든 gate 통과 전 `experimental` 또는 `custom` 상태를 유지한다.
- CI는 빠른 unit suite와 느린 opt-in integration matrix를 분리하고 scheduled run으로 drift를 탐지한다.
- provider update로 결과가 달라지면 snapshot 자동 갱신 대신 review가 필요한 diff artifact를 남긴다.
- Pylance license나 CI 제약으로 자동화하지 못한 항목은 성공으로 간주하지 않고 수동 증거 날짜를 표시한다.

## 미해결 질문

- CI에서 공식 VS Code/Pylance 설치를 지속적으로 허용할 수 있는지 정책 확인이 필요하다.
- standalone Python server 중 Call Hierarchy와 cross-file fixture를 충족하는 후보가 실제로 있는지 spike가 필요하다.
- Python executable/interpreter와 Language Server project environment를 자동 연결할 범위 및 virtualenv 탐색
  우선순위를 정해야 한다.
- provider별 결과 artifact를 저장소에 snapshot으로 둘지 CI artifact로 보관할지 결정해야 한다.
