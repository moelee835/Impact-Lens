# Impact Lens

Impact Lens는 현재 수정하려는 함수의 호출자와 잠재 영향 범위를 VS Code 안에서 탐색하는 로컬 확장 프로그램입니다. 별도 AI 에이전트나 클라우드 분석 없이, 현재 언어 확장이 제공하는 Call Hierarchy를 사용합니다.

## 현재 MVP 기능

- 커서가 위치한 함수의 직접 호출자와 간접 호출자 탐색
- 호출 깊이 및 최대 노드 수 제한
- 테스트 파일에서 발견된 호출자를 별도 분류
- Impact Explorer 트리에서 호출자와 소스 위치 탐색
- 함수 중심 호출 그래프와 깊이 필터
- 모든 그래프 노드 아래에 함수 역할 노트 표시
- 코드에 노출되지 않는 Personal 함수 노트
- `.impact-lens/notes.json`을 통한 Shared 함수 노트
- 기존 `@impact-note` 주석 읽기·추가·수정·삭제 호환
- 함수 위 CodeLens에 역할 노트 또는 영향 분석 동작 표시
- 커서 이동 및 문서 저장 시 증분 재분석
- 동적 호출처럼 언어 서버가 확인하지 못하는 관계는 결과에 포함되지 않는 정적 분석 방식

## 함수 역할 노트

함수 노트는 세 가지 저장 범위를 함께 사용할 수 있습니다.

1. **Personal**: VS Code 워크스페이스 저장소에 보관되며 프로젝트 파일을 변경하지 않습니다.
2. **Shared**: 프로젝트의 `.impact-lens/notes.json`에 보관되어 Git으로 공유할 수 있습니다.
3. **Source comment**: 기존 `@impact-note` 주석 형식을 유지합니다.

같은 함수에 여러 노트가 있으면 `Personal → Shared → Source comment` 순서로 표시합니다. `Impact Lens: Manage Function Note`에서 개인 재정의, Shared 게시, 기존 주석 편집과 Personal 되돌리기를 선택할 수 있습니다. Personal 노트를 Shared로 게시하면 Shared 파일에 저장한 뒤 Personal 복사본을 제거합니다. Shared 노트를 바탕으로 Personal 노트를 만들 때는 Shared 원본을 유지합니다.

### 기존 소스 주석

기존 노트는 함수 선언 바로 위의 줄 주석으로 작성할 수 있습니다.

```ts
// @impact-note 주문 항목과 세율을 합산해 최종 결제 금액을 계산
export function calculateTotal(items: LineItem[]): Money {
  // ...
}
```

Python에서는 `# @impact-note`, SQL과 Lua에서는 `-- @impact-note`를 사용합니다. 그래프에서는 태그를 제외한 설명만 모든 함수 노드 아래에 표시됩니다. 기존 주석은 자동으로 삭제되거나 변환되지 않으며, 새 노트의 기본 저장 위치는 Personal입니다.

## 실행

1. Node.js 20 이상을 준비합니다.
2. `npm install`을 실행합니다.
3. VS Code에서 이 폴더를 열고 `F5`를 누릅니다.
4. 새 Extension Development Host에서 분석할 프로젝트를 엽니다.
5. 함수에 커서를 두거나 함수 위 CodeLens를 클릭합니다.

사용 가능한 주요 명령:

- `Impact Lens: Show Impact for Current Function`
- `Impact Lens: Open Call Graph`
- `Impact Lens: Manage Function Note`
- `Impact Lens: Refresh`

## 요구 사항

대상 언어의 VS Code 확장이 Call Hierarchy를 제공해야 합니다. JavaScript/TypeScript, Java, C/C++, C#, Go, Rust 등은 각 언어 확장의 지원 범위에 따라 동작합니다. Python 등 일부 언어는 설치된 언어 서버와 설정에 따라 결과가 달라질 수 있습니다.

## 설정

- `impactLens.maxDepth`: 역방향 호출 탐색 깊이, 기본값 2
- `impactLens.maxNodes`: 한 번에 표시할 최대 심볼 수, 기본값 120
- `impactLens.autoAnalyzeOnCursorChange`: 커서 이동 시 자동 분석, 기본값 true
- `impactLens.showCodeLens`: 함수 위 Impact Lens 표시, 기본값 true
- `impactLens.defaultNoteStorage`: 노트 관리 화면에서 먼저 표시할 저장 위치, 기본값 `personal`

## 구조

- `ImpactAnalyzer`: VS Code Call Hierarchy를 이용한 역방향 BFS
- `NoteStore`: Personal·Shared·Source comment 노트의 우선순위, 저장과 편집
- `ImpactTreeProvider`: 사이드바 영향 트리
- `GraphPanel`: 함수 노트가 포함된 로컬 Webview 그래프
- `ImpactCodeLensProvider`: 함수 선언 위 인라인 진입점

## 개발 검증

```sh
npm run compile
npm test
```

현재 버전은 함수 호출 관계에 집중한 MVP입니다. 데이터 흐름, 런타임 의존성 주입, reflection, 이벤트·라우트 연결, Git 변경분 병합 분석은 후속 범위입니다.
