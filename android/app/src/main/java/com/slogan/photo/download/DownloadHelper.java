package com.slogan.photo.download;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.URLUtil;

public class DownloadHelper {

    private final Context context;

    public DownloadHelper(Context context) {
        this.context = context;
    }

    public long downloadFile(String url, String filename) {
        if (!URLUtil.isValidUrl(url)) {
            return -1;
        }

        DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));

        request.setTitle(filename != null ? filename : URLUtil.guessFileName(url, null, null));
        request.setDescription("正在下载...");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
            "拾光谣/" + (filename != null ? filename : URLUtil.guessFileName(url, null, null)));
        request.setAllowedOverMetered(true);
        request.setAllowedOverRoaming(true);

        return downloadManager.enqueue(request);
    }
}
