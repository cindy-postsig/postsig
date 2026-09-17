import { useRef } from 'react';
import { type Editor } from '@tiptap/react';
import logger from '@/utils/pino';
import { Button } from '@/components/ui/button';
import {
  FilePlusIcon,
  FontBoldIcon,
  FontItalicIcon,
  Link2Icon,
  ListBulletIcon,
  UnderlineIcon,
} from '@radix-ui/react-icons';
import {
  ALLOWED_MIME_TYPES,
  UserData,
  processMultipleFiles,
} from '@/app/lib/contracts/attachments';
import {
  TooltipProvider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAttachmentStorage } from '@/hooks/useAttachmentStorage';
import { useToast } from '@/components/ui/use-toast'; // Import useToast directly in the Toolbar

const OVERAGE_ALLOWANCE = 0.25 * 1024 * 1024;

interface ToolbarProps {
  editor: Editor | null;
  userData?: UserData;
  toastFn?: any; // Keep for backward compatibility
}

export function Toolbar({ editor, userData, toastFn }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast(); // Get toast locally to ensure we always have a toast function
  const {
    remainingStorage,
    isLimitReached,
    isLoading,
    refreshStorage,
    formatStorage,
  } = useAttachmentStorage(userData?.contractId);

  if (!editor || !userData) {
    return null;
  }

  const addLink = () => {
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleFileClick = () => {
    if (!isLimitReached && !isLoading) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Use the local toast function first, fall back to passed toastFn, and only then to logger
    const effectiveToastFn =
      toast ||
      toastFn ||
      ((msg: any) =>
        logger.info({ description: msg.description }, 'Toast fallback'));

    // Always allow overage for all uploads
    const success = await processMultipleFiles(
      editor,
      files,
      userData,
      null, // Use current cursor position
      effectiveToastFn,
      true, // Always allow overage
    );

    // Refresh storage usage data if upload was successful
    if (success) {
      refreshStorage();
    }

    // Reset the input value so the same file can be selected again if needed
    event.target.value = '';
  };

  return (
    <div className="mb-2 flex gap-2">
      <Button
        type="button"
        size="icon"
        variant={editor.isActive('bold') ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <FontBoldIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={editor.isActive('italic') ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <FontItalicIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={editor.isActive('underline') ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListBulletIcon className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant={editor.isActive('link') ? 'default' : 'ghost'}
        className="h-7 w-7"
        onClick={addLink}
      >
        <Link2Icon className="h-4 w-4" />
      </Button>

      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span className="inline-block" onMouseEnter={refreshStorage}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleFileClick}
                disabled={isLimitReached}
              >
                <FilePlusIcon className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="">
            {isLimitReached ? (
              <p>Upload limit reached</p>
            ) : (
              <>
                <p className="font-semibold">Add attachments</p>
                <p>
                  {isLoading ? (
                    <span className="text-muted-foreground">
                      Checking storage...
                    </span>
                  ) : (
                    `${formatStorage(remainingStorage)} remaining`
                  )}
                </p>
              </>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept={ALLOWED_MIME_TYPES.join(',')}
        multiple
      />
    </div>
  );
}
