import { describe, expect, it } from "vitest";
import { getAuditModelProviderId, getSelectableAuditModels } from "../client/src/lib/auditModelSelection";

describe("审核员模型级联选项", () => {
  const providers = [
    { id: 11, isEnabled: 1, healthStatus: "healthy" },
    { id: 12, isEnabled: 1, healthStatus: "disabled" },
    { id: 13, isEnabled: 0, healthStatus: "healthy" },
  ];
  const models = [
    { model: { id: 101, providerId: 11, isEnabled: 1 }, providerName: "新增受管供应商" },
    { model: { id: 102, providerId: 11, isEnabled: 0 }, providerName: "新增受管供应商" },
    { model: { id: 103, providerId: 12, isEnabled: 1 }, providerName: "已禁用供应商" },
    { model: { id: 104, providerId: 13, isEnabled: 1 }, providerName: "未启用供应商" },
  ];

  it("展示新增且已启用供应商下的已启用模型，并排除禁用组合", () => {
    const options = getSelectableAuditModels(providers, models);
    expect(options.providers.map(provider => provider.id)).toEqual([11]);
    expect(options.models.map(item => item.model.id)).toEqual([101]);
  });

  it("可从已保存的模型选择恢复其供应商，用于审核员配置回显", () => {
    expect(getAuditModelProviderId(101, models)).toBe(11);
    expect(getAuditModelProviderId(999, models)).toBe(0);
  });
});
