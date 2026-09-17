import {
  getTotalContractAttachmentSize,
  uploadAttachment,
} from '@/data/contracts';
import { attachmentStore } from '@/utils/attachmentStore';
import logger from '@/utils/pino';
import { createClient } from '@/utils/supabase/client';
import { Editor } from '@tiptap/react';

export interface UserData {
  userId: string;
  organizationId: string;
  contractId: number;
  commentId?: number;
}

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB per file
export const TOTAL_CONTRACT_ATTACHMENT_SIZE = 2 * 1024 * 1024; // 2MB per contract
export const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/pdf',
];

export async function validateContractAttachmentSize(
  contractId: number,
  newFileSize: number,
  toastFn?: any,
  allowOverage: boolean = true,
): Promise<boolean> {
  try {
    const currentSize = await getTotalContractAttachmentSize(contractId);
    const newTotalSize = currentSize + newFileSize;

    const OVERAGE_ALLOWANCE = 0.25 * 1024 * 1024;

    // If we're allowing overage and the total is within the limit + allowance
    if (
      allowOverage &&
      newTotalSize <= TOTAL_CONTRACT_ATTACHMENT_SIZE + OVERAGE_ALLOWANCE
    ) {
      return true;
    }

    // Normal case: check against the regular limit
    if (newTotalSize > TOTAL_CONTRACT_ATTACHMENT_SIZE) {
      const errorMessage = `Contract storage limit exceeded. The contract has ${(currentSize / (1024 * 1024)).toFixed(2)}MB of attachments and adding ${(newFileSize / (1024 * 1024)).toFixed(2)}MB would exceed the ${TOTAL_CONTRACT_ATTACHMENT_SIZE / (1024 * 1024)}MB limit.`;
      if (toastFn) {
        toastFn({
          variant: 'destructive',
          description: errorMessage,
        });
      } else {
        alert(errorMessage);
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error validating contract attachment size:', error);
    return false;
  }
}

export async function uploadCommentAttachment(
  file: File,
  userData: UserData,
  toastFn?: any,
  allowOverage: boolean = true, // Add this parameter with default true
): Promise<{ url: string; attachmentId: string | number; filePath: string }> {
  try {
    // Pass the allowOverage parameter to validateContractAttachmentSize
    if (
      !(await validateContractAttachmentSize(
        userData.contractId,
        file.size,
        toastFn,
        allowOverage,
      ))
    ) {
      throw new Error('Contract attachment size limit exceeded.');
    }

    // Rest of the function remains the same
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', userData.userId);
    formData.append('organizationId', userData.organizationId);
    formData.append('contractId', userData.contractId.toString());

    if (userData.commentId) {
      formData.append('commentId', userData.commentId.toString());
    }

    const result = await uploadAttachment(formData);

    if (!userData.commentId && result.attachmentData) {
      attachmentStore.addPendingAttachment(result.attachmentData);
    }

    return {
      url: result.url,
      attachmentId: result.attachmentData?.id || '',
      filePath: result.attachmentData?.filePath || '',
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

export function validateAttachment(file: File, toastFn?: any): boolean {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    const errorMessage =
      'File type not supported. Please upload a PNG, JPEG, GIF, or PDF file.';
    if (toastFn) {
      toastFn({
        variant: 'destructive',
        description: errorMessage,
      });
    } else {
      alert(errorMessage);
    }
    return false;
  }

  if (file.size > MAX_FILE_SIZE) {
    const errorMessage = `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`;
    if (toastFn) {
      toastFn({
        variant: 'destructive',
        description: errorMessage,
      });
    } else {
      alert(errorMessage);
    }
    return false;
  }

  return true;
}

export async function handleAttachmentUpload(
  editor: Editor,
  file: File,
  userData: UserData,
  toastFn?: any,
  allowOverage: boolean = true, // Add parameter with default true
): Promise<boolean> {
  if (!validateAttachment(file, toastFn)) {
    return false;
  }

  const loadingId = `loading-${Date.now()}`;
  const isImageFile = file.type.startsWith('image/');

  // For image files, read the dimensions to get aspect ratio
  if (isImageFile) {
    // Insert placeholder code remains the same
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'attachment',
        attrs: {
          id: loadingId,
          filename: file.name,
          filetype: file.type,
          filesize: file.size,
          path: '', // Will be filled after upload
          // Add dimensions data for the loader
          isLoading: true,
        },
      })
      .run();

    // Read image dimensions
    try {
      const dimensions = await getImageDimensions(file);

      // Find and update the placeholder with dimensions
      editor.state.doc.descendants((node, posNode) => {
        if (node.attrs && node.attrs.id === loadingId) {
          const currentNode = editor.state.doc.nodeAt(posNode);
          if (currentNode) {
            editor
              .chain()
              .deleteRange({
                from: posNode,
                to: posNode + currentNode.nodeSize,
              })
              .insertContentAt(posNode, {
                type: 'attachment',
                attrs: {
                  id: loadingId,
                  filename: file.name,
                  filetype: file.type,
                  filesize: file.size,
                  path: '',
                  width: dimensions.width,
                  height: dimensions.height,
                  isLoading: true,
                },
              })
              .run();
          }
          return true;
        }
        return false;
      });
    } catch (error) {
      console.warn('Could not read image dimensions:', error);
      // Continue with upload even if we can't get dimensions
    }
  } else {
    // For other files, insert file-like placeholder
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'attachment',
        attrs: {
          id: loadingId,
          filename: file.name,
          filetype: file.type,
          filesize: file.size,
          path: '', // Will be filled after upload
          isLoading: true,
        },
      })
      .run();
  }

  try {
    // Pass toastFn and allowOverage to uploadCommentAttachment
    const { url, attachmentId, filePath } = await uploadCommentAttachment(
      file,
      userData,
      toastFn,
      allowOverage,
    );

    // Rest of the function remains the same
    let placeholderPos = null;
    let placeholderDimensions = { width: null, height: null };

    editor.state.doc.descendants((node, posNode) => {
      if (node.attrs && node.attrs.id === loadingId) {
        placeholderPos = posNode;

        // Keep track of any dimensions we've determined
        if (node.attrs.width && node.attrs.height) {
          placeholderDimensions.width = node.attrs.width;
          placeholderDimensions.height = node.attrs.height;
        }
        return true;
      }
      return false;
    });

    if (placeholderPos !== null) {
      const node = editor.state.doc.nodeAt(placeholderPos);
      if (node) {
        // Replace the placeholder with the actual attachment
        editor
          .chain()
          .deleteRange({
            from: placeholderPos,
            to: placeholderPos + node.nodeSize,
          })
          .insertContent({
            type: 'attachment',
            attrs: {
              id: attachmentId,
              filename: file.name,
              filetype: file.type,
              filesize: file.size,
              path: filePath,
              signedUrl: url,
              // Transfer dimensions if we have them
              width: placeholderDimensions.width,
              height: placeholderDimensions.height,
              // Make sure to set isLoading to false
              isLoading: false,
            },
          })
          .run();
      }
    }

    return true;
  } catch (error) {
    console.error('Error uploading file:', error);

    // Display error message
    const errorMessage = 'Failed to upload file. Please try again.';
    if (toastFn) {
      toastFn({
        variant: 'destructive',
        description: errorMessage,
      });
    } else {
      alert(errorMessage);
    }

    // Remove the loading placeholder
    editor.state.doc.descendants((node, posNode) => {
      if (node.attrs && node.attrs.id === loadingId) {
        const currentNode = editor.state.doc.nodeAt(posNode);
        if (currentNode) {
          editor
            .chain()
            .deleteRange({
              from: posNode,
              to: posNode + currentNode.nodeSize,
            })
            .run();
        }
        return true;
      }
      return false;
    });

    return false;
  }
}

export function countExistingAttachments(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node: any) => {
    if (node.type.name === 'attachment') {
      count++;
    }
    return true;
  });
  return count;
}

export async function processMultipleFiles(
  editor: Editor,
  files: FileList | File[],
  userData: UserData,
  pos: number | null,
  toastFn: any,
  allowOverage: boolean = true,
): Promise<boolean> {
  // If no contract ID is provided, we can't validate against total size
  if (!userData.contractId) {
    toastFn({
      variant: 'destructive',
      description: 'Contract ID is required for file uploads.',
    });
    return false;
  }

  // Step 1: Filter out individually oversized files
  const oversizedFiles: string[] = [];
  const invalidTypeFiles: string[] = [];

  let filesToProcess = Array.from(files).filter((file) => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      oversizedFiles.push(file.name);
      return false;
    }

    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      invalidTypeFiles.push(file.name);
      return false;
    }

    return true;
  });

  // Show warnings for rejected files
  if (oversizedFiles.length > 0) {
    toastFn({
      variant: 'destructive',
      description: `${oversizedFiles.length} file(s) exceeded the ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB individual size limit.`,
    });
  }

  if (invalidTypeFiles.length > 0) {
    toastFn({
      variant: 'destructive',
      description: `${invalidTypeFiles.length} file(s) were not of an allowed file type.`,
    });
  }

  // If no files to process after filtering, return
  if (filesToProcess.length === 0) {
    return false;
  }

  // Step 2: Get current contract attachment size
  const currentContractSize = await getTotalContractAttachmentSize(
    userData.contractId,
  );
  const OVERAGE_ALLOWANCE = 0.25 * 1024 * 1024; // 256KB

  // Calculate max allowed size with overage
  const maxAllowedSize = allowOverage
    ? TOTAL_CONTRACT_ATTACHMENT_SIZE + OVERAGE_ALLOWANCE
    : TOTAL_CONTRACT_ATTACHMENT_SIZE;

  // Debug information
  logger.debug(
    {
      currentContractSizeMB: (currentContractSize / (1024 * 1024)).toFixed(2),
      maxAllowedSizeMB: (maxAllowedSize / (1024 * 1024)).toFixed(2),
      remainingStorageMB: (
        (maxAllowedSize - currentContractSize) /
        (1024 * 1024)
      ).toFixed(2),
    },
    'Contract storage information',
  );

  // Step 3: Sort files by size (smaller first) to maximize how many we can upload
  filesToProcess.sort((a, b) => a.size - b.size);

  // Process each file individually against the contract limit
  const filesToUpload: File[] = [];
  const skippedDueToSize: string[] = [];
  let runningTotal = currentContractSize;

  for (const file of filesToProcess) {
    if (runningTotal + file.size <= maxAllowedSize) {
      filesToUpload.push(file);
      runningTotal += file.size;
    } else {
      skippedDueToSize.push(file.name);
    }
  }

  logger.info(
    {
      selectedFilesCount: filesToUpload.length,
      totalSizeMB: (
        (runningTotal - currentContractSize) /
        (1024 * 1024)
      ).toFixed(2),
    },
    `Selected ${filesToUpload.length} files totaling ${((runningTotal - currentContractSize) / (1024 * 1024)).toFixed(2)}MB`,
  );

  // Single toast message for result summary
  if (filesToUpload.length === 0) {
    toastFn({
      variant: 'warning',
      description: `Couldn't upload any files. Available space: ${((maxAllowedSize - currentContractSize) / (1024 * 1024)).toFixed(2)}MB. Please try smaller files.`,
    });
    return false;
  } else if (skippedDueToSize.length > 0) {
    toastFn({
      variant: 'info',
      description: `${filesToUpload.length} file(s) will be uploaded. ${skippedDueToSize.length} file(s) were skipped due to size limits.`,
    });
  }

  // Function to get image dimensions
  function getImageDimensions(
    file: File,
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.width,
          height: img.height,
        });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  try {
    // Prepare file info - load dimensions for images first
    const filesWithInfo = await Promise.all(
      filesToUpload.map(async (file, index) => {
        const isImage = file.type.startsWith('image/');
        let dimensions = { width: null, height: null };

        if (isImage) {
          try {
            // @ts-ignore
            dimensions = await getImageDimensions(file);
          } catch (error) {
            console.warn(`Could not read dimensions for ${file.name}:`, error);
          }
        }

        return {
          file,
          dimensions,
          loadingId: `loading-${Date.now()}-${index}`,
        };
      }),
    );

    // Find the right position to insert attachments
    let insertPos: number;

    if (pos !== null) {
      // If position is explicitly provided, use it
      insertPos = pos;
    } else {
      // Otherwise, always append at the end of the document
      insertPos = editor.state.doc.content.size;
    }

    // Insert all placeholders at once
    const placeholders = filesWithInfo.map((fileInfo) => ({
      type: 'attachment',
      attrs: {
        id: fileInfo.loadingId,
        filename: fileInfo.file.name,
        filetype: fileInfo.file.type,
        filesize: fileInfo.file.size,
        path: '',
        width: fileInfo.dimensions.width,
        height: fileInfo.dimensions.height,
        isLoading: true,
      },
    }));

    // Insert all placeholders at the determined position
    editor.chain().focus().insertContentAt(insertPos, placeholders).run();

    // Upload all files in parallel
    const uploadPromises = filesToUpload.map((file) =>
      uploadCommentAttachment(file, userData),
    );

    const results = await Promise.all(uploadPromises);

    // Replace each placeholder with the actual attachment
    for (let i = 0; i < filesWithInfo.length; i++) {
      const { loadingId, dimensions } = filesWithInfo[i];
      const { url, attachmentId, filePath } = results[i];

      // Find the placeholder
      let placeholderFound = false;

      editor.state.doc.descendants((node, posNode) => {
        if (node.attrs && node.attrs.id === loadingId) {
          const placeholderNode = editor.state.doc.nodeAt(posNode);

          if (placeholderNode) {
            // Replace with actual attachment
            editor
              .chain()
              .deleteRange({
                from: posNode,
                to: posNode + placeholderNode.nodeSize,
              })
              .insertContentAt(posNode, {
                type: 'attachment',
                attrs: {
                  id: attachmentId,
                  filename: filesToUpload[i].name,
                  filetype: filesToUpload[i].type,
                  filesize: filesToUpload[i].size,
                  path: filePath,
                  signedUrl: url,
                  width: dimensions.width,
                  height: dimensions.height,
                  isLoading: false,
                },
              })
              .run();

            placeholderFound = true;
          }
          return true; // Stop traversal
        }
        return false;
      });

      // If placeholder wasn't found (rare but possible due to editor changes)
      if (!placeholderFound) {
        // Fallback: just append the attachment at the end
        editor
          .chain()
          .insertContent({
            type: 'attachment',
            attrs: {
              id: attachmentId,
              filename: filesToUpload[i].name,
              filetype: filesToUpload[i].type,
              filesize: filesToUpload[i].size,
              path: filePath,
              signedUrl: url,
              width: dimensions.width,
              height: dimensions.height,
              isLoading: false,
            },
          })
          .run();
      }
    }

    return filesToUpload.length > 0;
  } catch (error) {
    console.error('Error processing files:', error);

    // Clean up all placeholders on error
    editor.state.doc.descendants((node, posNode) => {
      if (
        node.attrs &&
        node.attrs.id &&
        String(node.attrs.id).startsWith('loading-')
      ) {
        const placeholderNode = editor.state.doc.nodeAt(posNode);
        if (placeholderNode) {
          editor
            .chain()
            .deleteRange({
              from: posNode,
              to: posNode + placeholderNode.nodeSize,
            })
            .run();
        }
      }
    });

    // Insert error message
    toastFn({
      variant: 'destructive',
      description: 'Upload failed. Please try again.',
    });

    return false;
  }
}

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.width,
        height: img.height,
      });
      URL.revokeObjectURL(img.src); // Clean up
    };
    img.onerror = () => {
      reject(new Error('Failed to load image'));
      URL.revokeObjectURL(img.src); // Clean up
    };
    img.src = URL.createObjectURL(file);
  });
}
