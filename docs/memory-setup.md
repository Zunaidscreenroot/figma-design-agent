# Project memory setup

The agent can run without memory. When Supabase is configured, it stores tasks, review decisions and compact screen snapshots and retrieves related reviewed examples during planning.

## Create the database tables
1. Create or open your Supabase project.
2. Open SQL Editor.
3. Run the contents of the file supabase/schema.sql.
4. In Supabase project settings, copy the project URL and service-role key.

## Configure the agent server
Set these environment variables in the local .env file or server environment:
- SUPABASE_URL: your Supabase project URL.
- SUPABASE_SERVICE_ROLE_KEY: service-role key. This is server-only and must never appear in Figma plugin code.
- OPENROUTER_API_KEY: your OpenRouter API key.
- AGENT_API_TOKEN: a long random bearer token for a deployed server. Local development may leave it blank.
- AGENT_ALLOWED_ORIGIN: configure an appropriate origin for deployment.

The Supabase integration uses the server-side REST API and does not require another npm dependency.

## Start and test
Run the agent API using the existing development command. Open the Figma plugin and enter the endpoint. When AGENT_API_TOKEN is configured, enter the same token in the plugin UI.

After a task completes, use the review controls:
- Accept result: stores a project-scoped accepted example.
- Needs changes: requires a short note; stores the corrected/rejected pattern and the reason.

Future plans retrieve relevant reviewed examples from the same Figma file and include them as scoped evidence. This is persistent memory, not model fine-tuning. A single review is not automatically promoted to a global design rule.

## Security
- Never commit secrets to Git.
- The service-role key bypasses Row Level Security and belongs only on the trusted server.
- RLS is enabled on memory tables. The schema creates no public/anon policies.
- Do not route confidential company designs to a model/provider unless company policy and provider data policy allow it.
- First version retrieves recent project examples and ranks them with lexical overlap. Embeddings/vector search can be added later if it demonstrates better retrieval accuracy.
