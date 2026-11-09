import mongoose from 'mongoose';
import User from '../models/User.js';
import {verifyAccessToken} from '../utils/jwt.js';
export const authenticate=async(req,res,next)=>{
 const header=req.get('authorization')||'',[scheme,token]=header.split(' ');
 if(scheme!=='Bearer'||!token)return res.status(401).json({success:false,message:'Authentication required.'});
 let payload;try{payload=verifyAccessToken(token);if(!mongoose.isValidObjectId(payload.sub))throw new Error('Invalid subject')}catch{return res.status(401).json({success:false,message:'Invalid or expired authentication token.'})}
 try{
  const user=await User.findById(payload.sub).select('_id username firstName lastName email role isActive lastLoginAt createdAt updatedAt');
  if(!user||!user.isActive)return res.status(401).json({success:false,message:'Your account is inactive or no longer exists.'});
  req.user=user;next();
 }catch(error){console.error('Session lookup unavailable:',error.name);return res.status(503).json({success:false,message:'Session verification is temporarily unavailable. Please retry when the database connection is restored.'})}
};
