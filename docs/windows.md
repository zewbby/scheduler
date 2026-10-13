# 冲冲冲 Windows

Windows 首版使用 Electron，界面与数据模型由 React 客户端共享。离线日程保存在当前用户的应用数据中；连接 Cloudflare Worker 后，使用相同服务地址与同步密钥的设备可共享日程。

## 开发与打包

```powershell
pnpm install
pnpm dev:desktop
pnpm package:win
```

开发脚本启动本地 Vite（`127.0.0.1:5173`）并等待服务就绪，再打开桌面窗口。关闭窗口会结束开发服务器。端口已被占用时脚本明确退出，不会连接到未知服务。

Windows 打包输出在 `release`。`ChongChongChong-Setup-0.3.0.exe` 支持选择目录并创建桌面／开始菜单快捷方式；卸载时保留个人日程。`pnpm package:portable` 可生成免安装版本。当前构建没有代码签名证书。

构建界面后，可运行 `node scripts/smoke-desktop.mjs` 验证桌面启动、沙箱和系统加密。脚本使用单独的临时用户目录，完成后清理，并在 `.artifacts/desktop-smoke.png` 保存截图。

## 桌面接口

首次登录由 Cloudflare 验证账号，成功后在当前系统用户目录生成离线校验记录，通过系统加密保存。安装包和源码不包含个人密码、盐或校验值。在设置底部可以退出登录。离线登录校验仅用于应用入口，本地日程仍由当前 Windows 用户管理。

0.3.0 沿用原应用标识与本地存储键，升级时优先保留旧「留白」数据目录，避免名称变化导致日程丢失。头像预设为三个 SVG 笔记本，也可上传 PNG、JPG 或 WebP；自定义图片会裁成 256 × 256 并同步到 Cloudflare。

渲染层仅通过 `window.daylightDesktop` 接触以下桌面能力：

```ts
interface DaylightDesktop {
  platform: string;
  account: {
    get(): Promise<AccountRecord | null>;
    set(record: AccountRecord): Promise<void>;
  };
  credentials: {
    get(): Promise<string | null>;
    set(token: string): Promise<void>;
    clear(): Promise<void>;
  };
}
```

同步凭据和离线账号校验分别通过 Electron `safeStorage` 加密写入 `sync-credential.enc` 与 `account-verifier.enc`。系统加密不可用时拒绝保存。浏览器预览仅在内存保存凭据；重新打开页面需要联网登录。

主进程仅接受本应用主框架的 IPC 请求，关闭 Node 集成，启用上下文隔离与沙箱，禁止远程页面替换主窗口。第三方 HTTP/HTTPS 链接交给默认浏览器打开。

窗口顶部保留 36px 拖拽区域，Windows 右侧至少保留 140px 给系统窗口按钮。按钮和其他交互元素使用 `-webkit-app-region: no-drag`；其余标题栏使用 `-webkit-app-region: drag`。

## macOS 与 Android

Electron 主进程已处理 macOS 窗口关闭与重新激活行为，但本次交付只验证 Windows。macOS 需要在 macOS 上打包、签名和公证。

Android 可复用 React 界面、离线数据模型和同一 Cloudflare Worker，同步协议无需另建。后续可通过 Capacitor 提供 Android 壳，并将凭据存取替换成系统安全存储；Android 包不包含在当前 Windows 交付中。

实现参考：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[系统凭据加密](https://www.electronjs.org/docs/latest/api/safe-storage)。
