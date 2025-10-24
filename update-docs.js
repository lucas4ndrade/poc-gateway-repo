import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const DOCS_REPO_PATH = "./poc-docs-repo";
const TABLE_FILE = path.join(DOCS_REPO_PATH, "docs", "table.md");

function getAllServiceDocs(servicesDir) {
  const files = fs.readdirSync(servicesDir).filter(f => f.endsWith(".yaml"));
  const allServices = [];

  for (const file of files) {
    const filePath = path.join(servicesDir, file);
    const content = fs.readFileSync(filePath, "utf8");
    const parsed = yaml.load(content);

    if (!parsed.services || !Array.isArray(parsed.services)) continue;

    for (const svc of parsed.services) {
      if (svc.name && svc.doc_url) {
        allServices.push({ name: svc.name, doc_url: svc.doc_url });
      }
    }
  }

  return allServices;
}

function buildMarkdownTable(services) {
  const header = [
    "# Documentações dos serviços do gateway",
    "",
    "| Nome do Serviço  | Link Para a Documentação      |",
    "|------------------|-------------------------------|",
  ];

  const rows = services
    .map(svc => `| ${svc.name} | ${svc.doc_url} |`)
    .join("\n");

  return header.join("\n") + "\n" + rows + "\n";
}

function updateDocsTable() {
  const services = getAllServiceDocs("./services");
  const markdown = buildMarkdownTable(services);
  fs.writeFileSync(TABLE_FILE, markdown, "utf8");
  console.log(`✅ Updated ${TABLE_FILE} with ${services.length} services.`);
}

updateDocsTable();
