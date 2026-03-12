"use strict";

/* import-globals-from ../../shared/feed-parser.js */
/* import-globals-from ../../shared/livemark-store.js */
/* import-globals-from ../../shared/settings.js */
/* import-globals-from ../../shared/i18n.js */
/* import-globals-from opml-utils.js */

window.onload = async () => {
  console.log("[Livemarks] settings page loaded (window.onload)");
  await LivemarkStore.init();

  initDialogs();

  document.getElementById("add").addEventListener("click", async () => {
    let feedUrl = prompt(I18N.getMessage("enterFeedURL"));
    if (feedUrl === null) {
      return;
    }
    try {
      feedUrl = new URL(feedUrl);
    } catch (e) {
      alert(e);
      return;
    }

    let feedTitle, siteUrl;
    try {
      const feedResult = await FeedParser.getFeed(feedUrl.href);
      if (!feedResult) {
        // Log richer context for debugging when a feed is unparsable.
        try {
          console.error("[Livemarks]", "Feed parse failed (no parsable XML)", {
            enteredFeedUrl: feedUrl.href,
            // default folder guess (may be async) — fetch for extra context
            defaultFolder: await Settings.getDefaultFolder(),
          });
        } catch (e) {
          console.error("[Livemarks]", "Feed parse failed for", feedUrl.href);
        }
        alert(I18N.getMessage("subscribe_noEntriesFound"));
        return;
      }

      const { title, url, items } = feedResult;
      if (!items || items.length == 0) {
        console.error("[Livemarks]", "Feed returned no items", { feedUrl: feedUrl.href, title, url });
        alert(I18N.getMessage("subscribe_noEntriesFound"));
        return;
      }

      feedTitle = title;
      siteUrl = url;
    } catch (e) {
      // Log the entered dialog data alongside the error
      try {
        console.error("[Livemarks]", "Error fetching/parsing feed", {
          enteredFeedUrl: feedUrl.href,
          error: e,
          defaultFolder: await Settings.getDefaultFolder(),
        });
      } catch (ee) {
        console.error("[Livemarks]", "Error fetching/parsing feed", feedUrl.href, e);
      }
      alert(e);
      return;
    }

    const feed = {
      title: feedTitle,
      feedUrl: feedUrl.href,
      siteUrl,
      parentId: await Settings.getDefaultFolder(),
      maxItems: 25,
    };
    await LivemarkStore.add(feed);
  });

  document.getElementById("settings-toggle")
    .addEventListener("click", showSettingsDialog);

  // Toggle: show feeds with errors first
  window.showErrorsFirst = false;
  const errorsFirstBtn = document.getElementById("errors-first-toggle");
  if (errorsFirstBtn) {
    errorsFirstBtn.addEventListener("click", (e) => {
      window.showErrorsFirst = !window.showErrorsFirst;
      errorsFirstBtn.classList.toggle("active", window.showErrorsFirst);
      errorsFirstBtn.textContent = window.showErrorsFirst ? "エラーを先頭に表示：ON" : "エラーを先頭に表示";
      loadFeeds();
    });
  }

  const updateNowBtn = document.getElementById("update-now");
  if (updateNowBtn) {
    updateNowBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      updateNowBtn.disabled = true;
      const oldText = updateNowBtn.textContent;
      updateNowBtn.textContent = "更新中...";
      try {
        // Collect all live feed IDs and request a forced update for them.
        const allFeeds = await LivemarkStore.getAll();
        const ids = allFeeds.map(f => f.id);
        await browser.runtime.sendMessage({ msg: "triggerUpdate", changedKeys: ids });
        alert(I18N.getMessage ? I18N.getMessage("settings_updateStarted") : "フィード更新を開始しました。");
      } catch (err) {
        console.error("[Livemarks] manual update request failed", err);
        alert(I18N.getMessage ? I18N.getMessage("settings_updateFailed") : "フィード更新の要求に失敗しました。");
      } finally {
        updateNowBtn.disabled = false;
        updateNowBtn.textContent = oldText;
      }
    });
  }

  document.getElementById("import-feeds").addEventListener("change", (event) => {
    const [file] = event.target.files;
    const reader = new FileReader();
    reader.onload = async ({ target }) => {
      try {
        const imported = importOPML(target.result);
        if (imported.length === 0) {
          alert(I18N.getMessage("subscribe_noEntriesFound"));
          return;
        }
        for (const { title, feedUrl, siteUrl } of imported) {
          const feed = {
            title,
            feedUrl,
            siteUrl,
            parentId: await Settings.getDefaultFolder(),
            maxItems: 25,
          };
          await LivemarkStore.add(feed);
        }
        alert(I18N.getMessage("settings_importExport_successImport", imported.length));
      } catch (e) {
        console.log("[Livemarks]", "Error importing OPML file", e);
        alert(I18N.getMessage("settings_importExport_errorImport"));
      }
    };
    reader.readAsText(file);
  });

  loadFeeds();
  LivemarkStore.addChangeListener(loadFeeds);
  browser.bookmarks.onChanged.addListener(async (id) => {
    if (await LivemarkStore.isLivemarkFolder(id)) {
      loadFeeds();
    }
  });
  browser.bookmarks.onMoved.addListener(async (id) => {
    if (await LivemarkStore.isLivemarkFolder(id)) {
      loadFeeds();
    }
  });
};

async function showSettingsDialog() {
  const settingsForm = document.querySelector("#settings-form");
  settingsForm.pollInterval.value = await Settings.getPollInterval();
  settingsForm.readPrefix.value = await Settings.getReadPrefix();
  settingsForm.unreadPrefix.value = await Settings.getUnreadPrefix();
  settingsForm.prefixFeedFolder.checked = await Settings.getPrefixFeedFolderEnabled();
  settingsForm.prefixParentFolders.checked = await Settings.getPrefixParentFoldersEnabled();
  settingsForm.feedPreview.checked = await Settings.getFeedPreviewEnabled();
  settingsForm.elements.extensionIcon.value = await Settings.getExtensionIcon();

  settingsForm.prefixParentFolders.disabled = !settingsForm.prefixFeedFolder.checked;

  // Ensure the stored default folder (if any) appears in the selector
  const storedDefault = await Settings.getDefaultFolder();
  await populateFolderSelector(settingsForm.defaultFolder, false, storedDefault);

  const allFeeds = await LivemarkStore.getAll();
  const exportLink = document.getElementById("export-feeds");
  const blob = new Blob([exportOPML(allFeeds)], { type: "text/xml" });
  exportLink.href = URL.createObjectURL(blob);

  toggleDialog("settings-dialog", true);
}

function initDialogs() {
  const closesDialog = document.querySelectorAll("#dialog-overlay, .dialog-cancel");
  closesDialog.forEach(el => {
    el.addEventListener("click", () => {
      const openDialog = document.querySelector(".dialog:not([hidden])");
      toggleDialog(openDialog.id, false);
    });
  });

  const settingsForm = document.querySelector("#settings-form");
  settingsForm.addEventListener("change", async (e) => {
    e.preventDefault();
    if (settingsForm.reportValidity()) {
      settingsForm.prefixParentFolders.checked &= settingsForm.prefixFeedFolder.checked;
      settingsForm.prefixParentFolders.disabled = !settingsForm.prefixFeedFolder.checked;

      await Settings.setPollInterval(settingsForm.pollInterval.value);
      await Settings.setReadPrefix(settingsForm.readPrefix.value);
      await Settings.setUnreadPrefix(settingsForm.unreadPrefix.value);
      await Settings.setDefaultFolder(settingsForm.defaultFolder.value);
      await Settings.setPrefixFeedFolderEnabled(settingsForm.prefixFeedFolder.checked);
      await Settings.setPrefixParentFoldersEnabled(settingsForm.prefixParentFolders.checked);
      await Settings.setFeedPreviewEnabled(settingsForm.feedPreview.checked);
      await Settings.setExtensionIcon(settingsForm.elements.extensionIcon.value);
    }
  }, true);
  settingsForm.addEventListener("blur", e => e.preventDefault());
}

async function loadFeeds() {
  console.log("[Livemarks] settings.loadFeeds start");
  toggleDialog("settings-dialog", false);
  toggleDialog("edit-livemark-dialog", false);
  const allFeeds = await LivemarkStore.getAll();
  document.getElementById("feeds").textContent = "";

  // Sort alphabetically by title for deterministic order.
  allFeeds.sort((a, b) => a.title.localeCompare(b.title));

  // Feeds with a stored `lastError` should be considered "errored".
  const errorFeeds = allFeeds.filter(f => f && f.lastError);
  const normalFeeds = allFeeds.filter(f => !(f && f.lastError));

  if (window.showErrorsFirst) {
    errorFeeds.forEach(feed => addFeedToList(feed, true));
    normalFeeds.forEach(feed => addFeedToList(feed, false));
  } else {
    normalFeeds.forEach(feed => addFeedToList(feed, false));
    errorFeeds.forEach(feed => addFeedToList(feed, true));
  }

  console.log("[Livemarks] settings.loadFeeds completed: feedsCount=", allFeeds.length);
}

function addFeedToList(feed, broken = false) {
  const item = document.createElement("div");
  item.className = "feed card";
  if (broken) {
    item.classList.add("broken");
  }
  // Title area (with optional error marker)
  const titleWrap = document.createElement("div");
  titleWrap.className = "feed-title-wrap";

  if (feed.lastError) {
    item.classList.add("error");
    const err = document.createElement("span");
    err.className = "feed-error";
    err.textContent = "⚠";
    err.title = String(feed.lastError);
    titleWrap.appendChild(err);
  }
  // Folder missing marker (distinct from parsing/fetch errors)
  if (feed.folderMissing) {
    item.classList.add("folder-missing");
    const fm = document.createElement("span");
    fm.className = "feed-folder-missing";
    fm.textContent = "📁✖";
    fm.title = "フォルダが見つかりません";
    titleWrap.appendChild(fm);
  }
  // Folder empty marker: folder exists but contains no bookmark children
  if (feed.folderEmpty && !feed.folderMissing) {
    item.classList.add("folder-empty");
    const fe = document.createElement("span");
    fe.className = "feed-folder-empty";
    fe.textContent = "📭";
    fe.title = "フォルダにブックマークがありません";
    titleWrap.appendChild(fe);
  }

  const feedTitle = document.createElement("span");
  feedTitle.textContent = feed.title;
  feedTitle.className = "feed-title";
  titleWrap.appendChild(feedTitle);
  item.appendChild(titleWrap);

  const feedUrl = document.createElement("span");
  feedUrl.textContent = feed.feedUrl;
  feedUrl.className = "feed-url";
  item.appendChild(feedUrl);

  const editIcon = document.createElement("button");
  editIcon.title = I18N && I18N.getMessage ? I18N.getMessage("settings_editFeed") : "編集";
  editIcon.className = "icon more feed-edit";
  editIcon.onclick = () => {
    // Always open the edit dialog — allow editing and recovery even for
    // feeds currently marked as broken.
    showEditFeedDialog(feed);
  };
  item.appendChild(editIcon);

  const delBtn = document.createElement("button");
  delBtn.title = "削除";
  delBtn.className = "icon delete feed-delete";
  delBtn.onclick = async (e) => {
    e.preventDefault();
    if (confirm("このフィードを削除してもよいですか？")) {
      await LivemarkStore.remove(feed.id);
    }
  };
  item.appendChild(delBtn);

  document.getElementById("feeds").appendChild(item);
}

async function showEditFeedDialog(feed) {
  const dialog = document.querySelector("#edit-livemark-dialog");

  // Prevent race conditions
  toggleDialog(dialog.id, false);

  const { title, feedUrl, siteUrl, parentId, maxItems, id } = feed;
  dialog.title.value = title;
  dialog.feedUrl.value = feedUrl;
  dialog.siteUrl.value = siteUrl;
  dialog.maxItems.value = maxItems;

  // If this feed has an error recorded, show an error box with actions
  // (retry this feed only, or clear the error). This lets users recover
  // without changing other feeds.
  try {
    const prev = dialog.querySelector('.edit-error-box');
    if (prev) prev.remove();
    if (feed.lastError) {
      const errBox = document.createElement('div');
      errBox.className = 'edit-error-box';
      errBox.style.background = 'var(--dialog-error-bg, #4a2f2f)';
      errBox.style.color = 'var(--text-color, #fff)';
      errBox.style.padding = '10px';
      errBox.style.marginBottom = '8px';
      errBox.style.borderRadius = '4px';

      const msg = document.createElement('div');
      msg.textContent = String(feed.lastError);
      msg.style.whiteSpace = 'pre-wrap';
      msg.style.marginBottom = '8px';
      errBox.appendChild(msg);

      const btnWrap = document.createElement('div');
      btnWrap.style.display = 'flex';
      btnWrap.style.gap = '8px';

      const retryBtn = document.createElement('button');
      retryBtn.textContent = '再試行';
      retryBtn.className = 'button';
      retryBtn.onclick = async (e) => {
        e.preventDefault();
        retryBtn.disabled = true;
        try {
          await browser.runtime.sendMessage({ msg: 'triggerUpdate', changedKeys: [id] });
        } catch (e) {
          console.error('[Livemarks] retry failed', e);
        } finally {
          retryBtn.disabled = false;
        }
      };

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'エラーをクリア';
      clearBtn.className = 'button';
      clearBtn.onclick = async (e) => {
        e.preventDefault();
        try {
          await LivemarkStore.edit(id, { lastError: null });
          loadFeeds();
          toggleDialog(dialog.id, false);
        } catch (err) {
          console.error('[Livemarks] clear lastError failed', err);
        }
      };

      btnWrap.appendChild(retryBtn);
      btnWrap.appendChild(clearBtn);
      errBox.appendChild(btnWrap);

      // Insert error box near top of dialog
      const first = dialog.firstChild;
      if (first) dialog.insertBefore(errBox, first.nextSibling);
      else dialog.appendChild(errBox);
    }
  } catch (e) {
    console.warn('[Livemarks] failed to render edit error box', e);
  }

  // Show the actual feed folder path (root / ... / folder)
  const getFolderPath = async (folderId) => {
    const parts = [];
    let nodeId = folderId;
    while (nodeId) {
      try {
        const arr = await browser.bookmarks.get(nodeId).catch(() => []);
        const node = arr && arr[0];
        if (!node) break;
        // push raw title (may be empty); we'll filter empties later
        parts.push(node.title || '');
        nodeId = node.parentId;
      } catch (e) {
        break;
      }
    }
    parts.reverse();
    // Remove empty parts (e.g. unnamed root nodes) and present as '/a / b / c'
    const filtered = parts.filter(p => p && p.trim().length > 0);
    if (filtered.length === 0) return '/';
    return '/' + filtered.join(' / ');
  };

  try {
    const path = await getFolderPath(id);
    const ta = dialog.querySelector('[name="currentFeedFolder"]');
    ta.value = path;
    // auto-resize to fit content
    ta.style.height = 'auto';
    const minPx = 36; // ~2.2rem
    const h = Math.max(ta.scrollHeight, minPx);
    ta.style.height = (h) + 'px';
  } catch (e) {
    const ta = dialog.querySelector('[name="currentFeedFolder"]');
    ta.value = title;
    ta.style.height = 'auto';
    const minPx = 36;
    const h = Math.max(ta.scrollHeight, minPx);
    ta.style.height = (h) + 'px';
  }

  // (親フォルダー表示は省略しています — 表示が紛らわしいため)

  // Wire the change button to open the parent-folder selector dialog
  // The parent-folder "変更" feature was removed as it caused confusion.
  const changeBtn = dialog.querySelector('#change-parent-button');
  if (changeBtn) changeBtn.style.display = 'none';

  // Folder is displayed inline; no view/rebind controls.

  const deleteButton = dialog.querySelector(".delete");
  deleteButton.onclick = async (e) => {
    e.preventDefault();
    toggleDialog(dialog.id, false);
    await LivemarkStore.remove(id);
  };
  dialog.onsubmit = async (e) => {
    e.preventDefault();

    const valid = dialog.reportValidity();
    if (valid) {
      toggleDialog(dialog.id, false);
      const formData = new FormData(dialog);
      const props = {};
      for (const [key, value] of formData.entries()) {
        props[key] = value;
      }
      await LivemarkStore.edit(id, props);
    }
  };
  toggleDialog(dialog.id, true);
}

// NOTE: parent-change and rebind features removed — folder UI is display-only.

async function showSelectFolderDialog(feed) {
  const dialog = document.querySelector("#select-folder-dialog");

  toggleDialog(dialog.id, false);

  // Display the folder path (slash-separated) for the feed's folder id.
  const treeContainer = dialog.querySelector('#livemarkFolderTree');
  treeContainer.textContent = '';
  try {
    // Start from the feed's folder id (feed.id) and walk up parents collecting titles
    let nodeId = feed.id;
    const parts = [];
    while (nodeId) {
      try {
        const arr = await browser.bookmarks.get(nodeId).catch(() => []);
        const node = arr && arr[0];
        if (!node) break;
        parts.push(node.title || '(無題)');
        nodeId = node.parentId;
      } catch (e) {
        break;
      }
    }
    // Reverse to get root -> ... -> folder
    parts.reverse();
    const path = parts.join(' / ');
    treeContainer.textContent = path || '(不明なフォルダ)';
    const hidden = dialog.querySelector('input[name="livemarkFolder"]');
    if (hidden) hidden.value = feed.id;
  } catch (e) {
    console.error('[Livemarks] failed to build folder path', e);
    treeContainer.textContent = '(フォルダの情報を取得できません)';
  }

  toggleDialog(dialog.id, true);
}

async function populateFolderSelector(folderSelector, removeBuiltin = false) {
  // Legacy: if a <select> is provided, keep existing behavior
  if (folderSelector && folderSelector.tagName === 'SELECT') {
    const allFolders = await getAllBookmarkFolders();
    const readPrefix = await Settings.getReadPrefix();
    const unreadPrefix = await Settings.getUnreadPrefix();
    folderSelector.textContent = "";
    folderSelector.append(...allFolders.filter(folder => {
      if (removeBuiltin) {
        const builtinIds = ["toolbar_____", "menu________", "unfiled_____", "mobile______"];
        return !builtinIds.includes(folder.id);
      }
      return true;
    }).map(folder => {
      const option = document.createElement("option");
      option.value = folder.id;

      let title = folder.title;
      title = PrefixUtils.removePrefix(readPrefix, title);
      title = PrefixUtils.removePrefix(unreadPrefix, title);

      option.textContent = title;
      return option;
    }));
    const ensureId = arguments.length >= 3 ? arguments[2] : null;
    if (ensureId) {
      if (!Array.from(folderSelector.options).some(o => o.value === ensureId)) {
        try {
          const [node] = await browser.bookmarks.get(ensureId);
          if (node && node.id) {
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = node.title || node.id;
            folderSelector.insertBefore(option, folderSelector.firstChild);
          }
        } catch (e) { }
      }
      folderSelector.value = ensureId;
    } else {
      folderSelector.value = await Settings.getDefaultFolder();
    }
    return;
  }

  // New behavior: if a folder-tree container is provided, render nested tree
  const viewOnly = arguments.length >= 4 ? arguments[3] : false;

  if (folderSelector && folderSelector.classList && folderSelector.classList.contains('folder-tree')) {
    const rootTree = await browser.bookmarks.getTree();
    const livemarksFolders = (await LivemarkStore.getAll()).map(l => l.id);

    const createNode = (node) => {
      if (!node || node.type !== 'folder' || !node.id) return null;

      const li = document.createElement('li');
      li.dataset.id = node.id;
      const toggle = document.createElement('span');
      toggle.className = 'toggle';
      toggle.textContent = (node.children && node.children.length > 0) ? '▸' : '';
      li.appendChild(toggle);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = node.title || '(無題)';
      li.appendChild(label);

      if (node.children && node.children.length > 0) {
        const ul = document.createElement('ul');
        for (const c of node.children) {
          const childLi = createNode(c);
          if (childLi) ul.appendChild(childLi);
        }
        if (ul.children.length > 0) {
          li.appendChild(ul);
          ul.style.display = 'none';
          toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ul.style.display === 'none' || ul.style.display === '') {
              ul.style.display = 'block';
              toggle.textContent = '▾';
            } else {
              ul.style.display = 'none';
              toggle.textContent = '▸';
            }
          });
        }
      }

      // If this node is a livemark folder (a feed's folder), mark it visually but
      // do not allow it to be chosen as a parent target. Still allow expanding.
      const isLivemark = livemarksFolders.includes(node.id);
      if (isLivemark) {
        li.classList.add('livemark-node');
      }

      if (!viewOnly) {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          // If node has children, toggle expand on label click as well
          const childUl = li.querySelector('ul');
          if (childUl) {
            const t = li.querySelector('.toggle');
            if (childUl.style.display === 'none' || childUl.style.display === '') {
              childUl.style.display = 'block';
              if (t) t.textContent = '▾';
            } else {
              childUl.style.display = 'none';
              if (t) t.textContent = '▸';
            }
          }

          // Only allow selection of non-livemark folders as parent targets
          if (!isLivemark) {
            const prev = folderSelector.querySelector('li.selected');
            if (prev) prev.classList.remove('selected');
            li.classList.add('selected');
            const hidden = folderSelector.parentElement.querySelector('input[name="livemarkFolder"]');
            if (hidden) hidden.value = li.dataset.id;
          }
        });
      } else {
        // In viewOnly mode, just allow expand/collapse when clicking the toggle element
        const toggleClick = (e) => {
          e.stopPropagation();
          const childUl = li.querySelector('ul');
          if (childUl) {
            const t = li.querySelector('.toggle');
            if (childUl.style.display === 'none' || childUl.style.display === '') {
              childUl.style.display = 'block';
              if (t) t.textContent = '▾';
            } else {
              childUl.style.display = 'none';
              if (t) t.textContent = '▸';
            }
          }
        };
        const t = li.querySelector('.toggle');
        if (t) t.addEventListener('click', toggleClick);
      }

      return li;
    };

    folderSelector.textContent = '';
    const containerUl = document.createElement('ul');
    for (const top of rootTree) {
      if (!top.children) continue;
      for (const child of top.children) {
        const li = createNode(child);
        if (li) containerUl.appendChild(li);
      }
    }
    folderSelector.appendChild(containerUl);

    const ensureId = arguments.length >= 3 ? arguments[2] : null;
    if (ensureId) {
      const target = folderSelector.querySelector(`li[data-id="${ensureId}"]`);
      if (target) {
        let node = target.parentElement;
        while (node && node !== folderSelector) {
          if (node.tagName === 'UL') {
            node.style.display = 'block';
            const parentLi = node.parentElement;
            if (parentLi) {
              const t = parentLi.querySelector('.toggle');
              if (t) t.textContent = '▾';
            }
          }
          node = node.parentElement;
        }
        target.classList.add('selected');
        const hidden = folderSelector.parentElement.querySelector('input[name="livemarkFolder"]');
        if (hidden) hidden.value = ensureId;
      }
    } else {
      const defaultId = await Settings.getDefaultFolder();
      const defNode = folderSelector.querySelector(`li[data-id="${defaultId}"]`);
      if (defNode) {
        defNode.classList.add('selected');
        const hidden = folderSelector.parentElement.querySelector('input[name="livemarkFolder"]');
        if (hidden) hidden.value = defaultId;
      }
    }
    return;
  }
}

// Create an inline input under the currently selected folder to create a new folder
async function enableInlineNewFolder(dialog) {
  const tree = dialog.querySelector('#livemarkFolderTree');
  if (!tree) return;

  // Use selected node as parent; if none, fallback to default folder
  let parentId = dialog.querySelector('input[name="livemarkFolder"]').value;
  if (!parentId) {
    parentId = await Settings.getDefaultFolder();
  }

  // Find the LI for parent to insert under it
  const parentLi = tree.querySelector(`li[data-id="${parentId}"]`);
  const container = parentLi ? parentLi : tree;

  // Prevent multiple inputs
  if (container.querySelector('.new-folder-input')) return;

  const tempLi = document.createElement('li');
  tempLi.className = 'new-folder-input';
  tempLi.style.padding = '3px';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '新しいフォルダー名';
  input.style.width = '60%';
  tempLi.appendChild(input);

  // If parentLi exists, append under its UL (create if necessary)
  if (parentLi) {
    let ul = parentLi.querySelector('ul');
    if (!ul) {
      ul = document.createElement('ul');
      parentLi.appendChild(ul);
    }
    ul.style.display = 'block';
    const toggle = parentLi.querySelector('.toggle');
    if (toggle) toggle.textContent = '▾';
    ul.insertBefore(tempLi, ul.firstChild);
  } else {
    tree.insertBefore(tempLi, tree.firstChild);
  }

  input.focus();

  const cleanup = () => {
    if (tempLi && tempLi.parentElement) tempLi.parentElement.removeChild(tempLi);
  };

  const createFolder = async (name) => {
    if (!name || !name.trim()) {
      cleanup();
      return;
    }
    try {
      const created = await browser.bookmarks.create({ title: name.trim(), parentId });
      // re-render tree and select the new folder
      await populateFolderSelector(tree, true, created.id);
    } catch (e) {
      console.error('[Livemarks] failed to create folder', e);
      alert('フォルダの作成に失敗しました。コンソールを確認してください。');
    }
  };

  input.addEventListener('keydown', async (ev) => {
    if (ev.key === 'Enter') {
      await createFolder(input.value);
      // If the dialog is in a rebind/change flow, trigger its submit handler
      try {
        if (dialog.dataset.rebindingFeed || dialog.dataset.changingFeed) {
          if (typeof dialog.requestSubmit === 'function') {
            dialog.requestSubmit();
          } else if (typeof dialog.onsubmit === 'function') {
            dialog.onsubmit(new Event('submit'));
          }
        }
      } catch (e) {
        console.warn('[Livemarks] failed to auto-submit after folder creation', e);
      }
    } else if (ev.key === 'Escape') {
      cleanup();
    }
  });

  // blur also cleans up (but give small delay for Enter handler)
  input.addEventListener('blur', () => setTimeout(cleanup, 150));
}

function toggleDialog(id, shown) {
  document.getElementById(id).hidden = !shown;
  document.getElementById("dialog-overlay").hidden = !shown;
}
