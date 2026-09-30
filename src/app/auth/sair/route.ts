import { NextResponse, type NextRequest } from "next/server";
import { criarClienteSupabase } from "@/server/supabase/servidor";

export async function POST(request: NextRequest) {
  const supabase = await criarClienteSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
