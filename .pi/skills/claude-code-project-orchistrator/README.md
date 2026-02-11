# Project Orchestrator Skill

A Claude skill that decomposes projects into routed task plans distributed across multiple AI platforms.

## Installation

### Claude Code (Personal — all projects)
```bash
cp -r project-orchestrator/ ~/.claude/skills/project-orchestrator/
```

### Claude Code (Project-specific)
```bash
cp -r project-orchestrator/ .claude/skills/project-orchestrator/
```

### Cursor
```bash
cp -r project-orchestrator/ ~/.cursor/skills/project-orchestrator/
```

## Usage

### In Claude Code
```
/project-orchestrator

Here is the project brief:
[paste your project details]
```

Or, if the skill auto-triggers from your description:
```
Orchestrate this project across my AI tools:
[paste your project details]
```

### In Claude Cowork
Point a Cowork session to a folder containing this skill, then describe your project. The orchestrator will generate the task directory structure within the folder.

## What It Produces

```
{project-name}/
├── 00-orchestration-plan.md        ← Master plan with phased execution
├── cowork/                         ← Claude Cowork tasks
├── claude-code/                    ← Claude Code tasks
├── cursor/                         ← Cursor tasks
├── warp/                           ← Warp.dev tasks
├── n8n/                            ← n8n automation tasks
└── resources/                      ← Shared reference materials
```

Each task file is **self-contained and prompt-ready** — you can open any task file and paste its prompt directly into the target platform.

## Supported Platforms

| Platform | Task Prefix | Best For |
|----------|-------------|----------|
| Claude Cowork | `COWORK-` | Content, research, strategy, documentation |
| Claude Code | `CODE-` | Full-stack dev, Git ops, deployment, infrastructure |
| Cursor | `CURSOR-` | Component iteration, UI work, in-editor refactors |
| Warp.dev | `WARP-` | Terminal workflows, DevOps, server management |
| n8n | `N8N-` | Automations, integrations, scheduled workflows |

## Customization

### Adding New Platforms
1. Add platform profile to `references/platform-capabilities.md`
2. Add task template to `references/task-templates.md`
3. Add routing rules to the SKILL.md routing matrix
4. Update the scaffold script to create the new directory

### Modifying Routing Logic
Edit the routing matrix and decision flowchart in `references/platform-capabilities.md`.

### Customizing Task Templates
Edit `references/task-templates.md` to match your team's preferred task format.

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Core orchestration logic and workflow |
| `references/platform-capabilities.md` | Detailed routing rules per platform |
| `references/task-templates.md` | Output templates for each platform's tasks |
| `scripts/scaffold-project.sh` | Bash script to create empty project directories |

---
*v1.0 — February 2026*
