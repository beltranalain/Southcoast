import "server-only";

// Firebase Admin SDK for server-side use (API routes, verifying admin tokens,
// writing content). Guarded so the build succeeds without credentials.

import {
  getApps,
  initializeApp,
  cert,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

export const adminConfigured = Boolean(projectId && clientEmail && privateKey);

let adminApp: App | null = null;

export function getAdminApp(): App | null {
  if (!adminConfigured) return null;
  if (!adminApp) {
    try {
      adminApp = getApps().length
        ? getApps()[0]
        : initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
    } catch (e) {
      // Almost always a malformed FIREBASE_ADMIN_PRIVATE_KEY (e.g. wrapped in
      // quotes on the host). Degrade gracefully instead of 500-ing routes.
      console.error(
        "Firebase Admin init failed - check FIREBASE_ADMIN_PRIVATE_KEY (no surrounding quotes, keep the \\n):",
        (e as Error)?.message
      );
      return null;
    }
  }
  return adminApp;
}

export function getAdminAuth(): Auth | null {
  const a = getAdminApp();
  return a ? getAuth(a) : null;
}

export function getAdminDb(): Firestore | null {
  const a = getAdminApp();
  return a ? getFirestore(a) : null;
}
