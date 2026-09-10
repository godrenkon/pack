package com.suiram.whiteroom;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int EXPORT_BACKUP_REQUEST = 4101;
    private static final int IMPORT_BACKUP_REQUEST = 4102;
    private static final String LATEST_RELEASE_API = "https://api.github.com/repos/godrenkon/pack/releases/latest";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private byte[] pendingBackup;
    private boolean updateChecked;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                checkForUpdate();
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(new SaveBridge(), "AndroidSave");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    private final class SaveBridge {
        @JavascriptInterface
        public void exportBackup(String base64) {
            try {
                pendingBackup = Base64.decode(base64, Base64.DEFAULT);
                mainHandler.post(() -> {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, "white-room-clicker-save.json");
                    startActivityForResult(intent, EXPORT_BACKUP_REQUEST);
                });
            } catch (IllegalArgumentException error) {
                mainHandler.post(() -> Toast.makeText(MainActivity.this, "バックアップの作成に失敗しました", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void requestImport() {
            mainHandler.post(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.setType("application/json");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(intent, IMPORT_BACKUP_REQUEST);
            });
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        try {
            if (requestCode == EXPORT_BACKUP_REQUEST && pendingBackup != null) {
                try (OutputStream output = getContentResolver().openOutputStream(uri)) {
                    if (output == null) throw new IllegalStateException("No output stream");
                    output.write(pendingBackup);
                }
                pendingBackup = null;
                Toast.makeText(this, "バックアップを保存しました", Toast.LENGTH_SHORT).show();
            } else if (requestCode == IMPORT_BACKUP_REQUEST) {
                byte[] bytes;
                try (InputStream input = getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IllegalStateException("No input stream");
                    bytes = readAllBytes(input);
                }
                String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                webView.evaluateJavascript("window.__receiveAndroidBackup(" + JSONObject.quote(base64) + ");", null);
            }
        } catch (Exception error) {
            Toast.makeText(this, "バックアップを処理できませんでした", Toast.LENGTH_SHORT).show();
        }
    }

    private byte[] readAllBytes(InputStream input) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
        return output.toByteArray();
    }

    private void checkForUpdate() {
        if (updateChecked) return;
        updateChecked = true;
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(LATEST_RELEASE_API).openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "WhiteRoomClicker-Android");
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;
                String json = readText(connection.getInputStream());
                JSONObject release = new JSONObject(json);
                String tag = release.optString("tag_name", "");
                String newestVersion = tag.startsWith("v") ? tag.substring(1) : tag;
                if (!isNewerVersion(newestVersion, BuildConfig.VERSION_NAME)) return;
                JSONArray assets = release.optJSONArray("assets");
                if (assets == null || assets.length() == 0) return;
                String downloadUrl = assets.getJSONObject(0).optString("browser_download_url", "");
                if (downloadUrl.isEmpty()) return;
                mainHandler.post(() -> showUpdateDialog(newestVersion, downloadUrl));
            } catch (Exception ignored) {
                // Offline play should never be blocked by an update check.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private String readText(InputStream input) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private boolean isNewerVersion(String candidate, String current) {
        String[] candidateParts = candidate.split("\\.");
        String[] currentParts = current.split("\\.");
        for (int index = 0; index < Math.max(candidateParts.length, currentParts.length); index++) {
            int left = index < candidateParts.length ? parseVersionPart(candidateParts[index]) : 0;
            int right = index < currentParts.length ? parseVersionPart(currentParts[index]) : 0;
            if (left != right) return left > right;
        }
        return false;
    }

    private int parseVersionPart(String value) {
        try { return Integer.parseInt(value.replaceAll("[^0-9]", "")); }
        catch (NumberFormatException error) { return 0; }
    }

    private void showUpdateDialog(String version, String url) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
                .setTitle("新しいアップデートがあります")
                .setMessage("v" + version + " をダウンロードできます。")
                .setNegativeButton("あとで", null)
                .setPositiveButton("更新する", (dialog, which) -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))))
                .show();
    }
}
