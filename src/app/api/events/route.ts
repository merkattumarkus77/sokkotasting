import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { handleApiError } from "@/lib/apiResponse";
import { CreateEventSchema } from "@/lib/apiSchemas";
import { createEvent } from "@/lib/events";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = CreateEventSchema.parse(await request.json());
    const eventId = await createEvent(body);
    return NextResponse.json({ eventId }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
