export type NodeRef = string;
export type ActionBase = { id: string; description?: string; dependsOn?: string[] };
export type DesignAction =
  | (ActionBase & { action: "create_frame"; parentId?: NodeRef; name: string; width: number; height: number; x?: number; y?: number; fill?: string; cornerRadius?: number })
  | (ActionBase & { action: "create_rectangle"; parentId?: NodeRef; name: string; width: number; height: number; x?: number; y?: number; fill?: string; cornerRadius?: number })
  | (ActionBase & { action: "create_section"; parentId?: NodeRef; name: string; width: number; height: number; x?: number; y?: number })
  | (ActionBase & { action: "create_text"; parentId: NodeRef; name: string; text: string; x?: number; y?: number; fontSize?: number; fontFamily?: string; fontStyle?: string; color?: string; textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" })
  | (ActionBase & { action: "create_instance"; parentId: NodeRef; componentId: string; name?: string; variantProperties?: Record<string, string> })
  | (ActionBase & { action: "set_text"; targetId: NodeRef; text: string })
  | (ActionBase & { action: "set_component_property"; targetId: NodeRef; propertyName: string; value: string | boolean })
  | (ActionBase & { action: "set_property"; targetId: NodeRef; property: "name" | "visible" | "opacity" | "x" | "y" | "width" | "height" | "cornerRadius"; value: string | number | boolean })
  | (ActionBase & { action: "set_layout"; targetId: NodeRef; mode: "NONE" | "HORIZONTAL" | "VERTICAL"; gap?: number; padding?: { top: number; right: number; bottom: number; left: number }; primaryAxisSizingMode?: "FIXED" | "AUTO"; counterAxisSizingMode?: "FIXED" | "AUTO" })
  | (ActionBase & { action: "set_fill"; targetId: NodeRef; color: string; opacity?: number })
  | (ActionBase & { action: "set_stroke"; targetId: NodeRef; color: string; weight: number; opacity?: number })
  | (ActionBase & { action: "set_text_style"; targetId: NodeRef; fontSize?: number; fontFamily?: string; fontStyle?: string; color?: string; textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" })
  | (ActionBase & { action: "set_corner_radius"; targetId: NodeRef; radius: number })
  | (ActionBase & { action: "bind_variable"; targetId: NodeRef; property: string; variableId: string })
  | (ActionBase & { action: "move"; targetId: NodeRef; x: number; y: number })
  | (ActionBase & { action: "resize"; targetId: NodeRef; width: number; height: number })
  | (ActionBase & { action: "replace_instance"; targetId: NodeRef; componentId: string })
  | (ActionBase & { action: "delete"; targetId: NodeRef });
export interface ActionPlan { version: "1"; goal: string; strategy: string; actions: DesignAction[]; decisions: { decision: string; confidence: number; evidence: string[] }[]; assumptions: string[]; stopConditions: string[]; }
export interface ActionExecutionResult { actionId: string; success: boolean; nodeIds?: string[]; warnings?: string[]; error?: string; }
export interface ExecutionReport { success: boolean; results: ActionExecutionResult[]; }
