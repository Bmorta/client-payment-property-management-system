import YAML from 'yaml';
import {createHash} from 'node:crypto';
export const SETUP_PROTOCOL=1;
export function localMongoConnection(uri){
 if(typeof uri!=='string'||!uri.startsWith('mongodb://'))throw Error('Automatic local setup requires one mongodb:// loopback server. Remote and SRV deployments need administrator review.');
 let url;try{url=new URL(uri)}catch{throw Error('The MongoDB connection string is invalid.')}
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.host.includes(','))throw Error('This connection is not a single local MongoDB server. No service will be changed.');
 const database=decodeURIComponent(url.pathname.slice(1));if(!database||/[\s/\\.$"*<>:|?\0]/.test(database))throw Error('An explicit valid existing database name is required. It will not be guessed.');
 return {database,host:url.hostname,port:Number(url.port||27017),url};
}
export function replicaUri(uri,setName){const {url}=localMongoConnection(uri);if(!/^[a-zA-Z0-9_-]{1,64}$/.test(setName))throw Error('Invalid replica-set name.');if(url.searchParams.has('replicaSet')&&url.searchParams.get('replicaSet')!==setName)throw Error('The URI refers to a different replica set. No connection change made.');url.searchParams.set('replicaSet',setName);return url.toString()}
export function planMongoConfiguration(text,uri){
 const connection=localMongoConnection(uri),doc=YAML.parseDocument(text,{uniqueKeys:true});if(doc.errors.length)throw Error('MongoDB YAML requires review: '+doc.errors.map(e=>e.message.split('\n')[0]).join('; '));
 const value=doc.toJS();if(!value||typeof value!=='object')throw Error('MongoDB configuration is empty.');
 const net=value.net||{},security=value.security||{};
 if(security.authorization==='enabled'||security.keyFile||security.clusterAuthMode||net.tls?.mode&&net.tls.mode!=='disabled'||net.ssl?.mode&&net.ssl.mode!=='disabled'||value.sharding?.clusterRole)throw Error('Authentication, TLS or sharding is configured. Use a separately reviewed topology setup; nothing will be overwritten.');
 if(Number(net.port||27017)!==connection.port)throw Error('MongoDB service port does not match REMS.');
 const addresses=String(net.bindIp||'').split(',').map(x=>x.trim());if(net.bindIpAll||!addresses.length||addresses.some(x=>!['127.0.0.1','localhost','::1'].includes(x)))throw Error('MongoDB must remain bound only to loopback addresses for automatic local setup.');
 const dbPath=value.storage?.dbPath;if(typeof dbPath!=='string'||!(/^[a-z]:[\\/]/i.test(dbPath)))throw Error('An absolute Windows MongoDB data directory is required for review.');
 const setName=value.replication?.replSetName||'rs0';if(!/^[a-zA-Z0-9_-]{1,64}$/.test(setName))throw Error('Existing replication configuration needs review.');
 const changed=!value.replication?.replSetName;if(changed)doc.setIn(['replication','replSetName'],setName);
 return {database:connection.database,port:connection.port,dbPath,setName,changed,configuration:changed?doc.toString():text,configHash:createHash('sha256').update(text).digest('hex'),uri:replicaUri(uri,setName)};
}
export function replaceEnvValue(text,key,value){
 if(!/^[A-Z][A-Z0-9_]*$/.test(key)||typeof value!=='string'||value.includes('\0'))throw Error('Invalid environment value.');
 // dotenv expands escape sequences in double quotes. Use Windows-compatible forward slashes for path settings.
 const normalized=/(?:_DIR|_PATH|_FILE)$/.test(key)?value.replaceAll('\\','/'):value;
 const line=`${key}=${JSON.stringify(normalized)}`,pattern=new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`,'gm'),matches=[...text.matchAll(pattern)];if(matches.length>1)throw Error(`Duplicate ${key} entries require review.`);return matches.length?text.replace(pattern,()=>line):text.replace(/\s*$/,'')+'\n'+line+'\n';
}
export function officeServerUrl(input){
 let u;try{u=new URL(input)}catch{throw Error('Enter the office address, including http:// or https://.')}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Use only the server origin, without credentials, paths or query parameters.');
 if(u.protocol==='http:'){
 const h=u.hostname.toLowerCase(),parts=h.split('.').map(Number),privateIp=parts.length===4&&parts.every(p=>Number.isInteger(p)&&p>=0&&p<=255)&&(parts[0]===10||parts[0]===127||parts[0]===192&&parts[1]===168||parts[0]===172&&parts[1]>=16&&parts[1]<=31);
 if(!(privateIp||h==='localhost'||/^[a-z0-9-]+(?:\.(?:local|lan))?$/.test(h)))throw Error('Plain HTTP is limited to private office addresses. Use HTTPS for other servers.');
 }
 return u.origin;
}
export function compatibleServer(info,version){return info?.product==='REMS'&&info.setupProtocol===SETUP_PROTOCOL&&String(info.version||'').split('.').slice(0,2).join('.')===String(version).split('.').slice(0,2).join('.')}
