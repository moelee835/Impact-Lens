# M2 — gate 1·2 공백 2건 닫기

- 상태: 정정된 `docs.limitations`/테스트는 3-OS CI로 확인됨(`clangd-provider` 3개 전부 통과) →
  같은 재실행에서 stray clangd 사전 결함 발견 → commander 결정(세 조건 게이트) 수신, 구현·로컬
  검증 완료 → 이 게이트 수정판의 3-OS CI 재확인 대기
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

## 3-OS CI 실측 결과 — commander가 예측한 그 일이 실제로 일어났다

`workflow_dispatch`로 이 branch를 직접 3-OS CI에 돌렸다(`https://github.com/moelee835/Impact-Lens/
actions/runs/33713131515`, PR 없이 직접 트리거). **`clangd-provider` job 3개 전부 실패했다** — 정확히
같은 이유로, 정확히 같은 assertion에서:

| OS | clangd 버전 | 실패 지점 | 실제 반환값 |
| --- | --- | --- | --- |
| ubuntu-latest | 23.1.1 | `Derived::target`가 호출자 없어야 함 | `["Derived::target","call_via_base_pointer"]` |
| macos-latest | 23.1.0 | 동일 | 동일 |
| windows-latest | 22.1.7 | 동일 | 동일 |

**세 OS·세 major(22, 23) 전부 완전히 같은 결과**: `Base::target`(assertion 3a)는 여전히
`call_via_base_pointer`를 찾는다(이 assertion이 먼저 통과했기 때문에 코드가 3b까지 도달했다) — 그런데
**이제 `Derived::target`(assertion 3b)도 같은 caller를 찾는다.** darwin/arm64의 Apple clangd
17.0.0에서는 `Derived::target`이 비어 있었다(로컬 실측, 이 문서 앞부분).

**method 호출(assertion 1)과 overload 구분(assertion 2)은 세 OS 전부 문제없이 통과했다** —
`not ok 20`의 실패가 정확히 마지막 assertion(3b) 하나뿐이라는 것은, 그 앞의 1·2a·2b·3a 네 assertion이
전부 예외 없이 끝났다는 뜻이다(순차 실행 코드이므로 앞에서 실패했다면 에러가 그쪽에서 났을 것이다).

**이것은 테스트 결함이 아니라 발견이다(commander가 미리 정확히 예측한 그대로)**: clangd가 major
17→22/23 사이에 **virtual dispatch 정적 해석을 개선**해서, 이제 base-class pointer를 통한 호출이
base 메서드뿐 아니라 **derived override의 Call Hierarchy 결과에도** 나타난다. 즉
`catalog.ts`의 clangd `docs.limitations` 현재 문구 — *"appears under the statically-declared base
method's Call Hierarchy result, **never** under a derived override's"* — 는 **17.0.0에서는 참이었고
22.x/23.x에서는 더 이상 참이 아니다.**

**이 lane이 스스로 고치지 않는다.** commander 지시: "실패하면 테스트를 느슨하게 고치지 말고 즉시
보고하세요... 문서 수정 범위가 이 lane을 넘습니다." 코드·문서를 건드리지 않고 이 사실만 정확히
기록하고 보고한다. **IL-LIM-014 #3와 마일스톤 gate 1·2의 체크 상태는 이 발견이 반영되기 전까지
잠정 상태다** — 이미 커밋했지만(로컬 실측만으로), 이 발견 때문에 재검토가 필요하다.

## commander 결정 — 둘 다 고친다 (1과 2를 함께, 3은 기각)

commander가 셋 중 하나를 고르지 않고 **1(문구 정정)과 2(버전 인지 단언) 둘 다**를 지시했다 — "단언을
빼는" 쪽도 "CI 버전만 단언"하는 쪽도 기각(각각 이 lane이 만들려던 회귀 감시가 사라지는 것, 로컬
개발자의 Apple clangd 17이 깨지고 `supported.minimum: '17.0.0'` 주장이 비는 것을 근거로).

### `docs.limitations` 정정 (`cli/src/providers/catalog.ts`)

`never`를 지웠다. 정정된 문구: base 메서드에는 **항상** 붙고(17/22/23 전부 불변), derived override에는
**버전에 따라** 다르다 — 17.0.0은 없음, 22.1.7/23.1.0/23.1.1은 있음, **18-21은 미측정이라 경계를
추측하지 않는다**(commander 지시 그대로 — `supported.minimum`이 하한을 추측하지 않는 것과 같은 규칙).
`lastVerified` 주석에도 이 버전별 차이가 `lastVerified.versions`를 범위가 아니라 정확한 값 목록으로
적어 온 이유임을 추가했다. `supported.minimum: '17.0.0'`은 그대로 뒀다 — 17에서 Call Hierarchy 자체는
동작하고, 이건 한계의 범위가 버전마다 다른 것이지 지원 여부가 아니다(commander 지시).

### 단언을 버전 인지로 (`cli/src/test/clangdIntegration.test.ts`)

`detectClangdMajorVersion()` 추가 — `execFileSync`(no shell)로 실제 설치된 clangd의 `--version`을
읽고 기존 `parseVersion()`(`providers/discovery.ts`, 이미 있는 유틸 재사용)으로 major를 뽑는다.

- **불변인 것은 무조건 단언**: method 호출, overload 구분, **base 메서드 attribution**(assertion
  1·2·3a) — 셋 다 버전 분기 없이 그대로.
- **derived는 버전별로 분기**: `clangdMajor === 17`이면 없음을, `22`/`23`이면 있음을 단언. **그 외
  값(18-21 포함)은 `assert.fail`로 명시적으로 실패**시킨다 — "이 버전은 관측된 적 없다"는 메시지와
  함께, 조용히 한쪽으로 처리하지 않는다.
- 테스트 이름도 "invisibility are all correct"(보편적 주장처럼 읽힘)에서 "attribution are all
  correct for this clangd version"으로 바꿨다.

**non-vacuity — 이번에도 실제로 깨뜨려 확인**: `clangdMajor`를 임시로 `99`(관측된 적 없는 값)로
바꿔 재실행 → 정확히 의도한 메시지로 실패 확인(`clangd major version 99 has never been observed...`)
→ 원상복구, byte-identical 확인.

### 재판정

`il-lim-014-c-cpp-clangd-support.md`의 #3(재확인)과 #4(재판정 — commander 지시대로, 정정 전 문구로
체크됐던 근거가 이제 틀렸으므로)를 갱신했다. 마일스톤 gate 1·2도 이 발견과 정정을 반영해 갱신했다.
**"3-OS CI로 확인됨"이라고 먼저 쓰려다 스스로 잡았다** — 아직 정정된 형태로 CI를 다시 안 돌렸는데
확인됐다고 쓸 뻔했다. 문구를 "재실행 결과는 push 후 확인 대기 중"으로 고쳤다.

### 검증

- `npm run cli:build` 클린.
- `node --test cli/dist/test/clangdIntegration.test.js` 격리 3/3 pass(darwin, Apple clangd 17.0.0 —
  17 분기로 통과).
- non-vacuity: 위 참고(derived assertion 위치 변경 + 미관측 버전 강제 둘 다 실제로 깨서 확인).
- `npm run cli:test` 전체 3회 연속 331/331(0 skip, 로컬에 gopls·clangd 둘 다 있음).
- `npm run test:response-policy` 27/27(회귀 없음).

## 재실행 결과 — `clangd-provider`는 전부 통과, 그런데 다른 job에서 새 문제가 나왔다

`workflow_dispatch`로 재실행(`https://github.com/moelee835/Impact-Lens/actions/runs/33714214413`).
**`clangd-provider` job 3개(ubuntu 23.1.1/macos 23.1.0/windows 22.1.7) 전부 통과** — 정정이 의도대로
동작한다.

**그런데 `go-provider`(macOS·Windows)와 `cli-tests-cross-os`(macOS·Windows)가 새로 실패했다** —
**같은 새 테스트, 다른 원인**:

```
cli:test / windows-latest: clangd major version 20 has never been observed...
gopls / windows-latest:    clangd major version 20 has never been observed...
gopls / macos-latest:      clangd major version 21 has never been observed...
cli:test / macos-latest:   clangd major version 21 has never been observed...
```

**원인**: `clangdGatedTest`는 원래부터(이 lane 이전, stage 5 설계 그대로) **어떤 job인지와 무관하게
clangd가 PATH에 있으면 그 job의 `npm run cli:test`가 clangd 테스트 전부를 실행**한다 — job 이름과
무관하다. GitHub Actions의 **macOS·Windows hosted runner 이미지에는 clangd가 기본으로 미리 설치돼
있다**(Windows는 major 20, macOS는 major 21 — 이 세션이 이번에 처음 알게 된 사실, 둘 다 이전
`clangd-provider` job이 설치하는 22/23과도, stage 4의 17과도 다른 **완전히 별개의, 한 번도 측정한
적 없는 버전**). Ubuntu 쪽(`go-provider`/`Node 22`)은 실패하지 않았다 — Ubuntu 기본 이미지에는
clangd가 없는 것으로 보인다(직접 확인은 못 함, 실패 로그에 안 나타난 것으로 추정).

**이건 이 lane이 만든 버그가 아니라, 이 lane의 fix가 의도대로 동작해서 드러난 사실이다** — "미측정
버전은 조용히 통과시키지 말고 명시적으로 실패시켜라"는 지시를 그대로 따른 결과, **원래도 이 stray
clangd가 `go-provider`/`cli-tests-cross-os`에서 기존 clangd 테스트 2개를 조용히 실행해 왔다는 것**
(cross-file 결과 자체는 버전 무관이라 우연히 계속 통과해 온 것으로 보인다)까지 이번에 드러났다. 이
구조적 사실(job 경계와 무관하게 PATH의 clangd를 전부 문다)은 stage 5 때부터 있었고 이 lane이
새로 만든 게 아니다 — 이번에 버전 인지 assertion을 추가하면서 처음으로 "조용히 통과"가 아니라
"시끄럽게 실패"로 바뀌어 눈에 띄게 됐을 뿐이다.

**이 세션이 임의로 고르지 않는다.** 후보만 적는다:
1. Windows 20·macOS 21을 실제로 측정해(가능하다면 이 CI 이미지 자체에서) 세 번째·네 번째 관측
   버전으로 코드에 추가한다 — 그러면 `docs.limitations`가 5개 버전을 아는 상태가 된다.
2. `clangdGatedTest`(또는 이 특정 virtual-dispatch 테스트만)가 **의도된 job에서만** 돌도록 범위를
   좁힌다(예: `IMPACT_LENS_REQUIRE_CLANGD` 환경변수가 설정된 job에서만) — 다만 이건 stage 5가 정한
   "PATH에 있으면 로컬 개발자에게도 실행된다" 설계를 바꾸는 것이라 이 lane 혼자 결정할 사안이 아니다.
   기존 2개 clangd 테스트도 같은 변경의 영향을 받는다.
3. 다른 방향.

## Stage 4 — stray clangd: 게이트가 원래 의도한 것을 표현하게 고침

### commander 결정 — 후보 1 기각, 세 조건으로 가름

commander가 앞서 적어 둔 후보 1(Windows 20·macOS 21을 관측 버전으로 추가)을 명시적으로
기각했다: "runner가 실어 준 버전을 관측 목록에 넣는 건 쫓아다니는 것 — 다음 이미지 갱신에 major
24가 오면 또 깨진다. 그리고 우리가 고르지 않은 버전을 '검증됨'으로 만드는 것은 `lastVerified`가
의미하는 것과 정면으로 어긋난다."

**진단도 다시 정확히 했다**: 이건 이 lane이 만든 문제가 아니라 **clangd lane이 shipped된
시점부터 있던 사전 결함**이다 — `go-provider`와 `cli-tests-cross-os`가 runner에 딸려 온 미고정
clangd로 기존 clangd 테스트 2개를 조용히 돌려 왔고, cross-file 동작이 버전 무관이라 우연히
계속 통과해 온 것뿐이다. 그 job들의 로그에는 clangd 테스트가 통과한 것으로 찍히지만, **우리가
고르지 않은 버전에서 나온 결과라 아무 주장도 뒷받침하지 않는다** — INSTALL.md가 Python을 "검증된
preset 없음"으로 잘못 남겨 뒀던 것과 같은 계열의, 이 lane의 수정이 없었으면 계속 몰랐을 사전 결함.

**결정**: "skip은 실패로 취급"이라는 규칙의 목적은 *검증하기로 한 job*이 조용히 통과하는 걸 막는
것이다. `go-provider`/`cli-tests-cross-os`는 clangd를 검증하기로 한 job이 아니므로, 거기서
skip되는 것은 규칙 위반이 아니라 **규칙의 의도 그대로**다. 세 조건으로 가른다:

1. `IMPACT_LENS_REQUIRE_CLANGD`가 설정된 경우(= clangd를 의도적으로 설치한 job): 실행하고,
   미관측 버전이면 지금처럼 명시적으로 실패(pin이 흔들리면 시끄럽게 드러나야 한다).
2. CI가 아닌 경우(로컬 개발자): clangd가 PATH에 있으면 실행. 미관측 버전이면 **실패가 아니라
   버전을 이름 댄 skip** — 로컬 개발자의 clangd 버전은 이 저장소가 정할 수 있는 게 아니다.
3. CI인데 REQUIRE가 없는 경우(= runner에 우연히 딸려 온 clangd): **skip.** 버전을 로그에 남기되
   실행하지 않는다.

GitHub Actions가 `CI=true`를 설정하므로 이것으로 가른다. stage 5의 "PATH에 있으면 로컬
개발자에게도 실행" 의도는 그대로 유지되고, 바뀌는 건 "CI인데 아무도 clangd를 요청하지 않은
job"뿐이다.

### 구현

`cli/src/test/clangdIntegration.test.ts`:

- `IS_CI = Boolean(process.env.CI)` 추가.
- `clangdGatedTest`를 세 조건 순서로 재작성 — `REQUIRE_CLANGD` 우선(기존 동작 그대로: 있으면
  실행, 없으면 loud fail), 그다음 `IS_CI`(REQUIRE 없이 CI면 **무조건 skip**, PATH에 clangd가
  있어도 skip하며 skip 사유에 감지된 major 버전을 적는다), 마지막 로컬 개발자 경로(PATH에 있으면
  실행, 없으면 기존처럼 조용한 skip).
- 기존 clangd 테스트 2개(`with a real compile database...`, `negative control...`)는 이미
  `clangdGatedTest`를 통해서만 등록되므로 **별도 수정 없이 같은 게이트를 자동으로 물려받는다** —
  commander가 "같은 게이트를 쓰는지 확인하라"고 한 항목, 코드를 다시 읽어 확인했다(파일 163행·
  185행).
- virtual-dispatch 테스트의 "미관측 버전" 분기도 나눴다: `REQUIRE_CLANGD`면 기존처럼
  `assert.fail`(loud), 아니면(= 이 지점에 도달했다는 것 자체가 이미 "CI인데 REQUIRE 없음"은 바깥
  게이트가 걸러냈다는 뜻이므로 로컬 개발자 경로) `t.skip(message)` — node:test의
  `TestContext.skip()`을 사용해 실패가 아니라 이름 붙은 skip으로 만든다.
- `lastVerified`(`catalog.ts`)는 건드리지 않았다 — 20·21을 검증된 버전으로 추가하지 않는다는
  commander 지시 그대로.

### 로컬 검증 — 4가지 경로 전부 직접 재현

이 개발 머신(darwin/arm64, Apple clangd 17.0.0)에서 환경변수를 바꿔 가며 `node --test
dist/test/clangdIntegration.test.js`를 직접 실행해 4가지 경로 전부 확인했다(추측이 아니라 실측):

| 조건 | 결과 |
| --- | --- |
| `CI=true IMPACT_LENS_REQUIRE_CLANGD=1`(clangd 있음) | 3/3 pass — 기존 `clangd-provider` job 동작 불변 |
| `CI=true`(REQUIRE 없음, clangd 있음) | 3/3 **skip**, 사유에 "a clangd is on PATH (major 17)" 포함 — `go-provider`/`cli-tests-cross-os` 재현 |
| 로컬(REQUIRE 없음, `CI` 없음, clangd 있음) | 3/3 pass — 기존 로컬 개발자 동작 불변 |
| 로컬(clangd를 PATH에서 숨김) | 3/3 skip(무명, 기존과 동일) |

**non-vacuity — virtual-dispatch 분기도 실제로 깨서 확인**: `dist`(git 추적 안 함, `.gitignore`
확인됨)의 `clangdMajor`를 임시로 `99`로 바꿔 두 경로를 재실행했다:

- `IMPACT_LENS_REQUIRE_CLANGD=1` → 정확한 메시지로 `AssertionError`(loud fail, 기존과 동일한
  실패 형태 유지).
- REQUIRE 없음(로컬) → **fail이 아니라** `t.skip()`으로 정확한 메시지와 함께 skip.

`npm run cli:build`로 다시 빌드해 `dist`를 원상태로 복원(소스는 애초에 건드리지 않았다 —
`dist`만 임시로 편집했으므로 diff/shasum 절차는 불필요, 재빌드로 충분).

### 전체 회귀

`npm test`(Extension 유닛 포함) 331개 중 328 pass, 0 fail, 3 skip(로컬에 gopls가 PATH에 없음 —
이 세션의 새 shell에서 `go env GOPATH`/bin이 안 잡힌 환경 문제, 이 lane의 코드와 무관) — 회귀
없음.

### 환경 사실 기록 — 이번에 처음 알게 됨

GitHub hosted runner 기본 이미지에 clangd가 **미리 설치돼 있다**(우리가 설치한 게 아님):

- Windows: major **20**
- macOS: major **21**
- Ubuntu: **없음**(확인됨 — `unit`/Node 22 job은 이번 재실행에서 실패하지 않았다)

**이 버전들은 검증된 것이 아니다** — `lastVerified`/`docs.limitations`에 추가하지 않는다. 이
사실 자체(다음에 같은 함정을 만날 사람을 위한 기록)는 위 "재실행 결과" 절에서 처음 발견했을 때
이미 자세히 적어 뒀다(원인 분석 포함) — 이 절은 commander가 별도로 지시한 대로 그 사실을
명시적으로 다시 짚어 두는 것이다.

### 검증

- `npm run cli:build` 클린.
- `node --test cli/dist/test/clangdIntegration.test.js` 4가지 환경 조합 격리 실행(위 표) — 전부
  기대한 결과.
- non-vacuity: 위 참고(미관측 버전 강제 후 REQUIRE 유무에 따라 fail/skip 분기 둘 다 실제로 확인).
- `npm test` 전체 331개, 328 pass·0 fail·3 skip(gopls PATH 문제, 무관).

## 남은 작업

- **이 게이트 수정판을 push하고 `workflow_dispatch`로 3-OS CI를 다시 돌려 전부 green인지
  확인한다** — 특히 `go-provider`(macOS/Windows)와 `cli-tests-cross-os`(macOS/Windows)가 이제
  skip으로 바뀌는지, `clangd-provider` 3개는 여전히 pass인지.
- CI 확인 후 commander에게 보고한다. 그다음이 commander가 말한 "stage 3(수용 기준·gate 닫기)" —
  이미 문서에는 반영해 뒀지만(재판정 절), 이 게이트 수정 자체로 인한 재확인이 필요한지 다시 본다.
- PR 본문에 **이 발견(문서가 틀렸다는 것 발견·수정 + stray clangd 사전 결함 발견·수정)을 맨
  앞에 쓴다** — "CI 게이트 수정"이 아니라 "clangd 테스트가 의도하지 않은 job에서 미고정 버전으로
  조용히 돌아 왔다는 사전 결함을 발견하고 고쳤다"로(commander 지시).
- PR은 여전히 올리지 않는다.
