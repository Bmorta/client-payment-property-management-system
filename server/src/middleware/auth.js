import User from "../models/User.js";
import { verifyAccessToken } from "../utils/jwt.js";

export const authenticate = async (req, res, next) => {
  try {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.sub).select(
      "_id username firstName lastName email role isActive lastLoginAt createdAt updatedAt"
    );

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account is inactive or no longer exists."
      });
    }

    req.user = user;
    next();
  } catch (_error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token."
    });
  }
};
