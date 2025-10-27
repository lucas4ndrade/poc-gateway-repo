import fs from "fs";
import { execSync } from "child_process";
import https from "https";
import yaml from "js-yaml";
import path from "path";

/**
 * Faz um GET simples (retorna Promise com string)
 */
function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

/**
 * Envia o prompt para o modelo Gemini
 */
async function aiValidate(paths, methods, html) {
  const pathsString = paths.join(", ");
  const methodsString = methods.join(", ");

  const prompt = `
Você é um validador de documentação de APIs.
O html abaixo contém a documentação swagger de uma API:
${html.slice(0, 15000)} 
(HTML truncado para 15k caracteres)
Verifique se a rota os Paths: ${pathsString} com os métodos ${methodsString} estão documentados neste html
Responda "sim" ou "não" e explique em uma linha o que encontrou.
  `;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const text =
              json?.candidates?.[0]?.content?.parts?.[0]?.text ||
              "⚠️ Resposta inválida da IA.";
            resolve(text);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Script principal
 */
async function main() {
  console.log("🔍 Buscando arquivos YAML modificados...");
  const diffOutput = execSync("git diff --name-only origin/main").toString();
  const modifiedFiles = diffOutput
    .split("\n")
    .filter((f) => f.startsWith("services/") && f.endsWith(".yaml") && fs.existsSync(f));

  if (modifiedFiles.length === 0) {
    console.log("✅ Nenhum arquivo YAML modificado.");
    return;
  }

  for (const file of modifiedFiles) {
    console.log(`📄 Validando ${file}...`);
    const data = yaml.load(fs.readFileSync(file, "utf8"));

    const services = data?.services || [];
    if (!services || services.length === 0) {
      console.error(`❌ No services found in ${file}`);
      continue;
    }

    for (const service of services) {
      const docUrl = service?.doc_url;
      const serviceName = service?.name;
      const routes = service?.routes || [];

      if (!serviceName) {
        console.error(`❌ 'service_name' ausente em ${file}`);
        continue;
      }
      
      if (!docUrl) {
        console.error(`❌ 'service.doc_url' ausente em ${file}`);
        continue;
      }

      if (!routes || routes.length === 0) {
        console.error(`❌ 'service.routes' ausente em ${file}`);
        continue;
      }

      console.log(`🌐 Baixando documentação: ${docUrl}`);
      const html = await fetch(docUrl).catch((e) => {
        console.error(`❌ Falha ao baixar ${docUrl}:`, e.message);
        return null;
      });

      if (!html) continue;

      for (const route of routes) {
        const routeName = route?.name || "<rota sem nome>";
        const paths = route?.paths || [];
        const methods = route?.methods || [];

        if (paths.length === 0 || methods.length === 0) {
          console.error(`❌ 'paths' ou 'methods' ausentes para rota ${routeName} em ${file}`);
          continue;
        }

        console.log(`🧠 Enviando para o Gemini...`);
        const result = await aiValidate(paths, methods, html);
        console.log(`💬 Resultado IA para ${route}:`);
        console.log(result);
        console.log("───────────────────────────────────────────────");
      }
    }
  }
}

main().catch((err) => {
  console.error("❌ Erro fatal:", err);
  process.exit(1);
});
