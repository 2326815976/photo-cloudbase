package com.slogan.photo;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class ClipboardBridge {
    private final Context context;
    private final ClipboardManager clipboardManager;

    public ClipboardBridge(Context context) {
        this.context = context;
        this.clipboardManager = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
    }

    @JavascriptInterface
    public String getClipboardText() {
        try {
            if (clipboardManager != null && clipboardManager.hasPrimaryClip()) {
                ClipData clipData = clipboardManager.getPrimaryClip();
                if (clipData != null && clipData.getItemCount() > 0) {
                    ClipData.Item item = clipData.getItemAt(0);
                    CharSequence text = item.getText();
                    if (text != null) {
                        return text.toString();
                    }
                }
            }
            return "";
        } catch (Exception e) {
            e.printStackTrace();
            return "";
        }
    }

    @JavascriptInterface
    public void setClipboardText(String text) {
        try {
            if (clipboardManager != null && text != null) {
                ClipData clipData = ClipData.newPlainText("text", text);
                clipboardManager.setPrimaryClip(clipData);

                if (context instanceof MainActivity) {
                    ((MainActivity) context).runOnUiThread(() ->
                        Toast.makeText(context, "已复制到剪贴板", Toast.LENGTH_SHORT).show()
                    );
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @JavascriptInterface
    public boolean hasClipboardText() {
        try {
            return clipboardManager != null &&
                   clipboardManager.hasPrimaryClip() &&
                   clipboardManager.getPrimaryClip() != null &&
                   clipboardManager.getPrimaryClip().getItemCount() > 0;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }
}
