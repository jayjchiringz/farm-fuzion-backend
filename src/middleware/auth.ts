/* eslint-disable max-len */
/* eslint-disable valid-jsdoc */
// farmfuzion-backend/functions/src/middleware/auth.ts
import {Request, Response, NextFunction} from "express";
import jwt, {JsonWebTokenError, TokenExpiredError} from "jsonwebtoken";

// Define the user interface for the request - already exported
export interface RequestUser {
  id: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  roles: string[];
  role?: string;
  group_id?: string;
  iat?: number;
  exp?: number;
}

// Define custom request type with user property - already exported
export interface AuthRequest extends Request {
  user?: RequestUser;
}

// AuthUser interface for JWT payload - already exported
export interface AuthUser {
  user_id?: string;
  id?: string;
  email: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  roles?: string[];
  role?: string;
  group_id?: string;
  iat?: number;
  exp?: number;
}

// Type guard to check if error is JWT error
const isJWTError = (error: unknown): error is JsonWebTokenError | TokenExpiredError => {
  return error instanceof JsonWebTokenError || error instanceof TokenExpiredError;
};

/**
 * Middleware to authenticate JWT tokens
 * Expects Authorization header: Bearer <token>
 */
export const authenticateJWT = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({error: "No authorization token provided"});
      return;
    }

    // Check if it's a Bearer token
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      res.status(401).json({error: "Invalid authorization format. Use: Bearer <token>"});
      return;
    }

    const token = parts[1];
    const JWT_SECRET = process.env.JWT_SECRET;

    if (!JWT_SECRET) {
      console.error("❌ JWT_SECRET not configured");
      res.status(500).json({error: "Server configuration error"});
      return;
    }

    try {
      // Verify and decode the token
      const decoded = jwt.verify(token, JWT_SECRET, {
        algorithms: ["HS256"],
      }) as AuthUser;

      // Create user object with proper typing
      const user: RequestUser = {
        id: decoded.user_id || decoded.id || "",
        email: decoded.email,
        username: decoded.username,
        first_name: decoded.first_name,
        last_name: decoded.last_name,
        roles: decoded.roles || (decoded.role ? [decoded.role] : []),
        role: decoded.role || (decoded.roles?.[0]),
        group_id: decoded.group_id,
      };

      // Attach user info to request using type assertion
      (req as AuthRequest).user = user;

      console.log(`🔐 Authenticated user: ${user.email} (ID: ${user.id})`);
      next();
    } catch (jwtError) {
      if (isJWTError(jwtError)) {
        if (jwtError instanceof TokenExpiredError) {
          res.status(401).json({error: "Token has expired"});
          return;
        }
        if (jwtError instanceof JsonWebTokenError) {
          res.status(401).json({error: "Invalid token"});
          return;
        }
      }
      console.error("❌ JWT verification error:", jwtError);
      res.status(401).json({error: "Authentication failed"});
      return;
    }
  } catch (error) {
    console.error("❌ Authentication middleware error:", error);
    res.status(500).json({error: "Internal server error"});
  }
};

/**
 * Optional middleware: Only allow users with specific roles
 * @param allowedRoles - Array of role names that are allowed to access
 */
export const requireRole = (allowedRoles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthRequest).user;

    if (!user) {
      res.status(401).json({error: "User not authenticated"});
      return;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const userRoles = user.roles || (user.role ? [user.role] : []);

    const hasRole = userRoles.some((role: string) =>
      roles.some((allowedRole) => role.toLowerCase() === allowedRole.toLowerCase())
    );

    if (!hasRole) {
      res.status(403).json({
        error: "Access denied",
        required_roles: roles,
        user_roles: userRoles,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to get user from token without failing if no token
 * Useful for routes that can work with or without authentication
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      next();
      return;
    }

    const token = parts[1];
    const JWT_SECRET = process.env.JWT_SECRET;

    if (JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, {
          algorithms: ["HS256"],
        }) as AuthUser;

        // Create user object with proper typing
        const user: RequestUser = {
          id: decoded.user_id || decoded.id || "",
          email: decoded.email,
          username: decoded.username,
          first_name: decoded.first_name,
          last_name: decoded.last_name,
          roles: decoded.roles || (decoded.role ? [decoded.role] : []),
          role: decoded.role || (decoded.roles?.[0]),
          group_id: decoded.group_id,
        };

        (req as AuthRequest).user = user;
        console.log(`🔐 Optional auth: User ${user.email} authenticated`);
      } catch {
        // Invalid token - just continue without user
        console.log("Optional auth: Invalid token provided, continuing without user");
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth error:", error);
    next();
  }
};

/**
 * Helper to extract user ID from request
 */
export const getUserId = (req: Request): string | null => {
  const user = (req as AuthRequest).user;
  return user?.id || null;
};

/**
 * Helper to extract user email from request
 */
export const getUserEmail = (req: Request): string | null => {
  const user = (req as AuthRequest).user;
  return user?.email || null;
};

/**
 * Helper to check if user has a specific role
 */
export const userHasRole = (req: Request, roleName: string): boolean => {
  const user = (req as AuthRequest).user;
  if (!user) return false;
  const userRoles = user.roles || (user.role ? [user.role] : []);
  return userRoles.some((r: string) => r.toLowerCase() === roleName.toLowerCase());
};

/**
 * Helper to get the full user object
 */
export const getUser = (req: Request): RequestUser | undefined => {
  return (req as AuthRequest).user;
};
