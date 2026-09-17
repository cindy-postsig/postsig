'use client';

import { usePathname } from 'next/navigation';
import { useChatStore } from '@/stores/chatStore';
import { AssistantIcon } from '@/components/chatbot/AssistantIcon';

interface SigpilotButtonProps {
  size?: 'sm' | 'default';
}

const SigpilotButton = ({ size = 'default' }: SigpilotButtonProps) => {
  const pathname = usePathname();
  const { setIsOpen, setIsFullscreen } = useChatStore();

  if (pathname.startsWith('/investor')) return null;

  const handleClick = () => {
    setIsOpen(true);
    setIsFullscreen(true);
  };

  const imageSize = size === 'sm' ? 32 : 40;

  return (
    <button
      onClick={handleClick}
      className="overflow-hidden rounded-sm transition-opacity hover:opacity-80"
    >
      <span className="block" style={{ width: imageSize, height: imageSize }}>
        <AssistantIcon alt="Lineage AI Assistant" />
      </span>
    </button>
  );
};

export default SigpilotButton;
