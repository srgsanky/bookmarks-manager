const storageKey = "cbm_data";
const themeKey = "cbm_theme";

const importInput = document.getElementById("import-input");
const exportBtn = document.getElementById("export-btn");
const clearBtn = document.getElementById("clear-btn");
const themeBtn = document.getElementById("theme-btn");
const searchInput = document.getElementById("search-input");
const duplicatesBtn = document.getElementById("duplicates-btn");
const countsEl = document.getElementById("counts");
const columnsEl = document.getElementById("columns");
const emptyStateEl = document.getElementById("empty-state");

const columnTemplate = document.getElementById("column-template");
const rowTemplate = document.getElementById("row-template");
const bookmarkTemplate = document.getElementById("bookmark-template");
const folderTemplate = document.getElementById("folder-template");
const dropTemplate = document.getElementById("drop-template");
const tooltipEl = document.getElementById("tooltip");
const tooltipCrumbEl = tooltipEl.querySelector(".tooltip-crumb");
const tooltipTitleEl = tooltipEl.querySelector(".tooltip-title");
const tooltipUrlEl = tooltipEl.querySelector(".tooltip-url");

const state = {
  data: null,
  query: "",
  duplicatesOnly: false,
};

let idCounter = 1;

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

const saveState = () => {
  if (!state.data) {
    localStorage.removeItem(storageKey);
    return;
  }
  clearTransientFlags(state.data);
  localStorage.setItem(storageKey, JSON.stringify(state.data));
};

const loadState = () => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }
};

const ensureIds = (node) => {
  if (!node._id) {
    node._id = `node-${idCounter++}`;
  }
  if (node.children) {
    node.children.forEach(ensureIds);
  }
};

const clearTransientFlags = (node) => {
  delete node._justMoved;
  if (node.children) {
    node.children.forEach(clearTransientFlags);
  }
};

const stripInternal = (node) => {
  const clean = { ...node };
  delete clean._id;
  delete clean._collapsed;
  if (clean.children) {
    clean.children = clean.children.map(stripInternal);
  }
  return clean;
};

const normalizeUrl = (url) => {
  if (!url) return "";
  return url.toLowerCase().replace(/#.*$/, "").replace(/\/$/, "");
};

const truncate = (value, length = 60) => {
  if (!value) return "";
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1)}…`;
};

const getFavicon = (url) => {
  try {
    const { hostname } = new URL(url);
    if (!hostname) return "";
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch (error) {
    return "";
  }
};

const collectBookmarks = (node, list = []) => {
  if (node.url) {
    list.push(node);
    return list;
  }
  if (node.children) {
    node.children.forEach((child) => collectBookmarks(child, list));
  }
  return list;
};

const countBookmarks = (node) => collectBookmarks(node).length;

const findNode = (node, id, parent = null) => {
  if (node._id === id) return { node, parent };
  if (!node.children) return null;
  for (const child of node.children) {
    const result = findNode(child, id, node);
    if (result) return result;
  }
  return null;
};

const buildBreadcrumb = (root, targetId, trail = []) => {
  if (root._id === targetId) return trail;
  if (!root.children) return null;
  for (const child of root.children) {
    if (child.url) {
      if (child._id === targetId) {
        return trail;
      }
      continue;
    }
    const nextTrail = [...trail, child.title || "Untitled"];
    const result = buildBreadcrumb(child, targetId, nextTrail);
    if (result) return result;
  }
  return null;
};

const isDescendant = (node, potentialChildId) => {
  if (!node.children) return false;
  for (const child of node.children) {
    if (child._id === potentialChildId) return true;
    if (isDescendant(child, potentialChildId)) return true;
  }
  return false;
};

const removeNode = (root, id) => {
  const { node, parent } = findNode(root, id) || {};
  if (!node || !parent) return null;
  const index = parent.children.findIndex((child) => child._id === id);
  if (index >= 0) {
    parent.children.splice(index, 1);
    return { node, parent, index };
  }
  return null;
};

const insertNode = (parent, index, node) => {
  parent.children = parent.children || [];
  parent.children.splice(index, 0, node);
};

const setCollapseRecursive = (node, collapsed) => {
  if (!node.children) return;
  node.children.forEach((child) => {
    if (child.children) {
      child._collapsed = collapsed;
      setCollapseRecursive(child, collapsed);
    }
  });
};

const moveNode = (root, nodeId, targetParentId, targetIndex) => {
  if (nodeId === targetParentId) return;
  const targetParent = findNode(root, targetParentId)?.node;
  if (!targetParent) return;
  const moving = findNode(root, nodeId)?.node;
  if (!moving) return;
  if (isDescendant(moving, targetParentId)) return;
  const removed = removeNode(root, nodeId);
  if (!removed) return;
  const finalIndex =
    removed.parent._id === targetParentId && removed.index < targetIndex
      ? targetIndex - 1
      : targetIndex;
  insertNode(targetParent, finalIndex, removed.node);
  removed.node._justMoved = true;
  render();
  saveState();
};

const fuzzyMatch = (text, pattern) => {
  if (!pattern) return true;
  let t = text.toLowerCase();
  let p = pattern.toLowerCase();
  let tIndex = 0;
  for (let i = 0; i < p.length; i += 1) {
    const char = p[i];
    tIndex = t.indexOf(char, tIndex);
    if (tIndex === -1) return false;
    tIndex += 1;
  }
  return true;
};

const matchesQuery = (node, query) => {
  if (!query) return true;
  const target = `${node.title || ""} ${node.url || ""}`.toLowerCase();
  if (query.startsWith("'")) {
    const needle = query.slice(1).toLowerCase();
    return target.includes(needle);
  }
  return fuzzyMatch(target, query);
};

const buildDuplicateSet = (root) => {
  const map = new Map();
  collectBookmarks(root).forEach((bookmark) => {
    const key = normalizeUrl(bookmark.url);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  const duplicates = new Set();
  for (const [key, count] of map.entries()) {
    if (count > 1) duplicates.add(key);
  }
  return { duplicates, total: duplicates.size };
};

const computeVisibility = (node, query, duplicatesOnly, duplicateSet) => {
  const isBookmark = Boolean(node.url);
  const matches = matchesQuery(node, query);
  const isDuplicate = isBookmark && duplicateSet.has(normalizeUrl(node.url));
  if (isBookmark) {
    return {
      visible: matches && (!duplicatesOnly || isDuplicate),
      hasVisibleChild: false,
    };
  }
  const children = node.children || [];
  let hasVisibleChild = false;
  for (const child of children) {
    const childState = computeVisibility(
      child,
      query,
      duplicatesOnly,
      duplicateSet
    );
    child._visible = childState.visible;
    child._hasVisibleChild = childState.hasVisibleChild;
    if (childState.visible || childState.hasVisibleChild) {
      hasVisibleChild = true;
    }
  }
  const visible = matches && !duplicatesOnly;
  return { visible, hasVisibleChild };
};

const renderChildren = (parent, depth, container) => {
  const children = parent.children || [];
  const startDrop = dropTemplate.content.cloneNode(true);
  const startEl = startDrop.querySelector(".drop-zone");
  const startLabel = startDrop.querySelector(".drop-label");
  if (startLabel) startLabel.textContent = `L${depth + 1}`;
  startEl.style.setProperty("--drop-depth", depth);
  attachDropHandlers(startEl, parent._id, 0);
  container.appendChild(startEl);

  children.forEach((child, index) => {
    if (!child._visible && !child._hasVisibleChild) return;

    const row = rowTemplate.content.cloneNode(true);
    const rowEl = row.querySelector(".row");
    const body = row.querySelector(".row-body");
    const levelEl = row.querySelector(".level-indicator");

    rowEl.dataset.nodeId = child._id;
    rowEl.style.setProperty("--depth", depth);
    const levelColors = [
      "color-mix(in srgb, var(--accent) 22%, transparent)",
      "color-mix(in srgb, #2f9e44 22%, transparent)",
      "color-mix(in srgb, #2f6fdb 22%, transparent)",
      "color-mix(in srgb, #9c36b5 22%, transparent)",
      "color-mix(in srgb, #f08c00 22%, transparent)",
    ];
    rowEl.style.setProperty(
      "--level-tint",
      levelColors[depth % levelColors.length]
    );
    levelEl.textContent = `L${depth + 1}`;
    if (child._justMoved) {
      rowEl.classList.add("moved");
      delete child._justMoved;
      rowEl.addEventListener(
        "animationend",
        () => {
          rowEl.classList.remove("moved");
        },
        { once: true }
      );
    }

    const toggleBtn = row.querySelector(".toggle");

    if (child.url) {
      const bookmark = bookmarkTemplate.content.cloneNode(true);
      const title = bookmark.querySelector(".bookmark-title");
      const url = bookmark.querySelector(".bookmark-url");
      const favicon = bookmark.querySelector(".favicon");

      title.textContent = truncate(child.title || child.url);
      title.href = child.url;
      url.textContent = truncate(child.url);
      title.dataset.tooltip = "bookmark";
      url.dataset.tooltip = "bookmark";
      const icon = getFavicon(child.url);
      if (icon) {
        favicon.src = icon;
      }
      body.appendChild(bookmark);
      const bookmarkEl = body.querySelector(".bookmark");
      bookmarkEl.dataset.fullTitle = child.title || child.url || "";
      bookmarkEl.dataset.fullUrl = child.url || "";
      const crumb = buildBreadcrumb(state.data, child._id) || [];
      bookmarkEl.dataset.breadcrumb = crumb.join(" › ");
      const renameBtn = row.querySelector(".rename");
      attachInlineEdit(
        title,
        rowEl,
        () => child.title || child.url || "",
        (next) => {
          child.title = next;
          saveState();
        },
        renameBtn
      );
      row.querySelector(".add-folder").classList.add("hidden");
      toggleBtn.classList.add("hidden");
    } else {
      const folderEl = folderTemplate.content.cloneNode(true);
      const folderTitleEl = folderEl.querySelector(".folder-title");
      folderTitleEl.textContent = child.title || "Untitled";
      folderEl.querySelector(".folder-count").textContent = `${countBookmarks(
        child
      )}`;
      body.appendChild(folderEl);

      toggleBtn.textContent = child._collapsed ? "Expand" : "Collapse";
      toggleBtn.addEventListener("click", () => {
        child._collapsed = !child._collapsed;
        saveState();
        render();
      });

      const renameBtn = row.querySelector(".rename");
      attachInlineEdit(
        folderTitleEl,
        rowEl,
        () => child.title || "",
        (next) => {
          child.title = next;
          saveState();
        },
        renameBtn
      );

      rowEl.addEventListener("click", (event) => {
        if (event.target.closest(".row-actions")) return;
        child._collapsed = !child._collapsed;
        saveState();
        render();
      });
    }

    row.querySelector(".delete").addEventListener("click", () => {
      if (child.children && child.children.length > 0) {
        const ok = confirm(
          "Delete this folder and all its contents? This cannot be undone."
        );
        if (!ok) return;
      }
      removeNode(state.data, child._id);
      saveState();
      render();
    });

    row.querySelector(".add-folder").addEventListener("click", () => {
      if (child.url) return;
      const name = prompt("Folder name");
      if (!name) return;
      child.children = child.children || [];
      child.children.push({ title: name, children: [] });
      saveState();
      render();
    });

    attachDragHandlers(rowEl, child._id, child.url);

    if (!child.url) {
      rowEl.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.stopPropagation();
        rowEl.classList.add("drag-over");
      });
      rowEl.addEventListener("dragleave", () => {
        rowEl.classList.remove("drag-over");
      });
      rowEl.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        rowEl.classList.remove("drag-over");
        const draggedId = event.dataTransfer.getData("text/plain");
        if (!draggedId) return;
        child._collapsed = false;
        moveNode(state.data, draggedId, child._id, child.children?.length || 0);
      });
    }

    container.appendChild(rowEl);

    if (
      child.children &&
      !child._collapsed &&
      (child._visible || child._hasVisibleChild)
    ) {
      renderChildren(child, depth + 1, container);
    }

    const dropZone = dropTemplate.content.cloneNode(true);
    const dropEl = dropZone.querySelector(".drop-zone");
    const dropLabel = dropZone.querySelector(".drop-label");
    if (dropLabel) dropLabel.textContent = `L${depth + 1}`;
    dropEl.style.setProperty("--drop-depth", depth);
    attachDropHandlers(dropEl, parent._id, index + 1);
    container.appendChild(dropEl);
  });
};

const render = () => {
  columnsEl.innerHTML = "";
  if (!state.data) {
    emptyStateEl.classList.remove("hidden");
    countsEl.textContent = "0 bookmarks";
    return;
  }
  emptyStateEl.classList.add("hidden");

  ensureIds(state.data);
  const { duplicates, total } = buildDuplicateSet(state.data);
  duplicatesBtn.textContent = state.duplicatesOnly
    ? "Showing Duplicates"
    : `Duplicates (${total})`;

  computeVisibility(
    state.data,
    state.query,
    state.duplicatesOnly,
    duplicates
  );

  const totalCount = countBookmarks(state.data);
  countsEl.textContent = `${totalCount} bookmarks`;

  const topLevelFolders = (state.data.children || []).filter(
    (child) => child.children
  );

  topLevelFolders.forEach((folder) => {
    const column = columnTemplate.content.cloneNode(true);
    const columnEl = column.querySelector(".column");
    const titleEl = column.querySelector("h2");
    const countEl = column.querySelector(".count");
    const bodyEl = column.querySelector(".column-body");

    titleEl.textContent = folder.title || "Untitled";
    countEl.textContent = `${countBookmarks(folder)}`;

    column.querySelector(".add-folder").addEventListener("click", () => {
      const name = prompt("Folder name");
      if (!name) return;
      folder.children = folder.children || [];
      folder.children.push({ title: name, children: [] });
      saveState();
      render();
    });

    column.querySelector(".collapse-all").addEventListener("click", () => {
      setCollapseRecursive(folder, true);
      saveState();
      render();
    });

    column.querySelector(".expand-all").addEventListener("click", () => {
      setCollapseRecursive(folder, false);
      saveState();
      render();
    });

    column.querySelector(".delete-folder").addEventListener("click", () => {
      if ((folder.children || []).length > 0) {
        const ok = confirm(
          "Delete this folder and all its contents? This cannot be undone."
        );
        if (!ok) return;
      }
      removeNode(state.data, folder._id);
      saveState();
      render();
    });

    renderChildren(folder, 0, bodyEl);

    columnsEl.appendChild(columnEl);
  });
};

const attachDragHandlers = (rowEl, nodeId, isBookmark) => {
  rowEl.addEventListener("dragstart", (event) => {
    rowEl.classList.add("dragging");
    event.dataTransfer.setData("text/plain", nodeId);
    event.dataTransfer.effectAllowed = "move";
  });

  rowEl.addEventListener("dragend", () => {
    rowEl.classList.remove("dragging");
  });

  if (isBookmark) {
    rowEl.addEventListener("dblclick", () => {
      const node = findNode(state.data, nodeId)?.node;
      if (node?.url) {
        window.open(node.url, "_blank", "noopener,noreferrer");
      }
    });
  }
};

const attachInlineEdit = (targetEl, rowEl, getValue, onSave, triggerEl) => {
  const beginEdit = () => {
    const current = getValue();
    const input = document.createElement("input");
    input.type = "text";
    input.value = current;
    input.className = "inline-editor";
    rowEl.draggable = false;
    targetEl.replaceWith(input);
    input.focus();
    input.select();

    const cancel = () => {
      input.replaceWith(targetEl);
      rowEl.draggable = true;
    };

    const commit = () => {
      const next = input.value.trim();
      if (next) {
        onSave(next);
      }
      cancel();
      render();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
      if (event.key === "Escape") cancel();
    });
    input.addEventListener("blur", () => commit());
  };

  if (triggerEl) {
    triggerEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginEdit();
    });
    return;
  }
};

const attachDropHandlers = (dropEl, parentId, index) => {
  dropEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropEl.classList.add("active");
  });
  dropEl.addEventListener("dragleave", () => {
    dropEl.classList.remove("active");
  });
  dropEl.addEventListener("drop", (event) => {
    event.preventDefault();
    dropEl.classList.remove("active");
    const draggedId = event.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    moveNode(state.data, draggedId, parentId, index);
  });
};

const applyTheme = (value) => {
  document.documentElement.dataset.theme = value;
  localStorage.setItem(themeKey, value);
};

const initialize = () => {
  const storedTheme = localStorage.getItem(themeKey);
  if (storedTheme) {
    applyTheme(storedTheme);
  }

  const data = loadState();
  if (data) {
    clearTransientFlags(data);
    state.data = data;
  }

  render();
};

importInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const text = await readFile(file);
    const data = JSON.parse(text);
    const root = Array.isArray(data) ? data[0] : data;
    if (!root || !root.children) {
      alert("Invalid bookmarks JSON.");
      return;
    }
    ensureIds(root);
    state.data = root;
    saveState();
    render();
  } catch (error) {
    console.error(error);
    alert("Failed to import JSON.");
  }
});

exportBtn.addEventListener("click", () => {
  if (!state.data) {
    alert("Nothing to export.");
    return;
  }
  const payload = JSON.stringify(stripInternal(state.data), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bookmarks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear the local workspace? This does not affect Chrome.")) return;
  state.data = null;
  saveState();
  render();
});

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  render();
});

duplicatesBtn.addEventListener("click", () => {
  state.duplicatesOnly = !state.duplicatesOnly;
  duplicatesBtn.classList.toggle("active", state.duplicatesOnly);
  duplicatesBtn.textContent = state.duplicatesOnly
    ? "Showing Duplicates"
    : `Duplicates (${buildDuplicateSet(state.data || { children: [] }).total})`;
  render();
});

themeBtn.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme || "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
});

initialize();

const showTooltipForBookmark = (bookmarkNode, anchorRect) => {
  if (!bookmarkNode) return;
  const title = bookmarkNode.dataset.fullTitle || "";
  const url = bookmarkNode.dataset.fullUrl || "";
  const crumb = bookmarkNode.dataset.breadcrumb || "";
  if (!title && !url) return;
  tooltipCrumbEl.textContent = crumb;
  tooltipCrumbEl.style.display = crumb ? "block" : "none";
  tooltipTitleEl.textContent = title;
  tooltipUrlEl.textContent = url;
  const left = Math.min(anchorRect.left, window.innerWidth - 480);
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `0px`;
  tooltipEl.style.visibility = "hidden";
  tooltipEl.classList.add("visible");
  const height = tooltipEl.getBoundingClientRect().height;
  const top = Math.max(12, anchorRect.top - height - 8);
  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.visibility = "visible";
  tooltipEl.setAttribute("aria-hidden", "false");
};

const hideTooltip = () => {
  tooltipEl.classList.remove("visible");
  tooltipEl.setAttribute("aria-hidden", "true");
};

columnsEl.addEventListener(
  "mouseenter",
  (event) => {
    const target = event.target.closest('[data-tooltip="bookmark"]');
    if (!target) return;
    const bookmarkNode = target.closest(".bookmark");
    if (!bookmarkNode) return;
    const rect = target.getBoundingClientRect();
    showTooltipForBookmark(bookmarkNode, rect);
  },
  true
);

columnsEl.addEventListener(
  "mouseleave",
  (event) => {
    const target = event.target.closest('[data-tooltip="bookmark"]');
    if (!target) return;
    hideTooltip();
  },
  true
);
