'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

// Array of available paintings with their details
const paintings = [
  // {
  //   src: '/monet.jpg',
  //   alt: 'Claude Monet - Water Lilies',
  //   title: 'Water Lilies',
  //   artist: 'Claude Monet',
  //   year: '1919',
  // },
  {
    src: '/wanderer.jpeg',
    alt: 'Caspar David Friedrich - Wanderer above the Sea of Fog',
    title: 'Wanderer above the Sea of Fog',
    artist: 'Caspar David Friedrich',
    year: '1818',
  },
];

export default function NotFound() {
  // Randomly select a painting when the component mounts
  const [painting, setPainting] = useState(paintings[0]);

  useEffect(() => {
    // Randomly select a painting
    const randomPainting =
      paintings[Math.floor(Math.random() * paintings.length)];
    setPainting(randomPainting);
  }, []);

  return (
    <main className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex w-full max-w-4xl flex-col gap-6 overflow-hidden md:flex-row md:gap-16">
        {/* Painting section (left) */}
        <div className="relative flex h-72 w-full flex-grow md:h-96 md:w-1/2 md:justify-end">
          <Image
            src={painting.src}
            alt={painting.alt}
            fill
            priority
            className="object-cover md:object-contain"
            style={{ objectPosition: 'center' }}
          />
        </div>

        {/* Message section (right) */}
        <div className="flex w-full max-w-xs flex-col items-start justify-center">
          <h2 className="mb-4 font-serif text-xl md:text-2xl">
            Contract Not Found
          </h2>
          <p className="mb-6 max-w-[200px] text-balance font-serif text-sm md:text-base">
            The contract you&apos;re looking for cannot be found.
          </p>
          <Button variant="outline" asChild>
            <Link href="/contracts">Return to Contracts</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
