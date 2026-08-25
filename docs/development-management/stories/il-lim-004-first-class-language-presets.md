# IL-LIM-004 주요 언어용 기본 provider preset

- 상태: Backlog
- 우선순위: P1
- 영향도: 높음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

CLI와 Plugin은 TypeScript·JavaScript만 즉시 분석할 수 있다. 다른 언어는 사용자가 Language Server의
실행 파일, 인자와 `languageId`를 직접 알아내야 하므로 설치 성공률과 재현성이 낮다.

## 사용자 스토리

Python·Java·Go·Rust 등의 프로젝트에서 Plugin을 사용하는 개발자로서 검증된 provider preset을 선택해
서버별 세부 실행 계약을 직접 구성하지 않고 분석을 시작하고 싶다.

## 범위

- 대상 언어 선정 기준과 지원 등급을 정의한다.
- 언어별 executable 탐색, 기본 인자, languageId와 최소 지원 버전을 preset으로 제공한다.
- provider 부재 시 설치 방법과 진단 가능한 오류를 제공한다.

## 제외 범위

- 모든 Language Server를 CLI package에 번들
- 실제 통합 테스트 없이 공식 지원 언어로 표기

## 수용 기준

- [ ] 우선 대상 언어마다 지원 버전과 설치 조건이 문서화된다.
- [ ] preset으로 single-file 및 cross-file incoming call fixture가 통과한다.
- [ ] preset 감지 실패가 실행 후보와 해결 방법을 포함해 보고된다.
- [ ] 수동 provider 설정은 하위 호환으로 유지된다.

## 검증

- OS별 command discovery 단위 테스트
- 언어별 실제 LSP 통합 테스트와 버전 기록
- Plugin runner를 통한 end-to-end 분석

## 의존성 및 위험

- `IL-LIM-003`, `IL-LIM-005` 및 첫 Python preset의 경우 `IL-LIM-006`에 의존한다.
- 서버 라이선스, 배포 크기와 플랫폼별 설치 방식이 preset 범위를 제한할 수 있다.

## 현재 기준선

- `cli/src/lspProvider.ts`는 provider가 없으면 package에 포함된 `typescript-language-server`를 실행한다.
- 기본 languageId 자동 판별은 `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`만 지원하고 나머지는
  `plaintext`로 전달한다.
- 사용자 지정 provider는 request마다 `command`, `args`, `languageId`를 모두 직접 지정해야 한다.
- provider executable 탐색, 지원 버전, 설치 진단 또는 언어별 통합 fixture catalog는 없다.

## 조사 결과

- [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)는
  `--stdio` 실행과 initialization options를 공식 문서화하고 있어 현재 bundled reference provider로 적합하다.
- [gopls Call Hierarchy](https://go.dev/gopls/features/navigation#call-hierarchy)는 incoming/outgoing call과
  CLI 확인 방법을 공식 문서화한다. 동적 호출은 제외한다는 경계도 명확해 첫 external preset 후보로 적합하다.
- Python은 Extension과 CLI를 분리해야 한다. [Pylance FAQ](https://github.com/microsoft/pylance-release/blob/main/FAQ.md)는
  Pylance를 공식 Microsoft VS Code build와 GitHub Codespaces에서만 사용할 수 있다고 명시하므로
  독립 CLI에서 binary를 탐색·실행하거나 bundle하는 preset으로 사용할 수 없다.
- Language Server 이름만으로 지원을 선언할 수 없다. 실제 initialize의 `callHierarchyProvider`와
  representative cross-file fixture를 모두 통과해야 한다.

## 대안 검토와 결정

1. **여러 서버를 package dependency로 bundle**: 설치는 쉽지만 크기, 라이선스와 runtime 요구가 커서
   TypeScript 외에는 기본 전략으로 사용하지 않는다.
2. **command 이름만 preset으로 제공**: 구현은 작지만 버전·capability 검증이 없어 실패 원인이 불명확하다.
3. **검증된 external preset catalog**: 사용자가 설치한 executable을 탐색하고 버전·capability·fixture를
   검증하는 방식으로 권장한다.
4. **언어만 보고 임의 서버 선택**: 여러 서버가 공존할 수 있고 결과가 달라 명시적 preset 또는 project
   설정을 우선한다.

## 권장 대응

- 지원 등급을 다음처럼 고정한다.
  - `bundled`: package에 포함되고 release test를 통과한 TypeScript/JavaScript
  - `verified-external`: 지정 버전 범위를 CI fixture로 검증한 preset
  - `custom`: 사용자가 command를 제공하고 capability probe만 통과한 서버
  - `unsupported`: Call Hierarchy가 없거나 초기화 계약을 충족하지 못한 서버
- 첫 external preset은 `go-gopls`로 진행하고 Python은 `IL-LIM-006` 결과가 나온 뒤 후보를 정한다.
- preset 정의에는 languageId/extensions, command 후보, `--stdio` args, version command/parser,
  initialization/settings profile, 준비 전략, 공식 문서와 알려진 limitation을 포함한다.
- 자동 설치는 하지 않는다. executable이 없으면 platform별 공식 설치 문서와 선택 가능한 custom provider를 안내한다.
- workspace 설정 파일에 preset ID와 최소 override만 저장하고 절대 경로는 사용자 또는 CI 설정으로 둔다.

## 단계별 계획

### 1단계 — preset manifest와 지원 정책

1. `ProviderPreset` type과 catalog 파일 형식을 정의한다.
2. 지원 등급 승격·강등 기준, 버전 pin 범위와 deprecation 절차를 문서화한다.
3. CLI request의 `providerPreset`과 기존 `provider` 우선순위를 정의한다.
4. custom command와 preset override에서 허용할 필드를 제한한다.

종료 조건: TypeScript 기본 provider를 기존 동작 변경 없이 manifest로 표현할 수 있다.

### 2단계 — discovery와 doctor

1. PATH와 명시 경로에서 executable 후보를 찾되 shell을 사용하지 않는다.
2. version command를 timeout과 출력 크기 제한 안에서 실행한다.
3. initialize capability probe와 작은 in-memory/disk fixture를 구분한다.
4. `impact-lens provider doctor <preset>` 또는 동등 JSON operation으로 진단 결과를 제공한다.

종료 조건: missing executable, unsupported version, missing capability와 fixture 실패를 구분한다.

### 3단계 — gopls verified preset

1. Go module cross-file fixture와 direct/transitive/test caller를 만든다.
2. 지원할 Go/gopls 버전 matrix를 CI에서 실행한다.
3. module download가 필요 없는 self-contained fixture로 network 의존을 제거한다.
4. 공식 설치 안내와 gopls의 dynamic-call limitation을 문서화한다.

종료 조건: cold/warm 분석과 Plugin runner E2E가 지원 OS에서 반복 통과한다.

### 4단계 — Python 및 다음 언어 선정

1. `IL-LIM-006`에서 Python server 후보를 capability·license·fixture로 평가한다.
2. 평가 결과가 기준 미달이면 Python을 custom/unsupported로 명확히 유지한다.
3. 사용 수요와 CI 비용을 기준으로 clangd, rust-analyzer 또는 JDT LS를 다음 후보로 비교한다.

종료 조건: 검증 근거 없는 언어가 `verified-external`로 문서화되지 않는다.

## 예상 변경 영역

- 신규 `cli/src/providers/`: preset type, catalog, discovery와 doctor
- `cli/src/index.ts`, `cli/src/types.ts`: preset request와 진단 operation
- `cli/schemas/request.schema.json`, `response.schema.json`: preset/doctor 계약
- `plugins/impact-lens/skills/`, Claude command 문서: preset 선택과 설치 안내
- `cli/src/test/fixtures/`: 언어별 실제 LSP workspace
- CI workflow와 INSTALL: 외부 provider matrix와 공식 설치 링크

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| 단위 | preset 선택과 override 우선순위 | 결정적 command/args/languageId 생성 |
| 단위 | PATH 없음·잘못된 version 출력 | 구분된 doctor 진단과 해결 방법 제공 |
| 통합 | bundled TypeScript | 기존 cross-file fixture가 동일하게 통과 |
| 통합 | verified gopls version matrix | expected incoming graph와 provider metadata 일치 |
| Plugin | preset 분석 요청 | Agent가 설치 누락과 분석 실패를 구분함 |
| 보안 | command/args에 shell metacharacter | shell 평가 없이 argument array로 전달 |

## rollout과 관측

- manifest와 doctor를 먼저 release하고 새 preset은 별도 minor release에서 opt-in으로 추가한다.
- preset별 CI 성공 version과 마지막 검증 날짜를 catalog에 기록한다.
- version 범위를 벗어나면 실행을 무조건 막기보다 `unverified_version` 경고와 명시적 override를 제공한다.
- 실패율 telemetry는 보내지 않고 doctor JSON과 로컬 debug log로 재현 정보를 제공한다.
- preset 회귀 시 catalog에서 `deprecated` 또는 `disabled-by-default`로 내려 custom provider 경로를 유지한다.

## 미해결 질문

- provider doctor를 새 CLI operation으로 공개할지 analyze preflight에만 둘지 결정이 필요하다.
- external server version을 strict allowlist로 막을지 경고 후 실행할지 지원 정책을 정해야 한다.
- Windows executable suffix, package manager별 설치 위치와 remote workspace 탐색 범위를 검증해야 한다.
