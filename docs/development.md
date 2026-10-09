# Development

## Prerequisites

- Node.js 20+
- npm 10+
- Figma desktop or browser
- A model provider with an OpenAI-compatible multimodal chat-completions endpoint (OpenRouter works)
- Optional: a Supabase project for persistent UX memory

## Install

```bash
npm install
```

## Configure the agent

Copy `.env.example` to `.env`.

Configure OpenRouter:

```env
OPENROUTER_API_KEY=...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=your-model
```

Optional persistent memory:

1. In Supabase, open the SQL editor or migration workflow.
2. Apply `supabase/migrations/202610090001_ux_design_memory.sql`.
3. Copy the project URL and service-role key into the server-side `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
UX_MEMORY_PROJECT_KEY=default
UX_MEMORY_VISUAL_REFERENCES=false
```

The service-role key is privileged. Never put it in `apps/plugin`, client code, a public repository, or a browser environment variable. Keep it only on the agent server. RLS is enabled on the memory tables with no browser-facing policies; the server uses the service role to access them.

## Start the agent API

```bash
npm run dev:agent
```

Health check:

```bash
curl http://localhost:8787/health
curl http://localhost:8787/memory/status
```

## Build the plugin

```bash
npm run build:plugin
```

In Figma: Plugins → Development → Import plugin from manifest → select `apps/plugin/manifest.json`.

## Runtime flow

1. Select a frame in Figma.
2. Open Figma Design Agent.
3. Choose a task mode and enter the task.
4. The plugin sends structured context to the local agent API.
5. The API retrieves relevant accepted examples, approved design rules and prior reviewer feedback when Supabase memory is configured.
6. The API returns a bounded ActionPlan.
7. Figma executes it.
8. The plugin re-reads the result and captures a screenshot.
9. The API runs structural and model-backed visual critique.
10. Up to two repair cycles can run automatically.
11. Review the result and submit Accept, Needs changes or Reject. Feedback is stored as a memory example. Accepted examples can guide future work. Rejected/revised examples are retrieved as warnings.
12. Optionally check “Remember as a reusable rule” when feedback expresses a durable preference; only this explicit action creates an approved rule.

## Memory behavior

- Without Supabase configuration, planning and editing continue, but feedback cannot be persisted.
- Supabase stores compact Figma node context and critique JSON. Review screenshots are uploaded to the private `ux-design-references` bucket when upload succeeds.
- `UX_MEMORY_VISUAL_REFERENCES=true` allows up to two accepted screenshot examples to be attached to later model requests. Enable this only with a vision-capable model; sending images increases model cost.
- The first version uses task-type and lexical similarity to retrieve relevant examples. It is retrieval-based learning, not automatic foundation-model training. Embeddings/fine-tuning are not required for this initial learning loop.
- Examples are scoped by `UX_MEMORY_PROJECT_KEY`; use distinct keys per product or client to avoid cross-project memory mixing.

## Current limitations

- The local development server is not bundled for deployment.
- Team-library search/import is not implemented yet.
- Visual critique depends on a multimodal model.
- Large-file context currently uses a conservative all-pages component scan.
- The agent stores accepted and rejected examples but does not automatically fine-tune a model.
- Run-cost logging, async task queues and long-running cloud execution remain follow-up work.
