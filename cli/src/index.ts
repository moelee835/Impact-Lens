#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { analyzeImpact, canonicalWorkspace, resolveWorkspaceFileSecure, selectRoot } from './impact';
import { LspCallHierarchyProvider } from './lspProvider';
import { NoteService } from './notes';
import {
  AnalyzeRequest,
  CliError,
  ExpectedSymbol,
  NoteGetRequest,
  NoteListRequest,
  NoteMutationRequest,
  NoteScope,
  ProviderCommand,
  SourceMode,
  SymbolTarget,
} from './types';

interface ParsedCommand {
  readonly operation: string;
  readonly options: Map<string, string | true>;
}

export async function run(argv: readonly string[]): Promise<Record<string, unknown>> {
  const parsed = parseCommand(argv);
  const input = parsed.options.has('stdin') ? await readStdinJson() : undefined;
  if (parsed.operation === 'impact.analyze') {
    const request = await analyzeRequest(parsed.options, input);
    const workspace = await canonicalWorkspace(request.workspace);
    const normalizedRequest = { ...request, workspace };
    const provider = new LspCallHierarchyProvider(
      workspace,
      request.file,
      request.provider,
      request.timeoutMs ?? 30000,
    );
    const notes = new NoteService(workspace);
    try {
      const data = await analyzeImpact(normalizedRequest, provider, item => notes.resolve(item));
      return envelope(parsed.operation, data);
    } finally {
      await provider.dispose();
    }
  }
  if (parsed.operation === 'note.list') {
    const request = noteListRequest(parsed.options, input);
    const workspace = await canonicalWorkspace(request.workspace);
    const notes = new NoteService(workspace);
    return envelope(parsed.operation, await notes.list({ ...request, workspace }));
  }
  if (parsed.operation === 'note.get' || parsed.operation === 'note.set' || parsed.operation === 'note.delete') {
    const request = await noteRequest(parsed.operation, parsed.options, input);
    const workspace = await canonicalWorkspace(request.workspace);
    const normalizedRequest = { ...request, workspace };
    const provider = new LspCallHierarchyProvider(
      workspace,
      request.target.file,
      request.provider,
      request.timeoutMs ?? 30000,
    );
    const notes = new NoteService(workspace);
    try {
      const item = await prepareTarget(provider, workspace, request.target);
      const noteData = parsed.operation === 'note.get'
        ? await notes.get(item)
        : await notes.mutate(item, normalizedRequest as NoteMutationRequest, parsed.operation === 'note.set' ? 'set' : 'delete');
      const data = { ...noteData, provider: provider.capabilities };
      return envelope(parsed.operation, data);
    } finally {
      await provider.dispose();
    }
  }
  throw new CliError('invalid_command', 'Expected analyze or note get|list|set|delete.', 2);
}

async function main(): Promise<void> {
  let operation = 'unknown';
  try {
    operation = operationName(process.argv.slice(2));
    const response = await run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    const value = error instanceof CliError
      ? error
      : new CliError('internal_error', error instanceof Error ? error.message : String(error), 10);
    const response = {
      schemaVersion: 1,
      operation,
      ok: false,
      error: {
        code: value.code,
        message: value.message,
        retryable: value.retryable,
        ...(value.details === undefined ? {} : { details: value.details }),
      },
    };
    process.stderr.write(`${JSON.stringify(response)}\n`);
    process.exitCode = value.exitCode;
  }
}

function envelope(operation: string, data: object): Record<string, unknown> {
  const fields = data as Record<string, unknown>;
  const noteOperation = operation.startsWith('note.');
  return {
    schemaVersion: 1,
    operation,
    ok: true,
    data,
    capabilities: fields.provider ?? (noteOperation ? {
      sharedNotes: true,
      sourceNotes: true,
      localNotes: true,
      personalNotes: false,
    } : {}),
    limitations: fields.limitations ?? (noteOperation ? ['vscode_personal_notes_unavailable'] : []),
    timings: fields.timings ?? {},
  };
}

function parseCommand(argv: readonly string[]): ParsedCommand {
  const operation = operationName(argv);
  const consumed = operation.startsWith('note.') ? 2 : 1;
  const options = new Map<string, string | true>();
  for (let index = consumed; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) {
      throw new CliError('invalid_request', `Unexpected argument: ${argument ?? ''}`, 2);
    }
    const key = argument.slice(2);
    if (options.has(key)) {
      throw new CliError('invalid_request', `Option --${key} was provided more than once.`, 2);
    }
    if (['stdin', 'apply'].includes(key)) {
      options.set(key, true);
      continue;
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new CliError('invalid_request', `Option --${key} requires a value.`, 2);
    }
    options.set(key, value);
  }
  const allowed = allowedOptions(operation);
  for (const key of options.keys()) {
    if (!allowed.has(key)) {
      throw new CliError('invalid_request', `Option --${key} is not valid for ${operation}.`, 2);
    }
  }
  if (options.has('stdin') && options.size > 1) {
    throw new CliError('invalid_request', '--stdin cannot be combined with other options.', 2);
  }
  return { operation, options };
}

function allowedOptions(operation: string): ReadonlySet<string> {
  if (operation === 'impact.analyze') {
    return new Set(['workspace', 'file', 'line', 'column', 'depth', 'max-nodes', 'include-source', 'timeout-ms', 'provider-config', 'stdin']);
  }
  if (operation === 'note.list') {
    return new Set(['workspace', 'scope', 'stdin']);
  }
  if (operation === 'note.get') {
    return new Set(['workspace', 'file', 'line', 'column', 'timeout-ms', 'provider-config', 'stdin']);
  }
  if (operation === 'note.set') {
    return new Set(['workspace', 'file', 'line', 'column', 'scope', 'text', 'apply', 'expected-token', 'timeout-ms', 'provider-config', 'stdin']);
  }
  if (operation === 'note.delete') {
    return new Set(['workspace', 'file', 'line', 'column', 'scope', 'apply', 'expected-token', 'timeout-ms', 'provider-config', 'stdin']);
  }
  return new Set();
}

function operationName(argv: readonly string[]): string {
  if (argv[0] === 'analyze') {
    return 'impact.analyze';
  }
  if (argv[0] === 'note' && ['get', 'list', 'set', 'delete'].includes(argv[1] ?? '')) {
    return `note.${argv[1]}`;
  }
  return 'unknown';
}

async function analyzeRequest(options: Map<string, string | true>, input: unknown): Promise<AnalyzeRequest> {
  if (input !== undefined) {
    return validateAnalyzeObject(input);
  }
  return validateAnalyzeObject({
    workspace: optionString(options, 'workspace') ?? process.cwd(),
    file: optionString(options, 'file'),
    line: optionNumber(options, 'line'),
    column: optionNumber(options, 'column'),
    depth: optionNumber(options, 'depth', false),
    maxNodes: optionNumber(options, 'max-nodes', false),
    includeSource: optionString(options, 'include-source'),
    timeoutMs: optionNumber(options, 'timeout-ms', false),
    provider: await providerOption(options),
  });
}

function noteListRequest(options: Map<string, string | true>, input: unknown): NoteListRequest {
  const value = input === undefined ? {
    workspace: optionString(options, 'workspace') ?? process.cwd(),
    scope: optionString(options, 'scope'),
  } : asObject(input);
  rejectUnknown(value, ['workspace', 'scope']);
  return {
    workspace: requiredString(value.workspace, 'workspace'),
    scope: value.scope === undefined ? undefined : noteScope(value.scope),
  };
}

async function noteRequest(
  operation: string,
  options: Map<string, string | true>,
  input: unknown,
): Promise<NoteGetRequest | NoteMutationRequest> {
  const value = input === undefined ? {
    workspace: optionString(options, 'workspace') ?? process.cwd(),
    target: {
      file: optionString(options, 'file'),
      position: { line: optionNumber(options, 'line'), column: optionNumber(options, 'column') },
    },
    scope: optionString(options, 'scope'),
    text: optionString(options, 'text'),
    apply: options.get('apply') === true,
    expectedToken: optionString(options, 'expected-token'),
    timeoutMs: optionNumber(options, 'timeout-ms', false),
    provider: await providerOption(options),
  } : asObject(input);
  const allowedFields = operation === 'note.get'
    ? ['workspace', 'target', 'timeoutMs', 'provider']
    : operation === 'note.set'
      ? ['workspace', 'target', 'scope', 'text', 'apply', 'expectedToken', 'timeoutMs', 'provider']
      : ['workspace', 'target', 'scope', 'apply', 'expectedToken', 'timeoutMs', 'provider'];
  if (input !== undefined) {
    rejectUnknown(value, allowedFields);
  }
  if (value.apply !== undefined && typeof value.apply !== 'boolean') {
    throw new CliError('invalid_request', 'apply must be a boolean.', 2);
  }
  const base: NoteGetRequest = {
    workspace: requiredString(value.workspace, 'workspace'),
    target: targetObject(value.target),
    timeoutMs: optionalPositiveInteger(value.timeoutMs, 'timeoutMs'),
    provider: providerObject(value.provider),
  };
  if (operation === 'note.get') {
    return base;
  }
  if (operation === 'note.set' && (typeof value.text !== 'string' || value.text.trim().length === 0)) {
    throw new CliError('invalid_request', 'note.set requires non-empty text.', 2);
  }
  return {
    ...base,
    scope: noteScope(value.scope),
    text: value.text === undefined ? undefined : requiredString(value.text, 'text'),
    apply: value.apply === true,
    expectedToken: value.expectedToken === undefined ? undefined : requiredString(value.expectedToken, 'expectedToken'),
  };
}

function validateAnalyzeObject(input: unknown): AnalyzeRequest {
  const value = asObject(input);
  rejectUnknown(value, ['workspace', 'file', 'line', 'column', 'depth', 'maxNodes', 'includeSource', 'timeoutMs', 'expectedSymbol', 'provider']);
  const includeSource = value.includeSource === undefined ? undefined : requiredString(value.includeSource, 'includeSource');
  if (includeSource !== undefined && !['none', 'declaration', 'body'].includes(includeSource)) {
    throw new CliError('invalid_request', 'includeSource must be none, declaration, or body.', 2);
  }
  return {
    workspace: requiredString(value.workspace, 'workspace'),
    file: requiredString(value.file, 'file'),
    line: requiredPositiveInteger(value.line, 'line'),
    column: requiredPositiveInteger(value.column, 'column'),
    depth: optionalPositiveInteger(value.depth, 'depth'),
    maxNodes: optionalPositiveInteger(value.maxNodes, 'maxNodes'),
    includeSource: includeSource as SourceMode | undefined,
    timeoutMs: optionalPositiveInteger(value.timeoutMs, 'timeoutMs'),
    expectedSymbol: expectedSymbolObject(value.expectedSymbol),
    provider: providerObject(value.provider),
  };
}

async function prepareTarget(
  provider: LspCallHierarchyProvider,
  workspaceValue: string,
  target: SymbolTarget,
) {
  const workspace = path.resolve(workspaceValue);
  const file = await resolveWorkspaceFileSecure(workspace, target.file);
  const items = await provider.prepare(file, {
    line: target.position.line - 1,
    character: target.position.column - 1,
  });
  return selectRoot(items, target.expectedSymbol);
}

function targetObject(input: unknown): SymbolTarget {
  const value = asObject(input);
  rejectUnknown(value, ['file', 'position', 'expectedSymbol']);
  const position = asObject(value.position);
  rejectUnknown(position, ['line', 'column']);
  return {
    file: requiredString(value.file, 'target.file'),
    position: {
      line: requiredPositiveInteger(position.line, 'target.position.line'),
      column: requiredPositiveInteger(position.column, 'target.position.column'),
    },
    expectedSymbol: expectedSymbolObject(value.expectedSymbol),
  };
}

function expectedSymbolObject(input: unknown): ExpectedSymbol | undefined {
  if (input === undefined) {
    return undefined;
  }
  const value = asObject(input);
  rejectUnknown(value, ['name', 'kind', 'detail']);
  return {
    name: value.name === undefined ? undefined : requiredString(value.name, 'expectedSymbol.name'),
    kind: value.kind === undefined ? undefined : (typeof value.kind === 'number' ? value.kind : requiredString(value.kind, 'expectedSymbol.kind')),
    detail: value.detail === undefined ? undefined : requiredString(value.detail, 'expectedSymbol.detail'),
  };
}

function providerObject(input: unknown): ProviderCommand | undefined {
  if (input === undefined) {
    return undefined;
  }
  const value = asObject(input);
  rejectUnknown(value, ['command', 'args', 'languageId']);
  if (value.args !== undefined && (!Array.isArray(value.args) || !value.args.every(argument => typeof argument === 'string'))) {
    throw new CliError('invalid_request', 'provider.args must be an array of strings.', 2);
  }
  return {
    command: requiredString(value.command, 'provider.command'),
    args: value.args as string[] | undefined,
    languageId: value.languageId === undefined ? undefined : requiredString(value.languageId, 'provider.languageId'),
  };
}

async function providerOption(options: Map<string, string | true>): Promise<ProviderCommand | undefined> {
  const file = optionString(options, 'provider-config');
  if (!file) {
    return undefined;
  }
  return providerObject(JSON.parse(await fs.readFile(file, 'utf8')));
}

function noteScope(input: unknown): NoteScope {
  if (input === 'shared' || input === 'source' || input === 'local') {
    return input;
  }
  throw new CliError('invalid_request', 'scope must be shared, source, or local.', 2);
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CliError('invalid_request', 'Expected a JSON object.', 2);
  }
  return input as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliError('invalid_request', `${field} must be a non-empty string.`, 2);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CliError('invalid_request', `${field} must be a number.`, 2);
  }
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  const number = requiredNumber(value, field);
  if (!Number.isInteger(number) || number < 1) {
    throw new CliError('invalid_request', `${field} must be a positive integer.`, 2);
  }
  return number;
}

function optionalPositiveInteger(value: unknown, field: string): number | undefined {
  return value === undefined ? undefined : requiredPositiveInteger(value, field);
}

function rejectUnknown(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter(key => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new CliError('invalid_request', `Unknown field: ${unknown.sort().join(', ')}`, 2);
  }
}

function optionString(options: Map<string, string | true>, key: string): string | undefined {
  const value = options.get(key);
  return typeof value === 'string' ? value : undefined;
}

function optionNumber(options: Map<string, string | true>, key: string, required = true): number | undefined {
  const value = optionString(options, key);
  if (value === undefined) {
    if (required) {
      throw new CliError('invalid_request', `Option --${key} is required.`, 2);
    }
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new CliError('invalid_request', `Option --${key} must be a number.`, 2);
  }
  return parsed;
}

async function readStdinJson(): Promise<unknown> {
  let text = '';
  for await (const chunk of process.stdin) {
    text += String(chunk);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError('invalid_request', `stdin is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, 2);
  }
}

if (require.main === module) {
  void main();
}
