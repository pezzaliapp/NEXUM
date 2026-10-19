// GDELT IN THE BROWSER (2026-10-18): the browser's requests to data.gdeltproject.org answered from REAL files of
// 17 October 2026 (tests/fixtures/gdelt-20261017, unmodified), or refused ("down"). A slot without a fixture answers 404
// as GDELT does for a missing file. Every request is counted: the feed must ask only on demand.
import fs from "node:fs";
import type { Page } from "@playwright/test";

const FX = new URL("./fixtures/gdelt-20261017/", import.meta.url);

export async function gdelt(page: Page, mode: "fixtures" | "down" = "fixtures") {
  const asked: string[] = [];
  await page.route("https://data.gdeltproject.org/**", async (route) => {
    const u = new URL(route.request().url()), name = u.pathname.split("/").pop()!;
    asked.push(name);
    if (mode === "down") return route.abort("connectionrefused");
    const f = new URL(name, FX);
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" }, body: "not found" });
    return route.fulfill({ status: 200, body: fs.readFileSync(f),
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": name.endsWith(".txt") ? "text/plain" : "application/zip" } });
  });
  return asked;
}
