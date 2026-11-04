export function matrixLabelParts(name:string):string[]{
 const match=name.match(/^(.*?)\s*(\([^)]*\))$/);
 return match&&match[1].trim()?[match[1].trim(),match[2]]:[name];
}
export function matrixProductWidth(name:string){return Math.max(88,...matrixLabelParts(name).map(part=>Array.from(part).length*7+12));}
export function matrixEntryWidth(viewport:number,zoom:number){return Math.max(0,viewport/zoom-16);}
