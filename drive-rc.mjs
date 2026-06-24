import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1400 } });
const logs = [];
p.on("console", (m) => { const t=m.type(); if(t==="error") logs.push(`[error] ${m.text()}`); });
p.on("pageerror", (e) => logs.push(`[PAGEERROR] ${e.message} :: ${(e.stack||"").split("\n").slice(1,3).join(" | ")}`));
await p.goto("http://localhost:4321/resolution/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);
// expand the first several issue rows to reveal detail panels with "Run guided fix"
const toggles = p.locator('button[aria-expanded="false"]');
const n = Math.min(await toggles.count(), 12);
console.log("issue-row toggles found:", await toggles.count(), "(expanding up to", n, ")");
for (let i=0;i<n;i++){ try { await toggles.nth(i).click(); await p.waitForTimeout(80);} catch{} }
await p.waitForTimeout(400);
const rgf = p.getByRole("button", { name: /^Run guided fix$/ });
console.log("'Run guided fix' CTAs visible:", await rgf.count());
if (await rgf.count()) {
  await rgf.first().scrollIntoViewIfNeeded();
  await rgf.first().click();
  await p.waitForTimeout(800);
  console.log("guided dialog open:", await p.getByRole("dialog").count());
  await p.screenshot({ path: `${process.env.SC}/rc-1-dialog.png` });
  const start = p.getByRole("button", { name: /Start guided (fix|dry run)/i });
  console.log("Start button present:", await start.count());
  if (await start.count()) {
    await start.first().click();
    await p.waitForTimeout(5000);
    const txt = await p.locator('[role="dialog"]').innerText().catch(()=> "");
    console.log("RUN STREAMED?:", /Transcript|Triaging|Resolved|Tool Call|read_/.test(txt));
    console.log("dialog text (300):", JSON.stringify(txt.replace(/\s+/g," ").slice(0,300)));
    await p.screenshot({ path: `${process.env.SC}/rc-2-after.png` });
  }
} else {
  // fall back: maybe only "Fix"/"Ask AI" present — report what CTAs exist
  const fixBtns = await p.getByRole("button", { name: /^Fix$|Run guided fix|End-to-end fix|Ask AI|View runbook/ }).allInnerTexts().catch(()=>[]);
  console.log("CTAs present instead:", [...new Set(fixBtns)].slice(0,8));
}
console.log("=== ERRORS ==="); for (const l of logs.slice(-20)) console.log(l);
await b.close();
