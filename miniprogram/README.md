# 互答有据 · 微信小程序骨架（MVP）

> 对应 PRD：`PRD-小程序-v1.0.md`（2026-11-11 定稿）
> 当前进度：里程碑 Day 1 —— 项目骨架、5 个 P0 页面、本地 Mock
> 技术约束：原生 WXML / WXSS / JS，不依赖第三方 UI 框架

## 1. 如何打开

### 方式 A：微信开发者工具导入

1. 打开微信开发者工具 → 「导入项目」；
2. 项目目录选择本文件夹：`question-hub/miniprogram`；
3. AppID 使用自己的测试号，或直接使用游客模式（`project.config.json` 中已设为 `touristappid`）；
4. Mock 模式不需要后端和域名，无需勾选“不校验合法域名”也能跑通；切真实接口时再勾选。

### 方式 B：命令行打开（Windows）

```bash
"C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" open --project "C:\Users\91586\.zcode\workspace\default\question-hub\miniprogram"
```

## 2. 当前实现范围

| 页面 | 路径 | 状态 |
|---|---|---|
| 登录 | `pages/login/index` | 可用（Mock 微信登录；未绑定先浏览） |
| 首页 | `pages/home/index` | 可用（双分卡、新人任务、待填写列表、空态、汇总、认真作答提示） |
| 问卷详情 / 作答 | `pages/detail/index` | 可用（计时、单选/多选/开放题、两次点击提交、结果态、只读回看） |
| 发布问卷 | `pages/publish/index` | 可用（双门槛、简介、1–25 题、模板、编辑、每题 2–6 选项） |
| 个人中心 | `pages/profile/index` | 可用（绑定学号、昵称、双流水、我发布的、我填写的、重置演示） |
| 答题统计 | `pages/stats/index` | 可用（条形图 / 扇形图、编辑、下架） |

统计与编辑/下架已实现；P1 剩余：流水详情页、导出、封面、举报/审核。

## 3. 演示路径（Mock）

1. 登录 → 进入首页浏览；到「我的」绑定学号（如 `2023001234`）与昵称；
2. 首页领取新人任务：**信誉 +40，积分 +0**（对应 AC-03，此时仍不能发布）；
3. 完成 **2 份**待填问卷：
   - 作答时长需 ≥ 3 秒（≤ 2 秒会直接判无效）；
   - 选择题不要全部选同一项（同选项占比 ≥ 80% 会判“直线作答”）；
   - 开放题至少 4 个字，且不要只填“1”“啊”这类内容；
   - 完成后积分 10、信誉 50（对应 AC-04）；
4. 发布一份问卷：扣除 10 积分，回到首页出现“我发布的问卷”；
5. 首页点自己的问卷 → 条形统计；个人中心点同一问卷 → 扇形统计，可编辑或下架；
6. 个人中心查看积分/信誉流水、我发布的/我填写的；
7. 再用同一账号进入已填问卷，会被拦截为“已完成填写”（对应 AC-05）。
8. 需要重新演示时，进入「我的」→「重置演示数据」。

> Mock 只模拟一个账号；多账号作答需要重置后重新绑定，或接真实后端。

## 4. 质量核验（Mock 也按 PRD 6.5 执行）

| 标记 | 规则 |
|---|---|
| `miss` | 未答题数 / 总题数 > 20% → `incomplete`，不发积分，信誉 -5 |
| `fast` | 总作答时长 ≤ 2 秒直接判 `invalid`；2–3 秒记风险标记（按 PRD） |
| `straight` | 选择题同选项占比 ≥ 80%，且选择题 ≥ 2 道 |
| `open_invalid` | 开放题去空格后 < 4 字，或同字符 ≥ 80%；白名单：无 / 没有 / 暂无 |

`flags >= 2` 判 `invalid`，不发积分/信誉；`flags = 1` 仍有效但记录标记；逾期未提交扣 20 信誉且只扣一次。

## 5. 目录结构

```text
miniprogram/
├── app.js / app.json / app.wxss      # 全局入口、路由、TabBar、公共样式
├── project.config.json               # 开发者工具项目配置（touristappid + Mock）
├── sitemap.json
├── config/index.js                   # useMock 开关、baseUrl
├── mock/mock.js                      # 假问卷、模板与种子统计
├── services/api.js                   # 与 PRD 第 9 节对应的接口封装
├── utils/
│   ├── constants.js                  # 积分/信誉/等级/限制/质量规则常量
│   ├── format.js                     # 时间、等级、时长格式化
│   ├── validation.js                 # 绑定、昵称、发布问卷校验与清洗
│   ├── auth.js                       # token / 用户快照存取
│   ├── request.js                    # 统一请求封装，{code,message,data}
│   └── mock-server.js                # 本地 Mock“服务端”（接口 + 规则 + 结算）
├── components/
│   ├── score-cards/                  # 积分/信誉双卡 + 等级 + 进度条
│   ├── survey-card/                  # 首页问卷卡片
│   ├── question-card/                # 单选/多选/开放题卡
│   ├── answer-timer/                 # 作答计时器
│   └── empty-state/                  # 空态
└── pages/
    ├── login/
    ├── home/
    ├── detail/
    ├── publish/
    ├── profile/
    └── stats/
```

## 6. Mock 与真实后端的切换

`config/index.js`：

```js
module.exports = {
  useMock: true,
  baseUrl: 'http://127.0.0.1:8080/api'
};
```

- `useMock: true`：全部请求走 `utils/mock-server.js`，使用 `wx.setStorageSync` 持久化；
- `useMock: false`：走 `wx.request`，请求头带 `Authorization: Bearer <token>`；
- 后端统一返回 `{ code: 0, message, data }`，`code !== 0` 视为业务错误；
- HTTP 401 或 `code === 'AUTH_REQUIRED'` 会清理本地会话并跳回登录页；
- 开发者工具联调本地 HTTP 时，需要勾选「不校验合法域名」。

### 接口映射

| 页面 | 调用 |
|---|---|
| 登录 | `POST /auth/login`、`POST /auth/bind` |
| 首页 | `GET /me`、`GET /surveys?status=open`、`GET /me/surveys`、`GET /me/responses` |
| 详情/作答 | `GET /surveys/{id}`、`POST /surveys/{id}/start`、`POST /surveys/{id}/submit`、`GET /me/responses` |
| 发布 | `GET /me`、`POST /surveys`（带 `requestId`） |
| 个人中心 | `GET /me`、`GET /me/ledger?type=points\|credit`、`GET /me/surveys`、`GET /me/responses`、`PATCH /me`、`POST /me/onboard` |
| 答题统计 | `GET /surveys/{id}/stats`、`PATCH /surveys/{id}`、`POST /surveys/{id}/close` |

### 需要与后端确认的契约补充

PRD 第 9 节未列出以下两项，前端按同一风格先行封装，**联调前需与后端确认**：

1. `POST /me/onboard` —— 领取新人任务（一次性 +40 信誉）；
2. `PATCH /me` —— 修改昵称（2–20 字）。

另外，个人中心的“查看原作答”目前通过 `GET /me/responses` 返回的 `answers` 渲染；生产环境建议增加 `GET /me/responses/{id}`，避免列表接口携带答案全文。

## 7. 与 PRD 的对应关系

- 初始积分/信誉：0 / 0；
- 新人任务：+40 信誉、+0 积分；
- 有效完成：+5 积分、+5 信誉；
- 发布：-10 积分，信誉 ≥ 40；
- 未答完（>20%）：0 积分、-5 信誉；
- 逾期未提交：-20 信誉，只扣一次；
- 等级：85–100 优秀 / 70–84 良好 / 40–69 一般 / 0–39 较差；
- 不采集真实姓名、手机号、IP；学号在 Mock 中只存假哈希，真实后端必须使用 HMAC-SHA256 + 服务端盐值；
- 服务端权威：真实环境中的身份、计时、判重、幂等、质量判定、结算必须全部在后端实现，小程序端只展示结果；
- 本轮补充：最多 25 题、问卷简介、参与人数与种子统计、发布模板、编辑/下架、未绑定在个人中心绑定、2 秒作答拦截与首页“请认真作答”提示。

## 8. 已知边界

- `project.config.json` 使用 `touristappid`，正式上传前替换成团队 AppID；
- Mock 数据存在本地 `wx` storage 的 `qh_mock_state_v1`，清缓存或点“重置演示数据”即可恢复；
- 只实现单账号 Mock，不支持真正多账号互填；
- 未实现 P1 的流水详情页、导出、封面、举报/审核；统计页和编辑/下架已实现；
- 页面样式为骨架级，后续可在不改结构的前提下细化视觉稿。
