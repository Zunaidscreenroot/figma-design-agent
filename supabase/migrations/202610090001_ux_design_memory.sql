-- UX Command Center memory: accepted screens, reviewer feedback, and approved reusable rules.
-- All tables are server-only. RLS is enabled with no client-facing policies; the agent backend
-- uses the Supabase service-role key and must never expose it to the plugin/browser.

create table if not exists public.ux_design_examples (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'default',
  task_type text not null default 'polished_screen',
  goal text not null,
  summary text not null default '',
  context_summary text not null default '',
  context_json jsonb not null default '{}'::jsonb,
  critique_json jsonb not null default '{}'::jsonb,
  screenshot_path text,
  review_status text not null check (review_status in ('accepted', 'needs_changes', 'rejected')),
  quality_score numeric(5,2) check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  feedback_text text,
  created_at timestamptz not null default now()
);

create index if not exists ux_design_examples_project_status_idx
  on public.ux_design_examples (project_key, review_status, task_type, created_at desc);
create index if not exists ux_design_examples_created_idx
  on public.ux_design_examples (created_at desc);

create table if not exists public.ux_design_feedback (
  id uuid primary key default gen_random_uuid(),
  example_id uuid not null references public.ux_design_examples(id) on delete cascade,
  project_key text not null default 'default',
  feedback_type text not null check (feedback_type in ('accepted', 'needs_changes', 'rejected')),
  feedback_text text,
  created_at timestamptz not null default now()
);

create index if not exists ux_design_feedback_project_idx
  on public.ux_design_feedback (project_key, created_at desc);

create table if not exists public.ux_design_rules (
  id uuid primary key default gen_random_uuid(),
  project_key text not null default 'default',
  task_type text not null default 'polished_screen',
  title text not null,
  rule_text text not null,
  status text not null default 'approved' check (status in ('candidate', 'approved', 'rejected')),
  confidence numeric(4,3) not null default 0.950 check (confidence >= 0 and confidence <= 1),
  source_example_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ux_design_rules_project_status_idx
  on public.ux_design_rules (project_key, status, task_type, confidence desc);

alter table public.ux_design_examples enable row level security;
alter table public.ux_design_feedback enable row level security;
alter table public.ux_design_rules enable row level security;

-- Private bucket for screenshots that the user explicitly submits as approved/rejected examples.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ux-design-references', 'ux-design-references', false, 5242880, array['image/png'])
on conflict (id) do update
set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png'];

comment on table public.ux_design_examples is
  'Reviewed Figma-agent outputs used as project memory; only user-accepted examples are positive references.';
comment on table public.ux_design_feedback is
  'Explicit reviewer feedback attached to a generated example.';
comment on table public.ux_design_rules is
  'User-approved reusable design rules. Generated suggestions must not be promoted automatically.';
