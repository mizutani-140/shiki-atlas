"""Language-independent integrity gate for the generated Shiki flow diagram.

This test is the repository's `python3 -m unittest discover -s tests` suite. It
does NOT reimplement the TypeScript generator (exact-match drift is enforced in
CI by regenerating and running `git diff --exit-code`). Instead it verifies the
committed `src/generated/shiki-flow.mmd` is a faithful, integral view of the real
`.shiki` mirror: every real Goal / Task / DAG node appears, no phantom ids are
drawn, and the MergeGate required checks are present.

Because it reads only stable planning artifacts (goals, tasks, dag, config) and
never the volatile ledger stream / task status, it stays green after the
autonomous goal loop appends evidence and syncs it onto the PR branch.
"""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHIKI = ROOT / ".shiki"
DIAGRAM = ROOT / "src" / "generated" / "shiki-flow.mmd"


def short_id(control_id: str) -> str:
    """Last hyphen-delimited segment, matching the TS generator's shortId()."""
    return control_id.rsplit("-", 1)[-1] if control_id else control_id


def load_json_dir(name: str) -> list[dict]:
    directory = SHIKI / name
    out: list[dict] = []
    if not directory.is_dir():
        return out
    for path in sorted(directory.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict):
            out.append(data)
    return out


class DiagramIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.diagram = DIAGRAM.read_text(encoding="utf-8") if DIAGRAM.is_file() else ""
        cls.goals = load_json_dir("goals")
        cls.tasks = load_json_dir("tasks")
        cls.dags = load_json_dir("dag")

    def test_diagram_artifact_exists_and_is_a_flowchart(self) -> None:
        self.assertTrue(DIAGRAM.is_file(), f"generated diagram missing at {DIAGRAM}")
        self.assertTrue(
            self.diagram.startswith("flowchart TD"),
            "diagram must be a Mermaid flowchart generated from .shiki",
        )

    def test_every_real_goal_short_id_is_drawn(self) -> None:
        for goal in self.goals:
            gid = str(goal.get("id") or "")
            self.assertTrue(gid, "goal file without an id")
            self.assertIn(
                short_id(gid),
                self.diagram,
                f"goal {gid} is not represented in the generated diagram",
            )

    def test_every_real_task_short_id_is_drawn(self) -> None:
        for task in self.tasks:
            tid = str(task.get("id") or "")
            self.assertTrue(tid, "task file without an id")
            self.assertIn(
                short_id(tid),
                self.diagram,
                f"task {tid} is not represented in the generated diagram",
            )

    def test_every_dag_node_is_drawn(self) -> None:
        for dag in self.dags:
            for node in dag.get("nodes") or []:
                self.assertIn(
                    short_id(str(node)),
                    self.diagram,
                    f"DAG node {node} is not represented in the generated diagram",
                )

    def test_no_phantom_goal_or_task_ids(self) -> None:
        """The diagram must not draw a Goal/Task label that has no .shiki file."""
        real_goal_shorts = {short_id(str(g.get("id") or "")) for g in self.goals}
        real_task_shorts = {short_id(str(t.get("id") or "")) for t in self.tasks}

        drawn_goals = set(re.findall(r"🎯 Goal ([0-9A-Za-z]+)", self.diagram))
        drawn_tasks = set(re.findall(r"🧩 ([0-9A-Za-z]+)", self.diagram))

        self.assertEqual(
            drawn_goals,
            real_goal_shorts,
            "diagram goal labels do not match the .shiki goals exactly",
        )
        self.assertEqual(
            drawn_tasks,
            real_task_shorts,
            "diagram task labels do not match the .shiki tasks exactly",
        )

    def test_mergegate_required_checks_present(self) -> None:
        config = (SHIKI / "config.yaml").read_text(encoding="utf-8")
        in_checks = False
        checks: list[str] = []
        for raw in config.splitlines():
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            indent = len(raw) - len(raw.lstrip(" "))
            stripped = raw.strip()
            if indent == 2 and stripped == "required_checks:":
                in_checks = True
                continue
            if in_checks and indent >= 4 and stripped.startswith("- "):
                checks.append(stripped[2:].strip())
            elif in_checks and indent <= 2:
                in_checks = False
        self.assertTrue(checks, "no required_checks parsed from .shiki/config.yaml")
        for check in checks:
            self.assertIn(
                check,
                self.diagram,
                f"required check {check!r} is missing from the diagram",
            )


if __name__ == "__main__":
    unittest.main()
