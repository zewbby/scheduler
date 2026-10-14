# 冲冲冲 Windows

Windows 使用 Electron，界面与数据模型由 React 客户端共享。离线日程保存在所选本地数据目录；通过同一 Cloudflare 服务登录个人账号的设备可共享日程。

## 开发与打包

```powershell
pnpm install
pnpm dev:desktop
pnpm package:win
```

开发脚本启动本地 Vite（`127.0.0.1:5173`）并等待服务就绪，再打开桌面窗口。关闭窗口会结束开发服务器。端口已被占用时脚本明确退出，不会连接到未知服务。

Windows 打包输出在 `release`。`ChongChongChong-Setup-0.6.0.exe` 分别提供软件目录和日程数据目录选择页，安装、升级均可修改数据位置，并创建桌面／开始菜单快捷方式；卸载时保留个人日程。`pnpm package:portable` 可生成免安装版本。当前构建没有代码签名证书。

构建界面后，可运行 `node scripts/smoke-desktop.mjs` 验证桌面启动、沙箱和系统加密。脚本使用单独的临时用户目录，完成后清理，并在 `.artifacts/desktop-smoke.png` 保存截图。

## 桌面接口

首次登录由 Cloudflare 验证账号，成功后在当前系统用户目录生成离线校验记录，通过系统加密保存。安装包和源码不包含个人密码、盐或校验值。在设置底部可以退出登录。离线登录校验仅用于应用入口，本地日程仍由当前 Windows 用户管理。

0.3.0 沿用原应用标识与本地存储键，升级时优先保留旧「留白」数据目录，避免名称变化导致日程丢失。头像预设为三个 SVG 笔记本，也可上传 PNG、JPG 或 WebP；自定义图片会裁成 256 × 256 并同步到 Cloudflare。

0.4.0 使用可选 `time` 字段表示待办的单个时间点，保留旧 `startTime/endTime` 字段。旧日程仍可读取、导入和同步；已有时间区间以开始时间排序，没有时间的保留并排在后面，可点击时间标识补填。完成状态不改变时间顺序。设置默认显示同步状态，仅点击「重新连接云端」时展开账号表单，不展示或手工输入内部同步凭据。

登录标语字体以字形子集随应用打包，无需联网加载。字体来源及许可证在 `public/fonts`。

0.5.0 的设置分为常规、同步、存储三页。常规提供中英文、浅色／深色和黄色／蓝色／桃色点缀；偏好保存在本地。同步页默认显示状态，重连表单折叠。存储页显示实际数据目录、LevelDB 路径及日程数据库占用，支持打开目录、更换位置和导入／导出备份。

0.6.0 汇总后续界面调整，登录页改为全屏双熊与日程本的草地场景。顶部居中显示「Why Not Do It」，账号、密码与登录按钮位于双熊和日程本之间。登录区去掉外层面板和闭合边框，轻透输入与草绿底线融合背景，深棕文字和暖黄按钮保留对比度。插画随安装包本地加载并适应窗口尺寸。月份标题、头像与账号 ID、本月按钮和刷新图标的改进一并纳入此版本。

## 离线数据位置与迁移

升级默认沿用 `%APPDATA%\留白`（旧版本已存在时），否则使用 `%APPDATA%\liubai-planner`。当前位置记在 `%APPDATA%\冲冲冲\storage-location.ini`，采用 UTF-16LE；数据目录与软件安装目录独立。日程、头像和偏好位于数据目录内的 `Local Storage\leveldb`，加密凭据位于该目录根部。

安装页或设置页选择新位置后先记录待迁移路径。重启时，在 Chromium 打开数据库之前复制并校验数据，包括日程、待同步记录、头像、偏好和系统加密凭据；成功后切换到新位置。原目录保留，迁移失败仍使用原目录，并显示错误。更换位置要求空文件夹，拒绝磁盘根目录、软件安装目录及原目录的父／子路径；不会覆盖已有文件。设置页可取消尚未执行的迁移。

首次安装可直接选择空的数据文件夹。自动安装可传入 `/DATA_DIR="D:\日程数据"`；静默升级不传该参数时保持当前路径。便携版可在设置中选择位置。

验证迁移可运行 `node scripts/smoke-migration.mjs`；它使用临时目录检查真实 LevelDB 数据与加密凭据在重启后完整保留。`node scripts/test-installer-storage.mjs` 编译独立 NSIS 测试安装器，验证中文及空格路径、选择位置及再次安装保留路径，不修改真实安装。两个脚本均清理各自生成的临时目录。

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
  storage: {
    info(): Promise<StorageInfo>;
    open(): Promise<void>;
    choose(): Promise<StorageInfo>; // 系统文件夹选择器
    cancel(): Promise<StorageInfo>;
    restart(): Promise<void>;
  };
  appearance: { set(theme: 'light' | 'dark'): Promise<void> };
}
```

同步凭据和离线账号校验分别通过 Electron `safeStorage` 加密写入 `sync-credential.enc` 与 `account-verifier.enc`。系统加密不可用时拒绝保存。浏览器预览仅在内存保存凭据；重新打开页面需要联网登录。

主进程仅接受本应用主框架的 IPC 请求，关闭 Node 集成，启用上下文隔离与沙箱，禁止远程页面替换主窗口。第三方 HTTP/HTTPS 链接交给默认浏览器打开。

窗口顶部保留 36px 拖拽区域，Windows 右侧至少保留 140px 给系统窗口按钮。按钮和其他交互元素使用 `-webkit-app-region: no-drag`；其余标题栏使用 `-webkit-app-region: drag`。

## macOS 与 Android

Electron 主进程已处理 macOS 窗口关闭与重新激活行为，但本次交付只验证 Windows。macOS 需要在 macOS 上打包、签名和公证。

Android 可复用 React 界面、离线数据模型和同一 Cloudflare Worker，同步协议无需另建。后续可通过 Capacitor 提供 Android 壳，并将凭据存取替换成系统安全存储；Android 包不包含在当前 Windows 交付中。

实现参考：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[系统凭据加密](https://www.electronjs.org/docs/latest/api/safe-storage)。
