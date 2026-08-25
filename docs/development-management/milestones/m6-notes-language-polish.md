# M6 Note 접근성과 언어별 마무리

- 상태: Planned
- 완료 소유: IL-LIM-012, IL-LIM-013
- 릴리스 성격: workflow polish release

## 목표

VS Code Personal note와 독립 CLI의 host 경계를 명확한 전략으로 해결하고, 검증된 언어에서만 안전한 source
note 주석을 생성한다. note 편의를 위해 사용자 데이터 격리나 source 안전성을 희생하지 않는다.

## 포함 범위

- Personal note의 export/import, explicit bridge 또는 unavailable 유지 대안 결정
- scope/provenance/conflict token을 보존하는 note 이동 workflow
- C/C++/Swift/Kotlin 등 검증 언어의 line/block comment syntax
- generated file, unsupported language와 ambiguous declaration의 safe refusal
- Extension/CLI/Plugin note capability와 limitation 문서 통일

## 진입 조건

- M1 host/provider 경계와 M2/M3 language profile이 안정적이다.
- M5 overlay/content provenance와 note mutation의 충돌 의미가 합의된다.

## 산출물

- Personal note 접근 ADR과 선택한 explicit workflow
- note export/import 또는 bridge contract, preview/apply/conflict tests
- language-profile 기반 source comment formatter/parser
- unsupported/generated/ambiguous source에 대한 refusal reason
- 설치·백업·복구 및 privacy 안내

## 종료 gate

- [ ] IL-LIM-012와 IL-LIM-013의 수용 기준이 통과한다.
- [ ] Personal note 부재가 삭제나 empty note로 오해되지 않는다.
- [ ] note 이동/변경은 preview, explicit apply와 최신 conflict token을 유지한다.
- [ ] 추가 언어의 source note insertion/deletion round trip과 기존 주석 보존 fixture가 통과한다.
- [ ] 검증하지 않은 언어에서 임의 comment fallback으로 source를 수정하지 않는다.
- [ ] Extension/CLI/Plugin의 scope와 capability 표현이 일치한다.

## 제외 범위

- Personal note의 암묵적 cloud sync
- editor private storage 직접 접근이나 무단 복호화
- 범용 AST rewriter 및 모든 언어 comment syntax 추측

## 주요 위험과 대응

- Personal note export가 민감 정보를 노출할 수 있다: 명시적 export, 대상 preview와 저장 위치 선택을 요구한다.
- comment syntax가 빌드/formatter와 충돌할 수 있다: language fixture와 round-trip을 통과한 profile만 활성화한다.
- CLI와 Extension identity가 다를 수 있다: stable symbol identity와 conflict를 우선하고 자동 병합하지 않는다.

## 후속 방향

M6 이후에는 신규 story를 milestone에 바로 추가하지 않고, 실제 사용 지표·issue와 provider 회귀를 기반으로
다음 support/hardening milestone을 만든다. M0~M6에서 보류된 experimental 언어나 framework는 독립 gate를
가진 후속 milestone로 승격한다.
