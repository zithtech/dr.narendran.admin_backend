import { type App,applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import { env } from '@/config/env.js';
import { logger } from '@/lib/logger.js';

let firebaseApp: App | null = null;
let firebaseMessaging: Messaging | null = null;
let initAttempted = false;

/**
 * Clean and normalize private key formatting.
 * Replaces escaped '\n' with actual newline characters and trims whitespace.
 */
export function formatFirebasePrivateKey(key: string | undefined | null): string {
  if (!key) return '';
  let cleaned = key.trim();
  // Strip surrounding quotes if present
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  return cleaned.replace(/\\n/g, '\n');
}

/**
 * Initializes the Firebase Admin SDK singleton.
 * Uses environment credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
 * or falls back to GOOGLE_APPLICATION_CREDENTIALS / applicationDefault().
 */
export function initializeFirebase(): App | null {
  if (firebaseApp) {
    return firebaseApp;
  }

  // If already initialized by another module or SDK call
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    firebaseApp = existingApps[0];
    firebaseMessaging = getMessaging(firebaseApp);
    return firebaseApp;
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = env.FIREBASE_PRIVATE_KEY;
  const privateKey = formatFirebasePrivateKey(rawPrivateKey);

  const hasExplicitCredentials = Boolean(projectId && clientEmail && privateKey);
  const hasAppDefaultCredentials = Boolean(
    env.GOOGLE_APPLICATION_CREDENTIALS || process.env['GOOGLE_APPLICATION_CREDENTIALS'],
  );

  if (!hasExplicitCredentials && !hasAppDefaultCredentials) {
    if (!initAttempted && !env.IS_TEST) {
      logger.info(
        'Firebase Admin SDK credentials not configured in environment. Push notifications (FCM) are disabled.',
      );
    }
    initAttempted = true;
    return null;
  }

  try {
    if (hasExplicitCredentials) {
      firebaseApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      firebaseApp = initializeApp({
        credential: applicationDefault(),
      });
    }

    firebaseMessaging = getMessaging(firebaseApp);
    initAttempted = true;

    if (!env.IS_TEST) {
      logger.info(
        { projectId: projectId || 'application-default' },
        '[FCM] Firebase initialized',
      );
    }

    return firebaseApp;
  } catch (error: unknown) {
    initAttempted = true;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to initialize Firebase Admin SDK.',
    );
    return null;
  }
}

/**
 * Returns the active Firebase Admin App, initializing it if needed.
 */
export function getFirebaseApp(): App | null {
  if (!firebaseApp) {
    return initializeFirebase();
  }
  return firebaseApp;
}

/**
 * Returns the Firebase Messaging instance, initializing Firebase if needed.
 */
export function getFirebaseMessaging(): Messaging | null {
  if (!firebaseMessaging) {
    const app = getFirebaseApp();
    if (app) {
      firebaseMessaging = getMessaging(app);
    }
  }
  return firebaseMessaging;
}

/**
 * Check whether Firebase Admin SDK is currently configured and initialized.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(getFirebaseApp());
}

/**
 * Diagnostic status for health check reporting.
 * Never exposes secrets or private keys.
 */
export function getFirebaseHealth(): {
  configured: boolean;
  status: 'ready' | 'not_configured' | 'error';
  projectId?: string | undefined;
} {
  const app = getFirebaseApp();
  if (app) {
    return {
      configured: true,
      status: 'ready',
      projectId: env.FIREBASE_PROJECT_ID || app.options.projectId || undefined,
    };
  }

  const hasCredentials = Boolean(
    (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) ||
      env.GOOGLE_APPLICATION_CREDENTIALS,
  );

  return {
    configured: false,
    status: hasCredentials ? 'error' : 'not_configured',
  };
}
