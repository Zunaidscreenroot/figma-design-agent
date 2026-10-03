import type{ActionPlan,DesignAction}from"./actions.js";

const finite=(v:number)=>Number.isFinite(v)&&Math.abs(v)<1_000_000;
const ref=(v:string)=>v.startsWith("$")?v.slice(1):null;

export const guardAction=(a:DesignAction):string[]=>{
  const issues:string[]=[];
  if(!a.id.trim())issues.push("action id is required");
  if("targetId"in a&&a.targetId&&!a.targetId.trim())issues.push("targetId is empty");
  if("width"in a&&(!finite(a.width)||a.width<=0))issues.push("width must be finite and positive");
  if("height"in a&&(!finite(a.height)||a.height<=0))issues.push("height must be finite and positive");
  if("x"in a&&a.x!==undefined&&!finite(a.x))issues.push("x must be finite");
  if("y"in a&&a.y!==undefined&&!finite(a.y))issues.push("y must be finite");
  return issues;
};

export const guardPlan=(plan:ActionPlan,maxActions=80)=>{
  const errors:string[]=[];
  if(plan.actions.length>maxActions)errors.push(`too many actions: ${plan.actions.length}`);
  const ids=new Set(plan.actions.map(a=>a.id));
  if(ids.size!==plan.actions.length)errors.push("action IDs must be unique");

  for(const action of plan.actions){
    for(const issue of guardAction(action))errors.push(`${action.id}: ${issue}`);
    if("targetId"in action){const target=ref(action.targetId);if(target&&!ids.has(target))errors.push(`${action.id}: unknown symbolic target ${action.targetId}`)}
    if("parentId"in action&&action.parentId){const parent=ref(action.parentId);if(parent&&!ids.has(parent))errors.push(`${action.id}: unknown symbolic parent ${action.parentId}`)}
    for(const dep of action.dependsOn??[])if(!ids.has(dep))errors.push(`${action.id}: unknown dependency ${dep}`);
  }
  return errors;
};
