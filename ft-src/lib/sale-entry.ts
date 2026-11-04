import {customerPrices,freeCustomer,type Business} from './business';
export function customerEntryPrices(date:string,group:string,b:Business,previousCustomer:string,nextCustomer:string,rates:Record<string,number>,editing:boolean){
 return !editing||freeCustomer(previousCustomer,b)||freeCustomer(nextCustomer,b)?customerPrices(date,group,b,nextCustomer):rates;
}
