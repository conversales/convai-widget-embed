import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const watchDir = join(root, "packages/convai-widget-core/src");
const port = Number(process.env.PORT) || 8080;
const testUrl = `http://localhost:${port}/test-unpkg-embed.html`;

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
};

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

let buildQueue = Promise.resolve();

function queueBuild() {
  buildQueue = buildQueue
    .then(async () => {
      console.log("\nRebuilding widget core + embed...");
      await run("pnpm", [
        "--filter",
        "@conversales/convai-widget-core",
        "build",
      ]);
      await run("pnpm", [
        "--filter",
        "@conversales/convai-widget-embed",
        "build",
      ]);
      console.log("Rebuild complete. Refresh the browser to pick up changes.\n");
    })
    .catch(error => {
      console.error(error.message);
    });

  return buildQueue;
}

function createStaticServer() {
  createServer((request, response) => {
    const requestPath =
      request.url?.split("?")[0] === "/"
        ? "/test-unpkg-embed.html"
        : request.url?.split("?")[0] || "/test-unpkg-embed.html";
    const filePath = join(root, requestPath);

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const contentType =
      mimeTypes[extname(filePath)] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(filePath).pipe(response);
  }).listen(port, () => {
    console.log(`Embed test page: ${testUrl}`);
    console.log("Watching packages/convai-widget-core/src for changes...");
  });
}

async function main() {
  await queueBuild();
  createStaticServer();

  let debounceTimer;
  watch(watchDir, { recursive: true }, () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      queueBuild();
    }, 300);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
