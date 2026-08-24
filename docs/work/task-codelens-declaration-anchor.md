# CodeLens 선언 위치 및 호출 관계 회귀 검증

- 상태: 구현 및 자동 검증 완료
- 작성일: 2026-08-24

## 배경과 해결할 문제

v0.3.0을 실제 소스 프로젝트에서 사용했을 때 `Show impact` CodeLens가 함수 시그니처 위가 아니라 함수 본문의 `return` 문 위에 표시되는 사례가 확인됐다. 동시에 CodeLens에서 시작한 분석이 올바른 함수 root를 준비하는지, caller → callee 관계와 depth가 정확한지 다시 검증해야 한다.

## 현재 구현 조사

- `src/codeLensProvider.ts`는 언어 서버의 `DocumentSymbol.selectionRange` 또는 `SymbolInformation.location.range`를 그대로 CodeLens range와 `showImpactAt` 위치에 사용한다.
- VS Code는 CodeLens range의 시작 줄을 기준으로 렌더링하므로 provider가 본문 내부 range를 반환하면 `return` 위에도 표시될 수 있다.
- `src/impactAnalyzer.ts`는 CodeLens가 넘긴 위치에서 `vscode.prepareCallHierarchy`를 호출한다. 따라서 잘못된 CodeLens anchor는 표시 위치뿐 아니라 root 준비 신뢰성도 떨어뜨린다.
- incoming call contract는 `CallHierarchyIncomingCall.from`이 caller이고 `fromRanges`가 caller 내부의 call site다. 현재 traversal edge는 `from → 현재 item`으로 저장하므로 방향은 caller → callee다.

## 범위

- 함수/메서드/생성자의 provider range를 검증하고 실제 선언 이름이 있는 줄로 CodeLens anchor 보정
- Python `def`/`async def`, decorator, TypeScript/JavaScript function·method·arrow, 일반 typed method 형태 지원
- 보정된 선언 위치를 note lookup과 `showImpactAt` 모두에 사용
- 선언 탐색 로직의 순수 단위 테스트 추가
- 호출 그래프의 cross-file, route → service → repository, diamond, cycle, 동명 symbol, depth/node limit과 edge 방향 반복 검증
- README/CHANGELOG 및 작업 로그 갱신

## 범위 제외

- 언어 서버가 제공하지 않는 FastAPI `Depends()`나 decorator route 관계를 임의로 생성
- 모든 언어 문법을 완전하게 parsing하는 별도 parser 도입

## 구현 계획

1. VS Code에 의존하지 않는 declaration-anchor 계산 모듈을 만든다.
2. provider selection이 실제 symbol name을 가리키는지 확인하고, 그렇지 않으면 symbol 전체 range의 앞부분에서 선언 형태를 우선 탐색한다.
3. 선언을 찾지 못하면 본문 내부 selection이 아니라 symbol range 시작으로 안전하게 fallback한다.
4. CodeLens range와 명령 인자를 동일한 보정 위치로 통일한다.
5. 언어별 선언 fixture와 잘못된 `return` selection 회귀 테스트를 추가한다.
6. 호출 관계 fixture/invariant를 보강하고 테스트를 최소 3회 반복 실행한다.
7. compile, diff check, VSIX packaging을 수행한다.

## 테스트 및 완료 기준

- provider selection이 `return`의 호출식을 가리켜도 CodeLens anchor는 함수 선언 줄이다.
- 정상적인 provider selection은 유지된다.
- decorator 뒤의 Python 선언과 class method/arrow function을 찾는다.
- CodeLens 클릭 위치와 표시 range가 같은 선언 anchor를 사용한다.
- caller → callee edge, depth, cross-file URI, diamond의 모든 edge, cycle 종료 및 제한 사유 테스트가 통과한다.
- 전체 테스트를 연속 3회 실행해 비결정적 실패가 없다.
- TypeScript compile과 VSIX packaging이 성공한다.

## 작업 로그

### 2026-08-24 — 문제 조사

- 실제 증상과 코드 흐름을 대조해 provider range를 무검증으로 사용하는 것이 직접 원인임을 확인했다.
- 단순히 `symbol.range.start`만 쓰면 Python decorator 위로 이동하거나 선언 이름과 Call Hierarchy 준비 위치가 어긋날 수 있어, 문서 텍스트에서 선언 이름을 찾아 보정하는 방식을 선택했다.

### 2026-08-24 — 선언 anchor 구현

- `src/declarationAnchor.ts`를 추가했다.
  - provider selection이 실제 symbol name과 선언 형태를 가리키면 즉시 반환한다.
  - selection이 함수 본문의 `return`, `await`, `yield` 등 사용 위치이면 symbol range 앞부분에서 최대 80줄까지 선언 후보를 찾는다.
  - Python `def`/`async def`, 일반 function keyword, typed method, TypeScript/JavaScript arrow assignment를 구분한다.
  - 선언 후보가 없으면 본문 selection 대신 symbol range 시작으로 fallback한다.
- `src/codeLensProvider.ts`에서 보정된 한 위치를 CodeLens range, note lookup, `showImpactAt` 명령 인자에 공통 사용한다.
- 처음에는 문서 전체를 한 번 문자열 배열로 만들었지만 성능 질문을 반영해 `document.lineAt()` callback 방식으로 바꿨다. 정상 selection은 한 줄만 읽고 비정상 selection만 최대 81줄(provider 줄 1 + fallback 80)을 읽는다.
- `src/test/declarationAnchor.test.ts`에 실제 회귀 형태인 FastAPI decorator + `return service.list_orders()` selection, 정상 provider selection, typed method, arrow function, fallback 테스트를 추가했다.

### 2026-08-24 — 호출 관계 재검증

- 설치된 공식 `@types/vscode`의 `CallHierarchyIncomingCall` 계약을 다시 확인했다.
  - `from`: call을 만드는 item, 즉 caller.
  - `fromRanges`: caller 안의 call site.
- `ImpactAnalyzer`는 incoming `from`을 traversal source로 전달하고 `traverseIncoming`은 `source(from) → target(current)` edge를 만든다. 따라서 UI edge 방향은 caller → callee로 API 계약과 일치한다.
- 기존 diamond fixture에서 한 caller가 두 경로로 이어질 때 두 edge가 모두 보존되는지 확인했다.
- `route.py:post_order → service.py:create_order → repository.py:save` cross-file fixture를 추가해 root 기준 depth가 repository 0, service 1, route 2이고 edge 방향은 route → service → repository인지 확인했다.
- cycle fixture를 추가해 양방향 edge를 보존하면서 이미 본 node를 재확장하지 않고 정상 종료하는지 확인했다.
- 실제 URI가 다른 동명 symbol key가 구분되는 테스트를 추가했다.
- 기존 depth limit/natural completion, node limit/dangling edge, depth 5 초과 테스트도 함께 유지했다.

### 2026-08-24 — 성능 및 반복 검증

- Node.js `performance.now()`로 declaration anchor 100,000건을 측정했다.
  - 정상 provider selection: 12.33ms, line read 100,000회(심볼당 약 0.00012ms, 1줄).
  - 잘못된 provider selection + fallback scan: 96.03ms, line read 8,200,000회(심볼당 약 0.00096ms, 82줄).
  - 측정값은 현재 머신의 micro benchmark이며 실제 Extension Host 절대 시간 보장은 아니지만 Call Hierarchy/언어 서버 요청을 추가하지 않는 로컬 문자열 연산임을 확인했다.
- 전체 `npm test`를 연속 3회 실행했고 매 실행마다 23/23 테스트가 통과했다.
- 별도 `npm run compile` 성공.
- `git diff --check` 성공.
- `npx vsce package --out /tmp/impact-lens-codelens-fix.vsix` 성공, 27 files, 134.52 KB.
- 버전을 0.3.1로 반영한 뒤 `npm test` 23/23 통과 및 `/tmp/impact-lens-0.3.1.vsix` 최종 패키징에 성공했다(27 files, 135.82 KB, SHA-256 `80bc03cf1100fe506f91107a6e1dd43e20078d83445ddb624f056d7e4c48cf6d`).
- 이 shell에는 `code` CLI가 없어 실제 Extension Development Host에서 CodeLens의 시각 위치를 재확인하지 못했다. 자동 테스트는 provider가 `return` 내부를 selection으로 반환한 입력에서 선언 위치를 선택하는 계산까지 검증하며, 최종 VSIX 수동 smoke test는 남은 검증 항목이다.
- 수정 릴리스 버전은 v0.3.1로 정했다.
