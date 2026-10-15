package app.liubai.planner;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Encrypts each record with a device-bound, non-exportable Android Keystore key. */
final class SecureVault {
    private static final String KEY_ALIAS = "app.liubai.planner.credentials.v1";
    private final SharedPreferences preferences;

    SecureVault(Context context) {
        preferences = context.getSharedPreferences("daylight_secure_v1", Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    synchronized void put(String name, String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        JSONObject envelope = new JSONObject()
            .put("version", 1)
            .put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
        if (!preferences.edit().putString(name, envelope.toString()).commit()) {
            throw new IllegalStateException("Unable to save secure record");
        }
    }

    synchronized String get(String name) throws Exception {
        String raw = preferences.getString(name, null);
        if (raw == null) return null;
        try {
            JSONObject envelope = new JSONObject(raw);
            if (envelope.getInt("version") != 1) throw new IllegalStateException("Invalid secure record");
            byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
            byte[] ciphertext = Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP);
            if (iv.length != 12 || ciphertext.length < 16) throw new IllegalStateException("Invalid secure record");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception unreadable) {
            // A restored or invalidated key cannot decrypt old records. Clear only
            // credentials so the next online login can recover without losing tasks.
            preferences.edit().remove("account").remove("credentials").commit();
            if (unreadable instanceof KeyPermanentlyInvalidatedException || unreadable instanceof UnrecoverableKeyException) {
                // Remove an unusable device key so an online login can create a
                // replacement. A single corrupt ciphertext must not erase a key.
                KeyStore store = KeyStore.getInstance("AndroidKeyStore");
                store.load(null);
                store.deleteEntry(KEY_ALIAS);
            }
            return null;
        }
    }

    synchronized void remove(String name) {
        if (!preferences.edit().remove(name).commit()) {
            throw new IllegalStateException("Unable to clear secure record");
        }
    }
}
