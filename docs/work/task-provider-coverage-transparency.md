# IL-LIM-003 provider·coverage 투명성 구현

## 배경과 해결할 문제

Impact Lens의 분석 결과는 Language Server Call Hierarchy에 의존하지만 현재 CLI의 `complete`와
문자열 `limitations`만으로는 정적 탐색 완료, provider capability, indexing 준비 상태와 런타임 관계
누락을 구분하기 어렵다. 또한 provider를 생략한 Python 요청이 bundled TypeScript provider로 전달되어
server crash처럼 보이는 사례가 있었다. Extension도 VS Code가 중개한 provider identity와 정적 분석 범위를
결과에 명시하지 않아 사용자가 빈 caller 결과를 전체 영향 없음으로 오해할 수 있다.

이 작업은 실행 순서상 최우선 기반 작업인 `IL-LIM-003`을 구현한다. 기존 schema v1 필드를 유지하면서
provider와 coverage를 구조화하고, 언어가 맞지 않는 bundled provider 실행을 사전에 차단한다.

## 범위

- CLI 성공 응답에 구조화된 provider metadata와 coverage를 additive하게 제공한다.
- 요청 파일에서 감지한 languageId, provider 선택 방식과 language match를 기록한다.
- advertised/observed Call Hierarchy 및 diagnostics capability를 구분한다.
- traversal, indexing, semantic coverage와 machine-readable limitation code의 일관된 projection을 만든다.
- bundled TypeScript provider는 TypeScript/JavaScript 계열 파일에만 자동 선택한다.
- provider discovery/launch/initialize/capability/query 실패를 구분하고 process exit 진단에 단계,
  executable basename, exit/signal과 redacted stderr tail을 보존한다.
- Extension 결과에 VS Code host, unknown provider identity, document languageId와 동일 의미의 coverage를
  추가하고 Graph/Explorer/status에서 정적 범위와 partial 상태를 표시한다.
- CLI schema, README, Plugin skill/contract와 개발 문서 용어를 함께 갱신한다.

## 범위에서 제외할 항목

- Python/C/C++/Swift/Kotlin provider preset 설치 및 자동 탐색
- provider별 indexing 완료 신호 해석
- dynamic registration과 provider-specific initialization adapter
- DI, reflection, event와 framework runtime edge 생성
- Language Server 자체의 정확도 개선

위 항목은 각각 `IL-LIM-004/005/006/014/015/016`, `IL-LIM-001/002/009`에서 이어서 다룬다.

## 현재 구현 조사 결과

- CLI `ProviderCapabilities`는 name/version과 두 boolean만 제공하고 provider host, 선택 근거, 언어,
  advertised/observed 상태를 구분하지 않는다.
- `analyzeImpact`는 traversal limit 유무만으로 `complete`를 계산하고 semantic/indexing 범위를 별도 구조로
  표현하지 않는다.
- `LspCallHierarchyProvider`는 provider 생략 시 파일 언어를 확인하지 않고 항상 bundled TypeScript server를
  선택한다.
- `JsonRpcClient`는 child `exit`에서 즉시 pending request를 실패시키므로 뒤이어 닫히는 stderr stream의
  마지막 출력이 누락될 수 있다. 오류에는 lifecycle 단계나 구조화된 exit 정보가 없다.
- Extension은 VS Code commands를 통해 provider를 호출하므로 provider extension identity/version을 알 수 없다.
  현재 `ImpactResult`에는 이 제한을 표현할 metadata가 없다.
- Plugin skill은 `complete`, `capabilities`, `limitations`만 읽도록 안내하며 구조화된 coverage를 해석하지 않는다.
- `plugin-creator` 업데이트 절차를 적용하려 했으나 기본 personal marketplace 파일이 없어 marketplace
  cachebuster와 재설치 흐름은 실행할 수 없다. 저장소 플러그인 정적 검증으로 대체한다.

## 단계별 구현 계획

1. 공통 상태 모델과 projection 규칙을 CLI/Extension type 및 테스트 가능한 helper로 정의한다.
2. CLI provider 선택 시 파일 languageId를 감지하고 custom/bundled 선택 metadata를 만든 뒤 잘못된 bundled
   fallback을 `provider_required_for_language`로 차단한다.
3. LSP initialize 및 request 성공을 advertised/observed capability와 lifecycle에 누적하고, 실패 단계가
   보존되도록 오류를 정규화한다.
4. JSON-RPC process 종료는 `close`까지 bounded하게 stderr를 drain하고 secret-like 값과 홈 경로를
   redaction한 구조화된 세부 정보를 반환하도록 보강한다.
5. `analyzeImpact`가 기존 `complete`, `truncated`, `limitations`를 유지하면서 새 provider/coverage를 반환하게
   하고 response schema 및 contract fixture를 갱신한다.
6. Extension `ImpactResult`에 VS Code provider/coverage metadata를 넣고 Graph header, Explorer/status tooltip이
   static-only와 traversal 상태를 구분하도록 변경한다.
7. CLI/Plugin/README/INSTALL/개발 관리 문서를 동일 용어로 갱신하고 스토리 수용 기준과 상태를 반영한다.
8. 단위·contract·integration·Extension 전체 테스트, TypeScript compile, schema JSON parse, plugin validation과
   diff 검사를 실행한다.

## 테스트 및 완료 기준

- 기존 schema v1 필드는 유지되고 새 provider/coverage field가 성공 응답 schema와 일치한다.
- 정상 empty graph는 성공 결과이며 provider 미선택/실패/capability 없음과 다른 code·metadata를 가진다.
- provider 없는 `.py` 요청은 TypeScript server를 실행하지 않고 해결 방법을 포함한 exit 5 오류를 반환한다.
- mock provider의 unknown identity, capability unsupported, depth/node partial과 정상 완료 상태가 테스트된다.
- process가 stderr를 출력하고 initialize 전에 종료하면 lifecycle stage, exit code/signal과 redacted stderr가
  error details에 보존된다.
- Extension 결과는 `host: vscode`, `name: unknown`, document languageId와 identity limitation을 가진다.
- Graph/Explorer/status가 정적 Call Hierarchy 범위와 partial 원인을 표시한다.
- `npm run test:all`과 관련 packaging/schema/plugin 검사가 통과한다.
- 개발 관리 인덱스 및 `IL-LIM-003` 스토리가 실제 구현·PR 상태와 남은 제한을 정확히 반영한다.

## 작업 로그

### 2026-08-25 — 착수 및 기준선 조사

- 실행 우선순위 문서의 선행 관계를 확인해 영향도 1위 `IL-LIM-001`보다 공통 계약 기반인
  `IL-LIM-003`을 먼저 구현하기로 결정했다.
- `cli/src/types.ts`, `lspProvider.ts`, `jsonRpc.ts`, `impact.ts`, response schema와 contract/integration tests,
  Extension `types.ts`, `impactAnalyzer.ts`, `controller.ts`, Graph/Explorer 표현을 조사했다.
- 기존 field 제거 없이 schema v1 additive 변경으로 구현하고, indexing은 표준 신호가 없으므로 `unknown`을
  정직한 기본값으로 사용하기로 했다.
- `plugin-creator` 지침의 personal marketplace 확인이 파일 부재로 실패했다. repository plugin source는
  갱신·검증하되 cachebuster/reinstall은 완료 기준에서 제외하고 후속 제한으로 기록한다.

### 2026-08-25 — provider/coverage 계약 및 실행 진단 구현

- `cli/src/types.ts`, `coverage.ts`, `impact.ts`에 host/language/selection, advertised/observed capability,
  lifecycle과 traversal/semantic/indexing coverage를 추가했다. 기존 `complete`, `limitations`는 같은 상태의
  호환 projection으로 유지했다.
- `cli/src/lspProvider.ts`가 대상 확장자를 먼저 감지하고 bundled provider를 TS/TSX/JS/JSX/MTS/CTS에만
  선택하도록 변경했다. Python/C/C++/Swift/Kotlin과 기타 형식은 custom provider가 없으면
  `provider_required_for_language`로 process launch 전에 종료한다.
- custom provider의 명시적 `languageId`가 알려진 대상 언어와 다르면 `provider_language_mismatch`로
  차단한다. 확장자만으로 언어를 확정할 수 없는 `.h` 같은 파일은 `plaintext`/unknown match로 남겨 custom
  provider 선택을 막지 않는다.
- `cli/src/jsonRpc.ts`는 process `exit` 후 stdio `close`까지 최대 100ms 기다려 stderr tail을 수집하고,
  launch/initialize/query별 error code와 executable basename, exit/signal을 보존한다. bearer/secret-like 값과
  home 경로는 redaction하며 command 전체는 details에 포함하지 않는다.
- initialize capability와 session에서 실제 성공한 prepare/incoming을 분리했다. push diagnostics는 server가
  표준 capability로 선언하지 않으므로 advertised를 `unknown`, 실제 publish notification을 받은 경우만
  observed를 true로 기록한다.
- `src/types.ts`, `coverage.ts`, `impactAnalyzer.ts`에 VS Code broker metadata를 추가했다. provider identity는
  공개 API로 알 수 없어 `name: unknown`, `selectedBy: vscode`, indexing unknown과 identity limitation을
  유지한다.
- `src/graphPanel.ts`, `impactTreeProvider.ts`, `controller.ts`에서 static Call Hierarchy, provider host/language,
  traversal/indexing과 동적·framework 누락 가능성을 Graph summary, root tooltip과 status tooltip에 표시한다.
- `cli/schemas/response.schema.json`, CLI/Plugin/README/INSTALL/개발 문서 및 공통 계약 문서를 갱신했다.

### 2026-08-25 — 테스트와 패키징 검증

- 첫 CLI 실행에서 missing executable이 initialize 실패로 재포장되는 회귀 1건을 발견했다. 종료 시 만든
  terminal error를 보존해 이후 request send에서도 원래 launch failure가 전달되도록 수정했다.
- `npm run test:all`: Extension 34/34, CLI 25/25 통과. 정상 empty graph, Python no-fallback, language mismatch,
  launch/initialize/capability/query failure, stderr close/redaction, schema와 real TypeScript cross-file 분석을
  포함한다.
- Plugin skill `quick_validate.py`: 통과.
- Plugin `validate_plugin.py plugins/impact-lens`: 통과.
- 첫 `npm pack --dry-run`은 사용자 `~/.npm` cache의 root 소유 파일로 EPERM이 발생했다. 사용자 cache를
  변경하지 않고 `/tmp/impact-lens-provider-coverage-npm-cache`로 재실행했다.
- `cli/`에서 격리 cache로 `npm pack --dry-run --json`: 통과. 13개 배포 파일에 새
  `dist/coverage.js`와 response schema가 포함됨을 확인했다.
- `npx --no-install vsce package --out /tmp/impact-lens-provider-coverage.vsix`: 통과. 새
  `out/coverage.js`를 포함한 1.08MB VSIX를 생성했다.
- request/response schema JSON parse: 통과.
- 최종 검증을 한 차례 `cli/`에서 시작해 root 전용 `test:all` script를 찾지 못했다. 파일 변경은 없었고,
  즉시 저장소 root에서 다시 실행했다. 이후 query-stage exit fixture까지 추가한 최종 결과는 Extension
  34/34, CLI 25/25이며 Plugin/schema 검증도 통과했다.
- 최종 CLI dry-run package를 `cli/`에서 다시 생성해 새 runtime과 schema가 포함된 13개 배포 파일을
  확인했다.
- query-stage fixture 추가 직후 두 executable fixture가 TypeScript global script로 취급돼 동일한
  `buffer`/`respond` 선언이 충돌했다. 각 파일에 `export {}`를 추가해 독립 모듈로 격리했고 최종
  `npm run test:all`에서 Extension 34/34, CLI 25/25가 통과했다.
- bundled TypeScript provider로 실제 CLI 분석을 실행해 provider/coverage와 top-level compatibility
  projection을 확인했다. AJV 2020 strict mode로 실제 성공 응답을 검증하는 과정에서 기존 schema의
  conditional `required`가 local `properties/type`을 생략한 strict-compile 문제를 발견해 보완했고,
  최종 실제 응답이 `response.schema.json`과 일치함을 확인했다.

### 계획과 실제 구현의 차이 및 남은 제한

- 계획의 dynamic registration 기반은 `IL-LIM-005`와 함께 설계해야 잘못된 advertised 상태를 만들지
  않으므로 이번 범위에서 제외했다. 현재 static registration 및 observed request만 기록한다.
- provider별 indexing 완료 신호가 없어 `unknown`만 반환한다. 이는 실패가 아니라 근거 없는 ready 표시를
  피하기 위한 계약이다.
- Python/C/C++/Swift/Kotlin은 잘못된 TS fallback이 사라졌지만 자동 preset이나 정상 분석 지원이 추가된
  것은 아니다. 다음 language/provider 스토리가 필요하다.
- personal marketplace 파일 부재 때문에 `plugin-creator` cachebuster와 Codex plugin 재설치를 수행하지
  못했다. repository plugin 정적 검증은 통과했다.
- 관리 규칙상 `Done`에는 구현 PR 링크가 필요하다. 이번 요청은 push/PR 생성을 포함하지 않으므로 수용
  기준은 모두 체크하되 스토리 상태는 `In progress`로 유지한다.
