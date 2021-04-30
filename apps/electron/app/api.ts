/**
=========================================================================
Copyright 2019 T-Mobile, USA

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
See the LICENSE file for additional language around disclaimer of warranties.

Trademark Disclaimer: Neither the name of “T-Mobile, USA” nor the names of
its contributors may be used to endorse or promote products derived from this
software without specific prior written permission.
===========================================================================
*/

import * as fs from "fs";
import * as _path from "path";
import * as electron from "electron";

import { File, FileTypes } from "./File";

export const path = _path;

export const CHANNELS = {
  OPEN_FOLER: "percy-open-folder",
  OPEN_REPO: "percy-open-repo",
  SHOW_PREFERENCES: "percy-show-perferences"
};

/**
 * Register renderer ipc events listeners.
 * @param listeners the ipc events listeners.
 */
export function registerRendererListeners(listeners: Record<string, (arg?: string) => void>): void {
  electron.ipcRenderer.on(
    CHANNELS.OPEN_FOLER,
    (_event: electron.IpcRendererEvent, folder: string) => {
      listeners.openFolder(folder);
    }
  );

  electron.ipcRenderer.on(CHANNELS.OPEN_REPO, () => {
    listeners.openRepo();
  });

  electron.ipcRenderer.on(CHANNELS.SHOW_PREFERENCES, () => {
    listeners.showPreferences();
  });
}

/**
 * Get app.
 * @returns electron app
 */
function getApp() {
  return electron.app || electron.remote.app;
}

/**
 * Get state file path.
 * @returns state file path
 */
function getStateFile() {
  return path.resolve(getApp().getPath("userData"), "state.json");
}

/**
 * Get state.
 * @returns state
 */
function getState() {
  const statFile = getStateFile();

  const result = readFile(statFile);
  if (result) {
    return JSON.parse(result);
  }

  return {};
}

/**
 * Get recent folders.
 * @returns recent folders.
 */
export function getRecentFolders() : string[] {
  return getState().recentFolders || [];
}

/**
 * Clear recent folders.
 */
export function clearRecentFolders(): void {
  const state = getState();
  state.recentFolders = [];
  fs.writeFileSync(getStateFile(), JSON.stringify(state));
}

/**
 * Add recent folder.
 * @param folderPath the folder path to add
 */
function addRecentFolder(folderPath: string) {
  const state = getState();
  state.recentFolders = state.recentFolders || [];
  const idx = state.recentFolders.indexOf(folderPath);
  if (idx >= 0) {
    state.recentFolders.splice(idx, 1);
  }
  state.recentFolders.unshift(folderPath);
  state.recentFolders = state.recentFolders.slice(0, 10);
  fs.writeFileSync(getStateFile(), JSON.stringify(state));
}

/**
 * Get current browser window.
 * @param win The passed in browser window
 * @returns current browser window
 */
function getBrowserWindow(win?: Electron.BrowserWindow) {
  return win || electron.remote.getCurrentWindow();
}

/**
 * Open folder.
 * @param folerPath The folder path
 * @param win The browser window
 */
export function openFolder(folerPath: string, win?: Electron.BrowserWindow): void {
  win = getBrowserWindow(win);

  if (!fs.existsSync(folerPath)) {
    (electron.dialog || electron.remote.dialog).showErrorBox(
      "Folder not found",
      `Folder ${folerPath} does not exist`
    );
    return;
  }
  addRecentFolder(folerPath);
  win.webContents.send(CHANNELS.OPEN_FOLER, folerPath);
  win["setupMenu"]();
}

/**
 * Open folder dialog.
 * @param win The browser window
 */
export function openFolderDialog(win?: Electron.BrowserWindow): void {
  win = getBrowserWindow(win);

  (electron.dialog || electron.remote.dialog).showOpenDialog(
    win,
    { properties: ["openDirectory"] }
  ).then(result => {
    if (result && result.filePaths && result.filePaths[0]) {
        openFolder(result.filePaths[0], win);
      }
  }).catch(error => {
      console.log(error); 
  });
}

/**
 * Open repo.
 * @param win The browser window
 */
export function openRepo(win?: Electron.BrowserWindow): void {
  win = getBrowserWindow(win);
  win.webContents.send(CHANNELS.OPEN_REPO);
}

/**
 * Get preferences file.
 * @returns the preferences file path
 */
function getPreferencesFile() {
  return path.resolve(getApp().getPath("userData"), "preferences.json");
}

/**
 * Get preferences.
 * @returns preferences
 */
export function getPreferences(): Record<string, unknown> {
  const prefFile = getPreferencesFile();

  const result = readFile(prefFile);
  if (result) {
    return JSON.parse(result);
  }

  // Return default settings.
  const defaultConf = readFile(
    path.resolve(getApp().getAppPath(), "dist/percy.conf.json")
  );
  return JSON.parse(defaultConf);
}

/**
 * Show preferences.
 * @param win The browser window
 */
export function showPreferences(win?: Electron.BrowserWindow): void {
  win = getBrowserWindow(win);
  win.webContents.send(CHANNELS.SHOW_PREFERENCES);
}

/**
 * Save preferences.
 * @param prefs The preferences to save
 */
export function savePreferences(prefs: Record<string, unknown>): void {
  const prefFile = getPreferencesFile();
  fs.writeFileSync(prefFile, JSON.stringify(prefs));
}

/**
 * Get app's specific percy config.
 * @param file The file to get its specific percy config
 */
export function getAppPercyConfig(file: File): Record<string, string> {
  let appPercyConfig = {};
  let parent = file.parent;
  while (parent) {
    const rcpath = path.resolve(parent.path, ".percyrc");

    const result = readFile(rcpath);
    if (result) {
      const config = JSON.parse(result);
      Object.keys(appPercyConfig).forEach(key => {
        config[key] = appPercyConfig[key];
      });
      appPercyConfig = config;
    }
    parent = parent.parent;
  }
  return appPercyConfig;
}

/**
 * Construct new folder instance.
 * @param folderPath the folder path
 * @param parent the parent folder
 * @returns new folder instance
 */
export function constructFolder(folderPath: string, parent?: File): File {
  const folder = new File(
    path.normalize(folderPath),
    path.basename(folderPath),
    false,
    parent
  );
  folder.applicationName = parent
    ? parent.applicationName + "/" + folder.fileName
    : folder.fileName;
  return folder;
}

/**
 * Populate folder.
 * @param folder The folder to populate
 */
export function populateFolder(folder: File): void {
  if (folder.folderPopulated) {
    return;
  }
  folder.children = [];

  const files = fs.readdirSync(folder.path);
  files.forEach(fileName => {
    const filePath = path.resolve(folder.path, fileName);
    const stat = fs.statSync(filePath);

    if (
      stat.isDirectory() &&
      fileName !== ".git" &&
      fileName !== ".vscode" &&
      fileName !== "node_modules"
    ) {
      // ignore some well-know folders
      folder.addChild(constructFolder(filePath, folder));
    } else if (stat.isFile()) {
      const ext = path.extname(fileName).toLowerCase();
      if (ext === ".yaml" || ext === ".yml" || ext === ".md" || fileName === ".percyrc") {
        const fileType: FileTypes = fileName === ".percyrc" ? FileTypes.PERCYRC : (ext === ".md" ? FileTypes.MD : FileTypes.YAML);

        const file = new File(filePath, fileName, true, folder, fileType);
        file.applicationName = folder.applicationName;
        folder.addChild(file);
      }
    }
  });

  folder.folderPopulated = true;
}

/**
 * Read file.
 * @param filePath The file path to read
 * @returns file content
 */
export function readFile(filePath: string): string | null {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8");
  }
  return null;
}

/**
 * Save file.
 * @param filePath The file path to save
 * @param fileContent The file content to save
 */
export function saveFile(filePath: string, fileContent: string): void {
  fs.writeFileSync(filePath, fileContent);
}

/**
 * Remove file.
 * @param filePath The file path to remove
 */
export function removeFile(filePath: string): void {
  fs.unlinkSync(filePath);
}

/**
 * Watch file.
 * @param filePath The file path to watch
 * @param callback The callback function
 */
export function watchFile(filePath: string, callback: (event: string) => void): void {
  fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
    if (!fs.existsSync(filePath)) {
      callback("deleted");
    } else if (curr.mtimeMs !== prev.mtimeMs) {
      callback("changed");
    }
  });
}

/**
 * Unwatch file.
 * @param filePath The file path to unwatch
 */
export function unwatchFile(filePath: string): void {
  fs.unwatchFile(filePath);
}
