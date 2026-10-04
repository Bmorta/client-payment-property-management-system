import User from "../models/User.js";
import { signAccessToken } from "../utils/jwt.js";
import { logActivity } from "../utils/activityLogger.js";

export const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
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

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid username/email or password."
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact an administrator."
      });
    }

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
