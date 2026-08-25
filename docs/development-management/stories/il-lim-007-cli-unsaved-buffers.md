# IL-LIM-007 CLI의 저장하지 않은 buffer 분석

- 상태: Backlog
- 우선순위: P2
- 영향도: 중간
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

독립 CLI는 디스크 파일을 읽어 `didOpen`하므로 저장하지 않은 editor buffer를 알 수 없다.
Agent나 사용자가 편집 내용을 저장하기 전에 분석하면 최신 코드와 다른 결과가 반환될 수 있다.

## 사용자 스토리

코드를 수정 중인 Agent로서 아직 저장되지 않은 내용을 명시적으로 분석 요청에 전달하여,
현재 변경 상태에 맞는 영향 범위를 확인하고 싶다.

## 범위

- 요청에 대상 파일 또는 제한된 overlay 문서를 전달하는 계약을 설계한다.
- overlay가 있는 문서는 디스크보다 우선해 Language Server에 전달한다.
- 결과에 overlay 사용 여부와 대상 파일을 표시한다.

## 제외 범위

- CLI가 VS Code process의 열린 buffer를 임의로 읽는 기능
- 전체 workspace를 무제한으로 stdin에 복제

## 수용 기준

- [ ] overlay 적용 전후의 symbol과 caller 차이가 통합 테스트로 검증된다.
- [ ] workspace 밖 경로와 중복·과대 payload가 안전하게 거부된다.
- [ ] overlay 미제공 시 기존 디스크 분석 동작이 유지된다.
- [ ] 결과 metadata에서 저장되지 않은 입력 사용 여부를 확인할 수 있다.

## 검증

- overlay root/caller 파일의 LSP 통합 테스트
- 경로 탈출, 크기 제한과 잘못된 encoding contract 테스트
- Plugin의 stdin JSON 전달 회귀 테스트

## 의존성 및 위험

- Language Server별 변경 문서 처리 차이를 검증해야 한다.
- 민감한 source가 로그나 오류 메시지에 포함되지 않도록 해야 한다.

## 현재 기준선

- `cli/src/lspProvider.ts`의 `open`은 항상 `fs.readFile`로 디스크 내용을 읽고 version 1의
  `textDocument/didOpen`을 보낸다.
- analyze request schema에는 file content나 overlay collection이 없다.
- Extension은 VS Code TextDocument를 provider가 관리하므로 저장하지 않은 buffer가 live analysis에 반영된다.
- CLI는 정상 결과마다 `unsaved_buffers_unavailable` limitation을 반환한다.

## 조사 결과

- [LSP Document Synchronization](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_synchronization)는
  `didOpen`의 full text와 `didChange`의 versioned content change로 메모리 문서를 서버에 전달한다.
- overlay root만 열어서는 충분하지 않다. 저장하지 않은 caller 파일도 provider가 분석하기 전에 같은 session에
  열어야 cross-file incoming result에 반영될 가능성이 있다.
- provider가 `TextDocumentSyncKind.Incremental`을 선언하더라도 최초 overlay는 full-text `didOpen`으로
  전달할 수 있다. 이후 change 지원은 persistent session을 도입할 때 필요하다.
- 임시 workspace copy는 import path, symlink, generated file과 VCS 상태를 바꿔 Language Server 결과를
  왜곡할 수 있으므로 overlay의 기본 구현으로 부적합하다.

## 대안 검토와 결정

1. **분석 전에 Agent가 파일을 저장하도록 요구**: 단순하지만 preview·미완성 변경 workflow를 지원하지 못한다.
2. **workspace 전체 임시 복제**: provider 호환성은 높을 수 있으나 비용과 경로 의미 변경 때문에 제외한다.
3. **요청에 bounded document overlays를 포함해 didOpen 선등록**: LSP 표준 경로이며 명시적 입력만 다뤄 권장한다.
4. **VS Code buffer를 CLI가 직접 읽기**: host 결합과 권한 문제 때문에 제외한다.

## 권장 대응

- analyze request에 optional `documents[]`를 추가한다.
  - workspace 상대 `file`
  - full `text`
  - 양의 `version` 또는 request 내부 결정 순서
  - optional `languageId`
- 모든 overlay를 path·개수·개별/전체 byte 제한으로 검증한 뒤 provider initialize 직후 먼저 `didOpen`한다.
- target file overlay가 있으면 root 준비에도 같은 text를 사용한다.
- provider가 incoming caller file을 디스크에서 이미 index했더라도 supplied overlay는 열린 document version이
  우선한다는 전제는 provider별 integration test로 확인한다.
- 결과에 content 자체가 아닌 overlay file 목록, byte count와 `overlay_applied` capability만 기록한다.
- Plugin은 현재 대화에서 실제 수정한 파일만 overlay로 전달하고 source 전체를 로그나 confirmation에 반복 출력하지 않는다.

## 단계별 계획

### 1단계 — request·보안 계약

1. `DocumentOverlay` type과 schema를 정의하고 상대 경로 canonicalization을 재사용한다.
2. 기본 최대 파일 수, 개별 byte, 전체 byte와 NUL/encoding 처리 기준을 정한다.
3. 중복 file, target workspace 밖 path, directory/symlink escape와 languageId mismatch를 거부한다.
4. error detail에 source text가 포함되지 않는 contract test를 만든다.

종료 조건: 유효·무효 overlay payload가 안정된 exit code와 JSON error를 반환한다.

### 2단계 — provider 선등록

1. `LspCallHierarchyProvider` 생성과 analyze 사이에 `openDocuments(overlays)` lifecycle을 추가한다.
2. supplied text와 disk text를 하나의 document snapshot map에서 조회한다.
3. 모든 overlay를 연 뒤 root prepare를 실행하고 version을 유지한다.
4. provider dispose 전 필요하면 `didClose`를 보내되 process 종료 경로를 지연시키지 않는다.

종료 조건: mock LSP가 analyze 전에 모든 overlay didOpen을 받는다.

### 3단계 — 실제 TypeScript integration

1. 저장되지 않은 root rename, 새 caller 추가와 caller 삭제 fixture를 만든다.
2. root와 caller overlay를 각각·함께 제공한 결과를 비교한다.
3. provider diagnostics도 overlay range와 일치하는지 확인한다.

종료 조건: disk에는 없는 caller와 symbol이 overlay 분석 결과에 정확히 나타난다.

### 4단계 — Plugin 입력 정책

1. skill과 slash command에 overlay 사용 조건과 payload 제한을 명시한다.
2. Agent가 파일을 이미 저장했다면 overlay를 중복 전송하지 않도록 한다.
3. payload limit 초과 시 저장 후 재분석 또는 파일 subset 선택을 안내한다.

종료 조건: Plugin runner E2E에서 overlay가 shell argument가 아니라 stdin JSON으로만 전달된다.

## 예상 변경 영역

- `cli/src/types.ts`, `cli/src/index.ts`: overlay type·validation과 provider lifecycle
- `cli/src/lspProvider.ts`: supplied snapshot didOpen과 languageId 처리
- `cli/schemas/request.schema.json`: bounded `documents[]`
- `cli/src/test/lsp.integration.test.ts`: unsaved root/caller fixture
- Plugin skill, `commands/analyze.md`, CLI contract reference
- README/cli README: CLI disk/overlay semantics

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| schema | 정상 overlay와 중복·과대 payload | 정상만 수용하고 source text 없는 오류 반환 |
| 보안 | `..`, absolute path, symlink escape | workspace 밖 파일을 열거나 읽지 않음 |
| protocol | 여러 overlay 선등록 | prepare 이전 didOpen 순서와 version이 결정적 |
| 통합 | 저장 전 root rename | 새 symbol로 prepare되고 expectedSymbol 검증 통과 |
| 통합 | 저장 전 cross-file caller 추가·삭제 | overlay 상태대로 edge가 추가·제거됨 |
| Plugin | stdin overlay 분석 | shell 평가·source log 없이 정상 JSON 반환 |

## rollout과 관측

- request field는 optional additive 변경으로 제공하고 기존 disk-only 결과를 유지한다.
- 초기 release에서는 one-shot full-text overlay만 지원하고 incremental change는 persistent session 이후로 미룬다.
- 결과에는 overlay file count/bytes와 provider 처리 시간만 기록한다.
- provider별 overlay integration test를 통과하지 못하면 해당 preset에 `overlayUnsupported`를 표시한다.
- 문제 발생 시 documents field를 무시하지 말고 명시적 `provider_overlay_unsupported`로 실패해 stale 분석을 방지한다.

## 미해결 질문

- 기본 overlay file/byte limit과 Plugin이 자동 선택할 파일 범위를 실제 repository 크기로 측정해야 한다.
- unopened workspace file의 overlay가 provider index에 즉시 반영되지 않는 경우 추가 didChange/wait 전략이 필요한지 검증해야 한다.
- 향후 persistent provider session과 현재 one-shot request contract를 어떻게 호환할지 결정해야 한다.
