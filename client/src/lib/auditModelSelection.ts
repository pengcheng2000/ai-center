export type AuditProviderOption = { id: number; isEnabled: number; healthStatus: string };
export type AuditModelOption<T = unknown> = { model: { id: number; providerId: number; isEnabled: number } } & T;

export function getSelectableAuditModels<P extends AuditProviderOption, T>(providers: P[], models: Array<AuditModelOption<T>>) {
  const enabledProviders = providers.filter(provider => Boolean(provider.isEnabled) && provider.healthStatus !== "disabled");
  const enabledProviderIds = new Set(enabledProviders.map(provider => provider.id));
  return { providers: enabledProviders, models: models.filter(({ model }) => Boolean(model.isEnabled) && enabledProviderIds.has(model.providerId)) };
}

export function getAuditModelProviderId<T>(selectedModelId: number | undefined, models: Array<AuditModelOption<T>>) {
  return selectedModelId ? models.find(item => item.model.id === selectedModelId)?.model.providerId ?? 0 : 0;
}
