const exportBtn = document.getElementById("export-btn");
const clearBtn = document.getElementById("clear-btn");
const importInput = document.getElementById("import-input");
const statusEl = document.getElementById("status");

const setStatus = (message, type = "") => {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
};

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const stripIds = (node) => {
  const clean = { ...node };
  delete clean.id;
  if (clean.children) {
    clean.children = clean.children.map(stripIds);
  }
  return clean;
};

const downloadJson = async (data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename: `chrome-bookmarks-${new Date().toISOString().slice(0, 10)}.json`,
      saveAs: true,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const clearAllBookmarks = async () => {
  const tree = await chrome.bookmarks.getTree();
  const roots = tree[0]?.children ?? [];
  await Promise.all(
    roots.flatMap((root) =>
      (root.children || []).map((child) => chrome.bookmarks.removeTree(child.id))
    )
  );
};

const createNode = async (parentId, node) => {
  if (node.url) {
    return chrome.bookmarks.create({
      parentId,
      title: node.title || node.name || node.url,
      url: node.url,
    });
  }
  const folder = await chrome.bookmarks.create({
    parentId,
    title: node.title || node.name || "New Folder",
  });
  if (node.children && node.children.length) {
    for (const child of node.children) {
      await createNode(folder.id, child);
    }
  }
  return folder;
};

const importBookmarks = async (data) => {
  const root = Array.isArray(data) ? data[0] : data;
  if (!root || !root.children) {
    throw new Error("Invalid bookmarks format.");
  }
  await clearAllBookmarks();
  const currentRoots = await chrome.bookmarks.getTree();
  const targetRoots = currentRoots[0]?.children ?? [];
  for (let i = 0; i < targetRoots.length; i += 1) {
    const sourceRoot = root.children[i];
    if (!sourceRoot) continue;
    const targetRootId = targetRoots[i].id;
    if (sourceRoot.children && sourceRoot.children.length) {
      for (const child of sourceRoot.children) {
        await createNode(targetRootId, child);
      }
    }
  }
};

exportBtn.addEventListener("click", async () => {
  setStatus("Exporting bookmarks...");
  try {
    const tree = await chrome.bookmarks.getTree();
    const sanitized = tree.map(stripIds);
    await downloadJson(sanitized);
    setStatus("Bookmarks exported.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Failed to export bookmarks.", "error");
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all bookmarks? This cannot be undone.")) return;
  setStatus("Clearing bookmarks...");
  try {
    await clearAllBookmarks();
    setStatus("All bookmarks cleared.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Failed to clear bookmarks.", "error");
  }
});

importInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!confirm("Import will replace existing bookmarks. Continue?")) return;
  setStatus("Importing bookmarks...");
  try {
    const text = await readFile(file);
    const data = JSON.parse(text);
    await importBookmarks(data);
    setStatus("Bookmarks imported.", "success");
  } catch (error) {
    console.error(error);
    setStatus("Failed to import bookmarks.", "error");
  }
});
