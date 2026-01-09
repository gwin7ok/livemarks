"use strict";

console.log("[Livemarks] LivemarkStore module loaded");

/* import-globals-from prefix-utils.js */
/* import-globals-from settings.js */

const PREFIX = "livemarks.";

function toInternalId(id) {
  return PREFIX + id;
}

function fromInternalId(id) {
  return id.slice(PREFIX.length);
}

/* exported LivemarkStore */
const LivemarkStore = {
  async isLivemarkFolder(id) {
    const livemark = await this.get(id);
    return livemark !== undefined;
  },

  async get(id) {
    const result = await browser.storage.sync.get(toInternalId(id));
    return result[toInternalId(id)];
  },

  async getAll(broken = []) {
    console.log("[Livemarks] LivemarkStore.getAll start");
    const livemarks = await browser.storage.sync.get();

    // Pass in prefixes so they can be removed from the title. We don't get them in
    // _makeDetails to avoid unnecessarily fetching into storage
    const readPrefix = await Settings.getReadPrefix();
    const unreadPrefix = await Settings.getUnreadPrefix();

    const all = [];
    for (const key in livemarks) {
      if (!key.startsWith(PREFIX)) {
        continue;
      }

      const id = fromInternalId(key);
      try {
        const details = await this._makeDetails(id, livemarks[key], {
          readPrefix,
          unreadPrefix,
        });
        all.push(details);
      } catch (e) {
        broken.push({ id, ...livemarks[key] });
        console.error("[Livemarks]", "Found broken bookmark", id, e);
      }
    }

    return all;
  },

  async _logGetAllComplete() {
    console.log("[Livemarks] LivemarkStore.getAll completed");
  },

  async add(feed) {
    const { title, parentId } = feed;
    const bookmark = await browser.bookmarks.create({
      title,
      type: "folder",
      parentId,
    });

    this.addWithBookmark(bookmark.id, feed);
  },

  async addWithBookmark(id, feed) {
    const feedDetails = {
      feedUrl: feed.feedUrl,
      maxItems: feed.maxItems,
    };
    // Preserve title when provided so UI ordering remains stable after rebind/add
    if (feed.title) {
      feedDetails.title = feed.title;
    }
    if (feed.siteUrl) {
      feedDetails.siteUrl = new URL(feed.siteUrl, feed.feedUrl).href;
    } else {
      feedDetails.siteUrl = "";
    }

    await browser.storage.sync.set({
      [toInternalId(id)]: feedDetails
    });
  },

  async remove(bookmarkId) {
    try {
      await browser.bookmarks.removeTree(bookmarkId);
    } catch (e) {
      // Bookmark already deleted
    }

    await browser.storage.sync.remove(toInternalId(bookmarkId));
  },

  async edit(id, feed) {
    const oldFeed = await this.get(id);
    const [oldBookmark] = await browser.bookmarks.get(id);
    if (!oldBookmark || !oldFeed) {
      return;
    }
    // Handle renames
    if (feed.title && feed.title !== oldBookmark.title) {
      await browser.bookmarks.update(id, {
        "title": feed.title,
      });
    }

    // Folder change
    if (feed.parentId && feed.parentId !== oldBookmark.parentId) {
      await browser.bookmarks.move(id, {
        "parentId": feed.parentId,
      });
    }

    if (feed.siteUrl && feed.siteUrl !== oldFeed.siteUrl) {
      oldFeed.siteUrl = feed.siteUrl;
    } else if (feed.siteUrl === "" && oldFeed.siteUrl) {
      // We have to check against "" since we only want to cover the case where
      // the user explicitly set the value to be empty.
      oldFeed.siteUrl = null;
    }

    if (feed.feedUrl && feed.feedUrl !== oldFeed.feedUrl) {
      oldFeed.feedUrl = feed.feedUrl;
    }

    if (feed.maxItems && feed.maxItems !== oldFeed.maxItems) {
      oldFeed.maxItems = feed.maxItems;
    }

    if (feed.updated && feed.updated !== oldFeed.updated) {
      oldFeed.updated = feed.updated;
    }

    // Preserve arbitrary error state when provided by callers.
    if (feed.lastError !== undefined) {
      oldFeed.lastError = feed.lastError;
    }

    await browser.storage.sync.set({ [toInternalId(id)]: oldFeed });
  },

  async _makeDetails(id, { feedUrl, siteUrl, maxItems, updated, lastError, title: storedTitle }, { readPrefix, unreadPrefix }) {
    let title = storedTitle || "";
    let parentId = null;
    let folderMissing = false;

    try {
      const arr = await browser.bookmarks.get(id);
      const bookmark = arr && arr[0];
      if (!bookmark) {
        folderMissing = true;
      } else {
        // If no stored title, fall back to bookmark title
        if (!title) title = bookmark.title || "";
        parentId = bookmark.parentId || null;
      }
    } catch (e) {
      // If bookmark.get throws (id not found), treat as folder missing.
      folderMissing = true;
    }

    let folderEmpty = false;
    if (title) {
      title = PrefixUtils.removePrefix(readPrefix, title);
      title = PrefixUtils.removePrefix(unreadPrefix, title);

      // Check whether the folder currently contains any bookmark children.
      try {
        const children = await browser.bookmarks.getChildren(id);
        // Count bookmark-type children (ignore separators and folders).
        const bookmarkChildren = (children || []).filter(c => c.type === 'bookmark');
        // If there are no bookmark children, mark as empty — this lets the UI
        // show a distinct marker when the folder exists but its items were
        // removed and not re-created by the updater.
        folderEmpty = bookmarkChildren.length === 0;
      } catch (e) {
        // If getChildren fails, we leave folderEmpty false and preserve
        // folderMissing which may be true.
      }
    } else if (!title && folderMissing) {
      // Fallback title when folder is missing — use feedUrl so the user can
      // still identify the entry in the UI.
      title = feedUrl || "(untitled)";
    }

    return {
      title,
      feedUrl,
      siteUrl,
      maxItems,
      parentId,
      updated,
      lastError,
      folderMissing,
      folderEmpty,
      id,
    };
  },

  async getDetails(id) {
    const feed = await this.get(id);
    const readPrefix = await Settings.getReadPrefix();
    const unreadPrefix = await Settings.getUnreadPrefix();
    return this._makeDetails(id, feed, { readPrefix, unreadPrefix });
  },

  addChangeListener(listener) {
    this.listeners.push(listener);
  },

  async init() {
    this.listeners = [];

    try {
      const { livemarks } = await browser.storage.local.get("livemarks");
      if (livemarks) {
        for (const [id, feed] of livemarks) {
          const [bookmark] = await browser.bookmarks.get(id).catch(() => {
            return [];
          });

          if (bookmark === undefined) {
            continue;
          }

          await browser.storage.sync.set({ [toInternalId(bookmark.id)]: feed });
        }

        await browser.storage.local.remove("livemarks");
      }
    } catch (e) {
      console.error("[Livemarks]", "Storage migration failed", e);
    }

    browser.bookmarks.onRemoved.addListener(async id => {
      const isLivemarkFolder = await this.isLivemarkFolder(id);
      if (isLivemarkFolder) {
        await this.remove(id);
      }
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      const changedKeys = [];
      for (const key in changes) {
        if (!key.startsWith(PREFIX)) {
          continue;
        }

        // Creation
        if (!changes[key].oldValue) {
          changedKeys.push(fromInternalId(key));
          continue;
        }

        // Deletion
        if (!changes[key].newValue) {
          changedKeys.push(fromInternalId(key));
          continue;
        }

        // Important: the `updated` field must not be considered!
        const { feedUrl, maxItems, siteUrl } = changes[key].newValue;
        const old = changes[key].oldValue;
        if (old.feedUrl !== feedUrl || old.maxItems !== maxItems ||
          old.siteUrl !== siteUrl) {
          changedKeys.push(fromInternalId(key));
        }
      }

      if (changedKeys.length > 0) {
        console.log('[Livemarks] storage.onChanged detected keys', changedKeys, 'rawChanges:', changes);
        this.listeners.forEach(listener => {
          try {
            listener({ changedKeys });
          } catch (e) {
            console.error('[Livemarks] listener threw', e);
          }
        });

        // Also notify background via runtime message to ensure the updater
        // running in the background context receives the change even if its
        // local listener did not run for any reason.
        try {
          if (browser && browser.runtime && typeof browser.runtime.sendMessage === 'function') {
            browser.runtime.sendMessage({ msg: 'livemarks.changed', changedKeys }).catch(() => { });
          }
        } catch (e) {
          // ignore failures
        }
      }
    });
  }
};
