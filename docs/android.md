# 冲冲冲 Android

Android 第一版沿用 Windows 版的草地登录插画、月卡片和每日待办，使用共享的 React 界面与数据模型，通过 Capacitor 8.5.3 打包为本地应用。版本号为 0.7.0，Android `versionCode` 为 7，应用标识为 `app.liubai.planner`。

## 系统与功能

最低 Android 7.0（API 24），编译及目标 SDK 为 Android 16（API 36）。要求 Chrome／Android System WebView 108 或以上，请保持更新。手机布局保留完整月份，点击日期查看待办；新增、修改时间、完成、改名和删除均有触屏入口。常规设置支持中英文、浅色／深色及三种点缀色，支持头像、搜索、JSON 备份导入与导出。

首次登录需要联网，使用与 Windows 版相同的个人账号及 Cloudflare 服务。成功登录后，离线账号校验记录与同步凭据由 Android Keystore 加密保存；日程与偏好保存在应用私有的 WebView 存储中。断网时修改留在本机，网络恢复或应用返回前台后重试同步。

Android 和 Windows 的本地数据目录互相独立，登录相同工作区并同步后共享日程和头像。首次登录空白设备会拉取云端记录。应用使用现有单账号个人工作区，没有新增注册入口。

## 安装与数据

[GitHub Actions](https://github.com/zewbby/scheduler/actions) 的成功构建在 Artifacts 中提供调试 APK 与 SHA-256 校验文件。下载并解压，在手机上打开 `app-debug.apk`，按 Android 的提示允许当前下载来源安装应用。

该 APK 是使用调试证书签名的预览包。不同机器或不同 CI 运行生成的调试证书可能不同，因此预览包之间可能无法直接覆盖安装。安装前应先同步或导出备份；卸载、清除应用数据会删除本机日程、离线凭据、头像及偏好。云端已同步的数据可在重新登录后恢复，尚未同步的记录需要事先导出。

在设置的「存储」页导出 JSON 时，应用会打开系统文件保存界面；可以选择手机文件夹或系统文件提供方。取消保存不会产生成功提示。导入 JSON 会合并记录并保留待同步修改，不会包含或恢复账号密码和同步凭据。

Android 的存储目录由系统管理，不提供 Windows 版的更换数据目录功能。系统备份不用于迁移 Keystore 凭据；迁移设备时通过云同步或 JSON 备份恢复日程，并重新登录。

## 开发环境

需要 Node.js 24、pnpm 11.25.0、JDK 21，以及包含 API 36 平台和 Build Tools 36.0.0 的 Android SDK。推荐使用 Android Studio 安装 SDK，再设置 `JAVA_HOME` 和 `ANDROID_HOME`，或在本机 `android/local.properties` 中填写 `sdk.dir`。该文件不提交到 Git。

```powershell
corepack enable
corepack install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm android:sync
pnpm android:open
```

`android:sync` 先编译 TypeScript 与 Vite 生产界面，再将 `dist` 复制到 Android 工程。每次修改共享界面或 Capacitor 配置后都应重新同步。应用内置本地界面资源，启动不依赖开发服务器。

## 构建与签名

```powershell
pnpm android:debug
pnpm android:release
```

调试 APK 的 Gradle 输出为 `android/app/build/outputs/apk/debug/app-debug.apk`，构建脚本另复制为 `release/ChongChongChong-0.7.0-Android-debug.apk`。Release 构建默认输出未签名的 `app-release-unsigned.apk`，脚本复制为 `release/ChongChongChong-0.7.0-Android-release-unsigned.apk`。未签名包不能直接安装；正式分发应在 Android Studio 使用「Generate Signed Bundle / APK」，选择保存在仓库之外的长期签名密钥。以后升级必须保留相同应用标识、同一签名密钥，并递增 `versionCode`。

签名密钥、别名密码、证书密码和本机 SDK 路径均不得写入源码或提交到 Git。CI 仅构建调试包，不读取正式签名密钥，也不自动发布 Google Play 或正式版本。

## 验证

```powershell
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm exec playwright test
pnpm android:sync
Push-Location android
.\gradlew.bat assembleDebug lintDebug
Pop-Location
```

单元测试覆盖日程模型、离线账号校验、同步合并、Cloudflare 接口及 Windows 存储迁移。浏览器回归覆盖共享界面的登录、待办、头像、设置和同步；真实账号测试仅在单独提供私密测试凭据时运行。CI 在 Ubuntu 上安装 Chromium，并执行同一套浏览器回归及 Android 构建、lint。

应用自己的 Keystore 仪器测试可在连接模拟器后运行 `android/gradlew :app:connectedDebugAndroidTest`（Windows 使用 `gradlew.bat`，在 `android` 目录执行）。仅测试应用模块，避免运行第三方插件生成工程的测试套件。

原生冒烟脚本仅用于专用临时模拟器：先安装调试 APK，再设置 `ANDROID_SERIAL=emulator-5554` 和 `ANDROID_HOME`，运行 `node scripts/smoke-android.mjs`。它会替换该模拟器中此应用的数据，以临时账号拦截网络请求，检查加密凭据、后台后杀进程再离线登录、待办保留、键盘、返回键，以及系统 Downloads 提供方的备份保存与取消。截图写入 `.artifacts`；不要在存有个人日程的模拟器运行。

浏览器测试与 APK 编译不能替代真机验证。分发前应在实际 Android 设备检查：首次在线登录后杀进程再离线登录；离线新增后恢复网络并与 Windows 双向同步；后台恢复；系统返回键与软键盘；竖屏、横屏及系统栏；头像文件选择；备份保存、取消和重新导入；同一签名下覆盖升级后的数据保留。未执行的真机项目应明确记录在对应版本说明中。

## 实现参考

- [Capacitor Android](https://capacitorjs.com/docs/android)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
- [Android 系统文件保存界面](https://developer.android.com/training/data-storage/shared/documents-files#create-file)
- [Android 应用签名](https://developer.android.com/studio/publish/app-signing)
