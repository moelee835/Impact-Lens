import * as vscode from 'vscode';
import { ImpactNode, ImpactResult } from './types';

type ImpactTreeElement = EmptyItem | RootItem | GroupItem | NodeItem;

class EmptyItem {
  readonly kind = 'empty';
  constructor(readonly message: string) {}
}

class RootItem {
  readonly kind = 'root';
  constructor(readonly node: ImpactNode) {}
}

class GroupItem {
  readonly kind = 'group';
  constructor(
    readonly label: string,
    readonly nodes: readonly ImpactNode[],
    readonly icon: string,
  ) {}
}

class NodeItem {
  readonly kind = 'node';
  constructor(readonly node: ImpactNode) {}
}

export class ImpactTreeProvider implements vscode.TreeDataProvider<ImpactTreeElement> {
  private readonly changeEmitter = new vscode.EventEmitter<ImpactTreeElement | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private result: ImpactResult | undefined;
  private status = 'Place the cursor in a function to analyze its impact.';

  setLoading(symbolName?: string): void {
    this.result = undefined;
    this.status = symbolName ? `Analyzing ${symbolName}…` : 'Analyzing current function…';
    this.changeEmitter.fire(undefined);
  }

  setResult(result: ImpactResult | undefined, message?: string): void {
    this.result = result;
    this.status = message ?? 'No call hierarchy is available at the current cursor position.';
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: ImpactTreeElement): vscode.TreeItem {
    if (element.kind === 'empty') {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('info');
      return item;
    }

    if (element.kind === 'root') {
      const item = new vscode.TreeItem(
        element.node.item.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.description = [
        stateLabel(this.result?.analysisState),
        element.node.note || relativeLocation(element.node.item),
      ].filter(Boolean).join(' · ');
      item.iconPath = new vscode.ThemeIcon(
        this.result?.analysisState === 'analyzing' ? 'sync~spin' : 'target',
      );
      item.contextValue = 'impactLens.root';
      return item;
    }

    if (element.kind === 'group') {
      const item = new vscode.TreeItem(
        `${element.label} (${element.nodes.length})`,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.iconPath = new vscode.ThemeIcon(element.icon);
      return item;
    }

    const item = new vscode.TreeItem(element.node.item.name, vscode.TreeItemCollapsibleState.None);
    const diagnosticCount = element.node.diagnostics.length;
    item.description = [
      element.node.note || relativeLocation(element.node.item),
      diagnosticCount ? `${diagnosticCount} diagnostic${diagnosticCount === 1 ? '' : 's'}` : '',
      element.node.reviewed ? 'Reviewed' : '',
      element.node.testFreshness === 'outdated' ? 'Test verification required' : '',
    ].filter(Boolean).join(' · ');
    const tooltipLines = [
      `**${element.node.item.name}**`,
      '',
      element.node.note || '_No function note_',
      '',
    ];
    if (element.node.noteSource) {
      tooltipLines.push(`Note source: ${noteSourceLabel(element.node.noteSource)}`, '');
    }
    if (element.node.diagnostics.length) {
      tooltipLines.push('**Diagnostics**', '');
      for (const diagnostic of element.node.diagnostics) {
        tooltipLines.push(`- ${diagnostic.severity}: ${diagnostic.message} (line ${diagnostic.line})`);
      }
      tooltipLines.push('');
    }
    if (element.node.changed) {
      tooltipLines.push('Changed in the current live session', '');
    }
    if (element.node.reviewed) {
      tooltipLines.push('Manually reviewed', '');
    }
    if (element.node.testFreshness === 'outdated') {
      tooltipLines.push('No current test result is available after code changes', '');
    }
    tooltipLines.push(`${relativeLocation(element.node.item)} · ${element.node.depth} hop`);
    item.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
    item.iconPath = new vscode.ThemeIcon(
      element.node.relation === 'test'
        ? 'beaker'
        : element.node.relation === 'direct'
          ? 'arrow-right'
          : 'git-merge',
    );
    item.command = {
      command: 'impactLens.openLocation',
      title: 'Open symbol',
      arguments: [element.node.item.uri, element.node.item.selectionRange],
    };
    item.contextValue = 'impactLens.node';
    return item;
  }

  getChildren(element?: ImpactTreeElement): ImpactTreeElement[] {
    if (!this.result) {
      return element ? [] : [new EmptyItem(this.status)];
    }

    if (!element) {
      return [new RootItem(this.result.root)];
    }
    if (element.kind !== 'root') {
      if (element.kind === 'group') {
        return element.nodes.map(node => new NodeItem(node));
      }
      return [];
    }

    const direct = this.result.nodes.filter(node => node.relation === 'direct');
    const transitive = this.result.nodes.filter(node => node.relation === 'transitive');
    const tests = this.result.nodes.filter(node => node.relation === 'test');
    const changed = this.result.nodes.filter(node => node.changed);
    const addedIds = new Set(this.result.delta.addedNodeIds);
    const added = this.result.nodes.filter(node => addedIds.has(node.id));
    const diagnostics = this.result.nodes.filter(node => node.diagnostics.length > 0);
    return [
      new GroupItem('Changed functions', changed, 'edit'),
      new GroupItem('New impact', added, 'diff-added'),
      new GroupItem('Diagnostics', diagnostics, 'error'),
      new GroupItem('Direct callers', direct, 'arrow-right'),
      new GroupItem('Transitive impact', transitive, 'git-merge'),
      new GroupItem('Related tests', tests, 'beaker'),
    ].filter(group => group.nodes.length > 0);
  }
}

function stateLabel(state: ImpactResult['analysisState'] | undefined): string {
  if (state === 'stale') {
    return 'Editing · stale';
  }
  if (state === 'analyzing') {
    return 'Analyzing…';
  }
  if (state === 'partial') {
    return 'Partial result';
  }
  if (state === 'failed') {
    return 'Analysis failed';
  }
  return '';
}

function noteSourceLabel(source: NonNullable<ImpactNode['noteSource']>): string {
  if (source === 'personal') {
    return 'Personal';
  }
  if (source === 'shared') {
    return 'Shared';
  }
  return 'Source comment';
}

function relativeLocation(item: vscode.CallHierarchyItem): string {
  return `${vscode.workspace.asRelativePath(item.uri, false)}:${item.selectionRange.start.line + 1}`;
}
