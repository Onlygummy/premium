//preload ควรเขียนแบบ CommonJS
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("api", {
  value: "Hello from preload!",
});
