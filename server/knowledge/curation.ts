import {
  cleanExcerpt,
  defaultEditorial,
  type KnowledgeEditorial,
  type KnowledgeCategory,
} from "../../shared/knowledge";
export function initialEditorial(input: {
  title: string;
  body: string;
  kind: string;
  ancestors: string[];
  hasChildren: boolean;
}): KnowledgeEditorial {
  const { title, kind, ancestors, hasChildren } = input;
  const body = cleanExcerpt(input.body, 3000);
  const prose = cleanExcerpt(
    input.body
      .replace(/!?\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/^\s*>?\s*#{1,6}.*$/gm, ""),
    3000
  );
  const exclusion =
    /开发者测试入口|更新日志|建设中|施工中/.test(title) ||
    /^(TODO|TBD|待补充|待完善)(\s|$)/i.test(body)
      ? "测试、变更记录或施工内容"
      : ancestors.some(a => /历史方案存档/.test(a)) ||
          /历史方案存档|被.*干碎|大量内容已过时/.test(
            title + " " + body.slice(0, 150)
          )
        ? "历史或已失效资料"
        : ["shortcut", "other"].includes(kind)
          ? "来源引用，未形成独立正文"
          : (!body.trim() ||
                (hasChildren && prose.length < 40) ||
                (!prose.trim() && !/knowledge-asset:/.test(input.body))) &&
              kind !== "file"
            ? hasChildren
              ? "纯目录节点，保留为导航"
              : "空壳或仅含不支持的结构"
            : "";
  const rules: Array<[KnowledgeCategory, RegExp]> = [
    [
      "cases",
      /案例|解决方案|合同审核|智能巡检|小助手|机器人|智能提取|采购云|价格情绪|小泰阳|报告文件对比|课程评审项目/i,
    ],
    [
      "tutorials",
      /第\d+篇|实操|教程|怎么|如何|入门1|快速开始|快速上手|使用手册|使用小|工作坊|指南|Tips|演示|跟着做/i,
    ],
    [
      "development",
      /代码|开发|集成|接口|SDK|API|SQL|SpecKit|Copilot|LangChain|Spring AI|Milvus|\.Net|\.NET|编程|MCP|工作流|向量数据库|技术方案|数据模型|Markdown|SuperPowers|代理框架/i,
    ],
    [
      "tools",
      /平台|工具|模型全集|Aily|AILY|HiAgent|Hiagent|飞书|豆包|OpenClaw|Skill|技能|能力中心|Stitch|Seedance|Banana|GLM|DeepSeek/i,
    ],
    [
      "governance",
      /规范|治理|评估|评测|评审|安全|白名单|参考|模板|管理|领导力|战略|观点|报告|论坛|Weekly|周刊|资讯|运营/i,
    ],
  ];
  // Step-by-step titles take precedence over the subject of the exercise.
  const stepByStep = /第\d+篇.*(?:跟着|实操|搭|制作)|教程|实操|快速上手/.test(
    title
  );
  const match = rules.find(([, re]) => re.test(title));
  const category: KnowledgeCategory =
    /规范|治理|安全|白名单|评测|评估|价值运营|领导力|战略/.test(title)
      ? "governance"
      : /到底是什么|怎么读懂图片|科普|认知|基本概念|基础知识|常用术语/.test(
            title
          )
        ? "basics"
        : /面向开发者.*集成/.test(body.slice(0, 300))
          ? "development"
          : stepByStep
            ? "tutorials"
            : (match?.[0] ??
              (/开发|软件工程/.test(ancestors.join(" "))
                ? "development"
                : /案例/.test(ancestors.join(" "))
                  ? "cases"
                  : "basics"));
  const topic =
    ancestors
      .slice()
      .reverse()
      .find(a =>
        /订阅号推文合集|AiDevOps赋能系列|SpecKit开发系列|Aily101|AI 工作坊|AI工作坊|内部分享课程/.test(
          a
        )
      ) ?? "";
  const order = title.match(/第\s*0*(\d+)\s*[篇期]/)?.[1];
  const chineseOrder = title.match(/第([一二三四五六七八九十]+)期/)?.[1];
  const digits = "零一二三四五六七八九";
  const seriesOrder = order
    ? Number(order)
    : chineseOrder
      ? chineseOrder.includes("十")
        ? (digits.indexOf(chineseOrder.split("十")[0]) || 1) * 10 +
          Math.max(0, digits.indexOf(chineseOrder.split("十")[1]))
        : digits.indexOf(chineseOrder)
      : 0;
  return {
    ...defaultEditorial(),
    category,
    topic,
    topicOrder: seriesOrder,
    included: !exclusion,
    reason:
      exclusion ||
      (stepByStep
        ? "按分步实操用途初分，待人工复核"
        : match
          ? "按标题主要用途及来源目录初分，待人工复核"
          : "按基础认知或父级目录初分，待人工复核"),
  };
}
