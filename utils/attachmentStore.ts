interface AttachmentData {
  id: number; // Adding ID to track attachments
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  publicUrl: string;
  createdAt: number; // Add timestamp
}

let pendingAttachments: AttachmentData[] = [];

export const attachmentStore = {
  /**
   * Add a pending attachment to the store
   */
  addPendingAttachment(attachment: {
    id: number;
    filePath: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    publicUrl: string;
  }): void {
    pendingAttachments.push({
      ...attachment,
      createdAt: Date.now(), // Add creation timestamp
    });
  },

  /**
   * Get all pending attachments
   */
  getPendingAttachments(): AttachmentData[] {
    return [...pendingAttachments];
  },

  /**
   * Get IDs of all pending attachments
   */
  getPendingAttachmentIds(): number[] {
    return pendingAttachments.map((attachment) => attachment.id);
  },

  /**
   * Clear all pending attachments
   */
  clearPendingAttachments(): void {
    pendingAttachments = [];
  },

  /**
   * Get orphaned attachments (older than specified time)
   * @param ageInHours Number of hours to consider an attachment orphaned
   */
  getOrphanedAttachments(ageInHours: number = 12): AttachmentData[] {
    const cutoffTime = Date.now() - ageInHours * 60 * 60 * 1000;
    return pendingAttachments.filter((att) => att.createdAt < cutoffTime);
  },

  /**
   * Get IDs of orphaned attachments
   * @param ageInHours Number of hours to consider an attachment orphaned
   */
  getOrphanedAttachmentIds(ageInHours: number = 12): number[] {
    return this.getOrphanedAttachments(ageInHours).map((att) => att.id);
  },

  /**
   * Remove a specific attachment from the pending list
   * @param id The ID of the attachment to remove
   */
  removePendingAttachment(id: number): void {
    pendingAttachments = pendingAttachments.filter((att) => att.id !== id);
  },
};
