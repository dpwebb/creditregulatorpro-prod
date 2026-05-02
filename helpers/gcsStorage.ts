import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_PREFIX = "local:";

function getStorageRoot(): string {
  return path.resolve(
    process.cwd(),
    process.env.LOCAL_DOCUMENT_STORAGE_PATH ||
      process.env.DOCUMENT_STORAGE_PATH ||
      "document-storage"
  );
}

function getSafeObjectPath(objectName: string): string {
  const normalizedName = objectName.replace(/\\/g, "/");
  const relativePath = path.normalize(normalizedName);

  if (
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) {
    throw new Error("Invalid storage object path");
  }

  const storageRoot = getStorageRoot();
  const fullPath = path.resolve(storageRoot, relativePath);

  if (fullPath !== storageRoot && !fullPath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("Invalid storage object path");
  }

  return fullPath;
}

function decodeBase64File(base64File: string): Buffer {
  const base64Data = base64File.includes(",")
    ? base64File.split(",")[1]
    : base64File;

  return Buffer.from(base64Data, "base64");
}

export async function uploadFile(
  base64File: string,
  objectName: string,
  _mimeType: string
): Promise<string> {
  const filePath = getSafeObjectPath(objectName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, decodeBase64File(base64File));

  return `${STORAGE_PREFIX}${objectName}`;
}
