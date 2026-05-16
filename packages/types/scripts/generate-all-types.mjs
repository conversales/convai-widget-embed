import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { TypeScriptGenerator } from "@asyncapi/modelina";
import * as AsyncAPIParser from "@asyncapi/parser";

const args = process.argv.slice(2);
const roleArg = (args.find(a => a.startsWith("--role=")) || "--role=client").split("=")[1];
const role = roleArg === "server" ? "server" : "client";

const schemasDir = path.resolve(process.cwd(), "schemas");
const outDir = path.resolve(process.cwd(), "generated/types");
const outTypesPath = path.join(outDir, "asyncapi-types.ts");
const outIncomingPath = path.join(outDir, "incoming.ts");
const outOutgoingPath = path.join(outDir, "outgoing.ts");

function opKindToDir(op, currentRole) {
  return currentRole === "client"
    ? op === "publish"
      ? "incoming"
      : "outgoing"
    : op === "publish"
      ? "outgoing"
      : "incoming";
}

async function parseAsyncAPIDoc(raw) {
  const parser = new AsyncAPIParser.Parser();
  const res = await parser.parse(raw);
  return res?.document ?? res;
}

async function collectPayloads(raw, schemaFile) {
  let doc;
  try {
    doc = await parseAsyncAPIDoc(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse AsyncAPI schema in ${schemaFile}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const json = typeof doc?.json === "function" ? doc.json() : doc;

  if (!json) {
    throw new Error(`AsyncAPI parser returned invalid document for ${schemaFile}`);
  }

  const seen = new Set();
  const items = [];

  const cm = json?.components?.messages ?? {};
  for (const [msgName, message] of Object.entries(cm)) {
    const payload = message?.payload;
    if (!payload) continue;
    const key = `c:${msgName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ baseName: msgName, schema: { ...payload, $id: msgName } });
  }

  const channels = json?.channels ?? {};
  for (const [chName, ch] of Object.entries(channels)) {
    for (const opKind of ["publish", "subscribe"]) {
      const op = ch?.[opKind];
      if (!op?.message) continue;

      const rawMsg = op.message;
      const list = Array.isArray(rawMsg?.oneOf) ? rawMsg.oneOf : [rawMsg];

      for (const message of list) {
        const payload = message?.payload;
        if (!payload) continue;

        const base =
          message?.name ||
          (message?.$ref && String(message.$ref).split("/").pop()) ||
          `${chName}-${opKind}`;

        const key = `o:${chName}:${opKind}:${base}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          baseName: base,
          schema: { ...payload, $id: base },
          dir: opKindToDir(opKind, role),
        });
      }
    }
  }

  return items;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const schemaFiles = readdirSync(schemasDir)
    .filter(file => file.endsWith(".asyncapi.yaml"))
    .map(file => path.join(schemasDir, file));

  if (schemaFiles.length === 0) {
    throw new Error(`No AsyncAPI schema files found in ${schemasDir}`);
  }

  console.log(`Processing ${schemaFiles.length} schema file(s):`);
  for (const file of schemaFiles) {
    console.log(`  - ${path.basename(file)}`);
  }

  const generator = new TypeScriptGenerator({
    modelType: "interface",
    enumType: "union",
    mapType: "record",
    rawPropertyNames: true,
    processorOptions: {
      interpreter: {
        ignoreAdditionalProperties: true,
      },
    },
  });

  const emitted = new Set();
  const pieces = [];
  const incomingNames = new Set();
  const outgoingNames = new Set();

  for (const schemaFile of schemaFiles) {
    const fileName = path.basename(schemaFile);
    console.log(`\nProcessing ${fileName}...`);

    try {
      const raw = readFileSync(schemaFile, "utf8");
      const payloads = await collectPayloads(raw, fileName);

      console.log(`  Found ${payloads.length} payload(s) in ${fileName}`);

      for (const { schema, dir } of payloads) {
        const models = await generator.generate(schema);
        const root = models[0]?.modelName;
        if (root && dir) {
          (dir === "incoming" ? incomingNames : outgoingNames).add(root);
        }

        for (const model of models) {
          if (emitted.has(model.modelName)) continue;
          emitted.add(model.modelName);

          const exported = model.result
            .replace(/^(\s*)(interface\s+)/m, "$1export $2")
            .replace(/^(\s*)(type\s+)/m, "$1export $2")
            .replace(/^(\s*)(enum\s+)/m, "$1export $2");

          pieces.push(exported);
        }
      }
    } catch (err) {
      console.error(`\n❌ ERROR processing ${fileName}:`);
      console.error(`   ${err instanceof Error ? err.message : String(err)}\n`);
      throw err;
    }
  }

  const header = `/* Auto-generated from AsyncAPI\n * Role: ${role}\n * DO NOT EDIT MANUALLY\n */\n\n`;
  writeFileSync(outTypesPath, header + pieces.join("\n\n") + "\n", "utf8");

  const toBarrel = (names, label) =>
    `// Auto-generated barrel for ${label} payloads\n` +
    `export type {\n${[...names]
      .sort()
      .map(name => `  ${name},`)
      .join("\n")}\n} from "./asyncapi-types.js";\n`;

  writeFileSync(outIncomingPath, toBarrel(incomingNames, "incoming"), "utf8");
  writeFileSync(outOutgoingPath, toBarrel(outgoingNames, "outgoing"), "utf8");

  console.log(`\n✅ Successfully generated types:`);
  console.log(`   ${outTypesPath} (${emitted.size} types)`);
  console.log(`   ${outIncomingPath} (${incomingNames.size} types)`);
  console.log(`   ${outOutgoingPath} (${outgoingNames.size} types)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});