import { cookies } from "next/headers";
import { dictionaries, type Dict, type Lang } from "./dict";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get("lang")?.value === "zh" ? "zh" : "en";
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: dictionaries[lang] };
}
