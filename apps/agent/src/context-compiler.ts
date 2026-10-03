import {compileAgentContext,validateContext,type AgentContext,type RawFigmaContext} from"@figma-design-agent/core";

export interface CompiledContext{
  context:AgentContext;
  warnings:string[];
  compact:string;
}

export const compileContext=(raw:RawFigmaContext):CompiledContext=>{
  const context=compileAgentContext(raw);
  const issues=validateContext(context);
  const compact=JSON.stringify({
    selection:context.selectedNode,
    components:context.project.components,
    tokens:context.project.tokens,
    pages:context.project.pages,
    viewport:context.viewport
  });
  return{
    context,
    warnings:issues.filter(i=>i.severity!=="error").map(i=>i.message),
    compact
  };
};
