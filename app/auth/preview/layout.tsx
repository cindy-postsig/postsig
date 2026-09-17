import { notFound } from 'next/navigation';
import { PreviewSidebar } from './_sidebar';

export const dynamic = 'force-dynamic';

export default function AuthPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  // The parent /app/auth/layout.tsx uses `items-center` which would shrink
  // this flex row to content width. Force full width with self-stretch.
  return (
    <div className="flex min-h-screen w-full self-stretch">
      <PreviewSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
