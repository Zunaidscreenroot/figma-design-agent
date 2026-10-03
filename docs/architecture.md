# Architecture

The agent is intentionally split into three planes.

## 1. Figma execution plane
The plugin owns the document. It reads the current selection and design-system metadata, executes bounded actions, captures screenshots, and reports results.

## 2. Agent reasoning plane
The server compiles context, retrieves relevant components/tokens, asks an LLM for a structured ActionPlan, and runs critique/repair.

## 3. Quality plane
Structural checks run deterministically. Visual/UX critique can be model-backed. Blocking issues can trigger a bounded repair loop.

## Core loop

Observe → Understand → Plan → Execute → Re-inspect → Screenshot → Critique → Repair → Verify → Complete

## Design AST

The model receives a semantic representation rather than raw Figma API objects. This keeps context compact and lets the planner reason about screens, roles, components, tokens and layout.

## Action DSL

The LLM proposes typed actions instead of arbitrary JavaScript. The plugin validates and executes the action set against real Figma nodes.

## Accuracy strategy

- Reuse existing components before primitives.
- Reuse variables before hardcoded values.
- Prefer minimal diffs during edits.
- Require evidence for uncertain decisions.
- Re-validate after mutations.
- Keep repair loops bounded.
