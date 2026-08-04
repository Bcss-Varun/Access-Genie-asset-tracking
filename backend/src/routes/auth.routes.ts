import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { authLimiter, requireAuth, validate } from '../middleware/index.js';
import {
  changePasswordSchema,
  loginSchema,
  mfaCodeSchema,
  mfaPasswordSchema,
  updateProfileSchema,
  verifyMfaSchema,
} from '../validators/auth.validator.js';

const router = Router();

// Public — rate limited, because these are the endpoints worth brute-forcing.
router.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.get('/personas', controller.personas);

// The second half of a sign-in. Public and rate limited for the same reason
// `/login` is: it accepts a guessable six-digit code.
router.post('/mfa/verify', authLimiter, validate({ body: verifyMfaSchema }), controller.verifyMfa);

// Authenticated
router.get('/me', requireAuth, controller.me);
router.post('/logout-all', requireAuth, controller.logoutEverywhere);
router.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), controller.changePassword);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), controller.updateProfile);

// Enrolment. Two steps: mint a secret, then prove you scanned it.
router.get('/mfa', requireAuth, controller.mfaStatus);
router.post('/mfa/setup', requireAuth, controller.beginMfaSetup);
router.post('/mfa/enable', requireAuth, validate({ body: mfaCodeSchema }), controller.completeMfaSetup);
router.post('/mfa/disable', requireAuth, validate({ body: mfaPasswordSchema }), controller.disableMfa);
router.post('/mfa/recovery-codes', requireAuth, validate({ body: mfaPasswordSchema }), controller.regenerateRecoveryCodes);

// The devices signed in as this user, from the refresh tokens actually issued.
router.get('/sessions', requireAuth, controller.sessions);
router.post('/sessions/:id/revoke', requireAuth, controller.revokeOneSession);

export default router;
