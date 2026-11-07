import {Router} from 'express';
import {authenticate} from '../middleware/auth.js';
import {listReport} from '../controllers/listReportController.js';
const router=Router();router.use(authenticate);router.get('/:module',listReport);export default router;
