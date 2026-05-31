import { Request, Response } from 'express';
import userService from '../services/userService';
import { generateToken } from '../utils/jwt';
import logger from '../utils/logger';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ success: false, error: 'Username and password required' });
      return;
    }

    const authResult = await userService.authenticateUser(username, password);

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

// Demo girisi — kimlik bilgisi istemciye GOMULMEZ. Sunucu, DEMO_READONLY_USER_ID
// hesabi icin parolasiz token uretir (hesap zaten salt-okunur kilitli, bkz.
// middleware/demoReadonly). user_id ile calisir → kullanici adi degisse bile gecerli.
// DEMO_READONLY_USER_ID bos ise uc devre disidir (404). Rate-limit route'ta (authLimiter).
export async function demoLogin(_req: Request, res: Response): Promise<void> {
  try {
    const demoId = process.env.DEMO_READONLY_USER_ID || '';
    if (!demoId) {
      res.status(404).json({ success: false, error: 'Demo girişi etkin değil' });
      return;
    }

    const user = await userService.getUserProfile(demoId);
    if (!user) {
      res.status(404).json({ success: false, error: 'Demo hesabı bulunamadı' });
      return;
    }

    const token = generateToken({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      role_name: user.role?.role_name,
    });

    logger.info('Demo login issued');

    res.json({
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
  } catch (error) {
    logger.error('Demo login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      res.status(400).json({ success: false, error: 'Username, email and password required' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, error: 'Invalid email format' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
      return;
    }

    // Yeni kullanicilar salt-okunur "stakeholder" olarak baslar (henuz hicbir ciftlige
    // erisimi yok). Ilk ciftligini olusturunca createFarm onu "farmer"a yukseltir; davet
    // koduyla katilirsa stakeholder kalir. Rol kayit ekraninda secilmez.
    const resolvedRoleId = await userService.getRoleIdByName("stakeholder");

    const user = await userService.createUser({
      username,
      email,
      password,
      role_id: resolvedRoleId,
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

    // Generic error for both unique-constraint violations AND unexpected failures —
    // prevents username/email enumeration via differential responses.
    if (error.code === 'P2002') {
      res.status(400).json({ success: false, error: 'Bu kullanıcı adı veya e-posta zaten kullanımda' });
      return;
    }

    if (error.code === 'P2003') {
      res.status(400).json({ success: false, error: 'Geçersiz rol. Lütfen tekrar deneyin.' });
      return;
    }

    res.status(500).json({ success: false, error: 'Internal server error', debug: String(error) });
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
        dataset_consent: profile.dataset_consent,
      },
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export async function updateDatasetConsent(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { consent } = req.body;
    if (typeof consent !== 'boolean') {
      res.status(400).json({ success: false, error: 'consent must be boolean' });
      return;
    }

    const updated = await userService.updateDatasetConsent(userId, consent);
    res.json({ success: true, data: { dataset_consent: updated.dataset_consent } });
  } catch (error) {
    logger.error('Update dataset consent error:', error);
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

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
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

// PATCH /me — kullanici adi ve/veya e-postayi gunceller. Mevcut sifre dogrulamasi
// ZORUNLU (email-only degisiklikte bile: email-rebind -> sifre-sifirlama ile hesap
// ele gecirmeyi engeller). Username degisirse yeni token + user doner (mobil saklanan
// user'dan username okudugu icin tazelenmeli). Sifre degisikligi ayri: /change-password.
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.user_id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'User not authenticated' });
      return;
    }

    const { username, email, currentPassword } = req.body;

    if (username === undefined && email === undefined) {
      res.status(400).json({ success: false, error: 'No fields to update' });
      return;
    }

    if (!currentPassword) {
      res.status(400).json({ success: false, error: 'Current password required' });
      return;
    }

    // Trim + bos reddet + uzunluk siniri (DB: username VarChar(100), email VarChar(255)).
    const updates: { username?: string; email?: string } = {};

    if (username !== undefined) {
      const trimmed = String(username).trim();
      if (!trimmed) {
        res.status(400).json({ success: false, error: 'Username cannot be empty' });
        return;
      }
      if (trimmed.length > 100) {
        res.status(400).json({ success: false, error: 'Username too long' });
        return;
      }
      updates.username = trimmed;
    }

    if (email !== undefined) {
      const trimmed = String(email).trim();
      if (!trimmed) {
        res.status(400).json({ success: false, error: 'Email cannot be empty' });
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed) || trimmed.length > 255) {
        res.status(400).json({ success: false, error: 'Invalid email format' });
        return;
      }
      updates.email = trimmed;
    }

    const profile = await userService.getUserProfile(userId);
    if (!profile) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Mevcut sifreyi dogrula (changePassword ile ayni desen).
    const authResult = await userService.authenticateUser(profile.username, currentPassword);
    if (!authResult.authenticated) {
      res.status(401).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    const updated = await userService.updateUserProfile(userId, updates);
    logger.info(`Profile updated for user: ${updated.username}`);

    const usernameChanged =
      updates.username !== undefined && updates.username !== profile.username;

    const responseData: {
      username: string;
      email: string;
      token?: string;
      user?: { user_id: string; username: string; email: string; role: unknown };
    } = {
      username: updated.username,
      email: updated.email,
    };

    // Username degisince token icindeki username bayatlar -> yeni token + user uret.
    if (usernameChanged) {
      responseData.token = generateToken({
        user_id: updated.user_id,
        username: updated.username,
        email: updated.email,
        role_name: updated.role?.role_name,
      });
      responseData.user = {
        user_id: updated.user_id,
        username: updated.username,
        email: updated.email,
        role: updated.role,
      };
    }

    res.json({ success: true, data: responseData });
  } catch (error: any) {
    logger.error('Update profile error:', error);
    // Generic error — username/email enumeration'i engeller (register ile ayni mesaj).
    if (error.code === 'P2002') {
      res.status(409).json({ success: false, error: 'Bu kullanıcı adı veya e-posta zaten kullanımda' });
      return;
    }
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

export default { login, demoLogin, register, getProfile, changePassword, updateProfile, updateDatasetConsent };
