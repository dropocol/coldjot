import { auth } from "@/auth";
import { NextResponse } from "next/server";

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
const APOLLO_API_URL = "https://api.apollo.io/api/v1";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!APOLLO_API_KEY) {
    return NextResponse.json(
      { error: "Apollo API key not configured" },
      { status: 500 }
    );
  }

  try {
    const { _apolloContactId, domain, firstName, lastName } =
      await request.json();

    const response = await fetch(`${APOLLO_API_URL}/people/match`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Cache-Control": "no-cache",
        "Content-Type": "application/json",
        "x-api-key": APOLLO_API_KEY,
      },
      body: JSON.stringify({
        api_key: APOLLO_API_KEY,
        domain: domain,
        first_name: firstName,
        last_name: lastName,
        reveal_personal_emails: true,
      }),
    });

    if (!response.ok) {
      throw new Error("Apollo API request failed");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Apollo enrichment failed:", error);
    return NextResponse.json(
      { error: "Failed to enrich contact" },
      { status: 500 }
    );
  }
}
