# M2 — gate 1·2 공백 2건 닫기

- 상태: Stage 1-3 전부 완료(로컬 검증), 3-OS CI 실측 대기 중, commander 보고 후 PR 지시 대기
- branch: `feat/m2-gate-gaps`
- 선행: PR #67(M2 마일스톤 종료 처리 A) merge 완료(squash `4a1de44`) 후 착수.
- 요구사항 전문(계획 세션 작성, 저장소 밖): `m2-gate-gaps.md`(commander scratchpad)
- 이 lane이 끝나면 M2가 실제로 닫힌다 — PR #67이 근거를 요구하는 과정에서 찾은 gate 1·2의 두 공백
  (Go same-file, C++ method/overload/virtual dispatch)을 닫는다.

## 목적과 사용자 가치

두 항목 다 **"문서가 주장하는데 검증이 없는" 상태**였다. C/C++가 먼저다 — `catalog.ts`의 clangd
`docs.limitations`가 사용자에게 "virtual dispatch on a base-class pointer로 호출되는 메서드는 결과에
안 나온다"고 말하는데, 그 근거가 stage 4의 **한 번짜리 수동 probe**였다. 사용자가 이 문장을 읽고
행동하는데, clangd가 바뀌거나 우리가 잘못 봤으면 문서가 조용히 낡고 아무도 모른다.

**이 lane이 끝나면** 그 주장이 CI가 매 push마다 지키는 사실이 된다.

## Stage 1 — C++ method/overload/virtual dispatch (IL-LIM-014 #3)

### 구현

`cli/src/test/clangdIntegration.test.ts`에 기존 구조를 그대로 재사용해 새 `clangdGatedTest` 하나를
추가했다(새 CI job 없음, 기존 `clangd-provider` job에 자연히 포함됨). 실제 compile database를 갖춘
fixture:

- `shapes.h`: `Base`(virtual `target()`, non-virtual `helper()`)와 `Base`를 상속하는
  `Derived`(`target()` override), 전역 함수 `overloaded(int)`/`overloaded(double)`.
- `shapes.cpp`: 위 전부의 정의만(모든 질의 대상이 한 파일에 있어 하나의 `LspCallHierarchyProvider`
  세션을 공유할 수 있다).
- `caller.cpp`: `call_method`(→ `obj.helper()`), `call_overloaded_int`(→ `overloaded(42)`,
  `overloaded(double)`는 아무도 안 부름), `call_via_base_pointer`(→ `Base*`를 통해 `ptr->target()`).
- `compile_commands.json`: `clang++ -std=c++17`로 두 `.cpp` 파일 각각.

**하나의 test() 안에서 하나의 provider 세션을 공유**하며 5개 질의를 순서대로 실행 — "같은 실행"을
문자 그대로 만족시킨다:

1. **method 호출**(`Base::helper()`) — `call_method`가 발견됨을 재시도 루프로 확인. **기능
   증명이자, 이후 negative 단언들의 대조군**(파이프라인이 통째로 죽었다면 여기서 먼저 실패한다).
2. **overload 구분** — `overloaded(int)`(재시도)에는 `call_overloaded_int`가 있고,
   `overloaded(double)`(단발 질의, 이미 위에서 색인이 끝났음이 증명된 뒤라 재시도 불필요)에는
   **없음**을 확인.
3. **virtual dispatch 한계** — `Base::target()`(재시도)에는 `call_via_base_pointer`가 있고,
   `Derived::target()`(단발 질의)에는 **없음**을 확인. **한계를 단언한다** — clangd가 나중에
   derived override까지 찾게 되면 이 assertion이 실패해 `docs.limitations`를 고칠 기회를 준다.

### non-vacuity — 실제로 깨뜨려 확인

commander 지시대로 "파일 존재가 아니라 단언하는 동작을 실제로 깨뜨려" 확인했다. virtual dispatch
질의(3번)에서 base target을 찾는 재시도 질의의 line/column을 **일부러 derived target의 위치(9행
15열)로 바꿔서** 재실행 — 실제로 실패했다:

```
AssertionError: expected call_via_base_pointer among ["Derived::target"]
```

즉 `call_via_base_pointer`는 base 위치를 질의했을 때만 나타나고 derived 위치에서는 정말로 안
나타난다는 것을 직접 확인했다(단순히 항상 빈 배열을 돌려주는 버그가 아니다). 원상복구 후
`shasum -a 256`으로 byte-identical 복원 확인, `git diff`도 빈 결과.

### stage 4 관측과의 대조 — 다르지 않다

`catalog.ts`의 현재 문구: *"A call reached only through virtual dispatch on a base-class pointer or
reference appears under the statically-declared base method's Call Hierarchy result, never under a
derived override's."* 이번 실측 결과(base는 발견, derived는 안 됨)가 **정확히 이 문장과 일치**한다.
commander의 "다르면 즉시 보고" 조건은 발동하지 않았다 — `docs.limitations` 문구를 고칠 필요가 없다.

**측정한 사람/조건**: 이 세션이 darwin/arm64, Apple clangd 17.0.0(Xcode Command Line Tools)로
로컬 측정. 3-OS CI(`clangd-provider` job)에서의 재현은 아직 못 봤다 — push 후 실제 로그로 확인
필요(아래 "남은 작업").

### 검증

- `npm run cli:build` 클린.
- `node --test cli/dist/test/clangdIntegration.test.js` 격리 실행 3/3 pass(신규 테스트 포함).
- `npm run cli:test` 전체 3회 연속 재실행 — 328/330 pass, 2 skip(로컬에 gopls 없음, 기존과 동일)
  매번 동일 — 신규 테스트가 재시도 루프를 포함하므로 full-suite 부하에서도 안정적인지 특히 확인했다.
- non-vacuity: 위 "실제로 깨뜨려 확인" 참고.
- `docs.limitations`와 관측 대조: 위 참고, 일치.

## Stage 2 — Go same-file 호출자 (IL-LIM-004 #2)

### 구현

`cli/src/test/stateReachability.integration.test.ts`에 `goplsGatedTest` 하나를 추가했다(새 CI job
없음, 기존 `go-provider` job에 자연히 포함). **shipped preset fixture(`catalog.ts`의
`target.go`/`caller.go`)는 건드리지 않았다** — commander 지시대로 별도 workspace
(`realGoGateGapsWorkspace`)를 새로 만들었다:

- `go.mod`(`module gategaps`), `samefile.go`(`SameFileTarget`/`SameFileCaller`, 같은 파일),
  `crosstarget.go`/`crosscaller.go`(cross-file, 기존 shipped fixture와 별개 이름).
- 하나의 provider 세션에서 same-file 질의 → cross-file 질의 순서로 실행(**같은 실행**) — 서로가
  서로의 대조군: 파이프라인이 통째로 죽으면(module 해석 실패, provider crash) 둘 다 같이
  실패하므로, 어느 한쪽만 통과하는 상태를 잡는다.
- gopls는 이미 `readiness`를 선언하므로(clangd와 달리) 재시도 루프 없이 단발 질의로 충분하다 — 같은
  파일의 기존 "the real shipped gopls preset..." 테스트와 같은 패턴.

### non-vacuity — 실제로 깨뜨려 확인

same-file 질의의 `file`을 일부러 `crosstarget.go`(다른 파일)로 바꿔 재실행 — 실제로 실패했다:

```
AssertionError: expected SameFileCaller ... among ["CrossFileTarget","CrossFileCaller"]
```

즉 same-file 질의가 실제로 그 파일 안 호출자를 찾는 것이지, 아무 값이나 통과시키는 게 아님을 직접
확인했다. 원상복구 후 `shasum -a 256`으로 byte-identical 복원 확인.

### 로컬 실측 — 실제 gopls 0.19.1(CI가 pin한 버전과 동일)로 검증

이 개발 머신에 로컬로 `go install golang.org/x/tools/gopls@v0.19.1`(CI가 pin한 버전과 동일 —
`.github/workflows/unit-tests.yml`)을 설치해 **실제로 돌려서** 확인했다(전에는 로컬에 gopls가 없어
skip됐었다). same-file·cross-file 둘 다 발견됨을 확인.

### 검증

- `npm run cli:build` 클린.
- `node --test cli/dist/test/stateReachability.integration.test.js` 격리 실행 7/7 pass(신규 포함).
- non-vacuity: 위 참고.
- `npm run cli:test` 전체 3회 연속 재실행 — **이번엔 로컬에 gopls·clangd 둘 다 있어 331/331
  pass, 0 skip**(기존엔 gopls 없어 2 skip이었다).

## Stage 3 — 수용 기준·gate 닫기

`il-lim-004-first-class-language-presets.md` #2, `il-lim-014-c-cpp-clangd-support.md` #3을 이
lane이 만든 근거로 스스로 체크했다(각 문서 자체에 근거). `m2-p1-language-support.md`의 gate 1·2와
`상태`를 갱신했다 — 다른 gate는 건드리지 않았다.

**중요한 caveat을 문서에 남겼다**: C++ 쪽(virtual dispatch) 실측은 이 시점까지 **darwin/arm64
(Apple clangd 17.0.0) 하나뿐**이다. commander가 지적한 이 lane의 진짜 위험 — CI는 Ubuntu
23.1.1/macOS 23.1.0/Windows 22.1.7로 도는데 major가 다르고, virtual dispatch 처리는 clangd
버전에 따라 달라질 수 있는 종류의 동작이다. 3-OS CI 결과를 아직 못 봤으므로 각 문서에 "push 후
CI 로그로 재확인 필요"를 명시해 뒀다 — CI 확인 후 이 절을 갱신한다.

## 남은 작업

- **Stage 1-3 로컬 완료. 3-OS CI 실측을 이 branch에서 `workflow_dispatch`로 직접 트리거해 확인한
  뒤 commander에게 보고한다** — PR은 아직 올리지 않는다(commander가 stage 2·3 완료 후 PR을
  지시하겠다고 명시).
- **CI 결과에 따라 갈리는 다음 행동**: Linux·macOS·Windows 전부 로컬과 같은 결과(base는 발견,
  derived는 안 됨; overload 정확히 구분)면 caveat을 제거하고 보고한다. **어느 OS에서든 다르면
  (특히 Ubuntu/macOS의 clangd 23.x가 derived override를 찾아버리면) 테스트를 느슨하게 고치지 않고
  즉시 보고한다** — 그 경우 shipped `docs.limitations`가 최신 clangd에서 틀렸다는 뜻이고, 수정
  범위가 이 lane을 넘는다(commander 지시).
