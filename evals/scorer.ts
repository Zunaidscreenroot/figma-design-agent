export interface EvalRun{
  actions:number;
  reusedComponents:number;
  hardcodedValues:number;
  repairs:number;
  blockingIssues:number;
}

export const score=(run:EvalRun)=>{
  const actionEfficiency=Math.max(0,1-Math.max(0,run.actions-20)/80);
  const reuse=Math.min(1,run.reusedComponents/5);
  const tokenHygiene=Math.max(0,1-run.hardcodedValues/10);
  const repairStability=Math.max(0,1-run.repairs/3);
  const issuePenalty=Math.min(1,run.blockingIssues/5);
  return Math.round(100*(actionEfficiency*.2+reuse*.2+tokenHygiene*.2+repairStability*.15+(1-issuePenalty)*.25));
};
