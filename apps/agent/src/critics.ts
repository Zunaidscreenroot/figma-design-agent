import type{AgentContext,CritiqueResult,DesignNode,ValidationIssue}from"@figma-design-agent/core";

const walk=(node:DesignNode,out:DesignNode[]=[]):DesignNode[]=>{out.push(node);for(const child of node.children)walk(child,out);return out};

export const structuralCritique=(context:AgentContext):CritiqueResult=>{
  const issues:ValidationIssue[]=[];
  const root=context.selectedNode;
  if(!root)return{passed:false,score:0,issues:[{severity:"error",code:"NO_TARGET",message:"No target frame is available for verification.",suggestedFix:"Select a frame or screen."}],decisions:[]};

  const nodes=walk(root);
  const duplicateIds=new Set<string>();
  const seen=new Set<string>();
  for(const node of nodes){if(seen.has(node.id))duplicateIds.add(node.id);seen.add(node.id)}
  if(duplicateIds.size)issues.push({severity:"error",code:"DUPLICATE_NODE_IDS",message:"Context contains duplicate node IDs."});

  const textNodes=nodes.filter(n=>n.type==="TEXT");
  for(const node of textNodes){
    if((node.text??"").trim()==="")issues.push({severity:"warning",code:"EMPTY_TEXT",message:"Text node has no visible content.",nodeId:node.id,suggestedFix:"Provide content or remove the node."});
  }

  const hardcodedLayout=nodes.filter(n=>n.layout?.mode==="NONE"&&n.children.length>4);
  for(const node of hardcodedLayout)issues.push({severity:"warning",code:"LAYOUT_REVIEW",message:"A container with many children is not using auto layout; review whether this should be an intentional exception.",nodeId:node.id});

  const width=root.bounds?.width??0;
  if(width>0&&width<480&&root.layout?.padding){
    const p=root.layout.padding;
    if(p.left>32||p.right>32)issues.push({severity:"warning",code:"MOBILE_PADDING",message:"Horizontal padding is large for a narrow mobile frame.",nodeId:root.id,suggestedFix:"Check project mobile spacing rules."});
  }

  const errorCount=issues.filter(i=>i.severity==="error").length;
  const warningCount=issues.filter(i=>i.severity==="warning").length;
  const score=Math.max(0,100-(errorCount*35)-(warningCount*8));
  return{passed:errorCount===0,score,issues,decisions:[]};
};
