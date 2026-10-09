import ui from "./ui.html";
import type { DesignAction, ExecutionReport } from "../../../packages/core/src/actions.js";
type RawNode = {
  id: string; name: string; type: string; x?: number; y?: number; width?: number; height?: number; visible?: boolean;
  layoutMode?: string; itemSpacing?: number; paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number;
  characters?: string; fontSize?: number; fontFamily?: string; fontStyle?: string; textAlignHorizontal?: string;
  fills?: string[]; strokes?: string[]; strokeWeight?: number; cornerRadius?: number; opacity?: number; mainComponentId?: string;
  variantProperties?: Record<string, string> | null; componentProperties?: Record<string, { type: string; value: unknown }>; children?: RawNode[];
};
figma.showUI(ui, { width: 440, height: 820, themeColors: true });
const num = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const colorToHex = (color: { r: number; g: number; b: number }) => {
  const toHex = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
  return "#" + toHex(color.r) + toHex(color.g) + toHex(color.b);
};
const paintHexes = (value: unknown): string[] => !Array.isArray(value) ? [] : value.filter((paint: any) => paint?.type === "SOLID" && paint.color).map((paint: any) => colorToHex(paint.color));
const serializeNode = async (node: SceneNode, depth = 0): Promise<RawNode> => {
  const n = node as SceneNode & Record<string, any>;
  const raw: RawNode = { id: node.id, name: node.name, type: node.type, x: num(n.x), y: num(n.y), width: num(n.width), height: num(n.height),
    visible: node.visible, fills: paintHexes(n.fills), strokes: paintHexes(n.strokes), strokeWeight: typeof n.strokeWeight === "number" ? n.strokeWeight : undefined,
    cornerRadius: typeof n.cornerRadius === "number" ? n.cornerRadius : undefined, opacity: typeof n.opacity === "number" ? n.opacity : undefined, children: [] };
  if ("layoutMode" in n) {
    raw.layoutMode = n.layoutMode; raw.itemSpacing = num(n.itemSpacing); raw.paddingTop = num(n.paddingTop);
    raw.paddingRight = num(n.paddingRight); raw.paddingBottom = num(n.paddingBottom); raw.paddingLeft = num(n.paddingLeft);
  }
  if (node.type === "TEXT") {
    raw.characters = node.characters; raw.fontSize = typeof n.fontSize === "number" ? n.fontSize : undefined;
    raw.textAlignHorizontal = typeof n.textAlignHorizontal === "string" ? n.textAlignHorizontal : undefined;
    if (typeof n.fontName === "object" && n.fontName) { raw.fontFamily = n.fontName.family; raw.fontStyle = n.fontName.style; }
  }
  if (node.type === "INSTANCE") {
    const main = await node.getMainComponentAsync(); raw.mainComponentId = main?.id; raw.variantProperties = null; raw.componentProperties = node.componentProperties;
  }
  if (depth < 6 && "children" in n) { raw.children = []; for (const child of n.children as SceneNode[]) raw.children.push(await serializeNode(child, depth + 1)); }
  return raw;
};
const collectComponents = async () => {
  await figma.loadAllPagesAsync();
  const nodes = figma.root.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] } as any);
  return nodes.map((node: any) => ({ id: node.id, key: node.key, name: node.name, type: node.type,
    variantProperties: node.variantGroupProperties ?? undefined, componentPropertyDefinitions: node.componentPropertyDefinitions ?? undefined, usageCount: 0 }));
};
const collectTokens = async () => {
  try {
    const variables = await figma.variables.getLocalVariablesAsync();
    return variables.map((variable: any) => {
      const modes = Object.keys(variable.valuesByMode ?? {});
      return { id: variable.id, name: variable.name, type: variable.resolvedType, value: modes.length ? variable.valuesByMode[modes[0]] : undefined };
    });
  } catch { return []; }
};
const collectContext = async () => {
  await figma.currentPage.loadAsync();
  const selected = figma.currentPage.selection;
  const selectedNodes = [];
  for (const node of selected) selectedNodes.push(await serializeNode(node));
  const [components, tokens] = await Promise.all([collectComponents(), collectTokens()]);
  const childCounts = await Promise.all(figma.root.children.map(async (page) => { await page.loadAsync(); return { id: page.id, name: page.name, childCount: page.children.length }; }));
  return { fileKey: figma.fileKey ?? null, fileName: figma.root.name, selectedNodes, pages: childCounts, components, tokens,
    viewport: selected[0] ? { width: num((selected[0] as any).width), height: num((selected[0] as any).height) } : undefined };
};
const parentOf = async (id?: string): Promise<BaseNode & ChildrenMixin> => {
  if (id) { const node = await figma.getNodeByIdAsync(id); if (node && "appendChild" in node) return node as BaseNode & ChildrenMixin; }
  await figma.currentPage.loadAsync(); return figma.currentPage;
};
const componentById = async (id: string): Promise<ComponentNode | undefined> => {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) return;
  if (node.type === "COMPONENT") return node;
  if (node.type === "COMPONENT_SET") return node.defaultVariant;
};
const targetNode = async (id: string) => figma.getNodeByIdAsync(id);
const parseHex = (input: string) => {
  const clean = input.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((character) => character + character).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) throw new Error("Color must be a valid hex value.");
  return { r: parseInt(normalized.slice(0, 2), 16) / 255, g: parseInt(normalized.slice(2, 4), 16) / 255, b: parseInt(normalized.slice(4, 6), 16) / 255 };
};
const solidPaint = (color: string, opacity = 1): SolidPaint => ({ type: "SOLID", color: parseHex(color), opacity });
const applyFill = (node: any, color: string, opacity = 1) => { if (!("fills" in node)) throw new Error("Target does not support fills."); node.fills = [solidPaint(color, opacity)]; };
const execute = async (action: DesignAction) => {
  try {
    switch (action.action) {
      case "create_frame": {
        const node = figma.createFrame(); node.name = action.name; node.resize(action.width, action.height);
        node.x = action.x ?? node.x; node.y = action.y ?? node.y; if (action.fill) applyFill(node, action.fill);
        if (action.cornerRadius !== undefined) node.cornerRadius = action.cornerRadius;
        (await parentOf(action.parentId)).appendChild(node); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "create_rectangle": {
        const node = figma.createRectangle(); node.name = action.name; node.resize(action.width, action.height);
        node.x = action.x ?? node.x; node.y = action.y ?? node.y; if (action.fill) applyFill(node, action.fill);
        if (action.cornerRadius !== undefined) node.cornerRadius = action.cornerRadius;
        (await parentOf(action.parentId)).appendChild(node); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "create_section": {
        const node = figma.createSection(); node.name = action.name; node.resizeWithoutConstraints(action.width, action.height);
        node.x = action.x ?? node.x; node.y = action.y ?? node.y; (await parentOf(action.parentId)).appendChild(node);
        return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "create_text": {
        const node = figma.createText(); await figma.loadFontAsync({ family: action.fontFamily ?? "Inter", style: action.fontStyle ?? "Regular" });
        node.fontSize = action.fontSize ?? 16; node.characters = action.text; node.name = action.name; node.x = action.x ?? 0; node.y = action.y ?? 0;
        if (action.color) applyFill(node, action.color); if (action.textAlignHorizontal) node.textAlignHorizontal = action.textAlignHorizontal;
        (await parentOf(action.parentId)).appendChild(node); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "create_instance": {
        const component = await componentById(action.componentId); if (!component) throw new Error("Component " + action.componentId + " not found");
        const node = component.createInstance(); node.name = action.name ?? component.name;
        if (action.variantProperties) node.setProperties(action.variantProperties);
        (await parentOf(action.parentId)).appendChild(node); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_text": {
        const node = await targetNode(action.targetId); if (!node || node.type !== "TEXT") throw new Error("Target is not text");
        await figma.loadFontAsync(node.fontName as FontName); node.characters = action.text;
        return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_text_style": {
        const node = await targetNode(action.targetId); if (!node || node.type !== "TEXT") throw new Error("Target is not text");
        const currentFont = node.fontName as FontName | symbol;
        const family = action.fontFamily ?? (typeof currentFont === "object" ? currentFont.family : "Inter");
        const style = action.fontStyle ?? (typeof currentFont === "object" ? currentFont.style : "Regular");
        await figma.loadFontAsync({ family, style });
        if (action.fontSize !== undefined) node.fontSize = action.fontSize;
        node.fontName = { family, style };
        if (action.color) applyFill(node, action.color);
        if (action.textAlignHorizontal) node.textAlignHorizontal = action.textAlignHorizontal;
        return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_fill": {
        const node = await targetNode(action.targetId); if (!node) throw new Error("Target not found");
        applyFill(node as any, action.color, action.opacity ?? 1); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_stroke": {
        const node = await targetNode(action.targetId) as any; if (!node || !("strokes" in node)) throw new Error("Target does not support strokes");
        node.strokes = [solidPaint(action.color, action.opacity ?? 1)]; node.strokeWeight = action.weight;
        return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_corner_radius": {
        const node = await targetNode(action.targetId) as any; if (!node || !("cornerRadius" in node)) throw new Error("Target does not support corner radius");
        node.cornerRadius = action.radius; return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_component_property": {
        const node = await targetNode(action.targetId); if (!node || node.type !== "INSTANCE") throw new Error("Target is not instance");
        node.setProperties({ [action.propertyName]: action.value }); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_property": {
        const node = await targetNode(action.targetId) as any; if (!node) throw new Error("Target not found");
        if (action.property === "width" || action.property === "height") {
          const width = action.property === "width" ? Number(action.value) : node.width;
          const height = action.property === "height" ? Number(action.value) : node.height; node.resize(width, height);
        } else node[action.property] = action.value;
        return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "set_layout": {
        const node = await targetNode(action.targetId) as any; if (!node || !("layoutMode" in node)) throw new Error("Target has no Auto Layout");
        node.layoutMode = action.mode; if (action.gap !== undefined) node.itemSpacing = action.gap;
        if (action.padding) { node.paddingTop = action.padding.top; node.paddingRight = action.padding.right; node.paddingBottom = action.padding.bottom; node.paddingLeft = action.padding.left; }
        if (action.primaryAxisSizingMode) node.primaryAxisSizingMode = action.primaryAxisSizingMode;
        if (action.counterAxisSizingMode) node.counterAxisSizingMode = action.counterAxisSizingMode;
        return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "bind_variable": {
        const node = await targetNode(action.targetId) as any; const variable = await figma.variables.getVariableByIdAsync(action.variableId);
        if (!node || !variable) throw new Error("Target or variable not found");
        if (typeof node.setBoundVariable !== "function") throw new Error("Target does not support variables");
        node.setBoundVariable(action.property as any, variable); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "move": {
        const node = await targetNode(action.targetId) as any; if (!node) throw new Error("Target not found");
        node.x = action.x; node.y = action.y; return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "resize": {
        const node = await targetNode(action.targetId) as any; if (!node || typeof node.resize !== "function") throw new Error("Target cannot resize");
        node.resize(action.width, action.height); return { actionId: action.id, success: true, nodeIds: [node.id] };
      }
      case "replace_instance": {
        const oldNode = await targetNode(action.targetId); if (!oldNode || oldNode.type !== "INSTANCE") throw new Error("Target is not instance");
        const component = await componentById(action.componentId); if (!component) throw new Error("Replacement component not found");
        oldNode.swapComponent(component); return { actionId: action.id, success: true, nodeIds: [oldNode.id] };
      }
      case "delete": {
        const node = await targetNode(action.targetId); if (!node) throw new Error("Target not found");
        node.remove(); return { actionId: action.id, success: true };
      }
    }
  } catch (error) { return { actionId: action.id, success: false, error: error instanceof Error ? error.message : "Unknown error" }; }
};

figma.ui.onmessage = async (message: any) => {
  try {
    if (message.type === "get-context") { figma.ui.postMessage({ type: "context", payload: await collectContext() }); return; }
    if (message.type === "execute-actions") {
      const results = [] as any[]; const outputs = new Map<string, string>();
      const resolveRef = (value: string) => { if (!value.startsWith("$")) return value; const resolved = outputs.get(value.slice(1)); if (!resolved) throw new Error("Unresolved symbolic node reference: " + value); return resolved; };
      for (const action of message.actions as DesignAction[]) {
        try {
          const resolved = { ...action } as any;
          if ("targetId" in resolved) resolved.targetId = resolveRef(resolved.targetId);
          if ("parentId" in resolved && resolved.parentId) resolved.parentId = resolveRef(resolved.parentId);
          const result = await execute(resolved as DesignAction); results.push(result);
          if (result.success && result.nodeIds?.[0]) outputs.set(action.id, result.nodeIds[0]);
        } catch (error) { results.push({ actionId: action.id, success: false, error: error instanceof Error ? error.message : "Unknown symbolic reference error" }); }
      }
      const report: ExecutionReport = { success: results.every((result) => result.success), results };
      if (report.success) figma.commitUndo();
      figma.ui.postMessage({ type: "execution-report", payload: report }); return;
    }
    if (message.type === "select-node") {
      const node = await targetNode(message.nodeId);
      if (node && node.type !== "DOCUMENT" && node.type !== "PAGE") { figma.currentPage.selection = [node as SceneNode]; figma.viewport.scrollAndZoomIntoView([node as SceneNode]); }
      return;
    }
    const exportDataUrl = async (node: SceneNode, maxWidth: number) => {
      const bytes = await node.exportAsync({ format: "PNG", constraint: { type: "WIDTH", value: Math.min(maxWidth, Math.max(720, node.width)) } });
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return "data:image/png;base64," + btoa(binary);
    };
    if (message.type === "capture-references") {
      const selected = figma.currentPage.selection.slice(0, 3);
      const captures = [];
      for (const node of selected) {
        try {
          captures.push({ nodeId: node.id, name: node.name, dataUrl: await exportDataUrl(node, 1200) });
        } catch (error) {
          captures.push({ nodeId: node.id, name: node.name, error: error instanceof Error ? error.message : "Export failed" });
        }
      }
      figma.ui.postMessage({ type: "reference-captures", payload: captures });
      return;
    }
    if (message.type === "capture-selection") {
      const node = figma.currentPage.selection[0];
      if (!node) { figma.ui.postMessage({ type: "capture", payload: null }); return; }
      figma.ui.postMessage({ type: "capture", payload: await exportDataUrl(node, 1600) });
    }
  } catch (error) { figma.ui.postMessage({ type: "plugin-error", payload: error instanceof Error ? error.message : "Unknown plugin error" }); }
};
