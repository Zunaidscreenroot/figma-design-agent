import{readdir,readFile}from"node:fs/promises";
import{join}from"node:path";
import{fileURLToPath}from"node:url";

let cached:string|undefined;

export const loadSkills=async()=>{
  if(cached)return cached;
  const dir=fileURLToPath(new URL("../../../agent-skills/",import.meta.url));
  const files=(await readdir(dir)).filter(name=>name.endsWith(".md")).sort();
  const sections:string[]=[];
  for(const file of files)sections.push(`# Skill: ${file}\n${await readFile(join(dir,file),"utf8")}`);
  cached=sections.join("\n\n---\n\n");
  return cached;
};
