# M0 사용자 테스트 명세 — Provider 실행 신뢰성

- 대상 마일스톤: [M0 — Provider 실행 신뢰성](../milestones/m0-provider-runtime-trust.md)
- 작성 기준 release candidate: 공개 `v0.6.1` CLI/Extension, Plugin payload `0.2.2`
- 상태: 작성 완료, 검토 대기. **아직 실행하지 않았다.**
- 작성 규칙: [마일스톤별 사용자 테스트 명세 계획](../milestones/user-validation-planning.md)

이 문서는 명세일 뿐이며, 존재만으로 사용자 검증을 통과한 것으로 표시하지 않는다. 실행은 별도 승인,
참여자 모집과 환경 준비 후에 수행한다.

## 1. 검증 목적

M0는 "배포된 형태에서 기본 언어 분석이 재현 가능하게 시작되고, 실패하면 원인이 구분된다"를 목표로 한다.
이 테스트는 다음 세 가지만 판단한다.

1. 사용자가 clean install 또는 update 직후, provider 설정 없이 TypeScript/JavaScript 변경 영향을 확인할 수
   있는가.
2. runtime이나 CLI artifact가 깨진 상태에서 사용자가 **어느 계층**(Node, CLI artifact, npm 다운로드,
   provider lifecycle)이 문제인지 이해하고 스스로 복구할 수 있는가.
3. 사용자가 정적 분석 결과의 의미를 과신하지 않는가. 특히 `complete`와 coverage 표기를 "런타임 영향까지
   전부 확인됨"으로 오해하지 않는가.

## 2. 이번 테스트로 판단하지 않을 항목

- 분석 결과의 절대 정확도(누락·오탐률). 정적 Call Hierarchy 한계 자체는 M4 범위다.
- Python, C/C++, Go, Swift, Kotlin 등 preset이 없는 언어의 정상 분석. 여기서는 **오해 없는 실패**만 본다.
- 대규모 workspace의 성능과 traversal 한계(M5).
- Note 기능의 사용성(M6).
- Graph 시각 디자인 선호도. 오해를 유발하는 표기만 결함으로 다룬다.
- 성공률·지연 시간의 합격 수치. 이번 라운드에서 baseline을 측정한다(§10).

## 3. 참여자

- 인원: pilot 2명 + 본 라운드 4~6명.
- 요구 경험: TypeScript 또는 JavaScript 프로젝트에서 함수 단위 변경을 실제로 수행해 본 개발자.
  Codex CLI 또는 Claude Code 중 하나를 평소 사용한다.
- 최소 1명은 Impact Lens Plugin을 한 번도 설치해 본 적이 없어야 한다.
- 최소 1명은 Impact Lens Extension만 써 봤고 Plugin 경험이 없어야 한다.
- **제외**: Impact Lens 구현, 문서 작성, 이 명세 작성에 참여한 사람은 참여자가 될 수 없다. 명세 검토자도
  참여자로 겸하지 않는다.
- 참여자는 anonymized ID(`M0-P1` …)로만 기록한다.

## 4. 환경 matrix

각 조합은 최소 1명이 수행한다. 결과는 조합별로 분리 기록하며 하나의 평균으로 합산하지 않는다.

| 축 | 값 |
| --- | --- |
| OS | macOS, Windows, Linux |
| Host | Codex CLI, Claude Code |
| Node.js | 22 LTS, 그리고 22보다 높은 최신 버전 각 1명 이상 |
| Project | 참여자 본인의 실제 TS 또는 JS 저장소 1개 + 공통 sample 저장소 1개 |
| Language | `.ts`/`.tsx` 1건 이상, `.js`/`.jsx` 1건 이상 |

공통 sample 저장소는 cross-file caller가 있는 소규모 TS/JS 프로젝트로 준비하고, 참여자 저장소는 본인이
소유·공개 가능한 것만 사용한다.

## 5. 시작 상태와 사전조건

| ID | 시작 상태 | 준비 방법 |
| --- | --- | --- |
| S1 | clean install | Plugin 미설치, 전역 `impact-lens` 미설치, Node 22 이상 활성 |
| S2 | update | 이전 Plugin payload version이 설치·활성화된 상태 |
| S3 | 지원하지 않는 Node | 세션 한정으로 Node 20을 활성화(version manager 사용). 시스템 기본값은 바꾸지 않는다 |
| S4 | 잘못된 CLI override | 존재하지 않는 경로를 `IMPACT_LENS_CLI_PATH`로 지정 |
| S5 | release fallback 실패 | 임시 npm cache를 쓰고 네트워크를 차단하거나 존재하지 않는 package를 pin |
| S6 | preset 없는 언어 | 참여자 저장소 또는 sample의 Python 파일 |

준비 원칙:

- 깨진 상태는 **세션 범위**로만 만든다. 시스템 Node 기본값, 사용자 홈 권한, 실제 source를 변경하지 않는다.
- S5는 사용자 `~/.npm`을 건드리지 않고 task 전용 npm cache 환경변수로 구성한다.
- 모든 준비는 진행자가 수행하고, 참여자에게는 "무엇을 망가뜨렸는지" 알려주지 않는다.

## 6. 과업

과업은 outcome으로 제시한다. 진행자는 내부 provider command, args, `languageId`, runner 해석 순서,
오류 code 목록을 **사전에 설명하지 않는다**. 참여자가 먼저 묻는 경우 "문서와 도구 출력에서 찾아보라"고만
안내한다.

| ID | 시작 상태 | 사용자에게 주는 과업 |
| --- | --- | --- |
| T1 | S1 | "이 함수를 바꾸면 어떤 코드가 영향을 받는지 확인해 주세요." (TS 대상) |
| T2 | S1 | 같은 확인을 JavaScript 파일의 함수로 수행 |
| T3 | S2 | "도구를 최신 상태로 만든 뒤 T1을 다시 확인해 주세요." |
| T4 | S3 | "T1과 같은 확인을 해 주세요." 실패 시 "왜 안 되는지, 어떻게 고칠 수 있는지 설명하고 고쳐 주세요." |
| T5 | S4 | T4와 동일한 문구 |
| T6 | S5 | T4와 동일한 문구 |
| T7 | S6 | "이 Python 파일의 함수에 대해서도 같은 확인을 해 주세요." 결과를 어떻게 해석하는지 설명 |
| T8 | T1 성공 직후 | "이 결과가 이 함수 변경의 영향 전부라고 볼 수 있나요? 근거를 설명해 주세요." |

T8은 별도 조작 없이 T1 결과 화면/JSON만 보고 답한다.

## 7. 과업별 기대 결과와 중단 조건

| ID | 기대 결과 | 허용 가능한 대안 경로 | 중단 조건 |
| --- | --- | --- | --- |
| T1 | provider 설정 없이 direct caller를 확인 | slash command, skill 호출, runner 직접 실행 중 무엇이든 | 15분 초과, 또는 provider command/args 입력을 요구받았다고 느껴 중단 |
| T2 | TS와 동일하게 성공 | 위와 동일 | 위와 동일 |
| T3 | update 후 재확인 성공, version이 올라간 것을 인지 | host UI 또는 CLI update 명령 | update 절차를 찾지 못해 10분 초과 |
| T4 | Node 요구 버전 문제임을 식별하고 Node를 올려 복구 | 오류 메시지, INSTALL 문서, doctor 중 무엇이든 | 20분 초과 또는 시스템 전역 설정 변경 시도 |
| T5 | 지정한 CLI 경로가 없다는 것을 식별하고 override 제거로 복구 | 위와 동일 | 위와 동일 |
| T6 | 다운로드 단계 실패임을 식별하고 네트워크 복구 또는 전역 CLI 설치로 우회 | 위와 동일 | 위와 동일 |
| T7 | "이 언어는 아직 지원 preset이 없다"로 해석. 설치 손상이나 도구 고장으로 결론짓지 않음 | — | 참여자가 재설치를 시작하면 그 사실을 기록하고 중단 |
| T8 | 정적 분석 범위임을 인지하고 동적 호출·DI·reflection이 빠질 수 있음을 언급 | — | — |

중단된 과업은 실패가 아니라 `중단`으로 기록하고 사유를 남긴다.

## 8. 관측 지표

과업별로 다음을 기록한다. 값은 조합(OS × Host × Language)별로 분리한다.

- time-to-first-success: 과업 시작부터 첫 성공 응답까지의 경과 시간
- 수동 설정 개입 수: provider command/args/`languageId`를 직접 지정하려 시도한 횟수, 환경변수를 임의로
  설정한 횟수
- 결과 판정: 성공 / 부분 성공 / 실패 / 중단
- 복구 과업(T4~T6): 원인 계층을 맞게 지목했는가(Node / CLI artifact / npm 다운로드 / provider lifecycle),
  복구까지의 시도 수, 복구 성공 여부
- 참조한 정보원: 오류 메시지, `doctor` 출력, INSTALL 문서, README, host UI, 외부 검색
- 기대와 실제의 차이: 참여자가 예상한 영향 범위와 도구가 보여 준 결과의 차이, 그리고 그 차이를 본 뒤의
  confidence 변화
- 오해 발생: `complete`를 런타임 완전성으로 해석, 정적 결과를 confirmed로 단정, preset 부재를 설치 손상으로
  해석
- 예상하지 못한 side effect: 자동 build, dependency 설치, test 실행이 관측됐는가

## 9. 사후 질문

과업 종료 후 다음을 묻는다. 유도 없이 개방형으로 먼저 묻고, 필요한 경우에만 항목을 제시한다.

1. 마지막 결과가 "이 함수 변경의 영향 전부"라고 생각하는가. 그렇게/그렇지 않게 판단한 근거는 무엇인가.
2. `complete`, `coverage`, `limitations` 표기를 각각 어떤 뜻으로 읽었는가.
3. 실패했을 때 어느 단계에서 실패했는지 알 수 있었는가. 메시지 중 이해되지 않은 표현이 있었는가.
4. 복구 방법을 어디에서 찾았는가. 문서와 오류 메시지 중 무엇이 더 도움이 됐는가.
5. 이 도구가 내 코드나 프로젝트를 자동으로 빌드하거나 테스트했다고 느낀 순간이 있었는가.
6. 지금 상태에서 동료에게 권할 수 있는가. 아니라면 무엇이 막고 있는가.

## 10. 통과·보류 기준

수치 기준은 지금 추측하지 않는다. pilot 2명의 결과로 baseline을 만든 뒤 본 라운드 기준을 확정한다.

**baseline 측정 항목**: T1/T2의 time-to-first-success 중앙값, T4~T6의 복구 성공 시도 수, 수동 설정 개입 수.

**정성 통과 기준** (본 라운드에서 확정 전에도 적용):

- 모든 OS × Host 조합에서 T1과 T2가 provider 설정 없이 성공한다.
- T4~T6에서 참여자 과반이 원인 계층을 맞게 지목한다.
- T7에서 아무도 preset 부재를 설치 손상으로 결론짓지 않는다.
- T8에서 과반이 정적 분석 범위를 언급한다.
- 어떤 과업에서도 도구가 참여자 프로젝트를 자동으로 build·install·test하지 않는다.

**보류 기준**: 위 항목 중 하나라도 미달하면 M0를 안정화 release로 확정하지 않고 원인 수정 후 재시험한다.

## 11. Privacy와 동의

- 참여자 동의 없이는 어떤 기록도 수집하지 않는다. 동의 범위를 과업 시작 전에 문서로 확인한다.
- 수집 금지: 절대 경로, 사용자명이 포함된 경로, source 본문, registry token, proxy credential, 사내 저장소
  식별자.
- 수집 허용: redacted 오류 JSON의 `error.code`, `error.details.stage`, `error.details.recovery`,
  `runtime.runner.source`, `runtime.node.major`, 조합 정보, 시각과 판정.
- 진단 JSON을 그대로 붙여넣을 때는 진행자가 먼저 경로·URL·credential을 제거한다. 제거할 수 없으면 해당
  증거를 버린다.
- 화면 녹화는 동의한 참여자에 한해, 도구 출력 영역만 부분 녹화한다.
- 참여자 발화는 요약으로만 남기고 원문 인용은 동의한 문장에 한한다.

## 12. 증거 형식

각 과업 실행은 다음 한 행으로 남긴다.

| 필드 | 예 |
| --- | --- |
| participant | `M0-P3` |
| environment | `macOS / Claude Code / Node 22 / ts` |
| task | `T5` |
| start / end | `10:04` / `10:11` |
| verdict | `성공` |
| interventions | `1` |
| error evidence | `cli_artifact_missing / resolution / reinstall_or_correct_cli_path / explicit` |
| notes | 요약 1~2문장 |

## 13. 실패 처리와 재시험

- 결함은 발견 즉시 issue로 등록하고 참여자 ID, 조합, 과업 ID와 redacted 증거를 연결한다.
- 수정 commit은 해당 issue를 참조하고, 수정 후 **같은 조합**에서 재시험한다. 재시험은 원 참여자 또는 동등
  경험의 새 참여자 중 하나로 하되 어느 쪽인지 기록한다.
- 재시험 전에는 통과로 표시하지 않는다.
- 세션 중 참여자 환경이 손상되면 즉시 중단하고 원상 복구를 우선한다. 복구 절차는 진행자가 수행한다.
- release decision에는 통과 항목, 미달 항목, 미실행 항목과 그 사유를 모두 기록한다. 미실행을 통과로
  간주하지 않는다.

## 14. 검토 체크리스트

이 명세는 구현자가 아닌 검토자가 다음을 확인한 뒤에만 실행 단계로 넘어간다.

- [ ] 과업 문구가 특정 UI 조작이 아니라 사용자 outcome으로 쓰였다.
- [ ] 내부 provider 설정과 오류 code를 사전에 노출하지 않는다.
- [ ] 깨진 상태 준비가 시스템·source·사용자 홈을 손상시키지 않는다.
- [ ] privacy 규칙이 수집 항목과 제거 절차를 모두 지정한다.
- [ ] 합격 수치를 추측으로 고정하지 않고 baseline 측정 절차를 둔다.
- [ ] 언어·OS·host별 결과가 분리 기록된다.
- [ ] 참여자에서 구현·문서 작성자가 제외된다.
