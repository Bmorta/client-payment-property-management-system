import {Router} from 'express';
import {authenticate} from '../middleware/auth.js';
import {authorize} from '../middleware/authorize.js';
import {adminReviewData} from '../services/adminReviews.js';
import {resolveForfeitedCancellation} from '../controllers/adminReviewController.js';
const router=Router();router.use(authenticate,authorize('ADMIN'));
router.get('/',async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json({success:true,data:await adminReviewData()})}catch(e){next(e)}});
router.post('/cancellation/:caseId/resolve-forfeited',resolveForfeitedCancellation);
export default router;
