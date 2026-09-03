const { spawn } = require("node:child_process");

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pnpmArgs = ["--filter", "@workspace/electoral-roll-search", "dev"];
const environment = {
  ...process.env,
  PORT: process.env.PORT || "5173",
  BASE_PATH: process.env.BASE_PATH || "/",
};

const child = spawn(
  process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : pnpmCommand,
  process.platform === "win32"
    ? ["/d", "/s", "/c", pnpmCommand, ...pnpmArgs]
    : pnpmArgs,
  { env: environment, stdio: "inherit" },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
