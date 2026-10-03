import ui from "./ui.html";
import type { DesignAction, ExecutionReport } from "../../../packages/core/src/actions.js";

type RawNode={
  id:string; name:string; type:string; x?:number; y?:number; width?:number; height?:number;
  visible?:boolean; layoutMode?:string; itemSpacing?:number; paddingTop?:number; paddingRight?:number;
  paddingBottom?:number; paddingLeft?:number; characters?:string; mainComponentId?:string;
  variantProperties?:Record<string,string>|null; children?:RawNode[];
};

figma.showUI(ui,{width:440,height:760,themeColors:true});

const num=(v:unknown,f=0)=>typeof v==="number"&&Number.isFinite(v)?v:f;

const serializeNode=(node:SceneNode,depth=0):RawNode=>{
  const n=node as SceneNode&Record<string,any>;
  const raw:RawNode={
    id:node.id,name:node.name,type:node.type,x:num(n.x),y:num(n.y),width:num(n.width),
    height:num(n.height),visible:node.visible,children:[]
  };
  if("layoutMode" in n){
    raw.layoutMode=n.layoutMode; raw.itemSpacing=num(n.itemSpacing);
    raw.paddingTop=num(n.paddingTop); raw.paddingRight=num(n.paddingRight);
    raw.paddingBottom=num(n.paddingBottom); raw.paddingLeft=num(n.paddingLeft);
  }
  if(node.type==="TEXT") raw.characters=node.characters;
  if(node.type==="INSTANCE"){
    raw.mainComponentId=node.mainComponent?.id;
    raw.variantProperties=node.variantProperties;
  }
  if(depth<6&&"children" in n) raw.children=n.children.map((c:SceneNode)=>serializeNode(c,depth+1));
  return raw;
};

const collectComponents=()=>figma.root.findAllWithCriteria({types:["COMPONENT","COMPONENT_SET"]} as any).map((n:any)=>({
  id:n.id,key:n.key,name:n.name,type:n.type,
  variantProperties:n.variantGroupProperties??undefined,
  usageCount:0
}));

const collectTokens=()=>{
  try{
    return figma.variables.getLocalVariables().map((v:any)=>{
      const modes=Object.keys(v.valuesByMode??{});
      return {id:v.id,name:v.name,type:v.resolvedType,value:modes.length?v.valuesByMode[modes[0]]:undefined};
    });
  }catch{return[];}
};

const collectContext=()=>({
  selectedNodes:figma.currentPage.selection.map(n=>serializeNode(n)),
  pages:figma.root.children.map(p=>({id:p.id,name:p.name,childCount:p.children.length})),
  components:collectComponents(),
  tokens:collectTokens(),
  viewport:figma.currentPage.selection[0]?{
    width:num((figma.currentPage.selection[0] as any).width),
    height:num((figma.currentPage.selection[0] as any).height)
  }:undefined
});

const parentOf=(id?:string):BaseNode&ChildrenMixin=>{
  if(id){
    const n=figma.getNodeById(id);
    if(n&&"appendChild" in n) return n as BaseNode&ChildrenMixin;
  }
  return figma.currentPage;
};

const componentById=(id:string):ComponentNode|undefined=>{
  const n=figma.getNodeById(id);
  if(!n)return;
  if(n.type==="COMPONENT")return n;
  if(n.type==="COMPONENT_SET")return n.children.find(c=>c.type==="COMPONENT") as ComponentNode|undefined;
};

const execute=async(a:DesignAction)=>{
  try{
    switch(a.action){
      case"create_frame":{
        const n=figma.createFrame();n.name=a.name;n.resize(a.width,a.height);n.x=a.x??n.x;n.y=a.y??n.y;parentOf(a.parentId).appendChild(n);
        return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"create_section":{
        const n=figma.createSection();n.name=a.name;n.resizeWithoutConstraints(a.width,a.height);n.x=a.x??n.x;n.y=a.y??n.y;parentOf(a.parentId).appendChild(n);
        return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"create_text":{
        const n=figma.createText();await figma.loadFontAsync({family:a.fontFamily??"Inter",style:a.fontStyle??"Regular"});
        n.fontSize=a.fontSize??16;n.characters=a.text;n.name=a.name;n.x=a.x??0;n.y=a.y??0;parentOf(a.parentId).appendChild(n);
        return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"create_instance":{
        const c=componentById(a.componentId);if(!c)throw new Error(`Component ${a.componentId} not found`);
        const n=c.createInstance();n.name=a.name??c.name;
        if(a.variantProperties&&"setProperties"in n){
          try{(n as any).setProperties(a.variantProperties);}catch{}
        }
        parentOf(a.parentId).appendChild(n);
        return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"set_text":{
        const n=figma.getNodeById(a.targetId);if(!n||n.type!=="TEXT")throw new Error("Target is not text");
        await figma.loadFontAsync(n.fontName as FontName);n.characters=a.text;return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"set_property":{
        const n=figma.getNodeById(a.targetId) as any;if(!n)throw new Error("Target not found");
        if(a.property==="width"||a.property==="height"){const w=a.property==="width"?Number(a.value):n.width;const h=a.property==="height"?Number(a.value):n.height;n.resize(w,h);}
        else n[a.property]=a.value;
        return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"set_layout":{
        const n=figma.getNodeById(a.targetId) as any;if(!n||!("layoutMode"in n))throw new Error("Target has no auto layout");
        n.layoutMode=a.mode;if(a.gap!==undefined)n.itemSpacing=a.gap;
        if(a.padding){n.paddingTop=a.padding.top;n.paddingRight=a.padding.right;n.paddingBottom=a.padding.bottom;n.paddingLeft=a.padding.left;}
        if(a.primaryAxisSizingMode)n.primaryAxisSizingMode=a.primaryAxisSizingMode;
        if(a.counterAxisSizingMode)n.counterAxisSizingMode=a.counterAxisSizingMode;
        return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"bind_variable":{
        const n=figma.getNodeById(a.targetId) as any;const v=figma.variables.getVariableById(a.variableId);
        if(!n||!v)throw new Error("Target or variable not found");
        if(typeof n.setBoundVariable!=="function")throw new Error("Target does not support variables");
        n.setBoundVariable(a.property as any,v);return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"move":{
        const n=figma.getNodeById(a.targetId) as any;if(!n)throw new Error("Target not found");n.x=a.x;n.y=a.y;return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"resize":{
        const n=figma.getNodeById(a.targetId) as any;if(!n||typeof n.resize!=="function")throw new Error("Target cannot resize");n.resize(a.width,a.height);return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"replace_instance":{
        const old=figma.getNodeById(a.targetId);if(!old||old.type!=="INSTANCE")throw new Error("Target is not instance");
        const c=componentById(a.componentId);if(!c)throw new Error("Replacement component not found");
        const fresh=c.createInstance();fresh.name=old.name;fresh.x=old.x;fresh.y=old.y;old.parent?.insertChild(old.parent.children.indexOf(old),fresh);old.remove();
        return{actionId:a.id,success:true,nodeIds:[fresh.id]};
      }
      case"delete":{
        const n=figma.getNodeById(a.targetId);if(!n)throw new Error("Target not found");n.remove();return{actionId:a.id,success:true};
      }
    }
  }catch(error){
    return{actionId:a.id,success:false,error:error instanceof Error?error.message:"Unknown error"};
  }
};

figma.ui.onmessage=async(message:any)=>{
  if(message.type==="get-context"){figma.ui.postMessage({type:"context",payload:collectContext()});return;}
  if(message.type==="execute-actions"){
    const results=[] as any[];
    for(const action of message.actions as DesignAction[]) results.push(await execute(action));
    const report:ExecutionReport={success:results.every(r=>r.success),results};
    figma.ui.postMessage({type:"execution-report",payload:report});return;
  }
  if(message.type==="capture-selection"){
    const node=figma.currentPage.selection[0];
    if(!node){figma.ui.postMessage({type:"capture",payload:null});return;}
    const bytes=await node.exportAsync({format:"PNG",constraint:{type:"WIDTH",value:Math.min(1600,Math.max(800,node.width))}});
    let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    figma.ui.postMessage({type:"capture",payload:`data:image/png;base64,${btoa(binary)}`});
  }
};
