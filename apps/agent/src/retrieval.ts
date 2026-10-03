import type{AgentContext,ComponentRef,DesignNode}from"@figma-design-agent/core";

const tokenize=(v:string)=>v.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const overlap=(a:string,b:string)=>{
  const aa=new Set(tokenize(a)),bb=new Set(tokenize(b));
  if(!aa.size||!bb.size)return 0;
  let n=0;for(const t of aa)if(bb.has(t))n++;
  return n/new Set([...aa,...bb]).size;
};
const walk=(n:DesignNode,out:DesignNode[]=[]):DesignNode[]=>{out.push(n);for(const c of n.children)walk(c,out);return out};

export interface ComponentCandidate{component:ComponentRef;score:number;reasons:string[]}

export const rankComponents=(query:string,context:AgentContext,limit=8):ComponentCandidate[]=>{
  const selectedNodes=context.selectedNode?walk(context.selectedNode):[];
  const usageById=new Map<string,number>();
  for(const node of selectedNodes)if(node.component)usageById.set(node.component.id,(usageById.get(node.component.id)??0)+1);

  return context.project.components.map(component=>{
    const semantic=overlap(query,component.name);
    const usage=Math.min((usageById.get(component.id)??0)/4,1);
    const globalUsage=Math.min((component.usageCount??0)/20,1);
    const variantBoost=component.variantProperties?0.06:0;
    const score=Math.min(semantic*.62+usage*.20+globalUsage*.10+variantBoost,1);
    const reasons:string[]=[];
    if(semantic>0)reasons.push("semantic name match");
    if(usage>0)reasons.push("used in current selection");
    if(globalUsage>0)reasons.push("known project usage");
    if(variantBoost)reasons.push("variant metadata available");
    return{component,score,reasons};
  }).sort((a,b)=>b.score-a.score).slice(0,limit);
};
