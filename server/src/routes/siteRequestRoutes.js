import {Router} from 'express';
import {authenticate} from '../middleware/auth.js';
import {authorize} from '../middleware/authorize.js';
import {auditMutation} from '../middleware/auditMutation.js';
import {siteRequestOptions,siteRequestTypes,listSiteRequests,getSiteRequest,postSiteRequest,actSiteRequest,addSiteAttachment,downloadSiteAttachment,exportSiteRequests} from '../controllers/siteRequestController.js';
const router=Router();router.use(authenticate,auditMutation);router.get('/options',siteRequestOptions);router.put('/types',authorize('ADMIN'),siteRequestTypes);router.get('/export',exportSiteRequests);router.get('/',listSiteRequests);router.post('/',authorize('ADMIN','STAFF'),postSiteRequest);router.get('/:id',getSiteRequest);router.post('/:id/actions',authorize('ADMIN','STAFF'),actSiteRequest);router.post('/:id/attachments',authorize('ADMIN','STAFF'),addSiteAttachment);router.get('/:id/attachments/:attachmentId',downloadSiteAttachment);export default router;
