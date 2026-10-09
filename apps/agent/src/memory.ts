import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export type UxTaskType =
  | "polished_screen"
  | "variations"
  | "content_states"
  | "ux_audit"
  | "mobile_conversion"
  | "other";

export type ReviewStatus = "accepted" | "needs_changes" | "rejected";

export interface RetrievedExample {
  id: string;
  taskType: string;
  goal: string;
  summary: string;
  contextSummary: string;
  feedbackText?: string | null;
  qualityScore?: number | null;
  screenshotPath?: string | null;
  screenshotUrl?: string;
  reviewStatus: ReviewStatus;
  score: number;
}

export interface RetrievedRule {
  id: string;
  taskType: string;
  title: string;
  ruleText: string;
  confidence: number;
  score: number;
}

export interface RetrievedMemory {
  enabled: boolean;
  examples: RetrievedExample[];
  lessons: RetrievedExample[];
  rules: RetrievedRule[];
  referenceImages: Array<{ url: string; goal: string; taskType: string }>;
  warning?: string;
}

interface ExampleRow {
  id: string;
  task_type: string;
  goal: string;
  summary: string;
  context_summary: string;
  feedback_text?: string | null;
  quality_score?: number | null;
  screenshot_path?: string | null;
  review_status: ReviewStatus;
  created_at: string;
}

interface RuleRow {
  id: string;
  task_type: string;
  title: string;
  rule_text: string;
  confidence: number;
}

const VALID_TASK_TYPES = new Set<UxTaskType>([
  "polished_screen",
  "variations",
  "content_states",
  "ux_audit",
  "mobile_conversion",
  "other",
]);

const enabled = () => Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);

export const resolveTaskType = (explicit: unknown, goal: string): UxTaskType => {
  if (typeof explicit === "string" && VALID_TASK_TYPES.has(explicit as UxTaskType)) {
    return explicit as UxTaskType;
  }
  const value = goal.toLowerCase();
  if (/audit|heuristic|consisten|accessibility|critique|review/.test(value)) return "ux_audit";
  if (/variation|variant|alternate|alternative|options/.test(value)) return "variations";
  if (/content|copy|microcopy|labels|helper text|empty state|error message/.test(value)) return "content_states";
  if (/mobile|responsive|desktop to mobile|small screen/.test(value)) return "mobile_conversion";
  return "polished_screen";
};

const projectKeyOf = (value?: string) => {
  const cleaned = (value ?? config.projectKey ?? "default").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 80);
  return cleaned || "default";
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T; headers: Headers }> => {
  if (!enabled()) throw new Error("Supabase memory is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the agent server.");
  const response = await fetch(config.supabaseUrl + "/rest/v1/" + path, {
    ...init,
    headers: {
      apikey: config.supabaseServiceRoleKey,
      Authorization: "Bearer " + config.supabaseServiceRoleKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error("Supabase request failed (" + response.status + "): " + raw.slice(0, 360));
  }
  const parsed = raw ? JSON.parse(raw) as T : ([] as unknown as T);
  return { data: parsed, headers: response.headers };
};

const queryRows = async <T>(
  table: string,
  params: Record<string, string>,
): Promise<T[]> => {
  const query = new URLSearchParams(params);
  const result = await request<T[]>(table + "?" + query.toString());
  return result.data;
};

const terms = (value: string) =>
  value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];

const overlap = (query: string, candidate: string) => {
  const wanted = new Set(terms(query));
  if (!wanted.size) return 0;
  const found = new Set(terms(candidate));
  let matches = 0;
  for (const word of wanted) if (found.has(word)) matches += 1;
  return matches / wanted.size;
};

const walkNode = (node: any, output: string[], depth = 0) => {
  if (!node || output.length >= 90 || depth > 5) return;
  const text = typeof node.text === "string" ? node.text : "";
  const label = [node.name, node.role, text.slice(0, 120)].filter(Boolean).join(" / ");
  if (label) output.push(label);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    walkNode(child, output, depth + 1);
    if (output.length >= 90) break;
  }
};

const summarizeContext = (context: any): string => {
  const root = context?.selectedNode ?? context?.project?.screens?.[0]?.root;
  const elements: string[] = [];
  walkNode(root, elements);
  const width = root?.bounds?.width ?? context?.viewport?.width;
  const height = root?.bounds?.height ?? context?.viewport?.height;
  const components = (context?.project?.components ?? [])
    .slice(0, 35)
    .map((item: any) => item.name)
    .filter(Boolean);
  const tokens = (context?.project?.tokens ?? [])
    .slice(0, 35)
    .map((item: any) => item.name)
    .filter(Boolean);
  return [
    root?.name ? "Screen: " + root.name : "",
    width && height ? "Viewport: " + width + "×" + height : "",
    elements.length ? "Visible structure: " + elements.join("; ") : "",
    components.length ? "Available components: " + components.join(", ") : "",
    tokens.length ? "Available tokens: " + tokens.join(", ") : "",
  ].filter(Boolean).join("\n").slice(0, 12000);
};

const compactNode = (node: any, depth = 0, budget = { count: 0 }): any => {
  if (!node || depth > 5 || budget.count >= 90) return undefined;
  budget.count += 1;
  const output: Record<string, unknown> = {
    id: node.id,
    name: node.name,
    type: node.type,
    role: node.role,
    bounds: node.bounds,
    layout: node.layout,
    text: typeof node.text === "string" ? node.text.slice(0, 240) : undefined,
    visible: node.visible,
    component: node.component
      ? { id: node.component.id, name: node.component.name, type: node.component.type }
      : undefined,
  };
  const children = (Array.isArray(node.children) ? node.children : [])
    .map((child: any) => compactNode(child, depth + 1, budget))
    .filter(Boolean);
  if (children.length) output.children = children;
  return output;
};

const compactContext = (context: any) => ({
  project: {
    pages: (context?.project?.pages ?? []).slice(0, 40),
    components: (context?.project?.components ?? []).slice(0, 120),
    tokens: (context?.project?.tokens ?? []).slice(0, 120),
  },
  selectionIds: (context?.selectionIds ?? []).slice(0, 20),
  selectedNode: compactNode(context?.selectedNode),
  viewport: context?.viewport,
  timestamp: context?.timestamp,
});

const uploadScreenshot = async (projectKey: string, dataUrl?: string): Promise<string | undefined> => {
  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) return undefined;
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) return undefined;

  const path = projectKey + "/" + randomUUID() + ".png";
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    config.supabaseUrl + "/storage/v1/object/ux-design-references/" + encodedPath,
    {
      method: "POST",
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: "Bearer " + config.supabaseServiceRoleKey,
        "Content-Type": "image/png",
        "x-upsert": "false",
      },
      body: bytes,
    },
  );
  if (!response.ok) {
    const message = await response.text();
    throw new Error("Could not store review screenshot (" + response.status + "): " + message.slice(0, 240));
  }
  return path;
};

const signScreenshot = async (path: string): Promise<string | undefined> => {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    config.supabaseUrl + "/storage/v1/object/sign/ux-design-references/" + encodedPath,
    {
      method: "POST",
      headers: {
        apikey: config.supabaseServiceRoleKey,
        Authorization: "Bearer " + config.supabaseServiceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 1800 }),
    },
  );
  if (!response.ok) return undefined;
  const payload = await response.json() as { signedURL?: string };
  if (!payload.signedURL) return undefined;
  if (/^https?:\/\//.test(payload.signedURL)) return payload.signedURL;
  return config.supabaseUrl + "/storage/v1" + (payload.signedURL.startsWith("/") ? payload.signedURL : "/" + payload.signedURL);
};

export const isMemoryConfigured = enabled;

export const getMemoryStatus = () => ({
  configured: enabled(),
  projectKey: projectKeyOf(),
  visualReferencesEnabled: config.memoryVisualReferences,
});

export const saveDesignReview = async (input: {
  goal: string;
  taskType: UxTaskType;
  reviewStatus: ReviewStatus;
  feedbackText?: string;
  makeRule?: boolean;
  projectKey?: string;
  context: unknown;
  critique?: unknown;
  screenshotDataUrl?: string;
}): Promise<{ exampleId: string; screenshotSaved: boolean; ruleSaved: boolean }> => {
  const projectKey = projectKeyOf(input.projectKey);
  const context: any = input.context;
  let screenshotPath: string | undefined;
  try {
    screenshotPath = await uploadScreenshot(projectKey, input.screenshotDataUrl);
  } catch (error) {
    console.warn("[ux-memory] Screenshot storage failed:", error instanceof Error ? error.message : String(error));
  }

  const qualityScore = Number((input.critique as any)?.score);
  const summary = [
    "Task type: " + input.taskType,
    context?.selectedNode?.name ? "Selected output: " + context.selectedNode.name : "",
    context?.selectedNode?.bounds
      ? "Dimensions: " + context.selectedNode.bounds.width + "×" + context.selectedNode.bounds.height
      : "",
    input.reviewStatus === "accepted" ? "Reviewer accepted this output." : "",
  ].filter(Boolean).join(" ");

  const example = {
    project_key: projectKey,
    task_type: input.taskType,
    goal: input.goal.slice(0, 12000),
    summary,
    context_summary: summarizeContext(context),
    context_json: compactContext(context),
    critique_json: input.critique ?? {},
    screenshot_path: screenshotPath ?? null,
    review_status: input.reviewStatus,
    quality_score: Number.isFinite(qualityScore) ? Math.max(0, Math.min(100, qualityScore)) : null,
    feedback_text: input.feedbackText?.slice(0, 12000) || null,
  };

  const inserted = await request<Array<{ id: string }>>("ux_design_examples", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(example),
  });
  const exampleId = inserted.data[0]?.id;
  if (!exampleId) throw new Error("Supabase did not return the saved design example ID.");

  await request("ux_design_feedback", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      example_id: exampleId,
      project_key: projectKey,
      feedback_type: input.reviewStatus,
      feedback_text: input.feedbackText?.slice(0, 12000) || null,
    }),
  });

  let ruleSaved = false;
  if (input.makeRule && input.feedbackText?.trim()) {
    await request("ux_design_rules", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        project_key: projectKey,
        task_type: input.taskType,
        title: "Reviewer rule from " + input.taskType.replace(/_/g, " "),
        rule_text: input.feedbackText.trim().slice(0, 4000),
        status: "approved",
        confidence: 0.95,
        source_example_ids: [exampleId],
      }),
    });
    ruleSaved = true;
  }

  return { exampleId, screenshotSaved: Boolean(screenshotPath), ruleSaved };
};

export const retrieveDesignMemory = async (
  goal: string,
  taskType: UxTaskType,
  projectKeyInput?: string,
): Promise<RetrievedMemory> => {
  if (!enabled()) {
    return { enabled: false, examples: [], lessons: [], rules: [], referenceImages: [] };
  }

  const projectKey = projectKeyOf(projectKeyInput);
  try {
    const [rows, rules] = await Promise.all([
      queryRows<ExampleRow>("ux_design_examples", {
        select: "id,task_type,goal,summary,context_summary,feedback_text,quality_score,screenshot_path,review_status,created_at",
        project_key: "eq." + projectKey,
        review_status: "in.(accepted,needs_changes,rejected)",
        order: "created_at.desc",
        limit: "120",
      }),
      queryRows<RuleRow>("ux_design_rules", {
        select: "id,task_type,title,rule_text,confidence",
        project_key: "eq." + projectKey,
        status: "eq.approved",
        order: "confidence.desc,created_at.desc",
        limit: "100",
      }),
    ]);

    const rankExample = (row: ExampleRow) => {
      const taskMatch = row.task_type === taskType ? 1 : 0;
      const lexical = overlap(goal, [row.goal, row.summary, row.context_summary, row.feedback_text ?? ""].join(" "));
      const acceptedBonus = row.review_status === "accepted" ? 0.08 : 0;
      return lexical * 0.72 + taskMatch * 0.28 + acceptedBonus;
    };
    const mapped = rows.map((row) => ({
      id: row.id,
      taskType: row.task_type,
      goal: row.goal,
      summary: row.summary,
      contextSummary: row.context_summary,
      feedbackText: row.feedback_text,
      qualityScore: row.quality_score,
      screenshotPath: row.screenshot_path,
      reviewStatus: row.review_status,
      score: rankExample(row),
    })).filter((row) => row.score >= 0.18).sort((a, b) => b.score - a.score);

    const examples = mapped
      .filter((row) => row.reviewStatus === "accepted")
      .slice(0, 3);
    const lessons = mapped
      .filter((row) => row.reviewStatus !== "accepted" && Boolean(row.feedbackText))
      .slice(0, 3);

    const rankedRules = rules
      .map((row) => ({
        id: row.id,
        taskType: row.task_type,
        title: row.title,
        ruleText: row.rule_text,
        confidence: row.confidence,
        score: (row.task_type === taskType ? 0.35 : 0) + overlap(goal, row.title + " " + row.rule_text) * 0.65,
      }))
      .filter((row) => row.taskType === taskType || row.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const referenceImages: RetrievedMemory["referenceImages"] = [];
    if (config.memoryVisualReferences) {
      for (const example of examples) {
        if (!example.screenshotPath) continue;
        const url = await signScreenshot(example.screenshotPath);
        if (url) referenceImages.push({ url, goal: example.goal, taskType: example.taskType });
        if (referenceImages.length >= 2) break;
      }
    }

    return {
      enabled: true,
      examples,
      lessons,
      rules: rankedRules,
      referenceImages,
    };
  } catch (error) {
    console.warn("[ux-memory] Retrieval failed; proceeding without memory:", error instanceof Error ? error.message : String(error));
    return {
      enabled: true,
      examples: [],
      lessons: [],
      rules: [],
      referenceImages: [],
      warning: "Persistent memory is configured but unavailable for this request.",
    };
  }
};

export const formatMemoryForPrompt = (memory: RetrievedMemory): string => {
  if (!memory.enabled) return "";
  const sections: string[] = [
    "PERSISTENT UX MEMORY",
    "Treat remembered material as project-specific evidence, not a universal template. Adapt patterns to the current task and do not copy an example blindly.",
  ];

  if (memory.rules.length) {
    sections.push(
      "USER-APPROVED REUSABLE RULES:\n" +
      memory.rules.map((rule) => "- [" + rule.taskType + "] " + rule.title + ": " + rule.ruleText).join("\n"),
    );
  }
  if (memory.examples.length) {
    sections.push(
      "PREVIOUSLY ACCEPTED SCREEN EXAMPLES:\n" +
      memory.examples.map((example) =>
        "- Task: " + example.goal + "\n  Summary: " + example.summary +
        (example.qualityScore != null ? "\n  Previous critique score: " + example.qualityScore : "") +
        "\n  Context:\n  " + example.contextSummary.slice(0, 1800).replace(/\n/g, "\n  "),
      ).join("\n"),
    );
  }
  if (memory.lessons.length) {
    sections.push(
      "PREVIOUS REVIEW FEEDBACK — DO NOT REPEAT THESE PROBLEMS:\n" +
      memory.lessons.map((example) =>
        "- Task: " + example.goal + "\n  Review: " + example.reviewStatus +
        "\n  Feedback: " + (example.feedbackText ?? "No written feedback.") +
        "\n  Context: " + example.summary,
      ).join("\n"),
    );
  }
  if (memory.referenceImages.length) {
    sections.push(
      "Approved example screenshots are attached after the task prompt in this order: " +
      memory.referenceImages.map((image, index) => (index + 1) + ". " + image.goal).join("; ") +
      ". Use them as visual evidence of the user's preferred craft; adapt the structure to the current task.",
    );
  }
  if (memory.warning) sections.push(memory.warning);
  return sections.join("\n\n");
};
