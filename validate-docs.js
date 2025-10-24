import fs from "fs";
import { execSync } from "child_process";
import https from "https";
import http from "http";
import yaml from "js-yaml";

/**
 * Checks if a URL is reachable (HTTP 200)
 */
function checkUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
      res.resume(); // consume data to free socket
    });
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Main script
 */
async function main() {
  console.log("🔍 Checking modified YAML files...");
  const diffOutput = execSync("git diff --name-only origin/main").toString();
  const modifiedFiles = diffOutput
    .split("\n")
    .filter((f) => f.startsWith("services/") && f.endsWith(".yaml") && fs.existsSync(f));

  if (modifiedFiles.length === 0) {
    console.log("✅ No YAML files modified.");
    return;
  }

  let hasErrors = false;

  for (const file of modifiedFiles) {
    console.log(`📄 Validating ${file}...`);
    const data = yaml.load(fs.readFileSync(file, "utf8"));

    const services = data?.services || [];
    if (!services || services.length === 0) {
      console.log(`❌ No services found in ${file}`);
      hasErrors = true;
      continue;
    }

    for (const service of services) {
      const docUrl = service?.doc_url;
      const serviceName = service?.name;

      if (!serviceName) {
        console.log(`❌ Missing 'service_name' in ${file}`);
        hasErrors = true;
        continue;
      }

      if (!docUrl) {
        console.log(`❌ Missing 'service.doc_url' in ${file}`);
        hasErrors = true;
        continue;
      }

      try {
        new URL(docUrl); // validate URL format
      } catch {
        console.log(`❌ Invalid URL format in ${file} for service ${serviceName}: ${docUrl}`);
        hasErrors = true;
        continue;
      }

      const reachable = await checkUrl(docUrl);
      if (!reachable) {
        console.log(`❌ Doc URL not reachable in ${file} for service ${serviceName}: ${docUrl}`);
        hasErrors = true;
      } else {
        console.log(`✅ Doc URL Valid for service ${serviceName}: ${docUrl}`);
      }
    }
  }

  if (hasErrors) {
    console.error("❌ Some validations failed.");
    process.exit(1);
  } else {
    console.log("✅ All doc URLs are valid and reachable!");
  }
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
