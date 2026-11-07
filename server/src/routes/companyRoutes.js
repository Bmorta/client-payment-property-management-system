import {Router} from 'express';
import {authenticate} from '../middleware/auth.js';
import {authorize} from '../middleware/authorize.js';
import {auditMutation} from '../middleware/auditMutation.js';
import {listCompanies,createCompany,updateCompany} from '../controllers/companyController.js';
const router=Router();router.use(authenticate,auditMutation);router.get('/',listCompanies);router.post('/',authorize('ADMIN'),createCompany);router.patch('/:id',authorize('ADMIN'),updateCompany);export default router;
