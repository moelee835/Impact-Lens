import { LspCallHierarchyProvider } from './lspProvider';
import { inspectBundledTypeScriptArtifact, REQUIRED_NODE_MAJOR, runtimeMetadata } from './runtime';

export async function doctorBundledTypeScript(smoke: boolean, timeoutMs = 15000): Promise<Record<string, unknown>> {
  const artifact = inspectBundledTypeScriptArtifact();
  const checks: Array<Record<string, unknown>> = [
    {
      id: 'node-engine',
      status: 'pass',
      requiredMajor: REQUIRED_NODE_MAJOR,
      detectedMajor: runtimeMetadata().node.major,
    },
    {
      id: 'cli-package',
      status: 'pass',
      package: artifact.packageName,
      version: runtimeMetadata().cli.version,
    },
    {
      id: 'bundled-provider-artifact',
      status: 'pass',
      package: artifact.serverPackage,
      version: artifact.serverVersion,
      typescriptVersion: artifact.typescriptVersion,
      entry: artifact.entry,
      access: 'readable',
    },
  ];

  if (!smoke) {
    return { status: 'ready', mode: 'preflight', checks };
  }

  const provider = new LspCallHierarchyProvider(process.cwd(), 'impact-lens-doctor.ts', undefined, timeoutMs);
  try {
    const capabilities = await provider.initializeForDoctor();
    checks.push({
      id: 'initialize-capability-smoke',
      status: 'pass',
      provider: capabilities.name,
      ...(capabilities.version ? { version: capabilities.version } : {}),
      callHierarchy: capabilities.advertised.callHierarchy,
    });
    return { status: 'ready', mode: 'smoke', checks };
  } finally {
    await provider.dispose();
  }
}
