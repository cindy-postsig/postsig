import '@/app/globals.css';
import './styles.css';

const defaultUrl = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: 'Join PostSig',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main id="signup" className="flex h-full flex-col items-center">
        {/* <div className="flex w-full py-1"></div> */}
        {children}
      </main>
    </>
  );
}
