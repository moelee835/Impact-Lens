// Impact Lens 번들 언어 서버 독립 probe
//
// Impact Lens CLI를 거치지 않고 번들 typescript-language-server만 직접 구동해, 서버 자신의 로그와 종료
// 코드로 어디에서 실패하는지 확인한다. 언어 서버가 stderr 없이 종료해 CLI 진단만으로는 원인을 좁힐 수
// 없을 때 사용한다.
//
// 사용법: node scripts/probe-bundled-provider.mjs [workspace 경로]
// 서버 위치를 직접 지정하려면 IMPACT_LENS_LSP_ENTRY에 cli.mjs 경로를 넣는다.
// Impact Lens CLI를 거치지 않고 번들 typescript-language-server만 직접 구동해
// 어디에서 죽는지 그 자체의 로그로 확인한다.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspace = path.resolve(process.argv[2] ?? process.cwd());

function resolveServerEntry() {
  const explicit = process.env.IMPACT_LENS_LSP_ENTRY;
  if (explicit) return explicit;

  const bases = [];
  // 1) 저장소 checkout에서 실행하는 경우 CLI package의 의존성을 먼저 본다.
  bases.push(path.join(process.cwd(), 'cli'), path.dirname(new URL('.', import.meta.url).pathname));
  // 2) PATH의 impact-lens 실행 파일에서 CLI 패키지 위치를 역추적한다.
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const binary = execFileSync(which, ['impact-lens'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (binary) bases.push(path.dirname(fs.realpathSync(binary)));
  } catch {}
  // 3) 전역 node_modules를 직접 본다.
  try {
    const root = execFileSync('npm', ['root', '--global'], { encoding: 'utf8' }).trim();
    bases.push(path.join(root, '@impact-lens', 'cli'), path.join(root, 'typescript-language-server'), root);
  } catch {}

  for (const base of bases) {
    for (const dir of [base, path.dirname(base), path.dirname(path.dirname(base))]) {
      try {
        const require = createRequire(path.join(dir, 'probe.js'));
        return require.resolve('typescript-language-server/lib/cli.mjs');
      } catch {}
      const direct = path.join(dir, 'typescript-language-server', 'lib', 'cli.mjs');
      if (fs.existsSync(direct)) return direct;
    }
  }
  throw new Error('번들 typescript-language-server를 찾지 못했습니다. IMPACT_LENS_LSP_ENTRY로 cli.mjs 경로를 직접 지정하세요.');
}

const entry = resolveServerEntry();
console.log(`node        : ${process.version}`);
console.log(`server entry: ${entry}`);
console.log(`workspace   : ${workspace}`);
console.log('---');

const started = Date.now();
const child = spawn(process.execPath, [entry, '--stdio', '--log-level', '4'], { stdio: ['pipe', 'pipe', 'pipe'] });
let stdoutBytes = 0;
let initializeAnswered = false;

child.stdout.on('data', chunk => {
  stdoutBytes += chunk.length;
  const text = String(chunk);
  if (!initializeAnswered && text.includes('capabilities')) {
    initializeAnswered = true;
    console.log(`[+${Date.now() - started}ms] initialize 응답 수신 (${stdoutBytes} bytes)`);
  }
});
child.stderr.on('data', chunk => {
  process.stderr.write(`[server stderr] ${String(chunk)}`);
});
child.on('error', error => {
  console.log(`[+${Date.now() - started}ms] spawn 실패: ${error.message}`);
});
child.on('exit', (code, signal) => {
  console.log('---');
  console.log(`[+${Date.now() - started}ms] 언어 서버 종료: code=${code} signal=${signal}`);
  console.log(`initialize 응답: ${initializeAnswered ? '받음' : '못 받음'} / 서버 stdout 총 ${stdoutBytes} bytes`);
  process.exit(0);
});

function send(message) {
  const body = Buffer.from(JSON.stringify(message));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}

send({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: {
    processId: null,
    rootUri: pathToFileURL(workspace).toString(),
    workspaceFolders: [{ uri: pathToFileURL(workspace).toString(), name: path.basename(workspace) }],
    capabilities: { textDocument: { callHierarchy: { dynamicRegistration: false } }, workspace: { workspaceFolders: true } },
    initializationOptions: {},
  },
});

setTimeout(() => {
  console.log('---');
  console.log(`[+${Date.now() - started}ms] 20초 경과: 언어 서버가 살아 있습니다 (정상 신호)`);
  child.kill();
  process.exit(0);
}, 20000);
