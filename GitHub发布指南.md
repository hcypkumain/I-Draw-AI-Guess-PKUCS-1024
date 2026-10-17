# 1024节 · GitHub 上传与在线试玩指南

本项目是可直接托管的静态网页。推荐使用 GitHub 仓库保存文件、GitHub Pages 提供试玩链接。GitHub Free 可以对公开仓库使用 Pages。

你的仓库：[hcypkumain/I-Draw-AI-Guess-PKUCS-1024](https://github.com/hcypkumain/I-Draw-AI-Guess-PKUCS-1024)。在线试玩：[1024节 · 我画 AI 猜](https://hcypkumain.github.io/I-Draw-AI-Guess-PKUCS-1024/)。下面保留首次配置与后续更新的方法，已有网站更新时直接修改文件并提交即可。

## 用网页上传，无需安装 Git

1. 登录 GitHub，打开上面的已有仓库，无需再创建新仓库。
2. 仓库为空时，在页面中点击 `uploading an existing file`。以后更新已有仓库时使用 `Add file` → `Upload files`。
3. 解压本次部署包，进入 `quickdraw-demo` 文件夹，上传文件夹内的文件，然后在页面底部提交保存到 `main` 分支。
4. 确保仓库首页直接看到 `index.html`。不要只上传 ZIP，也不要把 `index.html` 放在额外一层 `quickdraw-demo` 文件夹中。
5. 打开仓库 `Settings` → `Pages`，在 `Build and deployment` 中选择：
   - Source：`Deploy from a branch`
   - Branch：`main`
   - Folder：`/ (root)`
   - 点击 `Save`。如果仓库默认分支采用其他名称，选择实际上传文件的分支。
6. 等待部署完成。GitHub 文档提示发布可能需要最多约 10 分钟；可在 `Actions` 查看运行状态，再回到 `Settings` → `Pages` 点击 `Visit site`。

试玩地址通常为：

```text
https://hcypkumain.github.io/I-Draw-AI-Guess-PKUCS-1024/
```

这是项目网站地址；仓库的 `github.com/...` 地址用于查看代码，不是直接进入游戏的地址。以 Pages 页面实际显示的 `Visit site` 链接为准。

可以把试玩地址发给别人，或用该地址生成二维码。访问者不需要连接你的笔记本或同一个 Wi-Fi。发布后也不需要运行 `serve.py`；Python 脚本用于本地或局域网部署。

## 要上传哪些文件

建议上传本文件夹内全部文件，保留模型来源、许可说明和类别判定说明。网页运行入口是 `index.html`，其中已内嵌绘画脚本、TensorFlow.js、模型和判题规则；`.nojekyll` 用于直接发布静态文件。

不需要安装 Node.js、Python、TensorFlow，也不需要填写模型 API Key。无需上传外层 `work` 目录、测试截图或 ZIP 压缩包。

## 用命令行上传（可选）

以下命令仅用于首次上传**空仓库**。已有内容时，应先 `git clone https://github.com/hcypkumain/I-Draw-AI-Guess-PKUCS-1024.git`，替换克隆目录中的网页文件后提交、推送。首次上传时，在解压出的 `quickdraw-demo` 文件夹打开终端：

```powershell
git init -b main
git add .
git commit -m "Publish 1024 drawing demo"
git remote add origin https://github.com/hcypkumain/I-Draw-AI-Guess-PKUCS-1024.git
git push -u origin main
```

按 Git 提示完成 GitHub 登录。上传后，仍需按上文第 5 步启用 Pages。如果 Git 提示缺少提交作者信息，按提示设置自己的 `user.name` 和 `user.email` 后重试提交。此命令用于首次上传空仓库；已经用网页上传过文件时，不要再次从另一个文件夹直接首次推送，应先克隆现有仓库再更新。

## 发布后检查与更新

- 用手机或平板打开 Pages 试玩链接，确认左上角显示“1024节”，并等待“AI 已就绪”。
- 首次访问需要下载约 4.5 MB 的网页；模型识别在访问者自己的浏览器内运行。用实际试玩设备和现场网络确认加载速度。
- 试一局简单档和困难档，检查绘画、计时、换题和 1／2 个标记的结算。
- 如果出现 404，先核对 Pages 部署是否完成、发布分支和文件夹是否正确、根目录是否有小写的 `index.html`。
- 以后更新游戏，只需替换仓库中的 `index.html` 并提交；Pages 会自动重新发布。出现旧版本时刷新页面，电脑可尝试 `Ctrl+F5`。
- 现场笔记本加平板的局域网方案可以继续使用；它不依赖 Pages 网站是否可访问。

## 模型来源与公开使用

DoodleNet 原始仓库的独立模型权重许可仍待核实；无需 API 费用不代表所有公开活动或商业场景均已获授权。正式公开活动前请确认权重使用授权，并保留《试玩说明.md》中的来源说明与 TensorFlow 许可文件。

## GitHub 官方参考

- [GitHub Pages 的用途与免费方案支持](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [配置 Pages 发布分支和根目录](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [通过网页上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Pages 发布入门与等待时间](https://docs.github.com/en/pages/quickstart)
