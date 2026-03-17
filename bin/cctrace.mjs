#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const mode = args.find((a) => ["--app", "--web", "--tui"].includes(a)) ?? "--app";
const noOpen = args.includes("--no-open");

function run(cmd, cmdArgs, opts = {}) {
  const child = spawn(cmd, cmdArgs, {
    stdio: "inherit",
    cwd: root,
    ...opts,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  return child;
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase());
    });
  });
}

switch (mode) {
  case "--app":
    run("npx", ["tauri", "dev"]);
    break;

  case "--web": {
    if (noOpen) {
      // Background service mode — just start, no prompt.
      run("npx", ["tauri", "dev", "--", "--", "--web", "--no-open"]);
    } else {
      const { isInstalled } = await import("./install-service.mjs");

      if (isInstalled()) {
        // Service already installed — start inline, skip the prompt.
        run("npx", ["tauri", "dev", "--", "--", "--web"]);
      } else if (process.stdin.isTTY) {
        // Interactive — ask how to start.
        console.log("How would you like to start the web server?\n");
        console.log("  1) Start now (foreground, stops when you close the terminal)");
        console.log("  2) Install as background service (starts on login, always running)\n");

        const answer = await ask("Choose [1/2]: ");

        if (answer === "2") {
          const { installService } = await import("./install-service.mjs");
          const { platform } = await import("node:os");
          installService();
          // Open browser once since the service uses --no-open.
          setTimeout(() => {
            const os = platform();
            try {
              if (os === "darwin") execSync('open "http://localhost:1420"');
              else if (os === "win32") execSync('cmd.exe /c start "http://localhost:1420"');
              else execSync('xdg-open "http://localhost:1420" 2>/dev/null');
            } catch {}
          }, 2000);
        } else {
          run("npx", ["tauri", "dev", "--", "--", "--web"]);
        }
      } else {
        // Non-interactive — just start.
        run("npx", ["tauri", "dev", "--", "--", "--web"]);
      }
    }
    break;
  }

  case "--tui": {
    // Start backend headless, then launch TUI once API is ready
    const backend = spawn("npx", ["tauri", "dev", "--", "--", "--headless"], {
      stdio: "inherit",
      cwd: root,
    });

    // Build TUI if needed, wait for backend, then start TUI
    execSync("npm run build", { stdio: "inherit", cwd: resolve(root, "tui") });
    execSync("node wait-for-backend.mjs", {
      stdio: "inherit",
      cwd: resolve(root, "tui"),
    });

    const tui = spawn("node", ["dist/tui/src/cli.js"], {
      stdio: "inherit",
      cwd: resolve(root, "tui"),
    });

    tui.on("exit", (code) => {
      backend.kill();
      process.exit(code ?? 0);
    });
    backend.on("exit", () => tui.kill());
    break;
  }
}
