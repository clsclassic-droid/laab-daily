import {db} from './db';
export const overviewRevisionSQL="CAST(COALESCE((SELECT value FROM settings WHERE key='overview-revision-v1'),'0') AS INTEGER)";
export const cachedOverviewSQL=`SELECT payload FROM overview_cache WHERE key=? AND revision=${overviewRevisionSQL}`;
export const saveOverviewSQL=`INSERT INTO overview_cache(key,revision,payload) SELECT ?,?,? WHERE ${overviewRevisionSQL}=? ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,payload=excluded.payload`;
export async function cachedOverview(key:string){const row=await db().prepare(cachedOverviewSQL).bind(key).first<{payload:string}>();return row?.payload;}
export async function overviewRevision(){const row=await db().prepare(`SELECT ${overviewRevisionSQL} AS revision`).first<{revision:number}>();return row?.revision||0;}
export async function saveOverview(key:string,revision:number,payload:string){await db().prepare(saveOverviewSQL).bind(key,revision,payload,revision).run();}
