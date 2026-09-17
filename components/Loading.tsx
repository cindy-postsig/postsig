import { Spinner } from '@/components/ui/spinner';

function Loading() {
  return (
    <div className="flex h-5 w-5">
      <Spinner className="h-5 w-5" />
    </div>
  );
}

export default Loading;
