'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fetchVendorNews } from '@/app/lib/vendors/actions';
import Loading from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

type VendorNewsProps = {
  vendorName: string;
  variant?: 'feed' | 'grid';
};

export default function VendorNews({
  vendorName,
  variant = 'feed',
}: VendorNewsProps) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadNews() {
      setLoading(true);
      setError(null);

      try {
        // Fetch news data - all processing is now done server-side
        const newsItems = await fetchVendorNews(vendorName);
        setNews(newsItems || []);
      } catch (err) {
        console.error('Error loading news data:', err);
        setError('Error loading news');
      } finally {
        setLoading(false);
      }
    }

    if (vendorName) {
      loadNews();
    }
  }, [vendorName]);

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy');
    } catch (e) {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <h2 className="font-bold font-label text-xs uppercase tracking-wide">
          Latest News
        </h2>
        <div className="flex justify-center p-4">
          <Loading />
        </div>
      </div>
    );
  }

  if (error || news.length === 0) {
    return (
      <div className="flex w-full flex-col gap-4">
        <h2 className="font-bold font-label text-xs uppercase tracking-wide">
          Latest News
        </h2>
        <p className="font-label text-sm text-muted-foreground">
          {error || `No recent news found for ${vendorName}`}
        </p>
      </div>
    );
  }

  const renderFeedLayout = () => (
    <div className="space-y-4">
      {news.map((item, index) => (
        <div
          key={index}
          className="flex items-start gap-1 border-b border-gray-200 pb-4 last:border-0"
        >
          <div className="w-2/12 whitespace-nowrap pt-[3px] font-label text-xs text-muted-foreground">
            {formatDate(item.pubDate)}
          </div>
          <div className="flex-1">
            <Link
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-3 font-serif text-lg leading-tight text-foreground underline-offset-2 hover:underline"
            >
              {item.title}
            </Link>
            <div className="mt-2 font-label text-xs text-muted-foreground">
              {item?.source}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderGridLayout = () => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {news.map((item, index) => {
        // Extract domain from the link for displaying the source more clearly
        const url = new URL(item.link);
        const domain = url.hostname.replace('www.', '');

        return (
          <div
            key={index}
            className="flex h-full flex-col rounded-lg border p-4"
          >
            <Link
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-3 flex-grow font-serif text-lg leading-tight text-foreground underline-offset-2 hover:underline"
            >
              {item.title}
            </Link>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatDate(item.pubDate)}</span>
              <Badge variant="outline" className="text-xs">
                {item.source}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex w-full flex-col gap-12">
      <div className="flex items-center justify-between">
        <h2 className="font-bold font-label text-xs uppercase tracking-wide">
          Latest News
        </h2>
      </div>
      {variant === 'feed' ? renderFeedLayout() : renderGridLayout()}
    </div>
  );
}
