# M2 — gate 1·2 공백 2건 닫기

- 상태: Stage 1(C++) 완료, commander 보고 후 stage 2(Go) 승인 대기
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

## 남은 작업

- **Stage 1 완료. commander에게 보고 후 stage 2(Go)·stage 3(수용 기준 닫기) 승인 대기** —
  commander가 명시("PR은 올리지 말고 stage 1 끝나면 먼저 보고하세요").
- Stage 1의 3-OS CI 실행 결과는 아직 못 봤다 — 이 branch가 push된 뒤 실제 로그로 확인이 필요하다
  (로컬은 darwin/arm64 Apple clangd 17.0.0 하나뿐).
