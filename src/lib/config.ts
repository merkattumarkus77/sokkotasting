import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppConfig } from "@/lib/types";

const CONFIG_DOC_PATH = ["config", "app"] as const;

export async function getAppConfig(): Promise<AppConfig | null> {
  const snapshot = await getDoc(doc(db, ...CONFIG_DOC_PATH));
  if (!snapshot.exists()) return null;
  return snapshot.data() as AppConfig;
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const config = await getAppConfig();
  if (!config) return false;
  return candidate === config.password;
}
