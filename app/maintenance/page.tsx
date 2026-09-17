import PostSigIcon from '@/components/icons/postsig';

export default function Component() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-100 bg-gradient-to-b from-[#e3e3e4] dark:bg-gray-900">
      <div className="flex max-w-xl flex-col gap-4 space-y-4 px-4 text-center">
        <PostSigIcon className="mx-auto h-12 w-24 text-gray-500 dark:text-gray-500" />
        <h1 className="font-serif text-5xl tracking-tight text-gray-900 dark:text-gray-50">
          Back soon...
        </h1>
        <p className="lead font-serif text-2xl leading-relaxed text-gray-500 dark:text-gray-500">
          We&apos;re currently performing scheduled maintenance.
          <br />
          PostSig will be back online shortly.
        </p>
      </div>
    </div>
  );
}
