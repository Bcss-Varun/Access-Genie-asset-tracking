import type { ModuleKey, PublicUser, RoleId } from '@access-genie/shared';

/**
 * `req.auth` is populated by the `requireAuth` middleware and read by the RBAC
 * guards, controllers and the audit trail. Declaring it here means a controller
 * that reads `req.auth` without an auth guard in front of it is a type error,
 * not a runtime crash.
 */
declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: PublicUser;
        roleId: RoleId;
        modules: ModuleKey[];
      };
      /** Correlates the access log, the error envelope and the audit row. */
      requestId: string;
    }
  }
}

export {};
