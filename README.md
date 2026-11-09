# 问卷互助

一个纯前端（HTML + Bootstrap 5 + 原生 JS）的问卷互助站点：发布问卷消耗积分，填写问卷获得积分。数据只保存在浏览器本地。

## 运行

```bash
cd survey-mutual-aid
node server.js
```

打开 <http://localhost:5173>。也可以直接双击 `index.html`（无需构建工具、无需联网，Bootstrap 已放在 `css/bootstrap.min.css`）。

## 页面

| 文件 | 说明 |
| --- | --- |
| `index.html` | 首页，问卷列表由 `js/app.js` 渲染 |
| `detail.html` | 问卷详情、答题、领取积分，已领取/发布者预览均为只读 |
| `publish.html` | 发布问卷；`publish.html?edit=<id>` 为发布者编辑 |
| `profile.html` | 个人中心：积分、我发布的、我填写过的 |
| `js/app.js` | 唯一数据层，挂载 `window.SurveyStore` |
| `js/detail.js` / `js/publish.js` / `js/profile.js` | 各页面自己的渲染与事件，只调用 `SurveyStore` |
| `css/style.css` | 站点样式 |
| `server.js` | 零依赖本地静态服务器（仅开发用） |

页面不直接读写 `points` / `claimed` / `surveys` 三个 localStorage key，积分加减、问卷落库、校验全部由 `js/app.js` 完成。

## 积分规则

- 初始积分 `50`
- 发布一份问卷消耗 `10` 积分（`SurveyStore.publishCost`）
- 填写一份问卷获得 `5` 积分（`SurveyStore.reward`，固定值）
- 发布者不能领取自己发布的问卷
- 删除自己发布的问卷不退还发布消耗的积分

## 发布问卷页

- 发布者输入框按当前用户（最近一次发布使用的昵称，首次为“我”）自动填入，可修改
- 标题输入框居中，限制 `20` 字，实时字数提示
- 题目输入框与题目卡片居中；发布者、题目数量、预计耗时、分类位于表单左上角
- 题目数量 `1-10` 道，预计耗时 `1-60` 分钟，数字输入框禁止负数并在失焦时夹紧
- 每道题可选择**单选**或**多选**，选项 `2-6` 个，可动态增删
- 每道题可设置正确答案（选填）：按选项字母填写，如单选 `A`，多选 `A,C`
- 可上传一张封面素材（≤2MB，前端压缩后以 data URL 存在问卷数据里，详情页展示）
- 支持添加/删除题目、添加/删除选项，以及一键重置
- 提交成功弹窗标题为“发布成功”，确认后回首页，新问卷显示在列表第一张
- 积分不足 `10` 时提交按钮置灰并显示提示，`SurveyStore.create()` 仍会再次校验

## 锁定规则

- 发布（确定问卷）后 `locked: true`，问卷自动锁定
- 发布者可以在 `profile.html` → “我发布的问卷” → 编辑，或详情页“编辑问卷”继续修改，保存不扣积分
- 填写者在详情页永远只读，没有修改入口；数据层的 `update()` 也只接受已存在的本人问卷

## 数据层接口

在规范基础上增加了发布页所需的扩展能力：

```js
SurveyStore.create(payload)        // { ok, id, points } | { ok:false, error, code }
SurveyStore.update(id, payload)    // 发布者编辑（唯一入口；已锁定也可由发布者改）
SurveyStore.remove(id)             // true / false
SurveyStore.get(id)                // survey / null
SurveyStore.list()                 // 用户发布在前，内置问卷在后
SurveyStore.mine()
SurveyStore.history()              // [{ id, title, reward, exists }]
SurveyStore.claimPoints(id)        // 新积分 / false
SurveyStore.isClaimed(id)          // true / false
SurveyStore.reset()                // 重置演示数据
SurveyStore.categories             // ["学习","生活","调研","其他"]
SurveyStore.reward                 // 5
SurveyStore.publishCost            // 10
SurveyStore.points                 // 当前积分（只读）
SurveyStore.currentUser            // 自动生成发布者输入框用
SurveyStore.limits                 // 发布页数量限制
```

问卷结构在规范基础上扩展了以下字段（旧数据仍可读取）：

```js
{
  id: "u1731052800000ab3",
  title: "图书馆座位使用情况调查",
  publisher: "我",
  category: "学习",
  minutes: 2,
  reward: 5,
  createdAt: 1731052800000,
  mine: true,
  locked: true,
  cover: "",                       // 可选：压缩后的图片 data URL
  questions: [
    {
      q: "你每周去图书馆几次？",
      type: "single",              // single | multiple
      options: ["1-2 次", "3-5 次", "6 次以上"],
      answer: [0]                  // 正确答案的选项下标；可为空数组
    }
  ]
}
```

标题在发布页限制 20 字（需求），数据层按规范上限 40 字兜底。正确答案为选填，填写后会校验格式、选项范围及单选题只能有一个答案。

## 验收清单

- [x] 首页展示内置问卷与用户发布的问卷，用户发布显示“我发布的”
- [x] 发布后首页第一张出现新问卷，积分从 50 变为 40
- [x] 详情页题目、题型、选项与发布时一致
- [x] 单选/多选分别渲染为 radio / checkbox，答完所有题才能领取
- [x] 领取成功后 +5，按钮变为“已完成填写”，重复领取不加分，刷新后状态保持
- [x] 积分不足时发布按钮置灰，`create()` 二次校验
- [x] 标题中的 `<b>x</b>` 只作为文本显示
- [x] 标题、题目、选项、正确答案、积分、存储错误均有提示
- [x] 发布者编辑已锁定问卷后详情页同步更新；填写者无编辑入口
- [x] 个人中心积分与顶栏一致；我发布的、我填写过的、空列表兜底正常
- [x] 500px 宽度下顶部导航不换行、底部导航不遮挡页面内容

## Git

仓库已在项目目录内初始化为本地 Git 仓库（`main` 分支），未配置远程、未创建额外分支、未创建 PR。按需求保留在本地，等待后续手动建立 PR。
