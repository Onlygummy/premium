import "@ghostery/adblocker-electron-preload";
import { contextBridge } from "electron";

// ถ้าจะ expose API อื่นของคุณเอง ก็ทำต่อได้ตามปกติ
contextBridge.exposeInMainWorld("app", {
  /* ... */
});
