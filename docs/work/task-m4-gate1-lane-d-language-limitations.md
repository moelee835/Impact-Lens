# M4 gate 1 lane D: 언어별 한계 문서를 실측으로 고정한다 (branch `feat/il-lim-001-gate1-lang-limitations`)

## 목적과 사용자 가치

Impact Lens는 언어마다 `catalog.ts`의 `docs.limitations`에 "이런 호출은 우리가 못 찾습니다"라고
적어 놓는다. 사용자는 그 문장을 읽고 **"그러면 나머지는 다 찾았겠구나"**라고 신뢰한다 - 그런데
이 문서를 처음 쓴 이후로 자동으로 다시 확인하는 장치가 있는 언어는 C++ 하나뿐이다(clangd 버전이
바뀌며 실제로 동작이 달라진 것을 `clangdIntegration.test.ts`가 잡아냈다 - virtual dispatch 절
참고). 나머지 언어의 한계 문장은 **한 번 적힌 뒤로 아무도 다시 재지 않는다.** 언어 서버가 새
버전에서 동작을 바꿔도 문서는 그대로 남는다 - 이게 가정이 아니라 C++에서 이미 실제로 일어난
일이다.

이 lane은 `IL-LIM-001` 수용 기준 5번(언어별 한계가 최신 상태로 유지된다)을 닫는다. 이 lane이
끝나면:
- `runtime-observation`처럼 "만들 코드가 없다"는 문서 주장이 실행으로 강제된다(D1).
- preset이 실재하는 네 언어(TS/JS, Python, Go, C) 각각 대표 gap 하나가 `clangdIntegration.test.ts`
  수준(실제 서버, 실제 fixture, 실제로 관측된 동작)으로 올라간다(D2).
- **이 lane 자체의 실측에서 이미 하나(Go)가 현재 문서와 다른 결과를 냈다** - 아래 "D2" 절 참고.
  이건 이 lane의 실패가 아니라 정확히 이 lane이 존재하는 이유다.

## 범위

- 포함: TS/JS(`bundled-typescript`), Python(`bundled-pyright`), Go(`gopls`), C(`clangd`) 네 preset
  각각 대표 gap 하나. `AUGMENTED_EDGE_SOURCES`의 `runtime-observation` 0-producer 고정(D1).
- 제외(commander 지시): Swift·Kotlin(provider 자체가 없음 - `IL-LIM-015`/`016`으로 이월),
  gate C(별도 lane), `dynamic-callback-static-v1`의 `maxFiles` 유도(별도 lane).
- 새 CI job을 만들지 않는다 - `go-provider`/`clangd-provider`가 이미 3개 OS에서 실제 서버를
  돌리고, bundled TS·pyright는 모든 CI 실행에서 무조건 돈다(commander 확인).

## D1 — `runtime-observation`의 0-producer를 실행으로 고정 (구현 완료)

`stateReachability.sources.test.ts`가 이미 `AnalysisObservations` 필드마다 하는 것과 같은
감사(텍스트 스캔으로 production producer 유무를 확인, `UNREACHABLE_SEMANTIC_SCOPES`가
`semantic.scope: 'static-plus-observation'`에 대해 이미 하는 것과 정확히 같은 기법)를
`AugmentedEdge.evidenceSource`까지 확장했다 - 새 harness가 아니라 기존 것 재사용(commander 지시).

- `UNREACHABLE_EDGE_SOURCES` 목록 신설(`{ edgeSource: 'runtime-observation', ... }`), 새 테스트
  `nothing outside tests and types.ts produces AugmentedEdge.evidenceSource === "runtime-observation"`
  추가.
- **뮤테이션 검증**: `fastapiDependencyAdapter.ts`의 `evidenceSource: 'static-inference'`를 일시적으로
  `'runtime-observation'`로 바꿔 재빌드·재실행 - 새 테스트 정확히 1개만 실패, 다른 테스트는 그대로
  통과 확인. 원복 후 재통과 확인.
- 전체 재검증: `npm run cli:test` 505/508 pass(3 skip, 기존과 동일 - gopls 실환경 skip), `npm test`
  84/84, `npm run test:response-policy` 38 checks 통과. 회귀 없음.

`IL-LIM-001` 4단계(또는 어떤 후속 lane)가 언젠가 실제로 `runtime-observation`을 만드는 producer를
추가하는 순간 이 테스트가 먼저 깨진다 - `types.ts`의 문서 주석과 `docs/work/
task-m4-il-lim001-002-inference-limitations.md`의 "유령 vs 미측정" 판정 모두 이 테스트가 계속
참인 동안에만 유효하다.

## D2 — 언어별 대표 gap: 먼저 재고, 그 다음 fixture를 설계한다

**문서가 주장하는 것을 확인하러 가지 않았다 - 실제로 무엇이 일어나는지 재는 것부터 했다.**
아래 넷 모두 이번 세션에서 실제로 설치된 provider(bundled TS/pyright는 이미 있음, `gopls
v0.19.1`은 `go install golang.org/x/tools/gopls@v0.19.1`로 이 lane에서 새로 설치, `clangd`는
이미 시스템에 Apple 17.0.0 설치돼 있음 - catalog.ts가 이미 검증한 버전과 동일)로, 빌드된
`cli/dist/index.js`를 통해 실제 요청을 보내 얻은 결과다. fixture는 아직 짜지 않았다 - 스크래치
디렉터리에 최소 재현 파일만 두고 CLI를 직접 호출했다.

### TS/JS — `bundled-typescript`(typescript-language-server 6.0.0)

**현재 문서**: `'Dynamic dispatch and reflection-based calls are not part of the Call Hierarchy
result.'` - 근거 인용 없음, 다섯 문장 중 가장 얇음(commander 지적, 이 마일스톤이 가장 많이 작업한
언어인데도).

**실측한 두 구성**(같은 파일, `fixtureTarget`을 향한 두 개의 서로 다른 참조):
```ts
const methods: Record<string, () => number> = { run: fixtureTarget };
export function fixtureCaller(): number { return methods['run'](); }

export function fixtureCallerReflect(): number {
  return Reflect.apply(fixtureTarget, undefined, []);
}
```
**결과**: `fixtureTarget`의 incoming callers = `[]` (0건). 두 구성 모두 잡히지 않았다 - **현재
문서 그대로 맞다.**

**대표 gap 제안**: 이 두 구성(computed-property 호출 + `Reflect.apply`)을 그대로 반복 fixture로
승격한다 - 근거가 없던 문장에 실제 provider 근거를 처음으로 붙이는 것 자체가 이 언어의 산출물이다.

### Python — `bundled-pyright`(1.1.413)

**현재 문서**: `'Calls made only through reflection or other runtime-constructed dispatch are not
part of the Call Hierarchy result.'` - 근거 인용 자체가 없음(commander 지적).

**실측한 구성**:
```python
def fixture_caller():
    return getattr(target, 'fixture_target')()
```
**결과**: `fixture_target`의 incoming callers = `[]` (0건). **현재 문서 그대로 맞다.**

**대표 gap 제안**: `getattr(module, name_string)()` 구성을 반복 fixture로 승격, `pythonFastapiIntegration.test.ts`가 이미 하는 실제 fixture end-to-end 검증 수준에 맞춘다.

### C — `clangd`(Apple 17.0.0, catalog.ts가 이미 검증한 버전과 동일)

**현재 문서**: 함수 포인터 호출은 Call Hierarchy에 안 잡히고, 포인터 자신의 대입 지점만 참조로
나타날 수 있다 - stage 4의 **1회성 probe** 하나로만 근거가 있고, 반복 fixture가 없다(commander
지적).

**실측한 구성**:
```c
void fixture_target(void) {}
void fixture_caller(void) {
    void (*fp)(void) = fixture_target;
    fp();
}
```
**결과**: `fixture_target`의 incoming callers = 1건, 그런데 callSite가 가리키는 위치는 `fp()`
호출 줄(line 6)이 아니라 **`void (*fp)(void) = fixture_target;`(line 5, 대입 지점)**이다 -
**stage 4가 원래 관측한 것과 정확히 같은 모양**: 포인터를 통한 진짜 간접 호출은 안 잡히고, 대입
지점만 "참조"로 뜬다. 오늘의 clangd 17.0.0으로 재확인해도 결과가 그대로다.

**대표 gap 제안**: 이 구성을 그대로 반복 fixture로 승격한다 - 1회성 probe였던 것을
`clangdIntegration.test.ts`와 같은 파일에 실제 fixture로 추가해, 향후 clangd 버전이 바뀔 때
virtual dispatch 절과 같은 방식(버전별 분기, 미측정 버전은 명시적으로 실패/skip)으로 잡히게 한다.

### Go — `gopls v0.19.1`(catalog.ts의 `lastVerified`가 이미 검증한 버전과 동일) — **가장 중요한 발견: 현재 문서가 과장이다**

**현재 문서**: `'Calls made only through reflection are not part of the Call Hierarchy result.'` -
stage 2의 1회성 직접 probe 하나로만 근거가 있고, 반복 fixture가 없음(commander 지적).

**세 구성을 실측했고, 결과가 갈렸다** - C++ virtual dispatch와 정확히 같은 모양의 발견이다.

**구성 1 - `reflect.ValueOf(식별자).Call(...)`** (가장 흔한 "리플렉션으로 호출" 코드 모양):
```go
func FixtureCaller() int {
	v := reflect.ValueOf(FixtureTarget)
	result := v.Call(nil)
	return int(result[0].Int())
}
```
**결과**: `FixtureTarget`의 incoming callers = **1건**, callSite가 정확히 `reflect.ValueOf(` 안의
`FixtureTarget` 식별자 위치를 가리킨다. **문서 주장과 반대다 - 이 모양의 리플렉션 호출은 실제로
Call Hierarchy 결과에 잡힌다.**

**구성 2 - 순수 참조, 호출 전혀 없음** (음성 대조가 아니라 원인 규명용):
```go
var storedRef = FixtureTarget
func FixtureCaller() int {
	var f func() int = FixtureTarget
	_ = f
	return 0
}
```
**결과**: 역시 **2건** 잡힘(두 참조 모두). **호출을 아예 안 해도 잡힌다** - 즉 구성 1이 잡힌 건
"리플렉션 호출을 gopls가 특별히 추적해서"가 아니라, **gopls의 `callHierarchy/incomingCalls`가
함수 이름에 대한 어떤 종류의 텍스트/심볼 참조든(대입, 변수 초기화, 함수 값으로 전달 등 - 실제
호출 여부 무관) "호출"로 보고하기 때문**이다. 참조가 전혀 없는 음성 대조(빈 `fixture_caller`
본문)는 0건으로 정상 확인.

**구성 3 - 진짜 이름-문자열 리플렉션**(`MethodByName`, 소스에 정적 식별자 참조가 아예 없음):
```go
func FixtureCaller() int {
	v := reflect.ValueOf(Fixture{})
	m := v.MethodByName("FixtureTarget")
	result := m.Call(nil)
	return int(result[0].Int())
}
```
**결과**: `FixtureTarget`의 incoming callers = **0건**. **이 모양은 문서 주장대로 안 잡힌다.**

**결론**: 현재 문서의 `"Calls made only through reflection are not part of the Call Hierarchy
result."`는 **형태를 구분하지 않은 과장**이다 - 정확히 C++ 사례("virtual dispatch는 절대 안
잡힌다"던 것이 버전에 따라 갈린 것)와 같은 종류의 결함이고, 이번엔 버전이 아니라 **리플렉션의
구체적 형태**가 갈림축이다:
- 식별자를 직접 참조해 함수 값을 얻은 뒤 그 값을 리플렉션으로 호출하는 흔한 모양
  (`reflect.ValueOf(FixtureTarget)`)은 **gopls가 실제로 잡는다** - 다만 "진짜 호출을 이해해서"가
  아니라 gopls의 `incomingCalls`가 **호출 여부와 무관하게 모든 참조를 "호출"로 보고하는** 더 넓은
  동작의 부수 효과다(구성 2가 이걸 증명한다).
- 이름을 문자열로만 지목하는 진짜 리플렉션(`MethodByName("FixtureTarget")`)은 **문서 주장대로
  안 잡힌다** - 소스에 그 이름에 대한 정적 참조 자체가 없기 때문이다.

## 네 provider 교차 대조 — commander 지시: "gopls만의 결함인가, 일반적 동작인가"

commander의 지적: 이 저장소에 이미 **반대 방향 증거**가 있다 - pyright preset의 `docs.limitations`는
FastAPI route handler/`Depends()` 대상이 "프레임워크가 실제로 호출하지만 분석 코드 안에 호출
표현식이 없어서 Call Hierarchy에 안 잡힌다"고 적고, 이는 실제 계측(instrumented FastAPI + wire
수준)으로 뒷받침돼 있다 - 즉 **pyright는 참조만으로는 caller로 안 잡는다는 이미 검증된 전례가
있다.** 그러면 gopls와 pyright가 `incomingCalls`의 의미 자체를 다르게 구현하고 있다는 뜻이 되고,
이건 이 제품의 가장 근본적인 필드(`edges`)에서 일어나는 일이라 gopls 하나만의 일화로 남겨둘 수
없다.

**같은 대조(호출은 전혀 없이 값으로만 참조)를 네 provider 모두에 돌렸다**(기존 fixture 재사용,
비용 저렴):

| provider | 대상 언어 | "호출 없이 참조만" 케이스 | 결과 |
| --- | --- | --- | --- |
| bundled-typescript 6.0.0 | TS/JS | `const stored = fixtureTarget;` / `const f: () => number = fixtureTarget; void f;` | **0건 - 참조를 caller로 안 잡음** |
| bundled-pyright 1.1.413 | Python | `stored_ref = target.fixture_target` / `f = target.fixture_target` (호출 없음) | **0건 - 참조를 caller로 안 잡음** |
| gopls v0.19.1 | Go | `var storedRef = FixtureTarget` / `var f func() int = FixtureTarget; _ = f` | **1건(각각) - 참조 자체를 caller로 잡음** |
| clangd 17.0.0 | C | `void (*fp)(void) = fixture_target; (void)fp;` (호출 전혀 없음) | **1건 - 참조(대입 지점) 자체를 caller로 잡음** |

**결론 - gopls만의 결함이 아니다. 두 provider군이 `incomingCalls`의 의미를 다르게 구현한다.**
`gopls`와 `clangd`(둘 다 `verified-external` tier, 외부 LLVM/Go 툴체인 바이너리)는 **참조 자체를
caller로 보고**하고, `bundled-typescript`와 `bundled-pyright`(둘 다 `bundled` tier, npm 패키지)는
**진짜 호출 표현식만** caller로 잡는다. **같은 모양의 코드(호출 없이 함수를 값으로만 참조)가
언어에 따라 다른 답을 받는다** - 사용자에게는 provider 구현 세부가 아니라 이 제품이 보이는
행동이므로, 이건 언어 하나의 문제가 아니라 이 제품 전체의 provider-간 일관성 문제다.

**C 쪽은 사실 이미 정확하게 적혀 있었다** - 기존 문서 문장(`'...only the pointer's own assignment
site may appear as a reference.'`)이 "caller로 확정된다"가 아니라 "참조로 나타날 *수도* 있다"는
더 약한 표현을 이미 쓰고 있다. Go의 기존 문장(`'Calls made only through reflection are not part of
the Call Hierarchy result.'`)만 이 nuance 없이 "안 잡힌다"로 무조건 단정하고 있었다 - 즉 이번
발견은 "Go만 이상하다"가 아니라 "**Go의 문서만 clangd가 이미 하고 있는 정확한 표현 방식을
따라가지 못했다**"는 것에 더 가깝다.

**Q1 답 (commander 방향 확정, 반영 완료)**: C의 macro/virtual-dispatch 절과 같은 형식으로
갈랐다 - 정적 식별자 참조가 있는 리플렉션(잡힘, 그런데 "리플렉션을 이해해서"가 아니라 "참조를
호출로 보고해서")과 이름-문자열 리플렉션(안 잡힘, 정적 참조 자체가 없어서)을 구분하고, 전자를
"잡힌다"고만 쓰지 않고 이유(참조 보고, 진짜 호출 이해 아님)까지 명시한다 - 아래 "제안 문장" 절.

**Q2 답 (commander 확정)**: **수정은 별도 lane, 기록·문서화는 이번 lane.** 이유-
- 결함 종류가 다르다: 이 lane은 과소 보고(gap), 이건 과다 보고(존재하지 않는 caller를 있다고
  믿게 함) - 정반대 방향.
- 영향 범위가 다르다: augmentation이 아니라 `edges` 자체 - M4가 계약을 안 건드리기로 한 그 필드다.
- 고치는 방법이 자명하지 않다(필터링? 라벨링? `edges`의 계약 변경?) - 측정 없이 정할 문제가
  아니다.
- **다만 문서화는 미루지 않는다** - "알면서 출하하는 것이 문서 불일치보다 나쁘다"(commander).
  사용자가 알아야 할 사실: **"Go/C에서 caller로 보고된 항목 중 일부는 실제 호출이 아니라
  참조일 수 있다."** `docs.limitations`는 원래 "안 잡히는 것" 목록이라 이 범주(과다 보고)가
  안 맞는다 - 별도 필드나 섹션이 필요하다는 뜻으로, 아래 "문서화 위치" 절에서 제안한다.

reviewer에게 Go 발견의 독립 재현을 별도로 요청했다(commander) - 사용자 문서에 들어갈 주장이라
한 세션의 측정만으로 확정하지 않는다는 방침.

## 제안 문장 (Q1 반영, commander/reviewer 확인 대기)

**Go, 갈라 적는 안**:
> Calls made only through reflection using a runtime-obtained method name (`reflect.Value.
> MethodByName("...")`, no static identifier reference to the target in source) are not part of
> the Call Hierarchy result. Calls made by capturing a function value through a direct identifier
> reference and invoking it reflectively (`reflect.ValueOf(target).Call(...)`) DO appear, but not
> because gopls resolves the reflective call - gopls's incomingCalls reports any reference to a
> function name (assignment, variable capture, argument passing) as a caller regardless of whether
> that reference is ever actually invoked (confirmed directly: a call-free reference alone produces
> the identical result). A reported caller for this preset is therefore not proof an actual call
> exists at that site.

**C, 기존 문장 보강 안**(구조는 유지, 과다-보고 성격을 명시적으로 연결):
> Calls made only through a function pointer invocation are not part of the Call Hierarchy result;
> only the pointer's own assignment site may appear as a reference - even when the pointer is never
> actually called through (confirmed directly: an assignment with no subsequent call produces the
> identical result). The same reference-reported-as-caller behavior gopls exhibits for Go reflection
> applies here.

## 문서화 위치 제안 (과다 보고, 별도 lane에서 수정 - 이번 lane은 기록만)

`docs.limitations`는 "무엇이 안 잡히는가"만 나열하는 배열이라 "잡히지만 진짜 호출이 아닐 수
있다"는 반대 방향 사실을 넣기엔 범주가 안 맞는다(commander 지적). 두 후보:
1. `ProviderPreset.docs`에 `limitations`와 나란한 새 필드(예: `callerReliability` 또는 유사한
   이름)를 추가해 gopls/clangd만 채운다 - 계약 변경이라 `il-contract-architect`가 설계해야
   한다.
2. 우선은 `docs.install` 옆 또는 `docs.limitations` 배열 자체에, 다른 항목과 다른 서술
   방향("안 잡힘"이 아니라 "잡히지만 확정 아님")임을 명시한 문장 하나를 추가 - 계약 변경 없이
   기존 배열 재사용, 다만 배열의 기존 "이건 전부 부재 목록" 암묵적 계약을 깨는 것이라 사용자
   문서(README 등)에서 이 배열을 읽는 쪽의 가정도 같이 확인해야 한다.
이 lane은 어느 쪽도 아직 구현하지 않는다 - commander가 "수정은 별도 lane"이라고 확정했으므로,
이번 lane은 위 "제안 문장" 두 개를 실제 `catalog.ts`에 반영하는 것까지만 하고, 과다-보고 자체를
알리는 새 필드/구조는 만들지 않는다(그 결정 자체가 별도 lane의 설계 대상).

## 다음 단계

1. ~~Go의 두 축(과소-보고 vs 과다-보고) 처리 방향 확인~~ **완료** - Q1/Q2 모두 commander가
   확정했다.
2. reviewer의 Go 발견 독립 재현 대기 - 그 결과를 반영한 뒤 `catalog.ts`를 갱신한다(위 "제안 문장"
   그대로, reviewer 재현이 다른 결과를 내면 그에 맞게 수정).
3. 네 언어 모두 `clangdIntegration.test.ts` 수준의 반복 fixture(실제 서버, 실제 파일, 버전 분기 -
   gopls/clangd는 버전별 분기, bundled TS/pyright는 "이 pin에서 관측했다"로 단순화) 작성 - TS/JS·
   Python·C는 기존 문장을 그대로 확인하는 fixture, Go는 갈라 적은 두 문장을 각각 증명하는
   fixture.
4. `catalog.ts`의 `docs.limitations` 문장 갱신 - Go는 갈라 적기, C는 "호출 없이도 재현됨" 근거
   보강, TS/JS·Python은 근거 인용만 추가.
5. 전체 재검증(`cli:test`/`test`/`test:response-policy`), commit, push, PR.
6. (별도 lane, 이번 범위 밖) 과다-보고 자체를 사용자에게 어떻게 알릴지 설계 - `il-contract-
   architect` 필요 여부부터 판단.

## 스크래치 측정 재현 방법 (다음 사람을 위해)

```
export PATH="$PATH:$(go env GOPATH)/bin"   # go install golang.org/x/tools/gopls@v0.19.1로 설치한 gopls
node cli/dist/index.js analyze --stdin <<< '{"workspace":"<fixture-dir>","file":"<file>","line":N,"column":N,"depth":5,"maxNodes":50}'
```
네 언어의 스크래치 fixture는 세션 scratchpad(`lane-d-probe/{ts,py,go,go2,c}`)에 있다 - 저장소에는
커밋하지 않았다(반복 fixture로 정식 승격하기 전까지는 임시물).
