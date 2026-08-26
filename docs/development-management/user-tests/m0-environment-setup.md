# M0 테스트 환경 구성과 초기화 가이드

- 대상: [M0 사용자 테스트 명세](m0-user-test-spec.md)의 진행자, 그리고 실패를 재현·보고하는 사람
- 목적: 어떤 CLI가 실제로 실행됐는지 확정할 수 있는 상태에서 테스트하고, 상충하는 관측을 만들지 않는다

## 왜 초기화가 필요한가

Impact Lens는 실행 경로가 여러 개다. Plugin runner는 다음 순서로 CLI를 고른다.

```text
IMPACT_LENS_CLI_PATH → source checkout(cli/dist/index.js) → 전역 impact-lens → release fallback(고정 tarball)
```

여기에 `npm exec`의 package cache(`~/.npm/_npx/<hash>`)가 더해진다. 이 cache는 package 지정자별로 따로
쌓이므로, 예전 pin으로 받은 구버전이 오랫동안 남는다. 실제로 개발 machine 한 대에서 다음이 동시에
발견됐다.

```text
074772409ef8d3a0 -> @impact-lens/cli 0.6.0
3ee08fd6ff215e3f -> @impact-lens/cli 0.4.0
4328249674a2c21f -> @impact-lens/cli 0.5.0
55ad5703ae997057 -> @impact-lens/cli 0.6.1
```

그래서 다음 상황이 실제로 생긴다.

- 사용자 shell에서는 전역 `0.6.1`이 선택돼 성공하고, agent 세션에서는 `PATH`에 전역 CLI가 없어
  release fallback으로 내려가 **구버전 pin**이 선택돼 실패한다.
- `impact-lens --version`으로 확인한 값과, 실제로 실패한 호출이 사용한 CLI가 서로 다르다.

**따라서 어떤 실패 보고든 `runtime.cli.version`과 `runtime.runner.source`가 없으면 원인을 확정할 수 없다.**

## 1단계 — 지우기 전에 현재 상태를 기록한다

초기화는 증거를 없앤다. 먼저 아래를 실행해 출력을 그대로 저장한다.

```sh
# 실행 환경
node --version; npm --version; echo "PATH=$PATH"

# Impact Lens 관련 환경변수 (하나라도 있으면 그 자체가 원인 후보다)
env | grep -i IMPACT_LENS || echo "(없음)"

# 전역 CLI
command -v impact-lens || echo "(전역 CLI 없음)"
npm ls --global @impact-lens/cli --depth=0 2>/dev/null || true

# npm exec package cache에 남아 있는 모든 버전
for f in $(grep -rl "@impact-lens/cli" ~/.npm/_npx/*/package.json 2>/dev/null); do
  d=$(dirname "$f")
  printf '%s -> ' "$(basename "$d")"
  node -p "require('$d/node_modules/@impact-lens/cli/package.json').version" 2>/dev/null || echo '?'
done

# Plugin 설치 상태
codex plugin list 2>/dev/null | grep -i impact-lens || echo "(Codex plugin 없음)"
claude plugin list 2>/dev/null || true

# VS Code Extension
code --list-extensions --show-versions 2>/dev/null | grep -i impact-lens || echo "(Extension 없음)"
```

환경변수 중 `IMPACT_LENS_CLI_PATH`나 `IMPACT_LENS_CLI_PACKAGE`가 보이면 shell 프로필도 확인한다.

```sh
grep -rn "IMPACT_LENS" ~/.bashrc ~/.zshrc ~/.profile ~/.bash_profile 2>/dev/null || echo "(프로필에 없음)"
```

## 2단계 — 초기화

시스템 전역 설정, 홈 디렉터리 권한, 다른 package의 cache는 건드리지 않는다. `sudo npm`은 사용하지 않는다.

```sh
# 1) 환경변수 해제 (프로필에 있으면 해당 줄을 지우고 shell을 새로 연다)
unset IMPACT_LENS_CLI_PATH IMPACT_LENS_CLI_PACKAGE \
      IMPACT_LENS_RUNNER_NPM_OUTPUT IMPACT_LENS_PROVIDER_LOG_LEVEL IMPACT_LENS_RUNNER_SOURCE

# 2) 전역 CLI 제거
npm uninstall --global @impact-lens/cli

# 3) npm exec package cache에서 Impact Lens 항목만 제거
for f in $(grep -rl "@impact-lens/cli" ~/.npm/_npx/*/package.json 2>/dev/null); do
  rm -rf "$(dirname "$f")"
done

# 4) Plugin 제거 (설치한 host만)
codex plugin remove impact-lens@personal
codex plugin marketplace remove personal

claude plugin uninstall impact-lens@impact-lens --scope local
claude plugin marketplace remove impact-lens

# 5) Plugin cache 잔여 확인
ls -d ~/.codex/plugins/cache/*/impact-lens 2>/dev/null || echo "(Codex cache 없음)"
ls -d ~/.claude/plugins/cache/*/impact-lens 2>/dev/null || echo "(Claude cache 없음)"

# 6) VS Code Extension 제거 (Extension도 테스트 대상인 경우)
code --uninstall-extension local.impact-lens
```

`--scope`는 설치할 때 쓴 값과 같아야 한다. `claude plugin list`가 `Scope: local`을 보여주면
`--scope local`이다.

노트 파일은 사용자 데이터다. 워크스페이스의 `.impact-lens/notes.json`(공유)과
`.impact-lens/notes.local.json`(개인)은 **테스트를 위해 임의로 지우지 않는다.** 노트가 없는 상태에서
시작해야 한다면 별도 임시 워크스페이스를 쓴다.

초기화 확인:

```sh
command -v impact-lens || echo "OK: 전역 CLI 없음"
env | grep -i IMPACT_LENS || echo "OK: 환경변수 없음"
grep -rl "@impact-lens/cli" ~/.npm/_npx/*/package.json 2>/dev/null || echo "OK: npx cache 없음"
```

## 3단계 — 테스트 대상 하나만 설치한다

runner의 우선순위 때문에, 두 경로를 동시에 설치하면 무엇을 검증했는지 모호해진다. **시나리오를 먼저
고르고 그것만 설치한다.**

### 시나리오 A — Agent Plugin의 기본 경로 (release fallback)

M0 명세의 S1(clean install)이 이 경우다. **전역 CLI를 설치하지 않는다.** runner가 실제로 release
fallback까지 내려가는지 검증하는 것이 목적이다.

> **샌드박스 안에서는 이 시나리오를 쓸 수 없다.** release fallback은 `npm exec`으로 tarball을 받아
> 설치하므로 npm cache에 쓸 수 있어야 한다. Codex의 `workspace-write` 샌드박스는 workspace 밖을 읽기
> 전용으로 마운트하므로 `$HOME/.npm`에 쓸 수 없고, 다음이 관측된다.
>
> ```text
> npm error code EROFS
> npm error rofs EROFS: read-only file system, mkdtemp '/home/<user>/.npm/_cacache/tmp/...'
> ```
>
> 이때 runner는 `npm_filesystem_read_only`를 반환한다. 네트워크를 열어도 해결되지 않는다. agent 맥락을
> 검증할 때는 시나리오 B(전역 CLI)를 사용한다. 샌드박스 밖 shell에서 전역 설치를 먼저 해두면 runner가
> `global` 경로를 선택해 네트워크와 cache 쓰기가 모두 불필요해진다.

```sh
# Codex
codex plugin marketplace add moelee835/Impact-Lens --ref main
codex plugin add impact-lens@personal

# Claude Code
claude plugin marketplace add moelee835/Impact-Lens
claude plugin install impact-lens@impact-lens
```

### 시나리오 B — 전역 CLI 직접 사용

**agent 맥락(Codex, Claude Code 등 샌드박스 안)에서 검증할 때는 이 시나리오를 사용한다.** 설치는 샌드박스
밖 shell에서 수행한다.

```sh
npm install --global \
  https://github.com/moelee835/Impact-Lens/releases/download/v0.6.2/impact-lens-cli-0.6.2.tgz
```

버전은 테스트 대상 release로 바꾼다. 시나리오 A와 섞지 않는다.

### 시나리오 C — 저장소 checkout

개발 중 branch를 검증할 때만 사용한다. checkout 경로가 전역·release fallback보다 우선한다.

```sh
git clone https://github.com/moelee835/Impact-Lens
cd Impact-Lens && pnpm install --frozen-lockfile && npm run cli:build
```

## 4단계 — 무엇을 실행했는지 확정한다

어떤 시나리오든 첫 명령은 이것이다. 출력을 요약하지 말고 **JSON 원문을 그대로** 남긴다.

```sh
# 시나리오 A: 설치된 cache runner를 직접 실행
~/.codex/plugins/cache/personal/impact-lens/<version>/scripts/run-impact-lens \
  doctor bundled-typescript --smoke; echo "exit=$?"

# 시나리오 B, C
impact-lens doctor bundled-typescript --smoke; echo "exit=$?"
```

응답에서 반드시 확인하고 기록할 값:

| 필드 | 확인 내용 |
| --- | --- |
| `runtime.cli.version` | 실제로 실행된 CLI 버전. 설치했다고 믿는 버전과 같은가 |
| `runtime.runner.source` | `explicit` / `checkout` / `global` / `release-fallback` 중 무엇인가 |
| `runtime.node.version` | 실행 Node 버전 |
| `data.checks[]` | 4개 check의 개별 status |

`runner.source`가 의도한 시나리오와 다르면 **그 시점에 멈추고 3단계로 돌아간다.** 그 상태의 결과는
어떤 결론에도 사용하지 않는다.

## 5단계 — 실패했을 때 증거 수집

`provider_initialize_failed`처럼 언어 서버 단계에서 실패하면 다음 순서로 좁힌다.

1. **실패 JSON 원문 전체**를 남긴다. 특히 `error.details`의 `stage`, `exitCode`, `signal`,
   `msSinceSpawn`, `bytesFromServer`, `requestsSent`.
   - `bytesFromServer: 0` → 언어 서버가 프로토콜을 한 번도 말하지 못했다. 실행 환경(권한, 샌드박스,
     인터프리터) 쪽을 먼저 본다.
   - 응답을 보낸 뒤 종료 → 서버가 응답 이후에 한 일 쪽이다.
2. **언어 서버가 스스로 말하게 한다.**

   ```sh
   IMPACT_LENS_PROVIDER_LOG_LEVEL=4 impact-lens doctor bundled-typescript --smoke
   ```

   서버 로그는 redaction을 거쳐 `error.details.stderr`로 들어온다.
3. **Impact Lens를 빼고 언어 서버만 직접 확인한다.** 저장소의
   [`scripts/probe-bundled-provider.mjs`](../../../scripts/probe-bundled-provider.mjs)는 번들 서버를 직접
   구동해 `--log-level 4` 출력과 종료 코드를 그대로 보여준다. CLI 재설치나 업그레이드가 필요 없다.

   ```sh
   node scripts/probe-bundled-provider.mjs /path/to/project
   ```

   | 출력 | 의미 |
   | --- | --- |
   | `20초 경과: 언어 서버가 살아 있습니다` | 서버는 정상. 문제는 Impact Lens와 서버 사이 |
   | `initialize 응답 수신` 후 곧 종료 | 서버가 응답 뒤 스스로 종료. `[server stderr]` 로그가 이유를 말한다 |
   | 응답 없이 종료, stdout 0 bytes | 프로토콜을 말하기 전에 죽음. 실행 환경 문제 |
4. **실행 맥락을 함께 기록한다.** 같은 명령이 사용자 shell에서는 성공하고 agent 세션에서는 실패하는
   경우가 있으므로, 어디에서 실행했는지(대화형 shell / agent / CI / container)와 `PATH`를 남긴다.

`msSinceSpawn`, `bytesFromServer`, `requestsSent`, `providerLog`와 `IMPACT_LENS_PROVIDER_LOG_LEVEL`은
`0.6.2` 이상에서 제공된다. 그 이전 버전에서는 3번 probe와 4번 맥락 기록으로 대체한다.

`providerLog`가 특히 중요하다. 번들 TypeScript Language Server는 `process.stderr`를 **한 번도 사용하지
않는다.** 모든 진단을 LSP `window/logMessage` 알림으로 보낸다. 따라서 `stderr` 필드가 없다는 사실만으로
"서버가 아무 말도 하지 않았다"고 해석하면 안 된다. `providerLog`를 함께 본다.

## 6단계 — 다시 테스트할 수 있는 상태로 되돌린다

테스트가 끝나면 참여자 환경을 원래대로 돌려준다.

- 2단계 초기화 명령을 다시 실행한다.
- 1단계에서 기록해 둔 원래 설치 상태(전역 CLI 버전, plugin, Extension)를 복원한다.
- 진행자가 만든 임시 워크스페이스와 임시 npm cache를 제거한다.
- 시스템 Node 기본값을 바꿨다면 되돌린다. 애초에 세션 범위 version manager만 사용한다.

## 금지 사항

- `sudo npm install --global` 사용
- 사용자 홈 디렉터리나 `~/.npm` 권한 변경
- 참여자의 실제 노트 파일 삭제
- 시스템 Node 기본 버전 영구 변경
- 두 시나리오를 동시에 설치한 상태에서 결과를 판정하는 것
