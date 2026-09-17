import React, { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { getSignedUrlForAttachment } from '@/data/contracts';
import { getFromUrlCache, addToUrlCache } from '@/utils/attachmentCache';
import { Cross1Icon, FileTextIcon } from '@radix-ui/react-icons';

export const AttachmentView: React.FC<NodeViewProps> = (props) => {
  const { node, selected, getPos, editor } = props;
  const {
    id,
    filename,
    filetype,
    filesize,
    path,
    signedUrl: initialSignedUrl,
    width,
    height,
    isLoading: explicitLoadingState,
  } = node.attrs;

  const [signedUrl, setSignedUrl] = useState<string | null>(
    initialSignedUrl || null,
  );
  const [isLoading, setIsLoading] = useState(() => {
    if (explicitLoadingState === true) return true;
    if (initialSignedUrl) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(null);

  // Only fetch if we don't already have a URL
  useEffect(() => {
    // If we're in explicit loading state (during upload), don't try to fetch URL
    if (explicitLoadingState) {
      setIsLoading(true);
      return;
    }

    if (initialSignedUrl) {
      setSignedUrl(initialSignedUrl);
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cachedUrl = getFromUrlCache(id);
    if (cachedUrl) {
      setSignedUrl(cachedUrl);
      setIsLoading(false);
      return;
    }

    fetchSignedUrl();

    // Set up a limited refresh interval only for active editing - every 40 minutes
    const refreshInterval = setInterval(fetchSignedUrl, 40 * 60 * 1000);
    return () => clearInterval(refreshInterval);
  }, [id, path, initialSignedUrl, explicitLoadingState]);

  const fetchSignedUrl = async () => {
    // If we're in the explicit loading state for a new upload, don't try to fetch the URL yet
    // and don't show an error - the path will be populated once the upload completes
    if (explicitLoadingState) {
      return;
    }

    if (!path) {
      setError('Missing attachment path');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const result = await getSignedUrlForAttachment(path);

      if ('error' in result) {
        throw new Error(result.error);
      }

      // Add to cache with 50 minute expiry
      addToUrlCache(id, result.url, 50);

      setSignedUrl(result.url);
      setError(null);
    } catch (err) {
      console.error('Error fetching signed URL:', err);
      setError('Failed to load file.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle keyboard shortcuts to prevent accidental deletion
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent default behavior for backspace and delete keys
    if ((e.key === 'Backspace' || e.key === 'Delete') && selected) {
      e.preventDefault();
    }
  };

  // Common selected styling
  const selectedClass = selected
    ? 'outline outline-2 outline-blue-500 shadow-md'
    : '';

  // Image loading placeholder
  if (!error && (isLoading || !signedUrl) && filetype?.startsWith('image/')) {
    // Extract dimensions from the node attrs if they exist
    const { width, height } = node.attrs;

    // Calculate aspect ratio and dimensions for the placeholder
    let placeholderWidth = 300; // Default width
    let placeholderHeight = 200; // Default height

    if (width && height && Number(width) > 0 && Number(height) > 0) {
      // We have valid dimensions, so calculate proportional placeholder
      const aspectRatio = Number(width) / Number(height);

      if (Number(height) > 300) {
        // If image is taller than 300px, scale it down
        placeholderHeight = 300;
        placeholderWidth = Math.round(aspectRatio * 300);

        // Cap width at 100% container width
        if (placeholderWidth > 500) {
          placeholderWidth = 500;
          placeholderHeight = Math.round(500 / aspectRatio);
        }
      } else {
        // Use original dimensions, but constrain to reasonable size
        placeholderHeight = Math.min(Number(height), 300);
        placeholderWidth = Math.min(Number(width), 500);
      }
    }

    return (
      <NodeViewWrapper
        className={`attachment-container relative my-2 inline-block ${selectedClass}`}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div
          className="flex items-center justify-center rounded-sm border bg-gray-100 dark:bg-gray-800"
          style={{
            width: `${placeholderWidth}px`,
            height: `${placeholderHeight}px`,
            maxWidth: '100%',
            maxHeight: '300px',
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded-full bg-gray-300 dark:bg-gray-700" />
            <span className="text-sm text-gray-500 dark:text-gray-500">
              {explicitLoadingState ? 'Uploading...' : 'Loading...'}
            </span>
          </div>
        </div>

        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-500 bg-opacity-10">
            <button
              type="button"
              className="absolute right-1 top-1 rounded-full border bg-white p-1 text-foreground shadow-md dark:bg-black"
              onClick={() => {
                editor.commands.deleteRange({
                  from: getPos(),
                  to: getPos() + node.nodeSize,
                });
              }}
              title="Delete attachment"
            >
              <Cross1Icon width={14} height={14} />
            </button>
          </div>
        )}
      </NodeViewWrapper>
    );
  }

  // File loading placeholder
  if (!error && (isLoading || !signedUrl) && !filetype?.startsWith('image/')) {
    return (
      <NodeViewWrapper
        className={`attachment-container my-2 inline-flex w-auto items-center gap-2 rounded-sm border px-2 py-1 ${selectedClass}`}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div className="flex-shrink-0 text-gray-500">
          <FileTextIcon width={14} height={14} />
        </div>
        <div className="flex-1">
          <div className="font-medium line-clamp-1 text-sm text-gray-500">
            {filename}
          </div>
        </div>

        {selected && (
          <button
            type="button"
            className="p-1 text-foreground"
            onClick={() => {
              editor.commands.deleteRange({
                from: getPos(),
                to: getPos() + node.nodeSize,
              });
            }}
            title="Delete attachment"
          >
            <Cross1Icon width={14} height={14} />
          </button>
        )}
      </NodeViewWrapper>
    );
  }

  if (error) {
    return (
      <NodeViewWrapper
        className={`attachment-error rounded-sm border border-red-200 bg-red-50 p-3 text-red-600 ${selectedClass}`}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <p className="text-sm">{error}</p>
        <button
          className="mt-1 text-xs text-red-700 underline"
          onClick={() => {
            setIsLoading(true);
            setError(null);
            void fetchSignedUrl();
          }}
        >
          Retry
        </button>
      </NodeViewWrapper>
    );
  }

  if (filetype?.startsWith('image/')) {
    return (
      <NodeViewWrapper
        className={`attachment-container group relative my-2 inline-block ${selectedClass}`}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <Image
          src={signedUrl || ''}
          alt={filename}
          title={filename}
          className="my-0 max-w-full rounded-sm border"
          style={{ maxHeight: '300px', width: 'auto', height: 'auto' }}
          width={width && Number(width) > 0 ? Number(width) : 500}
          height={height && Number(height) > 0 ? Number(height) : 300}
        />

        {selected && (
          <div className="absolute inset-0 flex items-center justify-center bg-blue-500 bg-opacity-10">
            <button
              type="button"
              className="absolute right-1 top-1 rounded-full border bg-white p-1 text-foreground shadow-md dark:bg-black"
              onClick={() => {
                editor.commands.deleteRange({
                  from: getPos(),
                  to: getPos() + node.nodeSize,
                });
              }}
              title="Delete attachment"
            >
              <Cross1Icon width={14} height={14} />
            </button>
          </div>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={`attachment-container my-2 inline-flex w-auto items-center gap-2 rounded-sm border px-2 py-1 ${selectedClass} ${selected ? 'bg-blue-50' : ''}`}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="flex-shrink-0 text-primary">
        <FileTextIcon width={14} height={14} />
      </div>
      <div className="flex-1">
        <a
          href={signedUrl || ''}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium line-clamp-1 text-sm text-primary no-underline hover:underline"
        >
          {filename}
        </a>
      </div>

      {/* Delete button - only visible when selected */}
      {selected && (
        <button
          type="button"
          className="p-1 text-foreground"
          onClick={() => {
            editor.commands.deleteRange({
              from: getPos(),
              to: getPos() + node.nodeSize,
            });
          }}
          title="Delete attachment"
        >
          <Cross1Icon width={14} height={14} />
        </button>
      )}
    </NodeViewWrapper>
  );
};
