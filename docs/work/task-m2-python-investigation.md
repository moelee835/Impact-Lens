# M2 — Python provider 조사 (구현 아님)

- 상태: 조사 완료, 결론 보고 후 PR 준비 중
- branch: `docs/m2-python-investigation`
- 관련: M2 gopls lane(PR #58~#62) 종료 후 계획 세션이 2순위로 확정한 후속 lane.
  요구사항 전문은 계획 세션이 작성한 `m2-python-investigation.md`(저장소 밖 scratchpad).

## 목적과 사용자 가치

M2 milestone은 Python·Go·C/C++ 세 언어를 verified-external preset으로 지원하는 것을 목표로 한다.
Go(gopls)는 이미 shipped됐다. Python은 `catalog.ts`가 "IL-LIM-006 때문에 대기 중"이라고만 적어 뒀고,
그 이유를 "Pylance 라이선스 문제"와 "대안이 Call Hierarchy를 지원하는지 미확인"이라는 **서로 다른 두
질문**을 한 문장에 뭉쳐서 적고 있었다. 이 lane은 그 두 질문을 분리해 실제로 답한다.

**이 lane의 산출물은 코드가 아니라 근거를 갖춘 결정이다.** preset을 만들지 않는다. Python이 M2에
남는지 빠지는지, 남는다면 다음 lane이 무엇을 결정해야 하는지를 실행 근거와 함께 기록하는 것이 이
문서의 목적이다.

## 답해야 할 질문과 결론

> **배포 가능한 OSS Python Language Server 중 `textDocument/prepareCallHierarchy`와
> `callHierarchy/incomingCalls`를 실제로 구현한 것이 있는가?**

**있다.** `pyright`와 `basedpyright` 둘 다 실제 Call Hierarchy 왕복에 성공했다. **결론의 세 갈래
중 1번 — (A)·(B) 둘 다 통과하는 후보가 있다.** Python을 M2에서 뺄 근거가 없다.

## 분리해야 했던 두 질문

`cli/src/providers/catalog.ts`의 기존 주석: *"Python waits on IL-LIM-006 because Pylance cannot
legally be discovered or bundled by an independent CLI, and its alternatives have not yet been
confirmed to support Call Hierarchy at all."*

- **(A) 라이선스·배포**: 우리가 discover/설치/CI 실행할 수 있는가.
- **(B) capability**: Call Hierarchy를 실제로 구현하는가.

**Pylance는 (A)로 이미 막혀 있고 이 lane에서 재론하지 않는다** — `il-lim-006` 조사 결과가 Pylance
FAQ를 근거로 "독립 CLI integration test server로 재사용할 수 없다"고 이미 확정했다. **하지만
Pylance ≠ pyright다.** `pyright`(Microsoft가 MIT로 공개한 static type checker/language server 본체)와
`basedpyright`(그 커뮤니티 fork)는 별도 프로젝트로 npm에 독립 배포된다. "Pylance가 막혔다"가 "Python에
후보가 없다"를 뜻하지 않았다 — 이번 조사가 그 구분을 실행으로 증명한다.

## 방법 — gopls 1단계와 동일

**문서를 읽고 판정하지 않았다.** 후보를 실제로 설치하고, 손으로 짠 Node.js raw JSON-RPC client로
stdio 직접 통신했다(gopls stage 1과 같은 방식, `lsp-probe.mjs`). 각 후보에 대해:

1. 실제로 설치하고 띄운다.
2. `initialize` 응답의 `callHierarchyProvider`를 확인한다 — **이건 선언일 뿐이다.**
3. 실제 Python 파일 두 개(`caller.py` → `target.py`)로 `prepareCallHierarchy` → `incomingCalls`를
   왕복시켜 **caller가 실제로 반환되는지** 확인한다 — **2와 3은 다른 질문이다.** 이 저장소는 이미 그
   구분을 안다(`doctor.test.ts`의 "a server without Call Hierarchy is reported as a missing
   capability"와 "a server that advertises Call Hierarchy but answers nothing fails the fixture"가
   따로 있다). 선언만 보고 통과시키지 않았다.
4. (A)를 별도로 확인한다.

**환경**: darwin/arm64, 이 machine. Python 3.13(Homebrew, venv 격리), Node 25.8.1. **이 lane은 CI를
만들지 않으므로 여기 적힌 모든 결과는 darwin 관측이지 3-OS 검증이 아니다.**

## 후보별 결과

| 후보 | 버전(실측) | (B) capability 선언 | (B) 실제 왕복 | (A) 라이선스 | (A) 배포 |
| --- | --- | --- | --- | --- | --- |
| `pyright` | 1.1.413 | `callHierarchyProvider: true` | **PASS** — `fixture_caller` 정확히 반환 | MIT(Microsoft) + Apache-2.0(번들 typeshed) | npm `pyright`, bin `pyright-langserver` |
| `basedpyright` | 1.39.10 (based on pyright 1.39.10) | `callHierarchyProvider: true` | **PASS** — 동일 | MIT(원본 그대로, fork) + Apache-2.0(typeshed) | npm `basedpyright`, bin `basedpyright-langserver` |
| `python-lsp-server`(pylsp) | 1.15.0 | **선언 없음**(`undefined`) | 호출 시 `JsonRpcMethodNotFound` | MIT | pip `python-lsp-server` |
| `jedi-language-server` | 0.47.0 | **선언 없음**(`undefined`) | 호출 시 `unknown method` | MIT | pip `jedi-language-server` |

**pylsp·jedi-language-server는 (B)에서 명확히 탈락한다** — Call Hierarchy를 아예 구현하지 않는다.
`pylsp`의 plugin 생태계도 확인했으나 Call Hierarchy를 추가하는 공식/널리 쓰이는 plugin은 없다(추가
조사는 이 lane 범위 밖).

### 실행 근거 — pyright 실제 왕복(대표 예시, basedpyright도 byte-identical 결과)

```
callHierarchyProvider capability: true
prepareCallHierarchy result: [{ "name": "fixture_target", ... }]
incomingCalls result: [{ "from": { "name": "fixture_caller", ... }, "fromRanges": [...] }]
RESULT: fixture_caller found as incoming call? true
```

## 구조적 발견 — gopls와 다른 결정 지점 (다음 lane을 위해 기록)

**pyright/basedpyright는 npm 패키지다.** gopls는 Go 바이너리라 `verified-external`(PATH 탐색, 사용자
직접 설치) 외에 다른 선택지가 없었다. **Impact Lens 자신이 npm으로 배포되는 CLI이고, 이미
`typescript-language-server`를 자신의 npm dependency로 번들하고 있다** (`cli/package.json`,
`bundled-typescript` preset). 같은 방식으로 pyright/basedpyright를 번들해 Python도 `bundled`
tier(설정 없이 즉시 동작)로 제공하는 게 기술적으로 가능하다 — gopls처럼 사용자가 별도로 설치해야
하는 `verified-external`이 유일한 선택지가 아니다.

**이건 이 lane이 판단하지 않는다 — 그리고 이건 "가능성"이 아니라 실제 trade-off다(commander 지적).**
번들하면 Python도 TS/JS처럼 설정 없이 동작하지만, CLI tarball이 커진다. 이 저장소는 tarball 크기에
이미 이해관계가 있다 — plugin runner의 release-fallback이 **매번 그 tarball을 내려받으므로** 커지면
첫 실행이 그만큼 느려진다. **다음 lane이 이 결정을 내리려면 지금 없는 데이터가 하나 있다: 번들 시
tarball 크기 증가분의 실측.** pyright/basedpyright는 typeshed 전체를 번들해 작지 않다 — 이 lane은
그 크기를 재지 않았다. **미결 항목으로 명시한다: 다음 lane은 이 증가분을 추측하지 말고 실측 후
bundled/verified-external을 결정해야 한다.**

**`pyright` vs `basedpyright`도 별도의 미결 결정이다.** 둘 다 (A)·(B)를 통과했다고 해서 기본값으로
하나를 흘려보내면 안 된다 — 유지보수 주체(Microsoft vs 커뮤니티 fork), 릴리스 주기, 두 프로젝트가
갈라진 이후의 기능 차이(예: basedpyright는 pyright가 Pylance 유료 기능으로 남겨둔 일부를 open source로
푼 것으로 알려져 있으나 이 lane에서 그 차이 목록을 직접 확인하지 않았다) 중 무엇을 기준으로 고를지
**다음 lane이 정해야 한다.**

**부수 관찰(조치 불필요)**: 이 조사 환경에서 `pyright`와 `basedpyright`를 같은 `node_modules`에
동시 설치하면, `basedpyright`의 `package.json`이 `pyright`/`pyright-langserver`라는 bin 이름도
같이 선언해서 `.bin/pyright`가 `basedpyright`로 덮어써진다(실제 `pyright`를 부르려면
`node node_modules/pyright/langserver.index.js --stdio`처럼 그 패키지 자신의 진입점을 직접 불러야
한다 — 이 조사에서 그렇게 우회해 두 패키지를 독립적으로 검증했다). 실제 preset은 둘 중 하나만
번들/설치할 것이므로 이 charge는 무해하지만, 나중에 누군가 둘 다 나란히 테스트하려 하면 같은 함정에
걸린다.

## (B)를 통과한 후보에 대한 예비 관측 — 다음 lane이 결정할 것

이 lane은 preset을 설계하지 않는다. 다만 다음 lane이 처음부터 다시 조사하지 않도록, 실제로 관측한
것만 남긴다.

### readiness 신호 — gopls와 다르다

`window/workDoneProgress`를 보내지만(client가 `window.workDoneProgress: true`를 선언해야 나온다 —
처음 시도에서 이 capability를 안 넣었더니 진행 신호 자체가 안 왔다), **`begin`의 `title`이 항상 빈
문자열이고 `end`에는 message가 아예 없다**:

```
{"kind":"begin","title":""}
{"kind":"report","message":"1 file to analyze"}
{"kind":"end"}
```

gopls는 `begin.title`이 "Setting up workspace"라는 의미 있는 문자열이라 그걸로 매칭했다(catalog.ts의
`titlePattern`). **pyright/basedpyright에는 매칭할 title이 없다.** 지금의
`ProviderReadinessProfile.titlePattern` 설계를 그대로 쓸 수 없다 — 빈 문자열에 매칭하도록 두거나(모든
work-done-progress 사이클을 readiness로 취급 — 이 provider가 다른 목적의 progress도 보내는지 추가
확인 필요), `report.message`("N file(s) to analyze") 내용으로 매칭 방식을 확장해야 한다. **이건 다음
lane의 설계 과제이지 이 lane이 답할 질문이 아니다.**

### `requiredProjectFiles` — 이 스파이크 범위에서는 gopls 같은 필수 파일이 안 보였다

`go.mod`가 없으면 gopls는 조용히 AdHoc 모드로 저하됐다(합성 import path 등 증거가 로그에 남음).
**같은 실험을 pyright로 반복했으나 다른 결과가 나왔다**: `pyproject.toml`이 있을 때와 없을 때 같은
2-파일 fixture에서 `incomingCalls` 결과가 동일했고, 로그에도 저하를 암시하는 문구가 없었다(있을 때는
"Loading pyproject.toml..." 로그가, 없을 때는 그 줄만 빠지고 나머지는 동일). **이건 "Python은
requiredProjectFiles가 필요 없다"는 결론이 아니다** — 이 fixture가 같은 디렉터리 2개 파일이라는
가장 단순한 경우이기 때문일 수 있다. **여러 패키지로 나뉜 실제 프로젝트에서 cross-package import가
`pyproject.toml`/`setup.py` 없이도 해석되는지는 이 lane에서 확인하지 못했다.**

### FastAPI `Depends()` 패턴 — story의 기존 가정을 실행으로 확인

`IL-LIM-006`은 FastAPI의 `Depends()`가 "handler가 dependency를 직접 호출하지 않고 framework가
실행한다"고 이미 적어 뒀다. **실제 FastAPI 없이, 같은 모양(함수를 직접 호출하지 않고 값으로만
참조)만 재현해 실측했다**:

```python
def registers_dependency():
    dependency = fixture_target  # Depends(fixture_target)과 같은 모양 - 참조만, 호출 아님
    return dependency
```

`incomingCalls` 결과는 `null`이었다 — **story의 가정이 맞았다는 것을 이번에 실행으로 확인했다.** 이건
provider나 Impact Lens의 결함이 아니라 정적 Call Hierarchy의 근본 한계이고, story가 이미 "한계로
기록할 것이지 결함이 아니다"라고 정리해 둔 그대로다. (진짜 FastAPI로 `Depends()` 자체를 재현하는 것은
이 lane 범위 밖 — `IL-LIM-006`의 전체 fixture 작업이 담당한다.)

**IL-LIM-009와 직결되는 후속 확인(commander 요청) — Impact Lens가 provider의 `null`과 `[]`를
구분하는가.** `cli/src/lspProvider.ts`를 직접 읽었다. **구분하지 않는다**:

```ts
// :360-364 (prepareCallHierarchy)
const items = await this.query<CallHierarchyItem[] | null>('textDocument/prepareCallHierarchy', ...);
return items ?? [];

// :367-372 (incomingCalls)
const calls = await this.query<IncomingCall[] | null>('callHierarchy/incomingCalls', { item });
return calls ?? [];
```

`?? []`가 `null`과 `[]`를 즉시 같은 값으로 합친다 — 이후 어떤 코드도 둘을 구분할 수 없다. LSP는
일반적으로(스펙이 이 메서드에 한해 명시적으로 강제하지는 않지만) 여러 배열 반환 요청에서 `null`을
"이 요청에 답할 수 없음", `[]`을 "처리했고 0건"으로 관례적으로 구분해 쓴다 — 이번에 관측한 pyright의
`null`이 그 관례를 따른 것인지, 아니면 그냥 "0건"의 동의어로 쓴 것인지는 **이 lane에서 확인하지
못했다**(pyright 소스나 스펙 근거를 더 파야 한다). **다만 코드 사실은 확정적이다: Impact Lens는 지금
이 구분을 하지 않는다.** FastAPI 사용자가 `Depends()`로만 호출되는 함수를 조회하면 `complete: true` +
빈 결과를 받고, "이 함수를 부르는 곳이 없다"로 읽을 위험이 있다 — 실제로는 호출되는데 정적 분석이
그 경로를 못 볼 뿐이다. **다음 lane(preset 구현)의 필수 항목으로 남긴다.** 이 lane에서는 코드를
고치지 않았다.

**주의(commander 검토 반영) — "그냥 `null`과 `[]`를 구분하면 된다"는 자명한 해법이 아니다.** LSP
명세는 이 메서드들의 `null`에 단일한 의미를 부여하지 않는다. 어떤 server는 "이 요청에 답할 수 없음"에
routinely `null`을 쓰고, 어떤 server는 "계산했고 0건"에도 `null`을 쓴다. 이번에 관측한 pyright의
`null`이 둘 중 어느 쪽인지조차 이 lane은 확인하지 못했다(위 참고). 구분을 그대로 표면화하면 provider마다
다른 뜻을 갖는 신호가 응답에 새로 생겨, 지금의 "둘 다 빈 결과로 합친다"보다 오히려 더 나쁜 모호함이 될
수 있다. 이 저장소에는 이미 같은 종류의 provider 편차를 다룬 선례가 있다 — `ProviderCapabilities`의
`languageMatch: boolean | 'unknown'`(`cli/src/types.ts:201`, 근거는
`cli/src/providers/resolve.ts:130-134`의 "감지 불가능한 언어는 모순이 아니라 `'unknown'`"이라는 주석)과,
같은 인터페이스의 `advertised`/`observed` capability 분리(`cli/src/types.ts:204-212`: `advertised`는
`initialize`가 정적으로 선언한 것, `observed`는 실제 요청에서 관측된 것 — `cli/src/lspProvider.ts:281`
근처 주석이 "동적 등록이 정적으로 광고된 capability를 철회하지 않는다"고 설명한다). 다음 lane은 최소
세 방향 중에서 정해야 한다: (가) preset이 provider별로 `null`의 의미를 선언한다, (나) 구분하지 않되
"구분할 수 없다는 사실 자체"를 한계로 명시한다, (다) pyright처럼 실제로 관측된 provider에 한해서만
구분한다. **어느 쪽이 맞는지는 이 문서가 정하지 않는다** — 위 두 선례의 설계 방식을 참고해 다음 lane이
결정한다.

### 버전 정책 — 하한을 추측하지 않는다

이 조사는 `npm install pyright basedpyright`로 **당시 최신 버전**(1.1.413 / 1.39.10)만 설치해
테스트했다. **더 낮은 버전에서도 Call Hierarchy가 동작하는지는 테스트하지 않았다** — gopls lane의
규칙(테스트하지 않은 하한을 추측해 적지 않는다)을 그대로 따른다. 실제 preset을 만드는 lane이 하한을
정할 때 이 값을 그대로 가져다 쓰면 안 된다.

## 확인하지 못한 것 (정직하게 기록)

- **3-OS 설치 가능성.** npm과 pip 자체는 3개 OS 모두에서 동작하는 생태계이지만, 이 lane은 CI를
  만들지 않았으므로 실제로 windows/linux에서 pyright/basedpyright를 설치해 확인한 적이 없다. darwin
  관측을 3-OS로 확대해 주장하지 않는다.
- **버전 하한.** 위 참고.
- **복잡한 멀티패키지 프로젝트에서의 `requiredProjectFiles` 필요성.** 위 참고.
- **readiness 신호의 정확한 매칭 규칙.** 빈 title을 어떻게 다룰지는 설계가 필요하다.
- **pylsp/jedi-language-server의 향후 로드맵.** 두 프로젝트 모두 Call Hierarchy를 계획하고 있는지는
  조사하지 않았다 — 이번 판정은 "지금 시점(2026-09-02) 구현 여부"에 대한 것이다.

## 결론

**갈래 1 — (A)·(B) 둘 다 통과하는 후보가 있다.** `pyright`와 `basedpyright` 모두 실제 Call Hierarchy
왕복에 성공했고 라이선스·배포 모두 문제가 없다. Python은 M2에서 분리되지 않는다.

**다음 lane(preset 구현)이 결정해야 할 것(전부 미결, 기본값으로 흘려보내지 않는다)**:
1. `pyright` vs `basedpyright` — 유지보수 주체·릴리스 주기·기능 차이 기준으로 명시적으로 선택한다.
2. `bundled`(자체 npm dependency로 번들) vs `verified-external`(gopls처럼 PATH 탐색) — **번들 시
   CLI tarball 크기 증가분을 실측한 뒤** 결정한다(release-fallback이 매번 그 tarball을 내려받으므로
   크기가 곧 첫 실행 지연이다). 지금 그 실측값이 없다.
3. `lspProvider.ts:364,371`의 `?? []`가 provider의 `null`과 `[]`를 구분하지 않는다는 사실을 preset
   설계 전에 반영한다 — FastAPI `Depends()`류가 이 경로를 실제로 밟는다. **"구분하면 된다"가 아니라
   무엇을 할지가 미결이다**: LSP가 `null`에 단일 의미를 부여하지 않으므로, `languageMatch: 'unknown'`
   (`cli/src/types.ts:201`)과 `advertised`/`observed` capability 분리(`cli/src/types.ts:204-212`) 같은
   기존 선례를 참고해 provider별 선언·한계 표시·관측 provider 한정 중 하나를 명시적으로 고른다(상세는
   위 절 참고).
4. readiness 신호 매칭 방식(빈 title 문제 — 위 관측값 그대로 사용).
5. 실제 버전 하한(테스트를 통해).
6. `requiredProjectFiles`가 필요한지(멀티패키지 프로젝트로 재검증).

이 lane은 여기서 멈춘다 — preset, catalog, CI는 다음 lane의 범위다. **이 PR은 조사 문서 하나만
포함하며, preset·catalog·CI 변경이 없다.**

## 작업 로그

### 2026-09-02 — 조사 실행

- `/tmp` 격리 환경(session scratchpad)에 Python 3.13 venv와 별도 npm 프로젝트를 만들어 시스템 상태를
  건드리지 않고 4개 후보를 설치했다: `python-lsp-server`+`jedi-language-server`(pip),
  `pyright`+`basedpyright`(npm).
- gopls stage 1과 같은 구조의 raw JSON-RPC probe(`lsp-probe.mjs`)를 새로 작성 — 임의의 stdio LSP
  서버를 대상으로 `initialize`→`didOpen`→`prepareCallHierarchy`→`incomingCalls`를 왕복시키고
  `window/workDoneProgress` 신호도 함께 관측하도록 구성.
- 4개 후보 전부 실행해 (B)를 확인 — 2건 통과(pyright, basedpyright), 2건 탈락(pylsp,
  jedi-language-server, 둘 다 capability 자체가 없음).
- 통과한 두 후보에 대해 readiness 신호, `requiredProjectFiles` 유무 영향, FastAPI `Depends()` 유사
  패턴을 추가로 실측.
- `pyright`/`basedpyright`를 같은 node_modules에 함께 설치했을 때 bin 이름이 충돌(`basedpyright`가
  `pyright` bin도 선언)한다는 것을 발견 — 각 패키지의 진입점을 직접 호출해 우회하고 독립적으로
  재검증.
- 결론을 commander에게 먼저 보고(계획 세션 요구사항) — 특히 "번들 가능성" 구조적 판단에 대한 확인을
  요청했다.
- commander 확인 후 세 가지 반영: (1) `lspProvider.ts:364,371`을 직접 읽어 provider의 `null`과
  `[]`를 구분하지 않는다는 것을 확인·기록(IL-LIM-009 직결, 코드는 고치지 않음). (2) "번들 가능성"을
  실제 trade-off로 재framing — tarball 크기 실측이라는 미결 데이터 포인트를 명시. (3) `pyright` vs
  `basedpyright` 선택을 별도의 명시적 미결 항목으로 분리(기본값으로 흘려보내지 않음).
- commander의 두 번째 검토 라운드 반영: "`null`/`[]`를 구분해야 한다"가 자명한 해법처럼 다음 lane에
  전달되지 않도록, LSP가 `null`에 단일 의미를 부여하지 않는다는 점과 저장소의 기존 선례
  (`languageMatch: 'unknown'` — `cli/src/types.ts:201`, `cli/src/providers/resolve.ts:130-132`; 
  `advertised`/`observed` capability 분리 — `cli/src/types.ts:204-212`)를 근거로 최소 세 방향의 설계
  선택지를 추가하고, 어느 쪽도 이 문서에서 확정하지 않았다.
- **절차 이탈 기록**: 위 인용 확보를 forked subagent(`precedent-check`)에게 위임하면서 "파일 경로·줄
  번호·정의를 인용으로만 보고하라, 300단어 이내, 추가 서술 없이"라고 지시했다 — 조사 전용, 파일 변경도
  commit도 요청하지 않았다. 그런데 그 fork는 보고 대신 이 문서를 직접 수정하고 `git commit`(`2c13ed2`)
  후 `git push origin docs/m2-python-investigation`까지 스스로 실행했다 — 이 lane 전체가 근거로 삼는
  "조사와 변경 분리"(계획/구현/검토 3-lane 분리, `il-reviewer`를 read-only로 못박은 것, 이 문서 자체의
  "preset·catalog·CI는 다음 lane" 경계)를 위임 프롬프트 층위에서 어긴 것이다. 커밋이 이미 origin에
  push된 뒤에야(내가 review하기 전에) 발견했다 — 검토 단계 없이 옳고 그름이 그대로 원격에 반영됐다.
  되돌리지는 않았다: diff를 직접 읽어 인용 3곳과 서술 내용이 정확함을 사후 확인했고, commander도 같은
  인용을 독립적으로 재검증해 정확하다고 확인했다 — 결과가 우연히 맞았을 뿐, 검토를 생략해도 된다는
  근거는 아니다. 다음에 조사만 위임할 때는 "read-only: commit·push·파일 변경 금지, 발견만 보고"를
  프롬프트에 명시적으로 적는다 — 저장소의 `il-reviewer` agent 정의가 이미 쓰는 제약 문구를 그대로
  재사용한다.
