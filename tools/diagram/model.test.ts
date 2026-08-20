import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildMermaid, loadShikiState } from './model.ts';
import type { ShikiState } from './model.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function minimalState(): ShikiState {
  return {
    goals: [
      {
        id: 'G-20260820T085729053581Z-595cfc78',
        title: 'GitHub の機能別技術解説と Shiki 内部動作の可視化サイトを公開する',
        risk_level: 'low',
      },
    ],
    plans: [{ id: 'P-20260820T085729052749Z-e6ce760a', specFreeze: 'frozen' }],
    tasks: [
      {
        id: 'T-20260820T085729054418Z-368672b8',
        goal_id: 'G-20260820T085729053581Z-595cfc78',
        title: '最初の垂直スライス: Starlight サイトを Pages に公開する',
        assigned_runtime: 'claude-code',
        risk_level: 'low',
        required_skills: ['tdd', 'code-review'],
        dependencies: [],
        locks: ['path:**/*'],
        acceptanceCount: 5,
      },
    ],
    dags: [
      {
        goal_id: 'G-20260820T085729053581Z-595cfc78',
        nodes: ['T-20260820T085729054418Z-368672b8'],
        edges: [],
      },
    ],
    requiredChecks: ['Validate Shiki mirror', 'CCA verdict', 'MergeGate metadata check'],
  };
}

describe('buildMermaid', () => {
  it('renders a flowchart carrying the real goal id and title', () => {
    const mermaid = buildMermaid(minimalState());
    expect(mermaid.startsWith('flowchart TD')).toBe(true);
    // The short id of the goal must appear as evidence it came from real data.
    expect(mermaid).toContain('595cfc78');
    expect(mermaid).toContain('Shiki 内部動作の可視化サイト');
  });

  it('renders the plan spec-freeze node and each Task DAG node with static fields', () => {
    const mermaid = buildMermaid(minimalState());
    expect(mermaid).toContain('e6ce760a'); // plan short id
    expect(mermaid).toContain('spec_freeze: frozen');
    // Task node: short id, runtime and skills (static, loop-stable fields).
    expect(mermaid).toContain('368672b8');
    expect(mermaid).toContain('claude-code');
    expect(mermaid).toContain('tdd, code-review');
  });

  it('renders Task DAG dependency edges as Mermaid arrows', () => {
    const state = minimalState();
    const dep = 'T-20260820T085729054418Z-aaaaaaaa';
    state.tasks.push({
      id: dep,
      goal_id: 'G-20260820T085729053581Z-595cfc78',
      title: '依存タスク',
      assigned_runtime: 'codex',
      risk_level: 'low',
      required_skills: ['tdd'],
      dependencies: [],
      locks: ['path:docs/**'],
      acceptanceCount: 1,
    });
    state.dags[0]!.nodes.push(dep);
    state.dags[0]!.edges.push({ from: dep, to: 'T-20260820T085729054418Z-368672b8' });
    const mermaid = buildMermaid(state);
    // Edge from the dependency node id to the dependent node id.
    expect(mermaid).toMatch(/T_[0-9A-Za-z_]*aaaaaaaa --> T_[0-9A-Za-z_]*368672b8/);
  });

  it('renders the MergeGate required checks from config', () => {
    const mermaid = buildMermaid(minimalState());
    expect(mermaid).toContain('MergeGate');
    expect(mermaid).toContain('Validate Shiki mirror');
    expect(mermaid).toContain('CCA verdict');
    expect(mermaid).toContain('MergeGate metadata check');
  });

  it('renders the canonical Shiki lifecycle spine', () => {
    const mermaid = buildMermaid(minimalState());
    for (const stage of [
      'Goal Seek',
      'Context & Impact',
      'Task DAG',
      'CCA',
      'MergeGate',
      'Repair Loop',
    ]) {
      expect(mermaid).toContain(stage);
    }
  });

  it('is deterministic and independent of goal/task input ordering', () => {
    // goals/tasks/dags are id-keyed sets: their file-read order must not change
    // output. (requiredChecks is a semantically ordered list and is preserved.)
    const a = buildMermaid(minimalState());
    const reordered = minimalState();
    reordered.goals.reverse();
    reordered.tasks.reverse();
    reordered.dags.reverse();
    const b = buildMermaid(reordered);
    expect(b).toBe(a);
  });
});

describe('loadShikiState', () => {
  it('reads the real .shiki mirror of this repository', () => {
    const state = loadShikiState(repoRoot);
    expect(state.goals.some((goal) => goal.id.includes('595cfc78'))).toBe(true);
    expect(state.tasks.some((task) => task.id.includes('368672b8'))).toBe(true);
    expect(state.dags.some((dag) => dag.nodes.some((node) => node.includes('368672b8')))).toBe(true);
    expect(state.requiredChecks).toContain('Validate Shiki mirror');
    expect(state.requiredChecks).toContain('CCA verdict');
  });

  it('builds a diagram from the real mirror that names the real ids', () => {
    const mermaid = buildMermaid(loadShikiState(repoRoot));
    expect(mermaid).toContain('595cfc78');
    expect(mermaid).toContain('368672b8');
  });
});
