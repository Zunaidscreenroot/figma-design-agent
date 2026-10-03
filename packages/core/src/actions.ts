export type ActionBase = {
  id: string;
  description?: string;
  dependsOn?: string[];
};

export type DesignAction =
  | (ActionBase & {
      action: "create_frame";
      parentId?: string;
      name: string;
      width: number;
      height: number;
      x?: number;
      y?: number;
    })
  | (ActionBase & {
      action: "create_section";
      parentId?: string;
      name: string;
      width: number;
      height: number;
      x?: number;
      y?: number;
    })
  | (ActionBase & {
      action: "create_text";
      parentId: string;
      name: string;
      text: string;
      x?: number;
      y?: number;
      fontSize?: number;
      fontFamily?: string;
      fontStyle?: string;
    })
  | (ActionBase & {
      action: "create_instance";
      parentId: string;
      componentId: string;
      name?: string;
      variantProperties?: Record<string, string>;
    })
  | (ActionBase & {
      action: "set_text";
      targetId: string;
      text: string;
    })
  | (ActionBase & {
      action: "set_component_property";
      targetId: string;
      propertyName: string;
      value: string | boolean;
    })
  | (ActionBase & {
      action: "set_property";
      targetId: string;
      property:
        | "name"
        | "visible"
        | "opacity"
        | "x"
        | "y"
        | "width"
        | "height"
        | "cornerRadius";
      value: string | number | boolean;
    })
  | (ActionBase & {
      action: "set_layout";
      targetId: string;
      mode: "NONE" | "HORIZONTAL" | "VERTICAL";
      gap?: number;
      padding?: { top: number; right: number; bottom: number; left: number };
      primaryAxisSizingMode?: "FIXED" | "AUTO";
      counterAxisSizingMode?: "FIXED" | "AUTO";
    })
  | (ActionBase & {
      action: "bind_variable";
      targetId: string;
      property: string;
      variableId: string;
    })
  | (ActionBase & {
      action: "move";
      targetId: string;
      x: number;
      y: number;
    })
  | (ActionBase & {
      action: "resize";
      targetId: string;
      width: number;
      height: number;
    })
  | (ActionBase & {
      action: "replace_instance";
      targetId: string;
      componentId: string;
    })
  | (ActionBase & {
      action: "delete";
      targetId: string;
    });

export interface ActionPlan {
  version: "1";
  goal: string;
  strategy: string;
  actions: DesignAction[];
  decisions: {
    decision: string;
    confidence: number;
    evidence: string[];
  }[];
  assumptions: string[];
  stopConditions: string[];
}

export interface ActionExecutionResult {
  actionId: string;
  success: boolean;
  nodeIds?: string[];
  warnings?: string[];
  error?: string;
}

export interface ExecutionReport {
  success: boolean;
  results: ActionExecutionResult[];
}
