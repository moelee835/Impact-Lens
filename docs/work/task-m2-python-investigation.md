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

### 리뷰 시점에 추가 확인된 후보 — 이 lane의 조사가 아님, 출처를 그대로 남긴다

이 문서가 완성된 뒤 PR #63 검토 과정에서 `reviewer` 세션이 위 4개 후보 표가 후보군을 닫아버린 것이
부정확하다는 것을 지적하고 직접 추가로 측정했다. 아래 사실은 **이 lane이 만든 것이 아니라 reviewer가
review 시점(2026-09-02)에 직접 설치·실행해 확인한 것**이다 — 나중에 재현 주체를 추적할 수 있도록
"무엇이 나왔는가"와 "누가 쟀는가"를 함께 남긴다.

- **`Pyrefly`**(Meta, MIT, pip+npm 배포, Rust 구현) **1.2.0**: reviewer가 이 lane과 같은 probe 방식으로
  직접 설치·실행해 `callHierarchyProvider: true`와 실제 caller 왕복 성공을 확인했다 — (A)·(B) 모두
  pyright/basedpyright와 동일하게 통과한다.
- **같은 `Depends()` 모양 케이스에서 Pyrefly는 `[]`를 반환했다 — pyright의 `null`과 다르다.** (아래
  null/`[]` 절에 실측 근거로 반영했다.)
- **`ty`**: GitHub issue #1976에서 프로젝트 자신이 Call Hierarchy 미지원을 확인했다 — 실행 왕복 테스트를
  하지 않아도 (B)에서 탈락이 확정된다.
- **`Zuban`**: 공개된 기능 목록에 Call Hierarchy가 없어 탈락 가능성이 높다 — **다만 이 lane도
  reviewer도 실제 왕복 테스트는 하지 않았다.** 탈락을 확정하지 않는다. 목록에 없다는 것과 실행으로
  탈락을 확인한 것은 다른 확실성이다 — 이 문서는 그 둘을 같은 문장으로 쓰지 않는다.

**갈래 1 결론(문서 초입)은 바뀌지 않는다** — pyright/basedpyright가 이미 (A)·(B) 통과 후보였다. 바뀌는
것은 다음 lane에 넘기는 미결 항목의 개수와 성격이다(아래 결론 절의 미결 1·2 참고).

## 구조적 발견 — gopls와 다른 결정 지점 (다음 lane을 위해 기록)

**pyright/basedpyright는 npm 패키지다.** gopls는 Go 바이너리라 `verified-external`(PATH 탐색, 사용자
직접 설치) 외에 다른 선택지가 없었다. **Impact Lens 자신이 npm으로 배포되는 CLI이고, 이미
`typescript-language-server`를 자신의 npm dependency로 번들하고 있다** (`cli/package.json`,
`bundled-typescript` preset). 같은 방식으로 pyright/basedpyright를 번들해 Python도 `bundled`
tier(설정 없이 즉시 동작)로 제공하는 게 기술적으로 가능하다 — gopls처럼 사용자가 별도로 설치해야
하는 `verified-external`이 유일한 선택지가 아니다.

**이건 이 lane이 판단하지 않는다 — 그리고 이건 "가능성"이 아니라 실제 trade-off다(commander 지적).**
다만 이 문서가 원래 지시했던 실측 대상 자체가 틀렸다는 것이 PR #63 review 과정에서 드러났다
(commander, 2026-09-02) — 아래는 그 정정을 반영한 내용이다.

**틀렸던 진단.** "번들하면 CLI tarball이 커진다"와 "release-fallback이 매번 그 tarball을 내려받는다"
둘 다 부정확했다.
- `cli/package.json`의 `files`는 `dist/*.js`류·`README.md`·`schemas/**`뿐이다 — `npm pack`이 만드는
  tarball에는 `node_modules`(의존성)가 들어가지 않는다. commander가 pinned release tarball을 직접
  받아 확인했다(`impact-lens-cli-0.7.0.tgz` = 75,059 bytes, 31 entries, node_modules 항목 0) — 이
  lane도 로컬 `npm pack --dry-run`으로 같은 구조를 재현했다(31 files, node_modules 항목 없음). pyright를
  `dependencies`에 추가해도 **이 tarball 자체는 package.json 한 줄만큼만 커진다.**
- release-fallback은 "매번"이 아니라 **최초 실행 시**에만 네트워크 접근이 필요하다 — `INSTALL.md:184`
  ("마지막 fallback은 최초 실행 시 GitHub와 npm 네트워크 접근이 필요할 수 있습니다"). commander가 인용한
  출처(`README.md:271`)는 이 checkout에 그 내용이 없어 이 lane이 직접 찾아 `INSTALL.md:184`로
  바로잡았다 — 문장 자체(매번 → 최초 실행)는 정확하다. `npm exec`는 받은 패키지를 로컬 npx cache에
  남기므로 이후 실행은 재다운로드하지 않는다 — 이 lane이 `npm exec --yes --package=<pkg>`를 두 번
  연속 호출해(두 번째는 `--offline`) 직접 재현했다: 첫 실행 1.8s, 두 번째(오프라인) 0.35s, 오프라인에서도
  그대로 성공.

**진짜 재야 할 것은 tarball 크기가 아니라 첫 실행 install closure 증가분이다.** 실제 비용이 생기는
지점은 `plugins/impact-lens/scripts/run-impact-lens:133,140`의 `npm exec --yes
--package="$impact_lens_release_package" -- impact-lens "$@"`다 — `npm exec`가 이 tarball을 받은 뒤
**의존성 closure까지 해석·다운로드한다.** 번들 시 커지는 것은 tarball이 아니라 이 첫 실행 install
closure다.

**참고용 ballpark(다음 lane의 실측을 대체하지 않는다 — commander가 npm registry에서 조회, 2026-09-02,
이 lane이 `npm view <pkg> dist.unpackedSize`로 동일 값 재확인)**:

| 패키지 | `dist.unpackedSize` |
| --- | --- |
| `typescript@5.9.3`(현재 pinned) | 23,625,066 |
| `typescript-language-server@6.0.0` | 2,424,942 |
| `pyright@1.1.413` | 19,344,986 |
| `basedpyright@1.39.10` | 27,616,199 |

**한계**: 이건 unpacked 크기이지 다운로드 바이트가 아니고, 해당 패키지 하나의 값이지 transitive
closure 전체가 아니다. 그래도 규모 판단에는 쓸 수 있다 — **pyright는 이미 번들 중인 typescript보다
작다.** "typeshed 전체를 번들해 작지 않다"던 이전 문장은 방향은 맞았지만 비교 기준이 없어 실제보다
무겁게 읽혔다.

**미결 항목으로 다시 명시한다: 다음 lane은 tarball 크기가 아니라 첫 실행 install closure 증가분을
실측한 뒤 bundled/verified-external을 결정해야 한다.**

**`pyright` vs `basedpyright`도 별도의 미결 결정이다.** 둘 다 (A)·(B)를 통과했다고 해서 기본값으로
하나를 흘려보내면 안 된다 — 유지보수 주체(Microsoft vs 커뮤니티 fork), 릴리스 주기, 두 프로젝트가
갈라진 이후의 기능 차이(예: basedpyright는 pyright가 Pylance 유료 기능으로 남겨둔 일부를 open source로
푼 것으로 알려져 있으나 이 lane에서 그 차이 목록을 직접 확인하지 않았다) 중 무엇을 기준으로 고를지
**다음 lane이 정해야 한다.**

**Pyrefly는 이 축의 3번째 선택지가 아니다 — 구조적으로 `verified-external` 전용이다.** reviewer가
review 초반 "pip+npm 배포"라고 적었으나, 이는 검증 없이 "Rust 도구는 보통 양쪽에 배포한다"고
일반화한 것이었다(reviewer 본인이 이후 재확인: 그 세션은 pyrefly를 pip으로만 설치했고 npm 명령을
실행한 적이 없었다). 실제로 확인된 것:

- `npm view pyrefly versions` → `["0.0.1-security"]`(name squatting 방지용 placeholder, 420 bytes,
  2 files) — commander가 조회했고, 이 lane도 같은 명령으로 독립 재확인했다.
- 대안 이름도 소진했다 — `@facebook/pyrefly`, `@pyrefly/pyrefly`, `@pyrefly/cli`, `@pyrefly/lsp`,
  `pyrefly-lsp`, `pyrefly-language-server` 여섯 개 전부 npm registry 404. reviewer와 commander가 각각
  확인했고, 이 lane도 여섯 이름 모두 재확인했다(`npm search`에는 서드파티 `@yaegassy/coc-pyrefly`만
  나온다 — Pyrefly 본체가 아니다).
- PyPI에는 실물이 있다 — `pyrefly` 1.2.0, `requires_python >=3.8`, 플랫폼별 wheel 11종(macOS
  arm64/x86_64, manylinux 여러 arch, musllinux, win32/amd64/arm64) + sdist — 이 lane이 PyPI JSON API로
  직접 조회해 재확인했다. 컴파일된 Rust 바이너리라는 설명과 일치한다.

**세 세션이 각자 확인했고 대안 이름 탐색도 소진됐으므로 "확인되지 않음"이 아니라 "npm에 배포되지
않는다"로 적는다.** Impact Lens는 npm CLI이고 first-run 경로가 `npm exec --package=<tgz-url>`이다 —
PyPI wheel은 그 경로로 도달할 수 없다. **따라서 Pyrefly는 `bundled` tier 후보가 될 수 없고
`verified-external` 전용이다 — 이건 미결이 아니라 확정된 제약이다.**

**이게 미결 1의 성격을 바꾼다: 세 후보가 같은 축에서 경쟁하지 않는다.** `pyright`/`basedpyright`는
`bundled`·`verified-external` 둘 다 가능하지만 `Pyrefly`는 `verified-external`만 가능하다 —
**미결 2(bundled vs verified-external)가 미결 1(어느 provider를 고를지)을 제약한다, 서로 독립인
결정이 아니다.** 번들을 택하면 그 시점에 Pyrefly는 자동으로 후보에서 빠진다.

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
`titlePattern`). **pyright/basedpyright에는 매칭할 title이 없다 — 그런데 이건 이미 지금 설계가
예상하는 경우다(commander 정정, review 시점).** `ReadinessSignal`의 `titlePattern`은 optional이다
(`cli/src/providers/preset.ts:91`: `readonly titlePattern?: string;`, 주석 그대로 "Absent means every
token qualifies"), 그리고 구현이 그 문서화된 동작을 그대로 따른다 — `cli/src/providers/readiness.ts:151`
(`if (signal.titlePattern !== undefined && !(known ?? '').includes(signal.titlePattern))`)은
`titlePattern`이 `undefined`이면 title 필터링 자체를 건너뛰고, `:35-37`도 `undefined` 분기를 별도로
갖는다 — 이 lane이 두 위치를 직접 읽어 확인했다. **즉 "빈 문자열에 매칭하도록 두거나 매칭 방식을
확장해야 한다"는 이전 문장은 틀렸다: `titlePattern`을 생략하면 된다. 타입 변경도 매칭 방식 확장도
필요 없다.**

**그렇다고 이게 아무 확인 없이 끝나는 건 아니다 — 순서가 검증 먼저, 설계 확장은 조건부다.** 실제
남는 미결은 이 lane이 이미 괄호로 적어 뒀던 그 질문 하나다: **이 provider가 다른 목적의
work-done-progress도 보내는가?** 이 lane의 2-파일 fixture에서는 사이클이 하나만 관측됐다(위 raw
로그) — 다른 목적의 progress가 존재하는지는 확인하지 못했다.
- **보내지 않는다면**: `titlePattern`을 생략하는 것으로 끝난다. 코드 변경이 필요 없다.
- **보낸다면**: 그때 비로소 `report.message`("N file(s) to analyze") 같은 내용 기반 매칭 확장이
  필요해진다 — 그 경우에만 조건부로 실행되는 다음 lane의 설계 과제다.

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

**review 시점에 이 스펙 해석 논증을 뒷받침하는 실측이 생겼다**(위 "리뷰 시점에 추가 확인된 후보" 절
참고): 같은 `Depends()` 모양 입력에 pyright는 `null`을, `Pyrefly`(1.2.0, reviewer 측정)는 `[]`를
반환했다 — **provider마다 이미 실제로 다른 값을 내보낸다는 것이 스펙 해석이 아니라 관측 사실이 됐다.**
이 데이터는 위 세 방향 판단에 직접 걸린다: (나)(구분을 포기하고 "구분할 수 없다"는 사실만 한계로
명시)를 고르면 이미 벌어지고 있는 이 차이 자체를 감추는 선택이 되고, (가)(provider별 선언)나
(다)(관측된 provider 한정 구분)는 이 관측을 그대로 반영할 수 있다는 점에서 유리해진다 — **그렇다고
어느 쪽이 맞는지를 이 문서가 정하는 것은 아니다.** provider 두 곳의 관측만으로 일반화하기엔 이르다는
반론도 남아 있고, 그 판단은 여전히 다음 lane의 몫이다.

### 버전 정책 — 하한을 추측하지 않는다

이 조사는 `npm install pyright basedpyright`로 **당시 최신 버전**(1.1.413 / 1.39.10)만 설치해
테스트했다. **더 낮은 버전에서도 Call Hierarchy가 동작하는지는 테스트하지 않았다** — gopls lane의
규칙(테스트하지 않은 하한을 추측해 적지 않는다)을 그대로 따른다. 실제 preset을 만드는 lane이 하한을
정할 때 이 값을 그대로 가져다 쓰면 안 된다.

## 확인하지 못한 것 (정직하게 기록)

- **후보군 범위.** 이 lane이 직접 실행으로 검증한 것은 4개 후보(`pyright`, `basedpyright`,
  `python-lsp-server`, `jedi-language-server`)뿐이다. 이후 등장한 Rust 기반 신규 진입자(`Pyrefly`,
  `ty`, `Zuban`)는 이 lane의 조사 대상이 아니었다 — PR #63 review 시점에 reviewer가 추가로 확인한
  내용은 위 "리뷰 시점에 추가 확인된 후보" 절에 출처와 함께 별도로 기록했다.
- **3-OS 설치 가능성.** npm과 pip 자체는 3개 OS 모두에서 동작하는 생태계이지만, 이 lane은 CI를
  만들지 않았으므로 실제로 windows/linux에서 pyright/basedpyright를 설치해 확인한 적이 없다. darwin
  관측을 3-OS로 확대해 주장하지 않는다.
- **버전 하한.** 위 참고.
- **복잡한 멀티패키지 프로젝트에서의 `requiredProjectFiles` 필요성.** 위 참고.
- **pyright/basedpyright가 readiness 목적이 아닌 다른 work-done-progress도 보내는지.** 이 lane의
  2-파일 fixture에서는 사이클이 하나만 관측됐다 — `titlePattern` 생략만으로 충분한지, 아니면
  `report.message` 매칭 확장이 필요한지가 이 확인 결과에 달려 있다(위 readiness 절 참고. `titlePattern`
  자체는 이미 optional이라 설계 변경이 필요 없다는 것은 review 시점에 확인됐다).
- **pylsp/jedi-language-server의 향후 로드맵.** 두 프로젝트 모두 Call Hierarchy를 계획하고 있는지는
  조사하지 않았다 — 이번 판정은 "지금 시점(2026-09-02) 구현 여부"에 대한 것이다.

## 결론

**갈래 1 — (A)·(B) 둘 다 통과하는 후보가 있다.** `pyright`와 `basedpyright` 모두 실제 Call Hierarchy
왕복에 성공했고 라이선스·배포 모두 문제가 없다. Python은 M2에서 분리되지 않는다.

**다음 lane(preset 구현)이 결정해야 할 것(전부 미결, 기본값으로 흘려보내지 않는다)**:
1. `pyright` vs `basedpyright` vs `Pyrefly`(review 시점 추가 확인, 1.2.0) — **2자 선택이 아니라 3자
   선택이다. 다만 세 후보가 같은 축에서 경쟁하지 않는다: `pyright`/`basedpyright`는 `bundled`·
   `verified-external` 둘 다 가능하지만, `Pyrefly`는 npm에 배포되지 않아(아래 참고)
   `verified-external`로만 도달 가능하다.** 미결 2(bundled vs verified-external)를 먼저 정하지 않으면
   이 선택 자체가 완결되지 않는다 — 번들을 택하면 Pyrefly는 그 시점에 자동 탈락한다. `pyright` vs
   `basedpyright`는 유지보수 주체·릴리스 주기·기능 차이 기준으로 별도로 선택한다. `ty`는 Call
   Hierarchy 미지원이 프로젝트 자체 확인(GitHub issue #1976)으로 이미 탈락, `Zuban`은 기능 목록상 탈락
   가능성이 높으나 왕복 테스트를 하지 않아 탈락을 확정하지 않는다 — 이 둘은 선택지에서 제외하되 그
   근거의 확실성 차이를 그대로 남긴다.
2. `bundled`(자체 npm dependency로 번들) vs `verified-external`(gopls처럼 PATH 탐색) — **번들 시 첫
   실행 install closure 증가분을 실측한 뒤** 결정한다. tarball 자체는 `cli/package.json`의 `files`가
   `node_modules`를 포함하지 않아 거의 커지지 않는다 — 실제 비용은 release-fallback 첫 실행의 `npm
   exec`가 그 시점에 의존성 closure를 다운로드하는 데서 생긴다(재실행부터는 npx cache로 재다운로드하지
   않는다). 지금 그 install closure 실측값이 없다 — `dist.unpackedSize` ballpark(위 절)는 참고용일 뿐
   대체하지 않는다. **미결 1을 완결하려면 이 결정이 먼저 필요하다** — 번들을 택하면 Pyrefly는
   선택지에서 빠진다.
3. `lspProvider.ts:364,371`의 `?? []`가 provider의 `null`과 `[]`를 구분하지 않는다는 사실을 preset
   설계 전에 반영한다 — FastAPI `Depends()`류가 이 경로를 실제로 밟는다. **"구분하면 된다"가 아니라
   무엇을 할지가 미결이다**: LSP가 `null`에 단일 의미를 부여하지 않으므로, `languageMatch: 'unknown'`
   (`cli/src/types.ts:201`)과 `advertised`/`observed` capability 분리(`cli/src/types.ts:204-212`) 같은
   기존 선례를 참고해 provider별 선언·한계 표시·관측 provider 한정 중 하나를 명시적으로 고른다(상세는
   위 절 참고). **review 시점에 실측 근거가 하나 생겼다**: 같은 `Depends()` 모양 입력에 pyright는
   `null`을, Pyrefly는 `[]`를 반환했다 — provider마다 이미 다른 값을 낸다는 것이 관측 사실이다(상세와
   이 데이터가 세 방향 판단에 어떻게 걸리는지는 위 null/`[]` 절 참고).
4. readiness 신호 매칭 — **설계 과제가 아니라 검증 과제로 좁혀졌다.** `titlePattern`은 이미 optional로
   설계돼 있고 생략하면 모든 진행 신호를 매칭한다(`preset.ts:91`, `readiness.ts:35-37,151` — 위 절
   참고). 남은 것은 하나뿐이다: **pyright/basedpyright가 readiness 목적이 아닌 다른
   work-done-progress도 보내는가?** 안 보낸다면 `titlePattern` 생략으로 끝(코드 변경 없음), 보낸다면
   그때 `report.message` 내용 기반 매칭 확장이 조건부로 필요하다.
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
  (`languageMatch: 'unknown'` — `cli/src/types.ts:201`, `cli/src/providers/resolve.ts:130-134`; 
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
- **reviewer의 PR #63 검토 반영(3건)**: (1) `Pyrefly`(1.2.0, reviewer 측정)가 (A)·(B) 모두 통과하고
  같은 `Depends()` 모양 케이스에서 `[]`를 반환한다는 사실, `ty`의 확정 탈락 근거(GitHub issue #1976),
  `Zuban`의 미확정 탈락 가능성을 출처와 함께 새 절로 기록하고 "확인하지 못한 것"에 후보군 범위 한
  줄을 추가 — 후보군이 4개로 닫혀 있다는 인상을 주지 않도록 했다. (2) 미결 1을 `pyright`/`basedpyright`
  2자 선택에서 `Pyrefly`를 포함한 3자 선택으로, 미결 2에 Pyrefly의 다른 배포 형태(컴파일 Rust
  바이너리) 때문에 tarball 크기 실측 대상이 하나 더 있다는 것을 반영. (3) Pyrefly의 `[]`를 null/`[]`
  절의 각주가 아니라 "provider마다 이미 다른 값을 낸다"는 실측 근거로 승격하고, 이 데이터가 미결 3의
  세 방향 판단에 어떻게 걸리는지 한 줄 추가(방향을 확정하지는 않았다). 부수적으로 `resolve.ts` 인용
  범위(`130-132` → `130-134`)를 작업 로그와 본문 사이에서 통일했다.
- **정정(2026-09-02, 같은 날 뒤이은 review 라운드에서 뒤집힘)**: 바로 위 문단의 "미결 2에 Pyrefly의
  다른 배포 형태 때문에 tarball 크기 실측 대상이 하나 더 있다"는 그 시점엔 Pyrefly가 npm에도
  배포된다는(잘못된) 전제 위에 있었다. 아래 세 번째 review 라운드에서 Pyrefly가 npm에 배포되지
  않는다는 것이 확인되면서 이 전제 자체가 없어졌다 — Pyrefly는 애초에 bundled 후보가 아니므로 tarball
  실측 대상도 아니다. 원문은 지우지 않고 여기 정정만 남긴다.
- **commander·reviewer의 PR #63 검토 세 번째 라운드 반영(3건, 전부 문서만, 코드 무변경)**:
  1. **번들 실측 대상 자체가 틀렸었다(commander 오류 자인 및 정정).** `cli/package.json`의 `files`가
     `node_modules`를 포함하지 않아 tarball 자체는 의존성 추가로 거의 커지지 않는다는 것을
     commander가 pinned release tarball을 직접 열어 확인했고(75,059 bytes, 31 entries, node_modules
     0개), 이 lane도 `npm pack --dry-run`으로 같은 구조를 재현했다(31 files, node_modules 없음).
     "release-fallback이 매번 tarball을 내려받는다"도 부정확해서 `INSTALL.md:184`("최초 실행 시...
     네트워크 접근이 필요할 수 있습니다")로 근거를 바로잡았다(commander가 인용한 `README.md:271`은
     이 checkout에 없어 이 lane이 직접 찾았다) — `npm exec --offline` 재현으로 캐시 재사용도 직접
     확인했다. 실제 비용은 tarball 크기가 아니라 **첫 실행 install closure 증가분**으로 재정의했고,
     commander가 조회한 4개 패키지 `dist.unpackedSize` ballpark(참고용, 재현 확인함)를 근거·한계와
     함께 기록했다.
  2. **Pyrefly는 npm에 배포되지 않는다 — bundled 후보가 될 수 없다.** reviewer가 처음 "pip+npm
     배포"라고 적은 것은 검증 없는 일반화였고(본인이 review 중 재확인: npm 명령을 실행한 적이
     없었다), commander가 `npm view pyrefly versions`(→ `["0.0.1-security"]`)와 대안 이름 6종 전부
     404를 확인했다. 이 lane도 같은 명령들과 PyPI JSON API(1.2.0, 플랫폼별 wheel 11종 + sdist)로
     세 번째로 독립 재확인해 "확인되지 않음"이 아니라 "배포되지 않는다"로 문서에 확정했다. 이에 따라
     미결 1(3자 선택)과 미결 2(bundled vs verified-external)가 독립이 아니라 미결 2가 미결 1을
     제약한다는 의존 관계를 추가했다.
  3. **readiness 절이 설계 과제와 검증 과제를 뒤바꿔 적고 있었다(commander 정정).**
     `ReadinessSignal.titlePattern`이 이미 optional이고(`preset.ts:91`), `undefined`면 title 필터링을
     생략한다는 것이 구현에 그대로 있다(`readiness.ts:35-37,151`) — 이 lane이 두 위치를 직접 읽어
     확인했다. "빈 title에 매칭하도록 설계를 확장해야 한다"는 이전 문장은 틀렸다: `titlePattern`을
     생략하면 된다. 진짜 남는 것은 이 lane이 이미 괄호로 적어 뒀던 검증 질문 하나
     (pyright/basedpyright가 다른 목적의 progress도 보내는가) 뿐이라는 것을 명시하고, 설계 확장은
     그 검증이 실패했을 때만 필요한 조건부 경로로 순서를 뒤집었다.
