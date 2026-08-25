# IL-LIM-017 Plugin provider 실행·배포 신뢰성

- 상태: Backlog
- 우선순위: P0
- 완료 마일스톤: [M0 — Provider 실행 신뢰성](../milestones/m0-provider-runtime-trust.md)
- 영향도: 매우 높음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin, Release

## 문제

기본 지원 대상인 JavaScript/JSX 요청에서도 Plugin runner가 선택한 CLI의 packaged TypeScript Language Server가
initialize 전에 exit code 1로 종료하고 stderr가 비어 있는 사례가 발생했다. source checkout의 단위·통합
테스트가 통과해도 실제 Plugin cache, global CLI, release tarball과 host Node 조합에서 provider가 실행되지
않으면 기본 기능 전체가 사용할 수 없다.

## 사용자 스토리

Plugin을 설치한 사용자로서 지원 언어인 TypeScript/JavaScript 분석이 별도 설정 없이 동작하고, 실행환경
문제가 있으면 어떤 CLI·Node·provider가 선택됐고 어떻게 복구할지 알 수 있길 원한다.

## 범위

- Plugin runner의 CLI resolution 경로와 실제 선택 결과를 관측 가능하게 만든다.
- 모든 실행 경로에서 Node engine, CLI/provider version과 packaged dependency 존재를 preflight한다.
- 설치된 release tarball과 Plugin cache 형태에서 bundled provider launch E2E를 수행한다.
- process stderr drain, 단계별 오류와 redaction을 `IL-LIM-003/005` 계약으로 구현한다.
- Linux/macOS/Windows와 TS/TSX/JS/JSX 최소 matrix를 release gate로 둔다.

## 제외 범위

- 모든 사용자 shell·Node version manager 조합 지원
- provider crash를 빈 graph나 자동 direct-text fallback으로 숨김
- Plugin runner가 Node/npm을 임의 설치 또는 upgrade
- 다중 언어 external provider 지원 자체

## 수용 기준

- [ ] release tarball을 새 임시 환경에 설치한 뒤 TS/TSX/JS/JSX incoming-call smoke가 통과한다.
- [ ] runner가 explicit path, source checkout, global binary와 npm fallback 중 선택한 source/version을 진단한다.
- [ ] Node 미지원, CLI/provider artifact 누락, spawn, initialize와 query failure가 구분된다.
- [ ] stderr-only exit가 bounded drain 후 redacted detail을 보존한다.
- [ ] Codex와 Claude Plugin cache 설치 형태의 runner E2E가 release 전에 검증된다.

## 검증

- runner resolution과 Node engine shell contract test
- packed tarball 설치 후 real TypeScript Language Server smoke
- Linux/macOS/Windows TS/TSX/JS/JSX Plugin E2E
- missing dependency, old Node, corrupted artifact와 stderr-only crash negative test

## 의존성 및 위험

- 상태 모델은 `IL-LIM-003`, lifecycle 구현은 `IL-LIM-005`와 조율한다.
- 이 story는 `IL-LIM-004`의 외부 preset보다 먼저 완료해야 bundled reference provider를 신뢰할 수 있다.
- debug 정보에 전체 argv, registry URL, credential과 사용자 path가 노출되지 않도록 redaction이 필요하다.

## 현재 기준선

- runner는 `IMPACT_LENS_CLI_PATH`, source checkout `cli/dist/index.js`, global `impact-lens`, pinned npm package
  순서로 선택하지만 정상 출력에는 실제 선택 source/version이 없다.
- Node 22 이상 검사는 마지막 npm fallback에 진입할 때만 수행한다. explicit JavaScript entry, source checkout과
  global binary 경로는 runner 차원의 동일 preflight가 없다.
- CLI는 `require.resolve`로 TypeScript Language Server entry를 찾고 `process.execPath`로 spawn하지만,
  installed tarball/cache 환경의 dependency layout을 release E2E로 보장하는 story가 없다.
- `JsonRpcClient`는 child `exit` 시점에 누적 stderr로 오류를 만들며 stdio `close`까지 drain을 보장하지 않는다.
- 실제 사례에서 Linux의 Codex Plugin cache runner로 `.jsx`의 `formatDate`를 분석했으나 두 번 모두
  `provider_unavailable: Language Server exited (1):`로 종료됐다.

## 조사 결과

- [Node.js child process 문서](https://nodejs.org/api/child_process.html#event-exit)는 `exit` 시점에도 stdio
  stream이 열려 있을 수 있고 `close`는 stdio가 닫힌 뒤 발생한다고 설명한다. provider 진단은 bounded
  `close`/stream completion 이후 구성해야 stderr tail 유실 가능성을 낮출 수 있다.
- package source test와 packed artifact test는 다른 경계를 검증한다. dependency resolution, bin shebang,
  executable permission과 cache path는 실제 tarball 설치 후에만 재현된다.
- runner가 여러 CLI source를 지원하면 편의성은 높지만, 선택 source를 숨기면 stale global install과 pinned
  release를 구분할 수 없다. resolution provenance가 필요하다.
- TypeScript/JavaScript는 bundled reference provider이므로 이 경로의 실패는 external provider의 일반적
  limitation이 아니라 release-blocking reliability defect로 취급해야 한다.

## 대안 검토와 결정

1. **사용자에게 global 재설치만 안내**: 원인을 확인하지 못하고 재발을 막지 못해 제외한다.
2. **runner source를 npm fallback 하나로 고정**: 단순하지만 개발 checkout과 explicit override workflow를 깨뜨린다.
3. **resolution provenance + 공통 preflight + packed E2E**: 기존 유연성을 유지하며 실패를 조기에 잡아 권장한다.
4. **server crash 시 텍스트 검색 자동 성공 처리**: 의미가 다른 분석을 성공으로 위장하므로 제외한다.

## 권장 대응

- runner가 내부적으로 선택 source를 `explicit | checkout | global | release-fallback`으로 분류하고 CLI에
  expected engine/package metadata를 전달한다. 성공 JSON에는 민감하지 않은 runtime/provider version을 포함한다.
- 모든 source에서 Node major를 실행 전에 검사한다. global bin의 interpreter가 다를 수 있으므로 CLI 자체도
  startup engine guard를 가진다.
- `provider doctor bundled-typescript`는 CLI entry, package version, Node executable/version, resolved server
  entry, file permission과 initialize/capability smoke를 단계별로 검사한다.
- `JsonRpcClient`는 spawn/exit/close를 상태 머신으로 관리하고 stderr/stdout cap, timeout과 redaction을 유지한다.
- release job은 `npm pack` 결과를 clean temp prefix에 설치하고 Plugin runner의 실제 fallback 경로로 분석한다.

## 단계별 계획

### 1단계 — 재현과 resolution provenance

1. `.ts`, `.tsx`, `.js`, `.jsx` multi-file fixture를 만들고 관측된 JSX 실패 요청을 회귀 입력으로 저장한다.
2. runner의 네 resolution branch를 각각 격리하는 shell fixture를 만든다.
3. CLI/Node/provider version과 선택 source를 secret/path-safe JSON doctor artifact로 기록한다.
4. Linux 실패 환경에서 가능한 runtime/cache/package metadata를 수집하는 checklist를 만든다.

종료 조건: “어느 CLI가 어느 Node로 어느 server entry를 실행했는지”를 source 내용 없이 재구성할 수 있다.

### 2단계 — 공통 startup preflight

1. runner와 CLI startup에서 Node engine requirement를 일관되게 검증한다.
2. resolved TypeScript server entry 존재, read permission과 package version을 검사한다.
3. stale/corrupt global 또는 cache를 구분하고 reinstall/update 명령을 정확히 안내한다.
4. preflight가 정상 analyze latency에 미치는 영향을 측정하고 version/path probe를 process 내 cache한다.

종료 조건: provider spawn 전에 복구 가능한 설치/runtime 문제를 명확한 code로 반환한다.

### 3단계 — process lifecycle 진단

1. `IL-LIM-005` 상태 머신에서 spawn error, early exit, stderr/stdout close와 initialize timeout을 구분한다.
2. exit 후 bounded stream drain과 stderr tail redaction을 구현한다.
3. partial JSON-RPC frame, stdin EPIPE와 shutdown race를 fixture로 고정한다.
4. error envelope에 lifecycle stage와 retryability를 결정적으로 mapping한다.

종료 조건: `Language Server exited (1):`처럼 원인·단계가 모두 빈 오류가 회귀 test에서 금지된다.

### 4단계 — packed artifact와 Plugin E2E

1. 실제 `npm pack` tarball을 clean temp prefix에 설치한다.
2. source checkout과 global dependency에 접근할 수 없는 환경에서 bundled server를 실행한다.
3. Codex/Claude Plugin cache layout에 runner를 설치하고 fallback download/install부터 analyze까지 검증한다.
4. TS/TSX/JS/JSX를 지원 OS matrix에서 cold/warm 실행한다.

종료 조건: source tree가 없어도 release artifact와 Plugin runner만으로 기본 언어 smoke가 통과한다.

### 5단계 — release gate와 복구 UX

1. packed Plugin/CLI E2E를 release-blocking job으로 지정한다.
2. 실패 artifact에 redacted doctor, version과 lifecycle timing을 남긴다.
3. INSTALL에 cache/global/version 충돌별 안전한 복구 순서를 문서화한다.
4. release 후 신규 external preset도 같은 artifact 경계를 재사용한다.

종료 조건: bundled provider launch 회귀가 release 전에 차단되고 사용자가 설정 없이 복구할 수 있다.

## 예상 변경 영역

- `plugins/impact-lens/scripts/run-impact-lens`: resolution provenance와 공통 Node preflight
- `cli/src/index.ts`: startup engine/runtime metadata와 bundled doctor
- `cli/src/lspProvider.ts`, `cli/src/jsonRpc.ts`: provider entry 및 lifecycle 진단
- CLI/Plugin packaging scripts와 clean-install E2E fixture
- CI release workflow, README/INSTALL troubleshooting
- `IL-LIM-003/005`의 error/coverage schema

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| runner | explicit/checkout/global/fallback | 선택 source와 version이 결정적으로 기록됨 |
| startup | old Node/missing entry/corrupt package | spawn 전 actionable error |
| lifecycle | stderr-only exit/partial frame/EPIPE | 단계와 redacted detail 보존, hang 없음 |
| artifact | clean tarball install | source checkout 없이 bundled server initialize |
| Plugin | cache runner TS/TSX/JS/JSX | provider 설정 없이 expected incoming graph |
| release | matrix 한 lane 실패 | release job이 실패하고 artifact가 남음 |

## rollout과 관측

- 진단 필드와 doctor를 먼저 additive release하고 기존 runner 우선순위는 유지한다.
- clean-install smoke가 안정된 뒤 release blocker로 승격한다.
- 사용자 path와 source는 외부 전송하지 않고 redacted CI/local artifact로만 남긴다.
- 특정 resolution branch에서 회귀하면 더 낮은 후보로 조용히 성공시키기보다 명시 오류와 override 방법을 제공한다.

## 미해결 질문

- Plugin manifest version과 CLI release version이 다른 현재 모델을 runtime metadata에서 어떻게 명확히 표현할지 정해야 한다.
- global binary가 다른 Node shebang을 사용할 때 runner와 CLI 중 어느 계층이 최종 engine 오류를 소유할지 결정해야 한다.
- network가 제한된 첫 fallback 설치 실패와 설치된 provider crash를 사용자 메시지에서 어떻게 분리할지 검토해야 한다.
