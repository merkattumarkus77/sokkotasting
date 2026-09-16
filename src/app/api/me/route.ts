import { NextResponse } from "next/server";
import { getSession } from "@/lib/apiAuth";

// SPEC 2.3: lets the browser read its own decoded session (without the
// signature) to know its sessionId for duplicate-login detection, and the
// server's clock (serverTime) to correct any client clock drift (SPEC 9).
export async function GET() {
  const session = await getSession();
  return NextResponse.json({ session, serverTime: Date.now() });
}
