import { Inter, Lusitana } from 'next/font/google';
import localFont from 'next/font/local';

export const inter = Inter({ subsets: ['latin'] });
export const lusitana = Lusitana({
  subsets: ['latin'],
  weight: ['400', '700'],
});

export const victorSerif = localFont({
  src: [
    {
      path: '../../public/fonts/VictorSerifTrial-40Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/VictorSerifTrial-45RegularItalic.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../../public/fonts/VictorSerifTrial-50Medium.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/VictorSerifTrial-55MediumItalic.otf',
      weight: '500',
      style: 'italic',
    },
  ],
});

export const monument = localFont({
  src: [
    {
      path: '../../public/fonts/ABCMonumentGrotesk-RegularItalic-Trial.otf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-Bold-Trial.otf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-BoldItalic-Trial.otf',
      weight: '700',
      style: 'italic',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-Light-Trial.otf',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-LightItalic-Trial.otf',
      weight: '300',
      style: 'italic',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-Medium-Trial.otf',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-MediumItalic-Trial.otf',
      weight: '500',
      style: 'italic',
    },
    {
      path: '../../public/fonts/ABCMonumentGrotesk-Regular-Trial.otf',
      weight: '400',
      style: 'normal',
    },
  ],
});
