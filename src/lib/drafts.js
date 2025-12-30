import { appDataDir, join } from "@tauri-apps/api/path";
import {
  readTextFile,
  writeTextFile,
  readDir,
  remove,
  mkdir,
  exists,
} from "@tauri-apps/plugin-fs";

const DRAFTS_FOLDER = "drafts";

/**
 * Get the drafts directory path, creating it if needed
 */
async function getDraftsDir() {
  const appDir = await appDataDir();
  const draftsPath = await join(appDir, DRAFTS_FOLDER);

  const dirExists = await exists(draftsPath);
  if (!dirExists) {
    await mkdir(draftsPath, { recursive: true });
  }

  return draftsPath;
}

/**
 * Save a draft for a tab
 */
export async function saveDraft(tab) {
  const draftsDir = await getDraftsDir();
  const filePath = await join(draftsDir, `draft-${tab.id}.json`);

  const draft = {
    tabId: tab.id,
    title: tab.title,
    content: tab.content,
    selection: tab.selection,
    updatedAt: new Date().toISOString(),
  };

  await writeTextFile(filePath, JSON.stringify(draft, null, 2));
}

/**
 * Delete a draft
 */
export async function deleteDraft(tabId) {
  try {
    const draftsDir = await getDraftsDir();
    const filePath = await join(draftsDir, `draft-${tabId}.json`);

    const fileExists = await exists(filePath);
    if (fileExists) {
      await remove(filePath);
    }
  } catch (error) {
    console.warn("Failed to delete draft:", error);
  }
}

/**
 * Load all drafts from disk
 */
export async function loadAllDrafts() {
  try {
    const draftsDir = await getDraftsDir();
    const entries = await readDir(draftsDir);
    const drafts = [];

    for (const entry of entries) {
      if (entry.name?.endsWith(".json")) {
        try {
          const filePath = await join(draftsDir, entry.name);
          const content = await readTextFile(filePath);
          const draft = JSON.parse(content);
          drafts.push(draft);
        } catch (e) {
          console.warn("Failed to load draft:", entry.name, e);
        }
      }
    }

    return drafts;
  } catch (error) {
    console.warn("Failed to load drafts:", error);
    return [];
  }
}
