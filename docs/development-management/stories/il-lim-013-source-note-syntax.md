# IL-LIM-013 Source note 주석 문법 확장

- 상태: Backlog
- 우선순위: P3
- 완료 마일스톤: [M6 — Note 접근성과 언어별 마무리](../milestones/m6-notes-language-polish.md)
- 영향도: 낮음
- 적용 영역: VS Code Extension, Agent CLI

## 문제

CLI Source note 쓰기는 등록된 파일 확장자와 `//`, `#`, `--` line comment만 지원한다.
알 수 없는 언어는 안전하게 거부되며 block comment만 사용하거나 확장자가 다른 언어에서는 Source note를
쓸 수 없다. Extension과 CLI의 미등록 언어 처리도 완전히 동일하지 않다.

## 사용자 스토리

추가 언어를 사용하는 개발자로서 해당 언어의 유효한 주석 문법으로 Source note를 안전하게 관리하고,
지원하지 않으면 Shared/Local 대안을 명확히 안내받고 싶다.

## 범위

- Extension과 CLI가 공유할 comment syntax registry를 설계한다.
- 필요한 언어의 line/block comment formatting과 parsing을 명시적으로 추가한다.
- 미지원 언어에서는 임의 문법을 쓰지 않고 대체 scope를 안내한다.

## 제외 범위

- 언어 parser 없이 복잡한 전처리기·문서 주석 문법 전체 지원
- 기존 사용자 주석의 자동 변환

## 수용 기준

- [ ] Extension과 CLI가 동일한 언어·주석 mapping을 사용한다.
- [ ] 추가 언어별 set/get/delete와 indentation/newline 보존이 검증된다.
- [ ] 미지원 언어는 파일을 변경하지 않고 명시적 오류와 대안을 반환한다.
- [ ] 기존 `//`, `#`, `--` 언어 동작이 유지된다.

## 검증

- 언어·확장자별 formatting/parsing matrix 테스트
- CRLF/LF, indentation, shebang과 기존 주석 보존 회귀 테스트
- preview/apply conflict 및 미지원 파일 무변경 검사

## 의존성 및 위험

- `IL-LIM-004`의 지원 언어 선정과 함께 우선순위를 정할 수 있다.
- block comment 편집은 line comment보다 파일 손상 위험이 커 preview 검증이 필수다.

## 현재 기준선

- Extension `src/noteSyntax.ts`는 Python/Ruby/Shell/Perl/R/YAML/Dockerfile에 `#`,
  SQL/Lua/Haskell에 `--`, 그 외 모든 languageId에 `//`를 사용한다.
- CLI `cli/src/notes.ts`는 명시된 확장자만 지원하고 알 수 없는 확장자는
  `unsupported_note_language`로 안전하게 거부한다.
- 두 구현이 별도 source list를 가지므로 언어 추가와 수정이 쉽게 어긋날 수 있다.
- parser는 `@impact-note`가 있는 line을 넓게 찾지만 formatter는 line comment만 생성한다.

## 조사 결과

- [VS Code Language Configuration Guide](https://code.visualstudio.com/api/language-extensions/language-configuration-guide#language-configuration)는
  언어 extension이 `comments.lineComment`와 `comments.blockComment`를 선언할 수 있음을 보여준다.
- 그러나 Impact Lens가 다른 extension의 resolved language configuration을 언어 중립적으로 조회하는 공개 API는
  문서화되어 있지 않으므로 자동 discovery에 의존할 수 없다.
- Extension의 unknown → `//` fallback은 Python 계열이 아닌 미등록 언어에서 문법 오류를 만들 수 있어
  CLI의 fail-closed 동작보다 위험하다.
- block comment는 insertion뿐 아니라 기존 comment range, indentation, closing delimiter와 nested-comment
  규칙이 필요하므로 line comment registry와 같은 난이도로 취급하면 안 된다.

## 대안 검토와 결정

1. **Extension의 unknown fallback 유지**: 파일 손상 가능성이 있어 즉시 제거해야 한다.
2. **각 host의 목록을 계속 수동 관리**: drift 문제가 남는다.
3. **공유 data registry + host adapter + fail-closed**: package 경계를 유지하면서 일관성을 확보해 권장한다.
4. **block comment를 곧바로 일반화**: parser 복잡도와 위험이 커 line-comment 확장 뒤 별도 단계로 둔다.

## 권장 대응

- JSON 또는 dependency-free TypeScript data로 `CommentSyntaxRegistry`를 만든다.
  - canonical language key
  - VS Code languageIds
  - file names/extensions
  - optional shebang matcher
  - `lineComment`와 향후 `blockComment`
  - support status와 fixture ID
- Extension과 CLI는 같은 registry artifact에서 resolver를 생성하고 unknown은 둘 다 mutation을 거부한다.
- read/list는 기존 `@impact-note`를 가능한 범위에서 보여주되, mutation 가능 여부를 별도 capability로 반환한다.
- 첫 단계는 현재 명시 지원 언어의 정합성과 fail-closed에 집중하고 새 언어는 `IL-LIM-004` preset 우선순위와 맞춘다.
- C/C++, Swift와 Kotlin은 `//` line comment를 사용하는 명시 registry entry와 확장자/languageId fixture를
  각각 `IL-LIM-014`~`016`에 연결한다. “우연히 기본값이 맞음”은 지원 근거로 간주하지 않는다.
- 사용자 custom syntax는 project setting으로 추가할 수 있게 검토하되 delimiter 길이·newline 금지와 preview를 강제한다.

## 단계별 계획

### 1단계 — registry와 fail-closed

1. 현재 Extension/CLI mapping의 union과 불일치 matrix를 만든다.
2. 공유 registry schema와 resolver contract를 정의한다.
3. Extension unknown fallback을 `unsupported` result로 교체하고 UI에서 Shared/Personal 대안을 안내한다.
4. CLI와 Extension의 error/capability code를 통일한다.

종료 조건: 현재 명시 지원 언어의 output은 유지되고 unknown language는 파일을 변경하지 않는다.

### 2단계 — package 공유 방식

1. root/CLI build가 동일 registry를 소비하는 가장 작은 package/data 경계를 선택한다.
2. VSIX와 CLI tarball에 필요한 registry만 포함되는지 packaging test를 추가한다.
3. generated artifact를 쓴다면 source-of-truth와 stale generation 검사를 둔다.

종료 조건: 두 host mapping hash 또는 fixture 결과가 항상 일치한다.

### 3단계 — 언어 확장과 custom mapping

1. verified provider preset 언어부터 comment syntax fixture를 추가한다.
2. extension-less file, Dockerfile variant와 shebang resolution 순서를 정의한다.
3. custom line comment 설정의 validation, workspace trust와 preview UI를 설계한다.

종료 조건: 새 언어 추가가 registry·fixture·문서 한 세트로 review된다.

### 4단계 — block comment feasibility

1. line comment가 없는 실제 대상 언어와 사용자 수요를 조사한다.
2. single-line block form만 먼저 허용할지 multi-line edit까지 지원할지 threat model을 작성한다.
3. parser/tokenizer 없이 안전하지 않으면 지원하지 않고 Shared/Local scope를 안내한다.

종료 조건: 안전한 mutation 증거가 있을 때만 별도 구현 Issue로 승격한다.

## 예상 변경 영역

- 신규 shared comment syntax registry/data와 resolver
- `src/noteSyntax.ts`, `src/noteStore.ts`: fail-closed와 capability UI
- `cli/src/notes.ts`: 공유 resolver 적용
- root/CLI package build와 packaging include rules
- `src/test/noteSyntax.test.ts`, `cli/src/test/notes.test.ts`: 공통 matrix
- README/CLI 문서: 명시 지원·미지원 언어와 대체 scope

## 테스트 계획

| 계층 | 시나리오 | 통과 기준 |
| --- | --- | --- |
| matrix | 모든 languageId/extension mapping | Extension·CLI delimiter가 동일 |
| mutation | `//`, `#`, `--` set/delete | indentation, CRLF/LF와 final newline 보존 |
| unknown | 미등록 languageId/extension | preview/apply 모두 무변경과 명시적 오류 |
| resolution | Dockerfile, `.yml`, shebang | 문서화된 우선순위로 syntax 선택 |
| packaging | VSIX/CLI tarball | registry가 필요한 host에 한 번 포함되고 source 불필요 파일 제외 |
| custom | invalid/ambiguous delimiter | 설정 거부, source 파일 무변경 |

## rollout과 관측

- unknown fail-closed는 안전 수정으로 먼저 적용하되 release note에 기존 fallback 변경을 명시한다.
- registry 통합 뒤 기존 언어 fixture가 모두 통과해야 새 언어를 추가한다.
- unsupported mutation count는 외부 전송 없이 UI/JSON error code로만 노출한다.
- custom mapping은 experimental 설정으로 시작하고 built-in registry보다 명시적으로 높은 우선순위를 갖게 한다.
- mapping 회귀 시 해당 언어 mutation만 비활성화하고 Shared/Local note 경로를 유지한다.

## 미해결 질문

- shared registry를 root package 파일로 둘지 별도 workspace package로 둘지 packaging 단순성을 비교해야 한다.
- Extension에서 Personal 대안과 CLI에서 Local 대안을 각각 어떻게 안내할지 host별 UX를 정해야 한다.
- block comment만 가능한 언어에 대한 실제 수요가 별도 parser 비용을 정당화하는지 확인이 필요하다.
