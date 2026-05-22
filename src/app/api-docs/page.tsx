import fs from "fs";
import path from "path";
import { ScalarDocs } from "./ScalarDocs";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  const specPath = path.join(process.cwd(), "public", "swagger.json");
  let spec: Record<string, any> = {};

  try {
    const fileContent = fs.readFileSync(specPath, "utf8");
    spec = JSON.parse(fileContent);
  } catch (err) {
    console.error("[api-docs] Failed to load swagger.json:", err);
  }

  // Build the dynamic servers list based on active environments
  const servers: Array<{ url: string; description: string }> = [];

  if (process.env.NEXT_PUBLIC_APP_URL) {
    let url = process.env.NEXT_PUBLIC_APP_URL.trim();
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    servers.push({
      url,
      description: "Production Server (via NEXT_PUBLIC_APP_URL)",
    });
  }

  // Always provide local fallback
  servers.push({
    url: "http://localhost:3000",
    description: "Local development server",
  });

  // Deduplicate servers by URL to keep the UI clean
  const seenUrls = new Set<string>();
  const uniqueServers = servers.filter((s) => {
    if (seenUrls.has(s.url)) return false;
    seenUrls.add(s.url);
    return true;
  });

  spec.servers = uniqueServers;

  return (
    <div className="w-full min-h-screen bg-[#09090b]">
      <ScalarDocs spec={spec} />
    </div>
  );
}
