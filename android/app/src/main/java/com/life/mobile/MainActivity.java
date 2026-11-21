package com.life.mobile;

import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Only the debug APK can contact the temporary HTTP DEV API. Its
        // debug-only Network Security Config permits that exact IP and denies
        // every other cleartext destination. Android 6 has no per-host policy,
        // so keep HTTP blocked there instead of adding a global exception.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                && getBridge() != null) {
            getBridge().getWebView().getSettings()
                    .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
    }
}
