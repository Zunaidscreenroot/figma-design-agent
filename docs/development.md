# Development

## Prerequisites

- Node.js 20+
- npm 10+
- Figma desktop or browser
- An OpenAI-compatible multimodal model endpoint (OpenRouter works)

## Install

```bash
npm install
```

## Configure the agent

Copy `.env.example` to `.env`.

Configure OpenRouter and keep the local agent on loopback with an explicit browser-origin allowlist:

```env
OPENROUTER_API_KEY=...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=your-model
AGENT_HOST=127.0.0.1
AGENT_ALLOWED_ORIGINS=https://www.figma.com,https://figma.com,http://localhost:8787,http://127.0.0.1:8787
```

The development API binds to loopback by default and rejects browser origins outside this allowlist. If your Figma runtime reports a different origin, add that exact origin to `AGENT_ALLOWED_ORIGINS`. This local API is not ready for public internet deployment; a hosted deployment needs proper authentication, request authorization and rate limiting.

## Start the agent API

```bash
npm run dev:agent
```

Health check:

```bash
curl http://localhost:8787/health
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
5. The API returns a bounded ActionPlan using the selected model and applicable design skills.
6. Figma executes the actions.
7. The plugin re-reads the result and captures a screenshot.
8. The API runs structural and model-backed visual critique.
9. Up to two repair cycles can run automatically.
10. Review the result directly in Figma.

## Current limitations

- Design context, review history and user preferences are not persisted between runs.
- The local development server is not bundled for deployment.
- Team-library search/import is not implemented yet.
- Visual critique depends on a multimodal model.
- Large-file context uses a conservative all-pages component scan.
- Run-cost logging, task queues and long-running cloud execution remain follow-up work.
