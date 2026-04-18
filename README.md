# makeGIF (Cloudflare Workers)

一个可部署到 Cloudflare Workers 的在线动图生成工具：支持多图合成为 **GIF/APNG**，并提供下载。

## 功能亮点

- 🖼️ **拖拽 / 点击上传**：支持拖拽图片到上传区或点击选择，带文件缩略图预览
- 🎨 **现代化 UI**：深色主题、卡片布局、动画反馈，适配移动端
- ⚡ **高帧率支持**：GIF 最高 60 FPS，APNG 最高 120 FPS
- 📦 **结果即时预览**：生成完成后在页面内预览并下载
- 🔌 **开放 API**：提供 REST 接口，支持 CORS 跨域调用(但是免费版cf只有10ms的cpu时间)

## 项目结构

```text
makeGIF/
├─ public/
│  └─ index.html          # 前端页面（拖拽上传、参数配置、结果预览）
├─ src/
│  └─ worker.js           # Cloudflare Workers 后端 + 编码逻辑
├─ package.json
├─ package-lock.json
├─ wrangler.toml
└─ README.md
```

## API

### `POST /api/encode`

`Content-Type: multipart/form-data`

表单字段：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `images` | File[] | — | PNG/JPG 文件，**必填**，最多 60 张 |
| `format` | string | `gif` | `gif` 或 `apng` |
| `fps` | int | `10` | GIF: 1~60，APNG: 1~120 |
| `loop` | int | `0` | 循环次数，0 表示无限循环 |
| `width` | int | — | 输出宽度（1~4096），需与 `height` 同时指定 |
| `height` | int | — | 输出高度（1~4096），需与 `width` 同时指定 |

返回：

- `200 OK`：`image/gif` 或 `image/apng` 二进制文件
- `4xx`：JSON 错误信息 `{"error":"..."}`

cURL 示例：

```bash
curl -X POST https://your-worker.workers.dev/api/encode \
  -F "images=@frame1.png" \
  -F "images=@frame2.png" \
  -F "fps=24" \
  -F "format=apng" \
  -o output.png
```

### `GET /api/info`

返回 Worker 支持的能力信息：

```json
{
  "formats": ["gif", "apng"],
  "fps": {
    "gif":  { "min": 1, "max": 60  },
    "apng": { "min": 1, "max": 120 }
  },
  "maxImages": 60,
  "maxDimension": 4096
}
```

### `GET /api/health`

健康检查，返回 `{"ok":true}`。

## 编码实现

- GIF：使用 `gifenc`（纯 JS，Worker 兼容）进行调色板量化 + GIF 编码，最高 60 FPS
- APNG：使用 `UPNG.js` 编码，支持全彩透明，最高 120 FPS
- JPEG 解码：`jpeg-js`
- PNG 解码：`UPNG.decode + UPNG.toRGBA8`

> **提示**：GIF 格式存在 256 色限制，且浏览器对 20ms 以下帧间隔可能有节流。高帧率或需要透明背景时推荐使用 APNG。

## 本地开发

```bash
npm install
npm run dev
```

打开终端里的本地地址（默认 `http://127.0.0.1:8787`）。

## 部署到 Cloudflare

```bash
npm install
npx wrangler login
npm run deploy
```

部署完成后，访问 Wrangler 输出的 `workers.dev` 域名。

## wrangler 配置

`wrangler.toml`：

- `main = "src/worker.js"`
- `assets.directory = "./public"`（托管前端页面）
- Worker 处理 `/api/*`，其他路径走静态资源。

