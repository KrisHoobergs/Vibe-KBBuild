/**
 * Test de map-opslag, de upload-tickets en het herkennen van eigen
 * bestands-URL's, zonder database of server.
 *
 *   npm run test:opslag
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const map = mkdtempSync(path.join(os.tmpdir(), "kbbuild-opslag-"));
process.env.DATABASE_URL = "postgres://postgres:lokaal@localhost:54329/ongebruikt";
process.env.AUTH_DRIVER = "local";
process.env.STORAGE_DRIVER = "filesystem";
process.env.STORAGE_DIR = map;
process.env.BETTER_AUTH_SECRET = "test-".repeat(10);
process.env.SITE_URL = "http://localhost:3001";

const { filesystemStorage: fs } = await import("../src/lib/storage/filesystem");
const { maakTicket, controleerTicket } = await import("../src/lib/storage/ticket");
const { parseEigenBestandUrl } = await import("../src/lib/storage/paden");

try {
  const data = Buffer.from("0123456789abcdef");
  await fs.put!("articles", "articles/temp/test.png", data, "image/png", "u1");
  const vol = await fs.get("articles", "articles/temp/test.png");
  assert.equal(vol?.data.toString(), "0123456789abcdef");
  assert.equal(vol?.contentType, "image/png");
  assert.equal(vol?.grootte, 16);
  const deel = await fs.get("articles", "articles/temp/test.png", { start: 2, einde: 5 });
  assert.equal(deel?.data.toString(), "2345");
  assert.deepEqual(deel?.bereik, { start: 2, einde: 5 });
  const tot = await fs.get("articles", "articles/temp/test.png", { start: 10 });
  assert.equal(tot?.data.toString(), "abcdef");
  await assert.rejects(
    () => fs.put!("articles", "articles/temp/test.png", Buffer.from("ANDERS"), "image/png", "u1"),
    /EEXIST/
  );
  assert.equal((await fs.get("articles", "articles/temp/test.png"))?.data.toString(), "0123456789abcdef");
  assert.equal(await fs.get("articles", "articles/temp/bestaat-niet.png"), null);

  const slechtePaden = [
    "../etc/passwd.png",
    "articles/../../x.png",
    "articles\\..\\x.png",
    "articles/temp/x.png?x=1",
    "articles/%2e%2e/x.png",
  ];
  for (const slecht of slechtePaden) {
    assert.equal(await fs.get("articles", slecht), null, slecht);
    await assert.rejects(() => fs.put!("articles", slecht, data, "image/png", "u1"), /Ongeldig pad/, slecht);
  }
  console.log("✓ map-opslag: schrijven, lezen, bereik, nooit overschrijven, pad-trucs geweigerd");

  const t = maakTicket({ bucket: "articles", pad: "articles/temp/a.png", contentType: "image/png", maxGrootte: 100, userId: "u1" });
  assert.equal(controleerTicket(t)?.pad, "articles/temp/a.png");
  const [d, h] = t.split(".");
  const inhoud = JSON.parse(Buffer.from(d, "base64url").toString());
  const vervalst = Buffer.from(JSON.stringify({ ...inhoud, maxGrootte: 999999999 })).toString("base64url");
  assert.equal(controleerTicket(`${vervalst}.${h}`), null);
  assert.equal(controleerTicket(`${d}.${h.slice(0, -2)}AA`), null);
  assert.equal(controleerTicket(null), null);
  assert.equal(controleerTicket("onzin"), null);
  const verlopen = Buffer.from(JSON.stringify({ ...inhoud, verlooptOp: Date.now() - 1 })).toString("base64url");
  assert.equal(controleerTicket(`${verlopen}.${h}`), null);
  console.log("✓ tickets: echt geldig; vervalst, afgekapt, onzin en verlopen geweigerd");

  const site = "http://localhost:3001";
  assert.deepEqual(parseEigenBestandUrl("/api/bestanden/articles/articles/temp/a.png", site), {
    bucket: "articles",
    pad: "articles/temp/a.png",
  });
  assert.deepEqual(parseEigenBestandUrl(`${site}/api/bestanden/avatars/avatars/u/x.webp`, site), {
    bucket: "avatars",
    pad: "avatars/u/x.webp",
  });
  const slechteUrls = [
    "//evil.be/api/bestanden/articles/a/b.png",
    "https://evil.be/api/bestanden/articles/a/b.png",
    "/api/bestanden/articles/a/b.png?x",
    "/api/bestanden/geheim/a/b.png",
    "/api/bestanden/articles/a%2F..%2Fb.png",
    "/api/bestanden/articles/a/%5c..%5cb.png",
  ];
  for (const slecht of slechteUrls) {
    assert.equal(parseEigenBestandUrl(slecht, site), null, slecht);
  }
  console.log("✓ eigen-bestand-URL's: alleen eigen paden herkend");
} finally {
  rmSync(map, { recursive: true, force: true });
}
