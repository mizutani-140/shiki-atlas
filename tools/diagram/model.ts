import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Pure model + Mermaid rendering for the Shiki internal-flow diagram.
//
// The diagram is generated from *loop-stable* .shiki data only — goals, plans
// (spec-freeze), tasks (static planning fields), the Task DAG, and the MergeGate
// required checks. Volatile runtime state (the ledger stream, task.status,
// expected_pr, ledger_evidence) is deliberately excluded so the committed
// artifact does not drift when the autonomous goal loop later appends evidence
// and syncs it onto the PR branch.

export interface GoalView {
  id: string;
  title: string;
  risk_level: string;
  source_plan?: string;
}

export interface PlanView {
  id: string;
  specFreeze: string;
}

export interface TaskView {
  id: string;
  goal_id: string;
  title: string;
  assigned_runtime: string;
  risk_level: string;
  required_skills: string[];
  dependencies: string[];
  locks: string[];
  acceptanceCount: number;
}

export interface DagEdge {
  from: string;
  to: string;
}

export interface DagView {
  goal_id: string;
  nodes: string[];
  edges: DagEdge[];
}

export interface ShikiState {
  goals: GoalView[];
  plans: PlanView[];
  tasks: TaskView[];
  dags: DagView[];
  requiredChecks: string[];
}

function readJsonDir(dir: string): unknown[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: unknown[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), 'utf8')));
    } catch {
      // A malformed mirror file is skipped; validate_shiki.py is the authority
      // that rejects it, not this diagram generator.
    }
  }
  return out;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Parse the `mergegate.required_checks` list out of `.shiki/config.yaml`.
 * Deliberately narrow (no YAML dependency): reads the ordered list under the
 * top-level `mergegate:` mapping, mirroring how mergegate_check.py reads it.
 */
export function parseRequiredChecks(configText: string): string[] {
  const lines = configText.split(/\r?\n/);
  let inMergegate = false;
  let inChecks = false;
  const checks: string[] = [];
  for (const raw of lines) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const stripped = raw.trim();
    if (indent === 0) {
      inMergegate = stripped === 'mergegate:';
      inChecks = false;
      continue;
    }
    if (!inMergegate) continue;
    if (indent === 2) {
      inChecks = stripped === 'required_checks:';
      continue;
    }
    if (inChecks && indent >= 4 && stripped.startsWith('- ')) {
      checks.push(stripped.slice(2).trim().replace(/^["']|["']$/g, ''));
    }
  }
  return checks;
}

/** Read the loop-stable slice of the `.shiki/` mirror used by the diagram. */
export function loadShikiState(root: string): ShikiState {
  const shiki = join(root, '.shiki');

  const goals: GoalView[] = readJsonDir(join(shiki, 'goals'))
    .filter((g): g is Record<string, unknown> => typeof g === 'object' && g !== null)
    .map((g) => ({
      id: asString(g.id),
      title: asString(g.title),
      risk_level: asString(g.risk_level),
      source_plan: asString(g.source_plan) || undefined,
    }))
    .filter((g) => g.id);

  const plans: PlanView[] = readJsonDir(join(shiki, 'plans'))
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => {
      const specFreeze = p.spec_freeze;
      const status =
        typeof specFreeze === 'object' && specFreeze !== null
          ? asString((specFreeze as Record<string, unknown>).status)
          : '';
      return { id: asString(p.id), specFreeze: status || 'unknown' };
    })
    .filter((p) => p.id);

  const tasks: TaskView[] = readJsonDir(join(shiki, 'tasks'))
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map((t) => ({
      id: asString(t.id),
      goal_id: asString(t.goal_id),
      title: asString(t.title),
      assigned_runtime: asString(t.assigned_runtime),
      risk_level: asString(t.risk_level),
      required_skills: asStringArray(t.required_skills),
      dependencies: asStringArray(t.dependencies),
      locks: asStringArray(t.locks),
      acceptanceCount: Array.isArray(t.acceptance_checks) ? t.acceptance_checks.length : 0,
    }))
    .filter((t) => t.id);

  const dags: DagView[] = readJsonDir(join(shiki, 'dag'))
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      goal_id: asString(d.goal_id),
      nodes: asStringArray(d.nodes),
      edges: Array.isArray(d.edges)
        ? d.edges
            .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
            .map((e) => ({ from: asString(e.from), to: asString(e.to) }))
            .filter((e) => e.from && e.to)
        : [],
    }))
    .filter((d) => d.goal_id);

  let requiredChecks: string[] = [];
  try {
    requiredChecks = parseRequiredChecks(readFileSync(join(shiki, 'config.yaml'), 'utf8'));
  } catch {
    requiredChecks = [];
  }

  return { goals, plans, tasks, dags, requiredChecks };
}

/** Last hyphen-delimited segment of a control id, e.g. `368672b8`. */
export function shortId(id: string): string {
  const parts = id.split('-');
  return parts[parts.length - 1] || id;
}

/** A Mermaid-safe node identifier derived from a control id. */
export function nodeId(prefix: string, id: string): string {
  return `${prefix}_${id.replace(/[^A-Za-z0-9]/g, '_')}`;
}

/** Escape a single label line so it cannot break a Mermaid `["..."]` label. */
function escLine(text: string): string {
  return text
    .replace(/["[\]{}|<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Build a multi-line Mermaid label from already-computed lines. */
function label(lines: string[]): string {
  return lines.map(escLine).filter(Boolean).join('<br/>');
}

export function buildMermaid(state: ShikiState): string {
  const lines: string[] = [];
  lines.push('flowchart TD');
  lines.push(
    '  %% Auto-generated from .shiki/ by tools/generate-shiki-diagram.ts — do not edit by hand.',
  );

  const goals = [...state.goals].sort((a, b) => a.id.localeCompare(b.id));
  lines.push('  %% Goals (.shiki/goals)');
  for (const goal of goals) {
    const id = nodeId('G', goal.id);
    lines.push(
      `  ${id}["${label([`🎯 Goal ${shortId(goal.id)}`, goal.title, `risk: ${goal.risk_level}`])}"]`,
    );
  }

  const plans = [...state.plans].sort((a, b) => a.id.localeCompare(b.id));
  lines.push('  %% Plans / Spec Freeze (.shiki/plans)');
  for (const plan of plans) {
    const id = nodeId('P', plan.id);
    lines.push(
      `  ${id}["${label([`📄 Plan ${shortId(plan.id)}`, `spec_freeze: ${plan.specFreeze}`])}"]`,
    );
  }

  const dags = [...state.dags].sort((a, b) => a.goal_id.localeCompare(b.goal_id));
  const tasksById = new Map(state.tasks.map((task) => [task.id, task]));
  lines.push('  %% Task DAG (.shiki/dag + .shiki/tasks)');
  for (const dag of dags) {
    lines.push(`  subgraph ${nodeId('DAG', dag.goal_id)}["Task DAG: ${escLine(shortId(dag.goal_id))}"]`);
    for (const taskId of [...dag.nodes].sort((a, b) => a.localeCompare(b))) {
      const task = tasksById.get(taskId);
      const detail = task
        ? [
            `🧩 ${shortId(task.id)}`,
            task.title,
            `${task.assigned_runtime} · risk: ${task.risk_level}`,
            `skills: ${task.required_skills.join(', ')}`,
            `acceptance checks: ${task.acceptanceCount}`,
          ]
        : [`🧩 ${shortId(taskId)}`, '(no task file)'];
      lines.push(`    ${nodeId('T', taskId)}["${label(detail)}"]`);
    }
    lines.push('  end');
  }

  lines.push('  %% Task DAG dependency edges');
  for (const dag of dags) {
    const edges = [...dag.edges].sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    );
    for (const edge of edges) {
      lines.push(`  ${nodeId('T', edge.from)} --> ${nodeId('T', edge.to)}`);
    }
  }

  // Wire the real planning artifacts to each other: Goal -> Plan (spec freeze)
  // and Goal -> its Task DAG.
  lines.push('  %% Planning-artifact wiring');
  const planIds = new Set(plans.map((plan) => plan.id));
  const dagGoalIds = new Set(dags.map((dag) => dag.goal_id));
  for (const goal of goals) {
    if (goal.source_plan && planIds.has(goal.source_plan)) {
      lines.push(`  ${nodeId('G', goal.id)} --> ${nodeId('P', goal.source_plan)}`);
    }
    if (dagGoalIds.has(goal.id)) {
      lines.push(`  ${nodeId('G', goal.id)} --> ${nodeId('DAG', goal.id)}`);
    }
  }

  // The canonical Shiki lifecycle spine (the "内部フロー"). Fixed, conceptual
  // stages that every registered Goal flows through.
  lines.push('  %% Shiki lifecycle spine (Goal Seek -> ... -> MergeGate -> Repair)');
  const spine: Array<[string, string]> = [
    ['L1', 'Goal Seek'],
    ['L2', 'grill-with-docs'],
    ['L3', 'Context & Impact'],
    ['L4', 'PRD / Spec Freeze'],
    ['L5', 'Task DAG'],
    ['L6', 'Dispatch / Handoff'],
    ['L7', 'TDD 実装'],
    ['L8', 'code-review'],
    ['L9', 'Pull Request'],
    ['L10', 'CCA'],
    ['L11', 'MergeGate'],
    ['L12', 'Merge'],
  ];
  lines.push('  subgraph LIFE["Shiki 内部フロー"]');
  lines.push('    direction TB');
  for (const [id, text] of spine) {
    lines.push(`    ${id}["${escLine(text)}"]`);
  }
  lines.push('    L13["Repair Loop"]');
  lines.push(`    ${spine.map(([id]) => id).join(' --> ')}`);
  lines.push('    L10 -->|repair_required| L13');
  lines.push('    L13 --> L6');
  lines.push('  end');

  // MergeGate required checks, from .shiki/config.yaml (order-preserving).
  lines.push('  %% MergeGate required checks (.shiki/config.yaml)');
  lines.push('  subgraph CHECKS["MergeGate required checks"]');
  state.requiredChecks.forEach((check, index) => {
    lines.push(`    CHK_${index}["${escLine(`${index + 1}. ${check}`)}"]`);
  });
  lines.push('  end');
  lines.push('  L11 --> CHECKS');

  return lines.join('\n') + '\n';
}
