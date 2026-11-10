// MongoDB index names are not schema identity. Compound key order remains significant.
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
const filter=v=>{if(!v)return null;if(Object.keys(v).length===1&&Array.isArray(v.$and)&&v.$and.length===1)return filter(v.$and[0]);const copy=Object.fromEntries(Object.entries(v).map(([k,value])=>[k,value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&Object.hasOwn(value,'$eq')?value.$eq:value]));return ordered(copy)};
const collation=v=>!v||v.locale==='simple'?null:ordered(v);
export function matchesIndex(actual,key,options={}){return JSON.stringify(Object.entries(actual.key||{}))===JSON.stringify(Object.entries(key))&&!!actual.unique===!!options.unique&&!!actual.sparse===!!options.sparse&&JSON.stringify(filter(actual.partialFilterExpression))===JSON.stringify(filter(options.partialFilterExpression))&&JSON.stringify(collation(actual.collation))===JSON.stringify(collation(options.collation))&&(actual.expireAfterSeconds??null)===(options.expireAfterSeconds??null)}
export function isActiveContractIndex(i){return matchesIndex(i,{property:1},{unique:true,partialFilterExpression:{lifecycle:'ACTIVE'}})}
export async function inspectRequiredIndexes(db,models){
 const missing=[],equivalent=[],conflicts=[],seen=new Set();
 for(const model of Object.values(models)){
 const collection=model.collection.collectionName;let indexes=[];try{indexes=await db.collection(collection).indexes()}catch(e){if(e.code!==26&&e.codeName!=='NamespaceNotFound')throw e}
 for(const [key,options]of model.schema.indexes()){
 const signature=JSON.stringify([collection,Object.entries(key),!!options.unique,!!options.sparse,filter(options.partialFilterExpression),collation(options.collation),options.expireAfterSeconds??null]);if(seen.has(signature))continue;seen.add(signature);
 const definition={collection,key,options:Object.fromEntries(Object.entries(options).filter(([k,v])=>k!=="background"&&v!==undefined)),unique:!!options.unique,partialFilterExpression:options.partialFilterExpression||null};
 const match=indexes.find(i=>matchesIndex(i,key,options));if(match){if(options.name&&match.name!==options.name)equivalent.push({collection,expectedName:options.name,actualName:match.name});continue}
 const name=options.name||Object.entries(key).map(([k,v])=>`${k}_${v}`).join('_');
 const collision=indexes.find(i=>i.name===name);if(collision)conflicts.push({collection,name,message:'An incompatible index already uses the required name. Review without deleting it.'});missing.push(definition);
 }
 }
 return {ready:missing.length===0,missing,equivalent,conflicts,inspection:'READ_ONLY',note:'Actual index definitions were inspected. No indexes or financial records changed.'};
}
