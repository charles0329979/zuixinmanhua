# 📚 漫画聚合 — 多源漫画搜索阅读网站

个人漫画聚合阅读网站 V1，多书源并发搜索，本地收藏 + 阅读进度 + 浏览历史。

**🔗 仓库地址**: https://github.com/charles0329979/zuixinmanhua

## 项目定位

- 个人漫画聚合阅读网站，中文漫画为主
- **不存储漫画图片，不上传资源，不破解资源**
- 通过内置书源搜索、解析漫画信息、章节和图片
- 支持收藏、阅读进度、历史浏览
- 网页端，移动端优先，后续可扩展到 APP

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 + React 19 + TypeScript + TailwindCSS |
| 后端 | NestJS 10 + TypeScript |
| 本地存储 | IndexedDB (idb) |
| 爬虫 | axios + cheerio |
| 包管理 | pnpm workspace (monorepo) |

## 项目结构

```
zuixinmanhua/
├── apps/
│   ├── web/                         # Next.js 前端
│   │   └── src/
│   │       ├── app/                  # App Router 页面
│   │       │   ├── page.tsx          # 首页
│   │       │   ├── search/           # 搜索页
│   │       │   ├── comic/[source]/[comicId]/  # 漫画详情
│   │       │   ├── read/[source]/[comicId]/[chapterId]/  # 阅读器
│   │       │   ├── favorites/        # 收藏页
│   │       │   ├── history/          # 历史浏览
│   │       │   └── admin/sources/    # 书源管理
│   │       ├── components/           # 通用组件
│   │       ├── hooks/                # React Hooks
│   │       ├── lib/                  # API客户端 + IndexedDB
│   │       └── types/                # TypeScript 类型
│   └── server/                       # NestJS 后端
│       └── src/
│           ├── sources/              # 书源适配器系统
│           │   └── adapters/         # 内置书源 (5个)
│           ├── search/               # 搜索模块
│           ├── comic/                # 漫画详情模块
│           └── chapter/              # 章节图片模块
└── packages/
    └── shared/                       # 共享类型定义
```

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 搜索框 + 收藏书架 + 最近阅读 |
| `/search?q=xxx` | 搜索结果 | 按书源分组展示，不合并 |
| `/comic/:source/:comicId` | 漫画详情 | 封面/作者/章节列表/收藏 |
| `/read/:source/:comicId/:chapterId` | 阅读器 | 长图下拉/夜间模式/页码追踪 |
| `/favorites` | 收藏书架 | 本地收藏管理 |
| `/history` | 浏览历史 | 时间轴/继续阅读/删除 |
| `/admin/sources` | 书源管理 | 启用/停用/测试 |

## 内置书源 (V1)

| 书源 | ID | 状态 |
|------|-----|------|
| 漫蛙 | `manwa` | ✅ |
| 野蛮漫画 | `yeman` | ✅ |
| 拷贝漫画 | `copy` | ✅ |
| 包子漫画 | `baozi` | ✅ |
| 动漫之家 | `dongmanzhijia` | ✅ |

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 安装 & 启动

```bash
# 克隆项目
git clone git@github.com:charles0329979/zuixinmanhua.git
cd zuixinmanhua

# 安装依赖
pnpm install

# 同时启动前后端
pnpm dev

# 或分别启动
pnpm dev:web     # 前端 → http://localhost:3000
pnpm dev:server  # 后端 → http://localhost:3001/api
```

## 书源适配器开发

每个书源实现 `SourceAdapter` 接口即可接入：

```typescript
interface SourceAdapter {
  id: string;
  name: string;
  domain: string;
  search(query: string): Promise<ComicInfo[]>;
  getComicDetail(comicId: string): Promise<ComicInfo>;
  getChapters(comicId: string): Promise<ChapterInfo[]>;
  getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail>;
}
```

新书源放入 `apps/server/src/sources/adapters/` 并在 `sources.service.ts` 注册。

## 功能特性

### 搜索系统
- 同时请求所有内置书源，并发返回
- 结果按书源分组，不合并，独立显示
- 每条结果显示：封面、名称、作者、来源、最新章节、更新时间

### 阅读器
- 长图下拉阅读模式
- 顶部导航：返回、漫画名称、章节
- 底部工具栏：上一章、目录、下一章、收藏、夜间模式
- 自动记录阅读页码，支持继续阅读

### 本地存储
- 无需登录，基于 IndexedDB
- 收藏、阅读进度、浏览历史均存储在浏览器本地
- 后续可迁移到 PostgreSQL + Redis

## 后续规划

- [ ] 用户自定义书源
- [ ] PostgreSQL + Redis 服务端存储
- [ ] 用户系统 (登录/注册)
- [ ] APP 端 (React Native / Flutter)
- [ ] 漫画更新订阅/推送
- [ ] 更多书源接入

## License

MIT
