# M4 gate 2 — adapter 공유 추출 (branch `fix/m4-gate2-shared-adapter`)

## 목적과 사용자 가치

**사용자 문제**: VS Code Extension 사용자가 FastAPI `Depends()`로만 불리는 함수를 조회하면 아무 후보도
안 나온다. CLI로 같은 쿼리를 하면 `fastapi-static-v1` adapter가 후보 호출자를 찾아내는데도, Extension은
그 계산을 아예 하지 않는다(`git grep augmentedEdges -- src/` → 0건, 확인함 `[실행]`) — Extension이
`vscode.prepareCallHierarchy`를 직접 불러 자기 그래프를 만들고, adapter는 `cli/src/adapters/`에만
있어 CLI를 거치지 않는 Extension은 그 코드에 닿을 방법이 없다.

**이 작업 완료 후 가능해지는 것**: FastAPI 프로젝트를 여는 VS Code 사용자가, CLI를 따로 설치하거나
불러올 필요 없이, Extension 안에서 바로 `Depends()`/route-mount 후보 호출자를 본다.

**지금 이 작업을 하는 이유**: 사용자가 gate 4(M4 마일스톤 종료 gate 8개 중 하나, "모호한 DI/dynamic
target을 임의 승격하지 않는다")를 닫은 뒤 "공유 추출"로 다음 단계를 결정했다 — gate 2("JSON과 UI에서
확정/추론을 구분한다")가 지금 열려 있는 이유가 바로 이 부재이기 때문이다.

## 배경 — 실측한 제약

commander가 먼저 측정해 전달했고, 이 세션이 재확인(`[실행]`)했다:

1. **Extension은 런타임 npm 의존성이 0이다.** 루트 `package.json`에 `dependencies` 필드가 없다
   (`devDependencies`만 있음, 재확인). `.vscodeignore`가 `node_modules/**` 전체를 제외한다. 따라서
   `@impact-lens/cli`를 Extension의 npm 의존성으로 추가하는 안은 배제된다 — `cli/package.json`의
   `dependencies`(`typescript-language-server`, `pyright`)가 그대로 딸려 온다(재확인 — 아래 참고).
2. **두 tsconfig 모두 `rootDir: "src"`, `include: ["src/**/*.ts"]`** — 각자 자기 `src/` 바깥을
   컴파일할 수 없다(재확인).
3. **adapter의 CLI 내부 의존은 순수 함수 5개(~40줄)뿐이다.** `cli/src/impact.ts`의
   `externalRange`(산술), `relativeFile`(path, 내부적으로 `isOutside` 호출 — 실제로는 6개),
   `symbolId`(sha256), `symbolKindName`(룩업), `uriFile`(`fileURLToPath`). `fastapiDependencyAdapter.ts`
   외의 adapter 파일(`index.ts`, `types.ts`)은 `../types`에서 타입만 가져온다(재확인, `grep ^import`).
4. **심볼 식별이 의미상 일치하지만 문자열이 다르다.** CLI `symbolId()`는
   `sha256(JSON.stringify([uri, kind, name, detail??'', line, character])).slice(0,24)`, Extension
   `createSymbolKey()`(`src/symbolIdentity.ts`)는 같은 여섯 필드를 `#`으로 잇는다(재확인, 양쪽 소스
   직접 대조) — 그대로 두면 adapter가 내부에서 계산하는 `symbolId()` 기반 id가 Extension의 그래프
   node id와 하나도 안 맞는다.
5. **`CallHierarchyProvider`는 6개 멤버**(`capabilities`, `prepare`, `incoming`,
   `collectDiagnostics`, `dispose`, `analysisObservations?`)를 요구하지만, adapter는 `prepare`만
   쓴다(`resolveEndpoint()`의 유일한 provider 호출, 3개 call site 전부 재확인).

## 조사 결과 — commander의 비용표에 없던 blast radius를 하나 더 찾았다

**CLI 자신의 `dist/` 레이아웃을 건드리면 안 된다 — 실제 사용자 대상 경로가 그 정확한 경로를
하드코딩하고 있다.** `[실행]`으로 직접 확인:

```
plugins/impact-lens/scripts/run-impact-lens:10:
impact_lens_repo_entry="$impact_lens_plugin_dir/../../cli/dist/index.js"
```

`INSTALL.md`도 이 경로를 문서화한다: *"plugin runner는 source checkout의 `cli/dist/index.js`, 전역
`impact-lens`, v0.8.0 Release tarball 순서로 CLI를 찾습니다."* — Claude Code/Codex plugin 설치자의
실제 fallback 체인이다. `cli/tsconfig.json`의 `rootDir`을 넓혀 `shared/`에 닿게 하면 `cli/dist/`
전체 레이아웃이(예: `cli/dist/src/index.js`로) 밀려 **이 실사용 경로가 깨진다.**

commander의 비용표는 두 옵션 다 "shared를 어디 두느냐"만 다뤘지, **CLI 쪽 rootDir을 넓히는 것
자체가 이미 위험하다는 걸 계산에 안 넣었다** — 이 세션이 직접 찾은 추가 제약이다.

## 결정 — 공유 메커니즘

**결론: `shared/`를 `cli/src/shared/`에 물리적으로 둔다(CLI 쪽은 rootDir/include/dist 레이아웃
변경 없음 — 이미 `cli/src/**`에 포함됨). Extension 쪽은 `cli/dist/shared/**`를 평범한 상대 경로
`import`로 직접 가져온다 — TypeScript project references도 `composite`도 쓰지 않는다.**

**정정(구현 중 직접 재현으로 뒤집힌 최초 결정)**: 처음엔 project references(`cli/tsconfig.json`을
`composite: true`로 만들고 루트 `tsconfig.json`이 참조)로 가겠다고 commander에게 보고했다. **직접
만들어 실행해 보니 틀렸다**(`[실행]`): `cli/src/shared/adapters`를 import하면 reference 아래에서
**컴파일은 통과하지만**, 컴파일된 `out/probeSharedImport.js`가 `require("../cli/src/shared/
adapters")`를 그대로 내보낸다 — 이 경로는 TypeScript 소스 파일이지 컴파일된 JS가 아니라서, 실제
Node로 실행하면 `Cannot find module '../cli/src/shared/adapters'`로 즉시 깨진다(재현, 에러 메시지
그대로). project references는 **타입 검사만** 참조 프로젝트의 소스 위치를 봐 주지, **런타임
require 경로까지 dist로 바꿔 주지 않는다** — 당연한 TypeScript 동작인데 처음엔 놓쳤다.

**고쳐서 검증한 최종안**: import 경로 자체를 `../cli/dist/shared/adapters`(컴파일된 산출물)로
쓰면, `cli/tsconfig.json`에 `"declaration": true`만 추가해도(옆에 `.d.ts`가 있으면 TypeScript가
평범한 사전 컴파일 npm 패키지처럼 그걸 보고 타입 검사한다) **project references도 composite도
전혀 필요 없다.** 직접 검증(`[실행]`, probe 파일 만들어 컴파일 + `node -e "require(...)"`로 런타임
로드까지 확인, 이후 삭제):

- `cli/tsconfig.json`에 `"declaration": true`만 추가(→ `.tsbuildinfo` 생성 안 됨, `composite`가
  없으므로 — commander가 지적한 두 번째 부수 효과가 아예 발생하지 않는다).
- 루트 `tsconfig.json`은 **변경 없음** — `"references"` 불필요.
- `import { runAugmentation } from '../cli/dist/shared/adapters'` — 컴파일 성공(`.d.ts` 발견),
  런타임 `require()` 성공(실제 `.js` 발견) 둘 다 확인.

이유:

- **CLI의 `dist/index.js` 경로가 절대 안 움직인다** — 위에서 찾은 실사용 경로를 그대로 지킨다.
  `shared/`가 `cli/src/` 안에 있으므로 CLI의 기존 `rootDir: "src"`가 손 안 대도 이미 덮는다.
- **Extension의 `out/` 레이아웃도 안 움직인다** — commander의 옵션 1(`rootDir`을 `.`로 바꾸기)이
  요구하는 `package.json`의 `"main"`/테스트 glob/`.vscodeignore`의 `out/test/**` 갱신이 전부
  불필요해진다.
- **project references보다 단순하다** — `.tsbuildinfo` 관리, `"references"` 배열, build-mode
  compile 걱정이 전부 없어진다. 남는 유일한 요구는 "Extension을 빌드하기 전에 CLI를 먼저 빌드해
  `cli/dist/`가 존재해야 한다"는 것뿐 — 이건 project references를 썼어도 어차피 필요했던 요구다.
- **"복사·심볼릭 링크 금지"를 지킨다** — 물리적으로 파일이 두 곳에 존재하지 않는다, `cli/src/shared/`
  가 유일한 원본이고 Extension은 컴파일된 산출물을 참조만 한다.

**남은 진짜 비용(숨기지 않는다)**:

1. **`.vscodeignore` 갱신 필요** — 지금 `cli/**`를 통째로 제외하므로, `cli/dist/shared/**`를
   다시 포함하는 negation 규칙이 필요하다. `cli/node_modules/**`(`typescript-language-server`/
   `pyright` 포함)가 같이 안 딸려 오는지, `.d.ts`/`.js.map`이 안 섞여 오는지는 **주장이 아니라
   새로 만든 vsix 내용물 검사 스크립트로 직접 확인한다**(아래 "vsix 내용물 검사" 절).
2. **build 순서 필요** — 루트 `package.json`의 `vscode:prepublish`/`test` 스크립트가 `cli:build`를
   먼저 실행해야 한다 — Extension이 `cli/dist/shared/**`를 import/require하므로 그게 먼저 있어야
   한다(project references 여부와 무관하게 필요했던 요구).
3. **`cli/package.json`의 `"files"` 배열 갱신 필요** — 지금 `dist/adapters/*.js`처럼 명시적으로
   나열돼 있어, adapter가 `dist/shared/adapters/*.js`로 옮기면서 `dist/shared/*.js`/
   `dist/shared/adapters/*.js` 두 항목을 추가했다(CLI 자신의 `lspProtocol.test.ts`의 "모든 shipped
   디렉터리가 files에 있는가" 가드 테스트가 이걸 실측으로 확인해 준다 — 실제로 처음엔 누락돼 그
   테스트가 실패했다, `[실행]`).

## vsix 내용물 검사 — 실측 결과

commander가 지적한 대로 이 저장소에는 vsix를 실제로 패키징·검사하는 장치가 이전에 없었다
(`@vscode/vsce`는 devDependency로만 있고 쓰는 곳이 없었다, 재확인). `scripts/test-vsix-contents.mjs`
를 새로 만들어 `vsce ls`(파일 목록, 빠름)와 `vsce package`(실제 크기 tripwire) 둘 다로 확인한다.

**디버깅 과정에서 발견한 함정(다음 세션을 위해 기록)**: 이 세션의 scratchpad 경로
(`/private/tmp/claude-503/-Users-woony6-dev-Impact-Lens/.../scratchpad/wt-gate2-shared-adapter`)에서
`vsce ls`/`vsce package`를 돌리면 **아무 에러 없이 빈 파일 목록**을 낸다 — 처음엔 이걸 내
`.vscodeignore` 수정이 뭔가 잘못됐다는 신호로 오인했다. 직접 격리해 본 결과(`[실행]`): `.vscodeignore`
를 원본으로 되돌려도, `cli/dist`·`cli/node_modules`를 지워도 재현됐고, **짧은 경로(`/tmp/...`)에 새로
clone해서 돌리면 그제서야 정상 동작했다** — vsce(또는 그 내부 glob 라이브러리)가 이 특정 깊고 특이한
문자가 섞인 scratchpad 경로에서 파일 목록을 조용히 빈 배열로 반환하는 것으로 보인다(원인을 vsce
소스까지 추적하지는 않았다 — 재현 조건만 특정했다). **이 저장소의 실제 CI 체크아웃 경로(예:
`/home/runner/work/...`)는 이 문제에 해당하지 않을 것으로 판단한다**(짧고 평범한 경로) — 다만 이후
세션이 로컬 scratchpad에서 vsix 검사가 "통과했다"고 잘못 판단하지 않도록, 이 함정을 스크립트 자신의
주석에도 남기지 않고 여기 작업 문서에만 남긴다(스크립트 자체는 이 경로 문제와 무관하게 정확하다 —
문제는 실행 환경이었지 검사 로직이 아니었다).

**실측(`[실행]`, `/tmp`의 짧은 경로에 신선한 clone, `cli:build` + `compile` 순서로 실행)**:

```
vsce ls: 33 files total, 4 under cli/dist/shared/**/*.js, none forbidden.
vsce package: 1.12MB (< 5MB tripwire).
```

`cli/dist/shared/`(`impactHelpers.js`, `adapters/{fastapiDependencyAdapter,index,types}.js`) 4개
파일 전부 포함, `cli/node_modules`·`cli/src`·`cli/dist/index.js`를 포함한 다른 `cli/dist/**`·
`.d.ts`·`.map` **전부 미포함**을 확인했다. 크기는 1.12MB로 5MB tripwire 대비 여유롭다(현재 vsix에
`typescript-language-server`/`pyright`가 안 섞여 있다는 실측 증거).

**이 검사가 증명하지 않는 것(숨기지 않는다)**: VS Code가 이 vsix를 실제로 로드하고 활성화하는지,
FastAPI-augmented 쿼리가 설치된 확장에서 실제로 동작하는지는 여전히 증명 못 한다 — 이 저장소에
extension-host 실행 harness가 없다. `test:vsix-contents`는 **내용물이 의도대로인가**만 증명한다.

**빌드 순서**: `npm run compile`이 `cli:build`를 먼저 실행하도록 바꿨다(`compile`/`test` 스크립트
둘 다). `unit-tests.yml`의 `unit` job이 `npm test`(root) → `npm run cli:test` 순서였는데,
`npm test`가 이제 내부적으로 `cli:build`를 먼저 하므로 **CI에서도 순서 문제가 생기지 않는다**(직접
확인 필요 — 로컬에서 `rm -rf out cli/dist && npm test`로 처음부터 재확인, `[실행]`). `plugin-
artifact-e2e.yml`에 `test:vsix-contents` 스텝을 3-OS 매트릭스 그대로 추가했다(Windows에서 path
separator 처리가 조용히 깨진 전례가 이 저장소에 있어서 — 이 스크립트는 이미 `path.sep`로
POSIX 정규화하지만, CI에서 직접 확인하지 않고 "될 것 같다"로 넘기지 않는다).

## 결정 — `AdapterInput`에 `idOf` 추가

**결론: `AdapterInput`에 `readonly idOf: (item: CallHierarchyItem) => string`을 추가한다.**
adapter가 심볼 id 체계를 하드코딩하지 않고, 각 host(CLI/Extension)가 자기 것을 넘긴다.

**영향 범위 확인(`[실행]`, `fastapiDependencyAdapter.ts` 안의 `symbolId(` 호출 3곳)**:

1. `endpointFor()`(현재 711행 부근): `const id = symbolId(item);` → `const id = input.idOf(item);`.
2. alias 검증(854행 부근): `verified.items.some(item => symbolId(item) === input.rootId)` →
   `input.idOf`로 교체 — `input.rootId`는 이미 호출자(`impact.ts`)가 넘겨주는 값이라 안 바뀐다.
3. literal-name 검증(886행 부근): 같은 패턴.

**CLI 쪽 호출부**: `cli/src/adapters/index.ts`의 `runAugmentation()`이 `idOf` 파라미터를 새로
받아 `adapter.run({..., idOf, ...})`에 그대로 전달한다. `cli/src/impact.ts`의 유일한 호출부
(`runAugmentation(request.augmentationEnabled ?? false, ..., symbolId(root), provider, ...)`,
96행 부근)가 `symbolId`(함수 자체)를 새 인자로 넘긴다 — CLI는 이미 갖고 있던 함수를 넘기기만
하면 끝이라 동작이 바뀌지 않는다. **CLI 테스트 스위트 전체(현재 402 tests)가 이동 전후 바이트
단위로 동일해야 한다는 증거다.**

이건 **추가만 하는 계약 변경**(새 필수 필드 하나, 기존 필드/동작 변경 없음)이라 서면으로만
보고하고 구현을 이어간다 — 미리 정지하고 대답을 기다릴 만큼 미탐 범위가 갈리는 결정은 아니라고
판단했다(공유 메커니즘 결정과 다른 점: 그건 packaging이 바뀌어 되돌리기 비용이 크고, 이건
adapter 시그니처에 필드 하나 추가라 CLI 테스트 스위트가 그 자리에서 바로 증명한다).

## 결정 — provider 타입 축소

**결론: `AdapterInput.provider`의 타입을 `CallHierarchyProvider` 전체에서
`Pick<CallHierarchyProvider, 'prepare'>`로 좁힌다.** adapter가 실제로 쓰는 멤버는 `prepare` 하나뿐
(`resolveEndpoint()`의 유일한 provider 호출, 3개 call site 전부 재확인)이므로, 타입을 좁히면
"adapter는 순회를 건드리지 않는다"는 계약이 주석이 아니라 타입 검사로 강제된다. CLI 쪽은 이미
`CallHierarchyProvider`(6개 멤버 전부 구현)를 넘기고 있어 구조적 타이핑상 `Pick<...,
'prepare'>`를 그대로 만족한다 — CLI 쪽 변경 없음. Extension shim은 `prepare` 하나만 구현하면
된다(`vscode.prepareCallHierarchy`를 감싸는 것).
