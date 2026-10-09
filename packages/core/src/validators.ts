import type{ActionPlan}from"./actions.js";
import type{AgentContext,DesignNode,ValidationIssue}from"./design-ast.js";

const nodeIds=(node:DesignNode,out=new Set<string>())=>{
  out.add(node.id);for(const child of node.children)nodeIds(child,out);return out;
};

export const validateActionPlan=(plan:ActionPlan,context:AgentContext,maxActions=80):ValidationIssue[]=>{
  const issues:ValidationIssue[]=[];
  if(plan.version!=="1")issues.push({severity:"error",code:"PLAN_VERSION",message:"Unsupported action plan version."});
  if(plan.actions.length===0)issues.push({severity:"warning",code:"EMPTY_PLAN",message:"The plan contains no design actions."});
  if(plan.actions.length>maxActions)issues.push({severity:"error",code:"ACTION_LIMIT",message:`The plan contains ${plan.actions.length} actions; limit is ${maxActions}.`});

  const knownNodes=context.selectedNode?nodeIds(context.selectedNode):new Set<string>();
  const knownComponents=new Set(context.project.components.map(component=>component.id));
  const knownTokens=new Set(context.project.tokens.map(token=>token.id));

  const explicitRemovalIntent=/\b(delete|remove|erase|clear out|discard)\b/i.test(plan.goal);
  for(const action of plan.actions){
    if("targetId"in action&&action.targetId&&!action.targetId.startsWith("$")&&!knownNodes.has(action.targetId)){
      issues.push({severity:"error",code:"UNKNOWN_TARGET",message:`Unknown target node ${action.targetId}.`,nodeId:action.targetId,suggestedFix:"Use an existing node ID from context or a symbolic reference to an earlier action."});
    }
    if("parentId"in action&&action.parentId&&!action.parentId.startsWith("$")&&!knownNodes.has(action.parentId)){
      issues.push({severity:"error",code:"UNKNOWN_PARENT",message:`Unknown parent node ${action.parentId}.`,nodeId:action.parentId});
    }
    if((action.action==="create_instance"||action.action==="replace_instance")&&!knownComponents.has(action.componentId)){
      issues.push({severity:"error",code:"UNKNOWN_COMPONENT",message:`Unknown component ${action.componentId}.`});
    }
    if(action.action==="bind_variable"&&!knownTokens.has(action.variableId)){
      issues.push({severity:"error",code:"UNKNOWN_VARIABLE",message:`Unknown variable ${action.variableId}.`});
    }
    if(action.action==="delete"&&action.targetId===context.selectedNode?.id){
      issues.push({severity:"error",code:"ROOT_DELETE_FORBIDDEN",message:"The selected source frame cannot be deleted by an autonomous plan.",nodeId:action.targetId,suggestedFix:"Create a new draft or remove only explicitly named child elements."});
    } else if(action.action==="delete"&&!explicitRemovalIntent){
      issues.push({severity:"error",code:"DELETE_REQUIRES_INTENT",message:"Deleting a node requires explicit removal intent in the user's request.",nodeId:action.targetId,suggestedFix:"Revise the plan to preserve existing nodes unless removal was requested."});
    }
  }
  return issues;
};

export const validateContext=(context:AgentContext):ValidationIssue[]=>{
  const issues:ValidationIssue[]=[];
  if(!context.selectionIds.length)issues.push({severity:"warning",code:"NO_SELECTION",message:"No Figma node is selected.",suggestedFix:"Select a frame or screen before running a targeted editing task."});
  if(!context.project.components.length)issues.push({severity:"info",code:"NO_COMPONENTS",message:"No components were discovered in the supplied context."});
  if(!context.project.tokens.length)issues.push({severity:"info",code:"NO_TOKENS",message:"No variables/tokens were discovered in the supplied context."});
  return issues;
};
