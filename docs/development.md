# Development

## Prerequisites

- Node.js 20+
- npm 10+
- Figma desktop or browser
- A model provider with an OpenAI-compatible chat-completions endpoint (OpenRouter works)

## Install

```bash
npm install
```

## Configure the agent

Copy `.env.example` to `.env` and set:

```
LLM_API_KEY=...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=your-model
```

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
3. Enter a task.
4. The plugin sends structured context to the local agent API.
5. The API returns a bounded ActionPlan.
6. Figma executes it.
7. The plugin re-reads the result and captures a screenshot.
8. The API critiques the result.
9. Up to two repair cycles can run automatically.

## Current limitations

- The local development server is not bundled for deployment.
- Team-library search/import is not implemented yet.
- Visual critique depends on a multimodal model.
- Large-file context currently uses a conservative all-pages component scan.
