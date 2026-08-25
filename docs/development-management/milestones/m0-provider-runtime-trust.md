# M0 Provider 실행 신뢰성

- 상태: In progress
- 완료 소유: IL-LIM-003, IL-LIM-017
- 선행 기여: IL-LIM-006 1~2단계
- 릴리스 성격: 안정화 patch 또는 release-candidate gate

## 목표

bundled TypeScript/JavaScript provider가 source checkout뿐 아니라 실제 CLI package와 Codex/Claude Plugin
cache 설치 환경에서 일관되게 시작되도록 한다. 실패하면 빈 graph가 아니라 discovery/launch/initialize/
capability/query 단계와 해결 가능한 진단을 제공한다.

## 포함 범위

- `IL-LIM-003` 구현의 PR, 배포 호환성과 Plugin 소비 계약 마감
- `IL-LIM-017`의 runner 해석 경로, Node engine, bundled entry, child lifecycle과 packed artifact E2E
- `IL-LIM-006` 1~2단계의 Python wrong-provider 실패 fixture와 FastAPI 기준선
- Linux/macOS/Windows의 TS/TSX/JS/JSX clean-install matrix
- checkout, global CLI, release package, Codex/Claude Plugin cache별 CLI provenance 기록

## 진입 조건

- provider/coverage additive schema와 no-cross-language-fallback 구현이 존재한다.
- 관측된 Python 및 JavaScript/JSX 실패 요청을 재현 fixture로 보존할 수 있다.

## 산출물

- packed CLI와 Plugin cache를 설치하는 release E2E harness
- runner가 선택한 CLI 경로·version·Node runtime의 redacted provenance
- bundled provider entry와 dependency가 tarball에 포함되는지 검사하는 package gate
- Python 요청은 TS provider를 시작하지 않는 regression, FastAPI 정적 coverage baseline
- 지원 OS별 pass/fail matrix와 troubleshooting 문서

## 단계별 계획

1. **실패 기준선 고정**: 관측된 Python wrong-provider와 JS/JSX process exit를 fixture와 artifact provenance로
   재현한다.
2. **runtime·runner 구현**: Node/entry preflight, CLI 선택 provenance, stderr lifecycle과 package 검사를
   구현한다.
3. **자동 release gate**: clean tarball, Codex/Claude Plugin cache와 지원 OS의 TS/TSX/JS/JSX E2E를 통과한다.
4. **사용자 테스트 명세 제안**: UI와 오류 문구가 안정되면 `user-tests/m0-user-test-spec.md`를 작성한다.
   실제 사용자가 clean install/update 후 첫 JS/TS 분석을 완료하고, 의도적으로 깨진 runtime/provider 상태에서
   원인을 이해해 복구할 수 있는지를 중심으로 과업·기대 결과·증거를 정의한다. 지금은 명세를 작성하거나
   테스트를 실행하지 않는다.
5. **사용자 검증과 release 결정**: 별도 승인 후 Codex/Claude 사용자와 OS별 참여자가 명세를 수행하고,
   발견된 설치·진단 문제를 수정·재시험한 뒤 안정화 release 여부를 결정한다.

## 종료 gate

- [x] IL-LIM-003과 IL-LIM-017의 자동 수용 기준이 충족되고 구현 [PR #16](https://github.com/moelee835/Impact-Lens/pull/16)이 연결된다.
- [x] clean temp 환경의 CLI tarball에서 TS/TSX/JS/JSX cross-file fixture가 통과한다.
- [x] Codex와 Claude Plugin cache 설치 형태에서 같은 fixture가 통과한다.
- [x] 지원하는 Linux/macOS/Windows 조합에서 Node engine과 bundled entry preflight가 통과한다.
- [x] Python no-provider fixture는 process launch 없이 actionable discovery error를 반환한다.
- [x] code 1·빈 stderr 실패가 재현되면 최소한 실제 lifecycle stage와 artifact provenance가 보존된다.
- [x] release 문서가 source test와 packed artifact 검증 결과를 구분한다.
- [ ] `user-tests/m0-user-test-spec.md`가 release candidate 기준으로 검토됐으며, 실제 사용자 검증 결과 또는
  실행 보류 사유가 release decision에 기록된다.

## 제외 범위

- Python을 정상 분석하는 external preset
- 범용 custom LSP 양방향 protocol 확장
- 동적 호출, DI와 framework edge 추론

## 주요 위험과 대응

- Plugin cache 경로가 host/version마다 다를 수 있다: cache 내부 경로에 의존하지 않고 설치 후 runner
  진입점과 package manifest를 기준으로 검증한다.
- platform matrix 비용이 커질 수 있다: 최소 지원 OS/Node 조합을 release gate로 두고 추가 조합은 nightly로
  분리한다.
- CI에서는 재현되지만 사용자 환경에서만 실패할 수 있다: command 전체나 source를 노출하지 않는 doctor
  bundle을 제공한다.

## 다음 마일스톤 연결

M1은 이 마일스톤의 안정된 lifecycle/error 계약 위에 external provider transport, Auto와 doctor를 추가한다.
M0가 끝나기 전에는 새 언어 preset을 verified로 승격하지 않는다.
