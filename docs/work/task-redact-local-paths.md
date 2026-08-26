# 공개 문서의 로컬 절대 경로 정리와 로컬 설정 보호

## 배경과 해결할 문제

공개 저장소 점검에서 두 가지가 나왔다. 사내 정보나 자격 증명은 없었지만, 개인 식별 정보와 앞으로의 유입
위험이 남아 있었다.

1. work document 4개에 개발 machine의 절대 경로가 8곳 남아 있다. macOS 계정명과 로컬 디렉터리 구조,
   agent 도구 설치 경로가 드러난다. CLI는 진단 출력에서 `$HOME`을 `~`로 치환하는 redaction 원칙을 이미
   갖고 있는데(`redactProviderText`), 문서만 그 원칙에서 빠져 있었다.
2. `.claude/settings.local.json`이 저장소 `.gitignore`가 아니라 **사용자의 전역 gitignore로만** 무시되고
   있었다. 이 파일에는 이 host의 절대 경로가 들어 있다. 다른 machine에서 clone하거나 다른 기여자가 작업하면
   추적되지 않은 파일로 보이고 실수로 commit될 수 있다.

## 범위

- 추적 파일의 로컬 절대 경로를 `~` 표기로 통일한다.
- `.claude/settings.local.json`을 저장소 규칙으로 보호한다.

## 범위에서 제외할 항목

- git history rewrite. 이미 commit된 경로는 history에 남는다.
- 익명화된 예시 경로 변경. `cli/src/test/runner.test.ts`의 `/home/u/...`는 관측된 npm 오류를 익명화한
  고정 테스트 값이므로 그대로 둔다.
- `.vscodeignore` 변경. VSIX 제외는 이미 적용돼 있고 v0.6.3 패키지에 해당 파일이 없는 것을 확인했다.

## 점검 결과 요약

사내 정보는 발견되지 않았다. 추적 파일, git history, commit 메시지, 공개 PR 본문 11건, 공개 release note
6건, 미디어 자산을 모두 확인했다.

- 사내 프로젝트명·계정명·호스트명·도메인: 없음
- 이메일, 사설 IP, 내부 호스트: 없음
- API key, token, 비밀번호, private key: 없음. `token`/`secret` 문자열 매치는 note 충돌 방지 해시와
  redaction 테스트 fixture의 의도적 가짜 값이다.
- 미디어 3개: 브랜딩 그래픽만 있고 스크린샷이나 실제 코드가 없다.

## 구현

- `.gitignore`에 `.claude/settings.local.json`을 추가했다. 디렉터리 전체가 아니라 파일만 지정한다.
  `.claude/`에는 앞으로 공유 가능한 설정이 들어올 수 있고, Claude Code 관례상 `settings.local.json`만
  개인 설정이다.
- work document 4개의 `/Users/<user>/` 8곳을 `~/`로 치환했다. 문서의 의미는 그대로 유지된다.

## 테스트 및 완료 기준

- [x] 추적 파일에 로컬 사용자 절대 경로가 남지 않는다. 익명화된 테스트 값은 제외한다.
- [x] `git check-ignore -v`가 전역 설정이 아니라 저장소 `.gitignore`를 출처로 보고한다.
- [x] `npm run test:all`이 통과한다.

## 작업 로그

### 2026-08-26 — 점검과 정리

- 변경 파일: `.gitignore`, `docs/work/task-extension-icon.md`,
  `docs/work/task-m0-provider-runtime-handover.md`, `docs/work/task-m0-release-0-6-0.md`,
  `docs/work/task-plugin-provider-runtime-reliability.md`, `docs/work/task-redact-local-paths.md` (신규)
- 치환 전 `git check-ignore`의 출처는 `~/.config/git/ignore`였고, 변경 후 `.gitignore:6`으로 바뀐 것을
  확인했다.
- **한계를 명시한다.** 이 경로들은 이미 commit된 history에 남아 있어 조회가 가능하다. 공개 저장소에서
  history rewrite는 권장되지 않고 저장소 규칙상으로도 명시 요청 사항이므로 수행하지 않았다. 이번 변경은
  현재 문서의 노출을 없애고 앞으로의 유입을 막는 범위다.
- 최근 진단 과정에서 외부 보고 환경의 프로젝트명·계정명·호스트명이 저장소나 공개 artifact로 유입되지
  않았음을 확인했다. 관측된 npm 오류를 기록할 때 `/home/<user>`, `/home/u`로 익명화한 것이 유효했다.
