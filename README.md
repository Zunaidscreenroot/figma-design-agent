# Figma Design Agent

An evidence-first agent runtime for building and editing real Figma designs with a deterministic action layer, project-aware context, and automatic quality verification.

## What this repository is

This project aims to reproduce the useful mechanics of an agentic Figma workflow while making correctness measurable:

```text
Prompt
  ↓
Inspect Figma
  ↓
Compile semantic context
  ↓
Retrieve components/tokens
  ↓
Plan structured actions
  ↓
Execute on the real canvas
  ↓
Re-inspect
  ↓
Screenshot
  ↓
Visual + UX + structural critique
  ↓
Bounded repair
  ↓
Complete
```

The architecture intentionally separates model reasoning from Figma execution. The model proposes a typed `ActionPlan`; the plugin executes the actions against Figma nodes.

## Repository layout

- `apps/plugin` — Figma plugin UI, context extraction, action executor, screenshot capture
- `apps/agent` — local HTTP agent runtime, LLM adapter, planner, retrieval, critique and repair
- `packages/core` — shared Design AST, Action DSL and validators
- `agent-skills` — procedural design skills for Figma, UX, responsive design, mobile conversion, wireframing, accessibility and design systems
- `evals` — repeatable benchmark tasks and engineering scorer
- `docs` — architecture and development documentation

## Quick start

Requirements:

- Node.js 20+
- npm 10+
- Figma
- An OpenAI-compatible multimodal model endpoint (OpenRouter is supported)

Install:

```bash
npm install
```

Configure:

```bash
cp .env.example .env
```

Set at least:

```env
LLM_API_KEY=your-key
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=your-model
```

Start the agent API:

```bash
npm run dev:agent
```

Build the plugin:

```bash
npm run build:plugin
```

Then import `apps/plugin/manifest.json` from Figma's Development plugins menu.

## Safety and accuracy principles

1. Do not invent Figma IDs.
2. Reuse existing components before recreating them.
3. Reuse variables/tokens before hardcoding values.
4. Make the smallest valid edit.
5. Treat uncertainty as evidence to gather, not as a reason to hallucinate.
6. Validate structural state after mutations.
7. Use screenshot critique for visual decisions.
8. Keep automatic repair bounded.

## Current V1 scope

The first implementation supports:

- frame/section/text creation
- component instance creation
- text/property edits
- auto-layout edits
- variable binding
- move/resize/delete/replace
- screenshot capture
- model-backed plan / critique / repair
- deterministic structural critique
- mobile conversion workflow
- project-specific skill files

The development build deliberately uses Figma's current dynamic-page-compatible async APIs for document/node/variable access. Full-document component scanning is intentionally conservative for the first version and can be optimized for large files.

citeturn151423search0turn628597search5

## Roadmap

- smarter semantic component retrieval with visual similarity
- team-library discovery/import
- full project memory
- transaction rollback
- reference-vs-output screenshot comparison
- stronger responsive inference
- automated benchmark execution against real Figma fixtures
- production-hosted agent API

## Persistent UX memory (optional)

Configure Supabase PostgreSQL to let the agent learn from reviewed work:

1. Apply the SQL migration at supabase/migrations/202610090001_ux_design_memory.sql.
2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the agent server environment.
3. Set UX_MEMORY_PROJECT_KEY to isolate examples by product/project.
4. Run the agent, then use Accept / Needs changes / Reject in the plugin review panel.

Accepted designs become positive examples; revised/rejected examples preserve feedback as warnings. Selecting the reusable-rule checkbox explicitly saves that feedback as an approved rule. Review screenshots are stored in a private Supabase Storage bucket when possible. This is retrieval-based learning, not automatic model fine-tuning.

Do not expose the Supabase service-role key in plugin or browser code. Visual reference screenshots are sent back to the model only when UX_MEMORY_VISUAL_REFERENCES=true and a vision-capable model is configured.
