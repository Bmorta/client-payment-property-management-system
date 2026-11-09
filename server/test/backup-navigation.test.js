import test from 'node:test';
import assert from 'node:assert/strict';
import {safeWorkflowReturn,backupWorkflowUrl} from '../../client/src/utils/backupNavigation.js';
import {backupRequirement} from '../src/services/backupRequirement.js';
test('backup workflow return links retain local context and reject external, recursive or unsafe paths',()=>{
 const path='/historical-migration?advanced=1&tab=Configuration#review';assert.equal(safeWorkflowReturn(path),path);assert.equal(backupWorkflowUrl(path),'/database-maintenance?returnTo='+encodeURIComponent(path));
 for(const input of ['https://example.com','//example.com','/\\example.com','/login','/database-maintenance','/clients\n/other',null])assert.equal(safeWorkflowReturn(input),null);
});
test('backup failures supply structured UI guidance without approval or execution flags',()=>{
 const error=backupRequirement('Missing verified backup','historical-activation');assert.equal(error.statusCode,409);assert.deepEqual(error.maintenance,{code:'BACKUP_REQUIREMENT',operation:'historical-activation',path:'/database-maintenance'});assert.equal(error.confirm,undefined);
});
