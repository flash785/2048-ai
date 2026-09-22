# 2048 PWA 使用说明

## 本机预览

PWA 不能通过双击 `index.html` 完整运行离线安装功能，需要用本机服务器打开。

在项目文件夹中打开 PowerShell，运行：

```powershell
python -m http.server 8000
```

随后访问 `http://localhost:8000`。

## 发布到手机和其他电脑

把整个项目文件夹上传到任意支持 HTTPS 的静态网站托管服务即可，不需要数据库或后端。发布时必须保留这些文件及其相对位置：

- `index.html`
- `script.js`
- `style.css`
- `manifest.webmanifest`
- `service-worker.js`
- `icons/icon-192.png`
- `icons/icon-512.png`

## 安装方法

### Windows、macOS 和 Android

使用 Chrome 或 Edge 打开发布后的 HTTPS 地址。浏览器支持安装时，游戏底部会出现“安装到设备”按钮，也可以使用地址栏中的安装图标。

### iPhone 和 iPad

使用 Safari 打开网站，点击“分享”，然后选择“添加到主屏幕”。iOS 不一定显示浏览器安装弹窗，这是正常现象。

## 离线运行

设备成功访问一次并完成缓存后，即使暂时断网，也可以从桌面图标启动游戏。最佳分数仍保存在每台设备自己的浏览器中。

## 更新游戏

重新上传修改后的文件即可。应用会在联网时后台获取新版本，通常下一次启动或刷新后生效。
