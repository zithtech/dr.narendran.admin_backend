import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase-admin/app', () => {
  let mockApps: any[] = [];
  return {
    initializeApp: vi.fn((config) => {
      const app = { name: '[DEFAULT]', options: config };
      mockApps.push(app);
      return app;
    }),
    getApps: vi.fn(() => mockApps),
    cert: vi.fn((opts) => ({ type: 'cert', ...opts })),
    applicationDefault: vi.fn(() => ({ type: 'applicationDefault' })),
    _reset: () => {
      mockApps = [];
    },
  };
});

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn((app) => ({ app, name: 'mockMessaging' })),
}));

vi.mock('@/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Firebase Configuration & Singleton Service', () => {
  beforeEach(async () => {
    vi.resetModules();
    const appModule = await import('firebase-admin/app');
    (appModule as any)._reset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('1. formats escaped \\n in private key to real newline characters', async () => {
    const { formatFirebasePrivateKey } = await import('@/config/firebase.js');

    const escaped = '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC5\\n-----END PRIVATE KEY-----\\n';
    const formatted = formatFirebasePrivateKey(escaped);

    expect(formatted).not.toContain('\\n');
    expect(formatted).toContain('\n');
    expect(formatted.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
    expect(formatted.includes('-----END PRIVATE KEY-----')).toBe(true);
  });

  it('2. strips enclosing quotes and whitespace from private key', async () => {
    const { formatFirebasePrivateKey } = await import('@/config/firebase.js');

    const quoted = '"-----BEGIN PRIVATE KEY-----\\nKEY\\n-----END PRIVATE KEY-----\\n"';
    const formatted = formatFirebasePrivateKey(quoted);

    expect(formatted).toBe('-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n');
  });

  it('3. handles null and undefined private key safely', async () => {
    const { formatFirebasePrivateKey } = await import('@/config/firebase.js');

    expect(formatFirebasePrivateKey(null)).toBe('');
    expect(formatFirebasePrivateKey(undefined)).toBe('');
    expect(formatFirebasePrivateKey('')).toBe('');
  });

  it('4. initializes Firebase Admin app once with explicit cert credentials', async () => {
    vi.doMock('@/config/env.js', () => ({
      env: {
        FIREBASE_PROJECT_ID: 'test-doctor-app',
        FIREBASE_CLIENT_EMAIL: 'test-admin@test-doctor-app.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n',
        GOOGLE_APPLICATION_CREDENTIALS: '',
        IS_TEST: true,
      },
    }));

    const { initializeFirebase, getFirebaseApp, isFirebaseConfigured, getFirebaseHealth } =
      await import('@/config/firebase.js');

    const app = initializeFirebase();

    expect(app).toBeDefined();
    expect(getFirebaseApp()).toBe(app);
    expect(isFirebaseConfigured()).toBe(true);

    const health = getFirebaseHealth();
    expect(health.configured).toBe(true);
    expect(health.status).toBe('ready');
    // Ensure health never contains secrets
    expect((health as any).privateKey).toBeUndefined();
    expect((health as any).clientEmail).toBeUndefined();
  });

  it('5. returns existing app when initializeFirebase is called multiple times', async () => {
    vi.doMock('@/config/env.js', () => ({
      env: {
        FIREBASE_PROJECT_ID: 'test-doctor-app',
        FIREBASE_CLIENT_EMAIL: 'test-admin@test-doctor-app.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n',
        GOOGLE_APPLICATION_CREDENTIALS: '',
        IS_TEST: true,
      },
    }));

    const { initializeFirebase, getFirebaseApp } = await import('@/config/firebase.js');

    const app1 = initializeFirebase();
    const app2 = initializeFirebase();
    const app3 = getFirebaseApp();

    expect(app1).toBe(app2);
    expect(app2).toBe(app3);
  });

  it('6. provides Firebase Messaging instance via getFirebaseMessaging()', async () => {
    vi.doMock('@/config/env.js', () => ({
      env: {
        FIREBASE_PROJECT_ID: 'test-doctor-app',
        FIREBASE_CLIENT_EMAIL: 'test-admin@test-doctor-app.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nTEST_KEY\\n-----END PRIVATE KEY-----\\n',
        GOOGLE_APPLICATION_CREDENTIALS: '',
        IS_TEST: true,
      },
    }));

    const { getFirebaseMessaging } = await import('@/config/firebase.js');

    const messaging = getFirebaseMessaging();
    expect(messaging).toBeDefined();
    expect((messaging as any).name).toBe('mockMessaging');
  });

  it('7. handles missing Firebase configuration gracefully returning null without crashing', async () => {
    vi.doMock('@/config/env.js', () => ({
      env: {
        FIREBASE_PROJECT_ID: '',
        FIREBASE_CLIENT_EMAIL: '',
        FIREBASE_PRIVATE_KEY: '',
        GOOGLE_APPLICATION_CREDENTIALS: '',
        IS_TEST: true,
      },
    }));

    const { initializeFirebase, isFirebaseConfigured, getFirebaseHealth } =
      await import('@/config/firebase.js');

    const app = initializeFirebase();
    expect(app).toBeNull();
    expect(isFirebaseConfigured()).toBe(false);

    const health = getFirebaseHealth();
    expect(health.configured).toBe(false);
    expect(health.status).toBe('not_configured');
  });
});
