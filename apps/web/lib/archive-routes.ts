export function archiveDocumentHref(campaignId: string, documentId: string, documentType?: string) {
  return documentType === "campaign"
    ? `/campaigns/${campaignId}/archive`
    : `/campaigns/${campaignId}/archive/items/${documentId}`;
}
