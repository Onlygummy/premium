import type { App } from "electron"; // สำหรับ type ใน TS
import { app, BrowserWindow, Menu, WebContentsView } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Shield from "./libs/shield.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ปิดเมนูเริ่มต้นเพื่อประหยัดทรัพยากร
Menu.setApplicationMenu(null);

const createWindow = () => {
  let mainWindow: BrowserWindow;
  let view: WebContentsView;

  mainWindow = new BrowserWindow({
    width: 900,
    height: 900,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      sandbox: true,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(join(__dirname, "..", "view", "main.html"));

  mainWindow.webContents.on("did-finish-load", async () => {
    view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    });

    view.setBounds({
      x: 0,
      y: 32,
      width: mainWindow.getBounds().width - 12,
      height: mainWindow.getBounds().height - 24,
    });

    view.webContents.on("console-message", (e) => e.preventDefault());

    //เพิ่ม shield ให้กับ view
    const shield = new Shield();
    await shield.adblock(view);

    view.webContents.loadURL("https://youtube.com");
    mainWindow.contentView.addChildView(view);

    view.webContents.on("did-finish-load", () => {
      //view.webContents.openDevTools({ mode: "right" });
    });
  });

  mainWindow.on("resize", () => {
    view.setBounds({
      x: 0,
      y: 32,
      width: mainWindow.getBounds().width - 12,
      height: mainWindow.getBounds().height - 24,
    });
  });

  getResourceUsage(app, mainWindow);
};

app.whenReady().then(() => {
  app.commandLine.appendSwitch("disable-logging");
  app.commandLine.appendSwitch("disable-breakpad");

  createWindow();
});

const getResourceUsage = (app: App, window: BrowserWindow) => {
  if (!window) return;

  window.webContents.once("did-finish-load", () => {
    const pid = window!.webContents.getOSProcessId();

    setInterval(() => {
      const metrics = app.getAppMetrics();
      const mainMetrics = metrics.find((m: any) => m.pid === pid);

      if (mainMetrics) {
        const cpu = (mainMetrics.cpu.percentCPUUsage * 100).toFixed(2) + "%";
        const mem =
          (mainMetrics.memory.workingSetSize / 1024 / 1024).toFixed(2) + " MB";

        console.log(`[mainWindow] CPU: ${cpu}, RAM: ${mem}`);
      } else {
        console.log("ยังไม่เจอ metrics ของ mainWindow");
      }
    }, 1000); // แก้เป็น 60000 สำหรับ 1 นาที (ถ้าต้องการ)
  });
};

/*session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders || {};

    // ลบ X-Frame-Options และ CSP ทั้งหมด
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "x-frame-options" || lower === "content-security-policy") {
        delete headers[key];
      }
    }

    // จะใส่ CSP ใหม่ของเราก็ได้ หรือปล่อยว่างไปเลย
    // headers["Content-Security-Policy"] = ["frame-ancestors http: https:"];

    callback({ responseHeaders: headers });
  });*/
