// Reuse the same module loader for preload and React.lazy.
export const loadProduction=()=>import('./record-grid');
export const loadExpenses=()=>import('./expenses-panel');
export const loadBusiness=()=>import('./business-panel');
export const loadHistory=()=>import('./history-panel');
export const loadDashboard=()=>import('./dashboard');
export function preloadPanel(tab:string){
 const loader=tab==='expenses'?loadExpenses:tab==='production'?loadProduction:['customers','debtors','prices'].includes(tab)?loadBusiness:tab==='history'?loadHistory:tab==='summary'?loadDashboard:null;
 if(loader)void loader().catch(()=>{/* A normal click can retry a preload failure. */});
}
