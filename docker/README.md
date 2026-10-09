# Lomo Photo Viewer — Linux / Docker 版

一个镜像里包含了和 Windows 桌面版相同的组件（不含桌面外壳）：

- **lomod**：照片存储服务，从 `submodules/lomod` 源码编译，自带 exiftool（读取拍摄时间、GPS 等 EXIF）和 ffmpeg（视频）
- **网页端**：基于 Immich 的照片浏览界面，以及把它的请求转给 lomod 的 proxy

部署在一台 Linux 机器上之后，同一局域网里的电脑和手机用这台机器的 IP 就能打开网页看照片，也能用手机把照片传上来。

目前提供 `linux/amd64`（x86_64）镜像。

## 快速开始

需要 Docker 和 Docker Compose 插件。

```bash
mkdir lomo && cd lomo
curl -fsSLO https://raw.githubusercontent.com/lomorage/LomoAgentWin/main/docker/docker-compose.yml
docker compose up -d
docker compose logs
```

如果 `main` 分支上还没有这个文件，可以到 GitHub Release 页面下载 `docker-compose.yml`。

第一次启动时，日志里会打印访问地址和首个账号：

```
[lomo] Created the first account:
[lomo]   user:     admin
[lomo]   password: 3kQf9xV2mTpA
[lomo]   (generated; also saved to /data/admin-password.txt)
...
[lomo] Web app (browser, phone or computer): http://192.168.1.20:3001
[lomo] Lomorage mobile app server address:   http://192.168.1.20:8000
```

- 账号密码另外保存在 `./lomo/data/admin-password.txt`
- 不想用随机密码，就在**第一次启动之前**，把 `docker-compose.yml` 里的 `LOMO_ADMIN_PASSWORD` 填上
- 账号只在第一次启动时创建，之后再改这个变量不会生效

不用 Compose 的话，等价的命令是：

```bash
docker run -d --name lomo-photo-viewer --restart unless-stopped --network host \
  -e TZ=Asia/Shanghai \
  -v "$PWD/lomo/photos:/photos" -v "$PWD/lomo/data:/data" \
  ghcr.io/lomorage/lomo-photo-viewer:test
```

## 使用

**看照片**：在同一局域网的电脑或手机浏览器里打开 `http://<机器IP>:3001`，用上面的账号登录。

**用手机传照片**，两种方式任选：

1. **手机浏览器**：打开 `http://<机器IP>:3001` 并登录，然后点上传按钮选择照片。登录后在用户设置里还能打开"手机上传"二维码，用手机扫码直接进入上传页面。
2. **Lomorage App**（iOS / Android）：服务器地址填 `http://<机器IP>:8000`，用同一个账号登录。App 可以在后台自动备份手机相册。

**照片存放位置**：

- 照片在 `./lomo/photos/<用户名>/` 下面
- 原图在 `Photos/master/年/月/日/`，缩略图在 `Photos/preview/`

## 配置

| 项目 | 默认值 | 说明 |
|---|---|---|
| `LOMO_ADMIN_USER` | `admin` | 首个账号的用户名（只在第一次启动时使用） |
| `LOMO_ADMIN_PASSWORD` | 空（自动生成） | 首个账号的密码（只在第一次启动时使用） |
| `TZ` | 镜像内为 UTC，compose 文件里设为 `Asia/Shanghai` | 时区，影响照片按日期分组 |
| `WEB_PORT` | `3001` | 网页端口 |
| `LOMOD_PORT` | `8000` | lomod 端口（Lomorage App 连接这个端口） |
| `LOMOD_ARGS` | 空 | 追加给 lomod 的额外参数 |
| 卷 `/photos` | — | 照片（原图和缩略图）。数据量大，建议放在大硬盘上 |
| 卷 `/data` | — | 数据库、日志（`/data/lomod/var/log/`）、设置 |

lomod 还会占用 `8004` 端口（WebDAV）。

**防火墙**：如果机器开了防火墙，需要放行 3001 和 8000 端口，例如：

```bash
sudo ufw allow 3001/tcp
sudo ufw allow 8000/tcp
```

### 为什么默认用 host 网络

`network_mode: host` 让容器直接使用这台机器的网络，好处有三点：

- 手机和电脑用机器本身的 IP 就能访问
- Lomorage App 能在局域网里自动发现服务器（mDNS）
- 网页里显示的访问地址和二维码是机器的真实 IP

host 网络只在 Linux 上可用。

如果必须用端口映射，可以改成：

```yaml
    ports: ["3001:3001", "8000:8000", "8004:8004"]
```

这样基本功能可用，但有两个限制：

- App 无法自动发现服务器，需要手动填地址
- 网页里"手机上传"二维码显示的是容器内部 IP，要手动改成机器的 IP

## 升级与备份

```bash
docker compose pull && docker compose up -d   # 升级
```

**备份**：停掉容器后，备份 `./lomo/photos` 和 `./lomo/data` 两个目录即可。

**沿用已有的 lomod 数据**：

1. 把原来 lomod 的数据目录（`--base`）放到 `./lomo/data/lomod`，照片目录（`--mount-dir`）挂载到 `/photos`
2. 启动后日志会提示 "already has an account"，用原来的账号密码登录即可

## 镜像标签

| 标签 | 内容 |
|---|---|
| `test` | 最新的测试版 |
| `latest` | 最新的正式版 |
| `X.Y.Z` / `X.Y.Z-test.N` | 固定版本 |
| `main` | `main` 分支的最新构建 |

镜像由 `.github/workflows/docker.yml` 构建。每次构建都会启动容器，跑一遍登录、上传、缩略图的冒烟测试，通过后才推送。
