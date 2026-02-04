package com.slogan.photo.download;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Download")
public class DownloadPlugin extends Plugin {

    private DownloadHelper downloadHelper;

    @Override
    public void load() {
        downloadHelper = new DownloadHelper(getContext());
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");

        if (url == null || url.isEmpty()) {
            call.reject("URL不能为空");
            return;
        }

        long downloadId = downloadHelper.downloadFile(url, filename);

        if (downloadId == -1) {
            call.reject("下载失败：无效的URL");
            return;
        }

        JSObject ret = new JSObject();
        ret.put("downloadId", downloadId);
        ret.put("message", "下载已开始");
        call.resolve(ret);
    }
}
