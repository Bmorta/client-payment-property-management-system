// Structured guidance only; never retries or approves the blocked operation.
export function backupRequirement(message, operation='financial-maintenance') {
 return Object.assign(new Error(message), {statusCode:409, maintenance:{code:'BACKUP_REQUIREMENT',operation,path:'/database-maintenance'}});
}
export function databaseReadinessFail(message){throw Object.assign(new Error(message),{statusCode:409,maintenance:{code:'DATABASE_READINESS',operation:'transaction-support',path:'/database-maintenance'}})}

export function contractIndexRequirement(message){return Object.assign(new Error(message),{statusCode:409,maintenance:{code:'CONTRACT_INDEX_UPGRADE',operation:'active-contract-index',path:'/database-maintenance'}})}
