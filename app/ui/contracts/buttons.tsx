import {
  PencilIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

export function UploadContract() {
  return (
    <Link
      href="/contracts/upload"
      className="text-md font-gtp font-medium flex h-12 items-center rounded-md bg-blue-600 px-4 text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="hidden md:block">Upload Documents</span>{' '}
    </Link>
  );
}

export function ViewContract({ id, path }: { id: number; path: string }) {
  return (
    <Link
      href={`${path}/${id}/`}
      className="rounded-sm border p-2 hover:bg-gray-100"
      target="_blank"
    >
      <EyeIcon className="w-5" />
    </Link>
  );
}

export function UpdateContract({ id, path }: { id: number; path: string }) {
  return (
    <Link
      href={`${path}/${id}`}
      className="rounded-sm border p-2 hover:bg-gray-100"
    >
      <PencilIcon className="w-5" />
    </Link>
  );
}

export function DeleteContract({ id }: { id: number }) {
  return (
    <>
      <button className="rounded-md border p-2 hover:bg-gray-100">
        <span className="sr-only">Delete</span>
        <TrashIcon className="w-5" />
      </button>
    </>
  );
}
