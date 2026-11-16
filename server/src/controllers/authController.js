import bcrypt from 'bcrypt';
import User from "../models/User.js";
import { signAccessToken } from "../utils/jwt.js";
import { logActivity } from "../utils/activityLogger.js";

export const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body||{};

    if (typeof identifier!=='string'||typeof password!=='string'||!identifier.trim()||!password||identifier.length>160||password.length>4096) {
      return res.status(400).json({
        success: false,
        message: "Username/email and password are required.",
        errors: {
          identifier: !identifier ? "Enter your username or email." : undefined,
          password: !password ? "Enter your password." : undefined
        }
      });
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();

    const user = await User.findOne({
      $or: [
        { username: normalizedIdentifier },
        { email: normalizedIdentifier }
      ]
    }).select("+passwordHash");

    const valid=user?await user.comparePassword(password):await bcrypt.compare(password,'$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxQzC4Kc5MpU2qhATtQO1zWwZ8a');
    if (!user || !valid || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password."
      });
    }

    req.user = user;
    user.lastLoginAt = new Date();
    await user.save();

    const token = signAccessToken(user);

    await logActivity({
      action: "LOGIN",
      req,
      userId: user._id,
      entityType: "User",
      entityId: user._id.toString()
    });

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: user.toJSON()
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: req.user }
  });
};

export const logout = async (req, res, next) => {
  try {
    await logActivity({
      action: "LOGOUT",
      req,
      userId: req.user._id,
      entityType: "User",
      entityId: req.user._id.toString()
    });

    res.status(200).json({
      success: true,
      message: "Logout recorded."
    });
  } catch (error) {
    next(error);
  }
};
