import jwt from "jsonwebtoken";

export const signAccessToken = (user) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required.");
  }

  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role
    },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d"
    }
  );
};

export const verifyAccessToken = (token) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is required.");
  }

  return jwt.verify(token, secret);
};
