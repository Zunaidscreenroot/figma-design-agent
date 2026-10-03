export type NodeRole =
  | "screen"
  | "section"
  | "header"
  | "navigation"
  | "hero"
  | "content"
  | "card"
  | "form"
  | "field"
  | "button"
  | "modal"
  | "footer"
  | "image"
  | "text"
  | "unknown";

export interface DesignTokenRef {
  id: string;
  name: string;
  type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN" | "TYPOGRAPHY" | "OTHER";
  value?: unknown;
  source?: string;
}

export interface ComponentRef {
  id: string;
  key?: string;
  name: string;
  type: "COMPONENT" | "COMPONENT_SET" | "INSTANCE";
  variantProperties?: Record<string, string>;
  usageCount?: number;
  sourcePage?: string;
}

export interface DesignNode {
  id: string;
  name: string;
  type: string;
  role: NodeRole;
  bounds?: { x: number; y: number; width: number; height: number };
  layout?: {
    mode?: "NONE" | "HORIZONTAL" | "VERTICAL";
    gap?: number;
    padding?: { top: number; right: number; bottom: number; left: number };
    sizing?: { horizontal?: string; vertical?: string };
  };
  text?: string;
  component?: ComponentRef;
  visible?: boolean;
  children: DesignNode[];
}

export interface ScreenContext {
  id: string;
  name: string;
  width: number;
  height: number;
  root: DesignNode;
}

export interface ProjectContext {
  pages: { id: string; name: string }[];
  components: ComponentRef[];
  tokens: DesignTokenRef[];
  screens: ScreenContext[];
}

export interface VisualSnapshot {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
  width?: number;
  height?: number;
}

export interface AgentContext {
  project: ProjectContext;
  selectionIds: string[];
  selectedNode?: DesignNode;
  viewport?: { width: number; height: number };
  visualSnapshot?: VisualSnapshot;
  timestamp: string;
}

export interface Evidence {
  reason: string;
  source: string;
  confidence: number;
}

export interface DesignDecision {
  decision: string;
  confidence: number;
  evidence: Evidence[];
}

export interface ValidationIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  nodeId?: string;
  suggestedFix?: string;
}

export interface CritiqueResult {
  passed: boolean;
  score?: number;
  issues: ValidationIssue[];
  decisions: DesignDecision[];
}
