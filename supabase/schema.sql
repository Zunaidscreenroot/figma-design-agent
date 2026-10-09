-- UX Command Center / Figma Design Agent memory schema.
-- Apply in the Supabase SQL Editor. Never expose SUPABASE_SERVICE_ROLE_KEY in the plugin or browser.
-- RLS is enabled and intentionally has no anon/authenticated policies. Trusted server uses service_role.
create extension if not exists pgcrypto;

create table if not exists public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  project_key text not null,
  file_key text,
  file_name text,
  prompt text not null,
  status text not null default 'running' check (status in ('running', 'ready_for_review', 'accepted', 'needs_changes', 'failed')),
  input_summary jsonb not null default '{}'::jsonb,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  reviewed_at timestamptz
);

create table if not exists public.agent_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.agent_tasks(id) on delete set null,
  project_key text not null,
  prompt text not null,
  verdict text not null check (verdict in ('accepted', 'needs_changes')),
  note text not null default '',
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_design_examples (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.agent_tasks(id) on delete set null,
  project_key text not null,
  prompt text not null,
  verdict text not null check (verdict in ('accepted', 'needs_changes')),
  review_note text not null default '',
  summary text not null default '',
  context_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_tasks_project_created_idx on public.agent_tasks (project_key, created_at desc);
create index if not exists agent_reviews_project_created_idx on public.agent_reviews (project_key, created_at desc);
create index if not exists agent_design_examples_project_created_idx on public.agent_design_examples (project_key, created_at desc);
create index if not exists agent_design_examples_verdict_idx on public.agent_design_examples (project_key, verdict, created_at desc);

alter table public.agent_tasks enable row level security;
alter table public.agent_reviews enable row level security;
alter table public.agent_design_examples enable row level security;

comment on table public.agent_tasks is 'Persistent task lifecycle for UX design automation.';
comment on table public.agent_reviews is 'Human review decisions and corrections used to improve future runs.';
comment on table public.agent_design_examples is 'Project-scoped reviewed examples retrieved during future planning.';
