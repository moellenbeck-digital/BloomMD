package app.bloommd.keychain

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Logger
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import org.json.JSONObject
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keeps small secrets (the app sign-in token) encrypted with an AES-256-GCM key that lives in the
 * Android Keystore and never leaves it. Only the ciphertext is stored in private SharedPreferences;
 * the entry's key name is bound to it as associated data. A ciphertext that cannot be decrypted
 * any more (e.g. restored from a backup onto another device, whose Keystore lacks the key) is
 * treated as missing and deleted.
 */
@CapacitorPlugin(name = "BloomKeychain")
class BloomKeychainPlugin : Plugin() {
    private val keyPattern = Regex("^[A-Za-z0-9._-]{1,64}$")

    private val prefs: SharedPreferences
        get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun validKey(call: PluginCall): String? {
        val key = call.getString("key")
        if (key == null || !keyPattern.matches(key)) {
            call.reject("Invalid key.", "INVALID_KEY")
            return null
        }
        return key
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val key = validKey(call) ?: return
        val stored = prefs.getString(key, null)
        val result = JSObject()
        if (stored == null) {
            result.put("value", JSONObject.NULL)
            call.resolve(result)
            return
        }
        try {
            result.put("value", decrypt(key, stored))
        } catch (error: Exception) {
            Logger.warn(TAG, "Stored value could not be decrypted and was removed: ${error.javaClass.simpleName}")
            prefs.edit().remove(key).apply()
            result.put("value", JSONObject.NULL)
        }
        call.resolve(result)
    }

    @PluginMethod
    fun set(call: PluginCall) {
        val key = validKey(call) ?: return
        val value = call.getString("value")
        if (value == null || value.toByteArray(Charsets.UTF_8).size > MAX_VALUE_BYTES) {
            call.reject("Invalid value.", "INVALID_VALUE")
            return
        }
        try {
            if (!prefs.edit().putString(key, encrypt(key, value)).commit()) {
                call.reject("The value could not be written.", "WRITE_FAILED")
                return
            }
            call.resolve()
        } catch (error: Exception) {
            call.reject("The value could not be encrypted.", "WRITE_FAILED", error)
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val key = validKey(call) ?: return
        if (!prefs.edit().remove(key).commit()) {
            call.reject("The value could not be removed.", "REMOVE_FAILED")
            return
        }
        call.resolve()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(key: String, value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        // The Keystore picks a fresh random IV for every encryption.
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP)
    }

    private fun decrypt(key: String, stored: String): String {
        val bytes = Base64.decode(stored, Base64.NO_WRAP)
        require(bytes.size > IV_BYTES) { "ciphertext too short" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES))
        cipher.updateAAD(key.toByteArray(Charsets.UTF_8))
        return String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
    }

    companion object {
        private const val TAG = "BloomKeychain"
        private const val PREFS = "bloommd_keychain"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "bloommd.keychain.v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_BYTES = 12
        private const val TAG_BITS = 128
        private const val MAX_VALUE_BYTES = 16 * 1024
    }
}
