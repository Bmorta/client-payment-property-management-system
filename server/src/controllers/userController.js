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
    const users = await User.find()
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
    const { userId } = req.params;
    const { firstName, lastName, email, role, isActive, password } = req.body;

    const user = await User.findById(userId).select("+passwordHash");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    if (req.user._id.toString() === user._id.toString() && isActive === false) {
      return res.status(400).json({
        success: false,
        message: "You cannot deactivate your own account."
      });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    if (password !== undefined) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({
          success: false,
          message: passwordError
        });
      }

      user.passwordHash = await bcrypt.hash(password, 12);
    }

    await user.save();

    await logActivity({
      action: "USER_UPDATE",
      req,
      userId: req.user._id,
      entityType: "User",
      entityId: user._id.toString()
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: user
    });
  } catch (error) {
    next(error);
  }
};
