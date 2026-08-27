# W0-4 — Provider 선택 로직 seam 추출

- 작성일: 2026-08-27
- lane: `il-provider-platform` / M1 Wave 0 W0-4
- branch: `refactor/m1-provider-seam` (기준 `origin/main` `4e998a8`)
- 상위 계획: [`task-m1-agent-team-execution.md`](task-m1-agent-team-execution.md) "단계별 구현 계획" Wave 0
- 인계 문서: [`task-m1-wave0-handover.md`](task-m1-wave0-handover.md)
- 무변경 증명 방법 출처: [`task-m1-contract-types.md`](task-m1-contract-types.md) "응답 무변경 증명 방법 확정"

## 1. 배경과 해결할 문제

Wave 1은 `il-lsp-protocol`(`lspProvider.ts`, `jsonRpc.ts`)과 `il-provider-platform`(`providers/`,
`doctor/`, `runtime.ts`)을 병렬로 진행한다. 그런데 지금 provider 선택 로직은 `lspProvider.ts`
안에 있다. `LspCallHierarchyProvider` 생성자 세 줄과 모듈 하단 helper 세 개가 그것이다.

이 상태로 Wave 1을 시작하면 두 lane이 같은 파일을 동시에 수정한다. 운영 규칙("한 wave 안에서 두
에이전트가 같은 파일을 수정하지 않는다")과 정면으로 충돌하고, W1-B의 preset catalog는 선택 로직이
있는 파일을 통째로 재작성해야 한다.

W0-4는 **동작을 하나도 바꾸지 않고** 선택 로직을 `cli/src/providers/resolve.ts`로 옮겨 파일 경계를
만든다. 함께, `cli/src/coverage.ts`의 하드코딩 상수 3개를 W1-C가 실측값으로 바꿀 수 있도록 인자로
파라미터화한다. 기본값은 현재 값과 동일하다.

## 2. 범위

### 포함

1. `cli/src/providers/resolve.ts` 신설. 아래를 순수 이동한다.
   - `LspCallHierarchyProvider` 생성자의 선택 3줄: `selectedBy` 결정, `defaultTypeScriptServerCommand()`
     호출, `requestedLanguageId`/`languageMatch` 결정과 `provider_language_mismatch` 판정.
   - 모듈 하단의 `defaultTypeScriptServerCommand()`, `languageId()`, `isTypeScriptFamily()`.
2. `cli/src/coverage.ts`의 상수 3개(`semantic.status: 'static-only'`,
   `semantic.evidenceSources: ['lsp-call-hierarchy']`, `indexing.status: 'unknown'`)를 기본값이 동일한
   optional 인자로 바꾼다.
3. 새 모듈이 npm tarball에 포함되도록 `cli/package.json`의 `files`를 조정한다(3절 참조).

### 제외

- preset catalog, PATH discovery, Auto 선택, version probe — W1-B.
- `doctor` 일반화와 check 단위 `pass/warn/fail` — W1-B.
- 스키마 변경, `data.completion` 생산 — W1-C.
- 비-TS 언어로의 fallback 허용 — M1의 어느 lane도 하지 않는다.
- `cli/src/jsonRpc.ts` 수정 — W1-A 소유 파일이다.
- **새 동작을 하나도 넣지 않는다.** 이 lane의 산출물은 파일 경계와 함수 시그니처뿐이다.

## 3. 현재 구현 조사 결과

### 이동 대상의 정확한 모양

`cli/src/lspProvider.ts`의 `LspCallHierarchyProvider` 생성자(현재 `main` 기준 62~91행 부근):

```ts
const detectedLanguageId = languageId(file);
const selectedBy = command ? 'custom' : 'bundled';
const actual = command ?? defaultTypeScriptServerCommand(detectedLanguageId);
const requestedLanguageId = actual.languageId ?? detectedLanguageId;
const languageMatch = detectedLanguageId === 'plaintext'
  ? 'unknown'
  : requestedLanguageId === detectedLanguageId;
if (languageMatch === false) { throw new CliError('provider_language_mismatch', ...); }
```

생성자는 이 값들로 `this._capabilities`를 갱신하고, `this.languageIdOverride = requestedLanguageId`를
세우고, `new JsonRpcClient(actual.command, actual.args ?? [], timeoutMs)`를 만든다.

즉 선택 로직이 만들어내는 것은 정확히 5개다: `command`(실행할 것), `selectedBy`,
`requestedLanguageId`, `detectedLanguageId`, `languageMatch`. 이것이 그대로 `ResolvedProvider`가 된다.

### 지시와 다르게 판단한 지점 (반박 1건)

지시는 "이동 대상: … `languageId()`"라고 적었다. `languageId()`는 `lspProvider.ts`에서 `export`돼
있으나 **저장소 전체에서 외부 소비자가 없다**(`grep`으로 확인: `cli/src/*.ts`, `cli/src/test/*.ts`
어디에서도 import하지 않는다). 다만 `lspProvider.ts` 내부의 `open()`이
`this.languageIdOverride ?? languageId(file)`로 여전히 호출한다.

따라서 `languageId()`는 `providers/resolve.ts`로 옮기되, `lspProvider.ts`는 그것을 import해서
`open()`에서 계속 쓴다. `lspProvider.ts`에서 `languageId`를 **re-export하지는 않는다**. 외부 소비자가
없으므로 re-export는 죽은 export를 하나 더 만들 뿐이고, W1-A/W1-B의 파일 경계를 흐린다.

`isTypeScriptFamily()`도 `defaultTypeScriptServerCommand()` 전용 private helper이므로 함께 옮기고
export하지 않는다.

### 계획에 없었으나 반드시 필요한 변경 (반박 2건)

`cli/package.json`의 `files`가 `["dist/*.js", "README.md", "schemas/**"]`다. npm의 `files` glob에서
`dist/*.js`는 **한 단계만 매칭한다**. 그래서 `dist/test/*.js`가 tarball에서 빠지는 것이고, 같은 이유로
새로 만드는 `dist/providers/resolve.js`도 **tarball에서 빠진다**.

이 상태로 publish하면 tarball에서 설치한 CLI가 `require('./providers/resolve')`에서
`MODULE_NOT_FOUND`로 죽는다. `npm run cli:test`와 `npm test`는 checkout의 `dist`를 그대로 쓰므로
**이 회귀를 잡지 못한다**. `npm run test:plugin-artifact`만 잡는다.

지시의 "범위"에는 `cli/package.json`이 없지만, 이것을 빼면 "동작 무변경"이라는 완료 조건 자체가
깨진다. 따라서 `files`에 `"dist/providers/*.js"`를 추가한다. `"dist/**/*.js"`로 넓히지 않는 이유는
그러면 `dist/test/*.js`까지 tarball에 들어가 아티팩트 내용이 실제로 바뀌기 때문이다. 디렉터리를
명시적으로 나열하면 tarball에 들어가는 파일 집합의 변화가 이 리팩터링이 추가한 파일 하나뿐이 된다.

### coverage 상수의 소비자

`coverageForTraversal()`의 호출부는 `cli/src/impact.ts` 한 곳뿐이고 테스트는
`cli/src/test/coverage.test.ts`다. 인자를 optional로 추가하면 두 호출부 모두 수정이 필요 없다.

### 무변경 증명이 어려운 지점

인계 문서 8절이 경고한 함정: `mkdtemp`로 workspace를 만들면 `symbolId`가 파일 URI를 해싱하고 note
conflict token이 workspace 경로를 담기 때문에 **코드를 한 줄도 안 바꿔도 캡처 diff가 난다.** 고정
workspace 경로를 쓴다.

## 4. 단계별 구현 계획

각 단계는 독립적으로 검증·commit·push 가능하다.

### 1단계 — 작업 문서와 무변경 기준선

- 이 문서를 만든다.
- 고정 workspace 기반 캡처 스크립트를 만들고, **코드를 바꾸지 않은 채 두 번 캡처해 diff가 비는 것을
  먼저 확인한다.** 이것이 확인되지 않으면 이후 어떤 비교도 의미가 없다.
- 기준선 캡처, `npm run cli:build`, `npm run cli:test`, `npm test`, `npm run test:plugin-artifact`
  결과를 기록한다.

### 2단계 — `cli/src/providers/resolve.ts` 신설과 순수 이동

- `resolveProvider()`와 `languageId()`를 새 모듈로 옮긴다.
- `lspProvider.ts` 생성자를 `resolveProvider()` 호출 한 줄로 바꾼다.
- `cli/package.json`의 `files`에 `dist/providers/*.js`를 추가한다.
- 검증: build, `cli:test`, `test`, 캡처 diff 0, `test:plugin-artifact`.

### 3단계 — `coverage.ts` 파라미터화

- `coverageForTraversal()`에 semantic/indexing 인자를 optional로 추가한다. 기본값은 현재 값과 동일.
- 기본값이 현재 출력과 같음을 단위 테스트로 고정한다.
- 검증: build, `cli:test`, `test`, 캡처 diff 0.

## 5. 테스트 및 완료 기준

"테스트 통과"가 아니라 "무변경 증명"이 완료 기준이다.

- [ ] `npm run cli:build` 통과
- [ ] `npm run cli:test` 통과 (기준선과 동일한 pass 수)
- [ ] `npm test` 통과 (기준선과 동일한 pass 수)
- [ ] 고정 workspace 캡처 시나리오 전부가 변경 전후 **byte 단위 동일**. 휘발성 필드만 정규화한다.
      성공 경로와 실패 경로를 모두 포함하고, bundled/custom 양쪽을 포함한다.
- [ ] `npm run test:plugin-artifact` 결과가 변경 전후 동일 (네트워크 필요. 실행 못 하면 성공으로
      간주하지 않고 사유를 로그에 남긴다)
- [ ] `main`에서 어떤 파일도 변경하지 않았다

### 캡처 시나리오

실제로 캡처한 29개 시나리오와 관측 결과는 아래 작업 로그의 1단계 표에 있다. 재현 명령과 스크립트
전문은 부록 A에 있다.

## 작업 로그

### 2026-08-27 — 1단계: 무변경 기준선 확보

**변경한 파일**: 이 문서만. 코드는 아직 바꾸지 않았다.

**기준선 (`origin/main` `4e998a8`, 코드 무변경 상태)**

| 검증 | 결과 |
| --- | --- |
| `npm run cli:build` | 통과 |
| `npm run cli:test` | tests 60 / pass 60 / fail 0 |
| `npm test` | tests 35 / pass 35 / fail 0 |
| `npm run test:plugin-artifact` | exit 0, `Plugin artifact E2E passed: clean install and Codex/Claude TS/TSX/JS/JSX release fallback.` |
| 고정 캡처 | 29 시나리오 |

**캡처 결정성 먼저 확인**: 코드를 한 줄도 바꾸지 않은 채 캡처를 **두 번** 떠서
(`base1`, `base2`) `diff -r`이 빈 것을 확인했다. 인계 문서 8절의 `mkdtemp` 함정을 피하기 위해
workspace를 `$TMPDIR/il-provider-seam-capture-fixed`로 고정하고 매 실행 전에 삭제·재생성한다.
이 확인이 없으면 이후 어떤 "diff 0" 주장도 근거가 없다.

**캡처한 29 시나리오와 관측된 결과** (계획의 표를 실제 실행 결과로 갱신한다)

| id | 경로 | exit | 관측 |
| --- | --- | --- | --- |
| `ok-ts` | bundled | 0 | 성공, nodes 7, `reachedDepth: 3`, `traversal.status: complete` |
| `ok-tsx` | bundled | 0 | 성공 |
| `ok-js` | bundled | 0 | 성공 |
| `ok-jsx` | bundled | 0 | 성공 |
| `ok-mts` | bundled | 0 | 성공 (`.mts` → `typescript`) |
| `ok-depth-limited` | bundled | 0 | `depth: 1`, `traversal.status: depth-limited` |
| `ok-node-limited` | bundled | 0 | `maxNodes: 2`, `traversal.status: node-limited` |
| `ok-include-source` | bundled | 0 | `includeSource: body` |
| `ok-no-callers` | bundled | 0 | caller 0건(node 1, edge 0) |
| `err-language-mismatch` | custom | 5 | `provider_language_mismatch` |
| `err-required-for-language-py` | bundled | 5 | `provider_required_for_language` (python) |
| `err-required-for-language-txt` | bundled | 5 | `provider_required_for_language` (plaintext) |
| `plaintext-unknown-match` | custom | 5 | `.txt` + `languageId: typescript` → mismatch를 통과하고 `provider_capability_missing`까지 감 |
| `err-launch-failed` | custom | 5 | `provider_launch_failed` |
| `err-initialize-silent` | custom | 5 | `provider_initialize_failed`, `runner.source: release-fallback` |
| `err-initialize-logged` | custom | 5 | `provider_initialize_failed` + `providerLog` |
| `err-initialize-exiting` | custom | 5 | `provider_initialize_failed` + redaction된 `stderr` |
| `err-capability-missing` | custom | 5 | `provider_capability_missing` |
| `err-query-failed` | custom | 5 | `provider_query_failed` |
| `err-target-not-found` | custom | 3 | `target_not_found` (선택·initialize 통과 증명) |
| `custom-no-language-id` | custom | 5 | `provider.languageId` 미지정 → detected로 fallback |
| `err-bad-position` | bundled | 3 | `target_not_found` |
| `doctor-preflight` | bundled | 0 | `mode: preflight`, check 3건 |
| `doctor-smoke` | bundled | 0 | `mode: smoke`, check 4건 |
| `err-invalid-command` | — | 2 | `invalid_command` |
| `err-unknown-option` | — | 2 | `invalid_request` |
| `note-set` | — | 4 | `expected_token_required` (충돌 경로) |
| `note-get` | — | 0 | 성공 |
| `note-list` | — | 0 | 성공 |

성공 9 / 실패 18 / 기타 2. bundled 경로와 custom 경로를 모두 포함하고, 선택 로직이 만들어내는 5개 값
(`command`, `selectedBy`, `requestedLanguageId`, `detectedLanguageId`, `languageMatch`)의 모든 분기를
지난다. `languageMatch`의 세 값(`true`, `false`, `'unknown'`)이 각각 `ok-ts`,
`err-language-mismatch`, `plaintext-unknown-match`로 덮인다.

**정규화하는 것**: `totalMs`, `msSinceSpawn`, `analyzedAt`, `updatedAt`, `conflictToken`, `token`,
`conflictTokens` 값과, 텍스트에 나타나는 workspace 경로 · 저장소 경로 · node 실행 파일 경로 ·
node 버전 문자열. 그 외(`rootId`, node id, `provider.*`, `coverage.*`, `limitations`,
`error.code`/`message`/`details`, exit code, stdout 줄 수)는 전부 원문 그대로 비교한다.

**stdout 불변식도 함께 캡처한다**: 각 캡처 파일 머리에 `stdoutLines`를 적는다. 성공 응답의 stdout이
정확히 한 줄이고 실패 시 stdout이 비어 있다는 계약이 리팩터링으로 깨지면 diff에 나타난다.

## 부록 A — 재현용 캡처 스크립트

이 스크립트는 **저장소에 커밋하지 않는다.** `cli/` 빌드 산출물과 테스트 fixture 경로에만 의존하는
일회성 검증 도구이고, 저장소에 두면 Wave 1의 세 lane이 각자 유지보수해야 하는 파일이 하나 늘기
때문이다. 대신 전문을 여기에 남겨 누구든 그대로 재현할 수 있게 한다.

**실행 방법**

```sh
# 저장소 루트에서
npm install && npm --prefix cli install
npm run cli:build

# 변경 전 기준선 두 벌을 떠서 캡처 자체가 결정적인지 먼저 확인한다
node /tmp/il-capture.mjs . /tmp/il-capture-base1
node /tmp/il-capture.mjs . /tmp/il-capture-base2
diff -r /tmp/il-capture-base1 /tmp/il-capture-base2   # 비어야 한다

# 코드 변경 후
npm run cli:build
node /tmp/il-capture.mjs . /tmp/il-capture-after
diff -r /tmp/il-capture-base1 /tmp/il-capture-after   # 비어야 한다
```

**`/tmp/il-capture.mjs` 전문**

```js
// W0-4 무변경 증명 캡처 스크립트.
// 사용법: node capture.mjs <repoRoot> <outDir>
// workspace 경로를 고정한다. mkdtemp를 쓰면 symbolId(파일 URI 해시)와 note conflictToken이 매번 달라져
// 코드를 바꾸지 않아도 diff가 난다.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const repoRoot = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
const cli = path.join(repoRoot, 'cli', 'dist', 'index.js');
const fixtures = path.join(repoRoot, 'cli', 'dist', 'test', 'fixtures');
const ws = path.join(os.tmpdir(), 'il-provider-seam-capture-fixed');

fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, 'src'), { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const w = (rel, text) => fs.writeFileSync(path.join(ws, rel), text);

w('tsconfig.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2022', module: 'commonjs', lib: ['ES2022'], allowJs: true,
    checkJs: false, jsx: 'react', strict: true, noEmit: true, moduleResolution: 'node',
  },
  include: ['src/**/*'],
}, null, 2) + '\n');

w('src/leaf.ts', `export function leafTarget(value: number): number {
  return value * 2;
}
`);
w('src/mid.ts', `import { leafTarget } from './leaf';

export function midOne(value: number): number {
  return leafTarget(value) + 1;
}

export function midTwo(value: number): number {
  return leafTarget(value) + 2;
}

export function midThree(value: number): number {
  return leafTarget(value) + 3;
}
`);
w('src/top.ts', `import { midOne, midTwo, midThree } from './mid';

export function topOne(value: number): number {
  return midOne(value);
}

export function topTwo(value: number): number {
  return midTwo(value) + midThree(value);
}
`);
w('src/root.ts', `import { topOne, topTwo } from './top';

export function rootEntry(value: number): number {
  return topOne(value) + topTwo(value);
}
`);
w('src/widget.tsx', `export function tsxTarget(label: string): string {
  return label.trim();
}

export function TsxCaller(): string {
  return tsxTarget('hello');
}
`);
w('src/plain.js', `export function jsTarget(value) {
  return value + 1;
}

export function jsCaller(value) {
  return jsTarget(value);
}
`);
w('src/plain.jsx', `export function jsxTarget(value) {
  return value + 1;
}

export function JsxCaller(value) {
  return jsxTarget(value);
}
`);
w('src/module.mts', `export function mtsTarget(value: number): number {
  return value + 1;
}

export function mtsCaller(value: number): number {
  return mtsTarget(value);
}
`);
w('src/notes.txt', 'plain text, not a language the bundled provider supports\n');

const scenarios = [];
const analyze = (id, body, extraEnv) => scenarios.push({
  id, args: ['analyze', '--stdin'], input: JSON.stringify({ workspace: ws, ...body }), env: extraEnv,
});
const fixture = name => path.join(fixtures, name + '.js');
const custom = (name, languageId) => ({
  command: process.execPath,
  args: [fixture(name)],
  ...(languageId ? { languageId } : {}),
});

// --- 성공 경로 (bundled) ---
analyze('ok-ts', { file: 'src/leaf.ts', line: 1, column: 17 });
analyze('ok-tsx', { file: 'src/widget.tsx', line: 1, column: 17 });
analyze('ok-js', { file: 'src/plain.js', line: 1, column: 17 });
analyze('ok-jsx', { file: 'src/plain.jsx', line: 1, column: 17 });
analyze('ok-mts', { file: 'src/module.mts', line: 1, column: 17 });
analyze('ok-depth-limited', { file: 'src/leaf.ts', line: 1, column: 17, depth: 1 });
analyze('ok-node-limited', { file: 'src/leaf.ts', line: 1, column: 17, maxNodes: 2 });
analyze('ok-include-source', { file: 'src/leaf.ts', line: 1, column: 17, includeSource: 'body' });
analyze('ok-no-callers', { file: 'src/root.ts', line: 3, column: 17 });

// --- 실패 경로 ---
analyze('err-language-mismatch', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: { command: process.execPath, languageId: 'python' },
});
analyze('err-required-for-language-py', { file: 'not-created.py', line: 1, column: 1 });
analyze('err-required-for-language-txt', { file: 'src/notes.txt', line: 1, column: 1 });
// .txt + custom languageId -> languageMatch === 'unknown' 경로를 통과한 뒤 capability에서 실패한다.
analyze('plaintext-unknown-match', {
  file: 'src/notes.txt', line: 1, column: 1, provider: custom('noCapabilityServer', 'typescript'),
});
analyze('err-launch-failed', {
  file: 'src/leaf.ts', line: 1, column: 17,
  provider: { command: '/definitely/missing/impact-lens-language-server', args: ['--stdio'] },
});
analyze('err-initialize-silent', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('silentExitServer', 'typescript'),
}, { IMPACT_LENS_RUNNER_SOURCE: 'release-fallback' });
analyze('err-initialize-logged', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('loggingExitServer', 'typescript'),
});
analyze('err-initialize-exiting', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('exitingServer', 'typescript'),
});
analyze('err-capability-missing', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('noCapabilityServer', 'typescript'),
});
analyze('err-query-failed', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('queryExitServer', 'typescript'),
});
analyze('err-target-not-found', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('parentWatchdogServer', 'typescript'),
});
// provider.languageId 미지정: requestedLanguageId가 detected로 fallback한다.
analyze('custom-no-language-id', {
  file: 'src/leaf.ts', line: 1, column: 17, provider: custom('noCapabilityServer'),
});
analyze('err-bad-position', { file: 'src/leaf.ts', line: 9999, column: 1 });

// --- doctor / CLI 표면 ---
scenarios.push({ id: 'doctor-preflight', args: ['doctor', 'bundled-typescript'] });
scenarios.push({ id: 'doctor-smoke', args: ['doctor', 'bundled-typescript', '--smoke'] });
scenarios.push({ id: 'err-invalid-command', args: [] });
scenarios.push({ id: 'err-unknown-option', args: ['analyze', '--widht', '10'] });

// --- note 경로 ---
scenarios.push({
  id: 'note-set',
  args: ['note', 'set', '--stdin'],
  input: JSON.stringify({
    workspace: ws,
    target: { file: 'src/leaf.ts', position: { line: 1, column: 17 } },
    scope: 'shared', text: 'seam capture note', apply: true,
  }),
});
scenarios.push({
  id: 'note-get',
  args: ['note', 'get', '--stdin'],
  input: JSON.stringify({
    workspace: ws,
    target: { file: 'src/leaf.ts', position: { line: 1, column: 17 } },
  }),
});
scenarios.push({
  id: 'note-list',
  args: ['note', 'list', '--stdin'],
  input: JSON.stringify({ workspace: ws, scope: 'shared' }),
});

const VOLATILE = new Set([
  'totalMs', 'msSinceSpawn', 'analyzedAt', 'updatedAt', 'conflictToken', 'token', 'conflictTokens',
]);

function normalize(value, key) {
  if (Array.isArray(value)) {
    return value.map(entry => normalize(entry, key));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = VOLATILE.has(k) ? `<${k}>` : normalize(v, k);
    }
    return out;
  }
  return value;
}

function scrubText(text) {
  return text
    .split(ws).join('<WORKSPACE>')
    .split(repoRoot).join('<REPO>')
    .split(process.execPath).join('<NODE>')
    .split(process.versions.node).join('<NODE_VERSION>');
}

function render(text) {
  const trimmed = text.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    return JSON.stringify(normalize(JSON.parse(trimmed)), null, 2);
  } catch {
    return trimmed;
  }
}

for (const scenario of scenarios) {
  const result = spawnSync(process.execPath, [cli, ...scenario.args], {
    encoding: 'utf8',
    cwd: ws,
    input: scenario.input,
    timeout: 60000,
    env: { ...process.env, ...(scenario.env ?? {}) },
  });
  const body = [
    `# ${scenario.id}`,
    `status=${result.status}`,
    `signal=${result.signal ?? 'null'}`,
    `stdoutLines=${result.stdout === '' ? 0 : result.stdout.trimEnd().split('\n').length}`,
    '--- stdout ---',
    scrubText(render(result.stdout)),
    '--- stderr ---',
    scrubText(render(result.stderr)),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, `${scenario.id}.txt`), body);
  process.stderr.write(`${scenario.id}: status=${result.status}\n`);
}

process.stderr.write(`captured ${scenarios.length} scenarios into ${outDir}\n`);
```
