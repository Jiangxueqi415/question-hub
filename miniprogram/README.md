# 互答有据 · 微信小程序骨架（MVP）

> 对应 PRD：`PRD-小程序-v1.0.md`（2026-11-11 定稿）
> 当前进度：项目骨架、5 个 P0 页面已完成，已接入真实后端（`http://10.30.96.49:8080/api`）
> 技术约束：原生 WXML / WXSS / JS，不依赖第三方 UI 框架
> 联调说明：后端目前只实现了登录/绑定、问卷列表、创建、提交与统计；其余接口由 `services/api.js` 降级处理，不再回退本地假数据。

## 1. 如何打开

### 方式 A：微信开发者工具导入

1. 打开微信开发者工具 → 「导入项目」；
2. 项目目录选择本文件夹：`question-hub/miniprogram`；
3. AppID 已配置为 `wxff54fd42da2c1ba7`，换用其他账号时替换为自己的 AppID；
4. 接口为 HTTP + 局域网 IP，需在开发者工具「详情 → 本地设置」勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」；真机预览时需打开「开发调试」。

### 方式 B：命令行打开（Windows）

```bash
"C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat" open --project "C:\Users\91586\.zcode\workspace\default\question-hub\miniprogram"
```

## 2. 当前实现范围

| 页面 | 路径 | 状态 |
|---|---|---|
| 登录 | `pages/login/index` | 可用（微信一键登录 + 首次登录绑定学号） |
| 首页 | `pages/home/index` | 可用（双分卡、真实问卷列表、我发布的问卷、空态） |
| 问卷详情 / 作答 | `pages/detail/index` | 可用（后端返回的题目、单选/多选/开放题、提交结果文案） |
| 发布问卷 | `pages/publish/index` | 可用（表单校验与 `POST /surveys`，发布门槛由后端返回校验） |
| 个人中心 | `pages/profile/index` | 部分可用（绑定学号、我发布的问卷；流水/我的作答后端未提供） |
| 答题统计 | `pages/stats/index` | 部分可用（只读查看；编辑/下架接口后端未提供） |

已移除本地 Mock 与本地积分/信誉账本；积分、信誉、问卷与提交结果全部来自后端。后端补齐 `/me`、流水、作答记录、新人任务、编辑/下架后，页面无需再改数据来源。

## 3. 演示路径

1. 登录 → 首次登录会进入“绑定学号”表单（学号 10–12 位数字 + 昵称 2–20 字）；
2. 绑定成功后进入首页，问卷列表来自 `GET /surveys`，不再有内置假问卷；
3. 点开一份问卷 → 按后端 `questionsJson` 渲染题目 → 作答并提交；
4. 提交结果以后端返回的文案为准（后端可能提示“漏答率过高/已扣信誉”等）；
5. “我的”页展示后端返回的积分、信誉与“我发布的问卷”；流水与作答记录接口尚未提供，页面显示“后端暂未提供”；
6. 发布页填写表单后调用 `POST /surveys`，是否满足积分/信誉门槛以服务端返回为准。

> 账号、问卷、作答与积分/信誉全部由后端持久化，本地不保存业务数据，也没有“重置演示”入口。

## 4. 质量核验（服务端执行）

| 标记 | 规则 |
|---|---|
| `miss` | 未答题数 / 总题数 > 20% → `incomplete`，不发积分，信誉 -5 |
| `fast` | 总作答时长 ≤ 2 秒直接判 `invalid`；2–3 秒记风险标记（按 PRD） |
| `straight` | 选择题同选项占比 ≥ 80%，且选择题 ≥ 2 道 |
| `open_invalid` | 开放题去空格后 < 4 字，或同字符 ≥ 80%；白名单：无 / 没有 / 暂无 |

`flags >= 2` 判 `invalid`，不发积分/信誉；`flags = 1` 仍有效但记录标记；逾期未提交扣 20 信誉且只扣一次。以上判定全部由后端执行，小程序端只展示接口返回的 `status` / `flags` / `message`。

## 5. 目录结构

```text
miniprogram/
├── app.js / app.json / app.wxss      # 全局入口、路由、TabBar、公共样式
├── project.config.json               # 开发者工具项目配置（AppID）
├── sitemap.json
├── config/index.js                   # baseUrl（后端接口根地址）
├── data/templates.js                 # 发布页快捷模板（纯前端静态配置）
├── services/api.js                   # 与 PRD 第 9 节对应的接口封装
├── utils/
│   ├── constants.js                  # 积分/信誉/等级/限制/质量规则常量
│   ├── format.js                     # 时间、等级、时长格式化
│   ├── validation.js                 # 绑定、昵称、发布问卷校验与清洗
│   ├── auth.js                       # token / 用户快照存取
│   └── request.js                    # 统一请求封装，{code,message,data}
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

## 6. 后端联调

`config/index.js`：

```js
module.exports = {
  version: '0.3.0',
  baseUrl: 'http://10.30.96.49:8080/api'
};
```

- 所有页面通过 `services/api.js` → `utils/request.js` 发起 `wx.request`；
- 请求头自动携带 `Authorization: Bearer <token>`；
- 后端统一返回 `{ code: 0, message, data }`，`code !== 0` 视为业务错误；
- HTTP 401 或 `code === 'AUTH_REQUIRED'` 会清理本地会话并跳回登录页；
- `services/api.js` 会把后端的 `questionsJson`、`startAt/endAt`、`user` 等字段归一化成页面使用的结构；
- 接口为 HTTP + 局域网 IP，开发者工具需勾选「不校验合法域名」，真机预览需打开「开发调试」；
- 正式发布前把 `baseUrl` 换成已备案的 HTTPS 域名，并在小程序后台配置 request 合法域名。

### 接口映射（当前真实后端）

| 页面 | 调用 |
|---|---|
| 登录 | `POST /auth/login`、`POST /auth/bind` |
| 首页 | `POST /auth/login`（刷新用户）、`GET /surveys?status=open`、`GET /surveys/my` |
| 详情/作答 | `GET /surveys`（按 id 查找）、本地计时、`POST /surveys/{id}/submit` |
| 发布 | `POST /auth/login`（刷新用户）、`POST /surveys`（题目放在 `questionsJson`） |
| 个人中心 | `POST /auth/login`（刷新用户）、`GET /surveys/my`；流水/我的作答返回空 |
| 答题统计 | `GET /surveys/{id}/stats` |

### 后端待补齐的契约

1. `GET /me` —— 当前用户对象（现在用 `wx.login` + `POST /auth/login` 代替）；
2. `PATCH /auth/me` / `PATCH /me` —— 修改昵称（当前后端返回 400）；
3. `GET /me/ledger`、`GET /me/responses` —— 积分/信誉流水与我的作答；
4. `POST /me/onboard` —— 新人任务；
5. `GET /surveys/{id}`、`POST /surveys/{id}/start` —— 问卷详情与服务端计时；
6. `PATCH /surveys/{id}`、`POST /surveys/{id}/close` —— 编辑与下架。

在补齐前，页面会以“后端暂未提供 / 无数据”显示，不再使用本地假数据。

## 7. 与 PRD 的对应关系

- 初始积分/信誉：0 / 0；
- 新人任务：+40 信誉、+0 积分；
- 有效完成：+5 积分、+5 信誉；
- 发布：-10 积分，信誉 ≥ 40；
- 未答完（>20%）：0 积分、-5 信誉；
- 逾期未提交：-20 信誉，只扣一次；
- 等级：85–100 优秀 / 70–84 良好 / 40–69 一般 / 0–39 较差；
- 不采集真实姓名、手机号、IP；学号由服务端 HMAC-SHA256 + 盐值保存；
- 服务端权威：身份、计时、判重、幂等、质量判定、结算必须全部在后端实现，小程序端只展示结果；
- 本轮补充：最多 25 题、问卷简介、参与人数与统计、发布模板、编辑/下架、未绑定在个人中心绑定、2 秒作答拦截与首页“请认真作答”提示。

## 8. 已知边界

- 后端地址当前为局域网 HTTP（`10.30.96.49:8080`），正式发布前需替换为已备案的 HTTPS 域名；
- 账号、问卷、作答、积分/信誉流水均由后端持久化，清缓存不会恢复演示数据；
- 未实现 P1 的流水详情页、导出、封面、举报/审核；统计页和编辑/下架已实现；
- 页面样式为骨架级，后续可在不改结构的前提下细化视觉稿。
