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
  const components:any[]=[];

  for(const n of nodes as any[]){
    try{
      const component:any={
        id:n.id,
        key:n.key,
        name:n.name,
        type:n.type,
        usageCount:0
      };

      // A damaged component set can throw when Figma lazily resolves variant metadata.
      // Skip only that set; continue scanning the rest of the file.
      if(n.type==="COMPONENT_SET"){
        try{
          component.variantProperties=n.variantGroupProperties??undefined;
          component.componentPropertyDefinitions=n.componentPropertyDefinitions??undefined;
        }catch(error){
          console.warn(
            `[Figma Design Agent] Skipping component set "${n.name}" (${n.id}) because its variant metadata is invalid:`,
            error instanceof Error?error.message:String(error)
          );
          continue;
        }
      }

      components.push(component);
    }catch(error){
      console.warn(
        `[Figma Design Agent] Skipping component "${n.name??"unknown"}" during scan:`,
        error instanceof Error?error.message:String(error)
      );
    }
  }

  return components;
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
      case"set_component_property":{
        const node=await targetNode(a.targetId);if(!node||node.type!=="INSTANCE")throw new Error("Target is not instance");
        node.setProperties({[a.propertyName]:a.value});return{actionId:a.id,success:true,nodeIds:[node.id]};
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
        old.swapComponent(c);return{actionId:a.id,success:true,nodeIds:[old.id]};
      }
      case"delete":{
        const node=await targetNode(a.targetId);if(!node)throw new Error("Target not found");node.remove();return{actionId:a.id,success:true};
      }
    }
  }catch(error){return{actionId:a.id,success:false,error:error instanceof Error?error.message:"Unknown error"}}
};

type HealthStatus="pass"|"warn"|"fail";
type HealthCheck={name:string;status:HealthStatus;detail:string};

const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);

const runHealthCheck=async():Promise<HealthCheck[]>=>{
  const checks:HealthCheck[]=[];
  const add=(name:string,status:HealthStatus,detail:string)=>checks.push({name,status,detail});
  let selected:SceneNode[]=[];
  let components:any[]=[];
  let probe:FrameNode|undefined;

  let selectedTarget:SceneNode|undefined;
  try{
    await figma.currentPage.loadAsync();
    selected=[...figma.currentPage.selection];
    selectedTarget=selected.find(node=>["FRAME","COMPONENT","COMPONENT_SET","INSTANCE","SECTION"].includes(node.type))??selected[0];
    add("Figma plugin runtime","pass","The plugin can call the Figma Plugin API.");
    const usableSelection=Boolean(selectedTarget&&["FRAME","COMPONENT","COMPONENT_SET","INSTANCE","SECTION"].includes(selectedTarget.type));
    add(
      "Selection",
      usableSelection?"pass":"warn",
      usableSelection
        ? `${selected.length} node(s) selected. Target: ${selectedTarget!.name} (${selectedTarget!.type}).`
        : selected.length
          ? `Selected node type is ${selected[0].type}. Select a full frame, component, instance, or section—not an individual text/vector child.`
          : "No selection. Select a frame before running an AI task; the write test can still run."
    );
  }catch(error){
    add("Figma document access","fail",errorText(error));
  }

  if(selectedTarget){
    try{
      await serializeNode(selectedTarget);
      add("Selected-node serialization","pass","The plugin can read the selected node and its basic structure.");
    }catch(error){
      add("Selected-node serialization","fail",errorText(error));
    }
    try{
      const bytes=await selectedTarget.exportAsync({
        format:"PNG",
        constraint:{type:"WIDTH",value:800}
      });
      add("Selected-node screenshot","pass",`PNG export succeeded (${bytes.length} bytes).`);
    }catch(error){
      add("Selected-node screenshot","fail",errorText(error));
    }
  }else{
    add("Selected-node screenshot","warn","Skipped because no node is selected.");
  }

  try{
    components=await collectComponents();
    add("Component scan","pass",`Read ${components.length} usable component(s)/component set(s). Broken variant metadata is skipped where possible.`);
  }catch(error){
    add("Component scan","fail",errorText(error));
  }

  try{
    const variables=await figma.variables.getLocalVariablesAsync();
    add("Local variables/tokens","pass",`Variable API is accessible; found ${variables.length} local variable(s).`);
  }catch(error){
    add("Local variables/tokens","fail",errorText(error));
  }

  try{
    await figma.currentPage.loadAsync();
    probe=figma.createFrame();
    probe.name="UX Agent — temporary health check";
    probe.resize(180,120);
    probe.x=100000;
    probe.y=100000;
    figma.currentPage.appendChild(probe);
    add("Create/resize/append frame","pass","Created a temporary frame and attached it to the current page.");

    probe.layoutMode="VERTICAL";
    probe.itemSpacing=4;
    probe.paddingTop=8;
    probe.paddingRight=8;
    probe.paddingBottom=8;
    probe.paddingLeft=8;
    add("Auto-layout mutation","pass","Set vertical auto-layout, spacing and padding on the temporary frame.");

    await figma.loadFontAsync({family:"Inter",style:"Regular"});
    const textNode=figma.createText();
    textNode.name="Temporary health-check text";
    textNode.fontSize=12;
    textNode.characters="Health check";
    probe.appendChild(textNode);
    textNode.characters="Health check passed";
    add("Create/edit text","pass","Loaded Inter Regular, created a text node, and updated its text.");

    probe.resize(200,140);
    probe.x=100020;
    probe.y=100020;
    add("Resize/move mutation","pass","Resized and repositioned the temporary frame.");

    const png=await probe.exportAsync({format:"PNG",constraint:{type:"WIDTH",value:800}});
    add("Screenshot export","pass",`Temporary-frame PNG export succeeded (${png.length} bytes).`);

    const candidates=components.filter((item:any)=>item.type==="COMPONENT"||item.type==="COMPONENT_SET").slice(0,12);
    let instancePassed=false;
    let instanceError="";
    for(const candidate of candidates){
      try{
        const component=await componentById(candidate.id);
        if(!component)continue;
        const instance=component.createInstance();
        probe.appendChild(instance);
        instance.remove();
        add("Create component instance","pass",`Successfully created and removed a test instance of "${candidate.name}".`);
        instancePassed=true;
        break;
      }catch(error){
        instanceError=errorText(error);
      }
    }
    if(!instancePassed){
      add(
        "Create component instance",
        "warn",
        candidates.length
          ? "No scanned component could be instantiated in the test. First error: "+(instanceError||"No usable component was found.")
          : "Skipped because the file contains no usable components."
      );
    }
  }catch(error){
    add("Temporary write-action test","fail",errorText(error));
  }finally{
    try{
      if(probe&&!probe.removed)probe.remove();
      add("Cleanup","pass","Removed the temporary test frame and its children.");
    }catch(error){
      add("Cleanup","fail","Please remove 'UX Agent — temporary health check' manually. "+errorText(error));
    }
  }

  return checks;
};

figma.ui.onmessage=async(message:any)=>{
  try{
    if(message.type==="health-check"){figma.ui.postMessage({type:"health-check-report",payload:await runHealthCheck()});return}
    if(message.type==="get-context"){figma.ui.postMessage({type:"context",payload:await collectContext()});return}
    if(message.type==="execute-actions"){
      const results=[] as any[];
      const outputs=new Map<string,string>();
      const resolveRef=(value:string)=>{
        if(!value.startsWith("$"))return value;
        const resolved=outputs.get(value.slice(1));
        if(!resolved)throw new Error(`Unresolved symbolic node reference: ${value}`);
        return resolved;
      };
      for(const action of message.actions as DesignAction[]){
        try{
          const resolved={...action} as any;
          if("targetId"in resolved)resolved.targetId=resolveRef(resolved.targetId);
          if("parentId"in resolved&&resolved.parentId)resolved.parentId=resolveRef(resolved.parentId);
          const result=await execute(resolved as DesignAction);
          results.push(result);
          if(result.success&&result.nodeIds?.[0])outputs.set(action.id,result.nodeIds[0]);
        }catch(error){
          results.push({actionId:action.id,success:false,error:error instanceof Error?error.message:"Unknown symbolic reference error"});
        }
      }
      const success=results.every(r=>r.success);
      if(success)figma.commitUndo();
      const report:ExecutionReport={success,results};
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
