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

1. Open Figma Design Agent and run **Figma-only health check**. This does not call the local agent server or an AI model.
2. The plugin probes selection/context access, component and token reads, temporary frame/text/layout changes, screenshot export, optional component instantiation, and cleanup.
3. Select a target frame. The AI workflow unlocks only after core health checks pass.
4. Choose a task mode and enter the task.
5. The plugin sends structured context to the local agent API.
6. The API returns a bounded ActionPlan using the selected model and applicable design skills.
7. Figma executes the actions.
8. The plugin re-reads the result and captures a screenshot.
9. The API runs structural and model-backed visual critique.
10. Up to two repair cycles can run automatically.
11. Review the result directly in Figma.

## Current limitations

- Design context, review history and user preferences are not persisted between runs.
- The local development server is not bundled for deployment.
- Team-library search/import is not implemented yet.
- Visual critique depends on a multimodal model.
- Large-file context uses a conservative all-pages component scan.
- Run-cost logging, task queues and long-running cloud execution remain follow-up work.
