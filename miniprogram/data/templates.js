/**
 * 发布页快捷模板（纯前端静态配置，不涉及接口）
 *
 * 应用模板只负责填充表单，最终仍由 services/api.js 提交到后端校验。
 */
const TEMPLATES = [
  {
    id: 'tpl_zhongjing',
    name: '仲景文化',
    title: '仲景文化认知与传播调查',
    description: '了解同学们对张仲景与中医药文化的认知、兴趣与传播建议。',
    category: '学习调研',
    minutes: 3,
    questions: [
      {
        type: 'single',
        title: '你是否了解张仲景与《伤寒杂病论》？',
        options: ['非常了解', '了解一些', '只听过名字', '完全不了解']
      },
      {
        type: 'multiple',
        title: '你通过哪些渠道接触过仲景文化？（可多选）',
        options: ['课堂', '校园活动', '短视频 / 社交媒体', '书籍', '亲友介绍']
      },
      {
        type: 'single',
        title: '你更愿意参加哪种形式的仲景文化活动？',
        options: ['专家讲座', '文化展览', '体验活动', '线上答题']
      },
      {
        type: 'open',
        title: '你对仲景文化进校园有什么建议？',
        options: []
      }
    ]
  },
  {
    id: 'tpl_nanshui',
    name: '南水北调',
    title: '南水北调工程认知调查',
    description: '了解大学生对南水北调工程的认知程度、信息渠道与态度。',
    category: '学习调研',
    minutes: 3,
    questions: [
      {
        type: 'single',
        title: '你是否了解南水北调工程？',
        options: ['非常了解', '了解一些', '只听过名字', '完全不了解']
      },
      {
        type: 'single',
        title: '你主要通过什么渠道了解南水北调？',
        options: ['课堂', '新闻媒体', '校园宣传', '亲友介绍', '其他']
      },
      {
        type: 'multiple',
        title: '你认为南水北调工程的主要意义是什么？（可多选）',
        options: ['缓解北方缺水', '改善生态环境', '促进区域发展', '保障饮水安全', '不了解']
      },
      {
        type: 'open',
        title: '你对南水北调工程还有什么想了解的？',
        options: []
      }
    ]
  },
  {
    id: 'tpl_campus',
    name: '校园服务',
    title: '校园服务满意度调查',
    description: '收集同学们对校园餐饮、住宿、网络与公共服务的满意度与改进建议。',
    category: '生活服务',
    minutes: 2,
    questions: [
      {
        type: 'single',
        title: '你对校园餐饮服务总体满意吗？',
        options: ['非常满意', '比较满意', '一般', '不满意']
      },
      {
        type: 'multiple',
        title: '你最希望学校改进哪些校园服务？（可多选）',
        options: ['餐饮', '住宿', '网络', '图书馆', '体育设施', '校车']
      },
      {
        type: 'single',
        title: '你使用校园网络的频率是？',
        options: ['每天多次', '每天一次', '每周几次', '很少使用']
      },
      {
        type: 'open',
        title: '你对校园服务还有什么建议？',
        options: []
      }
    ]
  }
];

module.exports = {
  TEMPLATES: TEMPLATES
};
