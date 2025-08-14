import { app, BrowserWindow } from "electron";
import serve from "electron-serve";
import path from "node:path";

app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 800,
    height: 600
  });

  if (app.isPackaged) {
    serve({
      directory: path.join(__dirname, "../out"),
    })(window).then(() => {
      window.loadURL("app://-");
    });
  } else {
    window.loadURL("http://localhost:3000");
    window.webContents.openDevTools();
    window.webContents.on("did-fail-load", (e, code, desc) => {
      window.webContents.reloadIgnoringCache();
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});