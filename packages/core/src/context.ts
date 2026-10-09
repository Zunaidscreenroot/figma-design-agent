import type { AgentContext, ComponentRef, DesignNode, NodeRole, ProjectContext } from "./design-ast.js";
export interface RawFigmaNode {
  id: string; name: string; type: string; x?: number; y?: number; width?: number; height?: number; visible?: boolean;
  layoutMode?: string; itemSpacing?: number; paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  characters?: string; fontSize?: number; fontFamily?: string; fontStyle?: string; textAlignHorizontal?: string;
  fills?: string[]; strokes?: string[]; strokeWeight?: number; cornerRadius?: number; opacity?: number;
  mainComponentId?: string; variantProperties?: Record<string, string> | null; children?: RawFigmaNode[];
}
export interface RawFigmaContext {
  fileKey?: string | null; fileName?: string; selectedNodes: RawFigmaNode[];
  pages: { id: string; name: string; childCount?: number }[]; components: ComponentRef[];
  tokens: ProjectContext["tokens"]; viewport?: { width: number; height: number };
}
const normalizeRole = (name: string, type: string): NodeRole => {
  const value = name.toLowerCase();
  if (value.includes("header")) return "header";
  if (value.includes("nav")) return "navigation";
  if (value.includes("hero")) return "hero";
  if (value.includes("footer")) return "footer";
  if (value.includes("card")) return "card";
  if (value.includes("button") || value.includes("cta")) return "button";
  if (value.includes("form")) return "form";
  if (type === "TEXT") return "text";
  if (type === "IMAGE") return "image";
  if (type === "FRAME" || type === "SECTION") return "section";
  return "unknown";
};
export const normalizeNode = (node: RawFigmaNode): DesignNode => ({
  id: node.id, name: node.name, type: node.type, role: normalizeRole(node.name, node.type),
  bounds: node.width !== undefined && node.height !== undefined ? { x: node.x ?? 0, y: node.y ?? 0, width: node.width, height: node.height } : undefined,
  layout: node.layoutMode ? {
    mode: node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL" ? node.layoutMode : "NONE",
    gap: node.itemSpacing, padding: { top: node.paddingTop ?? 0, right: node.paddingRight ?? 0, bottom: node.paddingBottom ?? 0, left: node.paddingLeft ?? 0 },
  } : undefined,
  style: { fontSize: node.fontSize, fontFamily: node.fontFamily, fontStyle: node.fontStyle, textAlignHorizontal: node.textAlignHorizontal,
    fills: node.fills, strokes: node.strokes, strokeWeight: node.strokeWeight, cornerRadius: node.cornerRadius, opacity: node.opacity },
  text: node.characters,
  component: node.mainComponentId ? { id: node.mainComponentId, name: node.name, type: "INSTANCE", variantProperties: node.variantProperties ?? undefined } : undefined,
  visible: node.visible, children: (node.children ?? []).map(normalizeNode),
});
export const compileAgentContext = (raw: RawFigmaContext): AgentContext => {
  const screens = raw.selectedNodes.map((node) => {
    const root = normalizeNode(node);
    return { id: root.id, name: root.name, width: root.bounds?.width ?? raw.viewport?.width ?? 0, height: root.bounds?.height ?? raw.viewport?.height ?? 0, root };
  });
  return { project: { fileKey: raw.fileKey ?? undefined, fileName: raw.fileName, pages: raw.pages, components: raw.components, tokens: raw.tokens, screens },
    selectionIds: raw.selectedNodes.map((node) => node.id), selectedNode: screens[0]?.root, viewport: raw.viewport, timestamp: new Date().toISOString() };
};
