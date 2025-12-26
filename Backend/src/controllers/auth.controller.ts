import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import userService from '../services/userService';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

interface JwtPayload {
  user_id: string;
  username: string;
  email: string;
  role_name?: string;
}

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload as any, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      res.status(400).json({ success: false, error: 'Username/email and password required' });
      return;
    }

    const authResult = await userService.authenticateUser(identifier, password);

    if (!authResult.authenticated || !authResult.user) {
      res.status(401).json({ success: false, error: authResult.error || 'Authentication failed' });
      return;
    }

    const token = generateToken({
      user_id: authResult.user.user_id,
      username: authResult.user.username,
      email: authResult.user.email,
      role_name: authResult.user.role?.role_name,
    });

    logger.info(`User logged in: ${authResult.user.username}`);

    res.json({
      success: true,
      data: {
        token,
        user: {
          user_id: authResult.user.user_id,
          username: authResult.user.username,
          email: authResult.user.email,
          role: authResult.user.role,
        },
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password, role_id } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ success: false, error: 'Username, email, and password required' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, error: 'Invalid email format' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      return;
    }

    const user = await userService.createUser({
      username,
      email,
      password,
      role_id: role_id || 2,
    });

    logger.info(`New user registered: ${user.username}`);

    const token = generateToken({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role_name: user.role?.role_name,
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (error: any) {
    logger.error('Registration error:', error);

    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      res.status(409).json({ success: false, error: `${field} already exists` });
      return;
    }

    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const profile = await userService.getUserProfile(userId);

    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        user_id: profile.user_id,
        username: profile.username,
        email: profile.email,
        role: profile.role,
        created_at: profile.created_at,
        last_login: profile.last_login,
        farms: profile.farms,
        unread_alerts: profile.alerts?.length || 0,
      },
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    if (!currentPassword || !newPassword) {
      res.status(400).json({ success: false, error: 'Current and new password required' });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
      return;
    }

    const profile = await userService.getUserProfile(userId);
    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const authResult = await userService.authenticateUser(profile.username, currentPassword);
    if (!authResult.authenticated) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    await userService.updateUserPassword(userId, newPassword);
    logger.info(`Password changed for user: ${profile.username}`);

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default { login, register, getProfile, changePassword };
