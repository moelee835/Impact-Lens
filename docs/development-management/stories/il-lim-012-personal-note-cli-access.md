# IL-LIM-012 Personal note의 CLI 접근 전략

- 상태: Backlog
- 우선순위: P3
- 완료 마일스톤: [M6 — Note 접근성과 언어별 마무리](../milestones/m6-notes-language-polish.md)
- 영향도: 낮음
- 적용 영역: Agent CLI, Codex/Claude Code Plugin

## 문제

Personal note는 VS Code `workspaceState`에 저장되어 독립 CLI와 Plugin이 접근할 수 없다. 사용자는
Extension에서 보던 개인 문맥이 Agent workflow에서 사라진 이유를 알기 어렵고 scope 사이의 이동도 수동이다.

## 사용자 스토리

개인 노트를 사용하는 개발자로서 명시적으로 허용한 경우에만 Agent가 필요한 노트를 읽거나
공유 가능한 scope로 내보내도록 하고 싶다.

## 범위

- 직접 저장소 접근 대신 Extension-mediated export/import 또는 명시적 bridge를 설계한다.
- read/write 권한, workspace 경계, preview와 사용자 승인을 정의한다.
- unavailable 상태와 안전한 Shared/Local 대안을 Plugin에서 안내한다.

## 제외 범위

- VS Code 내부 storage 파일을 CLI가 직접 탐색·수정
- 사용자 승인 없는 Personal note 외부 전송 또는 scope 변경

## 수용 기준

- [ ] 위협 모델과 권한 경계가 문서화된다.
- [ ] export/import 또는 bridge 작업에 명시적 사용자 승인이 필요하다.
- [ ] workspace와 symbol identity 충돌이 안전하게 처리된다.
- [ ] bridge가 없어도 기존 `vscode_personal_notes_unavailable` 동작이 유지된다.

## 검증

- 승인·거부·충돌·다른 workspace 시나리오 테스트
- preview/apply 및 token conflict 회귀 테스트
- 로그와 JSON에 개인 노트가 불필요하게 노출되지 않는지 검사

## 의존성 및 위험

- VS Code API와 별도 통신 경로가 필요해 독립 CLI 원칙과 충돌할 수 있다.
- 개인정보 보호가 편의성보다 우선하며 안전한 설계가 없으면 미구현 상태를 유지한다.

## 현재 기준선

- Extension은 `NoteStore`가 `ExtensionContext.workspaceState`의 `impactLens.personalNotes.v1` key로
  Personal note를 읽고 쓴다.
- CLI는 VS Code state에 접근하지 않고 `vscode_personal_notes_unavailable` limitation과 unavailable layer를 반환한다.
- Shared note는 양쪽이 `.impact-lens/notes.json`을 공유하고, Local note는 CLI만
  `.impact-lens/notes.local.json`에서 사용한다.
- Extension에는 Personal note를 Shared로 publish하는 명시적 action이 있지만 Local로 복사하는 action은 없다.

## 조사 결과

- [VS Code ExtensionContext](https://code.visualstudio.com/api/references/vscode-api#ExtensionContext)의
  `workspaceState`는 현재 extension context에 속하는 Memento다. 외부 CLI가 storage 구현 파일을 직접 읽는
  public contract가 아니다.
- `storageUri` 경로가 존재하더라도 workspaceState의 내부 serialization이나 key 저장 위치를 계약으로
  간주할 수 없다.
- 로컬 server/socket bridge는 실시간 접근을 제공하지만 extension 활성화, token 관리, remote/WSL/container
  경로와 attack surface가 크게 늘어난다.
- 이미 CLI Local scope가 있으므로 사용자가 명시적으로 Personal note를 Local에 복사하는 방식은
  새로운 daemon 없이 private workflow를 연결할 수 있다.

## 대안 검토와 결정

1. **VS Code storage DB 직접 읽기**: 비공개 구현 의존과 손상 위험 때문에 금지한다.
2. **항상 켜진 local bridge**: 기능 대비 보안·운영 복잡도가 커 첫 대응으로 제외한다.
3. **Personal ↔ Local 명시적 복사/import**: 기존 파일 계약과 preview/승인을 재사용할 수 있어 권장한다.
4. **Personal 자동 동기화**: scope 의미와 conflict가 불명확하고 사용자 기대를 침해하므로 제외한다.

## 권장 대응

- 목표를 “CLI가 Personal storage를 직접 읽음”이 아니라 “사용자가 선택한 Personal note를 private Local
  scope로 안전하게 전달”로 재정의한다.
- Extension에 Local note read/write 지원을 추가하되 표시 우선순위는 별도 UX 결정 전 기존 Personal 우선으로 둔다.
- `Copy personal note to local Agent scope`와 `Import local note as personal` action은 항상 preview,
  destination path, overwrite 여부와 명시적 확인을 제공한다.
- Local 파일이 Git ignore되지 않았거나 symlink/path 경계를 위반하면 작업을 중단한다.
- 양방향 자동 sync 대신 각 note의 updatedAt/token을 비교해 conflict를 보여주고 사용자가 방향을 선택한다.
- 실시간 bridge는 다수 사용자 요구가 확인될 때 threat-model spike를 거친 후 별도 story로 분리한다.

## 단계별 계획

### 1단계 — scope 계약과 위협 모델

1. Personal/Local의 privacy, persistence, host와 share semantics를 표로 확정한다.
2. Local 파일 permission, Git ignore, symlink와 remote workspace 위험을 분석한다.
3. copy/import의 preview payload, conflict token과 audit-free 원칙을 정의한다.

종료 조건: note content가 어떤 동작으로 어디에 저장되는지 사용자에게 설명 가능하다.

### 2단계 — Extension Local adapter

1. CLI Local document parser/validation 계약을 공유하거나 동일 schema로 구현한다.
2. Extension `NoteStore`에 Local load/save와 file watcher를 추가한다.
3. malformed document와 unknown field 보존 규칙을 CLI와 일치시킨다.
4. Local note를 기본 표시 layer에 넣을지 관리 화면에서만 보일지 UX test를 한다.

종료 조건: Extension과 CLI가 같은 Local file을 손실 없이 읽고 conflict를 감지한다.

### 3단계 — 명시적 복사/import

1. Personal → Local preview에 source/destination, diff와 overwrite warning을 표시한다.
2. 확인 뒤 최신 token으로 apply하고 Personal 원본은 기본적으로 유지한다.
3. Local → Personal도 같은 방식으로 제공하며 bulk export는 별도 승인과 summary를 요구한다.
4. 취소·부분 실패에서 두 scope가 손상되지 않게 atomic write를 사용한다.

종료 조건: 단일·충돌·취소 시나리오가 모두 명시적 사용자 선택으로 종료된다.

### 4단계 — Plugin guidance

1. Personal unavailable 응답에 Local 복사 절차를 actionable message로 추가한다.
2. Plugin은 Local note mutation에도 기존 preview/apply/token 규칙을 유지한다.
3. 사용자가 요청하지 않은 Personal → Local 복사를 Agent가 제안만 하고 실행하지 못하게 한다.

종료 조건: Plugin이 Personal note 부재를 삭제나 empty note로 오해하지 않는다.

## 예상 변경 영역

- `src/noteStore.ts`, `src/noteModel.ts`: Local adapter와 copy/import action
- `cli/src/notes.ts`: 공유 Local schema/atomicity 정합성
- note model/source type과 Extension configuration
- Extension·CLI note tests: conflict, Git ignore, symlink와 unknown field
- Plugin skill/notes command: Personal→Local 안내
- README/INSTALL: scope와 privacy 표 갱신

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| contract | Extension/CLI Local document round-trip | unknown field와 note identity 보존 |
| 보안 | tracked file, symlink, workspace 밖 path | copy/apply 중단과 명확한 warning |
| mutation | preview 뒤 destination 변경 | stale token conflict로 apply 거부 |
| UX | Personal→Local overwrite | diff와 명시적 confirmation 없이는 변경 없음 |
| failure | atomic write 중 오류 | 기존 Personal/Local 모두 보존 |
| Plugin | Personal unavailable | Local 복사 action을 안내하되 자동 수행하지 않음 |

## rollout과 관측

- 첫 release는 Extension의 Local 읽기와 수동 단일-note 복사만 제공한다.
- bulk export/import와 Local 표시 우선순위 변경은 사용성 검증 뒤 분리한다.
- note 내용 telemetry/logging은 금지하고 scope action 성공·conflict code만 로컬 debug에 기록한다.
- `.gitignore`가 확인되지 않으면 안전 기본값으로 mutation을 막고 사용자가 직접 해결하게 한다.
- 문제가 생기면 Local adapter/action을 숨겨도 기존 Personal·Shared와 CLI Local은 독립적으로 유지된다.

## 미해결 질문

- Local note를 Extension의 effective-note 우선순위에 포함할지 관리 전용 layer로 둘지 결정이 필요하다.
- multi-root workspace에서 Local 파일을 folder별로 둘지 workspace aggregate로 볼지 정해야 한다.
- 실시간 bridge 수요가 명시적 복사보다 충분히 큰지 사용자 feedback이 필요하다.
