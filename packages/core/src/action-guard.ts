import type{ActionPlan,DesignAction}from"./actions.js";

const finite=(v:number)=>Number.isFinite(v)&&Math.abs(v)<1_000_000;

export const guardAction=(a:DesignAction):string[]=>{
  const issues:string[]=[];
  if(!a.id.trim())issues.push("action id is required");
  if("targetId"in a&&a.targetId&&!a.targetId.trim())issues.push("targetId is empty");
  if("width"in a&&(!finite(a.width)||a.width<=0))issues.push("width must be finite and positive");
  if("height"in a&&(!finite(a.height)||a.height<=0))issues.push("height must be finite and positive");
  if("x"in a&&!finite(a.x))issues.push("x must be finite");
  if("y"in a&&!finite(a.y))issues.push("y must be finite");
  return issues;
};

export const guardPlan=(plan:ActionPlan,maxActions=80)=>{
  const errors:string[]=[];
  if(plan.actions.length>maxActions)errors.push(`too many actions: ${plan.actions.length}`);
  for(const action of plan.actions)for(const issue of guardAction(action))errors.push(`${action.id}: ${issue}`);
  return errors;
};
