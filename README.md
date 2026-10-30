# 猪猪与小咪的世界

> 私有部署的双人恋爱记录站：相册、时间轴、经期与亲密日历、纪念日、心愿清单、悄悄话。
> 数据完全掌握在自己手里，两个人的照片和记录不会交给任何第三方。

**在线版本：<http://8.148.205.121/>**

> 站点需要登录才能查看；本仓库**不含任何照片、日记或用户数据**。

---

## 功能

- **首页**：手写体大号「在一起 N 天」实时计时，右上角时分秒，最近照片与可点击的统计卡
- **相册**：拖拽/多选上传，按 EXIF 拍摄日期自动归日，按天 / 全部 / 视频 / 收藏 / 手动相册浏览，瀑布流 + 灯箱
- **时间轴**：按年分组，Markdown 正文，配图
- **日历**：两种模式一键切换
  - 大事记：纪念日与事件，月历上直接显示图标
  - 经期 · 亲密：记录经期与亲密，按历史中位数预测下次经期与易孕期
- **纪念日**：每年 / 每月 / 仅一次，倒计时排序
- **心愿清单**：分类、打卡、进度条
- **悄悄话**：双人留言墙、仅自己可见、已读标记
- **实时**：任一操作经 SSE 广播，另一台设备自动刷新；编辑冲突用 `rev` 乐观锁
- **个人化**：头像（上传 / 8 个系统头像 / 历史切换）、首页背景、站点图标，均支持拖拽裁剪
- **游客**：沙盒账号可随意试用，退出即清空；只读访客账号由站长私下授权
- **隐私**：全站未登录不可见，`noindex`，无第三方 CDN / 统计脚本

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS v4 |
| 后端 | Node.js 22+ / Express 5 + `node:sqlite`（内置，无原生依赖） |
| 图片 | sharp 转码（原图 / 1400 / 480 / 模糊占位） |
| 实时 | SSE（`text/event-stream`） |
| 部署 | Docker Compose 或 systemd + 单进程 Node |

---

## 本地运行

需要 **Node.js 22.5+**（用到内置 `node:sqlite`）。

```bash
npm install
npm run dev          # 前端 5173，接口 3001
```

打开 <http://localhost:5173>。

首次启动会自动建库并创建两个账号：

| 账号 | 初始密码 |
|---|---|
| `xiaomi` | `xm123456` |
| `zhuzhu` | `zz123456` |

**登录后请立刻到「设置 → 账号」修改密码。**

生产模式（单进程，前后端同端口）：

```bash
npm run build
npm start            # http://localhost:3001
```

---

## 部署

### 方式一：Docker（最省事）

```bash
cp .env.example .env      # 修改 APP_SECRET
docker compose up -d      # http://localhost:3001
```

数据卷 `./data` 独立挂载，重建容器不丢数据。

### 方式二：云服务器 + systemd（本项目当前采用）

```bash
# 服务器上
apt install -y nodejs        # 或从 npmmirror 下载 Node 22+ 二进制
mkdir -p /opt/lianairiji
# 把 dist/ server/ package.json package-lock.json 传上去
cd /opt/lianairiji && npm install --omit=dev

# systemd 单元（节选）
#   User=lianai
#   Environment=DATA_DIR=/opt/lianairiji/data
#   Environment=PORT=80
#   AmbientCapabilities=CAP_NET_BIND_SERVICE
#   ExecStart=/usr/local/bin/node server/index.mjs --prod
```

详细步骤（含安全组放行、备份、更新脚本）见
**[docs/03-部署到阿里云.md](docs/03-部署到阿里云.md)**。

> 公网访问建议绑定域名 + HTTPS；或只开放给固定 IP / 内网（Tailscale）。

---

## 数据与隐私

- **代码与数据分离**：所有用户数据都在 `data/`（SQLite + 原图），不进 Git
- 删除 `data/` 即回到初始状态；打包 `data/` 换台机器即可完整还原
- 游客账号使用独立沙盒数据库，退出时整个销毁
- 仓库里没有截图，因为截图会包含私人照片

备份：

```bash
tar -czf backup-$(date +%Y%m%d).tgz data/
```

手动备份之外，服务端还配置了每天 04:10 的定时备份（保留 7 天）。

---

## 目录结构

```
server/            后端（无状态）
  db.mjs           建表、迁移、沙盒
  auth.mjs         登录、会话、限流
  media.mjs        上传、EXIF、多尺寸转码
  routes.mjs       内容 API
  routes-life.mjs  日历 / 纪念日 / 心愿 / 悄悄话
  guest.mjs        游客只读拦截
  events.mjs       SSE 广播
  predict.mjs      经期预测算法
  secret.mjs       AI Key 加密
client/            前端
  src/pages/       首页 / 相册 / 时间轴 / 日历 / 设置 …
  src/components/  侧边栏、上传器、灯箱、裁剪器、二维码 …
docs/              需求规格、开发日志、部署与分享文档
data/              ★ 用户数据（不入库）
```

## 文档

- [需求规格与开发提示词](docs/01-需求规格与开发提示词.md)
- [如何分享给女朋友（局域网 / Tailscale / VPN）](docs/02-如何分享给女朋友.md)
- [部署到阿里云](docs/03-部署到阿里云.md)
- [开发日志（每版改动与踩坑记录）](docs/开发日志.md)

---

## License

私人项目，仅供学习参考。
