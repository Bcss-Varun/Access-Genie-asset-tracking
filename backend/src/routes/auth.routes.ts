import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { authLimiter, requireAuth, validate } from '../middleware/index.js';
import { changePasswordSchema, loginSchema } from '../validators/auth.validator.js';

const router = Router();

// Public — rate limited, because these are the endpoints worth brute-forcing.
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/personas', controller.personas);

// Authenticated
router.get('/me', requireAuth, controller.me);
router.post('/logout-all', requireAuth, controller.logoutEverywhere);
router.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), controller.changePassword);

// The devices signed in as this user, from the refresh tokens actually issued.
router.get('/sessions', requireAuth, controller.sessions);
router.post('/sessions/:id/revoke', requireAuth, controller.revokeOneSession);

export default router;
