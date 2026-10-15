package app.liubai.planner;

import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.json.JSONObject;

@CapacitorPlugin(name = "DaylightNative")
public class DaylightNativePlugin extends Plugin {
    private static final int MAX_BACKUP_BYTES = 25 * 1024 * 1024;
    private SecureVault vault;
    private volatile boolean exportInFlight;
    private String currentTheme = "light";

    @Override
    public void load() {
        vault = new SecureVault(getContext());
        // Only transient export copies live in cache. Remove abandoned old exports.
        File[] abandoned = exportDirectory().listFiles();
        if (abandoned != null) {
            long cutoff = System.currentTimeMillis() - 24L * 60 * 60 * 1000;
            for (File file : abandoned) if (file.lastModified() < cutoff) file.delete();
        }
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WindowInsetsCompat insets = androidx.core.view.ViewCompat.getRootWindowInsets(getBridge().getWebView());
                if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
                    WindowCompat.getInsetsController(getActivity().getWindow(), getBridge().getWebView())
                        .hide(WindowInsetsCompat.Type.ime());
                    return;
                }
                if (hasListeners("backButton")) notifyListeners("backButton", new JSObject());
                else getActivity().moveTaskToBack(true);
            }
        });
    }

    @PluginMethod
    public void getAccount(PluginCall call) {
        try {
            String account = vault.get("account");
            call.resolve(new JSObject().put("record", account == null ? JSONObject.NULL : new JSONObject(account)));
        } catch (Exception ignored) {
            call.reject("无法读取本机账号，请重新登录。", "SECURE_STORAGE_READ");
        }
    }

    @PluginMethod
    public void setAccount(PluginCall call) {
        JSObject account = call.getObject("record");
        if (!validAccount(account)) {
            call.reject("账号验证信息无效。", "INVALID_ACCOUNT");
            return;
        }
        try {
            vault.put("account", account.toString());
            call.resolve();
        } catch (Exception ignored) {
            call.reject("无法安全保存本机账号，请重试。", "SECURE_STORAGE_WRITE");
        }
    }

    private boolean validAccount(JSObject account) {
        if (account == null || account.optInt("version") != 1) return false;
        String username = account.optString("username", "");
        int iterations = account.optInt("iterations");
        return username.length() > 0 && username.length() <= 200 && username.equals(username.trim())
            && iterations >= 10000 && iterations <= 100000
            && account.optString("salt", "").matches("[A-Za-z0-9_-]{32}")
            && account.optString("hash", "").matches("[A-Za-z0-9_-]{43}");
    }

    @PluginMethod
    public void getCredentials(PluginCall call) {
        try {
            String token = vault.get("credentials");
            call.resolve(new JSObject().put("token", token == null ? JSONObject.NULL : token));
        } catch (Exception ignored) {
            call.reject("无法读取本机同步凭据，请重新登录。", "SECURE_STORAGE_READ");
        }
    }

    @PluginMethod
    public void setCredentials(PluginCall call) {
        String token = call.getString("token");
        if (token == null || !token.matches("[^\\s]{32,512}")) {
            call.reject("同步凭据格式无效。", "INVALID_CREDENTIALS");
            return;
        }
        try {
            vault.put("credentials", token);
            call.resolve();
        } catch (Exception ignored) {
            call.reject("无法安全保存同步凭据，请重试。", "SECURE_STORAGE_WRITE");
        }
    }

    @PluginMethod
    public void clearCredentials(PluginCall call) {
        try {
            vault.remove("credentials");
            call.resolve();
        } catch (Exception ignored) {
            call.reject("无法清除同步凭据，请重试。", "SECURE_STORAGE_WRITE");
        }
    }

    private File exportDirectory() {
        return new File(getContext().getCacheDir(), "planner-exports");
    }

    @PluginMethod
    public void exportBackup(PluginCall call) {
        if (exportInFlight) {
            call.reject("请先完成当前备份的保存。", "EXPORT_BUSY");
            return;
        }
        String content = call.getString("content");
        String name = call.getString("name", "冲冲冲日程备份.json");
        if (content == null || content.length() > MAX_BACKUP_BYTES) {
            call.reject("备份内容过大，请分批导出。", "INVALID_BACKUP");
            return;
        }
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BACKUP_BYTES) {
            call.reject("备份内容过大，请分批导出。", "INVALID_BACKUP");
            return;
        }
        String exportId = UUID.randomUUID().toString();
        File staged = new File(exportDirectory(), exportId + ".json");
        try {
            if (!exportDirectory().isDirectory() && !exportDirectory().mkdirs()) throw new IllegalStateException();
            try (FileOutputStream output = new FileOutputStream(staged)) {
                output.write(bytes);
                output.getFD().sync();
            }
            // Activity state has a small Binder limit: persist a cache ID, never
            // the full backup payload, when the picker backgrounds this activity.
            call.getData().remove("content");
            call.getData().put("exportId", exportId);
            exportInFlight = true;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            String safeName = name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
            if (safeName.length() > 120) safeName = safeName.substring(0, 120);
            if (!safeName.endsWith(".json")) safeName += ".json";
            intent.putExtra(Intent.EXTRA_TITLE, safeName);
            getBridge().executeOnMainThread(() -> {
                try {
                    startActivityForResult(call, intent, "backupSaved");
                } catch (Exception ignored) {
                    exportInFlight = false;
                    staged.delete();
                    call.reject("无法打开文件保存窗口，请重试。", "EXPORT_START");
                }
            });
        } catch (Exception ignored) {
            exportInFlight = false;
            staged.delete();
            call.reject("无法打开文件保存窗口，请重试。", "EXPORT_START");
        }
    }

    @ActivityCallback
    private void backupSaved(PluginCall call, ActivityResult result) {
        exportInFlight = false;
        if (call == null) return;
        String exportId = call.getString("exportId", "");
        if (!exportId.matches("[0-9a-f-]{36}")) {
            call.reject("备份未能完成，请重新导出。", "EXPORT_MISSING");
            return;
        }
        File staged = new File(exportDirectory(), exportId + ".json");
        if (result.getResultCode() != Activity.RESULT_OK) {
            staged.delete();
            call.resolve(new JSObject().put("saved", false));
            return;
        }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        getBridge().execute(() -> {
            try {
                if (destination == null) throw new IllegalStateException();
                try (FileInputStream input = new FileInputStream(staged);
                     OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IllegalStateException();
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    output.flush();
                }
                call.resolve(new JSObject().put("saved", true));
            } catch (Exception ignored) {
                call.reject("备份保存失败，请选择其他位置重试。", "EXPORT_WRITE");
            } finally {
                staged.delete();
            }
        });
    }

    @PluginMethod
    public void setAppearance(PluginCall call) {
        String theme = call.getString("theme", "light");
        if (!theme.equals("light") && !theme.equals("dark")) {
            call.reject("主题无效。", "INVALID_THEME");
            return;
        }
        getBridge().executeOnMainThread(() -> {
            currentTheme = theme;
            applyAppearance();
            call.resolve();
        });
    }

    private void applyAppearance() {
        boolean light = currentTheme.equals("light");
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(
            getActivity().getWindow(), getActivity().getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
        getActivity().getWindow().getDecorView().setBackgroundColor(Color.parseColor(light ? "#f7f5ef" : "#191919"));
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration configuration) {
        // Apply after built-in SystemBars has processed rotation or device theme.
        getBridge().executeOnMainThread(this::applyAppearance);
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        getBridge().executeOnMainThread(() -> {
            getActivity().moveTaskToBack(true);
            call.resolve();
        });
    }

    @Override
    protected void handleOnResume() {
        notifyListeners("resume", new JSObject());
    }
}
