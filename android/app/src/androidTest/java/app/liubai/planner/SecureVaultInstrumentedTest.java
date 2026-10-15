package app.liubai.planner;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class SecureVaultInstrumentedTest {
    private SharedPreferences preferences;
    private Context isolatedContext;

    @Before
    public void prepare() {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Isolate test data from the app's real account and credentials.
        isolatedContext = new ContextWrapper(app) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                return super.getSharedPreferences(name + ".instrumentation", mode);
            }
        };
        preferences = isolatedContext.getSharedPreferences("daylight_secure_v1", Context.MODE_PRIVATE);
        assertTrue(preferences.edit().clear().commit());
    }

    @After public void cleanup() {
        preferences.edit().clear().commit();
    }

    @Test public void recordsAreEncryptedAndSurviveNewVaultInstance() throws Exception {
        String token = "test-only-credentials-01234567890123456789";
        SecureVault vault = new SecureVault(isolatedContext);
        vault.put("credentials", token);
        assertFalse(preferences.getString("credentials", "").contains(token));
        assertEquals(token, new SecureVault(isolatedContext).get("credentials"));
        vault.put("account", "test-only-verifier");
        vault.remove("credentials");
        assertNull(vault.get("credentials"));
        assertEquals("test-only-verifier", vault.get("account"));
    }

    @Test public void swappingEncryptedRecordsCannotBypassAuthentication() throws Exception {
        SecureVault vault = new SecureVault(isolatedContext);
        vault.put("account", "test-only-verifier");
        assertTrue(preferences.edit().putString("credentials", preferences.getString("account", "")).commit());
        assertNull(vault.get("credentials"));
        assertNull(vault.get("account"));
    }
}
