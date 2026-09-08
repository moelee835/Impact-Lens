# M4 gate 4 — 주된 잔여 오탐: segment 하나짜리 절대 import (branch `fix/m4-gate4-single-segment-import`)

**2026-09-08 정정**: 제목과 본문 일부가 원래 이걸 gate 4의 "마지막"/"유일하게 남은" 오탐 경로로
적었으나 틀렸다 — commander가 다중 segment 절대 import의 vendored-tree 충돌 잔여를 별도로 지적했다
(아래 "gate 4 판정" 절 참고). 이 문서가 다루는 것은 그 두 개 중 **더 흔하고 먼저 닫은 쪽**이다.

## 목적과 사용자 가치

**사용자 문제**: FastAPI 사용자가 라우터를 파일마다 나눈 다중 라우터 프로젝트에서, 어떤 라우터가
`from users import router`처럼 **segment 하나짜리 절대 import**로 다른 파일에 mount될 때, Impact
Lens가 그 mount 확인 대상을 **경로 깊이와 무관하게** 아무 `users.py`에나 확정해 버릴 수 있다. 이건
"이 함수를 실제로 부르는 경로가 있다"는 신뢰할 수 있는 신호가 아니라, 이름만 같으면 확정해 버리는
**틀린 확신**이다 — M4 전체가 막으려는 바로 그 실패 형태("모호한 DI/dynamic target을 확정처럼 보이지
않게 하는 것").

**이 작업 완료 후 가능해지는 것**: 이 잔여를 닫으면 gate 4("모호한 DI/dynamic target을 임의 승격하지
않는다")가 요구하는 조건 — **알려진 오탐 경로 0개** — 을 실제로 만족한다. gate 4는 이 augmentation
기능의 기본값을 켜도 되는지 판단하는 근거 중 하나이므로, 살아 있는 오탐 경로를 남긴 채로는 그 판단의
토대 자체가 성립하지 않는다.

**지금 이 작업을 하는 이유**: PR #85(`fix/m4-gate4-module-resolution`)가 mount import provenance를
정확한 경로 해석으로 바꾸면서 cross-package basename 충돌, self-mount shadowing, 역방향 alias, 주석
우회를 전부 닫았지만, 그 함수(`importsNameFromModule()`) 자신의 doc comment가 이미 명시했듯
**segment 하나짜리 절대 import는 여전히 basename 비교로 퇴화**한다 — 유일하게 남은, 알려진 오탐
경로다. 사용자가 "한 라운드 더" 진행해 gate 4를 완전히 닫기로 결정했다.

## 배경

`importsNameFromModule()`(`cli/src/adapters/fastapiDependencyAdapter.ts`)은 절대 import
(`from a.b.c import x`, dots===0)를 `pathEndsWithSegments(rootFile, moduleFileParts)`로 검증한다 —
dotted path를 `rootFile`의 경로 segment suffix와 비교. dotted path가 **2개 이상**의 segment면 이
비교가 정확히 동작한다(6-case 행렬로 이미 검증됨, PR #85). 하지만 dotted path가 **정확히 1개
segment**면 (`from users import router`) `moduleFileParts`도 `['users.py']` 하나뿐이 되어, suffix
비교가 사실상 **"rootFile의 basename이 'users.py'인가"** 로 퇴화한다 — `rootFile`이 어느 깊이에
있든 통과한다.

**이전에는 이게 왜 실무에서 잘 안 드러났는가**: round 1까지 있었던 `nameAmbiguous` 검사(라우터
식별자가 workspace 어디든 두 번 이상 module-level에 바인딩되면 mount 확정을 보류)가, 이 특정 퇴화
경로가 실제로 오탐을 내는 상황(라우터 변수 이름이 흔해서 여러 파일에 등장하는 경우)과 **우연히
겹쳐서** 상당 부분을 가려 왔다. `nameAmbiguous`는 PR #85에서 완전히 제거됐다(self-mount는 Python
스코프상 이름 충돌과 무관하다는, 그 자체로 옳은 이유) — 그 결과 이 segment-하나 퇴화가 **뒷받침하는
검사 없이 그대로 노출**된 상태다.

## 범위

- `importsNameFromModule()`의 절대 import(dots===0) 경로 중 **segment 하나짜리 dotted path**만
  다룬다. 2개 이상 segment는 PR #85에서 이미 검증된 대로 그대로 둔다. relative import(dots>0)도
  무관하다(별도 경로, 이미 정확한 파일 위치 해석).
- 패키지 root 자체를 추정하는 일반해(예: `pyproject.toml`/`setup.cfg` 읽기)는 여전히 범위 밖이다 —
  이 함수의 기존 원칙("패키지 메타데이터를 읽지 않는다")을 유지한다.

## 조사 결과 — 두 후보 규칙을 직접 쟀다

commander가 두 후보를 제시했다: **(A) workspace root 바로 아래 있어야 한다**(package root를
workspace root로 간주, segment 하나짜리 import에 한해), **(B) 그 basename을 가진 파일이 workspace
전체에서 유일할 때만 인정**(`isRouterMounted()`가 이미 전체 파일을 순회하므로 세는 비용이 0).

**직접 순수 path 로직으로 재현**(`[실행]`, 파이프라인 없이 검증 가능한 순수 함수라 격리 스크립트로
충분): 4가지 케이스에 두 규칙을 각각 적용했다.

| 케이스 | 기대값 | rule A | rule B |
|---|---|---|---|
| 중첩 root + 최상위 import, **다른 users.py가 워크스페이스에 전혀 없음** (충돌 대상 자체가 없는, 가장 흔한 오탐 형태) | false | **false (맞음)** | **true (틀림)** |
| flat layout (root가 workspace 바로 아래) | true | true (맞음) | true (맞음) |
| src layout, segment 하나짜리 최상위 모듈 | true | **false (비용)** | true (맞음) |
| 중첩 root + 최상위 import, 다른 진짜 users.py가 존재(충돌 sub-case) | false | false (맞음) | false (맞음) |

**결론: rule B는 이 lane의 본체 케이스 자체를 닫지 못한다.** uniqueness는 "같은 이름의 다른 파일과
충돌하지 않는가"만 검사하므로, 충돌할 대상이 아예 없으면(가장 흔한 형태 — 그냥 깊이가 틀린 파일
하나뿐인 경우) basename이 유일하다는 이유로 그대로 확정해 버린다. 이건 이 잔여가 실제로 발생하는
가장 흔한 모양(다른 어떤 것과도 안 겹치는, 그냥 잘못된 깊이의 파일 하나)을 정확히 못 잡는다는 뜻이라
채택하지 않는다.

**rule A를 채택한다.** 대가는 이미 알려진 대로 실재한다 — `src/`처럼 workspace 바로 아래가 아닌
곳에 있는 정당한 최상위 모듈(`from users import router` + `src/users.py`, `src`가 sys.path에 있는
일반적인 src-layout 관례)이 새 미탐이 된다. 이 lane 전체의 비대칭 원칙(오탐 방지가 미탐 허용보다
우선)과 일치하는 방향의 대가이므로 수용한다. commander에게 결정을 먼저 보고했다(`[실행]` 위 표,
`docs/work/task-m4-gate4-single-segment-import.md`를 쓰기 전에 SendMessage로 전달).

### 대안 검토 — uniqueness가 왜 안 되는지, 시도해서 실패로 측정된 것을 남긴다

**시도해서 실패로 측정된 수정은 다음 사람이 제일 먼저 손대는 것**이므로(이 저장소 관행), uniqueness가
`nameAmbiguous`와 겉모습이 비슷해 재제안되기 쉽다는 점까지 포함해 여기 남긴다.

**uniqueness는 방향이 두 개 다 틀린다** (commander가 두 번째 방향을 찾아 지적, `[실행]`으로
직접 재확인):

| 케이스 | rule A | uniqueness | 기대값 |
|---|---|---|---|
| 중첩 root + 최상위 import, 다른 users.py 없음 (본체 케이스) | false (맞음) | **true (오탐 허용 — 틀림)** | false |
| 중첩 root + 최상위 import, 다른 users.py 있음(충돌) | false (맞음) | false (맞음) | false |
| flat layout + 최상위 import (정답 케이스) | true (맞음) | true (맞음) | true |
| **flat layout(정답 케이스)인데 워크스페이스 어딘가에 더 깊은 동명 파일이 하나 더 있음** | true (맞음) | **false (미탐 — 틀림)** | true |

**정답률: rule A 4/4, uniqueness 2/4.** uniqueness는 "이 파일이 올바른 깊이에 있는가"를 아예 묻지
않고 "이름이 겹치는 다른 파일이 있는가"만 묻는다 — 그래서 **충돌이 없으면 틀린 깊이를 통과시키고
(오탐 방향), 충돌이 있으면 맞는 깊이까지 막는다(미탐 방향)**. 문제(깊이가 올바른가)와 검사(이름이
유일한가)가 애초에 서로 다른 것을 보고 있어서, 어느 방향으로 고쳐도 두 실패 모드 중 하나는 반드시
남는다 — `isRouterMounted()`가 이미 전체 파일을 순회해 세는 비용이 0이라는 매력에도 불구하고
채택하지 않는 이유다.

## 단계별 구현 계획

1. **목적**: segment 하나짜리 절대 import가 workspace 어디의 동명 파일이든 확정해 버리는 잔여
   오탐을 닫는다. **산출물**: `importsNameFromModule()`에 `workspace` 파라미터 추가,
   segment-하나 case에 `sameFile(path.dirname(rootFile), workspace)` 요구. **검증**: 위 4케이스
   + 기존 전체 fixture 회귀.
2. **목적**: 새로 생기는 미탐(src layout 최상위 모듈)을 숨기지 않는다. **산출물**: 해당 fixture를
   "known, accepted false negative"로 이름 붙여 추가 — precision 분모 기준(PR #85, 정정 5)이
   이 이름 패턴을 자동 제외하므로 별도 손질 없이 분모가 올바르게 유지된다. **검증**: 새 테스트가
   `augmentedEdges.length === 0`을 확인하고, 기존 기준으로 분모 재계산 시 이 fixture가 빠지는지
   확인.
3. **목적**: `nameAmbiguous` 제거로 이 잔여가 노출됐다는 사실을 코드에 명시한다(commander 지적 —
   round 1 gap에 대해서는 이미 적혀 있지만 이 잔여에 대해서는 없었다). **산출물**:
   `importsNameFromModule()` doc comment 갱신. **검증**: 읽고 확인(코드 리뷰).
4. **목적**: gate 4를 닫을 수 있는지 판단한다. **산출물**: 이 문서에 판정과 근거 기록,
   판정에 따라 `handover-2026-09-04.md`/`task-m4-milestone-closure-audit.md`/
   `task-m4-gate3-gate4-closure.md` 갱신. **검증**: 완전성 논증이 이 수정으로 깨지지 않는지
   확인(이 수정은 `importsNameFromModule()` 내부 비교 로직만 바꾸고 재검증 여부 자체는 바꾸지
   않으므로 논증 무관 — 아래 "gate 4 판정"에서 재확인).

## 구현 및 검증 로그

- `importsNameFromModule()`에 `workspace: string` 파라미터 추가, segment-하나 case에
  `sameFile(path.dirname(rootFile), workspace)`를 요구하는 guard 추가. 호출부
  (`isRouterMounted()` 내부)는 이미 스코프에 있는 `workspace`를 그대로 전달.
- **non-vacuity(`[실행]`)**: guard를 `if (false && ...)`로 임시 비활성화 → 재빌드 →
  `fastapiDependencyAdapterImportsNameFromModule.test.ts` 재실행 → **정확히 새로 추가한 2개
  테스트만 실패**(`single-segment absolute import, root NESTED...`,
  `KNOWN, ACCEPTED false negative...`), 나머지 18개는 그대로 통과 → 원복 → 재빌드 → 20/20 재확인.
- 기존 단위 테스트 24개(PR #85 기준) 전부에 `workspace` 인자 추가(대부분 `/ws`, multi-segment·
  relative import라 이 guard와 무관 — 유일하게 `from unrelated_module import router`(single-segment)
  테스트만 `workspace`를 rootFile의 실제 디렉터리로 맞춰 이 guard가 아니라 원래 의도(이름 불일치
  거부)를 검증하도록 조정).
- 신규 fixture 3쌍: `module_resolution_singleseg_nested/deeply/nested/singleseg_users.py` +
  `consumer.py`(본체 케이스, 거부), `singleseg_flat_users.py` +
  `singleseg_flat_consumer.py`(workspace 바로 아래, 확정 유지), `module_resolution_singleseg_src_
  known_false_negative/src/{singleseg_src_users.py,consumer.py}`(새 미탐, "known false negative"
  이름 규칙 정확히 준수 — 초안에서 단위 테스트 파일의 "KNOWN, ACCEPTED false negative" 문구를 그대로
  가져다 쓰려다 쉼표 때문에 정정 5의 문자열 기준을 못 탈 뻔한 걸 직접 발견해 수정).
- `pythonFastapiIntegration.test.ts`에 통합 테스트 3개 추가, 전체 스위트 재실행: 401 tests, 398
  pass/0 fail/3 skip(이전 395/392/0/3에서 +6). 기존 양성(module_resolution_pkg_b 등 2-segment
  절대 import 전부, self-mount collision 3건, crossfile_positive_router.py - 이미 workspace 바로
  아래라 이 guard와 무관함을 사전에 grep으로 확인)이 전부 그대로 통과함을 재확인 — 회귀 없음.
- precision 재계산: 정정 5의 기준을 재정의 없이 그대로 적용, 38개(진양성 15 + 진음성 23),
  precision 100% 그대로. 전문은 `task-m4-stage3-accuracy-latency-gates.md`의 "2026-09-08 정정 6".
- 미탐 목록: `task-m4-stage3-accuracy-latency-gates.md`의 "측정 — 미탐 범위"에 6번째 shape로
  추가, known-shape-coverage 비율을 5개 중 2개(40%) → 6개 중 2개(약 33%)로 갱신.

## gate 4 판정 — 닫힘 (수용된 잔여 1건을 안고)

**2026-09-08 정정 — 최초 판정문의 조건 (1) "알려진 오탐 경로가 0"은 사실이 아니었다.** commander가
직접 측정해 지적했다: 다중 segment 절대 import는 여전히 같은 dotted-path suffix로 끝나는 두 파일
(예: vendored 사본 - `root=/w/vendor/pkg_a/users.py`와 `root=/w/pkg_a/users.py`가 동일한
`from pkg_a.users import router`에 둘 다 매치)을 구분하지 못한다 — `pathEndsWithSegments()`가
suffix 비교라 애초에 이 케이스를 못 가른다. **이 함수 자신의 doc comment(`:368` 부근)가 이미
"vendored copies of the same nested path"라는 정확히 이 시나리오를 언급하고 있었는데, 판정문은
그걸 "닫힌 것 외엔 없다"로 잘못 적었다.** `[실행]`으로 직접 재현해 확인(위 유닛 테스트
"KNOWN, ACCEPTED RESIDUAL FALSE POSITIVE"로 고정). 아래는 이 사실을 반영해 다시 쓴 판정이다 —
원래 조건 (1)의 문구는 위 이력을 남기기 위해 그대로 두지 않고 아래로 교체한다(검증 조건 자체가
틀렸던 것이지 다른 두 조건이나 최종 판정 자체가 뒤집힌 게 아니라서, 절 전체를 신구 병렬로 남기기
보다 정정된 형태로 갱신하는 쪽을 택했다 — round 1의 self-mount shadowing처럼 판정 자체가 뒤집힌
경우와는 다르다).

commander가 요구한 세 조건을 각각 확인한다:

1. **알려진 오탐 경로가 0이어야 한다 — 정정: 0이 아니라 1건, 수용 가능한 잔여로 남는다.** 이번
   lane이 gate 4의 **주된** 오탐 경로(segment 하나짜리 절대 import의 depth-무관 매치)를 닫았다.
   하지만 **다중 segment 절대 import의 vendored-tree 충돌은 여전히 열려 있다** —
   `importsNameFromModule()`의 doc comment에 "KNOWN, ACCEPTED RESIDUAL FALSE POSITIVE"로
   명시하고 유닛 테스트로 고정했다. 이 잔여를 **수용하는 이유**: (a) 두 개의 서로 다른 디렉터리
   트리가 정확히 같은 다중-segment suffix로 끝나야 하는 병리적 배치가 필요해, single-segment
   케이스(어느 워크스페이스에나 흔한 top-level import 형태)보다 훨씬 좁다. (b) 유일하게 검토한
   수정안(dotted path 전체를 workspace root 기준으로 정확히 해석)은 PR #85가 이미 측정해 기각한
   설계와 같다 — `src/` layout 프로젝트의 정상적인 절대 import를 깨뜨린다(이 함수 doc comment의
   "round 2" 대목). 이번 lane에서 더 나은 수정안을 새로 만들지 않았으므로, 고치지 않고 **명시적으로
   수용한 채** 남긴다. 문서화된 나머지 한계(모듈 속성 mount, alias 변수 mount, 괄호/여러 줄 import,
   qualified access, 동적 구성 등)는 전부 **미탐**(엣지를 못 만듦) 방향이라 이 잔여와 성격이 다르다.
2. **미탐 목록이 최신이어야 한다.** 이번 lane이 새로 만든 미탐(src layout 최상위 모듈)을 숨기지
   않고 6번째 known shape로 카탈로그화했다(위 참고). "정확한데 거의 안 도는" 위험은 gate 4 판정과
   분리해 별도로 남아 있다 — known shape coverage가 33%(6개 중 2개)까지 낮아졌다는 사실은 이
   기능의 **기본값을 켜는 결정**에서 별도로 다뤄야 할 정보다(gate 4는 "오탐이 없는가"만 묻는다).
3. **완전성 논증이 여전히 성립해야 한다.** 이번 수정은 `importsNameFromModule()` 내부의 비교
   로직만 바꿨다 — 이 함수는 이미 "재검증 없는 두 함수" 중 하나로 식별돼 있었고, 이 수정이 그
   경계를 넓히거나 새로운 재검증-없는 경로를 만들지 않는다(같은 함수 안에서 판정 기준만 더
   엄격해졌을 뿐). 위 1번의 수용된 잔여도 마찬가지로 이 함수 내부에 머문다 — 완전성 논증은
   그대로 성립한다.

**판정: 수용된 잔여 1건(다중 segment vendored-tree 충돌)을 안고 gate 4를 닫는다.** "오탐 경로가
0"이라서가 아니라 "남은 오탐 경로가 무엇인지 알고, 왜 지금 고치지 않는지 근거가 있고, 그 경계가
좁다"는 게 닫힘의 근거다 — 이 마일스톤이 반복해서 지켜 온 "쟀다 ≠ 통과했다" 구분과 같은 맥락이다.
commander의 사전 승인(2026-09-08, "한 라운드 더" 지시 및 이 정정 요청)에 따라 이 lane 완료 후
판정까지 이 문서가 직접 수행했다. `reviewer`의 독립 재검토는 여전히 남아 있다 — 이 판정은 PR을
통해 검토받고, PR #85 때와 마찬가지로 `reviewer` 동의 없이 최종 확정 취급하지 않는다.
