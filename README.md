# makeGIF (Cloudflare Workers)

一个可部署到 Cloudflare Workers 的在线动图生成工具：支持多图合成为 **GIF/APNG**，并提供下载。

## 项目结构

```text
makeGIF/
├─ public/
│  └─ index.html          # 前端上传页面（HTML + JS）
├─ src/
│  └─ worker.js           # Cloudflare Workers 后端 + 编码逻辑
├─ package.json
├─ package-lock.json
├─ wrangler.toml
└─ README.md
```

## 功能

- 上传多张 PNG/JPG 图片，合成为动图
- 参数：`fps`、`width`、`height`、`loop`
- 输出格式：`gif` / `apng`
- 返回文件（二进制）供浏览器下载

## API

### `POST /api/encode`

`Content-Type: multipart/form-data`

表单字段：

- `images`：多张 PNG/JPG 文件（必填）
- `fps`：帧率，1~60，默认 10
- `width`：输出宽度（可选，需和 height 一起传）
- `height`：输出高度（可选，需和 width 一起传）
- `loop`：循环次数，0 表示无限循环，默认 0
- `format`：`gif` 或 `apng`（默认 `gif`）

返回：

- `200 OK`：`image/gif` 或 `image/apng` 二进制文件
- `4xx`：JSON 错误信息

## 编码实现

- GIF：使用 `gifenc`（纯 JS，Worker 兼容）进行调色板量化 + GIF 编码
- APNG：使用 `UPNG.js` 编码
- JPEG 解码：`jpeg-js`
- PNG 解码：`UPNG.decode + UPNG.toRGBA8`

## 本地开发

```bash
npm install
npm run dev
```

打开终端里的本地地址（默认 `http://127.0.0.1:8787`）。

## 部署到 Cloudflare

1. 安装依赖：
   ```bash
   npm install
   ```
2. 登录 Cloudflare：
   ```bash
   npx wrangler login
   ```
3. 部署：
   ```bash
   npm run deploy
   ```
4. 部署完成后，访问 Wrangler 输出的 workers.dev 域名。

## wrangler 配置

`wrangler.toml`：

- `main = "src/worker.js"`
- `assets.directory = "./public"`（托管前端页面）
- Worker 处理 `/api/encode`，其他路径走静态资源。
