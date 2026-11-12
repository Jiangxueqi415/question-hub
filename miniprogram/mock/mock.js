/**
 * 本地问卷假数据（仅用于小程序 Mock 演示）
 *
 * 结构说明：
 * - 每份问卷包含标题、简介、分类、预计耗时、创建/截止时间、参与人数、题目与种子统计；
 * - seedStats 按题目 id 保存演示用统计：选择题 { total, counts }，开放题 { answers }；
 * - TEMPLATES 供发布页“问卷模板”快捷填充，不连接后端。
 */
const DAY = 24 * 60 * 60 * 1000;

function optionList(prefix, texts) {
  return texts.map(function (text, index) {
    return {
      id: prefix + '_o' + (index + 1),
      text: text,
      sort: index
    };
  });
}

function question(id, type, title, optionTexts) {
  return {
    id: id,
    type: type,
    title: title,
    sort: 0,
    options: optionList(id, optionTexts || [])
  };
}

function choiceStats(total, counts) {
  return { total: total, counts: counts };
}

function openStats(answers) {
  return { total: answers.length, answers: answers };
}

function createMockSurveys(now) {
  const startAt = now - 30 * DAY;
  const endAt = now + 30 * DAY;

  const survey1 = {
    id: 's1',
    ownerId: 'u_demo_1',
    ownerName: '林同学',
    title: '大学生网购消费习惯调查',
    description: '了解大学生每月网购频次、常用平台与消费金额，用于课程调研与消费行为分析。',
    category: '生活服务',
    minutes: 3,
    participantCount: 36,
    createdAt: now - 60 * 1000,
    startAt: startAt,
    endAt: endAt,
    status: 'open',
    questions: [
      question('s1q1', 'single', '你平均每月网购几次？', ['1-2 次', '3-5 次', '6-10 次', '10 次以上']),
      question('s1q2', 'single', '你常用的购物平台是？', ['淘宝 / 天猫', '京东', '拼多多', '抖音 / 快手']),
      question('s1q3', 'single', '你单次网购的平均金额是？', ['50 元以内', '50-200 元', '200-500 元', '500 元以上']),
      question('s1q4', 'single', '影响你下单的主要因素是？', ['价格优惠', '商品评价', '物流速度', '品牌口碑'])
    ],
    seedStats: {
      s1q1: choiceStats(36, [12, 10, 8, 6]),
      s1q2: choiceStats(36, [15, 9, 7, 5]),
      s1q3: choiceStats(36, [8, 14, 9, 5]),
      s1q4: choiceStats(36, [16, 10, 6, 4])
    }
  };

  const survey2 = {
    id: 's2',
    ownerId: 'u_demo_2',
    ownerName: '周同学',
    title: '关于校园食堂满意度的调研',
    description: '收集同学对食堂口味、价格、卫生与效率的评价，用于校园服务改进与食堂反馈。',
    category: '学习调研',
    minutes: 2,
    participantCount: 28,
    createdAt: now - 120 * 1000,
    startAt: startAt,
    endAt: endAt,
    status: 'open',
    questions: [
      question('s2q1', 'single', '你每周在食堂就餐几次？', ['1-3 次', '4-6 次', '7-10 次', '10 次以上']),
      question('s2q2', 'single', '你对食堂菜品的口味满意吗？', ['非常满意', '比较满意', '一般', '不满意']),
      question('s2q3', 'multiple', '你最希望食堂改进什么？（可多选）', ['口味', '价格', '卫生', '排队效率', '营业时间']),
      question('s2q4', 'open', '你对食堂还有什么建议？', [])
    ],
    seedStats: {
      s2q1: choiceStats(28, [7, 9, 8, 4]),
      s2q2: choiceStats(28, [5, 11, 8, 4]),
      s2q3: choiceStats(28, [18, 14, 12, 9, 6]),
      s2q4: openStats([
        '希望增加夜宵窗口',
        '建议错峰供餐，减少排队',
        '口味偏咸，希望清淡一些',
        '增加水果和轻食窗口',
        '高峰期排队时间太长',
        '希望加强餐具和桌面卫生',
        '价格可以再实惠一点',
        '希望每周更新更多菜品'
      ])
    }
  };

  const survey3 = {
    id: 's3',
    ownerId: 'u_demo_3',
    ownerName: '陈同学',
    title: '社团活动参与意愿调查',
    description: '了解同学对社团类型与活动形式的偏好，帮助社团优化招新与活动安排。',
    category: '社团活动',
    minutes: 4,
    participantCount: 19,
    createdAt: now - 180 * 1000,
    startAt: startAt,
    endAt: endAt,
    status: 'open',
    questions: [
      question('s3q1', 'single', '你目前参加了几个社团？', ['0 个', '1 个', '2 个', '3 个及以上']),
      question('s3q2', 'multiple', '你更愿意参加哪类社团活动？（可多选）', ['学术讲座', '志愿服务', '文体比赛', '户外拓展']),
      question('s3q3', 'open', '你希望社团增加什么活动？', [])
    ],
    seedStats: {
      s3q1: choiceStats(19, [3, 7, 5, 4]),
      s3q2: choiceStats(19, [10, 12, 8, 9]),
      s3q3: openStats([
        '希望增加更多志愿服务活动',
        '希望多办一些户外拓展',
        '可以增加跨社团联谊活动',
        '希望有更多学术类讲座',
        '活动时间尽量安排在周末',
        '希望增加活动报名名额'
      ])
    }
  };

  const survey4 = {
    id: 's4',
    ownerId: 'u_self',
    ownerName: '校园用户',
    title: '仲景文化认知调查',
    description: '了解同学们对仲景文化及中医药知识的认知程度与兴趣方向，为校园文化活动提供参考。',
    category: '学习调研',
    minutes: 3,
    participantCount: 42,
    createdAt: now - 240 * 1000,
    startAt: startAt,
    endAt: endAt,
    status: 'open',
    questions: [
      question('s4q1', 'single', '你是否了解张仲景与《伤寒杂病论》？', ['非常了解', '了解一些', '只听过名字', '完全不了解']),
      question('s4q2', 'multiple', '你通过哪些渠道接触过仲景文化？（可多选）', ['课堂', '校园活动', '短视频 / 社交媒体', '书籍', '亲友介绍']),
      question('s4q3', 'open', '你希望学校如何推广仲景文化？', []),
      question('s4q4', 'single', '你是否愿意参加仲景文化主题活动？', ['愿意', '视活动内容而定', '不愿意'])
    ],
    seedStats: {
      s4q1: choiceStats(42, [5, 14, 15, 8]),
      s4q2: choiceStats(42, [20, 12, 18, 7, 6]),
      s4q3: openStats([
        '希望多举办中医药文化体验活动',
        '可以结合短视频进行宣传',
        '建议开设仲景文化选修课',
        '希望有专家进校园讲座',
        '可以组织参观中医药文化馆',
        '希望活动形式更有趣一些',
        '建议结合传统节日做主题活动',
        '希望增加互动问答和体验环节',
        '可以做成系列校园文化活动'
      ]),
      s4q4: choiceStats(42, [16, 20, 6])
    }
  };

  return [survey1, survey2, survey3, survey4];
}

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
  createMockSurveys: createMockSurveys,
  TEMPLATES: TEMPLATES
};
