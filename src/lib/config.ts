import "server-only";
import bcrypt from "bcryptjs";
import { adminDb } from "@/lib/firebaseAdmin";
import type { AppConfig } from "@/lib/types";

const CONFIG_DOC_PATH = ["config", "appConfig"] as const;

export async function getAppConfig(): Promise<AppConfig | null> {
  const snapshot = await adminDb.doc(CONFIG_DOC_PATH.join("/")).get();
  if (!snapshot.exists) return null;
  return snapshot.data() as AppConfig;
}

export async function checkAdminPassword(username: string, password: string): Promise<boolean> {
  const config = await getAppConfig();
  if (!config) return false;
  if (username !== config.adminUsername) return false;
  return bcrypt.compare(password, config.adminPasswordHash);
}

export async function checkEventPassword(password: string): Promise<boolean> {
  const config = await getAppConfig();
  if (!config) return false;
  return bcrypt.compare(password, config.eventPasswordHash);
}
