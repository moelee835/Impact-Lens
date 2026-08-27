import * as vscode from 'vscode';
import {
  analysisStateLabel,
  CompletenessSummary,
  completenessInput,
  indexingLabel,
  providerLabel,
  semanticScopeLabel,
  stateBadge,
  summarizeCompleteness,
  traversalLabel,
} from './completeness';
import { ImpactNode, ImpactResult } from './types';

type ImpactTreeElement = EmptyItem | NoticeItem | RootItem | GroupItem | NodeItem;

/**
 * What the view shows when there is no graph at all. This is one of the three empty states, and the one
 * that must never be confused with "this symbol has no callers": there is no result to draw a conclusion
 * from, so the wording states that and offers the doctor.
 */
export interface TreeNotice {
  readonly message: string;
  readonly action?: string;
  readonly offerDoctor?: boolean;
}

class EmptyItem {
  readonly kind = 'empty';
  constructor(readonly notice: TreeNotice) {}
}

class NoticeItem {
  readonly kind = 'notice';
  constructor(readonly summary: CompletenessSummary) {}
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
  private notice: TreeNotice = { message: 'Place the cursor in a function to analyze its impact.' };

  setLoading(symbolName?: string): void {
    this.result = undefined;
    this.notice = {
      message: symbolName ? `Analyzing ${symbolName}…` : 'Analyzing current function…',
    };
    this.changeEmitter.fire(undefined);
  }

  setResult(result: ImpactResult | undefined, notice?: TreeNotice): void {
    this.result = result;
    if (notice) {
      this.notice = notice;
    }
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: ImpactTreeElement): vscode.TreeItem {
    if (element.kind === 'empty') {
      const item = new vscode.TreeItem(element.notice.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.notice.offerDoctor ? 'warning' : 'info');
      item.tooltip = new vscode.MarkdownString(
        [element.notice.message, element.notice.action].filter(Boolean).join('\n\n'),
      );
      if (element.notice.offerDoctor) {
        item.command = {
          command: 'impactLens.runProviderDoctor',
          title: 'Run Provider Doctor',
        };
      }
      return item;
    }

    if (element.kind === 'notice') {
      const item = new vscode.TreeItem(element.summary.headline, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.summary.severity === 'error' ? 'error' : 'warning');
      item.tooltip = new vscode.MarkdownString(
        [element.summary.headline, element.summary.action].filter(Boolean).join('\n\n'),
      );
      return item;
    }

    if (element.kind === 'root') {
      const item = new vscode.TreeItem(
        element.node.item.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      const input = this.result ? toCompletenessInput(this.result) : undefined;
      item.description = [
        // `stateBadge` rather than the raw field: a traversal that stopped at a budget still carries
        // `analysisState: 'current'` until the controller downgrades it.
        input ? stateBadge(input).label : analysisStateLabel(this.result?.analysisState),
        element.node.note || relativeLocation(element.node.item),
      ].filter(Boolean).join(' · ');
      item.iconPath = new vscode.ThemeIcon(
        this.result?.analysisState === 'analyzing' ? 'sync~spin' : 'target',
      );
      if (this.result && input) {
        const summary = summarizeCompleteness(input);
        // The description line is one narrow row, so the coverage detail lands here instead. This is the
        // only Explorer surface that carries the full reason list.
        item.tooltip = new vscode.MarkdownString([
          '**Static Call Hierarchy coverage**',
          '',
          summary.headline,
          ...(summary.action ? ['', `→ ${summary.action}`] : []),
          '',
          `Provider: ${providerLabel(this.result.provider)}`,
          `Language: ${this.result.provider.detectedLanguageId}`,
          `Traversal: ${traversalLabel(input)}`,
          `Semantic scope: ${semanticScopeLabel(input.semanticStatus)}`,
          `Indexing: ${indexingLabel(input.indexingStatus)}`,
          ...(input.reasons.length ? ['', `Reasons: ${input.reasons.join(', ')}`] : []),
        ].join('\n'));
      }
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
      return element ? [] : [new EmptyItem(this.notice)];
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
    const groups: ImpactTreeElement[] = [
      new GroupItem('Changed functions', changed, 'edit'),
      new GroupItem('New impact', added, 'diff-added'),
      new GroupItem('Diagnostics', diagnostics, 'error'),
      new GroupItem('Direct callers', direct, 'arrow-right'),
      new GroupItem('Transitive impact', transitive, 'git-merge'),
      new GroupItem('Related tests', tests, 'beaker'),
    ].filter(group => group.nodes.length > 0);

    // Before this, a graph with no callers and a graph that stopped at a budget both rendered as a lone
    // root with nothing under it. The notice row is what makes the two readable without a tooltip.
    const summary = summarizeCompleteness(toCompletenessInput(this.result));
    const alreadyInDescription = summary.outcome === 'stale' || summary.outcome === 'analyzing';
    if (summary.severity !== 'info' && !alreadyInDescription) {
      return [new NoticeItem(summary), ...groups];
    }
    return groups;
  }
}

function toCompletenessInput(result: ImpactResult) {
  return completenessInput({
    nodeCount: result.nodes.length,
    truncated: result.truncated,
    traversalLimits: result.traversalLimits,
    requestedDepth: result.requestedDepth,
    reachedDepth: result.reachedDepth,
    maxNodes: result.maxNodes,
    analysisState: result.analysisState,
    coverage: result.coverage,
  });
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
