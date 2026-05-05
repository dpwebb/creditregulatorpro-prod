import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    return statSync(fullPath).isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function pageFileToRoute(fileName: string): string {
  const baseName = fileName.replace(/\.tsx$/, "");
  if (baseName === "_index") return "/";

  return `/${baseName
    .split(".")
    .map((segment) => (segment.startsWith("$") ? `:${segment.slice(1)}` : segment))
    .join("/")}`;
}

function endpointPathToHandlerFile(method: string, apiPath: string): string {
  const endpointPath = apiPath.replace(/^_api\//, "");
  const segments = endpointPath.split("/");
  const handlerName = `${segments.pop()}_${method.toUpperCase()}.ts`;
  return toPosix(path.join("endpoints", ...segments, handlerName));
}

describe("generated route and endpoint surface", () => {
  it("keeps every page file represented in App.tsx route map", () => {
    const appSource = readFileSync(path.join(projectRoot, "App.tsx"), "utf8");
    const routeEntries = [...appSource.matchAll(/\["\.\/pages\/([^"]+\.tsx)","([^"]+)"\]/g)].map(
      ([, fileName, route]) => ({ fileName, route })
    );

    const routeByFile = new Map(routeEntries.map((entry) => [entry.fileName, entry.route]));
    const pageFiles = readdirSync(path.join(projectRoot, "pages"))
      .filter((fileName) => fileName.endsWith(".tsx"))
      .filter((fileName) => !fileName.endsWith(".pageLayout.tsx"))
      .filter((fileName) => !fileName.endsWith(".module.css"));

    expect(routeEntries.length).toBe(pageFiles.length);

    for (const fileName of pageFiles) {
      expect(routeByFile.get(fileName)).toBe(pageFileToRoute(fileName));
      expect(existsSync(path.join(projectRoot, "pages", fileName.replace(/\.tsx$/, ".pageLayout.tsx")))).toBe(true);
    }
  });

  it("keeps every server API route backed by one endpoint handler and schema", () => {
    const serverSource = readFileSync(path.join(projectRoot, "server.ts"), "utf8");
    const routeEntries = [...serverSource.matchAll(/app\.(get|post)\('([^']+)'/g)]
      .filter(([, , apiPath]) => apiPath.startsWith("_api/"))
      .map(([, method, apiPath]) => ({
        method: method.toUpperCase(),
        apiPath,
        handlerFile: endpointPathToHandlerFile(method, apiPath),
      }));

    const endpointHandlers = walkFiles(path.join(projectRoot, "endpoints"))
      .map((filePath) => toPosix(path.relative(projectRoot, filePath)))
      .filter((filePath) => /_(GET|POST)\.ts$/.test(filePath))
      .filter((filePath) => !filePath.endsWith(".schema.ts"));

    const routedHandlers = new Set(routeEntries.map((entry) => entry.handlerFile));

    expect(routeEntries.length).toBe(endpointHandlers.length);

    for (const route of routeEntries) {
      expect(existsSync(path.join(projectRoot, route.handlerFile))).toBe(true);
      expect(existsSync(path.join(projectRoot, route.handlerFile.replace(/\.ts$/, ".schema.ts")))).toBe(true);
    }

    for (const handlerFile of endpointHandlers) {
      expect(routedHandlers.has(handlerFile)).toBe(true);
    }
  });
});
