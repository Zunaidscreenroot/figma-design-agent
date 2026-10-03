import ui from "./ui.html";
import type { DesignAction, ExecutionReport } from "../../../packages/core/src/actions.js";

type RawNode={
  id:string;name:string;type:string;x?:number;y?:number;width?:number;height?:number;
  visible?:boolean;layoutMode?:string;itemSpacing?:number;paddingTop?:number;paddingRight?:number;
  paddingBottom?:number;paddingLeft?:number;characters?:string;mainComponentId?:string;
  variantProperties?:Record<string,string>|null;componentProperties?:Record<string,{type:string;value:unknown}>;
  children?:RawNode[];
};

figma.showUI(ui,{width:440,height:760,themeColors:true});

const num=(v:unknown,f=0)=>typeof v==="number"&&Number.isFinite(v)?v:f;

const serializeNode=async(node:SceneNode,depth=0):Promise<RawNode>=>{
  const n=node as SceneNode&Record<string,any>;
  const raw:RawNode={
    id:node.id,name:node.name,type:node.type,x:num(n.x),y:num(n.y),width:num(n.width),
    height:num(n.height),visible:node.visible,children:[]
  };
  if("layoutMode"in n){
    raw.layoutMode=n.layoutMode;raw.itemSpacing=num(n.itemSpacing);raw.paddingTop=num(n.paddingTop);
    raw.paddingRight=num(n.paddingRight);raw.paddingBottom=num(n.paddingBottom);raw.paddingLeft=num(n.paddingLeft);
  }
  if(node.type==="TEXT")raw.characters=node.characters;
  if(node.type==="INSTANCE"){
    const main=await node.getMainComponentAsync();
    raw.mainComponentId=main?.id;
    raw.variantProperties=null;
    raw.componentProperties=node.componentProperties;
  }
  if(depth<6&&"children"in n){
    raw.children=[];
    for(const child of n.children as SceneNode[])raw.children.push(await serializeNode(child,depth+1));
  }
  return raw;
};

const collectComponents=async()=>{
  await figma.loadAllPagesAsync();
  const nodes=figma.root.findAllWithCriteria({types:["COMPONENT","COMPONENT_SET"]}as any);
  return nodes.map((n:any)=>({
    id:n.id,key:n.key,name:n.name,type:n.type,
    variantProperties:n.variantGroupProperties??undefined,
    componentPropertyDefinitions:n.componentPropertyDefinitions??undefined,
    usageCount:0
  }));
};

const collectTokens=async()=>{
  try{
    const vars=await figma.variables.getLocalVariablesAsync();
    return vars.map((v:any)=>{
      const modes=Object.keys(v.valuesByMode??{});
      return{id:v.id,name:v.name,type:v.resolvedType,value:modes.length?v.valuesByMode[modes[0]]:undefined};
    });
  }catch{return[];}
};

const collectContext=async()=>{
  await figma.currentPage.loadAsync();
  const selected=figma.currentPage.selection;
  const selectedNodes=[];
  for(const node of selected)selectedNodes.push(await serializeNode(node));
  const pages=figma.root.children.map(p=>({id:p.id,name:p.name}));
  const [components,tokens]=await Promise.all([collectComponents(),collectTokens()]);
  const childCounts=await Promise.all(figma.root.children.map(async p=>{await p.loadAsync();return{id:p.id,name:p.name,childCount:p.children.length};}));
  return{
    selectedNodes,pages:childCounts,components,tokens,
    viewport:selected[0]?{width:num((selected[0]as any).width),height:num((selected[0]as any).height)}:undefined
  };
};

const parentOf=async(id?:string):Promise<BaseNode&ChildrenMixin>=>{
  if(id){
    const n=await figma.getNodeByIdAsync(id);
    if(n&&"appendChild"in n)return n as BaseNode&ChildrenMixin;
  }
  await figma.currentPage.loadAsync();
  return figma.currentPage;
};

const componentById=async(id:string):Promise<ComponentNode|undefined>=>{
  const n=await figma.getNodeByIdAsync(id);
  if(!n)return;
  if(n.type==="COMPONENT")return n;
  if(n.type==="COMPONENT_SET")return n.defaultVariant;
};

const targetNode=async(id:string)=>figma.getNodeByIdAsync(id);

const execute=async(a:DesignAction)=>{
  try{
    switch(a.action){
      case"create_frame":{
        const n=figma.createFrame();n.name=a.name;n.resize(a.width,a.height);n.x=a.x??n.x;n.y=a.y??n.y;
        (await parentOf(a.parentId)).appendChild(n);return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"create_section":{
        const n=figma.createSection();n.name=a.name;n.resizeWithoutConstraints(a.width,a.height);n.x=a.x??n.x;n.y=a.y??n.y;
        (await parentOf(a.parentId)).appendChild(n);return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"create_text":{
        const n=figma.createText();await figma.loadFontAsync({family:a.fontFamily??"Inter",style:a.fontStyle??"Regular"});
        n.fontSize=a.fontSize??16;n.characters=a.text;n.name=a.name;n.x=a.x??0;n.y=a.y??0;
        (await parentOf(a.parentId)).appendChild(n);return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"create_instance":{
        const c=await componentById(a.componentId);if(!c)throw new Error(`Component ${a.componentId} not found`);
        const n=c.createInstance();n.name=a.name??c.name;
        if(a.variantProperties)try{n.setProperties(a.variantProperties)}catch(error){return{actionId:a.id,success:false,error:error instanceof Error?error.message:"Invalid component properties"}}
        (await parentOf(a.parentId)).appendChild(n);return{actionId:a.id,success:true,nodeIds:[n.id]};
      }
      case"set_text":{
        const node=await targetNode(a.targetId);if(!node||node.type!=="TEXT")throw new Error("Target is not text");
        await figma.loadFontAsync(node.fontName as FontName);node.characters=a.text;return{actionId:a.id,success:true,nodeIds:[node.id]};
      }
      case"set_property":{
        const node=await targetNode(a.targetId)as any;if(!node)throw new Error("Target not found");
        if(a.property==="width"||a.property==="height"){const w=a.property==="width"?Number(a.value):node.width;const h=a.property==="height"?Number(a.value):node.height;node.resize(w,h)}
        else node[a.property]=a.value;
        return{actionId:a.id,success:true,nodeIds:[node.id]};
      }
      case"set_layout":{
        const node=await targetNode(a.targetId)as any;if(!node||!("layoutMode"in node))throw new Error("Target has no auto layout");
        node.layoutMode=a.mode;if(a.gap!==undefined)node.itemSpacing=a.gap;
        if(a.padding){node.paddingTop=a.padding.top;node.paddingRight=a.padding.right;node.paddingBottom=a.padding.bottom;node.paddingLeft=a.padding.left}
        if(a.primaryAxisSizingMode)node.primaryAxisSizingMode=a.primaryAxisSizingMode;
        if(a.counterAxisSizingMode)node.counterAxisSizingMode=a.counterAxisSizingMode;
        return{actionId:a.id,success:true,nodeIds:[node.id]};
      }
      case"bind_variable":{
        const node=await targetNode(a.targetId)as any;const variable=await figma.variables.getVariableByIdAsync(a.variableId);
        if(!node||!variable)throw new Error("Target or variable not found");
        if(typeof node.setBoundVariable!=="function")throw new Error("Target does not support variables");
        node.setBoundVariable(a.property as any,variable);return{actionId:a.id,success:true,nodeIds:[node.id]};
      }
      case"move":{
        const node=await targetNode(a.targetId)as any;if(!node)throw new Error("Target not found");node.x=a.x;node.y=a.y;
        return{actionId:a.id,success:true,nodeIds:[node.id]};
      }
      case"resize":{
        const node=await targetNode(a.targetId)as any;if(!node||typeof node.resize!=="function")throw new Error("Target cannot resize");
        node.resize(a.width,a.height);return{actionId:a.id,success:true,nodeIds:[node.id]};
      }
      case"replace_instance":{
        const old=await targetNode(a.targetId);if(!old||old.type!=="INSTANCE")throw new Error("Target is not instance");
        const c=await componentById(a.componentId);if(!c)throw new Error("Replacement component not found");
        const fresh=c.createInstance();fresh.name=old.name;fresh.x=old.x;fresh.y=old.y;
        const parent=old.parent;if(!parent||!("insertChild"in parent))throw new Error("Target cannot be replaced in its parent");
        await (parent.type==="PAGE"?parent.loadAsync():Promise.resolve());
        parent.insertChild(parent.children.indexOf(old),fresh);old.remove();
        return{actionId:a.id,success:true,nodeIds:[fresh.id]};
      }
      case"delete":{
        const node=await targetNode(a.targetId);if(!node)throw new Error("Target not found");node.remove();return{actionId:a.id,success:true};
      }
    }
  }catch(error){return{actionId:a.id,success:false,error:error instanceof Error?error.message:"Unknown error"}}
};

figma.ui.onmessage=async(message:any)=>{
  try{
    if(message.type==="get-context"){figma.ui.postMessage({type:"context",payload:await collectContext()});return}
    if(message.type==="execute-actions"){
      const results=[] as any[];
      for(const action of message.actions as DesignAction[])results.push(await execute(action));
      const report:ExecutionReport={success:results.every(r=>r.success),results};
      figma.ui.postMessage({type:"execution-report",payload:report});return;
    }
    if(message.type==="select-node"){
      const node=await targetNode(message.nodeId);
      if(node&&node.type!=="DOCUMENT"&&node.type!=="PAGE"){
        figma.currentPage.selection=[node as SceneNode];
        figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
      }
      return;
    }
    if(message.type==="capture-selection"){
      const node=figma.currentPage.selection[0];
      if(!node){figma.ui.postMessage({type:"capture",payload:null});return}
      const bytes=await node.exportAsync({format:"PNG",constraint:{type:"WIDTH",value:Math.min(1600,Math.max(800,node.width))}});
      let binary="";for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
      figma.ui.postMessage({type:"capture",payload:`data:image/png;base64,${btoa(binary)}`});
    }
  }catch(error){figma.ui.postMessage({type:"plugin-error",payload:error instanceof Error?error.message:"Unknown plugin error"})}
};
