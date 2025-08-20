// src/adblock/Shield.ts
import { ElectronBlocker } from "@ghostery/adblocker-electron";
import fetch from "cross-fetch";
import type { Session, WebContentsView } from "electron";
import { app, session as electronSession } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

const BRAVE_COMPAT_LISTS: string[] = [
  // EasyList core
  "https://easylist.to/easylist/easylist.txt",
  "https://easylist.to/easylist/easyprivacy.txt",

  // uBO core
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt",
  "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt",

  // Brave-specific
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-firstparty.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-social.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-specific.txt",
  "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt",
];

export default class Shield {
  private blockerPromise: Promise<ElectronBlocker> | null = null;
  private sessions = new Set<Session>();
  private autoTimer: NodeJS.Timeout | null = null;
  private readonly engineCachePath = path.join(
    app.getPath("userData"),
    "adblock-engine.bin"
  );

  constructor() {
    console.log("[Shield] running…");
  }

  /** เปิดบล็อกใน session ของ view นั้น ๆ (ถ้าไม่ส่ง view จะใช้ defaultSession) */
  public async adblock(target?: WebContentsView | Session) {
    const blocker = await this.getBlocker();
    const ses: Session =
      (target as WebContentsView)?.webContents?.session ??
      (target as Session) ??
      electronSession.defaultSession;

    blocker.enableBlockingInSession(ses);
    this.sessions.add(ses);
  }

  /** สั่งอัปเดตลิสต์ “ตอนนี้” โดยการ rebuild engine แล้วสลับตัวใช้งาน */
  public async updateListsNow() {
    await this.rebuildEngineFromLists();
    console.log("[Shield] lists updated (reloaded engine).");
  }

  /** โหลดจากแคชถ้ามี ไม่มีก็สร้างจากลิสต์ แล้วตั้ง auto update */
  private async getBlocker(): Promise<ElectronBlocker> {
    if (this.blockerPromise) return this.blockerPromise;

    this.blockerPromise = (async () => {
      // 1) ลอง deserialize จากแคช
      try {
        const buf = await fs.readFile(this.engineCachePath);
        const blocker = ElectronBlocker.deserialize(buf);
        this.ensureAutoUpdate();
        return blocker;
      } catch {
        // ไม่มี/อ่านแคชไม่สำเร็จ → ไปสร้างใหม่
      }

      // 2) สร้างจากลิสต์ครั้งแรก แล้วแคช
      const blocker = await ElectronBlocker.fromLists(
        fetch as any,
        BRAVE_COMPAT_LISTS,
        { enableCompression: true }
      );
      await fs.writeFile(this.engineCachePath, blocker.serialize());
      this.ensureAutoUpdate();
      return blocker;
    })();

    return this.blockerPromise;
  }

  /** ตั้งอัปเดตอัตโนมัติด้วยการ rebuild engine ใหม่ */
  private ensureAutoUpdate() {
    if (this.autoTimer) return;
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    this.autoTimer = setInterval(
      () => this.rebuildEngineFromLists(),
      SIX_HOURS
    );
  }

  /** ดึงลิสต์ล่าสุด → สร้าง engine ใหม่ → สลับใช้งานในทุก session */
  private async rebuildEngineFromLists() {
    const oldBlocker = await this.blockerPromise; // อาจเป็น null ครั้งแรก
    const newBlocker = await ElectronBlocker.fromLists(
      fetch as any,
      BRAVE_COMPAT_LISTS,
      { enableCompression: true }
    );

    // เซฟแคชเผื่อบูตครั้งถัดไปเร็ว
    await fs.writeFile(this.engineCachePath, newBlocker.serialize());

    // สลับตัวบล็อกในทุก session ที่เราเคย enable
    if (oldBlocker) {
      for (const ses of this.sessions) {
        try {
          oldBlocker.disableBlockingInSession(ses);
        } catch {}
      }
    }
    for (const ses of this.sessions) {
      newBlocker.enableBlockingInSession(ses);
    }

    // ชี้ promise ไปยังตัวใหม่
    this.blockerPromise = Promise.resolve(newBlocker);
  }
}
