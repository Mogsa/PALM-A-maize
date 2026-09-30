// Makes a fresh data folder with ResNet extracted and serves it on port 8765.
// PAPERBOARD_BIN and PAPERBOARD_FIXTURE override the checkout's .venv and fixture PDF,
// for a git worktree that has neither.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(process.cwd(), "..");
const paperboard = process.env.PAPERBOARD_BIN ?? join(repo, ".venv", "bin", "paperboard");
const fixture = process.env.PAPERBOARD_FIXTURE ?? join(repo, "tests", "fixtures", "papers", "resnet.pdf");
const root = mkdtempSync(join(tmpdir(), "pb-e2e-"));
const apiPort = process.env.PAPERBOARD_API_PORT ?? "8765";
// Where the data folder is, for a spec that writes into it as an AI agent would (e2e/agent.spec.ts).
const rootFile = join(tmpdir(), `pb-e2e-root-${apiPort}`);
writeFileSync(rootFile, root);

let server = null;
function cleanUp() {
  if (server && server.exitCode === null) server.kill();
  rmSync(root, { recursive: true, force: true });
  rmSync(rootFile, { force: true });
}
process.on("exit", cleanUp);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));

try {
  execFileSync(paperboard, ["extract", fixture, "--out", join(root, "papers")], { stdio: "inherit" });
} catch (failure) {
  console.error("e2e server: extract failed", failure.message);
  process.exit(1);
}
// AI help answers from a canned file (test only, see paperboard/canned_claude.py): e2e never reaches the API.
const env = { ...process.env, PAPERBOARD_FAKE_CLAUDE: join(repo, "web", "e2e", "fake-claude.json") };
server = spawn(paperboard, ["serve", "--root", root, "--web", join(repo, "web", "dist"), "--port", apiPort], { stdio: "inherit", env });
server.on("error", (failure) => { console.error("e2e server: could not start paperboard", failure.message); process.exit(1); });
server.on("exit", (code) => process.exit(code ?? 1));
