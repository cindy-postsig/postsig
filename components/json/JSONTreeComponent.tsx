'use client';

import { JSONTree } from 'react-json-tree';
import './styles.css';

const isEpochTimestamp = (value: string): boolean => {
  const cleanTimestamp = value.replace(/"/g, '');
  const numberTimestamp = parseInt(cleanTimestamp, 10);
  return numberTimestamp >= 0 && numberTimestamp <= 9999999999999;
};

const formatEpochTimestamp = (value: string): string => {
  const cleanTimestamp = value.replace(/"/g, '');
  const numberTimestamp = parseInt(cleanTimestamp, 10);
  const date = new Date(numberTimestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

export default function JSONTreeComponent({ data }: { data: any }) {
  const customTheme = {
    ul: {
      backgroundColor: '#f0f0f0', // Replace with your desired background color
    },
  };

  const customValueRenderer = (raw: any) => {
    if (isEpochTimestamp(raw)) {
      return (
        <p className="break-normal text-foreground">
          {formatEpochTimestamp(raw)}
        </p>
      );
    }
    return <p className="break-normal text-foreground">{raw}</p>;
  };

  return (
    <>
      <JSONTree
        data={data}
        hideRoot={true}
        theme={customTheme}
        labelRenderer={([key]) => (
          <strong className="text-xl capitalize text-foreground">{key}</strong>
        )}
        valueRenderer={customValueRenderer}
        shouldExpandNodeInitially={() => true}
      />
    </>
  );
}
