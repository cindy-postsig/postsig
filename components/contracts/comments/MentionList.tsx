import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useRef,
} from 'react';
import { MentionListRef, MentionUser } from './suggestion';

interface MentionListProps {
  items: MentionUser[];
  command: (user: { id: string; label: string }) => void;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command({ id: item.id, label: item.name || item.email || '' });
      }
    };

    // Scroll selected item into view
    useEffect(() => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const selectedElement = container.children[
          selectedIndex
        ] as HTMLElement;

        if (selectedElement) {
          // Get container's scroll position and dimensions
          const containerTop = container.scrollTop;
          const containerBottom = containerTop + container.clientHeight;

          // Get selected element's position relative to the container
          const elementTop = selectedElement.offsetTop;
          const elementBottom = elementTop + selectedElement.offsetHeight;

          // Scroll if element is not fully visible
          if (elementTop < containerTop) {
            container.scrollTop = elementTop;
          } else if (elementBottom > containerBottom) {
            container.scrollTop = elementBottom - container.clientHeight;
          }
        }
      }
    }, [selectedIndex]);

    const upHandler = () => {
      setSelectedIndex(
        (selectedIndex + props.items.length - 1) % props.items.length,
      );
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }
        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }
        if (event.key === 'Enter') {
          enterHandler();
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="max-h-72 overflow-hidden">
        <div ref={scrollContainerRef} className="max-h-72 overflow-y-auto p-2">
          {props.items.length > 0 ? (
            props.items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => selectItem(index)}
                className={`font-medium flex w-full min-w-48 items-center gap-2 rounded-sm px-2 py-2 text-left font-sans text-sm text-neutral-900 hover:bg-gray-700/10
                ${index === selectedIndex ? 'bg-gray-700/10' : ''}`}
              >
                <span>{item.name || item.email}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-2 font-label text-sm text-gray-700/50">
              No users found
            </div>
          )}
        </div>
      </div>
    );
  },
);

MentionList.displayName = 'MentionList';
