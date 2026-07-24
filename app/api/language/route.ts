import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") === "zh" ? "zh" : "en";
  const referer = request.headers.get("referer");
  const previous = referer ? new URL(referer) : null;
  const destination = new URL(previous ? `${previous.pathname}${previous.search}` : "/earnings", url.origin);
  const response = NextResponse.redirect(destination);
  response.cookies.set("lang", lang, { maxAge: 31_536_000, path: "/", sameSite: "lax" });
  return response;
}
