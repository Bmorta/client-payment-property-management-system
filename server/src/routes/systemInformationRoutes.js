import {Router} from 'express';
import {fileURLToPath} from 'node:url';
import {authenticate} from '../middleware/auth.js';
import {authorize} from '../middleware/authorize.js';
import {systemInformation} from '../services/systemInformation.js';
const router=Router();router.use(authenticate);
router.get('/',async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json({success:true,data:await systemInformation(req.user.role)})}catch(e){next(e)}});
router.get('/specifications',authorize('ADMIN'),(req,res,next)=>{res.set('Cache-Control','private, no-store');res.download(fileURLToPath(new URL('../assets/docs/rems-system-specifications.pdf',import.meta.url)),'REMS-System-Specifications.pdf',e=>{if(e)next(e)})});
export default router;
