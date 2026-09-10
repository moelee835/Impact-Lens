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

**결론 - gopls만의 결함이 아니다. 네 provider 중 gopls와 clangd는 참조 자체를 caller로 보고하고,
bundled-typescript와 bundled-pyright는 진짜 호출 표현식만 caller로 잡는다.**

**2026-09-10 commander 정정 - tier로 귀속하지 않는다.** 앞 버전은 이 경계를 `verified-external`
tier(gopls/clangd, 외부 바이너리) vs `bundled` tier(TS/pyright, npm 패키지)로 설명했다 -
**틀린 일반화다.** n=4에 2대2인 표본에서 나온 겹침이지, tier(바이너리를 어떻게 배포하는가)와
`incomingCalls`를 어떻게 구현하는가 사이에 확인된 인과관계는 없다. 이대로 문서에 적으면 다음에
추가되는 external provider(예: 다른 언어의 LSP 서버)에 대해 아무도 재지 않은 예측을 하는 셈이고,
이 저장소가 반복해서 잡아 온 과잉 일반화와 정확히 같은 모양이다. **그래서 이 결과는 tier가 아니라
네 provider의 이름으로만 적는다: gopls와 clangd는 참조를 caller로 보고하고, bundled-typescript와
bundled-pyright는 안 한다. tier 경계와 겹친다는 관찰 자체는 흥미롭지만, 우연일 수 있고 인과는
확인되지 않았다는 점을 함께 적는다.**

**C 쪽은 사실 이미 정확하게 적혀 있었다 - 이번 측정에서 두 번째로 중요한 발견이다.** 기존 문서
문장(`'...only the pointer's own assignment site may appear as a reference.'`)이 "caller로
확정된다"가 아니라 "참조로 나타날 *수도* 있다"는 더 약한 표현을 이미 쓰고 있다. 이 표현을 쓴
사람은 이 동작을 실제로 봤다 - "caller로 잡힌다"고 안 하고 "참조로 나타날 수 있다"고 약하게
쓴 것이 우연일 리 없다. **즉 이 동작은 이 저장소에서 이미 한 번 관측됐고, C 문장에만 살아남아
있었다.** Go의 기존 문장(`'Calls made only through reflection are not part of the Call Hierarchy
result.'`)만 같은 nuance 없이 "안 잡힌다"로 무조건 단정했다. **이건 "Go 문서가 틀렸다"보다
더 근본적인 문제다 - 같은 관측이 한 언어의 문서에만 보존되고 다른 언어로 전파되지 않았다는
뜻이다.** 다음에 다섯 번째 언어를 추가하는 사람이 C의 정확한 표현을 참고하지 않으면 같은 누락을
반복할 수 있다 - 그래서 이 사실 자체(관측이 문서 간에 전파되지 않는다)를 이 작업 문서에 별도로
남긴다. `docs.limitations`는 언어별로 각자 작성되는 배열이라, 한 언어가 얻은 정확한 교훈이
다른 언어에 자동으로 반영될 메커니즘이 이 저장소에 없다 - 이건 이 lane의 fixture로 고칠 수 있는
문제가 아니라, 다음에 언어를 추가하는 사람에게 남기는 기록이다.

### 심각도 재서술 — 2026-09-10 commander 정정: "없는 caller"가 아니라 "잘못된 라벨"

앞 버전은 이 발견을 "존재하지 않는 caller를 있다고 믿게 한다"고 적었다 - **과장이다.** 참조는
진짜 의존 관계다: `FixtureTarget`을 값으로 넘기는 코드는 그 함수의 시그니처가 바뀌면 실제로
깨진다. 영향도 분석 관점에서 그 관계는 봐야 하는 게 맞다 - **관계 자체는 실재한다.**

**실제 결함은 조작이 아니라 라벨이다.** 제품이 그것을 "호출"이라고 부른다. 사용자는 "이 함수는
3곳에서 호출된다"고 읽지만 실제로는 2곳에서 호출되고 1곳에서는 참조만 된다 - 이건 "가짜
관계"보다는 덜 심각하지만 여전히 거짓이다. M4가 `edges`(확정)와 `augmentedEdges`(후보)를 가른
이유 전체가 관계의 성격을 정확히 말하는 것이었는데, 이 발견은 `edges` 안에서도 "호출"과 "참조"라는
서로 다른 성격의 관계가 같은 라벨 아래 섞여 나온다는 것이다. 문서 문안은 이 정확도로 써야 한다 -
"없는 호출자가 나온다"가 아니라 **"호출자로 보고된 항목 중 일부는 호출이 아니라 참조이며, 관계
자체는 실재하지만 성격이 다르다"**로.

**Q1 답 (commander 방향 확정, 반영 완료)**: C의 macro/virtual-dispatch 절과 같은 형식으로
갈랐다 - 정적 식별자 참조가 있는 리플렉션(잡힘, 그런데 "리플렉션을 이해해서"가 아니라 "참조를
호출로 보고해서")과 이름-문자열 리플렉션(안 잡힘, 정적 참조 자체가 없어서)을 구분하고, 전자를
"잡힌다"고만 쓰지 않고 이유(참조 보고, 진짜 호출 이해 아님)까지 명시한다 - 아래 "제안 문장" 절.

**Q2 답 (commander 확정)**: **수정은 별도 lane, 기록·문서화는 이번 lane.** 이유-
- 결함 종류가 다르다: 이 lane은 과소 보고(gap), 이건 라벨 부정확(호출과 참조가 같은 이름
  아래 섞임) - 위 "심각도 재서술" 절 참고, 방향은 다르지만 "없는 관계"가 아니라 "성격이 다른
  진짜 관계"다.
- 영향 범위가 다르다: augmentation이 아니라 `edges` 자체 - M4가 계약을 안 건드리기로 한 그 필드다.
- 고치는 방법이 자명하지 않다(필터링? 라벨링? `edges`의 계약 변경?) - 측정 없이 정할 문제가
  아니다.
- **다만 문서화는 미루지 않는다** - "알면서 출하하는 것이 문서 불일치보다 나쁘다"(commander).
  사용자가 알아야 할 사실은 위 "심각도 재서술"의 정확한 문안대로: **"Go/C에서 호출자로 보고된
  항목 중 일부는 호출이 아니라 참조이며, 관계 자체는 실재하지만 성격이 다르다."**
  `docs.limitations`는 원래 "안 잡히는 것" 목록이라 이 범주(반대 방향 서술)가 안 맞는다 -
  아래 "문서화 위치" 절에서 임시 경로와 별도 이슈 분리를 제안한다.

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

## 문서화 위치 제안 — 2026-09-10 commander 확정: 계약 변경 없이 가장 싼 경로로 지금 도달시킨다

`docs.limitations`는 "무엇이 안 잡히는가"만 나열하는 배열이라 "잡히지만 성격이 다른 관계다"라는
반대 방향 서술을 넣기엔 범주가 안 맞는다(commander 지적, 유지). 두 후보를 남겨 둔다:
1. `ProviderPreset.docs`에 `limitations`와 나란한 새 필드(예: `callerReliability` 또는 유사한
   이름)를 추가해 gopls/clangd만 채운다 - 계약 변경이라 `il-contract-architect`가 설계해야
   한다.
2. `docs.limitations` 배열 자체에, 다른 항목과 서술 방향이 반대("안 잡힘"이 아니라 "잡히지만
   성격이 다름")임을 문장 자체와 주석 양쪽에 명시한 항목 하나를 추가 - 계약 변경 없음.

**commander 확정**: **이번 lane은 2번(계약 변경 없는 경로)으로 사실을 지금 사용자에게
도달시킨다** - "알면서 출하하는 것이 문서 불일치보다 나쁘다"는 원칙 때문에 사실 전달 자체를
별도 lane까지 미루지 않는다. `catalog.ts`의 Go/C `docs.limitations` 배열에 이 항목을 추가할 때,
그 항목 바로 위에 **왜 이게 임시인지**(이 배열은 원래 "부재 목록"이라 반대 방향 서술을 넣는 것
자체가 배열의 암묵적 계약과 안 맞고, 정식 필드는 `il-contract-architect`가 설계할 별도 lane의
몫이라는 것)를 코드 주석으로 명시한다. 1번(정식 계약 변경)은 만들지 않는다 - 그 결정 자체가
별도 lane의 설계 대상이다.

**범위 정정 - 이건 gate 1을 넘는다(commander).** `edges`의 "호출" 라벨이 provider에 따라 다른
성격의 관계(호출 vs 참조)를 가리킨다는 사실은 M4의 어느 gate에도 걸려 있지 않다 - 언어별 한계
문서 최신화(gate 1)가 아니라 `edges` 계약 자체의 정확성 문제다. **별도 이슈로 뗀다**(가칭
`edges`의 caller/reference 라벨 부정확 - gopls·clangd) - commander가 마일스톤 판정에서 별도로
다룬다. 이 lane은 이 이슈를 발견하고 최소 서술로 사용자에게 알리는 것까지만 하고, 이슈 자체의
해결(필터링/라벨링/계약 변경)은 다루지 않는다.

## reviewer 독립 재현 — Go+C 둘 다 확인, agent 지시 문서 두 곳에서 추가 결함 발견

reviewer가 이 lane의 fixture를 재사용하지 않고 **자기 fixture로, `gopls`도 새로 설치해** 네
provider를 직접 재현했다 - 결과는 이 lane의 표와 일치. 그리고 이 lane이 아직 안 본 것을
찾았다:

- **`clangd`도 Go와 같은 급이다.** reviewer 실측: 호출 없는 포인터 대입(`int (*pure_reference)
  (int) = fixture_target;`)이 응답에서 `relation: direct`로 나온다 - **실제 호출자와 응답
  형태로 구분이 안 된다.** 기존 C 문서 문장은 이 동작의 **존재**만 정확히 언급했지("참조로
  나타날 수 있다"), **"호출자와 구분 안 된 채로 나온다"는 심각도**는 적지 않았다. → 이 발견
  이후로 이 lane의 기록 범위는 **Go 하나가 아니라 Go+C 둘**이다(아래 "제안 문장"/문서 수정
  모두 이미 둘 다 다룬다 - 위 절 참고).
- **agent 지시 문서 두 곳에 `data.edges`를 "confirmed"라고 명시적으로 단언하는 문장이 있다**:
  `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`와 `.../references/cli-contract.md`
  (`"data.edges` holds **confirmed callers**"`). 이건 agent에게 "이건 확정된 호출자다"라고
  가르치는 문서이고, 네 언어 중 둘(Go/C)에서 그 단언이 거짓이다. **문장을 지우지 않고 각주를
  달았다** - 두 bundled provider(TS/JS, Python)에서는 여전히 참이기 때문이다. 반영 내용은 아래
  "반영 완료" 절 참고.
- **`README.md`의 유일한 경계 문구(`## 분석 경계`)가 방향이 반대였다** - "실제 관계가 그래프에
  없을 수 있다"(과소보고)만 경고했고, "그래프에 있는 게 실제로는 호출이 아닐 수 있다"(과다보고)는
  전혀 없었다. **새 주장이 아니라 반쪽만 적힌 기존 경계 문구를 완성한 것**으로 반영했다.

**SKILL.md:76 - 부분 인용 경고에 따라 전체 맥락 확인함.** commander에게 전달된 인용은
`"never use the bare word 'caller'... for a confirmed result"`뿐이었지만, 전체 문장은
`data.augmentedEdges`(후보)를 `data.edges`(확정)와 같은 문장에서 섞어 부르지 말라는, **이번
발견과 다른 규칙**이다(candidate/confirmed 혼동 방지 - 여전히 유효, 이번 발견으로 무효화되지
않음). 그래서 이 문장 자체는 고치지 않고, 바로 다음 줄에 Go/C 각주를 새 항목으로 추가했다 -
기존 규칙과 새 사실을 같은 문장에 억지로 합치지 않았다.

**응답 정책 eval 확인** - 문서 수정 후 `npm run test:response-policy` 재실행, **38개 체크 전부
그대로 통과**(회귀 없음). 이 각주들은 기존 forbidden-phrase/candidate-caller vocabulary 규칙이
찾는 정확한 문구를 그대로 보존하고 그 옆에 새 문장만 추가했으므로 계약 검사에 걸리지 않았다 -
"어긋나면 그게 이 발견이 계약 어휘까지 닿는다는 신호"(commander)였는데, 이번엔 안 어긋났다.

### 이 발견이 M4의 어느 gate에도 안 걸린다는 사실 자체 (commander 지시로 기록)

M4의 8개 gate 중 gate 4(adapter의 임의 승격 금지)와 gate 5(path convention이 가짜 edge를 만들지
않음)가 "caller/edge 정확성"에 가장 가깝지만, **둘 다 이 저장소 자신의 코드(adapter, path
resolution)에 대한 질문**이다. 이번 발견은 **provider가 돌려준 답 자체가 이 제품이 그 답에 붙인
이름과 다르다**는 것 - M4의 어느 gate도 "provider의 답이 우리가 그것에 붙인 이름과 일치하는가"를
묻지 않았다. 이 공백 자체가 마일스톤 판정에 들어가야 할 사실이라 여기 기록한다(commander가
마일스톤 판정에서 별도로 다룬다).

### 반영 완료 (이번 lane, 계약 변경 없음)

- `README.md`의 `## 분석 경계` IMPORTANT 문구에 과다보고 방향 추가(Go/gopls, C·C++/clangd 이름을
  대서 - tier로 귀속하지 않음).
- `cli/README.md`에 새 절 `data.edges`가 label a call - for two providers, a value reference can
  pass as one too" 추가 - 실측 근거·심각도 재서술 문안 전체.
- `plugins/impact-lens/skills/impact-lens-cli/SKILL.md`에 새 bullet 추가(기존 76번째 줄 문장은
  그대로 둠).
- `plugins/impact-lens/skills/impact-lens-cli/references/cli-contract.md`의 "confirmed callers"
  문장 바로 뒤에 각주 문단 추가(기존 문장도 그대로 둠).

## 다음 단계 — 전부 완료

1. ~~Go의 두 축(과소-보고 vs 과다-보고) 처리 방향 확인~~ **완료** - Q1/Q2 모두 commander가
   확정했다.
2. ~~reviewer의 Go 발견 독립 재현~~ **완료** - Go+C 둘 다 확인, agent 지시 문서 결함 추가 발견,
   위 절 반영 완료.
3. ~~네 언어 모두 반복 fixture 작성~~ **완료** - `cli/src/test/gate1LanguageLimitations.test.ts`
   신설(8 테스트: TS/JS 2, Python 2, Go 2, C 2). 실제 provider로 8/8 통과 확인(gopls v0.19.1,
   clangd Apple 17.0.0, bundled TS/pyright). Go의 "식별자 참조 리플렉션은 잡히지만 이유는 참조
   보고" 테스트는 뮤테이션으로 검증(순수 참조를 실제 호출로 바꿔 재현해 정확히 그 테스트만
   실패, 원복 후 재통과).
4. ~~`catalog.ts`의 `docs.limitations` 문장 갱신~~ **완료** - Go는 세 문장으로 분리(이름-문자열
   리플렉션 불가/식별자-캡처 리플렉션은 참조 보고로 인해 노출/`data.edges`의 caller 라벨
   부정확), C는 기존 문장 유지 + "호출 없이도 재현됨"과 "임시 항목" 주석 추가, TS/JS·Python은
   근거 인용 추가.
5. ~~전체 재검증~~ **완료** - `cli:test` 516/516(gopls PATH에 있어 이전 3개 skip도 포함해 전부
   실행·통과), `test`(Extension) 84/84, `test:response-policy` 38 checks. 회귀 없음.
6. ~~reviewer가 찾은 agent 지시 문서 두 곳(`SKILL.md`/`cli-contract.md`)의 "confirmed" 단언에
   각주, `README.md`의 경계 문구 완성~~ **완료** - 위 "반영 완료" 절 참고.
7. (별도 이슈, 이번 범위 밖) `edges`의 caller/reference 라벨 부정확(gopls·clangd) 자체의 해결
   (필터링/라벨링/계약 변경) - commander가 마일스톤 판정에서 별도로 다룬다.

## 스크래치 측정 재현 방법 (다음 사람을 위해)

```
export PATH="$PATH:$(go env GOPATH)/bin"   # go install golang.org/x/tools/gopls@v0.19.1로 설치한 gopls
node cli/dist/index.js analyze --stdin <<< '{"workspace":"<fixture-dir>","file":"<file>","line":N,"column":N,"depth":5,"maxNodes":50}'
```
네 언어의 스크래치 fixture는 세션 scratchpad(`lane-d-probe/{ts,py,go,go2,c}`)에 있다 - 저장소에는
커밋하지 않았다(반복 fixture로 정식 승격하기 전까지는 임시물).
