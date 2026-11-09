import {Router} from 'express';
import {authenticate} from '../middleware/auth.js';
import {authorize} from '../middleware/authorize.js';
import {auditMutation} from '../middleware/auditMutation.js';
import {saveOfficePayout,officePayoutAction,listOfficePayouts,getOfficePayout} from '../controllers/officePayoutController.js';
const router=Router();router.use(authenticate,authorize('ADMIN','STAFF'),auditMutation);router.get('/',listOfficePayouts);router.post('/',saveOfficePayout);router.get('/:id',getOfficePayout);router.put('/:id',saveOfficePayout);router.post('/:id/actions',officePayoutAction);export default router;
