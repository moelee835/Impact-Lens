# Codex·Claude Plugin manifest 호환성 점검과 최신화

## 배경과 해결할 문제

`v0.6.0`~`v0.6.3`을 연속 발행하면서 CLI 계약과 plugin payload가 여러 번 바뀌었다. 두 host CLI도 그동안
갱신됐으므로, 저장소의 plugin manifest가 현행 스키마와 어긋나 있는지 확인해야 한다. 어긋난 채로 두면
설치는 되지만 일부 metadata가 무시되거나 이후 host 버전에서 거부될 수 있다.

## 범위

- 설치된 host CLI 기준으로 plugin·marketplace manifest, skill, command를 검증한다.
- 현행 스키마와의 차이를 찾아 최신화한다.
- 실제 두 host에 재설치해 동작을 확인한다.

## 범위에서 제외할 항목

- 새 host 기능(LSP server provider, MCP server, agent) 도입
- CLI 계약이나 skill 내용 변경
- 새 CLI/Extension release

## 점검 결과

### 기준 환경

| 대상 | 버전 |
| --- | --- |
| Claude Code | 2.1.246 |
| Codex CLI | 0.149.1 |
| Plugin payload (점검 시작) | 0.2.4 |
| runner pin | v0.6.3 |

### Claude Code — 문제 없음

`claude plugin validate --strict`가 네 대상 모두 통과했다.

- `plugins/impact-lens` (plugin manifest)
- `.claude-plugin/marketplace.json` (marketplace manifest)
- `plugins/impact-lens/skills`
- `plugins/impact-lens/commands`

component inventory도 정상 인식된다. Skills 3개(`analyze`, `impact-lens-cli`, `notes`), always-on 비용
약 179 tok. 공식 marketplace의 plugin manifest들과 비교하면 우리 manifest가 상위 집합이다.

### Codex — `defaultPrompt` 타입 불일치

큐레이티드 marketplace의 plugin 180개를 전수 조사해 필드 분포를 확인했다.

| 필드 | 180개 중 |
| --- | --- |
| `name`, `version`, `description`, `author`, `keywords`, `interface` | 180 |
| `interface.displayName`/`shortDescription`/`longDescription`/`developerName`/`category`/`capabilities`/`defaultPrompt` | 180 |
| `interface.logo` | 179 |
| `interface.composerIcon` | 177 |
| `interface.brandColor` | 104 |

필수 필드는 모두 갖추고 있었다. 그러나 **`interface.defaultPrompt`가 180개 전부 배열인데 우리만
문자열**이었다. 현재 Codex는 이 형태를 거부하지 않지만 스키마와 어긋난 상태이므로 맞춘다.

marketplace 정의(`.agents/plugins/marketplace.json`)는 `name`, `interface.displayName`, `plugins[].source`,
`policy`, `category` 구조가 큐레이티드와 동일하다. 변경 불필요.

## 구현

- `interface.defaultPrompt`를 배열로 바꿨다.
- 근처 필드 순서를 큐레이티드 배치와 맞추고, 거의 모든 plugin이 갖는 표현 metadata를 추가했다.
  `brandColor`는 README 배지 색과 같은 `#F5B942`, `composerIcon`과 `logo`는 저장소가 이미 보유한 아이콘을
  plugin payload 안으로 복사해 사용한다. host cache는 plugin 디렉터리를 통째로 복사하므로 payload 밖의
  상대 경로는 쓸 수 없다.
- Plugin payload version을 `0.2.5`로 올려 두 host가 update로 인식하게 했다.
- Claude manifest는 변경하지 않았다. 공식 plugin들은 `interface` 블록을 쓰지 않으므로 Codex 전용 필드를
  넣는 것은 맞지 않고, 현재 상태로 strict 검증을 통과한다.

## 테스트 및 완료 기준

- [x] `claude plugin validate --strict`가 manifest·marketplace·skills·commands 모두 통과한다.
- [x] Codex가 갱신된 manifest로 설치되고 asset이 cache에 전달된다.
- [x] 두 host cache runner에서 override 없이 doctor smoke와 TypeScript 분석이 성공한다.
- [x] `npm run test:all`과 `npm run test:plugin-artifact`가 통과한다.
- [x] VSIX 파일 수가 변하지 않는다. `plugins/**`는 이미 제외 대상이다.

## 작업 로그

### 2026-08-26 — 호환성 점검과 manifest 최신화

- 변경 파일: `plugins/impact-lens/.codex-plugin/plugin.json`,
  `plugins/impact-lens/.claude-plugin/plugin.json`(version만),
  `plugins/impact-lens/assets/app-icon.png`, `plugins/impact-lens/assets/impact-lens-icon.svg` (신규),
  `CHANGELOG.md`, `docs/work/task-plugin-manifest-compatibility.md` (신규)
- 호환성 판단을 추측이 아니라 실제 설치된 큐레이티드 plugin 180개의 필드 분포로 했다. 어떤 필드가 필수이고
  어떤 것이 관례인지 그 분포가 알려 준다.
- 두 host에 실제로 재설치해 확인했다. Codex는 `0.2.5` cache root를 새로 만들었고 asset 2개가 그대로
  전달됐다. Claude는 `0.2.2 → 0.2.5` update로 인식했다.
- override 없는 두 cache runner에서 doctor smoke `ready`와 TypeScript 분석 성공을 확인했다.
  `runtime.cli.version` `0.6.3`, `runner.source` `release-fallback`.
- Claude Code 2.1.246의 component inventory가 LSP server 항목을 별도로 보여 준다. plugin이 Language Server를
  직접 제공할 수 있다는 뜻이며, 현재 우리는 CLI가 provider를 소유하므로 사용하지 않는다. 다만 이후 Extension
  없이 host가 직접 provider를 띄우는 선택지가 생겼다는 점은 기록해 둔다.
