import {updateUserSafely} from "../services/userUpdateService.js";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import { logActivity } from "../utils/activityLogger.js";

const USER_FIELDS = "_id username firstName lastName email role isActive lastLoginAt createdAt updatedAt";

const validatePassword = (password) => {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return null;
};

export const listUsers = async (_req, res, next) => {
  try {
    const status=_req.query?.status;
    if(status&&!["ACTIVE","INACTIVE"].includes(status))return res.status(400).json({success:false,message:"Choose a valid user status."});
    const users = await User.find(status?{isActive:status==="ACTIVE"}:{})
      .select(USER_FIELDS)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const {
      username,
      firstName,
      lastName,
      email,
      password,
      role = "STAFF",
      isActive = true
    } = req.body;

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError
      });
    }

    if (!username || !firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "Username, name and email are required."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      username,
      firstName,
      lastName,
      email,
      passwordHash,
      role,
      isActive
    });

    await logActivity({
      action: "USER_CREATION",
      req,
      userId: req.user._id,
      entityType: "User",
      entityId: user._id.toString(),
      metadata: { createdUserId: user._id.toString(), role: user.role }
    });

    res.status(201).json({
      success: true,
      message: "User created successfully.",
      data: user
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const changes = Object.fromEntries(["firstName", "lastName", "email", "role", "isActive"].filter(k => req.body[k] !== undefined).map(k => [k, req.body[k]]));
    if (req.body.password !== undefined) {
      const error = validatePassword(req.body.password);
      if (error) return res.status(400).json({success: false, message: error});
      changes.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    const user = await updateUserSafely(req.params.userId, req.user._id, changes);
    await logActivity({action: "USER_UPDATE", req, userId: req.user._id, entityType: "User", entityId: user._id.toString()});
    res.json({success: true, message: "User updated successfully.", data: user});
  } catch (error) {next(error);}
};
