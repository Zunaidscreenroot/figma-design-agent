import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
await mkdir("dist",{recursive:true});
const ui=await readFile("src/ui.html","utf8");
await build({entryPoints:["src/main.ts"],bundle:true,outfile:"dist/code.js",format:"iife",target:"es2017",loader:{".html":"text"}});
await writeFile("dist/ui.html",ui);
console.log("Plugin built.");
