const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),ts=require('typescript');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/stock-movements.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const {stockMovements}=exportsObject;
const row=(kind,quantity,extra={})=>({kind,items:[{product:'beef',quantity}],...extra});
const records=[row('production',100),row('sale',30),row('sale',-5),row('production',200,{historyOnly:true}),row('sale',50,{voided:true}),row('sale',300,{historyOnly:true})];
const totals=stockMovements(records);assert.equal(totals.beef.produced,100);assert.equal(totals.beef.sold,25);assert.equal(10+totals.beef.produced-totals.beef.sold,85);assert.equal(Object.keys(stockMovements([])).length,0);
console.log('PASS: stock movements include returns; exclude cancelled and historical-only entries; opening + production - sales remains correct.');
